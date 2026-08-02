export const config = {
  api: {
    bodyParser: false
  }
};

const MAX_FILE_SIZE = 10 * 1024 * 1024;

export default async function handler(request, response) {
  if (request.method !== "POST") {
    return response.status(405).json({
      error: "Méthode non autorisée."
    });
  }

  try {
    const formData = await readMultipartRequest(request);

    const file = formData.get("file");
    const text = String(formData.get("text") || "").trim();

    if (!file && text.length < 20) {
      return response.status(400).json({
        error: "Aucun document ou texte exploitable n’a été reçu."
      });
    }

    if (file && file.size > MAX_FILE_SIZE) {
      return response.status(413).json({
        error: "Le fichier dépasse la limite de 10 Mo."
      });
    }

    const parts = [
      {
        text: buildPrompt(text)
      }
    ];

    if (file) {
      const bytes = Buffer.from(await file.arrayBuffer());

      parts.push({
        inlineData: {
          mimeType: file.type || "application/octet-stream",
          data: bytes.toString("base64")
        }
      });
    }

    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
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

function buildPrompt(pastedText) {
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
