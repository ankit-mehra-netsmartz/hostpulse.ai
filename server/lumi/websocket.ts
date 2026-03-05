import { WebSocket } from "ws";
import { runAgentQuery } from "./agent";
import type { StreamCallbacks, SourceCounts, ChartData, ClarificationRequest } from "./agent";
import { DatabaseStorage } from "../storage";
import crypto from "crypto";
import { logger } from "../logger";

interface LumiRequest {
  type: "query";
  prompt: string;
  workspaceId: string;
  conversationId?: string;
  viewId?: string;
  textMatchOnly?: boolean;
}

interface LumiResponse {
  type: "thinking" | "content" | "chart" | "clarification" | "followup" | "sources" | "complete" | "error" | "conversation";
  data: unknown;
}

const storage = new DatabaseStorage();

export function setupLumiWebSocket(ws: WebSocket, authenticatedUserId: string) {
  ws.on("message", async (message: Buffer) => {
    try {
      const request: LumiRequest = JSON.parse(message.toString());
      
      if (request.type === "query") {
        // Validate workspace membership before processing
        const membership = await storage.getWorkspaceMember(request.workspaceId, authenticatedUserId);
        if (!membership) {
          logger.info('Lumi WS', `Access denied: User ${authenticatedUserId} not member of workspace ${request.workspaceId}`);
          sendMessage(ws, { type: "error", data: { message: "Access denied: Not a workspace member" } });
          return;
        }
        
        logger.info('Lumi WS', `Workspace membership validated for user ${authenticatedUserId}`);
        await handleLumiQuery(ws, request, authenticatedUserId);
      }
    } catch (error) {
      logger.error('Lumi WS', 'WebSocket message error:', error);
      sendMessage(ws, { type: "error", data: { message: "Failed to process request" } });
    }
  });

  ws.on("error", (error) => {
    logger.error('Lumi WS', 'WebSocket error:', error);
  });
}

function sendMessage(ws: WebSocket, response: LumiResponse) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(response));
  }
}

async function handleLumiQuery(ws: WebSocket, request: LumiRequest, userId: string) {
  const { prompt, workspaceId, conversationId } = request;

  // Log the query (userId is now authenticated from session)
  logger.info('Lumi WS', `User: ${userId} Workspace: ${workspaceId}`);
  
  const activeConversationId = conversationId || crypto.randomUUID();
  sendMessage(ws, { type: "conversation", data: { conversationId: activeConversationId } });

  let conversationHistory: { role: "user" | "assistant"; content: string }[] = [];
  if (conversationId) {
    const previousQueries = await storage.getLumiQueriesByConversation(conversationId);
    conversationHistory = previousQueries.flatMap(q => [
      { role: "user" as const, content: q.prompt },
      { role: "assistant" as const, content: q.response || "" }
    ]);
  }

  const thinkingSteps: { step: string; status: "in_progress" | "complete"; detail?: string }[] = [];
  const charts: ChartData[] = [];
  let clarification: ClarificationRequest | null = null;
  const followUpQuestions: string[] = [];
  let finalSources: { tools: string[]; dataPoints: number; counts: SourceCounts } = { 
    tools: [], 
    dataPoints: 0, 
    counts: { tags: 0, themes: 0, reservations: 0, reviews: 0, listings: 0 } 
  };

  const callbacks: StreamCallbacks = {
    onThinking: (step, status, detail) => {
      thinkingSteps.push({ step, status, detail });
      sendMessage(ws, { type: "thinking", data: { step, status, detail } });
    },
    onContent: (text) => {
      sendMessage(ws, { type: "content", data: { text } });
    },
    onChart: (chart) => {
      charts.push(chart);
      sendMessage(ws, { type: "chart", data: chart });
    },
    onClarification: (clarify) => {
      clarification = clarify;
      sendMessage(ws, { type: "clarification", data: clarify });
    },
    onFollowUp: (questions) => {
      followUpQuestions.push(...questions);
      sendMessage(ws, { type: "followup", data: { questions } });
    },
    onComplete: (sources) => {
      finalSources = sources;
      sendMessage(ws, { type: "sources", data: sources });
    }
  };

  try {
    const fullResponse = await runAgentQuery(
      prompt,
      conversationHistory,
      { storage, workspaceId, userId },
      callbacks
    );

    const sources = {
      reservations: finalSources.counts.reservations,
      reviews: finalSources.counts.reviews,
      tags: finalSources.counts.tags,
      themes: finalSources.counts.themes,
      listings: finalSources.counts.listings,
    };

    const savedQuery = await storage.createLumiQuery({
      userId,
      workspaceId,
      conversationId: activeConversationId,
      prompt,
      response: fullResponse,
      responseType: clarification ? "clarification" : charts.length > 0 ? "chart" : "text",
      sources,
      thinkingSteps: thinkingSteps.map(t => ({ 
        step: t.step, 
        status: (t.status === "in_progress" ? "pending" : "complete") as "pending" | "complete",
        detail: t.detail
      })),
    });

    sendMessage(ws, { 
      type: "complete", 
      data: { 
        id: savedQuery.id,
        conversationId: activeConversationId,
      } 
    });
  } catch (error) {
    logger.error('Lumi WS', 'Error processing Lumi query via WebSocket:', error);
    sendMessage(ws, { type: "error", data: { message: "Failed to process query" } });
  }
}
