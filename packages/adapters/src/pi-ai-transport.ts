import type { Context, Message, Models, Tool } from "@earendil-works/pi-ai";
import { builtinModels } from "@earendil-works/pi-ai/providers/all";
import type {
  InferenceTransport,
  InferenceTransportChunk,
  InferenceTransportRequest,
} from "./inference-transport.js";

export interface PiAiTransportOptions {
  apiKey?: string;
  defaultModel?: string;
  models?: Models;
}

export class PiAiInferenceTransport implements InferenceTransport {
  public readonly id = "pi-ai";
  public readonly isFree = false;

  private apiKey?: string;
  private defaultModel: string;
  private models: Models;

  constructor(options: PiAiTransportOptions = {}) {
    this.apiKey = options.apiKey ?? process.env.OPENROUTER_API_KEY;
    this.defaultModel =
      options.defaultModel ??
      (process.env.PI_DEFAULT_MODEL || "openai/gpt-oss-120b");
    this.models = options.models ?? builtinModels();
  }

  public async *stream(
    request: InferenceTransportRequest,
  ): AsyncIterable<InferenceTransportChunk> {
    const provider = request.provider === "scripted" ? "openrouter" : request.provider ?? "openrouter";
    const modelId =
      request.model === "scripted"
        ? (process.env.PI_DEFAULT_MODEL ?? "openai/gpt-oss-120b")
        : request.model || this.defaultModel;

    const model =
      this.models.getModel(provider as any, modelId) ??
      this.models.getModel("openrouter", modelId);

    if (!model) {
      throw new Error(`Unknown model ${provider}/${modelId}`);
    }

    const apiKey = this.apiKey ?? process.env.OPENROUTER_API_KEY;

    let systemPrompt: string | undefined;
    const messages: Message[] = [];

    for (const msg of request.messages) {
      if (msg.role === "system") {
        systemPrompt = systemPrompt
          ? `${systemPrompt}\n\n${msg.content ?? ""}`
          : msg.content ?? "";
      } else if (msg.role === "user") {
        messages.push({
          role: "user",
          content: msg.content ?? "",
          timestamp: Date.now(),
        });
      } else if (msg.role === "assistant") {
        const contentBlocks: any[] = [];
        if (msg.content) {
          contentBlocks.push({ type: "text", text: msg.content });
        }
        if (msg.tool_calls && Array.isArray(msg.tool_calls)) {
          for (const tc of msg.tool_calls) {
            let parsedArgs: Record<string, any> = {};
            try {
              parsedArgs = JSON.parse(tc.function.arguments || "{}");
            } catch {
              parsedArgs = {};
            }
            contentBlocks.push({
              type: "toolCall",
              id: tc.id,
              name: tc.function.name,
              arguments: parsedArgs,
            });
          }
        }
        messages.push({
          role: "assistant",
          content: contentBlocks,
          api: model.api,
          provider: model.provider,
          model: model.id,
          usage: {
            input: 0,
            output: 0,
            cacheRead: 0,
            cacheWrite: 0,
            totalTokens: 0,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
          },
          stopReason: "stop",
          timestamp: Date.now(),
        });
      } else if (msg.role === "tool") {
        messages.push({
          role: "toolResult" as any,
          toolCallId: msg.tool_call_id ?? "",
          toolName: msg.name ?? "",
          content: [{ type: "text", text: msg.content ?? "" }],
          isError: false,
          timestamp: Date.now(),
        } as any);
      }
    }

    const context: Context = {
      systemPrompt,
      messages,
      tools: (request.tools || []).map((t): Tool => ({
        name: t.name,
        description: t.description || "",
        parameters: (t as any).parameters ?? t.inputSchema ?? { type: "object", properties: {} },
      })),
    };

    const stream = await this.models.streamSimple(model, context, {
      apiKey,
      signal: request.signal,
      maxTokens: request.maxTokens ? Math.max(request.maxTokens, 16384) : 16384,
      reasoning: "low",
    });

    for await (const event of stream) {
      if (event.type === "text_delta") {
        yield {
          type: "text",
          text: event.delta,
        };
      } else if (event.type === "toolcall_delta" || event.type === "toolcall_start") {
        const tc = (event as any).toolCall ?? (event as any).toolcall ?? event;
        if (tc?.name) {
          yield {
            type: "tool_call",
            toolCall: {
              id: tc.id,
              index: tc.index,
              name: tc.name,
              arguments: typeof tc.arguments === "string" ? tc.arguments : JSON.stringify(tc.arguments ?? {}),
            },
          };
        }
      }
    }

    const finalMessage = await stream.result();
    if (finalMessage.role === "assistant") {
      if (finalMessage.content && Array.isArray(finalMessage.content)) {
        for (const block of finalMessage.content) {
          if (block.type === "toolCall") {
            yield {
              type: "tool_call",
              toolCall: {
                id: block.id,
                name: block.name,
                arguments: typeof block.arguments === "string" ? block.arguments : JSON.stringify(block.arguments ?? {}),
              },
            };
          }
        }
      }

      if (finalMessage.usage) {
        const usage = finalMessage.usage;
        yield {
          type: "usage",
          usage: {
            inputTokens: usage.input,
            outputTokens: usage.output,
            cachedTokens: usage.cacheRead,
            totalTokens: usage.totalTokens,
          },
        };
      }
    }
  }
}
