import type { Request } from "express";
import { storage } from "../storage";
import { logger } from "../logger";

export const getUserId = (req: Request): string => {
  return (req as any).user?.id;
};

export const getWorkspaceId = (req: Request): string | null => {
  return (req.headers['x-workspace-id'] as string) || null;
};

export const validateWorkspaceMembership = async (userId: string, workspaceId: string | null): Promise<boolean> => {
  if (!workspaceId) return true;
  const member = await storage.getWorkspaceMember(workspaceId, userId);
  const isValid = member?.status === 'active';
  if (!isValid) {
    logger.info('Workspace', `Membership check failed for user ${userId} in workspace ${workspaceId} - member:`, member);
  }
  return isValid;
};

export const getParamId = (id: string | string[]): string => {
  return Array.isArray(id) ? id[0] : id;
};
