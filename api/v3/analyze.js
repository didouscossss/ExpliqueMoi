/**
 * Endpoint V3 analyse — fondation uniquement.
 * Aucune logique métier. N’altère pas /api/analyze (V2).
 */

export default async function handler(request, response) {
  if (request.method === "OPTIONS") {
    return response.status(204).end();
  }

  return response.status(200).json({
    status: "ready",
    version: "v3"
  });
}
