import type { Express } from "express";
import { IStorage } from "../storage";
import { isAuthenticated } from "../replit_integrations/auth";
import { config } from "../config";
import { logger } from "../logger";
import { db } from "../db";
import { and, eq, gte, lte } from "drizzle-orm";
import { getUserId, getWorkspaceId, validateWorkspaceMembership, getParamId } from "./helpers";
import {
  insertCleanerSchema,
  reservations,
} from "@shared/schema";
import { z } from "zod";
import {
  getValidAccessToken,
  hospitableApiRequest,
} from "../services/hospitable";

export function registerCleanerRoutes(app: Express, storage: IStorage) {
  const s = storage as any;
  // ============================================
  // Task Modules Routes
  // ============================================

  app.get("/api/task-modules", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const workspaceId = getWorkspaceId(req);
      if (!userId || !workspaceId) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      if (!(await validateWorkspaceMembership(userId, workspaceId))) {
        return res.status(403).json({ message: "Not a member of this workspace" });
      }
      const modules = await storage.getTaskModulesByWorkspace(workspaceId);
      res.json(modules);
    } catch (error) {
      logger.error("TaskModules", "Error fetching task modules:", error);
      res.status(500).json({ message: "Failed to fetch task modules" });
    }
  });

  app.get("/api/task-modules/recommended", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const workspaceId = getWorkspaceId(req);
      if (!userId || !workspaceId) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      if (!(await validateWorkspaceMembership(userId, workspaceId))) {
        return res.status(403).json({ message: "Not a member of this workspace" });
      }
      const modules = await storage.getRecommendedTaskModules(workspaceId);
      res.json(modules);
    } catch (error) {
      logger.error("TaskModules", "Error fetching recommended modules:", error);
      res.status(500).json({ message: "Failed to fetch recommended modules" });
    }
  });

  app.get("/api/task-modules/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const workspaceId = getWorkspaceId(req);
      if (!userId || !workspaceId) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const module = await storage.getTaskModuleWithItems(req.params.id as string);
      if (!module) {
        return res.status(404).json({ message: "Task module not found" });
      }
      if (module.workspaceId !== workspaceId) {
        return res.status(403).json({ message: "Not authorized" });
      }
      res.json(module);
    } catch (error) {
      logger.error("TaskModules", "Error fetching task module:", error);
      res.status(500).json({ message: "Failed to fetch task module" });
    }
  });

  app.post("/api/task-modules", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const workspaceId = getWorkspaceId(req);
      if (!userId || !workspaceId) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      if (!(await validateWorkspaceMembership(userId, workspaceId))) {
        return res.status(403).json({ message: "Not a member of this workspace" });
      }
      const { name, description, category, isRecommended } = req.body;
      if (!name) {
        return res.status(400).json({ message: "Module name is required" });
      }
      const module = await storage.createTaskModule({
        workspaceId,
        createdByUserId: userId,
        name,
        description: description || null,
        category: category || null,
        isRecommended: isRecommended || false,
      });
      res.status(201).json(module);
    } catch (error) {
      logger.error("TaskModules", "Error creating task module:", error);
      res.status(500).json({ message: "Failed to create task module" });
    }
  });

  app.patch("/api/task-modules/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const workspaceId = getWorkspaceId(req);
      if (!userId || !workspaceId) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const module = await storage.getTaskModule(req.params.id as string);
      if (!module) {
        return res.status(404).json({ message: "Task module not found" });
      }
      if (module.workspaceId !== workspaceId) {
        return res.status(403).json({ message: "Not authorized" });
      }
      const { name, description, category, isRecommended } = req.body;
      const updated = await storage.updateTaskModule(req.params.id as string, {
        name,
        description,
        category,
        isRecommended,
      });
      res.json(updated);
    } catch (error) {
      logger.error("TaskModules", "Error updating task module:", error);
      res.status(500).json({ message: "Failed to update task module" });
    }
  });

  app.delete("/api/task-modules/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const workspaceId = getWorkspaceId(req);
      if (!userId || !workspaceId) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const module = await storage.getTaskModule(req.params.id as string);
      if (!module) {
        return res.status(404).json({ message: "Task module not found" });
      }
      if (module.workspaceId !== workspaceId) {
        return res.status(403).json({ message: "Not authorized" });
      }
      await storage.deleteTaskModule(req.params.id as string);
      res.status(204).send();
    } catch (error) {
      logger.error("TaskModules", "Error deleting task module:", error);
      res.status(500).json({ message: "Failed to delete task module" });
    }
  });

  app.post("/api/task-modules/:id/items", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const workspaceId = getWorkspaceId(req);
      if (!userId || !workspaceId) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const module = await storage.getTaskModule(req.params.id as string);
      if (!module) {
        return res.status(404).json({ message: "Task module not found" });
      }
      if (module.workspaceId !== workspaceId) {
        return res.status(403).json({ message: "Not authorized" });
      }
      const { label, description, requiresPhotoVerification, photoVerificationMode, requiresGpsVerification, itemOrder } = req.body;
      if (!label) {
        return res.status(400).json({ message: "Item label is required" });
      }
      const existingItems = await storage.getTaskModuleItems(req.params.id as string);
      const order = itemOrder !== undefined ? itemOrder : existingItems.length;
      const resolvedMode = photoVerificationMode || (requiresPhotoVerification ? 'required' : 'none');
      const item = await storage.createTaskModuleItem({
        moduleId: req.params.id as string,
        label,
        description: description || null,
        requiresPhotoVerification: resolvedMode === 'required',
        photoVerificationMode: resolvedMode,
        requiresGpsVerification: requiresGpsVerification || false,
        itemOrder: order,
      });
      res.status(201).json(item);
    } catch (error) {
      logger.error("TaskModules", "Error adding item to module:", error);
      res.status(500).json({ message: "Failed to add item to module" });
    }
  });

  app.patch("/api/task-modules/:moduleId/items/:itemId", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const workspaceId = getWorkspaceId(req);
      if (!userId || !workspaceId) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const module = await storage.getTaskModule(req.params.moduleId as string);
      if (!module) {
        return res.status(404).json({ message: "Task module not found" });
      }
      if (module.workspaceId !== workspaceId) {
        return res.status(403).json({ message: "Not authorized" });
      }
      const item = await storage.getTaskModuleItem(req.params.itemId as string);
      if (!item || item.moduleId !== req.params.moduleId as string) {
        return res.status(404).json({ message: "Module item not found" });
      }
      const { label, description, requiresPhotoVerification, photoVerificationMode, requiresGpsVerification, itemOrder } = req.body;
      const resolvedMode = photoVerificationMode !== undefined ? photoVerificationMode : (requiresPhotoVerification !== undefined ? (requiresPhotoVerification ? 'required' : 'none') : undefined);
      const resolvedRequired = resolvedMode !== undefined ? resolvedMode === 'required' : undefined;
      const updated = await storage.updateTaskModuleItem(req.params.itemId as string, {
        label,
        description,
        requiresPhotoVerification: resolvedRequired,
        photoVerificationMode: resolvedMode,
        requiresGpsVerification,
        itemOrder,
      });
      res.json(updated);
    } catch (error) {
      logger.error("TaskModules", "Error updating module item:", error);
      res.status(500).json({ message: "Failed to update module item" });
    }
  });

  app.delete("/api/task-modules/:moduleId/items/:itemId", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const workspaceId = getWorkspaceId(req);
      if (!userId || !workspaceId) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const module = await storage.getTaskModule(req.params.moduleId as string);
      if (!module) {
        return res.status(404).json({ message: "Task module not found" });
      }
      if (module.workspaceId !== workspaceId) {
        return res.status(403).json({ message: "Not authorized" });
      }
      const item = await storage.getTaskModuleItem(req.params.itemId as string);
      if (!item || item.moduleId !== req.params.moduleId as string) {
        return res.status(404).json({ message: "Module item not found" });
      }
      await storage.deleteTaskModuleItem(req.params.itemId as string);
      res.status(204).send();
    } catch (error) {
      logger.error("TaskModules", "Error deleting module item:", error);
      res.status(500).json({ message: "Failed to delete module item" });
    }
  });

  app.post("/api/task-modules/:id/reorder", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const workspaceId = getWorkspaceId(req);
      if (!userId || !workspaceId) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const module = await storage.getTaskModule(req.params.id as string);
      if (!module) {
        return res.status(404).json({ message: "Task module not found" });
      }
      if (module.workspaceId !== workspaceId) {
        return res.status(403).json({ message: "Not authorized" });
      }
      const { itemIds } = req.body;
      if (!Array.isArray(itemIds)) {
        return res.status(400).json({ message: "itemIds must be an array" });
      }
      await storage.reorderTaskModuleItems(req.params.id as string, itemIds);
      const updatedModule = await storage.getTaskModuleWithItems(req.params.id as string);
      res.json(updatedModule);
    } catch (error) {
      logger.error("TaskModules", "Error reordering module items:", error);
      res.status(500).json({ message: "Failed to reorder module items" });
    }
  });

  app.post("/api/procedures/:procedureId/add-module/:moduleId", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const workspaceId = getWorkspaceId(req);
      if (!userId || !workspaceId) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const procedure = await storage.getProcedure(req.params.procedureId as string);
      if (!procedure) {
        return res.status(404).json({ message: "Procedure not found" });
      }
      if (procedure.workspaceId !== workspaceId) {
        return res.status(403).json({ message: "Not authorized" });
      }
      const module = await storage.getTaskModuleWithItems(req.params.moduleId as string);
      if (!module) {
        return res.status(404).json({ message: "Task module not found" });
      }
      if (module.workspaceId !== workspaceId) {
        return res.status(403).json({ message: "Not authorized" });
      }
      const existingSteps = await storage.getProcedureSteps(req.params.procedureId as string);
      const maxStepOrder = existingSteps.length > 0 ? Math.max(...existingSteps.map(s => s.stepOrder)) : 0;
      const maxModuleOrder = existingSteps.reduce((max, s) => Math.max(max, s.moduleOrder || 0), 0);
      const newModuleOrder = maxModuleOrder + 1;
      for (let i = 0; i < module.items.length; i++) {
        const item = module.items[i];
        await storage.createProcedureStep({
          procedureId: req.params.procedureId as string,
          stepOrder: maxStepOrder + i + 1,
          label: item.label,
          description: item.description,
          requiresPhotoVerification: item.requiresPhotoVerification,
          photoVerificationMode: item.photoVerificationMode || (item.requiresPhotoVerification ? 'required' : 'none'),
          requiresGpsVerification: item.requiresGpsVerification,
          moduleTitle: module.name,
          moduleOrder: newModuleOrder,
          sourceModuleId: module.id,
        });
      }
      const updatedProcedure = await storage.getProcedureWithSteps(req.params.procedureId as string);
      res.json(updatedProcedure);
    } catch (error) {
      logger.error("TaskModules", "Error adding module to procedure:", error);
      res.status(500).json({ message: "Failed to add module to procedure" });
    }
  });

  // ============================================
  // Cleaner Scheduling System Routes
  // ============================================

  app.get("/api/cleaners", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const workspaceId = getWorkspaceId(req);
      if (!userId || !workspaceId) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const cleanersList = await s.getCleanersByWorkspace(workspaceId);
      res.json(cleanersList);
    } catch (error) {
      logger.error("Cleaners", "Error fetching cleaners:", error);
      res.status(500).json({ message: "Failed to fetch cleaners" });
    }
  });

  app.get("/api/cleaners/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const workspaceId = getWorkspaceId(req);
      if (!userId || !workspaceId) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const cleaner = await s.getCleanerWithAssignments(req.params.id as string);
      if (!cleaner) {
        return res.status(404).json({ message: "Cleaner not found" });
      }
      if (cleaner.workspaceId !== workspaceId) {
        return res.status(403).json({ message: "Not authorized" });
      }
      res.json(cleaner);
    } catch (error) {
      logger.error("Cleaners", "Error fetching cleaner:", error);
      res.status(500).json({ message: "Failed to fetch cleaner" });
    }
  });

  app.post("/api/cleaners", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const workspaceId = getWorkspaceId(req);
      if (!userId || !workspaceId) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const validationResult = insertCleanerSchema.safeParse({
        ...req.body,
        workspaceId,
      });
      if (!validationResult.success) {
        return res.status(400).json({ message: "Invalid cleaner data", errors: validationResult.error.errors });
      }
      const email = validationResult.data.email?.trim() || null;
      const phone = validationResult.data.phone?.trim() || null;
      if (email || phone) {
        const duplicate = await s.findCleanerByEmailOrPhone(workspaceId, email, phone);
        if (duplicate) {
          const field = email && duplicate.email === email ? 'email' : 'phone';
          return res.status(409).json({ message: `A cleaner with this ${field} already exists: ${duplicate.name}` });
        }
      }

      const crypto = await import('crypto');
      const inviteToken = crypto.randomBytes(32).toString('hex');
      const cleaner = await s.createCleaner({ ...validationResult.data, inviteToken });

      if (cleaner.email) {
        try {
          const { sendCleanerInviteEmail } = await import('../services/email');
          const user = await storage.getUser(userId);
          const workspace = await storage.getWorkspace(workspaceId);
          const protocol = req.headers['x-forwarded-proto'] || 'https';
          const host = req.headers['x-forwarded-host'] || req.headers.host;
          const requestBaseUrl = host ? `${protocol}://${host}` : undefined;
          await sendCleanerInviteEmail({
            toEmail: cleaner.email,
            cleanerName: cleaner.name,
            workspaceName: workspace?.name || 'your workspace',
            inviterName: user?.firstName ? `${user.firstName} ${user.lastName || ''}`.trim() : 'Your host',
            role: (cleaner.type as 'individual' | 'company' | 'cleaning_manager') || 'individual',
            inviteToken: cleaner.inviteToken!,
            baseUrl: requestBaseUrl,
          });
        } catch (emailError) {
          logger.error("Cleaners", "Error sending cleaner invite email (non-blocking):", emailError);
        }
      }

      res.json(cleaner);
    } catch (error) {
      logger.error("Cleaners", "Error creating cleaner:", error);
      res.status(500).json({ message: "Failed to create cleaner" });
    }
  });

  app.patch("/api/cleaners/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const workspaceId = getWorkspaceId(req);
      if (!userId || !workspaceId) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const existing = await s.getCleaner(req.params.id as string);
      if (!existing) {
        return res.status(404).json({ message: "Cleaner not found" });
      }
      if (existing.workspaceId !== workspaceId) {
        return res.status(403).json({ message: "Not authorized" });
      }
      const cleaner = await s.updateCleaner(req.params.id, req.body);
      res.json(cleaner);
    } catch (error) {
      logger.error("Cleaners", "Error updating cleaner:", error);
      res.status(500).json({ message: "Failed to update cleaner" });
    }
  });

  app.get("/api/cleaners/:id/dependencies", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const workspaceId = getWorkspaceId(req);
      if (!userId || !workspaceId) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const cleaner = await s.getCleaner(req.params.id as string);
      if (!cleaner || cleaner.workspaceId !== workspaceId) {
        return res.status(404).json({ message: "Cleaner not found" });
      }
      const deps = await s.getMemberDependencies(req.params.id as string);
      res.json(deps);
    } catch (error) {
      logger.error("Cleaners", "Error checking dependencies:", error);
      res.status(500).json({ message: "Failed to check dependencies" });
    }
  });

  app.post("/api/cleaners/:id/replace-and-delete", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const workspaceId = getWorkspaceId(req);
      if (!userId || !workspaceId) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const cleaner = await s.getCleaner(req.params.id as string);
      if (!cleaner || cleaner.workspaceId !== workspaceId) {
        return res.status(404).json({ message: "Cleaner not found" });
      }
      const bodySchema = z.object({
        replacementId: z.string().nullable(),
      });
      const bodyResult = bodySchema.safeParse(req.body);
      if (!bodyResult.success) {
        return res.status(400).json({ message: "Invalid request" });
      }
      if (bodyResult.data.replacementId) {
        const replacement = await s.getCleaner(bodyResult.data.replacementId);
        if (!replacement || replacement.workspaceId !== workspaceId) {
          return res.status(400).json({ message: "Replacement cleaner not found" });
        }
        if (replacement.parentId !== cleaner.parentId) {
          return res.status(400).json({ message: "Replacement must be from the same team" });
        }
      }
      await s.reassignMemberAndDelete(req.params.id, bodyResult.data.replacementId);
      res.json({ success: true });
    } catch (error) {
      logger.error("Cleaners", "Error replacing and deleting:", error);
      res.status(500).json({ message: "Failed to replace and delete" });
    }
  });

  app.delete("/api/cleaners/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const workspaceId = getWorkspaceId(req);
      if (!userId || !workspaceId) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const existing = await s.getCleaner(req.params.id as string);
      if (!existing) {
        return res.status(404).json({ message: "Cleaner not found" });
      }
      if (existing.workspaceId !== workspaceId) {
        return res.status(403).json({ message: "Not authorized" });
      }
      await s.deleteCleaner(req.params.id as string);
      res.json({ success: true });
    } catch (error) {
      logger.error("Cleaners", "Error deleting cleaner:", error);
      res.status(500).json({ message: "Failed to delete cleaner" });
    }
  });

  app.get("/api/cleaners/:id/members", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const workspaceId = getWorkspaceId(req);
      if (!userId || !workspaceId) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const company = await s.getCleaner(req.params.id as string);
      if (!company || company.workspaceId !== workspaceId) {
        return res.status(404).json({ message: "Company/Manager not found" });
      }
      if (company.type !== 'company' && company.type !== 'cleaning_manager') {
        return res.status(400).json({ message: "This cleaner is not a company or cleaning manager" });
      }
      const members = await s.getCompanyMembers(req.params.id as string);
      res.json(members);
    } catch (error) {
      logger.error("Cleaners", "Error fetching members:", error);
      res.status(500).json({ message: "Failed to fetch members" });
    }
  });

  app.post("/api/cleaners/:id/members", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const workspaceId = getWorkspaceId(req);
      if (!userId || !workspaceId) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const company = await s.getCleaner(req.params.id as string);
      if (!company || company.workspaceId !== workspaceId) {
        return res.status(404).json({ message: "Company/Manager not found" });
      }
      if (company.type !== 'company' && company.type !== 'cleaning_manager') {
        return res.status(400).json({ message: "This cleaner is not a company or cleaning manager" });
      }
      const validationResult = insertCleanerSchema.safeParse({
        ...req.body,
        workspaceId,
        type: 'individual',
        parentId: req.params.id,
      });
      if (!validationResult.success) {
        return res.status(400).json({ message: "Invalid member data", errors: validationResult.error.errors });
      }
      const memberEmail = validationResult.data.email?.trim() || null;
      const memberPhone = validationResult.data.phone?.trim() || null;
      if (memberEmail || memberPhone) {
        const duplicate = await s.findCleanerByEmailOrPhone(workspaceId, memberEmail, memberPhone);
        if (duplicate) {
          const field = memberEmail && duplicate.email === memberEmail ? 'email' : 'phone';
          return res.status(409).json({ message: `A cleaner with this ${field} already exists: ${duplicate.name}` });
        }
      }
      const crypto = await import('crypto');
      const memberInviteToken = crypto.randomBytes(32).toString('hex');
      const member = await s.createCleaner({ ...validationResult.data, inviteToken: memberInviteToken });

      if (member.email) {
        try {
          const { sendCleanerInviteEmail } = await import('../services/email');
          const user = await storage.getUser(userId);
          const workspace = await storage.getWorkspace(workspaceId);
          const protocol = req.headers['x-forwarded-proto'] || 'https';
          const host = req.headers['x-forwarded-host'] || req.headers.host;
          const requestBaseUrl = host ? `${protocol}://${host}` : undefined;
          await sendCleanerInviteEmail({
            toEmail: member.email,
            cleanerName: member.name,
            workspaceName: workspace?.name || 'your workspace',
            inviterName: user?.firstName ? `${user.firstName} ${user.lastName || ''}`.trim() : 'Your host',
            role: 'team_member',
            companyName: company.name,
            inviteToken: member.inviteToken!,
            baseUrl: requestBaseUrl,
          });
        } catch (emailError) {
          logger.error("Cleaners", "Error sending team member invite email (non-blocking):", emailError);
        }
      }

      res.json(member);
    } catch (error) {
      logger.error("Cleaners", "Error adding member:", error);
      res.status(500).json({ message: "Failed to add member" });
    }
  });

  app.patch("/api/cleaning-tasks/:id/assign-member", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const workspaceId = getWorkspaceId(req);
      if (!userId || !workspaceId) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const task = await s.getCleaningTask(req.params.id as string);
      if (!task || task.workspaceId !== workspaceId) {
        return res.status(404).json({ message: "Task not found" });
      }
      const bodySchema = z.object({
        assignedMemberId: z.string().nullable(),
      });
      const bodyResult = bodySchema.safeParse(req.body);
      if (!bodyResult.success) {
        return res.status(400).json({ message: "Invalid data" });
      }
      if (bodyResult.data.assignedMemberId) {
        const member = await s.getCleaner(bodyResult.data.assignedMemberId);
        if (!member || member.parentId !== task.cleanerId) {
          return res.status(400).json({ message: "Member does not belong to this company" });
        }
      }
      const updated = await s.updateCleaningTask(req.params.id, {
        assignedMemberId: bodyResult.data.assignedMemberId,
      });
      res.json(updated);
    } catch (error) {
      logger.error("Cleaners", "Error assigning member:", error);
      res.status(500).json({ message: "Failed to assign member" });
    }
  });

  app.patch("/api/cleaning-tasks/:id/reassign-cleaner", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const workspaceId = getWorkspaceId(req);
      if (!userId || !workspaceId) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const task = await s.getCleaningTask(req.params.id as string);
      if (!task || task.workspaceId !== workspaceId) {
        return res.status(404).json({ message: "Task not found" });
      }
      const bodySchema = z.object({
        cleanerId: z.string().nullable(),
        assignedMemberId: z.string().nullable().optional(),
      });
      const bodyResult = bodySchema.safeParse(req.body);
      if (!bodyResult.success) {
        return res.status(400).json({ message: "Invalid data" });
      }
      if (bodyResult.data.cleanerId) {
        const cleaner = await s.getCleaner(bodyResult.data.cleanerId);
        if (!cleaner || cleaner.workspaceId !== workspaceId) {
          return res.status(400).json({ message: "Cleaner not found in this workspace" });
        }
      }
      const updateData: any = {
        cleanerId: bodyResult.data.cleanerId,
        assignedMemberId: bodyResult.data.assignedMemberId ?? null,
        cleanerAccepted: null,
        cleanerAcceptedAt: null,
      };
      const updated = await s.updateCleaningTask(req.params.id, updateData);
      res.json(updated);
    } catch (error) {
      logger.error("Cleaners", "Error reassigning cleaner:", error);
      res.status(500).json({ message: "Failed to reassign cleaner" });
    }
  });

  app.post("/api/cleaners/:cleanerId/assignments", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const workspaceId = getWorkspaceId(req);
      if (!userId || !workspaceId) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const cleaner = await s.getCleaner(req.params.cleanerId as string);
      if (!cleaner || cleaner.workspaceId !== workspaceId) {
        return res.status(403).json({ message: "Not authorized" });
      }
      const bodySchema = z.object({
        listingId: z.string(),
        procedureId: z.string().nullable().optional(),
        assignmentMode: z.enum(["auto", "manual"]).optional(),
        defaultMemberId: z.string().nullable().optional(),
      });
      const bodyResult = bodySchema.safeParse(req.body);
      if (!bodyResult.success) {
        return res.status(400).json({ message: "Invalid assignment data", errors: bodyResult.error.errors });
      }
      if (bodyResult.data.defaultMemberId) {
        const member = await s.getCleaner(bodyResult.data.defaultMemberId);
        if (!member || member.parentId !== req.params.cleanerId as string) {
          return res.status(400).json({ message: "Default member does not belong to this company/manager" });
        }
      }
      const assignment = await s.createAssignment({
        workspaceId,
        cleanerId: req.params.cleanerId,
        listingId: bodyResult.data.listingId,
        procedureId: bodyResult.data.procedureId || null,
        assignmentMode: bodyResult.data.assignmentMode || "manual",
        defaultMemberId: bodyResult.data.defaultMemberId || null,
      });
      res.json(assignment);
    } catch (error) {
      logger.error("Cleaners", "Error creating assignment:", error);
      res.status(500).json({ message: "Failed to create assignment" });
    }
  });

  app.get("/api/cleaner-invite/:token", async (req, res) => {
    try {
      const cleaner = await s.getCleanerByInviteToken(req.params.token as string);
      if (!cleaner) {
        return res.status(404).json({ message: "Invalid or expired invitation" });
      }
      const workspace = await storage.getWorkspace(cleaner.workspaceId);
      res.json({
        cleanerName: cleaner.name,
        workspaceName: workspace?.name || 'Unknown workspace',
        type: cleaner.type,
        alreadyLinked: !!cleaner.userId,
      });
    } catch (error) {
      logger.error("Cleaners", "Error validating invite token:", error);
      res.status(500).json({ message: "Failed to validate invitation" });
    }
  });

  app.post("/api/cleaner-invite/:token/accept", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const cleaner = await s.getCleanerByInviteToken(req.params.token as string);
      if (!cleaner) {
        return res.status(404).json({ message: "Invalid or expired invitation" });
      }
      if (cleaner.userId) {
        return res.status(400).json({ message: "This invitation has already been accepted" });
      }
      await s.updateCleaner(cleaner.id, { userId, inviteToken: null });
      const existingMembership = await storage.getWorkspaceMember(cleaner.workspaceId, userId);
      if (!existingMembership) {
        await storage.createWorkspaceMember({
          workspaceId: cleaner.workspaceId,
          userId,
          role: 'user_staff',
          status: 'active',
        });
      }
      res.json({ message: "Invitation accepted", workspaceId: cleaner.workspaceId });
    } catch (error) {
      logger.error("Cleaners", "Error accepting invite:", error);
      res.status(500).json({ message: "Failed to accept invitation" });
    }
  });

  app.get("/api/cleaner-assignments", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const workspaceId = getWorkspaceId(req);
      if (!userId || !workspaceId) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const assignments = await s.getAssignmentsByWorkspace(workspaceId);
      res.json(assignments);
    } catch (error) {
      logger.error("Cleaners", "Error fetching assignments:", error);
      res.status(500).json({ message: "Failed to fetch assignments" });
    }
  });

  app.patch("/api/cleaner-assignments/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const workspaceId = getWorkspaceId(req);
      if (!userId || !workspaceId) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const found = await s.getAssignmentById(req.params.id as string);
      if (!found || found.workspaceId !== workspaceId) {
        return res.status(404).json({ message: "Assignment not found" });
      }
      const updateSchema = z.object({
        procedureId: z.string().nullable().optional(),
        assignmentMode: z.enum(["auto", "manual"]).optional(),
        defaultMemberId: z.string().nullable().optional(),
      });
      const bodyResult = updateSchema.safeParse(req.body);
      if (!bodyResult.success) {
        return res.status(400).json({ message: "Invalid update data", errors: bodyResult.error.errors });
      }
      if (bodyResult.data.defaultMemberId) {
        const member = await s.getCleaner(bodyResult.data.defaultMemberId);
        if (!member || member.parentId !== found.cleanerId) {
          return res.status(400).json({ message: "Default member does not belong to this company/manager" });
        }
      }
      const updateData: any = { ...bodyResult.data };
      if (bodyResult.data.assignmentMode === "manual") {
        updateData.defaultMemberId = null;
      }
      const assignment = await s.updateAssignment(req.params.id, updateData);
      res.json(assignment);
    } catch (error) {
      logger.error("Cleaners", "Error updating assignment:", error);
      res.status(500).json({ message: "Failed to update assignment" });
    }
  });

  app.delete("/api/cleaner-assignments/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const workspaceId = getWorkspaceId(req);
      if (!userId || !workspaceId) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const found = await s.getAssignmentById(req.params.id as string);
      if (!found || found.workspaceId !== workspaceId) {
        return res.status(404).json({ message: "Assignment not found" });
      }
      await s.deleteAssignment(req.params.id as string);
      res.json({ success: true });
    } catch (error) {
      logger.error("Cleaners", "Error deleting assignment:", error);
      res.status(500).json({ message: "Failed to delete assignment" });
    }
  });

  app.post("/api/turnovers/sync", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const workspaceId = getWorkspaceId(req);
      if (!userId || !workspaceId) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const workspaceListings = await storage.getListingsByWorkspace(workspaceId);
      const activeListings = workspaceListings.filter(l => l.isActive && l.dataSourceId && l.externalId);
      if (activeListings.length === 0) {
        return res.json({ synced: 0, created: 0, updated: 0, message: "No active listings found" });
      }

      const dataSourceIds = Array.from(new Set(activeListings.map(l => l.dataSourceId)));
      const validDataSourceIds = new Set<string>();
      for (const dsId of Array.from(dataSourceIds)) {
        const { accessToken } = await getValidAccessToken(dsId);
        if (accessToken) validDataSourceIds.add(dsId);
      }

      if (validDataSourceIds.size === 0) {
        return res.status(400).json({ message: "No connected data sources with valid tokens" });
      }

      const today = new Date();
      const startDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 90).toISOString().split('T')[0];
      const endDate = new Date(today.getFullYear() + 2, today.getMonth(), today.getDate()).toISOString().split('T')[0];

      let totalCreated = 0;
      let totalUpdated = 0;

      for (const listing of activeListings) {
        if (!validDataSourceIds.has(listing.dataSourceId)) continue;

        let allReservations: any[] = [];
        let page = 1;
        let hasMore = true;

        while (hasMore) {
          const endpoint = `/reservations?start_date=${startDate}&end_date=${endDate}&include=guest&page=${page}&per_page=50&properties[]=${encodeURIComponent(listing.externalId!)}`;
          const { data, error } = await hospitableApiRequest(listing.dataSourceId, endpoint);

          if (error || !data) {
            logger.error("TurnoversSync", `API error for listing ${listing.id}: ${error}`);
            hasMore = false;
            break;
          }

          const pageReservations = data.data || [];
          const included = data.included || [];
          const guestMap = new Map<string, any>();
          included.forEach((item: any) => {
            if (item.type === 'guest' && item.id) {
              guestMap.set(item.id, item.attributes || item);
            }
          });
          pageReservations.forEach((r: any) => {
            if (!r.guest && r.relationships?.guest?.data?.id) {
              r.guest = guestMap.get(r.relationships.guest.data.id);
            }
          });

          if (pageReservations.length === 0) { hasMore = false; break; }
          allReservations.push(...pageReservations);

          const meta = data.meta;
          if (meta && meta.current_page >= meta.last_page) { hasMore = false; }
          else if (pageReservations.length < 50) { hasMore = false; }
          else { page++; }
        }

        if (allReservations.length === 0) continue;

        const existingReservations = await storage.getReservationsByListing(listing.id);
        const existingByExternalId = new Map(existingReservations.map(r => [r.externalId, r]));

        const dbBatchSize = 10;
        const creates: any[] = [];
        const updates: { id: string; data: any }[] = [];

        if (allReservations.length > 0) {
          const sample = allReservations[0];
          logger.info("TurnoversSync", `Sample reservation keys: ${Object.keys(sample).join(', ')}`);
          if (sample.attributes) {
            logger.info("TurnoversSync", `Sample attributes keys: ${Object.keys(sample.attributes).join(', ')}`);
          }
        }

        for (const r of allReservations) {
          const attrs = r.attributes || r;
          const existing = existingByExternalId.get(r.id);
          const reservationData: any = {
            listingId: listing.id,
            userId: listing.userId,
            workspaceId: listing.workspaceId || undefined,
            externalId: r.id,
            confirmationCode: attrs.code || attrs.confirmation_code || r.code || null,
            guestName: r.guest?.full_name || (r.guest?.first_name && r.guest?.last_name ? `${r.guest.first_name} ${r.guest.last_name}` : r.guest?.first_name) || attrs.guest_name || "Guest",
            guestEmail: r.guest?.email || null,
            guestProfilePicture: r.guest?.profile_picture || null,
            platform: attrs.platform || r.platform || "Airbnb",
            checkInDate: attrs.check_in ? new Date(attrs.check_in) : (r.check_in ? new Date(r.check_in) : null),
            checkOutDate: attrs.check_out ? new Date(attrs.check_out) : (r.check_out ? new Date(r.check_out) : null),
            status: attrs.status || r.status || "accepted",
          };

          if (existing) {
            updates.push({ id: existing.id, data: reservationData });
          } else {
            creates.push(reservationData);
          }
        }

        for (let i = 0; i < updates.length; i += dbBatchSize) {
          const batch = updates.slice(i, i + dbBatchSize);
          await Promise.all(batch.map(({ id, data }) => storage.updateReservation(id, data)));
        }
        for (let i = 0; i < creates.length; i += dbBatchSize) {
          const batch = creates.slice(i, i + dbBatchSize);
          await Promise.all(batch.map(data => storage.createReservation(data)));
        }

        totalCreated += creates.length;
        totalUpdated += updates.length;
        logger.info("TurnoversSync", `Listing ${listing.name || listing.id}: fetched ${allReservations.length} (${creates.length} new, ${updates.length} updated)`);
      }

      logger.info("TurnoversSync", `Complete: ${totalCreated} created, ${totalUpdated} updated across ${activeListings.length} listings`);
      res.json({ synced: totalCreated + totalUpdated, created: totalCreated, updated: totalUpdated });
    } catch (error) {
      logger.error("TurnoversSync", "Error:", error);
      res.status(500).json({ message: "Failed to sync turnovers reservations" });
    }
  });

  app.get("/api/turnovers", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const workspaceId = getWorkspaceId(req);
      if (!userId || !workspaceId) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const { fromDate, toDate, cleanerId, status, offered } = req.query;
      const turnovers = await s.getTurnoversByWorkspace(workspaceId, {
        fromDate: fromDate ? new Date(fromDate as string) : undefined,
        toDate: toDate ? new Date(toDate as string) : undefined,
        cleanerId: cleanerId as string | undefined,
        status: status as string | undefined,
        offeredFilter: offered as string | undefined,
      });
      res.json(turnovers);
    } catch (error) {
      logger.error("Turnovers", "Error fetching turnovers:", error);
      res.status(500).json({ message: "Failed to fetch turnovers" });
    }
  });

  app.get("/api/cleaning-tasks", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const workspaceId = getWorkspaceId(req);
      if (!userId || !workspaceId) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const { status, cleanerId, listingId, fromDate, toDate } = req.query;
      const tasks = await s.getCleaningTasksByWorkspace(workspaceId, {
        status: status as string | undefined,
        cleanerId: cleanerId as string | undefined,
        listingId: listingId as string | undefined,
        fromDate: fromDate ? new Date(fromDate as string) : undefined,
        toDate: toDate ? new Date(toDate as string) : undefined,
      });
      res.json(tasks);
    } catch (error) {
      logger.error("CleaningTasks", "Error fetching cleaning tasks:", error);
      res.status(500).json({ message: "Failed to fetch cleaning tasks" });
    }
  });

  app.get("/api/cleaning-tasks/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const workspaceId = getWorkspaceId(req);
      if (!userId || !workspaceId) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const task = await s.getCleaningTask(req.params.id as string);
      if (!task) {
        return res.status(404).json({ message: "Cleaning task not found" });
      }
      if (task.workspaceId !== workspaceId) {
        return res.status(403).json({ message: "Not authorized" });
      }
      res.json(task);
    } catch (error) {
      logger.error("CleaningTasks", "Error fetching cleaning task:", error);
      res.status(500).json({ message: "Failed to fetch cleaning task" });
    }
  });

  app.patch("/api/cleaning-tasks/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const workspaceId = getWorkspaceId(req);
      if (!userId || !workspaceId) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const existing = await s.getCleaningTask(req.params.id as string);
      if (!existing) {
        return res.status(404).json({ message: "Cleaning task not found" });
      }
      if (existing.workspaceId !== workspaceId) {
        return res.status(403).json({ message: "Not authorized" });
      }
      const task = await s.updateCleaningTask(req.params.id, req.body);
      res.json(task);
    } catch (error) {
      logger.error("CleaningTasks", "Error updating cleaning task:", error);
      res.status(500).json({ message: "Failed to update cleaning task" });
    }
  });

  app.delete("/api/cleaning-tasks/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const workspaceId = getWorkspaceId(req);
      if (!userId || !workspaceId) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const existing = await s.getCleaningTask(req.params.id as string);
      if (!existing) {
        return res.status(404).json({ message: "Cleaning task not found" });
      }
      if (existing.workspaceId !== workspaceId) {
        return res.status(403).json({ message: "Not authorized" });
      }
      await s.deleteCleaningTask(req.params.id as string);
      res.json({ success: true });
    } catch (error) {
      logger.error("CleaningTasks", "Error deleting cleaning task:", error);
      res.status(500).json({ message: "Failed to delete cleaning task" });
    }
  });

  app.patch("/api/cleaning-task-items/:id/toggle", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const { isCompleted } = req.body;
      const item = await s.toggleCleaningTaskItemCompletion(req.params.id, isCompleted);
      res.json(item);
    } catch (error) {
      logger.error("CleaningTasks", "Error toggling task item:", error);
      res.status(500).json({ message: "Failed to toggle task item" });
    }
  });

  app.get("/api/cleaning-checklist/:token", async (req, res) => {
    try {
      const task = await s.getCleaningTaskByToken(req.params.token as string);
      if (!task) {
        return res.status(404).json({ message: "Checklist not found" });
      }
      res.json(task);
    } catch (error) {
      logger.error("CleaningTasks", "Error fetching checklist:", error);
      res.status(500).json({ message: "Failed to fetch checklist" });
    }
  });

  app.patch("/api/cleaning-checklist/:token/items/:itemId/toggle", async (req, res) => {
    try {
      const task = await s.getCleaningTaskByToken(req.params.token as string);
      if (!task) {
        return res.status(404).json({ message: "Checklist not found" });
      }
      const items = await s.getCleaningTaskItems(task.id);
      const itemBelongsToTask = items.some((i: any) => i.id === (req.params.itemId as string));
      if (!itemBelongsToTask) {
        return res.status(403).json({ message: "Item does not belong to this checklist" });
      }
      const { isCompleted } = req.body;
      const item = await s.toggleCleaningTaskItemCompletion(req.params.itemId as string, isCompleted);
      res.json(item);
    } catch (error) {
      logger.error("CleaningTasks", "Error toggling checklist item:", error);
      res.status(500).json({ message: "Failed to toggle checklist item" });
    }
  });

  app.post("/api/cleaning-tasks/generate", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const workspaceId = getWorkspaceId(req);
      if (!userId || !workspaceId) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const assignments = await s.getAssignmentsByWorkspace(workspaceId);
      const activeAssignments = assignments.filter((a: any) => a.isActive);

      if (activeAssignments.length === 0) {
        return res.json({ generated: 0, message: "No active cleaner assignments" });
      }

      const now = new Date();
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 30);

      let generated = 0;

      for (const assignment of activeAssignments) {
        const reservationsForListing = await db.select()
          .from(reservations)
          .where(and(
            eq(reservations.listingId, assignment.listingId),
            eq(reservations.workspaceId, workspaceId),
            gte(reservations.checkOutDate, now),
            lte(reservations.checkOutDate, futureDate)
          ));

        for (const reservation of reservationsForListing) {
          if (!reservation.checkOutDate) continue;

          const existing = await s.findExistingCleaningTask(
            workspaceId, assignment.listingId, reservation.id
          );
          if (existing) continue;

          const crypto = await import('crypto');
          const accessToken = crypto.randomBytes(32).toString('hex');

          let effectiveProcedureId = assignment.procedureId;
          if (!effectiveProcedureId) {
            const listingData = await storage.getListing(assignment.listingId);
            if (listingData?.defaultProcedureId) {
              effectiveProcedureId = listingData.defaultProcedureId;
            }
          }

          const taskData: any = {
            workspaceId,
            cleanerId: assignment.cleanerId,
            listingId: assignment.listingId,
            reservationId: reservation.id,
            assignmentId: assignment.id,
            procedureId: effectiveProcedureId,
            scheduledDate: reservation.checkOutDate,
            guestName: reservation.guestName,
            status: "scheduled",
            accessToken,
          };
          if (assignment.assignmentMode === "auto" && assignment.defaultMemberId) {
            taskData.assignedMemberId = assignment.defaultMemberId;
          }
          const task = await s.createCleaningTask(taskData);

          if (effectiveProcedureId) {
            const procedureWithSteps = await storage.getProcedureWithSteps(effectiveProcedureId);
            if (procedureWithSteps && procedureWithSteps.steps.length > 0) {
              const items = procedureWithSteps.steps.map(step => ({
                cleaningTaskId: task.id,
                stepOrder: step.stepOrder,
                label: step.label,
                description: step.description,
                moduleTitle: step.moduleTitle,
                moduleOrder: step.moduleOrder,
                requiresPhotoVerification: step.requiresPhotoVerification,
                photoVerificationMode: step.photoVerificationMode || (step.requiresPhotoVerification ? 'required' : 'none'),
                requiresGpsVerification: step.requiresGpsVerification,
              }));
              await s.createCleaningTaskItems(items);
            }
          }
          generated++;
        }
      }

      res.json({ generated, message: `Generated ${generated} cleaning tasks` });
    } catch (error) {
      logger.error("CleaningTasks", "Error generating cleaning tasks:", error);
      res.status(500).json({ message: "Failed to generate cleaning tasks" });
    }
  });

  app.post("/api/cleaning-tasks/send-reminders", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const workspaceId = getWorkspaceId(req);
      if (!userId || !workspaceId) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const { targetDate } = req.body;
      const date = targetDate ? new Date(targetDate) : new Date();

      const tasksToRemind = await s.getUnsentCleaningReminders(date);
      const workspaceTasks = tasksToRemind.filter((t: any) => t.workspaceId === workspaceId);

      let emailsSent = 0;
      let smsSent = 0;

      const baseUrl = config.appUrl || 'https://hostpulse.ai';

      const emailTemplate = await storage.getNotificationTemplate(workspaceId, "reminder_email");
      const smsTemplate = await storage.getNotificationTemplate(workspaceId, "reminder_sms");

      const { renderTemplate, DEFAULT_TEMPLATES, sendTemplatedEmail } = await import('../services/email');

      for (const task of workspaceTasks) {
        const cleaner = await s.getCleaner(task.cleanerId);
        if (!cleaner) continue;

        const now = new Date();
        const currentHour = now.getHours();
        const currentMinute = now.getMinutes();
        const [reminderHour, reminderMinute] = (cleaner.reminderTime || "08:00").split(":").map(Number);

        if (cleaner.reminderTiming === "night_before") {
          const taskDate = new Date(task.scheduledDate);
          const dayBefore = new Date(taskDate);
          dayBefore.setDate(dayBefore.getDate() - 1);
          const isCorrectDay = now.toDateString() === dayBefore.toDateString();
          if (!isCorrectDay) continue;
          if (currentHour < reminderHour || (currentHour === reminderHour && currentMinute < reminderMinute)) continue;
        } else {
          const isCorrectDay = now.toDateString() === new Date(task.scheduledDate).toDateString();
          if (!isCorrectDay) continue;
          if (currentHour < reminderHour || (currentHour === reminderHour && currentMinute < reminderMinute)) continue;
        }

        const checklistUrl = `${baseUrl}/checklist/${task.accessToken}`;
        const scheduledDate = new Date(task.scheduledDate).toLocaleDateString('en-US', {
          weekday: 'long', month: 'long', day: 'numeric'
        });

        const shortCodeData = {
          property_name: task.listing.name,
          address: task.listing.address || '',
          check_in_date: '',
          check_out_date: scheduledDate,
          guest_name: task.guestName || '',
          cleaner_name: cleaner.name,
          checklist_link: checklistUrl,
          scheduled_date: scheduledDate,
        };

        if (cleaner.notifyByEmail && cleaner.email) {
          try {
            const tmpl = emailTemplate || DEFAULT_TEMPLATES.reminder_email;
            await sendTemplatedEmail({
              toEmail: cleaner.email,
              subject: tmpl.subject || DEFAULT_TEMPLATES.reminder_email.subject,
              body: tmpl.body,
              shortCodeData,
            });
            emailsSent++;
          } catch (e) {
            logger.error("Cleaners", `Failed to send email to ${cleaner.email}:`, e);
          }
        }

        if (cleaner.notifyBySms && cleaner.phone) {
          try {
            const { sendSMS } = await import('../services/twilio');
            const tmpl = smsTemplate || DEFAULT_TEMPLATES.reminder_sms;
            const smsMessage = renderTemplate(tmpl.body, shortCodeData);
            await sendSMS(cleaner.phone, smsMessage);
            smsSent++;
          } catch (e) {
            logger.error("Cleaners", `Failed to send SMS to ${cleaner.phone}:`, e);
          }
        }

        const reminderType = (cleaner.notifyByEmail && cleaner.notifyBySms) ? "both" :
          cleaner.notifyByEmail ? "email" : "sms";
        await s.updateCleaningTask(task.id, {
          reminderSentAt: new Date(),
          reminderType,
        });
      }

      res.json({
        success: true,
        emailsSent,
        smsSent,
        totalTasks: workspaceTasks.length,
      });
    } catch (error) {
      logger.error("Cleaners", "Error sending reminders:", error);
      res.status(500).json({ message: "Failed to send reminders" });
    }
  });

  // ============================================
  // Notification Template Routes
  // ============================================

  app.get("/api/notification-templates", isAuthenticated, async (req, res) => {
    try {
      const workspaceId = getWorkspaceId(req);
      if (!workspaceId) return res.status(401).json({ message: "Not authenticated" });
      const templates = await storage.getNotificationTemplatesByWorkspace(workspaceId);
      res.json(templates);
    } catch (error) {
      logger.error("NotificationTemplates", "Error fetching notification templates:", error);
      res.status(500).json({ message: "Failed to fetch notification templates" });
    }
  });

  app.get("/api/notification-templates/defaults", isAuthenticated, async (_req, res) => {
    try {
      const { DEFAULT_TEMPLATES } = await import('../services/email');
      res.json(DEFAULT_TEMPLATES);
    } catch (error) {
      logger.error("NotificationTemplates", "Error fetching default templates:", error);
      res.status(500).json({ message: "Failed to fetch default templates" });
    }
  });

  app.put("/api/notification-templates/:type", isAuthenticated, async (req, res) => {
    try {
      const workspaceId = getWorkspaceId(req);
      if (!workspaceId) return res.status(401).json({ message: "Not authenticated" });
      const type = req.params.type as string;
      const validTypes = ["reminder_email", "reminder_sms", "cancelled_email", "cancelled_sms", "changed_email", "changed_sms"];
      if (!validTypes.includes(type)) {
        return res.status(400).json({ message: "Invalid template type" });
      }
      const { subject, body, isActive } = req.body;
      if (!body || typeof body !== "string") {
        return res.status(400).json({ message: "Template body is required" });
      }
      const template = await storage.upsertNotificationTemplate({
        workspaceId,
        type: type as string,
        subject: subject || null,
        body,
        isActive: isActive !== false,
      });
      res.json(template);
    } catch (error) {
      logger.error("NotificationTemplates", "Error saving notification template:", error);
      res.status(500).json({ message: "Failed to save notification template" });
    }
  });

  app.delete("/api/notification-templates/:id", isAuthenticated, async (req, res) => {
    try {
      const workspaceId = getWorkspaceId(req);
      if (!workspaceId) return res.status(401).json({ message: "Not authenticated" });
      const allTemplates = await storage.getNotificationTemplatesByWorkspace(workspaceId);
      const template = allTemplates.find(t => t.id === req.params.id as string);
      if (!template) return res.status(404).json({ message: "Template not found" });
      await storage.deleteNotificationTemplate(req.params.id as string);
      res.json({ success: true });
    } catch (error) {
      logger.error("NotificationTemplates", "Error deleting notification template:", error);
      res.status(500).json({ message: "Failed to delete notification template" });
    }
  });
}
