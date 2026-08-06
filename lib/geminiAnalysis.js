const PRIMARY_MODEL = "gemini-3.5-flash";
const FALLBACK_MODELS = [
  "gemini-3.5-flash",
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-flash-latest"
];

const PAGE_CONTEXT_FIELDS = {
  page: { type: "STRING" },
  context: { type: "STRING" },
  confidence: { type: "NUMBER" }
};

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
          how: { type: "STRING" },
          ...PAGE_CONTEXT_FIELDS
        },
        required: ["action"]
      }
    },
    dates: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          date: { type: "STRING" },
          type: { type: "STRING" },
          label: { type: "STRING" },
          meaning: { type: "STRING" },
          ...PAGE_CONTEXT_FIELDS
        },
        required: ["date"]
      }
    },
    deadlines: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          date: { type: "STRING" },
          label: { type: "STRING" },
          ...PAGE_CONTEXT_FIELDS
        },
        required: ["date"]
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
    amounts: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          value: { type: "STRING" },
          label: { type: "STRING" },
          kind: { type: "STRING" },
          ...PAGE_CONTEXT_FIELDS
        },
        required: ["value"]
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
    references: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          value: { type: "STRING" },
          type: { type: "STRING" },
          ...PAGE_CONTEXT_FIELDS
        },
        required: ["value"]
      }
    },
    persons: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          name: { type: "STRING" },
          role: { type: "STRING" },
          ...PAGE_CONTEXT_FIELDS
        },
        required: ["name"]
      }
    },
    requiredDocuments: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          label: { type: "STRING" },
          required: { type: "BOOLEAN" },
          reason: { type: "STRING" },
          ...PAGE_CONTEXT_FIELDS
        },
        required: ["label"]
      }
    },
    risks: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          label: { type: "STRING" },
          severity: { type: "STRING" },
          ...PAGE_CONTEXT_FIELDS
        },
        required: ["label"]
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
    contradictions: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          type: { type: "STRING" },
          message: { type: "STRING" },
          items: { type: "ARRAY", items: { type: "STRING" } },
          confidence: { type: "NUMBER" }
        },
        required: ["message"]
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
  const timeoutMs = Number(options.timeoutMs) || 50000;
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

  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");

    if (start >= 0 && end > start) {
      return JSON.parse(text.slice(start, end + 1));
    }

    throw new Error("JSON Gemini illisible.");
  }
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
