import type { ConnectorTool } from "@rakazo/adapter-kit";

export interface InferenceTransportMessage {
  role: "system" | "user" | "assistant" | "tool";
  content?: string | null;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: {
      name: string;
      arguments: string;
    };
  }>;
  tool_call_id?: string;
  name?: string;
}

export interface InferenceTransportRequest {
  model: string;
  provider?: string;
  messages: InferenceTransportMessage[];
  tools?: ConnectorTool[];
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
  sessionId?: string;
  headers?: Record<string, string>;
}

export interface InferenceTransportChunk {
  type: "text" | "tool_call" | "usage" | "reasoning";
  text?: string;
  toolCall?: {
    id?: string;
    index?: number;
    name?: string;
    arguments?: string;
  };
  usage?: {
    inputTokens: number;
    outputTokens: number;
    cachedTokens?: number;
    totalTokens: number;
  };
}

export interface InferenceTransport {
  readonly id: string;
  readonly isFree: boolean;
  stream(request: InferenceTransportRequest): AsyncIterable<InferenceTransportChunk>;
}
