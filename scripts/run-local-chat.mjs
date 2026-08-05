import http from "http";
import chat from "../api/chat.js";

const PORT = Number(process.env.PORT) || 8788;

function createMockResponse() {
  const state = { statusCode: 200, body: null, headers: {} };
  return {
    state,
    status(code) {
      state.statusCode = code;
      return this;
    },
    json(payload) {
      state.body = payload;
      return this;
    },
    setHeader(name, value) {
      state.headers[name] = value;
    }
  };
}

const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({ ok: true, hasKey: Boolean(process.env.GEMINI_API_KEY) })
    );
    return;
  }

  if (req.method === "POST" && req.url?.startsWith("/api/chat")) {
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }

    let body = {};
    try {
      body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
    } catch {
      body = {};
    }

    const mock = createMockResponse();
    await chat({ method: "POST", body }, mock);
    res.writeHead(mock.state.statusCode || 200, {
      "content-type": "application/json"
    });
    res.end(JSON.stringify(mock.state.body ?? {}));
    return;
  }

  res.writeHead(404, { "content-type": "application/json" });
  res.end(JSON.stringify({ ok: false }));
});

server.listen(PORT, () => {
  console.log(`chat-test-server http://127.0.0.1:${PORT}`);
});
