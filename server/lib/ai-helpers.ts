import type { Reservation, Listing, Theme, InsertTag } from "@shared/schema";
import type { IStorage } from "../storage";
import { logger } from "../logger";

export interface AITagData {
  name?: string;
  sentiment?: string;
  priority?: string;
  summary?: string;
  verbatim_evidence?: string;
  verbatimEvidence?: string;
  theme_name?: string;
  themeName?: string;
  suggestedTheme?: string;
  theme_icon?: string;
  themeIcon?: string;
  suggested_task?: { title?: string; description?: string };
  suggestedTask?: { title?: string; description?: string };
  sourceType?: string;
  sourceId?: string;
}

export interface AIReservationResult {
  reservation_id?: string;
  reservationId?: string;
  tags?: AITagData[];
}

export function normalizeAITagData(tagData: AITagData) {
  return {
    name: tagData.name || "Unnamed Tag",
    sentiment: tagData.sentiment || "neutral",
    priority: tagData.priority || "medium",
    summary: tagData.summary || null,
    verbatimEvidence: tagData.verbatim_evidence || tagData.verbatimEvidence || null,
    themeName: tagData.theme_name || tagData.themeName || tagData.suggestedTheme || null,
    themeIcon: tagData.theme_icon || tagData.themeIcon || null,
    suggestedTask: tagData.suggested_task || tagData.suggestedTask || null,
    sourceType: tagData.sourceType || null,
    sourceId: tagData.sourceId || null,
  };
}

export function getReservationIdFromAIResult(item: AIReservationResult): string | null {
  return item.reservation_id || item.reservationId || null;
}

export interface CreateTagFromAIOptions {
  userId: string;
  workspaceId: string | null | undefined;
  listing: Listing;
  reservation: Reservation;
  tagData: AITagData;
  existingThemes: Theme[];
  storage: IStorage;
}

export async function createTagFromAI(options: CreateTagFromAIOptions): Promise<{
  tag: any;
  themeId: string | null;
  suggestedTask: { title?: string; description?: string } | null;
}> {
  const { userId, workspaceId, listing, reservation, tagData, existingThemes, storage } = options;
  
  const normalized = normalizeAITagData(tagData);
  
  let themeId: string | null = null;
  if (normalized.themeName) {
    const matchedTheme = existingThemes.find(
      t => t.name.toLowerCase() === normalized.themeName!.toLowerCase()
    );
    if (matchedTheme) {
      themeId = matchedTheme.id;
    }
  }
  
  if (!themeId && workspaceId) {
    const unassignedTheme = await storage.getUnassignedTheme(workspaceId);
    themeId = unassignedTheme?.id || null;
  }
  
  const tagPayload: InsertTag = {
    userId,
    workspaceId: workspaceId || undefined,
    listingId: listing.id,
    reservationId: reservation.id,
    themeId,
    name: normalized.name,
    sentiment: normalized.sentiment,
    priority: normalized.priority,
    summary: normalized.summary,
    verbatimEvidence: normalized.verbatimEvidence,
    suggestedTaskTitle: normalized.suggestedTask?.title || null,
    suggestedTaskDescription: normalized.suggestedTask?.description || null,
    pendingThemeName: !themeId ? normalized.themeName : null,
    pendingThemeIcon: !themeId ? normalized.themeIcon : null,
    addedToThemeAt: themeId ? new Date() : null,
    createdAt: reservation.checkOutDate || undefined,
  };
  
  const tag = await storage.createTag(tagPayload);
  
  return {
    tag,
    themeId,
    suggestedTask: normalized.suggestedTask,
  };
}

export function parseAIResponse(responseText: string): AIReservationResult[] {
  try {
    const parsed = JSON.parse(responseText);
    
    if (Array.isArray(parsed)) {
      return parsed;
    }
    
    if (parsed.reservations && Array.isArray(parsed.reservations)) {
      return parsed.reservations;
    }
    
    if (parsed.results && Array.isArray(parsed.results)) {
      return parsed.results;
    }
    
    return [];
  } catch (error) {
    logger.error('AI Helpers', 'Failed to parse AI response:', error);
    return [];
  }
}
