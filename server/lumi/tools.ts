import type { ChatCompletionTool } from "openai/resources/chat/completions";

export const lumiTools: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "query_reservations",
      description: "Search and filter reservations/bookings. Use when the user asks about bookings, stays, guests, check-ins/check-outs, or wants to analyze reservation patterns.",
      parameters: {
        type: "object",
        properties: {
          listingIds: {
            type: "array",
            items: { type: "string" },
            description: "Filter by specific listing IDs"
          },
          dateFrom: {
            type: "string",
            description: "Start date for filtering (ISO format)"
          },
          dateTo: {
            type: "string",
            description: "End date for filtering (ISO format)"
          },
          status: {
            type: "string",
            enum: ["accepted", "cancelled", "expired", "denied"],
            description: "Filter by reservation status. Most reservations are 'accepted'. Do NOT filter by status unless specifically asked - leave empty to get all reservations."
          },
          guestName: {
            type: "string",
            description: "Search by guest name"
          },
          limit: {
            type: "number",
            description: "Max number of results to return (default 50)"
          }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "query_reviews",
      description: "Search and filter guest reviews. Use when the user asks about reviews, ratings, guest feedback, or star ratings.",
      parameters: {
        type: "object",
        properties: {
          listingIds: {
            type: "array",
            items: { type: "string" },
            description: "Filter by specific listing IDs"
          },
          minRating: {
            type: "number",
            description: "Minimum star rating (1-5)"
          },
          maxRating: {
            type: "number",
            description: "Maximum star rating (1-5)"
          },
          searchText: {
            type: "string",
            description: "Search in review text"
          },
          dateFrom: {
            type: "string",
            description: "Start date for filtering (ISO format)"
          },
          dateTo: {
            type: "string",
            description: "End date for filtering (ISO format)"
          },
          limit: {
            type: "number",
            description: "Max number of results to return (default 50)"
          }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "query_tags",
      description: "Search AI-generated tags from guest feedback analysis. Tags represent specific topics, issues, or praise points extracted from reviews and conversations. Use for analyzing sentiment, common complaints, praise, or specific topics.",
      parameters: {
        type: "object",
        properties: {
          listingIds: {
            type: "array",
            items: { type: "string" },
            description: "Filter by specific listing IDs"
          },
          sentiment: {
            type: "array",
            items: { 
              type: "string",
              enum: ["positive", "negative", "neutral", "question"]
            },
            description: "Filter by sentiment type"
          },
          themeId: {
            type: "string",
            description: "Filter by specific theme ID"
          },
          searchText: {
            type: "string",
            description: "Search in tag name, summary, or evidence"
          },
          limit: {
            type: "number",
            description: "Max number of results to return (default 100)"
          }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "query_themes",
      description: "Get themes which are groupings of related tags. Themes help identify major patterns and areas of concern or praise across properties.",
      parameters: {
        type: "object",
        properties: {
          listingIds: {
            type: "array",
            items: { type: "string" },
            description: "Filter by specific listing IDs"
          },
          searchText: {
            type: "string",
            description: "Search in theme name or description"
          },
          limit: {
            type: "number",
            description: "Max number of results to return (default 20)"
          }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_listings",
      description: "Get information about properties/listings. Use when user asks about specific properties, wants to compare properties, or needs listing details.",
      parameters: {
        type: "object",
        properties: {
          listingIds: {
            type: "array",
            items: { type: "string" },
            description: "Get specific listings by ID"
          },
          searchText: {
            type: "string",
            description: "Search by listing name"
          }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "calculate_metrics",
      description: "Calculate aggregate metrics and statistics. Use for getting counts, averages, percentages, comparisons, and trends.",
      parameters: {
        type: "object",
        properties: {
          metric: {
            type: "string",
            enum: [
              "sentiment_breakdown",
              "rating_distribution", 
              "reviews_by_property",
              "tags_by_theme",
              "reservations_by_month",
              "top_issues",
              "top_praise",
              "property_comparison"
            ],
            description: "The type of metric to calculate"
          },
          listingIds: {
            type: "array",
            items: { type: "string" },
            description: "Filter by specific listing IDs"
          },
          dateFrom: {
            type: "string",
            description: "Start date for filtering (ISO format)"
          },
          dateTo: {
            type: "string",
            description: "End date for filtering (ISO format)"
          },
          groupBy: {
            type: "string",
            enum: ["listing", "month", "theme", "sentiment"],
            description: "How to group the results"
          }
        },
        required: ["metric"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "generate_chart",
      description: "Generate chart data for visualization. Use when the user asks for graphs, charts, trends, comparisons, or visual representations of data.",
      parameters: {
        type: "object",
        properties: {
          chartType: {
            type: "string",
            enum: ["bar", "line", "pie", "area"],
            description: "Type of chart to generate"
          },
          dataType: {
            type: "string",
            enum: [
              "sentiment_over_time",
              "reviews_by_rating",
              "tags_by_sentiment",
              "reservations_trend",
              "property_comparison",
              "theme_distribution"
            ],
            description: "What data to visualize"
          },
          listingIds: {
            type: "array",
            items: { type: "string" },
            description: "Filter by specific listing IDs"
          },
          dateFrom: {
            type: "string",
            description: "Start date (ISO format)"
          },
          dateTo: {
            type: "string",
            description: "End date (ISO format)"
          },
          title: {
            type: "string",
            description: "Chart title"
          }
        },
        required: ["chartType", "dataType"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "ask_clarification",
      description: "Ask the user a clarifying question when their query is ambiguous or more context is needed. Use this when you need to know: which properties they're asking about, what time period, what specific aspect they want to analyze, or to offer choices between different analysis approaches.",
      parameters: {
        type: "object",
        properties: {
          question: {
            type: "string",
            description: "The clarifying question to ask"
          },
          options: {
            type: "array",
            items: { type: "string" },
            description: "Optional list of suggested answers the user can choose from"
          },
          context: {
            type: "string",
            description: "Brief explanation of why you're asking this question"
          }
        },
        required: ["question"]
      }
    }
  }
];

export type ToolName = 
  | "query_reservations"
  | "query_reviews" 
  | "query_tags"
  | "query_themes"
  | "get_listings"
  | "calculate_metrics"
  | "generate_chart"
  | "ask_clarification";

export interface ToolCallResult {
  name: ToolName;
  result: unknown;
  error?: string;
}

export interface ChartData {
  chartType: "bar" | "line" | "pie" | "area";
  title: string;
  data: Array<{ name: string; value: number; [key: string]: string | number }>;
  xAxisKey?: string;
  yAxisKey?: string;
  colors?: string[];
}

export interface ClarificationRequest {
  question: string;
  options?: string[];
  context?: string;
}
