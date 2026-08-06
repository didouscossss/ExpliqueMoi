const PRIMARY_MODEL = "gemini-3.5-flash";
const FALLBACK_MODELS = [
  "gemini-3.5-flash",
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-flash-latest"
];

/**
 * Schéma Gemini volontairement proche de la v2.3.3 (rapide / fiable).
 * L’enrichissement conseiller (amounts/persons/deadlines/…) se fait
 * ensuite côté serveur via analysisEnrichment.js — pas dans le schema.
 *
 * Cause régression 2.3.4 : schema trop large → génération lente →
 * FUNCTION_INVOCATION_TIMEOUT (504 text/plain) → « réponse illisible ».
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

export async function callGeminiForAnalysis(parts, options = {}) {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return {
      ok: false,
      detail: {
        missingKey: true,
        message: "GEMINI_API_KEY manquante."
      }
    };
  }

  const retries = Number(options.retries) || 0;
  const timeoutMs = Number(options.timeoutMs) || 45000;
  const models = uniqueModels([
    options.model || PRIMARY_MODEL,
    ...FALLBACK_MODELS
  ]);

  let lastDetail = null;

  for (const model of models) {
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        console.info("[analyze] gemini_request", {
          model,
          attempt,
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

        if (!geminiResponse.ok) {
          lastDetail = {
            httpStatus: geminiResponse.status,
            model,
            attempt,
            ...geminiData
          };

          console.error("[analyze] gemini_http_error", {
            model,
            attempt,
            httpStatus: geminiResponse.status,
            message: geminiData?.error?.message || null
          });

          const status = geminiResponse.status;
          const message = String(
            geminiData?.error?.message || ""
          );

          if (
            status === 404 ||
            /not found|unsupported|unknown model/i.test(message)
          ) {
            break;
          }

          if (
            status === 429 ||
            /quota|rate limit|exceeded your current quota/i.test(message)
          ) {
            if (attempt < retries) {
              await wait(1200 * (attempt + 1));
              continue;
            }

            break;
          }

          if (
            attempt < retries &&
            [500, 502, 503, 504].includes(status)
          ) {
            await wait(400 * (attempt + 1));
            continue;
          }

          return { ok: false, detail: lastDetail, model };
        }

        const rawText = extractCandidateText(geminiData);

        console.info("[analyze] gemini_raw", {
          model,
          attempt,
          bytes: rawText.length,
          finishReason:
            geminiData.candidates?.[0]?.finishReason || null,
          // Full raw when small; otherwise head+tail for log size.
          raw:
            rawText.length <= 8000
              ? rawText
              : `${rawText.slice(0, 4000)}\n…[truncated ${rawText.length} bytes]…\n${rawText.slice(-2000)}`,
          head: rawText.slice(0, 240),
          tail: rawText.slice(-240)
        });

        if (!rawText) {
          lastDetail = {
            empty: true,
            model,
            attempt,
            finishReason:
              geminiData.candidates?.[0]?.finishReason || null,
            promptFeedback: geminiData.promptFeedback || null,
            httpStatus: geminiResponse.status
          };

          if (attempt < retries) {
            await wait(400 * (attempt + 1));
            continue;
          }

          break;
        }

        return {
          ok: true,
          rawText,
          detail: geminiData,
          model,
          attempt
        };
      } catch (error) {
        const aborted = error?.name === "AbortError";

        lastDetail = {
          network: !aborted,
          timeout: aborted,
          model,
          attempt,
          message: error?.message || "fetch failed"
        };

        console.error("[analyze] gemini_fetch_error", lastDetail);

        if (attempt < retries) {
          await wait(400 * (attempt + 1));
          continue;
        }

        if (aborted) {
          return { ok: false, detail: lastDetail, model };
        }

        break;
      } finally {
        clearTimeout(timer);
      }
    }
  }

  return { ok: false, detail: lastDetail };
}

/**
 * Parse robuste : nettoie Markdown / texte autour, tente une réparation
 * de JSON partiel, journalise chaque étape. Ne renvoie jamais silencieusement
 * un objet invalide.
 */
export function parseGeminiJson(rawText, options = {}) {
  const label = options.label || "gemini";

  if (typeof rawText !== "string" || !rawText.trim()) {
    console.error(`[analyze] ${label}_parse_fail`, {
      stage: "empty",
      message: "Réponse Gemini vide."
    });
    throw new Error("Réponse Gemini vide.");
  }

  const original = rawText;
  let stage = "raw";
  let text = rawText.trim();

  try {
    stage = "strip_fences";
    text = stripMarkdownFences(text);

    stage = "extract_object";
    text = extractJsonObject(text);

    console.info(`[analyze] ${label}_cleaned`, {
      originalBytes: original.length,
      cleanedBytes: text.length,
      head: text.slice(0, 240),
      tail: text.slice(-240)
    });

    stage = "json_parse";
    try {
      const parsed = JSON.parse(text);
      console.info(`[analyze] ${label}_parse_ok`, {
        keys: parsed && typeof parsed === "object" ? Object.keys(parsed) : [],
        stage
      });
      return parsed;
    } catch (firstError) {
      stage = "json_repair";
      const repaired = repairJsonText(text);

      console.info(`[analyze] ${label}_repair_attempt`, {
        firstError: firstError.message,
        repairedBytes: repaired.length,
        head: repaired.slice(0, 240),
        tail: repaired.slice(-240)
      });

      try {
        const parsed = JSON.parse(repaired);
        console.info(`[analyze] ${label}_parse_ok_after_repair`, {
          keys: parsed && typeof parsed === "object" ? Object.keys(parsed) : []
        });
        return parsed;
      } catch (secondError) {
        console.error(`[analyze] ${label}_parse_fail`, {
          stage,
          message: secondError.message,
          firstError: firstError.message,
          cleanedHead: text.slice(0, 400),
          cleanedTail: text.slice(-400),
          repairedHead: repaired.slice(0, 400),
          repairedTail: repaired.slice(-400)
        });
        throw new Error(
          `JSON Gemini illisible (${secondError.message}).`
        );
      }
    }
  } catch (error) {
    if (/JSON Gemini illisible|Réponse Gemini vide/.test(error.message)) {
      throw error;
    }

    console.error(`[analyze] ${label}_parse_fail`, {
      stage,
      message: error.message,
      head: String(rawText).slice(0, 400)
    });
    throw new Error(`JSON Gemini illisible (${error.message}).`);
  }
}

function stripMarkdownFences(text) {
  let value = String(text || "").trim();

  // Bloc Markdown complet : ```json ... ```
  const fenced = value.match(/```(?:json|JSON)?\s*([\s\S]*?)\s*```/);
  if (fenced) {
    return fenced[1].trim();
  }

  // Fence ouverte sans fermeture (réponse tronquée)
  if (/^```(?:json|JSON)?\s*/i.test(value)) {
    return value.replace(/^```(?:json|JSON)?\s*/i, "").trim();
  }

  return value;
}

function extractJsonObject(text) {
  const value = String(text || "").trim();

  if (value.startsWith("{") && value.endsWith("}")) {
    return value;
  }

  const start = value.indexOf("{");
  const end = value.lastIndexOf("}");

  if (start >= 0 && end > start) {
    return value.slice(start, end + 1).trim();
  }

  return value;
}

function repairJsonText(text) {
  let value = String(text || "");

  // Supprimer BOM / caractères de contrôle parasites
  value = value.replace(/^\uFEFF/, "");
  value = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");

  // Trailing commas avant } ou ]
  value = value.replace(/,\s*([}\]])/g, "$1");

  // Clés sans guillemets simples cas fréquents : non appliqué (trop risqué)

  // Si JSON tronqué : fermer les structures ouvertes
  const stack = [];
  let inString = false;
  let escaped = false;

  for (let i = 0; i < value.length; i += 1) {
    const ch = value[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === "\"") {
        inString = false;
      }
      continue;
    }

    if (ch === "\"") {
      inString = true;
      continue;
    }

    if (ch === "{" || ch === "[") {
      stack.push(ch);
    } else if (ch === "}" || ch === "]") {
      stack.pop();
    }
  }

  if (inString) {
    value += "\"";
  }

  // Retirer une virgule finale éventuelle avant fermeture
  value = value.replace(/,\s*$/g, "");

  while (stack.length) {
    const open = stack.pop();
    value += open === "{" ? "}" : "]";
  }

  value = value.replace(/,\s*([}\]])/g, "$1");

  return value.trim();
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

function uniqueModels(models) {
  return [...new Set(models.filter(Boolean))];
}

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export { PRIMARY_MODEL, FALLBACK_MODELS, ANALYSIS_SCHEMA };
