import type { Express } from "express";
import type { IStorage } from "../storage";
import { isAuthenticated } from "../replit_integrations/auth";
import { z } from "zod";
import OpenAI from "openai";
import { config } from "../config";
import { logger } from "../logger";
import { getUserId } from "./helpers";
import { getElevenLabsApiKey } from "../elevenlabs";
import { storage } from "../storage";

const VOICE_STYLE_MAPPING: Record<string, { voiceId: string; stability: number; similarityBoost: number }> = {
  serious: { voiceId: "JBFqnCBsd6RMkjVDRZzb", stability: 0.7, similarityBoost: 0.8 },
  playful: { voiceId: "EXAVITQu4vr4xnSDxMaL", stability: 0.4, similarityBoost: 0.7 },
  dramatic: { voiceId: "N2lVS1w4EtoT3dr4eOWO", stability: 0.6, similarityBoost: 0.85 },
  chill: { voiceId: "pMsXgVXv3BLzUgSXRplE", stability: 0.8, similarityBoost: 0.6 },
};

const MUSIC_STYLE_CONTEXT: Record<string, string> = {
  pop: "upbeat, catchy, and memorable with a fun rhythm",
  country: "storytelling, warm, and conversational with a down-home feel",
  rock: "bold, energetic, and powerful with strong emotion",
  jazz: "smooth, sophisticated, and rhythmically interesting",
  hip_hop: "rhythmic, expressive, and with a strong beat and flow",
  spoken_word: "poetic, thoughtful, and delivered with clear enunciation",
};

async function generateSongInBackground(
  songId: string,
  userId: string,
  workspaceId: string | null,
  songType: string,
  songPrompt: string,
  musicStyle: string,
  voiceStyle: string,
  songTitle: string
) {
  logger.info("Song", `Starting generation for song ${songId}, title: "${songTitle}"`);
  
  try {
    const voiceConfig = VOICE_STYLE_MAPPING[voiceStyle] || VOICE_STYLE_MAPPING.playful;
    const musicContext = MUSIC_STYLE_CONTEXT[musicStyle] || MUSIC_STYLE_CONTEXT.pop;
    
    logger.info("Song", `Voice: ${voiceConfig.voiceId}, Music style: ${musicStyle}`);
    
    const lyricsWithStyle = `[Perform this in a ${musicContext} style]\n\n${songPrompt}`;
    const lyrics = songPrompt;
    
    let audioUrl: string | null = null;
    try {
      logger.info("Song", `Getting ElevenLabs API key...`);
      const apiKey = await getElevenLabsApiKey();
      logger.info("Song", `API key obtained, calling Music API...`);
      
      const musicPrompt = `Create a ${musicStyle} song with vocals singing the following lyrics:

${songPrompt}

Style: ${musicStyle}, ${musicContext}, professional studio quality, clear vocals.
IMPORTANT: Start with a SHORT musical intro (2-4 seconds max), then get RIGHT into the vocals. No long instrumental lead-in.`;

      logger.info("Song", `Music prompt length: ${musicPrompt.length} chars`);
      
      const response = await fetch('https://api.elevenlabs.io/v1/music', {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: musicPrompt,
          duration_ms: 60000,
        }),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        logger.error("Song", `Music API error response: ${response.status}`, errorText);
        throw new Error(`Music API error: ${response.status} - ${errorText}`);
      }
      
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = Buffer.from(arrayBuffer);
      
      logger.info("Song", `Audio collected: ${audioBuffer.length} bytes`);
      
      const maxAudioSize = 5 * 1024 * 1024;
      if (audioBuffer.length <= maxAudioSize) {
        audioUrl = `data:audio/mpeg;base64,${audioBuffer.toString('base64')}`;
        logger.info("Song", `Audio URL created successfully (${(audioBuffer.length / 1024 / 1024).toFixed(2)}MB)`);
      } else {
        logger.warn("Song", `Audio too large (${(audioBuffer.length / 1024 / 1024).toFixed(2)}MB), skipping audio storage`);
      }
    } catch (elevenLabsError: any) {
      logger.error("Song", `ElevenLabs error:`, elevenLabsError?.message || elevenLabsError);
    }
    
    logger.info("Song", `Updating song record, has audio: ${!!audioUrl}`);
    await storage.updateUserSong(songId, {
      status: "ready",
      title: songTitle,
      lyrics,
      audioUrl,
      prompt: songPrompt,
    });
    
    logger.info("Song", `Song ${songId} generation complete`);
    
  } catch (error: any) {
    logger.error("Song", `Error generating song:`, error?.message || error);
    await storage.updateUserSong(songId, {
      status: "failed",
    });
  }
}

const headshotCharacters = {
  male: [
    { name: "Lego Man", prompt: "A friendly LEGO minifigure man, classic yellow skin, happy smile, professional looking with a tiny hard hat or business suit, toy plastic texture, studio portrait lighting, clean background" },
    { name: "Chewbacca", prompt: "Chewbacca from Star Wars in a professional headshot pose, furry wookiee with kind eyes, studio portrait lighting, warm expression, looking at camera, clean background" },
    { name: "Tony Stark", prompt: "A dapper tech entrepreneur man in Tony Stark style, goatee beard, confident smirk, stylish suit, arc reactor glow subtle on chest, studio portrait lighting, professional headshot" },
    { name: "Mario", prompt: "Super Mario character style portrait, friendly mustached man with red cap and blue overalls, cheerful expression, pixel art inspired but 3D rendered, studio portrait lighting" },
    { name: "Gandalf", prompt: "A wise wizard in Gandalf style, long grey beard, pointy hat, kind knowing eyes, mystical yet approachable expression, studio portrait lighting, professional headshot" },
    { name: "Pirate Captain", prompt: "A charming pirate captain portrait, tricorn hat, friendly rogue smile, maybe an eyepatch, professional headshot style but with swashbuckling flair, studio lighting" },
    { name: "Astronaut", prompt: "A heroic astronaut in space suit, helmet off, confident smile, NASA-style patches, stars reflected in visor nearby, studio portrait, professional headshot" },
    { name: "Viking Warrior", prompt: "A noble Viking warrior portrait, braided beard, fur collar, kind but fierce eyes, traditional Nordic helm, professional headshot style, studio lighting" },
    { name: "Superhero", prompt: "A classic superhero portrait, cape, emblem on chest, heroic jawline, confident smile, comic book inspired but realistic, professional headshot, studio lighting" },
    { name: "Robot Butler", prompt: "A friendly robot butler portrait, chrome and brass steampunk design, glowing eyes with personality, bow tie, dignified expression, studio portrait lighting" },
  ],
  female: [
    { name: "Lego Woman", prompt: "A friendly LEGO minifigure woman, classic yellow skin, happy smile, professional looking with stylish hair piece and business attire, toy plastic texture, studio portrait lighting, clean background" },
    { name: "Wonder Woman", prompt: "A powerful warrior woman in Wonder Woman Amazonian style, tiara, confident and kind expression, flowing dark hair, studio portrait lighting, professional headshot" },
    { name: "Princess Leia", prompt: "A regal leader in Princess Leia style, signature side bun hairstyle, determined yet warm expression, white flowing robes, studio portrait lighting, professional headshot" },
    { name: "Elsa", prompt: "An elegant ice queen in Elsa style, platinum blonde braid, sparkling ice blue dress, magical frost sparkles, serene powerful expression, studio portrait lighting" },
    { name: "Pirate Queen", prompt: "A dashing pirate queen portrait, tricorn hat with feather, confident smirk, elegant yet adventurous, gold earrings, professional headshot style, studio lighting" },
    { name: "Astronaut", prompt: "A heroic female astronaut in space suit, helmet off, confident smile, NASA-style patches, inspiring expression, studio portrait, professional headshot" },
    { name: "Valkyrie", prompt: "A noble Valkyrie warrior woman portrait, winged helm, flowing braids, fierce yet kind eyes, Norse mythology inspired, professional headshot style, studio lighting" },
    { name: "Superhero", prompt: "A classic female superhero portrait, cape flowing, emblem on chest, powerful stance, confident smile, comic book inspired but realistic, professional headshot" },
    { name: "Robot Assistant", prompt: "A friendly female robot portrait, sleek chrome design with warm glowing eyes, elegant futuristic styling, approachable expression, studio portrait lighting" },
    { name: "Wizard", prompt: "A wise and powerful sorceress portrait, flowing magical robes, mystical staff, kind knowing eyes with a hint of mischief, studio portrait lighting, professional headshot" },
  ],
};

const profileUpdateSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  bio: z.string().max(500).optional(),
  profileImageUrl: z.string().url().optional().nullable(),
});

const headshotGenerateSchema = z.object({
  gender: z.enum(["male", "female", "random"]).optional(),
  characterIndex: z.number().optional(),
  customPrompt: z.string().optional(),
});

const morphCharacterSchema = z.object({
  selfieBase64: z.string(),
  editPrompt: z.string().optional(),
});

const aiEditImageSchema = z.object({
  imageBase64: z.string(),
  prompt: z.string(),
});

const lockHeadshotSchema = z.object({
  profileImageUrl: z.string(),
  originalSelfieUrl: z.string().optional(),
});

const songCreateSchema = z.object({
  songType: z.enum(["str_journey", "worst_guest"]),
  reservationId: z.string().optional(),
  prompt: z.string().min(10, "Prompt must be at least 10 characters"),
  musicStyle: z.enum(["pop", "country", "rock", "jazz", "hip_hop", "spoken_word"]),
  voiceStyle: z.enum(["serious", "playful", "dramatic", "chill"]),
  title: z.string().min(1, "Title is required"),
});

export function registerUserRoutes(app: Express, storage: IStorage) {
  app.delete("/api/user/data", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      await storage.clearUserData(userId);
      res.status(204).send();
    } catch (error) {
      logger.error("User", "Error clearing user data:", error);
      res.status(500).json({ message: "Failed to clear user data" });
    }
  });

  app.get("/api/user/profile", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      res.json({
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        bio: user.bio,
        profileImageUrl: user.profileImageUrl,
      });
    } catch (error) {
      logger.error("User", "Error fetching user profile:", error);
      res.status(500).json({ message: "Failed to fetch profile" });
    }
  });

  app.patch("/api/user/profile", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const validation = profileUpdateSchema.safeParse(req.body);
      
      if (!validation.success) {
        return res.status(400).json({ message: "Invalid profile data", errors: validation.error.errors });
      }
      
      const { firstName, lastName, bio, profileImageUrl } = validation.data;
      
      if (profileImageUrl) {
        await storage.addProfilePhotoHistory(userId, profileImageUrl);
      }
      
      const updated = await storage.updateUserProfile(userId, {
        firstName,
        lastName,
        bio,
        profileImageUrl: profileImageUrl || undefined,
      });
      
      if (!updated) {
        return res.status(404).json({ message: "User not found" });
      }
      
      res.json({ message: "Profile updated successfully" });
    } catch (error) {
      logger.error("User", "Error updating user profile:", error);
      res.status(500).json({ message: "Failed to update profile" });
    }
  });

  app.get("/api/user/photo-history", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const history = await storage.getProfilePhotoHistory(userId);
      res.json(history);
    } catch (error) {
      logger.error("User", "Error fetching photo history:", error);
      res.status(500).json({ message: "Failed to fetch photo history" });
    }
  });

  app.post("/api/user/generate-headshot", isAuthenticated, async (req, res) => {
    try {
      const validation = headshotGenerateSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ message: "Invalid request", errors: validation.error.errors });
      }

      const { gender, characterIndex, customPrompt } = validation.data;
      const { generateImageBase64 } = await import("../replit_integrations/image/client");
      
      if (customPrompt && customPrompt.trim()) {
        const enhancedPrompt = `Professional portrait avatar: ${customPrompt.trim()}. Photorealistic, high quality, centered face, soft lighting, suitable for a profile picture.`;
        const result = await generateImageBase64(enhancedPrompt);
        
        return res.json({
          success: true,
          characterName: "Custom Avatar",
          gender: "custom",
          image: {
            base64: result.base64,
            mimeType: result.mimeType,
          },
        });
      }
      
      const selectedGender: "male" | "female" = (!gender || gender === "random")
        ? (Math.random() > 0.5 ? "male" : "female") 
        : gender;
      
      const characters = headshotCharacters[selectedGender];
      const selectedIndex = characterIndex !== undefined 
        ? Math.min(characterIndex, characters.length - 1)
        : Math.floor(Math.random() * characters.length);
      
      const character = characters[selectedIndex];
      const result = await generateImageBase64(character.prompt);
      
      res.json({
        success: true,
        characterName: character.name,
        gender: selectedGender,
        image: {
          base64: result.base64,
          mimeType: result.mimeType,
        },
      });
    } catch (error) {
      logger.error("User", "Error generating headshot:", error);
      res.status(500).json({ message: "Failed to generate headshot" });
    }
  });

  app.get("/api/user/headshot-characters", isAuthenticated, async (req, res) => {
    try {
      const maleNames = headshotCharacters.male.map((c, i) => ({ index: i, name: c.name }));
      const femaleNames = headshotCharacters.female.map((c, i) => ({ index: i, name: c.name }));
      res.json({ male: maleNames, female: femaleNames });
    } catch (error) {
      logger.error("User", "Error fetching headshot characters:", error);
      res.status(500).json({ message: "Failed to fetch characters" });
    }
  });

  app.post("/api/user/morph-character", isAuthenticated, async (req, res) => {
    try {
      const validation = morphCharacterSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ message: "Invalid request", errors: validation.error.errors });
      }

      const { editPrompt } = validation.data;
      
      const gender: "male" | "female" = Math.random() > 0.5 ? "male" : "female";
      const characters = headshotCharacters[gender];
      const selectedIndex = Math.floor(Math.random() * characters.length);
      const character = characters[selectedIndex];
      
      let finalPrompt = character.prompt;
      if (editPrompt) {
        finalPrompt = `${character.prompt}. Additional details: ${editPrompt}`;
      }
      
      const { generateImageBase64 } = await import("../replit_integrations/image/client");
      const result = await generateImageBase64(finalPrompt);
      
      res.json({
        success: true,
        characterName: character.name,
        gender,
        image: {
          base64: result.base64,
          mimeType: result.mimeType,
        },
      });
    } catch (error) {
      logger.error("User", "Error morphing character:", error);
      res.status(500).json({ message: "Failed to generate character morph" });
    }
  });

  app.post("/api/ai/edit-image", isAuthenticated, async (req, res) => {
    try {
      const validation = aiEditImageSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ message: "Invalid request", errors: validation.error.errors });
      }

      const { imageBase64, prompt } = validation.data;
      
      const { ai } = await import("../replit_integrations/image/client");
      const { Modality } = await import("@google/genai");
      
      const fullPrompt = `You are an expert photo editor. Edit this photo according to the following instructions:

${prompt}

Important guidelines:
- Make the edits look natural and professional
- Maintain realistic proportions and lighting
- The result should look like a real, high-quality photograph
- Apply the requested changes while keeping the subject recognizable

Generate the edited version of this photo.`;

      const response = await ai.models.generateContent({
        model: "gemini-3-pro-image-preview",
        contents: [{
          role: "user",
          parts: [
            {
              inlineData: {
                mimeType: "image/jpeg",
                data: imageBase64.replace(/^data:image\/\w+;base64,/, ""),
              },
            },
            { text: fullPrompt },
          ],
        }],
        config: {
          responseModalities: [Modality.TEXT, Modality.IMAGE],
        },
      });

      const candidate = response.candidates?.[0];
      const imagePart = candidate?.content?.parts?.find(
        (part: { inlineData?: { data?: string; mimeType?: string } }) => part.inlineData
      );

      if (!imagePart?.inlineData?.data) {
        throw new Error("No image data in AI response");
      }

      res.json({
        success: true,
        image: {
          base64: imagePart.inlineData.data,
          mimeType: imagePart.inlineData.mimeType || "image/png",
        },
      });
    } catch (error) {
      logger.error("User", "Error editing image with AI:", error);
      res.status(500).json({ message: "Failed to process image for AI edit" });
    }
  });

  app.post("/api/user/lock-headshot", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const validation = lockHeadshotSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ message: "Invalid request", errors: validation.error.errors });
      }

      const { profileImageUrl, originalSelfieUrl } = validation.data;
      
      const user = await storage.getUser(userId);
      if (user?.headshotLockedAt) {
        const lockDate = new Date(user.headshotLockedAt);
        const unlockDate = new Date(lockDate.getTime() + 30 * 24 * 60 * 60 * 1000);
        if (new Date() < unlockDate) {
          const daysRemaining = Math.ceil((unlockDate.getTime() - new Date().getTime()) / (24 * 60 * 60 * 1000));
          return res.status(400).json({ 
            message: `Your headshot is locked for ${daysRemaining} more days.`,
            unlockDate: unlockDate.toISOString(),
          });
        }
      }
      
      await storage.updateUserProfile(userId, {
        profileImageUrl,
        originalSelfieUrl: originalSelfieUrl || null,
        headshotLockedAt: new Date(),
      });
      
      res.json({
        success: true,
        message: "Headshot locked for 30 days!",
        unlockDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      });
    } catch (error) {
      logger.error("User", "Error locking headshot:", error);
      res.status(500).json({ message: "Failed to lock headshot" });
    }
  });

  app.get("/api/user/headshot-status", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const user = await storage.getUser(userId);
      
      if (!user?.headshotLockedAt) {
        return res.json({ isLocked: false });
      }
      
      const lockDate = new Date(user.headshotLockedAt);
      const unlockDate = new Date(lockDate.getTime() + 30 * 24 * 60 * 60 * 1000);
      const isLocked = new Date() < unlockDate;
      const daysRemaining = isLocked 
        ? Math.ceil((unlockDate.getTime() - new Date().getTime()) / (24 * 60 * 60 * 1000))
        : 0;
      
      res.json({
        isLocked,
        unlockDate: unlockDate.toISOString(),
        daysRemaining,
        originalSelfieUrl: user.originalSelfieUrl || null,
      });
    } catch (error) {
      logger.error("User", "Error checking headshot status:", error);
      res.status(500).json({ message: "Failed to check headshot status" });
    }
  });

  app.get("/api/user/songs", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const songs = await storage.getUserSongs(userId);
      res.json(songs);
    } catch (error) {
      logger.error("User", "Error fetching user songs:", error);
      res.status(500).json({ message: "Failed to fetch songs" });
    }
  });

  app.post("/api/user/songs", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const workspaceId = req.headers["x-workspace-id"] as string;
      
      const validation = songCreateSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ message: "Invalid song data", errors: validation.error.errors });
      }
      
      const { songType, reservationId, prompt, musicStyle, voiceStyle, title } = validation.data;
      
      const song = await storage.createUserSong({
        userId,
        workspaceId: workspaceId || null,
        songType,
        status: "generating",
        musicStyle,
        voiceStyle,
        reservationId: reservationId || null,
      });
      
      generateSongInBackground(song.id, userId, workspaceId, songType, prompt, musicStyle, voiceStyle, title);
      
      res.json(song);
    } catch (error) {
      logger.error("User", "Error creating song:", error);
      res.status(500).json({ message: "Failed to create song" });
    }
  });

  app.post("/api/user/songs/:songId/share", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const songId = req.params.songId as string;
      
      const song = await storage.getUserSong(songId);
      if (!song || song.userId !== userId) {
        return res.status(404).json({ message: "Song not found" });
      }
      
      await storage.markSongShared(songId);
      res.json({ message: "Song marked as shared" });
    } catch (error) {
      logger.error("User", "Error marking song as shared:", error);
      res.status(500).json({ message: "Failed to mark song as shared" });
    }
  });

  app.delete("/api/user/songs/:songId", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const songId = req.params.songId as string;
      
      const song = await storage.getUserSong(songId);
      if (!song || song.userId !== userId) {
        return res.status(404).json({ message: "Song not found" });
      }
      
      await storage.deleteUserSong(songId);
      res.json({ message: "Song deleted successfully" });
    } catch (error) {
      logger.error("User", "Error deleting song:", error);
      res.status(500).json({ message: "Failed to delete song" });
    }
  });

  app.get("/api/user/worst-guests", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const workspaceId = req.headers["x-workspace-id"] as string;
      
      if (!workspaceId) {
        return res.json([]);
      }
      
      const worstGuests = await storage.getWorstGuests(workspaceId);
      res.json(worstGuests);
    } catch (error) {
      logger.error("User", "Error fetching worst guests:", error);
      res.status(500).json({ message: "Failed to fetch worst guests" });
    }
  });

  app.post("/api/user/summarize-guest-issues", isAuthenticated, async (req, res) => {
    try {
      const { reservationId, songType } = req.body;
      const workspaceId = req.headers["x-workspace-id"] as string;
      
      const openai = new OpenAI({
        apiKey: config.openai.apiKey,
        baseURL: config.openai.baseUrl,
      });
      
      let context = "";
      let suggestedTitle = "";
      
      if (songType === "str_journey") {
        const stats = workspaceId ? await storage.getWorkspaceStats(workspaceId) : null;
        const listingCount = stats?.listingCount || 1;
        const reservationCount = stats?.reservationCount || 0;
        const reviewCount = stats?.reviewCount || 0;
        
        context = `Short-term rental host with ${listingCount} properties, ${reservationCount} reservations, and ${reviewCount} reviews.`;
        suggestedTitle = "My STR Journey";
        
        const summaryResponse = await openai.chat.completions.create({
          model: "gpt-4.1-mini",
          messages: [
            {
              role: "system",
              content: `You are helping create a fun song about a short-term rental host's journey. 
                Write a brief, entertaining summary of their experience that can be used as song lyrics.
                Focus on the highs and lows: late night check-ins, 5-star reviews, messy guests, being your own boss.
                Keep it fun, upbeat, and under 150 words. Don't include specific names.`
            },
            {
              role: "user",
              content: context
            }
          ],
          max_completion_tokens: 300,
        });
        
        const summary = summaryResponse.choices[0]?.message?.content || context;
        res.json({ summary, suggestedTitle });
        
      } else if (songType === "worst_guest" && reservationId) {
        const reservation = await storage.getReservation(reservationId);
        if (!reservation) {
          return res.status(404).json({ message: "Reservation not found" });
        }
        
        const tags = await storage.getTagsByReservation(reservationId);
        const negativeTags = tags.filter(t => t.sentiment === "negative" || t.sentiment === "question");
        
        const fullName = reservation.guestName || "Mystery Guest";
        const nameParts = fullName.split(" ");
        const firstName = nameParts[0];
        const lastName = nameParts.length > 1 ? nameParts.slice(1).join(" ") : "";
        const issues = negativeTags.map(t => t.name).join(", ");
        
        const platform = reservation.platform || "Vacation";
        const checkOutDate = reservation.checkOutDate ? new Date(reservation.checkOutDate) : new Date();
        const monthYear = checkOutDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        
        const sanitizeText = (text: string): string => {
          let sanitized = text;
          if (lastName && lastName.length > 1) {
            const lastNameRegex = new RegExp(lastName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
            sanitized = sanitized.replace(lastNameRegex, '[Guest]');
          }
          if (fullName && fullName.length > 1) {
            const fullNameRegex = new RegExp(fullName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
            sanitized = sanitized.replace(fullNameRegex, firstName);
          }
          sanitized = sanitized.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[email]');
          sanitized = sanitized.replace(/(\+?\d{1,3}[-.\s]?)?(\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}/g, '[phone]');
          return sanitized;
        };
        
        let contextParts: string[] = [];
        
        contextParts.push(`Guest: ${firstName}`);
        contextParts.push(`Platform: ${platform}`);
        contextParts.push(`Stay: ${monthYear}`);
        
        if (reservation.guestLocation) {
          contextParts.push(`Guest's hometown: ${reservation.guestLocation}`);
        }
        
        if (issues) {
          contextParts.push(`\nIssues detected: ${issues}`);
        }
        
        const conversationHistory = reservation.conversationHistory as Array<{
          sender: string;
          message: string;
          timestamp: string;
        }> | null;
        
        if (conversationHistory && conversationHistory.length > 0) {
          const guestMessages = conversationHistory
            .filter(m => m.sender === "guest")
            .slice(-5)
            .map(m => sanitizeText(m.message))
            .join("\n");
          if (guestMessages) {
            contextParts.push(`\nConversation excerpts from guest:\n${guestMessages}`);
          }
        }
        
        if (reservation.publicReview) {
          const sanitizedReview = sanitizeText(reservation.publicReview);
          contextParts.push(`\nPublic review from guest: "${sanitizedReview}"`);
        }
        
        if (reservation.privateRemarks) {
          const sanitizedRemarks = sanitizeText(reservation.privateRemarks);
          contextParts.push(`\nPrivate remarks: "${sanitizedRemarks}"`);
        }
        
        context = contextParts.join("\n");
        suggestedTitle = `${firstName} ${platform} ${monthYear}`;
        
        const summaryResponse = await openai.chat.completions.create({
          model: "gpt-4.1-mini",
          messages: [
            {
              role: "system",
              content: `You are a songwriter creating fun, gentle roast lyrics about a vacation rental guest's stay.

CRITICAL RULES:
1. ONLY use the guest's FIRST NAME - never their last name or full name
2. Write lyrics that tell a STORY someone unfamiliar with the reservation would understand
3. Be playful and light-hearted, not mean-spirited
4. Include specific details from the stay to make it relatable (dates, platform, what happened)
5. Keep it under 200 words - this will be sung as a song
6. If the guest's home state, city, or town is mentioned in the context, you MAY reference it and playfully allude to sending them back there

The lyrics should:
- Start with a catchy hook mentioning the guest's first name
- Tell the story of what happened during their stay
- Include 2-3 specific funny or memorable moments
- If their hometown/state is known, include a line about "sending them back to [location]" or similar
- End with a memorable conclusion about the experience

Format as song lyrics with verses and a chorus. Use [Verse 1], [Chorus], [Verse 2] etc.`
            },
            {
              role: "user",
              content: context
            }
          ],
          max_completion_tokens: 500,
        });
        
        const summary = summaryResponse.choices[0]?.message?.content || `${firstName} was quite the character!`;
        res.json({ summary, suggestedTitle, firstName, platform, monthYear });
      } else {
        res.status(400).json({ message: "Invalid song type or missing reservation" });
      }
    } catch (error) {
      logger.error("User", "Error summarizing guest issues:", error);
      res.status(500).json({ message: "Failed to summarize guest issues" });
    }
  });

  app.get("/api/songs/:songId", async (req, res) => {
    try {
      const songId = req.params.songId as string;
      const song = await storage.getUserSong(songId);
      
      if (!song) {
        return res.status(404).json({ message: "Song not found" });
      }
      
      res.json({
        id: song.id,
        title: song.title,
        lyrics: song.lyrics,
        audioUrl: song.audioUrl,
        status: song.status,
        songType: song.songType,
        createdAt: song.createdAt,
      });
    } catch (error) {
      logger.error("User", "Error fetching song:", error);
      res.status(500).json({ message: "Failed to fetch song" });
    }
  });

  app.get("/api/user/default-workspace", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const user = await storage.getUser(userId);
      res.json({ defaultWorkspaceId: user?.defaultWorkspaceId || null });
    } catch (error) {
      logger.error("User", "Error fetching default workspace:", error);
      res.status(500).json({ message: "Failed to fetch default workspace" });
    }
  });

  app.put("/api/user/default-workspace", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const { workspaceId } = req.body;
      
      if (!workspaceId) {
        return res.status(400).json({ message: "workspaceId is required" });
      }

      const member = await storage.getWorkspaceMember(workspaceId, userId);
      if (!member) {
        return res.status(403).json({ message: "Not a member of this workspace" });
      }

      const updated = await storage.setDefaultWorkspace(userId, workspaceId);
      if (!updated) {
        return res.status(404).json({ message: "User not found" });
      }
      
      res.json({ message: "Default workspace updated", defaultWorkspaceId: workspaceId });
    } catch (error) {
      logger.error("User", "Error setting default workspace:", error);
      res.status(500).json({ message: "Failed to set default workspace" });
    }
  });
}
