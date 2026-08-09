/**
 * E — Adaptateur convocation AG de copropriété.
 */

const TIME_RE =
  /\b(?:à|a)\s+(\d{1,2}\s*h(?:\d{2})?|\d{1,2}:\d{2})\b/i;
const PLACE_RE =
  /\b(?:lieu|adresse de la réunion|se tiendra(?:\s+à)?)\s*[:\-]?\s*([^\n.]{8,120})/i;

export function adaptCondoMeeting(ctx) {
  const { text, extraction, detection } = ctx;

  const meetingDate =
    extraction.dates.find((d) => d.role === "meetingDate" && d.important) ||
    extraction.dates.find((d) =>
      /assemblée|assemblee|ag\b|réunion|reunion|convocation/.test(
        String(d.context || "").toLowerCase()
      )
    ) ||
    null;

  const timeMatch = text.match(TIME_RE);
  const placeMatch = text.match(PLACE_RE);

  const issuer =
    extraction.entities.organizations.find((o) => /syndic/i.test(o)) ||
    extraction.entities.organizations[0] ||
    findLabeled(text, /syndic\s*[:\-]\s*(.+)/i) ||
    null;

  const actions = [];
  for (const phrase of extraction.actionPhrases || []) {
    if (/procuration|pouvoir|participer|voter|correspondance/i.test(phrase.phrase)) {
      actions.push({
        action: cleanAction(phrase.phrase),
        how: "Selon les modalités indiquées dans la convocation",
        confidence: phrase.confidence
      });
    }
  }
  if (!actions.length && /procuration|pouvoir/i.test(text)) {
    actions.push({
      action: "Participer à l’AG ou donner procuration",
      how: "Utiliser le formulaire de pouvoir joint si disponible",
      confidence: 70
    });
  }

  const agenda = extractAgenda(text);

  const importantFacts = [
    meetingDate && {
      kind: "date",
      label: "Date de l’assemblée",
      value: meetingDate.raw,
      confidence: meetingDate.confidence
    },
    timeMatch && {
      kind: "time",
      label: "Heure",
      value: timeMatch[1].replace(/\s+/g, ""),
      confidence: 75
    },
    placeMatch && {
      kind: "place",
      label: "Lieu",
      value: placeMatch[1].trim(),
      confidence: 70
    },
    issuer && {
      kind: "issuer",
      label: "Syndic / organisateur",
      value: issuer,
      confidence: 70
    },
    agenda.length && {
      kind: "agenda",
      label: "Ordre du jour",
      value: agenda.slice(0, 3).join(" · "),
      confidence: 65
    }
  ].filter(Boolean);

  return {
    family: "copropriete",
    documentType:
      detection.documentType ||
      "Convocation à une assemblée générale de copropriété",
    understandingLevel: meetingDate ? "strong" : "probable",
    confidence: Math.max(detection.confidence || 0, meetingDate ? 86 : 60),
    issuer,
    recipient: null,
    mainDate: meetingDate
      ? {
          date: meetingDate.raw,
          label: "Date de l’assemblée",
          meaning: timeMatch
            ? `AG prévue à ${timeMatch[1].replace(/\s+/g, "")}`
            : "Date de l’assemblée générale",
          role: "meetingDate"
        }
      : null,
    mainAmount: null,
    importantFacts: importantFacts.slice(0, 6),
    actions: actions.slice(0, 4),
    deadlines: meetingDate
      ? [
          {
            date: meetingDate.raw,
            label: "Date de l’AG",
            meaning: "Date de tenue de l’assemblée",
            confidence: meetingDate.confidence
          }
        ]
      : [],
    whyReceived:
      "Vous êtes convoqué(e) à une assemblée générale de copropriété.",
    documentPurpose:
      "Informer les copropriétaires de la tenue d’une AG et des modalités de participation.",
    attentionLevel: meetingDate ? "soon" : "uncertain",
    evidence: [
      meetingDate && {
        page: "Page 1",
        quote: meetingDate.context || meetingDate.raw,
        explanation: "Date de l’assemblée générale"
      },
      /ordre du jour/i.test(text) && {
        page: "Page 1",
        quote: "ordre du jour",
        explanation: "Présence d’un ordre du jour"
      }
    ].filter(Boolean),
    warnings: [],
    uncertainties: [
      !meetingDate && "La date de l’AG n’a pas pu être lue avec certitude.",
      !timeMatch && "L’heure de l’AG n’a pas été identifiée.",
      !placeMatch && "Le lieu de l’AG n’a pas été identifié."
    ].filter(Boolean)
  };
}

function extractAgenda(text) {
  const block = String(text || "").match(
    /ordre du jour\s*[:\-]?\s*([\s\S]{0,600})/i
  );
  if (!block) return [];
  return block[1]
    .split(/\n|•|\d+[\)\.]/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length >= 8 && line.length <= 120)
    .slice(0, 6);
}

function cleanAction(phrase) {
  const text = String(phrase || "").replace(/\s+/g, " ").trim();
  return text.length > 120 ? `${text.slice(0, 117)}…` : text;
}

function findLabeled(text, re) {
  const match = String(text || "").match(re);
  return match ? match[1].trim() : null;
}
