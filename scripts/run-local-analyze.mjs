#!/usr/bin/env node
/**
 * Local HTTP wrapper around api/analyze.js for real PDF tests.
 * Usage: GEMINI_API_KEY=... node scripts/run-local-analyze.mjs
 */
import http from "http";
import { Readable } from "stream";
import handler from "../api/analyze.js";

const PORT = Number(process.env.PORT) || 8787;

function createMockResponse() {
  const state = {
    statusCode: 200,
    headers: {},
    body: null
  };

  return {
    state,
    status(code) {
      state.statusCode = code;
      return this;
    },
    json(payload) {
      state.body = payload;
      state.headers["content-type"] = "application/json";
      return this;
    },
    setHeader(name, value) {
      state.headers[name.toLowerCase()] = value;
    }
  };
}

const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, hasKey: Boolean(process.env.GEMINI_API_KEY) }));
    return;
  }

  if (req.method !== "POST" || !req.url?.startsWith("/api/analyze")) {
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: { code: "NOT_FOUND", message: "Not found" } }));
    return;
  }

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const body = Buffer.concat(chunks);

  const readable = Readable.from(body);
  readable.method = "POST";
  readable.headers = {
    "content-type": req.headers["content-type"] || "",
    "content-length": String(body.length)
  };

  // Make it async-iterable like a Node request
  const nodeLikeRequest = Object.assign(Readable.from(body), {
    method: "POST",
    headers: {
      "content-type": req.headers["content-type"] || "",
      "content-length": String(body.length)
    }
  });

  const mockRes = createMockResponse();

  try {
    await handler(nodeLikeRequest, mockRes);
    const payload = JSON.stringify(mockRes.state.body ?? {});
    res.writeHead(mockRes.state.statusCode || 200, {
      "content-type": "application/json",
      ...mockRes.state.headers
    });
    res.end(payload);
  } catch (error) {
    console.error(error);
    res.writeHead(500, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        ok: false,
        error: {
          code: "UNKNOWN_ERROR",
          message: String(error?.message || error)
        }
      })
    );
  }
});

server.listen(PORT, () => {
  console.log(
    JSON.stringify({
      listening: `http://127.0.0.1:${PORT}/api/analyze`,
      hasKey: Boolean(process.env.GEMINI_API_KEY)
    })
  );
});
