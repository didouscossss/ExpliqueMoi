/**
 * Feature flag V4-K — activation contrôlée Preview/test.
 * Défaut : OFF (production V3 inchangée).
 */

export type V4FlagRequest = {
  url?: string;
  headers?: Record<string, string | string[] | undefined>;
};

/**
 * USE_V4_ENGINE=true|1|yes → V4 activé
 * USE_V4_ENGINE=false|0|no → V4 forcé off
 * Absent → off (sauf ALLOW_V4_QUERY sur Preview/dev)
 */
export function isV4EngineEnabled(request?: V4FlagRequest | null): boolean {
  const raw = String(process.env.USE_V4_ENGINE ?? "")
    .trim()
    .toLowerCase();

  if (["true", "1", "yes", "on"].includes(raw)) return true;
  if (["false", "0", "no", "off"].includes(raw)) return false;

  const allowQuery =
    String(process.env.ALLOW_V4_QUERY ?? "")
      .trim()
      .toLowerCase() === "true";
  const vercelEnv = String(process.env.VERCEL_ENV || "").toLowerCase();
  const isProd = vercelEnv === "production";

  if (allowQuery && !isProd && request?.url) {
    try {
      const url = new URL(request.url, "http://localhost");
      if (url.searchParams.get("engine") === "v4") return true;
    } catch {
      // ignore
    }
  }

  return false;
}
