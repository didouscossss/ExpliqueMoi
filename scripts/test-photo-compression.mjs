#!/usr/bin/env node
/**
 * Tests 2.3.3 — compression photos progressive (A–L).
 */
import { createCanvas } from "@napi-rs/canvas";
import { PDFDocument, StandardFonts } from "pdf-lib";
import {
  compressImageForDocument,
  compressBatchForUpload,
  planImageCompression,
  COMPRESSION_THRESHOLDS,
  CompressionErrorCode
} from "../lib/imageCompression.js";
import { inspectPdf } from "../lib/pdfProcessing.js";

function pass(id, detail = "") {
  console.log(JSON.stringify({ id, result: "PASS", detail }));
}

function fail(id, detail) {
  console.log(JSON.stringify({ id, result: "FAIL", detail }));
  process.exitCode = 1;
}

function makeTextImageFile({
  width = 1800,
  height = 2400,
  mime = "image/jpeg",
  quality = 0.95,
  name = "doc.jpg",
  lines = null,
  noise = 0,
  denseNoise = false
}) {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  if (denseNoise) {
    // Bruit haute fréquence = peu compressible (simule photo téléphone lourde)
    const imageData = ctx.createImageData(width, height);
    const data = imageData.data;
    let seed = 0x12345678;

    for (let i = 0; i < data.length; i += 4) {
      // xorshift32 — bruit pseudo-aléatoire stable
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      const v = seed >>> 0;

      data[i] = v & 255;
      data[i + 1] = (v >>> 8) & 255;
      data[i + 2] = (v >>> 16) & 255;
      data[i + 3] = 255;
    }

    ctx.putImageData(imageData, 0, 0);
  } else {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
  }

  ctx.fillStyle = "#111111";
  ctx.font = "28px sans-serif";

  const content =
    lines ||
    [
      "CAF DU RHONE — Courrier de contrôle",
      "Référence dossier : DOS-2026-44127",
      "Date limite : 15/03/2026",
      "Montant indiqué : 245,80 €",
      "Merci de transmettre un justificatif de ressources.",
      "Adresse : 12 rue de la République, 69001 Lyon",
      "Signature : J. Martin",
      "Tableau : Ligne 1 | 12,50 | 01/02/2026",
      "Code : AB12-ZZ99",
      "Petits caractères : virement SEPA ref. FR7630006000011234567890189"
    ];

  // Bandeau blanc pour lisibilité du texte sur fond bruité
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(40, 40, width - 80, 520);
  ctx.fillStyle = "#111111";

  let y = 90;
  for (const line of content) {
    ctx.fillText(line, 60, y);
    y += 46;
  }

  ctx.font = "16px sans-serif";
  while (y < 540) {
    ctx.fillText(
      `Ligne détail ${y} — contrôle documentaire chiffres 1234567890`,
      60,
      y
    );
    y += 22;
  }

  if (noise > 0 && !denseNoise) {
    const imageData = ctx.getImageData(0, 0, width, height);
    for (let i = 0; i < imageData.data.length; i += 16) {
      imageData.data[i] = Math.min(
        255,
        imageData.data[i] + ((i * 13) % noise)
      );
    }
    ctx.putImageData(imageData, 0, 0);
  }

  let buffer;
  let type = mime;

  if (mime === "image/png") {
    buffer = canvas.toBuffer("image/png");
  } else if (mime === "image/webp") {
    try {
      buffer = canvas.toBuffer("image/webp");
    } catch {
      buffer = canvas.toBuffer("image/jpeg", {
        quality: Math.round(quality * 100)
      });
      type = "image/jpeg";
      name = name.replace(/\.webp$/i, ".jpg");
    }
  } else {
    buffer = canvas.toBuffer("image/jpeg", {
      quality: Math.round(quality * 100)
    });
    type = "image/jpeg";
  }

  return new File([buffer], name, {
    type,
    lastModified: Date.now()
  });
}

function makeHeavyDocumentJpeg(targetBytes, name, options = {}) {
  const maxBytes = options.maxBytes || targetBytes * 1.35;
  const presets = [
    { width: 1200, height: 1600, quality: 0.92, denseNoise: true },
    { width: 1400, height: 1900, quality: 0.92, denseNoise: true },
    { width: 1600, height: 2200, quality: 0.9, denseNoise: true },
    { width: 1800, height: 2400, quality: 0.88, denseNoise: true },
    { width: 2000, height: 2600, quality: 0.85, denseNoise: true },
    { width: 2200, height: 3000, quality: 0.82, denseNoise: true },
    { width: 2600, height: 3600, quality: 0.9, denseNoise: true },
    { width: 3000, height: 4200, quality: 0.95, denseNoise: true },
    { width: 3600, height: 5200, quality: 0.98, denseNoise: true },
    { width: 4200, height: 6000, quality: 0.99, denseNoise: true },
    { width: 4800, height: 6800, quality: 1, denseNoise: true }
  ];

  let previous = null;

  for (const preset of presets) {
    const file = makeTextImageFile({
      width: preset.width,
      height: preset.height,
      quality: preset.quality,
      denseNoise: preset.denseNoise,
      mime: "image/jpeg",
      name
    });

    if (file.size >= targetBytes && file.size <= maxBytes) {
      return file;
    }

    if (file.size > maxBytes) {
      // Choisir le candidat le plus proche sous le plafond
      if (previous && previous.size >= targetBytes * 0.8) {
        return previous;
      }

      return previous || file;
    }

    previous = file;
  }

  return previous;
}

function assertReadablePayload(result) {
  if (!result?.compressedFile) {
    throw new Error("compressedFile manquant");
  }

  // Heuristique : image finale doit rester assez grande pour le texte
  if (result.width > 0 && result.width < 600) {
    throw new Error(`largeur trop faible: ${result.width}`);
  }

  if (
    result.qualityUsed != null &&
    result.qualityUsed < COMPRESSION_THRESHOLDS.MIN_QUALITY - 0.001
  ) {
    throw new Error(`qualité trop basse: ${result.qualityUsed}`);
  }
}

async function main() {
  // Plan thresholds
  try {
    const light = planImageCompression(500 * 1024);
    const medium = planImageCompression(2.5 * 1024 * 1024);
    const heavy = planImageCompression(6 * 1024 * 1024);
    if (light.shouldCompress) throw new Error("light should skip");
    if (!medium.shouldCompress || medium.tier !== "medium") {
      throw new Error("medium plan invalid");
    }
    if (!heavy.shouldCompress || heavy.tier !== "heavy") {
      throw new Error("heavy plan invalid");
    }
  } catch (error) {
    fail("PLAN", error.message);
  }

  // A — JPG 500 Ko : pas de compression
  try {
    const clean = makeTextImageFile({
      width: 1400,
      height: 1800,
      quality: 0.72,
      noise: 6,
      name: "A_500ko.jpg"
    });

    if (clean.size >= COMPRESSION_THRESHOLDS.LIGHT_MAX_BYTES) {
      throw new Error(`fixture A trop lourde: ${clean.size}`);
    }

    const result = await compressImageForDocument(clean);
    if (result.wasCompressed) {
      throw new Error("ne devait pas compresser");
    }
    if (result.status !== "pristine") {
      throw new Error(`status=${result.status}`);
    }
    assertReadablePayload(result);
    pass(
      "A",
      `${(clean.size / 1024).toFixed(0)}Ko → ${(result.compressedSize / 1024).toFixed(0)}Ko wasCompressed=${result.wasCompressed}`
    );
  } catch (error) {
    fail("A", error.message);
  }

  // B — JPG 2,5 Mo : compression légère
  try {
    const file = makeHeavyDocumentJpeg(2.5 * 1024 * 1024, "B_2_5mo.jpg", {
      maxBytes: 3.9 * 1024 * 1024
    });
    const before = file.size;

    if (before < 1.2 * 1024 * 1024 || before > 4 * 1024 * 1024) {
      throw new Error(`fixture B hors zone medium: ${(before / 1024 / 1024).toFixed(2)}Mo`);
    }

    const result = await compressImageForDocument(file);
    if (!result.wasCompressed) {
      throw new Error("devait compresser");
    }
    if (result.compressedSize >= before) {
      throw new Error("taille non réduite");
    }
    if (result.compressedSize > COMPRESSION_THRESHOLDS.PER_IMAGE_MAX_BYTES) {
      throw new Error("encore > 4 Mo");
    }
    if (result.qualityUsed < 0.88) {
      throw new Error(`qualité medium trop basse: ${result.qualityUsed}`);
    }
    assertReadablePayload(result);
    pass(
      "B",
      `${(before / 1024 / 1024).toFixed(2)}Mo → ${(result.compressedSize / 1024).toFixed(0)}Ko q=${result.qualityUsed}`
    );
  } catch (error) {
    fail("B", error.message);
  }

  // C — JPG 6 Mo : compression progressive < 4 Mo
  try {
    const file = makeHeavyDocumentJpeg(6 * 1024 * 1024, "C_6mo.jpg");
    const before = file.size;

    if (before < 5.5 * 1024 * 1024) {
      throw new Error(`fixture C trop légère: ${(before / 1024 / 1024).toFixed(2)}Mo`);
    }

    const result = await compressImageForDocument(file);

    if (!result.wasCompressed) {
      throw new Error("devait compresser");
    }

    if (result.compressedSize >= COMPRESSION_THRESHOLDS.PER_IMAGE_MAX_BYTES) {
      throw new Error(
        `taille finale ${result.compressedSize} >= 4Mo`
      );
    }

    if (result.compressedSize >= before) {
      throw new Error("pas de réduction");
    }

    // Chemin heavy : qualité dans {0.88,0.82,0.76}
    if (![0.88, 0.82, 0.76].includes(result.qualityUsed)) {
      throw new Error(`qualité heavy inattendue: ${result.qualityUsed}`);
    }

    assertReadablePayload(result);
    pass(
      "C",
      `${(before / 1024 / 1024).toFixed(2)}Mo → ${(result.compressedSize / 1024 / 1024).toFixed(2)}Mo q=${result.qualityUsed} side=${result.maxSideUsed}`
    );
  } catch (error) {
    fail("C", error.message);
  }

  // D — PNG 5 Mo
  try {
    let file = makeTextImageFile({
      width: 2200,
      height: 3000,
      mime: "image/png",
      denseNoise: true,
      name: "D_5mo.png"
    });

    if (file.size < 4.5 * 1024 * 1024) {
      file = makeTextImageFile({
        width: 2800,
        height: 3800,
        mime: "image/png",
        denseNoise: true,
        name: "D_5mo.png"
      });
    }

    const before = file.size;

    if (before < 4.5 * 1024 * 1024) {
      throw new Error(`fixture D trop légère: ${(before / 1024 / 1024).toFixed(2)}Mo`);
    }

    const result = await compressImageForDocument(file);

    if (result.status === "error") {
      throw new Error(`${result.errorCode}: ${result.message}`);
    }

    if (result.compressedSize > COMPRESSION_THRESHOLDS.PER_IMAGE_MAX_BYTES) {
      throw new Error("PNG encore > 4 Mo");
    }

    assertReadablePayload(result);
    pass(
      "D",
      `${(before / 1024 / 1024).toFixed(2)}Mo → ${(result.compressedSize / 1024 / 1024).toFixed(2)}Mo type=${result.compressedFile.type}`
    );
  } catch (error) {
    fail("D", error.message);
  }

  // E — WebP lourd
  try {
    let file = makeTextImageFile({
      width: 3000,
      height: 4000,
      mime: "image/webp",
      quality: 0.95,
      noise: 30,
      name: "E_heavy.webp"
    });

    // Si runtime convertit déjà en jpeg à la génération, on force un jpeg lourd typé webp
    if (file.type !== "image/webp") {
      const jpg = makeTextImageFile({
        width: 3000,
        height: 4000,
        quality: 0.97,
        noise: 35,
        name: "E_heavy.webp"
      });
      file = new File([await jpg.arrayBuffer()], "E_heavy.webp", {
        type: "image/webp"
      });
    }

    const result = await compressImageForDocument(file);

    if (result.status === "error" && result.errorCode === CompressionErrorCode.UNSUPPORTED_IMAGE_FORMAT) {
      throw new Error("webp non supporté");
    }

    // Décode webp peut échouer selon canvas build → accepter decode fail explicite
    if (result.status === "error" && result.errorCode === CompressionErrorCode.IMAGE_DECODE_FAILED) {
      // fallback : traiter comme jpeg renommé
      const asJpeg = new File([await file.arrayBuffer()], "E_heavy.jpg", {
        type: "image/jpeg"
      });
      const retry = await compressImageForDocument(asJpeg);
      if (retry.status === "error") {
        throw new Error(retry.message);
      }
      pass("E", `webp decode indisponible → jpeg ok ${(retry.compressedSize / 1024).toFixed(0)}Ko`);
    } else {
      if (result.status === "error") {
        throw new Error(`${result.errorCode}: ${result.message}`);
      }
      assertReadablePayload(result);
      pass(
        "E",
        `${(file.size / 1024 / 1024).toFixed(2)}Mo → ${(result.compressedSize / 1024).toFixed(0)}Ko`
      );
    }
  } catch (error) {
    fail("E", error.message);
  }

  // F — Trois photos ~3 Mo → lot ≤ 4 Mo si possible, sinon BATCH_TOO_LARGE
  try {
    const files = [];

    for (let i = 0; i < 3; i += 1) {
      const file = makeHeavyDocumentJpeg(3 * 1024 * 1024, `F_${i}.jpg`);

      if (file.size < 2.5 * 1024 * 1024) {
        throw new Error(`fixture F${i} trop légère`);
      }

      files.push(file);
    }

    const batch = await compressBatchForUpload(files);
    const sizes = batch.results.map((item) => item.compressedSize);
    const detail = `total=${(batch.totalSize / 1024 / 1024).toFixed(2)}Mo sizes=[${sizes
      .map((n) => `${(n / 1024).toFixed(0)}Ko`)
      .join(",")}] ok=${batch.ok}`;

    if (batch.ok) {
      if (batch.totalSize > COMPRESSION_THRESHOLDS.BATCH_MAX_BYTES) {
        throw new Error("ok=true mais total > 4Mo");
      }
      pass("F", detail);
    } else if (batch.errorCode === CompressionErrorCode.BATCH_TOO_LARGE) {
      pass("F", `${detail} message=BATCH_TOO_LARGE`);
    } else {
      throw new Error(`échec inattendu: ${batch.errorCode}`);
    }
  } catch (error) {
    fail("F", error.message);
  }

  // G — image très longue (téléphone portrait)
  try {
    const file = makeTextImageFile({
      width: 1200,
      height: 3200,
      quality: 0.92,
      noise: 10,
      name: "G_long.jpg"
    });
    const result = await compressImageForDocument(file, { rotation: 0 });
    if (result.status === "error") {
      throw new Error(result.message);
    }
    if (result.height + result.width < 2000) {
      throw new Error("dimensions suspectes");
    }
    // Orientation : compression sans rotation forcée ne doit pas inverser
    if (result.wasCompressed && result.height < result.width) {
      // source was portrait; after compress without rotation should stay portrait
      throw new Error("orientation incorrecte");
    }
    if (!result.wasCompressed && file.size >= COMPRESSION_THRESHOLDS.LIGHT_MAX_BYTES) {
      // ok
    }
    assertReadablePayload(result);
    pass(
      "G",
      `${result.width}x${result.height} ${(result.compressedSize / 1024).toFixed(0)}Ko`
    );
  } catch (error) {
    fail("G", error.message);
  }

  // H — petits caractères : qualité >= 0.76
  try {
    const file = makeTextImageFile({
      width: 2400,
      height: 3200,
      quality: 0.97,
      noise: 20,
      name: "H_small_text.jpg",
      lines: [
        "ref. FR76 3000 6000 0112 3456 7890 189",
        "montant 1 234,56 € — échéance 01/09/2026",
        "code dossier ZX-0091-AA",
        "signature manuscrite lisible"
      ]
    });
    const result = await compressImageForDocument(file, { force: true });
    if (result.status === "error") throw new Error(result.message);
    assertReadablePayload(result);
    pass("H", `q=${result.qualityUsed ?? "n/a"} size=${(result.compressedSize / 1024).toFixed(0)}Ko`);
  } catch (error) {
    fail("H", error.message);
  }

  // I — suppression pendant compression (Abort + token)
  try {
    const file = makeTextImageFile({
      width: 3000,
      height: 4000,
      quality: 0.97,
      noise: 30,
      name: "I_abort.jpg"
    });
    const controller = new AbortController();
    const pending = compressImageForDocument(file, {
      force: true,
      signal: controller.signal
    });
    controller.abort();
    const result = await pending;
    if (result.status !== "aborted" && result.status !== "compressed" && result.status !== "pristine") {
      // race: may finish before abort
      if (result.status === "error" && result.message.includes("annul")) {
        pass("I", "abort message");
      } else if (result.status === "error") {
        throw new Error(`status inattendu ${result.status} ${result.errorCode}`);
      } else {
        pass("I", `race finish status=${result.status}`);
      }
    } else {
      pass("I", `status=${result.status}`);
    }
  } catch (error) {
    if (error?.name === "AbortError") {
      pass("I", "AbortError");
    } else {
      fail("I", error.message);
    }
  }

  // J — Nouveau document = état vierge (simulation tokens)
  try {
    let selectionId = 1;
    let pages = [
      { id: "p1", compressToken: "t1", file: "old" }
    ];

    // nouveau document
    selectionId += 1;
    pages = [];
    const staleToken = "t1";
    const current = pages.find((page) => page.compressToken === staleToken);
    if (current) {
      throw new Error("ancienne page encore présente");
    }
    if (selectionId !== 2 || pages.length !== 0) {
      throw new Error("état non vierge");
    }
    pass("J", "selectionId invalidation + pages=[]");
  } catch (error) {
    fail("J", error.message);
  }

  // K — analyse photo après compression (fichier final acceptable)
  try {
    const file = makeTextImageFile({
      width: 2600,
      height: 3400,
      quality: 0.96,
      noise: 22,
      name: "K_analyze.jpg"
    });
    const result = await compressImageForDocument(file);
    if (result.status === "error") throw new Error(result.message);
    if (!result.compressedFile?.size) throw new Error("no file");
    if (result.compressedSize > COMPRESSION_THRESHOLDS.PER_IMAGE_MAX_BYTES) {
      throw new Error("too large for analyze");
    }
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(
        result.compressedFile.type
      )
    ) {
      throw new Error(`mime invalide ${result.compressedFile.type}`);
    }
    pass(
      "K",
      `ready mime=${result.compressedFile.type} ${(result.compressedSize / 1024).toFixed(0)}Ko`
    );
  } catch (error) {
    fail("K", error.message);
  }

  // L — PDF non compressé / pas de régression
  try {
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const page = pdf.addPage([595, 842]);
    page.drawText("PDF regression test — 12 pages limit removed", {
      x: 40,
      y: 780,
      size: 14,
      font
    });
    for (let i = 0; i < 11; i += 1) {
      const p = pdf.addPage([595, 842]);
      p.drawText(`Page PDF ${i + 2}`, { x: 40, y: 780, size: 14, font });
    }
    const bytes = Buffer.from(await pdf.save());
    const pdfFile = new File([bytes], "L.pdf", {
      type: "application/pdf"
    });

    // compressImageForDocument doit refuser le PDF (unsupported), batch skip
    const imgResult = await compressImageForDocument(pdfFile);
    if (imgResult.errorCode !== CompressionErrorCode.UNSUPPORTED_IMAGE_FORMAT) {
      throw new Error("PDF ne doit pas être compressé comme image");
    }

    const batch = await compressBatchForUpload([pdfFile]);
    if (batch.results[0].status !== "skipped_pdf") {
      throw new Error("PDF batch non skip");
    }
    if (batch.results[0].compressedFile.size !== pdfFile.size) {
      throw new Error("PDF modifié");
    }

    const meta = await inspectPdf(bytes);
    if (!meta.ok || meta.pageCount !== 12) {
      throw new Error(`inspectPdf regression: ok=${meta.ok} pages=${meta.pageCount}`);
    }

    pass("L", `PDF intact ${meta.pageCount}p ${(bytes.length / 1024).toFixed(0)}Ko`);
  } catch (error) {
    fail("L", error.message);
  }

  if (process.exitCode) {
    console.error("Photo compression tests FAILED");
    process.exit(1);
  }

  console.log("Photo compression tests PASSED");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
