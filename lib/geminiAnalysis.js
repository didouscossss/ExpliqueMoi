const PRIMARY_MODEL = "gemini-3.5-flash";

/**
 * Schéma JSON exact v2.3.3 — ne pas élargir.
 */
const ANALYSIS_SCHEMA = {
  type: "OBJECT",
  properties: {
    document_type: { type: "STRING" },
    plain_summary: { type: "STRING" },
    request: { type: "STRING" },
    why_received: { type: "STRING" },
    issuer: { type: "STRING" },
    urgency: {
      type: "OBJECT",
      properties: {
        level: { type: "STRING" },
        message: { type: "STRING" }
      }
    },
    actions: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          action: { type: "STRING" },
          how: { type: "STRING" }
        }
      }
    },
    dates: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          date: { type: "STRING" },
          label: { type: "STRING" },
          meaning: { type: "STRING" }
        }
      }
    },
    timeline: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          date: { type: "STRING" },
          label: { type: "STRING" },
          meaning: { type: "STRING" }
        }
      }
    },
    amount: {
      type: "OBJECT",
      properties: {
        value: { type: "STRING" },
        meaning: { type: "STRING" }
      }
    },
    amounts_detail: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          label: { type: "STRING" },
          value: { type: "STRING" },
          kind: { type: "STRING" },
          page: { type: "STRING" }
        }
      }
    },
    tables: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          title: { type: "STRING" },
          columns: { type: "ARRAY", items: { type: "STRING" } },
          rows: {
            type: "ARRAY",
            items: { type: "ARRAY", items: { type: "STRING" } }
          },
          page: { type: "STRING" },
          confidence: { type: "NUMBER" },
          totals: { type: "OBJECT" },
          notes: { type: "STRING" },
          kind: { type: "STRING" }
        }
      }
    },
    entities: {
      type: "OBJECT",
      properties: {
        people: { type: "ARRAY", items: { type: "STRING" } },
        addresses: { type: "ARRAY", items: { type: "STRING" } },
        references: { type: "ARRAY", items: { type: "STRING" } },
        signatures: { type: "ARRAY", items: { type: "STRING" } },
        organizations: { type: "ARRAY", items: { type: "STRING" } }
      }
    },
    evidence: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          page: { type: "STRING" },
          quote: { type: "STRING" },
          explanation: { type: "STRING" }
        }
      }
    },
    confidence: { type: "NUMBER" },
    reading_quality: { type: "STRING" },
    warnings: {
      type: "ARRAY",
      items: { type: "STRING" }
    }
  },
  required: [
    "document_type",
    "plain_summary",
    "request",
    "confidence",
    "reading_quality"
  ]
};

/**
 * Un seul modèle, zéro retry, zéro fallback multi-modèles.
 * Stratégie d’appel Gemini = v2.3.3 (schéma + temperature), sans boucles.
 */
export async function callGeminiForAnalysis(parts, options = {}) {
  const apiKey = process.env.GEMINI_API_KEY;
  const started = Date.now();

  if (!apiKey) {
    return {
      ok: false,
      detail: {
        missingKey: true,
        message: "GEMINI_API_KEY manquante."
      },
      durationMs: 0
    };
  }

  const model = options.model || PRIMARY_MODEL;
  const timeoutMs = Math.max(
    1000,
    Math.min(Number(options.timeoutMs) || 48000, 48000)
  );

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    console.info("[analyze] gemini_request", {
      model,
      timeoutMs,
      partsCount: Array.isArray(parts) ? parts.length : 0
    });

    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts
            }
          ],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: "application/json",
            responseSchema: ANALYSIS_SCHEMA
          }
        })
      }
    );

    const geminiData = await geminiResponse.json();
    const durationMs = Date.now() - started;

    if (!geminiResponse.ok) {
      console.error("[analyze] gemini_http_error", {
        model,
        httpStatus: geminiResponse.status,
        message: geminiData?.error?.message || null,
        durationMs
      });

      return {
        ok: false,
        detail: {
          httpStatus: geminiResponse.status,
          model,
          ...geminiData
        },
        model,
        durationMs
      };
    }

    const rawText = extractCandidateText(geminiData);

    console.info("[analyze] gemini_raw", {
      model,
      bytes: rawText.length,
      durationMs,
      finishReason: geminiData.candidates?.[0]?.finishReason || null,
      head: rawText.slice(0, 200)
    });

    if (!rawText) {
      return {
        ok: false,
        detail: {
          empty: true,
          model,
          finishReason: geminiData.candidates?.[0]?.finishReason || null,
          promptFeedback: geminiData.promptFeedback || null,
          httpStatus: geminiResponse.status
        },
        model,
        durationMs
      };
    }

    return {
      ok: true,
      rawText,
      detail: geminiData,
      model,
      durationMs
    };
  } catch (error) {
    const aborted = error?.name === "AbortError";
    const durationMs = Date.now() - started;

    return {
      ok: false,
      detail: {
        network: !aborted,
        timeout: aborted,
        model,
        message: error?.message || "fetch failed"
      },
      model,
      durationMs
    };
  } finally {
    clearTimeout(timer);
  }
}

export function parseGeminiJson(rawText) {
  if (typeof rawText !== "string" || !rawText.trim()) {
    throw new Error("Réponse Gemini vide.");
  }

  let text = rawText.trim();

  if (text.startsWith("```")) {
    text = text
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
  }

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");

  if (start >= 0 && end > start) {
    text = text.slice(start, end + 1);
  }

  return JSON.parse(text);
}

function extractCandidateText(geminiData) {
  const parts = geminiData?.candidates?.[0]?.content?.parts;

  if (!Array.isArray(parts) || !parts.length) {
    return "";
  }

  return parts
    .map((part) => (typeof part?.text === "string" ? part.text : ""))
    .join("")
    .trim();
}

export { PRIMARY_MODEL, ANALYSIS_SCHEMA };
