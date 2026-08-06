# ExpliqueMoi V3 — Roadmap

Branche : `cursor/expliquemoi-v3-engine`  
Règle : aucune PR vers `main` sans validation explicite. La V2 reste intacte.

---

## B — Architecture

**Statut : validée**

- Arborescence `lib/v3/`
- Interfaces TypeScript (`DocumentInput`, `OCRResult`, `LocalAnalysis`, `AIContext`, `AIProvider`, `AnalysisResult`)
- Squelettes providers (Gemini / OpenAI / Mistral)
- `DocumentSession` + `destroyDocumentSession()`
- Endpoint vide `GET/POST /api/v3/analyze` → `{ status: "ready", version: "v3" }`
- Aucune logique métier, aucun impact V2

---

## C — OCR

**Statut : validée**

- `lib/v3/ocr/OcrEngine.ts` : `extractText` / `extractPages` / `isScannedPdf` / `languageDetection`
- PDF texte → pdfjs uniquement (Tesseract non lancé)
- PDF scanné / image → Tesseract.js uniquement
- Aucun provider IA branché
- Tests : `npm run test:v3-ocr`

---

## D — Extraction locale

**Statut : validée**

- `lib/v3/localAnalysis/LocalAnalysisEngine.ts`
- Types : facture, devis, contrat, bulletin_de_salaire, releve_bancaire, courrier, ordonnance, document_inconnu
- Champs : entreprise, client, date, HT/TVA/TTC, IBAN, SIRET, n° facture
- Regex / heuristiques uniquement — aucune IA
- Tests : `npm run test:v3-local`

---

## E — Architecture providers (générique)

**Statut : livrée (en attente validation)**

- `AIProvider` : `analyze()` / `answer()` / `summarize()`
- `ProviderConfig` + `createProviderConfig()`
- `ProviderFactory` / `getAIProvider()` — registre vide, aucun adapter concret
- Aucun Gemini / OpenAI / Mistral branché
- Aucun appel réseau, aucune clé API, aucun endpoint
- Tests : `npm run test:v3-providers`

---

## F — Provider concret + câblage

- Enregistrer le premier adapter (ex. Gemini) dans `ProviderFactory`
- Brancher `analyze` / `answer` / `summarize` sur texte + `localAnalysis`
- Clés serveur uniquement via config
- Toujours aucun impact sur les endpoints V2 jusqu’à migration contrôlée

---

## G — Optimisation

- Réduction payload (extraits utiles)
- Perf mobile OCR
- Choix / bascule provider par config
- Durcissement privacy / logs

---

## H — Suppression de V2

- Retrait des chemins V2 obsolètes (envoi PDF brut, cascades, etc.)
- Uniquement après validation prod V3
- PR dédiée vers `main` à ce moment seulement
