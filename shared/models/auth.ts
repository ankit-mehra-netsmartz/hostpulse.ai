import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  jsonb,
  pgTable,
  serial,
  timestamp,
  varchar,
  text,
} from "drizzle-orm/pg-core";

// User roles
export const USER_ROLES = {
  APP_ADMIN: "app_admin",
  ADMIN_USER: "admin_user",
  USER_MANAGER: "user_manager",
  USER_STAFF: "user_staff",
} as const;

export type UserRole = (typeof USER_ROLES)[keyof typeof USER_ROLES];

// Session storage table.
// (IMPORTANT) This table is mandatory for Replit Auth, don't drop it.
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// Account type for tracking how user signed up
export const ACCOUNT_TYPES = {
  GOOGLE: "google",
  EMAIL: "email",
} as const;

export type AccountType = (typeof ACCOUNT_TYPES)[keyof typeof ACCOUNT_TYPES];

// User storage table.
// (IMPORTANT) This table is mandatory for Replit Auth, don't drop it.
export const users = pgTable("users", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  originalSelfieUrl: text("original_selfie_url"),
  headshotLockedAt: timestamp("headshot_locked_at"),
  bio: text("bio"),
  role: varchar("role").notNull().default("user_staff"),
  accountType: varchar("account_type").notNull().default("unknown"),
  passwordHash: varchar("password_hash"),
  emailVerified: boolean("email_verified").notNull().default(false),
  defaultWorkspaceId: varchar("default_workspace_id"),
  timezone: varchar("timezone").default("America/New_York"),
  lastLoginAt: timestamp("last_login_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Song status enum
export const SONG_STATUS = {
  PENDING: "pending",
  GENERATING: "generating",
  READY: "ready",
  FAILED: "failed",
} as const;

export type SongStatus = (typeof SONG_STATUS)[keyof typeof SONG_STATUS];

// Song type enum
export const SONG_TYPE = {
  STR_JOURNEY: "str_journey",
  WORST_GUEST: "worst_guest",
} as const;

export type SongType = (typeof SONG_TYPE)[keyof typeof SONG_TYPE];

// User songs table for Easter Egg feature
export const userSongs = pgTable("user_songs", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  workspaceId: varchar("workspace_id"),
  songType: varchar("song_type").notNull(),
  status: varchar("status").notNull().default("pending"),
  title: varchar("title"),
  lyrics: text("lyrics"),
  audioUrl: text("audio_url"),
  prompt: text("prompt"),
  musicStyle: varchar("music_style"),
  voiceStyle: varchar("voice_style"),
  reservationId: varchar("reservation_id"),
  sharedOnSocial: varchar("shared_on_social").default("false"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type UserSong = typeof userSongs.$inferSelect;
export type InsertUserSong = typeof userSongs.$inferInsert;

// AI Prompts table for storing editable prompts
export const aiPrompts = pgTable("ai_prompts", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  name: varchar("name").notNull().unique(),
  description: text("description"),
  promptTemplate: text("prompt_template").notNull(),
  modelId: varchar("model_id"),
  isActive: varchar("is_active").notNull().default("true"),
  createdBy: varchar("created_by").notNull(),
  updatedBy: varchar("updated_by"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;
export type AiPrompt = typeof aiPrompts.$inferSelect;
export type InsertAiPrompt = typeof aiPrompts.$inferInsert;

// Email verification tokens — email/password users only, never Google OAuth
export const emailVerificationTokens = pgTable(
  "email_verification_tokens",
  {
    id: serial("id").primaryKey(),
    userId: varchar("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    type: varchar("type", { length: 50 }).notNull().default("magic_link"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_evt_token").on(table.token),
    index("idx_evt_user_id").on(table.userId),
  ],
);

export type EmailVerificationToken =
  typeof emailVerificationTokens.$inferSelect;

// Property Management Software options
export const PROPERTY_MANAGEMENT_SOFTWARE = {
  HOSPITABLE: "hospitable",
  GUESTY: "guesty",
  HOSTAWAY: "hostaway",
  OWNERREZ: "ownerrez",
  LODGIFY: "lodgify",
  NONE: "none",
  OTHER: "other",
} as const;

export type PropertyManagementSoftware =
  (typeof PROPERTY_MANAGEMENT_SOFTWARE)[keyof typeof PROPERTY_MANAGEMENT_SOFTWARE];

// Workspace roles
export const WORKSPACE_ROLES = {
  OWNER: "owner",
  ADMIN: "admin",
  MEMBER: "member",
} as const;

export type WorkspaceRole =
  (typeof WORKSPACE_ROLES)[keyof typeof WORKSPACE_ROLES];

// Workspace member status
export const WORKSPACE_MEMBER_STATUS = {
  ACTIVE: "active",
  INVITED: "invited",
} as const;

export type WorkspaceMemberStatus =
  (typeof WORKSPACE_MEMBER_STATUS)[keyof typeof WORKSPACE_MEMBER_STATUS];

// Workspaces table
export const workspaces = pgTable("workspaces", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  name: varchar("name").notNull(),
  propertyManagementSoftware: varchar("property_management_software").notNull(),
  customSoftwareName: varchar("custom_software_name"),
  listingCount: varchar("listing_count"),
  createdBy: varchar("created_by").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Workspace members table
export const workspaceMembers = pgTable("workspace_members", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  userId: varchar("user_id"),
  role: varchar("role").notNull().default("member"),
  status: varchar("status").notNull().default("active"),
  invitedEmail: varchar("invited_email"),
  invitedBy: varchar("invited_by"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type Workspace = typeof workspaces.$inferSelect;
export type InsertWorkspace = typeof workspaces.$inferInsert;
export type WorkspaceMember = typeof workspaceMembers.$inferSelect;
export type InsertWorkspaceMember = typeof workspaceMembers.$inferInsert;

// Role permissions table for controlling navigation access by role
// Only user_manager and user_staff roles are controlled; app_admin and admin_user have full access
export const rolePermissions = pgTable("role_permissions", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  role: varchar("role").notNull(), // user_manager, user_staff
  navItemId: varchar("nav_item_id").notNull(), // matches NavItem.id in sidebar
  enabled: varchar("enabled").notNull().default("true"), // "true" or "false"
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type RolePermission = typeof rolePermissions.$inferSelect;
export type InsertRolePermission = typeof rolePermissions.$inferInsert;

// Profile photo history table for tracking saved profile pictures
export const profilePhotoHistory = pgTable("profile_photo_history", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  imageUrl: text("image_url").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export type ProfilePhotoHistory = typeof profilePhotoHistory.$inferSelect;
export type InsertProfilePhotoHistory = typeof profilePhotoHistory.$inferInsert;
