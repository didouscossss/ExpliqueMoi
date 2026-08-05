export const config = {
  api: {
    bodyParser: false
  }
};

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_TOTAL_SIZE = 20 * 1024 * 1024;
const MAX_PAGES = 10;

const HETEROGENEOUS_BATCH_WARNING =
  "Ces pages semblent appartenir à plusieurs documents différents. Pour une explication plus précise, analysez-les séparément.";

export default async function handler(request, response) {
  if (request.method !== "POST") {
    return response.status(405).json({
      error: "Méthode non autorisée.",
      error_kind: "batch"
    });
  }

  // Contexte local à CETTE requête uniquement — jamais réutilisé
  const requestContext = {
    pages: [],
    manifest: null,
    pageErrors: [],
    warnings: [],
    rawBody: null
  };

  try {
    const formData = await readMultipartRequest(request);

    const text = String(formData.get("text") || "").trim();
    const clientBatchWarning = String(
      formData.get("batch_warning") || ""
    ).trim();

    // Manifeste toujours recréé/parsé à zéro pour cette requête
    requestContext.manifest = parseManifest(formData);

    const extraction = await extractPages(formData, requestContext.manifest);
    requestContext.pages = extraction.pages;
    requestContext.pageErrors = extraction.pageErrors;

    if (!requestContext.pages.length && text.length < 20) {
      const pdfFailure = requestContext.pageErrors.find((item) =>
        /pdf/i.test(`${item.mimeType || ""} ${item.message || ""}`)
      );

      return response.status(400).json({
        error: pdfFailure
          ? pdfFailure.message ||
            "Le PDF n’a pas pu être lu. Envoyez un PDF valide, seul."
          : requestContext.pageErrors.length
            ? "Aucune page exploitable n’a pu être extraite."
            : "Aucun document ou texte exploitable n’a été reçu.",
        error_kind: pdfFailure ? "pdf" : "batch",
        page_errors: requestContext.pageErrors,
        warnings: []
      });
    }

    if (requestContext.pages.length > MAX_PAGES) {
      return response.status(400).json({
        error: "Le document dépasse la limite de 10 pages.",
        error_kind: "batch"
      });
    }

    const totalSize = requestContext.pages.reduce(
      (sum, page) => sum + page.size,
      0
    );

    if (totalSize > MAX_TOTAL_SIZE) {
      return response.status(413).json({
        error: "La sélection dépasse la taille totale acceptée.",
        error_kind: "batch"
      });
    }

    for (const page of requestContext.pages) {
      if (page.size > MAX_FILE_SIZE) {
        return response.status(413).json({
          error: `La page « ${page.name} » dépasse la limite de 10 Mo.`,
          error_kind:
            page.mimeType === "application/pdf" ? "pdf" : "page"
        });
      }
    }

    const heterogeneous =
      requestContext.manifest?.heterogeneous === true ||
      detectHeterogeneousPages(requestContext.pages);

    if (heterogeneous) {
      requestContext.warnings.push(HETEROGENEOUS_BATCH_WARNING);
    } else if (clientBatchWarning) {
      requestContext.warnings.push(clientBatchWarning);
    }

    for (const pageError of requestContext.pageErrors) {
      requestContext.warnings.push(
        pageError.message ||
          `La page « ${pageError.name || "?"} » n’a pas pu être lue.`
      );
    }

    const parts = [
      {
        text: buildPrompt(
          text,
          requestContext.pages.length,
          heterogeneous
        )
      }
    ];

    for (const page of requestContext.pages) {
      parts.push({
        text:
          `--- Page ${page.order + 1} / ${requestContext.pages.length} ---\n` +
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

    const pdfOnly =
      requestContext.pages.length > 0 &&
      requestContext.pages.every(
        (page) => page.mimeType === "application/pdf"
      );

    // Chaque requête appelle Gemini indépendamment (pas de cache / état partagé)
    const geminiResult = await callGeminiForAnalysis(parts, {
      retries: pdfOnly || requestContext.pages.length === 1 ? 1 : 0
    });

    if (!geminiResult.ok) {
      console.error(geminiResult.detail);

      return response.status(502).json({
        error: pdfOnly
          ? "L’IA n’a pas pu lire ce PDF. Réessayez avec ce fichier seul."
          : "L’IA n’a pas pu analyser le document.",
        error_kind: pdfOnly ? "pdf" : "backend",
        warnings: [],
        page_errors: requestContext.pageErrors
      });
    }

    let result;

    try {
      result = JSON.parse(geminiResult.rawText);
    } catch {
      throw Object.assign(
        new Error("Réponse IA illisible."),
        { errorKind: "backend" }
      );
    }

    const validated = validateResult(
      result,
      requestContext.warnings,
      requestContext.pageErrors,
      heterogeneous
    );

    if (!hasUsableContent(validated)) {
      return response.status(422).json({
        error:
          "Aucun contenu exploitable n’a pu être extrait de ce document.",
        error_kind: "batch",
        reading_quality: "failed",
        warnings: [],
        page_errors: requestContext.pageErrors
      });
    }

    return response.status(200).json(validated);
  } catch (error) {
    console.error(error);

    const kind =
      error?.errorKind ||
      (/pdf/i.test(String(error?.message || ""))
        ? "pdf"
        : "backend");

    return response.status(500).json({
      error: "Une erreur est survenue pendant l’analyse.",
      error_kind: kind,
      warnings: [],
      page_errors: requestContext.pageErrors
    });
  } finally {
    // Libère buffers et références temporaires de cette requête
    if (Array.isArray(requestContext.pages)) {
      for (const page of requestContext.pages) {
        if (page) {
          page.base64 = null;
          page.bytes = null;
        }
      }
    }

    requestContext.pages = [];
    requestContext.manifest = null;
    requestContext.pageErrors = [];
    requestContext.warnings = [];
    requestContext.rawBody = null;
  }
}

async function readMultipartRequest(request) {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(chunk);
  }

  const body = Buffer.concat(chunks);

  try {
    const nativeRequest = new Request(
      "http://localhost/api/analyze",
      {
        method: "POST",
        headers: {
          "content-type":
            request.headers["content-type"] || ""
        },
        body
      }
    );

    return nativeRequest.formData();
  } finally {
    chunks.length = 0;
  }
}

function parseManifest(formData) {
  const rawManifest = formData.get("manifest");

  if (typeof rawManifest !== "string" || !rawManifest.trim()) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawManifest);

    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    // Copie locale neuve — aucun état global
    return {
      pageCount: Number(parsed.pageCount) || 0,
      createdAt: Number(parsed.createdAt) || Date.now(),
      heterogeneous: parsed.heterogeneous === true,
      pages: Array.isArray(parsed.pages)
        ? parsed.pages.map((item, index) => ({
            order: Number(item?.order) || index,
            id: cleanText(item?.id),
            name: cleanText(item?.name),
            mimeType: cleanText(item?.mimeType),
            rotation: normalizeRotation(item?.rotation),
            field:
              cleanText(item?.field) || `page_${index}`
          }))
        : []
    };
  } catch {
    return null;
  }
}

/*
 * Accepte :
 * - multi-pages via manifest + page_N
 * - mono-fichier legacy via "file"
 * Les erreurs d’extraction sont isolées page par page.
 */
async function extractPages(formData, manifest) {
  const pages = [];
  const pageErrors = [];

  if (Array.isArray(manifest?.pages) && manifest.pages.length) {
    const ordered = [...manifest.pages].sort(
      (a, b) => Number(a.order) - Number(b.order)
    );

    for (const [index, meta] of ordered.entries()) {
      const field = meta.field || `page_${index}`;

      try {
        const file = formData.get(field);

        if (!file || typeof file === "string") {
          pageErrors.push({
            name: meta.name || field,
            mimeType: meta.mimeType || "",
            page: `Page ${index + 1}`,
            message: `La page « ${meta.name || field} » est absente ou illisible.`
          });
          continue;
        }

        const page = await readPageFile(file, {
          order: index,
          name: meta.name,
          mimeType: meta.mimeType,
          rotation: meta.rotation
        });

        pages.push(page);
      } catch (error) {
        const mimeType = meta.mimeType || "";
        const isPdf = mimeType === "application/pdf";

        pageErrors.push({
          name: meta.name || field,
          mimeType,
          page: `Page ${index + 1}`,
          message: isPdf
            ? `Le PDF « ${meta.name || "document"} » n’a pas pu être lu.`
            : `La page « ${meta.name || field} » n’a pas pu être lue.`
        });
      }
    }

    if (pages.length) {
      return { pages, pageErrors };
    }

    // Manifest présent mais pages illisibles → fallback legacy "file"
  }

  try {
    const legacyFile = formData.get("file");

    if (legacyFile && typeof legacyFile !== "string") {
      const page = await readPageFile(legacyFile, {
        order: 0,
        name: legacyFile.name || "document",
        mimeType: legacyFile.type || "application/octet-stream",
        rotation: 0
      });

      pages.push(page);
    }
  } catch (error) {
    pageErrors.push({
      name: "document",
      mimeType: "",
      page: "Page 1",
      message:
        error?.message ||
        "Le document n’a pas pu être lu."
    });
  }

  return { pages, pageErrors };
}

async function readPageFile(file, meta = {}) {
  const bytes = Buffer.from(await file.arrayBuffer());

  try {
    const mimeType =
      cleanText(meta.mimeType) ||
      file.type ||
      "application/octet-stream";

    if (!bytes.length) {
      throw Object.assign(
        new Error("Fichier vide."),
        {
          errorKind:
            mimeType === "application/pdf" ? "pdf" : "page"
        }
      );
    }

    // Chaque PDF/image est lu uniquement depuis SES propres données
    return {
      order: Number(meta.order) || 0,
      name:
        cleanText(meta.name) ||
        file.name ||
        `page-${(Number(meta.order) || 0) + 1}`,
      mimeType,
      rotation: normalizeRotation(meta.rotation),
      size: bytes.length,
      base64: bytes.toString("base64"),
      bytes: null
    };
  } finally {
    // bytes local libéré après encodage (réf. GC)
  }
}

function detectHeterogeneousPages(pages) {
  if (!Array.isArray(pages) || pages.length < 2) {
    return false;
  }

  const hasPdf = pages.some(
    (page) => page.mimeType === "application/pdf"
  );

  const hasImage = pages.some((page) =>
    String(page.mimeType || "").startsWith("image/")
  );

  if (hasPdf && hasImage) {
    return true;
  }

  const stems = pages
    .map((page) =>
      String(page.name || "")
        .toLowerCase()
        .replace(/\.[^.]+$/, "")
        .replace(
          /[-_\s]?(page|img|image|scan|doc|document)?[-_\s]?\d+$/i,
          ""
        )
        .trim()
    )
    .filter(Boolean);

  return new Set(stems).size > 1;
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

/*
 * Gemini renvoie souvent une confidence sur 0–1 (ex: 0.85).
 * L’UI et reading_quality attendent 0–100.
 * Sans cette conversion, presque tout devient « Analyse partielle ».
 */
function normalizeConfidence(value) {
  const number = Number(value);

  if (!Number.isFinite(number) || number < 0) {
    return 0;
  }

  if (number > 0 && number <= 1) {
    return Math.round(number * 100);
  }

  return Math.max(0, Math.min(100, Math.round(number)));
}

async function callGeminiForAnalysis(parts, options = {}) {
  const retries = Number(options.retries) || 0;
  let lastDetail = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
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
        lastDetail = geminiData;

        // Retry only on transient upstream errors
        if (
          attempt < retries &&
          [429, 500, 502, 503, 504].includes(geminiResponse.status)
        ) {
          await wait(350 * (attempt + 1));
          continue;
        }

        return { ok: false, detail: geminiData };
      }

      const rawText =
        geminiData.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!rawText) {
        lastDetail = {
          empty: true,
          finishReason:
            geminiData.candidates?.[0]?.finishReason || null,
          promptFeedback: geminiData.promptFeedback || null
        };

        if (attempt < retries) {
          await wait(350 * (attempt + 1));
          continue;
        }

        return { ok: false, detail: lastDetail };
      }

      return { ok: true, rawText, detail: geminiData };
    } catch (error) {
      lastDetail = {
        network: true,
        message: error?.message || "fetch failed"
      };

      if (attempt < retries) {
        await wait(350 * (attempt + 1));
        continue;
      }

      return { ok: false, detail: lastDetail };
    }
  }

  return { ok: false, detail: lastDetail };
}

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function hasUsableContent(result) {
  const summary = cleanText(result.plain_summary);
  const request = cleanText(result.request);
  const documentType = cleanText(result.document_type);
  const confidence = normalizeConfidence(result.confidence);

  const hasSummary =
    summary.length >= 20 &&
    !/indisponible|non identifié|non trouvée avec certitude/i.test(
      summary
    );

  const hasRequest =
    request.length >= 8 &&
    !/aucune demande|non trouvée avec certitude/i.test(
      request
    );

  const hasType =
    documentType.length >= 3 &&
    !/non identifié/i.test(documentType);

  const hasEvidence =
    Array.isArray(result.evidence) &&
    result.evidence.length > 0;

  return (
    hasSummary ||
    hasRequest ||
    (hasType && hasEvidence) ||
    confidence >= 35
  );
}

function buildPrompt(pastedText, pageCount, heterogeneous) {
  const multiPageRules =
    pageCount > 1
      ? `
DOCUMENT MULTI-PAGES :
- Tu reçois ${pageCount} pages, déjà ordonnées.
- Analyse-les comme un ensemble.
- Si une page est illisible, continue avec les autres.
- Ne fais pas échouer tout le lot pour une seule page illisible.
- Signale clairement les passages illisibles sans inventer leur contenu.
- Dans evidence.page, indique "Page 1", "Page 2", etc. selon l'ordre fourni.
`
      : "";

  const heterogeneousRules = heterogeneous
    ? `
LOT HÉTÉROGÈNE :
- Les pages semblent pouvoir appartenir à plusieurs documents différents.
- N’invente pas de lien entre elles.
- Explique uniquement ce qui est lisible avec certitude.
- Indique dans plain_summary si le contenu paraît mélangé.
- Mets confidence plus bas si les pages sont incohérentes entre elles.
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
- Ne prétends jamais qu'un document est lu complètement s'il ne l'est pas.
${multiPageRules}${heterogeneousRules}
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
  "confidence": 85,
  "reading_quality": "full | partial"
}

Important : confidence est un entier de 0 à 100 (pas une fraction 0–1).

Texte collé par l'utilisateur, s'il existe :
${pastedText || "Aucun texte collé."}
  `.trim();
}

function validateResult(
  result,
  extraWarnings = [],
  pageErrors = [],
  heterogeneous = false
) {
  const warnings = [];

  const pushWarning = (value) => {
    const text = cleanText(value);

    if (text && !warnings.includes(text)) {
      warnings.push(text);
    }
  };

  extraWarnings.forEach(pushWarning);

  if (Array.isArray(result?.warnings)) {
    result.warnings.forEach(pushWarning);
  }

  if (heterogeneous) {
    pushWarning(HETEROGENEOUS_BATCH_WARNING);
  }

  const confidence = normalizeConfidence(result?.confidence);

  let readingQuality = cleanText(
    result?.reading_quality
  ).toLowerCase();

  // Ne jamais forcer « partial » juste parce que Gemini a renvoyé 0.8 au lieu de 80
  if (!["full", "partial", "failed"].includes(readingQuality)) {
    readingQuality =
      warnings.length ||
      pageErrors.length ||
      confidence < 55
        ? "partial"
        : "full";
  }

  if (pageErrors.length && readingQuality === "full") {
    readingQuality = "partial";
  }

  // Lot hétérogène : partial uniquement si warning présent (déjà le cas)
  // PDF seul sans warning : ne pas hériter d’un état précédent (il n’y en a pas serveur)

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

    confidence,

    reading_quality: readingQuality,
    warnings,
    page_errors: pageErrors,
    heterogeneous: heterogeneous === true,
    batch_heterogeneous: heterogeneous === true
  };
}
