---
name: create-book-pdf
description: Combine chapter_*.md files into a professionally formatted book PDF
user_invocable: true
arguments: "[directory] [--title \"Book Title\"] [--author \"Author Name\"] [--cover path/to/image]"
---

# Create Book PDF

Combine chapter files into a well-formatted 6"x9" book PDF.

## Arguments

- `directory` (optional): Path to the directory containing `chapter_*.md` files. Defaults to the current working directory.
- `--title "Title"` (optional): Book title for the title page.
- `--author "Name"` (optional): Author name for the title page.
- `--cover path/to/image` (optional): Path to a cover image (PNG, JPG) for a full-page cover.

If neither `--title` nor `--author` is provided, the title page is skipped. If `--cover` is omitted, no cover page is generated.

## Instructions

Follow these steps exactly:

### 1. Resolve the target directory

If the user provided a directory argument, resolve it to an absolute path. Otherwise, use the current working directory.

### 2. Run the build script

Run the TypeScript build script with Bun. Pass all arguments through:

```bash
bun run ~/Dropbox/work/code/create-book-pdf/build_book.ts <target-directory> [--title "Title"] [--author "Author"] [--cover /path/to/cover.png]
```

The script handles everything: finding chapters, parsing content, formatting, and PDF generation. It produces `book_output.pdf` in the target directory.

### 3. Report

Tell the user the path to the generated PDF file.

## Chapter file format

Files must be named `chapter_01.md`, `chapter_02.md`, etc. (only `chapter_*` files are included — other files in the directory are ignored). They are sorted by filename.

The files are plain text with this structure:

```
CHAPTER 1

Location or Date Subtitle

First paragraph after the subtitle. Not indented.

Second paragraph gets automatic first-line indentation.

* * *

First paragraph after a scene break. Not indented.

More text here. Double hyphens -- become em dashes.

She *whispered* something **important** to him.
```

### Elements

- **Line 1**: `CHAPTER N` — rendered as a centered chapter heading.
- **First non-blank line after heading**: subtitle (location, date, etc.), centered and italic.
- **`* * *`** on its own line: scene break (centered spaced asterisks).
- **Blank lines**: separate paragraphs.
- **`--`**: automatically converted to em dash (—).

### Inline formatting

Standard Markdown bold/italic markers are supported in paragraph text:

- `*text*` — italic
- `**text**` — bold
- `***text***` — bold italic

### Paragraph indentation

Paragraphs get automatic first-line indentation, except the first paragraph after a heading/subtitle or scene break.

## Output details

The PDF is 6"x9" with:

- Serif font (auto-detected: Georgia, Liberation Serif, or DejaVu Serif)
- Justified body text with 1.5x line height
- Centered page numbers in the footer (suppressed on cover and title pages)
- Each chapter starts on a new page
