import type { Express } from "express";
import { IStorage } from "../storage";
import { isAuthenticated } from "../replit_integrations/auth";
import { config } from "../config";
import { logger } from "../logger";
import { getUserId, getWorkspaceId, validateWorkspaceMembership, getParamId } from "./helpers";

export function registerProcedureRoutes(app: Express, storage: IStorage) {
  // =====================
  // Procedures
  // =====================

  app.get("/api/procedures", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const workspaceId = getWorkspaceId(req);
      
      if (!workspaceId) {
        return res.status(400).json({ message: "Workspace ID required" });
      }
      
      if (!(await validateWorkspaceMembership(userId, workspaceId))) {
        return res.status(403).json({ message: "Not a member of this workspace" });
      }
      
      const procedures = await storage.getProceduresByWorkspace(workspaceId);
      res.json(procedures);
    } catch (error) {
      logger.error("Procedures", "Error fetching procedures:", error);
      res.status(500).json({ message: "Failed to fetch procedures" });
    }
  });

  app.get("/api/procedures/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const workspaceId = getWorkspaceId(req);
      
      const procedure = await storage.getProcedureWithSteps(getParamId(req.params.id));
      if (!procedure) {
        return res.status(404).json({ message: "Procedure not found" });
      }
      
      if (workspaceId && procedure.workspaceId !== workspaceId) {
        return res.status(403).json({ message: "Not authorized to access this procedure" });
      }
      
      if (!(await validateWorkspaceMembership(userId, procedure.workspaceId))) {
        return res.status(403).json({ message: "Not a member of this workspace" });
      }
      
      res.json(procedure);
    } catch (error) {
      logger.error("Procedures", "Error fetching procedure:", error);
      res.status(500).json({ message: "Failed to fetch procedure" });
    }
  });

  app.post("/api/procedures", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const workspaceId = getWorkspaceId(req);
      
      if (!workspaceId) {
        return res.status(400).json({ message: "Workspace ID required" });
      }
      
      if (!(await validateWorkspaceMembership(userId, workspaceId))) {
        return res.status(403).json({ message: "Not a member of this workspace" });
      }
      
      const { title, description, status, createdViaAi, aiPrompt, steps, listingId } = req.body;
      
      if (listingId) {
        const listing = await storage.getListing(listingId);
        if (!listing || listing.workspaceId !== workspaceId) {
          return res.status(400).json({ message: "Invalid listing ID for this workspace" });
        }
      }
      
      const procedure = await storage.createProcedure({
        workspaceId,
        createdByUserId: userId,
        listingId: listingId || null,
        title,
        description,
        status: status || "draft",
        createdViaAi: createdViaAi || false,
        aiPrompt,
      });
      
      if (steps && Array.isArray(steps)) {
        for (let i = 0; i < steps.length; i++) {
          const step = steps[i];
          await storage.createProcedureStep({
            procedureId: procedure.id,
            stepOrder: i + 1,
            label: step.label,
            description: step.description,
            media: step.media,
            requiresPhotoVerification: step.requiresPhotoVerification || step.photoVerificationMode === 'required' || false,
            photoVerificationMode: step.photoVerificationMode || (step.requiresPhotoVerification ? 'required' : 'none'),
            requiresGpsVerification: step.requiresGpsVerification || false,
            expectedGpsLocation: step.expectedGpsLocation,
            gpsRadiusMeters: step.gpsRadiusMeters,
          });
        }
      }
      
      const result = await storage.getProcedureWithSteps(procedure.id);
      res.status(201).json(result);
    } catch (error) {
      logger.error("Procedures", "Error creating procedure:", error);
      res.status(500).json({ message: "Failed to create procedure" });
    }
  });

  app.patch("/api/procedures/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const workspaceId = getWorkspaceId(req);
      
      const procedure = await storage.getProcedure(getParamId(req.params.id));
      if (!procedure) {
        return res.status(404).json({ message: "Procedure not found" });
      }
      
      if (!(await validateWorkspaceMembership(userId, procedure.workspaceId))) {
        return res.status(403).json({ message: "Not authorized to modify this procedure" });
      }
      
      const { title, description, status, listingId, isLocked } = req.body;
      
      if (isLocked !== undefined && procedure.createdByUserId !== userId) {
        return res.status(403).json({ message: "Only the creator can lock or unlock this procedure" });
      }
      
      if (procedure.isLocked && procedure.createdByUserId !== userId && isLocked === undefined) {
        return res.status(403).json({ message: "This procedure is locked. Only the creator can edit it." });
      }
      
      if (listingId) {
        const listing = await storage.getListing(listingId);
        if (!listing || listing.workspaceId !== procedure.workspaceId) {
          return res.status(400).json({ message: "Invalid listing ID for this workspace" });
        }
      }
      
      const updateData: Record<string, any> = {};
      if (title !== undefined) updateData.title = title;
      if (description !== undefined) updateData.description = description;
      if (status !== undefined) updateData.status = status;
      if (listingId !== undefined) updateData.listingId = listingId;
      if (isLocked !== undefined) updateData.isLocked = isLocked;
      
      const updated = await storage.updateProcedure(getParamId(req.params.id), updateData);
      
      res.json(updated);
    } catch (error) {
      logger.error("Procedures", "Error updating procedure:", error);
      res.status(500).json({ message: "Failed to update procedure" });
    }
  });

  app.delete("/api/procedures/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      
      const procedure = await storage.getProcedure(getParamId(req.params.id));
      if (!procedure) {
        return res.status(404).json({ message: "Procedure not found" });
      }
      
      if (!(await validateWorkspaceMembership(userId, procedure.workspaceId))) {
        return res.status(403).json({ message: "Not authorized to delete this procedure" });
      }
      
      await storage.deleteProcedure(getParamId(req.params.id));
      res.status(204).send();
    } catch (error) {
      logger.error("Procedures", "Error deleting procedure:", error);
      res.status(500).json({ message: "Failed to delete procedure" });
    }
  });

  app.post("/api/procedures/:id/steps", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const procedureId = getParamId(req.params.id);
      
      const procedure = await storage.getProcedure(procedureId);
      if (!procedure) {
        return res.status(404).json({ message: "Procedure not found" });
      }
      
      if (!(await validateWorkspaceMembership(userId, procedure.workspaceId))) {
        return res.status(403).json({ message: "Not authorized to modify this procedure" });
      }
      
      if (procedure.isLocked && procedure.createdByUserId !== userId) {
        return res.status(403).json({ message: "This procedure is locked. Only the creator can edit it." });
      }
      
      const existingSteps = await storage.getProcedureSteps(procedureId);
      const maxOrder = existingSteps.length > 0 ? Math.max(...existingSteps.map(s => s.stepOrder)) : 0;
      
      const { label, description, media, requiresPhotoVerification, photoVerificationMode, requiresGpsVerification, expectedGpsLocation, gpsRadiusMeters } = req.body;
      
      const resolvedMode = photoVerificationMode || (requiresPhotoVerification ? 'required' : 'none');
      const step = await storage.createProcedureStep({
        procedureId,
        stepOrder: maxOrder + 1,
        label,
        description,
        media,
        requiresPhotoVerification: resolvedMode === 'required',
        photoVerificationMode: resolvedMode,
        requiresGpsVerification: requiresGpsVerification || false,
        expectedGpsLocation,
        gpsRadiusMeters,
      });
      
      res.status(201).json(step);
    } catch (error) {
      logger.error("Procedures", "Error adding step:", error);
      res.status(500).json({ message: "Failed to add step" });
    }
  });

  app.patch("/api/procedures/:procedureId/steps/:stepId", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const procedureId = getParamId(req.params.procedureId);
      const stepId = getParamId(req.params.stepId);
      
      const procedure = await storage.getProcedure(procedureId);
      if (!procedure) {
        return res.status(404).json({ message: "Procedure not found" });
      }
      
      if (!(await validateWorkspaceMembership(userId, procedure.workspaceId))) {
        return res.status(403).json({ message: "Not authorized to modify this procedure" });
      }
      
      const step = await storage.getProcedureStep(stepId);
      if (!step || step.procedureId !== procedureId) {
        return res.status(404).json({ message: "Step not found" });
      }
      
      const { label, description, media, requiresPhotoVerification, photoVerificationMode, requiresGpsVerification, expectedGpsLocation, gpsRadiusMeters, voiceNoteUrl, voiceNoteTranscript, voiceNoteAiSummary, voiceNoteTranslation, issues } = req.body;
      
      const isLockedForUser = procedure.isLocked && procedure.createdByUserId !== userId;
      
      if (isLockedForUser) {
        const hasStructuralChanges = label !== undefined || media !== undefined || 
          requiresPhotoVerification !== undefined || photoVerificationMode !== undefined || requiresGpsVerification !== undefined || 
          expectedGpsLocation !== undefined || gpsRadiusMeters !== undefined;
        if (hasStructuralChanges) {
          return res.status(403).json({ message: "This procedure is locked. You can only add descriptions, voice notes, and report issues." });
        }
      }
      
      const resolvedMode = photoVerificationMode !== undefined ? photoVerificationMode : (requiresPhotoVerification !== undefined ? (requiresPhotoVerification ? 'required' : 'none') : undefined);
      const resolvedRequired = resolvedMode !== undefined ? resolvedMode === 'required' : undefined;
      
      const updated = await storage.updateProcedureStep(stepId, isLockedForUser ? {
        description,
        voiceNoteUrl,
        voiceNoteTranscript,
        voiceNoteAiSummary,
        voiceNoteTranslation,
        issues,
      } : {
        label,
        description,
        media,
        requiresPhotoVerification: resolvedRequired,
        photoVerificationMode: resolvedMode,
        requiresGpsVerification,
        expectedGpsLocation,
        gpsRadiusMeters,
        voiceNoteUrl,
        voiceNoteTranscript,
        voiceNoteAiSummary,
        voiceNoteTranslation,
        issues,
      });
      
      res.json(updated);
    } catch (error) {
      logger.error("Procedures", "Error updating step:", error);
      res.status(500).json({ message: "Failed to update step" });
    }
  });

  app.delete("/api/procedures/:procedureId/steps/:stepId", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const procedureId = getParamId(req.params.procedureId);
      const stepId = getParamId(req.params.stepId);
      
      const procedure = await storage.getProcedure(procedureId);
      if (!procedure) {
        return res.status(404).json({ message: "Procedure not found" });
      }
      
      if (!(await validateWorkspaceMembership(userId, procedure.workspaceId))) {
        return res.status(403).json({ message: "Not authorized to modify this procedure" });
      }
      
      if (procedure.isLocked && procedure.createdByUserId !== userId) {
        return res.status(403).json({ message: "This procedure is locked. Only the creator can edit it." });
      }
      
      const step = await storage.getProcedureStep(stepId);
      if (!step || step.procedureId !== procedureId) {
        return res.status(404).json({ message: "Step not found" });
      }
      
      await storage.deleteProcedureStep(stepId);
      res.status(204).send();
    } catch (error) {
      logger.error("Procedures", "Error deleting step:", error);
      res.status(500).json({ message: "Failed to delete step" });
    }
  });

  app.post("/api/procedures/:id/reorder", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const procedureId = getParamId(req.params.id);
      
      const procedure = await storage.getProcedure(procedureId);
      if (!procedure) {
        return res.status(404).json({ message: "Procedure not found" });
      }
      
      if (!(await validateWorkspaceMembership(userId, procedure.workspaceId))) {
        return res.status(403).json({ message: "Not authorized to modify this procedure" });
      }
      
      if (procedure.isLocked && procedure.createdByUserId !== userId) {
        return res.status(403).json({ message: "This procedure is locked. Only the creator can edit it." });
      }
      
      const { stepIds } = req.body;
      if (!Array.isArray(stepIds)) {
        return res.status(400).json({ message: "stepIds array required" });
      }
      
      await storage.reorderProcedureSteps(procedureId, stepIds);
      
      const result = await storage.getProcedureWithSteps(procedureId);
      res.json(result);
    } catch (error) {
      logger.error("Procedures", "Error reordering steps:", error);
      res.status(500).json({ message: "Failed to reorder steps" });
    }
  });

  app.post("/api/tasks/:taskId/procedure", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const taskId = getParamId(req.params.taskId);
      
      const task = await storage.getTask(taskId);
      if (!task) {
        return res.status(404).json({ message: "Task not found" });
      }
      
      if (!(await validateWorkspaceMembership(userId, task.workspaceId!))) {
        return res.status(403).json({ message: "Not authorized" });
      }
      
      const { procedureId } = req.body;
      const procedure = await storage.getProcedure(procedureId);
      if (!procedure) {
        return res.status(404).json({ message: "Procedure not found" });
      }
      
      const existing = await storage.getProcedureAssignmentByTask(taskId);
      if (existing) {
        return res.status(400).json({ message: "Task already has a procedure assigned" });
      }
      
      const assignment = await storage.createProcedureAssignment({
        taskId,
        procedureId,
        assignedByUserId: userId,
      });
      
      res.status(201).json(assignment);
    } catch (error) {
      logger.error("Procedures", "Error assigning procedure:", error);
      res.status(500).json({ message: "Failed to assign procedure" });
    }
  });

  app.get("/api/tasks/:taskId/procedure", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const taskId = getParamId(req.params.taskId);
      
      const task = await storage.getTask(taskId);
      if (!task) {
        return res.status(404).json({ message: "Task not found" });
      }
      
      if (task.workspaceId && !(await validateWorkspaceMembership(userId, task.workspaceId))) {
        return res.status(403).json({ message: "Not authorized" });
      }
      
      const assignment = await storage.getProcedureAssignmentByTask(taskId);
      if (!assignment) {
        return res.json(null);
      }
      
      const procedure = await storage.getProcedureWithSteps(assignment.procedureId);
      res.json({ assignment, procedure });
    } catch (error) {
      logger.error("Procedures", "Error fetching procedure assignment:", error);
      res.status(500).json({ message: "Failed to fetch procedure assignment" });
    }
  });

  app.delete("/api/tasks/:taskId/procedure", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const taskId = getParamId(req.params.taskId);
      
      const task = await storage.getTask(taskId);
      if (!task) {
        return res.status(404).json({ message: "Task not found" });
      }
      
      if (!(await validateWorkspaceMembership(userId, task.workspaceId!))) {
        return res.status(403).json({ message: "Not authorized" });
      }
      
      const assignment = await storage.getProcedureAssignmentByTask(taskId);
      if (assignment) {
        await storage.deleteProcedureAssignment(assignment.id);
      }
      
      res.status(204).send();
    } catch (error) {
      logger.error("Procedures", "Error removing procedure:", error);
      res.status(500).json({ message: "Failed to remove procedure" });
    }
  });

  app.get("/api/tasks/:taskId/procedure/completion", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const taskId = getParamId(req.params.taskId);
      
      const task = await storage.getTask(taskId);
      if (!task) {
        return res.status(404).json({ message: "Task not found" });
      }
      
      if (task.workspaceId && !(await validateWorkspaceMembership(userId, task.workspaceId))) {
        return res.status(403).json({ message: "Not authorized" });
      }
      
      const assignment = await storage.getProcedureAssignmentByTask(taskId);
      if (!assignment) {
        return res.json(null);
      }
      
      let completion = await storage.getProcedureCompletionByAssignment(assignment.id, userId);
      
      if (!completion) {
        completion = await storage.createProcedureCompletion({
          procedureAssignmentId: assignment.id,
          completedByUserId: userId,
          status: "not_started",
        });
      }
      
      const details = await storage.getProcedureCompletionWithDetails(completion.id);
      res.json(details);
    } catch (error) {
      logger.error("Procedures", "Error fetching completion:", error);
      res.status(500).json({ message: "Failed to fetch completion" });
    }
  });

  app.patch("/api/procedure-completions/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const completionId = getParamId(req.params.id);
      
      const completion = await storage.getProcedureCompletion(completionId);
      if (!completion) {
        return res.status(404).json({ message: "Completion not found" });
      }
      
      if (completion.completedByUserId !== userId) {
        return res.status(403).json({ message: "Not authorized to modify this completion" });
      }
      
      const { status, voiceUpdateUrl, voiceUpdateTranscript, aiSummary, aiSummaryStatus, notes } = req.body;
      
      const updateData: any = {};
      if (status !== undefined) updateData.status = status;
      if (voiceUpdateUrl !== undefined) updateData.voiceUpdateUrl = voiceUpdateUrl;
      if (voiceUpdateTranscript !== undefined) updateData.voiceUpdateTranscript = voiceUpdateTranscript;
      if (aiSummary !== undefined) updateData.aiSummary = aiSummary;
      if (aiSummaryStatus !== undefined) updateData.aiSummaryStatus = aiSummaryStatus;
      if (notes !== undefined) updateData.notes = notes;
      
      if (status === "in_progress" && !completion.startedAt) {
        updateData.startedAt = new Date();
      }
      if (status === "completed" && !completion.completedAt) {
        updateData.completedAt = new Date();
      }
      
      const updated = await storage.updateProcedureCompletion(completionId, updateData);
      res.json(updated);
    } catch (error) {
      logger.error("Procedures", "Error updating completion:", error);
      res.status(500).json({ message: "Failed to update completion" });
    }
  });

  app.patch("/api/procedure-completions/:completionId/steps/:stepId", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const completionId = getParamId(req.params.completionId);
      const stepId = getParamId(req.params.stepId);
      
      const completion = await storage.getProcedureCompletion(completionId);
      if (!completion) {
        return res.status(404).json({ message: "Completion not found" });
      }
      
      if (completion.completedByUserId !== userId) {
        return res.status(403).json({ message: "Not authorized to modify this completion" });
      }
      
      const { isCompleted, verificationPhotoUrl, verificationGps, notes } = req.body;
      
      let gpsVerified: boolean | null = null;
      const step = await storage.getProcedureStep(stepId);
      if (step?.requiresGpsVerification && step.expectedGpsLocation && verificationGps) {
        const expectedLat = step.expectedGpsLocation.latitude;
        const expectedLng = step.expectedGpsLocation.longitude;
        const radius = step.gpsRadiusMeters || 100;
        
        const R = 6371e3;
        const lat1 = expectedLat * Math.PI / 180;
        const lat2 = verificationGps.latitude * Math.PI / 180;
        const deltaLat = (verificationGps.latitude - expectedLat) * Math.PI / 180;
        const deltaLng = (verificationGps.longitude - expectedLng) * Math.PI / 180;
        
        const a = Math.sin(deltaLat/2) * Math.sin(deltaLat/2) +
                  Math.cos(lat1) * Math.cos(lat2) *
                  Math.sin(deltaLng/2) * Math.sin(deltaLng/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        const distance = R * c;
        
        gpsVerified = distance <= radius;
      }
      
      const stepCompletion = await storage.upsertStepCompletion(completionId, stepId, {
        isCompleted: isCompleted || false,
        verificationPhotoUrl,
        verificationGps,
        gpsVerified,
        notes,
        completedAt: isCompleted ? new Date() : null,
      });
      
      if (isCompleted) {
        const assignment = await storage.getProcedureAssignment(completion.procedureAssignmentId);
        if (assignment) {
          const procedure = await storage.getProcedureWithSteps(assignment.procedureId);
          const allStepCompletions = await storage.getStepCompletionsByProcedureCompletion(completionId);
          
          if (procedure && allStepCompletions.filter(sc => sc.isCompleted).length === procedure.steps.length) {
            await storage.updateProcedureCompletion(completionId, {
              status: "completed",
              completedAt: new Date(),
            });
          } else if (completion.status === "not_started") {
            await storage.updateProcedureCompletion(completionId, {
              status: "in_progress",
              startedAt: new Date(),
            });
          }
        }
      }
      
      res.json(stepCompletion);
    } catch (error) {
      logger.error("Procedures", "Error updating step completion:", error);
      res.status(500).json({ message: "Failed to update step completion" });
    }
  });

  app.post("/api/procedures/generate", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const workspaceId = getWorkspaceId(req);
      
      if (!workspaceId) {
        return res.status(400).json({ message: "Workspace ID required" });
      }
      
      if (!(await validateWorkspaceMembership(userId, workspaceId))) {
        return res.status(403).json({ message: "Not a member of this workspace" });
      }
      
      const { prompt } = req.body;
      if (!prompt) {
        return res.status(400).json({ message: "Prompt required" });
      }
      
      const openaiApiKey = config.openai.apiKey;
      if (!openaiApiKey) {
        return res.status(500).json({ message: "AI integration not configured" });
      }
      
      const { OpenAI } = await import("openai");
      const openai = new OpenAI({ apiKey: openaiApiKey });
      
      const response = await openai.chat.completions.create({
        model: "gpt-4.1-mini",
        messages: [
          {
            role: "system",
            content: `You are an expert at creating step-by-step procedures for short-term rental property management tasks. 
Given a user's description, generate a clear, actionable procedure with well-defined steps.

Respond with valid JSON in this format:
{
  "title": "Procedure title",
  "description": "Brief description of what this procedure accomplishes",
  "steps": [
    {
      "label": "Step 1 title",
      "description": "Detailed instructions for this step",
      "requiresPhotoVerification": false,
      "requiresGpsVerification": false
    }
  ]
}

Guidelines:
- Create 3-10 steps depending on complexity
- Each step should be a single, clear action
- Include photo verification for steps that need visual confirmation (e.g., "Before photo", "After photo")
- Include GPS verification for steps that require being at a specific location
- Be specific and actionable`
          },
          {
            role: "user",
            content: prompt
          }
        ],
        response_format: { type: "json_object" },
        temperature: 0.7,
      });
      
      const content = response.choices[0]?.message?.content;
      if (!content) {
        return res.status(500).json({ message: "No response from AI" });
      }
      
      const generated = JSON.parse(content);
      
      const procedure = await storage.createProcedure({
        workspaceId,
        createdByUserId: userId,
        title: generated.title,
        description: generated.description,
        status: "draft",
        createdViaAi: true,
        aiPrompt: prompt,
      });
      
      for (let i = 0; i < generated.steps.length; i++) {
        const step = generated.steps[i];
        await storage.createProcedureStep({
          procedureId: procedure.id,
          stepOrder: i + 1,
          label: step.label,
          description: step.description,
          requiresPhotoVerification: step.requiresPhotoVerification || false,
          photoVerificationMode: step.photoVerificationMode || (step.requiresPhotoVerification ? 'required' : 'none'),
          requiresGpsVerification: step.requiresGpsVerification || false,
        });
      }
      
      const result = await storage.getProcedureWithSteps(procedure.id);
      res.status(201).json(result);
    } catch (error) {
      logger.error("Procedures", "Error generating procedure:", error);
      res.status(500).json({ message: "Failed to generate procedure" });
    }
  });
}
