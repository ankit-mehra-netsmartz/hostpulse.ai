import type { Express } from "express";
import type { IStorage } from "../storage";
import { isAuthenticated } from "../replit_integrations/auth";
import { logger } from "../logger";
import { getUserId, getWorkspaceId, validateWorkspaceMembership, getParamId } from "./helpers";
import { openai } from "./ai-helpers";

const generateListingIdsHash = (listingIds: string[]): string => {
  const sorted = [...listingIds].sort();
  return sorted.join(",");
};

export function registerReviewRoutes(app: Express, storage: IStorage) {
  // =====================
  // Reviews
  // =====================

  app.get("/api/reviews/stats", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const workspaceId = getWorkspaceId(req);
      const days = parseInt(req.query.days as string) || 90;
      const listingIdsParam = req.query.listingIds as string || "";
      const listingIds = listingIdsParam ? listingIdsParam.split(",").filter(id => id.trim()) : [];

      if (workspaceId && !(await validateWorkspaceMembership(userId, workspaceId))) {
        return res.status(403).json({ message: "Not a member of this workspace" });
      }

      let validatedListingIds: string[] = [];
      if (listingIds.length > 0) {
        const workspaceListings = workspaceId 
          ? await storage.getListingsByWorkspace(workspaceId)
          : await storage.getListingsByUser(userId);
        const validListingIdSet = new Set(workspaceListings.map(l => l.id));
        validatedListingIds = listingIds.filter(id => validListingIdSet.has(id));
      }

      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      
      const prevStartDate = new Date();
      prevStartDate.setDate(prevStartDate.getDate() - days * 2);
      const prevEndDate = new Date();
      prevEndDate.setDate(prevEndDate.getDate() - days);

      let reservationsList;
      if (validatedListingIds.length > 0) {
        reservationsList = await storage.getReservationsByListingIds(validatedListingIds);
      } else if (workspaceId) {
        reservationsList = await storage.getReservationsByWorkspace(workspaceId);
      } else {
        reservationsList = await storage.getReservationsByUser(userId);
      }

      const currentPeriod = reservationsList.filter(r => {
        const checkOut = r.checkOutDate ? new Date(r.checkOutDate) : null;
        return checkOut && checkOut >= startDate;
      });

      const prevPeriod = reservationsList.filter(r => {
        const checkOut = r.checkOutDate ? new Date(r.checkOutDate) : null;
        return checkOut && checkOut >= prevStartDate && checkOut < prevEndDate;
      });

      const currentWithReviews = currentPeriod.filter(r => r.publicReview || r.guestRating || r.aiSentimentScore !== null);
      const prevWithReviews = prevPeriod.filter(r => r.publicReview || r.guestRating || r.aiSentimentScore !== null);

      const totalReviews = currentWithReviews.length;
      const prevTotalReviews = prevWithReviews.length;

      const currentWithPublicReviews = currentWithReviews.filter(r => r.guestRating !== null && r.guestRating !== undefined);
      const prevWithPublicReviews = prevWithReviews.filter(r => r.guestRating !== null && r.guestRating !== undefined);
      
      const totalRating = currentWithPublicReviews.reduce((sum, r) => sum + (r.guestRating || 0), 0);
      const averageRating = currentWithPublicReviews.length > 0 ? totalRating / currentWithPublicReviews.length : 0;
      
      const prevTotalRating = prevWithPublicReviews.reduce((sum, r) => sum + (r.guestRating || 0), 0);
      const prevAverageRating = prevWithPublicReviews.length > 0 ? prevTotalRating / prevWithPublicReviews.length : 0;

      const reviewRate = currentPeriod.length > 0 
        ? Math.round((totalReviews / currentPeriod.length) * 100) 
        : 0;
      const prevReviewRate = prevPeriod.length > 0 
        ? Math.round((prevTotalReviews / prevPeriod.length) * 100) 
        : 0;

      const aiScores = currentWithReviews.filter(r => r.aiSentimentScore).map(r => r.aiSentimentScore!);
      const aiSentimentScore = aiScores.length > 0 
        ? aiScores.reduce((sum, s) => sum + s, 0) / aiScores.length 
        : 0;
      
      const prevAiScores = prevWithReviews.filter(r => r.aiSentimentScore).map(r => r.aiSentimentScore!);
      const prevAiSentimentScore = prevAiScores.length > 0 
        ? prevAiScores.reduce((sum, s) => sum + s, 0) / prevAiScores.length 
        : 0;

      const mutualReviewsPublic = currentWithReviews.filter(r => r.hostReply).length;
      const reviewReplies = mutualReviewsPublic;

      const ratingDistribution = {
        rating5: currentWithReviews.filter(r => r.guestRating === 5).length,
        rating4: currentWithReviews.filter(r => r.guestRating === 4).length,
        rating3: currentWithReviews.filter(r => r.guestRating === 3).length,
        rating2: currentWithReviews.filter(r => r.guestRating === 2).length,
        rating1: currentWithReviews.filter(r => r.guestRating === 1).length,
      };

      const aiSentimentRatingDistribution = {
        rating5: currentWithReviews.filter(r => r.aiSentimentScore !== null && Math.round(r.aiSentimentScore) === 5).length,
        rating4: currentWithReviews.filter(r => r.aiSentimentScore !== null && Math.round(r.aiSentimentScore) === 4).length,
        rating3: currentWithReviews.filter(r => r.aiSentimentScore !== null && Math.round(r.aiSentimentScore) === 3).length,
        rating2: currentWithReviews.filter(r => r.aiSentimentScore !== null && Math.round(r.aiSentimentScore) === 2).length,
        rating1: currentWithReviews.filter(r => r.aiSentimentScore !== null && Math.round(r.aiSentimentScore) <= 1).length,
      };

      const sentimentDistribution = {
        excellent: currentWithReviews.filter(r => (r.aiSentimentScore || 0) >= 4).length,
        good: currentWithReviews.filter(r => (r.aiSentimentScore || 0) >= 3 && (r.aiSentimentScore || 0) < 4).length,
        poor: currentWithReviews.filter(r => (r.aiSentimentScore || 0) < 3).length,
      };

      const calcChange = (current: number, previous: number) => {
        if (previous === 0) return current > 0 ? 100 : 0;
        return Math.round(((current - previous) / previous) * 100);
      };

      let cachedSummary = null;
      let hasCachedSummary = false;
      let needsRegeneration = false;
      
      if (workspaceId) {
        let effectiveListingIds = listingIds;
        if (effectiveListingIds.length === 0) {
          const workspaceListings = await storage.getListingsByWorkspace(workspaceId);
          effectiveListingIds = workspaceListings.map(l => l.id);
        }
        
        if (effectiveListingIds.length > 0) {
          const listingIdsHash = generateListingIdsHash(effectiveListingIds);
          cachedSummary = await storage.getReviewsSummary(workspaceId, listingIdsHash);
          hasCachedSummary = !!cachedSummary;
          
          if (cachedSummary && cachedSummary.analyzedReservationCount !== totalReviews) {
            needsRegeneration = true;
          }
        }
      }

      res.json({
        totalReviews,
        averageRating: Math.round(averageRating * 10) / 10,
        reviewRate,
        aiSentimentScore: Math.round(aiSentimentScore * 10) / 10,
        totalReservations: currentPeriod.length,
        mutualReviewsPublic,
        reviewReplies,
        periodChange: {
          totalReviews: calcChange(totalReviews, prevTotalReviews),
          averageRating: calcChange(averageRating, prevAverageRating),
          reviewRate: calcChange(reviewRate, prevReviewRate),
          aiSentimentScore: calcChange(aiSentimentScore, prevAiSentimentScore),
        },
        strengths: cachedSummary?.strengths || [],
        areasToImprove: cachedSummary?.areasToImprove || [],
        performanceInsight: cachedSummary?.performanceInsight || (totalReviews > 0 
          ? `Based on ${totalReviews} reviews in the last ${days} days, your properties maintain an average rating of ${averageRating.toFixed(1)} stars.`
          : "No reviews available for the selected period."),
        ratingDistribution,
        aiSentimentRatingDistribution,
        sentimentDistribution,
        hasCachedSummary,
        summaryGeneratedAt: cachedSummary?.generatedAt,
        needsRegeneration,
      });
    } catch (error) {
      logger.error("Reviews", "Error fetching review stats:", error);
      res.status(500).json({ message: "Failed to fetch review stats" });
    }
  });

  app.get("/api/reviews/stats/:days/:listingIds", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const workspaceId = getWorkspaceId(req);
      const days = req.params.days;
      const listingIds = req.params.listingIds;
      req.query.days = days;
      req.query.listingIds = listingIds;
      const daysNum = parseInt(days) || 90;
      const listingIdsParam = listingIds || "";
      const listingIdsList = listingIdsParam ? listingIdsParam.split(",").filter((id: string) => id.trim()) : [];

      if (workspaceId && !(await validateWorkspaceMembership(userId, workspaceId))) {
        return res.status(403).json({ message: "Not a member of this workspace" });
      }

      let validatedListingIds: string[] = [];
      if (listingIdsList.length > 0) {
        const workspaceListings = workspaceId 
          ? await storage.getListingsByWorkspace(workspaceId)
          : await storage.getListingsByUser(userId);
        const validListingIdSet = new Set(workspaceListings.map((l: { id: string }) => l.id));
        validatedListingIds = listingIdsList.filter((id: string) => validListingIdSet.has(id));
      }

      const startDate = new Date();
      startDate.setDate(startDate.getDate() - daysNum);
      
      const prevStartDate = new Date();
      prevStartDate.setDate(prevStartDate.getDate() - daysNum * 2);
      const prevEndDate = new Date();
      prevEndDate.setDate(prevEndDate.getDate() - daysNum);

      let reservationsList;
      if (validatedListingIds.length > 0) {
        reservationsList = await storage.getReservationsByListingIds(validatedListingIds);
      } else if (workspaceId) {
        reservationsList = await storage.getReservationsByWorkspace(workspaceId);
      } else {
        reservationsList = await storage.getReservationsByUser(userId);
      }

      const currentPeriod = reservationsList.filter((r: { checkOutDate?: string | Date | null }) => {
        const checkOut = r.checkOutDate ? new Date(r.checkOutDate) : null;
        return checkOut && checkOut >= startDate;
      });

      const prevPeriod = reservationsList.filter((r: { checkOutDate?: string | Date | null }) => {
        const checkOut = r.checkOutDate ? new Date(r.checkOutDate) : null;
        return checkOut && checkOut >= prevStartDate && checkOut < prevEndDate;
      });

      const currentWithReviews = currentPeriod.filter((r: { publicReview?: string | null; guestRating?: number | null; aiSentimentScore?: number | null }) => 
        r.publicReview || r.guestRating || r.aiSentimentScore !== null
      );
      const prevWithReviews = prevPeriod.filter((r: { publicReview?: string | null; guestRating?: number | null; aiSentimentScore?: number | null }) => 
        r.publicReview || r.guestRating || r.aiSentimentScore !== null
      );

      const totalReviews = currentWithReviews.length;
      const prevTotalReviews = prevWithReviews.length;

      const currentWithPublicReviews = currentWithReviews.filter((r: { guestRating?: number | null }) => r.guestRating !== null && r.guestRating !== undefined);
      const prevWithPublicReviews = prevWithReviews.filter((r: { guestRating?: number | null }) => r.guestRating !== null && r.guestRating !== undefined);
      
      const totalRating = currentWithPublicReviews.reduce((sum: number, r: { guestRating?: number | null }) => sum + (r.guestRating || 0), 0);
      const averageRating = currentWithPublicReviews.length > 0 ? totalRating / currentWithPublicReviews.length : 0;
      
      const prevTotalRating = prevWithPublicReviews.reduce((sum: number, r: { guestRating?: number | null }) => sum + (r.guestRating || 0), 0);
      const prevAverageRating = prevWithPublicReviews.length > 0 ? prevTotalRating / prevWithPublicReviews.length : 0;

      const reviewRate = currentPeriod.length > 0 
        ? Math.round((totalReviews / currentPeriod.length) * 100) 
        : 0;
      const prevReviewRate = prevPeriod.length > 0 
        ? Math.round((prevTotalReviews / prevPeriod.length) * 100) 
        : 0;

      const aiScores = currentWithReviews.filter((r: { aiSentimentScore?: number | null }) => r.aiSentimentScore).map((r: { aiSentimentScore?: number | null }) => r.aiSentimentScore!);
      const aiSentimentScore = aiScores.length > 0 
        ? aiScores.reduce((sum: number, s: number) => sum + s, 0) / aiScores.length 
        : 0;
      
      const prevAiScores = prevWithReviews.filter((r: { aiSentimentScore?: number | null }) => r.aiSentimentScore).map((r: { aiSentimentScore?: number | null }) => r.aiSentimentScore!);
      const prevAiSentimentScore = prevAiScores.length > 0 
        ? prevAiScores.reduce((sum: number, s: number) => sum + s, 0) / prevAiScores.length 
        : 0;

      const ratingDistribution = {
        rating5: currentWithReviews.filter((r: { guestRating?: number | null }) => r.guestRating === 5).length,
        rating4: currentWithReviews.filter((r: { guestRating?: number | null }) => r.guestRating === 4).length,
        rating3: currentWithReviews.filter((r: { guestRating?: number | null }) => r.guestRating === 3).length,
        rating2: currentWithReviews.filter((r: { guestRating?: number | null }) => r.guestRating === 2).length,
        rating1: currentWithReviews.filter((r: { guestRating?: number | null }) => r.guestRating === 1).length,
      };

      const aiSentimentRatingDistribution = {
        rating5: currentWithReviews.filter((r: { aiSentimentScore?: number | null }) => r.aiSentimentScore !== null && Math.round(r.aiSentimentScore!) === 5).length,
        rating4: currentWithReviews.filter((r: { aiSentimentScore?: number | null }) => r.aiSentimentScore !== null && Math.round(r.aiSentimentScore!) === 4).length,
        rating3: currentWithReviews.filter((r: { aiSentimentScore?: number | null }) => r.aiSentimentScore !== null && Math.round(r.aiSentimentScore!) === 3).length,
        rating2: currentWithReviews.filter((r: { aiSentimentScore?: number | null }) => r.aiSentimentScore !== null && Math.round(r.aiSentimentScore!) === 2).length,
        rating1: currentWithReviews.filter((r: { aiSentimentScore?: number | null }) => r.aiSentimentScore !== null && Math.round(r.aiSentimentScore!) <= 1).length,
      };

      const sentimentDistribution = {
        excellent: currentWithReviews.filter((r: { aiSentimentScore?: number | null }) => (r.aiSentimentScore || 0) >= 4).length,
        good: currentWithReviews.filter((r: { aiSentimentScore?: number | null }) => (r.aiSentimentScore || 0) >= 3 && (r.aiSentimentScore || 0) < 4).length,
        poor: currentWithReviews.filter((r: { aiSentimentScore?: number | null }) => (r.aiSentimentScore || 0) < 3).length,
      };

      const calcChange = (current: number, previous: number) => {
        if (previous === 0) return current > 0 ? 100 : 0;
        return Math.round(((current - previous) / previous) * 100);
      };

      let cachedSummary = null;
      if (workspaceId) {
        let effectiveListingIds = validatedListingIds;
        if (effectiveListingIds.length === 0) {
          const workspaceListings = await storage.getListingsByWorkspace(workspaceId);
          effectiveListingIds = workspaceListings.map((l: { id: string }) => l.id);
        }
        
        if (effectiveListingIds.length > 0) {
          const listingIdsHash = generateListingIdsHash(effectiveListingIds);
          cachedSummary = await storage.getReviewsSummary(workspaceId, listingIdsHash);
        }
      }

      res.json({
        totalReviews,
        averageRating,
        reviewRate,
        aiSentimentScore,
        totalReservations: currentPeriod.length,
        mutualReviewsPublic: currentWithReviews.filter((r: { hostReply?: string | null }) => r.hostReply).length,
        reviewReplies: currentWithReviews.filter((r: { hostReply?: string | null }) => r.hostReply).length,
        periodChange: {
          totalReviews: calcChange(totalReviews, prevTotalReviews),
          averageRating: calcChange(averageRating, prevAverageRating),
          reviewRate: calcChange(reviewRate, prevReviewRate),
          aiSentimentScore: calcChange(aiSentimentScore, prevAiSentimentScore),
        },
        strengths: cachedSummary?.strengths || [],
        areasToImprove: cachedSummary?.areasToImprove || [],
        performanceInsight: cachedSummary?.performanceInsight || (totalReviews > 0 
          ? `Based on ${totalReviews} reviews in the last ${daysNum} days, your properties maintain an average rating of ${averageRating.toFixed(1)} stars.`
          : "No reviews available for the selected period."),
        ratingDistribution,
        aiSentimentRatingDistribution,
        sentimentDistribution,
        hasCachedSummary: !!cachedSummary,
        summaryGeneratedAt: cachedSummary?.generatedAt,
      });
    } catch (error) {
      logger.error("Reviews", "Error fetching review stats:", error);
      res.status(500).json({ message: "Failed to fetch review stats" });
    }
  });

  app.get("/api/reviews/stats/:days", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const workspaceId = getWorkspaceId(req);
      const daysNum = parseInt(req.params.days as string) || 90;

      if (workspaceId && !(await validateWorkspaceMembership(userId, workspaceId))) {
        return res.status(403).json({ message: "Not a member of this workspace" });
      }

      const startDate = new Date();
      startDate.setDate(startDate.getDate() - daysNum);
      
      const prevStartDate = new Date();
      prevStartDate.setDate(prevStartDate.getDate() - daysNum * 2);
      const prevEndDate = new Date();
      prevEndDate.setDate(prevEndDate.getDate() - daysNum);

      let reservationsList;
      if (workspaceId) {
        reservationsList = await storage.getReservationsByWorkspace(workspaceId);
      } else {
        reservationsList = await storage.getReservationsByUser(userId);
      }

      const currentPeriod = reservationsList.filter((r: { checkOutDate?: string | Date | null }) => {
        const checkOut = r.checkOutDate ? new Date(r.checkOutDate) : null;
        return checkOut && checkOut >= startDate;
      });

      const prevPeriod = reservationsList.filter((r: { checkOutDate?: string | Date | null }) => {
        const checkOut = r.checkOutDate ? new Date(r.checkOutDate) : null;
        return checkOut && checkOut >= prevStartDate && checkOut < prevEndDate;
      });

      const currentWithReviews = currentPeriod.filter((r: { publicReview?: string | null; guestRating?: number | null; aiSentimentScore?: number | null }) => 
        r.publicReview || r.guestRating || r.aiSentimentScore !== null
      );
      const prevWithReviews = prevPeriod.filter((r: { publicReview?: string | null; guestRating?: number | null; aiSentimentScore?: number | null }) => 
        r.publicReview || r.guestRating || r.aiSentimentScore !== null
      );

      const totalReviews = currentWithReviews.length;
      const prevTotalReviews = prevWithReviews.length;

      const currentWithPublicReviews = currentWithReviews.filter((r: { guestRating?: number | null }) => r.guestRating !== null && r.guestRating !== undefined);
      const prevWithPublicReviews = prevWithReviews.filter((r: { guestRating?: number | null }) => r.guestRating !== null && r.guestRating !== undefined);
      
      const totalRating = currentWithPublicReviews.reduce((sum: number, r: { guestRating?: number | null }) => sum + (r.guestRating || 0), 0);
      const averageRating = currentWithPublicReviews.length > 0 ? totalRating / currentWithPublicReviews.length : 0;
      
      const prevTotalRating = prevWithPublicReviews.reduce((sum: number, r: { guestRating?: number | null }) => sum + (r.guestRating || 0), 0);
      const prevAverageRating = prevWithPublicReviews.length > 0 ? prevTotalRating / prevWithPublicReviews.length : 0;

      const reviewRate = currentPeriod.length > 0 
        ? Math.round((totalReviews / currentPeriod.length) * 100) 
        : 0;
      const prevReviewRate = prevPeriod.length > 0 
        ? Math.round((prevTotalReviews / prevPeriod.length) * 100) 
        : 0;

      const aiScores = currentWithReviews.filter((r: { aiSentimentScore?: number | null }) => r.aiSentimentScore).map((r: { aiSentimentScore?: number | null }) => r.aiSentimentScore!);
      const aiSentimentScore = aiScores.length > 0 
        ? aiScores.reduce((sum: number, s: number) => sum + s, 0) / aiScores.length 
        : 0;
      
      const prevAiScores = prevWithReviews.filter((r: { aiSentimentScore?: number | null }) => r.aiSentimentScore).map((r: { aiSentimentScore?: number | null }) => r.aiSentimentScore!);
      const prevAiSentimentScore = prevAiScores.length > 0 
        ? prevAiScores.reduce((sum: number, s: number) => sum + s, 0) / prevAiScores.length 
        : 0;

      const ratingDistribution = {
        rating5: currentWithReviews.filter((r: { guestRating?: number | null }) => r.guestRating === 5).length,
        rating4: currentWithReviews.filter((r: { guestRating?: number | null }) => r.guestRating === 4).length,
        rating3: currentWithReviews.filter((r: { guestRating?: number | null }) => r.guestRating === 3).length,
        rating2: currentWithReviews.filter((r: { guestRating?: number | null }) => r.guestRating === 2).length,
        rating1: currentWithReviews.filter((r: { guestRating?: number | null }) => r.guestRating === 1).length,
      };

      const aiSentimentRatingDistribution = {
        rating5: currentWithReviews.filter((r: { aiSentimentScore?: number | null }) => r.aiSentimentScore !== null && Math.round(r.aiSentimentScore!) === 5).length,
        rating4: currentWithReviews.filter((r: { aiSentimentScore?: number | null }) => r.aiSentimentScore !== null && Math.round(r.aiSentimentScore!) === 4).length,
        rating3: currentWithReviews.filter((r: { aiSentimentScore?: number | null }) => r.aiSentimentScore !== null && Math.round(r.aiSentimentScore!) === 3).length,
        rating2: currentWithReviews.filter((r: { aiSentimentScore?: number | null }) => r.aiSentimentScore !== null && Math.round(r.aiSentimentScore!) === 2).length,
        rating1: currentWithReviews.filter((r: { aiSentimentScore?: number | null }) => r.aiSentimentScore !== null && Math.round(r.aiSentimentScore!) <= 1).length,
      };

      const sentimentDistribution = {
        excellent: currentWithReviews.filter((r: { aiSentimentScore?: number | null }) => (r.aiSentimentScore || 0) >= 4).length,
        good: currentWithReviews.filter((r: { aiSentimentScore?: number | null }) => (r.aiSentimentScore || 0) >= 3 && (r.aiSentimentScore || 0) < 4).length,
        poor: currentWithReviews.filter((r: { aiSentimentScore?: number | null }) => (r.aiSentimentScore || 0) < 3).length,
      };

      const calcChange = (current: number, previous: number) => {
        if (previous === 0) return current > 0 ? 100 : 0;
        return Math.round(((current - previous) / previous) * 100);
      };

      let cachedSummary = null;
      if (workspaceId) {
        const workspaceListings = await storage.getListingsByWorkspace(workspaceId);
        const effectiveListingIds = workspaceListings.map((l: { id: string }) => l.id);
        
        if (effectiveListingIds.length > 0) {
          const listingIdsHash = generateListingIdsHash(effectiveListingIds);
          cachedSummary = await storage.getReviewsSummary(workspaceId, listingIdsHash);
        }
      }

      res.json({
        totalReviews,
        averageRating,
        reviewRate,
        aiSentimentScore,
        totalReservations: currentPeriod.length,
        mutualReviewsPublic: currentWithReviews.filter((r: { hostReply?: string | null }) => r.hostReply).length,
        reviewReplies: currentWithReviews.filter((r: { hostReply?: string | null }) => r.hostReply).length,
        periodChange: {
          totalReviews: calcChange(totalReviews, prevTotalReviews),
          averageRating: calcChange(averageRating, prevAverageRating),
          reviewRate: calcChange(reviewRate, prevReviewRate),
          aiSentimentScore: calcChange(aiSentimentScore, prevAiSentimentScore),
        },
        strengths: cachedSummary?.strengths || [],
        areasToImprove: cachedSummary?.areasToImprove || [],
        performanceInsight: cachedSummary?.performanceInsight || (totalReviews > 0 
          ? `Based on ${totalReviews} reviews in the last ${daysNum} days, your properties maintain an average rating of ${averageRating.toFixed(1)} stars.`
          : "No reviews available for the selected period."),
        ratingDistribution,
        aiSentimentRatingDistribution,
        sentimentDistribution,
        hasCachedSummary: !!cachedSummary,
        summaryGeneratedAt: cachedSummary?.generatedAt,
      });
    } catch (error) {
      logger.error("Reviews", "Error fetching review stats:", error);
      res.status(500).json({ message: "Failed to fetch review stats" });
    }
  });

  app.get("/api/reviews", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const workspaceId = getWorkspaceId(req);
      const days = parseInt(req.query.days as string) || 90;
      const listingIdsParam = req.query.listingIds as string || "";
      const listingIds = listingIdsParam ? listingIdsParam.split(",").filter(id => id.trim()) : [];

      if (workspaceId && !(await validateWorkspaceMembership(userId, workspaceId))) {
        return res.status(403).json({ message: "Not a member of this workspace" });
      }

      let validatedListingIds: string[] = [];
      if (listingIds.length > 0) {
        const workspaceListings = workspaceId 
          ? await storage.getListingsByWorkspace(workspaceId)
          : await storage.getListingsByUser(userId);
        const validListingIdSet = new Set(workspaceListings.map(l => l.id));
        validatedListingIds = listingIds.filter(id => validListingIdSet.has(id));
      }

      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      let reservationsList;
      if (validatedListingIds.length > 0) {
        reservationsList = await storage.getReservationsByListingIds(validatedListingIds);
      } else if (workspaceId) {
        reservationsList = await storage.getReservationsByWorkspace(workspaceId);
      } else {
        reservationsList = await storage.getReservationsByUser(userId);
      }

      const reservationsWithReviews = reservationsList
        .filter(r => {
          const checkOut = r.checkOutDate ? new Date(r.checkOutDate) : null;
          return (r.publicReview || r.guestRating || r.aiSentimentScore !== null) && checkOut && checkOut >= startDate;
        })
        .sort((a, b) => {
          const dateA = a.reviewPostedAt ? new Date(a.reviewPostedAt).getTime() : (a.checkOutDate ? new Date(a.checkOutDate).getTime() : 0);
          const dateB = b.reviewPostedAt ? new Date(b.reviewPostedAt).getTime() : (b.checkOutDate ? new Date(b.checkOutDate).getTime() : 0);
          return dateB - dateA;
        });

      const reviewsWithListings = await Promise.all(
        reservationsWithReviews.map(async (reservation) => {
          const listing = await storage.getListing(reservation.listingId);
          return { ...reservation, listing };
        })
      );

      res.json(reviewsWithListings);
    } catch (error) {
      logger.error("Reviews", "Error fetching reviews:", error);
      res.status(500).json({ message: "Failed to fetch reviews" });
    }
  });

  app.get("/api/reviews/:days/:listingIds", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const workspaceId = getWorkspaceId(req);
      const days = parseInt(req.params.days as string) || 90;
      const listingIdsParam = (req.params.listingIds as string) || "";
      const listingIds = listingIdsParam ? listingIdsParam.split(",").filter((id: string) => id.trim()) : [];

      if (workspaceId && !(await validateWorkspaceMembership(userId, workspaceId))) {
        return res.status(403).json({ message: "Not a member of this workspace" });
      }

      let validatedListingIds: string[] = [];
      if (listingIds.length > 0) {
        const workspaceListings = workspaceId 
          ? await storage.getListingsByWorkspace(workspaceId)
          : await storage.getListingsByUser(userId);
        const validListingIdSet = new Set(workspaceListings.map((l: { id: string }) => l.id));
        validatedListingIds = listingIds.filter((id: string) => validListingIdSet.has(id));
      }

      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      let reservationsList;
      if (validatedListingIds.length > 0) {
        reservationsList = await storage.getReservationsByListingIds(validatedListingIds);
      } else if (workspaceId) {
        reservationsList = await storage.getReservationsByWorkspace(workspaceId);
      } else {
        reservationsList = await storage.getReservationsByUser(userId);
      }

      const reservationsWithReviews = reservationsList
        .filter((r: { checkOutDate?: string | Date | null; publicReview?: string | null; guestRating?: number | null; aiSentimentScore?: number | null }) => {
          const checkOut = r.checkOutDate ? new Date(r.checkOutDate) : null;
          return (r.publicReview || r.guestRating || r.aiSentimentScore !== null) && checkOut && checkOut >= startDate;
        })
        .sort((a: { reviewPostedAt?: string | Date | null; checkOutDate?: string | Date | null }, b: { reviewPostedAt?: string | Date | null; checkOutDate?: string | Date | null }) => {
          const dateA = a.reviewPostedAt ? new Date(a.reviewPostedAt).getTime() : (a.checkOutDate ? new Date(a.checkOutDate).getTime() : 0);
          const dateB = b.reviewPostedAt ? new Date(b.reviewPostedAt).getTime() : (b.checkOutDate ? new Date(b.checkOutDate).getTime() : 0);
          return dateB - dateA;
        });

      const reviewsWithListings = await Promise.all(
        reservationsWithReviews.map(async (reservation: { listingId: string }) => {
          const listing = await storage.getListing(reservation.listingId);
          return { ...reservation, listing };
        })
      );

      res.json(reviewsWithListings);
    } catch (error) {
      logger.error("Reviews", "Error fetching reviews:", error);
      res.status(500).json({ message: "Failed to fetch reviews" });
    }
  });

  app.get("/api/reviews/:days", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const workspaceId = getWorkspaceId(req);
      const days = parseInt(req.params.days as string) || 90;
      const listingIdsParam = (req.params.listingIds as string) || "";
      const listingIds = listingIdsParam ? listingIdsParam.split(",").filter((id: string) => id.trim()) : [];

      if (workspaceId && !(await validateWorkspaceMembership(userId, workspaceId))) {
        return res.status(403).json({ message: "Not a member of this workspace" });
      }

      let validatedListingIds: string[] = [];
      if (listingIds.length > 0) {
        const workspaceListings = workspaceId 
          ? await storage.getListingsByWorkspace(workspaceId)
          : await storage.getListingsByUser(userId);
        const validListingIdSet = new Set(workspaceListings.map((l: { id: string }) => l.id));
        validatedListingIds = listingIds.filter((id: string) => validListingIdSet.has(id));
      }

      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      let reservationsList;
      if (validatedListingIds.length > 0) {
        reservationsList = await storage.getReservationsByListingIds(validatedListingIds);
      } else if (workspaceId) {
        reservationsList = await storage.getReservationsByWorkspace(workspaceId);
      } else {
        reservationsList = await storage.getReservationsByUser(userId);
      }

      const reservationsWithReviews = reservationsList
        .filter((r: { checkOutDate?: string | Date | null; publicReview?: string | null; guestRating?: number | null; aiSentimentScore?: number | null }) => {
          const checkOut = r.checkOutDate ? new Date(r.checkOutDate) : null;
          return (r.publicReview || r.guestRating || r.aiSentimentScore !== null) && checkOut && checkOut >= startDate;
        })
        .sort((a: { reviewPostedAt?: string | Date | null; checkOutDate?: string | Date | null }, b: { reviewPostedAt?: string | Date | null; checkOutDate?: string | Date | null }) => {
          const dateA = a.reviewPostedAt ? new Date(a.reviewPostedAt).getTime() : (a.checkOutDate ? new Date(a.checkOutDate).getTime() : 0);
          const dateB = b.reviewPostedAt ? new Date(b.reviewPostedAt).getTime() : (b.checkOutDate ? new Date(b.checkOutDate).getTime() : 0);
          return dateB - dateA;
        });

      const reviewsWithListings = await Promise.all(
        reservationsWithReviews.map(async (reservation: { listingId: string }) => {
          const listing = await storage.getListing(reservation.listingId);
          return { ...reservation, listing };
        })
      );

      res.json(reviewsWithListings);
    } catch (error) {
      logger.error("Reviews", "Error fetching reviews:", error);
      res.status(500).json({ message: "Failed to fetch reviews" });
    }
  });

  app.post("/api/reviews/generate-summary", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const workspaceId = getWorkspaceId(req);
      const { listingIds = [], days = 90 } = req.body;

      if (!workspaceId) {
        return res.status(400).json({ message: "Workspace ID required" });
      }

      if (!(await validateWorkspaceMembership(userId, workspaceId))) {
        return res.status(403).json({ message: "Not a member of this workspace" });
      }

      let effectiveListingIds = listingIds;
      if (effectiveListingIds.length === 0) {
        const workspaceListings = await storage.getListingsByWorkspace(workspaceId);
        effectiveListingIds = workspaceListings.map((l: { id: string }) => l.id);
      }

      if (effectiveListingIds.length === 0) {
        return res.status(400).json({ message: "No listings found" });
      }

      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const reservationsList = await storage.getReservationsByListingIds(effectiveListingIds);
      const reservationsWithReviews = reservationsList.filter(r => {
        const checkOut = r.checkOutDate ? new Date(r.checkOutDate) : null;
        return (r.publicReview || r.guestRating || r.aiSentimentScore) && checkOut && checkOut >= startDate;
      });

      if (reservationsWithReviews.length === 0) {
        return res.status(400).json({ message: "No reviews found to analyze" });
      }

      const reviewsContext = reservationsWithReviews.map(r => {
        const categoryRatings = r.categoryRatings as { cleanliness?: number; communication?: number; location?: number; checkIn?: number; accuracy?: number; value?: number } | null;
        return {
          guestName: r.guestName,
          overallRating: r.guestRating,
          categoryRatings: categoryRatings ? {
            cleanliness: categoryRatings.cleanliness,
            communication: categoryRatings.communication,
            location: categoryRatings.location,
            checkIn: categoryRatings.checkIn,
            accuracy: categoryRatings.accuracy,
            value: categoryRatings.value,
          } : null,
          publicReview: r.publicReview,
          privateRemarks: r.privateRemarks,
          aiSentimentScore: r.aiSentimentScore,
          platform: r.platform,
        };
      });

      const listingMap = new Map<string, string>();
      for (const listingId of effectiveListingIds) {
        const listing = await storage.getListing(listingId);
        if (listing) listingMap.set(listingId, listing.name);
      }

      const categoryTotals: { [key: string]: { sum: number; count: number } } = {
        cleanliness: { sum: 0, count: 0 },
        communication: { sum: 0, count: 0 },
        location: { sum: 0, count: 0 },
        checkIn: { sum: 0, count: 0 },
        accuracy: { sum: 0, count: 0 },
        value: { sum: 0, count: 0 },
      };
      
      reservationsWithReviews.forEach(r => {
        const cats = r.categoryRatings as { cleanliness?: number; communication?: number; location?: number; checkIn?: number; accuracy?: number; value?: number } | null;
        if (cats) {
          Object.entries(cats).forEach(([key, val]) => {
            if (typeof val === 'number' && categoryTotals[key]) {
              categoryTotals[key].sum += val;
              categoryTotals[key].count += 1;
            }
          });
        }
      });

      const categoryAverages = Object.entries(categoryTotals)
        .filter(([, data]) => data.count > 0)
        .map(([key, data]) => `${key}: ${(data.sum / data.count).toFixed(1)}`)
        .join(', ');

      const reviewsWithRating = reservationsWithReviews.filter(r => r.guestRating !== null && r.guestRating !== undefined);
      const avgRating = reviewsWithRating.length > 0 
        ? (reviewsWithRating.reduce((sum, r) => sum + (r.guestRating || 0), 0) / reviewsWithRating.length).toFixed(1)
        : 'N/A';

      const reviewsWithAiScore = reservationsWithReviews.filter(r => r.aiSentimentScore);
      const avgAiSentiment = reviewsWithAiScore.length > 0
        ? (reviewsWithAiScore.reduce((sum, r) => sum + (r.aiSentimentScore || 0), 0) / reviewsWithAiScore.length).toFixed(1)
        : 'N/A';

      const dbPrompt = await storage.getPromptByName("reviews_summary");
      
      const defaultPromptTemplate = `You are analyzing guest reviews for short-term rental properties. Analyze the following review data thoroughly and identify specific patterns, themes, and actionable insights.

REVIEW DATA INCLUDES:
- Public Reviews: What guests wrote publicly (visible to future guests)
- Private Remarks: Confidential feedback guests shared only with the host
- Overall Rating: 1-5 star rating from guests
- Category Ratings: Specific ratings for cleanliness, communication, location, check-in, accuracy, and value
- AI Sentiment Score: Our AI analysis of the guest experience (0-5 scale)

PROPERTIES ANALYZED: {{propertiesCount}}
TOTAL REVIEWS: {{reviewsCount}}
AVERAGE OVERALL RATING: {{avgRating}} stars (from {{ratedReviewsCount}} rated reviews)
AVERAGE AI SENTIMENT: {{avgAiSentiment}} (from {{aiAnalyzedCount}} analyzed stays)
{{categoryAveragesSection}}

DETAILED REVIEW DATA (showing up to 25 reviews):
{{reviewsData}}

ANALYSIS INSTRUCTIONS:
1. Look for recurring themes in both public reviews AND private remarks
2. Pay attention to specific category ratings that are consistently high or low
3. Identify what guests specifically mention they loved
4. Identify specific issues or complaints, even subtle ones in private remarks
5. Consider the gap between public praise and private concerns

Provide your analysis in this exact JSON format:
{
  "performanceInsight": "A 2-3 sentence summary of overall performance. Be specific about what's working well and any concerns.",
  "strengths": ["Strength 1 - be specific based on actual review content", "Strength 2", "Strength 3", "Strength 4 (if applicable)", "Strength 5 (if applicable)"],
  "areasToImprove": ["Area 1 - be specific and actionable based on review content", "Area 2", "Area 3", "Area 4 (if applicable)", "Area 5 (if applicable)"]
}

IMPORTANT: 
- Always provide at least 3 strengths and 3 areas to improve
- Base your insights on the actual review content provided
- If reviews are mostly positive, look for subtle improvement opportunities in private remarks
- If there are few negative signals, suggest proactive improvements based on category ratings or general hospitality best practices`;

      const promptTemplate = dbPrompt?.promptTemplate || defaultPromptTemplate;
      
      const promptContent = promptTemplate
        .replace('{{propertiesCount}}', String(effectiveListingIds.length))
        .replace('{{reviewsCount}}', String(reservationsWithReviews.length))
        .replace('{{avgRating}}', avgRating)
        .replace('{{ratedReviewsCount}}', String(reviewsWithRating.length))
        .replace('{{avgAiSentiment}}', avgAiSentiment)
        .replace('{{aiAnalyzedCount}}', String(reviewsWithAiScore.length))
        .replace('{{categoryAveragesSection}}', categoryAverages ? `CATEGORY RATING AVERAGES: ${categoryAverages}` : '')
        .replace('{{reviewsData}}', JSON.stringify(reviewsContext.slice(0, 25), null, 2));

      const response = await openai.chat.completions.create({
        model: "gpt-4.1-mini",
        messages: [{ role: "user", content: promptContent }],
        temperature: 0.7,
        response_format: { type: "json_object" },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        return res.status(500).json({ message: "AI returned no response" });
      }

      const result = JSON.parse(content);

      await storage.createAiUsageLog({
        userId,
        label: "reviews_summary_generation",
        model: "gpt-4.1-mini",
        inputTokens: response.usage?.prompt_tokens || 0,
        outputTokens: response.usage?.completion_tokens || 0,
        estimatedCost: ((response.usage?.prompt_tokens || 0) * 0.00015 + (response.usage?.completion_tokens || 0) * 0.0006) / 1000,
      });

      const listingIdsHash = generateListingIdsHash(effectiveListingIds);
      const existingSummary = await storage.getReviewsSummary(workspaceId, listingIdsHash);

      if (existingSummary) {
        await storage.updateReviewsSummary(existingSummary.id, {
          performanceInsight: result.performanceInsight,
          strengths: result.strengths,
          areasToImprove: result.areasToImprove,
          analyzedReservationCount: reservationsWithReviews.length,
          generatedAt: new Date(),
        });
      } else {
        await storage.createReviewsSummary({
          workspaceId,
          listingIds: effectiveListingIds,
          listingIdsHash,
          performanceInsight: result.performanceInsight,
          strengths: result.strengths,
          areasToImprove: result.areasToImprove,
          analyzedReservationCount: reservationsWithReviews.length,
          generatedAt: new Date(),
        });
      }

      res.json({
        success: true,
        ...result,
        reviewsAnalyzed: reservationsWithReviews.length,
      });
    } catch (error) {
      logger.error("Reviews", "Error generating reviews summary:", error);
      res.status(500).json({ message: "Failed to generate reviews summary" });
    }
  });

  app.post("/api/reviews/:reservationId/analyze", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const workspaceId = getWorkspaceId(req);
      const reservationId = getParamId(req.params.reservationId);
      
      if (workspaceId && !(await validateWorkspaceMembership(userId, workspaceId))) {
        return res.status(403).json({ message: "Not a member of this workspace" });
      }
      
      const reservation = await storage.getReservation(reservationId);
      if (!reservation || reservation.userId !== userId) {
        return res.status(404).json({ message: "Reservation not found" });
      }
      
      if (workspaceId && reservation.workspaceId !== workspaceId) {
        return res.status(403).json({ message: "Reservation does not belong to this workspace" });
      }

      const listing = await storage.getListing(reservation.listingId);
      if (!listing) {
        return res.status(404).json({ message: "Listing not found" });
      }

      const conversationText = reservation.conversationHistory
        ?.map(m => `${m.sender}: ${m.message}`)
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
      let analysis;
      try {
        analysis = JSON.parse(analysisText);
      } catch {
        return res.status(500).json({ message: "Failed to parse AI response" });
      }

      await storage.updateReservation(reservationId, {
        aiSentimentScore: analysis.aiSentimentScore,
        aiPublicReviewScore: analysis.aiPublicReviewScore,
        aiPrivateRemarksScore: analysis.aiPrivateRemarksScore,
        aiConversationScore: analysis.aiConversationScore,
        aiGuestSummary: analysis.aiGuestSummary,
        reviewAnalyzedAt: new Date(),
      });

      await storage.createAiUsageLog({
        userId,
        label: "review_analysis",
        model: "gpt-4.1-mini",
        inputTokens: response.usage?.prompt_tokens || 0,
        outputTokens: response.usage?.completion_tokens || 0,
        estimatedCost: ((response.usage?.prompt_tokens || 0) * 0.0004 + (response.usage?.completion_tokens || 0) * 0.0016) / 1000,
        listingId: listing.id,
        listingName: listing.name,
      });

      const updatedReservation = await storage.getReservation(reservationId);
      res.json(updatedReservation);
    } catch (error) {
      logger.error("Reviews", "Error analyzing review:", error);
      res.status(500).json({ message: "Failed to analyze review" });
    }
  });
}

let reviewCheckScheduled = false;

export function scheduleReviewCheck(storage: IStorage) {
  if (reviewCheckScheduled) {
    logger.info("Scheduler", "Review check already scheduled, skipping duplicate registration");
    return;
  }
  reviewCheckScheduled = true;
  
  const INTERVAL_MS = 2 * 60 * 60 * 1000;
  const REVIEW_WINDOW_MS = (14 * 24 + 12) * 60 * 60 * 1000;

  const runCheck = async () => {
    try {
      logger.info("Scheduler", "Running review check for reservations past review window...");
      
      const cutoffDate = new Date(Date.now() - REVIEW_WINDOW_MS);
      
      const eligibleReservations = await storage.getReservationsForReviewCheck(cutoffDate);
      
      logger.info("Scheduler", `Found ${eligibleReservations.length} reservations eligible for analysis without reviews`);
      
      for (const reservation of eligibleReservations) {
        try {
          const listing = await storage.getListing(reservation.listingId);
          if (!listing) continue;
          
          const conversationText = reservation.conversationHistory
            ?.map(m => `${m.sender}: ${m.message}`)
            .join("\n") || "";

          const promptContent = `Analyze this guest stay and provide a comprehensive sentiment analysis.
Note: This reservation has passed the review window without receiving a guest review.

Property: ${listing.name}
Guest: ${reservation.guestName || "Guest"}
Platform: ${reservation.platform}
Check-in: ${reservation.checkInDate}
Check-out: ${reservation.checkOutDate}

Public Review:
No review received (review window expired)

Private Remarks:
${reservation.privateRemarks || "No private remarks"}

Guest Conversation:
${conversationText || "No conversation history"}

Since there is no review, focus on:
1. Analyzing any private remarks and conversation history
2. Inferring guest satisfaction from available data
3. If no data is available, provide neutral scores

Respond in JSON format:
{
  "aiSentimentScore": number,
  "aiPublicReviewScore": null,
  "aiPrivateRemarksScore": number or null,
  "aiConversationScore": number or null,
  "aiGuestSummary": "string"
}`;

          const aiResponse = await openai.chat.completions.create({
            model: "gpt-4.1-mini",
            messages: [
              { role: "system", content: "You are an expert at analyzing guest stays for short-term rental properties. Always respond with valid JSON." },
              { role: "user", content: promptContent }
            ],
            response_format: { type: "json_object" },
            temperature: 0.3,
          });

          const analysisText = aiResponse.choices[0]?.message?.content || "{}";
          const analysis = JSON.parse(analysisText);

          await storage.updateReservation(reservation.id, {
            aiSentimentScore: analysis.aiSentimentScore ?? 3.0,
            aiPublicReviewScore: analysis.aiPublicReviewScore,
            aiPrivateRemarksScore: analysis.aiPrivateRemarksScore,
            aiConversationScore: analysis.aiConversationScore,
            aiGuestSummary: analysis.aiGuestSummary || "No review received; analysis based on available data.",
            reviewAnalyzedAt: new Date(),
          });

          await storage.createAiUsageLog({
            userId: listing.userId,
            label: "scheduled_review_analysis",
            model: "gpt-4.1-mini",
            inputTokens: aiResponse.usage?.prompt_tokens || 0,
            outputTokens: aiResponse.usage?.completion_tokens || 0,
            estimatedCost: ((aiResponse.usage?.prompt_tokens || 0) * 0.0004 + (aiResponse.usage?.completion_tokens || 0) * 0.0016) / 1000,
            listingId: listing.id,
            listingName: listing.name,
          });

          logger.info("Scheduler", `Analyzed reservation ${reservation.id} (no review received)`);
        } catch (error) {
          logger.error("Scheduler", `Failed to analyze reservation ${reservation.id}:`, error);
        }
      }
      
      logger.info("Scheduler", "Review check completed");
    } catch (error) {
      logger.error("Scheduler", "Review check failed:", error);
    }
  };

  runCheck();
  setInterval(runCheck, INTERVAL_MS);
  
  logger.info("Scheduler", "Review check scheduled to run every 2 hours");
}
