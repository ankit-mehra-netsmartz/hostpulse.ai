import type { Express } from "express";
import type { IStorage } from "../storage";
import { isAuthenticated } from "../replit_integrations/auth";
import { z } from "zod";
import { db } from "../db";
import { and, eq, gte, lte, inArray } from "drizzle-orm";
import {
  tasks, listings, procedures, procedureSteps, procedureAssignments,
  cleaningTasks, cleaners, reservations,
  type MobileStepCompletion,
  type GpsLocation,
} from "@shared/schema";
import { logger } from "../logger";
import { getUserId, getWorkspaceId, validateWorkspaceMembership, getParamId } from "./helpers";

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function registerMobileRoutes(app: Express, storage: IStorage) {
  // GET /api/mobile/my-tasks - Tasks assigned to the current user
  app.get("/api/mobile/my-tasks", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const workspaceId = getWorkspaceId(req);

      if (!workspaceId) {
        return res.status(400).json({ message: "Workspace ID required" });
      }

      if (!(await validateWorkspaceMembership(userId, workspaceId))) {
        return res.status(403).json({ message: "Not a member of this workspace" });
      }

      const statusFilter = req.query.status as string | undefined;
      const statusList = statusFilter ? statusFilter.split(",").map(s => s.trim()) : null;

      const allTasks = await db
        .select()
        .from(tasks)
        .where(
          and(
            eq(tasks.assigneeId, userId),
            eq(tasks.workspaceId, workspaceId)
          )
        );

      const filtered = statusList
        ? allTasks.filter(t => statusList.includes(t.status))
        : allTasks;

      const listingIds = Array.from(new Set(filtered.map(t => t.listingId).filter(Boolean))) as string[];
      const taskIds = filtered.map(t => t.id);

      const [listingsData, assignmentsData] = await Promise.all([
        listingIds.length > 0
          ? db.select().from(listings).where(inArray(listings.id, listingIds))
          : Promise.resolve([]),
        taskIds.length > 0
          ? db.select().from(procedureAssignments).where(inArray(procedureAssignments.taskId, taskIds))
          : Promise.resolve([]),
      ]);

      const listingsMap = new Map(listingsData.map(l => [l.id, l]));

      const procedureIds = Array.from(new Set(assignmentsData.map(a => a.procedureId)));
      const proceduresData = procedureIds.length > 0
        ? await db.select().from(procedures).where(inArray(procedures.id, procedureIds))
        : [];
      const proceduresMap = new Map(proceduresData.map(p => [p.id, p]));

      const result = filtered.map(task => {
        const listing = task.listingId ? listingsMap.get(task.listingId) : null;
        const assignment = assignmentsData.find(a => a.taskId === task.id);
        const procedure = assignment ? proceduresMap.get(assignment.procedureId) : null;
        return {
          ...task,
          listing: listing ? { id: listing.id, name: listing.name, imageUrl: listing.imageUrl, address: listing.address } : null,
          procedure: procedure ? { id: procedure.id, title: procedure.title, status: procedure.status } : null,
          procedureAssignmentId: assignment?.id || null,
        };
      });

      res.json(result);
    } catch (error) {
      logger.error("Mobile", "Error fetching mobile tasks:", error);
      res.status(500).json({ message: "Failed to fetch tasks" });
    }
  });

  // GET /api/mobile/my-tasks/:id - Single task detail with procedure and steps
  app.get("/api/mobile/my-tasks/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const workspaceId = getWorkspaceId(req);
      const taskId = getParamId(req.params.id);

      const task = await storage.getTask(taskId);
      if (!task) {
        return res.status(404).json({ message: "Task not found" });
      }

      if (workspaceId && task.workspaceId !== workspaceId) {
        return res.status(403).json({ message: "Task does not belong to this workspace" });
      }

      if (task.workspaceId && !(await validateWorkspaceMembership(userId, task.workspaceId))) {
        return res.status(403).json({ message: "Not a member of this workspace" });
      }

      if (task.assigneeId !== userId) {
        if (task.workspaceId) {
          const member = await storage.getWorkspaceMember(task.workspaceId, userId);
          if (!member || !["owner", "admin"].includes(member.role)) {
            return res.status(403).json({ message: "Not authorized to view this task" });
          }
        } else {
          return res.status(403).json({ message: "Not authorized to view this task" });
        }
      }

      const listing = task.listingId
        ? await storage.getListing(task.listingId)
        : null;

      const assignment = await storage.getProcedureAssignmentByTask(taskId);
      let procedureWithSteps = null;
      if (assignment) {
        procedureWithSteps = await storage.getProcedureWithSteps(assignment.procedureId);
      }

      res.json({
        ...task,
        listing: listing ? { id: listing.id, name: listing.name, imageUrl: listing.imageUrl, address: listing.address } : null,
        procedure: procedureWithSteps,
        procedureAssignmentId: assignment?.id || null,
      });
    } catch (error) {
      logger.error("Mobile", "Error fetching mobile task detail:", error);
      res.status(500).json({ message: "Failed to fetch task detail" });
    }
  });

  // PATCH /api/mobile/tasks/:id/status - Update task status
  app.patch("/api/mobile/tasks/:id/status", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const workspaceId = getWorkspaceId(req);
      const taskId = getParamId(req.params.id);

      const statusSchema = z.object({
        status: z.enum(["pending", "in_progress", "done"]),
      });

      const parsed = statusSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid status. Must be pending, in_progress, or done" });
      }

      const task = await storage.getTask(taskId);
      if (!task) {
        return res.status(404).json({ message: "Task not found" });
      }

      if (workspaceId && task.workspaceId !== workspaceId) {
        return res.status(403).json({ message: "Task does not belong to this workspace" });
      }

      const isAssignee = task.assigneeId === userId;
      let isAdminOrManager = false;
      if (task.workspaceId) {
        const member = await storage.getWorkspaceMember(task.workspaceId, userId);
        if (member && (member.role === "admin" || member.role === "manager")) {
          isAdminOrManager = true;
        }
      }

      if (!isAssignee && !isAdminOrManager) {
        return res.status(403).json({ message: "Not authorized to update this task" });
      }

      const updateData: Record<string, any> = {
        status: parsed.data.status,
        updatedAt: new Date(),
      };

      if (parsed.data.status === "done") {
        updateData.completedAt = new Date();
      } else if ((task.status as string) === "done" && parsed.data.status !== "done") {
        updateData.completedAt = null;
      }

      const updated = await storage.updateTask(taskId, updateData);
      res.json(updated);
    } catch (error) {
      logger.error("Mobile", "Error updating mobile task status:", error);
      res.status(500).json({ message: "Failed to update task status" });
    }
  });

  // GET /api/mobile/dashboard - Dashboard summary for current user
  app.get("/api/mobile/dashboard", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const workspaceId = getWorkspaceId(req);

      if (!workspaceId) {
        return res.status(400).json({ message: "Workspace ID required" });
      }

      if (!(await validateWorkspaceMembership(userId, workspaceId))) {
        return res.status(403).json({ message: "Not a member of this workspace" });
      }

      const myTasks = await db
        .select()
        .from(tasks)
        .where(
          and(
            eq(tasks.assigneeId, userId),
            eq(tasks.workspaceId, workspaceId)
          )
        );

      const taskCountsByStatus: Record<string, number> = {};
      for (const t of myTasks) {
        taskCountsByStatus[t.status] = (taskCountsByStatus[t.status] || 0) + 1;
      }

      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);

      const dashCleanerProfiles = await (storage as any).getCleanersByUserId(userId);
      const dashCleanerIds = dashCleanerProfiles
        .filter((c: any) => c.workspaceId === workspaceId)
        .map((c: any) => c.id);

      let rawCleaningTasks: any[] = [];
      if (dashCleanerIds.length > 0) {
        rawCleaningTasks = await db
          .select()
          .from(cleaningTasks)
          .where(
            and(
              eq(cleaningTasks.workspaceId, workspaceId),
              inArray(cleaningTasks.cleanerId, dashCleanerIds),
              gte(cleaningTasks.scheduledDate, todayStart),
              lte(cleaningTasks.scheduledDate, todayEnd)
            )
          );
      }
      if (rawCleaningTasks.length === 0) {
        rawCleaningTasks = await db
          .select()
          .from(cleaningTasks)
          .where(
            and(
              eq(cleaningTasks.workspaceId, workspaceId),
              eq(cleaningTasks.cleanerId, userId),
              gte(cleaningTasks.scheduledDate, todayStart),
              lte(cleaningTasks.scheduledDate, todayEnd)
            )
          );
      }

      const todayCleaningTasks = await Promise.all(
        rawCleaningTasks.map(async (ct) => {
          const listing = ct.listingId ? await storage.getListing(ct.listingId) : null;
          return {
            id: ct.id,
            listingName: listing?.name || "Unknown Property",
            guestName: ct.guestName || null,
            status: ct.status,
            scheduledDate: ct.scheduledDate,
          };
        })
      );

      const upcomingRaw = myTasks
        .filter(t => t.dueDate && t.status !== "done" && new Date(t.dueDate) >= todayStart)
        .sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime())
        .slice(0, 10);

      const upcomingTasks = await Promise.all(
        upcomingRaw.map(async (t) => {
          const listing = t.listingId ? await storage.getListing(t.listingId) : null;
          return {
            id: t.id,
            title: t.title,
            priority: t.priority,
            status: t.status,
            dueDate: t.dueDate,
            listingName: listing?.name || null,
          };
        })
      );

      res.json({
        taskCounts: {
          pending: taskCountsByStatus["pending"] || 0,
          in_progress: taskCountsByStatus["in_progress"] || 0,
          done: taskCountsByStatus["done"] || 0,
          total: myTasks.length,
        },
        todayCleaningTasks,
        upcomingTasks,
      });
    } catch (error) {
      logger.error("Mobile", "Error fetching mobile dashboard:", error);
      res.status(500).json({ message: "Failed to fetch dashboard" });
    }
  });

  // GET /api/mobile/calendar - Monthly calendar data with cleaning tasks and turnover detection
  app.get("/api/mobile/calendar", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const workspaceId = getWorkspaceId(req);

      if (!workspaceId) {
        return res.status(400).json({ message: "Workspace ID required" });
      }

      if (!(await validateWorkspaceMembership(userId, workspaceId))) {
        return res.status(403).json({ message: "Not a member of this workspace" });
      }

      const monthParam = req.query.month as string;
      let year: number, month: number;

      if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
        [year, month] = monthParam.split("-").map(Number);
      } else {
        const now = new Date();
        year = now.getFullYear();
        month = now.getMonth() + 1;
      }

      const monthStart = new Date(year, month - 1, 1);
      const monthEnd = new Date(year, month, 0, 23, 59, 59, 999);

      const cleanerProfiles = await (storage as any).getCleanersByUserId(userId);
      const myCleanerIds = cleanerProfiles
        .filter((c: any) => c.workspaceId === workspaceId)
        .map((c: any) => c.id);

      let monthCleaningTasks: any[] = [];
      if (myCleanerIds.length > 0) {
        monthCleaningTasks = await db
          .select()
          .from(cleaningTasks)
          .where(
            and(
              eq(cleaningTasks.workspaceId, workspaceId),
              inArray(cleaningTasks.cleanerId, myCleanerIds),
              gte(cleaningTasks.scheduledDate, monthStart),
              lte(cleaningTasks.scheduledDate, monthEnd)
            )
          );
      }
      if (monthCleaningTasks.length === 0) {
        monthCleaningTasks = await db
          .select()
          .from(cleaningTasks)
          .where(
            and(
              eq(cleaningTasks.workspaceId, workspaceId),
              eq(cleaningTasks.cleanerId, userId),
              gte(cleaningTasks.scheduledDate, monthStart),
              lte(cleaningTasks.scheduledDate, monthEnd)
            )
          );
      }

      const listingIds = Array.from(new Set(monthCleaningTasks.map(ct => ct.listingId)));
      let monthReservations: any[] = [];
      if (listingIds.length > 0) {
        monthReservations = await db
          .select()
          .from(reservations)
          .where(
            and(
              inArray(reservations.listingId, listingIds),
              eq(reservations.workspaceId!, workspaceId),
              gte(reservations.checkInDate!, monthStart),
              lte(reservations.checkInDate!, monthEnd)
            )
          );
      }

      const toLocalDateKey = (d: Date): string => {
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      };

      const calendarDays: Record<string, {
        count: number;
        hasCheckoutOnly: boolean;
        hasSameDayTurnover: boolean;
        hasUnaccepted: boolean;
        tasks: Array<{
          id: string;
          listingName: string;
          guestName: string | null;
          status: string;
          isTurnover: boolean;
          cleanerAccepted: boolean | null;
        }>;
      }> = {};

      const listingNames: Record<string, string> = {};
      for (const ct of monthCleaningTasks) {
        if (!listingNames[ct.listingId]) {
          const listing = await storage.getListing(ct.listingId);
          listingNames[ct.listingId] = listing?.name || "Unknown Property";
        }
      }

      for (const ct of monthCleaningTasks) {
        const dateKey = toLocalDateKey(ct.scheduledDate);

        if (!calendarDays[dateKey]) {
          calendarDays[dateKey] = {
            count: 0,
            hasCheckoutOnly: false,
            hasSameDayTurnover: false,
            hasUnaccepted: false,
            tasks: [],
          };
        }

        const isTurnover = monthReservations.some(r =>
          r.listingId === ct.listingId &&
          r.checkInDate &&
          toLocalDateKey(r.checkInDate) === dateKey
        );

        calendarDays[dateKey].count++;
        if (isTurnover) {
          calendarDays[dateKey].hasSameDayTurnover = true;
        } else {
          calendarDays[dateKey].hasCheckoutOnly = true;
        }
        if (!ct.cleanerAccepted) {
          calendarDays[dateKey].hasUnaccepted = true;
        }
        calendarDays[dateKey].tasks.push({
          id: ct.id,
          listingName: listingNames[ct.listingId],
          guestName: ct.guestName || null,
          status: ct.status,
          isTurnover,
          cleanerAccepted: ct.cleanerAccepted ?? null,
        });
      }

      res.json({ year, month, days: calendarDays });
    } catch (error) {
      logger.error("Mobile", "Error fetching mobile calendar:", error);
      res.status(500).json({ message: "Failed to fetch calendar data" });
    }
  });

  // GET /api/mobile/my-company - Get the current user's company/manager cleaner profile with members and assignments
  app.get("/api/mobile/my-company", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const workspaceId = getWorkspaceId(req);
      if (!userId || !workspaceId) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const cleanerProfiles = await (storage as any).getCleanersByUserId(userId);
      const companyProfile = cleanerProfiles.find(
        (c: any) => (c.type === 'company' || c.type === 'cleaning_manager') && c.workspaceId === workspaceId
      );
      if (!companyProfile) {
        return res.status(404).json({ message: "No company profile found" });
      }
      const withAssignments = await (storage as any).getCleanerWithAssignments(companyProfile.id);
      res.json(withAssignments);
    } catch (error) {
      logger.error("Mobile", "Error fetching mobile company:", error);
      res.status(500).json({ message: "Failed to fetch company data" });
    }
  });

  // GET /api/mobile/my-turnovers - Get turnovers for the current user's cleaner/company profile
  app.get("/api/mobile/my-turnovers", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const workspaceId = getWorkspaceId(req);
      if (!userId || !workspaceId) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      if (!(await validateWorkspaceMembership(userId, workspaceId))) {
        return res.status(403).json({ message: "Not a member of this workspace" });
      }
      const cleanerProfiles = await (storage as any).getCleanersByUserId(userId);
      const myCleanerIds = cleanerProfiles
        .filter((c: any) => c.workspaceId === workspaceId)
        .map((c: any) => c.id);

      if (myCleanerIds.length === 0) {
        return res.json({ turnovers: [], members: [], isManager: false });
      }

      const allTasks = await db
        .select()
        .from(cleaningTasks)
        .where(
          and(
            eq(cleaningTasks.workspaceId, workspaceId),
            inArray(cleaningTasks.cleanerId, myCleanerIds),
          )
        )
        .orderBy(cleaningTasks.scheduledDate);

      const isManager = cleanerProfiles.some((c: any) => 
        c.workspaceId === workspaceId && (c.type === 'company' || c.type === 'cleaning_manager')
      );

      const members = isManager ? await (storage as any).getCompanyMembers(myCleanerIds[0]) : [];

      const parentIds = cleanerProfiles
        .filter((c: any) => c.workspaceId === workspaceId && c.parentId)
        .map((c: any) => c.parentId as string);
      const relevantCleanerIds = Array.from(new Set([...myCleanerIds, ...parentIds]));

      const listingIds = Array.from(new Set(allTasks.map(t => t.listingId)));
      const assignmentModeMap: Record<string, string> = {};
      for (const lid of listingIds) {
        const assignments = await (storage as any).getAssignmentsByListing(lid);
        const activeAssignment = assignments.find(a => a.isActive && relevantCleanerIds.includes(a.cleanerId));
        if (activeAssignment) {
          assignmentModeMap[lid] = activeAssignment.assignmentMode;
        }
      }

      const enriched = await Promise.all(
        allTasks.map(async (ct) => {
          const listing = await storage.getListing(ct.listingId);
          const assignedMember = ct.assignedMemberId ? members.find(m => m.id === ct.assignedMemberId) : null;
          return {
            id: ct.id,
            listingId: ct.listingId,
            listingName: listing?.internalName || listing?.name || "Unknown Property",
            listingAddress: listing?.address || null,
            guestName: ct.guestName || null,
            guestCheckoutTime: ct.guestCheckoutTime || null,
            scheduledDate: ct.scheduledDate,
            status: ct.status,
            cleanerAccepted: ct.cleanerAccepted ?? null,
            cleanerAcceptedAt: ct.cleanerAcceptedAt || null,
            assignedMemberId: ct.assignedMemberId || null,
            assignedMemberName: assignedMember?.name || null,
            assignmentMode: assignmentModeMap[ct.listingId] || "manual",
            reservationId: ct.reservationId,
            notes: ct.notes,
          };
        })
      );

      res.json({
        turnovers: enriched,
        members: members.map(m => ({ id: m.id, name: m.name })),
        isManager,
      });
    } catch (error) {
      logger.error("Mobile", "Error fetching mobile turnovers:", error);
      res.status(500).json({ message: "Failed to fetch turnovers" });
    }
  });

  // PATCH /api/mobile/turnovers/:id/accept - Accept a turnover and optionally assign a member
  app.patch("/api/mobile/turnovers/:id/accept", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const workspaceId = getWorkspaceId(req);
      if (!userId || !workspaceId) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const task = await (storage as any).getCleaningTask(req.params.id);
      if (!task || task.workspaceId !== workspaceId) {
        return res.status(404).json({ message: "Turnover not found" });
      }
      const cleanerProfiles = await (storage as any).getCleanersByUserId(userId);
      const myCleanerIds = cleanerProfiles
        .filter((c: any) => c.workspaceId === workspaceId)
        .map((c: any) => c.id);
      if (!myCleanerIds.includes(task.cleanerId)) {
        return res.status(403).json({ message: "This turnover is not assigned to you" });
      }

      const bodySchema = z.object({
        assignedMemberId: z.string().nullable().optional(),
      });
      const bodyResult = bodySchema.safeParse(req.body);
      if (!bodyResult.success) {
        return res.status(400).json({ message: "Invalid data" });
      }

      const updateData: any = {
        cleanerAccepted: true,
        cleanerAcceptedAt: new Date(),
      };

      if (bodyResult.data.assignedMemberId) {
        const member = await (storage as any).getCleaner(bodyResult.data.assignedMemberId);
        if (!member || member.parentId !== task.cleanerId) {
          return res.status(400).json({ message: "Member does not belong to your company" });
        }
        updateData.assignedMemberId = bodyResult.data.assignedMemberId;
      }

      const updated = await (storage as any).updateCleaningTask(req.params.id, updateData);
      res.json(updated);
    } catch (error) {
      logger.error("Mobile", "Error accepting turnover:", error);
      res.status(500).json({ message: "Failed to accept turnover" });
    }
  });

  // POST /api/mobile/procedure-steps/:stepId/toggle-complete - Toggle step completion
  app.post("/api/mobile/procedure-steps/:stepId/toggle-complete", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const workspaceId = getWorkspaceId(req);
      const stepId = getParamId(req.params.stepId);
      const { taskId, gpsLocation, photoUrl, comment, commentTranslation, voiceNoteTranscript, voiceNoteTranslation } = req.body || {};

      const step = await storage.getProcedureStep(stepId);
      if (!step) {
        return res.status(404).json({ message: "Procedure step not found" });
      }

      const procedure = await storage.getProcedure(step.procedureId);
      if (!procedure) {
        return res.status(404).json({ message: "Procedure not found" });
      }

      if (workspaceId && procedure.workspaceId !== workspaceId) {
        return res.status(403).json({ message: "Step does not belong to this workspace" });
      }

      if (!(await validateWorkspaceMembership(userId, procedure.workspaceId))) {
        return res.status(403).json({ message: "Not a member of this workspace" });
      }

      const user = await storage.getUser(userId);
      const userName = user
        ? (user.firstName && user.lastName ? `${user.firstName} ${user.lastName}` : user.email || undefined)
        : undefined;

      const currentCompletions: MobileStepCompletion[] = (step.completions as MobileStepCompletion[] | null) || [];

      const existingIndex = currentCompletions.findIndex(
        c => c.userId === userId && (!taskId || c.taskId === taskId)
      );

      let updatedCompletions: MobileStepCompletion[];
      let isNowCompleted: boolean;

      if (existingIndex >= 0) {
        updatedCompletions = currentCompletions.filter((_, i) => i !== existingIndex);
        isNowCompleted = false;
      } else {
        const photoMode = step.photoVerificationMode || (step.requiresPhotoVerification ? 'required' : 'none');
        if (photoMode === 'required' && !photoUrl) {
          return res.status(400).json({ message: "Photo verification is required to complete this step" });
        }
        if (step.requiresGpsVerification && !gpsLocation) {
          return res.status(400).json({ message: "GPS verification is required to complete this step" });
        }

        let gpsVerified: boolean | undefined;
        if (gpsLocation && step.expectedGpsLocation) {
          const expected = step.expectedGpsLocation as GpsLocation;
          const radiusMeters = step.gpsRadiusMeters || 100;
          const distance = haversineDistance(
            gpsLocation.latitude, gpsLocation.longitude,
            expected.latitude, expected.longitude
          );
          gpsVerified = distance <= radiusMeters;
        }

        const newCompletion: MobileStepCompletion = {
          userId,
          userName,
          completedAt: new Date().toISOString(),
          taskId: taskId || undefined,
          gpsLocation: gpsLocation || undefined,
          gpsVerified,
          photoUrl: photoUrl || undefined,
          comment: comment || undefined,
          commentTranslation: commentTranslation || undefined,
          voiceNoteTranscript: voiceNoteTranscript || undefined,
          voiceNoteTranslation: voiceNoteTranslation || undefined,
        };
        updatedCompletions = [...currentCompletions, newCompletion];
        isNowCompleted = true;
      }

      const updated = await storage.updateProcedureStep(stepId, {
        completions: updatedCompletions as any,
      });

      res.json({
        step: updated,
        isCompleted: isNowCompleted,
        completions: updatedCompletions,
      });
    } catch (error) {
      logger.error("Mobile", "Error toggling step completion:", error);
      res.status(500).json({ message: "Failed to toggle step completion" });
    }
  });
}
