import type { Express } from "express";
import type { IStorage } from "../storage";
import { isAuthenticated } from "../replit_integrations/auth";
import { logger } from "../logger";
import { getUserId, getParamId } from "./helpers";

export function registerWorkspaceRoutes(app: Express, storage: IStorage) {
  app.get("/api/workspaces", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const userWorkspaces = await storage.getWorkspacesByUser(userId);
      res.json(userWorkspaces);
    } catch (error) {
      logger.error("Workspaces", "Error fetching workspaces:", error);
      res.status(500).json({ message: "Failed to fetch workspaces" });
    }
  });

  app.get("/api/workspaces/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const workspaceId = getParamId(req.params.id);
      
      const member = await storage.getWorkspaceMember(workspaceId, userId);
      if (!member) {
        return res.status(403).json({ message: "Not a member of this workspace" });
      }
      
      const workspace = await storage.getWorkspace(workspaceId);
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }
      res.json(workspace);
    } catch (error) {
      logger.error("Workspaces", "Error fetching workspace:", error);
      res.status(500).json({ message: "Failed to fetch workspace" });
    }
  });

  app.post("/api/workspaces", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const { name, propertyManagementSoftware, customSoftwareName, listingCount } = req.body;
      
      if (!name || !propertyManagementSoftware) {
        return res.status(400).json({ message: "Name and property management software are required" });
      }
      
      const workspace = await storage.createWorkspace({
        name,
        propertyManagementSoftware,
        customSoftwareName,
        listingCount,
        createdBy: userId,
      });
      
      await storage.createWorkspaceMember({
        workspaceId: workspace.id,
        userId,
        role: "owner",
        status: "active",
      });
      
      await storage.seedDefaultThemes(workspace.id, userId);
      await storage.seedDefaultProcedures(workspace.id, userId);
      
      res.json(workspace);
    } catch (error) {
      logger.error("Workspaces", "Error creating workspace:", error);
      res.status(500).json({ message: "Failed to create workspace" });
    }
  });

  app.patch("/api/workspaces/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const workspaceId = getParamId(req.params.id);
      
      const member = await storage.getWorkspaceMember(workspaceId, userId);
      if (!member || (member.role !== "owner" && member.role !== "admin")) {
        return res.status(403).json({ message: "Only owners and admins can update workspace" });
      }
      
      const { name, propertyManagementSoftware, customSoftwareName, listingCount, logoUrl, squareLogoUrl, slackWebhookUrl } = req.body;
      const updated = await storage.updateWorkspace(workspaceId, {
        name,
        propertyManagementSoftware,
        customSoftwareName,
        listingCount,
        logoUrl,
        squareLogoUrl,
        slackWebhookUrl,
      });
      
      if (!updated) {
        return res.status(404).json({ message: "Workspace not found" });
      }
      res.json(updated);
    } catch (error) {
      logger.error("Workspaces", "Error updating workspace:", error);
      res.status(500).json({ message: "Failed to update workspace" });
    }
  });

  app.get("/api/workspaces/:id/members", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const workspaceId = getParamId(req.params.id);
      
      const member = await storage.getWorkspaceMember(workspaceId, userId);
      if (!member) {
        return res.status(403).json({ message: "Not a member of this workspace" });
      }
      
      const members = await storage.getWorkspaceMembersByWorkspace(workspaceId);
      res.json(members);
    } catch (error) {
      logger.error("Workspaces", "Error fetching workspace members:", error);
      res.status(500).json({ message: "Failed to fetch workspace members" });
    }
  });

  app.post("/api/workspaces/:id/generate-logo-options", isAuthenticated, async (req, res) => {
    logger.info("Logo Generation", "Starting logo options generation...");
    try {
      const userId = getUserId(req);
      const workspaceId = getParamId(req.params.id);
      logger.info("Logo Generation", `User: ${userId}, Workspace: ${workspaceId}`);
      
      const member = await storage.getWorkspaceMember(workspaceId, userId);
      if (!member || (member.role !== "owner" && member.role !== "admin")) {
        return res.status(403).json({ message: "Only owners and admins can generate workspace logos" });
      }
      
      const workspace = await storage.getWorkspace(workspaceId);
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }
      
      const { companyName, description } = req.body;
      const logoName = companyName || workspace.name;
      const styleDescription = description || "modern and professional";
      
      const { generateImageBase64, cropToHorizontalAspect } = await import("../replit_integrations/image/client");
      
      const variations = [
        { style: `${styleDescription}, clean minimalist design`, label: "Minimalist" },
        { style: `${styleDescription}, bold and dynamic design`, label: "Bold" },
        { style: `${styleDescription}, elegant classic design`, label: "Classic" },
      ];
      
      logger.info("Logo Generation", `Generating 3 logo variations for "${logoName}"...`);
      const logoPromises = variations.map(async (variation) => {
        const horizontalPrompt = `Create a ${variation.style} HORIZONTAL BANNER logo for a property management company called "${logoName}".

CRITICAL REQUIREMENTS:
- Layout: A distinctive icon/symbol on the LEFT side, then the company name "${logoName}" written in elegant text on the RIGHT
- The company name text should be clearly readable
- Clean, modern typography for the company name
- Suitable for website headers and email signatures
- Professional and trustworthy appearance
- Have a solid colored background (not transparent)
- The overall composition should look like a LETTERHEAD or HEADER BANNER
- The icon on the left should be simple and memorable - this same icon will be used as a standalone square icon
- Position the logo content in the CENTER HORIZONTAL BAND of the image - the top and bottom will be cropped`;

        const generatedResult = await generateImageBase64(horizontalPrompt, "16:9");
        const horizontalResult = await cropToHorizontalAspect(generatedResult.base64, generatedResult.mimeType);
        
        return {
          base64: horizontalResult.base64,
          mimeType: horizontalResult.mimeType,
          conceptStyle: variation.style,
          conceptLabel: variation.label,
        };
      });
      
      const logos = await Promise.all(logoPromises);
      
      res.json({ logos });
    } catch (error: any) {
      logger.error("Logo Generation", "Error generating workspace logo options:", error);
      logger.error("Logo Generation", "Error details:", {
        message: error?.message,
        status: error?.status,
        code: error?.code,
        name: error?.name,
      });
      if (error?.status === 429 || error?.message?.includes("Resource exhausted") || error?.message?.includes("RESOURCE_EXHAUSTED")) {
        res.status(429).json({ message: "AI service is temporarily busy. Please wait a moment and try again." });
      } else {
        res.status(500).json({ message: error?.message || "Failed to generate logo options" });
      }
    }
  });

  app.post("/api/workspaces/:id/remix-logo", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const workspaceId = getParamId(req.params.id);
      
      const member = await storage.getWorkspaceMember(workspaceId, userId);
      if (!member || (member.role !== "owner" && member.role !== "admin")) {
        return res.status(403).json({ message: "Only owners and admins can generate workspace logos" });
      }
      
      const workspace = await storage.getWorkspace(workspaceId);
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }
      
      const { companyName, conceptStyle, editInstructions } = req.body;
      if (!conceptStyle || !editInstructions) {
        return res.status(400).json({ message: "conceptStyle and editInstructions are required" });
      }
      
      const logoName = companyName || workspace.name;
      
      const { generateImageBase64, cropToHorizontalAspect } = await import("../replit_integrations/image/client");
      
      const remixPrompt = `Create a ${conceptStyle} HORIZONTAL BANNER logo for a property management company called "${logoName}".

USER REQUESTED MODIFICATIONS: ${editInstructions}

CRITICAL REQUIREMENTS:
- Apply the user's requested modifications to the design
- Layout: A distinctive icon/symbol on the LEFT side, then the company name "${logoName}" written in elegant text on the RIGHT
- The company name text should be clearly readable
- Clean, modern typography for the company name
- Suitable for website headers and email signatures
- Professional and trustworthy appearance
- Have a solid colored background (not transparent)
- The overall composition should look like a LETTERHEAD or HEADER BANNER
- The icon on the left should be simple and memorable - this same icon will be used as a standalone square icon
- Position the logo content in the CENTER HORIZONTAL BAND of the image - the top and bottom will be cropped`;

      const generatedResult = await generateImageBase64(remixPrompt, "16:9");
      const horizontalResult = await cropToHorizontalAspect(generatedResult.base64, generatedResult.mimeType);
      
      res.json({
        base64: horizontalResult.base64,
        mimeType: horizontalResult.mimeType,
        conceptStyle: `${conceptStyle} + ${editInstructions}`,
        conceptLabel: "Remixed",
      });
    } catch (error: any) {
      logger.error("Workspaces", "Error remixing logo:", error);
      if (error?.status === 429 || error?.message?.includes("Resource exhausted") || error?.message?.includes("RESOURCE_EXHAUSTED")) {
        res.status(429).json({ message: "AI service is temporarily busy. Please wait a moment and try again." });
      } else {
        res.status(500).json({ message: "Failed to remix logo" });
      }
    }
  });

  app.post("/api/workspaces/:id/generate-square-icon", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const workspaceId = getParamId(req.params.id);
      
      const member = await storage.getWorkspaceMember(workspaceId, userId);
      if (!member || (member.role !== "owner" && member.role !== "admin")) {
        return res.status(403).json({ message: "Only owners and admins can generate workspace logos" });
      }
      
      const workspace = await storage.getWorkspace(workspaceId);
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }
      
      const { horizontalLogoBase64, horizontalLogoMimeType, companyName, description } = req.body;
      
      if (!horizontalLogoBase64 || !horizontalLogoMimeType) {
        return res.status(400).json({ message: "Horizontal logo is required" });
      }
      
      const logoName = companyName || workspace.name;
      const styleDescription = description || "modern and professional";
      
      const { generateSquareIconFromLogo } = await import("../replit_integrations/image/client");
      
      const squareResult = await generateSquareIconFromLogo(
        `data:${horizontalLogoMimeType};base64,${horizontalLogoBase64}`,
        logoName,
        styleDescription
      );
      
      res.json({
        base64: squareResult.base64,
        mimeType: squareResult.mimeType,
      });
    } catch (error) {
      logger.error("Workspaces", "Error generating square icon:", error);
      res.status(500).json({ message: "Failed to generate square icon" });
    }
  });

  app.post("/api/workspaces/:id/generate-logo", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const workspaceId = getParamId(req.params.id);
      
      const member = await storage.getWorkspaceMember(workspaceId, userId);
      if (!member || (member.role !== "owner" && member.role !== "admin")) {
        return res.status(403).json({ message: "Only owners and admins can generate workspace logos" });
      }
      
      const workspace = await storage.getWorkspace(workspaceId);
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }
      
      const { companyName, description } = req.body;
      const logoName = companyName || workspace.name;
      const styleDescription = description || "modern and professional";
      
      const { generateImageBase64, generateSquareIconFromLogo, cropToHorizontalAspect } = await import("../replit_integrations/image/client");
      
      const horizontalPrompt = `Create a ${styleDescription} HORIZONTAL BANNER logo for a property management company called "${logoName}".

CRITICAL REQUIREMENTS:
- Layout: A distinctive icon/symbol on the LEFT side, then the company name "${logoName}" written in elegant text on the RIGHT
- The company name text should be clearly readable
- Clean, modern typography for the company name
- Suitable for website headers and email signatures
- Professional and trustworthy appearance
- Have a solid colored background (not transparent)
- The overall composition should look like a LETTERHEAD or HEADER BANNER
- The icon on the left should be simple and memorable - this same icon will be used as a standalone square icon
- Position the logo content in the CENTER HORIZONTAL BAND of the image - the top and bottom will be cropped`;

      const generatedResult = await generateImageBase64(horizontalPrompt, "16:9");
      const horizontalResult = await cropToHorizontalAspect(generatedResult.base64, generatedResult.mimeType);
      
      const squareResult = await generateSquareIconFromLogo(
        `data:${horizontalResult.mimeType};base64,${horizontalResult.base64}`,
        logoName,
        styleDescription
      );
      
      res.json({
        horizontal: {
          base64: horizontalResult.base64,
          mimeType: horizontalResult.mimeType,
        },
        square: {
          base64: squareResult.base64,
          mimeType: squareResult.mimeType,
        },
      });
    } catch (error) {
      logger.error("Workspaces", "Error generating workspace logo:", error);
      res.status(500).json({ message: "Failed to generate logo" });
    }
  });

  app.get("/api/workspaces/:workspaceId/teams", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const workspaceId = getParamId(req.params.workspaceId);
      
      const member = await storage.getWorkspaceMember(workspaceId, userId);
      if (!member) {
        return res.status(403).json({ message: "Not a member of this workspace" });
      }

      const teamsWithStats = await storage.getTeamsWithStatsByWorkspace(workspaceId);
      res.json(teamsWithStats);
    } catch (error) {
      logger.error("Teams", "Error fetching teams:", error);
      res.status(500).json({ message: "Failed to fetch teams" });
    }
  });

  app.get("/api/workspaces/:workspaceId/teams/:teamId", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const workspaceId = getParamId(req.params.workspaceId);
      const teamId = getParamId(req.params.teamId);
      
      const member = await storage.getWorkspaceMember(workspaceId, userId);
      if (!member) {
        return res.status(403).json({ message: "Not a member of this workspace" });
      }

      const team = await storage.getTeam(teamId);
      if (!team || team.workspaceId !== workspaceId) {
        return res.status(404).json({ message: "Team not found" });
      }

      res.json(team);
    } catch (error) {
      logger.error("Teams", "Error fetching team:", error);
      res.status(500).json({ message: "Failed to fetch team" });
    }
  });

  app.post("/api/workspaces/:workspaceId/teams", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const workspaceId = getParamId(req.params.workspaceId);
      
      const member = await storage.getWorkspaceMember(workspaceId, userId);
      if (!member) {
        return res.status(403).json({ message: "Not a member of this workspace" });
      }

      const { name, description } = req.body;
      if (!name) {
        return res.status(400).json({ message: "Team name is required" });
      }

      const team = await storage.createTeam({
        workspaceId,
        name,
        description,
        createdBy: userId,
      });

      res.status(201).json(team);
    } catch (error) {
      logger.error("Teams", "Error creating team:", error);
      res.status(500).json({ message: "Failed to create team" });
    }
  });

  app.put("/api/workspaces/:workspaceId/teams/:teamId", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const workspaceId = getParamId(req.params.workspaceId);
      const teamId = getParamId(req.params.teamId);
      
      const member = await storage.getWorkspaceMember(workspaceId, userId);
      if (!member) {
        return res.status(403).json({ message: "Not a member of this workspace" });
      }

      const team = await storage.getTeam(teamId);
      if (!team || team.workspaceId !== workspaceId) {
        return res.status(404).json({ message: "Team not found" });
      }

      const { name, description } = req.body;
      const updated = await storage.updateTeam(teamId, { name, description });
      res.json(updated);
    } catch (error) {
      logger.error("Teams", "Error updating team:", error);
      res.status(500).json({ message: "Failed to update team" });
    }
  });

  app.delete("/api/workspaces/:workspaceId/teams/:teamId", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const workspaceId = getParamId(req.params.workspaceId);
      const teamId = getParamId(req.params.teamId);
      
      const member = await storage.getWorkspaceMember(workspaceId, userId);
      if (!member) {
        return res.status(403).json({ message: "Not a member of this workspace" });
      }

      const team = await storage.getTeam(teamId);
      if (!team || team.workspaceId !== workspaceId) {
        return res.status(404).json({ message: "Team not found" });
      }

      await storage.deleteTeam(teamId);
      res.json({ message: "Team deleted successfully" });
    } catch (error) {
      logger.error("Teams", "Error deleting team:", error);
      res.status(500).json({ message: "Failed to delete team" });
    }
  });

  app.get("/api/workspaces/:workspaceId/teams/:teamId/members", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const workspaceId = getParamId(req.params.workspaceId);
      const teamId = getParamId(req.params.teamId);
      
      const member = await storage.getWorkspaceMember(workspaceId, userId);
      if (!member) {
        return res.status(403).json({ message: "Not a member of this workspace" });
      }

      const team = await storage.getTeam(teamId);
      if (!team || team.workspaceId !== workspaceId) {
        return res.status(404).json({ message: "Team not found" });
      }

      const membersWithUser = await storage.getTeamMembersWithUserByTeam(teamId);
      res.json(membersWithUser);
    } catch (error) {
      logger.error("Teams", "Error fetching team members:", error);
      res.status(500).json({ message: "Failed to fetch team members" });
    }
  });

  app.post("/api/workspaces/:workspaceId/teams/:teamId/members", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const workspaceId = getParamId(req.params.workspaceId);
      const teamId = getParamId(req.params.teamId);
      
      const member = await storage.getWorkspaceMember(workspaceId, userId);
      if (!member) {
        return res.status(403).json({ message: "Not a member of this workspace" });
      }

      const team = await storage.getTeam(teamId);
      if (!team || team.workspaceId !== workspaceId) {
        return res.status(404).json({ message: "Team not found" });
      }

      const { invitedEmail, role } = req.body;
      if (!invitedEmail) {
        return res.status(400).json({ message: "Email is required to invite a member" });
      }

      const { randomBytes } = await import("crypto");
      const invitationToken = randomBytes(32).toString("hex");

      const teamMember = await storage.createTeamMember({
        teamId,
        invitedEmail,
        invitedBy: userId,
        invitationToken,
        role: role || "member",
        status: "invited",
      });

      try {
        const { sendTeamInviteEmail } = await import("../services/email");
        const inviter = await storage.getUser(userId);
        const workspace = await storage.getWorkspace(workspaceId);
        
        if (inviter && workspace) {
          const inviterName = inviter.firstName && inviter.lastName 
            ? `${inviter.firstName} ${inviter.lastName}` 
            : inviter.email || 'A team member';
          
          await sendTeamInviteEmail({
            toEmail: invitedEmail,
            teamName: team.name,
            workspaceName: workspace.name,
            inviterName,
            role: role || "member",
            invitationToken,
          });
        }
      } catch (emailError) {
        logger.error("Teams", "Failed to send invite email (non-blocking):", emailError);
      }

      res.status(201).json(teamMember);
    } catch (error) {
      logger.error("Teams", "Error inviting team member:", error);
      res.status(500).json({ message: "Failed to invite team member" });
    }
  });

  app.put("/api/workspaces/:workspaceId/teams/:teamId/members/:memberId", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const workspaceId = getParamId(req.params.workspaceId);
      const teamId = getParamId(req.params.teamId);
      const memberId = getParamId(req.params.memberId);
      
      const workspaceMember = await storage.getWorkspaceMember(workspaceId, userId);
      if (!workspaceMember) {
        return res.status(403).json({ message: "Not a member of this workspace" });
      }

      const team = await storage.getTeam(teamId);
      if (!team || team.workspaceId !== workspaceId) {
        return res.status(404).json({ message: "Team not found" });
      }

      const teamMember = await storage.getTeamMember(memberId);
      if (!teamMember || teamMember.teamId !== teamId) {
        return res.status(404).json({ message: "Team member not found" });
      }

      const { role, status } = req.body;
      const updated = await storage.updateTeamMember(memberId, { role, status });
      res.json(updated);
    } catch (error) {
      logger.error("Teams", "Error updating team member:", error);
      res.status(500).json({ message: "Failed to update team member" });
    }
  });

  app.delete("/api/workspaces/:workspaceId/teams/:teamId/members/:memberId", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const workspaceId = getParamId(req.params.workspaceId);
      const teamId = getParamId(req.params.teamId);
      const memberId = getParamId(req.params.memberId);
      
      const workspaceMember = await storage.getWorkspaceMember(workspaceId, userId);
      if (!workspaceMember) {
        return res.status(403).json({ message: "Not a member of this workspace" });
      }

      const team = await storage.getTeam(teamId);
      if (!team || team.workspaceId !== workspaceId) {
        return res.status(404).json({ message: "Team not found" });
      }

      const teamMember = await storage.getTeamMember(memberId);
      if (!teamMember || teamMember.teamId !== teamId) {
        return res.status(404).json({ message: "Team member not found" });
      }

      await storage.deleteTeamMember(memberId);
      res.json({ message: "Team member removed successfully" });
    } catch (error) {
      logger.error("Teams", "Error removing team member:", error);
      res.status(500).json({ message: "Failed to remove team member" });
    }
  });

  app.get("/api/invitations/:token", async (req, res) => {
    try {
      const token = req.params.token as string;
      
      const teamMember = await storage.getTeamMemberByInvitationToken(token);
      if (!teamMember) {
        return res.status(404).json({ message: "Invitation not found or has expired" });
      }

      if (teamMember.status !== "invited") {
        return res.status(400).json({ message: "This invitation has already been accepted" });
      }

      const team = await storage.getTeam(teamMember.teamId);
      if (!team) {
        return res.status(404).json({ message: "Team not found" });
      }

      const workspace = await storage.getWorkspace(team.workspaceId);

      res.json({
        invitedEmail: teamMember.invitedEmail,
        teamName: team.name,
        workspaceName: workspace?.name || "Unknown Workspace",
        role: teamMember.role,
        workspaceId: team.workspaceId,
        teamId: team.id,
      });
    } catch (error) {
      logger.error("Invitations", "Error fetching invitation:", error);
      res.status(500).json({ message: "Failed to fetch invitation details" });
    }
  });

  app.post("/api/invitations/:token/accept", isAuthenticated, async (req, res) => {
    try {
      const token = req.params.token as string;
      const userId = getUserId(req);
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      const teamMember = await storage.getTeamMemberByInvitationToken(token);
      if (!teamMember) {
        return res.status(404).json({ message: "Invitation not found or has expired" });
      }

      if (teamMember.status !== "invited") {
        return res.status(400).json({ message: "This invitation has already been accepted" });
      }

      if (teamMember.invitedEmail?.toLowerCase() !== user.email?.toLowerCase()) {
        return res.status(403).json({ 
          message: "This invitation was sent to a different email address. Please log in with the correct account." 
        });
      }

      const team = await storage.getTeam(teamMember.teamId);
      if (!team) {
        return res.status(404).json({ message: "Team not found" });
      }

      const acceptedMember = await storage.acceptTeamInvitation(token, userId);
      
      if (!acceptedMember) {
        return res.status(409).json({ message: "This invitation has already been accepted" });
      }

      const existingWorkspaceMember = await storage.getWorkspaceMember(team.workspaceId, userId);
      if (!existingWorkspaceMember) {
        await storage.createWorkspaceMember({
          workspaceId: team.workspaceId,
          userId,
          role: "member",
          status: "active",
        });
      }

      res.json({ 
        message: "Successfully joined the team!",
        workspaceId: team.workspaceId,
        teamId: team.id,
      });
    } catch (error) {
      logger.error("Invitations", "Error accepting invitation:", error);
      res.status(500).json({ message: "Failed to accept invitation" });
    }
  });

  app.post("/api/feedback", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const user = await storage.getUser(userId);
      
      if (!user?.email) {
        return res.status(400).json({ message: "Your account must have an email address to submit feedback" });
      }
      
      const { type, message } = req.body;
      
      if (!type || !message) {
        return res.status(400).json({ message: "Type and message are required" });
      }
      
      if (!['support', 'feedback', 'bug'].includes(type)) {
        return res.status(400).json({ message: "Invalid feedback type" });
      }
      
      const { sendFeedbackEmail } = await import("../services/email");
      
      const success = await sendFeedbackEmail({
        type,
        message,
        userEmail: user.email,
        userName: user.firstName && user.lastName 
          ? `${user.firstName} ${user.lastName}` 
          : user.email || 'Unknown',
      });
      
      if (!success) {
        return res.status(500).json({ message: "Failed to send feedback" });
      }
      
      res.json({ message: "Feedback sent successfully" });
    } catch (error) {
      logger.error("Feedback", "Error sending feedback:", error);
      res.status(500).json({ message: "Failed to send feedback" });
    }
  });
}
