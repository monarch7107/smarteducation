import { and, desc, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, badges, careerRoadmaps, courses, enrollments, learningMaterials, notifications, quizAttempts, quizzes, userBadges, users } from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try { _db = drizzle(process.env.DATABASE_URL); } catch (error) { console.warn("[Database] Failed to connect:", error); _db = null; }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;
  const values: InsertUser = { openId: user.openId, name: user.name, email: user.email, loginMethod: user.loginMethod, lastSignedIn: user.lastSignedIn ?? new Date() };
  const updateSet: Record<string, unknown> = { lastSignedIn: values.lastSignedIn };
  if (user.name !== undefined) updateSet.name = user.name;
  if (user.email !== undefined) updateSet.email = user.email;
  if (user.loginMethod !== undefined) updateSet.loginMethod = user.loginMethod;
  if (user.role !== undefined) { values.role = user.role; updateSet.role = user.role; }
  else if (user.openId === ENV.ownerOpenId) { values.role = "admin"; updateSet.role = "admin"; }
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb(); if (!db) return undefined;
  const rows = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return rows[0];
}

export async function listPublishedCourses() {
  const db = await getDb(); if (!db) return [];
  return db.select().from(courses).where(eq(courses.isPublished, true)).orderBy(desc(courses.createdAt));
}

export async function listUserEnrollments(userId: number) {
  const db = await getDb(); if (!db) return [];
  return db.select({ enrollment: enrollments, course: courses })
    .from(enrollments).innerJoin(courses, eq(enrollments.courseId, courses.id))
    .where(eq(enrollments.userId, userId)).orderBy(desc(enrollments.updatedAt));
}

export async function enrollUser(userId: number, courseId: number) {
  const db = await getDb(); if (!db) return null;
  await db.insert(enrollments).values({ userId, courseId }).onDuplicateKeyUpdate({ set: { updatedAt: new Date() } });
  const rows = await db.select().from(enrollments).where(and(eq(enrollments.userId, userId), eq(enrollments.courseId, courseId))).limit(1);
  return rows[0] ?? null;
}

export async function listRecentAttempts(userId: number) {
  const db = await getDb(); if (!db) return [];
  return db.select({ attempt: quizAttempts, quiz: quizzes }).from(quizAttempts).innerJoin(quizzes, eq(quizAttempts.quizId, quizzes.id)).where(eq(quizAttempts.userId, userId)).orderBy(desc(quizAttempts.completedAt)).limit(8);
}

export async function createAttempt(data: typeof quizAttempts.$inferInsert) {
  const db = await getDb(); if (!db) return null;
  const result = await db.insert(quizAttempts).values(data);
  return result[0]?.insertId ?? null;
}

export async function listMaterials(courseId: number) {
  const db = await getDb(); if (!db) return [];
  return db.select().from(learningMaterials).where(eq(learningMaterials.courseId, courseId)).orderBy(desc(learningMaterials.createdAt));
}

export async function addMaterial(data: typeof learningMaterials.$inferInsert) {
  const db = await getDb(); if (!db) return null;
  const result = await db.insert(learningMaterials).values(data);
  return result[0]?.insertId ?? null;
}

export async function listNotifications(userId: number) {
  const db = await getDb(); if (!db) return [];
  return db.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(desc(notifications.createdAt)).limit(20);
}

export async function addNotification(data: typeof notifications.$inferInsert) {
  const db = await getDb(); if (!db) return null;
  const result = await db.insert(notifications).values(data);
  return result[0]?.insertId ?? null;
}

export async function listRoadmaps() {
  const db = await getDb(); if (!db) return [];
  return db.select().from(careerRoadmaps).orderBy(desc(careerRoadmaps.createdAt));
}

export async function listBadgesForUser(userId: number) {
  const db = await getDb(); if (!db) return [];
  return db.select({ badge: badges, earnedAt: userBadges.earnedAt }).from(userBadges).innerJoin(badges, eq(userBadges.badgeId, badges.id)).where(eq(userBadges.userId, userId)).orderBy(desc(userBadges.earnedAt));
}

export async function updateUserGamification(userId: number, xp: number, streak: number) {
  const db = await getDb(); if (!db) return;
  await db.update(users).set({ xp: sql`${users.xp} + ${xp}`, streak, lastActiveAt: new Date() }).where(eq(users.id, userId));
}
