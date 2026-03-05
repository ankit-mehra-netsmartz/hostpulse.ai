import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import type { IStorage } from "../storage";
import { lumiTools, type ToolName, type ChartData, type ClarificationRequest } from "./tools";
import { executeToolCall } from "./executor";
import { config } from "../config";

const openai = new OpenAI({
  apiKey: config.openai.apiKey,
  baseURL: config.openai.baseUrl,
});

// Model configuration - using o4-mini for reasoning-enhanced tool selection
const REASONING_MODEL = "o4-mini"; // Reasoning model for complex analysis
const FAST_MODEL = "gpt-4.1-mini"; // Fast model for final response generation

export interface AgentContext {
  storage: IStorage;
  workspaceId: string;
  userId: string;
}

export interface SourceCounts {
  tags: number;
  themes: number;
  reservations: number;
  reviews: number;
  listings: number;
}

export interface StreamCallbacks {
  onThinking: (step: string, status: "in_progress" | "complete", detail?: string) => void;
  onContent: (text: string) => void;
  onChart: (chart: ChartData) => void;
  onClarification: (clarification: ClarificationRequest) => void;
  onFollowUp: (questions: string[]) => void;
  onComplete: (sources: { tools: string[]; dataPoints: number; counts: SourceCounts }) => void;
}

export type { ChartData, ClarificationRequest } from "./tools";

const SYSTEM_PROMPT = `You are Lumi, an expert AI research analyst for HostPulse, a property management analytics platform for short-term rental hosts.

Your role is to provide deep, insightful analysis of guest feedback, identify patterns, and deliver actionable recommendations that help hosts improve their properties and guest experience.

## Your Expertise
- Guest experience optimization and satisfaction analysis
- Property management best practices
- Identifying trends and patterns in feedback data
- Converting feedback into prioritized action items

## Available Tools
- query_reservations: Search bookings with guest info, dates, ratings, reviews
- query_reviews: Deep search of guest reviews and ratings with text search
- query_tags: Search AI-analyzed feedback tags (issues, praise, questions by sentiment)
- query_themes: Get theme groupings that organize feedback into categories
- get_listings: Get property details, amenities, descriptions
- calculate_metrics: Get statistics like sentiment breakdown, rating distribution, top issues
- generate_chart: Create bar, line, pie charts for visual analysis. ALWAYS use this when user requests charts, graphs, or visualizations.
- ask_clarification: Ask user for more context when needed

## CRITICAL: Chart Generation
When users ask for charts, graphs, visualizations, or to "show" data:
1. ALWAYS call generate_chart tool
2. Choose the right chart type:
   - Bar charts: comparisons, rankings, distributions
   - Line charts: trends over time
   - Pie charts: proportions, breakdowns (sentiment, ratings)
   - Area charts: volume trends over time
3. Match dataType to the user's question:
   - "sentiment over time" → sentiment_over_time with line chart
   - "by rating" or "rating breakdown" → reviews_by_rating with bar or pie chart
   - "by sentiment" → tags_by_sentiment with pie chart
   - "trends" → reservations_trend with line or area chart
   - "compare properties" → property_comparison with bar chart
   - "themes" or "categories" → theme_distribution with pie or bar chart

## Data Selection Strategy
Think carefully about which datasets to query:
1. **For complaints/issues**: query_tags with sentiment=["negative"]
2. **For praise/positives**: query_tags with sentiment=["positive"]
3. **For specific topics**: query_tags or query_reviews with searchText
4. **For performance metrics**: calculate_metrics with appropriate metric type
5. **For property info**: get_listings first to understand available properties
6. **For time-based analysis**: Always use dateFrom/dateTo when relevant

## Analysis Approach
1. **Gather comprehensive data first**: ALWAYS use multiple tools to build context before answering. Start with get_listings to understand the properties, then use query_tags for feedback analysis.

2. **Think step by step** (explain your reasoning):
   - First, understand what properties exist
   - Then gather relevant feedback data (tags, reviews)
   - Analyze patterns and themes
   - Formulate insights with supporting evidence

3. **Be specific with evidence**:
   - Quote verbatim guest feedback when making points
   - Cite specific numbers and percentages
   - Reference specific properties by name

4. **Prioritize actionable insights**:
   - Rank issues by frequency and impact
   - Suggest specific fixes, not vague advice
   - Consider effort vs. impact when recommending

5. **Ask clarifying questions** ONLY when truly ambiguous:
   - If there's only one property, assume they mean that one
   - If time period isn't specified, analyze all available data
   - Only clarify when multiple valid interpretations exist

## Response Quality
- Lead with the key insight/answer
- Support with specific data and quotes
- Group related findings together
- End with 2-3 prioritized action items
- Suggest 2-3 natural follow-up questions

## Important
- You have access to REAL guest feedback data - use it extensively
- Don't make up data or give generic advice
- If data is limited, acknowledge it and work with what's available
- Be confident but accurate`;

// Enhanced system prompt for reasoning model that explains its thinking
const REASONING_SYSTEM_PROMPT = `${SYSTEM_PROMPT}

## Reasoning Instructions
You are using extended reasoning to analyze this request. Think through:
1. What is the user really asking for?
2. What data sources will best answer their question?
3. What order should I query them in?
4. Should I generate any charts or visualizations?
5. What insights am I looking for?

Always explain your reasoning as you work through the problem. The user will see your thinking steps, so make them clear and helpful.`;

// Generate a quick workspace context summary for smarter data selection
async function getWorkspaceContext(context: AgentContext): Promise<string> {
  const { storage, workspaceId } = context;
  
  try {
    const [listings, tags, themes, reservations] = await Promise.all([
      storage.getListingsByWorkspace(workspaceId),
      storage.getTagsByWorkspace(workspaceId),
      storage.getThemesByWorkspace(workspaceId),
      storage.getReservationsByWorkspace(workspaceId),
    ]);
    
    const reviews = reservations.filter(r => r.publicReview || r.guestRating);
    const positiveTags = tags.filter(t => t.sentiment === "positive").length;
    const negativeTags = tags.filter(t => t.sentiment === "negative").length;
    
    // Get property names
    const propertyNames = listings.map(l => l.name).filter(Boolean).slice(0, 5);
    
    // Get top themes
    const themeNames = themes.map(t => t.name).filter(Boolean).slice(0, 5);
    
    return `
WORKSPACE DATA OVERVIEW:
- Properties: ${listings.length} (${propertyNames.join(", ")})
- Total Tags: ${tags.length} (${positiveTags} positive, ${negativeTags} negative)
- Themes: ${themes.length} (${themeNames.join(", ")})
- Reservations: ${reservations.length}
- Reviews with ratings: ${reviews.length}

Use this context to make smarter decisions about which data to query.`;
  } catch (error) {
    return "";
  }
}

export async function runAgentQuery(
  prompt: string,
  conversationHistory: ChatCompletionMessageParam[],
  context: AgentContext,
  callbacks: StreamCallbacks
): Promise<string> {
  // Get workspace context to help AI make smarter data selection decisions
  const workspaceContext = await getWorkspaceContext(context);
  
  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: REASONING_SYSTEM_PROMPT + (workspaceContext ? "\n\n" + workspaceContext : "") },
    ...conversationHistory,
    { role: "user", content: prompt }
  ];

  const toolsUsed: string[] = [];
  let totalDataPoints = 0;
  let fullResponse = "";
  let iterationCount = 0;
  const MAX_ITERATIONS = 6;
  const sourceCounts: SourceCounts = { tags: 0, themes: 0, reservations: 0, reviews: 0, listings: 0 };

  // Create a more descriptive initial message based on keywords in the prompt
  const promptLower = prompt.toLowerCase();
  let analysisType = "Understanding your question";
  if (promptLower.includes("chart") || promptLower.includes("graph") || promptLower.includes("visualiz")) {
    analysisType = "Planning data visualization";
  } else if (promptLower.includes("complaint") || promptLower.includes("issue") || promptLower.includes("problem")) {
    analysisType = "Planning issue analysis";
  } else if (promptLower.includes("review")) {
    analysisType = "Planning review analysis";
  } else if (promptLower.includes("positive") || promptLower.includes("praise") || promptLower.includes("good")) {
    analysisType = "Planning positive feedback search";
  } else if (promptLower.includes("trend") || promptLower.includes("over time")) {
    analysisType = "Planning trend analysis";
  } else if (promptLower.includes("compare") || promptLower.includes("property") || promptLower.includes("listing")) {
    analysisType = "Planning property analysis";
  }

  callbacks.onThinking(analysisType, "in_progress");
  
  // Small delay to let the UI render
  await new Promise(resolve => setTimeout(resolve, 300));

  while (iterationCount < MAX_ITERATIONS) {
    iterationCount++;
    
    // Use reasoning model (o4-mini) for first iteration to plan data selection
    // Then use fast model for subsequent iterations
    const modelToUse = iterationCount === 1 ? REASONING_MODEL : FAST_MODEL;
    
    // Use max_completion_tokens for o4-mini (reasoning model), max_tokens for others
    const response = await openai.chat.completions.create({
      model: modelToUse,
      messages,
      tools: lumiTools,
      tool_choice: "auto",
      ...(modelToUse === REASONING_MODEL 
        ? { max_completion_tokens: 2500 } 
        : { max_tokens: 2500 }),
    });

    const message = response.choices[0].message;
    
    // Check for reasoning content from o4-mini and show it as thinking steps
    if (iterationCount === 1 && message.content) {
      // Extract any reasoning the model shared before making tool calls
      const reasoningMatch = message.content.match(/(?:I'll|Let me|First|To answer|I need to|I should|My approach|Strategy:)([^]*?)(?=\n\n|$)/i);
      if (reasoningMatch) {
        const reasoningText = reasoningMatch[0].slice(0, 100).trim();
        if (reasoningText.length > 20) {
          callbacks.onThinking("Reasoning: " + reasoningText + "...", "complete");
          await new Promise(resolve => setTimeout(resolve, 400));
        }
      }
    }
    
    messages.push(message);

    if (message.tool_calls && message.tool_calls.length > 0) {
      callbacks.onThinking(analysisType, "complete");
      
      for (const toolCall of message.tool_calls) {
        const toolCallAny = toolCall as { function: { name: string; arguments: string }; id: string };
        const toolName = toolCallAny.function.name as ToolName;
        const args = JSON.parse(toolCallAny.function.arguments || "{}");
        
        // Show what we're about to search for
        const searchContext = getSearchContext(toolName, args);
        callbacks.onThinking(`${getToolDescription(toolName)}${searchContext}...`, "in_progress");
        
        // Small delay so user can see the step
        await new Promise(resolve => setTimeout(resolve, 400));
        
        const result = await executeToolCall(toolName, args, context);
        toolsUsed.push(toolName);
        
        if (result.result && typeof result.result === "object") {
          const resultObj = result.result as Record<string, unknown>;
          const count = typeof resultObj.count === "number" ? resultObj.count : 0;
          totalDataPoints += count;
          
          // Track counts by tool type
          if (toolName === "query_tags") sourceCounts.tags += count;
          if (toolName === "query_themes") sourceCounts.themes += count;
          if (toolName === "query_reservations") sourceCounts.reservations += count;
          if (toolName === "query_reviews") sourceCounts.reviews += count;
          if (toolName === "get_listings") sourceCounts.listings += count;
          
          if (resultObj.chart) {
            callbacks.onChart(resultObj.chart as ChartData);
          }
          
          if (resultObj.clarification) {
            const clarification = resultObj.clarification as ClarificationRequest;
            callbacks.onClarification(clarification);
            callbacks.onThinking(`${getToolDescription(toolName)}...`, "complete");
            callbacks.onComplete({ tools: toolsUsed, dataPoints: totalDataPoints, counts: sourceCounts });
            return clarification.question;
          }
        }
        
        // Include count in the completion detail
        let completionDetail = result.error ? `Error: ${result.error}` : undefined;
        if (!result.error && result.result && typeof result.result === "object") {
          const resultObj = result.result as Record<string, unknown>;
          const count = typeof resultObj.count === "number" ? resultObj.count : 0;
          if (count > 0) {
            completionDetail = `Found ${count} ${getToolDataType(toolName)}`;
          }
        }
        
        // Small delay so user can see the result
        await new Promise(resolve => setTimeout(resolve, 300));
        callbacks.onThinking(`${getToolDescription(toolName)}...`, "complete", completionDetail);
        
        // Brief pause between steps
        await new Promise(resolve => setTimeout(resolve, 200));
        
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify(result.result)
        });
      }
    } else {
      // Mark understanding complete before generating response
      callbacks.onThinking(analysisType, "complete");
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Show an analysis step if we have data
      if (totalDataPoints > 0) {
        callbacks.onThinking("Analyzing patterns & insights...", "in_progress");
        await new Promise(resolve => setTimeout(resolve, 500));
        callbacks.onThinking("Analyzing patterns & insights...", "complete", `Processing ${totalDataPoints} data points`);
        await new Promise(resolve => setTimeout(resolve, 300));
      }
      
      callbacks.onThinking("Writing your answer...", "in_progress");
      
      const stream = await openai.chat.completions.create({
        model: FAST_MODEL,
        messages,
        stream: true,
        max_tokens: 1800,
      });

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || "";
        if (content) {
          fullResponse += content;
          // Send content character by character for typing effect
          for (const char of content) {
            callbacks.onContent(char);
            // Tiny delay for visible typing effect (15ms per character = ~66 chars/sec)
            await new Promise(resolve => setTimeout(resolve, 15));
          }
        }
      }
      
      callbacks.onThinking("Writing your answer...", "complete");
      
      const followUpQuestions = extractFollowUpQuestions(fullResponse);
      if (followUpQuestions.length > 0) {
        callbacks.onFollowUp(followUpQuestions);
      }
      
      callbacks.onComplete({ tools: toolsUsed, dataPoints: totalDataPoints, counts: sourceCounts });
      break;
    }
  }

  // Fallback if max iterations reached without generating a response
  if (!fullResponse && iterationCount >= MAX_ITERATIONS) {
    const fallbackMessage = "I was still gathering data when I reached my processing limit. Could you try asking a more specific question?";
    callbacks.onContent(fallbackMessage);
    callbacks.onComplete({ tools: toolsUsed, dataPoints: totalDataPoints, counts: sourceCounts });
    return fallbackMessage;
  }

  return fullResponse;
}

function getToolDescription(toolName: ToolName): string {
  const descriptions: Record<ToolName, string> = {
    query_reservations: "Searching guest stays",
    query_reviews: "Analyzing guest reviews",
    query_tags: "Searching feedback & issues",
    query_themes: "Loading feedback categories",
    get_listings: "Loading your properties",
    calculate_metrics: "Crunching the numbers",
    generate_chart: "Building visualization",
    ask_clarification: "Need more details",
  };
  return descriptions[toolName] || "Processing";
}

function getToolDataType(toolName: ToolName): string {
  const dataTypes: Record<ToolName, string> = {
    query_reservations: "guest stays",
    query_reviews: "reviews",
    query_tags: "feedback items",
    query_themes: "categories",
    get_listings: "properties",
    calculate_metrics: "data points",
    generate_chart: "chart data",
    ask_clarification: "",
  };
  return dataTypes[toolName] || "items";
}

function getSearchContext(toolName: ToolName, args: Record<string, unknown>): string {
  // Add context about what specifically is being searched
  const parts: string[] = [];
  
  if (args.sentiment) {
    const sentiments = Array.isArray(args.sentiment) ? args.sentiment : [args.sentiment];
    if (sentiments.includes("negative")) parts.push("negative");
    if (sentiments.includes("positive")) parts.push("positive");
  }
  
  if (args.query && typeof args.query === "string" && args.query.length > 0) {
    const shortQuery = args.query.slice(0, 25) + (args.query.length > 25 ? "..." : "");
    parts.push(`"${shortQuery}"`);
  }
  
  if (args.minRating !== undefined || args.maxRating !== undefined) {
    const min = args.minRating ?? 1;
    const max = args.maxRating ?? 5;
    parts.push(`${min}-${max} stars`);
  }
  
  if (parts.length > 0) {
    return ` (${parts.join(", ")})`;
  }
  return "";
}

function extractFollowUpQuestions(response: string): string[] {
  const questions: string[] = [];
  
  const questionPattern = /(?:\d+\.|\-|\•)\s*([^\n]+\?)/g;
  let match: RegExpExecArray | null;
  
  while ((match = questionPattern.exec(response)) !== null) {
    const text = match[1] || match[0];
    const cleaned = text.replace(/^(?:\d+\.|\-|\•)\s*/, "").trim();
    if (cleaned.endsWith("?") && cleaned.length > 10 && cleaned.length < 200) {
      questions.push(cleaned);
    }
  }
  
  return questions.slice(0, 3);
}
