import type { Express, Request, Response } from "express";
import type { DatabaseStorage } from "../storage";
import { isAuthenticated } from "../replit_integrations/auth";
import { 
  normalizeChannel, 
  buildNotionTagProperties, 
  buildLegacyContentBlocks,
  buildCommonContentBlocks,
  NOTION_DATABASE_SCHEMAS 
} from "../services/notion";
import { logger } from "../logger";

function getWorkspaceId(req: Request): string | undefined {
  return req.headers['x-workspace-id'] as string | undefined;
}

export function registerNotionRoutes(app: Express, storage: DatabaseStorage): void {
  // Get Notion connection status for workspace (with path parameter)
  app.get("/api/notion/connection/:workspaceId", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const workspaceId = req.params.workspaceId;
      if (!workspaceId) {
        return res.status(400).json({ message: "Workspace ID required" });
      }
      
      const connection = await storage.getNotionConnectionByWorkspace(workspaceId);
      if (!connection) {
        return res.json({ connected: false });
      }
      
      res.json({
        connected: true,
        id: connection.id,
        notionWorkspaceName: connection.notionWorkspaceName,
        notionWorkspaceIcon: connection.notionWorkspaceIcon,
        selectedDatabaseId: connection.selectedDatabaseId,
        selectedDatabaseName: connection.selectedDatabaseName,
        autoSyncEnabled: connection.autoSyncEnabled,
        lastSyncAt: connection.lastSyncAt,
        createdAt: connection.createdAt,
        syncReservations: connection.syncReservations,
        syncConfirmedTasks: connection.syncConfirmedTasks,
        syncTags: connection.syncTags,
        reservationsDatabaseId: connection.reservationsDatabaseId,
        reservationsDatabaseName: connection.reservationsDatabaseName,
        tasksDatabaseId: connection.tasksDatabaseId,
        tasksDatabaseName: connection.tasksDatabaseName,
        tagsDatabaseId: connection.tagsDatabaseId,
        tagsDatabaseName: connection.tagsDatabaseName,
        propertyFilter: connection.propertyFilter,
      });
    } catch (error) {
      logger.error('Notion', 'Error getting connection:', error);
      res.status(500).json({ message: "Failed to get Notion connection" });
    }
  });

  // Get Notion connection status for workspace (with header)
  app.get("/api/notion/connection", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const workspaceId = getWorkspaceId(req);
      if (!workspaceId) {
        return res.status(400).json({ message: "Workspace ID required" });
      }
      
      const connection = await storage.getNotionConnectionByWorkspace(workspaceId);
      if (!connection) {
        return res.json({ connected: false });
      }
      
      res.json({
        connected: true,
        id: connection.id,
        notionWorkspaceName: connection.notionWorkspaceName,
        notionWorkspaceIcon: connection.notionWorkspaceIcon,
        selectedDatabaseId: connection.selectedDatabaseId,
        selectedDatabaseName: connection.selectedDatabaseName,
        autoSyncEnabled: connection.autoSyncEnabled,
        lastSyncAt: connection.lastSyncAt,
        createdAt: connection.createdAt,
        syncReservations: connection.syncReservations,
        syncConfirmedTasks: connection.syncConfirmedTasks,
        syncTags: connection.syncTags,
        reservationsDatabaseId: connection.reservationsDatabaseId,
        reservationsDatabaseName: connection.reservationsDatabaseName,
        tasksDatabaseId: connection.tasksDatabaseId,
        tasksDatabaseName: connection.tasksDatabaseName,
        tagsDatabaseId: connection.tagsDatabaseId,
        tagsDatabaseName: connection.tagsDatabaseName,
        propertyFilter: connection.propertyFilter,
      });
    } catch (error) {
      logger.error('Notion', 'Error getting connection:', error);
      res.status(500).json({ message: "Failed to get Notion connection" });
    }
  });

  // Disconnect Notion
  app.delete("/api/notion/connection", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const workspaceId = getWorkspaceId(req);
      if (!workspaceId) {
        return res.status(400).json({ message: "Workspace ID required" });
      }
      
      const connection = await storage.getNotionConnectionByWorkspace(workspaceId);
      if (!connection) {
        return res.status(404).json({ message: "No Notion connection found" });
      }
      
      await storage.deleteNotionConnection(connection.id);
      res.json({ success: true });
    } catch (error) {
      logger.error('Notion', 'Error disconnecting:', error);
      res.status(500).json({ message: "Failed to disconnect Notion" });
    }
  });

  // Fetch available databases from Notion
  app.get("/api/notion/databases", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const workspaceId = getWorkspaceId(req);
      if (!workspaceId) {
        return res.status(400).json({ message: "Workspace ID required" });
      }
      
      const connection = await storage.getNotionConnectionByWorkspace(workspaceId);
      if (!connection) {
        return res.status(404).json({ message: "No Notion connection found" });
      }
      
      const searchResponse = await fetch("https://api.notion.com/v1/search", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${connection.accessToken}`,
          "Content-Type": "application/json",
          "Notion-Version": "2022-06-28",
        },
        body: JSON.stringify({
          filter: { property: "object", value: "database" },
          page_size: 100,
        }),
      });
      
      logger.info('Notion', 'Searching for databases with access token:', connection.accessToken.substring(0, 20) + "...");
      
      if (!searchResponse.ok) {
        const errorText = await searchResponse.text();
        logger.error('Notion', 'Failed to fetch databases:', searchResponse.status, errorText);
        return res.status(500).json({ message: "Failed to fetch databases from Notion" });
      }
      
      const searchData = await searchResponse.json() as {
        results: Array<{
          id: string;
          title?: Array<{ plain_text: string }>;
          icon?: { type: string; emoji?: string; external?: { url: string } };
        }>;
      };
      
      const databases = searchData.results.map((db) => ({
        id: db.id,
        name: db.title?.[0]?.plain_text || "Untitled Database",
        icon: db.icon?.type === "emoji" ? db.icon.emoji : undefined,
      }));
      
      res.json({ databases });
    } catch (error) {
      logger.error('Notion', 'Error fetching databases:', error);
      res.status(500).json({ message: "Failed to fetch Notion databases" });
    }
  });

  // Create a new Notion database with Tags schema
  app.post("/api/notion/create-database", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const workspaceId = getWorkspaceId(req);
      if (!workspaceId) {
        return res.status(400).json({ message: "Workspace ID required" });
      }
      
      const { parentPageId, databaseType = "tags", databaseName } = req.body;
      if (!parentPageId) {
        return res.status(400).json({ message: "Parent page ID required. Please select a page to create the database in." });
      }
      
      const connection = await storage.getNotionConnectionByWorkspace(workspaceId);
      if (!connection) {
        return res.status(404).json({ message: "No Notion connection found" });
      }
      
      let properties: Record<string, unknown> = {};
      let title = databaseName || "HostPulse Tags";
      
      if (databaseType === "tags") {
        title = databaseName || "HostPulse Tags";
        properties = {
          "Name": { title: {} },
          "Sentiment": {
            select: {
              options: [
                { name: "positive", color: "green" },
                { name: "neutral", color: "gray" },
                { name: "negative", color: "red" },
                { name: "question", color: "blue" }
              ]
            }
          },
          "Priority": {
            select: {
              options: [
                { name: "high", color: "red" },
                { name: "medium", color: "yellow" },
                { name: "low", color: "gray" }
              ]
            }
          },
          "Theme": { rich_text: {} },
          "Property": { rich_text: {} },
          "Guest": { rich_text: {} },
          "Channel": {
            select: {
              options: [
                { name: "Airbnb", color: "pink" },
                { name: "VRBO", color: "blue" },
                { name: "Booking.com", color: "purple" },
                { name: "Direct", color: "green" },
                { name: "Other", color: "gray" }
              ]
            }
          },
          "Evidence": { rich_text: {} },
          "Suggested Task": { rich_text: {} },
          "Created": { date: {} }
        };
      } else if (databaseType === "reservations") {
        title = databaseName || "HostPulse Reservations";
        properties = {
          "Guest Name": { title: {} },
          "Property": { rich_text: {} },
          "Channel": {
            select: {
              options: [
                { name: "Airbnb", color: "pink" },
                { name: "VRBO", color: "blue" },
                { name: "Booking.com", color: "purple" },
                { name: "Direct", color: "green" },
                { name: "Other", color: "gray" }
              ]
            }
          },
          "Check-in": { date: {} },
          "Check-out": { date: {} },
          "Status": {
            select: {
              options: [
                { name: "confirmed", color: "green" },
                { name: "pending", color: "yellow" },
                { name: "cancelled", color: "red" },
                { name: "completed", color: "gray" }
              ]
            }
          },
          "Guests": { number: {} },
          "Total": { number: { format: "dollar" } }
        };
      } else if (databaseType === "tasks") {
        title = databaseName || "HostPulse Tasks";
        properties = {
          "Task": { title: {} },
          "Description": { rich_text: {} },
          "Property": { rich_text: {} },
          "Priority": {
            select: {
              options: [
                { name: "high", color: "red" },
                { name: "medium", color: "yellow" },
                { name: "low", color: "gray" }
              ]
            }
          },
          "Status": {
            select: {
              options: [
                { name: "open", color: "blue" },
                { name: "in_progress", color: "yellow" },
                { name: "completed", color: "green" },
                { name: "cancelled", color: "gray" }
              ]
            }
          },
          "Due Date": { date: {} },
          "Source": { rich_text: {} }
        };
      }
      
      logger.info('Notion', `Creating ${databaseType} database in page ${parentPageId}`);
      
      const createResponse = await fetch("https://api.notion.com/v1/databases", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${connection.accessToken}`,
          "Content-Type": "application/json",
          "Notion-Version": "2022-06-28",
        },
        body: JSON.stringify({
          parent: { type: "page_id", page_id: parentPageId },
          title: [{ type: "text", text: { content: title } }],
          properties,
          is_inline: false,
        }),
      });
      
      if (!createResponse.ok) {
        const errorText = await createResponse.text();
        logger.error('Notion', 'Failed to create database:', createResponse.status, errorText);
        return res.status(500).json({ 
          message: "Failed to create database in Notion. Make sure you have permission to add content to the selected page.",
          error: errorText
        });
      }
      
      const newDatabase = await createResponse.json() as {
        id: string;
        title?: Array<{ plain_text: string }>;
      };
      
      logger.info('Notion', `Created database: ${newDatabase.id}`);
      
      const updateData: Record<string, string> = {};
      if (databaseType === "tags") {
        updateData.tagsDatabaseId = newDatabase.id;
        updateData.tagsDatabaseName = title;
      } else if (databaseType === "reservations") {
        updateData.reservationsDatabaseId = newDatabase.id;
        updateData.reservationsDatabaseName = title;
      } else if (databaseType === "tasks") {
        updateData.tasksDatabaseId = newDatabase.id;
        updateData.tasksDatabaseName = title;
      }
      
      await storage.updateNotionConnection(connection.id, updateData);
      
      res.json({ 
        success: true,
        database: {
          id: newDatabase.id,
          name: title,
          type: databaseType
        }
      });
    } catch (error) {
      logger.error('Notion', 'Error creating database:', error);
      res.status(500).json({ message: "Failed to create Notion database" });
    }
  });

  // Get pages accessible to the integration (for database parent selection)
  app.get("/api/notion/pages", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const workspaceId = getWorkspaceId(req);
      if (!workspaceId) {
        return res.status(400).json({ message: "Workspace ID required" });
      }
      
      const connection = await storage.getNotionConnectionByWorkspace(workspaceId);
      if (!connection) {
        return res.status(404).json({ message: "No Notion connection found" });
      }
      
      const searchResponse = await fetch("https://api.notion.com/v1/search", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${connection.accessToken}`,
          "Content-Type": "application/json",
          "Notion-Version": "2022-06-28",
        },
        body: JSON.stringify({
          filter: { property: "object", value: "page" },
          page_size: 100,
        }),
      });
      
      if (!searchResponse.ok) {
        const errorText = await searchResponse.text();
        logger.error('Notion', 'Failed to fetch pages:', searchResponse.status, errorText);
        return res.status(500).json({ message: "Failed to fetch pages from Notion" });
      }
      
      const searchData = await searchResponse.json() as {
        results: Array<{
          id: string;
          properties?: {
            title?: { title?: Array<{ plain_text: string }> };
            Name?: { title?: Array<{ plain_text: string }> };
          };
          icon?: { type: string; emoji?: string; external?: { url: string } };
        }>;
      };
      
      const pages = searchData.results.map((page) => {
        const titleProp = page.properties?.title?.title?.[0]?.plain_text || 
                          page.properties?.Name?.title?.[0]?.plain_text;
        return {
          id: page.id,
          name: titleProp || "Untitled Page",
          icon: page.icon?.type === "emoji" ? page.icon.emoji : undefined,
        };
      });
      
      res.json({ pages });
    } catch (error) {
      logger.error('Notion', 'Error fetching pages:', error);
      res.status(500).json({ message: "Failed to fetch Notion pages" });
    }
  });

  // Select a database for tag sync
  app.post("/api/notion/database", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const workspaceId = getWorkspaceId(req);
      if (!workspaceId) {
        return res.status(400).json({ message: "Workspace ID required" });
      }
      
      const { databaseId, databaseName } = req.body;
      if (!databaseId || !databaseName) {
        return res.status(400).json({ message: "Database ID and name required" });
      }
      
      const connection = await storage.getNotionConnectionByWorkspace(workspaceId);
      if (!connection) {
        return res.status(404).json({ message: "No Notion connection found" });
      }
      
      await storage.updateNotionConnection(connection.id, {
        selectedDatabaseId: databaseId,
        selectedDatabaseName: databaseName,
      });
      
      res.json({ success: true });
    } catch (error) {
      logger.error('Notion', 'Error selecting database:', error);
      res.status(500).json({ message: "Failed to select Notion database" });
    }
  });

  // Update sync settings
  app.patch("/api/notion/settings", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const workspaceId = getWorkspaceId(req);
      if (!workspaceId) {
        return res.status(400).json({ message: "Workspace ID required" });
      }
      
      const { 
        autoSyncEnabled, 
        syncReservations, 
        syncConfirmedTasks,
        syncTags,
        reservationsDatabaseId,
        reservationsDatabaseName,
        tasksDatabaseId,
        tasksDatabaseName,
        tagsDatabaseId,
        tagsDatabaseName,
        propertyFilter 
      } = req.body;
      
      const connection = await storage.getNotionConnectionByWorkspace(workspaceId);
      if (!connection) {
        return res.status(404).json({ message: "No Notion connection found" });
      }
      
      const updates: Record<string, unknown> = {};
      if (autoSyncEnabled !== undefined) updates.autoSyncEnabled = autoSyncEnabled === true;
      if (syncReservations !== undefined) updates.syncReservations = syncReservations === true;
      if (syncConfirmedTasks !== undefined) updates.syncConfirmedTasks = syncConfirmedTasks === true;
      if (syncTags !== undefined) updates.syncTags = syncTags === true;
      if (reservationsDatabaseId !== undefined) updates.reservationsDatabaseId = reservationsDatabaseId;
      if (reservationsDatabaseName !== undefined) updates.reservationsDatabaseName = reservationsDatabaseName;
      if (tasksDatabaseId !== undefined) updates.tasksDatabaseId = tasksDatabaseId;
      if (tasksDatabaseName !== undefined) updates.tasksDatabaseName = tasksDatabaseName;
      if (tagsDatabaseId !== undefined) updates.tagsDatabaseId = tagsDatabaseId;
      if (tagsDatabaseName !== undefined) updates.tagsDatabaseName = tagsDatabaseName;
      if (propertyFilter !== undefined) updates.propertyFilter = propertyFilter;
      
      await storage.updateNotionConnection(connection.id, updates);
      
      res.json({ success: true });
    } catch (error) {
      logger.error('Notion', 'Error updating settings:', error);
      res.status(500).json({ message: "Failed to update Notion settings" });
    }
  });

  // Sync tags to Notion
  app.post("/api/notion/sync-tags", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const workspaceId = getWorkspaceId(req);
      if (!workspaceId) {
        return res.status(400).json({ message: "Workspace ID required" });
      }
      
      const { tagIds } = req.body;
      if (!tagIds || !Array.isArray(tagIds) || tagIds.length === 0) {
        return res.status(400).json({ message: "Tag IDs required" });
      }
      
      const connection = await storage.getNotionConnectionByWorkspace(workspaceId);
      if (!connection) {
        return res.status(404).json({ message: "No Notion connection found" });
      }
      
      const databaseId = connection.tagsDatabaseId || connection.selectedDatabaseId;
      if (!databaseId) {
        return res.status(400).json({ message: "No database selected for tags sync. Please select a Tags database in Data Sources." });
      }
      
      const tagsToSync = await Promise.all(
        tagIds.map((id: string) => storage.getTag(id))
      );
      const validTags = tagsToSync.filter((tag): tag is NonNullable<typeof tag> => tag !== undefined);
      
      if (validTags.length === 0) {
        return res.status(404).json({ message: "No valid tags found" });
      }
      
      const results = await Promise.all(
        validTags.map(async (tag) => {
          try {
            const listing = await storage.getListing(tag.listingId);
            const reservation = await storage.getReservation(tag.reservationId);
            const theme = tag.themeId ? await storage.getTheme(tag.themeId) : null;
            
            const pageContent = {
              parent: { database_id: databaseId },
              properties: {
                Name: {
                  title: [{ text: { content: tag.name } }],
                },
              },
              children: [
                {
                  object: "block",
                  type: "heading_2",
                  heading_2: {
                    rich_text: [{ type: "text", text: { content: "Tag Details" } }],
                  },
                },
                {
                  object: "block",
                  type: "bulleted_list_item",
                  bulleted_list_item: {
                    rich_text: [{ type: "text", text: { content: `Reservation ID: ${tag.reservationId}` } }],
                  },
                },
                ...(reservation ? [
                  {
                    object: "block",
                    type: "bulleted_list_item",
                    bulleted_list_item: {
                      rich_text: [{ type: "text", text: { content: `Guest: ${reservation.guestName || "Unknown"}` } }],
                    },
                  },
                  {
                    object: "block",
                    type: "bulleted_list_item",
                    bulleted_list_item: {
                      rich_text: [{ type: "text", text: { content: `Channel: ${(reservation as any).channel || "Unknown"}` } }],
                    },
                  },
                ] : []),
                {
                  object: "block",
                  type: "bulleted_list_item",
                  bulleted_list_item: {
                    rich_text: [{ type: "text", text: { content: `Tag Name: ${tag.name}` } }],
                  },
                },
                {
                  object: "block",
                  type: "bulleted_list_item",
                  bulleted_list_item: {
                    rich_text: [{ type: "text", text: { content: `Sentiment: ${tag.sentiment}` } }],
                  },
                },
                ...(theme ? [{
                  object: "block",
                  type: "bulleted_list_item",
                  bulleted_list_item: {
                    rich_text: [{ type: "text", text: { content: `Theme: ${theme.name}` } }],
                  },
                }] : []),
                ...(listing ? [{
                  object: "block",
                  type: "bulleted_list_item",
                  bulleted_list_item: {
                    rich_text: [{ type: "text", text: { content: `Property: ${listing.name}` } }],
                  },
                }] : []),
                ...(tag.verbatimEvidence ? [
                  {
                    object: "block",
                    type: "heading_3",
                    heading_3: {
                      rich_text: [{ type: "text", text: { content: "Verbatim" } }],
                    },
                  },
                  {
                    object: "block",
                    type: "quote",
                    quote: {
                      rich_text: [{ type: "text", text: { content: tag.verbatimEvidence.slice(0, 2000) } }],
                    },
                  },
                ] : []),
                ...(tag.suggestedTaskTitle ? [
                  {
                    object: "block",
                    type: "heading_3",
                    heading_3: {
                      rich_text: [{ type: "text", text: { content: "AI Suggested Task" } }],
                    },
                  },
                  {
                    object: "block",
                    type: "paragraph",
                    paragraph: {
                      rich_text: [
                        { type: "text", text: { content: "Task: ", annotations: { bold: true } } },
                        { type: "text", text: { content: tag.suggestedTaskTitle } },
                      ],
                    },
                  },
                  ...(tag.suggestedTaskDescription ? [{
                    object: "block",
                    type: "paragraph",
                    paragraph: {
                      rich_text: [
                        { type: "text", text: { content: "Description: ", annotations: { bold: true } } },
                        { type: "text", text: { content: tag.suggestedTaskDescription.slice(0, 2000) } },
                      ],
                    },
                  }] : []),
                ] : []),
              ],
            };
            
            const createResponse = await fetch("https://api.notion.com/v1/pages", {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${connection.accessToken}`,
                "Content-Type": "application/json",
                "Notion-Version": "2022-06-28",
              },
              body: JSON.stringify(pageContent),
            });
            
            if (!createResponse.ok) {
              const errorText = await createResponse.text();
              logger.error('Notion', `Failed to create page for tag ${tag.id}:`, errorText);
              return { tagId: tag.id, success: false, error: errorText };
            }
            
            return { tagId: tag.id, success: true };
          } catch (error) {
            logger.error('Notion', `Error syncing tag ${tag.id}:`, error);
            return { tagId: tag.id, success: false, error: String(error) };
          }
        })
      );
      
      await storage.updateNotionConnection(connection.id, {
        lastSyncAt: new Date(),
      });
      
      const successCount = results.filter(r => r.success).length;
      const failCount = results.filter(r => !r.success).length;
      
      res.json({
        success: true,
        synced: successCount,
        failed: failCount,
        results,
      });
    } catch (error) {
      logger.error('Notion', 'Error syncing tags:', error);
      res.status(500).json({ message: "Failed to sync tags to Notion" });
    }
  });

  // Sync all tags to Notion for a workspace
  app.post("/api/notion/sync-all-tags", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const workspaceId = getWorkspaceId(req);
      if (!workspaceId) {
        return res.status(400).json({ message: "Workspace ID required" });
      }
      
      const connection = await storage.getNotionConnectionByWorkspace(workspaceId);
      if (!connection) {
        return res.status(404).json({ message: "No Notion connection found" });
      }
      
      if (connection.syncTags === false) {
        return res.status(400).json({ message: "Tags sync is disabled. Enable it in Data Sources settings." });
      }
      
      const databaseId = connection.tagsDatabaseId || connection.selectedDatabaseId;
      if (!databaseId) {
        return res.status(400).json({ message: "No database selected for tags sync. Please select a Tags database in Data Sources." });
      }
      
      const allTags = await storage.getTagsByWorkspace(workspaceId);
      
      if (allTags.length === 0) {
        return res.json({ success: true, synced: 0, failed: 0, message: "No tags to sync" });
      }
      
      const tagsToSync = allTags.slice(0, 100);
      
      let synced = 0;
      let failed = 0;
      
      for (const tag of tagsToSync) {
        try {
          const listing = await storage.getListing(tag.listingId);
          const reservation = await storage.getReservation(tag.reservationId);
          const theme = tag.themeId ? await storage.getTheme(tag.themeId) : null;
          
          const pageContent = {
            parent: { database_id: databaseId },
            properties: {
              Name: {
                title: [{ text: { content: tag.name } }],
              },
            },
            children: [
              {
                object: "block",
                type: "heading_2",
                heading_2: {
                  rich_text: [{ type: "text", text: { content: "Tag Details" } }],
                },
              },
              {
                object: "block",
                type: "bulleted_list_item",
                bulleted_list_item: {
                  rich_text: [{ type: "text", text: { content: `Reservation ID: ${tag.reservationId}` } }],
                },
              },
              ...(reservation ? [
                {
                  object: "block",
                  type: "bulleted_list_item",
                  bulleted_list_item: {
                    rich_text: [{ type: "text", text: { content: `Guest: ${reservation.guestName || "Unknown"}` } }],
                  },
                },
                {
                  object: "block",
                  type: "bulleted_list_item",
                  bulleted_list_item: {
                    rich_text: [{ type: "text", text: { content: `Channel: ${(reservation as any).channel || "Unknown"}` } }],
                  },
                },
              ] : []),
              {
                object: "block",
                type: "bulleted_list_item",
                bulleted_list_item: {
                  rich_text: [{ type: "text", text: { content: `Tag Name: ${tag.name}` } }],
                },
              },
              {
                object: "block",
                type: "bulleted_list_item",
                bulleted_list_item: {
                  rich_text: [{ type: "text", text: { content: `Sentiment: ${tag.sentiment}` } }],
                },
              },
              ...(theme ? [{
                object: "block",
                type: "bulleted_list_item",
                bulleted_list_item: {
                  rich_text: [{ type: "text", text: { content: `Theme: ${theme.name}` } }],
                },
              }] : []),
              ...(listing ? [{
                object: "block",
                type: "bulleted_list_item",
                bulleted_list_item: {
                  rich_text: [{ type: "text", text: { content: `Property: ${listing.name}` } }],
                },
              }] : []),
              ...(tag.verbatimEvidence ? [
                {
                  object: "block",
                  type: "heading_3",
                  heading_3: {
                    rich_text: [{ type: "text", text: { content: "Verbatim" } }],
                  },
                },
                {
                  object: "block",
                  type: "quote",
                  quote: {
                    rich_text: [{ type: "text", text: { content: tag.verbatimEvidence.slice(0, 2000) } }],
                  },
                },
              ] : []),
              ...(tag.suggestedTaskTitle ? [
                {
                  object: "block",
                  type: "heading_3",
                  heading_3: {
                    rich_text: [{ type: "text", text: { content: "AI Suggested Task" } }],
                  },
                },
                {
                  object: "block",
                  type: "paragraph",
                  paragraph: {
                    rich_text: [
                      { type: "text", text: { content: "Task: " } },
                      { type: "text", text: { content: tag.suggestedTaskTitle } },
                    ],
                  },
                },
                ...(tag.suggestedTaskDescription ? [{
                  object: "block",
                  type: "paragraph",
                  paragraph: {
                    rich_text: [
                      { type: "text", text: { content: "Description: " } },
                      { type: "text", text: { content: tag.suggestedTaskDescription.slice(0, 2000) } },
                    ],
                  },
                }] : []),
              ] : []),
            ],
          };
          
          const createResponse = await fetch("https://api.notion.com/v1/pages", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${connection.accessToken}`,
              "Content-Type": "application/json",
              "Notion-Version": "2022-06-28",
            },
            body: JSON.stringify(pageContent),
          });
          
          if (createResponse.ok) {
            synced++;
          } else {
            failed++;
            const errorText = await createResponse.text();
            logger.error('Notion', `Failed to sync tag ${tag.id}:`, errorText);
          }
          
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
          failed++;
          logger.error('Notion', `Error syncing tag ${tag.id}:`, error);
        }
      }
      
      await storage.updateNotionConnection(connection.id, {
        lastSyncAt: new Date(),
      });
      
      res.json({
        success: true,
        synced,
        failed,
        total: allTags.length,
        message: allTags.length > 100 ? `Synced first 100 tags. ${allTags.length - 100} remaining.` : undefined,
      });
    } catch (error) {
      logger.error('Notion', 'Error syncing all tags:', error);
      res.status(500).json({ message: "Failed to sync tags to Notion" });
    }
  });

  // Sync reservations to Notion
  app.post("/api/notion/sync-reservations", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const workspaceId = getWorkspaceId(req);
      if (!workspaceId) {
        return res.status(400).json({ message: "Workspace ID required" });
      }
      
      const { reservationIds } = req.body;
      if (!reservationIds || !Array.isArray(reservationIds) || reservationIds.length === 0) {
        return res.status(400).json({ message: "Reservation IDs required" });
      }
      
      const connection = await storage.getNotionConnectionByWorkspace(workspaceId);
      if (!connection) {
        return res.status(404).json({ message: "No Notion connection found" });
      }
      
      if (!connection.reservationsDatabaseId) {
        return res.status(400).json({ message: "No database selected for reservations sync" });
      }
      
      if (!connection.syncReservations) {
        return res.status(400).json({ message: "Reservation sync is disabled" });
      }
      
      const reservationsToSync = await Promise.all(
        reservationIds.map((id: string) => storage.getReservation(id))
      );
      const validReservations = reservationsToSync.filter((r): r is NonNullable<typeof r> => r !== undefined);
      
      if (validReservations.length === 0) {
        return res.status(404).json({ message: "No valid reservations found" });
      }
      
      const filteredReservations = connection.propertyFilter && connection.propertyFilter.length > 0
        ? validReservations.filter(r => connection.propertyFilter!.includes(r.listingId))
        : validReservations;
      
      if (filteredReservations.length === 0) {
        return res.status(400).json({ message: "No reservations match the property filter" });
      }
      
      const results = await Promise.all(
        filteredReservations.map(async (reservation) => {
          try {
            const listing = await storage.getListing(reservation.listingId);
            
            const tags = await storage.getTagsByReservation(reservation.id);
            const sentimentCounts = {
              positive: tags.filter(t => t.sentiment === 'positive').length,
              negative: tags.filter(t => t.sentiment === 'negative').length,
              neutral: tags.filter(t => t.sentiment === 'neutral').length,
            };
            const totalTags = sentimentCounts.positive + sentimentCounts.negative + sentimentCounts.neutral;
            const sentimentScore = totalTags > 0 
              ? Math.round(((sentimentCounts.positive - sentimentCounts.negative) / totalTags + 1) * 50)
              : null;
            
            const resAny = reservation as any;
            const checkIn = resAny.checkIn || resAny.checkInDate;
            const checkOut = resAny.checkOut || resAny.checkOutDate;
            
            const createResponse = await fetch("https://api.notion.com/v1/pages", {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${connection.accessToken}`,
                "Content-Type": "application/json",
                "Notion-Version": "2022-06-28",
              },
              body: JSON.stringify({
                parent: { database_id: connection.reservationsDatabaseId },
                properties: {
                  Name: {
                    title: [{ text: { content: reservation.guestName || "Unknown Guest" } }],
                  },
                },
                children: [
                  {
                    object: "block",
                    type: "heading_2",
                    heading_2: {
                      rich_text: [{ type: "text", text: { content: "Reservation Details" } }],
                    },
                  },
                  {
                    object: "block",
                    type: "bulleted_list_item",
                    bulleted_list_item: {
                      rich_text: [{ type: "text", text: { content: `Guest: ${reservation.guestName || "Unknown"}` } }],
                    },
                  },
                  ...(listing ? [{
                    object: "block",
                    type: "bulleted_list_item",
                    bulleted_list_item: {
                      rich_text: [{ type: "text", text: { content: `Property: ${listing.name}` } }],
                    },
                  }] : []),
                  {
                    object: "block",
                    type: "bulleted_list_item",
                    bulleted_list_item: {
                      rich_text: [{ type: "text", text: { content: `Check-in: ${checkIn ? new Date(checkIn).toLocaleDateString() : "N/A"}` } }],
                    },
                  },
                  {
                    object: "block",
                    type: "bulleted_list_item",
                    bulleted_list_item: {
                      rich_text: [{ type: "text", text: { content: `Check-out: ${checkOut ? new Date(checkOut).toLocaleDateString() : "N/A"}` } }],
                    },
                  },
                  ...(sentimentScore !== null ? [{
                    object: "block",
                    type: "bulleted_list_item",
                    bulleted_list_item: {
                      rich_text: [{ type: "text", text: { content: `Sentiment Score: ${sentimentScore}%` } }],
                    },
                  }] : []),
                ],
              }),
            });
            
            if (!createResponse.ok) {
              const errorText = await createResponse.text();
              logger.error('Notion', `Failed to create page for reservation ${reservation.id}:`, errorText);
              return { reservationId: reservation.id, success: false, error: errorText };
            }
            
            return { reservationId: reservation.id, success: true };
          } catch (error) {
            logger.error('Notion', `Error syncing reservation ${reservation.id}:`, error);
            return { reservationId: reservation.id, success: false, error: String(error) };
          }
        })
      );
      
      await storage.updateNotionConnection(connection.id, {
        lastSyncAt: new Date(),
      });
      
      const successCount = results.filter(r => r.success).length;
      const failCount = results.filter(r => !r.success).length;
      
      res.json({
        success: true,
        synced: successCount,
        failed: failCount,
        results,
      });
    } catch (error) {
      logger.error('Notion', 'Error syncing reservations:', error);
      res.status(500).json({ message: "Failed to sync reservations to Notion" });
    }
  });

  // Sync confirmed tasks to Notion
  app.post("/api/notion/sync-tasks", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const workspaceId = getWorkspaceId(req);
      if (!workspaceId) {
        return res.status(400).json({ message: "Workspace ID required" });
      }
      
      const { taskIds } = req.body;
      if (!taskIds || !Array.isArray(taskIds) || taskIds.length === 0) {
        return res.status(400).json({ message: "Task IDs required" });
      }
      
      const connection = await storage.getNotionConnectionByWorkspace(workspaceId);
      if (!connection) {
        return res.status(404).json({ message: "No Notion connection found" });
      }
      
      if (!connection.tasksDatabaseId) {
        return res.status(400).json({ message: "No database selected for tasks sync" });
      }
      
      if (!connection.syncConfirmedTasks) {
        return res.status(400).json({ message: "Tasks sync is disabled" });
      }
      
      const tasksToSync = await Promise.all(
        taskIds.map((id: string) => storage.getTask(id))
      );
      const validTasks = tasksToSync.filter((t): t is NonNullable<typeof t> => 
        t !== undefined && (t as any).aiGenerated === true
      );
      
      if (validTasks.length === 0) {
        return res.status(404).json({ message: "No valid confirmed AI tasks found" });
      }
      
      const filteredTasks = connection.propertyFilter && connection.propertyFilter.length > 0
        ? validTasks.filter(t => t.listingId && connection.propertyFilter!.includes(t.listingId))
        : validTasks;
      
      if (filteredTasks.length === 0) {
        return res.status(400).json({ message: "No tasks match the property filter" });
      }
      
      const results = await Promise.all(
        filteredTasks.map(async (task) => {
          try {
            const listing = task.listingId ? await storage.getListing(task.listingId) : null;
            
            const createResponse = await fetch("https://api.notion.com/v1/pages", {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${connection.accessToken}`,
                "Content-Type": "application/json",
                "Notion-Version": "2022-06-28",
              },
              body: JSON.stringify({
                parent: { database_id: connection.tasksDatabaseId },
                properties: {
                  Name: {
                    title: [{ text: { content: task.title } }],
                  },
                },
                children: [
                  {
                    object: "block",
                    type: "heading_2",
                    heading_2: {
                      rich_text: [{ type: "text", text: { content: "Task Details" } }],
                    },
                  },
                  {
                    object: "block",
                    type: "bulleted_list_item",
                    bulleted_list_item: {
                      rich_text: [{ type: "text", text: { content: `Status: ${task.status}` } }],
                    },
                  },
                  {
                    object: "block",
                    type: "bulleted_list_item",
                    bulleted_list_item: {
                      rich_text: [{ type: "text", text: { content: `Priority: ${task.priority || "medium"}` } }],
                    },
                  },
                  ...(listing ? [{
                    object: "block",
                    type: "bulleted_list_item",
                    bulleted_list_item: {
                      rich_text: [{ type: "text", text: { content: `Property: ${listing.name}` } }],
                    },
                  }] : []),
                  ...(task.dueDate ? [{
                    object: "block",
                    type: "bulleted_list_item",
                    bulleted_list_item: {
                      rich_text: [{ type: "text", text: { content: `Due: ${new Date(task.dueDate).toLocaleDateString()}` } }],
                    },
                  }] : []),
                  {
                    object: "block",
                    type: "bulleted_list_item",
                    bulleted_list_item: {
                      rich_text: [{ type: "text", text: { content: `Source: AI-Generated Task` } }],
                    },
                  },
                  ...(task.description ? [
                    {
                      object: "block",
                      type: "heading_3",
                      heading_3: {
                        rich_text: [{ type: "text", text: { content: "Description" } }],
                      },
                    },
                    {
                      object: "block",
                      type: "paragraph",
                      paragraph: {
                        rich_text: [{ type: "text", text: { content: task.description.slice(0, 2000) } }],
                      },
                    },
                  ] : []),
                ],
              }),
            });
            
            if (!createResponse.ok) {
              const errorText = await createResponse.text();
              logger.error('Notion', `Failed to create page for task ${task.id}:`, errorText);
              return { taskId: task.id, success: false, error: errorText };
            }
            
            return { taskId: task.id, success: true };
          } catch (error) {
            logger.error('Notion', `Error syncing task ${task.id}:`, error);
            return { taskId: task.id, success: false, error: String(error) };
          }
        })
      );
      
      await storage.updateNotionConnection(connection.id, {
        lastSyncAt: new Date(),
      });
      
      const successCount = results.filter(r => r.success).length;
      const failCount = results.filter(r => !r.success).length;
      
      res.json({
        success: true,
        synced: successCount,
        failed: failCount,
        results,
      });
    } catch (error) {
      logger.error('Notion', 'Error syncing tasks:', error);
      res.status(500).json({ message: "Failed to sync tasks to Notion" });
    }
  });
}
