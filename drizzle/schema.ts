import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, boolean, json, index } from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["student", "teacher", "admin"]).default("student").notNull(),
  preferredLanguage: varchar("preferredLanguage", { length: 8 }).default("en").notNull(),
  xp: int("xp").default(0).notNull(),
  streak: int("streak").default(0).notNull(),
  lastActiveAt: timestamp("lastActiveAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const courses = mysqlTable("courses", {
  id: int("id").autoincrement().primaryKey(),
  title: varchar("title", { length: 180 }).notNull(),
  description: text("description").notNull(),
  subject: varchar("subject", { length: 80 }).notNull(),
  level: mysqlEnum("level", ["beginner", "intermediate", "advanced"]).default("beginner").notNull(),
  language: varchar("language", { length: 8 }).default("en").notNull(),
  durationMinutes: int("durationMinutes").default(30).notNull(),
  isPublished: boolean("isPublished").default(false).notNull(),
  createdBy: int("createdBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const enrollments = mysqlTable("enrollments", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  courseId: int("courseId").notNull(),
  progressPercent: int("progressPercent").default(0).notNull(),
  status: mysqlEnum("status", ["active", "completed"]).default("active").notNull(),
  enrolledAt: timestamp("enrolledAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({ userCourseIdx: index("enrollments_user_course_idx").on(table.userId, table.courseId) }));

export const learningMaterials = mysqlTable("learning_materials", {
  id: int("id").autoincrement().primaryKey(),
  courseId: int("courseId").notNull(),
  uploadedBy: int("uploadedBy").notNull(),
  title: varchar("title", { length: 180 }).notNull(),
  kind: mysqlEnum("kind", ["pdf", "video", "worksheet"]).notNull(),
  fileKey: varchar("fileKey", { length: 512 }).notNull(),
  fileUrl: varchar("fileUrl", { length: 1024 }).notNull(),
  mimeType: varchar("mimeType", { length: 128 }).notNull(),
  sizeBytes: int("sizeBytes").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const quizzes = mysqlTable("quizzes", {
  id: int("id").autoincrement().primaryKey(),
  courseId: int("courseId").notNull(),
  title: varchar("title", { length: 180 }).notNull(),
  topic: varchar("topic", { length: 120 }).notNull(),
  difficulty: mysqlEnum("difficulty", ["very_easy", "easy", "medium", "hard", "very_hard"]).default("medium").notNull(),
  questionCount: int("questionCount").default(5).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const quizAttempts = mysqlTable("quiz_attempts", {
  id: int("id").autoincrement().primaryKey(),
  quizId: int("quizId").notNull(),
  userId: int("userId").notNull(),
  score: int("score").default(0).notNull(),
  total: int("total").default(0).notNull(),
  timeTakenSeconds: int("timeTakenSeconds").default(0).notNull(),
  answers: json("answers"),
  completedAt: timestamp("completedAt").defaultNow().notNull(),
}, (table) => ({ userCompletedIdx: index("quiz_attempts_user_completed_idx").on(table.userId, table.completedAt) }));

export const badges = mysqlTable("badges", {
  id: int("id").autoincrement().primaryKey(),
  code: varchar("code", { length: 64 }).notNull().unique(),
  name: varchar("name", { length: 120 }).notNull(),
  description: text("description").notNull(),
  icon: varchar("icon", { length: 40 }).notNull(),
});

export const userBadges = mysqlTable("user_badges", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  badgeId: int("badgeId").notNull(),
  earnedAt: timestamp("earnedAt").defaultNow().notNull(),
});

export const careerRoadmaps = mysqlTable("career_roadmaps", {
  id: int("id").autoincrement().primaryKey(),
  title: varchar("title", { length: 160 }).notNull(),
  summary: text("summary").notNull(),
  skills: json("skills").notNull(),
  steps: json("steps").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const notifications = mysqlTable("notifications", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  type: mysqlEnum("type", ["streak_reminder", "new_assignment", "badge_achievement", "assessment_completion"]).notNull(),
  title: varchar("title", { length: 180 }).notNull(),
  message: text("message").notNull(),
  readAt: timestamp("readAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Course = typeof courses.$inferSelect;
export type Enrollment = typeof enrollments.$inferSelect;
export type LearningMaterial = typeof learningMaterials.$inferSelect;
