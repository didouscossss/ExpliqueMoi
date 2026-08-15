/**
 * Didou Brain — Local Model V1
 *
 * Passerelle vers un vrai LLM exécuté localement
 * dans le navigateur via WebLLM.
 *
 * Aucun document n'est envoyé à OpenAI,
 * Gemini ou un autre service distant.
 */

let engine = null;
let loadingPromise = null;

/*
 * IMPORTANT :
 *
 * Le modèle exact sera configurable.
 * On ne le grave pas dans toute l'application.
 *
 * On commencera avec un modèle léger compatible
 * WebLLM puis on pourra proposer différents niveaux
 * selon la puissance de l'appareil.
 */
export const DIDOU_LOCAL_MODEL_DEFAULT = null;

/**
 * Vérifie si l'appareil semble capable
 * d'utiliser WebGPU.
 */
export function canRunLocalAI() {
  return (
    typeof window !== "undefined" &&
    typeof navigator !== "undefined" &&
    Boolean(navigator.gpu)
  );
}

/**
 * Retourne l'état du moteur local.
 */
export function getLocalAIStatus() {
  return {
    supported:
      canRunLocalAI(),

    loaded:
      Boolean(engine),

    loading:
      Boolean(loadingPromise)
  };
}

/**
 * Charge le modèle local.
 *
 * @param {{
 *   modelId: string,
 *   onProgress?: Function
 * }} options
 */
export async function loadLocalModel({
  modelId,
  onProgress
} = {}) {
  if (engine) {
    return engine;
  }

  if (loadingPromise) {
    return loadingPromise;
  }

  if (!canRunLocalAI()) {
    throw new Error(
      "LOCAL_AI_UNAVAILABLE"
    );
  }

  if (!modelId) {
    throw new Error(
      "LOCAL_AI_MODEL_REQUIRED"
    );
  }

  loadingPromise =
    createEngine({
      modelId,
      onProgress
    });

  try {
    engine =
      await loadingPromise;

    return engine;
  } finally {
    loadingPromise =
      null;
  }
}

/**
 * Création réelle de WebLLM.
 */
async function createEngine({
  modelId,
  onProgress
}) {
  const webllm =
    await import(
      "@mlc-ai/web-llm"
    );

  const createdEngine =
    await webllm.CreateMLCEngine(
      modelId,
      {
        initProgressCallback:
          (progress) => {
            if (
              typeof onProgress ===
              "function"
            ) {
              onProgress(
                normalizeProgress(
                  progress
                )
              );
            }
          }
      }
    );

  return createdEngine;
}

/**
 * Envoie une demande au modèle local.
 *
 * Le modèle doit répondre en JSON.
 *
 * @param {{
 *   systemPrompt: string,
 *   userPrompt: string,
 *   jsonSchema?: object|null,
 *   temperature?: number
 * }} input
 */
export async function runLocalReasoning({
  systemPrompt,
  userPrompt,
  jsonSchema = null,
  temperature = 0.1
}) {
  if (!engine) {
    throw new Error(
      "LOCAL_AI_NOT_LOADED"
    );
  }

  const messages = [
    {
      role:
        "system",

      content:
        String(
          systemPrompt || ""
        )
    },

    {
      role:
        "user",

      content:
        String(
          userPrompt || ""
        )
    }
  ];

  const request = {
    messages,

    temperature,

    /*
     * On limite volontairement la créativité.
     *
     * Didou doit comprendre un document,
     * pas inventer.
     */
    top_p:
      0.8,

    frequency_penalty:
      0,

    presence_penalty:
      0
  };

  /*
   * WebLLM prend en charge le mode JSON.
   *
   * Si un schéma est fourni, on tente
   * d'imposer une sortie structurée.
   */
  if (jsonSchema) {
    request.response_format = {
      type:
        "json_object",

      schema:
        jsonSchema
    };
  } else {
    request.response_format = {
      type:
        "json_object"
    };
  }

  const response =
    await engine.chat.completions.create(
      request
    );

  const content =
    response?.choices?.[0]
      ?.message?.content;

  if (!content) {
    throw new Error(
      "LOCAL_AI_EMPTY_RESPONSE"
    );
  }

  return parseLocalJSON(
    content
  );
}

/**
 * Libère le modèle de la mémoire.
 */
export async function unloadLocalModel() {
  if (!engine) {
    return;
  }

  try {
    if (
      typeof engine.unload ===
      "function"
    ) {
      await engine.unload();
    }
  } finally {
    engine = null;
  }
}

/**
 * Parsing robuste du JSON produit
 * par le modèle local.
 */
function parseLocalJSON(
  value
) {
  if (
    value &&
    typeof value ===
      "object"
  ) {
    return value;
  }

  const text =
    String(value || "")
      .trim();

  if (!text) {
    throw new Error(
      "LOCAL_AI_EMPTY_JSON"
    );
  }

  /*
   * Cas normal.
   */
  try {
    return JSON.parse(
      text
    );
  } catch {
    // continue
  }

  /*
   * Certains modèles ajoutent malgré tout
   * ```json ... ```
   */
  const cleaned =
    text
      .replace(
        /^```json\s*/i,
        ""
      )
      .replace(
        /^```\s*/,
        ""
      )
      .replace(
        /\s*```$/,
        ""
      )
      .trim();

  try {
    return JSON.parse(
      cleaned
    );
  } catch {
    throw new Error(
      "LOCAL_AI_INVALID_JSON"
    );
  }
}

/**
 * Normalisation des informations
 * de téléchargement du modèle.
 */
function normalizeProgress(
  progress
) {
  const rawProgress =
    Number(
      progress?.progress
    );

  return {
    text:
      progress?.text ||
      progress?.status ||
      "Chargement de l’IA locale",

    progress:
      Number.isFinite(
        rawProgress
      )
        ? rawProgress
        : null,

    timeElapsed:
      progress?.timeElapsed ??
      null
  };
}
