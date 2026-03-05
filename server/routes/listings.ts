import type { Express } from "express";
import { IStorage } from "../storage";
import { isAuthenticated } from "../replit_integrations/auth";
import { config } from "../config";
import { logger } from "../logger";
import { openai, getConfiguredAIModel, calculateAICost } from "./ai-helpers";
import { getUserId, getWorkspaceId, validateWorkspaceMembership, getParamId } from "./helpers";
import {
  insertListingSchema,
  type Listing,
  type Tag,
  AI_MODELS,
  type AIModelId,
} from "@shared/schema";
import { z } from "zod";
import {
  getValidAccessToken,
  hospitableApiRequest,
} from "../services/hospitable";
import { autoSyncTagsToNotion } from "../services/notion";

async function sendSlackSentimentAlert(
  storage: IStorage,
  workspaceId: string,
  reservation: { id: string; guestName: string | null; checkInDate: Date | string | null; checkOutDate: Date | string | null },
  listing: { name: string; internalName: string | null },
  scores: { overall: number | null; publicReview: number | null; privateRemarks: number | null; conversation: number | null; summary: string | null }
): Promise<void> {
  try {
    const workspace = await storage.getWorkspace(workspaceId);
    if (!workspace?.slackWebhookUrl) return;

    const overallScore = scores.overall ?? 0;
    const scoreEmoji = overallScore >= 4 ? ":star:" : overallScore >= 3 ? ":large_yellow_circle:" : ":red_circle:";
    const propertyName = listing.internalName || listing.name;
    const checkIn = reservation.checkInDate ? new Date(reservation.checkInDate).toLocaleDateString() : "N/A";
    const checkOut = reservation.checkOutDate ? new Date(reservation.checkOutDate).toLocaleDateString() : "N/A";

    const scoreFields = [];
    if (scores.overall !== null) scoreFields.push({ title: "Overall", value: `${scores.overall}/5`, short: true });
    if (scores.publicReview !== null) scoreFields.push({ title: "Public Review", value: `${scores.publicReview}/5`, short: true });
    if (scores.privateRemarks !== null) scoreFields.push({ title: "Private Remarks", value: `${scores.privateRemarks}/5`, short: true });
    if (scores.conversation !== null) scoreFields.push({ title: "Conversation", value: `${scores.conversation}/5`, short: true });

    const payload = {
      text: `${scoreEmoji} New Sentiment Score for *${propertyName}*`,
      blocks: [
        {
          type: "header",
          text: { type: "plain_text", text: `${overallScore >= 4 ? "\u2B50" : overallScore >= 3 ? "\uD83D\uDFE1" : "\uD83D\uDD34"} New Sentiment Score: ${scores.overall ?? "N/A"}/5` }
        },
        {
          type: "section",
          fields: [
            { type: "mrkdwn", text: `*Property:*\n${propertyName}` },
            { type: "mrkdwn", text: `*Guest:*\n${reservation.guestName || "Unknown"}` },
            { type: "mrkdwn", text: `*Check-in:*\n${checkIn}` },
            { type: "mrkdwn", text: `*Check-out:*\n${checkOut}` },
          ]
        },
        {
          type: "section",
          fields: scoreFields.map(f => ({ type: "mrkdwn", text: `*${f.title}:*\n${f.value}` }))
        },
        ...(scores.summary ? [{
          type: "section",
          text: { type: "mrkdwn", text: `*Summary:*\n${scores.summary}` }
        }] : []),
      ],
    };

    await fetch(workspace.slackWebhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    logger.error('Slack', 'Failed to send sentiment alert:', err);
  }
}

async function sendSlackBulkSentimentSummary(
  storage: IStorage,
  workspaceId: string,
  listing: { name: string; internalName: string | null },
  scoredResults: Array<{ guestName: string | null; overall: number | null; summary: string | null }>
): Promise<void> {
  try {
    const workspace = await storage.getWorkspace(workspaceId);
    if (!workspace?.slackWebhookUrl) return;

    const propertyName = listing.internalName || listing.name;
    const total = scoredResults.length;
    const avgScore = scoredResults.reduce((sum, r) => sum + (r.overall ?? 0), 0) / total;
    const highScores = scoredResults.filter(r => (r.overall ?? 0) >= 4).length;
    const midScores = scoredResults.filter(r => (r.overall ?? 0) >= 3 && (r.overall ?? 0) < 4).length;
    const lowScores = scoredResults.filter(r => (r.overall ?? 0) < 3).length;

    const notableGuests = scoredResults
      .filter(r => (r.overall ?? 5) < 3)
      .slice(0, 5)
      .map(r => `- ${r.guestName || "Unknown"}: ${r.overall}/5 — ${r.summary || "No summary"}`)
      .join("\n");

    const payload = {
      text: `Bulk Sentiment Analysis Complete for *${propertyName}*`,
      blocks: [
        {
          type: "header",
          text: { type: "plain_text", text: `Sentiment Analysis Complete: ${propertyName}` }
        },
        {
          type: "section",
          fields: [
            { type: "mrkdwn", text: `*Reservations Scored:*\n${total}` },
            { type: "mrkdwn", text: `*Average Score:*\n${avgScore.toFixed(1)}/5` },
            { type: "mrkdwn", text: `*\u2B50 Positive (4-5):*\n${highScores}` },
            { type: "mrkdwn", text: `*\uD83D\uDFE1 Neutral (3-3.9):*\n${midScores}` },
          ]
        },
        ...(lowScores > 0 ? [{
          type: "section",
          text: { type: "mrkdwn", text: `*\uD83D\uDD34 Needs Attention (< 3):* ${lowScores}\n${notableGuests || ""}` }
        }] : []),
      ],
    };

    await fetch(workspace.slackWebhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    logger.error('Slack', 'Failed to send bulk sentiment summary:', err);
  }
}

async function runBackgroundSentimentAnalysis(storage: IStorage, listingId: string, userId: string): Promise<void> {
  try {
    const listing = await storage.getListing(listingId);
    if (!listing) {
      logger.info('Analysis', `Listing ${listingId} not found`);
      return;
    }
    
    if (listing.userId !== userId) {
      logger.info('Analysis', `Authorization failed - user ${userId} does not own listing ${listingId}`);
      return;
    }

    const allReservations = await storage.getReservationsByListing(listingId);
    const reservationsToAnalyze = allReservations.filter(r => {
      if (!r.tagsProcessedAt) return false;
      
      const score = r.aiSentimentScore;
      const hasValidScore = score !== null && score !== undefined && score !== '' && !isNaN(parseFloat(score.toString()));
      
      return !hasValidScore;
    });

    if (reservationsToAnalyze.length === 0) {
      logger.info('Analysis', `No reservations need sentiment analysis for listing ${listingId}`);
      return;
    }

    logger.info('Analysis', `Analyzing sentiment for ${reservationsToAnalyze.length} reservations`);

    const BULK_THRESHOLD = 3;
    const isBulkOperation = reservationsToAnalyze.length > BULK_THRESHOLD;
    const bulkResults: Array<{ guestName: string | null; overall: number | null; summary: string | null }> = [];

    if (isBulkOperation) {
      logger.info('Analysis', `Bulk operation detected (${reservationsToAnalyze.length} reservations) — will send summary notification`);
    }

    const zeroInteractionReservations: typeof reservationsToAnalyze = [];
    const reservationsForAI: typeof reservationsToAnalyze = [];
    
    for (const r of reservationsToAnalyze) {
      const hasReview = !!r.publicReview;
      const hasRemarks = !!r.privateRemarks;
      const guestMessages = Array.isArray(r.conversationHistory) 
        ? r.conversationHistory.filter((m: any) => m.sender === 'guest')
        : [];
      const hasGuestMessages = guestMessages.length > 0;
      
      if (!hasReview && !hasRemarks && !hasGuestMessages) {
        zeroInteractionReservations.push(r);
      } else {
        reservationsForAI.push(r);
      }
    }

    if (zeroInteractionReservations.length > 0) {
      logger.info('Analysis', `Auto-scoring ${zeroInteractionReservations.length} zero-interaction reservations as 4.0`);
      for (const reservation of zeroInteractionReservations) {
        const autoSummary = "Guest had no interaction — no review, no private remarks, and no messages. Default score of 4 assigned.";
        await storage.updateReservation(reservation.id, {
          aiSentimentScore: "4",
          aiPublicReviewScore: null,
          aiPrivateRemarksScore: null,
          aiConversationScore: null,
          aiGuestSummary: autoSummary,
          reviewAnalyzedAt: new Date(),
        });

        if (isBulkOperation) {
          bulkResults.push({ guestName: reservation.guestName, overall: 4, summary: autoSummary });
        } else if (listing.workspaceId) {
          sendSlackSentimentAlert(
            storage,
            listing.workspaceId,
            reservation,
            { name: listing.name, internalName: listing.internalName },
            {
              overall: 4,
              publicReview: null,
              privateRemarks: null,
              conversation: null,
              summary: autoSummary,
            }
          );
        }
      }
    }

    if (reservationsForAI.length === 0) {
      logger.info('Analysis', `All reservations were zero-interaction, no AI analysis needed for listing ${listingId}`);
      if (isBulkOperation && bulkResults.length > 0 && listing.workspaceId) {
        await sendSlackBulkSentimentSummary(
          storage,
          listing.workspaceId,
          { name: listing.name, internalName: listing.internalName },
          bulkResults
        );
      }
      return;
    }

    logger.info('Analysis', `Sending ${reservationsForAI.length} reservations to AI for sentiment analysis`);

    const sentimentPrompt = await storage.getPromptByName("sentiment_analysis") || 
                         await storage.getPromptByCategory("sentiment_analysis");
    
    const batchSize = 10;
    const parallelLimit = 3;
    const batches: typeof reservationsForAI[] = [];
    for (let i = 0; i < reservationsForAI.length; i += batchSize) {
      batches.push(reservationsForAI.slice(i, i + batchSize));
    }

    logger.info('Analysis', `Processing ${batches.length} batches (${parallelLimit} in parallel)`);

    const processBatch = async (batch: typeof reservationsForAI, batchIndex: number) => {
      const batchResults: typeof bulkResults = [];
      
      const reservationsContext = await Promise.all(batch.map(async (res) => {
        const tags = await storage.getTagsByReservation(res.id);
        const guestMessages = Array.isArray(res.conversationHistory) 
          ? res.conversationHistory.filter((m: any) => m.sender === 'guest').map((m: any) => m.message)
          : [];
        
        return {
          id: res.id,
          guestName: res.guestName,
          checkIn: res.checkInDate,
          checkOut: res.checkOutDate,
          publicReview: res.publicReview,
          privateRemarks: res.privateRemarks,
          guestMessages,
          tags: tags.map(t => ({ name: t.name, sentiment: t.sentiment, summary: t.summary })),
        };
      }));

      const reservationsFormatted = reservationsContext.map((res, idx) => `
--- Reservation ${idx + 1} (ID: ${res.id}) ---
Guest: ${res.guestName}
Stay: ${res.checkIn ? new Date(res.checkIn).toLocaleDateString() : 'Unknown'} - ${res.checkOut ? new Date(res.checkOut).toLocaleDateString() : 'Unknown'}
Public Review: ${res.publicReview || 'No review'}
Private Remarks: ${res.privateRemarks || 'None'}
Guest Messages: ${res.guestMessages.length > 0 ? res.guestMessages.join(' | ') : 'No messages'}
`).join('\n');

      const tagContextFormatted = reservationsContext.map(res => `
Reservation ${res.id} Tags:
${res.tags.length > 0 ? res.tags.map(t => `- ${t.name} (${t.sentiment}): ${t.summary || 'No summary'}`).join('\n') : 'No tags extracted'}
`).join('\n');

      let analysisPrompt: string;
      if (sentimentPrompt?.promptTemplate) {
        analysisPrompt = sentimentPrompt.promptTemplate
          .replace('{{reservationsContext}}', reservationsFormatted)
          .replace('{{tagContext}}', tagContextFormatted);
      } else {
        analysisPrompt = `You are an expert hospitality analyst. Calculate sentiment scores for these reservations.

RESERVATIONS TO ANALYZE:
${reservationsFormatted}

TAG CONTEXT (previously extracted insights):
${tagContextFormatted}

For each reservation, provide a JSON response:
{
  "reservations": [
    {
      "reservationId": "<reservation id>",
      "sentimentScores": {
        "overall": <0-5 with 0.1 increments>,
        "publicReview": <0-5 or null if no review>,
        "privateRemarks": <0-5 or null if no remarks>,
        "conversation": <0-5 based on message tone>,
        "summary": "<1-2 sentence summary of guest experience>"
      }
    }
  ]
}

SCORING GUIDE:
- 0 = Extremely Negative (serious complaints, refund demands)
- 1 = Very Negative (major issues, unhappy guest)
- 2 = Negative (notable problems, disappointment)
- 3 = Neutral (mixed or no strong sentiment)
- 4 = Positive (satisfied, good experience)
- 5 = Very Positive (enthusiastic praise, raving reviews)

IMPORTANT CONTEXT ABOUT MISSING DATA:
- Many guests are conflict-avoidant. If they had complaints, they often just don't leave a review.
- A guest who had conversations but left no review may have been dissatisfied — analyze the conversation tone carefully for subtle signs of disappointment.
- If a guest has conversation messages but no review, weigh the conversation sentiment heavily in the overall score.
- Private remarks from the host can reveal issues the guest experienced even if the review is positive or missing.

RULES:
- Include EVERY reservation ID in response
- Use tag context to inform scoring when available
- overall score should reflect holistic view across all data sources
- Set scores to null if that data type is not available`;
      }

      try {
        const { modelId } = await getConfiguredAIModel(sentimentPrompt?.modelId, 'sentiment');
        
        const response = await openai.chat.completions.create({
          model: modelId,
          messages: [{ role: "user", content: analysisPrompt }],
          response_format: { type: "json_object" },
          temperature: 0.5,
        });

        const content = response.choices[0]?.message?.content;
        if (content) {
          const aiResult = JSON.parse(content);
          
          for (const resResult of aiResult.reservations || []) {
            const reservation = batch.find(r => r.id === resResult.reservationId);
            if (!reservation) continue;

            if (resResult.sentimentScores) {
              const scores = resResult.sentimentScores;
              await storage.updateReservation(reservation.id, {
                aiSentimentScore: scores.overall?.toString() || null,
                aiPublicReviewScore: scores.publicReview?.toString() || null,
                aiPrivateRemarksScore: scores.privateRemarks?.toString() || null,
                aiConversationScore: scores.conversation?.toString() || null,
                aiGuestSummary: scores.summary || null,
                reviewAnalyzedAt: new Date(),
              });

              if (isBulkOperation) {
                batchResults.push({
                  guestName: reservation.guestName,
                  overall: scores.overall ?? null,
                  summary: scores.summary ?? null,
                });
              } else if (listing.workspaceId) {
                sendSlackSentimentAlert(
                  storage,
                  listing.workspaceId,
                  reservation,
                  { name: listing.name, internalName: listing.internalName },
                  {
                    overall: scores.overall ?? null,
                    publicReview: scores.publicReview ?? null,
                    privateRemarks: scores.privateRemarks ?? null,
                    conversation: scores.conversation ?? null,
                    summary: scores.summary ?? null,
                  }
                );
              }
            }
          }
        }
        logger.info('Analysis', `Batch ${batchIndex + 1}/${batches.length} complete`);
      } catch (batchError) {
        logger.error('Analysis', `Error processing batch ${batchIndex + 1}:`, batchError);
      }
      
      return batchResults;
    };

    for (let i = 0; i < batches.length; i += parallelLimit) {
      const parallelBatches = batches.slice(i, i + parallelLimit);
      const results = await Promise.all(
        parallelBatches.map((batch, idx) => processBatch(batch, i + idx))
      );
      bulkResults.push(...results.flat());
    }

    if (isBulkOperation && bulkResults.length > 0 && listing.workspaceId) {
      logger.info('Analysis', `Sending bulk Slack summary for ${bulkResults.length} scored reservations`);
      await sendSlackBulkSentimentSummary(
        storage,
        listing.workspaceId,
        { name: listing.name, internalName: listing.internalName },
        bulkResults
      );
    }

    logger.info('Analysis', `Completed sentiment analysis for listing ${listingId}`);
  } catch (error) {
    logger.error('Analysis', 'Background sentiment error:', error);
  }
}

async function generateThemeSummary(storage: IStorage, themeId: string, userId: string, themeTags: Tag[]): Promise<void> {
  try {
    const theme = await storage.getTheme(themeId);
    if (!theme) return;
    
    const themeSummaryPrompt = await storage.getPromptByName("theme_summary");
    
    const sentimentCounts = {
      positive: themeTags.filter(t => t.sentiment === 'positive').length,
      negative: themeTags.filter(t => t.sentiment === 'negative').length,
      neutral: themeTags.filter(t => t.sentiment === 'neutral').length,
      question: themeTags.filter(t => t.sentiment === 'question').length,
    };
    
    const tagContext = themeTags.map(t => 
      `- ${t.name} (${t.sentiment}): ${t.summary || 'No summary'}`
    ).join('\n');
    
    let promptTemplate = themeSummaryPrompt?.promptTemplate || `You are an expert short-term rental consultant. Generate a natural language summary (2-3 sentences) that explains the breadth and nature of guest feedback for this theme.

Theme: {{themeName}}
Total Tags: {{totalTags}}
Sentiment Breakdown: {{sentimentCounts}}

Tags in this theme:
{{tagContext}}

Write a concise summary that:
1. Captures the main topics guests mention related to this theme
2. Highlights whether feedback is mostly positive, negative, or mixed
3. Gives the host a quick understanding of what guests commonly say

Response should be 2-3 sentences only, written in third person perspective about "guests".`;
    
    const analysisPrompt = promptTemplate
      .replace('{{themeName}}', theme.name)
      .replace('{{totalTags}}', String(themeTags.length))
      .replace('{{sentimentCounts}}', JSON.stringify(sentimentCounts))
      .replace('{{tagContext}}', tagContext);
    
    const model = themeSummaryPrompt?.modelId || "gpt-4.1-mini";
    
    const response = await openai.chat.completions.create({
      model,
      messages: [
        { role: "system", content: "You are an expert short-term rental consultant. Respond only with the summary text, no additional formatting." },
        { role: "user", content: analysisPrompt }
      ],
      max_tokens: 300,
      temperature: 0.7,
    });
    
    const summary = response.choices[0]?.message?.content?.trim() || '';
    
    await storage.updateTheme(themeId, {
      summary,
      summaryTagCount: themeTags.length,
    });
    
    const inputTokens = response.usage?.prompt_tokens || 0;
    const outputTokens = response.usage?.completion_tokens || 0;
    await storage.createAiUsageLog({
      userId,
      label: "theme_summary",
      model,
      inputTokens,
      outputTokens,
      estimatedCost: (inputTokens * 0.00015 + outputTokens * 0.0006) / 1000,
    });
    
    logger.info('Analysis', `Generated summary for theme "${theme.name}"`);
  } catch (error) {
    logger.error('Analysis', 'Failed to generate theme summary:', error);
  }
}

const unprocessedCountSchema = z.object({
  listingIds: z.array(z.string()).min(1, "At least one listing ID is required"),
});

export function registerListingRoutes(app: Express, storage: IStorage): void {
  // =====================
  // Listings
  // =====================

  app.post("/api/listings/import", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const { dataSourceId, properties, syncDays = 90 } = req.body;
      
      logger.info('Listings', `Starting import for user ${userId}, dataSourceId: ${dataSourceId}, properties count: ${properties?.length}`);
      
      if (!dataSourceId || !properties || !Array.isArray(properties)) {
        logger.info('Listings', `Invalid request: dataSourceId=${dataSourceId}, properties=${typeof properties}`);
        return res.status(400).json({ message: "dataSourceId and properties array are required" });
      }
      
      const dataSource = await storage.getDataSource(dataSourceId);
      if (!dataSource) {
        logger.info('Listings', `Data source not found: ${dataSourceId}`);
        return res.status(404).json({ message: "Data source not found. Please reconnect your Hospitable account." });
      }
      
      if (dataSource.userId !== userId) {
        logger.info('Listings', `User mismatch: dataSource.userId=${dataSource.userId}, userId=${userId}`);
        return res.status(403).json({ message: "You do not have permission to access this data source." });
      }
      
      if (!dataSource.isConnected) {
        logger.info('Listings', `Data source not connected: ${dataSourceId}`);
        return res.status(400).json({ message: "Hospitable is not connected. Please reconnect your account in Data Sources." });
      }
      
      if (!dataSource.accessToken) {
        logger.info('Listings', `No access token for data source: ${dataSourceId}`);
        return res.status(400).json({ message: "Hospitable connection expired. Please reconnect your account in Data Sources." });
      }
      
      const workspaceId = dataSource.workspaceId;
      
      const importedListings = [];
      const updatedListings = [];
      
      const existingListings = await storage.getListingsByDataSource(dataSourceId);
      
      const { accessToken: validToken, error: tokenError } = await getValidAccessToken(dataSourceId);
      if (!validToken) {
        logger.info('Listings', `Failed to get valid access token: ${tokenError}`);
        return res.status(401).json({ 
          message: tokenError || "Unable to authenticate with Hospitable",
          details: "Please reconnect your Hospitable account in Data Sources."
        });
      }
      logger.info('Listings', `Validated access token for data source ${dataSourceId}`);
      
      for (const property of properties) {
        let propertyDetails: any = null;
        try {
          const { data: rawDetails, error: detailsError } = await hospitableApiRequest(
            dataSourceId,
            `/properties/${property.id}?include=details`
          );
          if (rawDetails && !detailsError) {
            propertyDetails = rawDetails?.data || rawDetails;
          } else if (detailsError) {
            logger.error('Sync', `Error fetching details for ${property.name}:`, detailsError);
          }
        } catch (err) {
          logger.error('Sync', `Error fetching details for ${property.name}:`, err);
        }
        
        const existing = existingListings.find(l => l.externalId === property.id);
        
        const platformInfo = property.listings?.[0];
        const platform = platformInfo?.platform || "unknown";
        
        const platformIds: { [key: string]: string | undefined } = {};
        let publicListingTitle: string | null = null;
        if (Array.isArray(property.listings)) {
          logger.info('Sync', `Processing ${property.listings.length} listings for ${property.name}:`, 
            JSON.stringify(property.listings.map((l: any) => ({ 
              platform: l.platform, 
              platform_id: l.platform_id, 
              title: l.title, 
              name: l.name,
              keys: Object.keys(l)
            })), null, 2));
          
          for (const listing of property.listings) {
            if (listing.platform && listing.platform_id) {
              const normalizedPlatform = listing.platform === "booking.com" 
                ? "bookingCom" 
                : listing.platform;
              platformIds[normalizedPlatform] = String(listing.platform_id);
            }
            
            const listingTitle = listing.title || listing.name || listing.headline || listing.public_name;
            if (listing.platform === "airbnb" && listingTitle) {
              publicListingTitle = listingTitle;
              logger.info('Sync', `Found Airbnb public title for ${property.name}: "${publicListingTitle}"`);
            } else if (!publicListingTitle && listingTitle) {
              publicListingTitle = listingTitle;
            }
          }
        }
        
        logger.info('Sync', `Headline selection for ${property.name}: publicListingTitle="${publicListingTitle}", property.headline="${property.headline}", property.public_name="${property.public_name}"`);
        
        let publicUrl = "";
        if (platform === "airbnb" && platformInfo?.platform_id) {
          publicUrl = `https://www.airbnb.com/rooms/${platformInfo.platform_id}`;
        } else if (platform === "vrbo" && platformInfo?.platform_id) {
          publicUrl = `https://www.vrbo.com/${platformInfo.platform_id}`;
        }
        
        const addressParts = [
          property.address?.street,
          property.address?.city,
          property.address?.state,
          property.address?.country,
        ].filter(Boolean);
        
        let images: string[] = [];
        try {
          let nextEndpoint: string | null = `/properties/${property.id}/images`;
          
          while (nextEndpoint) {
            const { data: imagesData, error: imagesError } = await hospitableApiRequest(
              dataSourceId,
              nextEndpoint
            );
            
            if (imagesData && !imagesError) {
              logger.info('Sync', `Raw images response for ${property.public_name || property.name}:`, JSON.stringify(imagesData, null, 2));
              
              let imageItems: any[] = [];
              if (Array.isArray(imagesData.data)) {
                imageItems = imagesData.data;
              } else if (Array.isArray(imagesData)) {
                imageItems = imagesData;
              } else if (imagesData.images && Array.isArray(imagesData.images)) {
                imageItems = imagesData.images;
              }
              
              const pageImages = imageItems.map((img: any) => {
                return img.url || img.original_url || img.large_url || img.original || img.large || img.medium || img.thumbnail || img.src;
              }).filter(Boolean);
              
              logger.info('Sync', `Extracted ${pageImages.length} images from page for ${property.public_name || property.name}:`, pageImages);
              images.push(...pageImages);
              
              const nextUrl = imagesData.links?.next || imagesData.meta?.next || null;
              if (nextUrl) {
                nextEndpoint = nextUrl.replace('https://public.api.hospitable.com/v2', '');
              } else {
                nextEndpoint = null;
              }
            } else {
              logger.info('Sync', `Failed to fetch images for property ${property.id}:`, imagesError);
              nextEndpoint = null;
            }
          }
        } catch (imgError) {
          logger.error('Sync', `Error fetching images for property ${property.id}:`, imgError);
        }
        
        logger.info('Sync', `Total images synced for ${property.public_name || property.name}: ${images.length}`);
        
        if (images.length === 0 && property.picture) {
          logger.info('Sync', `Using fallback picture for ${property.public_name || property.name}`);
          images = [property.picture];
        }
        
        const amenities = property.amenities?.map((a: any) => typeof a === 'string' ? a : a.name).filter(Boolean) || [];
        
        if (existing) {
          const updated = await storage.updateListing(existing.id, {
            name: property.public_name || property.name,
            internalName: property.name || null,
            imageUrl: property.picture,
            publicUrl,
            address: addressParts.join(", "),
            propertyType: property.property_type,
            bedrooms: property.capacity?.bedrooms || 0,
            bathrooms: property.capacity?.bathrooms || 0,
            headline: publicListingTitle || property.headline || property.public_name || property.name,
            description: property.description,
            summary: propertyDetails?.summary || property.summary || null,
            spaceOverview: propertyDetails?.details?.space_overview || property.details?.space_overview || null,
            guestAccess: propertyDetails?.details?.guest_access || property.details?.guest_access || null,
            houseManual: propertyDetails?.details?.house_manual || property.details?.house_manual || null,
            otherDetails: propertyDetails?.details?.other_details || property.details?.other_details || null,
            additionalRules: propertyDetails?.details?.additional_rules || property.details?.additional_rules || null,
            neighborhoodDescription: propertyDetails?.details?.neighborhood_description || property.details?.neighborhood_description || null,
            gettingAround: propertyDetails?.details?.getting_around || property.details?.getting_around || null,
            wifiName: propertyDetails?.details?.wifi_name || property.details?.wifi_name || null,
            amenities,
            images,
            houseRules: property.house_rules || null,
            ownerName: property.owner?.name,
            accountEmail: property.owner?.email,
            lastSyncedAt: new Date(),
            syncDays,
            isActive: true,
            platformIds: Object.keys(platformIds).length > 0 ? platformIds : null,
          });
          updatedListings.push(updated);
        } else {
          const listing = await storage.createListing({
            dataSourceId,
            userId,
            workspaceId: workspaceId || undefined,
            externalId: property.id,
            name: property.public_name || property.name,
            internalName: property.name || null,
            imageUrl: property.picture,
            publicUrl,
            address: addressParts.join(", "),
            propertyType: property.property_type,
            bedrooms: property.capacity?.bedrooms || 0,
            bathrooms: property.capacity?.bathrooms || 0,
            headline: publicListingTitle || property.headline || property.public_name || property.name,
            description: property.description,
            summary: propertyDetails?.summary || property.summary || null,
            spaceOverview: propertyDetails?.details?.space_overview || property.details?.space_overview || null,
            guestAccess: propertyDetails?.details?.guest_access || property.details?.guest_access || null,
            houseManual: propertyDetails?.details?.house_manual || property.details?.house_manual || null,
            otherDetails: propertyDetails?.details?.other_details || property.details?.other_details || null,
            additionalRules: propertyDetails?.details?.additional_rules || property.details?.additional_rules || null,
            neighborhoodDescription: propertyDetails?.details?.neighborhood_description || property.details?.neighborhood_description || null,
            gettingAround: propertyDetails?.details?.getting_around || property.details?.getting_around || null,
            wifiName: propertyDetails?.details?.wifi_name || property.details?.wifi_name || null,
            amenities,
            images,
            houseRules: property.house_rules || null,
            ownerName: property.owner?.name,
            accountEmail: property.owner?.email,
            lastSyncedAt: new Date(),
            syncDays,
            isActive: true,
            autoAnalysisEnabled: false,
            platformIds: Object.keys(platformIds).length > 0 ? platformIds : null,
          });
          importedListings.push(listing);
        }
      }
      
      const selectedExternalIds = new Set(properties.map((p: any) => p.id));
      for (const existing of existingListings) {
        if (!selectedExternalIds.has(existing.externalId)) {
          await storage.updateListing(existing.id, { isActive: false });
        }
      }
      
      await storage.updateDataSource(dataSourceId, { lastSyncAt: new Date() });
      
      res.status(201).json({ 
        imported: importedListings.length,
        updated: updatedListings.length,
        listings: [...importedListings, ...updatedListings]
      });
    } catch (error: any) {
      logger.error('Listings', 'Error importing listings:', error);
      const errorMessage = error?.message || "Unknown error occurred";
      const errorDetails = error?.response?.data?.message || error?.response?.statusText || "";
      res.status(500).json({ 
        message: `Failed to import listings: ${errorMessage}`,
        details: errorDetails || undefined
      });
    }
  });

  app.post("/api/listings/:id/sync-reservations", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const listing = await storage.getListing(getParamId(req.params.id));
      
      if (!listing || listing.userId !== userId) {
        return res.status(404).json({ message: "Listing not found" });
      }

      const dataSource = await storage.getDataSource(listing.dataSourceId);
      if (!dataSource || !dataSource.accessToken) {
        return res.status(400).json({ message: "Data source not connected" });
      }

      const syncDays = listing.syncDays || 90;
      const endDate = new Date().toISOString().split('T')[0];
      const startDate = new Date(Date.now() - syncDays * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      let allReservations: any[] = [];
      let reservationsPage = 1;
      let hasMoreReservations = true;
      const MAX_PAGES = 20;

      while (hasMoreReservations && reservationsPage <= MAX_PAGES) {
        const searchParams = new URLSearchParams({
          'start_date': startDate,
          'end_date': endDate,
          'include': 'guest,review',
          'page': String(reservationsPage),
          'per_page': '50'
        });
        const reservationsUrl = `https://public.api.hospitable.com/v2/reservations?${searchParams.toString()}&properties[]=${encodeURIComponent(listing.externalId || '')}`;
        
        const reservationsResponse = await fetch(reservationsUrl, {
          headers: {
            "Authorization": `Bearer ${dataSource.accessToken}`,
            "Content-Type": "application/json",
          },
        });

        if (reservationsResponse.ok) {
          const reservationsData = await reservationsResponse.json();
          const pageReservations = reservationsData.data || [];
          
          const included = reservationsData.included || [];
          const guestMap = new Map<string, any>();
          included.forEach((item: any) => {
            if (item.type === 'guest' && item.id) {
              guestMap.set(item.id, item.attributes || item);
            }
          });
          
          pageReservations.forEach((res: any) => {
            if (!res.guest && res.relationships?.guest?.data?.id) {
              res.guest = guestMap.get(res.relationships.guest.data.id);
            }
          });
          
          if (pageReservations.length === 0) {
            hasMoreReservations = false;
            break;
          }
          
          allReservations.push(...pageReservations);
          
          const meta = reservationsData.meta;
          if (meta && meta.current_page >= meta.last_page) {
            hasMoreReservations = false;
          } else if (pageReservations.length < 50) {
            hasMoreReservations = false;
          } else {
            reservationsPage++;
          }
        } else {
          hasMoreReservations = false;
        }
      }

      logger.info('Sync', 'Reviews will be extracted directly from reservation data (included via API)');

      const syncedReservations = [];
      const updatedReservations = [];
      
      const fetchMessages = async (resId: string): Promise<{ resId: string; messages: any[] }> => {
        try {
          const messagesResponse = await fetch(
            `https://public.api.hospitable.com/v2/reservations/${resId}/messages`,
            {
              headers: {
                "Authorization": `Bearer ${dataSource.accessToken}`,
                "Content-Type": "application/json",
              },
            }
          );
          
          if (messagesResponse.ok) {
            const messagesData = await messagesResponse.json();
            const messages = messagesData.data || [];
            return {
              resId,
              messages: messages.map((msg: any) => ({
                id: msg.id,
                sender: msg.sender_type === 'guest' ? 'guest' : 'host',
                message: msg.body || "",
                timestamp: msg.created_at || msg.sent_at,
              }))
            };
          }
        } catch (msgError) {
          logger.info('Sync', `Could not fetch messages for reservation ${resId}`);
        }
        return { resId, messages: [] };
      };

      const messagesBatchSize = 10;
      const messagesMap = new Map<string, any[]>();
      
      for (let i = 0; i < allReservations.length; i += messagesBatchSize) {
        const batch = allReservations.slice(i, i + messagesBatchSize);
        const results = await Promise.all(batch.map(res => fetchMessages(res.id)));
        results.forEach(({ resId, messages }) => messagesMap.set(resId, messages));
      }
      logger.info('Sync', `Fetched messages for ${allReservations.length} reservations in parallel batches`);

      const existingReservations = await storage.getReservationsByListing(listing.id);
      const existingByExternalId = new Map(existingReservations.map(r => [r.externalId, r]));
      logger.info('Sync', `Found ${existingReservations.length} existing reservations for listing`);

      const reservationUpdates: { existing: any; data: any }[] = [];
      const reservationCreates: any[] = [];

      for (const res of allReservations) {
        const existing = existingByExternalId.get(res.id);
        const conversationHistory = messagesMap.get(res.id) || [];
        
        const review = res.review || null;
        
        const detailedRatings = review?.private?.detailed_ratings;
        const categoryRatingsData = detailedRatings 
          ? Object.fromEntries(detailedRatings.map((r: any) => [r.type, r.rating]))
          : review?.category_ratings || null;
        
        if (review) {
          logger.info('Sync', `Review found for reservation ${res.id}: rating=${review.public?.rating || review.rating}, hasPublicReview=${!!(review.public?.review || review.public_review)}`);
        }
        
        const reservationData = {
          listingId: listing.id,
          userId,
          workspaceId: listing.workspaceId || undefined,
          externalId: res.id,
          confirmationCode: res.code || res.confirmation_code || res.attributes?.code || null,
          guestName: res.guest?.full_name || (res.guest?.first_name && res.guest?.last_name ? `${res.guest.first_name} ${res.guest.last_name}` : res.guest?.first_name) || "Guest",
          guestEmail: res.guest?.email || null,
          guestProfilePicture: res.guest?.profile_picture || null,
          platform: res.platform || "Airbnb",
          checkInDate: res.check_in ? new Date(res.check_in) : null,
          checkOutDate: res.check_out ? new Date(res.check_out) : null,
          status: res.status || "completed",
          guestRating: review?.public?.rating || review?.rating || review?.overall_rating || null,
          publicReview: review?.public?.review || review?.public_review || review?.review || null,
          privateRemarks: review?.private?.feedback || review?.private_remarks || review?.private_review || null,
          hostReply: review?.public?.response || review?.host_reply || null,
          categoryRatings: categoryRatingsData,
          conversationHistory,
          reviewPostedAt: review?.reviewed_at ? new Date(review.reviewed_at) : (review?.created_at ? new Date(review.created_at) : null),
        };

        if (existing) {
          reservationUpdates.push({ existing, data: reservationData });
        } else {
          reservationCreates.push(reservationData);
        }
      }

      const dbBatchSize = 10;
      
      for (let i = 0; i < reservationUpdates.length; i += dbBatchSize) {
        const batch = reservationUpdates.slice(i, i + dbBatchSize);
        const results = await Promise.all(
          batch.map(({ existing, data }) => storage.updateReservation(existing.id, data))
        );
        updatedReservations.push(...results.filter(Boolean));
      }

      for (let i = 0; i < reservationCreates.length; i += dbBatchSize) {
        const batch = reservationCreates.slice(i, i + dbBatchSize);
        const results = await Promise.all(
          batch.map(data => storage.createReservation(data))
        );
        syncedReservations.push(...results);
      }
      
      logger.info('Sync', `Created ${syncedReservations.length} new, updated ${updatedReservations.length} existing reservations`);

      await storage.updateListing(listing.id, { lastSyncedAt: new Date() });

      const allListingReservations = await storage.getReservationsByListing(listing.id);
      const now = new Date();
      const fourteenDaysMs = 14 * 24 * 60 * 60 * 1000;
      
      const eligibleForAnalysis = allListingReservations.filter(r => {
        if (r.reviewAnalyzedAt) return false;
        
        const isCompleted = r.status === 'completed' || 
          (r.status === 'accepted' && r.checkOutDate && new Date(r.checkOutDate) < now);
        if (!isCompleted) return false;
        
        if (r.publicReview) return true;
        
        if (r.checkOutDate) {
          const checkoutTime = new Date(r.checkOutDate).getTime();
          if (now.getTime() - checkoutTime >= fourteenDaysMs) return true;
        }
        
        return false;
      });

      const unprocessedCount = await storage.getUnprocessedReservations(listing.id);
      logger.info('Sync', `${eligibleForAnalysis.length} eligible for sentiment, ${unprocessedCount.length} need tag analysis`);
      logger.info('Sync', 'Data sync complete - call analyze-reservations for AI analysis');

      const reviewCount = allReservations.filter(r => r.review).length;
      
      res.json({
        message: "Reservations synced successfully",
        synced: syncedReservations.length,
        updated: updatedReservations.length,
        totalReservations: allReservations.length,
        totalReviews: reviewCount,
        pendingAnalysis: unprocessedCount.length,
      });
    } catch (error) {
      logger.error('Sync', 'Error syncing reservations:', error);
      res.status(500).json({ message: "Failed to sync reservations" });
    }
  });

  app.post("/api/listings/:id/analyze-reservations", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const listing = await storage.getListing(getParamId(req.params.id));
      
      if (!listing || listing.userId !== userId) {
        return res.status(404).json({ message: "Listing not found" });
      }

      let unprocessedReservations = await storage.getUnprocessedReservations(listing.id);
      
      if (unprocessedReservations.length === 0) {
        return res.json({ message: "No new reservations to analyze", tagsCreated: 0, tasksCreated: 0 });
      }

      logger.info('Analysis', `Found ${unprocessedReservations.length} unprocessed reservations for listing ${listing.id}`);
      
      unprocessedReservations = unprocessedReservations.sort((a, b) => {
        const dateA = a.checkInDate ? new Date(a.checkInDate).getTime() : 0;
        const dateB = b.checkInDate ? new Date(b.checkInDate).getTime() : 0;
        return dateB - dateA;
      });

      const existingThemes = listing.workspaceId 
        ? await storage.getThemesByWorkspace(listing.workspaceId)
        : await storage.getThemesByUser(userId);
      const themeNames = existingThemes.map(t => t.name.toLowerCase());

      let totalTagsCreated = 0;
      let totalTasksCreated = 0;

      const reservationAnalysisPrompt = await storage.getPromptByName("reservation_analysis");
      
      const batchSize = 8;
      const parallelBatches = 6;
      
      const allBatches: typeof unprocessedReservations[] = [];
      for (let i = 0; i < unprocessedReservations.length; i += batchSize) {
        allBatches.push(unprocessedReservations.slice(i, i + batchSize));
      }
      
      logger.info('Analysis', `Created ${allBatches.length} batches (batch size: ${batchSize}, parallel: ${parallelBatches})`);

      const processBatch = async (batch: typeof unprocessedReservations): Promise<{ tagsCreated: number; tasksCreated: number; tagIds: string[] }> => {
        let batchTagsCreated = 0;
        let batchTasksCreated = 0;
        const batchTagIds: string[] = [];
        
        logger.info('Analysis', `Starting batch processing for ${batch.length} reservations:`, batch.map(r => ({ id: r.id, guest: r.guestName })));
        
        const reservationsContext = batch.map(res => {
          const guestMessages = Array.isArray(res.conversationHistory) 
            ? res.conversationHistory.filter((m: any) => m.sender === 'guest').map((m: any) => m.message)
            : [];
          
          return {
            id: res.id,
            guestName: res.guestName,
            checkIn: res.checkInDate,
            checkOut: res.checkOutDate,
            publicReview: res.publicReview,
            privateRemarks: res.privateRemarks,
            guestMessages,
          };
        });

        const existingThemesFormatted = existingThemes.map(t => `- ${t.name}: ${t.description || 'No description'}`).join('\n') || 'No existing themes';
        const reservationsFormatted = reservationsContext.map((res, idx) => `
--- Reservation ${idx + 1} (ID: ${res.id}) ---
Guest: ${res.guestName}
Stay: ${res.checkIn ? new Date(res.checkIn).toLocaleDateString() : 'Unknown'} - ${res.checkOut ? new Date(res.checkOut).toLocaleDateString() : 'Unknown'}
Public Review: ${res.publicReview || 'No review'}
Private Remarks: ${res.privateRemarks || 'None'}
Guest Messages: ${res.guestMessages.length > 0 ? res.guestMessages.join(' | ') : 'No messages'}
`).join('\n');

        let analysisPrompt: string;
        if (reservationAnalysisPrompt?.promptTemplate) {
          analysisPrompt = reservationAnalysisPrompt.promptTemplate
            .replace('{{existingThemes}}', existingThemesFormatted)
            .replace('{{reservationsContext}}', reservationsFormatted);
        } else {
          analysisPrompt = `You are an expert short-term rental consultant. Analyze these guest reservations and extract ACTIONABLE insights as Tags.

PURPOSE: Tags capture key feedback, complaints, confusion, or questions from guests that a host can learn from or act upon. Each NEGATIVE tag will generate an AI Task suggesting what the host should do to improve.

\u26A1\uFE0F KEY RULES:
* Generate a tag ONLY if there is a CLEAR, CONCRETE, OWNER-ADDRESSABLE action a property manager should take.
* If there are NO actionable items for a reservation, return "tags": [] - this is perfectly valid and preferred over false positives.
* Do NOT infer actions that are not grounded in the text. Use ONLY the provided context.
* Each tag MUST include verbatimEvidence with an EXACT quote from the source data.

\uD83C\uDFAF ACTIONABILITY RUBRIC (apply strictly):
\u2705 ACTIONABLE - Create a tag for these:
- Fix/inspect/replace/clean something: "The shower drain was clogged" \u2192 tag it
- Schedule/communicate/update: "We didn't know where to park" \u2192 tag it
- Refund/credit situations: "The hot tub wasn't working" \u2192 tag it
- Recognize staff behavior worth reinforcing: "The cleaner Maria was exceptional" \u2192 tag it
- Questions revealing unclear info: "Is there parking nearby?" \u2192 tag it with "question" sentiment

\u274C NOT ACTIONABLE - Do NOT create tags for these:
- Pure praise without follow-up: "Great stay!" "Loved it!" "Perfect!"
- Generic thanks: "Thank you for hosting us"
- Vague sentiments: "It was fine" "Nice place"
- Small talk with no task implied
- Trip purposes: "Wedding Trip", "Business Travel", "Family Reunion", "Vacation", "Anniversary"
- Guest demographics: "Mature Group", "Young Couple", "Large Family", "Solo Traveler"
- Arrival/departure logistics: "Late Arrival", "Early Check-in", "Early Checkout", "Flight Delay"
- Booking confirmations: "Reservation Confirmed", "Stay Confirmed", "House Rules Acknowledged"
- Guest info updates: "Guest Count Correction", "Updated Guest Details"
- General greetings or routine messages

ASK YOURSELF: "Is there a specific, concrete action the host can take based on this?" If NO, do not create a tag.

EXCEPTION - ALWAYS TAG QUESTIONS:
Questions from guests should ALWAYS be tagged with sentiment "question" because they reveal confusion points that could be clarified in the listing or house rules.

AVAILABLE THEMES (you MUST assign EVERY tag to one of these themes - no exceptions):
${existingThemes.map(t => `- ${t.name}: ${t.description || 'No description'}`).join('\n') || 'No existing themes'}

IMPORTANT: Assign each tag to one of the themes above. If unsure, use "Unassigned". DO NOT create new themes.

RESERVATIONS TO ANALYZE:
${reservationsContext.map((res, idx) => `
--- Reservation ${idx + 1} (ID: ${res.id}) ---
Guest: ${res.guestName}
Stay: ${res.checkIn ? new Date(res.checkIn).toLocaleDateString() : 'Unknown'} - ${res.checkOut ? new Date(res.checkOut).toLocaleDateString() : 'Unknown'}
Public Review (review_id: review_${res.id}): ${res.publicReview || 'No review'}
Private Remarks (review_id: review_${res.id}): ${res.privateRemarks || 'None'}
Guest Messages: ${res.guestMessages.length > 0 ? res.guestMessages.map((m, i) => `[msg_${res.id}_${i}] ${m}`).join(' | ') : 'No messages'}
`).join('\n')}

Provide a JSON response with this structure:
{
  "reservations": [
    {
      "reservationId": "<reservation id>",
      "tags": [
        {
          "name": "<short descriptive tag name, 2-4 words>",
          "sentiment": "positive|negative|neutral|question",
          "priority": "low|medium|high|critical",
          "summary": "<1-2 sentence explanation of this insight>",
          "verbatimEvidence": "<EXACT quote from review or message - REQUIRED>",
          "sourceType": "review|message",
          "sourceId": "<ID of the source: review_xxx or msg_xxx_n>",
          "themeName": "<EXACT name of one of the available themes listed above>",
          "suggestedTaskTitle": "<actionable task, max 100 chars, or null>",
          "suggestedTaskDescription": "<task description if applicable, or null>"
        }
      ]
    }
  ]
}

TAG SENTIMENT GUIDE:
- positive (Green): Praise, satisfaction, things guests loved that are worth reinforcing
- negative (Red): Complaints, issues, problems that need fixing
- neutral (Yellow): Observations, factual statements, mixed feedback
- question (Blue): Inquiries, requests for information, questions from guests

PRIORITY GUIDE:
- critical: Safety issues, major failures (broken AC in summer, no hot water, security concerns)
- high: Significant issues affecting guest experience (cleanliness problems, broken amenities)
- medium: Moderate issues or feedback (minor inconveniences, suggestions for improvement)
- low: Minor observations, positive reinforcement, small details

CRITICAL RULES:
- YOU MUST INCLUDE EVERY RESERVATION ID IN YOUR RESPONSE - do not skip any reservation
- If a reservation has NO actionable content, include it with an EMPTY tags array [] - this is correct behavior
- Do NOT create tags just to have something - empty tags array is preferred over false positives
- Tag names should NEVER include sentiment words - the sentiment field handles that
- GOOD tag examples: "Spotless Bathroom", "Clogged Drain", "Parking Confusion", "WiFi Issues", "Broken AC"
- BAD tag examples: "Wedding Trip", "Great Stay", "Nice Host", "Late Arrival", "Positive Experience"
- For NEGATIVE tags: Always include suggestedTaskTitle with a specific action (max 100 chars)
- Include verbatimEvidence with the exact quote - without evidence, the tag is not valid
- sourceType must be "review" (for publicReview or privateRemarks) or "message" (for guest messages)`;
        }


        try {
          const { modelId, modelInfo } = await getConfiguredAIModel(reservationAnalysisPrompt?.modelId, 'sync');
          
          let completion: any = null;
          let retries = 0;
          const maxRetries = 3;
          
          while (!completion && retries <= maxRetries) {
            try {
              completion = await openai.chat.completions.create({
                model: modelId,
                messages: [{ role: "user", content: analysisPrompt }],
                response_format: { type: "json_object" },
                max_tokens: 8000,
              });
            } catch (apiError: any) {
              const isRateLimitError = apiError?.status === 429 || 
                                        apiError?.code === 'rate_limit_exceeded' ||
                                        apiError?.message?.includes('Rate limit');
              
              if (isRateLimitError && retries < maxRetries) {
                const backoffMs = Math.pow(2, retries) * 1000 + Math.random() * 1000;
                logger.info('Analysis', `Rate limited, retrying in ${Math.round(backoffMs)}ms (attempt ${retries + 1}/${maxRetries})`);
                await new Promise(resolve => setTimeout(resolve, backoffMs));
                retries++;
              } else {
                throw apiError;
              }
            }
          }
          
          if (!completion) {
            throw new Error('Failed to get AI completion after retries');
          }

          const responseText = completion.choices[0]?.message?.content || "{}";
          const aiResult = JSON.parse(responseText);

          const inputTokens = completion.usage?.prompt_tokens || 0;
          const outputTokens = completion.usage?.completion_tokens || 0;
          const estimatedCost = calculateAICost(inputTokens, outputTokens, modelInfo);
          
          await storage.createAiUsageLog({
            userId,
            label: "Reservation Tag Analysis",
            model: modelId,
            inputTokens,
            outputTokens,
            estimatedCost,
            listingId: listing.id,
            listingName: listing.name,
          });

          const aiReservationIds = (aiResult.reservations || []).map((r: any) => r.reservationId);
          const batchIds = batch.map(r => r.id);
          const missingFromAI = batchIds.filter(id => !aiReservationIds.includes(id));
          
          logger.info('Analysis', `Processing ${(aiResult.reservations || []).length} of ${batch.length} reservation results`);
          if (missingFromAI.length > 0) {
            for (const missingId of missingFromAI) {
              const missingRes = batch.find(r => r.id === missingId);
              const hasContent = missingRes?.publicReview || missingRes?.privateRemarks || 
                (Array.isArray(missingRes?.conversationHistory) && 
                 missingRes.conversationHistory.some((m: any) => m.sender === 'guest'));
              logger.warn('Analysis', `AI skipped reservation ${missingId} (${missingRes?.guestName}) - hasContent: ${hasContent}`);
            }
          }
          
          for (const resResult of (aiResult.reservations || [])) {
            const reservation = batch.find(r => r.id === resResult.reservationId);
            if (!reservation) {
              logger.info('Analysis', `Reservation not found in batch! AI returned ID: "${resResult.reservationId}"`);
              continue;
            }
            logger.info('Analysis', `Processing ${(resResult.tags || []).length} tags for ${reservation.guestName}`);

            for (const tagData of (resResult.tags || [])) {
              let themeId: string | null = null;
              
              const themeName = tagData.themeName || tagData.suggestedTheme;
              if (themeName) {
                let matchedTheme = existingThemes.find(t => 
                  t.name.toLowerCase() === themeName.toLowerCase()
                );
                
                if (!matchedTheme) {
                  const cleanThemeName = themeName.replace(/^[\u{1F300}-\u{1F9FF}]\s*/u, '').trim().toLowerCase();
                  matchedTheme = existingThemes.find(t => {
                    const cleanExisting = t.name.toLowerCase();
                    return cleanExisting === cleanThemeName || 
                           cleanExisting.includes(cleanThemeName) ||
                           cleanThemeName.includes(cleanExisting);
                  });
                }
                
                if (matchedTheme) {
                  themeId = matchedTheme.id;
                } else {
                  const unassignedTheme = existingThemes.find(t => t.name === "Unassigned");
                  if (unassignedTheme) {
                    themeId = unassignedTheme.id;
                    logger.info('Analysis', `Tag "${tagData.name}" assigned to Unassigned (theme "${themeName}" not found)`);
                  } else {
                    logger.info('Analysis', `Warning: No Unassigned theme found for workspace, tag "${tagData.name}" has no theme`);
                  }
                }
              } else {
                const unassignedTheme = existingThemes.find(t => t.name === "Unassigned");
                if (unassignedTheme) {
                  themeId = unassignedTheme.id;
                }
              }

              const tag = await storage.createTag({
                userId,
                workspaceId: listing.workspaceId || undefined,
                listingId: listing.id,
                reservationId: reservation.id,
                themeId,
                name: tagData.name,
                sentiment: tagData.sentiment || "neutral",
                priority: tagData.priority || "medium",
                summary: tagData.summary || null,
                verbatimEvidence: tagData.verbatimEvidence || null,
                sourceType: tagData.sourceType || null,
                sourceId: tagData.sourceId || null,
                suggestedTaskTitle: tagData.suggestedTaskTitle || null,
                suggestedTaskDescription: tagData.suggestedTaskDescription || null,
                addedToThemeAt: themeId ? new Date() : null,
                createdAt: reservation.checkOutDate || undefined,
              });
              batchTagsCreated++;
              batchTagIds.push(tag.id);

              if (tagData.suggestedTaskTitle) {
                await storage.createTask({
                  userId,
                  workspaceId: listing.workspaceId || undefined,
                  tagId: tag.id,
                  themeId,
                  listingId: listing.id,
                  title: tagData.suggestedTaskTitle,
                  description: tagData.suggestedTaskDescription || null,
                  priority: tagData.priority || (tagData.sentiment === 'negative' ? 'high' : 'medium'),
                  status: 'suggested',
                });
                batchTasksCreated++;
              }
            }

          }
          
          const processedIds = new Set((aiResult.reservations || []).map((r: any) => r.reservationId));
          for (const res of batch) {
            if (!processedIds.has(res.id)) {
              await storage.updateReservation(res.id, { tagsProcessedAt: new Date() });
              logger.info('Analysis', `Marked reservation ${res.id} as processed (no AI results returned)`);
            } else {
              await storage.updateReservation(res.id, { tagsProcessedAt: new Date() });
            }
          }
        } catch (aiError) {
          logger.error('Analysis', 'AI analysis error for batch:', aiError);
          for (const res of batch) {
            await storage.updateReservation(res.id, { tagsProcessedAt: new Date() });
          }
        }
        
        return { tagsCreated: batchTagsCreated, tasksCreated: batchTasksCreated, tagIds: batchTagIds };
      };

      const generateThemeSummariesIfNeeded = async () => {
        for (const theme of existingThemes) {
          if (theme.name === "Unassigned") continue;
          
          try {
            const themeTags = await storage.getTagsByTheme(theme.id);
            if (themeTags.length >= 5) {
              const currentTagCount = themeTags.length;
              const lastSummaryTagCount = theme.summaryTagCount || 0;
              if (!theme.summary || (currentTagCount - lastSummaryTagCount >= 5)) {
                generateThemeSummary(storage, theme.id, userId, themeTags);
              }
            }
          } catch (summaryErr) {
            logger.error('Analysis', `Error checking theme summary for ${theme.name}:`, summaryErr);
          }
        }
      };

      const allNewTagIds: string[] = [];
      
      for (let i = 0; i < allBatches.length; i += parallelBatches) {
        const batchGroup = allBatches.slice(i, i + parallelBatches);
        const results = await Promise.all(batchGroup.map(processBatch));
        
        for (const result of results) {
          totalTagsCreated += result.tagsCreated;
          totalTasksCreated += result.tasksCreated;
          allNewTagIds.push(...result.tagIds);
        }
        
      }
      
      res.json({
        message: "Reservation analysis complete",
        reservationsProcessed: unprocessedReservations.length,
        tagsCreated: totalTagsCreated,
        tasksCreated: totalTasksCreated,
      });
      
      logger.info('Analysis', `Tag/Task analysis complete for listing ${listing.id}. Starting background processes...`);
      
      (async () => {
        try {
          await generateThemeSummariesIfNeeded();
          logger.info('Analysis', `Background theme summary generation complete for listing ${listing.id}`);
        } catch (themeError) {
          logger.error('Analysis', `Background theme summary generation failed for listing ${listing.id}:`, themeError);
        }
        
        try {
          await runBackgroundSentimentAnalysis(storage, listing.id, userId);
          logger.info('Analysis', `Background sentiment analysis complete for listing ${listing.id}`);
        } catch (bgError) {
          logger.error('Analysis', `Background sentiment analysis failed for listing ${listing.id}:`, bgError);
        }
        
        if (listing.workspaceId && allNewTagIds.length > 0) {
          try {
            await autoSyncTagsToNotion(listing.workspaceId, allNewTagIds);
          } catch (notionError) {
            logger.error('Analysis', `Background Notion sync failed for listing ${listing.id}:`, notionError);
          }
        }
      })();
      
    } catch (error) {
      logger.error('Analysis', 'Error analyzing reservations:', error);
      res.status(500).json({ message: "Failed to analyze reservations" });
    }
  });

  app.get("/api/listings/:id/analyze-reservations-stream", isAuthenticated, async (req, res) => {
    const userId = getUserId(req);
    const listing = await storage.getListing(getParamId(req.params.id));
    
    if (!listing || listing.userId !== userId) {
      return res.status(404).json({ message: "Listing not found" });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const sendEvent = (data: any) => {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };
    
    const heartbeatInterval = setInterval(() => {
      sendEvent({ type: 'heartbeat' });
    }, 15000);
    
    req.on('close', () => {
      clearInterval(heartbeatInterval);
    });

    try {
      let unprocessedReservations = await storage.getUnprocessedReservations(listing.id);
      
      if (unprocessedReservations.length === 0) {
        const allReservations = await storage.getReservationsByListing(listing.id);
        const processedCount = allReservations.filter(r => r.tagsProcessedAt !== null).length;
        const existingTags = await storage.getTagsByListing(listing.id);
        
        clearInterval(heartbeatInterval);
        
        sendEvent({
          type: 'init',
          totalReservations: processedCount,
          reservationsAnalyzed: processedCount,
          alreadyComplete: true
        });
        
        sendEvent({ 
          type: 'complete',
          totalReservations: processedCount,
          reservationsAnalyzed: processedCount,
          tagsCreated: existingTags.length, 
          tasksCreated: 0,
          themesPromoted: 0,
          alreadyComplete: true
        });
        res.end();
        return;
      }

      sendEvent({ 
        type: 'init',
        totalReservations: unprocessedReservations.length,
        reservationsAnalyzed: 0
      });

      unprocessedReservations = unprocessedReservations.sort((a, b) => {
        const dateA = a.checkInDate ? new Date(a.checkInDate).getTime() : 0;
        const dateB = b.checkInDate ? new Date(b.checkInDate).getTime() : 0;
        return dateB - dateA;
      });

      const existingThemes = listing.workspaceId 
        ? await storage.getThemesByWorkspace(listing.workspaceId)
        : await storage.getThemesByUser(userId);
      const themeNames = existingThemes.map(t => t.name.toLowerCase());

      let totalTagsCreated = 0;
      let totalTasksCreated = 0;
      let reservationsAnalyzed = 0;

      const reservationAnalysisPrompt = await storage.getPromptByName("reservation_analysis");
      
      const batchSize = 8;
      const parallelBatches = 6;
      
      const allBatches: typeof unprocessedReservations[] = [];
      for (let i = 0; i < unprocessedReservations.length; i += batchSize) {
        allBatches.push(unprocessedReservations.slice(i, i + batchSize));
      }

      const processBatchWithProgress = async (batch: typeof unprocessedReservations): Promise<{ tagsCreated: number; tasksCreated: number; processed: number; tagIds: string[] }> => {
        let batchTagsCreated = 0;
        let batchTasksCreated = 0;
        const batchTagIds: string[] = [];
        
        const reservationsContext = batch.map(res => {
          const guestMessages = Array.isArray(res.conversationHistory) 
            ? res.conversationHistory.filter((m: any) => m.sender === 'guest').map((m: any) => m.message)
            : [];
          
          return {
            id: res.id,
            guestName: res.guestName,
            checkIn: res.checkInDate,
            checkOut: res.checkOutDate,
            publicReview: res.publicReview,
            privateRemarks: res.privateRemarks,
            guestMessages,
          };
        });

        const existingThemesFormatted = existingThemes.map(t => `- ${t.name}: ${t.description || 'No description'}`).join('\n') || 'No existing themes';
        const reservationsFormatted = reservationsContext.map((res, idx) => `
--- Reservation ${idx + 1} (ID: ${res.id}) ---
Guest: ${res.guestName}
Stay: ${res.checkIn ? new Date(res.checkIn).toLocaleDateString() : 'Unknown'} - ${res.checkOut ? new Date(res.checkOut).toLocaleDateString() : 'Unknown'}
Public Review: ${res.publicReview || 'No review'}
Private Remarks: ${res.privateRemarks || 'None'}
Guest Messages: ${res.guestMessages.length > 0 ? res.guestMessages.join(' | ') : 'No messages'}
`).join('\n');

        let analysisPrompt: string;
        if (reservationAnalysisPrompt?.promptTemplate) {
          analysisPrompt = reservationAnalysisPrompt.promptTemplate
            .replace('{{existingThemes}}', existingThemesFormatted)
            .replace('{{reservationsContext}}', reservationsFormatted);
        } else {
          analysisPrompt = `You are an expert short-term rental consultant analyzing guest reservations. Extract actionable insights as tags.

EXISTING THEMES:
${existingThemesFormatted}

RESERVATIONS:
${reservationsFormatted}

Return JSON: {"reservations": [{"reservationId": "<id>", "tags": [...]}]}`;
        }

        try {
          const { modelId } = await getConfiguredAIModel(reservationAnalysisPrompt?.modelId, 'sync');
          
          const response = await openai.chat.completions.create({
            model: modelId,
            messages: [{ role: "user", content: analysisPrompt }],
            response_format: { type: "json_object" },
            temperature: 0.7,
            max_tokens: 8000,
          });

          const content = response.choices[0]?.message?.content;
          if (content) {
            const aiResult = JSON.parse(content);
            
            for (const resResult of aiResult.reservations || []) {
              const reservation = batch.find(r => r.id === resResult.reservationId);
              if (!reservation) continue;

              await storage.updateReservation(reservation.id, { tagsProcessedAt: new Date() });

              for (const tagData of resResult.tags || []) {
                let themeId: string | null = null;
                
                const themeName = tagData.themeName || tagData.suggestedTheme;
                if (themeName) {
                  let matchedTheme = existingThemes.find(t => 
                    t.name.toLowerCase() === themeName.toLowerCase()
                  );
                  
                  if (!matchedTheme) {
                    const cleanThemeName = themeName.replace(/^[\u{1F300}-\u{1F9FF}]\s*/u, '').trim().toLowerCase();
                    matchedTheme = existingThemes.find(t => {
                      const cleanExisting = t.name.toLowerCase();
                      return cleanExisting === cleanThemeName || 
                             cleanExisting.includes(cleanThemeName) ||
                             cleanThemeName.includes(cleanExisting);
                    });
                  }
                  
                  if (matchedTheme) {
                    themeId = matchedTheme.id;
                  } else {
                    const unassignedTheme = existingThemes.find(t => t.name === "Unassigned");
                    if (unassignedTheme) {
                      themeId = unassignedTheme.id;
                    }
                  }
                } else {
                  const unassignedTheme = existingThemes.find(t => t.name === "Unassigned");
                  if (unassignedTheme) {
                    themeId = unassignedTheme.id;
                  }
                }

                const tag = await storage.createTag({
                  userId,
                  workspaceId: listing.workspaceId || undefined,
                  listingId: listing.id,
                  reservationId: reservation.id,
                  themeId,
                  name: tagData.name,
                  sentiment: tagData.sentiment || "neutral",
                  priority: tagData.priority || "medium",
                  summary: tagData.summary || null,
                  verbatimEvidence: tagData.verbatimEvidence || null,
                  sourceType: tagData.sourceType || null,
                  sourceId: tagData.sourceId || null,
                  suggestedTaskTitle: tagData.suggestedTaskTitle || null,
                  suggestedTaskDescription: tagData.suggestedTaskDescription || null,
                  addedToThemeAt: themeId ? new Date() : null,
                  createdAt: reservation.checkOutDate || undefined,
                });
                batchTagsCreated++;
                batchTagIds.push(tag.id);

                if (tagData.suggestedTaskTitle) {
                  await storage.createTask({
                    userId,
                    workspaceId: listing.workspaceId || undefined,
                    tagId: tag.id,
                    themeId,
                    listingId: listing.id,
                    title: tagData.suggestedTaskTitle,
                    description: tagData.suggestedTaskDescription || null,
                    priority: tagData.priority || (tagData.sentiment === 'negative' ? 'high' : 'medium'),
                    status: 'suggested',
                  });
                  batchTasksCreated++;
                }
              }
            }
            
            const processedIds = new Set((aiResult.reservations || []).map((r: any) => r.reservationId));
            for (const res of batch) {
              if (!processedIds.has(res.id)) {
                await storage.updateReservation(res.id, { tagsProcessedAt: new Date() });
              }
            }
          }
        } catch (error) {
          logger.error('Analysis', 'AI analysis error:', error);
          for (const res of batch) {
            await storage.updateReservation(res.id, { tagsProcessedAt: new Date() });
          }
        }
        
        return { tagsCreated: batchTagsCreated, tasksCreated: batchTasksCreated, processed: batch.length, tagIds: batchTagIds };
      };

      const generateThemeSummariesIfNeeded = async () => {
        for (const theme of existingThemes) {
          if (theme.name === "Unassigned") continue;
          
          try {
            const themeTags = await storage.getTagsByTheme(theme.id);
            if (themeTags.length >= 5) {
              const currentTagCount = themeTags.length;
              const lastSummaryTagCount = theme.summaryTagCount || 0;
              if (!theme.summary || (currentTagCount - lastSummaryTagCount >= 5)) {
                generateThemeSummary(storage, theme.id, userId, themeTags);
              }
            }
          } catch (summaryErr) {
            logger.error('Analysis', `Error checking theme summary for ${theme.name}:`, summaryErr);
          }
        }
      };

      const allNewTagIds: string[] = [];
      
      for (let i = 0; i < allBatches.length; i += parallelBatches) {
        const batchGroup = allBatches.slice(i, i + parallelBatches);
        
        for (const batch of batchGroup) {
          const result = await processBatchWithProgress(batch);
          totalTagsCreated += result.tagsCreated;
          totalTasksCreated += result.tasksCreated;
          reservationsAnalyzed += result.processed;
          allNewTagIds.push(...result.tagIds);
          
          sendEvent({
            type: 'progress',
            totalReservations: unprocessedReservations.length,
            reservationsAnalyzed,
            tagsCreated: totalTagsCreated,
            tasksCreated: totalTasksCreated
          });
        }
        
      }
      
      clearInterval(heartbeatInterval);
      sendEvent({
        type: 'complete',
        totalReservations: unprocessedReservations.length,
        reservationsAnalyzed,
        tagsCreated: totalTagsCreated,
        tasksCreated: totalTasksCreated,
        themesPromoted: 0
      });
      
      res.end();
      
      logger.info('Analysis', `Tag/Task analysis complete for listing ${listing.id}. Starting background processes...`);
      
      (async () => {
        try {
          await generateThemeSummariesIfNeeded();
          logger.info('Analysis', `Background theme summary generation complete for listing ${listing.id}`);
        } catch (themeError) {
          logger.error('Analysis', `Background theme summary generation failed for listing ${listing.id}:`, themeError);
        }
        
        try {
          await runBackgroundSentimentAnalysis(storage, listing.id, userId);
          logger.info('Analysis', `Background sentiment analysis complete for listing ${listing.id}`);
        } catch (bgError) {
          logger.error('Analysis', `Background sentiment analysis failed for listing ${listing.id}:`, bgError);
        }
        
        if (listing.workspaceId && allNewTagIds.length > 0) {
          try {
            await autoSyncTagsToNotion(listing.workspaceId, allNewTagIds);
          } catch (notionError) {
            logger.error('Analysis', `Background Notion sync failed for listing ${listing.id}:`, notionError);
          }
        }
      })();
      
      return;
    } catch (error) {
      clearInterval(heartbeatInterval);
      logger.error('Analysis', 'Error in SSE analyze-reservations:', error);
      sendEvent({ type: 'error', message: 'Analysis failed' });
      res.end();
    }
  });

  app.post("/api/listings/analyze-all-reservations-stream", isAuthenticated, async (req, res) => {
    const userId = getUserId(req);
    const { listingIds } = req.body as { listingIds: string[] };
    
    if (!listingIds || !Array.isArray(listingIds) || listingIds.length === 0) {
      return res.status(400).json({ message: "listingIds array is required" });
    }
    
    const validListings: Listing[] = [];
    for (const listingId of listingIds) {
      const listing = await storage.getListing(listingId);
      if (listing && listing.userId === userId) {
        validListings.push(listing);
      }
    }
    
    if (validListings.length === 0) {
      return res.status(404).json({ message: "No valid listings found" });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    let isConnectionOpen = true;
    const sendEvent = (data: any) => {
      if (isConnectionOpen) {
        try {
          res.write(`data: ${JSON.stringify(data)}\n\n`);
        } catch (e) {
          isConnectionOpen = false;
        }
      }
    };
    
    const heartbeatInterval = setInterval(() => {
      sendEvent({ type: 'heartbeat' });
    }, 15000);
    
    req.on('close', () => {
      isConnectionOpen = false;
      clearInterval(heartbeatInterval);
    });

    let totalTagsCreated = 0;
    let totalTasksCreated = 0;
    let totalReservationsAnalyzed = 0;
    const allNewTagIds: string[] = [];
    const counterLock = { locked: false };
    
    const updateCounters = (tagsCreated: number, tasksCreated: number, processed: number, tagIds: string[]) => {
      totalTagsCreated += tagsCreated;
      totalTasksCreated += tasksCreated;
      totalReservationsAnalyzed += processed;
      allNewTagIds.push(...tagIds);
    };

    const classifyReservation = (res: any): 'rich' | 'simple' => {
      const hasPrivateRemarks = res.privateRemarks && res.privateRemarks.trim().length > 50;
      const hasConversation = Array.isArray(res.conversationHistory) && res.conversationHistory.length > 2;
      const hasLongReview = res.publicReview && res.publicReview.length > 300;
      const hasLowRating = res.guestRating && res.guestRating <= 3;
      
      if (hasPrivateRemarks || hasConversation || hasLongReview || hasLowRating) {
        return 'rich';
      }
      return 'simple';
    };

    try {
      const reservationPromises = validListings.map(async (listing) => {
        const unprocessed = await storage.getUnprocessedReservations(listing.id);
        return unprocessed.map(r => ({ 
          ...r, 
          listingId: listing.id,
          workspaceId: listing.workspaceId 
        }));
      });
      
      const reservationsByListing = await Promise.all(reservationPromises);
      const allUnprocessedReservations = reservationsByListing.flat();
      
      const totalReservations = allUnprocessedReservations.length;
      
      if (totalReservations === 0) {
        const totalReservationsByListing = await Promise.all(
          validListings.map(listing => storage.getReservationsByListing(listing.id))
        );
        const allReservations = totalReservationsByListing.flat();
        const processedCount = allReservations.filter(r => r.tagsProcessedAt !== null).length;
        
        const tagsByListing = await Promise.all(
          validListings.map(listing => storage.getTagsByListing(listing.id))
        );
        const totalExistingTags = tagsByListing.flat().length;
        
        clearInterval(heartbeatInterval);
        
        sendEvent({
          type: 'init',
          totalReservations: processedCount,
          reservationsAnalyzed: processedCount,
          listingsCount: validListings.length,
          alreadyComplete: true
        });
        
        sendEvent({ 
          type: 'complete',
          totalReservations: processedCount,
          reservationsAnalyzed: processedCount,
          tagsCreated: totalExistingTags, 
          tasksCreated: 0,
          themesPromoted: 0,
          listingsProcessed: validListings.length,
          alreadyComplete: true
        });
        res.end();
        return;
      }

      const richCount = allUnprocessedReservations.filter(r => classifyReservation(r) === 'rich').length;
      const simpleCount = totalReservations - richCount;

      sendEvent({ 
        type: 'init',
        totalReservations,
        reservationsAnalyzed: 0,
        listingsCount: validListings.length,
        modelRouting: { rich: richCount, simple: simpleCount }
      });
      
      logger.info('Analysis', `Starting PARALLEL analysis for ${validListings.length} listings with ${totalReservations} reservations (${richCount} rich, ${simpleCount} simple)`);

      const processBatch = async (
        batch: typeof allUnprocessedReservations,
        listing: Listing,
        existingThemes: any[],
        reservationAnalysisPrompt: any
      ): Promise<{ tagsCreated: number; tasksCreated: number; processed: number; tagIds: string[] }> => {
        let batchTagsCreated = 0;
        let batchTasksCreated = 0;
        const batchTagIds: string[] = [];
        
        const batchRichness = batch.some(r => classifyReservation(r) === 'rich') ? 'rich' : 'simple';
        const modelToUse = batchRichness === 'rich' ? 'gpt-4.1-mini' : 'gpt-4o-mini';
        
        const reservationsContext = batch.map(res => {
          const guestMessages = Array.isArray(res.conversationHistory) 
            ? res.conversationHistory.filter((m: any) => m.sender === 'guest').map((m: any) => m.message)
            : [];
          
          return {
            id: res.id,
            guestName: res.guestName,
            checkIn: res.checkInDate,
            checkOut: res.checkOutDate,
            publicReview: res.publicReview,
            privateRemarks: res.privateRemarks,
            guestMessages,
          };
        });

        const existingThemesFormatted = existingThemes.map(t => `- ${t.name}: ${t.description || 'No description'}`).join('\n') || 'No existing themes';
        const reservationsFormatted = reservationsContext.map((res, idx) => `
--- Reservation ${idx + 1} (ID: ${res.id}) ---
Guest: ${res.guestName}
Stay: ${res.checkIn ? new Date(res.checkIn).toLocaleDateString() : 'Unknown'} - ${res.checkOut ? new Date(res.checkOut).toLocaleDateString() : 'Unknown'}
Public Review: ${res.publicReview || 'No review'}
Private Remarks: ${res.privateRemarks || 'None'}
Guest Messages: ${res.guestMessages.length > 0 ? res.guestMessages.join(' | ') : 'No messages'}
`).join('\n');

        let analysisPrompt: string;
        if (reservationAnalysisPrompt?.promptTemplate) {
          analysisPrompt = reservationAnalysisPrompt.promptTemplate
            .replace('{{existingThemes}}', existingThemesFormatted)
            .replace('{{reservationsContext}}', reservationsFormatted);
        } else {
          analysisPrompt = `You are an expert short-term rental consultant. Analyze these guest reservations and extract ACTIONABLE insights as Tags.
PURPOSE: Tags capture key feedback, complaints, confusion, or questions from guests that a host can learn from or act upon.

EXISTING THEMES (match when possible):
${existingThemesFormatted}

RESERVATIONS TO ANALYZE:
${reservationsFormatted}

Respond with a JSON object containing a "reservations" array. For each reservation, include:
- reservation_id: The exact reservation ID provided
- tags: Array of 0-5 tags, each with:
  - name: Short descriptive tag name (3-6 words)
  - sentiment: "positive", "negative", or "neutral"
  - priority: "low", "medium", or "high"
  - summary: Brief explanation of the insight
  - verbatim_evidence: Exact quote from guest messages/review supporting this tag
  - theme_name: Suggested theme category
  - suggested_task: Object with title and description if action needed (especially for negative tags)

Example format:
{
  "reservations": [
    {
      "reservation_id": "abc-123",
      "tags": [
        {
          "name": "Loved the location",
          "sentiment": "positive",
          "priority": "medium",
          "summary": "Guest appreciated proximity to downtown",
          "verbatim_evidence": "Was close to stores, restaurants and coffee shops",
          "theme_name": "Location",
          "suggested_task": null
        },
        {
          "name": "Shower water pressure low",
          "sentiment": "negative",
          "priority": "high",
          "summary": "Guest complained about weak water pressure in the shower",
          "verbatim_evidence": "The shower had very low water pressure",
          "theme_name": "Maintenance",
          "suggested_task": {
            "title": "Check and fix shower water pressure",
            "description": "Inspect showerhead and plumbing for blockages or issues causing low water pressure"
          }
        }
      ]
    }
  ]
}

IMPORTANT RULES:
1. You MUST return at least 1 tag per reservation that has any feedback, review, or conversation
2. For NEGATIVE or NEUTRAL tags, you MUST include a suggested_task with title and description
3. For POSITIVE tags, set suggested_task to null
4. Only return 0 tags if there is absolutely no feedback to analyze`;
        }

        try {
          const response = await openai.chat.completions.create({
            model: modelToUse,
            messages: [{ role: "user", content: analysisPrompt }],
            max_tokens: 8000,
            response_format: { type: "json_object" },
          });

          const responseText = response.choices[0]?.message?.content || '{}';
          
          logger.info('Analysis', `[${modelToUse}] Response (first 300 chars):`, responseText.substring(0, 300));
          
          let aiResults: any[] = [];
          try {
            const parsed = JSON.parse(responseText);
            
            if (Array.isArray(parsed)) {
              aiResults = parsed;
            } else if (parsed.results && Array.isArray(parsed.results)) {
              aiResults = parsed.results;
            } else if (parsed.reservations && Array.isArray(parsed.reservations)) {
              aiResults = parsed.reservations;
            } else if (parsed.analysis && Array.isArray(parsed.analysis)) {
              aiResults = parsed.analysis;
            } else {
              const arrayProp = Object.values(parsed).find(v => Array.isArray(v));
              if (arrayProp) {
                aiResults = arrayProp as any[];
              }
            }
          } catch (parseError) {
            logger.error('Analysis', 'JSON parse failed:', parseError);
          }
            
          for (const item of aiResults) {
            const resId = item.reservation_id || item.reservationId;
            if (!resId) continue;
            
            const reservation = batch.find(r => r.id === resId);
            if (!reservation) continue;
            
            const tags = item.tags || [];
            for (const tagData of tags) {
              const themeName = tagData.theme_name || tagData.themeName || tagData.suggestedTheme;
              const verbatimEvidence = tagData.verbatim_evidence || tagData.verbatimEvidence;
              const themeIcon = tagData.theme_icon || tagData.themeIcon;
              
              let suggestedTask = tagData.suggested_task || tagData.suggestedTask || tagData.task;
              
              if (!suggestedTask && (tagData.suggestedTaskTitle || tagData.suggested_task_title || tagData.taskTitle)) {
                suggestedTask = {
                  title: tagData.suggestedTaskTitle || tagData.suggested_task_title || tagData.taskTitle,
                  description: tagData.suggestedTaskDescription || tagData.suggested_task_description || tagData.taskDescription || ''
                };
              }
              
              if (suggestedTask) {
                logger.info('Analysis', `Extracted suggested_task for tag "${tagData.name}":`, JSON.stringify(suggestedTask));
              } else if (tagData.sentiment === 'negative' || tagData.sentiment === 'neutral') {
                logger.warn('Analysis', `No suggested_task found for ${tagData.sentiment} tag "${tagData.name}". Raw tagData keys:`, Object.keys(tagData));
              }
              
              let themeId: string | null = null;
              if (themeName) {
                const matchedTheme = existingThemes.find(
                  t => t.name.toLowerCase() === themeName.toLowerCase()
                );
                if (matchedTheme) {
                  themeId = matchedTheme.id;
                }
              }
              
              const tag = await storage.createTag({
                userId,
                workspaceId: listing.workspaceId,
                listingId: listing.id,
                reservationId: reservation.id,
                themeId: themeId || (await storage.getUnassignedTheme(listing.workspaceId!))?.id || null,
                name: tagData.name || 'Unnamed Tag',
                sentiment: tagData.sentiment || 'neutral',
                priority: tagData.priority || 'medium',
                summary: tagData.summary,
                verbatimEvidence: verbatimEvidence,
                suggestedTaskTitle: suggestedTask?.title,
                suggestedTaskDescription: suggestedTask?.description,
                pendingThemeName: !themeId ? themeName : null,
                pendingThemeIcon: !themeId ? themeIcon : null,
                createdAt: reservation.checkOutDate || undefined,
              });
              
              batchTagsCreated++;
              batchTagIds.push(tag.id);
              
              sendEvent({
                type: 'tag_created',
                tag: {
                  id: tag.id,
                  name: tag.name,
                  sentiment: tag.sentiment,
                  listingName: listing.name,
                  guestName: reservation.guestName,
                  themeName: themeName || 'Unassigned'
                },
                tagsCreatedDelta: 1,
                model: modelToUse
              });
            }
          }
          
          for (const r of batch) {
            await storage.updateReservation(r.id, { tagsProcessedAt: new Date() });
          }
          
        } catch (error) {
          logger.error('Analysis', `Batch error (${modelToUse}):`, error);
          for (const r of batch) {
            await storage.updateReservation(r.id, { tagsProcessedAt: new Date() });
          }
        }
        
        return {
          tagsCreated: batchTagsCreated,
          tasksCreated: batchTasksCreated,
          processed: batch.length,
          tagIds: batchTagIds
        };
      };
      
      const processListing = async (listing: Listing) => {
        const listingReservations = allUnprocessedReservations.filter(r => r.listingId === listing.id);
        
        if (listingReservations.length === 0) {
          sendEvent({
            type: 'listing_progress',
            listingId: listing.id,
            listingName: listing.name,
            message: 'No reservations to analyze'
          });
          return { tagsCreated: 0, tasksCreated: 0, processed: 0, tagIds: [] as string[] };
        }
        
        sendEvent({
          type: 'listing_started',
          listingId: listing.id,
          listingName: listing.name,
          reservationsInListing: listingReservations.length
        });
        
        const sortedReservations = listingReservations.sort((a, b) => {
          const dateA = a.checkInDate ? new Date(a.checkInDate).getTime() : 0;
          const dateB = b.checkInDate ? new Date(b.checkInDate).getTime() : 0;
          return dateB - dateA;
        });
        
        const existingThemes = listing.workspaceId 
          ? await storage.getThemesByWorkspace(listing.workspaceId)
          : await storage.getThemesByUser(userId);
        
        const reservationAnalysisPrompt = await storage.getPromptByName("reservation_analysis");
        
        const batchSize = 8;
        const parallelBatches = 6;
        
        const allBatches: typeof sortedReservations[] = [];
        for (let i = 0; i < sortedReservations.length; i += batchSize) {
          allBatches.push(sortedReservations.slice(i, i + batchSize));
        }
        
        let listingTagsCreated = 0;
        let listingTasksCreated = 0;
        let listingProcessed = 0;
        const listingTagIds: string[] = [];
        
        for (let g = 0; g < allBatches.length; g += parallelBatches) {
          const batchGroup = allBatches.slice(g, g + parallelBatches);
          const results = await Promise.all(
            batchGroup.map(async (batch) => {
              const result = await processBatch(batch, listing, existingThemes, reservationAnalysisPrompt);
              updateCounters(result.tagsCreated, result.tasksCreated, result.processed, result.tagIds);
              sendEvent({
                type: 'progress',
                totalReservations,
                reservationsAnalyzed: totalReservationsAnalyzed,
                tagsCreated: totalTagsCreated,
                tasksCreated: totalTasksCreated,
                currentListing: listing.name
              });
              return result;
            })
          );
          
          for (const result of results) {
            listingProcessed += result.processed;
            listingTagsCreated += result.tagsCreated;
            listingTasksCreated += result.tasksCreated;
            listingTagIds.push(...result.tagIds);
          }
        }
        
        sendEvent({
          type: 'listing_complete',
          listingId: listing.id,
          listingName: listing.name,
          tagsCreated: listingTagsCreated,
          reservationsProcessed: listingProcessed
        });
        
        logger.info('Analysis', `Completed listing ${listing.id}: ${listingProcessed} reservations, ${listingTagsCreated} tags`);
        
        return { tagsCreated: listingTagsCreated, tasksCreated: listingTasksCreated, processed: listingProcessed, tagIds: listingTagIds };
      };
      
      await Promise.all(validListings.map(processListing));
      
      clearInterval(heartbeatInterval);
      sendEvent({
        type: 'complete',
        totalReservations,
        reservationsAnalyzed: totalReservationsAnalyzed,
        tagsCreated: totalTagsCreated,
        tasksCreated: totalTasksCreated,
        themesPromoted: 0,
        listingsProcessed: validListings.length
      });
      
      res.end();
      
      logger.info('Analysis', `All ${validListings.length} listings complete (PARALLEL). Total: ${totalReservationsAnalyzed} reservations, ${totalTagsCreated} tags, ${totalTasksCreated} tasks`);
      
      (async () => {
        try {
          const firstListing = validListings[0];
          if (firstListing?.workspaceId) {
            try {
              const generateThemeSummariesIfNeeded = async () => {
                const existingThemes = await storage.getThemesByWorkspace(firstListing.workspaceId!);
                for (const theme of existingThemes) {
                  if (theme.name === "Unassigned") continue;
                  try {
                    const themeTags = await storage.getTagsByTheme(theme.id);
                    if (themeTags.length >= 5) {
                      const currentTagCount = themeTags.length;
                      const lastSummaryTagCount = theme.summaryTagCount || 0;
                      if (!theme.summary || (currentTagCount - lastSummaryTagCount >= 5)) {
                        generateThemeSummary(storage, theme.id, userId, themeTags);
                      }
                    }
                  } catch (summaryErr) {
                    logger.error('Analysis', `Error checking theme summary for ${theme.name}:`, summaryErr);
                  }
                }
              };
              await generateThemeSummariesIfNeeded();
              logger.info('Analysis', 'Background theme summary generation complete');
            } catch (themeError) {
              logger.error('Analysis', 'Background theme summary generation failed:', themeError);
            }
          }
          
          logger.info('Analysis', `Starting background sentiment analysis for ${validListings.length} listings`);
          for (const listing of validListings) {
            try {
              await runBackgroundSentimentAnalysis(storage, listing.id, userId);
              logger.info('Analysis', `Background sentiment analysis complete for listing ${listing.id}`);
            } catch (bgError) {
              logger.error('Analysis', `Background sentiment analysis failed for listing ${listing.id}:`, bgError);
            }
          }
          logger.info('Analysis', 'All background sentiment analysis complete');
          
          if (allNewTagIds.length > 0 && validListings[0]?.workspaceId) {
            try {
              await autoSyncTagsToNotion(validListings[0].workspaceId, allNewTagIds);
              logger.info('Analysis', `Notion auto-sync complete for ${allNewTagIds.length} tags`);
            } catch (notionError) {
              logger.error('Analysis', 'Background Notion sync failed:', notionError);
            }
          }
        } catch (bgError) {
          logger.error('Analysis', 'Background processing error:', bgError);
        }
      })();
      
    } catch (error) {
      clearInterval(heartbeatInterval);
      logger.error('Analysis', 'Error in multi-listing analysis:', error);
      sendEvent({ type: 'error', message: 'Analysis failed' });
      res.end();
    }
  });

  app.post("/api/reviews/analyze-sentiment", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const workspaceId = getWorkspaceId(req);
      const { listingIds } = req.body as { listingIds?: string[] };

      if (workspaceId && !(await validateWorkspaceMembership(userId, workspaceId))) {
        return res.status(403).json({ message: "Not a member of this workspace" });
      }

      let reservationsList: any[];
      if (listingIds && listingIds.length > 0) {
        reservationsList = await storage.getReservationsByListingIds(listingIds);
      } else if (workspaceId) {
        reservationsList = await storage.getReservationsByWorkspace(workspaceId);
      } else {
        reservationsList = await storage.getReservationsByUser(userId);
      }

      const now = new Date();
      const isCompleted = (r: any) => {
        if (r.status === 'completed') return true;
        if (r.status === 'accepted' && r.checkOutDate && new Date(r.checkOutDate) < now) return true;
        return false;
      };
      
      const unanalyzedReservations = reservationsList.filter(r => 
        isCompleted(r) && r.aiSentimentScore === null
      );

      if (unanalyzedReservations.length === 0) {
        return res.json({ 
          message: "All reservations already analyzed", 
          analyzed: 0,
          total: reservationsList.filter(isCompleted).length
        });
      }

      let analyzedCount = 0;
      const batchSize = 10;

      for (let i = 0; i < unanalyzedReservations.length; i += batchSize) {
        const batch = unanalyzedReservations.slice(i, i + batchSize);
        
        const reservationsContext = batch.map(r => {
          const guestMessages = Array.isArray(r.conversationHistory) 
            ? r.conversationHistory.filter((m: any) => m.sender === 'guest').map((m: any) => m.message)
            : [];
          
          return {
            id: r.id,
            guestName: r.guestName,
            checkIn: r.checkInDate,
            checkOut: r.checkOutDate,
            publicReview: r.publicReview,
            privateRemarks: r.privateRemarks,
            guestRating: r.guestRating,
            guestMessages,
          };
        });

        const hasDataToAnalyze = reservationsContext.some(r => 
          r.publicReview || r.privateRemarks || r.guestMessages.length > 0
        );

        if (!hasDataToAnalyze) {
          for (const reservation of batch) {
            await storage.updateReservation(reservation.id, {
              aiSentimentScore: 4.0,
              aiGuestSummary: "No guest interaction data available - using default neutral score",
              reviewAnalyzedAt: new Date(),
            });
            analyzedCount++;
          }
          continue;
        }

        const analysisPrompt = `You are an expert short-term rental consultant. Analyze these guest reservations and provide sentiment scores based on all available data.

SCORING GUIDELINES (0-5 scale with 0.1 increments):
- 5.0: Exceptional experience, glowing praise
- 4.5: Very positive, minor suggestions at most
- 4.0: Good experience, some room for improvement (DEFAULT if no data)
- 3.5: Mixed experience, notable concerns
- 3.0: Below average, significant issues
- 2.5: Poor experience, multiple problems
- 2.0 or below: Very negative experience

DATA SOURCES (weighted by importance):
1. Public Review (if available) - most important
2. Private Remarks (if available) - honest feedback
3. Guest Messages/Conversation - communication quality and concerns

RESERVATIONS TO ANALYZE:
${reservationsContext.map((r, idx) => `
--- Reservation ${idx + 1} (ID: ${r.id}) ---
Guest: ${r.guestName}
Stay: ${r.checkIn ? new Date(r.checkIn).toLocaleDateString() : 'Unknown'} - ${r.checkOut ? new Date(r.checkOut).toLocaleDateString() : 'Unknown'}
Star Rating: ${r.guestRating || 'No rating'}
Public Review: ${r.publicReview || 'No review'}
Private Remarks: ${r.privateRemarks || 'None'}
Guest Messages: ${r.guestMessages.length > 0 ? r.guestMessages.slice(0, 5).join(' | ') : 'No messages'}
`).join('\n')}

Provide a JSON response:
{
  "reservations": [
    {
      "reservationId": "<reservation id>",
      "aiSentimentScore": <0-5 with 0.1 increments>,
      "aiPublicReviewScore": <0-5 or null if no review>,
      "aiPrivateRemarksScore": <0-5 or null if no remarks>,
      "aiConversationScore": <0-5 based on message tone>,
      "aiGuestSummary": "<1-2 sentence summary of overall experience>"
    }
  ]
}

IMPORTANT: If a reservation has no review, remarks, or messages, assign a default score of 4.0.`;

        try {
          const { modelId, modelInfo } = await getConfiguredAIModel(null, 'sentiment');
          
          const completion = await openai.chat.completions.create({
            model: modelId,
            messages: [{ role: "user", content: analysisPrompt }],
            response_format: { type: "json_object" },
            max_tokens: 2000,
          });

          const responseText = completion.choices[0]?.message?.content || "{}";
          const aiResult = JSON.parse(responseText);

          const inputTokens = completion.usage?.prompt_tokens || 0;
          const outputTokens = completion.usage?.completion_tokens || 0;
          const estimatedCost = calculateAICost(inputTokens, outputTokens, modelInfo);
          
          await storage.createAiUsageLog({
            userId,
            label: "Review Sentiment Analysis",
            model: modelId,
            inputTokens,
            outputTokens,
            estimatedCost,
          });

          for (const resResult of (aiResult.reservations || [])) {
            const reservation = batch.find(r => r.id === resResult.reservationId);
            if (reservation) {
              await storage.updateReservation(reservation.id, {
                aiSentimentScore: resResult.aiSentimentScore || 4.0,
                aiPublicReviewScore: resResult.aiPublicReviewScore,
                aiPrivateRemarksScore: resResult.aiPrivateRemarksScore,
                aiConversationScore: resResult.aiConversationScore,
                aiGuestSummary: resResult.aiGuestSummary,
                reviewAnalyzedAt: new Date(),
              });
              analyzedCount++;
            }
          }

          for (const reservation of batch) {
            const wasProcessed = (aiResult.reservations || []).some((r: any) => r.reservationId === reservation.id);
            if (!wasProcessed) {
              await storage.updateReservation(reservation.id, {
                aiSentimentScore: 4.0,
                aiGuestSummary: "Unable to analyze - using default score",
                reviewAnalyzedAt: new Date(),
              });
              analyzedCount++;
            }
          }
        } catch (aiError) {
          logger.error('Analysis', 'AI error during review analysis:', aiError);
          for (const reservation of batch) {
            await storage.updateReservation(reservation.id, {
              aiSentimentScore: 4.0,
              aiGuestSummary: "Analysis error - using default score",
              reviewAnalyzedAt: new Date(),
            });
            analyzedCount++;
          }
        }
      }

      res.json({
        message: "Sentiment analysis complete",
        analyzed: analyzedCount,
        total: reservationsList.filter(isCompleted).length,
      });
    } catch (error) {
      logger.error('Analysis', 'Error analyzing sentiment:', error);
      res.status(500).json({ message: "Failed to analyze sentiment" });
    }
  });

  app.get("/api/reviews/pending-analysis-count", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const workspaceId = getWorkspaceId(req);
      const listingIdsParam = req.query.listingIds as string || "";
      const listingIds = listingIdsParam ? listingIdsParam.split(",").filter(id => id.trim()) : [];

      if (workspaceId && !(await validateWorkspaceMembership(userId, workspaceId))) {
        return res.status(403).json({ message: "Not a member of this workspace" });
      }

      let reservationsList: any[];
      if (listingIds.length > 0) {
        reservationsList = await storage.getReservationsByListingIds(listingIds);
      } else if (workspaceId) {
        reservationsList = await storage.getReservationsByWorkspace(workspaceId);
      } else {
        reservationsList = await storage.getReservationsByUser(userId);
      }

      const now = new Date();
      const completedReservations = reservationsList.filter(r => {
        if (r.status === 'completed') return true;
        if (r.status === 'accepted' && r.checkOutDate && new Date(r.checkOutDate) < now) return true;
        return false;
      });
      const tagProcessedReservations = completedReservations.filter(r => r.tagsProcessedAt);
      const withSentiment = completedReservations.filter(r => r.aiSentimentScore !== null);
      const pendingAnalysis = tagProcessedReservations.filter(r => r.aiSentimentScore === null);

      res.json({
        pending: pendingAnalysis.length,
        total: tagProcessedReservations.length,
        analyzed: withSentiment.length,
        totalReservations: completedReservations.length,
        tagsProcessed: tagProcessedReservations.length,
      });
    } catch (error) {
      logger.error('Analysis', 'Error getting pending analysis count:', error);
      res.status(500).json({ message: "Failed to get count" });
    }
  });
  
  app.get("/api/listings", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      let workspaceId = getWorkspaceId(req);
      
      if (workspaceId && !(await validateWorkspaceMembership(userId, workspaceId))) {
        logger.info('Listings', `Falling back to user-scoped for /api/listings - invalid workspace ${workspaceId} for user ${userId}`);
        workspaceId = null;
      }
      
      let allListings;
      if (workspaceId) {
        allListings = await storage.getListingsByWorkspace(workspaceId);
      } else {
        allListings = await storage.getListingsByUser(userId);
      }
      
      const listingsWithAnalysis = await Promise.all(
        allListings.map(async (listing) => {
          const analysis = await storage.getLatestAnalysisByListing(listing.id);
          return { ...listing, analysis };
        })
      );
      
      res.json(listingsWithAnalysis);
    } catch (error) {
      logger.error('Listings', 'Error fetching listings:', error);
      res.status(500).json({ message: "Failed to fetch listings" });
    }
  });

  app.get("/api/listings/stats", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const workspaceId = getWorkspaceId(req);
      
      const startDateStr = req.query.startDate as string | undefined;
      const endDateStr = req.query.endDate as string | undefined;
      let startDate: Date | null = null;
      let endDate: Date | null = null;
      
      if (startDateStr && endDateStr) {
        const parsedStart = new Date(startDateStr);
        const parsedEnd = new Date(endDateStr);
        if (!isNaN(parsedStart.getTime()) && !isNaN(parsedEnd.getTime())) {
          startDate = parsedStart;
          endDate = parsedEnd;
        }
      }
      
      let allListings;
      if (workspaceId && await validateWorkspaceMembership(userId, workspaceId)) {
        allListings = await storage.getListingsByWorkspace(workspaceId);
      } else {
        allListings = await storage.getListingsByUser(userId);
      }
      
      let totalScore = 0;
      let analyzedCount = 0;
      
      for (const listing of allListings) {
        const analysis = await storage.getLatestAnalysisByListing(listing.id);
        if (analysis?.score) {
          totalScore += analysis.score;
          analyzedCount++;
        }
      }
      
      let dateRangeStats = null;
      if (startDate && endDate) {
        let allReservations;
        if (workspaceId && await validateWorkspaceMembership(userId, workspaceId)) {
          allReservations = await storage.getReservationsByWorkspace(workspaceId);
        } else {
          allReservations = await storage.getReservationsByUser(userId);
        }
        
        const reservationsInRange = allReservations.filter(r => {
          const checkIn = r.checkIn ? new Date(r.checkIn) : null;
          if (!checkIn) return false;
          return checkIn >= startDate && checkIn <= endDate;
        });
        
        const reservationIds = reservationsInRange.map(r => r.id);
        let allTags;
        if (workspaceId && await validateWorkspaceMembership(userId, workspaceId)) {
          allTags = await storage.getTagsByWorkspace(workspaceId);
        } else {
          allTags = await storage.getTagsByUser(userId);
        }
        
        const tagsInRange = allTags.filter(t => t.reservationId && reservationIds.includes(t.reservationId));
        
        dateRangeStats = {
          reservationsInRange: reservationsInRange.length,
          tagsInRange: tagsInRange.length,
          positiveTags: tagsInRange.filter(t => t.sentiment === "positive").length,
          negativeTags: tagsInRange.filter(t => t.sentiment === "negative").length,
          neutralTags: tagsInRange.filter(t => t.sentiment === "neutral").length,
        };
      }
      
      res.json({
        totalListings: allListings.length,
        analyzedListings: analyzedCount,
        overallScore: analyzedCount > 0 ? totalScore / analyzedCount : 0,
        autoAnalysisEnabled: allListings.filter(l => l.autoAnalysisEnabled).length,
        dateRangeStats,
      });
    } catch (error) {
      logger.error('Listings', 'Error fetching listing stats:', error);
      res.status(500).json({ message: "Failed to fetch listing stats" });
    }
  });

  app.post("/api/listings/unprocessed-count", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      
      const parseResult = unprocessedCountSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ 
          message: "Invalid request", 
          errors: parseResult.error.flatten().fieldErrors 
        });
      }
      
      const { listingIds } = parseResult.data;
      
      const allListings = await storage.getListingsByUser(userId);
      const userListingIds = new Set(allListings.map(l => l.id));
      const validListingIds = listingIds.filter(id => userListingIds.has(id));
      
      if (validListingIds.length === 0) {
        return res.json({ totalUnprocessed: 0 });
      }
      
      const totalUnprocessed = await storage.getUnprocessedReservationCountForListings(validListingIds);
      res.json({ totalUnprocessed });
    } catch (error) {
      logger.error('Listings', 'Error fetching unprocessed count:', error);
      res.status(500).json({ message: "Failed to fetch unprocessed count" });
    }
  });

  app.get("/api/listings/suggestions", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const allListings = await storage.getListingsByUser(userId);
      
      const listingSuggestions: Array<{
        listingId: string;
        listingName: string;
        listingImage: string | null;
        suggestions: string[];
      }> = [];
      
      for (const listing of allListings) {
        const analysis = await storage.getLatestAnalysisByListing(listing.id);
        if (analysis?.suggestions && (analysis.suggestions as string[]).length > 0) {
          listingSuggestions.push({
            listingId: listing.id,
            listingName: listing.name,
            listingImage: listing.imageUrl,
            suggestions: (analysis.suggestions as string[]).slice(0, 3),
          });
        }
      }
      
      res.json(listingSuggestions);
    } catch (error) {
      logger.error('Listings', 'Error fetching suggestions:', error);
      res.status(500).json({ message: "Failed to fetch suggestions" });
    }
  });

  app.get("/api/listings/pending-actions", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const workspaceId = getWorkspaceId(req);
      
      if (workspaceId && !(await validateWorkspaceMembership(userId, workspaceId))) {
        return res.status(403).json({ message: "Not a member of this workspace" });
      }
      
      let allListings;
      if (workspaceId) {
        allListings = await storage.getListingsByWorkspace(workspaceId);
      } else {
        allListings = await storage.getListingsByUser(userId);
      }
      
      const pendingListings = allListings.filter(l => 
        l.webhookStatus && l.webhookStatus !== "active"
      );
      
      res.json(pendingListings);
    } catch (error) {
      logger.error('Listings', 'Error fetching pending listings:', error);
      res.status(500).json({ message: "Failed to fetch pending listings" });
    }
  });

  app.post("/api/listings/:id/approve-sync", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const workspaceId = getWorkspaceId(req);
      const listingId = getParamId(req.params.id);
      
      const listing = await storage.getListing(listingId);
      if (!listing || listing.userId !== userId) {
        return res.status(404).json({ message: "Listing not found" });
      }
      
      if (workspaceId) {
        if (!(await validateWorkspaceMembership(userId, workspaceId))) {
          return res.status(403).json({ message: "Not a member of this workspace" });
        }
        if (listing.workspaceId !== workspaceId) {
          return res.status(403).json({ message: "Listing does not belong to this workspace" });
        }
      }
      
      if (listing.webhookStatus !== "pending_sync") {
        return res.status(400).json({ message: "Listing is not pending sync" });
      }
      
      const pendingData = listing.webhookPendingData as any;
      const propertyData = pendingData?.data?.property || pendingData?.data;
      if (propertyData) {
        let addressValue = listing.address;
        if (propertyData.address) {
          if (typeof propertyData.address === 'string') {
            addressValue = propertyData.address;
          } else if (typeof propertyData.address === 'object') {
            addressValue = [
              propertyData.address.street,
              propertyData.address.city,
              propertyData.address.state,
              propertyData.address.country
            ].filter(Boolean).join(', ');
          }
        }
        
        await storage.updateListing(listingId, {
          name: propertyData.name || listing.name,
          address: addressValue,
          imageUrl: propertyData.picture || listing.imageUrl,
          webhookStatus: "active",
          webhookPendingData: null,
        });
      } else {
        await storage.updateListing(listingId, {
          webhookStatus: "active",
          webhookPendingData: null,
        });
      }
      
      res.json({ message: "Property sync approved" });
    } catch (error) {
      logger.error('Sync', 'Error approving sync:', error);
      res.status(500).json({ message: "Failed to approve sync" });
    }
  });

  app.post("/api/listings/:id/dismiss-sync", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const workspaceId = getWorkspaceId(req);
      const listingId = getParamId(req.params.id);
      
      const listing = await storage.getListing(listingId);
      if (!listing || listing.userId !== userId) {
        return res.status(404).json({ message: "Listing not found" });
      }
      
      if (workspaceId) {
        if (!(await validateWorkspaceMembership(userId, workspaceId))) {
          return res.status(403).json({ message: "Not a member of this workspace" });
        }
        if (listing.workspaceId !== workspaceId) {
          return res.status(403).json({ message: "Listing does not belong to this workspace" });
        }
      }
      
      if (listing.webhookStatus !== "pending_sync") {
        return res.status(400).json({ message: "Listing is not pending sync" });
      }
      
      await storage.updateListing(listingId, {
        webhookStatus: "active",
        webhookPendingData: null,
      });
      
      res.json({ message: "Sync dismissed" });
    } catch (error) {
      logger.error('Sync', 'Error dismissing sync:', error);
      res.status(500).json({ message: "Failed to dismiss sync" });
    }
  });

  app.post("/api/listings/:id/confirm-delete", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const workspaceId = getWorkspaceId(req);
      const listingId = getParamId(req.params.id);
      
      const listing = await storage.getListing(listingId);
      if (!listing || listing.userId !== userId) {
        return res.status(404).json({ message: "Listing not found" });
      }
      
      if (workspaceId) {
        if (!(await validateWorkspaceMembership(userId, workspaceId))) {
          return res.status(403).json({ message: "Not a member of this workspace" });
        }
        if (listing.workspaceId !== workspaceId) {
          return res.status(403).json({ message: "Listing does not belong to this workspace" });
        }
      }
      
      if (listing.webhookStatus !== "pending_delete") {
        return res.status(400).json({ message: "Listing is not pending deletion" });
      }
      
      await storage.deleteListing(listingId);
      res.json({ message: "Property deleted" });
    } catch (error) {
      logger.error('Sync', 'Error confirming delete:', error);
      res.status(500).json({ message: "Failed to delete property" });
    }
  });

  app.post("/api/listings/:id/keep-property", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const workspaceId = getWorkspaceId(req);
      const listingId = getParamId(req.params.id);
      
      const listing = await storage.getListing(listingId);
      if (!listing || listing.userId !== userId) {
        return res.status(404).json({ message: "Listing not found" });
      }
      
      if (workspaceId) {
        if (!(await validateWorkspaceMembership(userId, workspaceId))) {
          return res.status(403).json({ message: "Not a member of this workspace" });
        }
        if (listing.workspaceId !== workspaceId) {
          return res.status(403).json({ message: "Listing does not belong to this workspace" });
        }
      }
      
      if (listing.webhookStatus !== "pending_delete") {
        return res.status(400).json({ message: "Listing is not pending deletion" });
      }
      
      await storage.updateListing(listingId, {
        webhookStatus: "active",
        webhookPendingData: null,
      });
      
      res.json({ message: "Property kept" });
    } catch (error) {
      logger.error('Sync', 'Error keeping property:', error);
      res.status(500).json({ message: "Failed to keep property" });
    }
  });

  app.post("/api/listings/:id/confirm-merge", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const workspaceId = getWorkspaceId(req);
      const listingId = getParamId(req.params.id);
      
      const listing = await storage.getListing(listingId);
      if (!listing || listing.userId !== userId) {
        return res.status(404).json({ message: "Listing not found" });
      }
      
      if (workspaceId) {
        if (!(await validateWorkspaceMembership(userId, workspaceId))) {
          return res.status(403).json({ message: "Not a member of this workspace" });
        }
        if (listing.workspaceId !== workspaceId) {
          return res.status(403).json({ message: "Listing does not belong to this workspace" });
        }
      }
      
      if (listing.webhookStatus !== "pending_merge") {
        return res.status(400).json({ message: "Listing is not pending merge" });
      }
      
      await storage.deleteListing(listingId);
      res.json({ message: "Merge confirmed, property removed" });
    } catch (error) {
      logger.error('Sync', 'Error confirming merge:', error);
      res.status(500).json({ message: "Failed to confirm merge" });
    }
  });

  app.get("/api/listings/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const listing = await storage.getListing(getParamId(req.params.id));
      
      if (!listing || listing.userId !== userId) {
        return res.status(404).json({ message: "Listing not found" });
      }
      
      const analysis = await storage.getLatestAnalysisByListing(listing.id);
      res.json({ ...listing, analysis });
    } catch (error) {
      logger.error('Listings', 'Error fetching listing:', error);
      res.status(500).json({ message: "Failed to fetch listing" });
    }
  });

  app.get("/api/listings/:id/reservations", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const listing = await storage.getListing(getParamId(req.params.id));
      
      if (!listing || listing.userId !== userId) {
        return res.status(404).json({ message: "Listing not found" });
      }
      
      const reservationsList = await storage.getReservationsByListing(listing.id);
      
      const reservationsWithTags = await Promise.all(
        reservationsList.map(async (reservation) => {
          const tags = await storage.getTagsByReservation(reservation.id);
          return { ...reservation, tags };
        })
      );
      
      res.json(reservationsWithTags);
    } catch (error) {
      logger.error('Listings', 'Error fetching reservations:', error);
      res.status(500).json({ message: "Failed to fetch reservations" });
    }
  });

  app.get("/api/reservations/chart-data", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const workspaceId = getWorkspaceId(req);
      
      if (workspaceId && !(await validateWorkspaceMembership(userId, workspaceId))) {
        return res.status(403).json({ message: "Not a member of this workspace" });
      }
      
      const allReservations = workspaceId 
        ? await storage.getReservationsByWorkspace(workspaceId)
        : await storage.getReservationsByUser(userId);
      
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 365);
      
      const filteredReservations = allReservations.filter(r => {
        const checkInDate = r.checkIn ? new Date(r.checkIn) : null;
        if (!checkInDate) return false;
        return checkInDate >= cutoffDate;
      });
      
      const getWeekStart = (date: Date): string => {
        const d = new Date(date);
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1);
        d.setDate(diff);
        return d.toISOString().split('T')[0];
      };
      
      const weekMap: Record<string, number> = {};
      
      for (const reservation of filteredReservations) {
        if (!reservation.checkIn) continue;
        const weekKey = getWeekStart(new Date(reservation.checkIn));
        weekMap[weekKey] = (weekMap[weekKey] || 0) + 1;
      }
      
      const chartData = Object.entries(weekMap)
        .map(([weekStart, count]) => ({ weekStart, count }))
        .sort((a, b) => a.weekStart.localeCompare(b.weekStart));
      
      res.json({ chartData });
    } catch (error) {
      logger.error('Listings', 'Error fetching reservation chart data:', error);
      res.status(500).json({ message: "Failed to fetch chart data" });
    }
  });

  app.get("/api/reservations", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const workspaceId = getWorkspaceId(req);
      
      const returnAll = req.query.all === "true";
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;
      
      if (workspaceId && !(await validateWorkspaceMembership(userId, workspaceId))) {
        return res.status(403).json({ message: "Not a member of this workspace" });
      }
      
      const allReservations = workspaceId 
        ? await storage.getReservationsByWorkspace(workspaceId)
        : await storage.getReservationsByUser(userId);
      
      allReservations.sort((a, b) => {
        const aDate = a.checkIn ? new Date(a.checkIn).getTime() : 0;
        const bDate = b.checkIn ? new Date(b.checkIn).getTime() : 0;
        return bDate - aDate;
      });
      
      if (returnAll) {
        const reservationsWithTags = await Promise.all(
          allReservations.map(async (reservation) => {
            const tags = await storage.getTagsByReservation(reservation.id);
            return { ...reservation, tags };
          })
        );
        return res.json(reservationsWithTags);
      }
      
      const paginatedReservations = allReservations.slice(offset, offset + limit);
      
      const reservationsWithTags = await Promise.all(
        paginatedReservations.map(async (reservation) => {
          const tags = await storage.getTagsByReservation(reservation.id);
          return { ...reservation, tags };
        })
      );
      
      res.json({
        items: reservationsWithTags,
        total: allReservations.length,
        hasMore: offset + limit < allReservations.length,
        nextOffset: offset + limit,
      });
    } catch (error) {
      logger.error('Listings', 'Error fetching all reservations:', error);
      res.status(500).json({ message: "Failed to fetch reservations" });
    }
  });

  app.get("/api/inbox/conversations", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const workspaceId = getWorkspaceId(req);
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
      const offset = parseInt(req.query.offset as string) || 0;
      
      if (workspaceId && !(await validateWorkspaceMembership(userId, workspaceId))) {
        return res.status(403).json({ message: "Not a member of this workspace" });
      }
      
      const allReservations = workspaceId 
        ? await storage.getReservationsByWorkspace(workspaceId)
        : await storage.getReservationsByUser(userId);
      
      const allListings = workspaceId
        ? await storage.getListingsByWorkspace(workspaceId)
        : await storage.getListingsByUser(userId);
      
      const listingsMap = new Map(allListings.map(l => [l.id, l]));
      
      const reservationsWithConversations = allReservations
        .filter(r => r.conversationHistory && (r.conversationHistory as any[]).length > 0);
      
      reservationsWithConversations.sort((a, b) => {
        const aMessages = a.conversationHistory as any[] || [];
        const bMessages = b.conversationHistory as any[] || [];
        const aLast = aMessages[aMessages.length - 1]?.timestamp || 0;
        const bLast = bMessages[bMessages.length - 1]?.timestamp || 0;
        return new Date(bLast).getTime() - new Date(aLast).getTime();
      });
      
      const totalCount = reservationsWithConversations.length;
      const paginatedReservations = reservationsWithConversations.slice(offset, offset + limit);
      
      const reservationIds = paginatedReservations.map(r => r.id);
      const tagsByReservation = await storage.getTagsByReservationIds(reservationIds);
      
      const conversationsWithDetails = paginatedReservations.map(reservation => {
        const messages = reservation.conversationHistory as any[] || [];
        const lastMessage = messages[messages.length - 1];
        const listing = listingsMap.get(reservation.listingId);
        const tags = tagsByReservation.get(reservation.id) || [];
        
        const lastMsgContent = lastMessage?.message || lastMessage?.content || '';
        const lastMsgSender = lastMessage?.sender || lastMessage?.senderType || '';
        
        return {
          id: reservation.id,
          guestName: reservation.guestName,
          guestEmail: reservation.guestEmail,
          guestProfilePicture: reservation.guestProfilePicture || null,
          confirmationCode: reservation.confirmationCode || null,
          checkIn: reservation.checkInDate,
          checkOut: reservation.checkOutDate,
          status: reservation.status,
          platform: reservation.platform || "airbnb",
          listingId: reservation.listingId,
          listing: listing ? { 
            id: listing.id, 
            name: listing.name, 
            internalName: listing.internalName || null,
            imageUrl: listing.imageUrl || null,
          } : null,
          tags,
          messageCount: messages.length,
          lastMessage: lastMessage ? {
            content: lastMsgContent.substring(0, 200),
            timestamp: lastMessage.timestamp,
            senderType: lastMsgSender,
          } : null,
        };
      });
      
      res.json({
        conversations: conversationsWithDetails,
        pagination: {
          total: totalCount,
          limit,
          offset,
          hasMore: offset + limit < totalCount,
        }
      });
    } catch (error) {
      logger.error('Listings', 'Error fetching inbox conversations:', error);
      res.status(500).json({ message: "Failed to fetch conversations" });
    }
  });

  app.get("/api/inbox/conversations/:reservationId", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const workspaceId = getWorkspaceId(req);
      const { reservationId } = req.params;
      
      if (workspaceId && !(await validateWorkspaceMembership(userId, workspaceId))) {
        return res.status(403).json({ message: "Not a member of this workspace" });
      }
      
      const reservation = await storage.getReservation(reservationId);
      if (!reservation) {
        return res.status(404).json({ message: "Conversation not found" });
      }
      
      if (workspaceId && reservation.workspaceId !== workspaceId) {
        return res.status(403).json({ message: "Not authorized to view this conversation" });
      }
      
      const listing = await storage.getListing(reservation.listingId);
      const tags = await storage.getTagsByReservation(reservationId);
      
      res.json({
        ...reservation,
        listing: listing ? { id: listing.id, name: listing.name, thumbnail: listing.thumbnail } : null,
        tags,
      });
    } catch (error) {
      logger.error('Listings', 'Error fetching conversation:', error);
      res.status(500).json({ message: "Failed to fetch conversation" });
    }
  });

  app.post("/api/listings", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const workspaceId = getWorkspaceId(req);
      
      if (workspaceId && !(await validateWorkspaceMembership(userId, workspaceId))) {
        return res.status(403).json({ message: "Not a member of this workspace" });
      }
      
      const validatedData = insertListingSchema.parse({
        ...req.body,
        userId,
        workspaceId: workspaceId || undefined,
      });
      
      const listing = await storage.createListing(validatedData);
      res.status(201).json(listing);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      logger.error('Listings', 'Error creating listing:', error);
      res.status(500).json({ message: "Failed to create listing" });
    }
  });

  app.patch("/api/listings/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const workspaceId = getWorkspaceId(req);
      const listing = await storage.getListing(getParamId(req.params.id));
      
      if (!listing) {
        return res.status(404).json({ message: "Listing not found" });
      }
      
      const hasAccess = listing.userId === userId || 
        (workspaceId && listing.workspaceId === workspaceId && await validateWorkspaceMembership(userId, workspaceId));
      
      if (!hasAccess) {
        return res.status(404).json({ message: "Listing not found" });
      }
      
      const safeUpdate = { ...req.body };
      delete safeUpdate.workspaceId;
      delete safeUpdate.userId;
      
      const updated = await storage.updateListing(getParamId(req.params.id), safeUpdate);
      res.json(updated);
    } catch (error) {
      logger.error('Listings', 'Error updating listing:', error);
      res.status(500).json({ message: "Failed to update listing" });
    }
  });

  app.delete("/api/listings/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const workspaceId = getWorkspaceId(req);
      const listing = await storage.getListing(getParamId(req.params.id));
      
      if (!listing) {
        return res.status(404).json({ message: "Listing not found" });
      }
      
      const hasAccess = listing.userId === userId || 
        (workspaceId && listing.workspaceId === workspaceId && await validateWorkspaceMembership(userId, workspaceId));
      
      if (!hasAccess) {
        return res.status(404).json({ message: "Listing not found" });
      }
      
      await storage.deleteListing(getParamId(req.params.id));
      res.status(204).send();
    } catch (error) {
      logger.error('Listings', 'Error deleting listing:', error);
      res.status(500).json({ message: "Failed to delete listing" });
    }
  });
}
