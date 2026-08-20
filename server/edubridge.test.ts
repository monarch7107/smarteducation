import { describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";

vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn(async () => ({ choices: [{ message: { content: "Mocked EduBridge response" } }] })),
}));

import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createContext(role: AuthenticatedUser["role"] = "student"): TrpcContext {
  const now = new Date();
  const user: AuthenticatedUser = { id: 7, openId: "edubridge-test-user", email: "student@example.com", name: "EduBridge Test User", loginMethod: "manus", role, preferredLanguage: "en", xp: 120, streak: 3, lastActiveAt: now, createdAt: now, updatedAt: now, lastSignedIn: now };
  return { user, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: { clearCookie: () => undefined } as TrpcContext["res"] };
}

describe("EduBridge AI role access", () => {
  it("rejects teacher dashboard access for a student", async () => {
    const caller = appRouter.createCaller(createContext("student"));
    await expect(caller.dashboard.teacher()).rejects.toMatchObject<Partial<TRPCError>>({ code: "FORBIDDEN" });
  });
  it("allows admin access to the admin dashboard procedure", async () => {
    const result = await appRouter.createCaller(createContext("admin")).dashboard.admin();
    expect(result.user.role).toBe("admin");
  });
});

describe("EduBridge AI learning procedures", () => {
  it("returns a tutor explanation", async () => {
    const result = await appRouter.createCaller(createContext()).ai.tutor({ question: "What is a fraction?", subject: "maths", language: "en" });
    expect(result.answer).toContain("Mocked EduBridge response");
  });
  it("supports all three learning tools", async () => {
    const caller = appRouter.createCaller(createContext());
    const practice = await caller.ai.practice({ topic: "fractions", difficulty: "easy", count: 3, language: "en" });
    const summary = await caller.ai.summarize({ lesson: "Fractions describe parts of a whole in mathematics.", language: "en" });
    const tips = await caller.ai.studyTips({ performance: "72% in algebra", goal: "improve" });
    expect(practice.content).toContain("Mocked");
    expect(summary.content).toContain("Mocked");
    expect(tips.content).toContain("Mocked");
  });
  it("calculates assessment percentage and feedback", async () => {
    const result = await appRouter.createCaller(createContext()).assessments.submit({ quizId: 1, score: 4, total: 5, timeTakenSeconds: 90 });
    expect(result.percentage).toBe(80);
    expect(result.feedback).toContain("Strong progress");
  });
  it("loads career roadmaps safely when the database is unavailable", async () => {
    const result = await appRouter.createCaller({ ...createContext(), user: null }).careers.list();
    expect(result).toEqual([]);
  });
  it("exposes the fixed student notification triggers", async () => {
    const caller = appRouter.createCaller(createContext("student"));
    await expect(caller.notifications.streakReminder({})).resolves.toBeTypeOf("number");
    await expect(caller.notifications.newAssignment({ title: "Practice", message: "A new practice set is ready." })).resolves.toBeTypeOf("number");
    await expect(caller.notifications.badgeAchievement({ title: "Badge earned", message: "You earned a new badge." })).resolves.toBeTypeOf("number");
  });
  it("restricts assessment completion alerts to teachers", async () => {
    const caller = appRouter.createCaller(createContext("student"));
    await expect(caller.notifications.assessmentCompletion({ studentId: 9, title: "Assessment complete", message: "A student finished an assessment." })).rejects.toMatchObject<Partial<TRPCError>>({ code: "FORBIDDEN" });
  });
});
