// Local development server for ExpliqueMoi.
//
// The production app is deployed on Vercel: static assets (index.html, script.js,
// style.css) are served directly and the files in /api are run as serverless
// functions. This script reproduces that behaviour locally with zero runtime
// dependencies so the app can be developed and tested inside a Cloud Agent.
//
// It serves the repository root as static files and routes /api/* requests to the
// matching handler in ./api, adapting Node's http req/res objects to the Vercel
// Node handler contract (request async-iterable + optional request.body, and
// response.status()/response.json() helpers).

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, normalize, extname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || "0.0.0.0";

// Lazily imported so a syntax error in one function does not take down the server.
const API_ROUTES = {
  "/api/analyze": () => import("../api/analyze.js"),
  "/api/assist": () => import("../api/assist.js")
};

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8"
};

function decorateResponse(res) {
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };

  res.json = (payload) => {
    if (!res.headersSent) {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
    }
    res.end(JSON.stringify(payload));
    return res;
  };

  res.send = (payload) => {
    if (Buffer.isBuffer(payload) || typeof payload === "string") {
      res.end(payload);
    } else {
      res.json(payload);
    }
    return res;
  };

  return res;
}

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function handleApi(pathname, req, res) {
  let mod;

  try {
    mod = await API_ROUTES[pathname]();
  } catch (error) {
    console.error(`Failed to load handler for ${pathname}:`, error);
    decorateResponse(res)
      .status(500)
      .json({ error: "Erreur de chargement de la fonction serverless." });
    return;
  }

  const handler = mod.default;
  const bodyParserDisabled = mod.config?.api?.bodyParser === false;

  decorateResponse(res);

  // Vercel parses JSON bodies unless bodyParser is disabled (e.g. multipart
  // uploads in api/analyze.js, which reads the raw request stream itself).
  if (!bodyParserDisabled) {
    const raw = await readRawBody(req);
    const contentType = req.headers["content-type"] || "";

    if (raw.length && contentType.includes("application/json")) {
      try {
        req.body = JSON.parse(raw.toString("utf8"));
      } catch {
        req.body = raw.toString("utf8");
      }
    } else {
      req.body = raw.length ? raw.toString("utf8") : undefined;
    }
  }

  try {
    await handler(req, res);
  } catch (error) {
    console.error(`Handler error for ${pathname}:`, error);
    if (!res.headersSent) {
      res
        .status(500)
        .json({ error: "Une erreur est survenue dans la fonction serverless." });
    } else {
      res.end();
    }
  }
}

async function serveStatic(pathname, res) {
  const relativePath = pathname === "/" ? "/index.html" : pathname;
  const filePath = normalize(join(ROOT, relativePath));

  // Prevent path traversal outside the repository root.
  if (!filePath.startsWith(ROOT)) {
    res.statusCode = 403;
    res.end("Forbidden");
    return;
  }

  try {
    const data = await readFile(filePath);
    const type = MIME_TYPES[extname(filePath).toLowerCase()] || "application/octet-stream";
    res.setHeader("Content-Type", type);
    res.statusCode = 200;
    res.end(data);
  } catch {
    res.statusCode = 404;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("404 Not Found");
  }
}

const server = createServer((req, res) => {
  const { pathname } = new URL(req.url, `http://${req.headers.host || "localhost"}`);

  if (pathname.startsWith("/api/")) {
    if (API_ROUTES[pathname]) {
      handleApi(pathname, req, res).catch((error) => {
        console.error("Unexpected API error:", error);
        if (!res.headersSent) {
          res.statusCode = 500;
          res.end();
        }
      });
    } else {
      decorateResponse(res).status(404).json({ error: "Route API introuvable." });
    }
    return;
  }

  serveStatic(pathname, res);
});

server.listen(PORT, HOST, () => {
  console.log(`ExpliqueMoi dev server running at http://${HOST}:${PORT}`);
  console.log(`  Static root: ${ROOT}`);
  console.log(`  API routes:  ${Object.keys(API_ROUTES).join(", ")}`);
  if (!process.env.GEMINI_API_KEY) {
    console.warn(
      "  Warning: GEMINI_API_KEY is not set. /api/analyze and /api/assist will " +
        "return a configuration error until it is provided."
    );
  }
});
