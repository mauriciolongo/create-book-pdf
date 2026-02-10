# create-book-pdf

A Claude Code skill that converts a directory of `chapter_*.md` plain-text files into a professionally formatted book PDF.

## Location

The skill lives at `~/.claude/skills/create-book-pdf/` and is globally available.

## Usage

```
/create-book-pdf ./path/to/chapters --title "Book Title" --author "Author Name"
```

## How it works

1. Globs for `chapter_*.md` files, sorts by name
2. Parses plain-text content (chapter headings, subtitles, scene breaks, paragraphs)
3. Applies typographic substitutions (`--` → em dash)
4. Builds an HTML document using the template CSS from `book-template.html`
5. Converts to PDF via WeasyPrint (Python library with full CSS paged media support)

## Dependencies

- **WeasyPrint** — installed in `.venv/` in this project directory
- Run with: `.venv/bin/python3 build_book.py <directory> --title "Title" --author "Author"`

## Files

- `build_book.py` — standalone build script (parses chapters, builds HTML, generates PDF)
- `.venv/` — Python virtual environment with WeasyPrint installed
- `~/.claude/skills/create-book-pdf/SKILL.md` — skill definition and instructions
- `~/.claude/skills/create-book-pdf/book-template.html` — HTML/CSS reference template for book formatting
