# Didou — moteur local de compréhension documentaire

Parcours **gratuit / standard** d’ExpliqueMoi.

```
Document → extraction texte (pdfjs)
        → OCR local Tesseract (si image / PDF scanné)
        → Didou → résultat utilisateur
```

**Aucun appel Gemini / OpenAI** dans ce pipeline.

### OCR (quand ?)
- PDF avec couche texte exploitable → **pas d’OCR**
- PDF scanné → raster + OCR local (max 8 pages)
- Image / photo → OCR local
- OCR faible confiance → texte gardé mais marqué `uncertain` (pas un fait certain)

## Couches

| Couche | Dossier | Rôle |
|--------|---------|------|
| A Normalisation | `normalize/` | Nettoyage texte, montants, dates |
| B Détection | `detect/` | Famille + type (multi-signaux) |
| C Extraction | `extract/` | Dates, montants, entités, actions |
| D Interprétation | `interpret/` | Rôles (principal vs secondaire) |
| E Adaptateurs | `adapters/` | Quittance, facture, liasse, AG, générique |
| F Explication | `explain/` | Résumé utilisateur à partir des faits |

## Didoutor

La couche IA premium est séparée dans `lib/didoutor/`.  
Elle consomme `buildDidoutorContext(didouResult)` — **non branchée** pour l’instant.
