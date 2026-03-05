import type { Express } from "express";
import { IStorage } from "../storage";
import { getUserId, getWorkspaceId, validateWorkspaceMembership } from "./helpers";
import { isAuthenticated } from "../replit_integrations/auth";
import { z } from "zod";
import OpenAI from "openai";
import { config } from "../config";
import { logger } from "../logger";

const openai = new OpenAI({
  apiKey: config.openai.apiKey,
  baseURL: config.openai.baseUrl,
});

export function registerReportsRoutes(app: Express, storage: IStorage) {
  // Reports API
  app.get("/api/reports", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const workspaceId = getWorkspaceId(req);
      if (!workspaceId) {
        return res.status(400).json({ message: "Workspace ID required" });
      }
      
      // Validate workspace membership
      if (!(await validateWorkspaceMembership(userId, workspaceId))) {
        return res.status(403).json({ message: "Access denied to this workspace" });
      }
      
      const reportsList = await storage.getReportsByWorkspace(workspaceId);
      res.json(reportsList);
    } catch (error) {
      logger.error('Reports', 'Error fetching reports:', error);
      res.status(500).json({ message: "Failed to fetch reports" });
    }
  });

  app.post("/api/reports", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const workspaceId = getWorkspaceId(req);
      if (!workspaceId) {
        return res.status(400).json({ message: "Workspace ID required" });
      }
      
      // Validate workspace membership
      if (!(await validateWorkspaceMembership(userId, workspaceId))) {
        return res.status(403).json({ message: "Access denied to this workspace" });
      }
      
      // Validate request body with Zod
      const createReportSchema = z.object({
        name: z.string().min(1, "Report name is required"),
        reportType: z.enum(["staff_meeting", "repeat_guests"]),
        dateRangeType: z.string().optional().default("last_30_days"),
        startDate: z.string().nullable().optional(),
        endDate: z.string().nullable().optional(),
        selectedListingIds: z.array(z.string()).optional().default([]),
      });
      
      const validation = createReportSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ 
          message: "Invalid request body", 
          errors: validation.error.flatten().fieldErrors 
        });
      }
      
      const { name, reportType, dateRangeType, startDate, endDate, selectedListingIds } = validation.data;
      
      // Validate that selectedListingIds belong to this workspace
      if (selectedListingIds.length > 0) {
        const workspaceListings = await storage.getListingsByWorkspace(workspaceId);
        const workspaceListingIds = workspaceListings.map(l => l.id);
        const invalidIds = selectedListingIds.filter(id => !workspaceListingIds.includes(id));
        if (invalidIds.length > 0) {
          return res.status(400).json({ 
            message: "Some selected listings do not belong to this workspace" 
          });
        }
      }
      
      const report = await storage.createReport({
        userId,
        workspaceId,
        name,
        reportType,
        dateRangeType,
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
        selectedListingIds,
      });
      
      res.json(report);
    } catch (error) {
      logger.error('Reports', 'Error creating report:', error);
      res.status(500).json({ message: "Failed to create report" });
    }
  });

  app.patch("/api/reports/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const workspaceId = getWorkspaceId(req);
      if (!workspaceId) {
        return res.status(400).json({ message: "Workspace ID required" });
      }
      
      // Validate workspace membership
      if (!(await validateWorkspaceMembership(userId, workspaceId))) {
        return res.status(403).json({ message: "Access denied to this workspace" });
      }
      
      const report = await storage.getReport(req.params.id as string);
      if (!report || report.workspaceId !== workspaceId) {
        return res.status(404).json({ message: "Report not found" });
      }
      
      // Validate request body with Zod
      const updateReportSchema = z.object({
        name: z.string().min(1).optional(),
        dateRangeType: z.string().optional(),
        startDate: z.string().nullable().optional(),
        endDate: z.string().nullable().optional(),
        selectedListingIds: z.array(z.string()).optional(),
      });
      
      const validation = updateReportSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ 
          message: "Invalid request body", 
          errors: validation.error.flatten().fieldErrors 
        });
      }
      
      const { name, dateRangeType, startDate, endDate, selectedListingIds } = validation.data;
      
      // Validate that selectedListingIds belong to this workspace
      if (selectedListingIds && selectedListingIds.length > 0) {
        const workspaceListings = await storage.getListingsByWorkspace(workspaceId);
        const workspaceListingIds = workspaceListings.map(l => l.id);
        const invalidIds = selectedListingIds.filter(id => !workspaceListingIds.includes(id));
        if (invalidIds.length > 0) {
          return res.status(400).json({ 
            message: "Some selected listings do not belong to this workspace" 
          });
        }
      }
      
      const updated = await storage.updateReport(req.params.id as string, {
        ...(name !== undefined && { name }),
        ...(dateRangeType !== undefined && { dateRangeType }),
        ...(startDate !== undefined && { startDate: startDate ? new Date(startDate) : null }),
        ...(endDate !== undefined && { endDate: endDate ? new Date(endDate) : null }),
        ...(selectedListingIds !== undefined && { selectedListingIds }),
      });
      
      res.json(updated);
    } catch (error) {
      logger.error('Reports', 'Error updating report:', error);
      res.status(500).json({ message: "Failed to update report" });
    }
  });

  app.delete("/api/reports/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const workspaceId = getWorkspaceId(req);
      if (!workspaceId) {
        return res.status(400).json({ message: "Workspace ID required" });
      }
      
      // Validate workspace membership
      if (!(await validateWorkspaceMembership(userId, workspaceId))) {
        return res.status(403).json({ message: "Access denied to this workspace" });
      }
      
      const report = await storage.getReport(req.params.id as string);
      if (!report || report.workspaceId !== workspaceId) {
        return res.status(404).json({ message: "Report not found" });
      }
      
      await storage.deleteReport(req.params.id as string);
      res.json({ success: true });
    } catch (error) {
      logger.error('Reports', 'Error deleting report:', error);
      res.status(500).json({ message: "Failed to delete report" });
    }
  });

  // Generate report data
  app.post("/api/reports/:id/generate", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const workspaceId = getWorkspaceId(req);
      if (!workspaceId) {
        return res.status(400).json({ message: "Workspace ID required" });
      }
      
      // Validate workspace membership
      if (!(await validateWorkspaceMembership(userId, workspaceId))) {
        return res.status(403).json({ message: "Access denied to this workspace" });
      }
      
      const report = await storage.getReport(req.params.id as string);
      if (!report || report.workspaceId !== workspaceId) {
        return res.status(404).json({ message: "Report not found" });
      }
      
      // Calculate date range
      let startDate: Date;
      let endDate: Date = new Date();
      
      switch (report.dateRangeType) {
        case "last_7_days":
          startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
          break;
        case "last_30_days":
          startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
          break;
        case "last_90_days":
          startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
          break;
        case "custom":
          startDate = report.startDate ? new Date(report.startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
          endDate = report.endDate ? new Date(report.endDate) : new Date();
          break;
        default:
          startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      }
      
      // Get listings for this report
      const listingIds = report.selectedListingIds && Array.isArray(report.selectedListingIds) && report.selectedListingIds.length > 0
        ? report.selectedListingIds
        : (await storage.getListingsByWorkspace(workspaceId)).map(l => l.id);
      
      // Fetch reservations within the date range for these listings
      const allReservations = await storage.getReservationsByWorkspace(workspaceId);
      const relevantReservations = allReservations.filter(r => {
        if (!listingIds.includes(r.listingId)) return false;
        const checkIn = r.checkInDate ? new Date(r.checkInDate) : null;
        const checkOut = r.checkOutDate ? new Date(r.checkOutDate) : null;
        if (!checkIn && !checkOut) return false;
        // Include if check-in or check-out falls within range
        return (checkIn && checkIn >= startDate && checkIn <= endDate) ||
               (checkOut && checkOut >= startDate && checkOut <= endDate);
      });
      
      if (report.reportType === "staff_meeting") {
        // Count check-ins and check-outs
        const checkIns = relevantReservations.filter(r => {
          const checkIn = r.checkInDate ? new Date(r.checkInDate) : null;
          return checkIn && checkIn >= startDate && checkIn <= endDate;
        }).length;
        
        const checkOuts = relevantReservations.filter(r => {
          const checkOut = r.checkOutDate ? new Date(r.checkOutDate) : null;
          return checkOut && checkOut >= startDate && checkOut <= endDate;
        }).length;
        
        // Get tags for these reservations to determine escalation levels
        const reservationIds = relevantReservations.map(r => r.id);
        const allTags = await storage.getTagsByWorkspace(workspaceId);
        const relevantTags = allTags.filter(t => reservationIds.includes(t.reservationId));
        
        // Categorize reservations by escalation level
        const reservationEscalations = new Map<string, { negativeCount: number; reservation: typeof relevantReservations[0] }>();
        
        for (const res of relevantReservations) {
          const resTags = relevantTags.filter(t => t.reservationId === res.id);
          const negativeCount = resTags.filter(t => t.sentiment === "negative").length;
          reservationEscalations.set(res.id, { negativeCount, reservation: res });
        }
        
        const smoothReservations = Array.from(reservationEscalations.values())
          .filter(({ negativeCount }) => negativeCount === 0)
          .map(({ reservation, negativeCount }) => ({
            id: reservation.id,
            reservation: reservation,
            negativeTagCount: negativeCount,
          }));
        
        const moderateReservations = Array.from(reservationEscalations.values())
          .filter(({ negativeCount }) => negativeCount >= 1 && negativeCount <= 2)
          .map(({ reservation, negativeCount }) => ({
            id: reservation.id,
            reservation: reservation,
            negativeTagCount: negativeCount,
          }));
        
        const troubleReservations = Array.from(reservationEscalations.values())
          .filter(({ negativeCount }) => negativeCount >= 3)
          .map(({ reservation, negativeCount }) => ({
            id: reservation.id,
            reservation: reservation,
            negativeTagCount: negativeCount,
          }));
        
        // Calculate average response time from conversation history
        let totalResponseTime = 0;
        let responseCount = 0;
        
        for (const res of relevantReservations) {
          const conversation = res.conversationHistory as Array<{ sender: string; timestamp: string; message: string }> | null;
          if (!conversation || conversation.length < 2) continue;
          
          // Find guest messages that look like questions and their responses
          for (let i = 0; i < conversation.length - 1; i++) {
            const msg = conversation[i];
            if (msg.sender !== "guest") continue;
            
            // Check if message is a question (has ? or is a statement needing response)
            const isQuestion = msg.message.includes("?") || 
              /\b(please|can you|could you|would you|need|want|looking for|wondering|help)\b/i.test(msg.message);
            
            if (!isQuestion) continue;
            
            // Find the next host response
            for (let j = i + 1; j < conversation.length; j++) {
              const reply = conversation[j];
              if (reply.sender === "host") {
                const questionTime = new Date(msg.timestamp).getTime();
                const replyTime = new Date(reply.timestamp).getTime();
                const responseTimeMinutes = (replyTime - questionTime) / (1000 * 60);
                
                // Only count reasonable response times (< 24 hours)
                if (responseTimeMinutes > 0 && responseTimeMinutes < 24 * 60) {
                  totalResponseTime += responseTimeMinutes;
                  responseCount++;
                }
                break;
              }
            }
          }
        }
        
        const avgResponseTime = responseCount > 0 ? Math.round(totalResponseTime / responseCount) : null;
        
        // Generate AI summary
        let aiSummary = "";
        try {
          const responseTimeStr = avgResponseTime ? `${avgResponseTime} minutes` : "Not available";
          const summaryPrompt = `Generate a brief executive summary for a staff meeting report with the following data:
- Date Range: ${startDate.toLocaleDateString()} to ${endDate.toLocaleDateString()}
- Total Check-ins: ${checkIns}
- Total Check-outs: ${checkOuts}
- Smooth Reservations (no issues): ${smoothReservations.length}
- Moderate Issues (1-2 negative tags): ${moderateReservations.length}
- Trouble Reservations (3+ negative tags): ${troubleReservations.length}
- Average Response Time: ${responseTimeStr} (based on ${responseCount} conversations)

Write 3-5 bullet points summarizing the key takeaways for the team. Be concise and actionable. Include response time insights if available.`;

          const response = await openai.chat.completions.create({
            model: "gpt-4.1-mini",
            messages: [{ role: "user", content: summaryPrompt }],
            max_tokens: 500,
          });
          aiSummary = response.choices[0]?.message?.content || "";
        } catch (aiError) {
          logger.error('Reports', 'AI summary generation failed:', aiError);
          aiSummary = "AI summary unavailable";
        }
        
        const reportData = {
          checkIns,
          checkOuts,
          smoothReservations,
          moderateReservations,
          troubleReservations,
          avgResponseTime,
          totalQuestionsAnalyzed: responseCount,
        };
        
        const updated = await storage.updateReport(report.id, {
          reportData,
          aiSummary,
          lastGeneratedAt: new Date(),
        });
        
        res.json(updated);
      } else if (report.reportType === "repeat_guests") {
        // Find upcoming reservations (future check-ins)
        const now = new Date();
        const futureReservations = allReservations.filter(r => {
          if (!listingIds.includes(r.listingId)) return false;
          const checkIn = r.checkInDate ? new Date(r.checkInDate) : null;
          return checkIn && checkIn > now;
        });
        
        // Group by guest email to find repeat guests
        const guestVisits = new Map<string, typeof allReservations>();
        for (const res of allReservations) {
          if (!res.guestEmail) continue;
          const existing = guestVisits.get(res.guestEmail) || [];
          existing.push(res);
          guestVisits.set(res.guestEmail, existing);
        }
        
        // Find repeat guests with upcoming reservations
        const repeatGuestsData: Array<{
          guestName: string;
          guestEmail: string;
          visitCount: number;
          upcomingReservation: unknown;
          pastReservations: unknown[];
          preferences: string[];
          dislikes: string[];
          playbook: string;
        }> = [];
        
        for (const res of futureReservations) {
          if (!res.guestEmail) continue;
          const allVisits = guestVisits.get(res.guestEmail) || [];
          if (allVisits.length <= 1) continue; // Not a repeat guest
          
          const pastVisits = allVisits.filter(v => 
            v.checkOutDate && new Date(v.checkOutDate) < now
          );
          
          // Get tags from past visits to understand preferences
          const pastReservationIds = pastVisits.map(v => v.id);
          const allTags = await storage.getTagsByWorkspace(workspaceId);
          const guestTags = allTags.filter(t => pastReservationIds.includes(t.reservationId));
          
          const preferences = guestTags
            .filter(t => t.sentiment === "positive")
            .map(t => t.name)
            .slice(0, 5);
          
          const dislikes = guestTags
            .filter(t => t.sentiment === "negative")
            .map(t => t.name)
            .slice(0, 5);
          
          // Generate playbook using AI
          let playbook = "";
          try {
            const playbookPrompt = `A repeat guest "${res.guestName}" is returning. Based on their past stays:
- Things they liked: ${preferences.join(", ") || "None recorded"}
- Issues they had: ${dislikes.join(", ") || "None recorded"}
- Number of previous visits: ${pastVisits.length}

Write 2-3 sentences with specific, actionable suggestions for the team to ensure this guest has a great stay.`;

            const response = await openai.chat.completions.create({
              model: "gpt-4.1-mini",
              messages: [{ role: "user", content: playbookPrompt }],
              max_tokens: 200,
            });
            playbook = response.choices[0]?.message?.content || "";
          } catch (aiError) {
            logger.error('Reports', 'Playbook generation failed:', aiError);
          }
          
          repeatGuestsData.push({
            guestName: res.guestName || "Unknown Guest",
            guestEmail: res.guestEmail,
            visitCount: allVisits.length,
            upcomingReservation: {
              checkInDate: res.checkInDate,
              checkOutDate: res.checkOutDate,
              listingId: res.listingId,
            },
            pastReservations: pastVisits.map(v => ({
              checkInDate: v.checkInDate,
              checkOutDate: v.checkOutDate,
              guestRating: v.guestRating,
            })),
            preferences,
            dislikes,
            playbook,
          });
        }
        
        // Generate overall AI summary
        let aiSummary = "";
        try {
          const summaryPrompt = `Generate a brief summary for a repeat guests report:
- Number of upcoming repeat guests: ${repeatGuestsData.length}
- Guests: ${repeatGuestsData.map(g => `${g.guestName} (${g.visitCount} visits)`).join(", ")}

Write 2-3 bullet points highlighting key preparation notes for the team.`;

          const response = await openai.chat.completions.create({
            model: "gpt-4.1-mini",
            messages: [{ role: "user", content: summaryPrompt }],
            max_tokens: 300,
          });
          aiSummary = response.choices[0]?.message?.content || "";
        } catch (aiError) {
          logger.error('Reports', 'AI summary generation failed:', aiError);
        }
        
        const reportData = {
          repeatGuests: repeatGuestsData,
        };
        
        const updated = await storage.updateReport(report.id, {
          reportData,
          aiSummary,
          lastGeneratedAt: new Date(),
        });
        
        res.json(updated);
      } else {
        res.status(400).json({ message: "Unknown report type" });
      }
    } catch (error) {
      logger.error('Reports', 'Error generating report:', error);
      res.status(500).json({ message: "Failed to generate report" });
    }
  });
}
