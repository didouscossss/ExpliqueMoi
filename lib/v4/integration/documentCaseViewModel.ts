/**
 * View model dossier multi-documents pour Preview — V4-R.
 */

import type { DocumentCase } from "../types/knowledge.js";

export function documentCaseToPreviewJson(
  docCase: DocumentCase
): Record<string, unknown> {
  return {
    case_id: docCase.caseId,
    documents_count: docCase.documents.length,
    documents: docCase.documentCentricViews.map((d) => ({
      document_id: d.documentId,
      file_name: d.fileName,
      detected_type: d.detectedType,
      detected_reference: d.detectedReference,
      year: d.year,
      recognition_label: d.recognitionLabel,
      confidence: d.confidence,
      detected_facts: d.detectedFacts,
      potentially_linked_to: d.potentiallyLinkedTo.map((l) => ({
        field_code: l.fieldCode,
        relation_type: l.relationType,
        reason: l.reason,
        confidence: l.confidence
      })),
      duplicate_status: d.duplicateStatus,
      duplicate_message: d.duplicateMessage
    })),
    relations: docCase.relations.map((r) => ({
      from_document_id: r.fromDocumentId,
      to_document_id: r.toDocumentId,
      relation_type: r.relationType,
      confidence: r.confidence,
      reason: r.reason,
      field_code_hint: r.fieldCodeHint,
      year_relation: r.yearRelation
    })),
    conflicts: docCase.conflicts.map((c) => ({
      kind: c.kind,
      description: c.description,
      document_ids: c.documentIds
    })),
    ambiguities: docCase.ambiguities,
    tax_fields: docCase.caseCentricViews.map((v) => ({
      field_code: v.fieldCode,
      label: v.label,
      explanation: v.whatIsIt,
      found_by_document: v.foundByDocument.map((f) => ({
        document_id: f.documentId,
        file_name: f.fileName,
        notes: f.notes
      })),
      to_verify: v.toVerify,
      supporting_documents: v.supportingDocuments.map((s) => ({
        label: s.label,
        description: s.description,
        normative: s.normative
      })),
      general_conditions: v.generalConditions,
      official_sources: v.officialSources,
      information_status: v.informationStatus,
      priority_questions: v.priorityQuestions.map((q) => ({
        question: q.question,
        reason: q.reason
      })),
      suggested_declared_amount: null
    })),
    metrics: {
      documents: docCase.metrics.documents,
      facts: docCase.metrics.facts,
      requirements: docCase.metrics.requirements,
      candidate_matches: docCase.metrics.candidateMatches,
      strong_matches: docCase.metrics.strongMatches,
      ambiguous_matches: docCase.metrics.ambiguousMatches,
      rejected_matches: docCase.metrics.rejectedMatches,
      relations: docCase.metrics.relations,
      conflicts: docCase.metrics.conflicts
    },
    tax_context: {
      primary_references: docCase.taxContext.primaryReferences,
      years_present: docCase.taxContext.yearsPresent,
      field_codes_present: docCase.taxContext.fieldCodesPresent
    },
    suggested_declared_amount: null,
    eligibility_decision: null,
    invariants: {
      cross_document_fact_lost_provenance:
        docCase.invariants.crossDocumentFactLostProvenance,
      cross_document_unsafe_merge: docCase.invariants.crossDocumentUnsafeMerge,
      cross_document_unsafe_aggregation:
        docCase.invariants.crossDocumentUnsafeAggregation,
      year_mismatch_promoted_to_strong:
        docCase.invariants.yearMismatchPromotedToStrong,
      role_mismatch_promoted_to_strong:
        docCase.invariants.roleMismatchPromotedToStrong,
      unknown_document_promoted_to_known:
        docCase.invariants.unknownDocumentPromotedToKnown,
      duplicate_document_double_counted:
        docCase.invariants.duplicateDocumentDoubleCounted,
      upload_order_changes_conclusion:
        docCase.invariants.uploadOrderChangesConclusion,
      removed_document_fact_survives:
        docCase.invariants.removedDocumentFactSurvives,
      candidate_relation_presented_as_certain:
        docCase.invariants.candidateRelationPresentedAsCertain,
      user_answer_promoted_to_official_knowledge:
        docCase.invariants.userAnswerPromotedToOfficialKnowledge
    }
  };
}
