/**
 * Orchestration Preview — dossier multi-documents V4-R.
 */

import {
  assertUploadOrderStable,
  buildDocumentCase,
  type DocumentCaseInput
} from "../knowledge/fr/tax/case/buildDocumentCase.js";
import { checkDocumentCaseSafety } from "../knowledge/fr/tax/case/safety.js";
import { resetCandidateIdsForTests } from "../candidates/ids.js";
import { resetRelationIdsForTests } from "../relations/ids.js";
import { resetRequirementFactIdsForTests } from "../knowledge/fr/tax/fields/requirements/documentFactIndex.js";
import { documentCaseToPreviewJson } from "./documentCaseViewModel.js";

export interface V4DocumentCaseRunInput {
  documents: Array<{
    text: string;
    fileName?: string | null;
  }>;
  resetIds?: boolean;
  userAnswers?: Array<{
    questionId: string;
    requirementId: string;
    answer: string;
    answeredAt?: string | null;
  }>;
}

export function runV4PreviewDocumentCase(input: V4DocumentCaseRunInput): {
  ok: true;
  document_case: Record<string, unknown>;
  safety_ok: boolean;
} | {
  ok: false;
  technicalError: true;
  message: string;
} {
  try {
    if (input.resetIds) {
      resetCandidateIdsForTests();
      resetRelationIdsForTests();
      resetRequirementFactIdsForTests();
    }
    const docs: DocumentCaseInput[] = (input.documents || []).map((d) => ({
      text: d.text,
      fileName: d.fileName || null
    }));
    if (!docs.length) {
      return {
        ok: false,
        technicalError: true,
        message: "Aucun document fourni pour le dossier."
      };
    }
    const docCase = buildDocumentCase(docs, {
      resetIds: Boolean(input.resetIds),
      userAnswers: (input.userAnswers || []).map((u) => ({
        kind: "user" as const,
        questionId: u.questionId,
        requirementId: u.requirementId,
        answer: u.answer,
        answeredAt: u.answeredAt ?? null,
        source: "user" as const
      }))
    });

    // Order stability check (does not mutate)
    const reversed = [...docs].reverse();
    const order = assertUploadOrderStable(docs, reversed);
    docCase.invariants.uploadOrderChangesConclusion =
      order.uploadOrderChangesConclusion;

    const safety = checkDocumentCaseSafety(docCase);
    if (
      docCase.invariants.crossDocumentUnsafeAggregation > 0 ||
      docCase.suggestedDeclaredAmount != null
    ) {
      return {
        ok: false,
        technicalError: true,
        message: "Invariant agrégation V4-R violé."
      };
    }

    return {
      ok: true,
      document_case: documentCaseToPreviewJson(docCase),
      safety_ok: safety.ok
    };
  } catch (error) {
    return {
      ok: false,
      technicalError: true,
      message: String((error as Error)?.message || error).slice(0, 400)
    };
  }
}
