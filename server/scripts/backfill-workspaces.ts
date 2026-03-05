import { db } from "../db";
import { users, dataSources, listings, reservations, tags, themes, tasks, listingAnalyses, workspaces, workspaceMembers } from "../../shared/schema";
import { eq, isNull } from "drizzle-orm";
import { logger } from "../logger";

async function backfillWorkspaces() {
  logger.info('Backfill', 'Starting workspace backfill...');

  const allUsers = await db.select().from(users);
  logger.info('Backfill', `Found ${allUsers.length} users to process`);

  for (const user of allUsers) {
    logger.info('Backfill', `Processing user ${user.id} (${user.email})...`);

    const existingMemberships = await db
      .select()
      .from(workspaceMembers)
      .where(eq(workspaceMembers.userId, user.id));

    if (existingMemberships.length > 0) {
      logger.info('Backfill', `  User already has ${existingMemberships.length} workspace(s), skipping`);
      continue;
    }

    const userDataSources = await db
      .select()
      .from(dataSources)
      .where(eq(dataSources.userId, user.id));

    if (userDataSources.length === 0) {
      logger.info('Backfill', '  User has no data sources, creating default workspace');
      const [workspace] = await db
        .insert(workspaces)
        .values({
          name: user.firstName ? `${user.firstName}'s Workspace` : "My Workspace",
          propertyManagementSoftware: "none",
          createdBy: user.id,
        })
        .returning();

      await db.insert(workspaceMembers).values({
        workspaceId: workspace.id,
        userId: user.id,
        role: "owner",
        status: "active",
      });

      logger.info('Backfill', `  Created workspace ${workspace.id}`);
      continue;
    }

    logger.info('Backfill', `  User has ${userDataSources.length} data source(s)`);

    const [workspace] = await db
      .insert(workspaces)
      .values({
        name: user.firstName ? `${user.firstName}'s Workspace` : "My Workspace",
        propertyManagementSoftware: "hospitable",
        createdBy: user.id,
      })
      .returning();

    await db.insert(workspaceMembers).values({
      workspaceId: workspace.id,
      userId: user.id,
      role: "owner",
      status: "active",
    });

    logger.info('Backfill', `  Created workspace ${workspace.id}`);

    for (const ds of userDataSources) {
      await db
        .update(dataSources)
        .set({ workspaceId: workspace.id })
        .where(eq(dataSources.id, ds.id));
    }
    logger.info('Backfill', `  Updated ${userDataSources.length} data source(s)`);

    const userListings = await db
      .select()
      .from(listings)
      .where(eq(listings.userId, user.id));

    for (const listing of userListings) {
      await db
        .update(listings)
        .set({ workspaceId: workspace.id })
        .where(eq(listings.id, listing.id));
    }
    logger.info('Backfill', `  Updated ${userListings.length} listing(s)`);

    for (const listing of userListings) {
      await db
        .update(reservations)
        .set({ workspaceId: workspace.id })
        .where(eq(reservations.listingId, listing.id));

      await db
        .update(tags)
        .set({ workspaceId: workspace.id })
        .where(eq(tags.listingId, listing.id));

      await db
        .update(listingAnalyses)
        .set({ workspaceId: workspace.id })
        .where(eq(listingAnalyses.listingId, listing.id));

      await db
        .update(tasks)
        .set({ workspaceId: workspace.id })
        .where(eq(tasks.listingId, listing.id));
    }

    const userThemes = await db
      .select()
      .from(themes)
      .where(eq(themes.userId, user.id));

    for (const theme of userThemes) {
      await db
        .update(themes)
        .set({ workspaceId: workspace.id })
        .where(eq(themes.id, theme.id));
    }
    logger.info('Backfill', `  Updated ${userThemes.length} theme(s)`);
  }

  logger.info('Backfill', 'Workspace backfill complete!');
}

backfillWorkspaces()
  .then(() => process.exit(0))
  .catch((err) => {
    logger.error('Backfill', 'Backfill failed:', err);
    process.exit(1);
  });
