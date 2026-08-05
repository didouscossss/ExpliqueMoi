#!/usr/bin/env node
/**
 * Tests 2.3.2 — suppression de la limite de 10 pages PDF.
 * Seule limite : 4 Mo.
 */
import { writeFileSync, mkdirSync, readFileSync, existsSync } from "fs";
import { join } from "path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { inspectPdf } from "../lib/pdfProcessing.js";
import {
  MAX_DOCUMENT_SIZE,
  planPdfChunks,
  buildTooLargeMessage
} from "../lib/pdfChunking.js";

const OUT = process.env.FIXTURE_DIR || "/tmp/pdf-page-limit-fixtures";
mkdirSync(OUT, { recursive: true });

function pass(id, detail = "") {
  console.log(JSON.stringify({ id, result: "PASS", detail }));
}

function fail(id, detail) {
  console.log(JSON.stringify({ id, result: "FAIL", detail }));
  process.exitCode = 1;
}

async function buildTextPdf(pageCount, targetBytes) {
  // Génère un PDF texte, puis densifie le contenu pour approcher targetBytes.
  let bytes = null;
  let density = 40;

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);

    for (let i = 0; i < pageCount; i += 1) {
      const page = doc.addPage([595, 842]);
      let y = 810;
      page.drawText(`Page ${i + 1}/${pageCount} — ExpliqueMoi test`, {
        x: 36,
        y,
        size: 12,
        font,
        color: rgb(0.1, 0.1, 0.1)
      });
      y -= 18;

      const line = `${"Lorem ipsum dolor sit amet, consectetur adipiscing elit. ".repeat(
        Math.max(1, Math.floor(density / 10))
      )}`;

      while (y > 36) {
        page.drawText(line.slice(0, 110), {
          x: 36,
          y,
          size: 8,
          font
        });
        y -= 9;
      }
    }

    bytes = Buffer.from(await doc.save());

    if (bytes.length >= targetBytes * 0.9 && bytes.length <= targetBytes * 1.05) {
      break;
    }

    if (bytes.length < targetBytes) {
      density += bytes.length < targetBytes * 0.5 ? 40 : 12;
    } else {
      density = Math.max(8, density - 8);
    }
  }

  // Si encore trop petit, pad via objets PDF additionnels (pages blanches riches).
  while (bytes.length < targetBytes) {
    const doc = await PDFDocument.load(bytes);
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const need = targetBytes - bytes.length;
    const extraPages = Math.max(1, Math.ceil(need / 25000));

    for (let i = 0; i < extraPages; i += 1) {
      const page = doc.addPage([595, 842]);
      let y = 800;
      const filler = "PAD-DATA-" + "Z".repeat(100);

      while (y > 40) {
        page.drawText(filler, { x: 30, y, size: 7, font });
        y -= 8;
      }
    }

    bytes = Buffer.from(await doc.save());

    // Évite de dépasser trop : si on dépasse, on s'arrête (tests PASS acceptent ≤4Mo).
    if (bytes.length >= targetBytes) {
      break;
    }
  }

  return bytes;
}

async function buildExactSizePdf(pageCount, targetBytes) {
  let bytes = await buildTextPdf(pageCount, Math.min(targetBytes, targetBytes));

  if (bytes.length > targetBytes) {
    // Regénère plus léger
    bytes = await buildTextPdf(pageCount, Math.floor(targetBytes * 0.7));
  }

  if (bytes.length < targetBytes) {
    // Padding binaire après %%EOF casse le PDF. On ajoute des pages jusqu'à approcher.
    let guard = 0;

    while (bytes.length < targetBytes && guard < 80) {
      const doc = await PDFDocument.load(bytes);
      const font = await doc.embedFont(StandardFonts.Helvetica);
      const page = doc.addPage([595, 842]);
      let y = 800;
      const filler = "W".repeat(120);

      while (y > 40) {
        page.drawText(filler, { x: 28, y, size: 7, font });
        y -= 8;
      }

      bytes = Buffer.from(await doc.save());
      guard += 1;
    }
  }

  return { bytes, pageCount: (await PDFDocument.load(bytes)).getPageCount() };
}

function assertAccepted(meta, label) {
  if (!meta.ok) {
    throw new Error(`${label}: refusé code=${meta.code} msg=${meta.message}`);
  }

  if (/limite de \d+ pages/i.test(meta.message || "")) {
    throw new Error(`${label}: message de limite pages inattendu`);
  }
}

function assertSizeGate(bytes, expectTooLarge) {
  const tooLarge = bytes.length > MAX_DOCUMENT_SIZE;

  if (tooLarge !== expectTooLarge) {
    throw new Error(
      `size gate: bytes=${bytes.length} limit=${MAX_DOCUMENT_SIZE} expectedTooLarge=${expectTooLarge}`
    );
  }

  if (tooLarge) {
    const message = buildTooLargeMessage(bytes.length, MAX_DOCUMENT_SIZE);
    if (!message) {
      throw new Error("message FILE_TOO_LARGE vide");
    }
  }
}

async function main() {
  // --- PASS: 5 / 12 / 30 / 120 pages sous 4 Mo ---
  const passCases = [
    { id: "P5", pages: 5, target: 2 * 1024 * 1024 },
    { id: "P12", pages: 12, target: 2 * 1024 * 1024 },
    { id: "P30", pages: 30, target: 3 * 1024 * 1024 },
    { id: "P120", pages: 120, target: Math.floor(3.8 * 1024 * 1024) }
  ];

  for (const test of passCases) {
    try {
      const doc = await PDFDocument.create();
      const font = await doc.embedFont(StandardFonts.Helvetica);
      const line = "Texte utile page document administratif français. ".repeat(8);

      for (let i = 0; i < test.pages; i += 1) {
        const page = doc.addPage([595, 842]);
        let y = 800;
        page.drawText(`Page ${i + 1}`, { x: 40, y, size: 14, font });
        y -= 20;

        while (y > 40) {
          page.drawText(line.slice(0, 100), { x: 40, y, size: 9, font });
          y -= 11;
        }
      }

      let bytes = Buffer.from(await doc.save());

      // Atteindre la taille cible sans changer le nombre de pages
      // (padding après EOF : pdf.js ignore le surplus).
      if (bytes.length < test.target) {
        bytes = Buffer.concat([
          bytes,
          Buffer.alloc(test.target - bytes.length, 0x0a)
        ]);
      }

      if (bytes.length > MAX_DOCUMENT_SIZE) {
        throw new Error(
          `fixture ${test.id} trop lourde: ${bytes.length} > ${MAX_DOCUMENT_SIZE}`
        );
      }

      const filePath = join(OUT, `${test.id}_${test.pages}p.pdf`);
      writeFileSync(filePath, bytes);

      const meta = await inspectPdf(bytes);
      assertAccepted(meta, test.id);

      if (meta.pageCount !== test.pages) {
        throw new Error(
          `${test.id}: pageCount=${meta.pageCount} expected=${test.pages}`
        );
      }

      assertSizeGate(bytes, false);

      const plan = planPdfChunks({
        pageCount: meta.pageCount,
        fileSize: bytes.length,
        textLength: meta.textLength,
        scanned: meta.scanned,
        pageTexts: meta.pageTexts
      });

      if (!plan || !plan.chunks?.length) {
        throw new Error(`${test.id}: planPdfChunks vide`);
      }

      if (
        test.pages > 6 &&
        bytes.length > 1.5 * 1024 * 1024 &&
        plan.mode !== "chunked"
      ) {
        throw new Error(`${test.id}: expected chunked, got ${plan.mode}`);
      }

      pass(
        test.id,
        `${meta.pageCount}p ${(bytes.length / 1024 / 1024).toFixed(2)}Mo mode=${plan.mode} chunks=${plan.chunkCount}`
      );
    } catch (error) {
      fail(test.id, error.message);
    }
  }

  // --- REFUS: 4.1 Mo ---
  try {
    const overBytes = Math.floor(4.1 * 1024 * 1024);
    const over = Buffer.alloc(overBytes, 0x41);
    assertSizeGate(over, true);

    // PDF minimal + payload binaire pour dépasser 4 Mo sans boucle pdf-lib coûteuse.
    // La gate FILE_TOO_LARGE côté API regarde page.size (octets fichier), pas la validité.
    const seed = await PDFDocument.create();
    const page = seed.addPage([300, 300]);
    page.drawText("oversize", { x: 40, y: 150, size: 12 });
    const seedBytes = Buffer.from(await seed.save());
    const pad = Buffer.alloc(overBytes - seedBytes.length, 0x20);
    const bigBytes = Buffer.concat([seedBytes, pad]);
    writeFileSync(join(OUT, "R_oversize.pdf"), bigBytes);
    assertSizeGate(bigBytes, true);

    if (bigBytes.length <= MAX_DOCUMENT_SIZE) {
      throw new Error("fixture oversize non atteinte");
    }

    pass(
      "R_SIZE",
      `FILE_TOO_LARGE ${(bigBytes.length / 1024 / 1024).toFixed(2)}Mo`
    );
  } catch (error) {
    fail("R_SIZE", error.message);
  }

  // --- REFUS: corrompu ---
  try {
    const corrupted = Buffer.from("%PDF-1.4\ncorrupted<<<<not a pdf");
    writeFileSync(join(OUT, "R_corrupted.pdf"), corrupted);
    const meta = await inspectPdf(corrupted);
    if (meta.ok || meta.code !== "PDF_CORRUPTED") {
      throw new Error(`expected PDF_CORRUPTED, got ok=${meta.ok} code=${meta.code}`);
    }
    pass("R_CORRUPT", meta.message);
  } catch (error) {
    fail("R_CORRUPT", error.message);
  }

  // --- REFUS: protégé ---
  try {
    const protectedPath = "/tmp/pdf-fixtures/E_protected.pdf";
    let protectedBytes;

    if (existsSync(protectedPath)) {
      protectedBytes = readFileSync(protectedPath);
    } else {
      // Créer un PDF chiffré via pdf-lib si possible
      const doc = await PDFDocument.create();
      const page = doc.addPage([300, 300]);
      page.drawText("secret", { x: 50, y: 150, size: 12 });
      try {
        protectedBytes = Buffer.from(
          await doc.save({
            userPassword: "secret",
            ownerPassword: "owner",
            // pdf-lib encryption support varies by version
          })
        );
      } catch {
        protectedBytes = null;
      }
    }

    if (!protectedBytes) {
      throw new Error("fixture PDF protégé indisponible");
    }

    writeFileSync(join(OUT, "R_protected.pdf"), protectedBytes);
    const meta = await inspectPdf(protectedBytes);

    if (meta.ok || meta.code !== "PDF_PROTECTED") {
      // Certains PDF "protected" fixtures peuvent être owner-password only
      if (meta.code !== "PDF_PROTECTED") {
        throw new Error(
          `expected PDF_PROTECTED, got ok=${meta.ok} code=${meta.code} msg=${meta.message}`
        );
      }
    }

    pass("R_PROTECTED", meta.message || "PDF_PROTECTED");
  } catch (error) {
    fail("R_PROTECTED", error.message);
  }

  // Garde-fou : plus aucun refus "limite de 10 pages"
  try {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    for (let i = 0; i < 15; i += 1) {
      const page = doc.addPage();
      page.drawText(`p${i + 1}`, { x: 50, y: 700, size: 20, font });
    }
    const bytes = Buffer.from(await doc.save());
    const meta = await inspectPdf(bytes);
    assertAccepted(meta, "NO_10_CAP");
    pass("NO_10_CAP", `${meta.pageCount} pages acceptées`);
  } catch (error) {
    fail("NO_10_CAP", error.message);
  }

  if (process.exitCode) {
    console.error("PDF page-limit tests FAILED");
    process.exit(1);
  }

  console.log("PDF page-limit tests PASSED");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
