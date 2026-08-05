import {
  buildAssistContext,
  failure,
  getAllowedAssistActions,
  runDocumentAction
} from "../lib/documentAssist.js";

/**
 * Actions post-analyse : toujours du JSON valide.
 * Génération locale prioritaire (évite les 504 Vercel text/plain
 * FUNCTION_INVOCATION_TIMEOUT qui provoquaient « Réponse du serveur illisible »).
 */
export default async function handler(request, response) {
  setJsonHeaders(response);

  if (request.method !== "POST") {
    return send(response, 405, failure("METHOD_NOT_ALLOWED", "Méthode non autorisée."));
  }

  try {
    const body = parseBody(request.body);

    if (body == null) {
      return send(
        response,
        400,
        failure(
          "INVALID_JSON",
          "Le corps de la requête n’est pas un JSON valide."
        )
      );
    }

    const actionType = String(body.actionType || body.action || "");
    const analysis = body.analysis || body.documentContext || null;
    const analysisId = body.analysisId ?? analysis?.analysisId ?? null;

    if (!getAllowedAssistActions().includes(actionType)) {
      return send(
        response,
        400,
        failure("INVALID_ACTION", "Type d’aide non reconnu.")
      );
    }

    if (!analysis || typeof analysis !== "object") {
      return send(
        response,
        400,
        failure(
          "INVALID_CONTEXT",
          "Le document actuel ne contient pas assez d’informations."
        )
      );
    }

    const context = buildAssistContext(analysis, { analysisId });
    const result = runDocumentAction(actionType, context);

    if (!result.ok) {
      const status =
        result.error?.code === "NO_FORM_DETECTED"
          ? 422
          : result.error?.code === "INVALID_CONTEXT"
            ? 400
            : 422;

      return send(response, status, result);
    }

    return send(response, 200, result);
  } catch (error) {
    console.error("Assist function error:", error);

    return send(
      response,
      500,
      failure(
        "ASSIST_FAILED",
        error?.message ||
          "Une erreur est survenue pendant la préparation de l’aide."
      )
    );
  }
}

function parseBody(raw) {
  if (raw == null) {
    return {};
  }

  if (typeof raw === "object") {
    return raw;
  }

  if (typeof raw === "string") {
    const trimmed = raw.trim();

    if (!trimmed) {
      return {};
    }

    try {
      return JSON.parse(trimmed);
    } catch {
      return null;
    }
  }

  return {};
}

function setJsonHeaders(response) {
  try {
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    response.setHeader("Cache-Control", "no-store");
  } catch {
    // ignore header failures on odd runtimes
  }
}

function send(response, status, payload) {
  const body =
    payload && typeof payload === "object"
      ? payload
      : failure("ASSIST_FAILED", "Réponse interne invalide.");

  return response.status(status).json(body);
}
