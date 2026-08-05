const MODEL = "gemini-3.5-flash";

export default async function handler(request, response) {
  if (request.method !== "POST") {
    return response.status(405).json({
      error: "Méthode non autorisée."
    });
  }

  try {
    if (!process.env.GEMINI_API_KEY) {
      return response.status(500).json({
        error: "La clé Gemini n’est pas configurée."
      });
    }

    const body =
      typeof request.body === "string"
        ? JSON.parse(request.body)
        : request.body;

    const actionType = String(body?.actionType || "");
    const analysis = body?.analysis;
    const replyOptions = {
      replyType: String(body?.replyType || "email"),
      tone: String(body?.tone || "polite"),
      objective: String(body?.objective || "").slice(0, 400),
      userNotes: String(body?.userNotes || "").slice(0, 600)
    };

    if (!analysis || !actionType) {
      return response.status(400).json({
        error: "L’analyse ou le type d’aide est manquant."
      });
    }

    const allowedActions = [
      "reply",
      "fill",
      "checklist",
      "questions"
    ];

    if (!allowedActions.includes(actionType)) {
      return response.status(400).json({
        error: "Type d’aide non reconnu."
      });
    }

    // Réutilise le contexte déjà analysé — jamais le PDF brut
    const prompt = buildAssistPrompt(actionType, analysis, replyOptions);

    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: prompt
                }
              ]
            }
          ],
          generationConfig: {
            temperature: 0.15,
            responseMimeType: "application/json",
            responseSchema: {
              type: "OBJECT",
              properties: {
                title: {
                  type: "STRING"
                },
                introduction: {
                  type: "STRING"
                },
                steps: {
                  type: "ARRAY",
                  items: {
                    type: "OBJECT",
                    properties: {
                      label: {
                        type: "STRING"
                      },
                      instruction: {
                        type: "STRING"
                      },
                      source: {
                        type: "STRING"
                      },
                      certainty: {
                        type: "STRING",
                        enum: [
                          "certain",
                          "to_confirm",
                          "unknown"
                        ]
                      }
                    },
                    required: [
                      "label",
                      "instruction",
                      "source",
                      "certainty"
                    ]
                  }
                },
                draft: {
                  type: "STRING"
                },
                warnings: {
                  type: "ARRAY",
                  items: {
                    type: "STRING"
                  }
                },
                missing_information: {
                  type: "ARRAY",
                  items: {
                    type: "STRING"
                  }
                }
              },
              required: [
                "title",
                "introduction",
                "steps",
                "draft",
                "warnings",
                "missing_information"
              ]
            }
          }
        })
      }
    );

    const geminiData = await geminiResponse.json();

    if (!geminiResponse.ok) {
      console.error("Gemini assist error:", geminiData);

      return response.status(502).json({
        error:
          geminiData?.error?.message ||
          "L’IA n’a pas pu préparer cette aide."
      });
    }

    const raw =
      geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!raw) {
      throw new Error("La réponse de l’IA est vide.");
    }

    const result = JSON.parse(raw);

    return response.status(200).json({
      title: cleanText(result.title),
      introduction: cleanText(result.introduction),
      steps: normalizeSteps(result.steps),
      draft: String(result.draft || "").trim(),
      warnings: normalizeStrings(result.warnings),
      missing_information: normalizeStrings(
        result.missing_information
      )
    });
  } catch (error) {
    console.error("Assist function error:", error);

    return response.status(500).json({
      error:
        error?.message ||
        "Une erreur est survenue pendant la préparation de l’aide."
    });
  }
}

function buildAssistPrompt(actionType, analysis, replyOptions = {}) {
  const toneMap = {
    simple: "simple et direct",
    polite: "poli et naturel",
    formal: "formel et administratif",
    firm: "ferme mais respectueux"
  };

  const typeMap = {
    email: "un e-mail",
    letter: "une lettre",
    short: "un message court",
    admin: "une réponse administrative",
    info: "une demande d'information",
    dispute: "une contestation simple",
    confirm: "une confirmation",
    followup: "une relance"
  };

  const actionInstructions = {
    reply: `
Prépare ${typeMap[replyOptions.replyType] || "une réponse"} adaptée au document.

Ton demandé : ${toneMap[replyOptions.tone] || "poli et naturel"}.
Objectif utilisateur : ${replyOptions.objective || "non précisé"}.
Notes utilisateur (à utiliser seulement si pertinentes) :
${replyOptions.userNotes || "Aucune."}

La réponse doit :
- s'appuyer UNIQUEMENT sur le contexte d'analyse fourni (pas de PDF brut) ;
- reprendre uniquement les faits réellement présents ;
- laisser entre crochets les informations personnelles manquantes
  ([Votre nom], [Votre adresse], [Numéro de dossier], [Date]) ;
- ne jamais inventer identité, adresse, numéro de dossier, date, montant, référence ;
- ne jamais prétendre qu'une pièce est jointe si cela n'est pas confirmé ;
- ne jamais reconnaître une dette, une faute ou une obligation incertaine ;
- signaler ce qui doit être vérifié avant l'envoi.
`,

    fill: `
Guide l'utilisateur pour remplir précisément le document.

Pour chaque champ identifiable :
- donne le nom du champ ;
- explique ce qu'il faut inscrire ;
- cite la preuve ou l'indication disponible ;
- écris "À confirmer" lorsqu'une donnée personnelle manque ;
- distingue clairement les zones réservées à l'administration ;
- n'invente jamais de numéro fiscal, montant, adresse ou identité.

Ne donne pas une checklist générique.
Base chaque étape sur le document analysé.
`,

    checklist: `
Crée uniquement la liste des pièces réellement demandées ou fortement
justifiées par l'analyse.

Pour chaque pièce :
- indique pourquoi elle est nécessaire ;
- cite la source disponible ;
- écris "À confirmer auprès de l'organisme" lorsque ce n'est pas certain.

Ne propose pas automatiquement une pièce d'identité, un RIB ou un
justificatif de domicile sans preuve.
`,

    questions: `
Prépare les questions utiles à poser à l'organisme.

Les questions doivent cibler :
- les informations manquantes ;
- les délais ambigus ;
- les montants incertains ;
- les modalités d'envoi ;
- les conséquences éventuelles ;
- les champs que l'utilisateur ne peut pas remplir avec certitude.

Évite les questions génériques déjà résolues par le document.
`
  };

  return `
Tu es le module d'accompagnement d'ExpliqueMoi.

Tu aides une personne à agir après l'analyse d'un document français.

RÈGLES ABSOLUES :
- Base-toi exclusivement sur l'analyse fournie.
- N'invente aucune information personnelle.
- N'invente aucune obligation.
- N'invente aucune pièce justificative.
- N'invente aucune case ou rubrique.
- Une information absente doit être indiquée comme manquante.
- Une information incertaine doit être marquée "À confirmer".
- Ne remplace pas un avocat, un comptable, un médecin ou une administration.
- Le résultat doit être concret, court et directement exploitable.
- Chaque étape doit comporter une source issue de l'analyse lorsqu'elle existe.

TYPE D'AIDE :
${actionInstructions[actionType]}

ANALYSE DU DOCUMENT :
${JSON.stringify(analysis, null, 2)}

Réponds uniquement dans le format JSON demandé.
  `.trim();
}

function cleanText(value) {
  return typeof value === "string"
    ? value.replace(/\s+/g, " ").trim()
    : "";
}

function normalizeStrings(values) {
  if (!Array.isArray(values)) {
    return [];
  }

  return values
    .map(cleanText)
    .filter(Boolean)
    .slice(0, 10);
}

function normalizeSteps(steps) {
  if (!Array.isArray(steps)) {
    return [];
  }

  return steps
    .slice(0, 15)
    .map((step) => ({
      label:
        cleanText(step?.label) ||
        "Étape",

      instruction:
        cleanText(step?.instruction) ||
        "Information à confirmer.",

      source:
        cleanText(step?.source) ||
        "Aucune source précise disponible.",

      certainty:
        ["certain", "to_confirm", "unknown"].includes(
          step?.certainty
        )
          ? step.certainty
          : "unknown"
    }));
}
