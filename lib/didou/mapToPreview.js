/**
 * Mappe DidouResult → forme attendue par enrichAnalysisResult / frontend.
 */

/**
 * @param {object} didou
 * @returns {object} raw analysis compatible Gemini/enrichissement
 */
export function didouResultToPreviewAnalysis(didou) {
  const summary = didou.userSummary || {};
  const mainDate = didou.mainDate;
  const mainAmount = didou.mainAmount;

  const dates = [];
  if (mainDate?.date) {
    dates.push({
      date: mainDate.date,
      type: mapDateRoleToType(mainDate.role),
      label: mainDate.label || "Date importante",
      meaning: mainDate.meaning || "",
      page: "Page 1",
      context: mainDate.meaning || mainDate.label || "",
      confidence: 80
    });
  }
  for (const d of didou.deadlines || []) {
    if (mainDate && d.date === mainDate.date) continue;
    dates.push({
      date: d.date,
      type: "deadline",
      label: d.label || "Échéance",
      meaning: d.meaning || "",
      page: "Page 1",
      context: d.meaning || "",
      confidence: d.confidence || 70
    });
  }

  const amounts = [];
  if (mainAmount?.value) {
    amounts.push({
      value: mainAmount.value,
      label: mainAmount.label || "Montant principal",
      kind: mapAmountRoleToKind(mainAmount.role),
      page: "Page 1",
      context: mainAmount.meaning || "",
      confidence: 85
    });
  }

  const warnings = [
    ...(didou.warnings || []),
    ...(didou.uncertainties || []).map((u) => String(u))
  ];

  return {
    engine: "didou",
    document_family: didou.family || "autre",
    identification_level: mapUnderstandingLevel(didou.understandingLevel),
    document_type:
      summary.document_label ||
      didou.documentType ||
      (didou.family && didou.family !== "autre"
        ? `Document ${didou.family}`
        : "Document"),
    issuer: didou.issuer || "",
    plain_summary:
      summary.one_sentence ||
      "C’est un document analysé localement par Didou.",
    request:
      didou.actions?.[0]?.action ||
      (didou.actions?.length
        ? didou.actions[0].action
        : "Aucune action particulière n’est demandée."),
    why_received:
      didou.whyReceived ||
      "Information non trouvée avec certitude",
    user_summary: {
      document_label: summary.document_label || didou.documentType || "Document",
      one_sentence: summary.one_sentence || "",
      important_points: summary.important_points || [],
      main_date: mainDate
        ? {
            date: mainDate.date,
            label: mainDate.label || "",
            meaning: mainDate.meaning || ""
          }
        : null,
      main_amount: mainAmount
        ? {
            value: mainAmount.value,
            label: mainAmount.label || "",
            meaning: mainAmount.meaning || ""
          }
        : null,
      main_action: didou.actions?.[0]
        ? {
            action: didou.actions[0].action,
            how: didou.actions[0].how || ""
          }
        : null
    },
    urgency: {
      level: didou.attentionLevel || "uncertain",
      message: attentionMessage(didou.attentionLevel)
    },
    actions: (didou.actions || []).map((item) => ({
      action: item.action,
      how: item.how || "",
      page: item.page || "Page 1",
      context: item.context || "",
      confidence: item.confidence || 70
    })),
    dates,
    deadlines: didou.deadlines || [],
    timeline: dates.map((d) => ({
      date: d.date,
      label: d.label,
      meaning: d.meaning
    })),
    amount: mainAmount
      ? {
          value: mainAmount.value,
          meaning: mainAmount.meaning || mainAmount.label || ""
        }
      : {
          value: "Information non trouvée avec certitude",
          meaning: ""
        },
    amounts,
    amounts_detail: amounts.map((a) => ({
      label: a.label,
      value: a.value,
      kind: a.kind,
      page: a.page
    })),
    tables: Array.isArray(didou.tables) ? didou.tables : [],
    references: (didou.references || []).map((r) => ({
      value: r.value,
      type: r.type || "other",
      page: "Page 1",
      context: r.context || "",
      confidence: r.confidence || 65
    })),
    persons: [
      ...(didou.issuer
        ? [
            {
              name: didou.issuer,
              role: "organization",
              page: "Page 1",
              context: "Émetteur",
              confidence: 70
            }
          ]
        : []),
      ...(didou.recipient
        ? [
            {
              name: didou.recipient,
              role: "recipient",
              page: "Page 1",
              context: "Destinataire",
              confidence: 65
            }
          ]
        : [])
    ],
    requiredDocuments: [],
    risks: [],
    entities: {
      people: didou.entities?.people || [],
      addresses: didou.entities?.addresses || [],
      references: (didou.references || []).map((r) => r.value),
      signatures: [],
      organizations: didou.entities?.organizations || []
    },
    evidence: (didou.evidence || []).slice(0, 6),
    contradictions: [],
    confidence: Number(didou.confidence) || 0,
    reading_quality: readingQualityFromLevel(didou.understandingLevel),
    warnings,
    didou: {
      engine: didou.engine,
      version: didou.version,
      understandingLevel: didou.understandingLevel,
      family: didou.family,
      documentPurpose: didou.documentPurpose,
      uncertainties: didou.uncertainties || []
    }
  };
}

function mapUnderstandingLevel(level) {
  if (level === "strong") return "strong";
  if (level === "probable") return "probable";
  return "unknown";
}

function readingQualityFromLevel(level) {
  if (level === "extraction") return "partial";
  return "full";
}

function mapDateRoleToType(role) {
  const map = {
    meetingDate: "meeting_date",
    deadline: "deadline",
    coveredPeriod: "period",
    paymentDate: "payment_date",
    issueDate: "issue_date",
    historical: "historical",
    legalMention: "legal_mention"
  };
  return map[role] || "other";
}

function mapAmountRoleToKind(role) {
  const map = {
    paymentAmount: "paid",
    amountDue: "to_pay",
    refund: "refund",
    salary: "salary",
    ht: "ht",
    vat: "vat",
    deposit: "deposit",
    penalty: "penalty",
    table_value: "table_value"
  };
  return map[role] || "other";
}

function attentionMessage(level) {
  if (level === "none") return "Aucune urgence détectée.";
  if (level === "soon") return "Une échéance ou une action est à prévoir.";
  if (level === "urgent") return "À traiter rapidement.";
  return "Vérifiez les informations principales.";
}
