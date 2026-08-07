/**
 * Logs V3 sans contenu documentaire.
 */

export interface ProviderLogMeta {
  requestId?: string;
  provider?: string;
  model?: string;
  durationMs?: number;
  httpStatus?: number | null;
  ok?: boolean;
  charCount?: number;
  code?: string;
  action?: string;
}

export function logProviderEvent(
  level: "info" | "error",
  event: string,
  meta: ProviderLogMeta = {}
): void {
  const payload = {
    event,
    requestId: meta.requestId ?? null,
    provider: meta.provider ?? null,
    model: meta.model ?? null,
    durationMs: meta.durationMs ?? null,
    httpStatus: meta.httpStatus ?? null,
    ok: meta.ok ?? null,
    charCount: meta.charCount ?? null,
    code: meta.code ?? null,
    action: meta.action ?? null
  };

  if (level === "error") {
    console.error("[v3-provider]", JSON.stringify(payload));
    return;
  }

  console.info("[v3-provider]", JSON.stringify(payload));
}
