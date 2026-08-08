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

function buildActions(explanation: DocumentExplanation): PresentationItem[] {
  const out: PresentationItem[] = [];
  for (const a of explanation.actions) {
    if (a.status === "noExplicitActionDetected" || !a.description) continue;
    // Ne pas transformer prélèvement en « payez »
    const desc = a.description.toLowerCase();
    const isPrelevement =
      /pr[eé]l[eè]vement|mandat\s+sepa|pr[eé]lev[eé]\s+automatiquement/.test(
        desc
      );
    if (isPrelevement) {
      const moneyFact = explanation.amounts.find(
        (x) =>
          (x.field === "amountDue" || x.field === "amountTTC") &&
          isUsableFactStatus(x.status) &&
          !Array.isArray(x.value)
      );
      const money = moneyFact ? formatMoneyFR(moneyFact.value) : null;
      const d = a.deadline ? formatDateFR(a.deadline.value) : null;
      let text = "Un prélèvement automatique est indiqué.";
      if (money && d) {
        text = `Un prélèvement de ${money} est prévu le ${d}.`;
      } else if (money) {
        text = `Un prélèvement de ${money} est indiqué.`;
      } else if (d) {
        text = `Un prélèvement automatique est prévu le ${d}.`;
      }
      out.push({
        kind: "prelevementInfo",
        label: "Prélèvement",
        text,
        status: "info",
        tier: "important",
        sourceFacts: [
          `action:${a.actionType}`,
          ...(moneyFact ? [sourceKey(moneyFact)] : []),
          ...(a.deadline ? [sourceKey(a.deadline)] : [])
        ],
        evidence: [
          ...a.evidence,
          ...(moneyFact?.evidence || []),
          ...(a.deadline?.evidence || [])
        ]
      });
      continue;
    }

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

  // Info prélèvement depuis secondary sans inventer d'action « payer »
  const paySec = explanation.secondaryInformation.find(
    (s) => s.sectionKind === "paymentInformation"
  );
  const hasPrelevementSignal =
    paySec?.signals.some((s) => /prelevement|sepa|payment/i.test(s)) ||
    paySec?.evidence.some((e) =>
      /pr[eé]l[eè]vement|mandat\s+sepa/i.test(e.text)
    );
  if (
    hasPrelevementSignal &&
    (paySec?.evidence?.length || 0) > 0 &&
    !out.some((o) => o.kind === "prelevementInfo") &&
    explanation.documentType.primary === "invoice"
  ) {
    const moneyFact = explanation.amounts.find(
      (x) =>
        (x.field === "amountDue" || x.field === "amountTTC") &&
        isUsableFactStatus(x.status) &&
        !Array.isArray(x.value)
    );
    const money = moneyFact ? formatMoneyFR(moneyFact.value) : null;
    out.push({
      kind: "prelevementInfo",
      label: "Prélèvement",
      text: money
        ? `Un prélèvement automatique de ${money} est indiqué.`
        : "Un prélèvement automatique est indiqué.",
      status: "info",
      tier: "important",
      sourceFacts: [
        `secondary:paymentInformation`,
        ...(moneyFact ? [sourceKey(moneyFact)] : [])
      ],
      evidence: [
        ...(paySec?.evidence || []),
        ...(moneyFact?.evidence || [])
      ]
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
  return explanation.secondaryInformation
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
}

function buildEvidencePassages(
  explanation: DocumentExplanation
): PresentationEvidencePassage[] {
  const map = new Map<string, PresentationEvidencePassage>();
  const absorb = (facts: string[], evidence: { page: number; blockId?: string | null; text: string }[]) => {
    for (const e of evidence) {
      if (!e.text) continue;
      const key = `${e.page}|${e.blockId || ""}|${e.text}`;
      const existing = map.get(key);
      if (existing) {
        for (const f of facts) {
          if (!existing.supportedFacts.includes(f)) {
            existing.supportedFacts.push(f);
          }
        }
      } else {
        map.set(key, {
          page: e.page,
          blockId: e.blockId ?? null,
          excerpt: e.text,
          supportedFacts: [...facts]
        });
      }
    }
  };

  for (const f of [
    ...explanation.amounts,
    ...explanation.deadlines,
    ...explanation.importantFacts,
    ...explanation.summaryFacts
  ]) {
    absorb([sourceKey(f)], f.evidence);
  }
  for (const a of explanation.actions) {
    if (a.status === "noExplicitActionDetected") continue;
    absorb([`action:${a.actionType}`], a.evidence);
  }
  for (const w of explanation.warnings) {
    absorb([`warning:${w.kind}`], w.evidence);
  }

  return [...map.values()].slice(0, 40);
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

  const partial = {
    documentIdentity,
    essential: buildEssential(explanation),
    actions: buildActions(explanation),
    reason,
    importantDates: buildDates(explanation),
    importantAmounts: buildAmounts(explanation),
    warnings: buildWarnings(explanation),
    evidencePassages: buildEvidencePassages(explanation),
    secondaryInformation: buildSecondary(explanation)
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
