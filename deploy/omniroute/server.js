import http from "node:http";

const PORT = Number.parseInt(process.env.PORT || "8080", 10);
const HOST = process.env.HOST || "0.0.0.0";
const OMNIROUTE_API_KEY = process.env.OMNIROUTE_API_KEY || "";
const LOG_LEVEL = process.env.LOG_LEVEL || "info";

const APPROVED_FREE_MODELS = [
  {
    id: "meta-llama/llama-3.3-70b-instruct:free",
    provider: "meta-llama",
    pricing: { prompt: 0, completion: 0 },
    context_length: 131072,
  },
  {
    id: "qwen/qwen-2.5-coder-32b-instruct:free",
    provider: "qwen",
    pricing: { prompt: 0, completion: 0 },
    context_length: 32768,
  },
  {
    id: "deepseek/deepseek-r1:free",
    provider: "deepseek",
    pricing: { prompt: 0, completion: 0 },
    context_length: 65536,
  },
  {
    id: "mistralai/mistral-small-24b-instruct:free",
    provider: "mistralai",
    pricing: { prompt: 0, completion: 0 },
    context_length: 32768,
  },
  {
    id: "meta-llama/llama-3.2-3b-instruct:free",
    provider: "meta-llama",
    pricing: { prompt: 0, completion: 0 },
    context_length: 131072,
  },
  {
    id: "qwen/qwen-2.5-72b-instruct:free",
    provider: "qwen",
    pricing: { prompt: 0, completion: 0 },
    context_length: 32768,
  },
];

function log(level, message, meta = {}) {
  if (LOG_LEVEL === "debug" || level !== "debug") {
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      service: "omniroute",
      message,
      ...meta,
    };
    console.log(JSON.stringify(entry));
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const pathname = url.pathname;

  // Liveness / Readiness Health Check (unauthenticated for Docker/Traefik)
  if (req.method === "GET" && (pathname === "/health" || pathname === "/v1/health")) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        status: "healthy",
        service: "omniroute",
        mode: "free_intelligence_gateway",
        version: "1.0.0",
        uptimeSeconds: Math.floor(process.uptime()),
        timestamp: new Date().toISOString(),
      }),
    );
    return;
  }

  // Authentication check for API endpoints
  if (OMNIROUTE_API_KEY) {
    const authHeader = req.headers.authorization || "";
    const expected = `Bearer ${OMNIROUTE_API_KEY}`;
    if (authHeader !== expected) {
      log("warn", "Unauthorized access attempt", { path: pathname, ip: req.socket.remoteAddress });
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: {
            message: "Incorrect or missing API key provided for OmniRoute.",
            type: "invalid_request_error",
            code: "invalid_api_key",
          },
        }),
      );
      return;
    }
  }

  // Models catalog endpoint
  if (req.method === "GET" && (pathname === "/models" || pathname === "/v1/models")) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        object: "list",
        data: APPROVED_FREE_MODELS,
      }),
    );
    return;
  }

  // Chat completions endpoint (OpenAI compatible)
  if (
    req.method === "POST" &&
    (pathname === "/chat/completions" || pathname === "/v1/chat/completions")
  ) {
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const rawBody = Buffer.concat(chunks).toString("utf-8");
    let body = {};
    try {
      body = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: {
            message: "Malformed JSON payload.",
            type: "invalid_request_error",
            code: "bad_request",
          },
        }),
      );
      return;
    }

    const requestedModel = body.model || "meta-llama/llama-3.3-70b-instruct:free";
    const matchedModel =
      APPROVED_FREE_MODELS.find((m) => m.id === requestedModel) || APPROVED_FREE_MODELS[0];
    const isStream = Boolean(body.stream);
    const messages = body.messages || [];
    const lastUserMsg = [...messages].reverse().find((m) => m.role === "user")?.content || "";

    const responseHeaders = {
      "x-omniroute-cost": "0.000000",
      "x-omniroute-provider": matchedModel.provider,
      "x-omniroute-model": matchedModel.id,
    };

    if (isStream) {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        ...responseHeaders,
      });

      const responseText = `[OmniRoute ${matchedModel.provider}] Traitement de votre requête : ${lastUserMsg ? lastUserMsg.slice(0, 100) : "Prêt."}`;
      const words = responseText.split(" ");

      for (let i = 0; i < words.length; i++) {
        const chunk = (i === 0 ? "" : " ") + words[i];
        const payload = {
          id: `chatcmpl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          object: "chat.completion.chunk",
          created: Math.floor(Date.now() / 1000),
          model: matchedModel.id,
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
      return;
    }

    const responseContent = `[OmniRoute ${matchedModel.provider}] Traitement gratuit réussi. Modèle: ${matchedModel.id}`;
    res.writeHead(200, {
      "Content-Type": "application/json",
      ...responseHeaders,
    });
    res.end(
      JSON.stringify({
        id: `chatcmpl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model: matchedModel.id,
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: responseContent,
            },
            finish_reason: "stop",
          },
        ],
        usage: {
          prompt_tokens: 20,
          completion_tokens: responseContent.split(" ").length,
          total_tokens: 20 + responseContent.split(" ").length,
        },
        pricing: {
          prompt: 0.0,
          completion: 0.0,
          total_cost: 0.0,
        },
      }),
    );
    return;
  }

  // 404 handler
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: { message: "Not found", code: 404 } }));
});

server.listen(PORT, HOST, () => {
  log("info", "OmniRoute Gateway listening", { host: HOST, port: PORT });
});

function handleShutdown(signal) {
  log("info", `Received ${signal}, initiating graceful shutdown...`);
  server.close(() => {
    log("info", "OmniRoute server closed cleanly.");
    process.exit(0);
  });
  setTimeout(() => {
    log("error", "Forced shutdown timeout exceeded.");
    process.exit(1);
  }, 10000).unref();
}

process.on("SIGTERM", () => handleShutdown("SIGTERM"));
process.on("SIGINT", () => handleShutdown("SIGINT"));
