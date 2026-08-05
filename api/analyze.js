export const config = {
  api: {
    bodyParser: false
  }
};

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_TOTAL_SIZE = 20 * 1024 * 1024;
const MAX_PAGES = 10;

export default async function handler(request, response) {
  if (request.method !== "POST") {
    return response.status(405).json({
      error: "Méthode non autorisée."
    });
  }

  try {
    const formData = await readMultipartRequest(request);

    const text = String(formData.get("text") || "").trim();
    const pages = await extractPages(formData);

    if (!pages.length && text.length < 20) {
      return response.status(400).json({
        error: "Aucun document ou texte exploitable n’a été reçu."
      });
    }

    if (pages.length > MAX_PAGES) {
      return response.status(400).json({
        error: "Le document dépasse la limite de 10 pages."
      });
    }

    const totalSize = pages.reduce(
      (sum, page) => sum + page.size,
      0
    );

    if (totalSize > MAX_TOTAL_SIZE) {
      return response.status(413).json({
        error: "La sélection dépasse la taille totale acceptée."
      });
    }

    for (const page of pages) {
      if (page.size > MAX_FILE_SIZE) {
        return response.status(413).json({
          error: `La page « ${page.name} » dépasse la limite de 10 Mo.`
        });
      }
    }

    const parts = [
      {
        text: buildPrompt(text, pages.length)
      }
    ];

    for (const page of pages) {
      parts.push({
        text:
          `--- Page ${page.order + 1} / ${pages.length} ---\n` +
          `Nom: ${page.name}\n` +
          `Type: ${page.mimeType}\n` +
          `Rotation déclarée: ${page.rotation}°\n` +
          `Ordre: ${page.order}`
      });

      parts.push({
        inlineData: {
          mimeType: page.mimeType || "application/octet-stream",
          data: page.base64
        }
      });
    }

    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts
            }
          ],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: "application/json"
          }
        })
      }
    );

    const geminiData = await geminiResponse.json();

    if (!geminiResponse.ok) {
      console.error(geminiData);

      return response.status(502).json({
        error: "L’IA n’a pas pu analyser le document."
      });
    }

    const rawText =
      geminiData.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!rawText) {
      throw new Error("Réponse IA vide.");
    }

    const result = JSON.parse(rawText);

    return response.status(200).json(validateResult(result));
  } catch (error) {
    console.error(error);

    return response.status(500).json({
      error: "Une erreur est survenue pendant l’analyse."
    });
  }
}

async function readMultipartRequest(request) {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(chunk);
  }

  const body = Buffer.concat(chunks);

  const nativeRequest = new Request("http://localhost/api/analyze", {
    method: "POST",
    headers: {
      "content-type": request.headers["content-type"] || ""
    },
    body
  });

  return nativeRequest.formData();
}

/*
 * Accepte :
 * - multi-pages via manifest + page_N
 * - mono-fichier legacy via "file"
 */
async function extractPages(formData) {
  const pages = [];

  let manifest = null;

  const rawManifest = formData.get("manifest");

  if (typeof rawManifest === "string" && rawManifest.trim()) {
    try {
      manifest = JSON.parse(rawManifest);
    } catch {
      manifest = null;
    }
  }

  if (Array.isArray(manifest?.pages) && manifest.pages.length) {
    const ordered = [...manifest.pages].sort(
      (a, b) => Number(a.order) - Number(b.order)
    );

    for (const [index, meta] of ordered.entries()) {
      const field =
        meta.field || `page_${index}`;

      const file = formData.get(field);

      if (!file || typeof file === "string") {
        continue;
      }

      const bytes = Buffer.from(await file.arrayBuffer());

      pages.push({
        order: index,
        name:
          cleanText(meta.name) ||
          file.name ||
          `page-${index + 1}`,
        mimeType:
          cleanText(meta.mimeType) ||
          file.type ||
          "application/octet-stream",
        rotation: normalizeRotation(meta.rotation),
        size: bytes.length,
        base64: bytes.toString("base64")
      });
    }

    // Manifest exploitable : format multi-pages
    if (pages.length) {
      return pages;
    }

    // Manifest présent mais pages illisibles → fallback legacy "file"
  }

  // Format historique : un seul champ "file" (et/ou texte collé)
  const legacyFile = formData.get("file");

  if (legacyFile && typeof legacyFile !== "string") {
    const bytes = Buffer.from(await legacyFile.arrayBuffer());

    pages.push({
      order: 0,
      name: legacyFile.name || "document",
      mimeType:
        legacyFile.type || "application/octet-stream",
      rotation: 0,
      size: bytes.length,
      base64: bytes.toString("base64")
    });
  }

  return pages;
}

function normalizeRotation(value) {
  const number = Number(value) || 0;
  const normalized = ((number % 360) + 360) % 360;

  return [0, 90, 180, 270].includes(normalized)
    ? normalized
    : 0;
}

function cleanText(value) {
  return typeof value === "string"
    ? value.replace(/\s+/g, " ").trim()
    : "";
}

function buildPrompt(pastedText, pageCount) {
  const multiPageRules =
    pageCount > 1
      ? `
DOCUMENT MULTI-PAGES :
- Tu reçois ${pageCount} pages d'UN SEUL document, déjà ordonnées.
- Analyse-les comme un document unique et cohérent.
- Si une page est illisible, continue avec les autres.
- Signale clairement les passages illisibles sans inventer leur contenu.
- Dans evidence.page, indique "Page 1", "Page 2", etc. selon l'ordre fourni.
`
      : "";

  return `
Tu es ExpliqueMoi, un assistant qui explique les documents français
de manière directe, courte et vérifiable.

Analyse le document fourni.

OBJECTIF :
L'utilisateur doit savoir immédiatement :
1. quel est ce document ;
2. ce qu'on lui demande ;
3. comment il doit le faire ;
4. avant quelle date ;
5. pourquoi il l'a reçu ;
6. où ces informations apparaissent.

RÈGLES :
- Ne fais jamais de résumé vague.
- Utilise des phrases courtes et concrètes.
- Maximum trois actions.
- Chaque date doit avoir un rôle précis.
- Ne liste jamais une date sans dire à quoi elle correspond.
- Ne confonds pas date d'édition, date de référence et date limite.
- N'invente jamais de montant, d'action ou de délai.
- Quand une information est illisible ou absente, écris :
  "Information non trouvée avec certitude".
- Pour chaque conclusion importante, cite le passage exact.
- En matière fiscale, juridique ou médicale, explique sans prétendre
  remplacer un professionnel.
${multiPageRules}
Réponds exclusivement avec ce JSON :

{
  "document_type": "type précis et nom de l'organisme si visible",
  "plain_summary": "une phrase très claire commençant par C'est...",
  "request": "ce que le document demande concrètement",
  "why_received": "raison probable ou explicite de réception",
  "urgency": {
    "level": "none | soon | urgent | uncertain",
    "message": "une phrase courte"
  },
  "actions": [
    {
      "action": "action courte",
      "how": "comment la réaliser"
    }
  ],
  "dates": [
    {
      "date": "date",
      "label": "date limite | date du document | date de prélèvement | autre",
      "meaning": "ce qui se passe à cette date"
    }
  ],
  "amount": {
    "value": "montant principal ou Information non trouvée avec certitude",
    "meaning": "à quoi correspond ce montant"
  },
  "evidence": [
    {
      "page": "Page X ou emplacement",
      "quote": "court passage exact",
      "explanation": "ce que prouve ce passage"
    }
  ],
  "confidence": 0
}

Texte collé par l'utilisateur, s'il existe :
${pastedText || "Aucun texte collé."}
  `.trim();
}

function validateResult(result) {
  return {
    document_type:
      result.document_type || "Document non identifié",

    plain_summary:
      result.plain_summary ||
      "C’est un document dont l’objet n’a pas été identifié avec certitude.",

    request:
      result.request ||
      "Information non trouvée avec certitude",

    why_received:
      result.why_received ||
      "Information non trouvée avec certitude",

    urgency: {
      level:
        ["none", "soon", "urgent", "uncertain"].includes(
          result.urgency?.level
        )
          ? result.urgency.level
          : "uncertain",

      message:
        result.urgency?.message ||
        "Le niveau d’urgence n’a pas été déterminé."
    },

    actions: Array.isArray(result.actions)
      ? result.actions.slice(0, 3)
      : [],

    dates: Array.isArray(result.dates)
      ? result.dates.slice(0, 5)
      : [],

    amount: result.amount || {
      value: "Information non trouvée avec certitude",
      meaning: ""
    },

    evidence: Array.isArray(result.evidence)
      ? result.evidence.slice(0, 6)
      : [],

    confidence: Number.isFinite(result.confidence)
      ? Math.max(0, Math.min(100, result.confidence))
      : 0
  };
}
