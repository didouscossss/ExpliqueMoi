# Didou — moteur local de compréhension documentaire

Parcours **gratuit / standard** d’ExpliqueMoi.

```
Document → extraction texte (pdfjs) → Didou → résultat utilisateur
```

**Aucun appel Gemini / OpenAI** dans ce pipeline.

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
