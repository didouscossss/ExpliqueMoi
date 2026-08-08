# ExpliqueMoi V3 — Architecture & plan de migration

**Branche :** `cursor/expliquemoi-v3-engine`  
**Base auditée :** `main` @ `8ec6103` (V2.3.4-restored)  
**Statut :** audit uniquement — aucun moteur métier modifié  
**Contrainte :** aucune PR vers `main` tant que ce document n’est pas validé

---

## 0. Objectifs V3

Construire un moteur documentaire :

- plus fiable ;
- moins coûteux ;
- respectueux de la confidentialité ;
- indépendant du fournisseur d’IA.

Pipeline cible :

```text
Document ou photo
→ préparation locale (navigateur)
→ OCR / extraction de texte (locale)
→ analyse locale déterministe
→ IA uniquement pour expliquer / rédiger
→ résultat
→ nettoyage complet
```

Principes absolus :

1. Aucun document conservé.
2. Aucune photo conservée.
3. Aucun texte OCR conservé après la session.
4. Aucun historique documentaire.
5. Aucune base de données de documents.
6. Aucun document envoyé dans des logs.
7. Aucun contenu personnel utilisé pour l’entraînement.
8. Nettoyage immédiat après succès, échec, annulation, nouveau document.

Interdits : Vercel Blob, Redis documentaire, disque durable, stockage cloud, BDD documentaire.

---

## 1. Architecture actuelle (V2)

### 1.1 Vue d’ensemble

```text
Navigateur (index.html)
  ├─ sélection fichiers (PDF / JPEG / PNG / WebP)
  ├─ compression photo (lib/imageCompression.js)
  ├─ FormData + manifest
  └─ POST /api/analyze  ─────────────────────────────┐
                                                       │
Serveur Vercel (serverless)                            │
  api/analyze.js                                       │
    ├─ validation taille / types                       │
    ├─ inspectPdf (pdfjs-dist) → texte + flag scanned  │
    ├─ planPdfChunks (lib/pdfChunking.js)              │
    ├─ mode direct : prompt + PDF/images bruts → Gemini│
    ├─ fallback page_images : raster JPEG → Gemini     │
    └─ mode chunked : texte ou JPEG par lots → Gemini  │
                                                       │
Après succès (navigateur)                              │
  ├─ state.analysis + chat                             │
  ├─ POST /api/chat   → contexte compact → Gemini      │
  └─ POST /api/assist → 100 % local (documentAssist)   │
```

UI active : `index.html` (monolithe).  
`script.js` est legacy / non référencé par `index.html`.

### 1.2 Pipeline d’import

| Étape | Où | Détail |
|-------|----|--------|
| Sélection | `index.html` `#fileInput` / `#cameraInput` | Max 10 pages ; PDF/JPEG/PNG/WebP |
| Page object | `addPageFromFile` | `file`, preview Object URL, métadonnées compression |
| Compression images | `compressPage` → `lib/imageCompression.js` | JPEG cible, max ~1,5 Mo / page, budget total 4 Mo |
| Seconde passe batch | `finalizeBatchCompression` | Si total > 4 Mo → recompress images (cible 700 Ko) |
| Analyse | `analyzeFile` → `sendAnalysis` | Manifest JSON + `page_N` + legacy `file` |
| Appel | `POST /api/analyze` | `Cache-Control: no-store`, AbortController |

Limites côté client : 4 Mo / fichier, 4 Mo total upload, PDF non compressé côté client.

### 1.3 Compression photo

Module : `lib/imageCompression.js` (réutilisable V3).

- Décodage `createImageBitmap` (navigateur) / `@napi-rs/canvas` (Node tests).
- Sortie documentaire : JPEG (sauf `preservePng`).
- Qualités / côtés max selon poids ; contraste léger pour lisibilité.
- Canvas / blobs transitoires ; preview Object URLs suivis dans `state.activeObjectUrls`.

### 1.4 Traitement PDF (serveur)

| Module | Rôle |
|--------|------|
| `lib/pdfProcessing.js` | `inspectPdf`, `rasterizePdfPages` (pdfjs-dist + canvas) |
| `lib/pdfChunking.js` | Plan direct vs chunked (seuil 6 pages / 1,5 Mo / scanné) |
| `lib/longPdfAnalysis.js` | Boucle chunks + appels Gemini + fusion |

Comportement actuel important :

- Extraction texte locale **existe déjà** (`inspectPdf` → `pdfFullText` / `pdfPageTexts`).
- En mode **direct**, le serveur envoie quand même le **PDF brut** (`inlineData` `application/pdf`) à Gemini, **en plus** du texte extrait.
- Fallback images : raster JPEG page par page si le direct est vide / inutilisable.
- Chunks texte longs : texte extrait (pas le PDF brut dans le chemin multi-chunks actif).

**Pas de PDF.js côté navigateur aujourd’hui.**  
**Pas de Tesseract / OCR navigateur aujourd’hui.**

### 1.5 Appels Gemini

| Endpoint | Appelle Gemini ? | Payload |
|----------|------------------|---------|
| `/api/analyze` | Oui | Prompt + PDF/images (et parfois texte) + schema JSON |
| `/api/chat` | Oui (si réponse locale insuffisante) | Contexte compact + historique + question |
| `/api/assist` | Non | Analyse JSON déjà connue |

Couche actuelle : `lib/geminiAnalysis.js` — modèle `gemini-3.5-flash` + fallbacks (`gemini-3.5-flash-lite`, `gemini-flash-latest` sur `main`).  
Clé : `GEMINI_API_KEY` (serveur uniquement).

### 1.6 Chat documentaire

- Frontend : `state.chatHistory`, `documentId`, `handleDocChatSubmit`.
- Serveur : `lib/documentContext.js` → `buildDocumentContext` + `tryAnswerLocally`.
- Gemini chat reçoit **uniquement** le JSON de contexte (pas le PDF).
- Rien n’est persisté serveur ; tout est renvoyé par le client à chaque requête.

### 1.7 Aide à répondre / remplir / checklist / questions

- UI : boutons `data-assist-action` → `requestAssistance` → `POST /api/assist`.
- Moteur : `lib/documentAssist.js` — déterministe, sans IA.
- Actions : `reply`, `fill`, `checklist`, `questions`.

### 1.8 État mémoire (navigateur)

Champs critiques dans `state` (`index.html`) :

- Fichiers : `pages[]` (`file`, `previewUrl`, compression)
- Analyse : `analysis`, `analysisContext`, `lastFormData`, `preparedPages`
- Contrôle : `activeController`, `requestId`, `analysisId`, `runtimeGeneration`
- Chat : `documentId`, `chatHistory`, `chatController`
- Assist : `assistController`, résultats affichés dans le DOM
- URLs : `activeObjectUrls`

Nettoyage existant :

| Fonction | Rôle |
|----------|------|
| `resetAnalysisRuntimeState` | Invalide génération, abort analyse, purge |
| `purgeAnalysisMemory` | Vide analyse + conversation |
| `purgeFileMemory` | Abort compression, revoke URLs, vide pages |
| `clearDocumentConversation` | Abort chat, vide historique |
| `resetApplication` | « Nouveau document » |
| `releaseRequestContext` (serveur) | Null `base64` / `bytes` / buffers |

### 1.9 Ce qui n’est **pas** stocké aujourd’hui

- Pas de Vercel Blob / Redis / IndexedDB / sessionStorage documentaire.
- `localStorage` : thème uniquement.
- Pas de BDD documents.
- Pas d’écriture disque durable en runtime prod (hors détection polices système en lecture).

---

## 2. Problèmes identifiés

### 2.1 Coût & fiabilité IA

1. **PDF texte → Gemini reçoit encore le PDF brut** en mode direct → tokens / coût / latence élevés, risque quota (429).
2. **Cascades modèles + retries** sur `main` (analyze + chat) multiplient les appels quand l’API répond 429 / 404.
3. **Fallback raster** peut déclencher un second gros appel (images) après un échec « soft ».
4. **Chunking** multiplie les appels Gemini sur PDF longs / scannés.
5. **Timeouts Vercel 60 s** vs boucles Gemini → échecs intermittents.

### 2.2 Confidentialité

1. Document brut transmis au fournisseur IA dès que l’analyse directe tourne.
2. `rawPreview` dans certaines erreurs analyze peut renvoyer un extrait de sortie modèle (dérivé du document).
3. `console.error(error)` côté API sans garantie d’absence de contenu.
4. Pas de hook `beforeunload` / `pagehide` pour forcer `destroyDocumentSession`.
5. Contenu dérivé (`state.analysis`, chat) reste en RAM jusqu’à reset — OK session, mais pas de fonction unique nommée / auditable `destroyDocumentSession()`.

### 2.3 Architecture

1. Couplage fort Gemini (`lib/geminiAnalysis.js`, `api/chat.js`).
2. Pas d’OCR local navigateur pour photos / PDF scannés.
3. Extraction PDF serveur seulement (pas locale) → le fichier traverse le réseau avant OCR.
4. UI et orchestration mélangées dans `index.html` (~8k+ lignes).
5. Assist déjà local, mais l’**analyse initiale** dépend encore presque entièrement de Gemini.

### 2.4 Produit / mobile / Vercel

1. Budget mémoire serverless (`api/analyze` 1024 Mo, 60 s) fragile pour raster multi-pages.
2. Mobile : compression photo OK, mais gros PDF scannés restent coûteux côté serveur.
3. Preview Vercel SSO peut bloquer les tests non authentifiés (hors scope moteur, mais impacte validation).

---

## 3. Modules à conserver

| Module | Pourquoi |
|--------|----------|
| `lib/imageCompression.js` | Pipeline photo mature, budgets 4 Mo, canvas cleanup |
| `lib/pdfProcessing.js` (partie extraction / raster) | PDF.js + canvas déjà opérationnels ; à réutiliser côté serveur ou migrer progressivement client |
| `lib/pdfChunking.js` | Heuristiques taille/pages/scanné utiles pour découper OCR local aussi |
| `lib/analysisEnrichment.js` | Normalisation dates / montants / risques post-extraction — base de l’analyse locale |
| `lib/documentContext.js` | Contexte compact + réponses locales chat |
| `lib/documentAssist.js` + `api/assist.js` | Aide répondre / remplir / checklist / questions sans IA |
| `lib/analysisPrompt.js` | Spécification métier FR réutilisable comme prompt **texte-only** |
| Patterns cleanup frontend | `purgeFileMemory`, revoke Object URLs, AbortControllers |
| `api/analyze.js` (squelette ingest) | Validation multipart, limites, `releaseRequestContext` |
| Scripts de test `scripts/test-*.mjs` | Non-régression compression / assist / PDF |

---

## 4. Modules à remplacer (ou fortement réduire)

| Module / zone | Action V3 |
|---------------|-----------|
| `lib/geminiAnalysis.js` | Remplacer par `AIProvider` + adaptateurs ; ne plus envoyer PDF/images si texte exploitable |
| Appels Gemini dans `api/analyze.js` | N’envoyer que texte OCR + `localAnalysis` + passages utiles |
| `lib/longPdfAnalysis.js` (orchestration Gemini) | Remplacer : OCR/extraction locale par pages, puis **un** appel IA d’explication |
| Boucles fallback modèles dans `api/chat.js` | Passer par `AIProvider.answerQuestion` ; 1 fournisseur configuré |
| Envoi `inlineData` PDF/image systématique | Réservé aux cas « texte non exploitable » uniquement |
| Monolithe `index.html` (progressif) | Extraire session documentaire + `destroyDocumentSession` sans changer le design dans l’étape 1 |

**Ne pas toucher au design UI** dans les premières étapes (consigne produit).

---

## 5. Nouveau pipeline V3

### 5.1 Flux cible

```text
[1] Import navigateur
      fichiers / caméra → pages session (RAM + Object URLs)

[2] Préparation locale
      photos → compression (module existant)
      PDF texte → extraction PDF.js navigateur (pages + positions si dispo)
      PDF scanné / photo → OCR Tesseract.js page par page
      sortie : ocrResult { pages[], fullText, warnings }

[3] Analyse locale déterministe (0 appel IA)
      localAnalysis = { documentType, issuer, dates, deadlines,
                        amounts, references, contacts,
                        requiredDocuments, detectedActions, warnings }

[4] Décision IA
      si fullText exploitable :
         AIProvider.analyzeText({ fullText, localAnalysis, excerpts })
         → 1 appel idéalement
      sinon (texte vide / confiance OCR trop basse) :
         fallback contrôlé (ex. page images compressées) OU erreur claire

[5] Enrichissement / validation schéma résultat UI (compat V2 si possible)

[6] Post-analyse session (RAM uniquement)
      chat → AIProvider.answerQuestion(sessionContext, q)
      assist → rester local (documentAssist) ; optionnellement AIProvider.draftReply / prepareChecklist plus tard

[7] destroyDocumentSession() partout
```

### 5.2 Contrat OCR local

```js
{
  pages: [
    {
      pageNumber: 1,
      text: "...",
      confidence: 92
      // optionnel V3.1 : boxes / positions
    }
  ],
  fullText: "...",
  warnings: []
}
```

Règle : **ne jamais** envoyer le document brut à l’IA si `fullText` est exploitable.

### 5.3 Contrat analyse locale

```js
localAnalysis = {
  documentType,
  issuer,
  dates,
  deadlines,
  amounts,
  references,      // dossier, SIRET, IBAN, BIC, fiscaux…
  contacts,        // téléphones, e-mails, adresses
  requiredDocuments,
  detectedActions,
  warnings
}
```

Doit fonctionner **sans** appel IA (y compris offline pour l’extraction structurée).

### 5.4 Organisation de code proposée (nouvelle, sans casser V2)

```text
lib/v3/
  session/
    documentSession.js      # état session + destroyDocumentSession
  ocr/
    extractPdfText.js       # PDF.js navigateur
    ocrTesseract.js         # Tesseract.js photos / scans
    types.js                # contrat ocrResult
  local/
    localAnalysis.js        # regex / heuristiques FR admin
    entities.js             # IBAN, SIRET, dates, montants…
  ai/
    AIProvider.js           # interface
    OpenAIProvider.js
    GeminiProvider.js
    MistralProvider.js
    createProvider.js       # AI_PROVIDER=…
  privacy/
    redactedLog.js          # logs sans contenu documentaire
api/
  v3/
    analyze.js              # nouvel endpoint optionnel (parallèle à V2)
    chat.js
```

La V2 (`/api/analyze`, `/api/chat`, `/api/assist`, `index.html`) reste intacte jusqu’à bascule progressive derrière un flag / route Preview.

### 5.5 Contraintes Vercel & mobile

| Contrainte | Stratégie V3 |
|------------|--------------|
| Serverless sans disque durable | Tout en mémoire request ; `finally` → destroy buffers |
| Timeout 60 s | OCR lourd côté navigateur ; serveur = analyse texte légère + 1 appel IA |
| Mobile CPU/batterie | OCR page par page, WebWorker, possibilité d’annuler |
| Taille bundle Tesseract | Chargement dynamique / worker ; ne pas bloquer first paint |
| Pas de Blob/Redis | Session = variables JS + closure request |

---

## 6. Stratégie de confidentialité

### 6.1 Fonction centrale

```js
destroyDocumentSession()
```

Doit :

- annuler requêtes (analyze / chat / assist / OCR workers) ;
- vider fichiers, OCR, tableaux, contexte IA, chat, brouillons ;
- révoquer Object URLs ;
- supprimer canvas / blobs / buffers ;
- remettre l’UI à zéro (écrans initiaux, sans changer le design system).

Appels obligatoires :

- Nouveau document ;
- expiration / fermeture volontaire de session ;
- erreur bloquante ;
- annulation ;
- fin de traitement serveur (`finally` + `releaseRequestContext`) ;
- idéalement `pagehide` / `visibility` agressif si session marquée « terminée ».

### 6.2 Règles logs

- Interdit : PDF base64, texte OCR, prompt complet, historique chat, `rawPreview` documentaire.
- Autorisé : requestId, durées, codes erreur, tailles, nombres de pages, modèle, provider (métadonnées).
- Module `redactedLog` unique pour API V3.

### 6.3 Fournisseur IA

- Clés uniquement serveur (`AI_PROVIDER` + clés associées).
- Payload minimal : texte nettoyé + `localAnalysis` + extraits + question.
- Aucune conservation côté ExpliqueMoi ; politique « no training » à documenter selon le fournisseur choisi (contrat / settings API).

### 6.4 Frontière confiance

| Zone | Contenu sensible | Durée de vie |
|------|------------------|--------------|
| Navigateur préparation | File, canvas, OCR | Jusqu’à destroy session |
| Serveur request | Buffers / texte | Durée d’une invocation |
| Fournisseur IA | Texte / extraits | Selon politique fournisseur — minimiser volume |
| Logs Vercel | Métadonnées seules | — |

---

## 7. Stratégie de réduction des coûts

1. **0 IA** pour extraction d’entités (dates, montants, IBAN, etc.).
2. **1 appel IA** pour l’explication initiale quand le texte local est bon.
3. Chat / drafts / checklists : réutilisent `sessionContext` en mémoire ; pas de renvoi du document.
4. Assist reste local en V3.0 (déjà gratuit).
5. Pas de fallback multi-modèles automatique en V3.0 (1 provider, 1 modèle configuré).
6. OCR navigateur évite les tokens image/PDF côté API.
7. Extraire `excerpts` (passages utiles) plutôt que `fullText` intégral si très long (résumé local + fenêtres autour des entités).

Cible indicative par analyse « PDF 2 pages texte » :

| Étape | Appels IA V2 typique | Appels IA V3 cible |
|-------|----------------------|--------------------|
| Analyse initiale succès | 1 (mais gros payload PDF) | 1 (texte + localAnalysis) |
| Analyse + 429 cascade | jusqu’à N modèles × retries | 1 échec explicite |
| Chat factuel local | 0 | 0 |
| Chat complexe | 1 (contexte) | 1 (contexte) |
| Assist | 0 | 0 |

---

## 8. Interface commune fournisseurs IA

```js
// lib/v3/ai/AIProvider.js (contrat)

export class AIProvider {
  /** Explication / structuration à partir du texte + analyse locale */
  async analyzeText(context) {}

  /** Q&R sur le contexte de session (pas le PDF) */
  async answerQuestion(context, question) {}

  /** Brouillon de réponse (optionnel V3.1 ; V3.0 peut rester local) */
  async draftReply(context, options) {}

  /** Checklist pièces (optionnel V3.1 ; V3.0 local) */
  async prepareChecklist(context) {}
}
```

Adaptateurs :

- `OpenAIProvider`
- `GeminiProvider`
- `MistralProvider`

Configuration :

```bash
AI_PROVIDER=openai   # | gemini | mistral
```

Règles :

- Un seul provider branché en V3.0.
- Changement = config uniquement.
- Clés jamais exposées au frontend.
- Erreurs normalisées : `{ code, httpStatus, message, provider, model, durationMs }` sans contenu documentaire.

Proposition V3.0 : garder **Gemini** comme premier adaptateur (clés déjà sur Vercel), derrière l’interface — pour isoler le reste du code du fournisseur.

---

## 9. Plan de migration par petites étapes

> Aucune étape ne merge vers `main` sans validation explicite.  
> La V2 reste déployable et inchangée sur `main`.

### Étape A — Fondation (cette livraison)

- [x] Branche `cursor/expliquemoi-v3-engine`
- [x] Audit + `ARCHITECTURE_V3.md`
- [ ] Validation produit

### Étape B — Session & confidentialité (sans changer l’UI)

- Extraire / unifier `destroyDocumentSession()` branchée sur les resets existants.
- Supprimer `rawPreview` documentaire des erreurs.
- Durcir logs API (métadonnées seules).
- Tests : Nouveau document / cancel / erreur → zéro File / Object URL / chat restant.

### Étape C — OCR / extraction locale (navigateur)

- PDF.js client pour PDF texte → `ocrResult`.
- Tesseract.js (worker) pour photos / scans page par page.
- Cleanup canvas / workers après chaque page et en fin de session.
- Feature flag Preview : préparer localement mais encore appeler V2 analyze (shadow) pour comparer.

### Étape D — Analyse locale déterministe

- Module `localAnalysis` (regex FR admin + enrichment existant).
- Affichage debug Preview des entités avant IA (optionnel, flag).
- Tests unitaires sans réseau.

### Étape E — `AIProvider` + analyze texte-only

- Interface + `GeminiProvider` minimal.
- Nouvel endpoint `/api/v3/analyze` (parallèle) : reçoit **texte + localAnalysis**, jamais le fichier si texte OK.
- 1 appel IA ; erreurs structurées.
- Preview dédiée ; pas de bascule prod.

### Étape F — Chat / assist sur session V3

- Chat via `AIProvider.answerQuestion` + contexte session.
- Assist reste local ; brancher `draftReply` / `prepareChecklist` seulement si gain mesuré.

### Étape G — Bascule progressive

- Flag `V3_ENGINE=1` Preview → puis prod.
- Mesures : taux succès, latence p95, appels IA / analyse, 429, taille payload.
- Retrait progressif de l’envoi PDF brut V2.

### Étape H — Indépendance fournisseur

- Brancher OpenAI ou Mistral derrière la même interface.
- Changer uniquement `AI_PROVIDER`.

---

## 10. Tests de non-régression

### 10.1 Suites existantes à conserver

| Script | Couverture |
|--------|------------|
| `npm run test:photo-compression` | Compression JPEG / budgets |
| `npm run test:assist` | reply / fill / checklist / questions |
| `npm run test:pdf` / `test:pdf-pages` | Limites PDF / multi-pages |
| `npm run test:analysis-quality` | Qualité schéma analyse (si applicable) |

### 10.2 Nouveaux tests V3 (à ajouter aux étapes B–E)

1. **Privacy**
   - Après `destroyDocumentSession`, plus de `File`, Object URL, OCR, chat, analysis.
   - Logs unitaires : aucun texte OCR / base64 dans les messages.

2. **OCR**
   - PDF texte 2 pages → `fullText` non vide, confidence pages, 0 appel IA dans l’extracteur.
   - Photo / scan synthétique → OCR page par page + cleanup canvas.

3. **Local analysis**
   - Fixtures FR : dates, montants EUR, IBAN, SIRET, e-mail, téléphone, « sous 15 jours », pièces demandées.
   - Fonctionne avec `AI_PROVIDER` absent / réseau coupé.

4. **AI provider**
   - Mock provider : `analyzeText` appelé 1× avec texte, jamais avec PDF bytes.
   - Config `AI_PROVIDER` sélectionne le bon adaptateur.

5. **Compat UI V2**
   - Tant que le design n’est pas changé : les écrans / flux Nouveau document / erreur restent inchangés.
   - Assist actions inchangées fonctionnellement.

6. **Mobile / perf (manuel Preview)**
   - iOS/Android : photo → OCR → résultat ; annulation mid-OCR ; Nouveau document pendant OCR.

### 10.3 Critères de sortie avant PR vers `main`

- Aucune régression assist / compression.
- PDF texte : **0** envoi de PDF brut à l’IA si texte exploitable.
- 1 appel IA max pour analyse initiale succès (hors chat utilisateur).
- `destroyDocumentSession` couvre succès / échec / cancel / nouveau document.
- Pas de Blob / Redis / disque / BDD documents introduits.

---

## 11. Décisions à valider avant de coder

1. **Premier provider V3.0** : Gemini (déjà en place) vs OpenAI vs Mistral ?
2. **OCR photos** : Tesseract.js OK, ou autre lib open-source navigateur préférée ?
3. **Endpoint** : nouveau `/api/v3/*` en parallèle (recommandé) vs remplacement in-place de `/api/analyze` ?
4. **Compat schéma UI** : conserver le JSON d’analyse V2 pour ne pas toucher au rendu ?
5. **Fallback si OCR insuffisant** : erreur claire utilisateur vs envoi images compressées exceptionnel ?

---

## 12. Synthèse

La V2 a déjà de solides briques privacy (mémoire, revoke URLs, assist local, chat sur contexte compact) et une extraction PDF serveur.  
Le verrou principal V3 est architectural : **l’IA reçoit encore le document brut** alors qu’un texte propre peut être obtenu localement, et **l’analyse structurée dépend trop de Gemini**.

V3 doit inverser la pile : **OCR + local d’abord, IA ensuite, provider interchangeable, session jetable**.

**Prochaine action :** validation de ce document, puis démarrage de l’étape B (session / confidentiality) sans modification du design.
