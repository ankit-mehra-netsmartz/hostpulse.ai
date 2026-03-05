import type { Express } from "express";
import type { IStorage } from "../storage";
import { isAuthenticated } from "../replit_integrations/auth";
import { logger } from "../logger";
import { getUserId, getParamId, validateWorkspaceMembership } from "./helpers";
import { openai, getConfiguredAIModel } from "./ai-helpers";

export function registerAirbnbScanRoutes(app: Express, storage: IStorage) {
  // Get the latest Airbnb scan for a listing
  app.get("/api/listings/:id/airbnb-scan", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const listing = await storage.getListing(getParamId(req.params.id));
      
      if (!listing) {
        return res.status(404).json({ message: "Listing not found" });
      }
      
      if (listing.workspaceId && !(await validateWorkspaceMembership(userId, listing.workspaceId))) {
        return res.status(403).json({ message: "Not authorized" });
      }
      
      const scan = await storage.getAirbnbScanByListing(listing.id);
      res.json(scan || null);
    } catch (error) {
      logger.error("AirbnbScan", "Error fetching Airbnb scan:", error);
      res.status(500).json({ message: "Failed to fetch Airbnb scan" });
    }
  });

  // Start a new Airbnb scan for a listing
  app.post("/api/listings/:id/airbnb-scan", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const listing = await storage.getListing(getParamId(req.params.id));
      
      if (!listing) {
        return res.status(404).json({ message: "Listing not found" });
      }
      
      if (listing.workspaceId && !(await validateWorkspaceMembership(userId, listing.workspaceId))) {
        return res.status(403).json({ message: "Not authorized" });
      }
      
      const airbnbId = listing.platformIds?.airbnb;
      if (!airbnbId) {
        return res.status(400).json({ message: "No Airbnb listing ID found for this property. Please sync property data first." });
      }
      
      const airbnbUrl = `https://www.airbnb.com/rooms/${airbnbId}`;
      
      const scan = await storage.createAirbnbScan({
        listingId: listing.id,
        workspaceId: listing.workspaceId || '',
        airbnbUrl,
        status: 'scanning',
      });
      
      res.json({ scanId: scan.id, status: 'scanning', message: 'Scan started' });
      
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
            logger.info("AirbnbScan", `Scan completed for listing ${listing.id}`);
          } else {
            await storage.updateAirbnbScan(scan.id, {
              status: 'failed',
              errorMessage: result.errorMessage,
            });
            logger.error("AirbnbScan", `Scan failed for listing ${listing.id}:`, result.errorMessage);
          }
        } catch (error) {
          logger.error("AirbnbScan", "Error during scan:", error);
          await storage.updateAirbnbScan(scan.id, {
            status: 'failed',
            errorMessage: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      })();
      
    } catch (error) {
      logger.error("AirbnbScan", "Error starting Airbnb scan:", error);
      res.status(500).json({ message: "Failed to start Airbnb scan" });
    }
  });

  // Get scan status
  app.get("/api/airbnb-scans/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const scan = await storage.getAirbnbScan(getParamId(req.params.id));
      
      if (!scan) {
        return res.status(404).json({ message: "Scan not found" });
      }
      
      if (scan.workspaceId && !(await validateWorkspaceMembership(userId, scan.workspaceId))) {
        return res.status(403).json({ message: "Not authorized" });
      }
      
      res.json(scan);
    } catch (error) {
      logger.error("AirbnbScan", "Error fetching scan status:", error);
      res.status(500).json({ message: "Failed to fetch scan status" });
    }
  });

  // Run AI analysis on completed Airbnb scan
  app.post("/api/airbnb-scans/:id/analyze", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const scan = await storage.getAirbnbScan(getParamId(req.params.id));
      
      if (!scan) {
        return res.status(404).json({ message: "Scan not found" });
      }
      
      if (scan.workspaceId && !(await validateWorkspaceMembership(userId, scan.workspaceId))) {
        return res.status(403).json({ message: "Not authorized" });
      }
      
      if (scan.status !== 'completed') {
        return res.status(400).json({ message: "Scan is not completed yet" });
      }
      
      const listing = await storage.getListing(scan.listingId);
      if (!listing) {
        return res.status(404).json({ message: "Listing not found" });
      }
      
      const { modelId, modelInfo } = await getConfiguredAIModel();
      
      const prompt = `You are an expert short-term rental listing analyst. Analyze the following Airbnb listing data and provide actionable insights.

Property: ${listing.name}
${listing.address ? `Address: ${listing.address}` : ''}
${listing.propertyType ? `Type: ${listing.propertyType}` : ''}
${listing.bedrooms ? `Bedrooms: ${listing.bedrooms}` : ''}

AIRBNB SCAN DATA:

1. WHERE YOU'LL SLEEP SECTION:
${scan.hasWhereYoullSleep ? `Present: Yes
Rooms: ${JSON.stringify(scan.whereYoullSleep?.rooms || [], null, 2)}` : 'Present: No - This section is missing from the listing'}

2. SUPERHOST STATUS:
${scan.isSuperhost ? 'Yes - Host has Superhost badge' : 'No - Host is not a Superhost'}

3. GUEST FAVORITE STATUS:
${scan.guestFavoriteTier ? `Tier: ${scan.guestFavoriteTier === 'gold' ? 'Top 1% (Gold)' : scan.guestFavoriteTier === 'black' ? 'Top 5% (Black)' : 'Top 10% (Standard)'}` : 'Not a Guest Favorite'}

4. HOST PROFILE:
${scan.hostProfile ? `Name: ${scan.hostProfile.name}
Photo URL: ${scan.hostProfile.photoUrl ? 'Present' : 'Missing'}
Superhost: ${scan.hostProfile.isSuperhost}
Response Rate: ${scan.hostProfile.responseRate || 'Unknown'}
Response Time: ${scan.hostProfile.responseTime || 'Unknown'}
Years Hosting: ${scan.hostProfile.yearsHosting || 'Unknown'}
Reviews: ${scan.hostProfile.reviewCount || 'Unknown'}
Verified: ${scan.hostProfile.verified}
Attributes: ${scan.hostProfile.attributes?.join(', ') || 'None listed'}` : 'Host profile data not available'}

Please provide analysis in the following JSON format:
{
  "whereYoullSleepAnalysis": {
    "grade": "A-F letter grade",
    "feedback": "Brief analysis of the sleeping arrangements section",
    "suggestions": ["Specific improvement suggestions"]
  },
  "superhostAnalysis": {
    "hasStatus": true/false,
    "feedback": "Analysis of superhost status and what it means for the listing"
  },
  "guestFavoriteAnalysis": {
    "tier": "gold/black/standard/null",
    "feedback": "Analysis of guest favorite status",
    "suggestions": ["How to achieve or maintain Guest Favorite status"]
  },
  "hostProfileAnalysis": {
    "grade": "A-F letter grade",
    "photoQuality": "Assessment of profile photo quality and professionalism",
    "feedback": "Overall host profile analysis",
    "suggestions": ["Specific improvement suggestions for host profile"]
  },
  "overallScore": 1-10 numeric score
}`;

      const response = await openai.chat.completions.create({
        model: modelId,
        messages: [
          { role: "system", content: "You are an expert vacation rental analyst. Always respond with valid JSON." },
          { role: "user", content: prompt }
        ],
        temperature: 0.7,
        response_format: { type: "json_object" }
      });

      const content = response.choices[0]?.message?.content || '{}';
      let analysis;
      try {
        analysis = JSON.parse(content);
      } catch {
        analysis = { error: "Failed to parse AI response" };
      }

      const inputCost = (modelInfo as any).inputCost || (modelInfo as any).inputCostPer1k / 1000 || 0;
      const outputCost = (modelInfo as any).outputCost || (modelInfo as any).outputCostPer1k / 1000 || 0;
      await storage.createAiUsageLog({
        userId,
        label: "airbnb_scan_analysis",
        model: modelInfo.name,
        inputTokens: response.usage?.prompt_tokens || 0,
        outputTokens: response.usage?.completion_tokens || 0,
        estimatedCost: ((response.usage?.prompt_tokens || 0) * inputCost) + 
                       ((response.usage?.completion_tokens || 0) * outputCost),
        listingId: listing.id,
        listingName: listing.name
      });

      const updatedScan = await storage.updateAirbnbScan(scan.id, {
        aiAnalysis: analysis,
        analyzedAt: new Date(),
      });

      res.json(updatedScan);
    } catch (error) {
      logger.error("AirbnbScan", "Error analyzing Airbnb scan:", error);
      res.status(500).json({ message: "Failed to analyze Airbnb scan" });
    }
  });
}
