---
name: create-book-pdf
description: Combine chapter_*.md files into a professionally formatted book PDF
user_invocable: true
arguments: "directory --title TITLE --author AUTHOR --cover COVER_IMAGE --lang CODE"
---

# Create Book PDF

Combine chapter files into a well-formatted 6"x9" book PDF.

## Arguments

- `directory` (optional): Path to the directory containing `chapter_*.md` files. Defaults to the current working directory.
- `--title "Title"` (optional): Book title for the title page.
- `--author "Name"` (optional): Author name for the title page.
- `--cover path/to/image` (optional): Path to a cover image (PNG, JPG) for a full-page cover.
- `--lang CODE` (optional): Language code for translating the "CHAPTER" heading. Default: `EN`. Supported: EN, PT, FR, ES, DE, IT, NL, SV, DA, NO, FI, PL, RO, CS, SK, HU, HR, SL, BS, SR, BG, EL, CA, GL, EU, GA, IS, LT, LV, ET, MT, SQ, MK, CY, UK, BE.

If neither `--title` nor `--author` is provided, the title page is skipped. If `--cover` is omitted, no cover page is generated. If `--lang` is omitted, English is used.

## Instructions

Follow these steps exactly:

### 1. Resolve the target directory

If the user provided a directory argument, resolve it to an absolute path. Otherwise, use the current working directory.

### 2. Run the build script

Run the TypeScript build script with Bun. Pass all arguments through:

```bash
bun run ~/.claude/skills/create-book-pdf/build_book.ts <target-directory> [--title "Title"] [--author "Author"] [--cover /path/to/cover.png] [--lang CODE]
```

The script handles everything: finding chapters, parsing content, formatting, and PDF generation. It produces `book_output.pdf` in the target directory.

### 3. Report

Tell the user the path to the generated PDF file.

## Chapter file format

Files must be named `chapter_01.md`, `chapter_02.md`, etc. (only `chapter_*` files are included — other files in the directory are ignored). They are sorted by filename.

YAML frontmatter (Obsidian-style `---` delimited blocks at the start of the file) is automatically stripped if present.

The files are plain text with Markdown headings:

```
# CHAPTER 1

## Location or Date Subtitle

First paragraph after the subtitle. Not indented.

Second paragraph gets automatic first-line indentation.

* * *

First paragraph after a scene break. Not indented.

More text here. Double hyphens -- become em dashes.

She *whispered* something **important** to him.
```

### Elements

- **`# Heading`**: Heading 1 — rendered as a centered chapter heading (e.g., `# CHAPTER 1`).
- **`## Heading`**: Heading 2 — rendered as a centered italic subtitle (e.g., `## London, 1923`).
- **`* * *`** on its own line: scene break (centered spaced asterisks).
- **Blank lines**: separate paragraphs.
- **`--`**: automatically converted to em dash (—).

### Inline formatting

Standard Markdown bold/italic markers are supported in paragraph text:

- `*text*` or `_text_` — italic
- `**text**` or `__text__` — bold
- `***text***` or `___text___` — bold italic

### Paragraph indentation

Paragraphs get automatic first-line indentation, except the first paragraph after a heading/subtitle or scene break.

## Output details

The PDF is 6"x9" with:

- Serif font (auto-detected: Georgia, Liberation Serif, or DejaVu Serif)
- Justified body text with 1.5x line height
- Centered page numbers in the footer (suppressed on cover and title pages)
- Each chapter starts on a new page
