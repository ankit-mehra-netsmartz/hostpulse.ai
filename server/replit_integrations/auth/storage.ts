import {
  users,
  emailVerificationTokens,
  type User,
  type UpsertUser,
  ACCOUNT_TYPES,
  type AccountType,
} from "@shared/models/auth";
import { db } from "../../db";
import { and, desc, eq } from "drizzle-orm";
import crypto from "crypto";

// Interface for auth storage operations
// (IMPORTANT) These user operations are mandatory for Replit Auth.
export interface IAuthStorage {
  getUser(id: string): Promise<User | undefined>;
  findUserById(userId: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser, accountType?: AccountType): Promise<User>;
  findUserByEmail(email: string): Promise<User | undefined>;
  upsertMagicUser(
    email: string,
    firstName?: string,
    lastName?: string,
  ): Promise<{
    user: User;
    isNewUser?: boolean;
    isGoogleAccount: boolean;
  }>;
  createMagicLinkToken(userId: string): Promise<string>;
  verifyMagicLinkToken(
    token: string,
  ): Promise<
    | { success: true; userId: string }
    | { success: false; reason: "invalid" | "expired" }
  >;
  getMagicLinkTokenCreatedAt(userId: string): Promise<Date | null>;
}

class AuthStorage implements IAuthStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async findUserById(userId: string): Promise<User | undefined> {
    return this.getUser(userId);
  }

  async upsertUser(
    userData: UpsertUser,
    accountType?: AccountType,
  ): Promise<User> {
    console.log(`[Auth] Upserting user: ${userData.id} (${userData.email})`);
    try {
      const now = new Date();

      // Check if a user with this email already exists under a different ID
      if (userData.email) {
        const [existingByEmail] = await db
          .select()
          .from(users)
          .where(eq(users.email, userData.email));
        if (existingByEmail && existingByEmail.id !== userData.id) {
          // Update the existing user record instead of creating a duplicate
          const [user] = await db
            .update(users)
            .set({
              firstName: userData.firstName ?? existingByEmail.firstName,
              lastName: userData.lastName ?? existingByEmail.lastName,
              profileImageUrl:
                userData.profileImageUrl ?? existingByEmail.profileImageUrl,
              accountType: accountType ?? existingByEmail.accountType,
              lastLoginAt: now,
              updatedAt: now,
            })
            .where(eq(users.id, existingByEmail.id))
            .returning();
          console.log(
            `[Auth] Updated existing user by email match: ${user.id}`,
          );
          return user;
        }
      }

      const [user] = await db
        .insert(users)
        .values({
          ...userData,
          accountType: accountType || ACCOUNT_TYPES.EMAIL,
          lastLoginAt: now,
        })
        .onConflictDoUpdate({
          target: users.id,
          set: {
            ...userData,
            ...(accountType ? { accountType } : {}),
            lastLoginAt: now,
            updatedAt: now,
          },
        })
        .returning();
      console.log(`[Auth] Successfully upserted user: ${user.id}`);
      return user;
    } catch (error) {
      console.error(`[Auth] Failed to upsert user ${userData.id}:`, error);
      throw error;
    }
  }

  async findUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async upsertMagicUser(
    email: string,
    firstName?: string,
    lastName?: string,
  ): Promise<{
    user: User;
    isNewUser?: boolean;
    isGoogleAccount: boolean;
  }> {
    const existing = await this.findUserByEmail(email);

    if (existing) {
      if (existing.accountType === ACCOUNT_TYPES.GOOGLE) {
        return { user: existing, isGoogleAccount: true };
      }

      if (existing.accountType !== ACCOUNT_TYPES.EMAIL) {
        const [updated] = await db
          .update(users)
          .set({ accountType: ACCOUNT_TYPES.EMAIL, updatedAt: new Date() })
          .where(eq(users.id, existing.id))
          .returning();
        return { user: updated, isNewUser: false, isGoogleAccount: false };
      }

      return { user: existing, isNewUser: false, isGoogleAccount: false };
    }

    const [newUser] = await db
      .insert(users)
      .values({
        email,
        firstName: firstName ?? null,
        lastName: lastName ?? null,
        accountType: ACCOUNT_TYPES.EMAIL,
        emailVerified: false,
        lastLoginAt: new Date(),
      })
      .returning();

    return { user: newUser, isNewUser: true, isGoogleAccount: false };
  }

  async createMagicLinkToken(userId: string): Promise<string> {
    await db
      .delete(emailVerificationTokens)
      .where(
        and(
          eq(emailVerificationTokens.userId, userId),
          eq(emailVerificationTokens.type, "magic_link"),
        ),
      );

    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    await db.insert(emailVerificationTokens).values({
      userId,
      token,
      type: "magic_link",
      expiresAt,
    });
    return token;
  }

  async verifyMagicLinkToken(
    token: string,
  ): Promise<
    | { success: true; userId: string }
    | { success: false; reason: "invalid" | "expired" }
  > {
    const [row] = await db
      .select()
      .from(emailVerificationTokens)
      .where(
        and(
          eq(emailVerificationTokens.token, token),
          eq(emailVerificationTokens.type, "magic_link"),
        ),
      );

    if (!row) {
      return { success: false, reason: "invalid" as const };
    }
    if (row.expiresAt < new Date()) {
      await db
        .delete(emailVerificationTokens)
        .where(eq(emailVerificationTokens.id, row.id));
      return { success: false, reason: "expired" as const };
    }

    // Mark email as verified
    await db
      .update(users)
      .set({ emailVerified: true, updatedAt: new Date() })
      .where(eq(users.id, row.userId));

    // Consume token (one-time use)
    await db
      .delete(emailVerificationTokens)
      .where(eq(emailVerificationTokens.id, row.id));

    return { success: true, userId: row.userId };
  }

  async getMagicLinkTokenCreatedAt(userId: string): Promise<Date | null> {
    const [row] = await db
      .select({ createdAt: emailVerificationTokens.createdAt })
      .from(emailVerificationTokens)
      .where(
        and(
          eq(emailVerificationTokens.userId, userId),
          eq(emailVerificationTokens.type, "magic_link"),
        ),
      )
      .orderBy(desc(emailVerificationTokens.createdAt));
    return row?.createdAt ?? null;
  }
}

export const authStorage = new AuthStorage();
