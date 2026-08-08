/**
 * Purpose structuré — DocumentType = signal, pas preuve suffisante seule.
 */

import { toConfidence } from "../types/confidence.js";
import type { DocumentTypeId } from "../types/documentClassification.js";
import type { UnderstandingItem } from "../types/documentUnderstanding.js";
import type { EvidenceSpan } from "../types/evidence.js";
import type { ResolvedField } from "../types/documentProfile.js";
import type { TextBlock } from "../types/textBlock.js";
import { evidenceFromBlocks, enrichEvidence } from "./evidence.js";
import type { ScoreReason } from "../types/entityCandidate.js";

interface PurposeSignal {
  kind: string;
  weight: number;
  evidence: EvidenceSpan[];
  reasons: ScoreReason[];
}

function contentSignals(
  type: DocumentTypeId,
  blocks: readonly TextBlock[],
  fields: readonly ResolvedField[]
): PurposeSignal[] {
  const text = blocks.map((b) => b.text).join("\n");
  const signals: PurposeSignal[] = [];

  const push = (
    kind: string,
    re: RegExp,
    weight: number,
    reason: string
  ) => {
    if (!re.test(text)) return;
    signals.push({
      kind,
      weight,
      evidence: evidenceFromBlocks(blocks, (b) => re.test(b.text)),
      reasons: [{ signal: reason, delta: weight }]
    });
  };

  // Demande de paiement = directive utilisateur explicite (pas le seul mot « facture »)
  push(
    "paymentRequest",
    /montant\s+[aà]\s+payer|net\s+[aà]\s+payer|r[eé]glez|effectuez\s+le\s+virement|somme\s+[aà]\s+payer/i,
    0.4,
    "content:paymentCue"
  );
  push("informationRequest", /transmettre|merci\s+de|justificatif|veuillez/i, 0.4, "content:requestCue");
  push("certification", /attestation|certifie|je\s+soussign/i, 0.4, "content:certCue");
  push("agreement", /\bcontrat\b|\bconvention\b|prend\s+effet|pr[eé]avis/i, 0.4, "content:contractCue");
  push("accountStatement", /relev[eé]\s+de\s+compte|solde\s+pr[eé]c[eé]dent|d[eé]bit|cr[eé]dit/i, 0.4, "content:bankCue");
  push("taxObligation", /imp[oô]t|montant\s+[aà]\s+payer|date\s+limite/i, 0.3, "content:taxCue");
  push("explanation", /guide|mode\s+d['’]?emploi|comment\s+faire|\b[eé]tape/i, 0.35, "content:guideCue");
  push("information", /nous\s+vous\s+informons|pour\s+information|mis\s+[aà]\s+jour/i, 0.25, "content:infoCue");
  // Facture + prélèvement auto / remboursement = information, pas obligation manuelle
  push(
    "billingNotice",
    /pr[eé]l[eè]vement\s+automatique|sera\s+pr[eé]lev|mandat\s+sepa/i,
    0.45,
    "content:autoDebitCue"
  );
  push(
    "billingNotice",
    /rembourser|remboursement|rien\s+[aà]\s+faire|solde\s+cr[eé]diteur/i,
    0.5,
    "content:refundCue"
  );
  push(
    "billingNotice",
    /\bfacture\b|total\s+ttc|consommation|electricit|energie|cl[oô]ture/i,
    0.3,
    "content:invoiceCue"
  );

  // Champs résolus renforcent — montant / facture seuls ≠ demande de paiement manuel
  const has = (name: string) =>
    fields.some((f) => f.field === name && f.status === "resolved");
  const autoDebit = /pr[eé]l[eè]vement\s+automatique|sera\s+pr[eé]lev|mandat\s+sepa/i.test(
    text
  );
  const explicitPayAsk =
    /montant\s+[aà]\s+payer|net\s+[aà]\s+payer|r[eé]glez|effectuez\s+le\s+virement|somme\s+[aà]\s+payer|reste\s+[aà]\s+payer/i.test(
      text
    );
  if (has("amountDue") && explicitPayAsk && !autoDebit) {
    signals.push({
      kind: "paymentRequest",
      weight: 0.25,
      evidence: enrichEvidence(
        fields.find((f) => f.field === "amountDue")?.evidence,
        blocks
      ),
      reasons: [{ signal: "field:amountDue:payAsk", delta: 0.25 }]
    });
  } else if (has("amountTTC") || has("amountDue")) {
    signals.push({
      kind: "billingNotice",
      weight: autoDebit ? 0.25 : 0.15,
      evidence: enrichEvidence(
        fields.find((f) => f.field === "amountDue" || f.field === "amountTTC")
          ?.evidence,
        blocks
      ),
      reasons: [
        {
          signal: autoDebit ? "field:amount:autoDebit" : "field:amount:billing",
          delta: autoDebit ? 0.25 : 0.15
        }
      ]
    });
  }
  if (has("requestedActions") || has("deadlines")) {
    signals.push({
      kind: "informationRequest",
      weight: 0.3,
      evidence: enrichEvidence(
        fields.find((f) => f.field === "requestedActions")?.evidence,
        blocks
      ),
      reasons: [{ signal: "field:action", delta: 0.3 }]
    });
  }

  // Type = signal faible seulement
  const typeMap: Partial<Record<DocumentTypeId, string>> = {
    // Facture ≠ automatiquement « demande de paiement » manuel
    invoice: "billingNotice",
    administrativeLetter: "informationRequest",
    certificate: "certification",
    notice: "information",
    contract: "agreement",
    bankStatement: "accountStatement",
    taxDocument: "taxObligation",
    payslip: "employmentRecord",
    form: "formSubmission",
    explanatoryDocument: "explanation"
  };
  const fromType = typeMap[type];
  if (fromType) {
    signals.push({
      kind: fromType,
      weight: 0.15,
      evidence: blocks[0]
        ? [
            {
              text: blocks[0].text,
              page: blocks[0].page,
              bbox: blocks[0].bbox ?? null,
              blockId: blocks[0].id,
              lineId: blocks[0].lineId ?? null
            }
          ]
        : [],
      reasons: [{ signal: `typeSignal:${type}`, delta: 0.15 }]
    });
  }

  return signals;
}

export function buildPurpose(
  type: DocumentTypeId,
  blocks: readonly TextBlock[],
  fields: readonly ResolvedField[]
): UnderstandingItem {
  const signals = contentSignals(type, blocks, fields);
  const byKind = new Map<string, PurposeSignal[]>();
  for (const s of signals) {
    const list = byKind.get(s.kind) || [];
    list.push(s);
    byKind.set(s.kind, list);
  }

  let bestKind = "unknown";
  let bestScore = 0;
  let bestEvidence: EvidenceSpan[] = [];
  let bestReasons: ScoreReason[] = [];

  for (const [kind, list] of byKind) {
    const score = list.reduce((a, s) => a + s.weight, 0);
    if (score > bestScore) {
      bestScore = score;
      bestKind = kind;
      bestEvidence = list.flatMap((s) => s.evidence);
      bestReasons = list.flatMap((s) => s.reasons);
    }
  }

  // Exiger un minimum de contenu : type seul (0.15) insuffisant
  if (bestScore < 0.3) {
    return {
      kind: "purpose",
      value: "unknown",
      confidence: toConfidence(0.2),
      status: "unknown",
      importance: "medium",
      evidence: bestEvidence.slice(0, 3),
      derivedFrom: bestReasons.map((r) => r.signal),
      reasoning: bestReasons
    };
  }

  return {
    kind: "purpose",
    value: bestKind,
    confidence: toConfidence(Math.min(1, bestScore)),
    status: "resolved",
    importance: "high",
    evidence: enrichEvidence(bestEvidence, blocks).slice(0, 6),
    derivedFrom: [
      ...bestReasons.map((r) => r.signal),
      `documentType:${type}`
    ],
    reasoning: bestReasons
  };
}
