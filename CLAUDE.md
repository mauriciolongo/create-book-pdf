# create-book-pdf

A tool for Claude Code that converts a directory of `chapter_*.md` plain-text files into a professionally formatted book PDF.

## Usage

```
/create-book-pdf ./path/to/chapters --title "Book Title" --author "Author Name"
```

## CLI options

```
--title "Title"       Book title for the title page
--author "Author"     Author name for the title page
--cover path/to/image Cover image (PNG/JPG) — centered with aspect ratio preserved
--lang CODE           Translate "CHAPTER" heading (default: EN). Codes: EN, PT, FR, ES, DE, IT, NL, SV, DA, NO, FI, PL, RO, CS, SK, HU, HR, SL, BS, SR, BG, EL, CA, GL, EU, GA, IS, LT, LV, ET, MT, SQ, MK, CY, UK, BE
--epub                Also generate a KDP-compatible EPUB 3 file (book_output.epub)
```

If neither `--title` nor `--author` is provided, the title page is skipped. If `--cover` is omitted, no cover page is generated. If `--lang` is omitted, English is used.

## Running

No native dependencies — only needs `bun install`.

```bash
bun run build_book.ts <directory> [--title "Title"] [--author "Author"] [--cover path/to/image] [--lang CODE] [--epub]
```

- Uses **pdfmake** for pure-JS PDF generation
- Auto-detects serif fonts: Georgia → Liberation Serif → DejaVu Serif
- Markdown headings: `# H1` for chapter title, `## H2` for subtitle
- Optional `frontmatter.md` for dedications, copyright, epigraphs (inserted between title page and chapter 1)
- First-line paragraph indent via Unicode em/en-spaces
- Cover images are centered on the page (reads PNG/JPEG dimensions for proper positioning)
- Inline formatting: `*italic*` / `_italic_`, `**bold**` / `__bold__`, `***bold italic***` / `___bold italic___`

## How it works

1. Globs for `chapter_*.md` files, sorts by name; detects optional `frontmatter.md`
2. Strips YAML frontmatter (Obsidian-style `---` blocks) if present
3. Parses Markdown headings (`#` for title, `##` for subtitle), scene breaks, and paragraphs
4. Translates "CHAPTER" headings to the target language if `--lang` is set
5. Applies typographic substitutions (`--` → em dash)
6. Parses inline Markdown formatting (bold, italic)
7. Generates a 6"×9" PDF with page numbers, chapter breaks, and first-line indentation
8. Page numbers suppressed on cover and title pages
9. Optionally generates a KDP-compatible EPUB 3 alongside the PDF (`--epub`)

## Installation

Clone this repo into your Claude Code skills directory:

```bash
git clone <repo-url> ~/.claude/skills/create-book-pdf
cd ~/.claude/skills/create-book-pdf && bun install
```

## Files

- `build_book.ts` — Build script (Bun + pdfmake)
- `package.json` / `tsconfig.json` / `bun.lock` — Project config and lockfile
- `SKILL.md` — Skill definition and instructions for Claude Code
