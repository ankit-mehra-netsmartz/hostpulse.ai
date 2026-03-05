import type { IStorage } from "../storage";
import type { ToolName, ToolCallResult, ChartData, ClarificationRequest } from "./tools";
import type { Reservation } from "@shared/schema";

interface ExecutorContext {
  storage: IStorage;
  workspaceId: string;
  userId: string;
}

export async function executeToolCall(
  toolName: ToolName,
  args: Record<string, unknown>,
  context: ExecutorContext
): Promise<ToolCallResult> {
  const { storage, workspaceId } = context;

  try {
    switch (toolName) {
      case "query_reservations": {
        let reservations = await storage.getReservationsByWorkspace(workspaceId);
        
        if (args.listingIds && Array.isArray(args.listingIds)) {
          reservations = reservations.filter(r => (args.listingIds as string[]).includes(r.listingId || ""));
        }
        if (args.dateFrom) {
          const from = new Date(args.dateFrom as string);
          reservations = reservations.filter(r => r.checkInDate && new Date(r.checkInDate) >= from);
        }
        if (args.dateTo) {
          const to = new Date(args.dateTo as string);
          reservations = reservations.filter(r => r.checkInDate && new Date(r.checkInDate) <= to);
        }
        if (args.status) {
          reservations = reservations.filter(r => r.status === args.status);
        }
        if (args.guestName) {
          const search = (args.guestName as string).toLowerCase();
          reservations = reservations.filter(r => 
            r.guestName?.toLowerCase().includes(search) || 
            r.guestEmail?.toLowerCase().includes(search)
          );
        }
        
        const limit = (args.limit as number) || 50;
        reservations = reservations.slice(0, limit);
        
        return {
          name: toolName,
          result: {
            count: reservations.length,
            reservations: reservations.map(r => ({
              id: r.id,
              guestName: r.guestName,
              listingId: r.listingId,
              checkInDate: r.checkInDate,
              checkOutDate: r.checkOutDate,
              status: r.status,
              platform: r.platform,
              guestRating: r.guestRating,
            }))
          }
        };
      }

      case "query_reviews": {
        let reservations = await storage.getReservationsByWorkspace(workspaceId);
        let reviews = reservations.filter(r => r.publicReview || r.guestRating);
        
        if (args.listingIds && Array.isArray(args.listingIds)) {
          reviews = reviews.filter((r: Reservation) => (args.listingIds as string[]).includes(r.listingId || ""));
        }
        if (args.minRating !== undefined) {
          reviews = reviews.filter((r: Reservation) => (r.guestRating || 0) >= (args.minRating as number));
        }
        if (args.maxRating !== undefined) {
          reviews = reviews.filter((r: Reservation) => (r.guestRating || 0) <= (args.maxRating as number));
        }
        if (args.searchText) {
          const search = (args.searchText as string).toLowerCase();
          reviews = reviews.filter((r: Reservation) => 
            r.publicReview?.toLowerCase().includes(search) ||
            r.privateRemarks?.toLowerCase().includes(search)
          );
        }
        if (args.dateFrom) {
          const from = new Date(args.dateFrom as string);
          reviews = reviews.filter((r: Reservation) => r.reviewPostedAt && new Date(r.reviewPostedAt) >= from);
        }
        if (args.dateTo) {
          const to = new Date(args.dateTo as string);
          reviews = reviews.filter((r: Reservation) => r.reviewPostedAt && new Date(r.reviewPostedAt) <= to);
        }
        
        const limit = (args.limit as number) || 50;
        reviews = reviews.slice(0, limit);
        
        return {
          name: toolName,
          result: {
            count: reviews.length,
            reviews: reviews.map((r: Reservation) => ({
              id: r.id,
              listingId: r.listingId,
              guestName: r.guestName,
              rating: r.guestRating,
              publicReview: r.publicReview?.slice(0, 500),
              privateRemarks: r.privateRemarks?.slice(0, 300),
              reviewDate: r.reviewPostedAt,
              aiSentimentScore: r.aiSentimentScore,
            }))
          }
        };
      }

      case "query_tags": {
        let tags = await storage.getTagsByWorkspace(workspaceId);
        
        if (args.listingIds && Array.isArray(args.listingIds)) {
          tags = tags.filter(t => (args.listingIds as string[]).includes(t.listingId || ""));
        }
        if (args.sentiment && Array.isArray(args.sentiment)) {
          tags = tags.filter(t => (args.sentiment as string[]).includes(t.sentiment || ""));
        }
        if (args.themeId) {
          tags = tags.filter(t => t.themeId === args.themeId);
        }
        if (args.searchText) {
          const search = (args.searchText as string).toLowerCase();
          tags = tags.filter(t => 
            t.name?.toLowerCase().includes(search) ||
            t.summary?.toLowerCase().includes(search) ||
            t.verbatimEvidence?.toLowerCase().includes(search)
          );
        }
        
        const limit = (args.limit as number) || 100;
        tags = tags.slice(0, limit);
        
        return {
          name: toolName,
          result: {
            count: tags.length,
            sentimentBreakdown: {
              positive: tags.filter(t => t.sentiment === "positive").length,
              negative: tags.filter(t => t.sentiment === "negative").length,
              neutral: tags.filter(t => t.sentiment === "neutral").length,
              question: tags.filter(t => t.sentiment === "question").length,
            },
            tags: tags.map(t => ({
              id: t.id,
              name: t.name,
              sentiment: t.sentiment,
              summary: t.summary,
              verbatimEvidence: t.verbatimEvidence?.slice(0, 300),
              listingId: t.listingId,
              themeId: t.themeId,
            }))
          }
        };
      }

      case "query_themes": {
        let themes = await storage.getThemesByWorkspace(workspaceId);
        
        if (args.searchText) {
          const search = (args.searchText as string).toLowerCase();
          themes = themes.filter(t => 
            t.name?.toLowerCase().includes(search) ||
            t.description?.toLowerCase().includes(search)
          );
        }
        
        const limit = (args.limit as number) || 20;
        themes = themes.slice(0, limit);
        
        const themesWithCounts = await Promise.all(
          themes.map(async theme => {
            const tags = await storage.getTagsByTheme(theme.id);
            return {
              id: theme.id,
              name: theme.name,
              description: theme.description,
              tagCount: tags.length,
              sentimentBreakdown: {
                positive: tags.filter(t => t.sentiment === "positive").length,
                negative: tags.filter(t => t.sentiment === "negative").length,
                neutral: tags.filter(t => t.sentiment === "neutral").length,
              }
            };
          })
        );
        
        return {
          name: toolName,
          result: {
            count: themesWithCounts.length,
            themes: themesWithCounts
          }
        };
      }

      case "get_listings": {
        let listings = await storage.getListingsByWorkspace(workspaceId);
        
        if (args.listingIds && Array.isArray(args.listingIds)) {
          listings = listings.filter(l => (args.listingIds as string[]).includes(l.id));
        }
        if (args.searchText) {
          const search = (args.searchText as string).toLowerCase();
          listings = listings.filter(l => l.name?.toLowerCase().includes(search));
        }
        
        return {
          name: toolName,
          result: {
            count: listings.length,
            listings: listings.map(l => ({
              id: l.id,
              name: l.name,
              address: l.address,
              imageUrl: l.imageUrl,
              bedrooms: l.bedrooms,
              bathrooms: l.bathrooms,
            }))
          }
        };
      }

      case "calculate_metrics": {
        const metric = args.metric as string;
        let result: unknown;
        
        switch (metric) {
          case "sentiment_breakdown": {
            let tags = await storage.getTagsByWorkspace(workspaceId);
            if (args.listingIds && Array.isArray(args.listingIds)) {
              tags = tags.filter(t => (args.listingIds as string[]).includes(t.listingId || ""));
            }
            result = {
              total: tags.length,
              positive: tags.filter(t => t.sentiment === "positive").length,
              negative: tags.filter(t => t.sentiment === "negative").length,
              neutral: tags.filter(t => t.sentiment === "neutral").length,
              question: tags.filter(t => t.sentiment === "question").length,
              positivePercent: tags.length > 0 ? Math.round((tags.filter(t => t.sentiment === "positive").length / tags.length) * 100) : 0,
              negativePercent: tags.length > 0 ? Math.round((tags.filter(t => t.sentiment === "negative").length / tags.length) * 100) : 0,
            };
            break;
          }
          case "rating_distribution": {
            const reservations = await storage.getReservationsByWorkspace(workspaceId);
            let reviews = reservations.filter(r => r.guestRating);
            if (args.listingIds && Array.isArray(args.listingIds)) {
              reviews = reviews.filter((r: Reservation) => (args.listingIds as string[]).includes(r.listingId || ""));
            }
            const distribution = [1, 2, 3, 4, 5].map(rating => ({
              rating,
              count: reviews.filter((r: Reservation) => Math.round(r.guestRating || 0) === rating).length
            }));
            const avgRating = reviews.length > 0 
              ? reviews.reduce((sum: number, r: Reservation) => sum + (r.guestRating || 0), 0) / reviews.length 
              : 0;
            result = {
              totalReviews: reviews.length,
              averageRating: avgRating.toFixed(1),
              distribution
            };
            break;
          }
          case "top_issues": {
            let tags = await storage.getTagsByWorkspace(workspaceId);
            tags = tags.filter(t => t.sentiment === "negative");
            if (args.listingIds && Array.isArray(args.listingIds)) {
              tags = tags.filter(t => (args.listingIds as string[]).includes(t.listingId || ""));
            }
            const issueCount = new Map<string, { count: number; samples: string[] }>();
            for (const tag of tags) {
              const name = tag.name || "Unknown";
              const current = issueCount.get(name) || { count: 0, samples: [] };
              current.count++;
              if (current.samples.length < 3 && tag.verbatimEvidence) {
                current.samples.push(tag.verbatimEvidence.slice(0, 150));
              }
              issueCount.set(name, current);
            }
            const sorted = Array.from(issueCount.entries())
              .sort((a, b) => b[1].count - a[1].count)
              .slice(0, 10);
            result = {
              issues: sorted.map(([name, data]) => ({ name, count: data.count, samples: data.samples }))
            };
            break;
          }
          case "top_praise": {
            let tags = await storage.getTagsByWorkspace(workspaceId);
            tags = tags.filter(t => t.sentiment === "positive");
            if (args.listingIds && Array.isArray(args.listingIds)) {
              tags = tags.filter(t => (args.listingIds as string[]).includes(t.listingId || ""));
            }
            const praiseCount = new Map<string, { count: number; samples: string[] }>();
            for (const tag of tags) {
              const name = tag.name || "Unknown";
              const current = praiseCount.get(name) || { count: 0, samples: [] };
              current.count++;
              if (current.samples.length < 3 && tag.verbatimEvidence) {
                current.samples.push(tag.verbatimEvidence.slice(0, 150));
              }
              praiseCount.set(name, current);
            }
            const sorted = Array.from(praiseCount.entries())
              .sort((a, b) => b[1].count - a[1].count)
              .slice(0, 10);
            result = {
              praise: sorted.map(([name, data]) => ({ name, count: data.count, samples: data.samples }))
            };
            break;
          }
          case "property_comparison": {
            const listings = await storage.getListingsByWorkspace(workspaceId);
            const tags = await storage.getTagsByWorkspace(workspaceId);
            const reservations = await storage.getReservationsByWorkspace(workspaceId);
            const reviews = reservations.filter(r => r.guestRating);
            
            result = {
              properties: listings.map(listing => {
                const listingTags = tags.filter(t => t.listingId === listing.id);
                const listingReviews = reviews.filter((r: Reservation) => r.listingId === listing.id);
                const avgRating = listingReviews.length > 0
                  ? listingReviews.reduce((sum: number, r: Reservation) => sum + (r.guestRating || 0), 0) / listingReviews.length
                  : 0;
                return {
                  id: listing.id,
                  name: listing.name,
                  reviewCount: listingReviews.length,
                  avgRating: avgRating.toFixed(1),
                  positiveTags: listingTags.filter(t => t.sentiment === "positive").length,
                  negativeTags: listingTags.filter(t => t.sentiment === "negative").length,
                };
              })
            };
            break;
          }
          default:
            result = { error: `Unknown metric: ${metric}` };
        }
        
        return {
          name: toolName,
          result
        };
      }

      case "generate_chart": {
        const chartType = args.chartType as ChartData["chartType"];
        const dataType = args.dataType as string;
        const title = (args.title as string) || dataType.replace(/_/g, " ");
        
        let chartData: ChartData["data"] = [];
        
        switch (dataType) {
          case "sentiment_over_time": {
            const tags = await storage.getTagsByWorkspace(workspaceId);
            const monthlyData = new Map<string, { positive: number; negative: number; neutral: number }>();
            
            for (const tag of tags) {
              const date = tag.createdAt ? new Date(tag.createdAt) : new Date();
              const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
              const current = monthlyData.get(monthKey) || { positive: 0, negative: 0, neutral: 0 };
              if (tag.sentiment === "positive") current.positive++;
              else if (tag.sentiment === "negative") current.negative++;
              else current.neutral++;
              monthlyData.set(monthKey, current);
            }
            
            chartData = Array.from(monthlyData.entries())
              .sort((a, b) => a[0].localeCompare(b[0]))
              .slice(-12)
              .map(([month, data]) => ({
                name: month,
                value: data.positive - data.negative,
                positive: data.positive,
                negative: data.negative,
                neutral: data.neutral,
              }));
            break;
          }
          case "reviews_by_rating": {
            const reservations = await storage.getReservationsByWorkspace(workspaceId);
            const reviews = reservations.filter(r => r.guestRating);
            chartData = [1, 2, 3, 4, 5].map(rating => ({
              name: `${rating} Star`,
              value: reviews.filter((r: Reservation) => Math.round(r.guestRating || 0) === rating).length,
            }));
            break;
          }
          case "tags_by_sentiment": {
            const tags = await storage.getTagsByWorkspace(workspaceId);
            chartData = [
              { name: "Positive", value: tags.filter(t => t.sentiment === "positive").length },
              { name: "Negative", value: tags.filter(t => t.sentiment === "negative").length },
              { name: "Neutral", value: tags.filter(t => t.sentiment === "neutral").length },
              { name: "Questions", value: tags.filter(t => t.sentiment === "question").length },
            ];
            break;
          }
          case "theme_distribution": {
            const themes = await storage.getThemesByWorkspace(workspaceId);
            const themesWithCounts = await Promise.all(
              themes.slice(0, 10).map(async theme => {
                const tags = await storage.getTagsByTheme(theme.id);
                return { name: theme.name || "Unknown", value: tags.length };
              })
            );
            chartData = themesWithCounts.sort((a, b) => b.value - a.value);
            break;
          }
          case "property_comparison": {
            const listings = await storage.getListingsByWorkspace(workspaceId);
            const reservations = await storage.getReservationsByWorkspace(workspaceId);
            const reviews = reservations.filter(r => r.guestRating);
            
            chartData = listings.map(listing => {
              const listingReviews = reviews.filter((r: Reservation) => r.listingId === listing.id);
              const avgRating = listingReviews.length > 0
                ? listingReviews.reduce((sum: number, r: Reservation) => sum + (r.guestRating || 0), 0) / listingReviews.length
                : 0;
              return {
                name: listing.name?.slice(0, 20) || "Unknown",
                value: Math.round(avgRating * 10) / 10,
                reviewCount: listingReviews.length,
              };
            });
            break;
          }
          case "reservations_trend": {
            const reservations = await storage.getReservationsByWorkspace(workspaceId);
            const monthlyData = new Map<string, number>();
            
            for (const res of reservations) {
              const date = res.checkInDate ? new Date(res.checkInDate) : (res.createdAt ? new Date(res.createdAt) : new Date());
              const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
              monthlyData.set(monthKey, (monthlyData.get(monthKey) || 0) + 1);
            }
            
            chartData = Array.from(monthlyData.entries())
              .sort((a, b) => a[0].localeCompare(b[0]))
              .slice(-12)
              .map(([month, count]) => ({
                name: month,
                value: count,
              }));
            break;
          }
          default:
            chartData = [];
        }
        
        const chart: ChartData = {
          chartType,
          title,
          data: chartData,
          xAxisKey: "name",
          yAxisKey: "value",
          colors: ["#10b981", "#ef4444", "#6b7280", "#3b82f6"],
        };
        
        return {
          name: toolName,
          result: { chart }
        };
      }

      case "ask_clarification": {
        const clarification: ClarificationRequest = {
          question: args.question as string,
          options: args.options as string[] | undefined,
          context: args.context as string | undefined,
        };
        
        return {
          name: toolName,
          result: { clarification }
        };
      }

      default:
        return {
          name: toolName,
          result: null,
          error: `Unknown tool: ${toolName}`
        };
    }
  } catch (error) {
    return {
      name: toolName,
      result: null,
      error: error instanceof Error ? error.message : "Unknown error"
    };
  }
}
