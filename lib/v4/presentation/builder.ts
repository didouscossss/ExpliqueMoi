/**
 * DocumentExplanation → UserPresentation (formulation uniquement).
 * Ne relit jamais le PDF/OCR. Ne crée aucun fait nouveau.
 */

import type { DocumentExplanation, ExplanationFact } from "../types/documentExplanation.js";
import type {
  PresentationEvidencePassage,
  PresentationIdentity,
  PresentationItem,
  UserPresentation
} from "../types/userPresentation.js";
import {
  amountLabel,
  buildActionText,
  buildIdentityText,
  buildReasonText,
  buildWarningText,
  dateLabel
} from "./templates.js";
import {
  formatDateFR,
  formatMoneyFR,
  isUsableFactStatus,
  factKey
} from "./format.js";
import {
  countInventions,
  countUnsupportedPresentationFacts
} from "./invariant.js";

function sourceKey(f: ExplanationFact): string {
  return factKey(f.field, f.kind);
}

function itemFromFact(
  fact: ExplanationFact,
  opts: {
    kind: string;
    label: string;
    text: string;
    tier: PresentationItem["tier"];
    value?: unknown;
    status?: PresentationItem["status"];
  }
): PresentationItem {
  return {
    kind: opts.kind,
    label: opts.label,
    text: opts.text,
    value: opts.value !== undefined ? opts.value : fact.value,
    status: opts.status || fact.status,
    tier: opts.tier,
    sourceFacts: [sourceKey(fact)],
    evidence: [...fact.evidence]
  };
}

function buildEssential(explanation: DocumentExplanation): PresentationItem[] {
  const items: PresentationItem[] = [];
  const identity = buildIdentityText(explanation);
  items.push({
    kind: "documentIdentity",
    label: identity.label,
    text: identity.text,
    status: "info",
    tier: "primary",
    sourceFacts: [
      "documentType",
      ...identity.sources.map(sourceKey)
    ],
    evidence: identity.sources.flatMap((s) => s.evidence)
  });

  const type = explanation.documentType.primary;

  // Priorités par type — uniquement faits supportés
  if (type === "invoice") {
    for (const field of ["amountTTC", "amountDue", "invoiceDate", "dueDate"]) {
      const f = [...explanation.amounts, ...explanation.deadlines].find(
        (x) => x.field === field && isUsableFactStatus(x.status) && !Array.isArray(x.value)
      );
      if (!f) continue;
      if (field.startsWith("amount") || field === "amountDue" || field === "amountTTC") {
        const money = formatMoneyFR(f.value);
        if (!money) continue;
        items.push(
          itemFromFact(f, {
            kind: "essentialAmount",
            label: amountLabel(f.field),
            text: `${amountLabel(f.field)} : ${money}.`,
            tier: "important"
          })
        );
      } else {
        const d = formatDateFR(f.value);
        if (!d) continue;
        items.push(
          itemFromFact(f, {
            kind: "essentialDate",
            label: dateLabel(f.field),
            text: `${dateLabel(f.field)} : ${d}.`,
            tier: "important"
          })
        );
      }
    }
  } else if (type === "administrativeLetter") {
    const acts = explanation.actions.filter(
      (a) => a.status !== "noExplicitActionDetected" && a.description
    );
    for (const a of acts.slice(0, 2)) {
      items.push({
        kind: "essentialAction",
        label: "Action",
        text: buildActionText(a.description!, a.deadline),
        status: a.status === "noExplicitActionDetected" ? "info" : (a.status as PresentationItem["status"]),
        tier: "primary",
        sourceFacts: [
          `action:${a.actionType}`,
          ...(a.deadline ? [sourceKey(a.deadline)] : [])
        ],
        evidence: [
          ...a.evidence,
          ...(a.deadline?.evidence || [])
        ]
      });
    }
  } else if (type === "contract") {
    for (const field of ["parties", "contractTitle", "effectiveDate", "noticePeriod", "duration"]) {
      const f = [...explanation.importantFacts, ...explanation.deadlines, ...explanation.summaryFacts].find(
        (x) => x.field === field && (isUsableFactStatus(x.status) || x.status === "ambiguous")
      );
      if (!f || f.status === "ambiguous") continue;
      const textVal = Array.isArray(f.value)
        ? f.value.map(String).join(", ")
        : String(f.value);
      items.push(
        itemFromFact(f, {
          kind: "essentialContract",
          label: f.field,
          text: `${f.field} : ${textVal}.`,
          tier: "important"
        })
      );
    }
  } else if (type === "bankStatement") {
    for (const field of ["openingBalance", "closingBalance", "transactions"]) {
      const f = explanation.amounts.find(
        (x) => x.field === field && isUsableFactStatus(x.status)
      );
      if (!f) continue;
      if (field === "transactions" && Array.isArray(f.value)) {
        items.push(
          itemFromFact(f, {
            kind: "essentialTransactions",
            label: "Opérations",
            text: `${f.value.length} opération(s) recensée(s).`,
            tier: "important",
            value: f.value
          })
        );
      } else {
        const money = formatMoneyFR(f.value);
        if (!money) continue;
        items.push(
          itemFromFact(f, {
            kind: "essentialBalance",
            label: amountLabel(f.field),
            text: `${amountLabel(f.field)} : ${money}.`,
            tier: "important"
          })
        );
      }
    }
  } else if (type === "taxDocument") {
    for (const field of ["amountDue", "taxAmount", "paymentDeadline", "fiscalPeriod"]) {
      const f = [...explanation.amounts, ...explanation.deadlines, ...explanation.importantFacts].find(
        (x) => x.field === field && isUsableFactStatus(x.status) && !Array.isArray(x.value)
      );
      if (!f) continue;
      if (field.includes("amount") || field === "taxAmount" || field === "amountDue") {
        const money = formatMoneyFR(f.value);
        if (!money) continue;
        items.push(
          itemFromFact(f, {
            kind: "essentialTax",
            label: amountLabel(f.field),
            text: `${amountLabel(f.field)} : ${money}.`,
            tier: "important"
          })
        );
      } else {
        const d = formatDateFR(f.value) || String(f.value);
        items.push(
          itemFromFact(f, {
            kind: "essentialTaxDate",
            label: dateLabel(f.field),
            text: `${dateLabel(f.field)} : ${d}.`,
            tier: "important"
          })
        );
      }
    }
  }

  // Dédupliquer textes
  const seen = new Set<string>();
  return items.filter((i) => {
    if (seen.has(i.text)) return false;
    seen.add(i.text);
    return true;
  });
}

/** Prélèvement automatique / SEPA actif = info, sauf directive utilisateur explicite. */
function isAutoDebitDescription(desc: string): boolean {
  const d = desc.toLowerCase();
  const hasUserDirective =
    /\b(r[eé]glez|effectuez|retournez|transmettez|envoyez|compl[eé]tez|mettez\s+[aà]\s+jour|merci\s+de|veuillez|vous\s+devez)\b/.test(
      d
    );
  if (hasUserDirective) return false;
  return /pr[eé]l[eè]vement\s+automatique|sera\s+pr[eé]lev|pr[eé]lev[eé]\s+automatiquement|mandat\s+sepa\s+actif|paiement\s+par\s+pr[eé]l[eè]vement/.test(
    d
  );
}

function buildPaymentInfoItems(
  explanation: DocumentExplanation
): PresentationItem[] {
  const out: PresentationItem[] = [];
  const moneyFact = explanation.amounts.find(
    (x) =>
      (x.field === "amountDue" || x.field === "amountTTC") &&
      isUsableFactStatus(x.status) &&
      !Array.isArray(x.value)
  );
  const money = moneyFact ? formatMoneyFR(moneyFact.value) : null;
  const paymentDate = explanation.deadlines.find(
    (d) =>
      (d.field === "paymentDate" || d.kind === "paymentDate") &&
      isUsableFactStatus(d.status) &&
      !Array.isArray(d.value)
  );
  const d = paymentDate ? formatDateFR(paymentDate.value) : null;

  for (const a of explanation.actions) {
    if (a.status === "noExplicitActionDetected" || !a.description) continue;
    if (!isAutoDebitDescription(a.description)) continue;
    const actionDate = a.deadline ? formatDateFR(a.deadline.value) : null;
    const dateText = d || actionDate;
    let text = "Un prélèvement automatique est indiqué.";
    if (money && dateText) {
      text = `Un prélèvement de ${money} est prévu le ${dateText}.`;
    } else if (money) {
      text = `Un prélèvement de ${money} est indiqué.`;
    } else if (dateText) {
      text = `Un prélèvement automatique est prévu le ${dateText}.`;
    }
    out.push({
      kind: "paymentInformation",
      label: "Informations de paiement",
      text,
      status: "info",
      tier: "important",
      sourceFacts: [
        `action:${a.actionType}`,
        ...(moneyFact ? [sourceKey(moneyFact)] : []),
        ...(paymentDate ? [sourceKey(paymentDate)] : []),
        ...(a.deadline ? [sourceKey(a.deadline)] : [])
      ],
      evidence: [
        ...a.evidence,
        ...(moneyFact?.evidence || []),
        ...(paymentDate?.evidence || []),
        ...(a.deadline?.evidence || [])
      ]
    });
  }

  const paySec = explanation.secondaryInformation.find(
    (s) => s.sectionKind === "paymentInformation"
  );
  const hasPrelevementSignal =
    paySec?.signals.some((s) => /prelevement|sepa|payment/i.test(s)) ||
    paySec?.evidence.some((e) =>
      /pr[eé]l[eè]vement|mandat\s+sepa|sera\s+pr[eé]lev/i.test(e.text)
    ) ||
    Boolean(paymentDate);

  if (
    hasPrelevementSignal &&
    !out.length &&
    explanation.documentType.primary === "invoice" &&
    ((paySec?.evidence?.length || 0) > 0 ||
      (paymentDate?.evidence?.length || 0) > 0)
  ) {
    let text = money
      ? `Un prélèvement automatique de ${money} est indiqué.`
      : "Un prélèvement automatique est indiqué.";
    if (money && d) {
      text = `Un prélèvement de ${money} est prévu le ${d}.`;
    } else if (d) {
      text = `Un prélèvement automatique est prévu le ${d}.`;
    }
    out.push({
      kind: "paymentInformation",
      label: "Informations de paiement",
      text,
      status: "info",
      tier: "important",
      sourceFacts: [
        ...(paySec ? ["secondary:paymentInformation"] : []),
        ...(paymentDate ? [sourceKey(paymentDate)] : []),
        ...(moneyFact ? [sourceKey(moneyFact)] : [])
      ],
      evidence: [
        ...(paySec?.evidence || []),
        ...(moneyFact?.evidence || []),
        ...(paymentDate?.evidence || [])
      ]
    });
  }

  return out;
}

function buildActions(explanation: DocumentExplanation): PresentationItem[] {
  const out: PresentationItem[] = [];
  for (const a of explanation.actions) {
    if (a.status === "noExplicitActionDetected" || !a.description) continue;
    // Prélèvement / SEPA actif ≠ action utilisateur
    if (isAutoDebitDescription(a.description)) continue;

    out.push({
      kind: "userAction",
      label: "Action demandée",
      text: buildActionText(a.description, a.deadline),
      value: a.description,
      status: a.status as PresentationItem["status"],
      tier: "primary",
      sourceFacts: [
        `action:${a.actionType}`,
        ...(a.deadline ? [sourceKey(a.deadline)] : [])
      ],
      evidence: [...a.evidence, ...(a.deadline?.evidence || [])]
    });
  }
  return out;
}

function buildDates(explanation: DocumentExplanation): PresentationItem[] {
  const out: PresentationItem[] = [];
  for (const d of explanation.deadlines) {
    if (d.status === "ambiguous") {
      const values = Array.isArray(d.value) ? d.value : [d.value];
      const formatted = values
        .map((v) => formatDateFR(v) || String(v))
        .filter(Boolean);
      out.push({
        kind: "ambiguousDate",
        label: dateLabel(d.field),
        text: `La date « ${dateLabel(d.field)} » n'est pas certaine (${formatted.join(" ou ")}).`,
        value: values,
        status: "ambiguous",
        tier: "important",
        sourceFacts: [sourceKey(d)],
        evidence: [...d.evidence]
      });
      continue;
    }
    if (!isUsableFactStatus(d.status) || Array.isArray(d.value)) continue;
    const formatted = formatDateFR(d.value);
    if (!formatted) continue;
    out.push(
      itemFromFact(d, {
        kind: "date",
        label: dateLabel(d.field),
        text: `${dateLabel(d.field)} : ${formatted}.`,
        tier: "important"
      })
    );
  }
  // Ambiguïtés aussi dans importantFacts
  for (const f of explanation.importantFacts) {
    if (f.status !== "ambiguous") continue;
    if (!/date|deadline|period/i.test(f.field)) continue;
    if (out.some((o) => o.sourceFacts.includes(sourceKey(f)))) continue;
    const values = Array.isArray(f.value) ? f.value : [f.value];
    const formatted = values
      .map((v) => formatDateFR(v) || String(v))
      .filter(Boolean);
    out.push({
      kind: "ambiguousDate",
      label: dateLabel(f.field),
      text: `La date principale n'est pas certaine (${formatted.join(" ou ")}).`,
      value: values,
      status: "ambiguous",
      tier: "important",
      sourceFacts: [sourceKey(f)],
      evidence: [...f.evidence]
    });
  }
  return out;
}

function buildAmounts(explanation: DocumentExplanation): PresentationItem[] {
  const out: PresentationItem[] = [];
  for (const a of explanation.amounts) {
    if (a.field === "arithmeticConsistency") continue;
    if (a.field === "principalAmount") continue;
    if (a.status === "ambiguous") {
      const values = Array.isArray(a.value) ? a.value : [a.value];
      out.push({
        kind: "ambiguousAmount",
        label: amountLabel(a.field),
        text: `Le montant « ${amountLabel(a.field)} » n'est pas certain.`,
        value: values,
        status: "ambiguous",
        tier: "important",
        sourceFacts: [sourceKey(a)],
        evidence: [...a.evidence]
      });
      continue;
    }
    if (!isUsableFactStatus(a.status)) continue;
    if (a.field === "transactions" && Array.isArray(a.value)) {
      out.push(
        itemFromFact(a, {
          kind: "transactions",
          label: "Opérations",
          text: `${a.value.length} opération(s).`,
          tier: "important",
          value: a.value
        })
      );
      continue;
    }
    if (Array.isArray(a.value)) continue;
    if (a.field === "vatRate") {
      out.push(
        itemFromFact(a, {
          kind: "rate",
          label: amountLabel(a.field),
          text: `${amountLabel(a.field)} : ${a.value} %.`,
          tier: "secondary"
        })
      );
      continue;
    }
    const money = formatMoneyFR(a.value);
    if (!money) continue;
    out.push(
      itemFromFact(a, {
        kind: "amount",
        label: amountLabel(a.field),
        text: `${amountLabel(a.field)} : ${money}.`,
        tier:
          a.field === "amountTTC" || a.field === "amountDue"
            ? "primary"
            : "important"
      })
    );
  }
  return out;
}

function buildWarnings(explanation: DocumentExplanation): PresentationItem[] {
  return explanation.warnings.map((w) => ({
    kind: w.kind,
    label: "Alerte",
    text: buildWarningText(w.kind, w.message),
    status: w.status,
    tier: "primary" as const,
    sourceFacts: [`warning:${w.kind}`, ...w.relatedFields],
    evidence: [...w.evidence]
  }));
}

function buildSecondary(explanation: DocumentExplanation): PresentationItem[] {
  const labels: Record<string, string> = {
    bankingDetails: "Coordonnées bancaires",
    paymentInformation: "Informations de paiement",
    paymentSchedule: "Échéancier",
    contactInformation: "Coordonnées",
    legalInformation: "Mentions légales",
    contractualInformation: "Informations contractuelles",
    taxInformation: "Informations fiscales"
  };
  const fromSections = explanation.secondaryInformation
    .filter((s) => s.sectionKind !== "bankStatement")
    .filter((s) => s.evidence.length > 0)
    .map((s) => ({
      kind: s.sectionKind,
      label: labels[s.sectionKind] || s.sectionKind,
      text: `${labels[s.sectionKind] || s.sectionKind} présentes dans le document.`,
      status: s.status,
      tier: "secondary" as const,
      sourceFacts: [`secondary:${s.sectionKind}`, ...s.derivedFrom],
      evidence: [...s.evidence]
    }));

  const paymentInfo = buildPaymentInfoItems(explanation);
  // Remplacer le libellé générique paymentInformation si on a un texte précis
  const hasDetailedPayment = paymentInfo.length > 0;
  const filtered = hasDetailedPayment
    ? fromSections.filter((s) => s.kind !== "paymentInformation")
    : fromSections;
  return [...paymentInfo, ...filtered];
}

const NOISE_EVIDENCE_RE =
  /r[eé]seaux?\s+sociaux|facebook|instagram|twitter|linkedin|www\.|http|support|faq|des questions|contactez|service\s+client|t[eé]l\s*:|hotline|capital\s+social|siret|rcs\b|mentions\s+l[eé]gales|cookie/i;

function evidenceFactPriority(fact: string): number {
  if (/^warning:arithmeticInconsistency/.test(fact)) return 100;
  if (/^action:/.test(fact)) return 95;
  if (/amountTTC|amountDue|netToPay/.test(fact)) return 90;
  if (/paymentDate|actionDeadline|dueDate|paymentDeadline/.test(fact)) return 85;
  if (/documentType|invoiceDate|issuer/.test(fact)) return 80;
  if (/amountHT|vatAmount|vatRate/.test(fact)) return 55;
  if (/secondary:paymentInformation|paymentInformation/.test(fact)) return 70;
  if (/warning:/.test(fact)) return 60;
  return 20;
}

function buildEvidencePassages(
  explanation: DocumentExplanation,
  presentationItems: PresentationItem[]
): PresentationEvidencePassage[] {
  // Un passage Preview doit supporter un fait Presentation important — pas un dump OCR.
  const importantFactKeys = new Set<string>();
  for (const item of presentationItems) {
    if (item.tier === "secondary" && item.kind !== "paymentInformation") continue;
    if (item.status === "missing") continue;
    for (const s of item.sourceFacts || []) importantFactKeys.add(s);
    // Aussi les clés field brutes
    for (const s of item.sourceFacts || []) {
      const field = s.includes(":") ? s.split(":").slice(1).join(":") : s;
      if (field) importantFactKeys.add(field);
    }
  }
  // Toujours prioriser identité / montants / dates / actions / warnings Presentation
  for (const item of [
    ...presentationItems.filter((i) => i.kind === "documentIdentity"),
    ...presentationItems.filter((i) => /amount|date|action|warning|payment/i.test(i.kind))
  ]) {
    for (const s of item.sourceFacts || []) importantFactKeys.add(s);
  }

  const map = new Map<
    string,
    PresentationEvidencePassage & { score: number }
  >();
  const absorb = (
    facts: string[],
    evidence: { page: number; blockId?: string | null; text: string }[]
  ) => {
    const relevant = facts.filter(
      (f) =>
        importantFactKeys.has(f) ||
        importantFactKeys.has(f.split(":")[0]) ||
        evidenceFactPriority(f) >= 70
    );
    if (!relevant.length) return;
    for (const e of evidence) {
      if (!e.text || e.text.trim().length < 6) continue;
      if (NOISE_EVIDENCE_RE.test(e.text) && evidenceFactPriority(relevant[0]) < 90) {
        continue;
      }
      const key = `${e.page}|${e.blockId || ""}|${e.text}`;
      const baseScore =
        Math.max(...relevant.map(evidenceFactPriority)) +
        (NOISE_EVIDENCE_RE.test(e.text) ? -80 : 0) +
        (/total\s+ttc|montant|facture|pr[eé]l[eè]vement|avant\s+le|r[eé]glez|retournez/i.test(
          e.text
        )
          ? 15
          : 0) -
        (e.text.length > 160 ? 10 : 0);
      const existing = map.get(key);
      if (existing) {
        for (const f of relevant) {
          if (!existing.supportedFacts.includes(f)) {
            existing.supportedFacts.push(f);
          }
        }
        existing.score = Math.max(existing.score, baseScore);
      } else {
        map.set(key, {
          page: e.page,
          blockId: e.blockId ?? null,
          excerpt: e.text,
          supportedFacts: [...relevant],
          score: baseScore
        });
      }
    }
  };

  for (const item of presentationItems) {
    if (item.tier === "secondary" && item.kind !== "paymentInformation") continue;
    absorb(item.sourceFacts || [], item.evidence || []);
  }
  for (const w of explanation.warnings) {
    if (w.kind === "arithmeticInconsistency") {
      absorb([`warning:${w.kind}`], w.evidence);
    }
  }

  return [...map.values()]
    .filter((p) => p.supportedFacts.length > 0 && p.score >= 50)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map(({ score: _s, ...rest }) => rest);
}

export function buildUserPresentation(
  explanation: DocumentExplanation
): UserPresentation {
  const identityBuilt = buildIdentityText(explanation);
  const documentIdentity: PresentationIdentity = {
    documentType: explanation.documentType.primary,
    label: identityBuilt.label,
    text: identityBuilt.text,
    sourceFacts: ["documentType", ...identityBuilt.sources.map(sourceKey)],
    evidence: identityBuilt.sources.flatMap((s) => s.evidence)
  };

  const reasonBuilt = buildReasonText(explanation);
  const reason: PresentationItem | null = reasonBuilt
    ? {
        kind: "reason",
        label: "Pourquoi ce document",
        text: reasonBuilt.text,
        status: "supported",
        tier: "important",
        sourceFacts: reasonBuilt.sources.map(sourceKey),
        evidence: reasonBuilt.sources.flatMap((s) => s.evidence)
      }
    : null;

  const actions = buildActions(explanation);
  const importantDates = buildDates(explanation);
  const importantAmounts = buildAmounts(explanation);
  const warnings = buildWarnings(explanation);
  const secondaryInformation = buildSecondary(explanation);
  const essential = buildEssential(explanation);
  const evidencePassages = buildEvidencePassages(explanation, [
    {
      kind: "documentIdentity",
      label: documentIdentity.label,
      text: documentIdentity.text,
      status: "info",
      tier: "primary",
      sourceFacts: documentIdentity.sourceFacts,
      evidence: documentIdentity.evidence
    },
    ...essential,
    ...actions,
    ...(reason ? [reason] : []),
    ...importantDates,
    ...importantAmounts,
    ...warnings,
    ...secondaryInformation.filter((s) => s.kind === "paymentInformation")
  ]);

  const partial = {
    documentIdentity,
    essential,
    actions,
    reason,
    importantDates,
    importantAmounts,
    warnings,
    evidencePassages,
    secondaryInformation
  };

  const counts = countUnsupportedPresentationFacts(partial);
  const draft: UserPresentation = {
    ...partial,
    unsupportedPresentationFacts: counts.unsupportedPresentationFacts,
    inventedActions: 0,
    inventedDeadlines: 0,
    inventedAmounts: 0,
    inventedReasons: 0
  };

  const inventions = countInventions(draft, explanation);
  return {
    ...draft,
    ...inventions,
    unsupportedPresentationFacts: counts.unsupportedPresentationFacts
  };
}
