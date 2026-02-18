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
```

If neither `--title` nor `--author` is provided, the title page is skipped. If `--cover` is omitted, no cover page is generated.

## Running

No native dependencies — only needs `bun install`.

```bash
bun run build_book.ts <directory> [--title "Title"] [--author "Author"] [--cover path/to/image]
```

- Uses **pdfmake** for pure-JS PDF generation
- Auto-detects serif fonts: Georgia → Liberation Serif → DejaVu Serif
- First-line paragraph indent via Unicode em/en-spaces
- Cover images are centered on the page (reads PNG/JPEG dimensions for proper positioning)
- Inline formatting: `*italic*` / `_italic_`, `**bold**` / `__bold__`, `***bold italic***` / `___bold italic___`

## How it works

1. Globs for `chapter_*.md` files, sorts by name
2. Parses plain-text content (chapter headings, subtitles, scene breaks, paragraphs)
3. Applies typographic substitutions (`--` → em dash)
4. Parses inline Markdown formatting (bold, italic)
5. Generates a 6"×9" PDF with page numbers, chapter breaks, and first-line indentation
6. Page numbers suppressed on cover and title pages

## Files

- `build_book.ts` — Build script (Bun + pdfmake)
- `package.json` / `tsconfig.json` / `bun.lock` — Project config and lockfile
- `SKILL.md` — Skill definition and instructions for Claude Code
