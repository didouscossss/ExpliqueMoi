# OCR assets locaux (V4-AC)

Packagés **dans le dépôt** — aucun CDN au runtime.

| Chemin | Rôle |
|--------|------|
| `worker.min.js` | Worker navigateur Tesseract.js |
| `core/` | WASM cores (`tesseract-core*.wasm` + `*.wasm.js`) |
| `lang/fra.traineddata.gz` | Modèle français |

Sous Node, le worker script Node est fourni par la dépendance `tesseract.js` (`src/worker-script/node`), pas par Internet. `corePath` et `langPath` pointent vers ce dossier.
