/**
 * Pipeline de découverte V4-M (build-time, offline sur snapshot).
 *
 * OfficialSource → discover → normalize → dedupe → validate → classify
 * → provenance → registry candidate → schema → generated registry
 */

import type {
  FrenchTaxDocumentEntry,
  FrenchTaxDocumentRegistry,
  OfficialDocumentCandidate,
  RegistryEntryStatus,
  TaxDocumentRelation
} from "../../../../types/knowledge.js";
import { normalizeTaxReference } from "../normalize/normalizeReference.js";
import { enrichmentByRef } from "../registry/enrichments.js";
import {
  DataGouvSource,
  ImpotsGouvSource,
  ServicePublicSource
} from "../sources/impotsGouv.js";
import { classifyFromOfficialMeta } from "./classifyFamily.js";
import { computeMetadataQuality } from "./quality.js";

export interface DiscoveryRejection {
  reference: string;
  reason: string;
  status: Extract<RegistryEntryStatus, "rejected" | "needsReview" | "discovered">;
}

export interface DiscoveryPipelineResult {
  discovered: OfficialDocumentCandidate[];
  validated: OfficialDocumentCandidate[];
  integrated: FrenchTaxDocumentEntry[];
  rejected: DiscoveryRejection[];
  needsReview: DiscoveryRejection[];
  registry: FrenchTaxDocumentRegistry;
  catalogOnlyCount: number;
}

const RETRIEVED = "2026-08-08";

function idFor(norm: string): string {
  return `fr-tax-${norm.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}

function provenance(url: string, title: string, supports: string[]) {
  return {
    sourceType: "official" as const,
    authority: "DGFiP",
    url,
    retrievedAt: RETRIEVED,
    title,
    supports,
    licenseId: "impots-gouv-fr"
  };
}

function isIntegrable(c: OfficialDocumentCandidate): { ok: boolean; reason?: string } {
  if (!c.reference || !normalizeTaxReference(c.reference).normalizedReference) {
    return { ok: false, reason: "référence manquante" };
  }
  if (!c.title || c.title.trim().length < 3) {
    return { ok: false, reason: "titre officiel insuffisant" };
  }
  if (!c.url || !/^https?:\/\//.test(c.url)) {
    return { ok: false, reason: "URL officielle manquante" };
  }
  if (!c.authority) {
    return { ok: false, reason: "autorité manquante" };
  }
  // Titres pathologiques
  if (/^n°?\s*$/i.test(c.title) || c.title.length > 300) {
    return { ok: false, reason: "titre invalide" };
  }
  return { ok: true };
}

export function runDiscoveryPipeline(options?: {
  generatedAt?: string;
  version?: string;
}): DiscoveryPipelineResult {
  const adapters = [
    new ImpotsGouvSource(),
    new ServicePublicSource(),
    new DataGouvSource()
  ];

  const discovered: OfficialDocumentCandidate[] = [];
  const notes: string[] = [];
  for (const a of adapters) {
    const res = a.discover();
    discovered.push(...res.candidates);
    notes.push(...(res.notes || []));
  }

  const enrich = enrichmentByRef();
  const rejected: DiscoveryRejection[] = [];
  const needsReview: DiscoveryRejection[] = [];
  const validated: OfficialDocumentCandidate[] = [];

  // Dedup by normalized reference — garder la meilleure URL
  const byNorm = new Map<string, OfficialDocumentCandidate>();
  for (const c of discovered) {
    const n = normalizeTaxReference(c.reference).normalizedReference;
    const prev = byNorm.get(n);
    if (!prev) {
      byNorm.set(n, c);
      continue;
    }
    // Doublon : même URL → ignore ; sinon needsReview
    if (prev.url === c.url) continue;
    needsReview.push({
      reference: n,
      reason: `duplicate normalizedReference with distinct URLs: ${prev.url} vs ${c.url}`,
      status: "needsReview"
    });
  }

  const integrated: FrenchTaxDocumentEntry[] = [];
  const entryByNorm = new Map<string, FrenchTaxDocumentEntry>();

  for (const [, c] of byNorm) {
    const check = isIntegrable(c);
    const norm = normalizeTaxReference(c.reference);
    if (!check.ok) {
      rejected.push({
        reference: norm.normalizedReference || c.reference,
        reason: check.reason || "invalid",
        status: "rejected"
      });
      continue;
    }
    validated.push(c);

    const clf = classifyFromOfficialMeta({
      reference: norm.normalizedReference,
      title: c.title,
      documentKindGuess: c.documentKindGuess
    });

    const en = enrich.get(norm.normalizedReference);
    const title = en?.officialTitle || c.title;
    const url = en?.pageUrl || c.url;
    const cerfa = en?.cerfaNumbers || (c.cerfa ? [c.cerfa] : []);
    const years = en?.applicableYears || (c.year ? [c.year] : []);

    // Minimum provenance pour integration
    if (!title || !url) {
      rejected.push({
        reference: norm.normalizedReference,
        reason: "provenance insuffisante (title/url)",
        status: "rejected"
      });
      continue;
    }

    if (clf.needsReview && clf.confidence < 0.65) {
      needsReview.push({
        reference: norm.normalizedReference,
        reason: clf.reason,
        status: "needsReview"
      });
      // Intégrer quand même comme taxForm générique si provenance OK
      // (qualité > exclure silencieusement les formulaires officiels)
    }

    const prov = provenance(url, `Formulaire n°${norm.normalizedReference} — ${title}`, [
      "officialTitle",
      "reference",
      "authority"
    ]);

    const quality = computeMetadataQuality({
      hasOfficialReference: true,
      hasOfficialTitle: true,
      hasOfficialSource: true,
      hasAuthority: true,
      hasYearInformation: years.length > 0,
      hasCerfa: cerfa.length > 0,
      hasRelations: Boolean(en?.relations?.length),
      documentKind: clf.documentKind
    });

    const entry: FrenchTaxDocumentEntry = {
      id: idFor(norm.normalizedReference),
      country: "FR",
      authority: "DGFiP",
      family: clf.family,
      documentType: clf.documentType,
      documentKind: clf.documentKind,
      referenceNumbers: [norm.normalizedReference],
      rawReference: c.rawReference,
      normalizedReference: norm.normalizedReference,
      baseReference: norm.baseReference,
      variantKind: norm.variantKind,
      cerfaNumbers: cerfa,
      cerfaVersion: en?.cerfaVersion ?? null,
      aliases: en?.aliases || [],
      officialTitle: title,
      description: en?.description || `Formulaire fiscal officiel n°${norm.normalizedReference}.`,
      purpose: en?.purpose || "Formalité / déclaration fiscale (voir notice officielle).",
      applicableYears: years,
      documentVersion: null,
      validFrom: null,
      validTo: null,
      expectedSignals: [
        norm.normalizedReference.toLowerCase(),
        title.toLowerCase().slice(0, 80)
      ],
      negativeSignals: [],
      relatedDocuments: [],
      profileId: clf.profileId,
      expectedFields: [],
      officialSources: [prov],
      provenance: [prov],
      confidence: clf.confidence,
      quality,
      status: clf.needsReview && clf.confidence < 0.6 ? "needsReview" : "integrated",
      metadataHash: c.metadataHash || null
    };

    // Non-intégrer les needsReview très faibles
    if (entry.status === "needsReview") {
      needsReview.push({
        reference: norm.normalizedReference,
        reason: clf.reason,
        status: "needsReview"
      });
      continue;
    }

    entryByNorm.set(norm.normalizedReference, entry);
    integrated.push(entry);
  }

  // Enrichissements curatés absents du sitemap (ex. 2042-C) — intégrés si provenance URL
  for (const en of enrich.values()) {
    if (entryByNorm.has(en.normalizedReference)) continue;
    if (!en.pageUrl && !en.officialTitle) continue;
    const url =
      en.pageUrl ||
      `https://www.impots.gouv.fr/recherche-de-formulaire#${en.normalizedReference}`;
    // Exiger au minimum titre + source officielle
    if (!en.officialTitle) continue;
    const clf = classifyFromOfficialMeta({
      reference: en.normalizedReference,
      title: en.officialTitle,
      documentKindGuess: "form"
    });
    const norm = normalizeTaxReference(en.normalizedReference);
    const prov = provenance(url, `Formulaire n°${norm.normalizedReference} — ${en.officialTitle}`, [
      "officialTitle",
      "reference",
      "authority"
    ]);
    const entry: FrenchTaxDocumentEntry = {
      id: idFor(norm.normalizedReference),
      country: "FR",
      authority: "DGFiP",
      family: clf.family,
      documentType: clf.documentType,
      documentKind: "form",
      referenceNumbers: [norm.normalizedReference],
      rawReference: en.normalizedReference,
      normalizedReference: norm.normalizedReference,
      baseReference: norm.baseReference,
      variantKind: norm.variantKind,
      cerfaNumbers: en.cerfaNumbers || [],
      cerfaVersion: en.cerfaVersion ?? null,
      aliases: en.aliases || [],
      officialTitle: en.officialTitle,
      description: en.description || `Formulaire fiscal officiel n°${norm.normalizedReference}.`,
      purpose: en.purpose || "Formalité / déclaration fiscale (voir notice officielle).",
      applicableYears: en.applicableYears || [],
      documentVersion: null,
      validFrom: null,
      validTo: null,
      expectedSignals: [norm.normalizedReference.toLowerCase(), en.officialTitle.toLowerCase()],
      negativeSignals: [],
      relatedDocuments: [],
      profileId: clf.profileId,
      expectedFields: [],
      officialSources: [prov],
      provenance: [prov],
      confidence: clf.confidence,
      quality: computeMetadataQuality({
        hasOfficialReference: true,
        hasOfficialTitle: true,
        hasOfficialSource: true,
        hasAuthority: true,
        hasYearInformation: (en.applicableYears || []).length > 0,
        hasCerfa: (en.cerfaNumbers || []).length > 0,
        hasRelations: Boolean(en.relations?.length),
        documentKind: "form"
      }),
      status: "integrated",
      metadataHash: null
    };
    integrated.push(entry);
    entryByNorm.set(norm.normalizedReference, entry);
  }

  // Entrées non-formulaire V4-L (avis IR, TF, unknown) — pas dans le sitemap formulaires
  const syntheticNonForms = buildNonFormEntries();
  for (const e of syntheticNonForms) {
    if (!entryByNorm.has(e.normalizedReference)) {
      integrated.push(e);
      entryByNorm.set(e.normalizedReference, e);
    }
  }

  // Résoudre relations curatées → ids
  for (const e of integrated) {
    const en = enrich.get(e.normalizedReference);
    if (!en?.relations) continue;
    const rels: TaxDocumentRelation[] = [];
    for (const r of en.relations) {
      const target = entryByNorm.get(r.targetRef) || entryByNorm.get(
        normalizeTaxReference(r.targetRef).normalizedReference
      );
      if (!target) {
        needsReview.push({
          reference: e.normalizedReference,
          reason: `relation cible absente: ${r.targetRef}`,
          status: "needsReview"
        });
        continue;
      }
      rels.push({
        targetId: target.id,
        relationType: r.relationType,
        source: r.source,
        confidence: r.confidence
      });
    }
    e.relatedDocuments = rels;
    if (e.quality) {
      e.quality = computeMetadataQuality({
        ...e.quality,
        hasRelations: rels.length > 0,
        documentKind: e.documentKind
      });
    }
  }

  // Catalog-only (réf. liste sans page sitemap) → discovered, pas integrated
  let catalogOnlyCount = 0;
  for (const n of notes) {
    const m = /catalog-only sans page:\s*(\d+)/i.exec(n);
    if (m) catalogOnlyCount = Number(m[1]);
  }

  const version = options?.version || "2026.08.08-v4m1";
  const registry: FrenchTaxDocumentRegistry = {
    version,
    country: "FR",
    generatedAt: options?.generatedAt || new Date().toISOString(),
    sourceMode: "discovery+curated",
    entries: integrated.sort((a, b) =>
      a.normalizedReference.localeCompare(b.normalizedReference)
    ),
    discoveryStats: {
      discovered: discovered.length,
      validated: validated.length,
      integrated: integrated.length,
      rejected: rejected.length,
      needsReview: needsReview.length
    }
  };

  return {
    discovered,
    validated,
    integrated,
    rejected,
    needsReview,
    registry,
    catalogOnlyCount
  };
}

function buildNonFormEntries(): FrenchTaxDocumentEntry[] {
  const avisUrl =
    "https://www.impots.gouv.fr/particulier/jai-besoin-dun-document-avis-dimpot-formulaire";
  const tfUrl =
    "https://www.impots.gouv.fr/particulier/questions/quelle-date-vais-je-recevoir-mon-avis-de-taxe-fonciere-et-quand-dois-je-la";

  const mk = (
    partial: Omit<FrenchTaxDocumentEntry, "country" | "authority" | "provenance" | "quality" | "status">
  ): FrenchTaxDocumentEntry => {
    const e: FrenchTaxDocumentEntry = {
      country: "FR",
      authority: "DGFiP",
      provenance: partial.officialSources,
      quality: computeMetadataQuality({
        hasOfficialReference: partial.referenceNumbers.length > 0,
        hasOfficialTitle: true,
        hasOfficialSource: true,
        hasAuthority: true,
        hasYearInformation: partial.applicableYears.length > 0,
        hasCerfa: partial.cerfaNumbers.length > 0,
        hasRelations: partial.relatedDocuments.length > 0,
        documentKind: partial.documentKind
      }),
      status: "integrated",
      ...partial
    };
    return e;
  };

  return [
    mk({
      id: "fr-tax-income-notice",
      family: "incomeTaxNotice",
      documentType: "incomeTaxNotice",
      documentKind: "taxNotice",
      referenceNumbers: [],
      rawReference: null,
      normalizedReference: "INCOME-TAX-NOTICE",
      baseReference: null,
      variantKind: null,
      cerfaNumbers: [],
      cerfaVersion: null,
      aliases: ["avis d'impôt sur les revenus", "avis d'imposition"],
      officialTitle: "Avis d'impôt sur les revenus",
      description:
        "Document restitué par l'administration indiquant l'impôt calculé, les prélèvements et le solde.",
      purpose: "Informer le contribuable du résultat de l'impôt sur le revenu.",
      applicableYears: [2024, 2025, 2026],
      expectedSignals: ["avis d'impot", "revenu fiscal de reference", "reste a payer"],
      negativeSignals: ["formulaire 2042"],
      relatedDocuments: [],
      profileId: "incomeTaxNotice",
      expectedFields: ["taxAmount", "amountDue", "refundAmount", "fiscalPeriod"],
      officialSources: [
        provenance(avisUrl, "J'ai besoin d'un document (avis d'impôt…)", [
          "officialTitle",
          "family"
        ])
      ],
      confidence: 0.9,
      metadataHash: null
    }),
    mk({
      id: "fr-tax-property-notice",
      family: "propertyTax",
      documentType: "propertyTax",
      documentKind: "taxNotice",
      referenceNumbers: [],
      rawReference: null,
      normalizedReference: "PROPERTY-TAX-NOTICE",
      baseReference: null,
      variantKind: null,
      cerfaNumbers: [],
      aliases: ["avis de taxe fonciere", "taxe fonciere"],
      officialTitle: "Avis de taxe foncière",
      description: "Avis d'imposition de taxe foncière mis à disposition par la DGFiP.",
      purpose: "Informer du montant de taxe foncière et des modalités de paiement.",
      applicableYears: [2024, 2025, 2026],
      expectedSignals: ["taxe fonciere", "date limite de paiement"],
      negativeSignals: ["total ht", "total ttc"],
      relatedDocuments: [],
      profileId: "propertyTax",
      expectedFields: ["taxAmount", "amountDue", "paymentDeadline"],
      officialSources: [
        provenance(tfUrl, "Avis de taxe foncière — dates", ["officialTitle", "family"])
      ],
      confidence: 0.9,
      metadataHash: null
    }),
    mk({
      id: "fr-tax-unknown",
      family: "unknownTaxDocument",
      documentType: "unknownTaxDocument",
      documentKind: "other",
      referenceNumbers: [],
      rawReference: null,
      normalizedReference: "UNKNOWN-TAX",
      baseReference: null,
      variantKind: null,
      cerfaNumbers: [],
      aliases: ["document fiscal"],
      officialTitle: "Document fiscal non identifié précisément",
      description:
        "Type de repli lorsqu'un document est clairement fiscal mais non rattaché à une référence connue.",
      purpose: "Éviter une fausse classification précise.",
      applicableYears: [],
      expectedSignals: ["impot", "fiscal", "dgfip"],
      negativeSignals: [],
      relatedDocuments: [],
      profileId: "unknownTaxDocument",
      expectedFields: [],
      officialSources: [
        provenance(avisUrl, "Document fiscal — repli unknown", ["family"])
      ],
      confidence: 0.5,
      metadataHash: null
    })
  ];
}
