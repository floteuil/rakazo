import http, { type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

export interface MockOmniRouteOptions {
  port?: number;
  apiKey?: string;
  defaultCost?: number;
  defaultProvider?: string;
  defaultModel?: string;
}

export interface RecordedRequest {
  method: string;
  url: string;
  headers: http.IncomingHttpHeaders;
  body: any;
  timestamp: number;
}

export type MockScenario =
  | "standard"
  | "cost_leakage"
  | "unapproved_provider"
  | "rate_limit"
  | "server_error"
  | "auth_error"
  | "timeout_simulation"
  | "corrupted_stream"
  | "abrupt_close"
  | "tool_call";

export class MockOmniRouteServer {
  private server: http.Server | null = null;
  private port: number;
  private apiKey: string;
  private defaultCost: number;
  private defaultProvider: string;
  private defaultModel: string;
  private recordedRequests: RecordedRequest[] = [];
  private currentScenario: MockScenario = "standard";
  private customResponseText = "Bonjour ! Je suis propulsé par l'intelligence gratuite OmniRoute.";
  private customToolCalls: any[] = [];
  private delayMs = 0;

  constructor(options: MockOmniRouteOptions = {}) {
    this.port = options.port ?? 0;
    this.apiKey = options.apiKey ?? "sk-omniroute-test-key";
    this.defaultCost = options.defaultCost ?? 0.0;
    this.defaultProvider = options.defaultProvider ?? "meta-llama";
    this.defaultModel = options.defaultModel ?? "meta-llama/llama-3.3-70b-instruct:free";
  }

  public setScenario(scenario: MockScenario): void {
    this.currentScenario = scenario;
  }

  public setCustomResponse(text: string): void {
    this.customResponseText = text;
  }

  public setCustomToolCalls(toolCalls: any[]): void {
    this.customToolCalls = toolCalls;
  }

  public setDelay(ms: number): void {
    this.delayMs = ms;
  }

  public getRecordedRequests(): RecordedRequest[] {
    return [...this.recordedRequests];
  }

  public getLastRequest(): RecordedRequest | undefined {
    return this.recordedRequests[this.recordedRequests.length - 1];
  }

  public reset(): void {
    this.recordedRequests = [];
    this.currentScenario = "standard";
    this.customResponseText = "Bonjour ! Je suis propulsé par l'intelligence gratuite OmniRoute.";
    this.customToolCalls = [];
    this.delayMs = 0;
  }

  public async start(): Promise<string> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer(async (req, res) => {
        try {
          await this.handleRequest(req, res);
        } catch (err) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: String(err) }));
        }
      });

      this.server.listen(this.port, "127.0.0.1", () => {
        const addr = this.server?.address() as AddressInfo;
        this.port = addr.port;
        resolve(`http://127.0.0.1:${this.port}`);
      });

      this.server.on("error", reject);
    });
  }

  public async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          this.server = null;
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  public getBaseUrl(): string {
    if (!this.server) throw new Error("MockOmniRouteServer is not running");
    return `http://127.0.0.1:${this.port}`;
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const rawBody = Buffer.concat(chunks).toString("utf-8");
    let parsedBody: any = null;
    try {
      parsedBody = rawBody ? JSON.parse(rawBody) : null;
    } catch {
      parsedBody = rawBody;
    }

    this.recordedRequests.push({
      method: req.method || "GET",
      url: req.url || "/",
      headers: req.headers,
      body: parsedBody,
      timestamp: Date.now(),
    });

    if (this.delayMs > 0) {
      await new Promise((r) => setTimeout(r, this.delayMs));
    }

    // Health check endpoint (unauthenticated for Docker / Traefik)
    if (req.url === "/health" || req.url === "/v1/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "healthy", mode: "free_intelligence_gateway" }));
      return;
    }

    // Authentication check
    const authHeader = req.headers.authorization;
    if (
      this.currentScenario === "auth_error" ||
      (this.apiKey && authHeader !== `Bearer ${this.apiKey}`)
    ) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: {
            message: "Incorrect API key provided for OmniRoute.",
            type: "invalid_request_error",
            code: "invalid_api_key",
          },
        }),
      );
      return;
    }

    // Models endpoint
    if (req.url === "/v1/models" || req.url === "/models") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          object: "list",
          data: [
            {
              id: "meta-llama/llama-3.3-70b-instruct:free",
              pricing: { prompt: 0, completion: 0 },
              provider: "meta-llama",
            },
            {
              id: "qwen/qwen-2.5-coder-32b-instruct:free",
              pricing: { prompt: 0, completion: 0 },
              provider: "qwen",
            },
            {
              id: "deepseek/deepseek-r1:free",
              pricing: { prompt: 0, completion: 0 },
              provider: "deepseek",
            },
            {
              id: "mistralai/mistral-small-24b-instruct:free",
              pricing: { prompt: 0, completion: 0 },
              provider: "mistralai",
            },
          ],
        }),
      );
      return;
    }

    // Chat completions endpoint
    if (req.url?.includes("/chat/completions")) {
      const isStream = Boolean(parsedBody?.stream);

      // Scenarios
      if (this.currentScenario === "rate_limit") {
        res.writeHead(429, {
          "Content-Type": "application/json",
          "Retry-After": "10",
        });
        res.end(
          JSON.stringify({
            error: {
              message: "Rate limit exceeded for free tier capacity on OmniRoute.",
              type: "rate_limit_exceeded",
              code: 429,
            },
          }),
        );
        return;
      }

      if (this.currentScenario === "server_error") {
        res.writeHead(503, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            error: {
              message: "OmniRoute free gateway upstream server unavailable.",
              type: "service_unavailable",
              code: 503,
            },
          }),
        );
        return;
      }

      if (this.currentScenario === "timeout_simulation") {
        // Hold connection without responding until client timeouts or aborts
        await new Promise((r) => setTimeout(r, 60000));
        return;
      }

      if (this.currentScenario === "cost_leakage") {
        // Simulates an illegal non-zero cost response
        const headers: Record<string, string> = {
          "x-omniroute-cost": "0.004500",
          "x-omniroute-provider": "unauthorized-paid-proxy",
          "x-omniroute-model": "openai/gpt-4o-paid",
        };
        if (isStream) {
          res.writeHead(200, {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
            ...headers,
          });
          res.write(
            `data: ${JSON.stringify({
              id: "chatcmpl-leak",
              choices: [{ delta: { content: "Paid response leaking cost" } }],
              pricing: { prompt: 0.002, completion: 0.0025 },
            })}\n\n`,
          );
          res.write("data: [DONE]\n\n");
          res.end();
        } else {
          res.writeHead(200, { "Content-Type": "application/json", ...headers });
          res.end(
            JSON.stringify({
              id: "chatcmpl-leak",
              choices: [{ message: { role: "assistant", content: "Paid response leaking cost" } }],
              usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
              pricing: { prompt: 0.002, completion: 0.0025, total_cost: 0.0045 },
            }),
          );
        }
        return;
      }

      if (this.currentScenario === "unapproved_provider") {
        const headers: Record<string, string> = {
          "x-omniroute-cost": "0.000000",
          "x-omniroute-provider": "unapproved_third_party_vendor",
          "x-omniroute-model": "unapproved-model:v1",
        };
        res.writeHead(200, { "Content-Type": "application/json", ...headers });
        res.end(
          JSON.stringify({
            id: "chatcmpl-unapproved",
            choices: [{ message: { role: "assistant", content: "Unapproved provider output" } }],
            usage: { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10 },
          }),
        );
        return;
      }

      if (this.currentScenario === "abrupt_close") {
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        });
        res.write(
          `data: ${JSON.stringify({ id: "chatcmpl-abrupt", choices: [{ delta: { content: "Starting..." } }] })}\n\n`,
        );
        req.destroy();
        return;
      }

      if (this.currentScenario === "corrupted_stream") {
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        });
        res.write("data: {malformed_json_without_closing_brace\n\n");
        res.write("data: [CORRUPT_METADATA]\n\n");
        res.write("data: [DONE]\n\n");
        res.end();
        return;
      }

      if (this.currentScenario === "tool_call") {
        const toolCalls =
          this.customToolCalls.length > 0
            ? this.customToolCalls
            : [
                {
                  id: "call_mcp_web_search_01",
                  type: "function",
                  function: {
                    name: "searxng_scraperr__web_search",
                    arguments: JSON.stringify({ query: "OmniRoute Free Gateway Architecture" }),
                  },
                },
              ];

        if (isStream) {
          res.writeHead(200, {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
            "x-omniroute-cost": "0.000000",
            "x-omniroute-provider": this.defaultProvider,
          });
          res.write(
            `data: ${JSON.stringify({
              id: "chatcmpl-tool-1",
              choices: [{ delta: { tool_calls: toolCalls } }],
            })}\n\n`,
          );
          res.write("data: [DONE]\n\n");
          res.end();
        } else {
          res.writeHead(200, {
            "Content-Type": "application/json",
            "x-omniroute-cost": "0.000000",
            "x-omniroute-provider": this.defaultProvider,
          });
          res.end(
            JSON.stringify({
              id: "chatcmpl-tool-1",
              choices: [{ message: { role: "assistant", content: null, tool_calls: toolCalls } }],
              usage: { prompt_tokens: 25, completion_tokens: 15, total_tokens: 40 },
            }),
          );
        }
        return;
      }

      // Standard Free Response
      const responseHeaders: Record<string, string> = {
        "x-omniroute-cost": "0.000000",
        "x-omniroute-provider": this.defaultProvider,
        "x-omniroute-model": parsedBody?.model || this.defaultModel,
      };

      if (isStream) {
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
          ...responseHeaders,
        });

        // Split text into tokens / words for realistic streaming
        const words = this.customResponseText.split(" ");
        for (let i = 0; i < words.length; i++) {
          const chunk = (i === 0 ? "" : " ") + words[i];
          const payload = {
            id: "chatcmpl-standard",
            object: "chat.completion.chunk",
            created: Math.floor(Date.now() / 1000),
            model: parsedBody?.model || this.defaultModel,
            choices: [
              {
                index: 0,
                delta: { content: chunk },
                finish_reason: i === words.length - 1 ? "stop" : null,
              },
            ],
          };
          res.write(`data: ${JSON.stringify(payload)}\n\n`);
        }
        res.write("data: [DONE]\n\n");
        res.end();
      } else {
        res.writeHead(200, {
          "Content-Type": "application/json",
          ...responseHeaders,
        });
        res.end(
          JSON.stringify({
            id: "chatcmpl-standard",
            object: "chat.completion",
            created: Math.floor(Date.now() / 1000),
            model: parsedBody?.model || this.defaultModel,
            choices: [
              {
                index: 0,
                message: { role: "assistant", content: this.customResponseText },
                finish_reason: "stop",
              },
            ],
            usage: {
              prompt_tokens: 15,
              completion_tokens: this.customResponseText.split(" ").length,
              total_tokens: 15 + this.customResponseText.split(" ").length,
            },
            pricing: {
              prompt: 0.0,
              completion: 0.0,
              total_cost: 0.0,
            },
          }),
        );
      }
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Endpoint not found on OmniRoute mock server" }));
  }
}
