# ExpliqueMoi V3 — Roadmap

Branche : `cursor/expliquemoi-v3-engine`  
Règle : aucune PR vers `main` sans validation explicite. La V2 reste intacte.

---

## B — Architecture

**Statut : en cours / fondations livrées**

- Arborescence `lib/v3/`
- Interfaces TypeScript (`DocumentInput`, `OCRResult`, `LocalAnalysis`, `AIContext`, `AIProvider`, `AnalysisResult`)
- Squelettes providers (Gemini / OpenAI / Mistral)
- `DocumentSession` + `destroyDocumentSession()`
- Endpoint vide `GET/POST /api/v3/analyze` → `{ status: "ready", version: "v3" }`
- Aucune logique métier, aucun impact V2

---

## C — OCR

- Extraction PDF texte locale (PDF.js navigateur)
- OCR photos / PDF scannés (Tesseract.js ou équivalent open source)
- Contrat `OCRResult` rempli page par page
- Cleanup canvas / workers / Object URLs après usage
- Ne pas envoyer le document brut à l’IA si `fullText` exploitable

---

## D — Extraction locale

- Module déterministe `localAnalysis`
- Dates, échéances, montants, IBAN, SIRET, contacts, actions, urgence…
- Fonctionne sans appel IA
- Alimente `AIContext` pour l’étape E

---

## E — GeminiProvider

- Premier adaptateur `AIProvider` réellement connecté
- `analyze()` / `answer()` / `reply()` / `checklist()` sur texte + contexte
- Clés serveur uniquement (`AI_PROVIDER=gemini`)
- Un seul appel IA idéal pour l’analyse initiale

---

## F — Migration

- Brancher progressivement le front Preview sur `/api/v3/*` (flag)
- Compatibilité schéma UI sans changer le design
- Mesures : succès, latence, appels IA, 429
- V2 reste disponible en secours

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
