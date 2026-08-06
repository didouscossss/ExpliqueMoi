const PRIMARY_MODEL = "gemini-3.5-flash";

/**
 * Schéma métier identique à la v2.3.0 — ne pas élargir.
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
 * Un seul modèle, un seul appel, zéro retry, zéro fallback.
 * thinkingBudget = 0 (pas de raisonnement étendu).
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

  const model = PRIMARY_MODEL;
  const timeoutMs = Math.max(
    1000,
    Math.min(Number(options.timeoutMs) || 48000, 48000)
  );

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const promptText = summarizePromptParts(parts);
    console.info("[analyze] TRACE_1_prompt_sent", {
      model,
      timeoutMs,
      thinkingBudget: 0,
      partsCount: Array.isArray(parts) ? parts.length : 0,
      textPartsCount: promptText.textPartsCount,
      mediaPartsCount: promptText.mediaPartsCount,
      promptChars: promptText.promptChars,
      promptPreview: promptText.promptPreview,
      media: promptText.media,
      startedAt: new Date(started).toISOString()
    });

    console.info("[analyze] TRACE_2_model", { model: PRIMARY_MODEL });

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
            responseSchema: ANALYSIS_SCHEMA,
            thinkingConfig: {
              thinkingBudget: 0
            }
          }
        })
      }
    );

    const geminiData = await geminiResponse.json();
    const durationMs = Date.now() - started;

    if (!geminiResponse.ok) {
      console.error("[analyze] TRACE_5_raw_http_error", {
        model,
        httpStatus: geminiResponse.status,
        message: geminiData?.error?.message || null,
        durationMs,
        bodyPreview: JSON.stringify(geminiData).slice(0, 2000)
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

    const candidateMeta = summarizeCandidates(geminiData);
    const rawText = extractCandidateText(geminiData);

    // TRACE 5 — réponse brute AVANT tout nettoyage Markdown / parse
    console.info("[analyze] TRACE_5_raw_before_cleanup", {
      model,
      durationMs,
      finishReason: geminiData.candidates?.[0]?.finishReason || null,
      promptFeedback: geminiData.promptFeedback || null,
      candidateCount: candidateMeta.candidateCount,
      partSummaries: candidateMeta.partSummaries,
      rawTextBytes: rawText.length,
      rawTextEmpty: rawText.length === 0,
      rawTextFull: rawText.slice(0, 8000),
      rawGeminiJsonPreview: JSON.stringify({
        promptFeedback: geminiData.promptFeedback || null,
        candidates: (geminiData.candidates || []).map((c) => ({
          finishReason: c?.finishReason || null,
          safetyRatings: c?.safetyRatings || null,
          partKeys: (c?.content?.parts || []).map((p) => Object.keys(p || {})),
          texts: (c?.content?.parts || []).map((p) =>
            typeof p?.text === "string" ? p.text.slice(0, 2000) : null
          )
        }))
      }).slice(0, 12000)
    });

    if (!rawText) {
      console.error("[analyze] TRACE_DISCARD_empty_rawText", {
        reason:
          "extractCandidateText a renvoyé une chaîne vide — aucun part.text exploitable dans candidates[0].content.parts",
        function: "lib/geminiAnalysis.js:extractCandidateText",
        partSummaries: candidateMeta.partSummaries,
        finishReason: geminiData.candidates?.[0]?.finishReason || null,
        promptFeedback: geminiData.promptFeedback || null
      });

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
    console.error("[analyze] TRACE_6_7_parse_fail", {
      stage: "empty_input",
      reason: "rawText vide ou non-string avant nettoyage Markdown"
    });
    throw new Error("Réponse Gemini vide.");
  }

  const beforeCleanup = rawText;
  let text = rawText.trim();
  const afterTrim = text;
  let strippedFence = false;

  if (text.startsWith("```")) {
    strippedFence = true;
    text = text
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
  }

  const afterMarkdownCleanup = text;
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  let slicedObject = false;

  if (start >= 0 && end > start) {
    slicedObject = true;
    text = text.slice(start, end + 1);
  }

  // TRACE 6 — après nettoyage Markdown / extraction {…}
  console.info("[analyze] TRACE_6_after_markdown_cleanup", {
    beforeBytes: beforeCleanup.length,
    afterTrimBytes: afterTrim.length,
    strippedFence,
    afterMarkdownBytes: afterMarkdownCleanup.length,
    slicedObject,
    sliceStart: start,
    sliceEnd: end,
    cleanedPreview: text.slice(0, 4000)
  });

  try {
    const parsed = JSON.parse(text);

    // TRACE 7 — après parse JSON
    console.info("[analyze] TRACE_7_after_json_parse", {
      ok: true,
      keys: parsed && typeof parsed === "object" ? Object.keys(parsed) : [],
      document_type: parsed?.document_type ?? null,
      plain_summary: parsed?.plain_summary ?? null,
      request: parsed?.request ?? null,
      actionsCount: Array.isArray(parsed?.actions) ? parsed.actions.length : 0,
      evidenceCount: Array.isArray(parsed?.evidence) ? parsed.evidence.length : 0,
      confidence: parsed?.confidence ?? null,
      reading_quality: parsed?.reading_quality ?? null,
      parsedPreview: JSON.stringify(parsed).slice(0, 4000)
    });

    return parsed;
  } catch (error) {
    console.error("[analyze] TRACE_6_7_parse_fail", {
      stage: "JSON.parse",
      reason: error?.message || "JSON.parse failed",
      cleanedPreview: text.slice(0, 2000)
    });
    throw error;
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

/** Logs only — no behavior change. */
function summarizePromptParts(parts) {
  const list = Array.isArray(parts) ? parts : [];
  const textChunks = [];
  const media = [];

  for (const part of list) {
    if (typeof part?.text === "string") {
      textChunks.push(part.text);
    } else if (part?.inlineData) {
      media.push({
        mimeType: part.inlineData.mimeType || null,
        base64Length: String(part.inlineData.data || "").length
      });
    }
  }

  const prompt = textChunks.join("\n\n---\n\n");

  return {
    textPartsCount: textChunks.length,
    mediaPartsCount: media.length,
    promptChars: prompt.length,
    promptPreview: prompt.slice(0, 6000),
    media
  };
}

function summarizeCandidates(geminiData) {
  const candidates = Array.isArray(geminiData?.candidates)
    ? geminiData.candidates
    : [];

  const partSummaries = [];

  for (let ci = 0; ci < candidates.length; ci += 1) {
    const parts = candidates[ci]?.content?.parts;

    if (!Array.isArray(parts)) {
      partSummaries.push({ candidate: ci, parts: null });
      continue;
    }

    partSummaries.push({
      candidate: ci,
      finishReason: candidates[ci]?.finishReason || null,
      parts: parts.map((part, pi) => ({
        index: pi,
        keys: Object.keys(part || {}),
        textChars:
          typeof part?.text === "string" ? part.text.length : 0,
        textPreview:
          typeof part?.text === "string" ? part.text.slice(0, 500) : null,
        hasInlineData: Boolean(part?.inlineData),
        thought: part?.thought === true || part?.thought === "true"
      }))
    });
  }

  return {
    candidateCount: candidates.length,
    partSummaries
  };
}

export { PRIMARY_MODEL, ANALYSIS_SCHEMA };
