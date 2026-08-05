import {
  buildDocumentContext,
  tryAnswerLocally
} from "../lib/documentContext.js";

const MODEL = "gemini-3.5-flash";
const FALLBACK_MODELS = [
  "gemini-3.5-flash",
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-flash-latest"
];

const CHAT_SCHEMA = {
  type: "OBJECT",
  properties: {
    answer: { type: "STRING" },
    source: { type: "STRING" },
    found: { type: "BOOLEAN" }
  },
  required: ["answer", "source", "found"]
};

/**
 * Chat documentaire : répond uniquement à partir du contexte déjà analysé.
 * N’accepte PAS de nouvel upload PDF — réutilise analysis/tables/evidence.
 */
export default async function handler(request, response) {
  if (request.method !== "POST") {
    return response.status(405).json({
      ok: false,
      error: { code: "UNSUPPORTED_FORMAT", message: "Méthode non autorisée." }
    });
  }

  try {
    const body =
      typeof request.body === "string"
        ? JSON.parse(request.body)
        : request.body || {};

    const question = String(body.question || "").trim();
    const analysis = body.analysis;
    const documentId = String(body.documentId || "");
    const history = Array.isArray(body.history) ? body.history.slice(-8) : [];

    if (!question || question.length < 2) {
      return response.status(400).json({
        ok: false,
        error: {
          code: "NO_USABLE_CONTENT",
          message: "Posez une question sur le document."
        }
      });
    }

    if (!analysis || typeof analysis !== "object") {
      return response.status(400).json({
        ok: false,
        error: {
          code: "NO_USABLE_CONTENT",
          message: "Aucun document analysé n’est disponible pour le chat."
        }
      });
    }

    // 1) Réponse locale prioritaire (0 appel Gemini)
    const local = tryAnswerLocally(question, analysis);

    if (
      local &&
      local.mode === "local" &&
      (local.found || isDefinitiveLocal(local, question))
    ) {
      return response.status(200).json({
        ok: true,
        documentId,
        mode: "local",
        answer: local.answer,
        source: formatSource(local.source),
        found: local.found,
        reusedAnalysis: true
      });
    }

    // 2) Raisonnement Gemini uniquement sur le contexte déjà extrait
    if (!process.env.GEMINI_API_KEY) {
      if (local) {
        return response.status(200).json({
          ok: true,
          documentId,
          mode: "local",
          answer: local.answer,
          source: formatSource(local.source),
          found: local.found,
          reusedAnalysis: true
        });
      }

      // Sans clé : ne jamais inventer — réponse prudente
      return response.status(200).json({
        ok: true,
        documentId,
        mode: "local",
        answer: "Je ne trouve pas cette information dans le document.",
        source: formatSource("du document analysé"),
        found: false,
        reusedAnalysis: true
      });
    }

    const context = buildDocumentContext(analysis);
    const gemini = await askGeminiWithContext(question, context, history);

    if (!gemini.ok) {
      if (local) {
        return response.status(200).json({
          ok: true,
          documentId,
          mode: "local",
          answer: local.answer,
          source: formatSource(local.source),
          found: local.found,
          reusedAnalysis: true
        });
      }

      const quota = /quota|rate limit/i.test(
        String(gemini.detail?.error?.message || "")
      );

      return response.status(quota ? 429 : 502).json({
        ok: false,
        error: {
          code: quota ? "API_QUOTA_EXCEEDED" : "EMPTY_AI_RESPONSE",
          message: quota
            ? "Le quota du service d’analyse est dépassé. Réessayez dans une minute."
            : "Le service d’analyse n’a pas répondu. Réessayez dans quelques instants."
        }
      });
    }

    return response.status(200).json({
      ok: true,
      documentId,
      mode: "gemini",
      answer: gemini.answer,
      source: formatSource(gemini.source),
      found: gemini.found,
      reusedAnalysis: true
    });
  } catch (error) {
    console.error(error);

    return response.status(500).json({
      ok: false,
      error: {
        code: "UNKNOWN_ERROR",
        message: "Une erreur est survenue pendant la réponse."
      }
    });
  }
}

function isDefinitiveLocal(local, question) {
  // notFound is definitive for factual lookups already handled
  if (!local.found) {
    return /montant|date|expéditeur|résume|que dois|pourquoi|signature|total/i.test(
      question
    );
  }

  return true;
}

function formatSource(source) {
  const text = String(source || "document analysé").trim();

  if (/^cette information/i.test(text)) {
    return text;
  }

  return `Cette information provient ${
    /^(du|de la|des|d’|d')/i.test(text) ? text : `de : ${text}`
  }.`;
}

async function askGeminiWithContext(question, context, history) {
  const models = [...new Set(FALLBACK_MODELS)];
  let lastDetail = null;

  const historyText = history
    .map((item) => {
      const role = item?.role === "assistant" ? "Assistant" : "Utilisateur";
      return `${role}: ${String(item?.content || "").slice(0, 500)}`;
    })
    .join("\n");

  const prompt = `
Tu es ExpliqueMoi, assistant documentaire français.

Tu réponds UNIQUEMENT à partir du CONTEXTE DOCUMENTAIRE fourni ci-dessous
(résumé, tableaux, dates, montants, preuves, entités).

RÈGLES STRICTES :
- Ne jamais inventer.
- Si l'information n'est pas dans le contexte, found=false et answer=
  "Je ne trouve pas cette information dans le document."
- Toujours indiquer une source courte (ex: "du tableau des échéances",
  "du paragraphe cité dans evidence", "du montant principal").
- Réponds en français, phrases courtes.
- Tu n'as PAS le PDF brut : uniquement ce JSON de contexte.

CONTEXTE DOCUMENTAIRE (JSON) :
${JSON.stringify(context, null, 2)}

HISTORIQUE (document courant uniquement) :
${historyText || "Aucun."}

QUESTION :
${question}

Réponds en JSON { "answer", "source", "found" }.
`.trim();

  for (const model of models) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.1,
              responseMimeType: "application/json",
              responseSchema: CHAT_SCHEMA
            }
          })
        }
      );

      const data = await response.json();

      if (!response.ok) {
        lastDetail = data;

        if (
          response.status === 404 ||
          /not found|unknown model/i.test(String(data?.error?.message || ""))
        ) {
          continue;
        }

        if (response.status === 429) {
          continue;
        }

        return { ok: false, detail: data };
      }

      const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
      let parsed;

      try {
        parsed = JSON.parse(raw);
      } catch {
        const start = raw.indexOf("{");
        const end = raw.lastIndexOf("}");
        parsed =
          start >= 0 && end > start
            ? JSON.parse(raw.slice(start, end + 1))
            : null;
      }

      if (!parsed || typeof parsed.answer !== "string") {
        lastDetail = { empty: true };
        continue;
      }

      const found = parsed.found !== false;
      const answer = String(parsed.answer || "").trim();

      return {
        ok: true,
        answer:
          answer ||
          "Je ne trouve pas cette information dans le document.",
        source: String(parsed.source || "du contexte documentaire analysé"),
        found:
          found &&
          !/je ne trouve pas cette information dans le document/i.test(answer)
      };
    } catch (error) {
      lastDetail = { message: error?.message || "fetch failed" };
    }
  }

  return { ok: false, detail: lastDetail };
}
