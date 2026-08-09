/**
 * Chemins OCR 100 % locaux — aucun CDN.
 * Porté depuis V4 (lib/v4/localExtraction/ocrPaths.ts).
 */

import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));

function ocrRootLooksReady(root) {
  const coreOk = existsSync(
    path.join(root, "core", "tesseract-core-simd-lstm.wasm.js")
  );
  const fraOk =
    existsSync(path.join(root, "lang", "fra.traineddata.gz")) ||
    existsSync(path.join(root, "lang", "fra.traineddata"));
  return coreOk && fraOk;
}

/** Racine assets OCR vendored (repo). */
export function getOcrAssetsRoot() {
  const candidates = [
    // lib/didou/ocr → assets/ocr
    path.resolve(HERE, "../../../assets/ocr"),
    // CWD repo (tests / scripts)
    path.resolve(process.cwd(), "assets/ocr")
  ];
  for (const root of candidates) {
    if (ocrRootLooksReady(root)) return root;
  }
  return candidates[0];
}

export function getLocalOcrPaths() {
  const root = getOcrAssetsRoot();
  const tessPkg = path.dirname(require.resolve("tesseract.js/package.json"));
  // Node worker (package local) — pas le worker.min.js navigateur
  const workerPath = path.join(tessPkg, "src/worker-script/node/index.js");
  const corePath = path.join(root, "core");
  const langPath = path.join(root, "lang");
  const cachePath = path.join(root, ".cache");
  const fraGz = path.join(langPath, "fra.traineddata.gz");
  const fra = path.join(langPath, "fra.traineddata");

  const missing = [];
  if (!existsSync(workerPath)) missing.push("worker");
  if (!existsSync(path.join(corePath, "tesseract-core-simd-lstm.wasm.js"))) {
    missing.push("core");
  }
  if (!existsSync(fraGz) && !existsSync(fra)) missing.push("fra");

  return {
    workerPath,
    corePath,
    langPath,
    cachePath,
    ready: missing.length === 0,
    missing
  };
}
