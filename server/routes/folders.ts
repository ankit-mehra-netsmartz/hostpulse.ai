import type { Express } from "express";
import type { IStorage } from "../storage";
import { isAuthenticated } from "../replit_integrations/auth";
import { logger } from "../logger";
import { config } from "../config";
import { getUserId, getWorkspaceId, getParamId } from "./helpers";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: config.openai.apiKey,
  baseURL: config.openai.baseUrl,
});

export function registerFolderRoutes(app: Express, storage: IStorage) {
  // ============================================
  // Folder System Routes
  // ============================================

  app.get("/api/folders", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const workspaceId = getWorkspaceId(req);
      if (!userId || !workspaceId) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const folders = await storage.getFolders(workspaceId);
      res.json(folders);
    } catch (error) {
      logger.error("Folders", "Error fetching folders:", error);
      res.status(500).json({ message: "Failed to fetch folders" });
    }
  });

  app.get("/api/folders/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const workspaceId = getWorkspaceId(req);
      if (!userId || !workspaceId) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const folder = await storage.getFolderWithItems(req.params.id);
      if (!folder) {
        return res.status(404).json({ message: "Folder not found" });
      }
      if (folder.workspaceId !== workspaceId) {
        return res.status(403).json({ message: "Not authorized" });
      }

      res.json(folder);
    } catch (error) {
      logger.error("Folders", "Error fetching folder:", error);
      res.status(500).json({ message: "Failed to fetch folder" });
    }
  });

  app.post("/api/folders", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const workspaceId = getWorkspaceId(req);
      if (!userId || !workspaceId) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const { name, description, parentId, color, icon } = req.body;
      if (!name) {
        return res.status(400).json({ message: "Folder name is required" });
      }

      const folder = await storage.createFolder({
        workspaceId,
        name,
        description,
        parentId,
        color,
        icon,
        createdBy: userId,
      });

      res.status(201).json(folder);
    } catch (error) {
      logger.error("Folders", "Error creating folder:", error);
      res.status(500).json({ message: "Failed to create folder" });
    }
  });

  app.patch("/api/folders/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const workspaceId = getWorkspaceId(req);
      if (!userId || !workspaceId) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const existing = await storage.getFolder(req.params.id);
      if (!existing) {
        return res.status(404).json({ message: "Folder not found" });
      }
      if (existing.workspaceId !== workspaceId) {
        return res.status(403).json({ message: "Not authorized" });
      }

      const folder = await storage.updateFolder(req.params.id, req.body);
      res.json(folder);
    } catch (error) {
      logger.error("Folders", "Error updating folder:", error);
      res.status(500).json({ message: "Failed to update folder" });
    }
  });

  app.delete("/api/folders/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const workspaceId = getWorkspaceId(req);
      if (!userId || !workspaceId) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const existing = await storage.getFolder(req.params.id);
      if (!existing) {
        return res.status(404).json({ message: "Folder not found" });
      }
      if (existing.workspaceId !== workspaceId) {
        return res.status(403).json({ message: "Not authorized" });
      }

      await storage.deleteFolder(req.params.id);
      res.status(204).send();
    } catch (error) {
      logger.error("Folders", "Error deleting folder:", error);
      res.status(500).json({ message: "Failed to delete folder" });
    }
  });

  app.get("/api/folders/:id/items", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const workspaceId = getWorkspaceId(req);
      if (!userId || !workspaceId) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const folder = await storage.getFolder(req.params.id);
      if (!folder) {
        return res.status(404).json({ message: "Folder not found" });
      }
      if (folder.workspaceId !== workspaceId) {
        return res.status(403).json({ message: "Not authorized" });
      }

      const items = await storage.getFolderItems(req.params.id);
      res.json(items);
    } catch (error) {
      logger.error("Folders", "Error fetching folder items:", error);
      res.status(500).json({ message: "Failed to fetch folder items" });
    }
  });

  app.post("/api/folders/:id/items", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const workspaceId = getWorkspaceId(req);
      if (!userId || !workspaceId) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const folder = await storage.getFolder(req.params.id);
      if (!folder) {
        return res.status(404).json({ message: "Folder not found" });
      }
      if (folder.workspaceId !== workspaceId) {
        return res.status(403).json({ message: "Not authorized" });
      }

      const { type, name, description, fileUrl, fileType, fileSize, mimeType, linkUrl, linkType, thumbnailUrl, metadata } = req.body;
      if (!type || !name) {
        return res.status(400).json({ message: "Type and name are required" });
      }
      if (type === "file" && !fileUrl) {
        return res.status(400).json({ message: "File URL is required for file items" });
      }
      if (type === "link" && !linkUrl) {
        return res.status(400).json({ message: "Link URL is required for link items" });
      }

      const item = await storage.createFolderItem({
        workspaceId,
        folderId: req.params.id,
        type,
        name,
        description,
        fileUrl,
        fileType,
        fileSize,
        mimeType,
        linkUrl,
        linkType,
        thumbnailUrl,
        metadata,
        createdBy: userId,
      });

      res.status(201).json(item);
    } catch (error) {
      logger.error("Folders", "Error creating folder item:", error);
      res.status(500).json({ message: "Failed to create folder item" });
    }
  });

  app.get("/api/folder-items", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const workspaceId = getWorkspaceId(req);
      if (!userId || !workspaceId) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const items = await storage.getAllFolderItems(workspaceId);
      res.json(items);
    } catch (error) {
      logger.error("Folders", "Error fetching all folder items:", error);
      res.status(500).json({ message: "Failed to fetch folder items" });
    }
  });

  app.patch("/api/folder-items/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const workspaceId = getWorkspaceId(req);
      if (!userId || !workspaceId) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const existing = await storage.getFolderItem(req.params.id);
      if (!existing) {
        return res.status(404).json({ message: "Folder item not found" });
      }
      if (existing.workspaceId !== workspaceId) {
        return res.status(403).json({ message: "Not authorized" });
      }

      const item = await storage.updateFolderItem(req.params.id, req.body);
      res.json(item);
    } catch (error) {
      logger.error("Folders", "Error updating folder item:", error);
      res.status(500).json({ message: "Failed to update folder item" });
    }
  });

  app.delete("/api/folder-items/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const workspaceId = getWorkspaceId(req);
      if (!userId || !workspaceId) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const existing = await storage.getFolderItem(req.params.id);
      if (!existing) {
        return res.status(404).json({ message: "Folder item not found" });
      }
      if (existing.workspaceId !== workspaceId) {
        return res.status(403).json({ message: "Not authorized" });
      }

      await storage.deleteFolderItem(req.params.id);
      res.status(204).send();
    } catch (error) {
      logger.error("Folders", "Error deleting folder item:", error);
      res.status(500).json({ message: "Failed to delete folder item" });
    }
  });

  app.get("/api/tasks/:taskId/attachments", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const workspaceId = getWorkspaceId(req);
      if (!userId || !workspaceId) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const attachments = await storage.getTaskAttachments(req.params.taskId);
      res.json(attachments);
    } catch (error) {
      logger.error("Folders", "Error fetching task attachments:", error);
      res.status(500).json({ message: "Failed to fetch task attachments" });
    }
  });

  app.post("/api/tasks/:taskId/attachments", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const workspaceId = getWorkspaceId(req);
      if (!userId || !workspaceId) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const { folderItemId, subTaskId, procedureStepId } = req.body;
      if (!folderItemId) {
        return res.status(400).json({ message: "Folder item ID is required" });
      }

      const folderItem = await storage.getFolderItem(folderItemId);
      if (!folderItem) {
        return res.status(404).json({ message: "Folder item not found" });
      }
      if (folderItem.workspaceId !== workspaceId) {
        return res.status(403).json({ message: "Not authorized" });
      }

      const attachment = await storage.createTaskAttachment({
        workspaceId,
        folderItemId,
        taskId: req.params.taskId,
        subTaskId,
        procedureStepId,
        attachedBy: userId,
      });

      res.status(201).json(attachment);
    } catch (error) {
      logger.error("Folders", "Error creating task attachment:", error);
      res.status(500).json({ message: "Failed to create task attachment" });
    }
  });

  app.delete("/api/task-attachments/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const workspaceId = getWorkspaceId(req);
      if (!userId || !workspaceId) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const attachment = await storage.getTaskAttachment(req.params.id);
      if (!attachment) {
        return res.status(404).json({ message: "Attachment not found" });
      }
      if (attachment.workspaceId !== workspaceId) {
        return res.status(403).json({ message: "Not authorized" });
      }

      await storage.deleteTaskAttachment(req.params.id);
      res.status(204).send();
    } catch (error) {
      logger.error("Folders", "Error deleting task attachment:", error);
      res.status(500).json({ message: "Failed to delete task attachment" });
    }
  });

  app.post("/api/transcribe", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      
      const { audioBase64, mimeType } = req.body;
      if (!audioBase64) {
        return res.status(400).json({ message: "Audio data required" });
      }
      
      const audioBuffer = Buffer.from(audioBase64, 'base64');
      if (audioBuffer.length > 10 * 1024 * 1024) {
        return res.status(400).json({ message: "Audio file too large (max 10MB)" });
      }
      
      try {
        const { getElevenLabsApiKey } = await import("../elevenlabs");
        const apiKey = await getElevenLabsApiKey();
        
        const formData = new FormData();
        formData.append('file', new Blob([audioBuffer]), 'audio.webm');
        formData.append('model_id', 'scribe_v1');
        
        const response = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
          method: 'POST',
          headers: { 'xi-api-key': apiKey },
          body: formData,
        });
        
        if (!response.ok) {
          throw new Error(`ElevenLabs transcription failed: ${response.statusText}`);
        }
        
        const result = await response.json();
        return res.json({ transcript: result.text });
      } catch (elevenLabsError) {
        logger.info("Folders", "ElevenLabs STT failed, falling back to OpenAI:", elevenLabsError);
        
        const openaiApiKey = config.openai.apiKey;
        if (!openaiApiKey) {
          return res.status(500).json({ message: "AI integration not configured" });
        }
        
        const { OpenAI, toFile } = await import("openai");
        const openaiClient = new OpenAI({ apiKey: openaiApiKey });
        
        const audioFile = await toFile(audioBuffer, 'audio.webm', { type: mimeType || 'audio/webm' });
        
        const transcription = await openaiClient.audio.transcriptions.create({
          file: audioFile,
          model: "whisper-1",
          language: "en",
        });
        
        res.json({ transcript: transcription.text });
      }
    } catch (error) {
      logger.error("Folders", "Error transcribing audio:", error);
      res.status(500).json({ message: "Failed to transcribe audio" });
    }
  });

  app.post("/api/ai-summarize", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      
      const { text } = req.body;
      if (!text || typeof text !== 'string') {
        return res.status(400).json({ message: "Text is required" });
      }
      
      const response = await openai.chat.completions.create({
        model: "gpt-4.1-mini",
        messages: [
          {
            role: "system",
            content: "You are a helpful assistant that summarizes text concisely. Provide a brief, clear summary that captures the key points. Keep it to 1-3 sentences. Do not add any preamble like 'Here is a summary:' - just provide the summary directly."
          },
          {
            role: "user",
            content: text
          }
        ],
        max_tokens: 200,
      });
      
      const summary = response.choices[0]?.message?.content || "";
      res.json({ summary });
    } catch (error) {
      logger.error("Folders", "Error summarizing text:", error);
      res.status(500).json({ message: "Failed to summarize text" });
    }
  });

  app.post("/api/translate-to-english", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      
      const { text } = req.body;
      if (!text || typeof text !== 'string') {
        return res.status(400).json({ message: "Text is required" });
      }
      
      const response = await openai.chat.completions.create({
        model: "gpt-4.1-mini",
        messages: [
          {
            role: "system",
            content: "You are a translator. Translate the following text to English. If the text is already in English, return it as-is. Provide only the translation with no additional commentary or preamble."
          },
          {
            role: "user",
            content: text
          }
        ],
        max_tokens: 500,
      });
      
      const translation = response.choices[0]?.message?.content || "";
      res.json({ translation });
    } catch (error) {
      logger.error("Folders", "Error translating text:", error);
      res.status(500).json({ message: "Failed to translate text" });
    }
  });

  app.post("/api/procedure-completions/:id/generate-summary", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const completionId = getParamId(req.params.id);
      
      const completion = await storage.getProcedureCompletion(completionId);
      if (!completion) {
        return res.status(404).json({ message: "Completion not found" });
      }
      
      if (completion.completedByUserId !== userId) {
        return res.status(403).json({ message: "Not authorized" });
      }
      
      const { transcript } = req.body;
      if (!transcript) {
        return res.status(400).json({ message: "Transcript required" });
      }
      
      const openaiApiKey = config.openai.apiKey;
      if (!openaiApiKey) {
        return res.status(500).json({ message: "AI integration not configured" });
      }
      
      const { OpenAI } = await import("openai");
      const openaiClient = new OpenAI({ apiKey: openaiApiKey });
      
      const details = await storage.getProcedureCompletionWithDetails(completionId);
      
      const response = await openaiClient.chat.completions.create({
        model: "gpt-4.1-mini",
        messages: [
          {
            role: "system",
            content: `You are summarizing a voice update from a property management team member who just completed a procedure.
Procedure: ${details?.procedure?.title || "Unknown"}
Steps: ${details?.procedure?.steps?.map(s => s.label).join(", ") || "N/A"}

Create a clear, professional summary of what was accomplished and any issues encountered.
Keep the summary concise but include all important details mentioned.`
          },
          {
            role: "user",
            content: transcript
          }
        ],
        temperature: 0.5,
      });
      
      const summary = response.choices[0]?.message?.content || "";
      
      await storage.updateProcedureCompletion(completionId, {
        voiceUpdateTranscript: transcript,
        aiSummary: summary,
        aiSummaryStatus: "ready",
      });
      
      res.json({ summary });
    } catch (error) {
      logger.error("Folders", "Error generating summary:", error);
      res.status(500).json({ message: "Failed to generate summary" });
    }
  });
}
