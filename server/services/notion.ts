import { storage } from "../storage";
import { logger } from "../logger";

// Normalize channel values to match Notion select options
export function normalizeChannel(channel: string | null | undefined): string | null {
  if (!channel) return null;
  const channelLower = channel.toLowerCase();
  if (channelLower.includes('airbnb')) return 'Airbnb';
  if (channelLower.includes('vrbo') || channelLower.includes('homeaway')) return 'VRBO';
  if (channelLower.includes('booking')) return 'Booking.com';
  if (channelLower.includes('direct')) return 'Direct';
  return 'Other';
}

// Build Notion page properties for a tag - uses structured properties for better filtering/sorting
// useStructuredProperties: true for HostPulse-created databases, false for legacy/user databases
export function buildNotionTagProperties(
  tag: { name: string; sentiment: string; priority?: string | null; verbatimEvidence?: string | null; suggestedTaskTitle?: string | null; createdAt?: Date | null },
  listing?: { name: string } | null,
  reservation?: { guestName?: string | null; channel?: string | null } | null,
  theme?: { name: string } | null,
  useStructuredProperties: boolean = true
): Record<string, unknown> {
  // Always include Name (title) - this works for any Notion database
  const properties: Record<string, unknown> = {
    Name: {
      title: [{ text: { content: tag.name } }],
    },
  };
  
  // Only include structured properties for HostPulse-created databases
  if (!useStructuredProperties) {
    return properties;
  }
  
  // Add select properties
  properties.Sentiment = {
    select: { name: tag.sentiment }
  };
  properties.Priority = {
    select: { name: tag.priority || "medium" }
  };
  
  if (theme) {
    properties.Theme = {
      rich_text: [{ text: { content: theme.name } }]
    };
  }
  
  if (listing) {
    properties.Property = {
      rich_text: [{ text: { content: listing.name } }]
    };
  }
  
  if (reservation?.guestName) {
    properties.Guest = {
      rich_text: [{ text: { content: reservation.guestName } }]
    };
  }
  
  // Normalize channel to match schema options
  const normalizedChannel = normalizeChannel(reservation?.channel);
  if (normalizedChannel) {
    properties.Channel = {
      select: { name: normalizedChannel }
    };
  }
  
  if (tag.verbatimEvidence) {
    properties.Evidence = {
      rich_text: [{ text: { content: tag.verbatimEvidence.slice(0, 2000) } }]
    };
  }
  
  if (tag.suggestedTaskTitle) {
    properties["Suggested Task"] = {
      rich_text: [{ text: { content: tag.suggestedTaskTitle } }]
    };
  }
  
  if (tag.createdAt) {
    properties.Created = {
      date: { start: tag.createdAt.toISOString().split('T')[0] }
    };
  }
  
  return properties;
}

// Build content blocks for legacy databases
export function buildLegacyContentBlocks(
  tag: { summary?: string | null; verbatimEvidence?: string | null; suggestedTaskTitle?: string | null; sentiment: string; priority?: string | null },
  listing?: { name: string } | null,
  reservation?: { guestName?: string | null } | null,
  theme?: { name: string } | null
): unknown[] {
  const children: unknown[] = [];
  
  // Add details as content blocks for legacy databases
  children.push(
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
        rich_text: [{ type: "text", text: { content: `Sentiment: ${tag.sentiment}` } }],
      },
    },
    {
      object: "block",
      type: "bulleted_list_item",
      bulleted_list_item: {
        rich_text: [{ type: "text", text: { content: `Priority: ${tag.priority || "medium"}` } }],
      },
    }
  );
  
  if (theme) {
    children.push({
      object: "block",
      type: "bulleted_list_item",
      bulleted_list_item: {
        rich_text: [{ type: "text", text: { content: `Theme: ${theme.name}` } }],
      },
    });
  }
  
  if (listing) {
    children.push({
      object: "block",
      type: "bulleted_list_item",
      bulleted_list_item: {
        rich_text: [{ type: "text", text: { content: `Property: ${listing.name}` } }],
      },
    });
  }
  
  if (reservation?.guestName) {
    children.push({
      object: "block",
      type: "bulleted_list_item",
      bulleted_list_item: {
        rich_text: [{ type: "text", text: { content: `Guest: ${reservation.guestName}` } }],
      },
    });
  }
  
  return children;
}

// Build common content blocks for all databases (summary, evidence, suggested task)
export function buildCommonContentBlocks(
  tag: { summary?: string | null; verbatimEvidence?: string | null; suggestedTaskTitle?: string | null }
): unknown[] {
  const children: unknown[] = [];
  
  if (tag.summary) {
    children.push(
      {
        object: "block",
        type: "heading_3",
        heading_3: {
          rich_text: [{ type: "text", text: { content: "Summary" } }],
        },
      },
      {
        object: "block",
        type: "paragraph",
        paragraph: {
          rich_text: [{ type: "text", text: { content: tag.summary } }],
        },
      }
    );
  }
  
  if (tag.verbatimEvidence) {
    children.push(
      {
        object: "block",
        type: "heading_3",
        heading_3: {
          rich_text: [{ type: "text", text: { content: "Evidence" } }],
        },
      },
      {
        object: "block",
        type: "quote",
        quote: {
          rich_text: [{ type: "text", text: { content: tag.verbatimEvidence.slice(0, 2000) } }],
        },
      }
    );
  }
  
  if (tag.suggestedTaskTitle) {
    children.push(
      {
        object: "block",
        type: "heading_3",
        heading_3: {
          rich_text: [{ type: "text", text: { content: "Suggested Task" } }],
        },
      },
      {
        object: "block",
        type: "to_do",
        to_do: {
          rich_text: [{ type: "text", text: { content: tag.suggestedTaskTitle } }],
          checked: false,
        },
      }
    );
  }
  
  return children;
}

// This runs asynchronously in the background after tags are created
export async function autoSyncTagsToNotion(workspaceId: string, tagIds: string[]): Promise<void> {
  try {
    if (!workspaceId || tagIds.length === 0) return;
    
    const connection = await storage.getNotionConnectionByWorkspace(workspaceId);
    if (!connection || !connection.autoSyncEnabled) {
      return; // Auto-sync not enabled
    }
    
    // Use tagsDatabaseId if available (HostPulse-created with structured schema)
    // Fall back to selectedDatabaseId for backward compatibility (user's existing database)
    const useTagsDatabase = !!connection.tagsDatabaseId;
    const databaseId = connection.tagsDatabaseId || connection.selectedDatabaseId;
    if (!databaseId) {
      return; // No database selected
    }
    
    // Use structured properties only for HostPulse-created databases
    // Legacy databases may not have the required property schema
    const useStructuredProperties = useTagsDatabase;
    
    logger.info('Notion Auto-Sync', `Syncing ${tagIds.length} tags for workspace ${workspaceId} (structured: ${useStructuredProperties})`);
    
    // Fetch all tags
    const tagsToSync = await Promise.all(tagIds.map(id => storage.getTag(id)));
    const validTags = tagsToSync.filter((tag): tag is NonNullable<typeof tag> => tag !== undefined);
    
    if (validTags.length === 0) return;
    
    // Sync each tag to Notion
    const results = await Promise.all(
      validTags.map(async (tag) => {
        try {
          const listing = await storage.getListing(tag.listingId);
          const reservation = await storage.getReservation(tag.reservationId);
          const theme = tag.themeId ? await storage.getTheme(tag.themeId) : null;
          
          // Build properties - use structured for HostPulse DBs, simple Name-only for legacy
          const properties = buildNotionTagProperties(tag, listing, reservation, theme, useStructuredProperties);
          
          // Build page content
          const children: unknown[] = [];
          
          // For legacy databases without structured properties, add details as content blocks
          if (!useStructuredProperties) {
            children.push(...buildLegacyContentBlocks(tag, listing, reservation, theme));
          }
          
          // Add common content blocks (summary, evidence, suggested task)
          children.push(...buildCommonContentBlocks(tag));
          
          const createResponse = await fetch("https://api.notion.com/v1/pages", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${connection.accessToken}`,
              "Content-Type": "application/json",
              "Notion-Version": "2022-06-28",
            },
            body: JSON.stringify({
              parent: { database_id: databaseId },
              properties,
              children: children.length > 0 ? children : undefined,
            }),
          });
          
          if (!createResponse.ok) {
            const errorText = await createResponse.text();
            logger.error('Notion Auto-Sync', `Failed to create page for tag ${tag.id}:`, errorText);
            return false;
          }
          
          return true;
        } catch (error) {
          logger.error('Notion Auto-Sync', `Error syncing tag ${tag.id}:`, error);
          return false;
        }
      })
    );
    
    // Update last sync time
    await storage.updateNotionConnection(connection.id, {
      lastSyncAt: new Date(),
    });
    
    const successCount = results.filter(Boolean).length;
    logger.info('Notion Auto-Sync', `Synced ${successCount}/${validTags.length} tags to Notion`);
  } catch (error) {
    logger.error('Notion Auto-Sync', 'Error:', error);
  }
}

// Database schema definitions for HostPulse-created Notion databases
export const NOTION_DATABASE_SCHEMAS = {
  tags: {
    Name: { title: {} },
    Sentiment: { 
      select: { 
        options: [
          { name: "positive", color: "green" },
          { name: "neutral", color: "gray" },
          { name: "negative", color: "red" },
          { name: "question", color: "blue" }
        ]
      }
    },
    Priority: {
      select: {
        options: [
          { name: "high", color: "red" },
          { name: "medium", color: "yellow" },
          { name: "low", color: "green" }
        ]
      }
    },
    Theme: { rich_text: {} },
    Property: { rich_text: {} },
    Guest: { rich_text: {} },
    Channel: {
      select: {
        options: [
          { name: "Airbnb", color: "red" },
          { name: "VRBO", color: "blue" },
          { name: "Booking.com", color: "purple" },
          { name: "Direct", color: "green" },
          { name: "Other", color: "gray" }
        ]
      }
    },
    Evidence: { rich_text: {} },
    "Suggested Task": { rich_text: {} },
    Created: { date: {} }
  },
  reservations: {
    "Guest Name": { title: {} },
    Property: { rich_text: {} },
    Channel: {
      select: {
        options: [
          { name: "Airbnb", color: "red" },
          { name: "VRBO", color: "blue" },
          { name: "Booking.com", color: "purple" },
          { name: "Direct", color: "green" },
          { name: "Other", color: "gray" }
        ]
      }
    },
    "Check-in": { date: {} },
    "Check-out": { date: {} },
    Status: {
      select: {
        options: [
          { name: "confirmed", color: "green" },
          { name: "pending", color: "yellow" },
          { name: "cancelled", color: "red" },
          { name: "completed", color: "gray" }
        ]
      }
    },
    Guests: { number: {} },
    Total: { number: { format: "dollar" } }
  },
  tasks: {
    Task: { title: {} },
    Description: { rich_text: {} },
    Property: { rich_text: {} },
    Priority: {
      select: {
        options: [
          { name: "high", color: "red" },
          { name: "medium", color: "yellow" },
          { name: "low", color: "green" }
        ]
      }
    },
    Status: {
      select: {
        options: [
          { name: "pending", color: "yellow" },
          { name: "in_progress", color: "blue" },
          { name: "completed", color: "green" }
        ]
      }
    },
    "Due Date": { date: {} },
    Source: { rich_text: {} }
  }
} as const;
