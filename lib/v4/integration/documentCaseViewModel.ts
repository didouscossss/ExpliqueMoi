/**
 * View model dossier multi-documents pour Preview — V4-R/T.
 */

import type {
  DocumentCase,
  TaxApplicabilityStatus
} from "../types/knowledge.js";
import { applicabilityStatusLabel } from "../knowledge/fr/tax/applicability/explainApplicability.js";

function statusLabelFr(status: TaxApplicabilityStatus): string {
  return applicabilityStatusLabel(status);
}

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
      document_ids: c.documentIds,
      user_fact_ids: c.userFactIds || [],
      resolution: c.resolution || "unresolved"
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
      applicability: v.applicability
        ? {
            status: v.applicability.status,
            status_label: statusLabelFr(v.applicability.status),
            headline: v.applicability.headline,
            reasons: v.applicability.reasons,
            evidence: v.applicability.evidence.map((e) => ({
              source_kind: e.sourceKind,
              label: e.label,
              detail: e.detail
            })),
            missing_information: v.applicability.missingInformation.map((m) => ({
              id: m.id,
              question: m.question,
              reason: m.reason
            })),
            conflicts: v.applicability.conflicts,
            sources: v.applicability.sources,
            rule_id: v.applicability.ruleId,
            limits: v.applicability.limits
          }
        : null,
      calculation: v.calculation
        ? {
            status: v.calculation.status,
            value: v.calculation.value,
            unit: v.calculation.unit,
            formula_id: v.calculation.formulaId,
            inputs: v.calculation.inputs.map((i) => ({
              input_id: i.inputId,
              value: i.value,
              unit: i.unit,
              source_kind: i.sourceKind,
              status: i.status,
              provenance_note: i.provenanceNote
            })),
            missing_inputs: v.calculation.missingInputs,
            conflicts: v.calculation.conflicts,
            explanation: v.calculation.explanation,
            sources: v.calculation.sources,
            rule: v.calculation.rule
              ? {
                  rule_id: v.calculation.rule.ruleId,
                  formula_id: v.calculation.rule.formulaId,
                  version: v.calculation.rule.version,
                  tax_year: v.calculation.rule.taxYear,
                  status: v.calculation.rule.status,
                  sources: v.calculation.rule.sources
                }
              : null
          }
        : null,
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
    clarification: docCase.clarificationSession
      ? {
          session_id: docCase.clarificationSession.sessionId,
          current_question: (() => {
            const q = docCase.clarificationSession.questions.find(
              (x) =>
                x.questionId ===
                docCase.clarificationSession?.currentQuestionId
            );
            if (!q) return null;
            return {
              question_id: q.questionId,
              field_code: q.fieldCode,
              requirement_id: q.requirementId,
              question: q.question,
              reason: q.reason,
              expected_answer_type: q.expectedAnswerType,
              choices: q.choices || [],
              priority_reasons: q.priorityReasons
            };
          })(),
          user_facts: docCase.clarificationSession.activeUserFacts.map((f) => ({
            fact_id: f.factId,
            field_code: f.fieldCode,
            requirement_id: f.requirementId,
            value: f.normalizedValue ?? f.answer,
            raw_answer: f.rawAnswer ?? f.answer,
            source_label: "Information fournie par vous",
            active: f.active !== false
          })),
          historical_user_facts: (
            docCase.clarificationSession.historicalUserFacts || []
          ).map((f) => ({
            fact_id: f.factId,
            field_code: f.fieldCode,
            value: f.normalizedValue ?? f.answer,
            superseded_by: f.supersededBy,
            source_label: "Ancienne réponse (historique)"
          })),
          last_changes:
            docCase.clarificationSession.changeHistory.slice(-1)[0]
              ?.explanations || [],
          user_vs_document_conflicts: docCase.conflicts
            .filter((c) => c.kind === "userVsDocument")
            .map((c) => ({
              description: c.description,
              resolution: c.resolution || "unresolved"
            }))
        }
      : null,
    applicability_summary: (docCase.applicabilityEvaluations || []).map((e) => ({
      field_code: e.fieldCode,
      status: e.status,
      status_label: statusLabelFr(e.status),
      headline: e.headline
    })),
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
