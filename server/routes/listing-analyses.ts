import type { Express } from "express";
import { IStorage } from "../storage";
import { isAuthenticated } from "../replit_integrations/auth";
import { config } from "../config";
import { logger } from "../logger";
import { openai, getConfiguredAIModel, calculateAICost } from "./ai-helpers";
import { getUserId, getWorkspaceId, validateWorkspaceMembership, getParamId } from "./helpers";
import {
  type IdealGuestProfile,
  type CategoryAnalysis,
  AI_MODELS,
  type AIModelId,
} from "@shared/schema";
import { z } from "zod";
import archiver from "archiver";
import crypto from "crypto";
import { getValidAccessToken } from "../services/hospitable";

const GRADE_TO_SCORE: Record<string, number> = { "A": 10, "B": 8, "C": 6, "D": 4, "F": 2 };

function repairTruncatedJson(text: string): any {
  let cleaned = text.trim();
  let openBraces = 0;
  let openBrackets = 0;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (escaped) { escaped = false; continue; }
    if (ch === '\\') { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') openBraces++;
    if (ch === '}') openBraces--;
    if (ch === '[') openBrackets++;
    if (ch === ']') openBrackets--;
  }

  if (inString) {
    const lastQuote = cleaned.lastIndexOf('"');
    if (lastQuote > 0) {
      cleaned = cleaned.substring(0, lastQuote) + '"';
      inString = false;
      openBraces = 0; openBrackets = 0;
      for (let i = 0; i < cleaned.length; i++) {
        const ch = cleaned[i];
        if (escaped) { escaped = false; continue; }
        if (ch === '\\') { escaped = true; continue; }
        if (ch === '"') { inString = !inString; continue; }
        if (inString) continue;
        if (ch === '{') openBraces++;
        if (ch === '}') openBraces--;
        if (ch === '[') openBrackets++;
        if (ch === ']') openBrackets--;
      }
    }
  }

  const lastNonSpace = cleaned.replace(/\s+$/, '');
  const lastChar = lastNonSpace[lastNonSpace.length - 1];
  if (lastChar === ',' || lastChar === ':') {
    cleaned = lastNonSpace.substring(0, lastNonSpace.length - 1);
  }

  while (openBrackets > 0) { cleaned += ']'; openBrackets--; }
  while (openBraces > 0) { cleaned += '}'; openBraces--; }

  try {
    return JSON.parse(cleaned);
  } catch (e) {
    logger.error('Analysis', `JSON repair failed: ${e}`);
    return null;
  }
}

function normalizeGrade(grade: string | null | undefined): string | null {
  if (!grade || grade === "N/A") return grade || null;
  const upper = grade.toUpperCase().trim();
  if (["A", "B", "C", "D", "F"].includes(upper)) return upper;
  const base = upper.charAt(0);
  if (["A", "B", "C", "D", "F"].includes(base)) {
    if (upper.includes("+")) {
      const upgraded: Record<string, string> = { "B": "A", "C": "B", "D": "C", "F": "D" };
      return upgraded[base] || base;
    }
    if (upper.includes("-")) {
      const downgraded: Record<string, string> = { "A": "B", "B": "C", "C": "D", "D": "F" };
      return downgraded[base] || base;
    }
    return base;
  }
  return null;
}

function gradeToNumeric(grade: string | null | undefined): number | null {
  if (!grade || grade === "N/A") return null;
  const normalized = normalizeGrade(grade);
  if (!normalized) return null;
  return GRADE_TO_SCORE[normalized] ?? null;
}

function numericToGrade(score: number): string {
  if (score >= 9) return "A";
  if (score >= 7) return "B";
  if (score >= 5) return "C";
  if (score >= 3) return "D";
  return "F";
}

const DEFAULT_CATEGORY_WEIGHTS: Record<string, number> = {
  title: 10, description: 15, pet: 5, reviews: 20, photos: 15,
  sleep: 10, host_profile: 5, guest_favorites: 5, superhost_status: 5, ideal_guest_profile: 10,
};

async function recalculateOverallGrade(analysisId: string, storage: IStorage): Promise<void> {
  try {
    const analysis = await storage.getAnalysis(analysisId);
    if (!analysis) return;

    const weightsSetting = await storage.getSystemSetting("category_weights");
    let categoryWeights = { ...DEFAULT_CATEGORY_WEIGHTS };
    if (weightsSetting?.value) {
      try { categoryWeights = JSON.parse(weightsSetting.value); } catch {}
    }

    const categoryGrades: Record<string, string | null> = {
      title: analysis.titleGrade || null,
      description: analysis.descriptionGrade || null,
      pet: analysis.petGrade || null,
      reviews: analysis.reviewsGrade || null,
      photos: analysis.photosGrade || null,
      sleep: analysis.sleepGrade || null,
      host_profile: analysis.superhostGrade || null,
      guest_favorites: analysis.guestFavGrade || null,
      superhost_status: analysis.superhostStatusGrade || null,
      ideal_guest_profile: analysis.idealGrade || null,
    };

    let weightedSum = 0;
    let totalWeight = 0;
    for (const [cat, grade] of Object.entries(categoryGrades)) {
      const numScore = gradeToNumeric(grade);
      const weight = categoryWeights[cat] ?? 0;
      if (numScore !== null && weight > 0) {
        weightedSum += numScore * weight;
        totalWeight += weight;
      }
    }

    if (totalWeight > 0) {
      const weightedAvg = weightedSum / totalWeight;
      const overallGrade = numericToGrade(weightedAvg);
      const overallScore = Math.round(weightedAvg * 10) / 10;
      await storage.updateAnalysis(analysisId, { overallGrade, score: overallScore });
      logger.info('Analysis', `Overall grade recalculated: ${overallGrade} (score: ${overallScore}) for analysis ${analysisId}`);
    }
  } catch (err) {
    logger.error('Analysis', "Error recalculating overall grade:", err);
  }
}

export function registerListingAnalysisRoutes(app: Express, storage: IStorage) {
  // =====================
  // Listing Analysis
  // =====================
  
  app.get("/api/listings/:id/analyses", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const listing = await storage.getListing(getParamId(req.params.id));
      
      if (!listing || listing.userId !== userId) {
        return res.status(404).json({ message: "Listing not found" });
      }
      
      const analyses = await storage.getAnalysesByListing(listing.id);
      res.json(analyses);
    } catch (error) {
      logger.error('Analysis', "Error fetching analyses:", error);
      res.status(500).json({ message: "Failed to fetch analyses" });
    }
  });

  app.post("/api/listings/:id/analyze", isAuthenticated, async (req, res) => {
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

      const { accessToken: validAccessToken, error: tokenError } = await getValidAccessToken(listing.dataSourceId);
      if (!validAccessToken) {
        return res.status(400).json({ message: tokenError || "Failed to get valid access token" });
      }
      const apiAccessToken = validAccessToken;

      let reviews: any[] = [];
      let propertyDetails: any = null;
      const MAX_PAGES = 100;
      
      try {
        let page = 1;
        let hasMorePages = true;
        
        while (hasMorePages && page <= MAX_PAGES) {
          const reviewsResponse = await fetch(
            `https://public.api.hospitable.com/v2/properties/${listing.externalId}/reviews?page=${page}&per_page=100`,
            {
              headers: {
                "Authorization": `Bearer ${apiAccessToken}`,
                "Content-Type": "application/json",
              },
            }
          );

          if (reviewsResponse.ok) {
            const reviewsData = await reviewsResponse.json();
            const pageReviews = reviewsData.data || [];
            
            if (pageReviews.length === 0) {
              hasMorePages = false;
              break;
            }
            
            reviews = [...reviews, ...pageReviews];
            
            const meta = reviewsData.meta;
            if (meta && typeof meta.current_page === 'number' && typeof meta.last_page === 'number') {
              if (meta.current_page >= meta.last_page) {
                hasMorePages = false;
              } else {
                page++;
              }
            } else {
              if (pageReviews.length < 100) {
                hasMorePages = false;
              } else {
                page++;
              }
            }
          } else {
            hasMorePages = false;
          }
        }
        
        if (page >= MAX_PAGES) {
          logger.warn('Analysis', `Warning: Hit MAX_PAGES limit (${MAX_PAGES}) for listing ${listing.name}. Some reviews may not be included.`);
        }
        logger.info('Analysis', `Fetched ${reviews.length} total reviews for listing ${listing.name} (${page} page${page > 1 ? 's' : ''})`);
        
        const propertyResponse = await fetch(
          `https://public.api.hospitable.com/v2/properties/${listing.externalId}?include=details`,
          {
            headers: {
              "Authorization": `Bearer ${apiAccessToken}`,
              "Content-Type": "application/json",
            },
          }
        );

        if (propertyResponse.ok) {
          propertyDetails = await propertyResponse.json();
          logger.info('Analysis', `Fetched property details for ${listing.name}`);
        }
      } catch (fetchError) {
        logger.error('Analysis', "Error fetching data from Hospitable:", fetchError);
      }

      let guestConversations: { guestName: string; messages: string[] }[] = [];
      try {
        let reservationsPage = 1;
        let hasMoreReservations = true;
        const allReservations: any[] = [];
        const MAX_RESERVATION_PAGES = 20;
        
        while (hasMoreReservations && reservationsPage <= MAX_RESERVATION_PAGES) {
          const searchParams = new URLSearchParams({
            'include': 'guest',
            'page': String(reservationsPage),
            'per_page': '50'
          });
          const reservationsUrl = `https://public.api.hospitable.com/v2/reservations?${searchParams.toString()}&properties[]=${encodeURIComponent(listing.externalId || '')}`;
          logger.info('Analysis', `Fetching reservations from: ${reservationsUrl}`);
          
          const reservationsResponse = await fetch(
            reservationsUrl,
            {
              headers: {
                "Authorization": `Bearer ${apiAccessToken}`,
                "Content-Type": "application/json",
              },
            }
          );

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
            logger.info('Analysis', `Reservations page ${reservationsPage}: found ${pageReservations.length} reservations`);
            
            if (pageReservations.length === 0) {
              hasMoreReservations = false;
              break;
            }
            
            allReservations.push(...pageReservations);
            
            const meta = reservationsData.meta;
            if (meta && typeof meta.current_page === 'number' && typeof meta.last_page === 'number') {
              if (meta.current_page >= meta.last_page) {
                hasMoreReservations = false;
              } else {
                reservationsPage++;
              }
            } else {
              if (pageReservations.length < 50) {
                hasMoreReservations = false;
              } else {
                reservationsPage++;
              }
            }
          } else {
            const errorText = await reservationsResponse.text();
            logger.error('Analysis', `Reservations API failed with status ${reservationsResponse.status}: ${errorText}`);
            hasMoreReservations = false;
          }
        }
        
        logger.info('Analysis', `Fetched ${allReservations.length} reservations for listing ${listing.name}`);
        
        const recentReservations = allReservations;
        
        for (const reservation of recentReservations) {
          try {
            const conversationResponse = await fetch(
              `https://public.api.hospitable.com/v2/reservations/${reservation.id}/messages`,
              {
                headers: {
                  "Authorization": `Bearer ${apiAccessToken}`,
                  "Content-Type": "application/json",
                },
              }
            );
            
            if (conversationResponse.ok) {
              const conversationData = await conversationResponse.json();
              const messages = conversationData.data || [];
              logger.info('Analysis', `Reservation ${reservation.id}: found ${messages.length} total messages`);
              
              if (messages.length > 0) {
                logger.info('Analysis', `  Sample message structure:`, JSON.stringify({
                  sender_type: messages[0].sender_type,
                  body_preview: messages[0].body?.substring(0, 50),
                }, null, 2));
              }
              
              const guestMessages = messages
                .filter((msg: any) => msg.sender_type === 'guest')
                .map((msg: any) => msg.body || "")
                .filter((text: string) => text.length > 0);
              
              logger.info('Analysis', `  -> ${guestMessages.length} guest messages extracted`);
              
              if (guestMessages.length > 0) {
                const guestName = reservation.guest?.full_name || 
                                  (reservation.guest?.first_name && reservation.guest?.last_name ? `${reservation.guest.first_name} ${reservation.guest.last_name}` : reservation.guest?.first_name) ||
                                  messages.find((m: any) => m.sender_type === 'guest')?.sender?.full_name ||
                                  messages.find((m: any) => m.sender_type === 'guest')?.sender?.first_name ||
                                  "Guest";
                guestConversations.push({
                  guestName,
                  messages: guestMessages.slice(0, 5),
                });
              }
            } else {
              const errorText = await conversationResponse.text();
              logger.error('Analysis', `Messages API failed for reservation ${reservation.id} with status ${conversationResponse.status}: ${errorText.substring(0, 200)}`);
            }
          } catch (convError) {
            logger.info('Analysis', `Could not fetch conversation for reservation ${reservation.id}`);
          }
        }
        
        logger.info('Analysis', `Extracted conversations from ${guestConversations.length} guests for listing ${listing.name}`);
      } catch (reservationError) {
        logger.error('Analysis', "Error fetching reservations:", reservationError);
      }

      const reviewTexts = reviews.map((r: any) => ({
        publicReview: r.public?.review || r.public_review || r.review || "",
        privateRemarks: r.private?.feedback || r.private_remarks || r.private_review || "",
        rating: r.public?.rating || r.rating || r.overall_rating,
        guestName: r.guest?.full_name || r.guest?.first_name || r.guest_name || "Guest",
        date: r.reviewed_at || r.created_at || r.date,
      }));
      
      const reviewsWithRatings = reviewTexts.filter(r => r.rating && typeof r.rating === 'number');
      const averageRating = reviewsWithRatings.length > 0 
        ? reviewsWithRatings.reduce((sum, r) => sum + r.rating, 0) / reviewsWithRatings.length 
        : null;

      const description = propertyDetails?.description || propertyDetails?.public_name || listing.description || "";
      const summary = propertyDetails?.summary || listing.summary || "";
      const fullDescription = summary ? `${summary}\n\n${description}` : description;
      
      const listingContext = {
        name: listing.name,
        propertyType: listing.propertyType || propertyDetails?.property_type,
        bedrooms: listing.bedrooms || propertyDetails?.capacity?.bedrooms,
        bathrooms: listing.bathrooms || propertyDetails?.capacity?.bathrooms,
        description: fullDescription,
        summary: summary,
        spaceOverview: propertyDetails?.space_overview || listing.spaceOverview || "",
        guestAccess: propertyDetails?.guest_access || listing.guestAccess || "",
        houseManual: propertyDetails?.house_manual || listing.houseManual || "",
        otherDetails: propertyDetails?.other_details || listing.otherDetails || "",
        additionalRules: propertyDetails?.additional_rules || listing.additionalRules || "",
        neighborhoodDescription: propertyDetails?.neighborhood_description || listing.neighborhoodDescription || "",
        gettingAround: propertyDetails?.getting_around || listing.gettingAround || "",
        wifiName: propertyDetails?.wifi_name || listing.wifiName || "",
        amenities: propertyDetails?.amenities || listing.amenities || [],
        address: listing.address,
        houseRules: listing.houseRules || propertyDetails?.house_rules || null,
      };

      const conversationInsights = guestConversations.slice(0, 50).map((conv) => ({
        guestName: conv.guestName,
        messages: conv.messages.slice(0, 3).join(" | "),
      }));

      const reviewsForPrompt = reviewTexts.slice(0, 50);
      const analysisPrompt = `You are an expert short-term rental consultant. Analyze this listing, ${reviewTexts.length} guest reviews, and ${guestConversations.length} guest conversation threads to build an accurate Ideal Guest Profile and assess overall review sentiment.

LISTING INFORMATION:
- Name: ${listingContext.name}
- Type: ${listingContext.propertyType || "Unknown"}
- Bedrooms: ${listingContext.bedrooms || "Unknown"}
- Bathrooms: ${listingContext.bathrooms || "Unknown"}
- Address: ${listingContext.address || "Unknown"}
- Description: ${listingContext.description || "No description available"}
- Amenities: ${Array.isArray(listingContext.amenities) ? listingContext.amenities.join(", ") : "Unknown"}
- Pets Allowed: ${listingContext.houseRules?.pets_allowed === true ? "Yes" : listingContext.houseRules?.pets_allowed === false ? "No" : "Unknown"}
${listingContext.spaceOverview ? `- Space Overview: ${listingContext.spaceOverview.slice(0, 1000)}${listingContext.spaceOverview.length > 1000 ? "..." : ""}` : ""}
${listingContext.guestAccess ? `- Guest Access: ${listingContext.guestAccess.slice(0, 500)}${listingContext.guestAccess.length > 500 ? "..." : ""}` : ""}
${listingContext.houseManual ? `- House Manual: ${listingContext.houseManual.slice(0, 500)}${listingContext.houseManual.length > 500 ? "..." : ""}` : ""}
${listingContext.otherDetails ? `- Other Details: ${listingContext.otherDetails.slice(0, 500)}${listingContext.otherDetails.length > 500 ? "..." : ""}` : ""}
${listingContext.additionalRules ? `- Additional Rules: ${listingContext.additionalRules.slice(0, 500)}${listingContext.additionalRules.length > 500 ? "..." : ""}` : ""}
${listingContext.neighborhoodDescription ? `- Neighborhood: ${listingContext.neighborhoodDescription.slice(0, 500)}${listingContext.neighborhoodDescription.length > 500 ? "..." : ""}` : ""}
${listingContext.gettingAround ? `- Getting Around: ${listingContext.gettingAround.slice(0, 500)}${listingContext.gettingAround.length > 500 ? "..." : ""}`  : ""}
${listingContext.wifiName ? `- WiFi Name: ${listingContext.wifiName}` : ""}

GUEST CONVERSATION INSIGHTS (from ${guestConversations.length} guests):
${conversationInsights.length > 0 ? conversationInsights.map((conv, i) => `
Guest ${i + 1} (${conv.guestName}):
${conv.messages}
`).join("\n") : "No conversation data available"}

IMPORTANT: Analyze the guest messages above to extract:
- Why they chose this property
- Their reason for traveling (vacation, business, family reunion, etc.)
- What they were looking for in a rental
- Their preferences and expectations
- Any likes or dislikes they mentioned

REVIEWS SUMMARY:
- Total Reviews: ${reviewTexts.length}
- Reviews with Ratings: ${reviewsWithRatings.length}
- AVERAGE RATING: ${averageRating ? averageRating.toFixed(2) : "No ratings available"} stars

INDIVIDUAL REVIEWS (showing ${reviewsForPrompt.length}):
${reviewsForPrompt.map((r, i) => `
Review ${i + 1} (Rating: ${r.rating || "N/A"}, Guest: ${r.guestName}):
Public: ${r.publicReview || "No public review"}
Private Remarks: ${r.privateRemarks || "None"}
`).join("\n")}

Provide a JSON response with the following structure. Be honest and constructive:
{
  "overallScore": <number 1-10 based on overall listing quality>,
  "title": { 
    "grade": "A|B|C|D|F", 
    "score": <1-10>, 
    "feedback": "<feedback on title effectiveness, keywords, and appeal>", 
    "suggestions": ["<suggestion1>", "<suggestion2>"] 
  },
  "reviews": { 
    "grade": "A|B|C|D|F", 
    "score": <1-10>, 
    "feedback": "<detailed feedback on overall review sentiment, common themes, and guest satisfaction>", 
    "suggestions": ["<suggestion1>", "<suggestion2>", "<suggestion3>"] 
  },
  "pet": { 
    "grade": "A|B|C|D|F", 
    "score": <1-10>, 
    "feedback": "<feedback on pet-friendliness, amenities for pets, and appeal to pet owners>", 
    "suggestions": ["<suggestion1>", "<suggestion2>"] 
  },
  "description": { 
    "grade": "A|B|C|D|F", 
    "score": <1-10>, 
    "feedback": "<feedback on description quality, completeness, and selling points>", 
    "suggestions": ["<suggestion1>", "<suggestion2>"] 
  },
  "ideal": { 
    "grade": "A|B|C|D|F", 
    "score": <1-10>, 
    "feedback": "<feedback on how well listing is optimized for its ideal guest profile>", 
    "suggestions": ["<suggestion1>", "<suggestion2>"] 
  },
  "idealGuestProfile": {
    "guestTypes": [
      { "name": "<Guest Type Name>", "percentage": <number 0-100>, "description": "<brief description of this guest type including why they chose this property>" }
    ],
    "seasonalPatterns": ["<pattern1>", "<pattern2>"],
    "guestPreferences": ["<preference1>", "<preference2>"],
    "uniqueSellingPoints": ["<usp1>", "<usp2>"],
    "summary": "<2-3 sentence summary of the ideal guest profile based on the review and conversation analysis>"
  },
  "topSuggestions": ["<top suggestion 1>", "<top suggestion 2>", "<top suggestion 3>"]
}

GRADING GUIDELINES (A-F scale):
- Grade A: Excellent - industry best practices, highly optimized, no improvements needed
- Grade B: Good - well done with minor improvements possible
- Grade C: Average - meets basic standards but has room for improvement
- Grade D: Below Average - needs significant improvement
- Grade F: Poor - major issues that need immediate attention

IMPORTANT RULES FOR guestTypes:
- Include NO MORE THAN 4 guest types
- Percentages must add up to 100%
- Base percentages on BOTH reviews AND conversation insights (who is staying at this property and WHY?)
- Pay special attention to guest conversations - they often reveal reasons for travel, preferences, and what attracted them to this property
- Use descriptive names like "Multi-Generational Families", "Couples Getaway", "Corporate Travelers", "Travel Teams", "Pet Owners", "Wedding Parties", "Sports Teams", etc.
- In the description for each guest type, include insights from conversations about why they chose this property

CATEGORY-SPECIFIC ANALYSIS (Note: Photos are analyzed separately with vision AI):
- Title: Evaluate the listing name for SEO, appeal, and accuracy
- Reviews: CRITICAL - Use the AVERAGE RATING value provided above as the primary grading factor:
  * A = Average rating 4.8 or higher (exceptional reviews)
  * B = Average rating 4.5 to 4.79 (very good reviews)
  * C = Average rating 4.0 to 4.49 (good reviews)
  * D = Average rating 3.5 to 3.99 (needs improvement)
  * F = Average rating below 3.5 (poor reviews)
  If AVERAGE RATING is 5.0, the grade MUST be A. Do not downgrade based on review count or other factors.
- Pet: CRITICAL - Check the "Pets Allowed" field above. If pets are NOT allowed (No), grade is F. If pets ARE allowed (Yes), grade C-A based on pet amenities (yard, pet supplies, pet beds, fenced area). If unknown, assume pets are not allowed (grade F).
- Description: Evaluate completeness, selling points, and clarity
- Ideal: Grade how well the listing targets and appeals to its identified ideal guest types`;

      let aiAnalysis;
      try {
        const { modelId, modelInfo } = await getConfiguredAIModel();
        
        const completion = await openai.chat.completions.create({
          model: modelId,
          messages: [{ role: "user", content: analysisPrompt }],
          response_format: { type: "json_object" },
          max_tokens: 3500,
        });

        const responseText = completion.choices[0]?.message?.content || "{}";
        aiAnalysis = JSON.parse(responseText);

        const inputTokens = completion.usage?.prompt_tokens || 0;
        const outputTokens = completion.usage?.completion_tokens || 0;
        const estimatedCost = calculateAICost(inputTokens, outputTokens, modelInfo);
        
        await storage.createAiUsageLog({
          userId,
          label: "Ideal Guest Profile Analysis",
          model: modelId,
          inputTokens,
          outputTokens,
          estimatedCost,
          listingId: listing.id,
          listingName: listing.name,
        });
      } catch (aiError) {
        logger.error('AI', "AI analysis error:", aiError);
        aiAnalysis = {
          overallScore: 5.0,
          reviews: { grade: "C", score: 5, feedback: "Unable to fully analyze reviews. Please try again.", suggestions: ["Try running the analysis again"] },
          idealGuestProfile: {
            guestTypes: [{ name: "General Travelers", percentage: 100, description: "Analysis could not be completed" }],
            seasonalPatterns: ["Year-round"],
            guestPreferences: ["Comfort"],
            uniqueSellingPoints: ["Great location"],
            summary: "Analysis could not be completed. Please try again.",
          },
          topSuggestions: ["Please try running the analysis again"],
        };
      }

      const analysisData = {
        listingId: listing.id,
        userId,
        score: aiAnalysis.overallScore || 5.0,
        reviewsGrade: aiAnalysis.reviews?.grade || null,
        reviewsAnalysis: aiAnalysis.reviews as CategoryAnalysis,
        photosGrade: null,
        photosAnalysis: null,
        titleGrade: aiAnalysis.title?.grade || null,
        titleAnalysis: aiAnalysis.title as CategoryAnalysis,
        petGrade: aiAnalysis.pet?.grade || null,
        petAnalysis: aiAnalysis.pet as CategoryAnalysis,
        descriptionGrade: aiAnalysis.description?.grade || null,
        descriptionAnalysis: aiAnalysis.description as CategoryAnalysis,
        idealGrade: aiAnalysis.ideal?.grade || null,
        idealAnalysis: aiAnalysis.ideal as CategoryAnalysis,
        superhostGrade: null,
        superhostAnalysis: null,
        guestFavGrade: null,
        guestFavAnalysis: null,
        sleepGrade: null,
        sleepAnalysis: null,
        superhostStatusGrade: null,
        superhostStatusAnalysis: null,
        suggestions: aiAnalysis.topSuggestions || [],
        idealGuestProfile: aiAnalysis.idealGuestProfile as IdealGuestProfile,
        reviewCount: reviews.length,
        reservationCount: guestConversations.length > 0 ? guestConversations.length : 0,
        conversationCount: guestConversations.reduce((sum, c) => sum + c.messages.length, 0),
        photoAnalysisStatus: "pending" as const,
        photoAnalysisProgress: 0,
        photoAnalysisTotalPhotos: (listing.images as string[] || []).length,
        analyzedAt: new Date(),
      };
      
      const analysis = await storage.createAnalysis(analysisData);
      
      await storage.updateListing(listing.id, { lastAnalyzedAt: new Date() });

      let aiAnalyzedCount = 0;
      try {
        const reservations = await storage.getReservationsByListing(listing.id);
        const now = new Date();
        const fourteenDaysMs = 14 * 24 * 60 * 60 * 1000;
        
        const eligibleForAnalysis = reservations.filter(r => {
          if (r.aiSentimentScore || r.reviewAnalyzedAt) return false;
          if (r.publicReview) return true;
          if (r.checkOutDate) {
            const checkoutTime = new Date(r.checkOutDate).getTime();
            if (now.getTime() - checkoutTime >= fourteenDaysMs) return true;
          }
          return false;
        });

        const analysisBatchSize = 5;
        for (let i = 0; i < eligibleForAnalysis.length; i += analysisBatchSize) {
          const batch = eligibleForAnalysis.slice(i, i + analysisBatchSize);
          
          await Promise.all(batch.map(async (reservation) => {
            try {
              const conversationText = reservation.conversationHistory
                ?.map((m: any) => `${m.sender}: ${m.message}`)
                .join("\n") || "";

              const promptContent = `Analyze this guest stay and provide a comprehensive sentiment analysis.

Property: ${listing.name}
Guest: ${reservation.guestName || "Guest"}
Platform: ${reservation.platform}
Check-in: ${reservation.checkInDate}
Check-out: ${reservation.checkOutDate}

Public Review:
${reservation.publicReview || "No public review provided"}

Private Remarks:
${reservation.privateRemarks || "No private remarks"}

Guest Conversation:
${conversationText || "No conversation history"}

Please analyze and provide:
1. An overall AI Sentiment Score (0-5, with 0.1 increments) based on the entire stay experience
2. A Public Review Score (0-5) analyzing the tone and content of the public review
3. A Private Remarks Score (0-5) analyzing the private feedback
4. A Conversation Score (0-5) analyzing the guest communication quality
5. A brief AI Guest Summary (2-3 sentences) summarizing the overall guest experience

Respond in JSON format:
{
  "aiSentimentScore": number,
  "aiPublicReviewScore": number,
  "aiPrivateRemarksScore": number,
  "aiConversationScore": number,
  "aiGuestSummary": "string"
}`;

              const response = await openai.chat.completions.create({
                model: "gpt-4.1-mini",
                messages: [
                  { role: "system", content: "You are an expert at analyzing guest reviews and sentiment for short-term rental properties. Always respond with valid JSON." },
                  { role: "user", content: promptContent }
                ],
                response_format: { type: "json_object" },
                temperature: 0.3,
              });

              const analysisText = response.choices[0]?.message?.content || "{}";
              let sentimentAnalysis;
              try {
                sentimentAnalysis = JSON.parse(analysisText);
              } catch (parseErr) {
                logger.error('Analysis', `Failed to parse sentiment JSON for reservation ${reservation.id}:`, parseErr);
                return;
              }

              await storage.updateReservation(reservation.id, {
                aiSentimentScore: sentimentAnalysis.aiSentimentScore,
                aiPublicReviewScore: sentimentAnalysis.aiPublicReviewScore,
                aiPrivateRemarksScore: sentimentAnalysis.aiPrivateRemarksScore,
                aiConversationScore: sentimentAnalysis.aiConversationScore,
                aiGuestSummary: sentimentAnalysis.aiGuestSummary,
                reviewAnalyzedAt: new Date(),
              });

              await storage.createAiUsageLog({
                userId,
                label: "review_analysis_igp",
                model: "gpt-4.1-mini",
                inputTokens: response.usage?.prompt_tokens || 0,
                outputTokens: response.usage?.completion_tokens || 0,
                estimatedCost: ((response.usage?.prompt_tokens || 0) * 0.0004 + (response.usage?.completion_tokens || 0) * 0.0016) / 1000,
                listingId: listing.id,
                listingName: listing.name,
              });

              aiAnalyzedCount++;
            } catch (err) {
              logger.error('Analysis', `Failed to analyze reservation ${reservation.id} during IGP:`, err);
            }
          }));
        }
        logger.info('Analysis', `AI sentiment analysis completed for ${aiAnalyzedCount} reservations during IGP`);
      } catch (sentimentError) {
        logger.error('Analysis', "Error running sentiment analysis during IGP:", sentimentError);
      }
      
      const airbnbId = listing.platformIds?.airbnb;
      if (airbnbId) {
        triggerAirbnbScanInBackground(storage, listing.id, listing.workspaceId || '', airbnbId);
      }
      
      const totalPhotos = (listing.images as string[] || []).length;
      res.status(201).json({ 
        analysis, 
        reviewsCount: reviews.length,
        reservationCount: guestConversations.length,
        conversationCount: guestConversations.reduce((sum, c) => sum + c.messages.length, 0),
        listingId: listing.id,
        aiAnalyzedCount,
        photoAnalysisPending: totalPhotos > 0,
        photoAnalysisTotalPhotos: totalPhotos,
        airbnbScanTriggered: !!airbnbId,
      });
    } catch (error) {
      logger.error('Analysis', "Error analyzing listing:", error);
      res.status(500).json({ message: "Failed to analyze listing" });
    }
  });

  // Staged Listing Analysis with SSE progress updates
  app.get("/api/listings/:id/analyze-staged-stream", isAuthenticated, async (req, res) => {
    const userId = getUserId(req);
    const listingId = getParamId(req.params.id);
    
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");

    let isClientConnected = true;
    req.on("close", () => {
      isClientConnected = false;
      logger.info('Analysis', `Client disconnected for listing ${listingId}`);
    });

    const sendEvent = (event: string, data: any) => {
      if (!isClientConnected) return;
      try {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      } catch (err) {
        logger.error('Analysis', "Error writing SSE event:", err);
        isClientConnected = false;
      }
    };

    try {
      const listing = await storage.getListing(listingId);
      if (!listing) {
        sendEvent("error", { message: "Listing not found" });
        res.end();
        return;
      }

      if (listing.workspaceId) {
        const membership = await storage.getWorkspaceMember(listing.workspaceId, userId);
        if (!membership) {
          sendEvent("error", { message: "Access denied - not a workspace member" });
          res.end();
          return;
        }
      } else if (listing.userId !== userId) {
        sendEvent("error", { message: "Access denied" });
        res.end();
        return;
      }

      if (!isClientConnected) {
        res.end();
        return;
      }

      sendEvent("stage", { stage: "init", status: "started", message: "Starting staged analysis..." });

      const dataSource = await storage.getDataSource(listing.dataSourceId);
      if (!dataSource || !dataSource.accessToken) {
        sendEvent("error", { 
          message: "Your Hospitable account is not connected. Please connect your Hospitable account in Settings to run the analysis.",
          needsReconnect: true,
        });
        res.end();
        return;
      }

      const { accessToken: validAccessToken, error: tokenError } = await getValidAccessToken(listing.dataSourceId);
      if (!validAccessToken) {
        logger.error('Analysis', `Token refresh failed: ${tokenError}`);
        sendEvent("error", { 
          message: "Your Hospitable connection has expired. Please reconnect your Hospitable account in Settings to run the analysis.",
          needsReconnect: true,
          technicalDetails: tokenError,
        });
        res.end();
        return;
      }
      const apiAccessToken = validAccessToken;

      let airbnbId: string | null = null;
      let airbnbUrl = "";
      
      const platformIds = (listing as any).platformIds;
      if (platformIds && typeof platformIds === 'object' && platformIds.airbnb) {
        airbnbId = String(platformIds.airbnb);
        airbnbUrl = `https://www.airbnb.com/rooms/${airbnbId}`;
        logger.info('Analysis', `Found Airbnb ID from platformIds: ${airbnbId}`);
      } else {
        airbnbUrl = (listing as any).airbnbUrl || listing.externalUrl || "";
        const airbnbIdMatch = airbnbUrl.match(/rooms\/(\d+)/);
        airbnbId = airbnbIdMatch ? airbnbIdMatch[1] : null;
        if (airbnbId) {
          logger.info('Analysis', `Found Airbnb ID from URL: ${airbnbId}`);
        }
      }
      
      let scraperPromise: Promise<any> | null = null;
      logger.info('Analysis', `Airbnb ID check: airbnbId=${airbnbId || 'null'}`);

      sendEvent("stage", { stage: "data_fetch", status: "started", message: "Fetching listing data..." });
      
      logger.info('Analysis', `Token for API calls: ${apiAccessToken ? apiAccessToken.substring(0, 10) + '...' : 'NULL'}`);
      const [reviews, propertyDetails, reservations] = await Promise.all([
        (async () => {
          let allReviews: any[] = [];
          let page = 1;
          let hasMore = true;
          while (hasMore && page <= 20) {
            try {
              const resp = await fetch(
                `https://public.api.hospitable.com/v2/properties/${listing.externalId}/reviews?page=${page}&per_page=100`,
                { headers: { Authorization: `Bearer ${apiAccessToken}` } }
              );
              if (resp.ok) {
                const data = await resp.json();
                const pageReviews = data.data || [];
                allReviews = [...allReviews, ...pageReviews];
                hasMore = pageReviews.length === 100;
                page++;
              } else {
                const errorBody = await resp.text();
                logger.error('Analysis', `Reviews API failed - status: ${resp.status}, body: ${errorBody.substring(0, 200)}`);
                hasMore = false;
              }
            } catch (reviewErr) {
              logger.error('Analysis', `Reviews fetch error:`, reviewErr);
              hasMore = false;
            }
          }
          return allReviews;
        })(),
        (async () => {
          try {
            const resp = await fetch(
              `https://public.api.hospitable.com/v2/properties/${listing.externalId}?include=details`,
              { headers: { Authorization: `Bearer ${apiAccessToken}` } }
            );
            if (!resp.ok) {
              const errorBody = await resp.text();
              logger.error('Analysis', `Property details API failed - status: ${resp.status}, body: ${errorBody.substring(0, 200)}`);
              return null;
            }
            return await resp.json();
          } catch (propErr) {
            logger.error('Analysis', `Property details fetch error:`, propErr);
            return null;
          }
        })(),
        (async () => {
          if (!apiAccessToken || !listing.externalId) return [];
          const allReservations: any[] = [];
          let page = 1;
          let hasMore = true;
          const MAX_PAGES = 20;
          const endDate = new Date().toISOString().split('T')[0];
          const startDate = new Date(Date.now() - 5 * 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]; // 5 years back
          try {
            while (hasMore && page <= MAX_PAGES) {
              const params = new URLSearchParams({
                'include': 'guest',
                'page': String(page),
                'per_page': '50',
                'start_date': startDate,
                'end_date': endDate,
              });
              const url = `https://public.api.hospitable.com/v2/reservations?${params.toString()}&properties[]=${encodeURIComponent(listing.externalId)}`;
              logger.info('Analysis', `Fetching all reservations page ${page}: ${url}`);
              const resp = await fetch(url, {
                headers: { Authorization: `Bearer ${apiAccessToken}` }
              });
              if (resp.ok) {
                const data = await resp.json();
                const pageData = data.data || [];
                const included = data.included || [];
                const guestMap = new Map<string, any>();
                included.forEach((item: any) => {
                  if (item.type === 'guest' && item.id) {
                    guestMap.set(item.id, item.attributes || item);
                  }
                });
                pageData.forEach((r: any) => {
                  if (!r.guest && r.relationships?.guest?.data?.id) {
                    r.guest = guestMap.get(r.relationships.guest.data.id);
                  }
                });
                if (pageData.length === 0) { hasMore = false; break; }
                allReservations.push(...pageData);
                hasMore = pageData.length >= 50;
                page++;
              } else {
                logger.error('Analysis', `Failed to fetch reservations page ${page}: ${resp.status}`);
                hasMore = false;
              }
            }
            logger.info('Analysis', `Fetched ${allReservations.length} total reservations from API (all time)`);
          } catch (err) {
            logger.error('Analysis', "Error fetching reservations from API:", err);
          }
          return allReservations;
        })()
      ]);

      logger.info('Analysis', `Data fetch results - reviews: ${reviews.length}, propertyDetails: ${propertyDetails ? 'yes' : 'null'}, reservations: ${reservations.length}`);

      let effectiveReservations: any[] = reservations;
      let storedReservationsForFallback: any[] | null = null;
      if (reservations.length === 0) {
        storedReservationsForFallback = await storage.getReservationsByListing(listing.id);
        if (storedReservationsForFallback.length > 0) {
          logger.info('Analysis', `Using ${storedReservationsForFallback.length} synced reservations (API returned 0)`);
          effectiveReservations = storedReservationsForFallback.map((r: any) => ({
            id: r.externalId,
            attributes: {
              check_in: r.checkInDate,
              check_out: r.checkOutDate,
              guest_name: r.guestName,
              public_review: r.publicReview,
              private_remarks: r.privateRemarks,
              guest_rating: r.guestRating,
            },
            guest: { name: r.guestName, first_name: r.guestName, attributes: { full_name: r.guestName } },
          }));
        }
      }

      // Fetch conversation messages for each reservation (Hospitable API does not include them in reservation list)
      const reservationMessagesMap = new Map<string, string>();
      if (apiAccessToken && reservations.length > 0) {
        const BATCH_SIZE = 5;
        for (let i = 0; i < effectiveReservations.length; i += BATCH_SIZE) {
          const batch = effectiveReservations.slice(i, i + BATCH_SIZE);
          await Promise.all(batch.map(async (r: any) => {
            const rid = r.id;
            if (!rid) return;
            try {
              const convResp = await fetch(
                `https://public.api.hospitable.com/v2/reservations/${rid}/messages`,
                { headers: { Authorization: `Bearer ${apiAccessToken}` } }
              );
              if (!convResp.ok) return;
              const convData = await convResp.json();
              const messages = convData.data || [];
              const guestMessages = messages
                .filter((msg: any) => msg.sender_type === 'guest')
                .map((msg: any) => (msg.attributes?.body ?? msg.body ?? "").trim())
                .filter((text: string) => text.length > 0);
              if (guestMessages.length > 0) {
                reservationMessagesMap.set(rid, guestMessages.join(" | "));
              }
            } catch {
              // ignore per-reservation errors
            }
          }));
        }
        logger.info('Analysis', `Fetched messages for ${reservationMessagesMap.size} of ${effectiveReservations.length} reservations`);
      } else if (storedReservationsForFallback && storedReservationsForFallback.length > 0) {
        for (const r of storedReservationsForFallback) {
          const history = (r.conversationHistory as any[]) || [];
          if (history.length > 0) {
            const msgs = history.map((m: any) => m.message ?? m.body ?? "").filter(Boolean);
            if (msgs.length && r.externalId) reservationMessagesMap.set(r.externalId, msgs.join(" | "));
          }
        }
        logger.info('Analysis', `Using conversation history from ${reservationMessagesMap.size} synced reservations`);
      }

      sendEvent("stage", { stage: "data_fetch", status: "completed", 
        data: { reviewCount: reviews.length, reservationCount: effectiveReservations.length } });

      const reviewTexts = reviews.map((r: any) => {
        const rating = r.attributes?.rating?.overall ?? r.public?.rating ?? r.rating ?? r.overall_rating ?? (typeof r.attributes?.rating === "number" ? r.attributes.rating : null);
        const publicReview = r.attributes?.review?.public ?? r.attributes?.public_review ?? r.public?.review ?? r.public_review ?? r.review ?? null;
        const privateRemarks = r.attributes?.review?.private ?? r.attributes?.private_remarks ?? r.private?.feedback ?? r.private_remarks ?? r.private_review ?? null;
        const guestName = r.attributes?.guest?.name ?? r.guest?.full_name ?? r.guest?.first_name ?? r.guest_name ?? "Guest";
        return { rating, publicReview, privateRemarks, guestName };
      });

      const reviewsWithRatings = reviewTexts.filter((r: any) => r.rating != null && typeof r.rating === "number");
      const avgRating = reviewsWithRatings.length > 0
        ? reviewsWithRatings.reduce((sum: number, r: any) => sum + r.rating, 0) / reviewsWithRatings.length
        : null;

      const reservationContext = effectiveReservations.map((r: any) => {
        const attrs = r.attributes || r;
        const guestData = r.guest || r.relationships?.guest?.data || {};
        const guestName = (guestData.attributes && (guestData.attributes.full_name || guestData.attributes.first_name)) || guestData.name || guestData.first_name || attrs.guest_name || "Guest";
        const fetchedMessages = r.id ? reservationMessagesMap.get(r.id) : undefined;
        const convHistory = Array.isArray(attrs.conversationHistory) ? attrs.conversationHistory : [];
        const fallbackMessages = convHistory.map((m: any) => m.body ?? m.message ?? "").filter(Boolean).join(" | ");
        const messages = fetchedMessages || fallbackMessages || "None";
        return {
          guestName,
          checkIn: attrs.check_in || attrs.checkInDate,
          checkOut: attrs.check_out || attrs.checkOutDate,
          messages,
          reviewPublic: attrs.public_review ?? attrs.publicReview ?? null,
          reviewPrivate: attrs.private_remarks ?? attrs.privateRemarks ?? null,
          rating: attrs.guest_rating ?? attrs.guestRating ?? attrs.rating ?? null
        };
      });

      const propData = propertyDetails?.data || {};
      const propAttributes = propData.attributes || {};
      const detailsData = propAttributes.details || {};
      const amenitiesRaw = detailsData.amenities || listing.amenities || [];
      const amenities = Array.isArray(amenitiesRaw)
        ? amenitiesRaw.map((a: any) => (typeof a === "string" ? a : a?.name ?? "")).filter(Boolean)
        : [];
      const petsAllowedFromApi = detailsData.house_rules?.pets_allowed;
      const petsAllowedFromListing = (listing.houseRules as any)?.pets_allowed;
      const petsAllowed: boolean | undefined = petsAllowedFromApi !== undefined ? petsAllowedFromApi : petsAllowedFromListing;
      logger.info('Analysis', `Pet policy data: fromApi=${petsAllowedFromApi}, fromListing=${petsAllowedFromListing}, resolved=${petsAllowed}, detailsHouseRules=${JSON.stringify(detailsData.house_rules || 'not found')}, listingHouseRules=${JSON.stringify(listing.houseRules || 'not found')}`);

      const images = (listing.images as string[]) || [];
      const initialAnalysisData = {
        listingId: listing.id,
        userId: userId,
        workspaceId: listing.workspaceId,
        overallScore: 5,
        titleGrade: null,
        titleFeedback: null,
        titleSuggestions: null,
        descriptionGrade: null,
        descriptionFeedback: null,
        descriptionSuggestions: null,
        petGrade: null,
        petFeedback: null,
        petSuggestions: null,
        reviewsGrade: null,
        reviewsFeedback: null,
        reviewsSuggestions: null,
        idealGrade: null,
        idealGuestProfile: null,
        topSuggestions: null,
        superhostGrade: null,
        superhostAnalysis: null,
        sleepGrade: null,
        sleepAnalysis: null,
        guestFavGrade: null,
        guestFavAnalysis: null,
        superhostStatusGrade: null,
        superhostStatusAnalysis: null,
        photosGrade: null,
        photosFeedback: null,
        photosSuggestions: null,
        photoAnalysisStatus: images.length > 0 ? "pending" : "complete",
        photoAnalysisTotalPhotos: images.length,
        photoAnalysisProgress: 0,
      };
      
      logger.info('Analysis', `Creating initial analysis record for listing ${listing.id}`);
      const analysis = await storage.createAnalysis(initialAnalysisData);
      const analysisId = analysis.id;
      logger.info('Analysis', `Created analysis record: ${analysisId}`);

      sendEvent("stage", { stage: "igp", status: "started", message: "Creating Ideal Guest Profile..." });

      let igpResult: any = null;
      logger.info('Analysis', `Starting IGP generation for listing ${listing.id} with ${reviews.length} reviews, ${effectiveReservations.length} reservations`);
      try {
        const igpPrompt = await storage.getPromptByCategory("igp_analysis");
        logger.info('Analysis', `IGP prompt found: ${!!igpPrompt}, has template: ${!!igpPrompt?.promptTemplate}`);
        if (igpPrompt) {
          const listingHeadline = (listing as any).headline || listing.name || propAttributes.name || "";
          const listingDescription = [listing.summary, detailsData.summary, propAttributes.description].filter(Boolean).join("\n\n");
          const weightListingInstruction = effectiveReservations.length < 10
            ? "\n\nIMPORTANT: This listing has fewer than 10 reservations. Weight the Listing Headline and Description above more heavily to infer likely guest types and travel purposes. Still use any literal verbatims from messages and reviews (e.g. 'family of 4', 'baseball tournament', 'business trip')."
            : "\n\nUse literal verbatims from guest messages and reviews (e.g. 'we're a family of 4 coming for a baseball tournament') to identify guest types and travel purposes.";

          const reservationsBlock = reservationContext.map((r, i) =>
            `Reservation ${i + 1}:
Guest: ${r.guestName}
Check-in: ${r.checkIn != null ? new Date(r.checkIn).toISOString().slice(0, 10) : "N/A"}, Check-out: ${r.checkOut != null ? new Date(r.checkOut).toISOString().slice(0, 10) : "N/A"}
Messages: ${r.messages}
Public Review: ${r.reviewPublic || "None"}
Private Remarks: ${r.reviewPrivate || "None"}
Rating: ${r.rating != null ? r.rating : "N/A"}`
          ).join("\n\n");

          const reservationsContextStr = `LISTING HEADLINE (from Properties API): ${listingHeadline}

LISTING DESCRIPTION: ${listingDescription || "Not provided"}
${weightListingInstruction}

RESERVATIONS (${effectiveReservations.length} total):
${reservationsBlock}`;

          const igpPromptFilled = igpPrompt.promptTemplate
            .replace("{{listing_name}}", listing.name)
            .replace("{{location}}", listing.address || "Unknown")
            .replace("{{bedrooms}}", String(listing.bedrooms || "Unknown"))
            .replace("{{bathrooms}}", String(listing.bathrooms || "Unknown"))
            .replace("{{max_guests}}", String(listing.maxGuests || "Unknown"))
            .replace("{{property_type}}", listing.propertyType || "Unknown")
            .replace("{{amenities}}", Array.isArray(amenities) ? amenities.join(", ") : "Unknown")
            .replace("{{reservation_count}}", String(effectiveReservations.length))
            .replace("{{reservations_context}}", reservationsContextStr);

          const igpPromptWithBreakdown = igpPromptFilled + `\n\nADDITIONAL REQUIREMENT - Reservation Breakdown:
After determining your top guest types, include a "reservationBreakdown" array in your JSON response. For EACH reservation provided above, include:
- "guestName": the guest's name
- "checkIn": check-in date (YYYY-MM-DD)
- "checkOut": check-out date (YYYY-MM-DD)
- "summary": 1-2 sentence summary of what was learned from this reservation (guest needs, preferences, experience, feedback)
- "matchedProfile": which of your identified guest types this reservation best matches (use the exact "name" from your guestTypes array), or "Other" if it doesn't clearly fit any

Keep summaries concise but informative. Focus on actionable insights from messages, reviews, and booking patterns.`;

          const { modelId, modelInfo } = await getConfiguredAIModel();
          logger.info('Analysis', `Using AI model: ${modelId} for IGP generation`);
          const igpCompletion = await openai.chat.completions.create({
            model: modelId,
            messages: [
              { role: "system", content: igpPrompt.systemPrompt },
              { role: "user", content: igpPromptWithBreakdown }
            ],
            response_format: { type: "json_object" },
            max_tokens: 16000,
          });

          const igpText = igpCompletion.choices[0]?.message?.content || "{}";
          logger.info('Analysis', `IGP response length: ${igpText.length} chars, finish_reason: ${igpCompletion.choices[0]?.finish_reason}`);
          try {
            igpResult = JSON.parse(igpText);
          } catch (parseErr) {
            logger.error('Analysis', `IGP JSON parse failed, attempting repair. Error: ${parseErr}`);
            igpResult = repairTruncatedJson(igpText);
          }
          logger.info('Analysis', `IGP result parsed - grade: ${igpResult?.grade}, guestTypes: ${igpResult?.guestTypes?.length || 0}, has reservationBreakdown: ${!!igpResult?.reservationBreakdown}`);

          const inputTokens = igpCompletion.usage?.prompt_tokens || 0;
          const outputTokens = igpCompletion.usage?.completion_tokens || 0;
          await storage.createAiUsageLog({
            userId,
            label: "IGP Analysis (Staged)",
            model: modelId,
            inputTokens,
            outputTokens,
            estimatedCost: calculateAICost(inputTokens, outputTokens, modelInfo),
            listingId: listing.id,
            listingName: listing.name,
          });
        }
      } catch (igpError) {
        logger.error('Analysis', "IGP analysis error:", igpError);
        igpResult = {
          guestTypes: [{ name: "General Travelers", percentage: 100, description: "Analysis incomplete" }],
          summary: "Unable to complete IGP analysis",
          travelPurposes: [],
          keyDecisionFactors: [],
          topPraisePoints: [],
          painPoints: [],
          uniqueSellingPoints: [],
          seasonalPatterns: [],
          guestPreferences: []
        };
      }
      if (igpResult) {
        if (!Array.isArray(igpResult.seasonalPatterns)) igpResult.seasonalPatterns = [];
        if (!Array.isArray(igpResult.guestPreferences)) igpResult.guestPreferences = [];
      }

      sendEvent("stage", {
        stage: "igp",
        status: "completed",
        data: {
          ...igpResult,
          reviewCount: reviews.length,
          reservationCount: effectiveReservations.length,
        },
      });

      await storage.updateAnalysis(analysisId, {
        idealGrade: igpResult?.grade || "C",
        idealGuestProfile: igpResult,
        topSuggestions: igpResult?.painPoints || [],
        reviewCount: reviews.length,
        reservationCount: effectiveReservations.length,
        analyzedAt: new Date(),
      });
      logger.info('Analysis', `Updated analysis ${analysisId} with grade: ${igpResult?.grade}, reviews: ${reviews.length}, reservations: ${effectiveReservations.length}`);

      if (airbnbId) {
        logger.info('Analysis', `Starting scraper for Airbnb ID: ${airbnbId} (after IGP complete)`);
        sendEvent("stage", { stage: "scraper", status: "started", message: "Starting Airbnb scraper..." });
        
        scraperPromise = (async () => {
          try {
            const fullAirbnbUrl = airbnbUrl.startsWith('http') ? airbnbUrl : `https://www.airbnb.com/rooms/${airbnbId}`;
            const scan = await storage.createAirbnbScan({
              listingId: listing.id,
              workspaceId: listing.workspaceId || "",
              airbnbUrl: fullAirbnbUrl,
              status: 'scanning',
            });
            
            const { scanAirbnbListing } = await import('../airbnb-scanner');
            logger.info('Analysis', `Starting Airbnb scan for ${fullAirbnbUrl}`);
            const result = await scanAirbnbListing(fullAirbnbUrl);
            logger.info('Analysis', `Scan completed. Success: ${result.success}, hasHostProfile: ${!!result.hostProfile}, hasSleepData: ${!!result.whereYoullSleep}`);
            
            if (result.success) {
              await storage.updateAirbnbScan(scan.id, {
                status: 'completed',
                whereYoullSleep: result.whereYoullSleep,
                hasWhereYoullSleep: result.hasWhereYoullSleep,
                isSuperhost: result.isSuperhost,
                guestFavoriteTier: result.guestFavoriteTier,
                hostProfile: result.hostProfile,
                rawSnapshot: result.rawSnapshot,
                scannedAt: new Date(),
              });
              return result;
            } else {
              await storage.updateAirbnbScan(scan.id, {
                status: 'failed',
                errorMessage: result.errorMessage || 'Scan failed',
              });
              return null;
            }
          } catch (err) {
            logger.error('Analysis', "Airbnb scraper error:", err);
            return null;
          }
        })();
      }

      sendEvent("stage", { stage: "parallel", status: "started", message: "Running category analyses..." });
      
      let scrapedProcessingPromise: Promise<void> | null = null;
      
      let scrapedData: any = null;
      let hostProfileResult: any = null;
      let sleepResult: any = null;
      
      logger.info('Analysis', `scraperPromise exists: ${!!scraperPromise}`);
      if (scraperPromise) {
        sendEvent("stage", { stage: "scraped", status: "started", message: "Processing Airbnb data..." });
        logger.info('Analysis', `Creating scrapedProcessingPromise...`);
        
        scrapedProcessingPromise = (async () => {
          logger.info('Analysis', `scrapedProcessingPromise started, awaiting scraper...`);
          scrapedData = await scraperPromise;
          logger.info('Analysis', `Scraper returned. scrapedData exists: ${!!scrapedData}`);
          
          if (scrapedData) {
            logger.info('Analysis', `scrapedData keys: ${Object.keys(scrapedData).join(', ')}`);
            sendEvent("stage", { stage: "scraper", status: "completed", message: "Airbnb data retrieved" });
            
            try {
              sendEvent("category", { category: "guest_favorites", status: "started" });
              const guestFavoriteTier = scrapedData.guestFavoriteTier;
              logger.info('Analysis', `Guest Favorite Tier from scraper: ${guestFavoriteTier}`);
              
              const isGuestFavorite = !!guestFavoriteTier;
              let gfGrade: string;
              let gfTierLabel: string;
              let gfFeedback: string;
              
              if (isGuestFavorite) {
                gfGrade = "A";
                gfTierLabel = guestFavoriteTier === 'gold' ? "Gold (Top 1%)" : 
                              guestFavoriteTier === 'black' ? "Black (Top 5%)" : "Standard (Top 10%)";
                gfFeedback = guestFavoriteTier === 'gold' 
                  ? "Congratulations! This listing has earned Airbnb's highest Guest Favorite distinction - Top 1% of homes."
                  : guestFavoriteTier === 'black'
                    ? "Great achievement! This listing has earned Airbnb's Guest Favorite badge at the Black tier - Top 5% of homes."
                    : "This listing has earned Airbnb's Guest Favorite badge - Top 10% of homes.";
              } else {
                gfGrade = "C";
                gfTierLabel = "Not a Guest Favorite";
                gfFeedback = "This listing has not yet earned the Guest Favorite badge. Focus on consistently high ratings, reliability, and guest satisfaction to achieve this status.";
              }
              
              const guestFavResult = {
                grade: gfGrade,
                isGuestFavorite,
                tier: guestFavoriteTier || null,
                tierLabel: gfTierLabel,
                feedback: gfFeedback,
                suggestions: isGuestFavorite ? [] : ["Maintain a 4.9+ average rating", "Respond quickly to all guest inquiries", "Ensure listing accuracy to set proper expectations"]
              };
              
              logger.info('Analysis', `Guest Favorite saving to DB: analysisId=${analysisId}, grade=${guestFavResult.grade}`);
              await storage.updateAnalysis(analysisId, {
                guestFavGrade: guestFavResult.grade,
                guestFavAnalysis: guestFavResult,
              });
              await recalculateOverallGrade(analysisId, storage);
              logger.info('Analysis', `Guest Favorite DB update completed for analysisId=${analysisId}`);
              sendEvent("category", { category: "guest_favorites", status: "completed", data: guestFavResult });
            } catch (err) {
              logger.error('Analysis', "Guest Favorite Error:", err);
              sendEvent("category", { category: "guest_favorites", status: "failed" });
            }
            
            try {
              sendEvent("category", { category: "superhost_status", status: "started" });
              const isSuperhost = scrapedData.isSuperhost;
              const hostProfile = scrapedData.hostProfile;
              logger.info('Analysis', `Is Superhost: ${isSuperhost}`);
              
              const superhostStatusResult = {
                grade: isSuperhost ? "A" : "C",
                isSuperhost: !!isSuperhost,
                hostName: hostProfile?.name || "Unknown",
                yearsHosting: hostProfile?.yearsHosting || null,
                responseRate: hostProfile?.responseRate || null,
                reviewCount: hostProfile?.reviewCount || null,
                feedback: isSuperhost 
                  ? "This host has earned Airbnb's Superhost status, demonstrating outstanding hospitality, high ratings, and consistent responsiveness."
                  : "This host has not yet achieved Superhost status. Superhost requires maintaining a 4.8+ overall rating, 90%+ response rate, fewer than 1% cancellations, and at least 10 completed stays per year.",
                suggestions: isSuperhost ? [] : ["Maintain a 4.8+ overall rating", "Achieve 90%+ response rate within 24 hours", "Complete at least 10 stays per year", "Keep cancellation rate below 1%"]
              };
              
              logger.info('Analysis', `Superhost Status saving to DB: analysisId=${analysisId}, grade=${superhostStatusResult.grade}`);
              await storage.updateAnalysis(analysisId, {
                superhostStatusGrade: superhostStatusResult.grade,
                superhostStatusAnalysis: superhostStatusResult,
              });
              await recalculateOverallGrade(analysisId, storage);
              logger.info('Analysis', `Superhost Status DB update completed for analysisId=${analysisId}`);
              sendEvent("category", { category: "superhost_status", status: "completed", data: superhostStatusResult });
            } catch (err) {
              logger.error('Analysis', "Superhost Status Error:", err);
              sendEvent("category", { category: "superhost_status", status: "failed" });
            }
            
            Promise.all([
              (async () => {
                try {
                  const hp = scrapedData.hostProfile;
                  if (!hp) {
                    await storage.updateAnalysis(analysisId, {
                      superhostGrade: "N/A",
                      superhostAnalysis: { grade: "N/A", feedback: "No host profile data available", suggestions: [] },
                    });
                    sendEvent("category", { category: "host_profile", status: "skipped" });
                    return;
                  }
                  
                  sendEvent("category", { category: "host_profile", status: "started" });
                  
                  let photoAnalysisResult: any = null;
                  let isHeadshot = false;
                  let isWarmInviting = false;
                  let photoScore = 0;
                  if (hp.photoUrl) {
                    try {
                      const { modelId } = await getConfiguredAIModel();
                      const visionResponse = await openai.chat.completions.create({
                        model: modelId,
                        messages: [{
                          role: "user",
                          content: [
                            { type: "text", text: `Analyze this Airbnb host profile photo. Determine:
1. Is this a headshot photo of a real person (not a logo, icon, cartoon, or group photo)?
2. Does the person appear warm, friendly, and inviting (smiling, approachable expression)?
3. Is the photo high quality (good lighting, clear, professional-looking)?

Return JSON with:
{
  "isHeadshot": boolean (true if it's a real person's headshot, not a logo/icon/group),
  "isWarmInviting": boolean (true if the person looks friendly and approachable),
  "photoQuality": number (1-10 scale),
  "assessment": string (brief description of the photo)
}` },
                            { type: "image_url", image_url: { url: hp.photoUrl } }
                          ]
                        }],
                        max_tokens: 300,
                        response_format: { type: "json_object" },
                      });
                      photoAnalysisResult = JSON.parse(visionResponse.choices[0]?.message?.content || "{}");
                      isHeadshot = !!photoAnalysisResult.isHeadshot;
                      isWarmInviting = !!photoAnalysisResult.isWarmInviting;
                      photoScore = photoAnalysisResult.photoQuality || 0;
                    } catch (e) {
                      logger.error('Analysis', "Host Profile photo analysis error:", e);
                    }
                  }
                  
                  const hasGoodPhoto = isHeadshot && isWarmInviting && photoScore >= 6;
                  const hasDetailedBio = !!hp.aboutText && hp.aboutText.length > 100;
                  const personalityAttributes = hp.attributes || [];
                  const hasPersonalitySections = personalityAttributes.length >= 3;
                  
                  const bioText = (hp.aboutText || "").toLowerCase();
                  const trustBuildingKeywords = ["love", "family", "passion", "enjoy", "travel", "hobby", "favorite", "adventure", "welcome", "excited", "personally", "story", "dream", "grew up", "born", "raised"];
                  const trustBuildingMatches = trustBuildingKeywords.filter(kw => bioText.includes(kw));
                  const hasTrustBuildingContent = hasDetailedBio && trustBuildingMatches.length >= 3 && hp.aboutText!.length > 200;
                  
                  let grade: string;
                  let feedback: string;
                  const suggestions: string[] = [];
                  
                  if (hasGoodPhoto && hasDetailedBio && hasPersonalitySections && hasTrustBuildingContent) {
                    grade = "A";
                    feedback = "Excellent host profile! You have a warm, inviting headshot, a detailed personal bio, completed personality sections, and trust-building personal content that makes guests feel connected.";
                  } else if (hasGoodPhoto && hasDetailedBio && hasPersonalitySections) {
                    grade = "B";
                    feedback = "Strong host profile with a great photo, detailed bio, and personality sections. To reach an A, add more fun personal details that build trust with guests.";
                    suggestions.push("Share personal stories, hobbies, and what you love about hosting to build trust with guests");
                  } else if (hasGoodPhoto && hasDetailedBio) {
                    grade = "C";
                    feedback = "Good foundation with a quality headshot and personal bio. Complete your personality profile sections to improve your grade.";
                    suggestions.push("Complete all personality sections: My Work, Where I Was Born, Fun Fact, Pets, Languages, etc.");
                    suggestions.push("Add more personal details that help guests feel like they know you");
                  } else if (hasGoodPhoto) {
                    grade = "D";
                    feedback = "You have a solid profile photo, which is a great start. Add a detailed, personal bio to improve your host profile grade.";
                    suggestions.push("Write a detailed, personal bio (at least a few sentences) sharing who you are and why you host");
                    suggestions.push("Complete your personality profile sections (My Work, Born In, Fun Fact, etc.)");
                    suggestions.push("Share personal stories that build trust with guests");
                  } else {
                    grade = "F";
                    feedback = hp.photoUrl 
                      ? "Your profile photo needs improvement. Use a clear, warm headshot of yourself (not a logo or icon) where you appear friendly and approachable."
                      : "No profile photo found. Adding a warm, inviting headshot is the most important first step.";
                    suggestions.push("Add a clear, high-quality headshot where you look friendly and approachable (not a logo or group photo)");
                    suggestions.push("Write a detailed, personal bio sharing who you are");
                    suggestions.push("Complete all personality profile sections");
                  }
                  
                  const result = {
                    grade,
                    hostName: hp.name,
                    photoUrl: hp.photoUrl || null,
                    photoScore,
                    isHeadshot,
                    isWarmInviting,
                    photoAssessment: photoAnalysisResult?.assessment || null,
                    hasDetailedBio,
                    hasPersonalitySections,
                    personalityAttributeCount: personalityAttributes.length,
                    hasTrustBuildingContent,
                    feedback,
                    suggestions,
                  };
                  
                  hostProfileResult = result;
                  
                  logger.info('Analysis', `Host Profile saving to DB: analysisId=${analysisId}, grade=${result.grade}`);
                  await storage.updateAnalysis(analysisId, {
                    superhostGrade: result.grade,
                    superhostAnalysis: result,
                  });
                  await recalculateOverallGrade(analysisId, storage);
                  logger.info('Analysis', `Host Profile DB update completed for analysisId=${analysisId}`);
                  sendEvent("category", { category: "host_profile", status: "completed", data: result });
                } catch (err) {
                  logger.error('Analysis', "Host Profile Error:", err);
                  sendEvent("category", { category: "host_profile", status: "failed" });
                }
              })(),
              
              (async () => {
                try {
                  const sleepData = scrapedData.whereYoullSleep;
                  const rooms = sleepData?.rooms || sleepData || [];
                  if (!rooms || rooms.length === 0) {
                    await storage.updateAnalysis(analysisId, {
                      sleepGrade: "N/A",
                      sleepAnalysis: { grade: "N/A", feedback: "No sleeping arrangement data available", suggestions: [] },
                    });
                    sendEvent("category", { category: "sleep", status: "skipped" });
                    return;
                  }
                  
                  sendEvent("category", { category: "sleep", status: "started" });
                  
                  const roomAnalyses: any[] = [];
                  const roomsWithPhotos = rooms.filter((r: any) => r.photoUrl);
                  
                  for (const room of roomsWithPhotos) {
                    try {
                      const { modelId } = await getConfiguredAIModel();
                      const visionResponse = await openai.chat.completions.create({
                        model: modelId,
                        messages: [{
                          role: "user",
                          content: [
                            { type: "text", text: `Analyze this bedroom photo for an Airbnb listing. The listing describes this room as: "${room.name}" with bed configuration: "${room.bedConfiguration || 'not specified'}".

Please evaluate:
1. Do the beds visible in the photo match the described bed configuration? (e.g., if it says "1 queen bed" is there actually a queen bed visible?)
2. Rate the photo quality, staging, cleanliness, and comfort appeal (1-10).
3. Note any discrepancies between the photo and the description.

Return JSON with:
{
  "bedsMatchDescription": boolean,
  "discrepancyNotes": string (describe any mismatch, or "none" if beds match),
  "photoQuality": number (1-10),
  "comfortAppeal": number (1-10),
  "assessment": string (brief overall assessment)
}` },
                            { type: "image_url", image_url: { url: room.photoUrl } }
                          ]
                        }],
                        max_tokens: 400,
                        response_format: { type: "json_object" },
                      });
                      const analysis = JSON.parse(visionResponse.choices[0]?.message?.content || "{}");
                      roomAnalyses.push({
                        roomName: room.name,
                        bedConfiguration: room.bedConfiguration,
                        ...analysis,
                      });
                    } catch (e) {
                      logger.error('Analysis', `Sleep photo analysis error for room ${room.name}:`, e);
                      roomAnalyses.push({ roomName: room.name, bedsMatchDescription: true, photoQuality: 5, comfortAppeal: 5, assessment: "Could not analyze photo" });
                    }
                  }
                  
                  const hasPhotos = roomsWithPhotos.length > 0;
                  const hasBedConfig = rooms.every((r: any) => r.bedConfiguration);
                  const allBedsMatch = roomAnalyses.length > 0 && roomAnalyses.every(a => a.bedsMatchDescription);
                  const avgPhotoQuality = roomAnalyses.length > 0 
                    ? roomAnalyses.reduce((sum: number, a: any) => sum + (a.photoQuality || 5), 0) / roomAnalyses.length 
                    : 0;
                  const avgComfortAppeal = roomAnalyses.length > 0 
                    ? roomAnalyses.reduce((sum: number, a: any) => sum + (a.comfortAppeal || 5), 0) / roomAnalyses.length 
                    : 0;
                  const hasMultipleRooms = rooms.length >= 2;
                  
                  let grade: string;
                  let feedback: string;
                  const suggestions: string[] = [];
                  
                  if (hasPhotos && hasBedConfig && allBedsMatch && avgPhotoQuality >= 7 && avgComfortAppeal >= 7) {
                    grade = "A";
                    feedback = `Excellent sleeping arrangements! All ${rooms.length} room(s) have quality photos that accurately match the bed descriptions. Photos are well-staged and inviting.`;
                  } else if (hasPhotos && hasBedConfig && allBedsMatch && avgPhotoQuality >= 5) {
                    grade = "B";
                    feedback = `Good sleeping arrangements. Photos match bed descriptions accurately. Photo quality or staging could be improved for a higher grade.`;
                    suggestions.push("Improve photo quality with better lighting and staging");
                    suggestions.push("Ensure beds are freshly made with attractive linens for photos");
                  } else if (hasPhotos && hasBedConfig) {
                    grade = "C";
                    if (!allBedsMatch) {
                      const mismatches = roomAnalyses.filter(a => !a.bedsMatchDescription);
                      feedback = `Bed photos don't fully match descriptions. ${mismatches.map(m => `${m.roomName}: ${m.discrepancyNotes}`).join(". ")}.`;
                      suggestions.push("Update photos to accurately show the current bed configuration");
                      suggestions.push("Update bed descriptions to match what's actually in the room");
                    } else {
                      feedback = `Sleeping arrangements documented but photo quality needs improvement.`;
                      suggestions.push("Retake bedroom photos with better lighting and staging");
                    }
                  } else if (hasBedConfig) {
                    grade = "D";
                    feedback = `Bed configurations listed but no photos provided for sleeping areas.`;
                    suggestions.push("Add high-quality photos for each sleeping area");
                    suggestions.push("Show the actual beds and linens in well-lit, staged photos");
                  } else {
                    grade = "D";
                    feedback = `Sleeping arrangement information is incomplete.`;
                    suggestions.push("Add clear bed configurations for each room");
                    suggestions.push("Add quality photos of each sleeping area");
                  }
                  
                  const result = {
                    grade,
                    roomCount: rooms.length,
                    avgPhotoQuality: Math.round(avgPhotoQuality * 10) / 10,
                    avgComfortAppeal: Math.round(avgComfortAppeal * 10) / 10,
                    allBedsMatch,
                    rooms: rooms.map((r: any) => ({ name: r.name, bedConfiguration: r.bedConfiguration })),
                    roomAnalyses,
                    feedback,
                    suggestions,
                  };
                  
                  sleepResult = result;
                  
                  logger.info('Analysis', `Sleep saving to DB: analysisId=${analysisId}, grade=${result.grade}`);
                  await storage.updateAnalysis(analysisId, {
                    sleepGrade: result.grade,
                    sleepAnalysis: result,
                  });
                  await recalculateOverallGrade(analysisId, storage);
                  logger.info('Analysis', `Sleep DB update completed for analysisId=${analysisId}`);
                  sendEvent("category", { category: "sleep", status: "completed", data: result });
                } catch (err) {
                  logger.error('Analysis', "Sleep Error:", err);
                  sendEvent("category", { category: "sleep", status: "failed" });
                }
              })()
            ]).catch(err => logger.error('Analysis', "Scraped AI Background error:", err));
            
            sendEvent("stage", { stage: "scraped", status: "completed" });
          } else {
            logger.info('Analysis', `Scraper returned no data - setting all scraped grades to N/A`);
            const noDataResult = { grade: "N/A", feedback: "Airbnb data unavailable", suggestions: [] };
            await storage.updateAnalysis(analysisId, {
              guestFavGrade: "N/A", guestFavAnalysis: noDataResult,
              superhostStatusGrade: "N/A", superhostStatusAnalysis: noDataResult,
              superhostGrade: "N/A", superhostAnalysis: noDataResult,
              sleepGrade: "N/A", sleepAnalysis: noDataResult,
            });
            sendEvent("stage", { stage: "scraped", status: "failed", message: "No Airbnb data" });
          }
        })();
      } else {
        logger.info('Analysis', `No scraperPromise (no Airbnb URL) - setting all scraped grades to N/A`);
        const noUrlResult = { grade: "N/A", feedback: "No Airbnb URL configured", suggestions: ["Add your Airbnb listing URL"] };
        await storage.updateAnalysis(analysisId, {
          guestFavGrade: "N/A", guestFavAnalysis: noUrlResult,
          superhostStatusGrade: "N/A", superhostStatusAnalysis: noUrlResult,
          superhostGrade: "N/A", superhostAnalysis: noUrlResult,
          sleepGrade: "N/A", sleepAnalysis: noUrlResult,
        });
        sendEvent("stage", { stage: "scraped", status: "skipped", message: "No Airbnb URL configured" });
      }

      sendEvent("category", { category: "reviews", status: "started" });
      const calculateReviewsGrade = () => {
        if (avgRating === null) {
          return { grade: "N/A", score: null, feedback: "No reviews with ratings available", suggestions: [] };
        }
        
        const recentReviews = reviewsWithRatings.slice(0, 10);
        const recentDings = recentReviews.filter((r: any) => r.rating <= 4).length;
        
        let grade: string;
        let score: number;
        
        if (avgRating >= 4.8) grade = "A";
        else if (avgRating >= 4.5) grade = "B";
        else if (avgRating >= 4.0) grade = "C";
        else if (avgRating >= 3.5) grade = "D";
        else grade = "F";
        
        score = Math.round(avgRating * 2);
        
        if (recentDings >= 3 && grade === "A") grade = "B";
        if (recentDings >= 5 && grade === "B") grade = "C";
        
        const feedback = `Average rating: ${avgRating.toFixed(2)} stars from ${reviewsWithRatings.length} reviews. ${recentDings > 0 ? `Recent trend: ${recentDings} review(s) at 4 stars or below in last 10.` : "Recent trend is strong."}`;
        
        return {
          grade,
          score,
          feedback,
          suggestions: grade !== "A" ? ["Focus on addressing recent guest concerns", "Respond promptly to all reviews"] : []
        };
      };

      const reviewsGrade = calculateReviewsGrade();
      sendEvent("category", { category: "reviews", status: "completed", data: reviewsGrade });

      const calculatePetGrade = async (): Promise<{ grade: string; score: number; feedback: string; suggestions: string[] }> => {
        if (petsAllowed === false) {
          return { grade: "F", score: 2, feedback: "Pets are not allowed at this property", suggestions: ["Consider allowing pets to expand your guest base"] };
        }
        if (petsAllowed !== true) {
          return { grade: "N/A", score: 0, feedback: "Pet policy not specified in property data", suggestions: ["Set your pet policy in your property settings to get a pet grade"] };
        }
        const listingDescription = [listing.summary, detailsData.summary, (listing as any).description].filter(Boolean).join("\n\n");
        if (!listingDescription.trim()) {
          return { grade: "C", score: 6, feedback: "Pets are allowed but no listing description available to evaluate pet promotion", suggestions: ["Add details about pet-friendly features in your listing description"] };
        }
        try {
          const { modelId, modelInfo } = await getConfiguredAIModel();
          const petPromptText = `Analyze this short-term rental listing description to evaluate how actively it promotes being pet-friendly. The listing DOES allow pets per the property data.

LISTING DESCRIPTION:
${listingDescription}

AMENITIES:
${Array.isArray(amenities) ? amenities.join(", ") : "None listed"}

Evaluate whether the listing:
1. Simply allows pets without mentioning it in the description (Grade: C)
2. Mentions being pet-friendly and lists some pet amenities or considerations (Grade: B)
3. Actively promotes an exceptional pet experience - dedicated pet amenities, pet beds/bowls provided, fenced yard highlighted, nearby dog parks mentioned, pet-specific welcome touches, etc. (Grade: A)

Return JSON:
{
  "grade": "A" or "B" or "C",
  "score": <number 1-10>,
  "feedback": "<1-2 sentence explanation>",
  "suggestions": ["<actionable suggestion 1>", "<actionable suggestion 2>"]
}`;
          const completion = await openai.chat.completions.create({
            model: modelId,
            messages: [
              { role: "system", content: "You are an expert Airbnb listing analyst specializing in pet-friendly accommodations. Grade how well the listing promotes its pet-friendly status." },
              { role: "user", content: petPromptText }
            ],
            response_format: { type: "json_object" },
            max_tokens: 500,
          });
          const result = JSON.parse(completion.choices[0]?.message?.content || "{}");
          await storage.createAiUsageLog({
            userId,
            label: "Pet Grade AI Analysis (Staged)",
            model: modelId,
            inputTokens: completion.usage?.prompt_tokens || 0,
            outputTokens: completion.usage?.completion_tokens || 0,
            estimatedCost: calculateAICost(completion.usage?.prompt_tokens || 0, completion.usage?.completion_tokens || 0, modelInfo),
            listingId: listing.id,
            listingName: listing.name,
          });
          const validGrades = ["A", "B", "C"];
          const grade = validGrades.includes(result.grade) ? result.grade : "C";
          return {
            grade,
            score: typeof result.score === "number" ? result.score : (grade === "A" ? 9 : grade === "B" ? 7 : 6),
            feedback: result.feedback || "Pets are allowed at this property",
            suggestions: Array.isArray(result.suggestions) ? result.suggestions : [],
          };
        } catch (err) {
          logger.error('Analysis', "Pet AI analysis error:", err);
          return { grade: "C", score: 6, feedback: "Pets are allowed (AI description analysis failed)", suggestions: ["Add details about pet-friendly features in your listing description"] };
        }
      };

      sendEvent("category", { category: "pet", status: "started" });
      const petGrade = await calculatePetGrade();
      sendEvent("category", { category: "pet", status: "completed", data: petGrade });

      const runCategoryAnalysis = async (category: string, context: Record<string, string>) => {
        try {
          const prompt = await storage.getPromptByCategory(category);
          if (!prompt) return null;
          
          let filledPrompt = prompt.promptTemplate;
          for (const [key, value] of Object.entries(context)) {
            filledPrompt = filledPrompt.replace(new RegExp(`{{${key}}}`, "g"), value);
          }
          
          const { modelId, modelInfo } = await getConfiguredAIModel();
          const completion = await openai.chat.completions.create({
            model: modelId,
            messages: [
              { role: "system", content: prompt.systemPrompt },
              { role: "user", content: filledPrompt }
            ],
            response_format: { type: "json_object" },
            max_tokens: 1500,
          });
          
          const result = JSON.parse(completion.choices[0]?.message?.content || "{}");
          
          await storage.createAiUsageLog({
            userId,
            label: `${category} Analysis (Staged)`,
            model: modelId,
            inputTokens: completion.usage?.prompt_tokens || 0,
            outputTokens: completion.usage?.completion_tokens || 0,
            estimatedCost: calculateAICost(
              completion.usage?.prompt_tokens || 0,
              completion.usage?.completion_tokens || 0,
              modelInfo
            ),
            listingId: listing.id,
            listingName: listing.name,
          });
          
          return result;
        } catch (err) {
          logger.error('Analysis', `${category} analysis error:`, err);
          return null;
        }
      };

      sendEvent("category", { category: "title", status: "started" });
      sendEvent("category", { category: "description", status: "started" });
      const [titleResult, descriptionResult] = await Promise.all([
        runCategoryAnalysis("title", {
          listing_name: listing.name,
          title: listing.name,
          ideal_guest_profile: igpResult?.summary || "",
          location: listing.address || "",
          property_type: listing.propertyType || ""
        }),
        runCategoryAnalysis("description", {
          listing_name: listing.name,
          description: listing.summary || detailsData.summary || "",
          ideal_guest_profile: igpResult?.summary || "",
          amenities: Array.isArray(amenities) ? amenities.join(", ") : ""
        })
      ]);

      if (titleResult) {
        sendEvent("category", { category: "title", status: "completed", data: titleResult });
      }
      if (descriptionResult) {
        sendEvent("category", { category: "description", status: "completed", data: descriptionResult });
      }

      sendEvent("stage", { stage: "parallel", status: "completed" });
      
      await storage.updateAnalysis(analysisId, {
        overallScore: reviewsGrade.score || 5,
        titleGrade: normalizeGrade(titleResult?.grade) || "C",
        titleFeedback: titleResult?.feedback || "",
        titleSuggestions: titleResult?.suggestions || [],
        descriptionGrade: normalizeGrade(descriptionResult?.grade) || "C",
        descriptionFeedback: descriptionResult?.feedback || "",
        descriptionSuggestions: descriptionResult?.suggestions || [],
        petGrade: normalizeGrade(petGrade.grade) || petGrade.grade,
        petFeedback: petGrade.feedback,
        petSuggestions: petGrade.suggestions,
        reviewsGrade: normalizeGrade(reviewsGrade.grade) || reviewsGrade.grade,
        reviewsFeedback: reviewsGrade.feedback,
        reviewsSuggestions: reviewsGrade.suggestions,
      });
      logger.info('Analysis', `Updated analysis with Title, Description, Pet, Reviews grades`);

      if (scrapedProcessingPromise) {
        try {
          await scrapedProcessingPromise;
          logger.info('Analysis', `All scraped category processing completed`);
        } catch (err) {
          logger.error('Analysis', `Error during scraped processing:`, err);
        }
      }

      if (images.length > 0) {
        sendEvent("stage", { stage: "photos", status: "pending", 
          data: { totalPhotos: images.length, message: "Photo analysis available via separate endpoint" } });
      }

      sendEvent("stage", { stage: "igp_final", status: "started", message: "Calculating final guest appeal scores..." });
      
      try {
        const igpPrompt = await storage.getPromptByCategory("igp_analysis");
        if (igpPrompt) {
          const analysisContextParts: string[] = [];
          
          if (titleResult) {
            analysisContextParts.push(`TITLE ANALYSIS (Grade: ${titleResult.grade}):
Feedback: ${titleResult.feedback}
Suggestions: ${(titleResult.suggestions || []).join(", ")}`);
          }
          
          if (descriptionResult) {
            analysisContextParts.push(`DESCRIPTION ANALYSIS (Grade: ${descriptionResult.grade}):
Feedback: ${descriptionResult.feedback}
Suggestions: ${(descriptionResult.suggestions || []).join(", ")}`);
          }
          
          if (petGrade) {
            analysisContextParts.push(`PET POLICY ANALYSIS (Grade: ${petGrade.grade}):
Feedback: ${petGrade.feedback}`);
          }
          
          if (reviewsGrade) {
            analysisContextParts.push(`REVIEWS ANALYSIS (Grade: ${reviewsGrade.grade}):
Feedback: ${reviewsGrade.feedback}
Average Rating: ${(reviewsGrade as any).averageRating || "N/A"}`);
          }
          
          if (hostProfileResult) {
            analysisContextParts.push(`HOST PROFILE ANALYSIS (Grade: ${hostProfileResult.grade}):
Feedback: ${hostProfileResult.feedback}
Host Bio: ${scrapedData?.hostProfile?.bioText || "Not available"}`);
          }
          
          if (sleepResult) {
            analysisContextParts.push(`SLEEP SETUP ANALYSIS (Grade: ${sleepResult.grade}):
Feedback: ${sleepResult.feedback}
Bedrooms: ${JSON.stringify(scrapedData?.whereYoullSleep || [])}`);
          }
          
          const analysisContext = analysisContextParts.join("\n\n");
          
          const reservationsContextStr = reservationContext.map((r, i) => 
            `Reservation ${i + 1}:
Guest: ${r.guestName}
Check-in: ${r.checkIn}, Check-out: ${r.checkOut}
Messages: ${r.messages || "None"}
Review: ${r.reviewPublic || "None"}
Private Remarks: ${r.reviewPrivate || "None"}
Rating: ${r.rating || "N/A"}`
          ).join("\n\n");

          let igpPromptFilled = igpPrompt.promptTemplate
            .replace("{{listing_name}}", listing.name)
            .replace("{{location}}", listing.address || "Unknown")
            .replace("{{bedrooms}}", String(listing.bedrooms || "Unknown"))
            .replace("{{bathrooms}}", String(listing.bathrooms || "Unknown"))
            .replace("{{max_guests}}", String(listing.maxGuests || "Unknown"))
            .replace("{{property_type}}", listing.propertyType || "Unknown")
            .replace("{{amenities}}", Array.isArray(amenities) ? amenities.join(", ") : "Unknown")
            .replace("{{reservation_count}}", String(effectiveReservations.length))
            .replace("{{reservations_context}}", reservationsContextStr);
          
          igpPromptFilled = igpPromptFilled.replace("{{analysis_context}}", 
            analysisContext ? `\nCOMPLETED ANALYSIS RESULTS:\n${analysisContext}\n` : "");

          const { modelId, modelInfo } = await getConfiguredAIModel();
          const igpFinalCompletion = await openai.chat.completions.create({
            model: modelId,
            messages: [
              { role: "system", content: igpPrompt.systemPrompt },
              { role: "user", content: igpPromptFilled }
            ],
            response_format: { type: "json_object" },
            max_tokens: 16000,
          });

          const igpFinalText = igpFinalCompletion.choices[0]?.message?.content || "{}";
          logger.info('Analysis', `IGP final response length: ${igpFinalText.length} chars, finish_reason: ${igpFinalCompletion.choices[0]?.finish_reason}`);
          let igpFinalResult;
          try {
            igpFinalResult = JSON.parse(igpFinalText);
          } catch (parseErr) {
            logger.error('Analysis', `IGP final JSON parse failed, attempting repair. Error: ${parseErr}`);
            igpFinalResult = repairTruncatedJson(igpFinalText);
          }
          
          igpResult = igpFinalResult;

          const inputTokens = igpFinalCompletion.usage?.prompt_tokens || 0;
          const outputTokens = igpFinalCompletion.usage?.completion_tokens || 0;
          await storage.createAiUsageLog({
            userId,
            label: "IGP Final Analysis (Stage 5)",
            model: modelId,
            inputTokens,
            outputTokens,
            estimatedCost: calculateAICost(inputTokens, outputTokens, modelInfo),
            listingId: listing.id,
            listingName: listing.name,
          });
          
          sendEvent("stage", { stage: "igp_final", status: "completed", data: igpResult });
        }
      } catch (igpFinalError) {
        logger.error('Analysis', "IGP final analysis error:", igpFinalError);
        sendEvent("stage", { stage: "igp_final", status: "failed", message: "Could not complete final IGP analysis" });
      }

      let alignmentScores: { guestType: string; score: number; rationale: string[] }[] = [];
      
      if (igpResult?.guestTypes && Array.isArray(igpResult.guestTypes) && igpResult.guestTypes.length > 0) {
        try {
          sendEvent("stage", { stage: "alignment", status: "started", message: "Calculating alignment scores..." });
          
          const alignmentPrompt = `Evaluate how well this listing aligns with each identified guest type based on the listing's current state.

LISTING DETAILS:
- Name: ${listing.name}
- Location: ${listing.address || "Unknown"}
- Property Type: ${listing.propertyType || "Unknown"}
- Bedrooms: ${listing.bedrooms || "Unknown"}
- Bathrooms: ${listing.bathrooms || "Unknown"}
- Max Guests: ${listing.maxGuests || "Unknown"}
- Amenities: ${Array.isArray(amenities) ? amenities.join(", ") : "Unknown"}
- Description: ${listing.description || "Not provided"}
- Pets Allowed: ${listing.petsAllowed ? "Yes" : "No"}

ANALYSIS RESULTS:
${titleResult ? `Title Grade: ${titleResult.grade} - ${titleResult.feedback}` : ""}
${descriptionResult ? `Description Grade: ${descriptionResult.grade} - ${descriptionResult.feedback}` : ""}
${petGrade ? `Pet Policy Grade: ${petGrade.grade}` : ""}
${reviewsGrade ? `Reviews Grade: ${reviewsGrade.grade} (Avg: ${(reviewsGrade as any).averageRating || "N/A"})` : ""}
${hostProfileResult ? `Host Profile Grade: ${hostProfileResult.grade}` : ""}
${sleepResult ? `Sleep Setup Grade: ${sleepResult.grade}` : ""}

IDENTIFIED GUEST TYPES TO EVALUATE:
${igpResult.guestTypes.map((gt: any, i: number) => `${i + 1}. ${gt.name}: ${gt.description}`).join("\n")}

For EACH guest type, provide an alignment score (0-100) indicating how well the listing currently suits that guest type, along with 3-4 specific rationale points explaining the score.

Return JSON:
{
  "alignmentScores": [
    {
      "guestType": "Guest Type Name",
      "score": 85,
      "rationale": [
        "Strong point about listing alignment",
        "Area where listing meets guest needs",
        "Gap or improvement opportunity",
        "Specific amenity/feature match or mismatch"
      ]
    }
  ]
}`;

          const { modelId, modelInfo } = await getConfiguredAIModel();
          const alignmentCompletion = await openai.chat.completions.create({
            model: modelId,
            messages: [
              { role: "system", content: "You are an expert Airbnb analyst. Evaluate listing alignment objectively based on the data provided." },
              { role: "user", content: alignmentPrompt }
            ],
            response_format: { type: "json_object" },
            max_tokens: 2000,
          });

          const alignmentText = alignmentCompletion.choices[0]?.message?.content || "{}";
          const alignmentParsed = JSON.parse(alignmentText);
          alignmentScores = alignmentParsed.alignmentScores || [];
          
          igpResult.alignmentScores = alignmentScores;

          const alignInputTokens = alignmentCompletion.usage?.prompt_tokens || 0;
          const alignOutputTokens = alignmentCompletion.usage?.completion_tokens || 0;
          await storage.createAiUsageLog({
            userId,
            label: "IGP Alignment Analysis (Stage 5)",
            model: modelId,
            inputTokens: alignInputTokens,
            outputTokens: alignOutputTokens,
            estimatedCost: calculateAICost(alignInputTokens, alignOutputTokens, modelInfo),
            listingId: listing.id,
            listingName: listing.name,
          });
          
          sendEvent("stage", { stage: "alignment", status: "completed", data: { alignmentScores } });
        } catch (alignmentError) {
          logger.error('Analysis', "Alignment analysis error:", alignmentError);
          sendEvent("stage", { stage: "alignment", status: "failed", message: "Could not calculate alignment scores" });
        }
      }

      await storage.updateAnalysis(analysisId, {
        idealGrade: igpResult?.grade || "C",
        idealFeedback: igpResult?.summary || "IGP analysis complete",
        idealSuggestions: igpResult?.painPoints || [],
        idealGuestProfile: igpResult,
        topSuggestions: igpResult?.painPoints || [],
      });
      
      logger.info('Analysis', `Updated with IGP results. Analysis ID: ${analysisId}`);

      await recalculateOverallGrade(analysisId, storage);

      sendEvent("complete", { 
        analysisId: analysisId,
        message: "Staged analysis complete. AI analyses for Host Profile and Sleep may still be running in background.",
        igp: igpResult,
        categories: {
          title: titleResult,
          description: descriptionResult,
          pet: petGrade,
          reviews: reviewsGrade,
          host_profile: hostProfileResult,
          sleep: sleepResult,
          guest_favorite: undefined,
          superhost_status: undefined
        },
        photosPending: images.length > 0,
        scrapedDataAvailable: !!scraperPromise
      });

      res.end();

    } catch (error) {
      logger.error('Analysis', "Staged analysis error:", error);
      sendEvent("error", { message: "Analysis failed" });
      res.end();
    }
  });

  // Re-run analysis for a single category
  app.post("/api/listings/:id/analyze-category", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const listingId = getParamId(req.params.id);
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const category = typeof body.category === "string" ? body.category.trim() : "";

      const listing = await storage.getListing(listingId);
      if (!listing) return res.status(404).json({ message: "Listing not found" });
      if (listing.workspaceId) {
        const membership = await storage.getWorkspaceMember(listing.workspaceId, userId);
        if (!membership) return res.status(403).json({ message: "Access denied" });
      } else if (listing.userId !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      let latestAnalysis = await storage.getLatestAnalysisByListing(listingId);
      if (!latestAnalysis) {
        const created = await storage.createAnalysis({
          listingId,
          userId,
          workspaceId: listing.workspaceId,
          overallScore: 5,
          titleGrade: null, descriptionGrade: null, petGrade: null, reviewsGrade: null,
          idealGrade: null, idealGuestProfile: null,
          superhostGrade: null, superhostAnalysis: null, sleepGrade: null, sleepAnalysis: null,
          guestFavGrade: null, guestFavAnalysis: null, superhostStatusGrade: null, superhostStatusAnalysis: null,
          photoAnalysisStatus: "complete", photoAnalysisTotalPhotos: 0,
        });
        latestAnalysis = created;
      }
      const analysisId = latestAnalysis.id;

      if (["sleep", "host_profile"].includes(category)) {
        return res.status(400).json({
          message: "Run a full analysis to refresh Sleep or Host Profile (they require fresh Airbnb scan and AI).",
          code: "USE_FULL_ANALYSIS",
        });
      }

      if (category === "guest_favorites" || category === "superhost_status") {
        const scan = await storage.getAirbnbScanByListing(listingId);
        if (!scan || scan.status !== "completed") {
          return res.status(400).json({
            message: "No completed Airbnb scan for this listing. Run a full analysis first.",
            code: "NO_SCAN",
          });
        }
        const guestFavoriteTier = scan.guestFavoriteTier;
        const isSuperhost = !!scan.isSuperhost;
        const hostProfile = scan.hostProfile;

        if (category === "guest_favorites") {
          const isGuestFavorite = !!guestFavoriteTier;
          const gfGrade = isGuestFavorite ? "A" : "C";
          const gfTierLabel = guestFavoriteTier === "gold" ? "Gold (Top 1%)" : guestFavoriteTier === "black" ? "Black (Top 5%)" : "Standard (Top 10%)";
          const gfFeedback = isGuestFavorite
            ? (guestFavoriteTier === "gold" ? "Congratulations! This listing has earned Airbnb's highest Guest Favorite distinction - Top 1% of homes."
              : guestFavoriteTier === "black" ? "Great achievement! This listing has earned Airbnb's Guest Favorite badge at the Black tier - Top 5% of homes."
              : "This listing has earned Airbnb's Guest Favorite badge - Top 10% of homes.")
            : "This listing has not yet earned the Guest Favorite badge. Focus on consistently high ratings, reliability, and guest satisfaction to achieve this status.";
          const guestFavResult = {
            grade: gfGrade,
            isGuestFavorite,
            tier: guestFavoriteTier || null,
            tierLabel: gfTierLabel,
            feedback: gfFeedback,
            suggestions: isGuestFavorite ? [] : ["Maintain a 4.9+ average rating", "Respond quickly to all guest inquiries", "Ensure listing accuracy to set proper expectations"],
          };
          await storage.updateAnalysis(analysisId, { guestFavGrade: guestFavResult.grade, guestFavAnalysis: guestFavResult });
          await recalculateOverallGrade(analysisId, storage);
          return res.json({ category: "guest_favorites", grade: guestFavResult.grade, data: guestFavResult });
        }

        if (category === "superhost_status") {
          const superhostStatusResult = {
            grade: isSuperhost ? "A" : "C",
            isSuperhost,
            hostName: hostProfile?.name || "Unknown",
            yearsHosting: hostProfile?.yearsHosting ?? null,
            responseRate: hostProfile?.responseRate ?? null,
            reviewCount: hostProfile?.reviewCount ?? null,
            feedback: isSuperhost
              ? "This host has earned Airbnb's Superhost status."
              : "This host has not yet achieved Superhost status. Superhost requires maintaining a 4.8+ overall rating, 90%+ response rate, and at least 10 completed stays per year.",
            suggestions: isSuperhost ? [] : ["Maintain a 4.8+ overall rating", "Achieve 90%+ response rate within 24 hours", "Complete at least 10 stays per year"],
          };
          await storage.updateAnalysis(analysisId, { superhostStatusGrade: superhostStatusResult.grade, superhostStatusAnalysis: superhostStatusResult });
          await recalculateOverallGrade(analysisId, storage);
          return res.json({ category: "superhost_status", grade: superhostStatusResult.grade, data: superhostStatusResult });
        }
      }

      const dataSource = listing.dataSourceId ? await storage.getDataSource(listing.dataSourceId) : null;
      let apiAccessToken: string | null = null;
      if (listing.dataSourceId) {
        const { accessToken: validToken } = await getValidAccessToken(listing.dataSourceId);
        apiAccessToken = validToken;
      }
      let propertyDetails: any = null;
      let reviews: any[] = [];
      let reservations: any[] = [];
      if (apiAccessToken && listing.externalId) {
        try {
          const [detailsResp, resList] = await Promise.all([
            fetch(`https://public.api.hospitable.com/v2/properties/${listing.externalId}?include=details`, { headers: { Authorization: `Bearer ${apiAccessToken}` } }),
            storage.getReservationsByListing(listingId),
          ]);
          propertyDetails = detailsResp.ok ? await detailsResp.json() : null;
          reservations = resList || [];
          let page = 1;
          let hasMore = true;
          while (hasMore && page <= 5) {
            const revResp = await fetch(
              `https://public.api.hospitable.com/v2/properties/${listing.externalId}/reviews?page=${page}&per_page=100`,
              { headers: { Authorization: `Bearer ${apiAccessToken}` } }
            );
            if (!revResp.ok) break;
            const revData = await revResp.json();
            const pageReviews = revData.data || [];
            reviews = [...reviews, ...pageReviews];
            hasMore = pageReviews.length === 100;
            page++;
          }
        } catch (e) {
          logger.error('Analysis', "analyze-category Fetch error:", e);
        }
      }

      const propData = propertyDetails?.data || {};
      const propAttributes = propData.attributes || {};
      const detailsData = propAttributes.details || {};
      const amenitiesRaw = detailsData.amenities || listing.amenities || [];
      const amenities = Array.isArray(amenitiesRaw) ? amenitiesRaw.map((a: any) => (typeof a === "string" ? a : a?.name ?? "")).filter(Boolean) : [];
      const petsAllowedFromApi2 = detailsData.house_rules?.pets_allowed;
      const petsAllowedFromListing2 = (listing.houseRules as any)?.pets_allowed;
      const petsAllowed: boolean | undefined = petsAllowedFromApi2 !== undefined ? petsAllowedFromApi2 : petsAllowedFromListing2;
      logger.info('Analysis', `Single-category pet policy: fromApi=${petsAllowedFromApi2}, fromListing=${petsAllowedFromListing2}, resolved=${petsAllowed}`);

      if (category === "reviews") {
        const reviewTexts = reviews.map((r: any) => {
          const rating = r.attributes?.rating?.overall ?? r.public?.rating ?? r.rating ?? r.overall_rating ?? (typeof r.attributes?.rating === "number" ? r.attributes.rating : null);
          return { rating };
        });
        const reviewsWithRatings = reviewTexts.filter((r: any) => r.rating != null && typeof r.rating === "number");
        const avgRating = reviewsWithRatings.length > 0 ? reviewsWithRatings.reduce((s: number, r: any) => s + r.rating, 0) / reviewsWithRatings.length : null;
        let grade = "N/A";
        let score: number | null = null;
        let feedback = "No reviews with ratings available";
        const suggestions: string[] = [];
        if (avgRating !== null) {
          const recentDings = reviewsWithRatings.slice(0, 10).filter((r: any) => r.rating <= 4).length;
          if (avgRating >= 4.8) grade = "A";
          else if (avgRating >= 4.5) grade = "B";
          else if (avgRating >= 4.0) grade = "C";
          else if (avgRating >= 3.5) grade = "D";
          else grade = "F";
          score = Math.round(avgRating * 2);
          if (recentDings >= 3 && grade === "A") grade = "B";
          if (recentDings >= 5 && grade === "B") grade = "C";
          feedback = `Average rating: ${avgRating.toFixed(2)} stars from ${reviewsWithRatings.length} reviews.`;
          if (grade !== "A") suggestions.push("Focus on addressing recent guest concerns", "Respond promptly to all reviews");
        }
        await storage.updateAnalysis(analysisId, {
          reviewsGrade: grade,
          reviewsFeedback: feedback,
          reviewsSuggestions: suggestions,
        });
        await recalculateOverallGrade(analysisId, storage);
        return res.json({ category: "reviews", grade, data: { grade, score, feedback, suggestions } });
      }

      if (category === "pet") {
        let petResult: { grade: string; score: number; feedback: string; suggestions: string[] };
        if (petsAllowed === false) {
          petResult = { grade: "F", score: 2, feedback: "Pets are not allowed at this property", suggestions: ["Consider allowing pets to expand your guest base"] };
        } else if (petsAllowed !== true) {
          petResult = { grade: "N/A", score: 0, feedback: "Pet policy not specified in property data", suggestions: ["Set your pet policy in your property settings to get a pet grade"] };
        } else {
          const listingDescription = [listing.summary, detailsData.summary, (listing as any).description].filter(Boolean).join("\n\n");
          if (!listingDescription.trim()) {
            petResult = { grade: "C", score: 6, feedback: "Pets are allowed but no listing description available to evaluate pet promotion", suggestions: ["Add details about pet-friendly features in your listing description"] };
          } else {
            try {
              const { modelId, modelInfo } = await getConfiguredAIModel();
              const petPromptText = `Analyze this short-term rental listing description to evaluate how actively it promotes being pet-friendly. The listing DOES allow pets per the property data.

LISTING DESCRIPTION:
${listingDescription}

AMENITIES:
${Array.isArray(amenities) ? amenities.join(", ") : "None listed"}

Evaluate whether the listing:
1. Simply allows pets without mentioning it in the description (Grade: C)
2. Mentions being pet-friendly and lists some pet amenities or considerations (Grade: B)
3. Actively promotes an exceptional pet experience - dedicated pet amenities, pet beds/bowls provided, fenced yard highlighted, nearby dog parks mentioned, pet-specific welcome touches, etc. (Grade: A)

Return JSON:
{
  "grade": "A" or "B" or "C",
  "score": <number 1-10>,
  "feedback": "<1-2 sentence explanation>",
  "suggestions": ["<actionable suggestion 1>", "<actionable suggestion 2>"]
}`;
              const completion = await openai.chat.completions.create({
                model: modelId,
                messages: [
                  { role: "system", content: "You are an expert Airbnb listing analyst specializing in pet-friendly accommodations. Grade how well the listing promotes its pet-friendly status." },
                  { role: "user", content: petPromptText }
                ],
                response_format: { type: "json_object" },
                max_tokens: 500,
              });
              const result = JSON.parse(completion.choices[0]?.message?.content || "{}");
              await storage.createAiUsageLog({
                userId,
                label: "Pet Grade AI Analysis (Single Category)",
                model: modelId,
                inputTokens: completion.usage?.prompt_tokens || 0,
                outputTokens: completion.usage?.completion_tokens || 0,
                estimatedCost: calculateAICost(completion.usage?.prompt_tokens || 0, completion.usage?.completion_tokens || 0, modelInfo),
                listingId: listing.id,
                listingName: listing.name,
              });
              const validGrades = ["A", "B", "C"];
              const grade = validGrades.includes(result.grade) ? result.grade : "C";
              petResult = {
                grade,
                score: typeof result.score === "number" ? result.score : (grade === "A" ? 9 : grade === "B" ? 7 : 6),
                feedback: result.feedback || "Pets are allowed at this property",
                suggestions: Array.isArray(result.suggestions) ? result.suggestions : [],
              };
            } catch (err) {
              logger.error('Analysis', "Pet AI analysis error (single category):", err);
              petResult = { grade: "C", score: 6, feedback: "Pets are allowed (AI description analysis failed)", suggestions: ["Add details about pet-friendly features in your listing description"] };
            }
          }
        }
        await storage.updateAnalysis(analysisId, { petGrade: petResult.grade, petFeedback: petResult.feedback, petSuggestions: petResult.suggestions });
        await recalculateOverallGrade(analysisId, storage);
        return res.json({ category: "pet", grade: petResult.grade, data: petResult });
      }

      if (category === "title" || category === "description") {
        const igpSummary = (latestAnalysis.idealGuestProfile as any)?.summary || "";
        const runCategoryAnalysis = async (cat: string, context: Record<string, string>) => {
          const prompt = await storage.getPromptByCategory(cat);
          if (!prompt) return null;
          let filledPrompt = prompt.promptTemplate;
          for (const [key, value] of Object.entries(context)) {
            filledPrompt = filledPrompt.replace(new RegExp(`{{${key}}}`, "g"), value);
          }
          const { modelId, modelInfo } = await getConfiguredAIModel();
          const completion = await openai.chat.completions.create({
            model: modelId,
            messages: [{ role: "system", content: prompt.systemPrompt }, { role: "user", content: filledPrompt }],
            response_format: { type: "json_object" },
            max_tokens: 1500,
          });
          const result = JSON.parse(completion.choices[0]?.message?.content || "{}");
          await storage.createAiUsageLog({
            userId,
            label: `${cat} Analysis (Single Category)`,
            model: modelId,
            inputTokens: completion.usage?.prompt_tokens || 0,
            outputTokens: completion.usage?.completion_tokens || 0,
            estimatedCost: calculateAICost(completion.usage?.prompt_tokens || 0, completion.usage?.completion_tokens || 0, modelInfo),
            listingId: listing.id,
            listingName: listing.name,
          });
          return result;
        };
        const context = {
          listing_name: listing.name,
          title: listing.name,
          ideal_guest_profile: igpSummary,
          location: listing.address || "",
          property_type: listing.propertyType || "",
          description: listing.summary || detailsData.summary || "",
          amenities: Array.isArray(amenities) ? amenities.join(", ") : "",
        };
        const result = await runCategoryAnalysis(category, context);
        if (!result) return res.status(500).json({ message: `Failed to run ${category} analysis` });
        const normalizedGrade = normalizeGrade(result.grade) || "C";
        if (category === "title") {
          await storage.updateAnalysis(analysisId, { titleGrade: normalizedGrade, titleFeedback: result.feedback || "", titleSuggestions: result.suggestions || [] });
          await recalculateOverallGrade(analysisId, storage);
          return res.json({ category: "title", grade: normalizedGrade, data: { ...result, grade: normalizedGrade } });
        }
        await storage.updateAnalysis(analysisId, { descriptionGrade: normalizedGrade, descriptionFeedback: result.feedback || "", descriptionSuggestions: result.suggestions || [] });
        await recalculateOverallGrade(analysisId, storage);
        return res.json({ category: "description", grade: normalizedGrade, data: { ...result, grade: normalizedGrade } });
      }

      return res.status(400).json({ message: `Unknown or unsupported category: ${category}` });
    } catch (err) {
      logger.error('Analysis', "analyze-category Error:", err);
      res.status(500).json({ message: "Failed to run category analysis" });
    }
  });

  // Phase 2: Analyze photos with visual progress updates
  app.post("/api/listings/:id/analyze-photos", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const listing = await storage.getListing(getParamId(req.params.id));
      
      if (!listing || listing.userId !== userId) {
        return res.status(404).json({ message: "Listing not found" });
      }

      const images = (listing.images as string[]) || [];
      const photosToAnalyze = images.length;
      
      if (photosToAnalyze === 0) {
        return res.json({ success: true, analyzed: 0, message: "No photos to analyze" });
      }

      const latestAnalysis = await storage.getLatestAnalysisByListing(listing.id);
      if (!latestAnalysis) {
        return res.status(400).json({ message: "No analysis found. Run the main analysis first." });
      }

      await storage.updateAnalysis(latestAnalysis.id, {
        photoAnalysisStatus: "in_progress",
        photoAnalysisProgress: 0,
        photoAnalysisTotalPhotos: photosToAnalyze,
      });

      const existingAnalyses = await storage.getPhotoAnalysesByListing(listing.id);
      const existingIndices = new Set(existingAnalyses.map(a => a.photoIndex));
      
      const indicesToAnalyze = [];
      for (let i = 0; i < photosToAnalyze; i++) {
        if (!existingIndices.has(i)) {
          indicesToAnalyze.push(i);
        }
      }

      const results: any[] = [];
      let progressCount = existingAnalyses.filter(a => a.analysisType === "full").length;
      
      const visionPrompt = `Analyze this vacation rental listing photo and provide a detailed assessment.

Return a JSON response with this structure:
{
  "technicalDetails": {
    "resolution": "High Resolution|Good Resolution|Low Resolution|Very Low Resolution",
    "lighting": "Excellent Natural Light|Good Lighting|Adequate Lighting|Poor Lighting|Needs Improvement",
    "perspective": "Professional Wide Angle|Good Composition|Standard Shot|Awkward Angle|Needs Improvement",
    "shadows": "Well Balanced|Minor Shadows|Some Dark Areas|Heavy Shadows|Needs Improvement"
  },
  "objectsDetected": ["list", "of", "objects", "and", "furniture", "visible"],
  "roomLabel": "Room or area name like 'Master Bedroom', 'Kitchen', 'Living Room', 'Exterior', 'Pool Area', 'Bathroom'",
  "recommendation": "A specific, actionable recommendation to improve this photo or highlight what makes it effective. Be constructive and specific.",
  "overallQuality": "High Quality|Good Quality|Average|Needs Improvement"
}

Be accurate about what you see. Focus on vacation rental appeal and what guests want to see.`;

      const analyzePhoto = async (photoIndex: number): Promise<any | null> => {
        const photoUrl = images[photoIndex];
        
        try {
          const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
              {
                role: "user",
                content: [
                  { type: "text", text: visionPrompt },
                  { type: "image_url", image_url: { url: photoUrl, detail: "low" } }
                ]
              }
            ],
            response_format: { type: "json_object" },
            max_tokens: 800,
          });

          const responseText = completion.choices[0]?.message?.content || "{}";
          const aiResult = JSON.parse(responseText);

          const inputTokens = completion.usage?.prompt_tokens || 0;
          const outputTokens = completion.usage?.completion_tokens || 0;
          await storage.createAiUsageLog({
            userId,
            label: "Photo Analysis (Phase 2)",
            model: "gpt-4o",
            inputTokens,
            outputTokens,
            estimatedCost: (inputTokens * 0.005 + outputTokens * 0.015) / 1000,
            listingId: listing.id,
            listingName: listing.name,
          });

          const resolutionValue = aiResult.technicalDetails?.resolution?.toLowerCase() || "";
          const isLowResolution = resolutionValue && !resolutionValue.includes("high");

          const photoAnalysis = await storage.createPhotoAnalysis({
            listingId: listing.id,
            photoIndex,
            photoUrl,
            technicalDetails: aiResult.technicalDetails || null,
            objectsDetected: aiResult.objectsDetected || null,
            roomLabel: aiResult.roomLabel || null,
            recommendation: aiResult.recommendation || null,
            isLowResolution,
            analysisType: "full",
          });

          return photoAnalysis;
        } catch (aiError) {
          logger.error('PhotoAnalysis', `GPT-4 Vision error for photo ${photoIndex}:`, aiError);
          return null;
        }
      };

      const PARALLEL_BATCH_SIZE = 4;
      for (let i = 0; i < indicesToAnalyze.length; i += PARALLEL_BATCH_SIZE) {
        const batch = indicesToAnalyze.slice(i, i + PARALLEL_BATCH_SIZE);
        
        const batchResults = await Promise.all(batch.map(photoIndex => analyzePhoto(photoIndex)));
        
        for (const result of batchResults) {
          progressCount++;
          if (result) {
            results.push(result);
          }
        }
        
        await storage.updateAnalysis(latestAnalysis.id, {
          photoAnalysisProgress: progressCount,
        });
      }

      const allPhotoAnalyses = await storage.getPhotoAnalysesByListing(listing.id);
      const idp = latestAnalysis?.idealGuestProfile as IdealGuestProfile | null;

      if (allPhotoAnalyses.length >= 3) {
        const { modelId, modelInfo } = await getConfiguredAIModel();
        
        const photoContext = allPhotoAnalyses
          .filter(a => a.analysisType === "full")
          .map((a, i) => ({
            index: a.photoIndex,
            room: a.roomLabel || "Unknown",
            quality: (a.technicalDetails as any)?.resolution || "Unknown",
            objects: ((a.objectsDetected as string[]) || []).join(", "),
          }));

        const selectionPrompt = `You are a critical listing optimizer evaluating photos from the ideal guest's perspective. Be concise and actionable - no generic advice.

IDEAL GUEST PROFILE:
${idp ? JSON.stringify(idp, null, 2) : "Not yet defined - use general vacation rental best practices"}

ANALYZED PHOTOS:
${photoContext.map(p => `Photo ${p.index}: ${p.room} - Quality: ${p.quality} - Objects: ${p.objects}`).join("\n")}

IMPORTANT: The "Top 5" refers to the FIRST 5 photos in the listing (indices 0-4). These are what guests see first and must be evaluated as a COMPOSITION:
- The Top 5 should show a balanced mix of interior and exterior shots
- They should highlight the property's best rooms (kitchen, living space, bedrooms) and curb appeal
- No two photos should show the same room or angle
- They should match what the Ideal Guest Profile cares about most
- The hero photo (index 0) is part of the Top 5

Your task:
1. Select the best Hero photo (index 0 position) and evaluate the current Top 5 (indices 0-4) as a composition
2. Be CONCISE - each reason should be 2-3 sentences MAX
3. Identify 3 specific photo strengths and 3 specific areas needing action
4. Rate your confidence (0-100) that the current hero is truly the BEST possible hero photo from this collection
5. If confidence is below 90, suggest an alternative hero photo and explain why
6. For Top 5 swap suggestions: ONLY suggest replacing photos that are currently in the Top 5 (indices 0-4) with better photos from OUTSIDE the Top 5 (index 5+). The goal is to improve the Top 5 composition.

Return JSON:
{
  "heroPhotoIndex": <0-based index of the recommended hero photo>,
  "heroReason": "<2-3 sentences: why this photo works (or doesn't) as the hero for this guest profile>",
  "heroStrengths": ["<specific hero strength 1>", "<specific hero strength 2>"],
  "heroWeaknesses": ["<specific hero weakness or concern 1>", "<specific hero weakness or concern 2>"],
  "heroConfidenceScore": <0-100 confidence that this is the best hero photo>,
  "alternativeHero": null or {"photoIndex": <index>, "reason": "<why this would be a better hero>"},
  "top5PhotoIndices": [<array of 5 photo indices representing the ideal Top 5 in order - index 0 is the hero>],
  "top5Reason": "<2-3 sentences: overall assessment of how well these 5 photos work as a COMPOSITION for the ideal guest>",
  "top5Strengths": ["<specific top 5 composition strength 1>", "<specific top 5 composition strength 2>"],
  "top5Weaknesses": ["<specific top 5 composition weakness 1>", "<specific top 5 composition weakness 2>"],
  "top5Alternatives": [{"currentIndex": <index 0-4 photo to replace>, "suggestedIndex": <index 5+ better photo>, "reason": "<why this swap improves the Top 5 composition>"}],
  "photoPositives": ["<specific strength 1>", "<specific strength 2>", "<specific strength 3>"],
  "photoNeedsAction": ["<specific issue or missing photo 1>", "<specific issue or missing photo 2>", "<specific issue or missing photo 3>"]
}`;

        try {
          const selectionCompletion = await openai.chat.completions.create({
            model: modelId,
            messages: [{ role: "user", content: selectionPrompt }],
            response_format: { type: "json_object" },
            max_tokens: 2000,
          });

          const selectionResult = JSON.parse(selectionCompletion.choices[0]?.message?.content || "{}");

          await storage.createAiUsageLog({
            userId,
            label: "Photo Selection (Hero/Top5)",
            model: modelId,
            inputTokens: selectionCompletion.usage?.prompt_tokens || 0,
            outputTokens: selectionCompletion.usage?.completion_tokens || 0,
            estimatedCost: calculateAICost(
              selectionCompletion.usage?.prompt_tokens || 0,
              selectionCompletion.usage?.completion_tokens || 0,
              modelInfo
            ),
            listingId: listing.id,
            listingName: listing.name,
          });

          for (const analysis of allPhotoAnalyses) {
            const isHero = analysis.photoIndex === selectionResult.heroPhotoIndex;
            const top5Index = (selectionResult.top5PhotoIndices || []).indexOf(analysis.photoIndex);
            
            if (isHero || top5Index !== -1) {
              await storage.updatePhotoAnalysis(analysis.id, {
                isHeroRecommendation: isHero,
                isTop5Recommendation: top5Index !== -1,
              });
            }
          }

          const qualityScores = allPhotoAnalyses.map(a => {
            const quality = (a.technicalDetails as any)?.resolution?.toLowerCase() || "";
            if (quality.includes("high")) return 10;
            if (quality.includes("good")) return 8;
            if (quality.includes("low") || quality.includes("very low")) return 4;
            return 6;
          });
          
          const avgQuality = qualityScores.reduce((a, b) => a + b, 0) / qualityScores.length;
          let photoGrade = "C";
          if (avgQuality >= 9) photoGrade = "A";
          else if (avgQuality >= 7.5) photoGrade = "B";
          else if (avgQuality >= 5.5) photoGrade = "C";
          else if (avgQuality >= 4) photoGrade = "D";
          else photoGrade = "F";

          const positivePoints: string[] = [];
          const improvementPoints: string[] = [];
          
          for (const a of allPhotoAnalyses) {
            const tech = a.technicalDetails as any;
            if (tech?.resolution?.toLowerCase().includes("high")) {
              positivePoints.push(`${a.roomLabel || 'Photo'} has excellent resolution`);
            }
            if (tech?.lighting?.toLowerCase().includes("excellent")) {
              positivePoints.push(`${a.roomLabel || 'Photo'} has excellent natural lighting`);
            }
            if (a.recommendation && !a.recommendation.toLowerCase().includes("good") && !a.recommendation.toLowerCase().includes("excellent")) {
              improvementPoints.push(a.recommendation);
            }
          }

          const photosAnalysis: CategoryAnalysis = {
            grade: photoGrade,
            score: avgQuality,
            feedback: selectionResult.overallPhotoStrategy || `Your listing has ${allPhotoAnalyses.length} photos analyzed. ${positivePoints.length > 0 ? positivePoints.slice(0, 2).join('. ') + '.' : ''}`,
            suggestions: improvementPoints.slice(0, 3),
            heroReason: selectionResult.heroReason || null,
            top5Reason: selectionResult.top5Reason || null,
            photoPositives: selectionResult.photoPositives || [],
            photoNeedsAction: selectionResult.photoNeedsAction || [],
            heroStrengths: selectionResult.heroStrengths || [],
            heroWeaknesses: selectionResult.heroWeaknesses || [],
            heroConfidenceScore: selectionResult.heroConfidenceScore ?? null,
            alternativeHero: selectionResult.alternativeHero || null,
            top5Strengths: selectionResult.top5Strengths || [],
            top5Weaknesses: selectionResult.top5Weaknesses || [],
            top5Alternatives: selectionResult.top5Alternatives || [],
          };

          await storage.updateAnalysis(latestAnalysis.id, {
            photoAnalysisStatus: "complete",
            photoAnalysisProgress: photosToAnalyze,
            photosGrade: photoGrade,
            photosAnalysis,
          });
          await recalculateOverallGrade(latestAnalysis.id, storage);

        } catch (selectionError) {
          logger.error('PhotoAnalysis', "Error running photo selection:", selectionError);
          await storage.updateAnalysis(latestAnalysis.id, {
            photoAnalysisStatus: "complete",
            photoAnalysisProgress: photosToAnalyze,
          });
        }
      } else {
        await storage.updateAnalysis(latestAnalysis.id, {
          photoAnalysisStatus: "complete",
          photoAnalysisProgress: photosToAnalyze,
        });
      }

      res.json({ 
        success: true,
        analyzed: results.length,
        total: photosToAnalyze,
        message: `Photo analysis complete. Analyzed ${results.length} new photos.`,
      });
    } catch (error) {
      logger.error('PhotoAnalysis', "Error in Phase 2 photo analysis:", error);
      res.status(500).json({ message: "Failed to analyze photos" });
    }
  });

  // Generate AI title suggestions for a listing
  app.post("/api/listings/:id/generate-titles", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const listing = await storage.getListing(getParamId(req.params.id));
      
      if (!listing || listing.userId !== userId) {
        return res.status(404).json({ message: "Listing not found" });
      }

      const pinnedTitles = (req.body.pinnedTitles || []) as Array<{ title: string; reasoning: string; charCount: number }>;
      const titlesToGenerate = Math.max(1, 10 - pinnedTitles.length);

      const analyses = await storage.getAnalysesByListing(listing.id);
      const latestAnalysis = analyses[0];
      
      const titlePrompt = await storage.getPromptByName("title_generator");
      
      const currentTitle = listing.headline || listing.name || "";
      const idealGuestProfile = latestAnalysis?.idealGuestProfile || "Not yet analyzed";
      const amenities = (listing.amenities as string[]) || [];
      const description = listing.description || "";

      const systemPrompt = titlePrompt?.systemPrompt || 
        "You are an expert short-term rental copywriter who creates compelling, SEO-optimized listing titles.";
      
      const pinnedContext = pinnedTitles.length > 0 
        ? `\n\nPINNED TITLES (User's favorites - use as inspiration for variations):
${pinnedTitles.map((t, i) => `${i + 1}. "${t.title}"`).join('\n')}

IMPORTANT: Create ${titlesToGenerate} NEW unique titles that:
- Draw inspiration from the pinned titles' style, tone, and key elements
- Offer creative variations and alternatives
- Do NOT duplicate any pinned titles exactly
- Explore different angles while maintaining what made the pinned titles appealing`
        : "";
      
      const promptTemplate = titlePrompt?.promptTemplate || `Generate {{count}} compelling listing title suggestions for this property.

Current Title: {{currentTitle}}
Property Name: {{propertyName}}
Location: {{location}}
Amenities: {{amenities}}
Description: {{description}}
Ideal Guest Profile: {{idealGuestProfile}}{{pinnedContext}}

Requirements:
- Each title must be 50 characters or fewer
- Titles should appeal to the Ideal Guest Profile
- Include key selling points from amenities
- Be specific and descriptive, avoid generic phrases
- Do NOT include bed count, bedroom count, or bed configuration in titles
- Focus on experience, location, and unique features rather than sleeping arrangements

Return a JSON object with:
{
  "titles": [
    {
      "title": "Generated title here",
      "reasoning": "Why this title appeals to the ideal guest",
      "charCount": 45
    }
  ]
}`;

      const filledPrompt = promptTemplate
        .replace("{{count}}", String(titlesToGenerate))
        .replace("{{currentTitle}}", currentTitle)
        .replace("{{propertyName}}", listing.name || "")
        .replace("{{location}}", listing.address || "")
        .replace("{{amenities}}", amenities.slice(0, 20).join(", "))
        .replace("{{description}}", description.slice(0, 500))
        .replace("{{idealGuestProfile}}", typeof idealGuestProfile === 'string' ? idealGuestProfile : JSON.stringify(idealGuestProfile))
        .replace("{{pinnedContext}}", pinnedContext);

      const { modelId, modelInfo } = await getConfiguredAIModel(titlePrompt?.modelId);
      
      const completion = await openai.chat.completions.create({
        model: modelId,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: filledPrompt }
        ],
        response_format: { type: "json_object" },
        max_tokens: 1500,
      });

      const responseText = completion.choices[0]?.message?.content || "{}";
      const result = JSON.parse(responseText);

      const inputTokens = completion.usage?.prompt_tokens || 0;
      const outputTokens = completion.usage?.completion_tokens || 0;
      const estimatedCost = calculateAICost(inputTokens, outputTokens, modelInfo);
      
      await storage.createAiUsageLog({
        userId,
        listingId: listing.id,
        listingName: listing.name,
        label: "title_generator",
        model: modelId,
        inputTokens,
        outputTokens,
        estimatedCost,
      });

      res.json({ 
        titles: result.titles || [],
        currentTitle,
      });
    } catch (error) {
      logger.error('AI', "Error generating titles:", error);
      res.status(500).json({ message: "Failed to generate title suggestions" });
    }
  });

  // Generate AI description content for a listing
  app.post("/api/listings/:id/generate-description", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const listing = await storage.getListing(getParamId(req.params.id));
      
      if (!listing || listing.userId !== userId) {
        return res.status(404).json({ message: "Listing not found" });
      }

      const analyses = await storage.getAnalysesByListing(listing.id);
      const latestAnalysis = analyses[0];
      
      const descPrompt = await storage.getPromptByName("description_generator");
      
      const currentDescription = listing.description || "";
      const idealGuestProfile = latestAnalysis?.idealGuestProfile || "Not yet analyzed";
      const amenities = (listing.amenities as string[]) || [];
      const reservationsWithReviews = await storage.getReservationsByListing(listing.id);
      const positiveReviewSnippets = reservationsWithReviews
        .filter(r => r.guestRating && r.guestRating >= 4)
        .slice(0, 5)
        .map(r => r.publicReview?.slice(0, 200))
        .filter(Boolean)
        .join(" | ");

      const systemPrompt = descPrompt?.systemPrompt || 
        "You are an expert short-term rental copywriter who creates compelling, guest-focused listing descriptions.";
      
      const promptTemplate = descPrompt?.promptTemplate || `Generate optimized listing description content for this property.

Property Name: {{propertyName}}
Location: {{location}}
Current Description: {{currentDescription}}
Amenities: {{amenities}}
Ideal Guest Profile: {{idealGuestProfile}}
Guest Review Highlights: {{reviewHighlights}}

Generate two sections:
1. "About this space" - A compelling overview (max 500 characters)
2. "The space" - Detailed room-by-room description (max 1500 characters)

Requirements:
- Write for the Ideal Guest Profile
- Highlight amenities guests care about most
- Use sensory language and paint a picture
- Be specific about what makes this property unique
- Include a call to action
- For "The Space" section: Use bullet points with emoji icons sparingly to break up text and make it easy to scan (e.g., "🛏️ Master Suite:", "🍳 Kitchen:", "🌳 Outdoor Space:")
- Keep emoji usage tasteful and limited - not every bullet needs an emoji

Return a JSON object with:
{
  "aboutThisSpace": {
    "content": "The about section text here",
    "charCount": 450
  },
  "theSpace": {
    "content": "The space section text here",
    "charCount": 1200
  },
  "keySellingPoints": ["point1", "point2", "point3"]
}`;

      const filledPrompt = promptTemplate
        .replace("{{propertyName}}", listing.name || "")
        .replace("{{location}}", listing.address || "")
        .replace("{{currentDescription}}", currentDescription.slice(0, 1000))
        .replace("{{amenities}}", amenities.join(", "))
        .replace("{{idealGuestProfile}}", typeof idealGuestProfile === 'string' ? idealGuestProfile : JSON.stringify(idealGuestProfile))
        .replace("{{reviewHighlights}}", positiveReviewSnippets || "No reviews yet");

      const { modelId, modelInfo } = await getConfiguredAIModel(descPrompt?.modelId);
      
      const completion = await openai.chat.completions.create({
        model: modelId,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: filledPrompt }
        ],
        response_format: { type: "json_object" },
        max_tokens: 2000,
      });

      const responseText = completion.choices[0]?.message?.content || "{}";
      const result = JSON.parse(responseText);

      const inputTokens = completion.usage?.prompt_tokens || 0;
      const outputTokens = completion.usage?.completion_tokens || 0;
      const estimatedCost = calculateAICost(inputTokens, outputTokens, modelInfo);
      
      await storage.createAiUsageLog({
        userId,
        listingId: listing.id,
        listingName: listing.name,
        label: "description_generator",
        model: modelId,
        inputTokens,
        outputTokens,
        estimatedCost,
      });

      res.json({ 
        aboutThisSpace: result.aboutThisSpace || null,
        theSpace: result.theSpace || null,
        keySellingPoints: result.keySellingPoints || [],
        currentDescription,
      });
    } catch (error) {
      logger.error('AI', "Error generating description:", error);
      res.status(500).json({ message: "Failed to generate description content" });
    }
  });

  // Submit feedback on AI-generated description
  app.post("/api/listings/:id/description-feedback", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const listing = await storage.getListing(getParamId(req.params.id));
      
      if (!listing || listing.userId !== userId) {
        return res.status(404).json({ message: "Listing not found" });
      }

      const { rating, feedback } = req.body;
      
      if (!rating || !["up", "down"].includes(rating)) {
        return res.status(400).json({ message: "Invalid rating. Must be 'up' or 'down'" });
      }

      const label = feedback 
        ? `description_feedback_${rating}: ${feedback.slice(0, 200)}` 
        : `description_feedback_${rating}`;
      
      await storage.createAiUsageLog({
        userId,
        listingId: listing.id,
        listingName: listing.name,
        label,
        model: "user_feedback",
        inputTokens: 0,
        outputTokens: 0,
        estimatedCost: 0,
      });

      res.json({ success: true, message: "Feedback recorded" });
    } catch (error) {
      logger.error('AI', "Error saving description feedback:", error);
      res.status(500).json({ message: "Failed to save feedback" });
    }
  });

  app.patch("/api/analyses/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const analysis = await storage.getAnalysis(getParamId(req.params.id));
      
      if (!analysis || analysis.userId !== userId) {
        return res.status(404).json({ message: "Analysis not found" });
      }
      
      const { updateListingAnalysisSchema } = await import("@shared/schema");
      const parseResult = updateListingAnalysisSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ message: "Invalid data", errors: parseResult.error.flatten() });
      }
      
      const updated = await storage.updateAnalysis(getParamId(req.params.id), parseResult.data);
      res.json(updated);
    } catch (error) {
      logger.error('Analysis', "Error updating analysis:", error);
      res.status(500).json({ message: "Failed to update analysis" });
    }
  });

  app.delete("/api/analyses/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const analysis = await storage.getAnalysis(getParamId(req.params.id));
      
      if (!analysis || analysis.userId !== userId) {
        return res.status(404).json({ message: "Analysis not found" });
      }
      
      await storage.deleteAnalysis(getParamId(req.params.id));
      res.status(204).send();
    } catch (error) {
      logger.error('Analysis', "Error deleting analysis:", error);
      res.status(500).json({ message: "Failed to delete analysis" });
    }
  });

  // =====================
  // Photo Analysis (AI Vision)
  // =====================

  app.get("/api/listings/:id/photo-analyses", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const listing = await storage.getListing(getParamId(req.params.id));
      
      if (!listing || listing.userId !== userId) {
        return res.status(404).json({ message: "Listing not found" });
      }
      
      const analyses = await storage.getPhotoAnalysesByListing(listing.id);
      res.json(analyses);
    } catch (error) {
      logger.error('PhotoAnalysis', "Error fetching photo analyses:", error);
      res.status(500).json({ message: "Failed to fetch photo analyses" });
    }
  });

  app.post("/api/listings/:id/photos/:photoIndex/analyze", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const listing = await storage.getListing(getParamId(req.params.id));
      
      if (!listing || listing.userId !== userId) {
        return res.status(404).json({ message: "Listing not found" });
      }

      const photoIndex = parseInt(req.params.photoIndex, 10);
      const images = (listing.images as string[]) || [];
      
      if (photoIndex < 0 || photoIndex >= images.length) {
        return res.status(400).json({ message: "Invalid photo index" });
      }

      const photoUrl = images[photoIndex];
      
      const existingAnalysis = await storage.getPhotoAnalysisByListingAndIndex(listing.id, photoIndex);
      if (existingAnalysis) {
        return res.json(existingAnalysis);
      }

      const isFullAnalysis = true;
      
      if (isFullAnalysis) {
        const { modelId, modelInfo } = await getConfiguredAIModel();
        
        const visionPrompt = `Analyze this vacation rental listing photo and provide a detailed assessment.

Return a JSON response with this structure:
{
  "technicalDetails": {
    "resolution": "High Resolution|Good Resolution|Low Resolution|Very Low Resolution",
    "lighting": "Excellent Natural Light|Good Lighting|Adequate Lighting|Poor Lighting|Needs Improvement",
    "perspective": "Professional Wide Angle|Good Composition|Standard Shot|Awkward Angle|Needs Improvement",
    "shadows": "Well Balanced|Minor Shadows|Some Dark Areas|Heavy Shadows|Needs Improvement"
  },
  "objectsDetected": ["list", "of", "objects", "and", "furniture", "visible"],
  "roomLabel": "Room or area name like 'Master Bedroom', 'Kitchen', 'Living Room', 'Exterior', 'Pool Area', 'Bathroom'",
  "recommendation": "A specific, actionable recommendation to improve this photo or highlight what makes it effective. Be constructive and specific.",
  "overallQuality": "High Quality|Good Quality|Average|Needs Improvement"
}

Be accurate about what you see. Focus on vacation rental appeal and what guests want to see.`;

        try {
          const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
              {
                role: "user",
                content: [
                  { type: "text", text: visionPrompt },
                  { type: "image_url", image_url: { url: photoUrl, detail: "low" } }
                ]
              }
            ],
            response_format: { type: "json_object" },
            max_tokens: 800,
          });

          const responseText = completion.choices[0]?.message?.content || "{}";
          const aiResult = JSON.parse(responseText);

          const inputTokens = completion.usage?.prompt_tokens || 0;
          const outputTokens = completion.usage?.completion_tokens || 0;
          await storage.createAiUsageLog({
            userId,
            label: "Photo Analysis",
            model: "gpt-4o",
            inputTokens,
            outputTokens,
            estimatedCost: (inputTokens * 0.005 + outputTokens * 0.015) / 1000,
            listingId: listing.id,
            listingName: listing.name,
          });

          const resolutionValue = aiResult.technicalDetails?.resolution?.toLowerCase() || "";
          const isLowResolution = resolutionValue && !resolutionValue.includes("high");

          const analysis = await storage.createPhotoAnalysis({
            listingId: listing.id,
            photoIndex,
            photoUrl,
            technicalDetails: aiResult.technicalDetails || null,
            objectsDetected: aiResult.objectsDetected || null,
            roomLabel: aiResult.roomLabel || null,
            recommendation: aiResult.recommendation || null,
            isLowResolution,
            analysisType: "full",
          });

          return res.json(analysis);
        } catch (aiError) {
          logger.error('PhotoAnalysis', "GPT-4 Vision error:", aiError);
          return res.status(500).json({ message: "Failed to analyze photo with AI Vision" });
        }
      } else {
        try {
          const response = await fetch(photoUrl, { method: 'HEAD' });
          const contentLength = response.headers.get('content-length');
          
          const fileSizeBytes = contentLength ? parseInt(contentLength, 10) : 0;
          const isLowResolution = fileSizeBytes < 200000;
          
          const analysis = await storage.createPhotoAnalysis({
            listingId: listing.id,
            photoIndex,
            photoUrl,
            isLowResolution,
            analysisType: "resolution_only",
          });

          return res.json(analysis);
        } catch (fetchError) {
          logger.error('PhotoAnalysis', "Error fetching image dimensions:", fetchError);
          
          const analysis = await storage.createPhotoAnalysis({
            listingId: listing.id,
            photoIndex,
            photoUrl,
            analysisType: "resolution_only",
          });

          return res.json(analysis);
        }
      }
    } catch (error) {
      logger.error('PhotoAnalysis', "Error analyzing photo:", error);
      res.status(500).json({ message: "Failed to analyze photo" });
    }
  });

  app.post("/api/listings/:id/photos/analyze-batch", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const listing = await storage.getListing(getParamId(req.params.id));
      
      if (!listing || listing.userId !== userId) {
        return res.status(404).json({ message: "Listing not found" });
      }

      const images = (listing.images as string[]) || [];
      const photosToAnalyze = images.length;
      
      if (photosToAnalyze === 0) {
        return res.json({ analyzed: 0, message: "No photos to analyze" });
      }

      const existingAnalyses = await storage.getPhotoAnalysesByListing(listing.id);
      const existingIndices = new Set(existingAnalyses.map(a => a.photoIndex));
      
      const indicesToAnalyze = [];
      for (let i = 0; i < photosToAnalyze; i++) {
        if (!existingIndices.has(i)) {
          indicesToAnalyze.push(i);
        }
      }

      if (indicesToAnalyze.length === 0) {
        return res.json({ 
          analyzed: 0, 
          message: "All photos already analyzed",
          existingCount: existingAnalyses.length
        });
      }

      const { modelId, modelInfo } = await getConfiguredAIModel();
      const results: any[] = [];
      
      for (const photoIndex of indicesToAnalyze) {
        const photoUrl = images[photoIndex];
        
        const visionPrompt = `Analyze this vacation rental listing photo and provide a detailed assessment.

Return a JSON response with this structure:
{
  "technicalDetails": {
    "resolution": "High Resolution|Good Resolution|Low Resolution|Very Low Resolution",
    "lighting": "Excellent Natural Light|Good Lighting|Adequate Lighting|Poor Lighting|Needs Improvement",
    "perspective": "Professional Wide Angle|Good Composition|Standard Shot|Awkward Angle|Needs Improvement",
    "shadows": "Well Balanced|Minor Shadows|Some Dark Areas|Heavy Shadows|Needs Improvement"
  },
  "objectsDetected": ["list", "of", "objects", "and", "furniture", "visible"],
  "roomLabel": "Room or area name like 'Master Bedroom', 'Kitchen', 'Living Room', 'Exterior', 'Pool Area', 'Bathroom'",
  "recommendation": "A specific, actionable recommendation to improve this photo or highlight what makes it effective. Be constructive and specific.",
  "overallQuality": "High Quality|Good Quality|Average|Needs Improvement"
}

Be accurate about what you see. Focus on vacation rental appeal and what guests want to see.`;

        try {
          const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
              {
                role: "user",
                content: [
                  { type: "text", text: visionPrompt },
                  { type: "image_url", image_url: { url: photoUrl, detail: "low" } }
                ]
              }
            ],
            response_format: { type: "json_object" },
            max_tokens: 800,
          });

          const responseText = completion.choices[0]?.message?.content || "{}";
          const aiResult = JSON.parse(responseText);

          const inputTokens = completion.usage?.prompt_tokens || 0;
          const outputTokens = completion.usage?.completion_tokens || 0;
          await storage.createAiUsageLog({
            userId,
            label: "Photo Analysis (Batch)",
            model: "gpt-4o",
            inputTokens,
            outputTokens,
            estimatedCost: (inputTokens * 0.005 + outputTokens * 0.015) / 1000,
            listingId: listing.id,
            listingName: listing.name,
          });

          const resolutionValue = aiResult.technicalDetails?.resolution?.toLowerCase() || "";
          const isLowResolution = resolutionValue && !resolutionValue.includes("high");

          const analysis = await storage.createPhotoAnalysis({
            listingId: listing.id,
            photoIndex,
            photoUrl,
            technicalDetails: aiResult.technicalDetails || null,
            objectsDetected: aiResult.objectsDetected || null,
            roomLabel: aiResult.roomLabel || null,
            recommendation: aiResult.recommendation || null,
            isLowResolution,
            analysisType: "full",
          });

          results.push(analysis);
        } catch (aiError) {
          logger.error('PhotoAnalysis', `GPT-4 Vision error for photo ${photoIndex}:`, aiError);
        }
      }

      res.json({ 
        analyzed: results.length, 
        total: indicesToAnalyze.length,
        message: `Analyzed ${results.length} of ${indicesToAnalyze.length} photos`,
        results
      });
    } catch (error) {
      logger.error('PhotoAnalysis', "Error in batch photo analysis:", error);
      res.status(500).json({ message: "Failed to analyze photos" });
    }
  });

  app.post("/api/listings/:id/photos/analyze-selection", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const listing = await storage.getListing(getParamId(req.params.id));
      
      if (!listing || listing.userId !== userId) {
        return res.status(404).json({ message: "Listing not found" });
      }

      const photoAnalyses = await storage.getPhotoAnalysesByListing(listing.id);
      
      if (photoAnalyses.length < 3) {
        return res.status(400).json({ 
          message: "Need at least 3 photos analyzed before selection recommendation" 
        });
      }

      const listingAnalysis = await storage.getLatestAnalysisByListing(listing.id);
      const idp = listingAnalysis?.idealGuestProfile as IdealGuestProfile | null;

      const { modelId, modelInfo } = await getConfiguredAIModel();

      const photoSummaries = photoAnalyses
        .filter(a => a.analysisType === "full")
        .map(a => ({
          index: a.photoIndex,
          roomLabel: a.roomLabel,
          quality: (a.technicalDetails as any)?.overallQuality || "Unknown",
          lighting: (a.technicalDetails as any)?.lighting,
          objects: a.objectsDetected,
          recommendation: a.recommendation
        }));

      const selectionPrompt = `You are a critical listing optimizer scrutinizing this property's photo selection. Put yourself in the shoes of the ideal guest - what would make YOU click on this listing and book it?

Your job is NOT to explain why hero photos or top 5 photos matter in general - the host already knows that. Instead, analyze THESE SPECIFIC photos and provide honest, critical feedback.

IMPORTANT: The "Top 5" refers to the FIRST 5 photos in the listing (indices 0-4). These are what guests see first and must be evaluated as a COMPOSITION:
- The Top 5 should show a balanced mix of interior and exterior shots
- They should highlight the property's best rooms (kitchen, living space, bedrooms) and curb appeal
- No two photos should show the same room or angle
- They should match what the Ideal Guest Profile cares about most
- The hero photo (index 0) is part of the Top 5

Property: ${listing.name}
${listing.propertyType ? `Type: ${listing.propertyType}` : ""}
${listing.bedrooms ? `Bedrooms: ${listing.bedrooms}` : ""}

${idp ? `
IDEAL GUEST PROFILE (use this to judge every photo):
${idp.summary || ""}
Guest types: ${idp.guestTypes?.join(", ") || "Not specified"}
Travel purposes: ${idp.travelPurposes?.join(", ") || "Not specified"}
Key values: ${idp.keyValues?.join(", ") || "Not specified"}
` : ""}

ANALYZED PHOTOS (each with AI vision analysis):
${JSON.stringify(photoSummaries, null, 2)}

Your critical analysis should:
1. Select the Hero photo (index 0 position) - honestly evaluate strengths AND weaknesses. Rate your confidence (0-100) that this is truly the best hero from this collection.
2. If confidence is below 90, suggest a specific alternative photo from the collection and explain why it would be better.
3. Evaluate the current Top 5 (indices 0-4) as a composition - for each, provide strengths and weaknesses.
4. For Top 5 swap suggestions: ONLY suggest replacing photos currently in the Top 5 (indices 0-4) with better photos from OUTSIDE the Top 5 (index 5+). The goal is improving the Top 5 composition.
5. Be direct about quality issues, missing shots, or photos that might hurt conversions.
6. Don't just praise - provide actionable critique.

Return a JSON response:
{
  "heroPhoto": {
    "photoIndex": 0,
    "reason": "<critical analysis: WHY this photo will or won't resonate with ${idp?.guestTypes?.[0] || "the target guest"}>",
    "strengths": ["<specific hero strength 1>", "<specific hero strength 2>"],
    "weaknesses": ["<specific hero weakness 1>", "<specific hero weakness 2>"],
    "confidenceScore": <0-100 confidence this is the best hero>,
    "alternativePhotoIndex": <index of better hero or null>,
    "alternativeReason": "<why the alternative would be better, or null>"
  },
  "top5Photos": [
    {
      "photoIndex": 0, "order": 1,
      "reason": "<specific appeal to ideal guest>",
      "strengths": ["<strength 1>"],
      "weaknesses": ["<weakness 1>"],
      "alternativePhotoIndex": <index 5+ of a better replacement photo or null>,
      "alternativeReason": "<why swapping this Top 5 photo for the suggested one improves the composition, or null>"
    }
  ],
  "duplicateWarnings": ["Specific duplicate room types found and which photo to REMOVE with reasoning"],
  "overallAssessment": "<honest critique: What's working? What's missing? What would significantly improve booking conversions?>"
}`;

      const completion = await openai.chat.completions.create({
        model: modelId,
        messages: [{ role: "user", content: selectionPrompt }],
        response_format: { type: "json_object" },
        max_tokens: 3000,
      });

      const responseText = completion.choices[0]?.message?.content || "{}";
      const selectionResult = JSON.parse(responseText);

      const inputTokens = completion.usage?.prompt_tokens || 0;
      const outputTokens = completion.usage?.completion_tokens || 0;
      await storage.createAiUsageLog({
        userId,
        label: "Photo Selection Analysis",
        model: modelId,
        inputTokens,
        outputTokens,
        estimatedCost: (inputTokens * 0.003 + outputTokens * 0.012) / 1000,
        listingId: listing.id,
        listingName: listing.name,
      });

      if (listingAnalysis) {
        await storage.updateAnalysis(listingAnalysis.id, {
          photosAnalysis: {
            ...(listingAnalysis.photosAnalysis as any || {}),
            heroRecommendation: selectionResult.heroPhoto,
            top5Recommendations: selectionResult.top5Photos,
            duplicateWarnings: selectionResult.duplicateWarnings,
            overallAssessment: selectionResult.overallAssessment,
            selectionAnalyzedAt: new Date().toISOString()
          }
        });
      }

      res.json(selectionResult);
    } catch (error) {
      logger.error('PhotoAnalysis', "Error analyzing photo selection:", error);
      res.status(500).json({ message: "Failed to analyze photo selection" });
    }
  });

  app.post("/api/listings/:id/photos/analyze-grade", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const listing = await storage.getListing(getParamId(req.params.id));
      
      if (!listing || listing.userId !== userId) {
        return res.status(404).json({ message: "Listing not found" });
      }

      const photoAnalyses = await storage.getPhotoAnalysesByListing(listing.id);
      
      if (photoAnalyses.length === 0) {
        return res.status(400).json({ message: "No photo analyses available" });
      }

      const { modelId, modelInfo } = await getConfiguredAIModel();

      const photoSummaries = photoAnalyses
        .filter(a => a.analysisType === "full")
        .map(a => ({
          index: a.photoIndex,
          roomLabel: a.roomLabel,
          quality: (a.technicalDetails as any)?.overallQuality || "Unknown",
          lighting: (a.technicalDetails as any)?.lighting,
          composition: (a.technicalDetails as any)?.composition,
          colorBalance: (a.technicalDetails as any)?.colorBalance,
          recommendation: a.recommendation
        }));

      const gradePrompt = `You are an expert vacation rental listing photo analyst. Grade the photo collection for this property.

Property: ${listing.name}
${listing.propertyType ? `Type: ${listing.propertyType}` : ""}
Total Photos in Listing: ${(listing.images as string[] || []).length}
Photos Analyzed: ${photoSummaries.length}

Photo Analyses:
${JSON.stringify(photoSummaries, null, 2)}

Based on the photo analyses, provide:
1. An overall grade (A-F) for the photo collection
2. A score from 1-10
3. Detailed feedback on the photo quality
4. Specific suggestions for improvement

Grading Criteria:
- A (8-10): Professional quality, excellent lighting, great variety, compelling hero photo
- B (6-7.9): Good quality, minor issues with lighting or composition
- C (5-5.9): Average quality, noticeable issues but acceptable
- D (3-4.9): Below average, significant quality issues
- F (0-2.9): Poor quality, major issues that hurt the listing

Return a JSON response:
{
  "grade": "A|B|C|D|F",
  "score": 7.5,
  "feedback": "Overall assessment of the photo collection",
  "suggestions": ["Suggestion 1", "Suggestion 2", "Suggestion 3"]
}`;

      const completion = await openai.chat.completions.create({
        model: modelId,
        messages: [{ role: "user", content: gradePrompt }],
        response_format: { type: "json_object" },
        max_tokens: 800,
      });

      const responseText = completion.choices[0]?.message?.content || "{}";
      const gradeResult = JSON.parse(responseText);

      const inputTokens = completion.usage?.prompt_tokens || 0;
      const outputTokens = completion.usage?.completion_tokens || 0;
      await storage.createAiUsageLog({
        userId,
        label: "Photo Grade Analysis",
        model: modelId,
        inputTokens,
        outputTokens,
        estimatedCost: calculateAICost(inputTokens, outputTokens, modelInfo),
        listingId: listing.id,
        listingName: listing.name,
      });

      let listingAnalysis = await storage.getLatestAnalysisByListing(listing.id);
      
      if (listingAnalysis) {
        await storage.updateAnalysis(listingAnalysis.id, {
          photosGrade: gradeResult.grade,
          photosAnalysis: {
            ...(listingAnalysis.photosAnalysis as any || {}),
            grade: gradeResult.grade,
            score: gradeResult.score,
            feedback: gradeResult.feedback,
            suggestions: gradeResult.suggestions,
            gradeAnalyzedAt: new Date().toISOString()
          }
        });
        await recalculateOverallGrade(listingAnalysis.id, storage);
      }

      res.json({ ...gradeResult, stored: !!listingAnalysis });
    } catch (error) {
      logger.error('PhotoAnalysis', "Error analyzing photos grade:", error);
      res.status(500).json({ message: "Failed to analyze photos grade" });
    }
  });

  app.post("/api/listings/:id/photos/:photoIndex/suggest-edit", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const listing = await storage.getListing(getParamId(req.params.id));
      
      if (!listing || listing.userId !== userId) {
        return res.status(404).json({ message: "Listing not found" });
      }

      const photoIndex = parseInt(req.params.photoIndex, 10);
      const images = (listing.images as string[]) || [];
      
      if (photoIndex < 0 || photoIndex >= images.length) {
        return res.status(400).json({ message: "Invalid photo index" });
      }

      const photoAnalysis = await storage.getPhotoAnalysisByListingAndIndex(listing.id, photoIndex);
      
      const { modelId } = await getConfiguredAIModel();

      const suggestionPrompt = `You are helping a vacation rental host improve their listing photos using AI image editing.

${photoAnalysis ? `
Photo Analysis:
- Room: ${photoAnalysis.roomLabel || "Unknown"}
- Lighting: ${(photoAnalysis.technicalDetails as any)?.lighting || "Unknown"}
- Shadows: ${(photoAnalysis.technicalDetails as any)?.shadows || "Unknown"}
- Objects detected: ${(photoAnalysis.objectsDetected as string[] || []).join(", ") || "None identified"}
- AI Recommendation: ${photoAnalysis.recommendation || "None"}
` : "No analysis available for this photo yet."}

Based on this analysis, suggest an image editing prompt that would improve this vacation rental photo.

Focus on realistic enhancements that don't change the actual room or perspective:
- Improve lighting balance (fix mixed color temperatures - like 3000K vs 4000K lights)
- Add golden hour/sunset lighting through windows
- Add lawn stripes to exterior grass areas
- Brighten dark corners
- Reduce harsh shadows
- Enhance natural light
- Make colors more vibrant but natural
- Add warm ambient lighting

Return a JSON response:
{
  "suggestedPrompt": "A clear, specific prompt for image editing that describes the improvements to make",
  "improvements": ["List", "of", "specific", "improvements", "this", "prompt", "will", "make"]
}`;

      const completion = await openai.chat.completions.create({
        model: modelId,
        messages: [{ role: "user", content: suggestionPrompt }],
        response_format: { type: "json_object" },
        max_tokens: 500,
      });

      const responseText = completion.choices[0]?.message?.content || "{}";
      const suggestion = JSON.parse(responseText);

      const inputTokens = completion.usage?.prompt_tokens || 0;
      const outputTokens = completion.usage?.completion_tokens || 0;
      await storage.createAiUsageLog({
        userId,
        label: "Photo Edit Suggestion",
        model: modelId,
        inputTokens,
        outputTokens,
        estimatedCost: (inputTokens * 0.003 + outputTokens * 0.012) / 1000,
        listingId: listing.id,
        listingName: listing.name,
      });

      res.json(suggestion);
    } catch (error) {
      logger.error('PhotoAnalysis', "Error suggesting photo edit:", error);
      res.status(500).json({ message: "Failed to suggest photo edit" });
    }
  });

  app.post("/api/listings/:id/photos/:photoIndex/suggest-pet-edit", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const listing = await storage.getListing(getParamId(req.params.id));
      
      if (!listing || listing.userId !== userId) {
        return res.status(404).json({ message: "Listing not found" });
      }

      const photoIndex = parseInt(req.params.photoIndex, 10);
      const images = (listing.images as string[]) || [];
      
      if (photoIndex < 0 || photoIndex >= images.length) {
        return res.status(400).json({ message: "Invalid photo index" });
      }

      const photoAnalysis = await storage.getPhotoAnalysisByListingAndIndex(listing.id, photoIndex);
      
      const { modelId, modelInfo } = await getConfiguredAIModel();

      const petSuggestionPrompt = `You are helping a vacation rental host make their listing photos show that the property is pet-friendly by adding a realistic dog to the image.

${photoAnalysis ? `
Photo Analysis:
- Room/Area: ${photoAnalysis.roomLabel || "Unknown"}
- Objects detected: ${(photoAnalysis.objectsDetected as string[] || []).join(", ") || "None identified"}
` : "Analyze this vacation rental photo to determine the best placement for a dog."}

Your task is to create an image editing prompt that will add a friendly, realistic dog to this photo to show guests the property welcomes pets.

Consider:
1. Where would a dog naturally be in this scene? (on a couch, lying on floor, in yard, on porch, etc.)
2. What dog breed and size fits the space? (medium-sized friendly breeds work best like Labs, Golden Retrievers)
3. What pose looks natural? (resting, sitting, looking relaxed)
4. The dog should look comfortable and at home, not out of place

Guidelines for the prompt:
- Specify a specific dog breed (prefer friendly breeds: Labrador, Golden Retriever, Beagle)
- Describe a natural, relaxed pose
- Place the dog where it makes sense in the scene
- Keep the dog as a subtle addition, not the main focus
- The dog should be well-groomed and clean-looking

Return a JSON response:
{
  "suggestedPrompt": "A detailed prompt describing exactly how to add a friendly dog to this photo, including breed, position, pose, and any specific details",
  "improvements": ["Natural placement suggestion", "Breed recommendation", "Pose description", "Why this makes the photo pet-friendly"]
}`;

      const completion = await openai.chat.completions.create({
        model: modelId,
        messages: [{ role: "user", content: petSuggestionPrompt }],
        response_format: { type: "json_object" },
        max_tokens: 600,
      });

      const responseText = completion.choices[0]?.message?.content || "{}";
      const suggestion = JSON.parse(responseText);

      const inputTokens = completion.usage?.prompt_tokens || 0;
      const outputTokens = completion.usage?.completion_tokens || 0;
      await storage.createAiUsageLog({
        userId,
        label: "Pet Photo Edit Suggestion",
        model: modelId,
        inputTokens,
        outputTokens,
        estimatedCost: calculateAICost(inputTokens, outputTokens, modelInfo),
        listingId: listing.id,
        listingName: listing.name,
      });

      res.json(suggestion);
    } catch (error) {
      logger.error('PhotoAnalysis', "Error suggesting pet photo edit:", error);
      res.status(500).json({ message: "Failed to suggest pet photo edit" });
    }
  });

  app.post("/api/listings/:id/photos/:photoIndex/edit", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const listing = await storage.getListing(getParamId(req.params.id));
      
      if (!listing || listing.userId !== userId) {
        return res.status(404).json({ message: "Listing not found" });
      }

      const photoIndex = parseInt(req.params.photoIndex, 10);
      const images = (listing.images as string[]) || [];
      
      if (photoIndex < 0 || photoIndex >= images.length) {
        return res.status(400).json({ message: "Invalid photo index" });
      }

      const { prompt } = req.body;
      if (!prompt || typeof prompt !== "string") {
        return res.status(400).json({ message: "Edit prompt is required" });
      }

      const photoUrl = images[photoIndex];

      const editPrompt = `Analyze this vacation rental photo and create a detailed prompt for regenerating it with these enhancements: ${prompt}

The new image should:
1. Keep the exact same room, furniture, and layout
2. Maintain the same perspective and composition
3. Apply ONLY the lighting and atmosphere enhancements requested
4. Look photorealistic like a professional real estate photo

Return a JSON response:
{
  "enhancedPrompt": "A detailed prompt describing the enhanced version of this photo that maintains the original room but applies the requested improvements. Be specific about what stays the same and what changes.",
  "editApplied": "Brief description of what edits were conceptually applied"
}`;

      try {
        const completion = await openai.chat.completions.create({
          model: "gpt-4o",
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: editPrompt },
                { type: "image_url", image_url: { url: photoUrl, detail: "low" } }
              ]
            }
          ],
          response_format: { type: "json_object" },
          max_tokens: 600,
        });

        const responseText = completion.choices[0]?.message?.content || "{}";
        const editResult = JSON.parse(responseText);

        const inputTokens = completion.usage?.prompt_tokens || 0;
        const outputTokens = completion.usage?.completion_tokens || 0;
        await storage.createAiUsageLog({
          userId,
          label: "Photo Edit Generation",
          model: "gpt-4o",
          inputTokens,
          outputTokens,
          estimatedCost: (inputTokens * 0.005 + outputTokens * 0.015) / 1000,
          listingId: listing.id,
          listingName: listing.name,
        });

        const { enhanceImageWithPrompt } = await import("../replit_integrations/image/client");
        
        try {
          const imageResult = await enhanceImageWithPrompt(photoUrl, editResult.enhancedPrompt);
          
          await storage.createAiUsageLog({
            userId,
            label: "Photo Enhancement Generation (Nano Banana Pro)",
            model: "gemini-3-pro-image-preview",
            inputTokens: 0,
            outputTokens: 0,
            estimatedCost: 0.04,
            listingId: listing.id,
            listingName: listing.name,
          });

          res.json({
            originalUrl: photoUrl,
            enhancedPrompt: editResult.enhancedPrompt,
            editApplied: editResult.editApplied,
            editedUrl: `data:${imageResult.mimeType};base64,${imageResult.base64}`,
            message: "Image enhancement generated successfully."
          });
        } catch (imageGenError) {
          logger.error('PhotoAnalysis', "Image generation error:", imageGenError);
          res.json({
            originalUrl: photoUrl,
            enhancedPrompt: editResult.enhancedPrompt,
            editApplied: editResult.editApplied,
            editedUrl: null,
            message: "Image generation temporarily unavailable. Use the prompt with your preferred AI image tool."
          });
        }
      } catch (aiError) {
        logger.error('PhotoAnalysis', "GPT-4 Vision error for photo edit:", aiError);
        return res.status(500).json({ message: "Failed to generate photo edit" });
      }
    } catch (error) {
      logger.error('PhotoAnalysis', "Error editing photo:", error);
      res.status(500).json({ message: "Failed to edit photo" });
    }
  });

  app.post("/api/listings/:id/photos/:photoIndex/save-edit", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const listingId = getParamId(req.params.id);
      const photoIndex = parseInt(String(req.params.photoIndex), 10);
      const { aiEditedUrl, aiEditedPrompt } = req.body;

      const listing = await storage.getListing(listingId);
      if (!listing || listing.userId !== userId) {
        return res.status(404).json({ message: "Listing not found" });
      }

      const images = (listing.images as string[]) || [];
      const photoUrl = images[photoIndex];
      if (!photoUrl) {
        return res.status(400).json({ message: "Invalid photo index" });
      }

      const photoAnalyses = await storage.getPhotoAnalysesByListing(listing.id);
      let existingAnalysis = photoAnalyses.find(a => a.photoIndex === photoIndex);

      let updated;
      if (!existingAnalysis) {
        updated = await storage.createPhotoAnalysis({
          listingId: listing.id,
          photoIndex,
          photoUrl,
          aiEditedUrl,
          aiEditedPrompt,
          aiEditedAt: new Date(),
          analysisType: "ai_edit_only",
        });
      } else {
        updated = await storage.updatePhotoAnalysis(existingAnalysis.id, {
          aiEditedUrl,
          aiEditedPrompt,
          aiEditedAt: new Date(),
        });
      }

      res.json({
        success: true,
        message: "AI edited photo saved successfully",
        photoAnalysis: updated,
      });
    } catch (error) {
      logger.error('PhotoAnalysis', "Error saving AI edited photo:", error);
      res.status(500).json({ message: "Failed to save AI edited photo" });
    }
  });

  app.post("/api/listings/:id/download-pinned-photos", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const listingId = getParamId(req.params.id);
      
      const listing = await storage.getListingById(listingId, userId);
      if (!listing) {
        return res.status(404).json({ message: "Listing not found" });
      }

      const photoAnalyses = await storage.getPhotoAnalysesByListing(listingId);
      const pinnedPhotos = photoAnalyses.filter(p => p.aiEditedUrl);
      
      if (pinnedPhotos.length === 0) {
        return res.status(404).json({ message: "No pinned photos found" });
      }

      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="pinned-photos-${listingId.slice(0, 8)}.zip"`);

      const archive = archiver('zip', { zlib: { level: 5 } });
      
      archive.on('error', (err) => {
        logger.error('PhotoAnalysis', "Archive error:", err);
        if (!res.headersSent) {
          res.status(500).json({ message: "Failed to create archive" });
        } else {
          res.end();
        }
      });
      
      archive.pipe(res);

      for (let i = 0; i < pinnedPhotos.length; i++) {
        const photo = pinnedPhotos[i];
        if (!photo.aiEditedUrl) continue;
        
        const url = photo.aiEditedUrl;
        if (!url.startsWith('https://') || (!url.includes('replitusercontent') && !url.includes('cloudflare') && !url.includes('hospitable.com'))) {
          logger.warn('PhotoAnalysis', `Skipping untrusted URL: ${url}`);
          continue;
        }
        
        try {
          const response = await fetch(url);
          if (response.ok) {
            const buffer = await response.arrayBuffer();
            const filename = `pet-photo-${photo.photoIndex + 1}.png`;
            archive.append(Buffer.from(buffer), { name: filename });
          }
        } catch (fetchError) {
          logger.error('PhotoAnalysis', `Error fetching photo ${i}:`, fetchError);
        }
      }

      await archive.finalize();
    } catch (error) {
      logger.error('PhotoAnalysis', "Error downloading pinned photos:", error);
      if (!res.headersSent) {
        res.status(500).json({ message: "Failed to download pinned photos" });
      }
    }
  });

  app.post("/api/listings/:id/photos/:photoIndex/enhance-feedback", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const { id: listingId, photoIndex } = req.params;
      const { isPositive, feedback } = req.body;

      const listing = await storage.getListing(listingId);
      if (!listing) {
        return res.status(404).json({ message: "Listing not found" });
      }

      const hasAccess = await validateWorkspaceMembership(userId, listing.workspaceId);
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }

      const label = isPositive 
        ? "photo_enhance_feedback_up" 
        : `photo_enhance_feedback_down: ${feedback || "No reason provided"}`;

      await storage.createAiUsageLog({
        userId,
        workspaceId: listing.workspaceId,
        model: "feedback",
        promptTokens: 0,
        completionTokens: 0,
        totalCost: "0",
        label,
        listingId: listing.id,
        listingName: listing.name,
        metadata: {
          photoIndex: parseInt(photoIndex),
          isPositive,
          feedback: feedback || null,
        },
      });

      res.json({ success: true });
    } catch (error) {
      logger.error('PhotoAnalysis', "Error saving photo enhance feedback:", error);
      res.status(500).json({ message: "Failed to save feedback" });
    }
  });
}

async function triggerAirbnbScanInBackground(storage: IStorage, listingId: string, workspaceId: string, airbnbId: string): Promise<void> {
  const airbnbUrl = `https://www.airbnb.com/rooms/${airbnbId}`;
  
  try {
    const scan = await storage.createAirbnbScan({
      listingId,
      workspaceId,
      airbnbUrl,
      status: 'scanning',
    });
    
    logger.info('Analysis', `Started background scan for listing ${listingId}`);
    
    (async () => {
      try {
        const { scanAirbnbListing } = await import('../airbnb-scanner');
        const result = await scanAirbnbListing(airbnbUrl);
        
        if (result.success) {
          await storage.updateAirbnbScan(scan.id, {
            status: 'completed',
            whereYoullSleep: result.whereYoullSleep,
            hasWhereYoullSleep: result.hasWhereYoullSleep,
            isSuperhost: result.isSuperhost,
            guestFavoriteTier: result.guestFavoriteTier,
            hostProfile: result.hostProfile,
            rawSnapshot: result.rawSnapshot,
            scannedAt: new Date(),
          });
          logger.info('Analysis', `Background scan completed for listing ${listingId}`);
        } else {
          await storage.updateAirbnbScan(scan.id, {
            status: 'failed',
            errorMessage: result.errorMessage,
          });
          logger.error('Analysis', `Background scan failed for listing ${listingId}:`, result.errorMessage);
        }
      } catch (error) {
        logger.error('Analysis', `Error during background scan:`, error);
        await storage.updateAirbnbScan(scan.id, {
          status: 'failed',
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    })();
  } catch (error) {
    logger.error('Analysis', `Failed to create scan record:`, error);
  }
}
