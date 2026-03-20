import { logger } from "./logger";
import { 
  dataSources, listings, listingAnalyses, users, aiPrompts, aiUsageLogs, webhookLogs,
  reservations, themes, tags, tasks, systemSettings, workspaces, workspaceMembers, reviewsSummaries,
  lumiViews, lumiQueries, teams, teamMembers, photoAnalyses, userSongs, airbnbScans, speedTestRuns,
  changelogEntries, changelogSettings,
  procedures, procedureSteps, procedureAssignments, procedureCompletions, stepCompletions,
  taskModules, taskModuleItems,
  folders, folderItems, taskAttachments, notionConnections, reports,
  DEFAULT_THEMES,
  type DataSource, type InsertDataSource,
  type Listing, type InsertListing,
  type ListingAnalysis, type InsertListingAnalysis,
  type User, type AiPrompt, type InsertAiPrompt,
  type AiUsageLog, type InsertAiUsageLog, type AiUsageLogWithUser,
  type WebhookLog, type InsertWebhookLog,
  type Reservation, type InsertReservation,
  type Theme, type InsertTheme,
  type Tag, type InsertTag,
  type Task, type InsertTask,
  type SystemSetting,
  type Workspace, type InsertWorkspace,
  type WorkspaceMember, type InsertWorkspaceMember,
  type ReviewsSummary, type InsertReviewsSummary,
  type LumiView, type InsertLumiView,
  type LumiQuery, type InsertLumiQuery,
  type Team, type InsertTeam,
  type TeamMember, type InsertTeamMember,
  type TeamWithStats, type TeamMemberWithUser,
  type PhotoAnalysis, type InsertPhotoAnalysis,
  type UserSong, type InsertUserSong,
  type AirbnbScan, type InsertAirbnbScan,
  type SpeedTestRun, type InsertSpeedTestRun,
  type ChangelogEntry, type InsertChangelogEntry,
  type ChangelogSettings, type InsertChangelogSettings,
  type Procedure, type InsertProcedure, type ProcedureWithSteps,
  type ProcedureStep, type InsertProcedureStep,
  type ProcedureAssignment, type InsertProcedureAssignment,
  type ProcedureCompletion, type InsertProcedureCompletion, type ProcedureCompletionWithDetails,
  type StepCompletion, type InsertStepCompletion,
  type TaskModule, type InsertTaskModule, type TaskModuleWithItems,
  type TaskModuleItem, type InsertTaskModuleItem,
  type Folder, type InsertFolder, type FolderWithItems,
  type FolderItem, type InsertFolderItem,
  type TaskAttachment, type InsertTaskAttachment,
  type NotionConnection, type InsertNotionConnection,
  type Report, type InsertReport,
  rolePermissions, type RolePermission, type InsertRolePermission,
  profilePhotoHistory, type ProfilePhotoHistory, type InsertProfilePhotoHistory,
  reviewRemovalCases, type ReviewRemovalCase, type InsertReviewRemovalCase,
  cleaners, cleanerAssignments, cleaningTasks, cleaningTaskItems, notificationTemplates,
  type Cleaner, type InsertCleaner, type CleanerWithAssignments,
  type CleanerAssignment, type InsertCleanerAssignment,
  type CleaningTask, type InsertCleaningTask, type CleaningTaskWithDetails,
  type CleaningTaskItem, type InsertCleaningTaskItem,
  type NotificationTemplate, type InsertNotificationTemplate,
  procedureTemplates, procedureTemplateSteps,
  type ProcedureTemplate, type InsertProcedureTemplate, type ProcedureTemplateWithSteps,
  type ProcedureTemplateStep, type InsertProcedureTemplateStep
} from "@shared/schema";
import { db, pool } from "./db";
import { eq, and, or, desc, sql, gte, lte, lt, isNull, inArray, count } from "drizzle-orm";

export interface IStorage {
  // Data Sources
  getDataSource(id: string): Promise<DataSource | undefined>;
  getDataSourcesByUser(userId: string): Promise<DataSource[]>;
  getDataSourcesByWorkspace(workspaceId: string): Promise<DataSource[]>;
  getAllDataSources(): Promise<DataSource[]>;
  createDataSource(data: InsertDataSource): Promise<DataSource>;
  updateDataSource(id: string, data: Partial<InsertDataSource>): Promise<DataSource | undefined>;
  deleteDataSource(id: string): Promise<void>;

  // Listings
  getListing(id: string): Promise<Listing | undefined>;
  getListingsByIds(ids: string[]): Promise<Listing[]>;
  getListingsByUser(userId: string): Promise<Listing[]>;
  getListingsByWorkspace(workspaceId: string): Promise<Listing[]>;
  getListingsByDataSource(dataSourceId: string): Promise<Listing[]>;
  findListingByExternalId(externalId: string): Promise<Listing | undefined>;
  createListing(data: InsertListing): Promise<Listing>;
  updateListing(id: string, data: Partial<InsertListing>): Promise<Listing | undefined>;
  deleteListing(id: string): Promise<void>;

  // Listing Analyses
  getAnalysis(id: string): Promise<ListingAnalysis | undefined>;
  getAnalysesByListing(listingId: string): Promise<ListingAnalysis[]>;
  getLatestAnalysisByListing(listingId: string): Promise<ListingAnalysis | undefined>;
  createAnalysis(data: InsertListingAnalysis): Promise<ListingAnalysis>;
  updateAnalysis(id: string, data: Partial<InsertListingAnalysis>): Promise<ListingAnalysis | undefined>;
  deleteAnalysis(id: string): Promise<void>;
  clearUserData(userId: string): Promise<void>;

  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  updateUserRole(id: string, role: string): Promise<User | undefined>;
  setDefaultWorkspace(userId: string, workspaceId: string): Promise<User | undefined>;
  getAllUsers(): Promise<User[]>;
  deleteUser(id: string): Promise<void>;

  // AI Prompts
  getPrompt(id: string): Promise<AiPrompt | undefined>;
  getPromptByName(name: string): Promise<AiPrompt | undefined>;
  getPromptByCategory(category: string): Promise<AiPrompt | undefined>;
  getPromptsByCategory(category?: string): Promise<AiPrompt[]>;
  getAllPrompts(): Promise<AiPrompt[]>;
  createPrompt(data: InsertAiPrompt): Promise<AiPrompt>;
  updatePrompt(id: string, data: Partial<InsertAiPrompt>): Promise<AiPrompt | undefined>;
  deletePrompt(id: string): Promise<void>;
  seedDefaultPrompts(): Promise<void>;

  // AI Usage Logs
  createAiUsageLog(data: InsertAiUsageLog): Promise<AiUsageLog>;
  getAllAiUsageLogs(): Promise<AiUsageLogWithUser[]>;

  // Webhook Logs
  createWebhookLog(data: InsertWebhookLog): Promise<WebhookLog>;
  getAllWebhookLogs(): Promise<WebhookLog[]>;

  // Reservations
  getReservation(id: string): Promise<Reservation | undefined>;
  getReservationsByIds(ids: string[]): Promise<Reservation[]>;
  getReservationByExternalId(listingId: string, externalId: string): Promise<Reservation | undefined>;
  findReservationByExternalId(externalId: string): Promise<Reservation | undefined>;
  getReservationsByListing(listingId: string): Promise<Reservation[]>;
  getReservationsByUser(userId: string): Promise<Reservation[]>;
  getReservationsByWorkspace(workspaceId: string): Promise<Reservation[]>;
  getUnprocessedReservations(listingId: string): Promise<Reservation[]>;
  getUnprocessedReservationCountForListings(listingIds: string[]): Promise<number>;
  getReservationsForReviewCheck(cutoffDate: Date): Promise<Reservation[]>;
  createReservation(data: InsertReservation): Promise<Reservation>;
  updateReservation(id: string, data: Partial<InsertReservation>): Promise<Reservation | undefined>;
  deleteReservation(id: string): Promise<void>;

  // Themes
  getTheme(id: string): Promise<Theme | undefined>;
  getThemesByIds(ids: string[]): Promise<Theme[]>;
  getThemesByUser(userId: string): Promise<Theme[]>;
  getThemesByWorkspace(workspaceId: string): Promise<Theme[]>;
  getThemeByName(userId: string, name: string): Promise<Theme | undefined>;
  getThemeByNameInWorkspace(workspaceId: string, name: string): Promise<Theme | undefined>;
  getUnassignedTheme(workspaceId: string): Promise<Theme | undefined>;
  getSystemThemesByWorkspace(workspaceId: string): Promise<Theme[]>;
  createTheme(data: InsertTheme): Promise<Theme>;
  updateTheme(id: string, data: Partial<InsertTheme>): Promise<Theme | undefined>;
  deleteTheme(id: string): Promise<void>;
  seedDefaultThemes(workspaceId: string, userId: string): Promise<Theme[]>;

  // Tags
  getTag(id: string): Promise<Tag | undefined>;
  getTagsByUser(userId: string): Promise<Tag[]>;
  getTagsByWorkspace(workspaceId: string): Promise<Tag[]>;
  getTagsByListing(listingId: string): Promise<Tag[]>;
  getTagsByReservation(reservationId: string): Promise<Tag[]>;
  getTagsByReservationIds(reservationIds: string[]): Promise<Map<string, Tag[]>>;
  getTagsByTheme(themeId: string): Promise<Tag[]>;
  createTag(data: InsertTag): Promise<Tag>;
  updateTag(id: string, data: Partial<InsertTag>): Promise<Tag | undefined>;
  deleteTag(id: string): Promise<void>;

  // Tasks
  getTask(id: string): Promise<Task | undefined>;
  getTasksByUser(userId: string): Promise<Task[]>;
  getTasksByWorkspace(workspaceId: string): Promise<Task[]>;
  getTasksByTag(tagId: string): Promise<Task[]>;
  createTask(data: InsertTask): Promise<Task>;
  updateTask(id: string, data: Partial<InsertTask>): Promise<Task | undefined>;
  deleteTask(id: string): Promise<void>;

  // System Settings
  getSystemSetting(key: string): Promise<SystemSetting | undefined>;
  setSystemSetting(key: string, value: string, updatedBy?: string): Promise<SystemSetting>;

  // Workspaces
  getWorkspace(id: string): Promise<Workspace | undefined>;
  getWorkspacesByUser(userId: string): Promise<Workspace[]>;
  createWorkspace(data: InsertWorkspace): Promise<Workspace>;
  updateWorkspace(id: string, data: Partial<InsertWorkspace>): Promise<Workspace | undefined>;
  deleteWorkspace(id: string): Promise<void>;

  // Workspace Members
  getWorkspaceMember(workspaceId: string, userId: string): Promise<WorkspaceMember | undefined>;
  getWorkspaceMembersByWorkspace(workspaceId: string): Promise<WorkspaceMember[]>;
  getWorkspaceMembersByUser(userId: string): Promise<WorkspaceMember[]>;
  createWorkspaceMember(data: InsertWorkspaceMember): Promise<WorkspaceMember>;
  updateWorkspaceMember(id: string, data: Partial<InsertWorkspaceMember>): Promise<WorkspaceMember | undefined>;
  deleteWorkspaceMember(id: string): Promise<void>;

  // Reviews Summaries
  getReviewsSummary(workspaceId: string, listingIdsHash: string): Promise<ReviewsSummary | undefined>;
  getReviewsSummariesByWorkspace(workspaceId: string): Promise<ReviewsSummary[]>;
  createReviewsSummary(data: InsertReviewsSummary): Promise<ReviewsSummary>;
  updateReviewsSummary(id: string, data: Partial<InsertReviewsSummary>): Promise<ReviewsSummary | undefined>;
  deleteReviewsSummary(id: string): Promise<void>;
  
  // Reservation queries with listing filters
  getReservationsByListingIds(listingIds: string[]): Promise<Reservation[]>;

  // Lumi Views
  getLumiView(id: string): Promise<LumiView | undefined>;
  getLumiViews(workspaceId: string): Promise<LumiView[]>;
  createLumiView(data: InsertLumiView): Promise<LumiView>;
  updateLumiView(id: string, data: Partial<InsertLumiView>): Promise<LumiView | undefined>;
  deleteLumiView(id: string): Promise<void>;

  // Lumi Queries
  getLumiQuery(id: string): Promise<LumiQuery | undefined>;
  getLumiQueries(workspaceId: string): Promise<LumiQuery[]>;
  getLumiQueriesByConversation(conversationId: string): Promise<LumiQuery[]>;
  createLumiQuery(data: InsertLumiQuery): Promise<LumiQuery>;
  updateLumiQuery(id: string, data: Partial<InsertLumiQuery>): Promise<LumiQuery | undefined>;
  deleteLumiQuery(id: string): Promise<void>;

  // Teams
  getTeam(id: string): Promise<Team | undefined>;
  getTeamsByWorkspace(workspaceId: string): Promise<Team[]>;
  getTeamsWithStatsByWorkspace(workspaceId: string): Promise<TeamWithStats[]>;
  createTeam(data: InsertTeam): Promise<Team>;
  updateTeam(id: string, data: Partial<InsertTeam>): Promise<Team | undefined>;
  deleteTeam(id: string): Promise<void>;

  // Team Members
  getTeamMember(id: string): Promise<TeamMember | undefined>;
  getTeamMembersByTeam(teamId: string): Promise<TeamMember[]>;
  getTeamMembersWithUserByTeam(teamId: string): Promise<TeamMemberWithUser[]>;
  getTeamMemberByUserAndTeam(userId: string, teamId: string): Promise<TeamMember | undefined>;
  getTeamMemberByInvitationToken(token: string): Promise<TeamMember | undefined>;
  createTeamMember(data: InsertTeamMember): Promise<TeamMember>;
  updateTeamMember(id: string, data: Partial<InsertTeamMember>): Promise<TeamMember | undefined>;
  acceptTeamInvitation(token: string, userId: string): Promise<TeamMember | null>;
  deleteTeamMember(id: string): Promise<void>;

  // Photo Analyses
  getPhotoAnalysis(id: string): Promise<PhotoAnalysis | undefined>;
  getPhotoAnalysesByListing(listingId: string): Promise<PhotoAnalysis[]>;
  getPhotoAnalysisByListingAndIndex(listingId: string, photoIndex: number): Promise<PhotoAnalysis | undefined>;
  createPhotoAnalysis(data: InsertPhotoAnalysis): Promise<PhotoAnalysis>;
  updatePhotoAnalysis(id: string, data: Partial<InsertPhotoAnalysis>): Promise<PhotoAnalysis | undefined>;
  deletePhotoAnalysesByListing(listingId: string): Promise<void>;

  // User Profile
  updateUserProfile(userId: string, data: { firstName?: string; lastName?: string; bio?: string; profileImageUrl?: string; originalSelfieUrl?: string | null; headshotLockedAt?: Date | null; timezone?: string }): Promise<User | undefined>;

  // Profile Photo History
  getProfilePhotoHistory(userId: string): Promise<ProfilePhotoHistory[]>;
  addProfilePhotoHistory(userId: string, imageUrl: string): Promise<ProfilePhotoHistory>;

  // User Songs
  getUserSongs(userId: string): Promise<UserSong[]>;
  getUserSong(id: string): Promise<UserSong | undefined>;
  createUserSong(data: InsertUserSong): Promise<UserSong>;
  updateUserSong(id: string, data: Partial<InsertUserSong>): Promise<UserSong | undefined>;
  markSongShared(id: string): Promise<void>;
  deleteUserSong(id: string): Promise<void>;

  // Workspace Stats
  getWorkspaceStats(workspaceId: string): Promise<{ listingCount: number; reservationCount: number; reviewCount: number } | null>;

  // Worst Guests
  getWorstGuests(workspaceId: string): Promise<{ reservationId: string; guestName: string; listingName: string; negativeTagCount: number; summary: string }[]>;

  // Airbnb Scans
  getAirbnbScan(id: string): Promise<AirbnbScan | undefined>;
  getAirbnbScanByListing(listingId: string): Promise<AirbnbScan | undefined>;
  getAirbnbScansByWorkspace(workspaceId: string): Promise<AirbnbScan[]>;
  createAirbnbScan(data: InsertAirbnbScan): Promise<AirbnbScan>;
  updateAirbnbScan(id: string, data: Partial<InsertAirbnbScan>): Promise<AirbnbScan | undefined>;

  // Speed Test Runs
  getSpeedTestRun(id: string): Promise<SpeedTestRun | undefined>;
  getSpeedTestRuns(limit?: number): Promise<SpeedTestRun[]>;
  getSpeedTestRunsByWorkspace(workspaceId: string, limit?: number): Promise<SpeedTestRun[]>;
  createSpeedTestRun(data: InsertSpeedTestRun): Promise<SpeedTestRun>;

  // Changelog Entries
  getChangelogEntry(id: string): Promise<ChangelogEntry | undefined>;
  getChangelogEntries(): Promise<ChangelogEntry[]>;
  getChangelogEntriesByStatus(status: string): Promise<ChangelogEntry[]>;
  getSentChangelogEntries(): Promise<ChangelogEntry[]>;
  createChangelogEntry(data: InsertChangelogEntry): Promise<ChangelogEntry>;
  updateChangelogEntry(id: string, data: Partial<InsertChangelogEntry>): Promise<ChangelogEntry | undefined>;
  deleteChangelogEntry(id: string): Promise<void>;

  // Changelog Settings
  getChangelogSettings(): Promise<ChangelogSettings | undefined>;
  createOrUpdateChangelogSettings(data: InsertChangelogSettings): Promise<ChangelogSettings>;

  // Procedures
  getProcedure(id: string): Promise<Procedure | undefined>;
  getProcedureWithSteps(id: string): Promise<ProcedureWithSteps | undefined>;
  getProceduresByWorkspace(workspaceId: string): Promise<Procedure[]>;
  createProcedure(data: InsertProcedure): Promise<Procedure>;
  updateProcedure(id: string, data: Partial<InsertProcedure>): Promise<Procedure | undefined>;
  deleteProcedure(id: string): Promise<void>;

  // Procedure Steps
  getProcedureStep(id: string): Promise<ProcedureStep | undefined>;
  getProcedureSteps(procedureId: string): Promise<ProcedureStep[]>;
  createProcedureStep(data: InsertProcedureStep): Promise<ProcedureStep>;
  updateProcedureStep(id: string, data: Partial<InsertProcedureStep>): Promise<ProcedureStep | undefined>;
  deleteProcedureStep(id: string): Promise<void>;
  reorderProcedureSteps(procedureId: string, stepIds: string[]): Promise<void>;

  // Procedure Assignments
  getProcedureAssignment(id: string): Promise<ProcedureAssignment | undefined>;
  getProcedureAssignmentByTask(taskId: string): Promise<ProcedureAssignment | undefined>;
  createProcedureAssignment(data: InsertProcedureAssignment): Promise<ProcedureAssignment>;
  deleteProcedureAssignment(id: string): Promise<void>;

  // Procedure Completions
  getProcedureCompletion(id: string): Promise<ProcedureCompletion | undefined>;
  getProcedureCompletionWithDetails(id: string): Promise<ProcedureCompletionWithDetails | undefined>;
  getProcedureCompletionByAssignment(procedureAssignmentId: string, userId: string): Promise<ProcedureCompletion | undefined>;
  createProcedureCompletion(data: InsertProcedureCompletion): Promise<ProcedureCompletion>;
  updateProcedureCompletion(id: string, data: Partial<InsertProcedureCompletion>): Promise<ProcedureCompletion | undefined>;

  // Step Completions
  getStepCompletion(id: string): Promise<StepCompletion | undefined>;
  getStepCompletionsByProcedureCompletion(procedureCompletionId: string): Promise<StepCompletion[]>;
  createStepCompletion(data: InsertStepCompletion): Promise<StepCompletion>;
  updateStepCompletion(id: string, data: Partial<InsertStepCompletion>): Promise<StepCompletion | undefined>;
  upsertStepCompletion(procedureCompletionId: string, procedureStepId: string, data: Partial<InsertStepCompletion>): Promise<StepCompletion>;

  // Procedure Templates
  getProcedureTemplate(): Promise<ProcedureTemplateWithSteps | null>;
  saveProcedureTemplate(data: { title: string; description?: string; updatedByUserId: string; steps: Omit<InsertProcedureTemplateStep, 'templateId'>[] }): Promise<ProcedureTemplateWithSteps>;
  seedDefaultProcedures(workspaceId: string, userId: string): Promise<void>;

  // Task Modules
  getTaskModule(id: string): Promise<TaskModule | undefined>;
  getTaskModuleWithItems(id: string): Promise<TaskModuleWithItems | undefined>;
  getTaskModulesByWorkspace(workspaceId: string): Promise<TaskModule[]>;
  getRecommendedTaskModules(workspaceId: string): Promise<TaskModule[]>;
  createTaskModule(data: InsertTaskModule): Promise<TaskModule>;
  updateTaskModule(id: string, data: Partial<InsertTaskModule>): Promise<TaskModule | undefined>;
  deleteTaskModule(id: string): Promise<void>;

  // Task Module Items
  getTaskModuleItem(id: string): Promise<TaskModuleItem | undefined>;
  getTaskModuleItems(moduleId: string): Promise<TaskModuleItem[]>;
  createTaskModuleItem(data: InsertTaskModuleItem): Promise<TaskModuleItem>;
  updateTaskModuleItem(id: string, data: Partial<InsertTaskModuleItem>): Promise<TaskModuleItem | undefined>;
  deleteTaskModuleItem(id: string): Promise<void>;
  reorderTaskModuleItems(moduleId: string, itemIds: string[]): Promise<void>;

  // Folders
  getFolders(workspaceId: string): Promise<Folder[]>;
  getFolder(id: string): Promise<Folder | undefined>;
  getFolderWithItems(id: string): Promise<FolderWithItems | undefined>;
  createFolder(data: InsertFolder): Promise<Folder>;
  updateFolder(id: string, data: Partial<InsertFolder>): Promise<Folder | undefined>;
  deleteFolder(id: string): Promise<void>;

  // Folder Items
  getFolderItems(folderId: string): Promise<FolderItem[]>;
  getAllFolderItems(workspaceId: string): Promise<(FolderItem & { folder: Folder })[]>;
  getFolderItem(id: string): Promise<FolderItem | undefined>;
  createFolderItem(data: InsertFolderItem): Promise<FolderItem>;
  updateFolderItem(id: string, data: Partial<InsertFolderItem>): Promise<FolderItem | undefined>;
  deleteFolderItem(id: string): Promise<void>;

  // Task Attachments
  getTaskAttachment(id: string): Promise<TaskAttachment | undefined>;
  getTaskAttachments(taskId: string): Promise<(TaskAttachment & { folderItem: FolderItem & { folder: Folder } })[]>;
  getTaskAttachmentsByItem(folderItemId: string): Promise<TaskAttachment[]>;
  createTaskAttachment(data: InsertTaskAttachment): Promise<TaskAttachment>;
  deleteTaskAttachment(id: string): Promise<void>;

  // Notion Connections
  getNotionConnection(id: string): Promise<NotionConnection | undefined>;
  getNotionConnectionByWorkspace(workspaceId: string): Promise<NotionConnection | undefined>;
  getNotionConnectionByBotId(botId: string): Promise<NotionConnection | undefined>;
  createNotionConnection(data: InsertNotionConnection): Promise<NotionConnection>;
  updateNotionConnection(id: string, data: Partial<InsertNotionConnection>): Promise<NotionConnection | undefined>;
  deleteNotionConnection(id: string): Promise<void>;

  // Reports
  getReport(id: string): Promise<Report | undefined>;
  getReportsByWorkspace(workspaceId: string): Promise<Report[]>;
  createReport(data: InsertReport): Promise<Report>;
  updateReport(id: string, data: Partial<InsertReport>): Promise<Report | undefined>;
  deleteReport(id: string): Promise<void>;

  // Role Permissions
  getRolePermissions(): Promise<RolePermission[]>;
  getRolePermissionsByRole(role: string): Promise<RolePermission[]>;
  getRolePermission(role: string, navItemId: string): Promise<RolePermission | undefined>;
  upsertRolePermission(role: string, navItemId: string, enabled: boolean): Promise<RolePermission>;
  initializeDefaultPermissions(navItemIds: string[]): Promise<void>;

  // Notification Templates
  getNotificationTemplatesByWorkspace(workspaceId: string): Promise<NotificationTemplate[]>;
  getNotificationTemplate(workspaceId: string, type: string): Promise<NotificationTemplate | undefined>;
  upsertNotificationTemplate(data: InsertNotificationTemplate): Promise<NotificationTemplate>;
  deleteNotificationTemplate(id: string): Promise<void>;

  // Cleaning Task lookups
  getCleaningTasksByReservationId(reservationId: string): Promise<CleaningTaskWithDetails[]>;

  // Review Removal Cases
  getReviewRemovalCase(id: string): Promise<ReviewRemovalCase | undefined>;
  getReviewRemovalCasesByWorkspace(workspaceId: string): Promise<ReviewRemovalCase[]>;
  getReviewRemovalCaseByReservation(reservationId: string): Promise<ReviewRemovalCase | undefined>;
  createReviewRemovalCase(data: InsertReviewRemovalCase): Promise<ReviewRemovalCase>;
  updateReviewRemovalCase(id: string, data: Partial<InsertReviewRemovalCase>): Promise<ReviewRemovalCase | undefined>;
  deleteReviewRemovalCase(id: string): Promise<boolean>;
}

export class DatabaseStorage implements IStorage {
  // Data Sources
  async getDataSource(id: string): Promise<DataSource | undefined> {
    const [dataSource] = await db.select().from(dataSources).where(eq(dataSources.id, id));
    return dataSource;
  }

  async getDataSourcesByUser(userId: string): Promise<DataSource[]> {
    return db.select().from(dataSources).where(eq(dataSources.userId, userId)).orderBy(dataSources.createdAt);
  }

  async getDataSourcesByWorkspace(workspaceId: string): Promise<DataSource[]> {
    return db.select().from(dataSources).where(eq(dataSources.workspaceId, workspaceId)).orderBy(dataSources.createdAt);
  }

  async getAllDataSources(): Promise<DataSource[]> {
    return db.select().from(dataSources);
  }

  async createDataSource(data: InsertDataSource): Promise<DataSource> {
    const [dataSource] = await db.insert(dataSources).values(data).returning();
    return dataSource;
  }

  async updateDataSource(id: string, data: Partial<InsertDataSource>): Promise<DataSource | undefined> {
    const [dataSource] = await db
      .update(dataSources)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(dataSources.id, id))
      .returning();
    return dataSource;
  }

  async deleteDataSource(id: string): Promise<void> {
    await db.delete(dataSources).where(eq(dataSources.id, id));
  }

  // Listings
  async getListing(id: string): Promise<Listing | undefined> {
    const [listing] = await db.select().from(listings).where(eq(listings.id, id));
    return listing;
  }

  async getListingsByIds(ids: string[]): Promise<Listing[]> {
    if (ids.length === 0) return [];
    return db.select().from(listings).where(inArray(listings.id, ids));
  }

  async getListingsByUser(userId: string): Promise<Listing[]> {
    return db.select().from(listings).where(eq(listings.userId, userId));
  }

  async getListingsByWorkspace(workspaceId: string): Promise<Listing[]> {
    return db.select().from(listings).where(eq(listings.workspaceId, workspaceId));
  }

  async getListingsByDataSource(dataSourceId: string): Promise<Listing[]> {
    return db.select().from(listings).where(eq(listings.dataSourceId, dataSourceId));
  }

  async findListingByExternalId(externalId: string): Promise<Listing | undefined> {
    const [listing] = await db.select().from(listings).where(eq(listings.externalId, externalId));
    return listing;
  }

  async createListing(data: InsertListing): Promise<Listing> {
    const [listing] = await db.insert(listings).values(data).returning();
    return listing;
  }

  async updateListing(id: string, data: Partial<InsertListing>): Promise<Listing | undefined> {
    const [listing] = await db
      .update(listings)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(listings.id, id))
      .returning();
    return listing;
  }

  async deleteListing(id: string): Promise<void> {
    // Delete associated data first to respect dependencies
    await db.delete(tasks).where(eq(tasks.listingId, id));
    await db.delete(tags).where(eq(tags.listingId, id));
    await db.delete(reservations).where(eq(reservations.listingId, id));
    await db.delete(listingAnalyses).where(eq(listingAnalyses.listingId, id));
    await db.delete(listings).where(eq(listings.id, id));
  }

  // Listing Analyses
  async getAnalysis(id: string): Promise<ListingAnalysis | undefined> {
    const [analysis] = await db.select().from(listingAnalyses).where(eq(listingAnalyses.id, id));
    return analysis;
  }

  async getAnalysesByListing(listingId: string): Promise<ListingAnalysis[]> {
    return db
      .select()
      .from(listingAnalyses)
      .where(eq(listingAnalyses.listingId, listingId))
      .orderBy(desc(listingAnalyses.analyzedAt));
  }

  async getLatestAnalysisByListing(listingId: string): Promise<ListingAnalysis | undefined> {
    const [analysis] = await db
      .select()
      .from(listingAnalyses)
      .where(eq(listingAnalyses.listingId, listingId))
      .orderBy(desc(listingAnalyses.analyzedAt))
      .limit(1);
    return analysis;
  }

  async createAnalysis(data: InsertListingAnalysis): Promise<ListingAnalysis> {
    const [analysis] = await db.insert(listingAnalyses).values(data).returning();
    return analysis;
  }

  async updateAnalysis(id: string, data: Partial<InsertListingAnalysis>): Promise<ListingAnalysis | undefined> {
    const [analysis] = await db
      .update(listingAnalyses)
      .set(data)
      .where(eq(listingAnalyses.id, id))
      .returning();
    return analysis;
  }

  async deleteAnalysis(id: string): Promise<void> {
    await db.delete(listingAnalyses).where(eq(listingAnalyses.id, id));
  }

  async clearUserData(userId: string): Promise<void> {
    // Get all workspaces the user owns to clear workspace-scoped data
    const userWorkspaces = await db.select().from(workspaces).where(eq(workspaces.createdBy, userId));
    const workspaceIds = userWorkspaces.map(w => w.id);
    
    // Delete in order respecting foreign key dependencies:
    // 1. Tasks (depends on themes, tags)
    // 2. Tags (depends on reservations, themes)
    // 3. Reviews summaries (workspace-scoped)
    // 4. Reservations (depends on listings)
    // 5. Themes - reset summaries since they reference deleted tags (pre-seeded themes are kept)
    // 6. Analyses (depends on listings)
    // 7. Listings (depends on data sources)
    // NOTE: Data sources are NOT deleted to preserve Hospitable connection
    // NOTE: Workspaces are NOT deleted to preserve workspace structure
    
    // Delete by userId first
    await db.delete(tasks).where(eq(tasks.userId, userId));
    await db.delete(tags).where(eq(tags.userId, userId));
    await db.delete(reservations).where(eq(reservations.userId, userId));
    await db.delete(listingAnalyses).where(eq(listingAnalyses.userId, userId));
    await db.delete(listings).where(eq(listings.userId, userId));
    // Reset theme summaries (stats are computed dynamically from tags)
    await db.update(themes).set({ 
      summary: null, 
      summaryTagCount: null,
      updatedAt: new Date()
    }).where(eq(themes.userId, userId));
    // NOTE: Do NOT delete dataSources - this keeps Hospitable connection intact
    
    // Also delete workspace-scoped data for the user's workspaces
    for (const workspaceId of workspaceIds) {
      await db.delete(tasks).where(eq(tasks.workspaceId, workspaceId));
      await db.delete(tags).where(eq(tags.workspaceId, workspaceId));
      await db.delete(reviewsSummaries).where(eq(reviewsSummaries.workspaceId, workspaceId));
      await db.delete(reservations).where(eq(reservations.workspaceId, workspaceId));
      await db.delete(listingAnalyses).where(eq(listingAnalyses.workspaceId, workspaceId));
      await db.delete(listings).where(eq(listings.workspaceId, workspaceId));
      // Reset theme summaries for this workspace
      await db.update(themes).set({ 
        summary: null, 
        summaryTagCount: null,
        updatedAt: new Date()
      }).where(eq(themes.workspaceId, workspaceId));
      // NOTE: Do NOT delete dataSources - this keeps Hospitable connection intact
    }
    
    // NOTE: Do NOT delete workspace memberships or workspaces - keep workspace structure
  }

  // Users
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async updateUserRole(id: string, role: string): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set({ role, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async setDefaultWorkspace(userId: string, workspaceId: string): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set({ defaultWorkspaceId: workspaceId, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();
    return user;
  }

  async getAllUsers(): Promise<User[]> {
    return db.select().from(users).orderBy(desc(users.createdAt));
  }

  async deleteUser(id: string): Promise<void> {
    await db.delete(users).where(eq(users.id, id));
  }

  // AI Prompts
  async getPrompt(id: string): Promise<AiPrompt | undefined> {
    const [prompt] = await db.select().from(aiPrompts).where(eq(aiPrompts.id, id));
    return prompt;
  }

  async getPromptByName(name: string): Promise<AiPrompt | undefined> {
    const [prompt] = await db.select().from(aiPrompts).where(eq(aiPrompts.name, name));
    return prompt;
  }

  async getPromptByCategory(category: string): Promise<AiPrompt | undefined> {
    try {
      const [prompt] = await db.select().from(aiPrompts).where(eq(aiPrompts.category, category));
      if (prompt) return prompt;
    } catch (err) {
      logger.error('Storage', `getPromptByCategory Drizzle query failed for "${category}":`, err);
    }
    try {
      const rawResult = await pool.query(
        'SELECT id, name, description, prompt_template, is_active, created_by, updated_by, created_at, updated_at, model_id, category, system_prompt, version FROM ai_prompts WHERE category = $1 LIMIT 1',
        [category]
      );
      if (rawResult.rows.length > 0) {
        const row = rawResult.rows[0];
        logger.info('Storage', `getPromptByCategory: raw SQL found prompt for "${category}" (Drizzle missed it)`);
        return {
          id: row.id,
          name: row.name,
          description: row.description,
          promptTemplate: row.prompt_template,
          isActive: row.is_active,
          createdBy: row.created_by,
          updatedBy: row.updated_by,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          modelId: row.model_id,
          category: row.category,
          systemPrompt: row.system_prompt,
          version: row.version,
        };
      }
      const countResult = await pool.query('SELECT count(*) as cnt FROM ai_prompts');
      const catsResult = await pool.query('SELECT category FROM ai_prompts WHERE category IS NOT NULL');
      logger.error('Storage', `getPromptByCategory: raw SQL also found no prompt for "${category}". Total rows: ${countResult.rows[0]?.cnt}, categories: ${catsResult.rows.map((r: any) => r.category).join(', ')}`);
    } catch (err) {
      logger.error('Storage', `getPromptByCategory raw SQL fallback failed for "${category}":`, err);
    }
    return undefined;
  }

  async getPromptsByCategory(category?: string): Promise<AiPrompt[]> {
    if (category) {
      return db.select().from(aiPrompts).where(eq(aiPrompts.category, category)).orderBy(desc(aiPrompts.updatedAt));
    }
    return db.select().from(aiPrompts).orderBy(aiPrompts.category, desc(aiPrompts.updatedAt));
  }

  async getAllPrompts(): Promise<AiPrompt[]> {
    return db.select().from(aiPrompts).orderBy(desc(aiPrompts.updatedAt));
  }

  async createPrompt(data: InsertAiPrompt): Promise<AiPrompt> {
    const [prompt] = await db.insert(aiPrompts).values(data).returning();
    return prompt;
  }

  async updatePrompt(id: string, data: Partial<InsertAiPrompt>): Promise<AiPrompt | undefined> {
    const [prompt] = await db
      .update(aiPrompts)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(aiPrompts.id, id))
      .returning();
    return prompt;
  }

  async deletePrompt(id: string): Promise<void> {
    await db.delete(aiPrompts).where(eq(aiPrompts.id, id));
  }

  async seedDefaultPrompts(): Promise<void> {
    const defaultPrompts = [
      {
        name: "Photos Analysis",
        category: "photos",
        description: "Analyzes listing photos for quality, variety, and appeal",
        systemPrompt: `You are an expert vacation rental photographer and marketing consultant. Analyze the listing photos to evaluate quality, composition, lighting, and marketing appeal. Consider:
- Hero/cover photo effectiveness
- Photo variety (exterior, interior, amenities, bedrooms, bathrooms, outdoor spaces)
- Image quality and resolution
- Staging and cleanliness
- Whether photos match the Ideal Guest Profile expectations`,
        promptTemplate: `Analyze these {{photo_count}} photos for the listing "{{listing_name}}":
Photos: {{photo_urls}}

Ideal Guest Profile: {{ideal_guest_profile}}

Provide:
1. Grade (A-F) with score (0-100)
2. Hero photo analysis
3. Top 5 photo analysis
4. Identify any low-resolution or poor-quality images
5. Positive aspects (bullet points)
6. Areas needing improvement (bullet points)
7. Specific suggestions for better photos

Format response as JSON.`,
        isActive: "true",
      },
      {
        name: "Listing Title Analysis",
        category: "title",
        description: "Analyzes listing title effectiveness and appeal",
        systemPrompt: `You are a vacation rental marketing expert specializing in Airbnb listing optimization. Evaluate the listing title for:
- Clarity and descriptiveness
- Appeal to target guests
- Use of key selling points
- Character efficiency (max 50 characters ideal)
- Keyword optimization`,
        promptTemplate: `Analyze this listing title for "{{listing_name}}":
Title: "{{listing_title}}"

Property details: {{bedrooms}} bedrooms, {{bathrooms}} bathrooms
Amenities: {{amenities}}
Ideal Guest Profile: {{ideal_guest_profile}}

Provide:
1. Grade (A-F) with score (0-100)
2. Detailed feedback on title effectiveness
3. What works well
4. What could be improved
5. Suggestions for improvement

Format response as JSON.`,
        isActive: "true",
      },
      {
        name: "Title Generator",
        category: "title_generator",
        description: "Generates 10 optimized listing title suggestions",
        systemPrompt: `You are an expert Airbnb listing copywriter. Generate compelling, SEO-optimized listing titles that appeal to the target guest profile. Titles must:
- Be 50 characters or less
- Highlight unique selling points
- Appeal to the ideal guest profile
- Be descriptive but concise
- Use power words that drive bookings`,
        promptTemplate: `Generate 10 listing title options for "{{listing_name}}":

Property details: {{bedrooms}} bedrooms, {{bathrooms}} bathrooms
Location: {{address}}
Amenities: {{amenities}}
Current title: "{{listing_title}}"
Ideal Guest Profile: {{ideal_guest_profile}}
Guest preferences from reviews: {{guest_preferences}}

Generate 10 unique titles (each 50 characters max) with reasoning tied to the Ideal Guest Profile.

Format as JSON array: [{"title": "...", "reasoning": "..."}, ...]`,
        isActive: "true",
      },
      {
        name: "Reviews Analysis",
        category: "reviews",
        description: "Analyzes review sentiment and patterns",
        systemPrompt: `You are a hospitality analytics expert. Analyze guest reviews to identify:
- Overall sentiment and satisfaction
- Common themes and patterns
- Strengths mentioned repeatedly
- Areas of concern or complaints
- Insights about guest demographics and preferences`,
        promptTemplate: `Analyze these {{review_count}} reviews for "{{listing_name}}":

Reviews: {{reviews}}

Ideal Guest Profile: {{ideal_guest_profile}}

Provide:
1. Grade (A-F) with score (0-100)
2. Sentiment summary
3. Key positive themes
4. Areas of concern
5. Guest demographic insights
6. Suggestions for improvement

Format response as JSON.`,
        isActive: "true",
      },
      {
        name: "Pet Friendly Analysis",
        category: "pet_friendly",
        description: "Evaluates pet-friendliness and pet owner appeal",
        systemPrompt: `You are a pet travel expert and vacation rental consultant. Evaluate listings for pet-friendliness.

CRITICAL RULE: The "Pets Allowed" field in the listing data is the authoritative source. Check this FIRST.
- If Pets Allowed = "No" → Grade is F (pets not welcome)
- If Pets Allowed = "Yes" → Baseline grade is C, then evaluate amenities and marketing
- If Pets Allowed = "Unknown" → Assume pets are NOT allowed, grade is F

For pet-friendly listings, evaluate:
- Pet-specific amenities (fenced yard, pet bowls, beds, etc.)
- Marketing appeal to pet owners
- Safety considerations for pets
- Whether the listing description highlights pet features`,
        promptTemplate: `Analyze pet-friendliness for "{{listing_name}}":

Pets Allowed: {{pets_allowed}}
Amenities: {{amenities}}
Description: {{description}}

IMPORTANT: Check "Pets Allowed" field first - this is the definitive answer.
- If Pets Allowed is "No" or "Unknown", grade MUST be F.
- If Pets Allowed is "Yes", baseline grade is C. Then evaluate amenities and marketing for higher grades.

Provide:
1. Grade (A-F) with score (0-100)
2. Pet policy assessment (based on Pets Allowed field)
3. Pet amenities found (only relevant if pets are allowed)
4. Marketing appeal to pet owners
5. Suggestions to improve pet-friendliness

Format response as JSON.`,
        isActive: "true",
      },
      {
        name: "Description Analysis",
        category: "description",
        description: "Analyzes listing description quality and completeness",
        systemPrompt: `You are a professional copywriter specializing in vacation rental listings. Evaluate the listing description for:
- Clarity and readability
- Completeness of property information
- Appeal to target guests
- Use of sensory language
- Call-to-action effectiveness
- SEO keyword optimization`,
        promptTemplate: `Analyze the description for "{{listing_name}}":

Description: {{description}}

Property details: {{bedrooms}} bedrooms, {{bathrooms}} bathrooms
Amenities: {{amenities}}
Ideal Guest Profile: {{ideal_guest_profile}}

Provide:
1. Grade (A-F) with score (0-100)
2. Description quality assessment
3. What works well
4. What's missing
5. Suggestions for improvement

Format response as JSON.`,
        isActive: "true",
      },
      {
        name: "Description Generator",
        category: "description_generator",
        description: "Generates About (500 chars) and The Space (1500 chars) content",
        systemPrompt: `You are an expert Airbnb copywriter. Generate compelling listing descriptions that:
- Appeal to the ideal guest profile
- Highlight unique selling points
- Use sensory language
- Include all relevant property details
- Drive bookings with emotional appeal

About section (500 characters max): General overview of listing and experience, tied to Ideal Guest Profile.

The Space section (1500 characters max): Detailed breakdown by room/area including:
- Bedrooms & Sleeping arrangements
- Parking
- Living Spaces
- Outdoor Space
- Top 10 nearby attractions with approximate drive time`,
        promptTemplate: `Generate descriptions for "{{listing_name}}":

Property details: {{bedrooms}} bedrooms, {{bathrooms}} bathrooms
Location: {{address}}
Amenities: {{amenities}}
Current description: {{description}}
Ideal Guest Profile: {{ideal_guest_profile}}
Guest preferences from reviews: {{guest_preferences}}

Generate:
1. "About" section (max 500 characters) - general overview tied to Ideal Guest Profile
2. "The Space" section (max 1500 characters) - detailed breakdown with sections for:
   - Bedrooms & Sleeping
   - Parking
   - Living Spaces
   - Outdoor Space
   - Nearby Attractions (top 10 with drive times)

Format as JSON: {"about": "...", "theSpace": "..."}`,
        isActive: "true",
      },
      {
        name: "Where You'll Sleep Analysis",
        category: "sleep",
        description: "Analyzes sleeping arrangements and bedroom quality (requires Airbnb URL)",
        systemPrompt: `You are a hospitality expert evaluating sleeping accommodations. Analyze:
- Bed quality and types
- Bedroom count accuracy
- Sleeping capacity
- Bedroom amenities (linens, pillows, blackout curtains)
- Privacy and comfort considerations`,
        promptTemplate: `Analyze sleeping arrangements for "{{listing_name}}":

[This analysis requires data from the Airbnb listing page]

Provide:
1. Grade (A-F) with score (0-100)
2. Sleeping arrangement assessment
3. Bed quality evaluation
4. Suggestions for improvement

Format response as JSON.`,
        isActive: "true",
      },
      {
        name: "Host Profile Analysis",
        category: "host_profile",
        description: "Analyzes host profile quality and trust factors (requires Airbnb URL)",
        systemPrompt: `You are a hospitality consultant evaluating host profiles. Analyze:
- Profile completeness
- Response rate and time
- Review count and ratings
- Verification status
- Communication style`,
        promptTemplate: `Analyze host profile for "{{listing_name}}":

[This analysis requires data from the Airbnb listing page]

Provide:
1. Grade (A-F) with score (0-100)
2. Profile completeness assessment
3. Trust factors evaluation
4. Suggestions for improvement

Format response as JSON.`,
        isActive: "true",
      },
      {
        name: "Guest Favorites Analysis",
        category: "guest_favorites",
        description: "Analyzes guest favorite badges and recognition (requires Airbnb URL)",
        systemPrompt: `You are an Airbnb analytics expert evaluating guest favorite status. Analyze:
- Guest Favorite badge status
- Category recognition
- Rating patterns
- What makes this listing stand out`,
        promptTemplate: `Analyze Guest Favorites status for "{{listing_name}}":

[This analysis requires data from the Airbnb listing page]

Provide:
1. Grade (A-F) with score (0-100)
2. Guest Favorite status assessment
3. Category performance
4. Suggestions to achieve/maintain status

Format response as JSON.`,
        isActive: "true",
      },
      {
        name: "Superhost Analysis",
        category: "superhost",
        description: "Analyzes Superhost status and eligibility (requires Airbnb URL)",
        systemPrompt: `You are an Airbnb Superhost consultant. Evaluate:
- Current Superhost status
- Eligibility criteria performance
- Response rate
- Cancellation rate
- Review scores`,
        promptTemplate: `Analyze Superhost status for "{{listing_name}}":

[This analysis requires data from the Airbnb listing page]

Provide:
1. Grade (A-F) with score (0-100)
2. Superhost status assessment
3. Criteria performance evaluation
4. Suggestions to achieve/maintain Superhost

Format response as JSON.`,
        isActive: "true",
      },
      {
        name: "Ideal Guest Profile Alignment",
        category: "ideal_alignment",
        description: "Scores how well listing content aligns with guest insights",
        systemPrompt: `You are a vacation rental marketing strategist. Evaluate how well the listing's title, description, and photos align with the Ideal Guest Profile insights. Consider:
- Are unique selling points from reviews highlighted in the listing?
- Does the description appeal to the identified guest demographics?
- Do photos showcase features guests rave about?
- Are there missed opportunities to highlight popular features?`,
        promptTemplate: `Analyze Ideal Guest Profile alignment for "{{listing_name}}":

Title: "{{listing_title}}"
Description: {{description}}
Photo count: {{photo_count}}
Amenities: {{amenities}}

Ideal Guest Profile: {{ideal_guest_profile}}
Key themes from reviews: {{review_themes}}
Guest preferences: {{guest_preferences}}

Evaluate alignment between listing content and guest insights.

Provide:
1. Grade (A-F) with score (0-100)
2. Alignment assessment
3. Features well-highlighted
4. Missed opportunities (features guests love but not promoted)
5. Specific recommendations to improve alignment

Format response as JSON.`,
        isActive: "true",
      },
      {
        name: "Reservation Tag Analysis",
        category: "reservation_analysis",
        description: "Extracts actionable Tags from reservation data (reviews, messages) and assigns to Themes",
        systemPrompt: `You are an expert short-term rental consultant. Analyze guest reservations and extract ACTIONABLE insights as Tags.

⚡️ KEY RULES:
* Generate a tag ONLY if there is a CLEAR, CONCRETE, OWNER-ADDRESSABLE action a property manager should take.
* If there are NO actionable items for a reservation, return "tags": [] - this is perfectly valid and preferred over false positives.
* Do NOT infer actions that are not grounded in the text. Use ONLY the provided context.
* Each tag MUST include verbatimEvidence with an EXACT quote from the source data.

🎯 ACTIONABILITY RUBRIC (apply strictly):
✅ ACTIONABLE - Create a tag for these:
- Fix/inspect/replace/clean something
- Schedule/communicate/update something
- Refund/credit situations
- Recognize staff behavior worth reinforcing
- Questions revealing unclear info (use "question" sentiment)

❌ NOT ACTIONABLE - Do NOT create tags for these:
- Pure praise without follow-up: "Great stay!" "Loved it!"
- Generic thanks, vague sentiments, small talk
- Trip purposes: "Wedding Trip", "Business Travel", etc.
- Guest demographics: "Mature Group", "Young Couple", etc.
- Arrival/departure logistics, booking confirmations`,
        promptTemplate: `Analyze these reservations and extract actionable Tags:

AVAILABLE THEMES (assign each tag to one of these):
{{existingThemes}}

RESERVATIONS TO ANALYZE:
{{reservationsContext}}

For each reservation, provide a JSON response:
{
  "reservations": [
    {
      "reservationId": "<reservation id>",
      "tags": [
        {
          "name": "<short descriptive tag name, 2-4 words>",
          "sentiment": "positive|negative|neutral|question",
          "priority": "low|medium|high|critical",
          "summary": "<1-2 sentence explanation>",
          "verbatimEvidence": "<EXACT quote from source>",
          "sourceType": "review|message",
          "sourceId": "<ID of source>",
          "themeName": "<theme name from list above>",
          "suggestedTaskTitle": "<actionable task, max 100 chars, or null>",
          "suggestedTaskDescription": "<task description or null>"
        }
      ]
    }
  ]
}

RULES:
- Include EVERY reservation ID in response (with empty tags [] if no actionable items)
- Empty tags array is valid and preferred over false positives
- For NEGATIVE tags: always include suggestedTaskTitle with specific action`,
        isActive: "true",
      },
      {
        name: "Sentiment Score Analysis",
        category: "sentiment_analysis",
        description: "Calculates AI Sentiment scores for reservations using reviews, messages, and tag context",
        systemPrompt: `You are an expert hospitality analyst. Calculate sentiment scores for guest reservations based on:
- Public reviews and ratings
- Private feedback/remarks
- Guest conversation tone and content
- Previously extracted tags (if available)

Scoring Guide:
- 0 = Extremely Negative (serious complaints, refund demands)
- 1 = Very Negative (major issues, unhappy guest)
- 2 = Negative (notable problems, disappointment)
- 3 = Neutral (mixed or no strong sentiment)
- 4 = Positive (satisfied, good experience)
- 5 = Very Positive (enthusiastic praise, raving reviews)

The overall score may be a decimal (e.g., 3.4) for nuance. Other scores should be integers or null if data is unavailable.`,
        promptTemplate: `Calculate sentiment scores for these reservations:

RESERVATIONS TO ANALYZE:
{{reservationsContext}}

TAG CONTEXT (previously extracted insights):
{{tagContext}}

For each reservation, provide a JSON response:
{
  "reservations": [
    {
      "reservationId": "<reservation id>",
      "sentimentScores": {
        "overall": <0-5 with 0.1 increments>,
        "publicReview": <0-5 or null if no review>,
        "privateRemarks": <0-5 or null if no remarks>,
        "conversation": <0-5 based on message tone>,
        "summary": "<1-2 sentence summary of guest experience>"
      }
    }
  ]
}

RULES:
- Include EVERY reservation ID in response
- Use tag context to inform scoring when available
- overall score should reflect holistic view across all data sources
- Set scores to null if that data type is not available`,
        isActive: "true",
      },
      {
        name: "Ideal Guest Profile Analysis",
        category: "igp_analysis",
        description: "Stage 1: Creates Ideal Guest Profile from reservation data (reviews, messages, private remarks)",
        systemPrompt: `You are an expert hospitality analyst specializing in guest profiling. Your task is to create a comprehensive Ideal Guest Profile by analyzing:
- Public reviews and ratings
- Private remarks from hosts
- Guest conversation messages (requests, questions, feedback)
- Listing details and amenities

The profile should identify WHO books this property, WHY they choose it, and WHAT they value most.`,
        promptTemplate: `Create an Ideal Guest Profile for "{{listing_name}}":

LISTING DETAILS:
Location: {{location}}
Bedrooms: {{bedrooms}} | Bathrooms: {{bathrooms}}
Max Guests: {{max_guests}}
Property Type: {{property_type}}
Amenities: {{amenities}}

RESERVATION DATA ({{reservation_count}} reservations):
{{reservations_context}}

Analyze the data to identify:
1. Guest Demographics - Who typically books (families, couples, business travelers, groups)
2. Travel Purposes - Why they visit (vacation, work, events, visiting family)
3. Key Decision Factors - What made them choose this property
4. Common Praise Points - Features guests consistently love
5. Pain Points - Recurring complaints or concerns
6. Seasonal Patterns - Peak booking times and reasons
7. Guest Preferences - What guests value or prefer (amenities, location, style)
8. Unique Selling Points - What makes this property stand out

Return JSON:
{
  "guestTypes": [
    {"name": "Type Name", "percentage": 40, "description": "Brief description"}
  ],
  "travelPurposes": ["purpose1", "purpose2"],
  "keyDecisionFactors": ["factor1", "factor2"],
  "topPraisePoints": ["praise1", "praise2"],
  "painPoints": ["issue1", "issue2"],
  "seasonalPatterns": ["pattern1", "pattern2"],
  "guestPreferences": ["preference1", "preference2"],
  "uniqueSellingPoints": ["usp1", "usp2"],
  "summary": "2-3 sentence executive summary of the ideal guest",
  "targetMarketingMessage": "One compelling sentence to attract ideal guests",
  "reservationBreakdown": [
    {"guestName": "Guest Name", "checkIn": "YYYY-MM-DD", "checkOut": "YYYY-MM-DD", "summary": "1-2 sentence summary of what we learned from this reservation", "matchedProfile": "Family Travelers"}
  ]
}

RESERVATION BREAKDOWN RULES:
- After determining the top guest types, map EACH reservation to one of those types or "Other" if it doesn't clearly fit
- Keep summaries concise (1-2 sentences) focusing on what was learned about the guest's needs, preferences, and experience
- For reservations with no messages/reviews, still provide a brief summary based on available data (dates, guest count, etc.)
- "matchedProfile" must use the exact "name" from your guestTypes array, or "Other"`,
        isActive: "true",
      },
      {
        name: "Conversation Response Analysis",
        category: "conversation_response",
        description: "Analyzes guest conversations to identify questions requiring responses and host replies",
        systemPrompt: `You are an expert hospitality communication analyst. Your task is to analyze guest-host conversations and identify:
1. Guest Questions - Any message from the guest that is a question (has "?") OR a statement that warrants/expects a response from the host
2. Host Replies - The first host message that responds to each guest question

This analysis is used to calculate response times and identify communication patterns.`,
        promptTemplate: `Analyze this conversation between a guest and host for the reservation:

Guest: {{guest_name}}
Check-in: {{check_in_date}}
Check-out: {{check_out_date}}

CONVERSATION:
{{conversation_messages}}

For each message, determine:
1. Is it a Guest Question? (explicit question with "?" OR statement expecting/warranting a reply)
2. If it's a Host Reply, which Guest Question(s) does it address?

Return JSON:
{
  "questions": [
    {
      "messageId": "message_id_here",
      "timestamp": "ISO timestamp",
      "message": "Brief excerpt (first 100 chars)",
      "questionType": "explicit" | "implicit",
      "urgency": "high" | "medium" | "low"
    }
  ],
  "replies": [
    {
      "messageId": "message_id_here",
      "timestamp": "ISO timestamp",
      "respondsToQuestionId": "question_message_id",
      "responseTimeMinutes": 45
    }
  ],
  "unansweredQuestions": ["message_id1", "message_id2"],
  "averageResponseTimeMinutes": 30,
  "communicationSummary": "Brief summary of host responsiveness"
}

Rules:
- Only include messages that are genuine questions or warrant responses
- Skip greetings, thank-you messages, and confirmations
- Calculate responseTimeMinutes as time between question and reply
- Flag urgent questions (check-in issues, problems, complaints) as "high" urgency`,
        isActive: "true",
      },
      {
        name: "Theme Summary Generation",
        category: "theme_summary",
        description: "Generates natural language summaries for themes with 5+ tags",
        systemPrompt: `You are an expert short-term rental consultant. Generate concise, actionable summaries that help hosts understand patterns in guest feedback.`,
        promptTemplate: `Generate a summary for this theme:

Theme: {{themeName}}
Total Tags: {{totalTags}}
Sentiment Breakdown: {{sentimentCounts}}

Tags in this theme:
{{tagContext}}

Write a 2-3 sentence summary that:
1. Captures the main topics guests mention
2. Highlights whether feedback is mostly positive, negative, or mixed
3. Gives the host a quick understanding of patterns

Write in third person about "guests". Be specific and actionable.`,
        isActive: "true",
      },
      {
        name: "Review Removal Agent",
        category: "review_removal",
        description: "Analyzes bad reviews for potential removal and guides hosts through the challenge process using Airbnb's own Terms of Service",
        systemPrompt: `You are an expert Airbnb review dispute specialist. Your job is to help hosts challenge unfair reviews using Airbnb's own policies.

CRITICAL FORMATTING RULE: NEVER use markdown formatting in any output. No **, no ##, no *, no bullet markers, no bold, no italics, no headers. Write in plain professional prose with numbered lists where needed. The output will be copy-pasted directly into Airbnb's dispute form, so it must look like a human wrote it — not an AI.

=== AIRBNB POLICIES (VERBATIM) ===
You MUST reference these policies by name, section, and verbatim quote when citing violations.

--- POLICY 1: Reviews Policy (https://www.airbnb.com/help/article/2673) ---

"Reviews for homes, services, and experiences help our community make informed booking and hosting decisions and provide helpful feedback to guests and hosts. That's why reviews must be relevant, authentic, trustworthy, and follow our Content Policy."

What Airbnb does NOT allow (verbatim):

Reviews that are irrelevant:
"Reviews should be about the offering reviewed. For example, if a review for a home is about a service or experience rather than the home, it is not relevant to future guests deciding whether to book the home."
"Reviews are irrelevant if they do not provide the participants' first-hand experience about the reservation."
"If a guest never arrived for their reservation or chose to cancel due to circumstances unrelated to the offering they booked, their review will be considered irrelevant because it is not based on first-hand experience of the offering."

Reviews that are fake:
"Reviews are fake if they are not based on a real reservation. Reviews must be submitted by or on behalf of someone who participated in the reservation."

Reviews involving bias, deception, extortion, incentivization, or pressure:
"Reviews may not be used to mislead or deceive Airbnb or another person."
"Users may not coordinate with, manipulate, extort, incentivize, or pressure another person to influence a review or exploit the review system."
"Users may not threaten a negative review as a means to obtain unwarranted compensation, refund, or other incentive."
"Reviews may not be provided or withheld in exchange for something of value — like a discount, refund, or a reciprocal positive review — or a promise not to take negative action against the reviewer."

Reviews used to harm competition:
"Users may not leave reviews of listings with which they are directly affiliated or in direct competition."

Reviews that are retaliatory:
"Users may not write reviews to retaliate against another user for enforcing an Airbnb policy."
"A review will only be considered retaliatory if the reviewer committed a policy violation, was notified of that violation, and then left a biased review because their own violation was reported. A review discussing the facts or legitimacy of a Resolution Center or AirCover claim is not automatically considered retaliatory."

What does NOT qualify for removal (verbatim):
"Disagreement with a star rating: A review will not be removed solely due to disagreement or dissatisfaction with the star rating."
"Review mentions factors outside of the host's control: A review that mentions factors outside of a host's control does not necessarily violate our policy as the information may be relevant to future guests."
"Subjective opinions in written reviews: Many reviews contain subjective opinions about the reservation. While the host may believe that the kitchen is spacious, the guest's perspective may provide helpful information to future guests."

--- POLICY 2: Content Policy (https://www.airbnb.com/help/article/546) ---

"To help maintain a positive environment for all members of our community, we prohibit certain content on Airbnb's platform."

The following content is NOT allowed (verbatim):
"Content, including superimposed company logos, links, or company names, created for the sole purpose of advertising a separate business or other commercial entity unrelated to the listing"
"Spam, unwanted contact, or content that is shared repeatedly in a disruptive manner"
"Content that is illegal, or endorses or promotes illegal or harmful activity"
"Content that is sexually explicit"
"Content that is violent, graphic, threatening, demeaning, insulting or harassing"
"Content that violates our Nondiscrimination Policy"
"Content that attempts to impersonate another person, account, or entity, including a representative of Airbnb"
"Content that violates another person's or entity's rights, including intellectual property rights, privacy rights"
"Content that publicly discloses another person's private information, including content that is sufficient to identify a listing's location"

--- POLICY 3: Community Standards (https://www.airbnb.com/help/article/3328) ---

Key sections relevant to reviews:

Security - Theft, vandalism, or extortion:
"You should not take property that isn't yours, use someone's property without their permission, copy others' keys or identity documents, damage others' property, remain in listings after a stay is concluded, or threaten anyone with bad ratings or any other penalty or harm to obtain compensation or other benefits."

Fairness - Bullying or harassing others:
"You should not share personal information to shame or blackmail others, target others with unwanted behavior, defame others, or violate our review and content standards."

Fairness - Discriminatory behavior or hate speech:
"You should treat everyone with respect in every interaction. So, you should follow all applicable laws and not treat others differently because of their race, ethnicity, national origin, religious affiliation, sexual orientation, sex, gender, gender identity, disability, or serious diseases. Similarly, insulting others on these bases is not allowed."

--- POLICY 4: Nondiscrimination Policy (https://www.airbnb.com/help/article/2867) ---

"We prohibit users, including co-hosts and co-travellers, from discriminating against others on the basis of the following protected characteristics: Race, Religion, Gender, Age, Disability, Familial status, Marital status, Ethnicity, Nation of origin, Sexual orientation, Sex, Gender identity, Caste, Pregnancy and related medical conditions."

Discriminatory Language:
"Airbnb users may not use language that calls for exclusion, segregation of, violence towards, demeans, insults, stereotypes, or seeks to convey a person's inferiority because of a protected characteristic. This includes usage of slurs, negative associations, referring to a transgender individual by their pre-transition name, misgendering, microaggressions, and all other forms of hateful speech."

=== AIRBNB'S 5 REVIEW REMOVAL CATEGORIES ===
When a host disputes a review, Airbnb asks them to select ONE of these 5 reasons. Your analysis MUST map to the strongest matching category:

1. IT'S RETALIATORY — "The review was left in retaliation for a policy or rule being enforced."
2. IT'S IRRELEVANT — "The review doesn't include info related to the reservation, or the guest never arrived."
3. IT INVOLVES PRESSURE OR COERCION — "The review is the result of someone being intimidated, extorted, or incentivized."
4. IT WAS POSTED BY A COMPETITOR — "The review was posted by someone affiliated with the listing or competing with the listing."
5. IT DOESN'T FOLLOW OUR CONTENT POLICY — "The review is discriminatory, includes private info, or otherwise violates our Content Policy."

=== CITATION REQUIREMENTS ===
When you identify a policy violation, you MUST cite it in this format:
- Name the specific policy (e.g., "Reviews Policy", "Content Policy", "Community Standards", "Nondiscrimination Policy")
- Name the specific section within the policy (e.g., "Reviews that are retaliatory", "Theft, vandalism, or extortion")
- Provide the verbatim quote from the policy that the review violates
- Explain how the specific review text matches the violation

=== STRATEGY ===
Airbnb nearly never overturns reviews for factual disputes alone. The host MUST show the review falls into one of the 5 categories above. Focus on the strongest category match and build the entire argument around it with verbatim policy citations.

Be honest with hosts. If the review does not clearly fit one of the 5 removal categories, tell them plainly and explain why. Do not give false hope.

Process notes:
- The host submits the review dispute at: https://www.airbnb.com/resolution/review_dispute/intro
- The host cannot request removal in a message thread with Airbnb support
- They will get an email within 48 hours with a decision (no in-app notification)`,
        promptTemplate: `You are analyzing a review removal case for an Airbnb host.

IMPORTANT: All text you generate (challenge messages, arbitration letters, reasoning) must be written in plain text only. Do NOT use any markdown formatting such as **, ##, *, bold, italics, or headers. Use numbered lists and line breaks for structure. The text will be copy-pasted into Airbnb's dispute form and must read as if a human host wrote it.

STAGE: {{stage}}
CASE NUMBER: {{case_number}}

PROPERTY: {{property_name}}
GUEST: {{guest_name}}
RATING: {{guest_rating}} stars
REVIEW TEXT: {{review_text}}
CATEGORY RATINGS: {{category_ratings}}

HOUSE RULES: {{house_rules}}

GUEST MESSAGING HISTORY: {{guest_messages}}

AIRBNB RESOLUTION MESSAGES: {{resolution_messages}}

CHALLENGE HISTORY: {{challenge_history}}

REMINDER: Airbnb's dispute form requires the host to select one of these 5 removal reasons:
1. It's retaliatory - left in retaliation for a policy or rule being enforced
2. It's irrelevant - doesn't include info related to the reservation, or guest never arrived
3. It involves pressure or coercion - result of intimidation, extortion, or incentivization
4. It was posted by a competitor - someone affiliated with or competing with the listing
5. It doesn't follow Content Policy - discriminatory, private info, or Content Policy violation

Your analysis and challenge messages MUST be built around the strongest matching category. Airbnb nearly never removes reviews for factual disputes alone — the argument must show the review fits one of these 5 categories.

Based on the stage, provide your analysis:

IF STAGE IS "analysis":
Analyze the review to determine which of the 5 removal categories it best fits. Be honest — if it does not clearly fit any category, say so. Return JSON:
{
  "likelihood": "low" | "medium" | "high",
  "likelihoodScore": 0-100,
  "removalCategory": "retaliatory" | "irrelevant" | "pressure_coercion" | "competitor" | "content_policy" | "none",
  "removalCategoryExplanation": "Why this review fits (or does not fit) the selected category, citing specific Airbnb policy language",
  "reasoning": "Detailed explanation of the case strength and strategy",
  "policyViolations": [
    {
      "policy": "Name of the policy (Reviews Policy, Content Policy, Community Standards, or Nondiscrimination Policy)",
      "section": "The specific section title within the policy",
      "verbatimQuote": "The exact verbatim quote from the policy being violated",
      "explanation": "How the review text specifically violates this policy language"
    }
  ],
  "houseRuleViolations": ["House rules the guest violated"],
  "factualErrors": ["Factual errors in the review"],
  "strengths": ["Strong points in the host's favor"],
  "weaknesses": ["Weak points or areas where the guest has a valid complaint"],
  "recommendedAction": "What the host should do next",
  "missingInfo": ["Any additional information needed from the host"]
}

IF STAGE IS "challenge_1":
Write the FIRST challenge message for the host to submit via Airbnb's dispute form. The message must:
1. Open by stating which of the 5 removal categories the review falls under
2. Quote the specific Airbnb policy language that the review violates
3. Present the evidence showing the review meets that category's definition
4. Be written in plain, professional prose — no markdown, no bold, no headers
5. MUST be under 2,500 characters total (including spaces and line breaks) — this is Airbnb's form limit
Return JSON:
{
  "challengeMessage": "The full text of the challenge message — plain text only, no markdown, under 2500 characters",
  "removalCategory": "retaliatory" | "irrelevant" | "pressure_coercion" | "competitor" | "content_policy",
  "keyArguments": ["Summary of key arguments made"],
  "policiesCited": ["Specific Airbnb policies referenced with quotes"],
  "tips": ["Tips for submitting this challenge"]
}

IF STAGE IS "challenge_2":
Write the SECOND challenge message, escalating the dispute. This should:
1. Reference the previous challenge and Airbnb's response
2. Point out how Airbnb's response uses templated language and fails to address specific facts
3. Re-state which removal category applies and why
4. Be written in plain, professional prose — no markdown
5. MUST be under 2,500 characters total (including spaces and line breaks) — this is Airbnb's form limit
Return JSON:
{
  "challengeMessage": "The full text of the second challenge message — plain text only, no markdown, under 2500 characters",
  "escalationPoints": ["How this escalates from the first challenge"],
  "templateResponseCallouts": ["Specific templated responses from Airbnb to call out"],
  "tips": ["Tips for this stage"]
}

IF STAGE IS "arbitration":
Prepare the formal arbitration filing. Write in plain, professional prose — no markdown. Include:
1. A formal arbitration letter
2. Summary of all evidence and policy violations
3. Timeline of events
4. Specific relief requested
5. MUST be under 2,500 characters total (including spaces and line breaks) — this is Airbnb's form limit
Return JSON:
{
  "arbitrationLetter": "The full formal arbitration letter — plain text only, no markdown, under 2500 characters",
  "evidenceSummary": ["List of evidence to include"],
  "timeline": ["Chronological timeline of events"],
  "reliefRequested": "Specific outcome being sought",
  "filingInstructions": "Step-by-step instructions for filing arbitration"
}`,
        isActive: "true",
      },
    ];

    for (const prompt of defaultPrompts) {
      const existing = await this.getPromptByCategory(prompt.category);
      if (!existing) {
        await this.createPrompt({
          name: prompt.name,
          category: prompt.category,
          description: prompt.description,
          systemPrompt: prompt.systemPrompt,
          promptTemplate: prompt.promptTemplate,
          isActive: prompt.isActive,
        });
        logger.info('Storage', `Created default prompt: ${prompt.name}`);
      } else if (prompt.category === "review_removal" && existing.promptTemplate && !existing.promptTemplate.includes("2,500 characters")) {
        await this.updatePrompt(existing.id, {
          systemPrompt: prompt.systemPrompt,
          promptTemplate: prompt.promptTemplate,
        });
        logger.info('Storage', `Updated review_removal prompt with Airbnb policy categories`);
      }
    }
  }

  // AI Usage Logs
  async createAiUsageLog(data: InsertAiUsageLog): Promise<AiUsageLog> {
    const [log] = await db.insert(aiUsageLogs).values(data).returning();
    return log;
  }

  async getAllAiUsageLogs(): Promise<AiUsageLogWithUser[]> {
    const results = await db
      .select({
        id: aiUsageLogs.id,
        userId: aiUsageLogs.userId,
        label: aiUsageLogs.label,
        model: aiUsageLogs.model,
        inputTokens: aiUsageLogs.inputTokens,
        outputTokens: aiUsageLogs.outputTokens,
        estimatedCost: aiUsageLogs.estimatedCost,
        listingId: aiUsageLogs.listingId,
        listingName: aiUsageLogs.listingName,
        createdAt: aiUsageLogs.createdAt,
        userName: sql<string | null>`COALESCE(${users.firstName} || ' ' || ${users.lastName}, ${users.email}, 'Unknown')`.as('user_name'),
      })
      .from(aiUsageLogs)
      .leftJoin(users, eq(aiUsageLogs.userId, users.id))
      .orderBy(desc(aiUsageLogs.createdAt));
    return results;
  }

  // Webhook Logs
  async createWebhookLog(data: InsertWebhookLog): Promise<WebhookLog> {
    const [log] = await db.insert(webhookLogs).values(data).returning();
    return log;
  }

  async getAllWebhookLogs(): Promise<WebhookLog[]> {
    return await db
      .select()
      .from(webhookLogs)
      .orderBy(desc(webhookLogs.createdAt))
      .limit(500);
  }

  // Reservations
  async getReservation(id: string): Promise<Reservation | undefined> {
    const [reservation] = await db.select().from(reservations).where(eq(reservations.id, id));
    return reservation;
  }

  async getReservationsByIds(ids: string[]): Promise<Reservation[]> {
    if (ids.length === 0) return [];
    return db.select().from(reservations).where(inArray(reservations.id, ids));
  }

  async getReservationByExternalId(listingId: string, externalId: string): Promise<Reservation | undefined> {
    const [reservation] = await db.select().from(reservations)
      .where(and(eq(reservations.listingId, listingId), eq(reservations.externalId, externalId)));
    return reservation;
  }

  async getReservationsByListing(listingId: string): Promise<Reservation[]> {
    return db.select().from(reservations).where(eq(reservations.listingId, listingId)).orderBy(desc(reservations.checkOutDate));
  }

  async getReservationsByUser(userId: string): Promise<Reservation[]> {
    return db.select().from(reservations).where(eq(reservations.userId, userId)).orderBy(desc(reservations.checkOutDate));
  }

  async getReservationsByWorkspace(workspaceId: string): Promise<Reservation[]> {
    return db.select().from(reservations).where(eq(reservations.workspaceId, workspaceId)).orderBy(desc(reservations.checkOutDate));
  }

  async findReservationByExternalId(externalId: string): Promise<Reservation | undefined> {
    const [reservation] = await db.select().from(reservations)
      .where(eq(reservations.externalId, externalId));
    return reservation;
  }

  async getUnprocessedReservations(listingId: string): Promise<Reservation[]> {
    return db.select().from(reservations)
      .where(and(
        eq(reservations.listingId, listingId),
        isNull(reservations.tagsProcessedAt)
      ))
      .orderBy(desc(reservations.checkOutDate));
  }

  async getUnprocessedReservationCountForListings(listingIds: string[]): Promise<number> {
    if (listingIds.length === 0) return 0;
    const result = await db.select({ count: count() }).from(reservations)
      .where(and(
        inArray(reservations.listingId, listingIds),
        isNull(reservations.tagsProcessedAt)
      ));
    return Number(result[0]?.count || 0);
  }

  async getReservationsForReviewCheck(cutoffDate: Date): Promise<Reservation[]> {
    // Get reservations that:
    // 1. Have checkOutDate before cutoff (14.5 days ago)
    // 2. Don't have a public review
    // 3. Haven't been analyzed yet (no reviewAnalyzedAt)
    return db.select().from(reservations)
      .where(and(
        lt(reservations.checkOutDate, cutoffDate),
        isNull(reservations.publicReview),
        isNull(reservations.reviewAnalyzedAt)
      ))
      .orderBy(desc(reservations.checkOutDate));
  }

  async createReservation(data: InsertReservation): Promise<Reservation> {
    const [reservation] = await db.insert(reservations).values(data).returning();
    return reservation;
  }

  async updateReservation(id: string, data: Partial<InsertReservation>): Promise<Reservation | undefined> {
    const [reservation] = await db
      .update(reservations)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(reservations.id, id))
      .returning();
    return reservation;
  }

  async deleteReservation(id: string): Promise<void> {
    await db.delete(reservations).where(eq(reservations.id, id));
  }

  // Themes
  async getTheme(id: string): Promise<Theme | undefined> {
    const [theme] = await db.select().from(themes).where(eq(themes.id, id));
    return theme;
  }

  async getThemesByIds(ids: string[]): Promise<Theme[]> {
    if (ids.length === 0) return [];
    return db.select().from(themes).where(inArray(themes.id, ids));
  }

  async getThemesByUser(userId: string): Promise<Theme[]> {
    return db.select().from(themes).where(eq(themes.userId, userId));
  }

  async getThemesByWorkspace(workspaceId: string): Promise<Theme[]> {
    return db.select().from(themes).where(eq(themes.workspaceId, workspaceId));
  }

  async getThemeByName(userId: string, name: string): Promise<Theme | undefined> {
    const [theme] = await db.select().from(themes).where(and(eq(themes.userId, userId), eq(themes.name, name)));
    return theme;
  }

  async getThemeByNameInWorkspace(workspaceId: string, name: string): Promise<Theme | undefined> {
    const [theme] = await db.select().from(themes).where(and(eq(themes.workspaceId, workspaceId), eq(themes.name, name)));
    return theme;
  }

  async createTheme(data: InsertTheme): Promise<Theme> {
    const [theme] = await db.insert(themes).values(data).returning();
    return theme;
  }

  async updateTheme(id: string, data: Partial<InsertTheme>): Promise<Theme | undefined> {
    const [theme] = await db
      .update(themes)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(themes.id, id))
      .returning();
    return theme;
  }

  async deleteTheme(id: string): Promise<void> {
    await db.delete(themes).where(eq(themes.id, id));
  }

  async getUnassignedTheme(workspaceId: string): Promise<Theme | undefined> {
    const [theme] = await db.select().from(themes).where(
      and(eq(themes.workspaceId, workspaceId), eq(themes.name, "Unassigned"))
    );
    return theme;
  }

  async getSystemThemesByWorkspace(workspaceId: string): Promise<Theme[]> {
    return db.select().from(themes).where(
      and(eq(themes.workspaceId, workspaceId), eq(themes.isSystemTheme, true))
    ).orderBy(themes.name);
  }

  async seedDefaultThemes(workspaceId: string, userId: string): Promise<Theme[]> {
    // Check if themes already exist for this workspace
    const existingThemes = await this.getThemesByWorkspace(workspaceId);
    if (existingThemes.length > 0) {
      logger.info('Themes', `Workspace ${workspaceId} already has ${existingThemes.length} themes, skipping seed`);
      return existingThemes;
    }

    logger.info('Themes', `Seeding ${DEFAULT_THEMES.length} default themes for workspace ${workspaceId}`);
    const seededThemes: Theme[] = [];
    
    for (const defaultTheme of DEFAULT_THEMES) {
      const theme = await this.createTheme({
        userId,
        workspaceId,
        name: defaultTheme.name,
        icon: defaultTheme.icon,
        description: defaultTheme.description,
        isSystemTheme: true,
      });
      seededThemes.push(theme);
    }
    
    logger.info('Themes', `Successfully seeded ${seededThemes.length} themes for workspace ${workspaceId}`);
    return seededThemes;
  }

  // Tags
  async getTag(id: string): Promise<Tag | undefined> {
    const [tag] = await db.select().from(tags).where(eq(tags.id, id));
    return tag;
  }

  async getTagsByUser(userId: string): Promise<Tag[]> {
    return db.select().from(tags).where(eq(tags.userId, userId)).orderBy(desc(tags.createdAt));
  }

  async getTagsByWorkspace(workspaceId: string): Promise<Tag[]> {
    return db.select().from(tags).where(eq(tags.workspaceId, workspaceId)).orderBy(desc(tags.createdAt));
  }

  async getTagsByListing(listingId: string): Promise<Tag[]> {
    return db.select().from(tags).where(eq(tags.listingId, listingId)).orderBy(desc(tags.createdAt));
  }

  async getTagsByReservation(reservationId: string): Promise<Tag[]> {
    return db.select().from(tags).where(eq(tags.reservationId, reservationId));
  }

  async getTagsByReservationIds(reservationIds: string[]): Promise<Map<string, Tag[]>> {
    if (reservationIds.length === 0) {
      return new Map();
    }
    const allTags = await db.select().from(tags).where(inArray(tags.reservationId, reservationIds));
    const tagsByReservation = new Map<string, Tag[]>();
    for (const tag of allTags) {
      if (tag.reservationId) {
        if (!tagsByReservation.has(tag.reservationId)) {
          tagsByReservation.set(tag.reservationId, []);
        }
        tagsByReservation.get(tag.reservationId)!.push(tag);
      }
    }
    return tagsByReservation;
  }

  async getTagsByTheme(themeId: string): Promise<Tag[]> {
    return db.select().from(tags).where(eq(tags.themeId, themeId));
  }

  async createTag(data: InsertTag): Promise<Tag> {
    const [tag] = await db.insert(tags).values(data).returning();
    return tag;
  }

  async updateTag(id: string, data: Partial<InsertTag>): Promise<Tag | undefined> {
    const [tag] = await db
      .update(tags)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(tags.id, id))
      .returning();
    return tag;
  }

  async deleteTag(id: string): Promise<void> {
    await db.delete(tags).where(eq(tags.id, id));
  }

  // Tasks
  async getTask(id: string): Promise<Task | undefined> {
    const [task] = await db.select().from(tasks).where(eq(tasks.id, id));
    return task;
  }

  async getTasksByUser(userId: string): Promise<Task[]> {
    return db.select().from(tasks).where(eq(tasks.userId, userId)).orderBy(desc(tasks.createdAt));
  }

  async getTasksByWorkspace(workspaceId: string): Promise<Task[]> {
    return db.select().from(tasks).where(eq(tasks.workspaceId, workspaceId)).orderBy(desc(tasks.createdAt));
  }

  async getTasksByTag(tagId: string): Promise<Task[]> {
    return db.select().from(tasks).where(eq(tasks.tagId, tagId));
  }

  async createTask(data: InsertTask): Promise<Task> {
    const [task] = await db.insert(tasks).values(data).returning();
    return task;
  }

  async updateTask(id: string, data: Partial<InsertTask>): Promise<Task | undefined> {
    const [task] = await db
      .update(tasks)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(tasks.id, id))
      .returning();
    return task;
  }

  async deleteTask(id: string): Promise<void> {
    await db.delete(tasks).where(eq(tasks.id, id));
  }

  // System Settings
  async getSystemSetting(key: string): Promise<SystemSetting | undefined> {
    const [setting] = await db.select().from(systemSettings).where(eq(systemSettings.key, key));
    return setting;
  }

  async setSystemSetting(key: string, value: string, updatedBy?: string): Promise<SystemSetting> {
    const existing = await this.getSystemSetting(key);
    if (existing) {
      const [updated] = await db
        .update(systemSettings)
        .set({ value, updatedAt: new Date(), updatedBy })
        .where(eq(systemSettings.key, key))
        .returning();
      return updated;
    }
    const [created] = await db.insert(systemSettings).values({ key, value, updatedBy }).returning();
    return created;
  }

  // Workspaces
  async getWorkspace(id: string): Promise<Workspace | undefined> {
    const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, id));
    return workspace;
  }

  async getWorkspacesByUser(userId: string): Promise<Workspace[]> {
    const members = await db.select().from(workspaceMembers)
      .where(and(
        eq(workspaceMembers.userId, userId),
        eq(workspaceMembers.status, "active")
      ));
    
    if (members.length === 0) return [];
    
    const workspaceIds = members.map(m => m.workspaceId);
    const result = await db.select().from(workspaces)
      .where(sql`${workspaces.id} IN (${sql.join(workspaceIds.map(id => sql`${id}`), sql`, `)})`);
    return result;
  }

  async createWorkspace(data: InsertWorkspace): Promise<Workspace> {
    const [workspace] = await db.insert(workspaces).values(data).returning();
    return workspace;
  }

  async updateWorkspace(id: string, data: Partial<InsertWorkspace>): Promise<Workspace | undefined> {
    const [workspace] = await db
      .update(workspaces)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(workspaces.id, id))
      .returning();
    return workspace;
  }

  async deleteWorkspace(id: string): Promise<void> {
    await db.delete(workspaces).where(eq(workspaces.id, id));
  }

  // Workspace Members
  async getWorkspaceMember(workspaceId: string, userId: string): Promise<WorkspaceMember | undefined> {
    const [member] = await db.select().from(workspaceMembers)
      .where(and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.userId, userId)
      ));
    return member;
  }

  async getWorkspaceMembersByWorkspace(workspaceId: string): Promise<WorkspaceMember[]> {
    return db.select().from(workspaceMembers).where(eq(workspaceMembers.workspaceId, workspaceId));
  }

  async getWorkspaceMembersByUser(userId: string): Promise<WorkspaceMember[]> {
    return db.select().from(workspaceMembers).where(eq(workspaceMembers.userId, userId));
  }

  async createWorkspaceMember(data: InsertWorkspaceMember): Promise<WorkspaceMember> {
    const [member] = await db.insert(workspaceMembers).values(data).returning();
    return member;
  }

  async updateWorkspaceMember(id: string, data: Partial<InsertWorkspaceMember>): Promise<WorkspaceMember | undefined> {
    const [member] = await db
      .update(workspaceMembers)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(workspaceMembers.id, id))
      .returning();
    return member;
  }

  async deleteWorkspaceMember(id: string): Promise<void> {
    await db.delete(workspaceMembers).where(eq(workspaceMembers.id, id));
  }

  // Reviews Summaries
  async getReviewsSummary(workspaceId: string, listingIdsHash: string): Promise<ReviewsSummary | undefined> {
    const [summary] = await db.select().from(reviewsSummaries)
      .where(and(
        eq(reviewsSummaries.workspaceId, workspaceId),
        eq(reviewsSummaries.listingIdsHash, listingIdsHash)
      ));
    return summary;
  }

  async getReviewsSummariesByWorkspace(workspaceId: string): Promise<ReviewsSummary[]> {
    return db.select().from(reviewsSummaries).where(eq(reviewsSummaries.workspaceId, workspaceId));
  }

  async createReviewsSummary(data: InsertReviewsSummary): Promise<ReviewsSummary> {
    const [summary] = await db.insert(reviewsSummaries).values(data).returning();
    return summary;
  }

  async updateReviewsSummary(id: string, data: Partial<InsertReviewsSummary>): Promise<ReviewsSummary | undefined> {
    const [summary] = await db
      .update(reviewsSummaries)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(reviewsSummaries.id, id))
      .returning();
    return summary;
  }

  async deleteReviewsSummary(id: string): Promise<void> {
    await db.delete(reviewsSummaries).where(eq(reviewsSummaries.id, id));
  }

  // Reservation queries with listing filters
  async getReservationsByListingIds(listingIds: string[]): Promise<Reservation[]> {
    if (listingIds.length === 0) return [];
    return db.select().from(reservations)
      .where(sql`${reservations.listingId} IN (${sql.join(listingIds.map(id => sql`${id}`), sql`, `)})`)
      .orderBy(desc(reservations.checkOutDate));
  }

  // Lumi Views
  async getLumiView(id: string): Promise<LumiView | undefined> {
    const [view] = await db.select().from(lumiViews).where(eq(lumiViews.id, id));
    return view;
  }

  async getLumiViews(workspaceId: string): Promise<LumiView[]> {
    return db.select().from(lumiViews)
      .where(eq(lumiViews.workspaceId, workspaceId))
      .orderBy(desc(lumiViews.createdAt));
  }

  async createLumiView(data: InsertLumiView): Promise<LumiView> {
    const [view] = await db.insert(lumiViews).values(data).returning();
    return view;
  }

  async updateLumiView(id: string, data: Partial<InsertLumiView>): Promise<LumiView | undefined> {
    const [view] = await db
      .update(lumiViews)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(lumiViews.id, id))
      .returning();
    return view;
  }

  async deleteLumiView(id: string): Promise<void> {
    await db.delete(lumiViews).where(eq(lumiViews.id, id));
  }

  // Lumi Queries
  async getLumiQuery(id: string): Promise<LumiQuery | undefined> {
    const [query] = await db.select().from(lumiQueries).where(eq(lumiQueries.id, id));
    return query;
  }

  async getLumiQueries(workspaceId: string): Promise<LumiQuery[]> {
    return db.select().from(lumiQueries)
      .where(eq(lumiQueries.workspaceId, workspaceId))
      .orderBy(desc(lumiQueries.createdAt));
  }

  async getLumiQueriesByConversation(conversationId: string): Promise<LumiQuery[]> {
    return db.select().from(lumiQueries)
      .where(eq(lumiQueries.conversationId, conversationId))
      .orderBy(lumiQueries.createdAt);
  }

  async createLumiQuery(data: InsertLumiQuery): Promise<LumiQuery> {
    const [query] = await db.insert(lumiQueries).values(data).returning();
    return query;
  }

  async updateLumiQuery(id: string, data: Partial<InsertLumiQuery>): Promise<LumiQuery | undefined> {
    const [query] = await db
      .update(lumiQueries)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(lumiQueries.id, id))
      .returning();
    return query;
  }

  async deleteLumiQuery(id: string): Promise<void> {
    await db.delete(lumiQueries).where(eq(lumiQueries.id, id));
  }

  // Teams
  async getTeam(id: string): Promise<Team | undefined> {
    const [team] = await db.select().from(teams).where(eq(teams.id, id));
    return team;
  }

  async getTeamsByWorkspace(workspaceId: string): Promise<Team[]> {
    return db.select().from(teams)
      .where(eq(teams.workspaceId, workspaceId))
      .orderBy(desc(teams.createdAt));
  }

  async getTeamsWithStatsByWorkspace(workspaceId: string): Promise<TeamWithStats[]> {
    const teamsData = await db.select().from(teams)
      .where(eq(teams.workspaceId, workspaceId))
      .orderBy(desc(teams.createdAt));
    
    const teamsWithStats: TeamWithStats[] = [];
    
    for (const team of teamsData) {
      const members = await db.select().from(teamMembers).where(eq(teamMembers.teamId, team.id));
      const memberUserIds = members.filter(m => m.userId).map(m => m.userId as string);
      
      let taskCount = 0;
      if (memberUserIds.length > 0) {
        const taskResults = await db.select({ count: sql<number>`count(*)` })
          .from(tasks)
          .where(sql`${tasks.assigneeId} = ANY(ARRAY[${sql.join(memberUserIds.map(id => sql`${id}`), sql`, `)}])`);
        taskCount = Number(taskResults[0]?.count || 0);
      }
      
      teamsWithStats.push({
        ...team,
        memberCount: members.length,
        taskCount,
      });
    }
    
    return teamsWithStats;
  }

  async createTeam(data: InsertTeam): Promise<Team> {
    const [team] = await db.insert(teams).values(data).returning();
    return team;
  }

  async updateTeam(id: string, data: Partial<InsertTeam>): Promise<Team | undefined> {
    const [team] = await db
      .update(teams)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(teams.id, id))
      .returning();
    return team;
  }

  async deleteTeam(id: string): Promise<void> {
    await db.delete(teamMembers).where(eq(teamMembers.teamId, id));
    await db.delete(teams).where(eq(teams.id, id));
  }

  // Team Members
  async getTeamMember(id: string): Promise<TeamMember | undefined> {
    const [member] = await db.select().from(teamMembers).where(eq(teamMembers.id, id));
    return member;
  }

  async getTeamMembersByTeam(teamId: string): Promise<TeamMember[]> {
    return db.select().from(teamMembers)
      .where(eq(teamMembers.teamId, teamId))
      .orderBy(desc(teamMembers.createdAt));
  }

  async getTeamMembersWithUserByTeam(teamId: string): Promise<TeamMemberWithUser[]> {
    const members = await db.select().from(teamMembers)
      .where(eq(teamMembers.teamId, teamId))
      .orderBy(desc(teamMembers.createdAt));
    
    const membersWithUser: TeamMemberWithUser[] = [];
    
    for (const member of members) {
      let userData = null;
      if (member.userId) {
        const [user] = await db.select().from(users).where(eq(users.id, member.userId));
        userData = user;
      }
      
      membersWithUser.push({
        ...member,
        firstName: userData?.firstName || null,
        lastName: userData?.lastName || null,
        email: userData?.email || member.invitedEmail || null,
        profileImageUrl: userData?.profileImageUrl || null,
        lastLoginAt: userData?.lastLoginAt || null,
      });
    }
    
    return membersWithUser;
  }

  async getTeamMemberByUserAndTeam(userId: string, teamId: string): Promise<TeamMember | undefined> {
    const [member] = await db.select().from(teamMembers)
      .where(and(eq(teamMembers.userId, userId), eq(teamMembers.teamId, teamId)));
    return member;
  }

  async getTeamMemberByInvitationToken(token: string): Promise<TeamMember | undefined> {
    const [member] = await db.select().from(teamMembers)
      .where(eq(teamMembers.invitationToken, token));
    return member;
  }

  async createTeamMember(data: InsertTeamMember): Promise<TeamMember> {
    const [member] = await db.insert(teamMembers).values(data).returning();
    return member;
  }

  async updateTeamMember(id: string, data: Partial<InsertTeamMember>): Promise<TeamMember | undefined> {
    const [member] = await db
      .update(teamMembers)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(teamMembers.id, id))
      .returning();
    return member;
  }

  async acceptTeamInvitation(token: string, userId: string): Promise<TeamMember | null> {
    // Atomic conditional update: only update if token matches and status is 'invited'
    const [member] = await db
      .update(teamMembers)
      .set({ 
        userId,
        status: "active",
        invitationToken: null,
        updatedAt: new Date() 
      })
      .where(and(
        eq(teamMembers.invitationToken, token),
        eq(teamMembers.status, "invited")
      ))
      .returning();
    return member || null;
  }

  async deleteTeamMember(id: string): Promise<void> {
    await db.delete(teamMembers).where(eq(teamMembers.id, id));
  }

  // Photo Analyses
  async getPhotoAnalysis(id: string): Promise<PhotoAnalysis | undefined> {
    const [analysis] = await db.select().from(photoAnalyses).where(eq(photoAnalyses.id, id));
    return analysis;
  }

  async getPhotoAnalysesByListing(listingId: string): Promise<PhotoAnalysis[]> {
    return db.select().from(photoAnalyses)
      .where(eq(photoAnalyses.listingId, listingId))
      .orderBy(photoAnalyses.photoIndex);
  }

  async getPhotoAnalysisByListingAndIndex(listingId: string, photoIndex: number): Promise<PhotoAnalysis | undefined> {
    const [analysis] = await db.select().from(photoAnalyses)
      .where(and(eq(photoAnalyses.listingId, listingId), eq(photoAnalyses.photoIndex, photoIndex)));
    return analysis;
  }

  async createPhotoAnalysis(data: InsertPhotoAnalysis): Promise<PhotoAnalysis> {
    const [analysis] = await db.insert(photoAnalyses).values(data).returning();
    return analysis;
  }

  async updatePhotoAnalysis(id: string, data: Partial<InsertPhotoAnalysis>): Promise<PhotoAnalysis | undefined> {
    const [analysis] = await db
      .update(photoAnalyses)
      .set(data)
      .where(eq(photoAnalyses.id, id))
      .returning();
    return analysis;
  }

  async deletePhotoAnalysesByListing(listingId: string): Promise<void> {
    await db.delete(photoAnalyses).where(eq(photoAnalyses.listingId, listingId));
  }

  // User Profile
  async updateUserProfile(userId: string, data: { firstName?: string; lastName?: string; bio?: string; profileImageUrl?: string; originalSelfieUrl?: string | null; headshotLockedAt?: Date | null; timezone?: string }): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();
    return user;
  }

  // Profile Photo History
  async getProfilePhotoHistory(userId: string): Promise<ProfilePhotoHistory[]> {
    return db.select().from(profilePhotoHistory)
      .where(eq(profilePhotoHistory.userId, userId))
      .orderBy(desc(profilePhotoHistory.createdAt));
  }

  async addProfilePhotoHistory(userId: string, imageUrl: string): Promise<ProfilePhotoHistory> {
    const [entry] = await db.insert(profilePhotoHistory).values({ userId, imageUrl }).returning();
    return entry;
  }

  // User Songs
  async getUserSongs(userId: string): Promise<UserSong[]> {
    return db.select().from(userSongs)
      .where(eq(userSongs.userId, userId))
      .orderBy(desc(userSongs.createdAt));
  }

  async getUserSong(id: string): Promise<UserSong | undefined> {
    const [song] = await db.select().from(userSongs).where(eq(userSongs.id, id));
    return song;
  }

  async createUserSong(data: InsertUserSong): Promise<UserSong> {
    const [song] = await db.insert(userSongs).values(data).returning();
    return song;
  }

  async updateUserSong(id: string, data: Partial<InsertUserSong>): Promise<UserSong | undefined> {
    const [song] = await db
      .update(userSongs)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(userSongs.id, id))
      .returning();
    return song;
  }

  async markSongShared(id: string): Promise<void> {
    await db
      .update(userSongs)
      .set({ sharedOnSocial: "true", updatedAt: new Date() })
      .where(eq(userSongs.id, id));
  }

  async deleteUserSong(id: string): Promise<void> {
    await db.delete(userSongs).where(eq(userSongs.id, id));
  }

  // Workspace Stats
  async getWorkspaceStats(workspaceId: string): Promise<{ listingCount: number; reservationCount: number; reviewCount: number } | null> {
    const listingResult = await db.select({ count: sql<number>`count(*)` })
      .from(listings)
      .where(eq(listings.workspaceId, workspaceId));
    
    const reservationResult = await db.select({ count: sql<number>`count(*)` })
      .from(reservations)
      .where(eq(reservations.workspaceId, workspaceId));
    
    const reviewResult = await db.select({ count: sql<number>`count(*)` })
      .from(reservations)
      .where(and(
        eq(reservations.workspaceId, workspaceId),
        sql`${reservations.publicReview} IS NOT NULL`
      ));
    
    return {
      listingCount: Number(listingResult[0]?.count || 0),
      reservationCount: Number(reservationResult[0]?.count || 0),
      reviewCount: Number(reviewResult[0]?.count || 0),
    };
  }

  // Worst Guests
  async getWorstGuests(workspaceId: string): Promise<{ reservationId: string; guestName: string; listingName: string; negativeTagCount: number; summary: string }[]> {
    // Get reservations with most negative tags, excluding those that already have songs
    const result = await db.execute(sql`
      SELECT 
        r.id as reservation_id,
        COALESCE(r.guest_name, 'Guest') as guest_name,
        COALESCE(l.name, 'Unknown Property') as listing_name,
        COUNT(CASE WHEN t.sentiment = 'negative' OR t.sentiment = 'question' THEN 1 END) as negative_tag_count,
        STRING_AGG(CASE WHEN t.sentiment = 'negative' THEN t.name END, ', ') as negative_tags
      FROM reservations r
      LEFT JOIN listings l ON r.listing_id = l.id
      LEFT JOIN tags t ON t.reservation_id = r.id
      WHERE r.workspace_id = ${workspaceId}
        AND NOT EXISTS (
          SELECT 1 FROM user_songs us 
          WHERE us.reservation_id = r.id 
          AND us.status = 'ready'
        )
      GROUP BY r.id, r.guest_name, l.name
      HAVING COUNT(CASE WHEN t.sentiment = 'negative' OR t.sentiment = 'question' THEN 1 END) > 0
      ORDER BY negative_tag_count DESC
      LIMIT 5
    `);
    
    return (result.rows as any[]).map(row => ({
      reservationId: row.reservation_id,
      guestName: row.guest_name,
      listingName: row.listing_name,
      negativeTagCount: Number(row.negative_tag_count),
      summary: row.negative_tags || "Various issues",
    }));
  }

  // Airbnb Scans
  async getAirbnbScan(id: string): Promise<AirbnbScan | undefined> {
    const [scan] = await db.select().from(airbnbScans).where(eq(airbnbScans.id, id));
    return scan;
  }

  async getAirbnbScanByListing(listingId: string): Promise<AirbnbScan | undefined> {
    const [scan] = await db
      .select()
      .from(airbnbScans)
      .where(eq(airbnbScans.listingId, listingId))
      .orderBy(desc(airbnbScans.createdAt))
      .limit(1);
    return scan;
  }

  async getAirbnbScansByWorkspace(workspaceId: string): Promise<AirbnbScan[]> {
    return db
      .select()
      .from(airbnbScans)
      .where(eq(airbnbScans.workspaceId, workspaceId))
      .orderBy(desc(airbnbScans.createdAt));
  }

  async createAirbnbScan(data: InsertAirbnbScan): Promise<AirbnbScan> {
    const [scan] = await db.insert(airbnbScans).values(data).returning();
    return scan;
  }

  async updateAirbnbScan(id: string, data: Partial<InsertAirbnbScan>): Promise<AirbnbScan | undefined> {
    const [scan] = await db
      .update(airbnbScans)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(airbnbScans.id, id))
      .returning();
    return scan;
  }

  // Speed Test Runs
  async getSpeedTestRun(id: string): Promise<SpeedTestRun | undefined> {
    const [run] = await db.select().from(speedTestRuns).where(eq(speedTestRuns.id, id));
    return run;
  }

  async getSpeedTestRuns(limit: number = 20): Promise<SpeedTestRun[]> {
    return db.select().from(speedTestRuns).orderBy(desc(speedTestRuns.createdAt)).limit(limit);
  }

  async getSpeedTestRunsByWorkspace(workspaceId: string, limit: number = 20): Promise<SpeedTestRun[]> {
    return db.select().from(speedTestRuns)
      .where(eq(speedTestRuns.workspaceId, workspaceId))
      .orderBy(desc(speedTestRuns.createdAt))
      .limit(limit);
  }

  async createSpeedTestRun(data: InsertSpeedTestRun): Promise<SpeedTestRun> {
    const [run] = await db.insert(speedTestRuns).values(data).returning();
    return run;
  }

  // Changelog Entries
  async getChangelogEntry(id: string): Promise<ChangelogEntry | undefined> {
    const [entry] = await db.select().from(changelogEntries).where(eq(changelogEntries.id, id));
    return entry;
  }

  async getChangelogEntries(): Promise<ChangelogEntry[]> {
    return db.select().from(changelogEntries).orderBy(desc(changelogEntries.createdAt));
  }

  async getChangelogEntriesByStatus(status: string): Promise<ChangelogEntry[]> {
    return db.select().from(changelogEntries)
      .where(eq(changelogEntries.status, status))
      .orderBy(desc(changelogEntries.createdAt));
  }

  async getSentChangelogEntries(): Promise<ChangelogEntry[]> {
    return db.select().from(changelogEntries)
      .where(eq(changelogEntries.status, "sent"))
      .orderBy(desc(changelogEntries.sentAt));
  }

  async createChangelogEntry(data: InsertChangelogEntry): Promise<ChangelogEntry> {
    const [entry] = await db.insert(changelogEntries).values(data).returning();
    return entry;
  }

  async updateChangelogEntry(id: string, data: Partial<InsertChangelogEntry>): Promise<ChangelogEntry | undefined> {
    const [entry] = await db
      .update(changelogEntries)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(changelogEntries.id, id))
      .returning();
    return entry;
  }

  async deleteChangelogEntry(id: string): Promise<void> {
    await db.delete(changelogEntries).where(eq(changelogEntries.id, id));
  }

  // Changelog Settings
  async getChangelogSettings(): Promise<ChangelogSettings | undefined> {
    const [settings] = await db.select().from(changelogSettings).limit(1);
    return settings;
  }

  async createOrUpdateChangelogSettings(data: InsertChangelogSettings): Promise<ChangelogSettings> {
    const existing = await this.getChangelogSettings();
    if (existing) {
      const [updated] = await db
        .update(changelogSettings)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(changelogSettings.id, existing.id))
        .returning();
      return updated;
    }
    const [created] = await db.insert(changelogSettings).values(data).returning();
    return created;
  }

  // Procedures
  async getProcedure(id: string): Promise<Procedure | undefined> {
    const [procedure] = await db.select().from(procedures).where(eq(procedures.id, id));
    return procedure;
  }

  async getProcedureWithSteps(id: string): Promise<ProcedureWithSteps | undefined> {
    const procedure = await this.getProcedure(id);
    if (!procedure) return undefined;
    const steps = await this.getProcedureSteps(id);
    return { ...procedure, steps };
  }

  async getProceduresByWorkspace(workspaceId: string): Promise<Procedure[]> {
    return db.select().from(procedures)
      .where(eq(procedures.workspaceId, workspaceId))
      .orderBy(desc(procedures.createdAt));
  }

  async createProcedure(data: InsertProcedure): Promise<Procedure> {
    const [procedure] = await db.insert(procedures).values(data).returning();
    return procedure;
  }

  async updateProcedure(id: string, data: Partial<InsertProcedure>): Promise<Procedure | undefined> {
    const [procedure] = await db
      .update(procedures)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(procedures.id, id))
      .returning();
    return procedure;
  }

  async deleteProcedure(id: string): Promise<void> {
    // Delete steps first, then the procedure
    await db.delete(procedureSteps).where(eq(procedureSteps.procedureId, id));
    await db.delete(procedures).where(eq(procedures.id, id));
  }

  // Procedure Steps
  async getProcedureStep(id: string): Promise<ProcedureStep | undefined> {
    const [step] = await db.select().from(procedureSteps).where(eq(procedureSteps.id, id));
    return step;
  }

  async getProcedureSteps(procedureId: string): Promise<ProcedureStep[]> {
    return db.select().from(procedureSteps)
      .where(eq(procedureSteps.procedureId, procedureId))
      .orderBy(procedureSteps.stepOrder);
  }

  async createProcedureStep(data: InsertProcedureStep): Promise<ProcedureStep> {
    const [step] = await db.insert(procedureSteps).values(data).returning();
    return step;
  }

  async updateProcedureStep(id: string, data: Partial<InsertProcedureStep>): Promise<ProcedureStep | undefined> {
    const [step] = await db
      .update(procedureSteps)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(procedureSteps.id, id))
      .returning();
    return step;
  }

  async deleteProcedureStep(id: string): Promise<void> {
    await db.delete(procedureSteps).where(eq(procedureSteps.id, id));
  }

  async reorderProcedureSteps(procedureId: string, stepIds: string[]): Promise<void> {
    for (let i = 0; i < stepIds.length; i++) {
      await db
        .update(procedureSteps)
        .set({ stepOrder: i + 1, updatedAt: new Date() })
        .where(and(eq(procedureSteps.id, stepIds[i]), eq(procedureSteps.procedureId, procedureId)));
    }
  }

  // Procedure Assignments
  async getProcedureAssignment(id: string): Promise<ProcedureAssignment | undefined> {
    const [assignment] = await db.select().from(procedureAssignments).where(eq(procedureAssignments.id, id));
    return assignment;
  }

  async getProcedureAssignmentByTask(taskId: string): Promise<ProcedureAssignment | undefined> {
    const [assignment] = await db.select().from(procedureAssignments).where(eq(procedureAssignments.taskId, taskId));
    return assignment;
  }

  async createProcedureAssignment(data: InsertProcedureAssignment): Promise<ProcedureAssignment> {
    const [assignment] = await db.insert(procedureAssignments).values(data).returning();
    return assignment;
  }

  async deleteProcedureAssignment(id: string): Promise<void> {
    await db.delete(procedureAssignments).where(eq(procedureAssignments.id, id));
  }

  // Procedure Completions
  async getProcedureCompletion(id: string): Promise<ProcedureCompletion | undefined> {
    const [completion] = await db.select().from(procedureCompletions).where(eq(procedureCompletions.id, id));
    return completion;
  }

  async getProcedureCompletionWithDetails(id: string): Promise<ProcedureCompletionWithDetails | undefined> {
    const completion = await this.getProcedureCompletion(id);
    if (!completion) return undefined;
    const stepCompletionsResult = await this.getStepCompletionsByProcedureCompletion(id);
    const assignment = await this.getProcedureAssignment(completion.procedureAssignmentId);
    let procedure: ProcedureWithSteps | undefined;
    if (assignment) {
      procedure = await this.getProcedureWithSteps(assignment.procedureId);
    }
    return { ...completion, stepCompletions: stepCompletionsResult, procedure };
  }

  async getProcedureCompletionByAssignment(procedureAssignmentId: string, userId: string): Promise<ProcedureCompletion | undefined> {
    const [completion] = await db.select().from(procedureCompletions)
      .where(and(
        eq(procedureCompletions.procedureAssignmentId, procedureAssignmentId),
        eq(procedureCompletions.completedByUserId, userId)
      ));
    return completion;
  }

  async createProcedureCompletion(data: InsertProcedureCompletion): Promise<ProcedureCompletion> {
    const [completion] = await db.insert(procedureCompletions).values(data).returning();
    return completion;
  }

  async updateProcedureCompletion(id: string, data: Partial<InsertProcedureCompletion>): Promise<ProcedureCompletion | undefined> {
    const [completion] = await db
      .update(procedureCompletions)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(procedureCompletions.id, id))
      .returning();
    return completion;
  }

  // Step Completions
  async getStepCompletion(id: string): Promise<StepCompletion | undefined> {
    const [stepCompletion] = await db.select().from(stepCompletions).where(eq(stepCompletions.id, id));
    return stepCompletion;
  }

  async getStepCompletionsByProcedureCompletion(procedureCompletionId: string): Promise<StepCompletion[]> {
    return db.select().from(stepCompletions).where(eq(stepCompletions.procedureCompletionId, procedureCompletionId));
  }

  async createStepCompletion(data: InsertStepCompletion): Promise<StepCompletion> {
    const [stepCompletion] = await db.insert(stepCompletions).values(data).returning();
    return stepCompletion;
  }

  async updateStepCompletion(id: string, data: Partial<InsertStepCompletion>): Promise<StepCompletion | undefined> {
    const [stepCompletion] = await db
      .update(stepCompletions)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(stepCompletions.id, id))
      .returning();
    return stepCompletion;
  }

  async upsertStepCompletion(procedureCompletionId: string, procedureStepId: string, data: Partial<InsertStepCompletion>): Promise<StepCompletion> {
    const [existing] = await db.select().from(stepCompletions)
      .where(and(
        eq(stepCompletions.procedureCompletionId, procedureCompletionId),
        eq(stepCompletions.procedureStepId, procedureStepId)
      ));
    if (existing) {
      const [updated] = await db
        .update(stepCompletions)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(stepCompletions.id, existing.id))
        .returning();
      return updated;
    }
    const [created] = await db.insert(stepCompletions).values({
      procedureCompletionId,
      procedureStepId,
      ...data
    }).returning();
    return created;
  }

  // ============================================
  // Procedure Templates Implementation
  // ============================================

  async getProcedureTemplate(): Promise<ProcedureTemplateWithSteps | null> {
    const [template] = await db.select().from(procedureTemplates).limit(1);
    if (!template) return null;
    const steps = await db.select().from(procedureTemplateSteps)
      .where(eq(procedureTemplateSteps.templateId, template.id))
      .orderBy(procedureTemplateSteps.stepOrder);
    return { ...template, steps };
  }

  async saveProcedureTemplate(data: { title: string; description?: string; updatedByUserId: string; steps: Omit<InsertProcedureTemplateStep, 'templateId'>[] }): Promise<ProcedureTemplateWithSteps> {
    const existing = await this.getProcedureTemplate();

    let template: ProcedureTemplate;
    if (existing) {
      const [updated] = await db.update(procedureTemplates)
        .set({ title: data.title, description: data.description, updatedByUserId: data.updatedByUserId, updatedAt: new Date() })
        .where(eq(procedureTemplates.id, existing.id))
        .returning();
      template = updated;
      await db.delete(procedureTemplateSteps).where(eq(procedureTemplateSteps.templateId, template.id));
    } else {
      const [created] = await db.insert(procedureTemplates).values({
        title: data.title,
        description: data.description,
        updatedByUserId: data.updatedByUserId,
      }).returning();
      template = created;
    }

    const steps: ProcedureTemplateStep[] = [];
    for (const step of data.steps) {
      const [created] = await db.insert(procedureTemplateSteps).values({
        ...step,
        templateId: template.id,
      }).returning();
      steps.push(created);
    }

    return { ...template, steps };
  }

  async seedDefaultProcedures(workspaceId: string, userId: string): Promise<void> {
    const existingProcedures = await this.getProceduresByWorkspace(workspaceId);
    if (existingProcedures.length > 0) {
      logger.info('Procedures', `Workspace ${workspaceId} already has procedures, skipping seed`);
      return;
    }

    const template = await this.getProcedureTemplate();
    if (!template || template.steps.length === 0) {
      logger.info('Procedures', `No procedure template found, skipping seed for workspace ${workspaceId}`);
      return;
    }

    const procedure = await this.createProcedure({
      workspaceId,
      createdByUserId: userId,
      title: "Example Turnover Template",
      description: template.description || undefined,
      status: "draft",
    });

    for (const step of template.steps) {
      await this.createProcedureStep({
        procedureId: procedure.id,
        stepOrder: step.stepOrder,
        label: step.label,
        description: step.description || undefined,
        moduleTitle: step.moduleTitle || undefined,
        moduleOrder: step.moduleOrder || undefined,
        requiresPhotoVerification: step.requiresPhotoVerification,
        photoVerificationMode: step.photoVerificationMode,
        requiresGpsVerification: step.requiresGpsVerification,
        gpsRadiusMeters: step.gpsRadiusMeters || undefined,
      });
    }

    logger.info('Procedures', `Seeded draft procedure "${template.title}" with ${template.steps.length} steps for workspace ${workspaceId}`);
  }

  // ============================================
  // Task Modules Implementation
  // ============================================

  async getTaskModule(id: string): Promise<TaskModule | undefined> {
    const [module] = await db.select().from(taskModules).where(eq(taskModules.id, id));
    return module;
  }

  async getTaskModuleWithItems(id: string): Promise<TaskModuleWithItems | undefined> {
    const module = await this.getTaskModule(id);
    if (!module) return undefined;
    const items = await this.getTaskModuleItems(id);
    return { ...module, items };
  }

  async getTaskModulesByWorkspace(workspaceId: string): Promise<TaskModule[]> {
    return db.select().from(taskModules)
      .where(eq(taskModules.workspaceId, workspaceId))
      .orderBy(desc(taskModules.createdAt));
  }

  async getRecommendedTaskModules(workspaceId: string): Promise<TaskModule[]> {
    return db.select().from(taskModules)
      .where(and(
        eq(taskModules.workspaceId, workspaceId),
        eq(taskModules.isRecommended, true)
      ))
      .orderBy(taskModules.name);
  }

  async createTaskModule(data: InsertTaskModule): Promise<TaskModule> {
    const [module] = await db.insert(taskModules).values(data).returning();
    return module;
  }

  async updateTaskModule(id: string, data: Partial<InsertTaskModule>): Promise<TaskModule | undefined> {
    const [module] = await db
      .update(taskModules)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(taskModules.id, id))
      .returning();
    return module;
  }

  async deleteTaskModule(id: string): Promise<void> {
    await db.delete(taskModuleItems).where(eq(taskModuleItems.moduleId, id));
    await db.delete(taskModules).where(eq(taskModules.id, id));
  }

  // Task Module Items
  async getTaskModuleItem(id: string): Promise<TaskModuleItem | undefined> {
    const [item] = await db.select().from(taskModuleItems).where(eq(taskModuleItems.id, id));
    return item;
  }

  async getTaskModuleItems(moduleId: string): Promise<TaskModuleItem[]> {
    return db.select().from(taskModuleItems)
      .where(eq(taskModuleItems.moduleId, moduleId))
      .orderBy(taskModuleItems.itemOrder);
  }

  async createTaskModuleItem(data: InsertTaskModuleItem): Promise<TaskModuleItem> {
    const [item] = await db.insert(taskModuleItems).values(data).returning();
    return item;
  }

  async updateTaskModuleItem(id: string, data: Partial<InsertTaskModuleItem>): Promise<TaskModuleItem | undefined> {
    const [item] = await db
      .update(taskModuleItems)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(taskModuleItems.id, id))
      .returning();
    return item;
  }

  async deleteTaskModuleItem(id: string): Promise<void> {
    await db.delete(taskModuleItems).where(eq(taskModuleItems.id, id));
  }

  async reorderTaskModuleItems(moduleId: string, itemIds: string[]): Promise<void> {
    for (let i = 0; i < itemIds.length; i++) {
      await db.update(taskModuleItems)
        .set({ itemOrder: i, updatedAt: new Date() })
        .where(and(
          eq(taskModuleItems.id, itemIds[i]),
          eq(taskModuleItems.moduleId, moduleId)
        ));
    }
  }

  // ============================================
  // Folder System Implementation
  // ============================================

  // Folders
  async getFolders(workspaceId: string): Promise<Folder[]> {
    return db.select().from(folders)
      .where(eq(folders.workspaceId, workspaceId))
      .orderBy(desc(folders.createdAt));
  }

  async getFolder(id: string): Promise<Folder | undefined> {
    const [folder] = await db.select().from(folders).where(eq(folders.id, id));
    return folder;
  }

  async getFolderWithItems(id: string): Promise<FolderWithItems | undefined> {
    const folder = await this.getFolder(id);
    if (!folder) return undefined;
    
    const items = await this.getFolderItems(id);
    return { ...folder, items };
  }

  async createFolder(data: InsertFolder): Promise<Folder> {
    const [folder] = await db.insert(folders).values(data).returning();
    return folder;
  }

  async updateFolder(id: string, data: Partial<InsertFolder>): Promise<Folder | undefined> {
    const [folder] = await db.update(folders)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(folders.id, id))
      .returning();
    return folder;
  }

  async deleteFolder(id: string): Promise<void> {
    // First delete all items in the folder
    await db.delete(folderItems).where(eq(folderItems.folderId, id));
    // Then delete the folder
    await db.delete(folders).where(eq(folders.id, id));
  }

  // Folder Items
  async getFolderItems(folderId: string): Promise<FolderItem[]> {
    return db.select().from(folderItems)
      .where(eq(folderItems.folderId, folderId))
      .orderBy(desc(folderItems.createdAt));
  }

  async getAllFolderItems(workspaceId: string): Promise<(FolderItem & { folder: Folder })[]> {
    const results = await db.select({
      id: folderItems.id,
      workspaceId: folderItems.workspaceId,
      folderId: folderItems.folderId,
      type: folderItems.type,
      name: folderItems.name,
      description: folderItems.description,
      fileUrl: folderItems.fileUrl,
      fileType: folderItems.fileType,
      fileSize: folderItems.fileSize,
      mimeType: folderItems.mimeType,
      linkUrl: folderItems.linkUrl,
      linkType: folderItems.linkType,
      thumbnailUrl: folderItems.thumbnailUrl,
      metadata: folderItems.metadata,
      createdBy: folderItems.createdBy,
      createdAt: folderItems.createdAt,
      updatedAt: folderItems.updatedAt,
      folder: folders,
    })
      .from(folderItems)
      .innerJoin(folders, eq(folderItems.folderId, folders.id))
      .where(eq(folderItems.workspaceId, workspaceId))
      .orderBy(desc(folderItems.createdAt));
    
    return results as (FolderItem & { folder: Folder })[];
  }

  async getFolderItem(id: string): Promise<FolderItem | undefined> {
    const [item] = await db.select().from(folderItems).where(eq(folderItems.id, id));
    return item;
  }

  async createFolderItem(data: InsertFolderItem): Promise<FolderItem> {
    const [item] = await db.insert(folderItems).values(data).returning();
    return item;
  }

  async updateFolderItem(id: string, data: Partial<InsertFolderItem>): Promise<FolderItem | undefined> {
    const [item] = await db.update(folderItems)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(folderItems.id, id))
      .returning();
    return item;
  }

  async deleteFolderItem(id: string): Promise<void> {
    // First delete any task attachments using this item
    await db.delete(taskAttachments).where(eq(taskAttachments.folderItemId, id));
    // Then delete the item
    await db.delete(folderItems).where(eq(folderItems.id, id));
  }

  // Task Attachments
  async getTaskAttachment(id: string): Promise<TaskAttachment | undefined> {
    const [attachment] = await db.select().from(taskAttachments).where(eq(taskAttachments.id, id));
    return attachment;
  }

  async getTaskAttachments(taskId: string): Promise<(TaskAttachment & { folderItem: FolderItem & { folder: Folder } })[]> {
    const results = await db.select({
      id: taskAttachments.id,
      taskId: taskAttachments.taskId,
      subTaskId: taskAttachments.subTaskId,
      folderItemId: taskAttachments.folderItemId,
      workspaceId: taskAttachments.workspaceId,
      attachedBy: taskAttachments.attachedBy,
      attachedAt: taskAttachments.attachedAt,
      folderItem: {
        id: folderItems.id,
        workspaceId: folderItems.workspaceId,
        folderId: folderItems.folderId,
        type: folderItems.type,
        name: folderItems.name,
        description: folderItems.description,
        fileUrl: folderItems.fileUrl,
        fileType: folderItems.fileType,
        fileSize: folderItems.fileSize,
        mimeType: folderItems.mimeType,
        linkUrl: folderItems.linkUrl,
        linkType: folderItems.linkType,
        thumbnailUrl: folderItems.thumbnailUrl,
        metadata: folderItems.metadata,
        createdBy: folderItems.createdBy,
        createdAt: folderItems.createdAt,
        updatedAt: folderItems.updatedAt,
      },
    })
      .from(taskAttachments)
      .innerJoin(folderItems, eq(taskAttachments.folderItemId, folderItems.id))
      .where(eq(taskAttachments.taskId, taskId));

    // Fetch folder info for each item
    const itemsWithFolders = await Promise.all(results.map(async (r) => {
      const [folder] = await db.select().from(folders).where(eq(folders.id, r.folderItem.folderId));
      return {
        ...r,
        folderItem: {
          ...r.folderItem,
          folder,
        },
      } as TaskAttachment & { folderItem: FolderItem & { folder: Folder } };
    }));

    return itemsWithFolders;
  }

  async getTaskAttachmentsByItem(folderItemId: string): Promise<TaskAttachment[]> {
    return db.select().from(taskAttachments)
      .where(eq(taskAttachments.folderItemId, folderItemId));
  }

  async createTaskAttachment(data: InsertTaskAttachment): Promise<TaskAttachment> {
    const [attachment] = await db.insert(taskAttachments).values(data).returning();
    return attachment;
  }

  async deleteTaskAttachment(id: string): Promise<void> {
    await db.delete(taskAttachments).where(eq(taskAttachments.id, id));
  }

  // Notion Connections
  async getNotionConnection(id: string): Promise<NotionConnection | undefined> {
    const [connection] = await db.select().from(notionConnections).where(eq(notionConnections.id, id));
    return connection;
  }

  async getNotionConnectionByWorkspace(workspaceId: string): Promise<NotionConnection | undefined> {
    const [connection] = await db.select().from(notionConnections).where(eq(notionConnections.workspaceId, workspaceId));
    return connection;
  }

  async getNotionConnectionByBotId(botId: string): Promise<NotionConnection | undefined> {
    const [connection] = await db.select().from(notionConnections).where(eq(notionConnections.botId, botId));
    return connection;
  }

  async createNotionConnection(data: InsertNotionConnection): Promise<NotionConnection> {
    const [connection] = await db.insert(notionConnections).values(data).returning();
    return connection;
  }

  async updateNotionConnection(id: string, data: Partial<InsertNotionConnection>): Promise<NotionConnection | undefined> {
    const [connection] = await db.update(notionConnections)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(notionConnections.id, id))
      .returning();
    return connection;
  }

  async deleteNotionConnection(id: string): Promise<void> {
    await db.delete(notionConnections).where(eq(notionConnections.id, id));
  }

  // Reports
  async getReport(id: string): Promise<Report | undefined> {
    const [report] = await db.select().from(reports).where(eq(reports.id, id));
    return report;
  }

  async getReportsByWorkspace(workspaceId: string): Promise<Report[]> {
    return db.select().from(reports)
      .where(eq(reports.workspaceId, workspaceId))
      .orderBy(desc(reports.createdAt));
  }

  async createReport(data: InsertReport): Promise<Report> {
    const [report] = await db.insert(reports).values(data).returning();
    return report;
  }

  async updateReport(id: string, data: Partial<InsertReport>): Promise<Report | undefined> {
    const [report] = await db.update(reports)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(reports.id, id))
      .returning();
    return report;
  }

  async deleteReport(id: string): Promise<void> {
    await db.delete(reports).where(eq(reports.id, id));
  }

  // Role Permissions
  async getRolePermissions(): Promise<RolePermission[]> {
    return db.select().from(rolePermissions);
  }

  async getRolePermissionsByRole(role: string): Promise<RolePermission[]> {
    return db.select().from(rolePermissions).where(eq(rolePermissions.role, role));
  }

  async getRolePermission(role: string, navItemId: string): Promise<RolePermission | undefined> {
    const [permission] = await db.select().from(rolePermissions)
      .where(and(
        eq(rolePermissions.role, role),
        eq(rolePermissions.navItemId, navItemId)
      ));
    return permission;
  }

  async upsertRolePermission(role: string, navItemId: string, enabled: boolean): Promise<RolePermission> {
    const existing = await this.getRolePermission(role, navItemId);
    if (existing) {
      const [updated] = await db.update(rolePermissions)
        .set({ enabled: enabled ? "true" : "false", updatedAt: new Date() })
        .where(eq(rolePermissions.id, existing.id))
        .returning();
      return updated;
    } else {
      const [created] = await db.insert(rolePermissions)
        .values({ role, navItemId, enabled: enabled ? "true" : "false" })
        .returning();
      return created;
    }
  }

  async initializeDefaultPermissions(navItemIds: string[]): Promise<void> {
    const roles = ["user_manager", "user_staff"];
    for (const role of roles) {
      for (const navItemId of navItemIds) {
        const existing = await this.getRolePermission(role, navItemId);
        if (!existing) {
          await db.insert(rolePermissions)
            .values({ role, navItemId, enabled: "true" })
            .onConflictDoNothing();
        }
      }
    }
  }

  // ============================================================
  // Cleaner Scheduling System
  // ============================================================

  async getCleanersByWorkspace(workspaceId: string): Promise<Cleaner[]> {
    return db.select().from(cleaners)
      .where(eq(cleaners.workspaceId, workspaceId))
      .orderBy(cleaners.name);
  }

  async getCleaner(id: string): Promise<Cleaner | undefined> {
    const [cleaner] = await db.select().from(cleaners).where(eq(cleaners.id, id));
    return cleaner;
  }

  async getCleanerByInviteToken(token: string): Promise<Cleaner | undefined> {
    const [cleaner] = await db.select().from(cleaners).where(eq(cleaners.inviteToken, token));
    return cleaner;
  }

  async getCleanersByUserId(userId: string): Promise<Cleaner[]> {
    return db.select().from(cleaners).where(eq(cleaners.userId, userId));
  }

  async getCleanerWithAssignments(id: string): Promise<CleanerWithAssignments | undefined> {
    const cleaner = await this.getCleaner(id);
    if (!cleaner) return undefined;

    const assignmentRows = await db.select({
      assignment: cleanerAssignments,
      listingId: listings.id,
      listingName: listings.name,
      listingInternalName: listings.internalName,
      listingImageUrl: listings.imageUrl,
      listingAddress: listings.address,
      procedureId: procedures.id,
      procedureTitle: procedures.title,
    })
      .from(cleanerAssignments)
      .leftJoin(listings, eq(cleanerAssignments.listingId, listings.id))
      .leftJoin(procedures, eq(cleanerAssignments.procedureId, procedures.id))
      .where(eq(cleanerAssignments.cleanerId, id));

    const members = (cleaner.type === 'company' || cleaner.type === 'cleaning_manager')
      ? await db.select().from(cleaners).where(and(eq(cleaners.parentId, id), eq(cleaners.isActive, true))).orderBy(cleaners.name)
      : undefined;

    return {
      ...cleaner,
      assignments: assignmentRows.map(row => ({
        ...row.assignment,
        listing: row.listingId ? {
          id: row.listingId,
          name: row.listingName || "",
          internalName: row.listingInternalName || null,
          imageUrl: row.listingImageUrl,
          address: row.listingAddress,
        } : undefined,
        procedure: row.procedureId ? {
          id: row.procedureId,
          title: row.procedureTitle || "",
        } : null,
      })),
      members,
    };
  }

  async getCompanyMembers(companyId: string): Promise<Cleaner[]> {
    return db.select().from(cleaners)
      .where(and(eq(cleaners.parentId, companyId), eq(cleaners.isActive, true)))
      .orderBy(cleaners.name);
  }

  async findCleanerByEmailOrPhone(workspaceId: string, email: string | null, phone: string | null): Promise<Cleaner | undefined> {
    const conditions = [eq(cleaners.workspaceId, workspaceId)];
    const orConditions = [];
    if (email) orConditions.push(eq(cleaners.email, email));
    if (phone) orConditions.push(eq(cleaners.phone, phone));
    if (orConditions.length === 0) return undefined;
    const [match] = await db.select().from(cleaners)
      .where(and(...conditions, or(...orConditions)))
      .limit(1);
    return match;
  }

  async createCleaner(data: InsertCleaner): Promise<Cleaner> {
    const [cleaner] = await db.insert(cleaners).values(data).returning();
    return cleaner;
  }

  async updateCleaner(id: string, data: Partial<InsertCleaner>): Promise<Cleaner> {
    const [cleaner] = await db.update(cleaners)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(cleaners.id, id))
      .returning();
    return cleaner;
  }

  async getMemberDependencies(memberId: string): Promise<{
    activeTasks: { id: string; listingName: string; scheduledDate: Date; guestName: string | null }[];
    autoAssignRules: { id: string; listingName: string }[];
  }> {
    const activeTasks = await db.select({
      id: cleaningTasks.id,
      listingName: listings.name,
      scheduledDate: cleaningTasks.scheduledDate,
      guestName: cleaningTasks.guestName,
    })
      .from(cleaningTasks)
      .leftJoin(listings, eq(cleaningTasks.listingId, listings.id))
      .where(and(
        eq(cleaningTasks.assignedMemberId, memberId),
        inArray(cleaningTasks.status, ['scheduled', 'in_progress'])
      ));

    const autoAssignRules = await db.select({
      id: cleanerAssignments.id,
      listingName: listings.name,
    })
      .from(cleanerAssignments)
      .leftJoin(listings, eq(cleanerAssignments.listingId, listings.id))
      .where(and(
        eq(cleanerAssignments.defaultMemberId, memberId),
        eq(cleanerAssignments.assignmentMode, 'auto')
      ));

    return {
      activeTasks: activeTasks.map(t => ({ ...t, listingName: t.listingName || 'Unknown' })),
      autoAssignRules: autoAssignRules.map(r => ({ ...r, listingName: r.listingName || 'Unknown' })),
    };
  }

  async reassignMemberAndDelete(memberId: string, replacementId: string | null): Promise<void> {
    if (replacementId) {
      await db.update(cleaningTasks)
        .set({ assignedMemberId: replacementId })
        .where(and(
          eq(cleaningTasks.assignedMemberId, memberId),
          inArray(cleaningTasks.status, ['scheduled', 'in_progress'])
        ));
      await db.update(cleanerAssignments)
        .set({ defaultMemberId: replacementId })
        .where(and(
          eq(cleanerAssignments.defaultMemberId, memberId),
          eq(cleanerAssignments.assignmentMode, 'auto')
        ));
    } else {
      await db.update(cleaningTasks)
        .set({ assignedMemberId: null })
        .where(and(
          eq(cleaningTasks.assignedMemberId, memberId),
          inArray(cleaningTasks.status, ['scheduled', 'in_progress'])
        ));
      await db.update(cleanerAssignments)
        .set({ defaultMemberId: null, assignmentMode: 'manual' })
        .where(and(
          eq(cleanerAssignments.defaultMemberId, memberId),
          eq(cleanerAssignments.assignmentMode, 'auto')
        ));
    }
    await db.delete(cleaners).where(eq(cleaners.id, memberId));
  }

  async deleteCleaner(id: string): Promise<void> {
    const childMembers = await db.select({ id: cleaners.id }).from(cleaners).where(eq(cleaners.parentId, id));
    const childIds = childMembers.map(m => m.id);

    const allIds = [id, ...childIds];

    for (const cid of allIds) {
      await db.delete(cleanerAssignments).where(eq(cleanerAssignments.cleanerId, cid));
      await db.delete(cleaningTaskItems)
        .where(inArray(cleaningTaskItems.cleaningTaskId,
          db.select({ id: cleaningTasks.id }).from(cleaningTasks).where(eq(cleaningTasks.cleanerId, cid))
        ));
      await db.delete(cleaningTasks).where(eq(cleaningTasks.cleanerId, cid));
    }

    if (childIds.length > 0) {
      await db.delete(cleaners).where(inArray(cleaners.id, childIds));
    }
    await db.delete(cleaners).where(eq(cleaners.id, id));
  }

  // Cleaner Assignments
  async getAssignmentById(id: string): Promise<CleanerAssignment | undefined> {
    const [assignment] = await db.select().from(cleanerAssignments)
      .where(eq(cleanerAssignments.id, id));
    return assignment;
  }

  async getAssignmentsByWorkspace(workspaceId: string): Promise<CleanerAssignment[]> {
    return db.select().from(cleanerAssignments)
      .where(eq(cleanerAssignments.workspaceId, workspaceId));
  }

  async getAssignmentsByCleaner(cleanerId: string): Promise<CleanerAssignment[]> {
    return db.select().from(cleanerAssignments)
      .where(eq(cleanerAssignments.cleanerId, cleanerId));
  }

  async getAssignmentsByListing(listingId: string): Promise<CleanerAssignment[]> {
    return db.select().from(cleanerAssignments)
      .where(eq(cleanerAssignments.listingId, listingId));
  }

  async createAssignment(data: InsertCleanerAssignment): Promise<CleanerAssignment> {
    const [assignment] = await db.insert(cleanerAssignments).values(data).returning();
    return assignment;
  }

  async updateAssignment(id: string, data: Partial<InsertCleanerAssignment>): Promise<CleanerAssignment> {
    const [assignment] = await db.update(cleanerAssignments)
      .set(data)
      .where(eq(cleanerAssignments.id, id))
      .returning();
    return assignment;
  }

  async deleteAssignment(id: string): Promise<void> {
    await db.delete(cleanerAssignments).where(eq(cleanerAssignments.id, id));
  }

  // Turnovers (reservation-based view with optional cleaning task data)
  async getTurnoversByWorkspace(workspaceId: string, options?: {
    fromDate?: Date;
    toDate?: Date;
    cleanerId?: string;
    status?: string;
    offeredFilter?: string;
  }): Promise<any[]> {
    const conditions = [eq(reservations.workspaceId, workspaceId)];
    if (options?.fromDate) conditions.push(gte(reservations.checkOutDate, options.fromDate));
    if (options?.toDate) conditions.push(lte(reservations.checkOutDate, options.toDate));

    const rows = await db.select({
      reservation: reservations,
      listingName: listings.name,
      listingInternalName: listings.internalName,
      listingImageUrl: listings.imageUrl,
      listingAddress: listings.address,
      cleaningTaskId: cleaningTasks.id,
      cleaningTaskStatus: cleaningTasks.status,
      cleaningTaskCleanerId: cleaningTasks.cleanerId,
      cleaningTaskAssignedMemberId: cleaningTasks.assignedMemberId,
      cleaningTaskCleanerAccepted: cleaningTasks.cleanerAccepted,
      cleaningTaskCleanerAcceptedAt: cleaningTasks.cleanerAcceptedAt,
      cleaningTaskScheduledDate: cleaningTasks.scheduledDate,
      cleaningTaskGuestCheckoutTime: cleaningTasks.guestCheckoutTime,
      cleanerName: cleaners.name,
      cleanerEmail: cleaners.email,
      cleanerPhone: cleaners.phone,
      cleanerType: cleaners.type,
    })
      .from(reservations)
      .leftJoin(listings, eq(reservations.listingId, listings.id))
      .leftJoin(cleaningTasks, eq(cleaningTasks.reservationId, reservations.id))
      .leftJoin(cleaners, eq(cleaningTasks.cleanerId, cleaners.id))
      .where(and(...conditions))
      .orderBy(reservations.checkOutDate);

    let result = rows.map(row => {
      const hasTask = !!row.cleaningTaskId;
      return {
        reservationId: row.reservation.id,
        listingId: row.reservation.listingId,
        guestName: row.reservation.guestName,
        confirmationCode: row.reservation.confirmationCode,
        platform: row.reservation.platform,
        reservationStatus: row.reservation.status,
        checkInDate: row.reservation.checkInDate ? row.reservation.checkInDate.toISOString() : null,
        checkOutDate: row.reservation.checkOutDate ? row.reservation.checkOutDate.toISOString() : null,
        listing: {
          id: row.reservation.listingId,
          name: row.listingName || "",
          internalName: row.listingInternalName || null,
          imageUrl: row.listingImageUrl,
          address: row.listingAddress,
        },
        offered: hasTask,
        cleaningTask: hasTask ? {
          id: row.cleaningTaskId!,
          status: row.cleaningTaskStatus,
          cleanerId: row.cleaningTaskCleanerId,
          assignedMemberId: row.cleaningTaskAssignedMemberId,
          cleanerAccepted: row.cleaningTaskCleanerAccepted,
          cleanerAcceptedAt: row.cleaningTaskCleanerAcceptedAt,
          scheduledDate: row.cleaningTaskScheduledDate,
          guestCheckoutTime: row.cleaningTaskGuestCheckoutTime,
        } : null,
        cleaner: hasTask && row.cleanerName ? {
          id: row.cleaningTaskCleanerId,
          name: row.cleanerName,
          email: row.cleanerEmail,
          phone: row.cleanerPhone,
          type: row.cleanerType || "individual",
        } : null,
      };
    });

    if (options?.cleanerId && options.cleanerId !== "all") {
      result = result.filter(r => r.cleaner?.id === options.cleanerId);
    }
    if (options?.offeredFilter === "yes") {
      result = result.filter(r => r.offered);
    } else if (options?.offeredFilter === "no") {
      result = result.filter(r => !r.offered);
    }
    if (options?.status && options.status !== "all") {
      result = result.filter(r => {
        const taskStatus = r.cleaningTask?.status;
        const checkOutDate = r.checkOutDate;
        switch (options.status) {
          case "upcoming": {
            if (!r.cleaningTask) return true;
            if (taskStatus === "scheduled") {
              if (checkOutDate) {
                return new Date() < new Date(checkOutDate);
              }
              return true;
            }
            return false;
          }
          case "pending_start": {
            if (!r.cleaningTask || taskStatus !== "scheduled") return false;
            if (checkOutDate) {
              return new Date() >= new Date(checkOutDate);
            }
            return false;
          }
          case "in_progress":
            return taskStatus === "in_progress";
          case "completed":
            return taskStatus === "completed";
          case "cancelled":
            return taskStatus === "cancelled";
          default:
            return true;
        }
      });
    }

    // Fetch assigned member names
    const memberIds = Array.from(new Set(result.filter(r => r.cleaningTask?.assignedMemberId).map(r => r.cleaningTask!.assignedMemberId!)));
    let membersMap: Record<string, { id: string; name: string; email: string | null; phone: string | null }> = {};
    if (memberIds.length > 0) {
      const memberRows = await db.select().from(cleaners).where(inArray(cleaners.id, memberIds));
      for (const m of memberRows) {
        membersMap[m.id] = { id: m.id, name: m.name, email: m.email, phone: m.phone };
      }
    }
    for (const r of result) {
      (r as any).assignedMember = r.cleaningTask?.assignedMemberId ? membersMap[r.cleaningTask.assignedMemberId] || null : null;
    }

    // Fetch cleaner assignment info per listing (shows assigned company/cleaner and mode even for un-offered turnovers)
    const listingIds = Array.from(new Set(result.map(r => r.listingId).filter(Boolean)));
    let assignmentsByListing: Record<string, { cleanerId: string; cleanerName: string; cleanerType: string; assignmentMode: string; defaultMemberId: string | null; assignmentId: string }> = {};
    if (listingIds.length > 0) {
      const assignmentRows = await db.select({
        assignmentId: cleanerAssignments.id,
        listingId: cleanerAssignments.listingId,
        cleanerId: cleanerAssignments.cleanerId,
        assignmentMode: cleanerAssignments.assignmentMode,
        defaultMemberId: cleanerAssignments.defaultMemberId,
        cleanerName: cleaners.name,
        cleanerType: cleaners.type,
      })
        .from(cleanerAssignments)
        .innerJoin(cleaners, eq(cleanerAssignments.cleanerId, cleaners.id))
        .where(and(
          eq(cleanerAssignments.workspaceId, workspaceId),
          eq(cleanerAssignments.isActive, true),
          inArray(cleanerAssignments.listingId, listingIds)
        ));
      for (const a of assignmentRows) {
        assignmentsByListing[a.listingId] = {
          cleanerId: a.cleanerId,
          cleanerName: a.cleanerName,
          cleanerType: a.cleanerType || "individual",
          assignmentMode: a.assignmentMode,
          defaultMemberId: a.defaultMemberId,
          assignmentId: a.assignmentId,
        };
      }
    }
    for (const r of result) {
      const assignment = assignmentsByListing[r.listingId] || null;
      (r as any).assignment = assignment ? {
        assignmentId: assignment.assignmentId,
        cleanerId: assignment.cleanerId,
        cleanerName: assignment.cleanerName,
        cleanerType: assignment.cleanerType,
        assignmentMode: assignment.assignmentMode,
        defaultMemberId: assignment.defaultMemberId,
      } : null;
    }

    return result;
  }

  // Cleaning Tasks
  async getCleaningTasksByWorkspace(workspaceId: string, options?: {
    status?: string;
    cleanerId?: string;
    listingId?: string;
    fromDate?: Date;
    toDate?: Date;
  }): Promise<CleaningTaskWithDetails[]> {
    const conditions = [eq(cleaningTasks.workspaceId, workspaceId)];
    if (options?.status) conditions.push(eq(cleaningTasks.status, options.status));
    if (options?.cleanerId) conditions.push(eq(cleaningTasks.cleanerId, options.cleanerId));
    if (options?.listingId) conditions.push(eq(cleaningTasks.listingId, options.listingId));
    if (options?.fromDate) conditions.push(gte(cleaningTasks.scheduledDate, options.fromDate));
    if (options?.toDate) conditions.push(lte(cleaningTasks.scheduledDate, options.toDate));

    const rows = await db.select({
      task: cleaningTasks,
      cleanerName: cleaners.name,
      cleanerEmail: cleaners.email,
      cleanerPhone: cleaners.phone,
      cleanerType: cleaners.type,
      listingName: listings.name,
      listingInternalName: listings.internalName,
      listingImageUrl: listings.imageUrl,
      listingAddress: listings.address,
      reservationStatus: reservations.status,
      reservationCheckInDate: reservations.checkInDate,
      reservationCheckOutDate: reservations.checkOutDate,
      reservationConfirmationCode: reservations.confirmationCode,
      reservationPlatform: reservations.platform,
    })
      .from(cleaningTasks)
      .leftJoin(cleaners, eq(cleaningTasks.cleanerId, cleaners.id))
      .leftJoin(listings, eq(cleaningTasks.listingId, listings.id))
      .leftJoin(reservations, eq(cleaningTasks.reservationId, reservations.id))
      .where(and(...conditions))
      .orderBy(cleaningTasks.scheduledDate);

    const taskIds = rows.map(r => r.task.id);
    let itemsByTask: Record<string, CleaningTaskItem[]> = {};
    if (taskIds.length > 0) {
      const allItems = await db.select().from(cleaningTaskItems)
        .where(inArray(cleaningTaskItems.cleaningTaskId, taskIds))
        .orderBy(cleaningTaskItems.stepOrder);
      for (const item of allItems) {
        if (!itemsByTask[item.cleaningTaskId]) itemsByTask[item.cleaningTaskId] = [];
        itemsByTask[item.cleaningTaskId].push(item);
      }
    }

    const memberIds = Array.from(new Set(rows.filter(r => r.task.assignedMemberId).map(r => r.task.assignedMemberId!)));
    let membersMap: Record<string, { id: string; name: string; email: string | null; phone: string | null }> = {};
    if (memberIds.length > 0) {
      const memberRows = await db.select().from(cleaners).where(inArray(cleaners.id, memberIds));
      for (const m of memberRows) {
        membersMap[m.id] = { id: m.id, name: m.name, email: m.email, phone: m.phone };
      }
    }

    return rows.map(row => ({
      ...row.task,
      cleaner: {
        id: row.task.cleanerId,
        name: row.cleanerName || "",
        email: row.cleanerEmail,
        phone: row.cleanerPhone,
        type: row.cleanerType || "individual",
      },
      assignedMember: row.task.assignedMemberId ? membersMap[row.task.assignedMemberId] || null : null,
      listing: {
        id: row.task.listingId,
        name: row.listingName || "",
        internalName: row.listingInternalName || null,
        imageUrl: row.listingImageUrl,
        address: row.listingAddress,
      },
      reservation: row.task.reservationId ? {
        id: row.task.reservationId,
        status: row.reservationStatus || "confirmed",
        checkInDate: row.reservationCheckInDate ? row.reservationCheckInDate.toISOString() : null,
        checkOutDate: row.reservationCheckOutDate ? row.reservationCheckOutDate.toISOString() : null,
        confirmationCode: row.reservationConfirmationCode || null,
        platform: row.reservationPlatform || "Airbnb",
      } : null,
      items: itemsByTask[row.task.id] || [],
    }));
  }

  async getCleaningTask(id: string): Promise<CleaningTaskWithDetails | undefined> {
    const [row] = await db.select({
      task: cleaningTasks,
      cleanerName: cleaners.name,
      cleanerEmail: cleaners.email,
      cleanerPhone: cleaners.phone,
      cleanerType: cleaners.type,
      listingName: listings.name,
      listingInternalName: listings.internalName,
      listingImageUrl: listings.imageUrl,
      listingAddress: listings.address,
    })
      .from(cleaningTasks)
      .leftJoin(cleaners, eq(cleaningTasks.cleanerId, cleaners.id))
      .leftJoin(listings, eq(cleaningTasks.listingId, listings.id))
      .where(eq(cleaningTasks.id, id));

    if (!row) return undefined;

    const items = await db.select().from(cleaningTaskItems)
      .where(eq(cleaningTaskItems.cleaningTaskId, id))
      .orderBy(cleaningTaskItems.stepOrder);

    let assignedMember = null;
    if (row.task.assignedMemberId) {
      const [member] = await db.select().from(cleaners).where(eq(cleaners.id, row.task.assignedMemberId));
      if (member) assignedMember = { id: member.id, name: member.name, email: member.email, phone: member.phone };
    }

    return {
      ...row.task,
      cleaner: {
        id: row.task.cleanerId,
        name: row.cleanerName || "",
        email: row.cleanerEmail,
        phone: row.cleanerPhone,
        type: row.cleanerType || "individual",
      },
      assignedMember,
      listing: {
        id: row.task.listingId,
        name: row.listingName || "",
        internalName: row.listingInternalName || null,
        imageUrl: row.listingImageUrl,
        address: row.listingAddress,
      },
      items,
    };
  }

  async getCleaningTaskByToken(accessToken: string): Promise<CleaningTaskWithDetails | undefined> {
    const [row] = await db.select({
      task: cleaningTasks,
      cleanerName: cleaners.name,
      cleanerEmail: cleaners.email,
      cleanerPhone: cleaners.phone,
      listingName: listings.name,
      listingInternalName: listings.internalName,
      listingImageUrl: listings.imageUrl,
      listingAddress: listings.address,
    })
      .from(cleaningTasks)
      .leftJoin(cleaners, eq(cleaningTasks.cleanerId, cleaners.id))
      .leftJoin(listings, eq(cleaningTasks.listingId, listings.id))
      .where(eq(cleaningTasks.accessToken, accessToken));

    if (!row) return undefined;

    const items = await db.select().from(cleaningTaskItems)
      .where(eq(cleaningTaskItems.cleaningTaskId, row.task.id))
      .orderBy(cleaningTaskItems.stepOrder);

    return {
      ...row.task,
      cleaner: {
        id: row.task.cleanerId,
        name: row.cleanerName || "",
        email: row.cleanerEmail,
        phone: row.cleanerPhone,
      },
      listing: {
        id: row.task.listingId,
        name: row.listingName || "",
        internalName: row.listingInternalName || null,
        imageUrl: row.listingImageUrl,
        address: row.listingAddress,
      },
      items,
    };
  }

  async createCleaningTask(data: InsertCleaningTask): Promise<CleaningTask> {
    const [task] = await db.insert(cleaningTasks).values(data).returning();
    return task;
  }

  async updateCleaningTask(id: string, data: Partial<InsertCleaningTask>): Promise<CleaningTask> {
    const [task] = await db.update(cleaningTasks)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(cleaningTasks.id, id))
      .returning();
    return task;
  }

  async deleteCleaningTask(id: string): Promise<void> {
    await db.delete(cleaningTaskItems).where(eq(cleaningTaskItems.cleaningTaskId, id));
    await db.delete(cleaningTasks).where(eq(cleaningTasks.id, id));
  }

  // Check for existing cleaning task to avoid duplicates
  async findExistingCleaningTask(workspaceId: string, listingId: string, reservationId: string): Promise<CleaningTask | undefined> {
    const [task] = await db.select().from(cleaningTasks)
      .where(and(
        eq(cleaningTasks.workspaceId, workspaceId),
        eq(cleaningTasks.listingId, listingId),
        eq(cleaningTasks.reservationId, reservationId)
      ));
    return task;
  }

  // Cleaning Task Items
  async createCleaningTaskItems(items: InsertCleaningTaskItem[]): Promise<CleaningTaskItem[]> {
    if (items.length === 0) return [];
    return db.insert(cleaningTaskItems).values(items).returning();
  }

  async updateCleaningTaskItem(id: string, data: Partial<InsertCleaningTaskItem>): Promise<CleaningTaskItem> {
    const [item] = await db.update(cleaningTaskItems)
      .set(data)
      .where(eq(cleaningTaskItems.id, id))
      .returning();
    return item;
  }

  async toggleCleaningTaskItemCompletion(id: string, isCompleted: boolean): Promise<CleaningTaskItem> {
    const [item] = await db.update(cleaningTaskItems)
      .set({
        isCompleted,
        completedAt: isCompleted ? new Date() : null,
      })
      .where(eq(cleaningTaskItems.id, id))
      .returning();
    return item;
  }

  // Get tasks that need reminders sent
  async getCleaningTasksNeedingReminders(targetDate: Date): Promise<CleaningTaskWithDetails[]> {
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    return this.getCleaningTasksByWorkspace("", {
      fromDate: startOfDay,
      toDate: endOfDay,
      status: "scheduled",
    });
  }

  async getUnsentCleaningReminders(scheduledDate: Date): Promise<CleaningTaskWithDetails[]> {
    const startOfDay = new Date(scheduledDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(scheduledDate);
    endOfDay.setHours(23, 59, 59, 999);

    const rows = await db.select({
      task: cleaningTasks,
      cleanerName: cleaners.name,
      cleanerEmail: cleaners.email,
      cleanerPhone: cleaners.phone,
      cleanerReminderTiming: cleaners.reminderTiming,
      cleanerReminderTime: cleaners.reminderTime,
      listingName: listings.name,
      listingInternalName: listings.internalName,
      listingImageUrl: listings.imageUrl,
      listingAddress: listings.address,
    })
      .from(cleaningTasks)
      .leftJoin(cleaners, eq(cleaningTasks.cleanerId, cleaners.id))
      .leftJoin(listings, eq(cleaningTasks.listingId, listings.id))
      .where(and(
        gte(cleaningTasks.scheduledDate, startOfDay),
        lte(cleaningTasks.scheduledDate, endOfDay),
        eq(cleaningTasks.status, "scheduled"),
        isNull(cleaningTasks.reminderSentAt)
      ));

    const taskIds = rows.map(r => r.task.id);
    let itemsByTask: Record<string, CleaningTaskItem[]> = {};
    if (taskIds.length > 0) {
      const allItems = await db.select().from(cleaningTaskItems)
        .where(inArray(cleaningTaskItems.cleaningTaskId, taskIds))
        .orderBy(cleaningTaskItems.stepOrder);
      for (const item of allItems) {
        if (!itemsByTask[item.cleaningTaskId]) itemsByTask[item.cleaningTaskId] = [];
        itemsByTask[item.cleaningTaskId].push(item);
      }
    }

    return rows.map(row => ({
      ...row.task,
      cleaner: {
        id: row.task.cleanerId,
        name: row.cleanerName || "",
        email: row.cleanerEmail,
        phone: row.cleanerPhone,
      },
      listing: {
        id: row.task.listingId,
        name: row.listingName || "",
        internalName: row.listingInternalName || null,
        imageUrl: row.listingImageUrl,
        address: row.listingAddress,
      },
      items: itemsByTask[row.task.id] || [],
    }));
  }

  // Notification Templates
  async getNotificationTemplatesByWorkspace(workspaceId: string): Promise<NotificationTemplate[]> {
    return db.select().from(notificationTemplates)
      .where(eq(notificationTemplates.workspaceId, workspaceId));
  }

  async getNotificationTemplate(workspaceId: string, type: string): Promise<NotificationTemplate | undefined> {
    const [template] = await db.select().from(notificationTemplates)
      .where(and(
        eq(notificationTemplates.workspaceId, workspaceId),
        eq(notificationTemplates.type, type)
      ));
    return template;
  }

  async upsertNotificationTemplate(data: InsertNotificationTemplate): Promise<NotificationTemplate> {
    const existing = await this.getNotificationTemplate(data.workspaceId, data.type);
    if (existing) {
      const [updated] = await db.update(notificationTemplates)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(notificationTemplates.id, existing.id))
        .returning();
      return updated;
    }
    const [created] = await db.insert(notificationTemplates).values(data).returning();
    return created;
  }

  async deleteNotificationTemplate(id: string): Promise<void> {
    await db.delete(notificationTemplates).where(eq(notificationTemplates.id, id));
  }

  // Cleaning Task lookup by reservation
  async getCleaningTasksByReservationId(reservationId: string): Promise<CleaningTaskWithDetails[]> {
    const rows = await db.select({
      task: cleaningTasks,
      cleanerName: cleaners.name,
      cleanerEmail: cleaners.email,
      cleanerPhone: cleaners.phone,
      listingName: listings.name,
      listingInternalName: listings.internalName,
      listingImageUrl: listings.imageUrl,
      listingAddress: listings.address,
    })
      .from(cleaningTasks)
      .leftJoin(cleaners, eq(cleaningTasks.cleanerId, cleaners.id))
      .leftJoin(listings, eq(cleaningTasks.listingId, listings.id))
      .where(eq(cleaningTasks.reservationId, reservationId));

    const taskIds = rows.map(r => r.task.id);
    let itemsByTask: Record<string, CleaningTaskItem[]> = {};
    if (taskIds.length > 0) {
      const allItems = await db.select().from(cleaningTaskItems)
        .where(inArray(cleaningTaskItems.cleaningTaskId, taskIds))
        .orderBy(cleaningTaskItems.stepOrder);
      for (const item of allItems) {
        if (!itemsByTask[item.cleaningTaskId]) itemsByTask[item.cleaningTaskId] = [];
        itemsByTask[item.cleaningTaskId].push(item);
      }
    }

    return rows.map(row => ({
      ...row.task,
      cleaner: {
        id: row.task.cleanerId,
        name: row.cleanerName || "",
        email: row.cleanerEmail,
        phone: row.cleanerPhone,
      },
      listing: {
        id: row.task.listingId,
        name: row.listingName || "",
        internalName: row.listingInternalName || null,
        imageUrl: row.listingImageUrl,
        address: row.listingAddress,
      },
      items: itemsByTask[row.task.id] || [],
    }));
  }

  // Review Removal Cases
  async getReviewRemovalCase(id: string): Promise<ReviewRemovalCase | undefined> {
    const [c] = await db.select().from(reviewRemovalCases).where(eq(reviewRemovalCases.id, id));
    return c;
  }

  async getReviewRemovalCasesByWorkspace(workspaceId: string): Promise<ReviewRemovalCase[]> {
    return db.select().from(reviewRemovalCases)
      .where(eq(reviewRemovalCases.workspaceId, workspaceId))
      .orderBy(desc(reviewRemovalCases.createdAt));
  }

  async getReviewRemovalCaseByReservation(reservationId: string): Promise<ReviewRemovalCase | undefined> {
    const [c] = await db.select().from(reviewRemovalCases)
      .where(eq(reviewRemovalCases.reservationId, reservationId));
    return c;
  }

  async createReviewRemovalCase(data: InsertReviewRemovalCase): Promise<ReviewRemovalCase> {
    const [c] = await db.insert(reviewRemovalCases).values(data).returning();
    return c;
  }

  async updateReviewRemovalCase(id: string, data: Partial<InsertReviewRemovalCase>): Promise<ReviewRemovalCase | undefined> {
    const [c] = await db.update(reviewRemovalCases)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(reviewRemovalCases.id, id))
      .returning();
    return c;
  }
  async deleteReviewRemovalCase(id: string): Promise<boolean> {
    const result = await db.delete(reviewRemovalCases)
      .where(eq(reviewRemovalCases.id, id))
      .returning();
    return result.length > 0;
  }
}

export const storage = new DatabaseStorage();
