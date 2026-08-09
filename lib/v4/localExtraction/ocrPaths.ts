/**
 * Chemins OCR 100 % locaux — aucun CDN.
 */

import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));

/** Racine assets OCR vendored (repo). */
export function getOcrAssetsRoot(): string {
  return path.resolve(HERE, "../../../assets/ocr");
}

export function getLocalOcrPaths(): {
  workerPath: string;
  corePath: string;
  langPath: string;
  cachePath: string;
  ready: boolean;
  missing: string[];
} {
  const root = getOcrAssetsRoot();
  const tessPkg = path.dirname(require.resolve("tesseract.js/package.json"));
  // Node worker (package local) — pas le worker.min.js navigateur
  const workerPath = path.join(tessPkg, "src/worker-script/node/index.js");
  const corePath = path.join(root, "core");
  const langPath = path.join(root, "lang");
  const cachePath = path.join(root, ".cache");
  const fraGz = path.join(langPath, "fra.traineddata.gz");
  const fra = path.join(langPath, "fra.traineddata");

  const missing: string[] = [];
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
