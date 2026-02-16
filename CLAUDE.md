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

## Implementations

There are two parallel implementations that produce equivalent output:

### TypeScript/Bun (pdfmake) — preferred

No native dependencies — only needs `bun install`.

```bash
bun run build_book.ts <directory> [--title "Title"] [--author "Author"] [--cover path/to/image]
```

- Uses **pdfmake** for pure-JS PDF generation
- Auto-detects serif fonts: Georgia → Liberation Serif → DejaVu Serif
- First-line paragraph indent via Unicode em/en-spaces
- Cover images are centered on the page (reads PNG/JPEG dimensions for proper positioning)

### Python (WeasyPrint)

Requires a Python venv with WeasyPrint installed.

```bash
.venv/bin/python3 build_book.py <directory> [--title "Title"] [--author "Author"] [--cover path/to/image]
```

- Uses **WeasyPrint** with full CSS paged media support
- Reads CSS from `book-template.html`

## How it works

1. Globs for `chapter_*.md` files, sorts by name
2. Parses plain-text content (chapter headings, subtitles, scene breaks, paragraphs)
3. Applies typographic substitutions (`--` → em dash)
4. Generates a 6"×9" PDF with page numbers, chapter breaks, and first-line indentation
5. Page numbers suppressed on cover and title pages

## Files

- `build_book.ts` — TypeScript build script (Bun + pdfmake)
- `build_book.py` — Python build script (WeasyPrint)
- `package.json` / `tsconfig.json` / `bun.lockb` — TypeScript project config and lockfile
- `.venv/` — Python virtual environment with WeasyPrint installed
- `~/.claude/skills/create-book-pdf/SKILL.md` — skill definition and instructions
- `~/.claude/skills/create-book-pdf/book-template.html` — HTML/CSS reference template for book formatting
