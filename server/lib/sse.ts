import type { Response, Request } from "express";
import { logger } from "../logger";

export interface SSEOptions {
  heartbeatInterval?: number;
  usePadding?: boolean;
  useEventNames?: boolean;
}

export interface SSEConnection {
  sendEvent: (eventOrData: string | object, data?: unknown) => void;
  sendData: (data: object) => void;
  close: () => void;
  isConnected: () => boolean;
  heartbeatInterval: NodeJS.Timeout | null;
}

const PADDING = " ".repeat(2048);

export function setupSSE(
  req: Request,
  res: Response,
  options: SSEOptions = {}
): SSEConnection {
  const {
    heartbeatInterval = 15000,
    usePadding = false,
    useEventNames = false,
  } = options;

  let isClientConnected = true;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  req.on("close", () => {
    isClientConnected = false;
  });

  const sendEvent = (eventOrData: string | object, data?: unknown) => {
    if (!isClientConnected) return;
    
    try {
      if (useEventNames && typeof eventOrData === "string" && data !== undefined) {
        const payload = `event: ${eventOrData}\ndata: ${JSON.stringify(data)}\n\n`;
        if (usePadding) {
          res.write(`${payload}:${PADDING}\n\n`);
        } else {
          res.write(payload);
        }
      } else {
        const payload = `data: ${JSON.stringify(eventOrData)}\n\n`;
        if (usePadding) {
          res.write(`${payload}:${PADDING}\n\n`);
        } else {
          res.write(payload);
        }
      }
      
      if (usePadding && typeof (res as any).flush === "function") {
        (res as any).flush();
      }
    } catch (error) {
      logger.error('SSE', 'Error sending event:', error);
    }
  };

  const sendData = (data: object) => {
    sendEvent(data);
  };

  const interval = heartbeatInterval > 0
    ? setInterval(() => {
        if (isClientConnected) {
          sendEvent({ type: "heartbeat" });
        }
      }, heartbeatInterval)
    : null;

  const close = () => {
    if (interval) {
      clearInterval(interval);
    }
    if (isClientConnected) {
      res.end();
    }
  };

  return {
    sendEvent,
    sendData,
    close,
    isConnected: () => isClientConnected,
    heartbeatInterval: interval,
  };
}

export function cleanupSSE(connection: SSEConnection) {
  if (connection.heartbeatInterval) {
    clearInterval(connection.heartbeatInterval);
  }
}
