#!/usr/bin/env python3
"""Build book PDF from chapter_*.md files using WeasyPrint."""
import argparse
import glob
import html
import os
import re
import sys

TEMPLATE_CSS_PATH = os.path.expanduser("~/.claude/skills/create-book-pdf/book-template.html")

def read_css_from_template(path):
    with open(path) as f:
        content = f.read()
    m = re.search(r'<style>(.*?)</style>', content, re.DOTALL)
    return m.group(1) if m else ""

def parse_chapter(filepath):
    with open(filepath) as f:
        lines = f.read().split('\n')

    elements = []
    i = 0

    if i < len(lines) and re.match(r'^CHAPTER\s+\d+', lines[i]):
        elements.append(('heading', lines[i]))
        i += 1
        while i < len(lines) and lines[i].strip() == '':
            i += 1
        if i < len(lines):
            elements.append(('subtitle', lines[i]))
            i += 1

    para_lines = []

    def flush_para():
        if para_lines:
            text = ' '.join(para_lines)
            elements.append(('paragraph', text))
            para_lines.clear()

    while i < len(lines):
        stripped = lines[i].strip()
        if stripped == '* * *':
            flush_para()
            elements.append(('scene_break', None))
        elif stripped == '':
            flush_para()
        else:
            para_lines.append(stripped)
        i += 1

    flush_para()
    return elements

def typographic_substitutions(text):
    text = text.replace('--', '\u2014')
    return text

def build_html(chapters, title=None, author=None):
    css = read_css_from_template(TEMPLATE_CSS_PATH)

    parts = []
    parts.append('<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="UTF-8">\n<style>')
    parts.append(css)
    parts.append('</style>\n</head>\n<body>\n')

    if title or author:
        parts.append('<div class="title-page">\n')
        if title:
            parts.append(f'  <div class="book-title">{html.escape(title)}</div>\n')
        if author:
            parts.append(f'  <div class="book-author">{html.escape(author)}</div>\n')
        parts.append('</div>\n')

    for elements in chapters:
        parts.append('<div class="chapter">\n')
        need_no_indent = False
        for kind, text in elements:
            if kind == 'heading':
                parts.append(f'  <div class="chapter-heading">{typographic_substitutions(html.escape(text))}</div>\n')
                need_no_indent = True
            elif kind == 'subtitle':
                parts.append(f'  <div class="chapter-subtitle">{typographic_substitutions(html.escape(text))}</div>\n')
                need_no_indent = True
            elif kind == 'scene_break':
                parts.append('  <div class="scene-break">* &ensp; * &ensp; *</div>\n')
                need_no_indent = True
            elif kind == 'paragraph':
                escaped = typographic_substitutions(html.escape(text))
                if need_no_indent:
                    parts.append(f'  <p class="no-indent">{escaped}</p>\n')
                    need_no_indent = False
                else:
                    parts.append(f'  <p>{escaped}</p>\n')
        parts.append('</div>\n')

    parts.append('</body>\n</html>\n')
    return ''.join(parts)

def main():
    parser = argparse.ArgumentParser(description='Build a book PDF from chapter files.')
    parser.add_argument('directory', help='Directory containing chapter_*.md files')
    parser.add_argument('--title', default=None, help='Book title for the title page')
    parser.add_argument('--author', default=None, help='Author name for the title page')
    args = parser.parse_args()

    chapter_dir = os.path.abspath(args.directory)
    chapter_files = sorted(glob.glob(os.path.join(chapter_dir, 'chapter_*.md')))
    if not chapter_files:
        print(f"No chapter_*.md files found in {chapter_dir}")
        sys.exit(1)

    print(f"Found {len(chapter_files)} chapters:")
    for f in chapter_files:
        print(f"  {os.path.basename(f)}")

    chapters = [parse_chapter(f) for f in chapter_files]
    html_content = build_html(chapters, title=args.title, author=args.author)

    # Convert directly to PDF with WeasyPrint
    from weasyprint import HTML
    output_pdf = os.path.join(chapter_dir, 'book_output.pdf')
    print("Generating PDF...")
    HTML(string=html_content).write_pdf(output_pdf)
    print(f"\nPDF created: {output_pdf}")

if __name__ == '__main__':
    main()
