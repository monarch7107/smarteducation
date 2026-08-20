import { describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createContext(role: AuthenticatedUser["role"]): TrpcContext {
  const now = new Date();
  const user: AuthenticatedUser = {
    id: 7,
    openId: "edubridge-test-user",
    email: "student@example.com",
    name: "EduBridge Test User",
    loginMethod: "manus",
    role,
    preferredLanguage: "en",
    xp: 120,
    streak: 3,
    lastActiveAt: now,
    createdAt: now,
    updatedAt: now,
    lastSignedIn: now,
  };
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => undefined } as TrpcContext["res"],
  };
}

describe("EduBridge AI role access", () => {
  it("rejects teacher dashboard access for a student", async () => {
    const caller = appRouter.createCaller(createContext("student"));
    await expect(caller.dashboard.teacher()).rejects.toMatchObject<Partial<TRPCError>>({ code: "FORBIDDEN" });
  });

  it("allows admin access to the admin dashboard procedure", async () => {
    const caller = appRouter.createCaller(createContext("admin"));
    const result = await caller.dashboard.admin();
    expect(result.user.role).toBe("admin");
  });
});
