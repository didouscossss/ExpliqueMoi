/**
 * B — Détection documentaire multi-signaux.
 * Ne jamais classifier sur un mot isolé.
 */

/**
 * @param {{ text: string, lines: string[], extraction: object }} input
 * @returns {{ family: string, documentType: string|null, confidence: number, signals: string[], understandingLevel: string }}
 */
export function detectDocumentFamily(input) {
  const text = String(input?.text || "");
  const lower = text.toLowerCase();
  const lines = Array.isArray(input?.lines) ? input.lines : [];
  const title = (lines[0] || "").toLowerCase();
  const head = lines.slice(0, 8).join(" \n ").toLowerCase();
  const refs = input?.extraction?.entities?.references || [];

  /** @type {Array<{ family: string, documentType: string|null, score: number, signals: string[] }>} */
  const candidates = [];

  const push = (family, documentType, score, signals) => {
    if (score <= 0) return;
    candidates.push({ family, documentType, score, signals });
  };

  // Quittance de loyer
  {
    let score = 0;
    const signals = [];
    if (/quittance/.test(lower)) {
      score += 45;
      signals.push("vocab:quittance");
    }
    if (/loyer/.test(lower)) {
      score += 20;
      signals.push("vocab:loyer");
    }
    if (/bailleur|locataire|bail/.test(lower)) {
      score += 15;
      signals.push("vocab:bail");
    }
    if (/reçu|recu|atteste|paiement/.test(lower) && /loyer|quittance/.test(lower)) {
      score += 15;
      signals.push("structure:preuve-paiement");
    }
    if (/quittance de loyer/.test(title) || /quittance de loyer/.test(head)) {
      score += 20;
      signals.push("title:quittance");
    }
    push("logement", score >= 50 ? "Quittance de loyer" : null, score, signals);
  }

  // Facture
  {
    let score = 0;
    const signals = [];
    if (/\bfacture\b/.test(lower)) {
      score += 35;
      signals.push("vocab:facture");
    }
    if (/\bttc\b|\bht\b|\btva\b/.test(lower)) {
      score += 20;
      signals.push("vocab:tva");
    }
    if (/net à payer|montant dû|à régler|a regler/.test(lower)) {
      score += 15;
      signals.push("vocab:a-payer");
    }
    if (/n[°o]\s*client|réf(?:érence)?\s*facture/.test(lower)) {
      score += 10;
      signals.push("structure:refs");
    }
    push("facture", score >= 45 ? "Facture" : null, score, signals);
  }

  // Liasse / fiscal
  {
    let score = 0;
    const signals = [];
    if (/liasse\s+fiscale/.test(lower)) {
      score += 50;
      signals.push("vocab:liasse");
    }
    if (/\b2031(?:-sd)?\b/i.test(text) || refs.some((r) => /2031/i.test(r.value))) {
      score += 40;
      signals.push("form:2031");
    }
    if (/déclaration de résultats|declaration de resultats/.test(lower)) {
      score += 25;
      signals.push("vocab:declaration-resultats");
    }
    if (/bénéfices?\s+(industriels|professionnels|commerciaux)|bic\b|bnc\b/.test(lower)) {
      score += 12;
      signals.push("rubric:bic"); // signal faible seul
    }
    if (/dgfip|direction générale des finances|impots\.gouv/.test(lower)) {
      score += 15;
      signals.push("issuer:dgfip");
    }
    // Ne pas typer uniquement sur "Bénéfices professionnels"
    const type =
      score >= 55
        ? /\b2031/i.test(text)
          ? "Liasse fiscale — formulaire 2031-SD"
          : /liasse/.test(lower)
            ? "Liasse fiscale"
            : "Déclaration de résultats"
        : null;
    push("fiscal", type, score, signals);
  }

  // Convocation AG copropriété
  {
    let score = 0;
    const signals = [];
    if (/convocation/.test(lower)) {
      score += 30;
      signals.push("vocab:convocation");
    }
    if (/assemblée générale|assemblee generale|\bag\b/.test(lower)) {
      score += 30;
      signals.push("vocab:ag");
    }
    if (/copropriété|copropriete|syndic/.test(lower)) {
      score += 25;
      signals.push("vocab:copro");
    }
    if (/ordre du jour|procuration|pouvoir/.test(lower)) {
      score += 15;
      signals.push("structure:ag");
    }
    push(
      "copropriete",
      score >= 55
        ? "Convocation à une assemblée générale de copropriété"
        : null,
      score,
      signals
    );
  }

  // Autres familles légères
  if (/bulletin de (?:paie|salaire)|salaire net/.test(lower)) {
    push("emploi", "Bulletin de salaire", 60, ["vocab:paie"]);
  }
  if (/relevé de compte|releve de compte|iban|bic\b/.test(lower) && /banque|crédit|credit/.test(lower)) {
    push("bancaire", "Relevé bancaire", 50, ["vocab:banque"]);
  }
  if (/\bcaf\b/.test(lower) && /allocation|dossier/.test(lower)) {
    push("social", "Courrier CAF", 55, ["issuer:caf"]);
  }
  if (/\bcpam\b|ameli/.test(lower)) {
    push("sante", "Courrier CPAM", 50, ["issuer:cpam"]);
  }
  if (/contrat\b/.test(lower) && /soussigné|soussigne|article\s+\d/.test(lower)) {
    push("contrat", "Contrat", 45, ["vocab:contrat"]);
  }

  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];

  if (!best || best.score < 25) {
    return {
      family: "autre",
      documentType: null,
      confidence: Math.max(10, best?.score || 0),
      signals: best?.signals || [],
      understandingLevel: "extraction"
    };
  }

  if (best.documentType && best.score >= 70) {
    return {
      family: best.family,
      documentType: best.documentType,
      confidence: Math.min(95, best.score),
      signals: best.signals,
      understandingLevel: "strong"
    };
  }

  if (best.documentType && best.score >= 50) {
    return {
      family: best.family,
      documentType: best.documentType,
      confidence: Math.min(85, best.score),
      signals: best.signals,
      understandingLevel: "probable"
    };
  }

  return {
    family: best.family,
    documentType: null,
    confidence: Math.min(70, best.score),
    signals: best.signals,
    understandingLevel: "family"
  };
}
