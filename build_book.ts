#!/usr/bin/env bun
/**
 * Build book PDF from chapter_*.md files using pdfmake.
 */

import { existsSync, readFileSync, writeFileSync, createWriteStream } from "node:fs";
import { readdir } from "node:fs/promises";
import { join, resolve, basename } from "node:path";
import { randomUUID } from "node:crypto";
import JSZip from "jszip";

// pdfmake server-side printer
import PdfPrinter from "pdfmake/src/printer";
import type {
  TDocumentDefinitions,
  Content,
  DynamicContent,
} from "pdfmake/interfaces";

// ---- Types ----

interface ChapterElement {
  type: "heading" | "subtitle" | "paragraph" | "scene_break";
  text?: string;
}

interface TextSegment {
  text: string;
  bold?: boolean;
  italics?: boolean;
}

interface BuildOptions {
  title?: string;
  author?: string;
  cover?: string;
  epubCover?: string;
  lang?: string;
  epub?: boolean;
  output?: string;
}

interface FontDescriptors {
  [fontName: string]: {
    normal: string;
    bold: string;
    italics: string;
    bolditalics: string;
  };
}

// ---- Chapter heading translations ----

const CHAPTER_TRANSLATIONS: Record<string, string> = {
  EN: "CHAPTER",
  PT: "CAPÍTULO",
  FR: "CHAPITRE",
  ES: "CAPÍTULO",
  DE: "KAPITEL",
  IT: "CAPITOLO",
  NL: "HOOFDSTUK",
  SV: "KAPITEL",
  DA: "KAPITEL",
  NO: "KAPITTEL",
  FI: "LUKU",
  PL: "ROZDZIAŁ",
  RO: "CAPITOLUL",
  CS: "KAPITOLA",
  SK: "KAPITOLA",
  HU: "FEJEZET",
  HR: "POGLAVLJE",
  SL: "POGLAVJE",
  BS: "POGLAVLJE",
  SR: "ПОГЛАВЉЕ",
  BG: "ГЛАВА",
  EL: "ΚΕΦΑΛΑΙΟ",
  CA: "CAPÍTOL",
  GL: "CAPÍTULO",
  EU: "KAPITULUA",
  GA: "CAIBIDIL",
  IS: "KAFLI",
  LT: "SKYRIUS",
  LV: "NODAĻA",
  ET: "PEATÜKK",
  MT: "KAPITLU",
  SQ: "KAPITULLI",
  MK: "ПОГЛАВЈЕ",
  CY: "PENNOD",
  UK: "РОЗДІЛ",
  BE: "РАЗДЗЕЛ",
};

// ---- Constants ----

const PAGE_WIDTH = 432; // 6in in points
const PAGE_HEIGHT = 648; // 9in in points
const MARGIN_SIDE = 47; // 0.65in ≈ 46.8pt
const MARGIN_TB = 54; // 0.75in = 54pt
const CONTENT_WIDTH = PAGE_WIDTH - 2 * MARGIN_SIDE; // 338pt

// Non-breaking spaces for first-line indent (~18pt at 12pt serif).
// NBSP is not stretched by PDF justification, unlike em/en-space.
const INDENT_CHARS = "\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0";

// Scene break: asterisks separated by em-space + en-space (≈18pt gap, matching CSS letter-spacing)
const SCENE_BREAK_TEXT = "*\u2003\u2002*\u2003\u2002*";

// ---- Argument parsing ----

function parseArgs(): { directory: string; options: BuildOptions } {
  const args = process.argv.slice(2);
  let directory: string | undefined;
  const options: BuildOptions = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--title" && i + 1 < args.length) {
      options.title = args[++i];
    } else if (args[i] === "--author" && i + 1 < args.length) {
      options.author = args[++i];
    } else if (args[i] === "--cover" && i + 1 < args.length) {
      options.cover = args[++i];
    } else if (args[i] === "--epub-cover" && i + 1 < args.length) {
      options.epubCover = args[++i];
    } else if (args[i] === "--lang" && i + 1 < args.length) {
      options.lang = args[++i].toUpperCase();
    } else if (args[i] === "--epub") {
      options.epub = true;
    } else if (args[i] === "--output" && i + 1 < args.length) {
      options.output = args[++i];
    } else if (!args[i].startsWith("--")) {
      directory = args[i];
    }
  }

  if (!directory) {
    console.error(
      'Usage: bun run build_book.ts <directory> [--title "Title"] [--author "Author"] [--cover path/to/image] [--epub-cover path/to/image] [--lang CODE] [--epub] [--output name]',
    );
    process.exit(1);
  }

  return { directory: resolve(directory), options };
}

// ---- Chapter parsing ----

function parseChapter(filepath: string, chapterWord: string = "CHAPTER"): ChapterElement[] {
  const content = readFileSync(filepath, "utf-8");
  const lines = content.split("\n");
  const elements: ChapterElement[] = [];
  let i = 0;

  // Strip YAML frontmatter (Obsidian-style: --- delimited block at start of file)
  if (i < lines.length && lines[i].trim() === "---") {
    i++;
    while (i < lines.length && lines[i].trim() !== "---") {
      i++;
    }
    if (i < lines.length) i++; // skip closing ---
    while (i < lines.length && lines[i].trim() === "") i++;
  }

  let paraLines: string[] = [];

  function flushPara() {
    if (paraLines.length > 0) {
      // Join lines: if a line ends with a single hyphen (not --), join without
      // a space to reconnect hard-wrapped hyphenated words (e.g. "Earth-\nside").
      let joined = paraLines[0];
      for (let j = 1; j < paraLines.length; j++) {
        if (joined.endsWith("-") && !joined.endsWith("--")) {
          joined += paraLines[j];
        } else {
          joined += " " + paraLines[j];
        }
      }
      elements.push({ type: "paragraph", text: joined });
      paraLines = [];
    }
  }

  while (i < lines.length) {
    const stripped = lines[i].trim();
    if (/^# /.test(stripped)) {
      flushPara();
      let headingText = stripped.slice(2);
      headingText = headingText.replace(/^CHAPTER/, chapterWord);
      elements.push({ type: "heading", text: headingText });
    } else if (/^## /.test(stripped)) {
      flushPara();
      elements.push({ type: "subtitle", text: stripped.slice(3) });
    } else if (stripped === "* * *") {
      flushPara();
      elements.push({ type: "scene_break" });
    } else if (stripped === "") {
      flushPara();
    } else {
      paraLines.push(stripped);
    }
    i++;
  }

  flushPara();
  return elements;
}

// ---- Typographic substitutions ----

function typographicSubstitutions(text: string): string {
  return text.replace(/--/g, "\u2014");
}

// ---- Inline formatting (Markdown bold/italic) ----

function parseInlineFormatting(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  // Match ***bold italic***, **bold**, *italic* (and ___ / __ / _ equivalents) — longest marker first
  const pattern = /\*{3}(.+?)\*{3}|_{3}(.+?)_{3}|\*{2}(.+?)\*{2}|_{2}(.+?)_{2}|\*(.+?)\*|_(.+?)_/g;
  let lastIndex = 0;
  let match;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ text: text.slice(lastIndex, match.index) });
    }
    if (match[1] !== undefined || match[2] !== undefined) {
      segments.push({ text: (match[1] ?? match[2])!, bold: true, italics: true });
    } else if (match[3] !== undefined || match[4] !== undefined) {
      segments.push({ text: (match[3] ?? match[4])!, bold: true });
    } else if (match[5] !== undefined || match[6] !== undefined) {
      segments.push({ text: (match[5] ?? match[6])!, italics: true });
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex) });
  }

  return segments.length > 0 ? segments : [{ text }];
}

// ---- Font resolution ----

interface FontResult {
  name: string;
  descriptors: FontDescriptors;
}

function resolveFont(): FontResult {
  function findFile(dir: string, candidates: string[]): string | null {
    for (const name of candidates) {
      const path = join(dir, name);
      if (existsSync(path)) return path;
    }
    return null;
  }

  // Georgia (from ttf-mscorefonts-installer)
  const georgiaDir = "/usr/share/fonts/truetype/msttcorefonts";
  const georgiaNormal = findFile(georgiaDir, [
    "Georgia.ttf",
    "georgia.ttf",
  ]);
  if (georgiaNormal) {
    const bold = findFile(georgiaDir, [
      "Georgia_Bold.ttf",
      "georgiab.ttf",
      "Georgia-Bold.ttf",
    ]);
    const italics = findFile(georgiaDir, [
      "Georgia_Italic.ttf",
      "georgiai.ttf",
      "Georgia-Italic.ttf",
    ]);
    const bolditalics = findFile(georgiaDir, [
      "Georgia_Bold_Italic.ttf",
      "georgiaz.ttf",
      "Georgia-BoldItalic.ttf",
    ]);
    if (bold && italics && bolditalics) {
      return {
        name: "Georgia",
        descriptors: {
          Georgia: {
            normal: georgiaNormal,
            bold,
            italics,
            bolditalics,
          },
        },
      };
    }
  }

  // Liberation Serif (metrically compatible with Times New Roman)
  const liberationDirs = [
    "/usr/share/fonts/truetype/liberation",
    "/usr/share/fonts/truetype/liberation2",
  ];
  for (const dir of liberationDirs) {
    const normal = join(dir, "LiberationSerif-Regular.ttf");
    if (existsSync(normal)) {
      return {
        name: "LiberationSerif",
        descriptors: {
          LiberationSerif: {
            normal,
            bold: join(dir, "LiberationSerif-Bold.ttf"),
            italics: join(dir, "LiberationSerif-Italic.ttf"),
            bolditalics: join(dir, "LiberationSerif-BoldItalic.ttf"),
          },
        },
      };
    }
  }

  // DejaVu Serif
  const dejavuDir = "/usr/share/fonts/truetype/dejavu";
  const dejavuNormal = join(dejavuDir, "DejaVuSerif.ttf");
  if (existsSync(dejavuNormal)) {
    return {
      name: "DejaVuSerif",
      descriptors: {
        DejaVuSerif: {
          normal: dejavuNormal,
          bold: join(dejavuDir, "DejaVuSerif-Bold.ttf"),
          italics: join(dejavuDir, "DejaVuSerif-Italic.ttf"),
          bolditalics: join(dejavuDir, "DejaVuSerif-BoldItalic.ttf"),
        },
      },
    };
  }

  console.error(
    "No suitable serif font found. Install one of:\n" +
      "  sudo apt install ttf-mscorefonts-installer  # Georgia\n" +
      "  sudo apt install fonts-liberation             # Liberation Serif\n" +
      "  sudo apt install fonts-dejavu                 # DejaVu Serif",
  );
  process.exit(1);
}

// ---- Image dimensions ----

function getImageDimensions(
  filepath: string,
): { width: number; height: number } {
  const buf = readFileSync(filepath);

  // PNG: signature (8 bytes) + IHDR chunk (4 len + 4 type + 4 width + 4 height)
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return {
      width: buf.readUInt32BE(16),
      height: buf.readUInt32BE(20),
    };
  }

  // JPEG: scan for SOF0 (0xFFC0) or SOF2 (0xFFC2) marker
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let offset = 2;
    while (offset < buf.length - 1) {
      if (buf[offset] !== 0xff) break;
      const marker = buf[offset + 1];
      if (marker === 0xc0 || marker === 0xc2) {
        return {
          height: buf.readUInt16BE(offset + 5),
          width: buf.readUInt16BE(offset + 7),
        };
      }
      // Skip to next marker
      const segLen = buf.readUInt16BE(offset + 2);
      offset += 2 + segLen;
    }
  }

  // Fallback: assume page-sized (no centering offset)
  return { width: PAGE_WIDTH, height: PAGE_HEIGHT };
}

// ---- Build pdfmake document definition ----

function buildDocDefinition(
  chapters: ChapterElement[][],
  options: BuildOptions,
  fontName: string,
  frontmatter?: ChapterElement[],
): TDocumentDefinitions {
  const content: Content[] = [];
  const hasCover = !!options.cover;
  const hasTitle = !!(options.title || options.author);
  const frontMatterPages = (hasCover ? 1 : 0) + (hasTitle ? 1 : 0);

  // Cover page: full-page image, centered on page
  if (options.cover) {
    const coverPath = resolve(options.cover);
    const img = getImageDimensions(coverPath);
    const scale = Math.min(PAGE_WIDTH / img.width, PAGE_HEIGHT / img.height);
    const fitW = img.width * scale;
    const fitH = img.height * scale;
    const offsetX = (PAGE_WIDTH - fitW) / 2;
    const offsetY = (PAGE_HEIGHT - fitH) / 2;
    content.push(
      {
        image: coverPath,
        width: fitW,
        absolutePosition: { x: offsetX, y: offsetY },
      } as any,
      // Dummy node to occupy page 1 and force a page break
      { text: " ", fontSize: 1, pageBreak: "after" } as any,
    );
  }

  // Title page: centered, ~40% down (CSS padding-top: 40% = 40% of content width = 135pt)
  if (hasTitle) {
    const titleStack: Content[] = [];
    if (options.title) {
      titleStack.push({
        text: typographicSubstitutions(options.title),
        fontSize: 36,
        bold: true,
        alignment: "center",
        margin: [0, 0, 0, 10],
      });
    }
    if (options.author) {
      titleStack.push({
        text: options.author,
        fontSize: 18,
        italics: true,
        alignment: "center",
      });
    }
    content.push({
      stack: titleStack,
      margin: [0, Math.round(CONTENT_WIDTH * 0.4), 0, 0],
      pageBreak: "after",
    } as any);
  }

  // Frontmatter section (between title page and first chapter)
  if (frontmatter && frontmatter.length > 0) {
    let needNoIndent = true;
    for (const el of frontmatter) {
      if (el.type === "heading") {
        content.push({
          text: typographicSubstitutions(el.text!),
          fontSize: 20,
          bold: true,
          alignment: "center",
          characterSpacing: 2,
          margin: [0, 72, 0, 4],
        });
        needNoIndent = true;
      } else if (el.type === "subtitle") {
        content.push({
          text: typographicSubstitutions(el.text!),
          fontSize: 10,
          italics: true,
          alignment: "center",
          margin: [0, 0, 0, 24],
        });
        needNoIndent = true;
      } else if (el.type === "scene_break") {
        content.push({
          text: SCENE_BREAK_TEXT,
          alignment: "center",
          fontSize: 12,
          margin: [0, 18, 0, 18],
        });
        needNoIndent = true;
      } else if (el.type === "paragraph") {
        const processed = typographicSubstitutions(el.text!);
        const segments = parseInlineFormatting(processed);
        content.push({
          text: segments,
          alignment: "justify",
        });
      }
    }
    // Page break so chapter 1 starts on a new page
    content.push({ text: "", pageBreak: "after" } as any);
  }

  // Chapters
  let isFirstChapter = true;
  for (const elements of chapters) {
    let needNoIndent = false;

    for (const el of elements) {
      if (el.type === "heading") {
        const node: any = {
          text: typographicSubstitutions(el.text!),
          fontSize: 20,
          bold: true,
          alignment: "center",
          characterSpacing: 2, // 0.1em at 20pt
          margin: [0, 72, 0, 4], // 6em top margin, ~0.3em bottom
        };
        // Page break before each chapter (first chapter relies on front matter's pageBreak: 'after')
        if (!isFirstChapter) {
          node.pageBreak = "before";
        }
        content.push(node);
        needNoIndent = true;
      } else if (el.type === "subtitle") {
        content.push({
          text: typographicSubstitutions(el.text!),
          fontSize: 10,
          italics: true,
          alignment: "center",
          margin: [0, 0, 0, 24], // 2em bottom margin
        });
        needNoIndent = true;
      } else if (el.type === "scene_break") {
        content.push({
          text: SCENE_BREAK_TEXT,
          alignment: "center",
          fontSize: 12,
          margin: [0, 18, 0, 18], // 1.5em top/bottom
        });
        needNoIndent = true;
      } else if (el.type === "paragraph") {
        const processed = typographicSubstitutions(el.text!);
        const segments = parseInlineFormatting(processed);
        if (needNoIndent) {
          content.push({
            text: segments,
            alignment: "justify",
          });
          needNoIndent = false;
        } else {
          const indented = [
            { ...segments[0], text: INDENT_CHARS + segments[0].text },
            ...segments.slice(1),
          ];
          content.push({
            text: indented,
            alignment: "justify",
            preserveLeadingSpaces: true,
          } as any);
        }
      }
    }

    isFirstChapter = false;
  }

  // Footer: centered page numbers, suppressed on front matter pages
  const footer: DynamicContent = (currentPage, _pageCount) => {
    if (currentPage <= frontMatterPages) return { text: "" };
    return {
      text: String(currentPage),
      alignment: "center" as const,
      fontSize: 10,
      color: "#444",
      margin: [0, 0, 0, 0],
    };
  };

  return {
    pageSize: { width: PAGE_WIDTH, height: PAGE_HEIGHT },
    pageMargins: [MARGIN_SIDE, MARGIN_TB, MARGIN_SIDE, MARGIN_TB],
    footer,
    defaultStyle: {
      font: fontName,
      fontSize: 12,
      lineHeight: 1.5,
      color: "#111",
    },
    content,
  };
}

// ---- PDF generation ----

async function generatePdf(
  docDefinition: TDocumentDefinitions,
  outputPath: string,
  fontDescriptors: FontDescriptors,
): Promise<void> {
  const printer = new PdfPrinter(fontDescriptors);
  const doc = printer.createPdfKitDocument(docDefinition);

  return new Promise<void>((res, rej) => {
    const stream = createWriteStream(outputPath);
    doc.pipe(stream);
    doc.end();
    stream.on("finish", res);
    stream.on("error", rej);
  });
}

// ---- EPUB generation ----

const LANG_TO_BCP47: Record<string, string> = {
  EN: "en", PT: "pt", FR: "fr", ES: "es", DE: "de", IT: "it", NL: "nl",
  SV: "sv", DA: "da", NO: "no", FI: "fi", PL: "pl", RO: "ro", CS: "cs",
  SK: "sk", HU: "hu", HR: "hr", SL: "sl", BS: "bs", SR: "sr", BG: "bg",
  EL: "el", CA: "ca", GL: "gl", EU: "eu", GA: "ga", IS: "is", LT: "lt",
  LV: "lv", ET: "et", MT: "mt", SQ: "sq", MK: "mk", CY: "cy", UK: "uk",
  BE: "be",
};

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function segmentsToHtml(segments: TextSegment[]): string {
  return segments.map((seg) => {
    const escaped = escapeXml(seg.text);
    if (seg.bold && seg.italics) return `<strong><em>${escaped}</em></strong>`;
    if (seg.bold) return `<strong>${escaped}</strong>`;
    if (seg.italics) return `<em>${escaped}</em>`;
    return escaped;
  }).join("");
}

function chapterToXhtml(
  elements: ChapterElement[],
  cssPath: string,
  docTitle: string,
  lang: string,
): string {
  let body = "";
  let needNoIndent = true;

  for (const el of elements) {
    if (el.type === "heading") {
      const processed = typographicSubstitutions(el.text!);
      body += `    <h1>${escapeXml(processed)}</h1>\n`;
      needNoIndent = true;
    } else if (el.type === "subtitle") {
      const processed = typographicSubstitutions(el.text!);
      body += `    <h2>${escapeXml(processed)}</h2>\n`;
      needNoIndent = true;
    } else if (el.type === "scene_break") {
      body += `    <p class="scene-break">* * *</p>\n`;
      needNoIndent = true;
    } else if (el.type === "paragraph") {
      const processed = typographicSubstitutions(el.text!);
      const segments = parseInlineFormatting(processed);
      const html = segmentsToHtml(segments);
      const cls = needNoIndent ? ` class="no-indent"` : "";
      body += `    <p${cls}>${html}</p>\n`;
      needNoIndent = false;
    }
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${lang}" lang="${lang}">
<head>
  <meta charset="UTF-8" />
  <title>${escapeXml(docTitle)}</title>
  <link rel="stylesheet" type="text/css" href="${cssPath}" />
</head>
<body>
${body}</body>
</html>`;
}

async function generateEpub(
  chapters: ChapterElement[][],
  chapterFiles: string[],
  options: BuildOptions,
  outputPath: string,
  frontmatter?: ChapterElement[],
): Promise<void> {
  const zip = new JSZip();
  const lang = LANG_TO_BCP47[options.lang ?? "EN"] ?? "en";
  const uuid = randomUUID();
  const title = options.title ?? "Untitled";
  const author = options.author ?? "Unknown";
  const hasTitle = !!(options.title || options.author);
  const coverImage = options.epubCover ?? options.cover;
  const hasCover = !!coverImage;

  // mimetype must be first entry, stored uncompressed
  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });

  // META-INF/container.xml
  zip.file("META-INF/container.xml", `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml" />
  </rootfiles>
</container>`);

  // CSS
  const css = `body {
  font-family: Georgia, "Times New Roman", serif;
  margin: 1em;
  line-height: 1.5;
  color: #111;
}
h1 {
  font-size: 1.6em;
  font-weight: bold;
  text-align: center;
  letter-spacing: 0.1em;
  margin: 3em 0 0.3em 0;
  page-break-before: always;
}
h2 {
  font-size: 0.85em;
  font-style: italic;
  font-weight: normal;
  text-align: center;
  margin: 0 0 2em 0;
}
p {
  text-indent: 1.5em;
  text-align: justify;
  margin: 0;
}
p.no-indent {
  text-indent: 0;
}
p.scene-break {
  text-indent: 0;
  text-align: center;
  letter-spacing: 0.5em;
  margin: 1.5em 0;
}
.title-page {
  text-align: center;
  margin-top: 40%;
}
.title-page h1 {
  font-size: 2.5em;
  letter-spacing: 0;
  margin: 0 0 0.3em 0;
  page-break-before: auto;
}
.title-page p {
  font-size: 1.2em;
  font-style: italic;
  text-align: center;
  text-indent: 0;
}
.frontmatter p {
  text-indent: 0;
}`;
  zip.file("OEBPS/style.css", css);

  // Build manifest items and spine items
  const manifestItems: string[] = [];
  const spineItems: string[] = [];
  const tocEntries: { id: string; label: string; href: string }[] = [];

  // Cover image
  if (hasCover && coverImage) {
    const coverPath = resolve(coverImage);
    const coverData = readFileSync(coverPath);
    const ext = coverPath.toLowerCase().endsWith(".png") ? "png" : "jpeg";
    const mediaType = ext === "png" ? "image/png" : "image/jpeg";
    zip.file(`OEBPS/cover.${ext === "png" ? "png" : "jpg"}`, coverData);
    const coverFilename = ext === "png" ? "cover.png" : "cover.jpg";
    manifestItems.push(`    <item id="cover-image" href="${coverFilename}" media-type="${mediaType}" properties="cover-image" />`);

    // Cover XHTML page
    const coverXhtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${lang}" lang="${lang}">
<head>
  <meta charset="UTF-8" />
  <title>Cover</title>
  <link rel="stylesheet" type="text/css" href="style.css" />
</head>
<body>
  <div style="text-align: center;">
    <img src="${coverFilename}" alt="Cover" style="max-width: 100%; max-height: 100%;" />
  </div>
</body>
</html>`;
    zip.file("OEBPS/cover.xhtml", coverXhtml);
    manifestItems.push(`    <item id="cover" href="cover.xhtml" media-type="application/xhtml+xml" />`);
    spineItems.push(`    <itemref idref="cover" />`);
  }

  // Title page
  if (hasTitle) {
    const titleXhtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${lang}" lang="${lang}">
<head>
  <meta charset="UTF-8" />
  <title>${escapeXml(title)}</title>
  <link rel="stylesheet" type="text/css" href="style.css" />
</head>
<body>
  <div class="title-page">
    <h1>${escapeXml(typographicSubstitutions(title))}</h1>
${options.author ? `    <p>${escapeXml(options.author)}</p>\n` : ""
    }  </div>
</body>
</html>`;
    zip.file("OEBPS/title.xhtml", titleXhtml);
    manifestItems.push(`    <item id="title-page" href="title.xhtml" media-type="application/xhtml+xml" />`);
    spineItems.push(`    <itemref idref="title-page" />`);
  }

  // Frontmatter
  if (frontmatter && frontmatter.length > 0) {
    const fmXhtml = chapterToXhtml(frontmatter, "style.css", "Frontmatter", lang)
      .replace("<body>", `<body class="frontmatter">`);
    zip.file("OEBPS/frontmatter.xhtml", fmXhtml);
    manifestItems.push(`    <item id="frontmatter" href="frontmatter.xhtml" media-type="application/xhtml+xml" />`);
    spineItems.push(`    <itemref idref="frontmatter" />`);
  }

  // Chapter files
  for (let ci = 0; ci < chapters.length; ci++) {
    const chNum = String(ci + 1).padStart(2, "0");
    const chId = `chapter_${chNum}`;
    const chFile = `${chId}.xhtml`;

    // Extract chapter title from heading element
    const headingEl = chapters[ci].find((el) => el.type === "heading");
    const chLabel = headingEl ? typographicSubstitutions(headingEl.text!) : `Chapter ${ci + 1}`;

    // First chapter: don't force page-break-before on its h1 (it's already on a new page)
    let xhtml = chapterToXhtml(chapters[ci], "style.css", chLabel, lang);
    if (ci === 0) {
      xhtml = xhtml.replace(/<h1>/, `<h1 style="page-break-before: auto;">`);
    }

    zip.file(`OEBPS/${chFile}`, xhtml);
    manifestItems.push(`    <item id="${chId}" href="${chFile}" media-type="application/xhtml+xml" />`);
    spineItems.push(`    <itemref idref="${chId}" />`);
    tocEntries.push({ id: chId, label: chLabel, href: chFile });
  }

  // TOC nav document (EPUB 3)
  const tocLis = tocEntries.map((e) => `      <li><a href="${e.href}">${escapeXml(e.label)}</a></li>`).join("\n");
  const tocXhtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${lang}" lang="${lang}">
<head>
  <meta charset="UTF-8" />
  <title>Table of Contents</title>
</head>
<body>
  <nav epub:type="toc" id="toc">
    <h1>Table of Contents</h1>
    <ol>
${tocLis}
    </ol>
  </nav>
  <nav epub:type="landmarks" hidden="">
    <ol>
      <li><a epub:type="toc" href="toc.xhtml">Table of Contents</a></li>
${hasCover ? `      <li><a epub:type="cover" href="cover.xhtml">Cover</a></li>\n` : ""
    }${hasTitle ? `      <li><a epub:type="titlepage" href="title.xhtml">Title Page</a></li>\n` : ""
    }${tocEntries.length > 0 ? `      <li><a epub:type="bodymatter" href="${tocEntries[0].href}">Start of Content</a></li>\n` : ""
    }    </ol>
  </nav>
</body>
</html>`;
  zip.file("OEBPS/toc.xhtml", tocXhtml);
  manifestItems.push(`    <item id="toc" href="toc.xhtml" media-type="application/xhtml+xml" properties="nav" />`);

  // NCX fallback
  const ncxPoints = tocEntries.map((e, i) => `    <navPoint id="navpoint-${i + 1}" playOrder="${i + 1}">
      <navLabel><text>${escapeXml(e.label)}</text></navLabel>
      <content src="${e.href}" />
    </navPoint>`).join("\n");
  const ncx = `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="urn:uuid:${uuid}" />
    <meta name="dtb:depth" content="1" />
    <meta name="dtb:totalPageCount" content="0" />
    <meta name="dtb:maxPageNumber" content="0" />
  </head>
  <docTitle><text>${escapeXml(title)}</text></docTitle>
  <navMap>
${ncxPoints}
  </navMap>
</ncx>`;
  zip.file("OEBPS/toc.ncx", ncx);
  manifestItems.push(`    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml" />`);

  // Stylesheet manifest entry
  manifestItems.push(`    <item id="css" href="style.css" media-type="text/css" />`);

  // content.opf
  const opf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" xml:lang="${lang}">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">urn:uuid:${uuid}</dc:identifier>
    <dc:title>${escapeXml(title)}</dc:title>
    <dc:creator>${escapeXml(author)}</dc:creator>
    <dc:language>${lang}</dc:language>
    <meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d+Z$/, "Z")}</meta>
  </metadata>
  <manifest>
${manifestItems.join("\n")}
  </manifest>
  <spine toc="ncx">
${spineItems.join("\n")}
  </spine>
</package>`;
  zip.file("OEBPS/content.opf", opf);

  const buffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  writeFileSync(outputPath, buffer);
}

// ---- Main ----

async function main() {
  const { directory, options } = parseArgs();

  // Find chapter files
  const allFiles = await readdir(directory);
  const chapterFiles = allFiles
    .filter((f) => /^chapter_.*\.md$/.test(f))
    .sort()
    .map((f) => join(directory, f));

  if (chapterFiles.length === 0) {
    console.error(`No chapter_*.md files found in ${directory}`);
    process.exit(1);
  }

  console.log(`Found ${chapterFiles.length} chapters:`);
  for (const f of chapterFiles) {
    console.log(`  ${basename(f)}`);
  }

  // Validate cover images
  if (options.cover) {
    options.cover = resolve(options.cover);
    if (!existsSync(options.cover)) {
      console.error(`Cover image not found: ${options.cover}`);
      process.exit(1);
    }
    console.log(`Cover image: ${options.cover}`);
  }
  if (options.epubCover) {
    options.epubCover = resolve(options.epubCover);
    if (!existsSync(options.epubCover)) {
      console.error(`EPUB cover image not found: ${options.epubCover}`);
      process.exit(1);
    }
    console.log(`EPUB cover image: ${options.epubCover}`);
  }

  // Resolve font
  const font = resolveFont();
  console.log(`Using font: ${font.name}`);

  // Resolve chapter heading translation
  const langCode = options.lang ?? "EN";
  const chapterWord = CHAPTER_TRANSLATIONS[langCode];
  if (!chapterWord) {
    const supported = Object.keys(CHAPTER_TRANSLATIONS).join(", ");
    console.error(`Unsupported language code: ${options.lang}\nSupported: ${supported}`);
    process.exit(1);
  }
  if (langCode !== "EN") {
    console.log(`Language: ${langCode} ("${chapterWord}")`);
  }

  // Check for optional frontmatter
  const frontmatterPath = join(directory, "frontmatter.md");
  let frontmatter: ChapterElement[] | undefined;
  if (existsSync(frontmatterPath)) {
    frontmatter = parseChapter(frontmatterPath);
    console.log("Frontmatter: frontmatter.md");
  }

  // Parse chapters
  const chapters = chapterFiles.map((f) => parseChapter(f, chapterWord));

  // Build document definition
  const docDef = buildDocDefinition(chapters, options, font.name, frontmatter);

  // Generate PDF
  const baseName = options.output ?? "book_output";
  const outputPdf = join(directory, `${baseName}.pdf`);
  console.log("Generating PDF...");
  await generatePdf(docDef, outputPdf, font.descriptors);
  console.log(`PDF created: ${outputPdf}`);

  // Generate EPUB (if requested)
  if (options.epub) {
    const outputEpub = join(directory, `${baseName}.epub`);
    console.log("Generating EPUB...");
    await generateEpub(chapters, chapterFiles, options, outputEpub, frontmatter);
    console.log(`EPUB created: ${outputEpub}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
