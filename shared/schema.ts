import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, boolean, integer, jsonb, real } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Re-export auth models
export * from "./models/auth";

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

// Data Sources (Hospitable connections)
export const dataSources = pgTable("data_sources", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  workspaceId: varchar("workspace_id"),
  provider: varchar("provider").notNull().default("hospitable"),
  name: varchar("name").notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  tokenExpiresAt: timestamp("token_expires_at"),
  isConnected: boolean("is_connected").notNull().default(false),
  lastSyncAt: timestamp("last_sync_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const dataSourcesRelations = relations(dataSources, ({ many }) => ({
  listings: many(listings),
}));

// Listings
export const listings = pgTable("listings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  dataSourceId: varchar("data_source_id").notNull().references(() => dataSources.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull(),
  workspaceId: varchar("workspace_id"),
  externalId: varchar("external_id"),
  name: varchar("name").notNull(),
  internalName: varchar("internal_name"),
  imageUrl: text("image_url"),
  publicUrl: text("public_url"),
  address: text("address"),
  propertyType: varchar("property_type"),
  bedrooms: integer("bedrooms"),
  bathrooms: real("bathrooms"),
  isActive: boolean("is_active").notNull().default(true),
  lastAnalyzedAt: timestamp("last_analyzed_at"),
  autoAnalysisEnabled: boolean("auto_analysis_enabled").notNull().default(false),
  // Enhanced property data
  headline: text("headline"),
  description: text("description"),
  summary: text("summary"),
  spaceOverview: text("space_overview"),
  guestAccess: text("guest_access"),
  houseManual: text("house_manual"),
  otherDetails: text("other_details"),
  additionalRules: text("additional_rules"),
  neighborhoodDescription: text("neighborhood_description"),
  gettingAround: text("getting_around"),
  wifiName: text("wifi_name"),
  amenities: jsonb("amenities").$type<string[]>(),
  images: jsonb("images").$type<string[]>(),
  houseRules: jsonb("house_rules").$type<{ pets_allowed?: boolean; smoking_allowed?: boolean; events_allowed?: boolean; children_allowed?: boolean }>(),
  ownerName: varchar("owner_name"),
  accountEmail: varchar("account_email"),
  lastSyncedAt: timestamp("last_synced_at"),
  syncDays: integer("sync_days").notNull().default(90),
  // Webhook status for tracking property changes from external system
  // "active" = normal synced property, "pending_sync" = new from webhook needs user action
  // "pending_delete" = deleted in external system, user must confirm, "pending_merge" = merged in external system
  webhookStatus: varchar("webhook_status").default("active"),
  webhookPendingData: jsonb("webhook_pending_data"),  // Stores incoming webhook data for user review
  platformIds: jsonb("platform_ids").$type<{ airbnb?: string; vrbo?: string; bookingCom?: string; [key: string]: string | undefined }>(),
  defaultProcedureId: varchar("default_procedure_id").references(() => procedures.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const listingsRelations = relations(listings, ({ one, many }) => ({
  dataSource: one(dataSources, {
    fields: [listings.dataSourceId],
    references: [dataSources.id],
  }),
  analyses: many(listingAnalyses),
  reservations: many(reservations),
  tags: many(tags),
  tasks: many(tasks),
}));

// Guest type with percentage
export interface GuestType {
  name: string;
  percentage: number;
  description: string;
}

// Reservation insight for per-reservation IGP breakdown
export interface ReservationInsight {
  guestName: string;
  checkIn: string;
  checkOut: string;
  summary: string;
  matchedProfile: string;
}

// Ideal Guest Profile type
export interface IdealGuestProfile {
  guestTypes?: GuestType[];
  demographics?: string[];
  travelPurposes?: string[];
  seasonalPatterns: string[];
  guestPreferences: string[];
  uniqueSellingPoints: string[];
  summary: string;
  reservationBreakdown?: ReservationInsight[];
}

// Category analysis detail type
export interface CategoryAnalysis {
  grade: string;
  score: number;
  feedback: string;
  suggestions: string[];
  heroReason?: string | null;
  top5Reason?: string | null;
  photoPositives?: string[];
  photoNeedsAction?: string[];
  heroStrengths?: string[];
  heroWeaknesses?: string[];
  heroConfidenceScore?: number | null;
  alternativeHero?: { photoIndex: number; reason: string } | null;
  top5Strengths?: string[];
  top5Weaknesses?: string[];
  top5Alternatives?: { currentIndex: number; suggestedIndex: number; reason: string }[];
  heroRecommendation?: { photoIndex: number; reason: string; strengths?: string[]; weaknesses?: string[]; confidenceScore?: number; alternativePhotoIndex?: number | null; alternativeReason?: string | null };
  top5Recommendations?: { photoIndex: number; reason: string; order: number; strengths?: string[]; weaknesses?: string[]; alternativePhotoIndex?: number | null; alternativeReason?: string | null }[];
  duplicateWarnings?: string[];
  overallAssessment?: string;
  selectionAnalyzedAt?: string;
}

// Listing Analyses
export const listingAnalyses = pgTable("listing_analyses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  listingId: varchar("listing_id").notNull().references(() => listings.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull(),
  workspaceId: varchar("workspace_id"),
  score: real("score"),
  petGrade: varchar("pet_grade"),
  superhostGrade: varchar("superhost_grade"),
  photosGrade: varchar("photos_grade"),
  reviewsGrade: varchar("reviews_grade"),
  guestFavGrade: varchar("guest_fav_grade"),
  titleGrade: varchar("title_grade"),
  sleepGrade: varchar("sleep_grade"),
  superhostStatusGrade: varchar("superhost_status_grade"),
  descriptionGrade: varchar("description_grade"),
  idealGrade: varchar("ideal_grade"),
  suggestions: jsonb("suggestions").$type<string[]>(),
  // Category analysis details
  petAnalysis: jsonb("pet_analysis").$type<CategoryAnalysis>(),
  superhostAnalysis: jsonb("superhost_analysis").$type<CategoryAnalysis>(),
  photosAnalysis: jsonb("photos_analysis").$type<CategoryAnalysis>(),
  reviewsAnalysis: jsonb("reviews_analysis").$type<CategoryAnalysis>(),
  guestFavAnalysis: jsonb("guest_fav_analysis").$type<CategoryAnalysis>(),
  titleAnalysis: jsonb("title_analysis").$type<CategoryAnalysis>(),
  sleepAnalysis: jsonb("sleep_analysis").$type<CategoryAnalysis>(),
  superhostStatusAnalysis: jsonb("superhost_status_analysis").$type<CategoryAnalysis>(),
  descriptionAnalysis: jsonb("description_analysis").$type<CategoryAnalysis>(),
  idealAnalysis: jsonb("ideal_analysis").$type<CategoryAnalysis>(),
  // Ideal Guest Profile
  idealGuestProfile: jsonb("ideal_guest_profile").$type<IdealGuestProfile>(),
  // Data used for analysis
  reviewCount: integer("review_count"),
  reservationCount: integer("reservation_count"),
  conversationCount: integer("conversation_count"),
  // Photo analysis phase tracking
  photoAnalysisStatus: varchar("photo_analysis_status").$type<"pending" | "in_progress" | "complete">().default("pending"),
  photoAnalysisProgress: integer("photo_analysis_progress").default(0),
  photoAnalysisTotalPhotos: integer("photo_analysis_total_photos").default(0),
  overallGrade: varchar("overall_grade"),
  completedCategories: jsonb("completed_categories").$type<string[]>().default([]),
  analyzedAt: timestamp("analyzed_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const listingAnalysesRelations = relations(listingAnalyses, ({ one }) => ({
  listing: one(listings, {
    fields: [listingAnalyses.listingId],
    references: [listings.id],
  }),
}));

// AI Usage Logs for tracking OpenAI API usage
export const aiUsageLogs = pgTable("ai_usage_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  label: varchar("label").notNull(),
  model: varchar("model").notNull(),
  inputTokens: integer("input_tokens").notNull().default(0),
  outputTokens: integer("output_tokens").notNull().default(0),
  estimatedCost: real("estimated_cost").notNull().default(0),
  listingId: varchar("listing_id").references(() => listings.id, { onDelete: "set null" }),
  listingName: varchar("listing_name"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Webhook logs for tracking incoming webhooks
export const webhookLogs = pgTable("webhook_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  source: varchar("source").notNull(),
  eventType: varchar("event_type").notNull(),
  status: varchar("status").notNull(),
  statusCode: integer("status_code"),
  payload: jsonb("payload"),
  errorMessage: varchar("error_message"),
  reservationId: varchar("reservation_id").references(() => reservations.id, { onDelete: "set null" }),
  listingId: varchar("listing_id").references(() => listings.id, { onDelete: "set null" }),
  workspaceId: varchar("workspace_id"),
  processingTimeMs: integer("processing_time_ms"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Photo Analysis (AI-powered image analysis)
export interface PhotoTechnicalDetails {
  resolution: string;
  lighting: string;
  perspective: string;
  shadows: string;
}

export const photoAnalyses = pgTable("photo_analyses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  listingId: varchar("listing_id").notNull().references(() => listings.id, { onDelete: "cascade" }),
  photoIndex: integer("photo_index").notNull(),
  photoUrl: text("photo_url").notNull(),
  imageWidth: integer("image_width"),
  imageHeight: integer("image_height"),
  isLowResolution: boolean("is_low_resolution").default(false),
  technicalDetails: jsonb("technical_details").$type<PhotoTechnicalDetails>(),
  objectsDetected: jsonb("objects_detected").$type<string[]>(),
  roomLabel: varchar("room_label"),
  recommendation: text("recommendation"),
  analysisType: varchar("analysis_type").notNull().default("full"),
  // Hero/Top5 recommendation flags
  isHeroRecommendation: boolean("is_hero_recommendation").default(false),
  isTop5Recommendation: boolean("is_top5_recommendation").default(false),
  // AI Edited photo URL (stored when user accepts an AI-edited version)
  aiEditedUrl: text("ai_edited_url"),
  aiEditedPrompt: text("ai_edited_prompt"),
  aiEditedAt: timestamp("ai_edited_at"),
  analyzedAt: timestamp("analyzed_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const photoAnalysesRelations = relations(photoAnalyses, ({ one }) => ({
  listing: one(listings, {
    fields: [photoAnalyses.listingId],
    references: [listings.id],
  }),
}));

export type PhotoAnalysis = typeof photoAnalyses.$inferSelect;

export const insertPhotoAnalysisSchema = createInsertSchema(photoAnalyses).omit({
  id: true,
  analyzedAt: true,
  createdAt: true,
});

export type InsertPhotoAnalysis = z.infer<typeof insertPhotoAnalysisSchema>;

// Category ratings from guest review (Airbnb provides sub-ratings with optional comments)
export interface CategoryRatings {
  cleanliness?: number;
  cleanlinessComment?: string;
  communication?: number;
  communicationComment?: string;
  location?: number;
  locationComment?: string;
  checkIn?: number;
  checkInComment?: string;
  accuracy?: number;
  accuracyComment?: string;
  value?: number;
  valueComment?: string;
}

// Reservations (synced from Hospitable)
export const reservations = pgTable("reservations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  listingId: varchar("listing_id").notNull().references(() => listings.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull(),
  workspaceId: varchar("workspace_id"),
  externalId: varchar("external_id").notNull(),
  confirmationCode: varchar("confirmation_code"),
  guestName: varchar("guest_name"),
  guestEmail: varchar("guest_email"),
  guestProfilePicture: varchar("guest_profile_picture"),
  guestLocation: varchar("guest_location"),
  platform: varchar("platform").notNull().default("Airbnb"),
  checkInDate: timestamp("check_in_date"),
  checkOutDate: timestamp("check_out_date"),
  status: varchar("status").notNull().default("completed"),
  publicReview: text("public_review"),
  privateRemarks: text("private_remarks"),
  hostReply: text("host_reply"),
  conversationHistory: jsonb("conversation_history").$type<ConversationMessage[]>(),
  reviewPostedAt: timestamp("review_posted_at"),
  tagsProcessedAt: timestamp("tags_processed_at"),
  themeEligibleAt: timestamp("theme_eligible_at"),
  // Guest rating (1-5 stars)
  guestRating: real("guest_rating"),
  categoryRatings: jsonb("category_ratings").$type<CategoryRatings>(),
  // AI Review Analysis fields
  aiSentimentScore: real("ai_sentiment_score"), // 0-5 with 0.1 increments
  aiPublicReviewScore: real("ai_public_review_score"), // 0-5
  aiPrivateRemarksScore: real("ai_private_remarks_score"), // 0-5
  aiConversationScore: real("ai_conversation_score"), // 0-5
  aiGuestSummary: text("ai_guest_summary"),
  reviewAnalyzedAt: timestamp("review_analyzed_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export interface ConversationMessage {
  id: string;
  sender: "guest" | "host";
  message: string;
  timestamp: string;
}

export const reservationsRelations = relations(reservations, ({ one, many }) => ({
  listing: one(listings, {
    fields: [reservations.listingId],
    references: [listings.id],
  }),
  tags: many(tags),
}));

// Themes - categories that group related tags
export const themes = pgTable("themes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  workspaceId: varchar("workspace_id"),
  name: varchar("name").notNull(),
  icon: varchar("icon"),
  description: text("description"),
  summary: text("summary"),
  summaryTagCount: integer("summary_tag_count"),
  summaryGeneratedAt: timestamp("summary_generated_at"),
  color: varchar("color"),
  isSystemTheme: boolean("is_system_theme").notNull().default(false), // Pre-seeded default themes
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Default themes that are seeded for every workspace
export const DEFAULT_THEMES = [
  { name: "Maintenance", icon: "🔧", description: "Issues related to property maintenance, repairs, and upkeep" },
  { name: "Cleanliness", icon: "✨", description: "Feedback about cleaning quality, hygiene, and tidiness" },
  { name: "Communication", icon: "💬", description: "Guest-host communication, responsiveness, and clarity" },
  { name: "Amenities", icon: "🏠", description: "Feedback about property features, appliances, and amenities" },
  { name: "Supplies", icon: "🧴", description: "Consumables, toiletries, kitchen supplies, and essentials" },
  { name: "Check-In Process", icon: "🔑", description: "Arrival experience, key access, and check-in instructions" },
  { name: "Access", icon: "🚪", description: "Entry points, parking, building access, and navigation" },
  { name: "Safety", icon: "🛡️", description: "Security concerns, smoke detectors, locks, and safety equipment" },
  { name: "Accessibility", icon: "♿", description: "Accessibility features and accommodations for guests with disabilities" },
  { name: "Pest Control", icon: "🐜", description: "Issues with insects, rodents, or other pests" },
  { name: "Unassigned", icon: "📋", description: "Tags that haven't been categorized into a specific theme yet" },
] as const;

export const themesRelations = relations(themes, ({ many }) => ({
  tags: many(tags),
}));

// Tags - AI-generated insights from reservation analysis
export const tags = pgTable("tags", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  workspaceId: varchar("workspace_id"),
  listingId: varchar("listing_id").notNull().references(() => listings.id, { onDelete: "cascade" }),
  reservationId: varchar("reservation_id").notNull().references(() => reservations.id, { onDelete: "cascade" }),
  themeId: varchar("theme_id").references(() => themes.id, { onDelete: "set null" }),
  pendingThemeName: varchar("pending_theme_name"),
  pendingThemeIcon: varchar("pending_theme_icon"),
  name: varchar("name").notNull(),
  sentiment: varchar("sentiment").notNull().default("neutral"),
  priority: varchar("priority").default("medium"), // low, medium, high, critical
  summary: text("summary"),
  verbatimEvidence: text("verbatim_evidence"),
  sourceType: varchar("source_type"), // "review" or "message" - where the evidence came from
  sourceId: varchar("source_id"), // ID of the review or message that sourced this tag
  suggestedTaskTitle: text("suggested_task_title"),
  suggestedTaskDescription: text("suggested_task_description"),
  addedToThemeAt: timestamp("added_to_theme_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const tagsRelations = relations(tags, ({ one, many }) => ({
  listing: one(listings, {
    fields: [tags.listingId],
    references: [listings.id],
  }),
  reservation: one(reservations, {
    fields: [tags.reservationId],
    references: [reservations.id],
  }),
  theme: one(themes, {
    fields: [tags.themeId],
    references: [themes.id],
  }),
  tasks: many(tasks),
}));

// Tasks - actionable items from AI suggestions
export const tasks = pgTable("tasks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  workspaceId: varchar("workspace_id"),
  tagId: varchar("tag_id").references(() => tags.id, { onDelete: "set null" }),
  themeId: varchar("theme_id").references(() => themes.id, { onDelete: "set null" }),
  listingId: varchar("listing_id").references(() => listings.id, { onDelete: "set null" }),
  title: varchar("title").notNull(),
  description: text("description"),
  priority: varchar("priority").notNull().default("medium"),
  status: varchar("status").notNull().default("pending"),
  assigneeType: varchar("assignee_type").default("member"),
  assigneeId: varchar("assignee_id"),
  assigneeName: varchar("assignee_name"),
  dueDate: timestamp("due_date"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const tasksRelations = relations(tasks, ({ one }) => ({
  tag: one(tags, {
    fields: [tasks.tagId],
    references: [tags.id],
  }),
  theme: one(themes, {
    fields: [tasks.themeId],
    references: [themes.id],
  }),
  listing: one(listings, {
    fields: [tasks.listingId],
    references: [listings.id],
  }),
}));

// Insert schemas
export const insertAiUsageLogSchema = createInsertSchema(aiUsageLogs).omit({
  id: true,
  createdAt: true,
});

export type InsertAiUsageLog = z.infer<typeof insertAiUsageLogSchema>;
export type AiUsageLog = typeof aiUsageLogs.$inferSelect;

export const insertWebhookLogSchema = createInsertSchema(webhookLogs).omit({
  id: true,
  createdAt: true,
});

export type InsertWebhookLog = z.infer<typeof insertWebhookLogSchema>;
export type WebhookLog = typeof webhookLogs.$inferSelect;

export const insertReservationSchema = createInsertSchema(reservations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertThemeSchema = createInsertSchema(themes).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertTagSchema = createInsertSchema(tags).omit({
  id: true,
  updatedAt: true,
}).extend({
  // Allow optional createdAt override (for backdating tags to reservation checkout date)
  createdAt: z.date().optional(),
});

export const insertTaskSchema = createInsertSchema(tasks).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertReservation = z.infer<typeof insertReservationSchema>;
export type Reservation = typeof reservations.$inferSelect;

export type InsertTheme = z.infer<typeof insertThemeSchema>;
export type Theme = typeof themes.$inferSelect;

export type InsertTag = z.infer<typeof insertTagSchema>;
export type Tag = typeof tags.$inferSelect;

export type InsertTask = z.infer<typeof insertTaskSchema>;
export type Task = typeof tasks.$inferSelect;

// Extended AI Usage Log with user info for admin view
export interface AiUsageLogWithUser extends AiUsageLog {
  userName?: string | null;
}

// System Settings for global configuration (like AI model selection)
export const systemSettings = pgTable("system_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  key: varchar("key").notNull().unique(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
  updatedBy: varchar("updated_by"),
});

export const insertSystemSettingSchema = createInsertSchema(systemSettings).omit({
  id: true,
  updatedAt: true,
});

export type InsertSystemSetting = z.infer<typeof insertSystemSettingSchema>;
export type SystemSetting = typeof systemSettings.$inferSelect;

// Available AI models with pricing (per 1K tokens)
// Currently only OpenAI models are supported via Replit AI Integrations
export const AI_MODELS = {
  // OpenAI models (supported via Replit AI Integrations)
  "gpt-4.1-mini": { provider: "openai", name: "GPT-4.1 Mini", inputCost: 0.0004, outputCost: 0.0016 },
  "gpt-4.1": { provider: "openai", name: "GPT-4.1", inputCost: 0.002, outputCost: 0.008 },
  "gpt-4.1-nano": { provider: "openai", name: "GPT-4.1 Nano", inputCost: 0.0001, outputCost: 0.0004 },
  "gpt-4o": { provider: "openai", name: "GPT-4o", inputCost: 0.0025, outputCost: 0.01 },
  "gpt-4o-mini": { provider: "openai", name: "GPT-4o Mini", inputCost: 0.00015, outputCost: 0.0006 },
  // Grok/xAI models (supported via OpenRouter)
  "x-ai/grok-4.1-fast": { provider: "openrouter", name: "Grok 4.1 Fast", inputCost: 0.003, outputCost: 0.015 },
  "x-ai/grok-4-fast": { provider: "openrouter", name: "Grok 4 Fast", inputCost: 0.003, outputCost: 0.015 },
  "x-ai/grok-4": { provider: "openrouter", name: "Grok 4", inputCost: 0.003, outputCost: 0.015 },
  "x-ai/grok-3": { provider: "openrouter", name: "Grok 3", inputCost: 0.003, outputCost: 0.015 },
  "x-ai/grok-3-mini": { provider: "openrouter", name: "Grok 3 Mini", inputCost: 0.0003, outputCost: 0.0005 },
} as const;

export type AIModelId = keyof typeof AI_MODELS;

export const insertDataSourceSchema = createInsertSchema(dataSources).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertListingSchema = createInsertSchema(listings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertListingAnalysisSchema = createInsertSchema(listingAnalyses).omit({
  id: true,
  createdAt: true,
});

export const updateListingAnalysisSchema = insertListingAnalysisSchema.partial().omit({
  listingId: true,
  userId: true,
});

// Workspaces (multi-account support)
export const workspaces = pgTable("workspaces", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name").notNull(),
  propertyManagementSoftware: varchar("property_management_software").notNull(),
  customSoftwareName: varchar("custom_software_name"),
  listingCount: varchar("listing_count"),
  logoUrl: text("logo_url"),
  squareLogoUrl: text("square_logo_url"),
  slackWebhookUrl: text("slack_webhook_url"),
  createdBy: varchar("created_by").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const workspaceMembers = pgTable("workspace_members", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  userId: varchar("user_id"),
  invitedEmail: varchar("invited_email"),
  invitedBy: varchar("invited_by"),
  role: varchar("role").notNull().default("member"), // owner, admin, member
  status: varchar("status").notNull().default("pending"), // pending, active
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const workspaceMembersRelations = relations(workspaceMembers, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [workspaceMembers.workspaceId],
    references: [workspaces.id],
  }),
}));

export const insertWorkspaceSchema = createInsertSchema(workspaces).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertWorkspaceMemberSchema = createInsertSchema(workspaceMembers).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Types
export type InsertDataSource = z.infer<typeof insertDataSourceSchema>;
export type DataSource = typeof dataSources.$inferSelect;

export type InsertListing = z.infer<typeof insertListingSchema>;
export type Listing = typeof listings.$inferSelect;

export type InsertListingAnalysis = z.infer<typeof insertListingAnalysisSchema>;
export type ListingAnalysis = typeof listingAnalyses.$inferSelect;

export type InsertWorkspace = z.infer<typeof insertWorkspaceSchema>;
export type Workspace = typeof workspaces.$inferSelect;

export type InsertWorkspaceMember = z.infer<typeof insertWorkspaceMemberSchema>;
export type WorkspaceMember = typeof workspaceMembers.$inferSelect;

// Teams - Groups within a workspace for organizing members and task assignment
export const TEAM_ROLES = {
  MANAGER: "manager",
  MEMBER: "member",
} as const;

export type TeamRole = typeof TEAM_ROLES[keyof typeof TEAM_ROLES];

export const TEAM_MEMBER_STATUS = {
  ACTIVE: "active",
  INVITED: "invited",
} as const;

export type TeamMemberStatus = typeof TEAM_MEMBER_STATUS[keyof typeof TEAM_MEMBER_STATUS];

export const teams = pgTable("teams", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  name: varchar("name").notNull(),
  description: text("description"),
  createdBy: varchar("created_by").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const teamsRelations = relations(teams, ({ many }) => ({
  members: many(teamMembers),
}));

export const teamMembers = pgTable("team_members", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  teamId: varchar("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
  userId: varchar("user_id"),
  invitedEmail: varchar("invited_email"),
  invitedBy: varchar("invited_by"),
  invitationToken: varchar("invitation_token"),
  role: varchar("role").notNull().default("member"),
  status: varchar("status").notNull().default("invited"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const teamMembersRelations = relations(teamMembers, ({ one }) => ({
  team: one(teams, {
    fields: [teamMembers.teamId],
    references: [teams.id],
  }),
}));

export const insertTeamSchema = createInsertSchema(teams).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertTeamMemberSchema = createInsertSchema(teamMembers).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertTeam = z.infer<typeof insertTeamSchema>;
export type Team = typeof teams.$inferSelect;

export type InsertTeamMember = z.infer<typeof insertTeamMemberSchema>;
export type TeamMember = typeof teamMembers.$inferSelect;

// Extended team with member count for list view
export interface TeamWithStats extends Team {
  memberCount: number;
  taskCount: number;
}

// Extended team member with user info
export interface TeamMemberWithUser extends TeamMember {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  profileImageUrl?: string | null;
  lastLoginAt?: Date | null;
}

// Reviews Summaries - Cached AI-generated summaries for properties and property combinations
export const reviewsSummaries = pgTable("reviews_summaries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  listingIds: jsonb("listing_ids").$type<string[]>().notNull(),
  listingIdsHash: varchar("listing_ids_hash").notNull(),
  performanceInsight: text("performance_insight"),
  strengths: jsonb("strengths").$type<string[]>(),
  areasToImprove: jsonb("areas_to_improve").$type<string[]>(),
  analyzedReservationCount: integer("analyzed_reservation_count"),
  generatedAt: timestamp("generated_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertReviewsSummarySchema = createInsertSchema(reviewsSummaries).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertReviewsSummary = z.infer<typeof insertReviewsSummarySchema>;
export type ReviewsSummary = typeof reviewsSummaries.$inferSelect;

// ========================================
// Ask Lumi - AI Research Agent
// ========================================

// Lumi Views - Custom filter views for scoping queries
export const lumiViews = pgTable("lumi_views", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  name: varchar("name").notNull(),
  description: text("description"),
  filters: jsonb("filters").$type<{
    listingIds?: string[];
    sentiment?: string[];
    dateRange?: { start: string; end: string };
    platforms?: string[];
    themes?: string[];
    tags?: string[];
  }>(),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertLumiViewSchema = createInsertSchema(lumiViews).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertLumiView = z.infer<typeof insertLumiViewSchema>;
export type LumiView = typeof lumiViews.$inferSelect;

// Lumi Queries - User query history
export const lumiQueries = pgTable("lumi_queries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  conversationId: varchar("conversation_id"), // Groups related queries for follow-up questions
  viewId: varchar("view_id").references(() => lumiViews.id, { onDelete: "set null" }),
  prompt: text("prompt").notNull(),
  response: text("response"),
  responseType: varchar("response_type").default("text"), // text, chart, table, document
  sources: jsonb("sources").$type<{
    reservations?: number;
    reviews?: number;
    tags?: number;
    themes?: number;
  }>(),
  thinkingSteps: jsonb("thinking_steps").$type<{
    step: string;
    status: "pending" | "complete";
    detail?: string;
  }[]>(),
  isSaved: boolean("is_saved").notNull().default(false),
  textMatchOnly: boolean("text_match_only").notNull().default(false),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertLumiQuerySchema = createInsertSchema(lumiQueries).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertLumiQuery = z.infer<typeof insertLumiQuerySchema>;
export type LumiQuery = typeof lumiQueries.$inferSelect;

// Lumi Workflows - Predefined analysis templates
export const lumiWorkflows = pgTable("lumi_workflows", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id"),
  name: varchar("name").notNull(),
  description: text("description"),
  icon: varchar("icon").default("sparkles"),
  category: varchar("category").default("general"), // general, pricing, integrations, feedback
  promptTemplate: text("prompt_template").notNull(),
  isSystem: boolean("is_system").notNull().default(false),
  isLocked: boolean("is_locked").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertLumiWorkflowSchema = createInsertSchema(lumiWorkflows).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertLumiWorkflow = z.infer<typeof insertLumiWorkflowSchema>;
export type LumiWorkflow = typeof lumiWorkflows.$inferSelect;

// Lumi Documents - Generated artifacts and saved outputs
export const lumiDocuments = pgTable("lumi_documents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  queryId: varchar("query_id").references(() => lumiQueries.id, { onDelete: "set null" }),
  title: varchar("title").notNull(),
  content: text("content"),
  documentType: varchar("document_type").default("report"), // report, chart, summary
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertLumiDocumentSchema = createInsertSchema(lumiDocuments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertLumiDocument = z.infer<typeof insertLumiDocumentSchema>;
export type LumiDocument = typeof lumiDocuments.$inferSelect;

// AI Prompts - Admin-managed prompts for listing analysis categories
export const AI_PROMPT_CATEGORIES = {
  PHOTOS: "photos",
  TITLE: "title",
  REVIEWS: "reviews",
  PET_FRIENDLY: "pet_friendly",
  DESCRIPTION: "description",
  SLEEP: "sleep",
  HOST_PROFILE: "host_profile",
  GUEST_FAVORITES: "guest_favorites",
  SUPERHOST: "superhost",
  IDEAL_ALIGNMENT: "ideal_alignment",
  TITLE_GENERATOR: "title_generator",
  DESCRIPTION_GENERATOR: "description_generator",
  REVIEW_REMOVAL: "review_removal",
} as const;

// Existing ai_prompts table - matching database structure with new fields
export const aiPrompts = pgTable("ai_prompts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name").notNull(), // human-readable name
  description: text("description"), // what this prompt is for
  promptTemplate: text("prompt_template"), // the actual prompt template
  isActive: varchar("is_active").default("true"), // stored as string in existing db
  createdBy: varchar("created_by"),
  updatedBy: varchar("updated_by"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  modelId: varchar("model_id"),
  // New columns for listing analysis
  category: varchar("category"), // matches AI_PROMPT_CATEGORIES
  systemPrompt: text("system_prompt"), // system prompt for AI
  version: integer("version").default(1),
});

export const insertAiPromptSchema = createInsertSchema(aiPrompts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertAiPrompt = z.infer<typeof insertAiPromptSchema>;
export type AiPrompt = typeof aiPrompts.$inferSelect;

// Generated Content - Stores AI-generated listing content (titles, descriptions)
export const generatedContent = pgTable("generated_content", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  listingId: varchar("listing_id").notNull().references(() => listings.id, { onDelete: "cascade" }),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  contentType: varchar("content_type").notNull(), // "titles", "about", "the_space"
  content: jsonb("content").$type<GeneratedTitles | GeneratedDescription>(),
  promptId: varchar("prompt_id").references(() => aiPrompts.id, { onDelete: "set null" }), // which AI prompt was used
  createdAt: timestamp("created_at").defaultNow(),
});

export interface GeneratedTitles {
  titles: Array<{
    title: string;
    reasoning: string;
  }>;
}

export interface GeneratedDescription {
  about: string;
  theSpace: string;
}

export const insertGeneratedContentSchema = createInsertSchema(generatedContent).omit({
  id: true,
  createdAt: true,
});

export type InsertGeneratedContent = z.infer<typeof insertGeneratedContentSchema>;
export type GeneratedContent = typeof generatedContent.$inferSelect;

// Airbnb Scans - stores data scraped from public Airbnb listing pages
export interface WhereYoullSleep {
  rooms: Array<{
    name: string;
    bedConfiguration: string;
    photoUrl?: string;
  }>;
}

export interface HostProfileData {
  name: string;
  photoUrl?: string;
  isSuperhost: boolean;
  responseRate?: string;
  responseTime?: string;
  yearsHosting?: number;
  reviewCount?: number;
  rating?: number;
  verified?: boolean;
  attributes: string[];
  aboutText?: string;
}

export const airbnbScans = pgTable("airbnb_scans", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  listingId: varchar("listing_id").notNull().references(() => listings.id, { onDelete: "cascade" }),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  airbnbUrl: text("airbnb_url").notNull(),
  status: varchar("status").notNull().default("pending"), // pending, scanning, completed, failed
  errorMessage: text("error_message"),
  whereYoullSleep: jsonb("where_youll_sleep").$type<WhereYoullSleep>(),
  hasWhereYoullSleep: boolean("has_where_youll_sleep"),
  isSuperhost: boolean("is_superhost"),
  guestFavoriteTier: varchar("guest_favorite_tier"), // "gold" (top 1%), "black" (top 5%), "standard" (top 10%), or null
  hostProfile: jsonb("host_profile").$type<HostProfileData>(),
  rawSnapshot: jsonb("raw_snapshot"), // Stores raw extracted data for debugging
  aiAnalysis: jsonb("ai_analysis").$type<{
    whereYoullSleepAnalysis?: { grade: string; feedback: string; suggestions: string[] };
    superhostAnalysis?: { hasStatus: boolean; feedback: string };
    guestFavoriteAnalysis?: { tier: string | null; feedback: string; suggestions: string[] };
    hostProfileAnalysis?: { grade: string; photoQuality: string; feedback: string; suggestions: string[] };
    overallScore?: number;
  }>(),
  scannedAt: timestamp("scanned_at"),
  analyzedAt: timestamp("analyzed_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const airbnbScansRelations = relations(airbnbScans, ({ one }) => ({
  listing: one(listings, {
    fields: [airbnbScans.listingId],
    references: [listings.id],
  }),
}));

export const insertAirbnbScanSchema = createInsertSchema(airbnbScans).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertAirbnbScan = z.infer<typeof insertAirbnbScanSchema>;
export type AirbnbScan = typeof airbnbScans.$inferSelect;

// Speed Test History
export interface SpeedTestStageMetrics {
  responseTime: number;
  tokens: { input: number; output: number };
  estimatedCost: number;
  error?: string;
}

export interface SpeedTestStageResult {
  openai: SpeedTestStageMetrics;
  grok: SpeedTestStageMetrics;
  winner: "openai" | "grok" | "tie";
}

export interface SpeedTestResults {
  stages: {
    tags: SpeedTestStageResult;
    tasks: SpeedTestStageResult;
    themes: SpeedTestStageResult;
  };
  totals: {
    openai: { responseTime: number; tokens: { input: number; output: number }; estimatedCost: number };
    grok: { responseTime: number; tokens: { input: number; output: number }; estimatedCost: number };
  };
  overallWinner: "openai" | "grok" | "tie";
  reservationComparisons: any[];
}

export const speedTestRuns = pgTable("speed_test_runs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  listingId: varchar("listing_id").notNull().references(() => listings.id, { onDelete: "cascade" }),
  listingName: varchar("listing_name"),
  openaiModel: varchar("openai_model").notNull(),
  grokModel: varchar("grok_model").notNull(),
  daysBack: integer("days_back").notNull(),
  reservationCount: integer("reservation_count").notNull(),
  results: jsonb("results").$type<SpeedTestResults>().notNull(),
  overallWinner: varchar("overall_winner").notNull(), // "openai", "grok", or "tie"
  totalOpenaiTime: integer("total_openai_time").notNull(),
  totalGrokTime: integer("total_grok_time").notNull(),
  totalOpenaiCost: real("total_openai_cost").notNull(),
  totalGrokCost: real("total_grok_cost").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const speedTestRunsRelations = relations(speedTestRuns, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [speedTestRuns.workspaceId],
    references: [workspaces.id],
  }),
  listing: one(listings, {
    fields: [speedTestRuns.listingId],
    references: [listings.id],
  }),
}));

export const insertSpeedTestRunSchema = createInsertSchema(speedTestRuns).omit({
  id: true,
  createdAt: true,
});

export type InsertSpeedTestRun = z.infer<typeof insertSpeedTestRunSchema>;
export type SpeedTestRun = typeof speedTestRuns.$inferSelect;

// Changelog System
export const CHANGELOG_STATUS = {
  SUGGESTED: "suggested",
  APPROVED: "approved", 
  SENT: "sent",
  DISMISSED: "dismissed",
} as const;

export const CHANGELOG_NOTIFICATION_TYPE = {
  EMAIL: "email",
  IN_APP: "in_app",
  BOTH: "both",
} as const;

export const changelogEntries = pgTable("changelog_entries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description").notNull(),
  location: varchar("location", { length: 255 }), // Where in the product
  hostBenefit: text("host_benefit"), // Why it matters for hosts
  commitHash: varchar("commit_hash", { length: 40 }),
  status: varchar("status", { length: 20 }).notNull().default("suggested"),
  suggestedAt: timestamp("suggested_at").defaultNow(),
  approvedAt: timestamp("approved_at"),
  sentAt: timestamp("sent_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertChangelogEntrySchema = createInsertSchema(changelogEntries).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertChangelogEntry = z.infer<typeof insertChangelogEntrySchema>;
export type ChangelogEntry = typeof changelogEntries.$inferSelect;

export const changelogSettings = pgTable("changelog_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sendTime: varchar("send_time", { length: 10 }).notNull().default("09:00"), // HH:MM format, Eastern time
  notificationType: varchar("notification_type", { length: 20 }).notNull().default("both"),
  isEnabled: boolean("is_enabled").notNull().default(true),
  lastSentAt: timestamp("last_sent_at"),
  // Auto-suggest settings
  suggestTime: varchar("suggest_time", { length: 10 }).notNull().default("18:00"), // HH:MM format, Eastern time
  suggestIntervalDays: integer("suggest_interval_days").notNull().default(1), // 1 = daily, 2 = every 2 days, etc.
  suggestEnabled: boolean("suggest_enabled").notNull().default(true),
  lastProcessedCommit: varchar("last_processed_commit", { length: 64 }), // SHA of last analyzed commit
  lastSuggestRunAt: timestamp("last_suggest_run_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertChangelogSettingsSchema = createInsertSchema(changelogSettings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertChangelogSettings = z.infer<typeof insertChangelogSettingsSchema>;
export type ChangelogSettings = typeof changelogSettings.$inferSelect;

// ===== PROCEDURES SYSTEM =====
// Procedure templates (playbooks) for tasks

export const PROCEDURE_STATUS = {
  DRAFT: "draft",
  ACTIVE: "active",
  ARCHIVED: "archived",
} as const;

export const STEP_MEDIA_TYPE = {
  IMAGE: "image",
  VIDEO: "video",
  VIDEO_URL: "video_url",
  ATTACHMENT: "attachment",
} as const;

export const COMPLETION_STATUS = {
  NOT_STARTED: "not_started",
  IN_PROGRESS: "in_progress",
  COMPLETED: "completed",
} as const;

// Step media type for JSON storage
export interface ProcedureStepMedia {
  type: "image" | "video" | "video_url" | "attachment";
  url: string;
  filename?: string;
  caption?: string;
}

// Step issue type for JSON storage
export interface ProcedureStepIssue {
  id: string;
  description?: string;
  voiceNoteUrl?: string;
  voiceNoteTranscript?: string;
  aiSummary?: string;
  translatedText?: string;
  photos: string[];
  createdAt: string;
  resolvedAt?: string;
}

// Step completion tracking for mobile (JSONB stored on procedure steps)
export interface MobileStepCompletion {
  userId: string;
  userName?: string;
  completedAt: string;
  taskId?: string;
  gpsLocation?: GpsLocation;
  gpsVerified?: boolean;
  photoUrl?: string;
  comment?: string;
  commentTranslation?: string;
  voiceNoteUrl?: string;
  voiceNoteTranscript?: string;
  voiceNoteTranslation?: string;
}

// GPS location type for verification photos
export interface GpsLocation {
  latitude: number;
  longitude: number;
  accuracy?: number;
  timestamp?: string;
}

// Procedure templates
export const procedures = pgTable("procedures", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  createdByUserId: varchar("created_by_user_id").notNull(),
  listingId: varchar("listing_id").references(() => listings.id, { onDelete: "set null" }), // Optional property association
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  status: varchar("status", { length: 20 }).notNull().default("draft"),
  isLocked: boolean("is_locked").notNull().default(false),
  // AI creation metadata
  createdViaAi: boolean("created_via_ai").notNull().default(false),
  aiPrompt: text("ai_prompt"), // Original prompt used to create
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const proceduresRelations = relations(procedures, ({ one, many }) => ({
  listing: one(listings, {
    fields: [procedures.listingId],
    references: [listings.id],
  }),
  steps: many(procedureSteps),
  assignments: many(procedureAssignments),
}));

// Individual steps within a procedure
export const procedureSteps = pgTable("procedure_steps", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  procedureId: varchar("procedure_id").notNull().references(() => procedures.id, { onDelete: "cascade" }),
  stepOrder: integer("step_order").notNull(),
  label: varchar("label", { length: 255 }).notNull(),
  description: text("description"),
  // Module grouping - steps can be grouped into collapsible sections
  moduleTitle: varchar("module_title", { length: 255 }),
  moduleOrder: integer("module_order"), // Order of the module section within the procedure
  sourceModuleId: varchar("source_module_id").references(() => taskModules.id, { onDelete: "set null" }), // Reference to the original task module template if copied from one
  // Media attachments stored as JSON array
  media: jsonb("media").$type<ProcedureStepMedia[]>(),
  // Voice note for step description
  voiceNoteUrl: text("voice_note_url"),
  voiceNoteTranscript: text("voice_note_transcript"),
  voiceNoteAiSummary: text("voice_note_ai_summary"),
  voiceNoteTranslation: text("voice_note_translation"),
  // Issues reported on this step
  issues: jsonb("issues").$type<ProcedureStepIssue[]>(),
  // Step completion tracking for mobile
  completions: jsonb("completions").$type<MobileStepCompletion[]>(),
  // Verification requirements
  requiresPhotoVerification: boolean("requires_photo_verification").notNull().default(false),
  photoVerificationMode: varchar("photo_verification_mode", { length: 20 }).notNull().default("none"),
  requiresGpsVerification: boolean("requires_gps_verification").notNull().default(false),
  // Optional: expected GPS location for verification (lat/lng bounds)
  expectedGpsLocation: jsonb("expected_gps_location").$type<GpsLocation>(),
  gpsRadiusMeters: integer("gps_radius_meters"), // Allowed radius from expected location
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const procedureStepsRelations = relations(procedureSteps, ({ one }) => ({
  procedure: one(procedures, {
    fields: [procedureSteps.procedureId],
    references: [procedures.id],
  }),
}));

// Links a procedure to a task
export const procedureAssignments = pgTable("procedure_assignments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  taskId: varchar("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
  procedureId: varchar("procedure_id").notNull().references(() => procedures.id, { onDelete: "cascade" }),
  assignedByUserId: varchar("assigned_by_user_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const procedureAssignmentsRelations = relations(procedureAssignments, ({ one }) => ({
  task: one(tasks, {
    fields: [procedureAssignments.taskId],
    references: [tasks.id],
  }),
  procedure: one(procedures, {
    fields: [procedureAssignments.procedureId],
    references: [procedures.id],
  }),
}));

// Tracks a user's overall progress on a procedure for a specific task
export const procedureCompletions = pgTable("procedure_completions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  procedureAssignmentId: varchar("procedure_assignment_id").notNull().references(() => procedureAssignments.id, { onDelete: "cascade" }),
  completedByUserId: varchar("completed_by_user_id").notNull(),
  status: varchar("status", { length: 20 }).notNull().default("not_started"),
  // Voice update functionality
  voiceUpdateUrl: text("voice_update_url"), // Audio file URL
  voiceUpdateTranscript: text("voice_update_transcript"), // Transcribed text
  aiSummary: text("ai_summary"), // AI-generated summary of voice update
  aiSummaryStatus: varchar("ai_summary_status", { length: 20 }), // pending, ready, edited
  notes: text("notes"), // Additional notes from completer
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const procedureCompletionsRelations = relations(procedureCompletions, ({ one, many }) => ({
  procedureAssignment: one(procedureAssignments, {
    fields: [procedureCompletions.procedureAssignmentId],
    references: [procedureAssignments.id],
  }),
  stepCompletions: many(stepCompletions),
}));

// Individual step completion tracking with verification
export const stepCompletions = pgTable("step_completions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  procedureCompletionId: varchar("procedure_completion_id").notNull().references(() => procedureCompletions.id, { onDelete: "cascade" }),
  procedureStepId: varchar("procedure_step_id").notNull().references(() => procedureSteps.id, { onDelete: "cascade" }),
  isCompleted: boolean("is_completed").notNull().default(false),
  // Verification photo with GPS
  verificationPhotoUrl: text("verification_photo_url"),
  verificationGps: jsonb("verification_gps").$type<GpsLocation>(),
  gpsVerified: boolean("gps_verified"), // null = not required, true/false = verification result
  // Notes for this specific step
  notes: text("notes"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const stepCompletionsRelations = relations(stepCompletions, ({ one }) => ({
  procedureCompletion: one(procedureCompletions, {
    fields: [stepCompletions.procedureCompletionId],
    references: [procedureCompletions.id],
  }),
  procedureStep: one(procedureSteps, {
    fields: [stepCompletions.procedureStepId],
    references: [procedureSteps.id],
  }),
}));

// Insert schemas for Procedures
export const insertProcedureSchema = createInsertSchema(procedures).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertProcedureStepSchema = createInsertSchema(procedureSteps).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertProcedureAssignmentSchema = createInsertSchema(procedureAssignments).omit({
  id: true,
  createdAt: true,
});

export const insertProcedureCompletionSchema = createInsertSchema(procedureCompletions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertStepCompletionSchema = createInsertSchema(stepCompletions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Types for Procedures
export type InsertProcedure = z.infer<typeof insertProcedureSchema>;
export type Procedure = typeof procedures.$inferSelect;

export type InsertProcedureStep = z.infer<typeof insertProcedureStepSchema>;
export type ProcedureStep = typeof procedureSteps.$inferSelect;

export type InsertProcedureAssignment = z.infer<typeof insertProcedureAssignmentSchema>;
export type ProcedureAssignment = typeof procedureAssignments.$inferSelect;

export type InsertProcedureCompletion = z.infer<typeof insertProcedureCompletionSchema>;
export type ProcedureCompletion = typeof procedureCompletions.$inferSelect;

export type InsertStepCompletion = z.infer<typeof insertStepCompletionSchema>;
export type StepCompletion = typeof stepCompletions.$inferSelect;

// Global procedure templates (managed by Super Admin)
export const procedureTemplates = pgTable("procedure_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  updatedByUserId: varchar("updated_by_user_id"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const procedureTemplateSteps = pgTable("procedure_template_steps", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  templateId: varchar("template_id").notNull().references(() => procedureTemplates.id, { onDelete: "cascade" }),
  stepOrder: integer("step_order").notNull(),
  label: varchar("label", { length: 255 }).notNull(),
  description: text("description"),
  moduleTitle: varchar("module_title", { length: 255 }),
  moduleOrder: integer("module_order"),
  requiresPhotoVerification: boolean("requires_photo_verification").notNull().default(false),
  photoVerificationMode: varchar("photo_verification_mode", { length: 20 }).notNull().default("none"),
  requiresGpsVerification: boolean("requires_gps_verification").notNull().default(false),
  gpsRadiusMeters: integer("gps_radius_meters"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const procedureTemplateStepsRelations = relations(procedureTemplateSteps, ({ one }) => ({
  template: one(procedureTemplates, {
    fields: [procedureTemplateSteps.templateId],
    references: [procedureTemplates.id],
  }),
}));

export const procedureTemplatesRelations = relations(procedureTemplates, ({ many }) => ({
  steps: many(procedureTemplateSteps),
}));

export const insertProcedureTemplateSchema = createInsertSchema(procedureTemplates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertProcedureTemplateStepSchema = createInsertSchema(procedureTemplateSteps).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertProcedureTemplate = z.infer<typeof insertProcedureTemplateSchema>;
export type ProcedureTemplate = typeof procedureTemplates.$inferSelect;
export type InsertProcedureTemplateStep = z.infer<typeof insertProcedureTemplateStepSchema>;
export type ProcedureTemplateStep = typeof procedureTemplateSteps.$inferSelect;

export interface ProcedureTemplateWithSteps extends ProcedureTemplate {
  steps: ProcedureTemplateStep[];
}

// Extended types for procedures with steps
export interface ProcedureWithSteps extends Procedure {
  steps: ProcedureStep[];
}

export interface ProcedureCompletionWithDetails extends ProcedureCompletion {
  stepCompletions: StepCompletion[];
  procedure?: ProcedureWithSteps;
}

// ============================================
// Task Modules - Reusable task groups for procedures
// ============================================

// Task Modules - Reusable templates containing grouped items
export const taskModules = pgTable("task_modules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  category: varchar("category", { length: 100 }),
  isRecommended: boolean("is_recommended").notNull().default(false),
  createdByUserId: varchar("created_by_user_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const taskModulesRelations = relations(taskModules, ({ many }) => ({
  items: many(taskModuleItems),
}));

// Task Module Items - Individual items within a module template
export const taskModuleItems = pgTable("task_module_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  moduleId: varchar("module_id").notNull().references(() => taskModules.id, { onDelete: "cascade" }),
  itemOrder: integer("item_order").notNull(),
  label: varchar("label", { length: 255 }).notNull(),
  description: text("description"),
  requiresPhotoVerification: boolean("requires_photo_verification").notNull().default(false),
  photoVerificationMode: varchar("photo_verification_mode", { length: 20 }).notNull().default("none"),
  requiresGpsVerification: boolean("requires_gps_verification").notNull().default(false),
  media: jsonb("media").$type<ProcedureStepMedia[]>(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const taskModuleItemsRelations = relations(taskModuleItems, ({ one }) => ({
  module: one(taskModules, {
    fields: [taskModuleItems.moduleId],
    references: [taskModules.id],
  }),
}));

// Insert schemas for Task Modules
export const insertTaskModuleSchema = createInsertSchema(taskModules).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertTaskModuleItemSchema = createInsertSchema(taskModuleItems).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Types for Task Modules
export type InsertTaskModule = z.infer<typeof insertTaskModuleSchema>;
export type TaskModule = typeof taskModules.$inferSelect;

export type InsertTaskModuleItem = z.infer<typeof insertTaskModuleItemSchema>;
export type TaskModuleItem = typeof taskModuleItems.$inferSelect;

// Extended type for module with items
export interface TaskModuleWithItems extends TaskModule {
  items: TaskModuleItem[];
}

// ============================================
// Folder System - Organize files and links
// ============================================

// Folders - Organize files and links into categories
export const folders = pgTable("folders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  name: varchar("name").notNull(),
  description: text("description"),
  parentId: varchar("parent_id").references(() => folders.id, { onDelete: "set null" }), // For nested folders (optional)
  color: varchar("color"), // Optional color for folder icon
  icon: varchar("icon"), // Optional icon name
  createdBy: varchar("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const foldersRelations = relations(folders, ({ many, one }) => ({
  items: many(folderItems),
  parent: one(folders, {
    fields: [folders.parentId],
    references: [folders.id],
  }),
}));

// Folder item types
export const FOLDER_ITEM_TYPES = {
  FILE: "file",
  LINK: "link",
} as const;

// Folder Items - Files (PDFs, images) and links (videos, external resources)
export const folderItems = pgTable("folder_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  folderId: varchar("folder_id").notNull().references(() => folders.id, { onDelete: "cascade" }),
  type: varchar("type").notNull(), // "file" or "link"
  name: varchar("name").notNull(),
  description: text("description"),
  // For files
  fileUrl: text("file_url"), // Storage URL for uploaded files
  fileType: varchar("file_type"), // "pdf", "image", etc.
  fileSize: integer("file_size"), // File size in bytes
  mimeType: varchar("mime_type"),
  // For links
  linkUrl: text("link_url"), // External URL for links
  linkType: varchar("link_type"), // "video", "document", "website", etc.
  thumbnailUrl: text("thumbnail_url"), // Preview thumbnail for links/files
  // Metadata
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  createdBy: varchar("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const folderItemsRelations = relations(folderItems, ({ one, many }) => ({
  folder: one(folders, {
    fields: [folderItems.folderId],
    references: [folders.id],
  }),
  taskAttachments: many(taskAttachments),
}));

// Task Attachments - Link folder items to tasks/sub-tasks
export const taskAttachments = pgTable("task_attachments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  folderItemId: varchar("folder_item_id").notNull().references(() => folderItems.id, { onDelete: "cascade" }),
  taskId: varchar("task_id").references(() => tasks.id, { onDelete: "set null" }), // Link to main task
  subTaskId: varchar("sub_task_id"), // Link to sub-task (optional)
  procedureStepId: varchar("procedure_step_id").references(() => procedureSteps.id, { onDelete: "set null" }), // Link to procedure step (optional)
  attachedBy: varchar("attached_by"),
  attachedAt: timestamp("attached_at").defaultNow(),
});

export const taskAttachmentsRelations = relations(taskAttachments, ({ one }) => ({
  folderItem: one(folderItems, {
    fields: [taskAttachments.folderItemId],
    references: [folderItems.id],
  }),
  task: one(tasks, {
    fields: [taskAttachments.taskId],
    references: [tasks.id],
  }),
}));

// Insert schemas
export const insertFolderSchema = createInsertSchema(folders).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertFolderItemSchema = createInsertSchema(folderItems).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertTaskAttachmentSchema = createInsertSchema(taskAttachments).omit({
  id: true,
  attachedAt: true,
});

// Types
export type InsertFolder = z.infer<typeof insertFolderSchema>;
export type Folder = typeof folders.$inferSelect;

export type InsertFolderItem = z.infer<typeof insertFolderItemSchema>;
export type FolderItem = typeof folderItems.$inferSelect;

export type InsertTaskAttachment = z.infer<typeof insertTaskAttachmentSchema>;
export type TaskAttachment = typeof taskAttachments.$inferSelect;

// Extended types
export interface FolderWithItems extends Folder {
  items: FolderItem[];
}

// Notion Connections - OAuth connections to Notion workspaces for data sync
export const notionConnections = pgTable("notion_connections", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }), // HostPulse workspace
  notionWorkspaceId: varchar("notion_workspace_id").notNull(), // Notion workspace ID
  notionWorkspaceName: varchar("notion_workspace_name"),
  notionWorkspaceIcon: varchar("notion_workspace_icon"),
  accessToken: text("access_token").notNull(),
  botId: varchar("bot_id").notNull(), // Notion bot/integration ID (primary key per their docs)
  connectedBy: varchar("connected_by").notNull(), // User who connected
  // Selected database for tag sync (legacy, kept for backward compatibility)
  selectedDatabaseId: varchar("selected_database_id"),
  selectedDatabaseName: varchar("selected_database_name"),
  // Sync settings - data types to sync
  syncReservations: boolean("sync_reservations").notNull().default(true),
  syncConfirmedTasks: boolean("sync_confirmed_tasks").notNull().default(true),
  syncTags: boolean("sync_tags").notNull().default(true),
  // Database selection for each data type
  reservationsDatabaseId: varchar("reservations_database_id"),
  reservationsDatabaseName: varchar("reservations_database_name"),
  tasksDatabaseId: varchar("tasks_database_id"),
  tasksDatabaseName: varchar("tasks_database_name"),
  tagsDatabaseId: varchar("tags_database_id"),
  tagsDatabaseName: varchar("tags_database_name"),
  // Property filter - which listings to include (null = all properties)
  propertyFilter: jsonb("property_filter").$type<string[]>(),
  // Auto-sync settings
  autoSyncEnabled: boolean("auto_sync_enabled").notNull().default(false),
  lastSyncAt: timestamp("last_sync_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertNotionConnectionSchema = createInsertSchema(notionConnections).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertNotionConnection = z.infer<typeof insertNotionConnectionSchema>;
export type NotionConnection = typeof notionConnections.$inferSelect;

// Reports - saved report configurations
export const reports = pgTable("reports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  name: varchar("name").notNull(),
  reportType: varchar("report_type").notNull(), // "staff_meeting" | "repeat_guests"
  dateRangeType: varchar("date_range_type").notNull().default("last_30_days"), // "last_7_days" | "last_30_days" | "last_90_days" | "custom"
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),
  selectedListingIds: jsonb("selected_listing_ids").$type<string[]>(),
  lastGeneratedAt: timestamp("last_generated_at"),
  aiSummary: text("ai_summary"),
  reportData: jsonb("report_data").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const reportsRelations = relations(reports, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [reports.workspaceId],
    references: [workspaces.id],
  }),
}));

export const insertReportSchema = createInsertSchema(reports).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertReport = z.infer<typeof insertReportSchema>;
export type Report = typeof reports.$inferSelect;

// Nudge Campaigns - SMS conversation campaigns to collect guest feedback
export const nudgeCampaigns = pgTable("nudge_campaigns", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  name: varchar("name").notNull(),
  description: text("description"),
  status: varchar("status").notNull().default("draft"), // draft, active, paused, completed
  triggerType: varchar("trigger_type").notNull().default("checkout"), // checkout, manual
  triggerDelayHours: integer("trigger_delay_hours").default(24), // hours after checkout to send
  initialMessage: text("initial_message").notNull(),
  aiInstructions: text("ai_instructions"), // Instructions for AI on how to handle conversation
  maxMessages: integer("max_messages").default(10), // Max AI responses per conversation
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const nudgeCampaignsRelations = relations(nudgeCampaigns, ({ many }) => ({
  conversations: many(nudgeConversations),
}));

// Nudge Conversations - Individual SMS conversations with guests
export const nudgeConversations = pgTable("nudge_conversations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  campaignId: varchar("campaign_id").notNull().references(() => nudgeCampaigns.id, { onDelete: "cascade" }),
  reservationId: varchar("reservation_id").references(() => reservations.id, { onDelete: "set null" }),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  guestName: varchar("guest_name"),
  guestPhone: varchar("guest_phone").notNull(),
  listingId: varchar("listing_id").references(() => listings.id, { onDelete: "set null" }),
  listingName: varchar("listing_name"),
  status: varchar("status").notNull().default("pending"), // pending, active, completed, opted_out
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  messageCount: integer("message_count").default(0),
  feedbackSummary: text("feedback_summary"), // AI-generated summary of guest feedback
  sentiment: varchar("sentiment"), // positive, neutral, negative
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const nudgeConversationsRelations = relations(nudgeConversations, ({ one, many }) => ({
  campaign: one(nudgeCampaigns, {
    fields: [nudgeConversations.campaignId],
    references: [nudgeCampaigns.id],
  }),
  reservation: one(reservations, {
    fields: [nudgeConversations.reservationId],
    references: [reservations.id],
  }),
  listing: one(listings, {
    fields: [nudgeConversations.listingId],
    references: [listings.id],
  }),
  messages: many(nudgeMessages),
}));

// Nudge Messages - Individual messages in a conversation
export const nudgeMessages = pgTable("nudge_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  conversationId: varchar("conversation_id").notNull().references(() => nudgeConversations.id, { onDelete: "cascade" }),
  direction: varchar("direction").notNull(), // inbound (from guest) or outbound (to guest)
  content: text("content").notNull(),
  twilioMessageId: varchar("twilio_message_id"),
  status: varchar("status").notNull().default("pending"), // pending, sent, delivered, failed
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const nudgeMessagesRelations = relations(nudgeMessages, ({ one }) => ({
  conversation: one(nudgeConversations, {
    fields: [nudgeMessages.conversationId],
    references: [nudgeConversations.id],
  }),
}));

// Insert schemas
export const insertNudgeCampaignSchema = createInsertSchema(nudgeCampaigns).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertNudgeConversationSchema = createInsertSchema(nudgeConversations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertNudgeMessageSchema = createInsertSchema(nudgeMessages).omit({
  id: true,
  createdAt: true,
});

export type InsertNudgeCampaign = z.infer<typeof insertNudgeCampaignSchema>;
export type NudgeCampaign = typeof nudgeCampaigns.$inferSelect;

export type InsertNudgeConversation = z.infer<typeof insertNudgeConversationSchema>;
export type NudgeConversation = typeof nudgeConversations.$inferSelect;

export type InsertNudgeMessage = z.infer<typeof insertNudgeMessageSchema>;
export type NudgeMessage = typeof nudgeMessages.$inferSelect;

// Extended types for UI
export interface NudgeConversationWithMessages extends NudgeConversation {
  messages: NudgeMessage[];
}

export interface NudgeCampaignWithStats extends NudgeCampaign {
  totalConversations: number;
  activeConversations: number;
  completedConversations: number;
  positiveCount: number;
  neutralCount: number;
  negativeCount: number;
}

// ============================================================
// Cleaner Scheduling System
// ============================================================

export const cleaners = pgTable("cleaners", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  type: varchar("type", { length: 20 }).notNull().default("individual"), // individual, company, cleaning_manager
  parentId: varchar("parent_id"), // links team members to their parent company
  userId: varchar("user_id"), // linked user account after invite acceptance
  inviteToken: varchar("invite_token"), // token for invite link
  email: varchar("email", { length: 255 }),
  phone: varchar("phone", { length: 50 }),
  notifyByEmail: boolean("notify_by_email").notNull().default(true),
  notifyBySms: boolean("notify_by_sms").notNull().default(true),
  reminderTiming: varchar("reminder_timing", { length: 20 }).notNull().default("morning_of"), // night_before, morning_of
  reminderTime: varchar("reminder_time", { length: 5 }).notNull().default("08:00"), // HH:mm format e.g. "08:00", "19:00"
  isActive: boolean("is_active").notNull().default(true),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const cleanersRelations = relations(cleaners, ({ one, many }) => ({
  parent: one(cleaners, {
    fields: [cleaners.parentId],
    references: [cleaners.id],
    relationName: "companyMembers",
  }),
  members: many(cleaners, { relationName: "companyMembers" }),
  assignments: many(cleanerAssignments),
  cleaningTasks: many(cleaningTasks, { relationName: "cleanerTasks" }),
  memberTasks: many(cleaningTasks, { relationName: "memberTasks" }),
}));

export const cleanerAssignments = pgTable("cleaner_assignments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  cleanerId: varchar("cleaner_id").notNull().references(() => cleaners.id, { onDelete: "cascade" }),
  listingId: varchar("listing_id").notNull().references(() => listings.id, { onDelete: "cascade" }),
  procedureId: varchar("procedure_id").references(() => procedures.id, { onDelete: "set null" }),
  assignmentMode: varchar("assignment_mode", { length: 20 }).notNull().default("manual"), // auto, manual
  defaultMemberId: varchar("default_member_id"), // member cleaner auto-assigned when assignmentMode=auto
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const cleanerAssignmentsRelations = relations(cleanerAssignments, ({ one }) => ({
  cleaner: one(cleaners, {
    fields: [cleanerAssignments.cleanerId],
    references: [cleaners.id],
  }),
  listing: one(listings, {
    fields: [cleanerAssignments.listingId],
    references: [listings.id],
  }),
  procedure: one(procedures, {
    fields: [cleanerAssignments.procedureId],
    references: [procedures.id],
  }),
}));

export const cleaningTasks = pgTable("cleaning_tasks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  cleanerId: varchar("cleaner_id").notNull().references(() => cleaners.id, { onDelete: "cascade" }),
  assignedMemberId: varchar("assigned_member_id").references(() => cleaners.id, { onDelete: "set null" }), // specific team member when cleaner is a company
  listingId: varchar("listing_id").notNull().references(() => listings.id, { onDelete: "cascade" }),
  reservationId: varchar("reservation_id").references(() => reservations.id, { onDelete: "set null" }),
  assignmentId: varchar("assignment_id").references(() => cleanerAssignments.id, { onDelete: "set null" }),
  procedureId: varchar("procedure_id").references(() => procedures.id, { onDelete: "set null" }),
  scheduledDate: timestamp("scheduled_date").notNull(),
  guestName: varchar("guest_name", { length: 255 }),
  guestCheckoutTime: varchar("guest_checkout_time", { length: 50 }),
  status: varchar("status", { length: 20 }).notNull().default("scheduled"), // scheduled, in_progress, completed, cancelled
  reminderSentAt: timestamp("reminder_sent_at"),
  reminderType: varchar("reminder_type", { length: 20 }), // email, sms, both
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  cleanerAccepted: boolean("cleaner_accepted"),
  cleanerAcceptedAt: timestamp("cleaner_accepted_at"),
  notes: text("notes"),
  accessToken: varchar("access_token", { length: 100 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const cleaningTasksRelations = relations(cleaningTasks, ({ one, many }) => ({
  cleaner: one(cleaners, {
    fields: [cleaningTasks.cleanerId],
    references: [cleaners.id],
    relationName: "cleanerTasks",
  }),
  assignedMember: one(cleaners, {
    fields: [cleaningTasks.assignedMemberId],
    references: [cleaners.id],
    relationName: "memberTasks",
  }),
  listing: one(listings, {
    fields: [cleaningTasks.listingId],
    references: [listings.id],
  }),
  reservation: one(reservations, {
    fields: [cleaningTasks.reservationId],
    references: [reservations.id],
  }),
  items: many(cleaningTaskItems),
}));

export const cleaningTaskItems = pgTable("cleaning_task_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  cleaningTaskId: varchar("cleaning_task_id").notNull().references(() => cleaningTasks.id, { onDelete: "cascade" }),
  stepOrder: integer("step_order").notNull(),
  label: varchar("label", { length: 255 }).notNull(),
  description: text("description"),
  moduleTitle: varchar("module_title", { length: 255 }),
  moduleOrder: integer("module_order"),
  requiresPhotoVerification: boolean("requires_photo_verification").notNull().default(false),
  photoVerificationMode: varchar("photo_verification_mode", { length: 20 }).notNull().default("none"),
  requiresGpsVerification: boolean("requires_gps_verification").notNull().default(false),
  isCompleted: boolean("is_completed").notNull().default(false),
  completedAt: timestamp("completed_at"),
  photoUrl: text("photo_url"),
  notes: text("notes"),
});

export const cleaningTaskItemsRelations = relations(cleaningTaskItems, ({ one }) => ({
  cleaningTask: one(cleaningTasks, {
    fields: [cleaningTaskItems.cleaningTaskId],
    references: [cleaningTasks.id],
  }),
}));

// Notification Templates for Cleaner Scheduling
export const notificationTemplates = pgTable("notification_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  type: varchar("type", { length: 50 }).notNull(), // reminder_email, reminder_sms, cancelled_email, cancelled_sms, changed_email, changed_sms
  subject: varchar("subject", { length: 500 }),
  body: text("body").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Insert schemas for Cleaner Scheduling
export const insertCleanerSchema = createInsertSchema(cleaners).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCleanerAssignmentSchema = createInsertSchema(cleanerAssignments).omit({
  id: true,
  createdAt: true,
});

export const insertCleaningTaskSchema = createInsertSchema(cleaningTasks).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCleaningTaskItemSchema = createInsertSchema(cleaningTaskItems).omit({
  id: true,
});

export const insertNotificationTemplateSchema = createInsertSchema(notificationTemplates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Types for Cleaner Scheduling
export type InsertCleaner = z.infer<typeof insertCleanerSchema>;
export type Cleaner = typeof cleaners.$inferSelect;

export type InsertCleanerAssignment = z.infer<typeof insertCleanerAssignmentSchema>;
export type CleanerAssignment = typeof cleanerAssignments.$inferSelect;

export type InsertCleaningTask = z.infer<typeof insertCleaningTaskSchema>;
export type CleaningTask = typeof cleaningTasks.$inferSelect;

export type InsertCleaningTaskItem = z.infer<typeof insertCleaningTaskItemSchema>;
export type CleaningTaskItem = typeof cleaningTaskItems.$inferSelect;

export type InsertNotificationTemplate = z.infer<typeof insertNotificationTemplateSchema>;
export type NotificationTemplate = typeof notificationTemplates.$inferSelect;

export const NOTIFICATION_TEMPLATE_TYPES = [
  "reminder_email",
  "reminder_sms",
  "cancelled_email",
  "cancelled_sms",
  "changed_email",
  "changed_sms",
] as const;

export type NotificationTemplateType = typeof NOTIFICATION_TEMPLATE_TYPES[number];

export const NOTIFICATION_SHORT_CODES = [
  { code: "{{property_name}}", description: "Property/listing name" },
  { code: "{{address}}", description: "Property address" },
  { code: "{{check_in_date}}", description: "Guest check-in date" },
  { code: "{{check_out_date}}", description: "Guest check-out date" },
  { code: "{{guest_name}}", description: "Guest name" },
  { code: "{{cleaner_name}}", description: "Cleaner's name" },
  { code: "{{checklist_link}}", description: "Link to cleaning checklist" },
  { code: "{{scheduled_date}}", description: "Scheduled cleaning date" },
] as const;

// Extended types for UI
export interface CleanerWithAssignments extends Cleaner {
  assignments: (CleanerAssignment & {
    listing?: { id: string; name: string; internalName: string | null; imageUrl: string | null; address: string | null };
    procedure?: { id: string; title: string } | null;
  })[];
  members?: Cleaner[];
}

export interface CleaningTaskWithDetails extends CleaningTask {
  cleaner: { id: string; name: string; email: string | null; phone: string | null; type?: string };
  assignedMember?: { id: string; name: string; email: string | null; phone: string | null } | null;
  listing: { id: string; name: string; internalName: string | null; imageUrl: string | null; address: string | null };
  reservation?: { id: string; status: string; checkInDate: string | null; checkOutDate: string | null; confirmationCode: string | null; platform: string } | null;
  items: CleaningTaskItem[];
}

export const reviewRemovalCases = pgTable("review_removal_cases", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  reservationId: varchar("reservation_id").references(() => reservations.id, { onDelete: "set null" }),
  listingId: varchar("listing_id").references(() => listings.id, { onDelete: "set null" }),
  userId: varchar("user_id").notNull(),
  caseNumber: varchar("case_number").notNull(),
  guestName: varchar("guest_name"),
  propertyName: varchar("property_name"),
  reviewText: text("review_text"),
  guestRating: real("guest_rating"),
  categoryRatings: jsonb("category_ratings"),
  stage: varchar("stage").notNull().default("analysis"),
  likelihood: varchar("likelihood"),
  likelihoodScore: integer("likelihood_score"),
  aiAnalysis: jsonb("ai_analysis"),
  challengeHistory: jsonb("challenge_history").default(sql`'[]'::jsonb`),
  houseRules: text("house_rules"),
  guestMessages: text("guest_messages"),
  resolutionMessages: text("resolution_messages"),
  status: varchar("status").notNull().default("open"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertReviewRemovalCaseSchema = createInsertSchema(reviewRemovalCases).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertReviewRemovalCase = z.infer<typeof insertReviewRemovalCaseSchema>;
export type ReviewRemovalCase = typeof reviewRemovalCases.$inferSelect;
