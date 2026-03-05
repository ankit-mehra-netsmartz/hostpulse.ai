import { users, type User, type UpsertUser, ACCOUNT_TYPES, type AccountType } from "@shared/models/auth";
import { db } from "../../db";
import { eq } from "drizzle-orm";

// Interface for auth storage operations
// (IMPORTANT) These user operations are mandatory for Replit Auth.
export interface IAuthStorage {
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser, accountType?: AccountType): Promise<User>;
}

// Helper to detect account type from claims or email
function detectAccountType(claims: any): AccountType {
  // Check if there's an issuer hint
  const iss = claims?.iss || "";
  const email = claims?.email || "";
  
  // Replit Auth uses Google/GitHub for social login, detect from email domain or claims
  if (email.endsWith("@gmail.com") || iss.includes("google")) {
    return ACCOUNT_TYPES.GOOGLE;
  }
  if (iss.includes("github") || claims?.login) {
    return ACCOUNT_TYPES.GITHUB;
  }
  if (iss.includes("replit")) {
    return ACCOUNT_TYPES.REPLIT;
  }
  if (email) {
    return ACCOUNT_TYPES.EMAIL;
  }
  return ACCOUNT_TYPES.UNKNOWN;
}

class AuthStorage implements IAuthStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async upsertUser(userData: UpsertUser, accountType?: AccountType): Promise<User> {
    console.log(`[Auth] Upserting user: ${userData.id} (${userData.email})`);
    try {
      const now = new Date();

      // Check if a user with this email already exists under a different ID
      if (userData.email) {
        const [existingByEmail] = await db.select().from(users).where(eq(users.email, userData.email));
        if (existingByEmail && existingByEmail.id !== userData.id) {
          // Update the existing user record instead of creating a duplicate
          const [user] = await db
            .update(users)
            .set({
              firstName: userData.firstName ?? existingByEmail.firstName,
              lastName: userData.lastName ?? existingByEmail.lastName,
              profileImageUrl: userData.profileImageUrl ?? existingByEmail.profileImageUrl,
              lastLoginAt: now,
              updatedAt: now,
            })
            .where(eq(users.id, existingByEmail.id))
            .returning();
          console.log(`[Auth] Updated existing user by email match: ${user.id}`);
          return user;
        }
      }
      
      const [user] = await db
        .insert(users)
        .values({
          ...userData,
          accountType: accountType || ACCOUNT_TYPES.UNKNOWN,
          lastLoginAt: now,
        })
        .onConflictDoUpdate({
          target: users.id,
          set: {
            ...userData,
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
}

export const authStorage = new AuthStorage();

// Export the detectAccountType helper for use in auth flow
export { detectAccountType };
