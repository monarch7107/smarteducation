import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { invokeLLM } from "./_core/llm";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { addMaterial, addNotification, createAttempt, enrollUser, getUserByOpenId, listBadgesForUser, listMaterials, listNotifications, listPublishedCourses, listRecentAttempts, listRoadmaps, listUserEnrollments, updateUserGamification } from "./db";
import { storagePut } from "./storage";
import { systemRouter } from "./_core/systemRouter";

const roleProcedure = (role: "student" | "teacher" | "admin") => protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== role && ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: `Requires ${role} role` });
  return next();
});

const textFromLLM = (response: Awaited<ReturnType<typeof invokeLLM>>) => {
  const content = response.choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((item) => "text" in item ? item.text : "").join("\n");
  return "I’m ready to help you learn. Try asking your question again.";
};

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  courses: router({
    list: publicProcedure.query(() => listPublishedCourses()),
    mine: protectedProcedure.query(({ ctx }) => listUserEnrollments(ctx.user.id)),
    enroll: protectedProcedure.input(z.object({ courseId: z.number().int().positive() })).mutation(({ ctx, input }) => enrollUser(ctx.user.id, input.courseId)),
    materials: protectedProcedure.input(z.object({ courseId: z.number().int().positive() })).query(({ input }) => listMaterials(input.courseId)),
  }),
  dashboard: router({
    student: roleProcedure("student").query(async ({ ctx }) => ({ user: ctx.user, enrollments: await listUserEnrollments(ctx.user.id), attempts: await listRecentAttempts(ctx.user.id), badges: await listBadgesForUser(ctx.user.id), notifications: await listNotifications(ctx.user.id) })),
    teacher: roleProcedure("teacher").query(async ({ ctx }) => ({ user: ctx.user, courses: await listPublishedCourses(), notifications: await listNotifications(ctx.user.id) })),
    admin: roleProcedure("admin").query(async ({ ctx }) => ({ user: ctx.user, courses: await listPublishedCourses() })),
  }),
  ai: router({
    tutor: protectedProcedure.input(z.object({ question: z.string().min(2), subject: z.string().default("general"), language: z.string().default("en"), performanceContext: z.string().optional() })).mutation(async ({ input }) => {
      const response = await invokeLLM({ messages: [
        { role: "system", content: `You are EduBridge AI, a patient tutor for Indian learners. Explain ${input.subject} in simple ${input.language} language. For maths, use Problem, Known information, Formula, Calculation, Answer, Concept explanation. Never provide only a final answer.` },
        { role: "user", content: `${input.question}${input.performanceContext ? `\nLearner context: ${input.performanceContext}` : ""}` },
      ] });
      return { answer: textFromLLM(response) };
    }),
    practice: protectedProcedure.input(z.object({ topic: z.string(), difficulty: z.string(), count: z.number().int().min(1).max(10).default(5), language: z.string().default("en") })).mutation(async ({ input }) => {
      const response = await invokeLLM({ messages: [{ role: "system", content: `Create ${input.count} practice questions about ${input.topic} at ${input.difficulty} difficulty in ${input.language}. Include answers and short explanations.` }, { role: "user", content: "Return a clear numbered practice set." }] });
      return { content: textFromLLM(response) };
    }),
    summarize: protectedProcedure.input(z.object({ lesson: z.string().min(10), language: z.string().default("en") })).mutation(async ({ input }) => {
      const response = await invokeLLM({ messages: [{ role: "system", content: `Summarize the lesson for an Indian student in simple ${input.language} language. Include key ideas, one analogy, and three recall questions.` }, { role: "user", content: input.lesson }] });
      return { content: textFromLLM(response) };
    }),
    studyTips: protectedProcedure.input(z.object({ performance: z.string().min(2), goal: z.string().default("improve steadily") })).mutation(async ({ input }) => {
      const response = await invokeLLM({ messages: [{ role: "system", content: "Give practical, encouraging study tips tied directly to the learner performance data. Do not make medical or deterministic future predictions." }, { role: "user", content: `Performance: ${input.performance}\nGoal: ${input.goal}` }] });
      return { content: textFromLLM(response) };
    }),
  }),
  assessments: router({
    question: protectedProcedure.input(z.object({ quizId: z.number().int().positive() })).query(() => ({ prompt: "If 2x + 4 = 12, what is x?", options: ["2", "4", "6", "8"] })),
    submit: protectedProcedure.input(z.object({ quizId: z.number().int().positive(), score: z.number().int().min(0), total: z.number().int().positive(), timeTakenSeconds: z.number().int().min(0), answers: z.record(z.string(), z.string()).optional() })).mutation(async ({ ctx, input }) => {
      const id = await createAttempt({ ...input, userId: ctx.user.id, answers: input.answers });
      await updateUserGamification(ctx.user.id, input.score * 10, Math.max(ctx.user.streak, 1));
      return { id, percentage: Math.round((input.score / input.total) * 100), feedback: input.score / input.total >= 0.7 ? "Strong progress — keep building on it." : "You have a clear next step. Review the weak topics and try again." };
    }),
  }),
  teacher: router({
    uploadMaterial: roleProcedure("teacher").input(z.object({ courseId: z.number().int().positive(), title: z.string().min(2), kind: z.enum(["pdf", "video", "worksheet"]), filename: z.string().min(1), mimeType: z.string().min(1), base64: z.string().min(10), sizeBytes: z.number().int().nonnegative() })).mutation(async ({ ctx, input }) => {
      const buffer = Buffer.from(input.base64, "base64");
      const uploaded = await storagePut(`materials/${ctx.user.id}/${input.filename}`, buffer, input.mimeType);
      const id = await addMaterial({ courseId: input.courseId, uploadedBy: ctx.user.id, title: input.title, kind: input.kind, fileKey: uploaded.key, fileUrl: uploaded.url, mimeType: input.mimeType, sizeBytes: input.sizeBytes });
      return { id, url: uploaded.url };
    }),
    notifyAssessment: roleProcedure("teacher").input(z.object({ studentId: z.number().int().positive(), title: z.string(), message: z.string() })).mutation(({ input }) => addNotification({ userId: input.studentId, type: "assessment_completion", title: input.title, message: input.message })),
  }),
  notifications: router({
    streakReminder: roleProcedure("student").input(z.object({ title: z.string().default("Keep your streak alive"), message: z.string().default("A focused session today keeps your learning momentum going.") })).mutation(({ ctx, input }) => addNotification({ userId: ctx.user.id, type: "streak_reminder", title: input.title, message: input.message })),
    newAssignment: roleProcedure("student").input(z.object({ title: z.string().min(2), message: z.string().min(2) })).mutation(({ ctx, input }) => addNotification({ userId: ctx.user.id, type: "new_assignment", title: input.title, message: input.message })),
    badgeAchievement: roleProcedure("student").input(z.object({ title: z.string().min(2), message: z.string().min(2) })).mutation(({ ctx, input }) => addNotification({ userId: ctx.user.id, type: "badge_achievement", title: input.title, message: input.message })),
    assessmentCompletion: roleProcedure("teacher").input(z.object({ studentId: z.number().int().positive(), title: z.string(), message: z.string() })).mutation(({ input }) => addNotification({ userId: input.studentId, type: "assessment_completion", title: input.title, message: input.message })),
  }),
  careers: router({ list: publicProcedure.query(() => listRoadmaps()) }),
  admin: router({
    setRole: roleProcedure("admin").input(z.object({ userId: z.number().int().positive(), role: z.enum(["student", "teacher", "admin"]) })).mutation(async ({ input }) => {
      const { getDb } = await import("./db");
      const { users } = await import("../drizzle/schema");
      const db = await getDb();
      if (!db) return { success: false };
      await db.update(users).set({ role: input.role }).where(eq(users.id, input.userId));
      return { success: true };
    }),
  }),
});

export type AppRouter = typeof appRouter;
