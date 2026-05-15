"""
Server-side PDF renderer for the Menu Analyzer.

Receives the audit Markdown produced by /api/analyze + /api/review and renders
it as a styled PDF using ReportLab Platypus. Matches the navy / burgundy / gold
visual identity, with green-tinted 100%-coverage rows and red-tinted 0% rows
for at-a-glance scanning of the image-coverage table.

Endpoint: POST /api/render-pdf
Body: {
  audit:           string  (required, GitHub-flavoured Markdown)
  restaurantName:  string  (optional, defaults to "Menu")
  location:        string  (optional)
  dateStr:         string  (optional, defaults to today)
  reportsCount:    number  (optional, defaults to 0)
  style:           string  (optional, "standard" or "beautify"; default "standard")
}
Returns: application/pdf binary, with Content-Disposition: attachment

Style "beautify" turns Section 1 (Headline Counts) into a coloured tile
grid, adds a horizontal bar chart visualisation under Section 2 (Image
Coverage), and wraps bold standalone statements in callout boxes. The
underlying Markdown content is unchanged — same audit, richer layout.
"""

from http.server import BaseHTTPRequestHandler
from datetime import datetime
from io import BytesIO
import json
import re

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Flowable, KeepTogether
)


# ----- Brand palette -----------------------------------------------------------
NAVY       = colors.HexColor('#1d3557')
GOLD       = colors.HexColor('#d4af37')
RUBY       = colors.HexColor('#b03333')
TEXT       = colors.HexColor('#1a1a1a')
MUTED      = colors.HexColor('#646464')
ZEBRA      = colors.HexColor('#faf6ec')
BORDER     = colors.HexColor('#e0d8c5')
GREEN_BG   = colors.HexColor('#d9f0db')
GREEN_TEXT = colors.HexColor('#155724')
RED_BG     = colors.HexColor('#fde2e2')
RED_TEXT   = colors.HexColor('#721c24')

# ----- Beautify-mode palette ---------------------------------------------------
TILE_COLORS = [
    colors.HexColor('#5046e5'),  # indigo
    colors.HexColor('#7c3aed'),  # violet
    colors.HexColor('#0891b2'),  # cyan
    colors.HexColor('#059669'),  # emerald
    colors.HexColor('#d97706'),  # amber
    colors.HexColor('#e11d48'),  # rose
    colors.HexColor('#0284c7'),  # sky
]
BAR_GREEN  = colors.HexColor('#059669')
BAR_AMBER  = colors.HexColor('#d97706')
BAR_RED    = colors.HexColor('#e11d48')
BAR_TRACK  = colors.HexColor('#f3eee2')
CALLOUT_BG = colors.HexColor('#fef7f1')


# ----- Custom flowables --------------------------------------------------------
class GoldRule(Flowable):
    """Horizontal gold rule used under H2 section headings and the cover block."""

    def __init__(self, width, line_width=2.0, color=GOLD):
        Flowable.__init__(self)
        self.width = width
        self.line_width = line_width
        self.color = color
        self.height = max(line_width, 2)

    def draw(self):
        self.canv.setStrokeColor(self.color)
        self.canv.setLineWidth(self.line_width)
        self.canv.line(0, 0, self.width, 0)


class MetricTileGrid(Flowable):
    """A grid of coloured metric tiles. Used in beautify mode to replace or
    augment the Headline Counts table."""

    def __init__(self, metrics, width, n_cols=3):
        Flowable.__init__(self)
        self.metrics = metrics       # list of (label, value) tuples
        self.width = width
        self.n_cols = n_cols
        self.tile_w = (width - (n_cols - 1) * 8) / n_cols
        self.tile_h = 62
        n_rows = (len(metrics) + n_cols - 1) // n_cols
        self.height = n_rows * (self.tile_h + 8) - 8 if n_rows else 0

    def wrap(self, *_args):
        return (self.width, self.height)

    def draw(self):
        c = self.canv
        for idx, (label, value) in enumerate(self.metrics):
            row = idx // self.n_cols
            col = idx % self.n_cols
            x = col * (self.tile_w + 8)
            y = self.height - (row + 1) * self.tile_h - row * 8

            color = TILE_COLORS[idx % len(TILE_COLORS)]
            c.setFillColor(color)
            c.roundRect(x, y, self.tile_w, self.tile_h, 7, fill=1, stroke=0)

            # Label (small, uppercase, white-on-color)
            c.setFillColor(colors.white)
            c.setFont('Helvetica-Bold', 7.5)
            label_clean = label.upper()
            # truncate gracefully if too wide
            max_label_chars = max(8, int(self.tile_w / 4.2))
            if len(label_clean) > max_label_chars:
                label_clean = label_clean[:max_label_chars - 1] + '…'
            c.drawString(x + 11, y + self.tile_h - 17, label_clean)

            # Value (big bold)
            c.setFont('Helvetica-Bold', 18)
            value_str = str(value)
            if len(value_str) > 22:
                value_str = value_str[:21] + '…'
            c.drawString(x + 11, y + 14, value_str)


class SectionBanner(Flowable):
    """Full-width filled coloured banner used as a section heading in beautify
    mode. Replaces the standard navy-text + gold-rule treatment so the visual
    identity is obvious even when no other beautify enhancements trigger."""

    HEIGHT = 32
    PADDING_X = 14

    def __init__(self, text, width, color):
        Flowable.__init__(self)
        self.text = text
        self.width = width
        self.color = color
        self.height = self.HEIGHT

    def wrap(self, *_args):
        return (self.width, self.height)

    def draw(self):
        c = self.canv
        # Filled coloured rectangle
        c.setFillColor(self.color)
        c.roundRect(0, 0, self.width, self.height, 5, fill=1, stroke=0)
        # Heading text in white
        c.setFillColor(colors.white)
        c.setFont('Helvetica-Bold', 13)
        label = self.text
        # Defensive truncation if absurdly long
        if len(label) > 90:
            label = label[:88] + '…'
        c.drawString(self.PADDING_X, 10, label)


class CoverageBarChart(Flowable):
    """A horizontal bar chart for the Image Coverage by Category section.
    Bars are coloured green (≥75%), amber (25–74%), red (<25%)."""

    BAR_H = 13
    GAP   = 5
    LABEL_W = 150
    VALUE_W = 42

    def __init__(self, items, width):
        Flowable.__init__(self)
        self.items = items  # list of (category, coverage_pct_int)
        self.width = width
        self.height = (self.BAR_H + self.GAP) * len(items) + 16 if items else 0

    def wrap(self, *_args):
        return (self.width, self.height)

    def draw(self):
        if not self.items:
            return
        c = self.canv
        bar_max_w = self.width - self.LABEL_W - self.VALUE_W
        y = self.height - 12

        for cat, cov in self.items:
            cov_clamped = max(0, min(100, int(cov)))

            # Category label
            c.setFillColor(TEXT)
            c.setFont('Helvetica', 8.5)
            label = cat if len(cat) <= 24 else cat[:23] + '…'
            c.drawString(0, y - self.BAR_H + 3, label)

            # Track
            c.setFillColor(BAR_TRACK)
            c.roundRect(self.LABEL_W, y - self.BAR_H, bar_max_w, self.BAR_H, 2.5, fill=1, stroke=0)

            # Filled bar
            fill_w = max(2, cov_clamped / 100.0 * bar_max_w)
            if cov_clamped >= 75:
                bar_color = BAR_GREEN
            elif cov_clamped >= 25:
                bar_color = BAR_AMBER
            else:
                bar_color = BAR_RED
            c.setFillColor(bar_color)
            c.roundRect(self.LABEL_W, y - self.BAR_H, fill_w, self.BAR_H, 2.5, fill=1, stroke=0)

            # Coverage % label, bold, same colour as bar
            c.setFillColor(bar_color)
            c.setFont('Helvetica-Bold', 8.5)
            c.drawString(self.LABEL_W + bar_max_w + 6, y - self.BAR_H + 3, f'{cov_clamped}%')

            y -= self.BAR_H + self.GAP


class Callout(Flowable):
    """A coloured callout box used to highlight bold standalone statements
    (the §3 upsells conclusion, §9 net summary key line, etc.)."""

    PADDING = 12
    LEFT_BAR_W = 4
    INNER_GAP = 6

    def __init__(self, text, width, accent=RUBY, bg=CALLOUT_BG, font_size=11):
        Flowable.__init__(self)
        self.text = text
        self.width = width
        self.accent = accent
        self.bg = bg
        # Lay out paragraph once so we know our height
        style = ParagraphStyle(
            'callout',
            fontName='Helvetica-Bold',
            fontSize=font_size,
            leading=font_size + 4,
            textColor=TEXT,
        )
        self._para = Paragraph(text, style)
        inner_w = width - 2 * self.PADDING - self.LEFT_BAR_W - self.INNER_GAP
        _, ph = self._para.wrap(inner_w, 1000)
        self._para_h = ph
        self.height = ph + 2 * self.PADDING

    def wrap(self, *_args):
        return (self.width, self.height)

    def draw(self):
        c = self.canv
        # Background
        c.setFillColor(self.bg)
        c.roundRect(0, 0, self.width, self.height, 5, fill=1, stroke=0)
        # Left accent bar
        c.setFillColor(self.accent)
        c.rect(0, 0, self.LEFT_BAR_W, self.height, fill=1, stroke=0)
        # Paragraph
        self._para.drawOn(
            c,
            self.PADDING + self.LEFT_BAR_W + self.INNER_GAP,
            self.PADDING,
        )


# ----- Beautify helpers — extract structured data from Markdown tables --------
def _extract_metric_tiles(table_lines):
    """Parse a 'Metric | Count' table into (label, short_value) tuples for tiles."""
    pairs = []
    if len(table_lines) < 3:
        return pairs
    for line in table_lines[2:]:
        cells = _split_table_row(line)
        if len(cells) < 2:
            continue
        label = re.sub(r'\*\*([^*]+)\*\*', r'\1', cells[0]).strip()
        value_full = re.sub(r'\*\*([^*]+)\*\*', r'\1', cells[1]).strip()
        # Pull the leading short form: "147 (137 enabled, 10 disabled)" → "147"
        m = re.match(r'^\s*([0-9]+(?:[.,][0-9]+)?\s*(?:/\s*[0-9]+)?\s*%?)', value_full)
        short = m.group(1).strip() if m else value_full[:18]
        # Append coverage % parenthetical if present in the full text
        pct_m = re.search(r'\((\d+(?:\.\d+)?\s*%)\)', value_full)
        if pct_m and pct_m.group(1) not in short:
            short = short + ' (' + pct_m.group(1) + ')'
        pairs.append((label, short))
    return pairs


def _extract_coverage_pairs(table_lines):
    """Parse an 'Image Coverage by Category' table into (category, pct) tuples."""
    pairs = []
    if len(table_lines) < 3:
        return pairs
    for line in table_lines[2:]:
        cells = _split_table_row(line)
        if len(cells) < 4:
            continue
        category = re.sub(r'\*\*([^*]+)\*\*', r'\1', cells[0]).strip()
        cov_cell = cells[-1].strip()
        m = re.search(r'(\d+(?:\.\d+)?)\s*%', cov_cell)
        if not m:
            continue
        pct = int(round(float(m.group(1))))
        pairs.append((category, pct))
    return pairs


# ----- Inline Markdown -> ReportLab paragraph mini-HTML ------------------------
def _escape(s: str) -> str:
    return (s.replace('&', '&amp;')
             .replace('<', '&lt;')
             .replace('>', '&gt;'))


def inline_md(s: str) -> str:
    """Convert a single line / paragraph's inline Markdown to the small HTML
    subset ReportLab Paragraph understands (<b>, <i>, <font>)."""
    s = _escape(s)
    # Bold first so the * inside doesn't get misread by italic regex
    s = re.sub(r'\*\*(.+?)\*\*', r'<b>\1</b>', s)
    s = re.sub(r'__(.+?)__', r'<b>\1</b>', s)
    # Italic — match * not adjacent to another *
    s = re.sub(r'(?<![*\w])\*([^*\n]+?)\*(?![*\w])', r'<i>\1</i>', s)
    # Inline code
    s = re.sub(r'`([^`]+)`', r'<font face="Courier" size="9.5">\1</font>', s)
    # Links — keep label only
    s = re.sub(r'\[([^\]]+)\]\([^)]+\)', r'\1', s)
    return s


# ----- Block-level parsing -----------------------------------------------------
_RE_TABLE_SEP = re.compile(r'^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$')
_RE_BULLET    = re.compile(r'^\s*[-*]\s+(.*)$')
_RE_NUMBERED  = re.compile(r'^\s*(\d+)\.\s+(.*)$')
_RE_SEP_CELL  = re.compile(r'^:?-{2,}:?$')


def _is_corrupted_separator(line: str) -> bool:
    """A row whose leading cells are all `---` (3+) but trailing cells are
    not is a GFM separator with stray data appended on the same line. Drop
    it so it doesn't render as a row of dashes followed by misaligned data."""
    cells = _split_table_row(line)
    if len(cells) < 3:
        return False
    leading = 0
    for c in cells:
        if _RE_SEP_CELL.match(c.strip()):
            leading += 1
        else:
            break
    return leading >= 3 and leading < len(cells)


def _heading_text(s: str) -> str:
    """Strip pipes from heading text. The format pass occasionally emits
    `## Heading | Col1 | Col2 |` when a heading and a table header collapse
    onto one line — keep only the portion before the first pipe."""
    return s.split('|', 1)[0].strip()


def _is_block_start(line: str) -> bool:
    s = line.strip()
    if not s:
        return True
    if s.startswith('#'):
        return True
    if s.startswith('|'):
        return True
    if _RE_BULLET.match(s):
        return True
    if _RE_NUMBERED.match(s):
        return True
    return False


def _split_table_row(s: str):
    s = s.strip()
    if s.startswith('|'):
        s = s[1:]
    if s.endswith('|'):
        s = s[:-1]
    return [c.strip() for c in s.split('|')]


def _make_styles():
    base = ParagraphStyle('base', fontName='Helvetica', fontSize=10.5, leading=14, textColor=TEXT)
    return {
        'title':    ParagraphStyle('title',    parent=base, fontName='Times-Bold',   fontSize=24, alignment=TA_CENTER, textColor=NAVY,  leading=28),
        'subtitle': ParagraphStyle('subtitle', parent=base, fontName='Times-Italic', fontSize=13, alignment=TA_CENTER, textColor=RUBY,  leading=18),
        'meta':     ParagraphStyle('meta',     parent=base, fontSize=10,             alignment=TA_CENTER, textColor=MUTED, leading=14),
        'h2':       ParagraphStyle('h2',       parent=base, fontName='Helvetica-Bold', fontSize=15.5, textColor=NAVY, spaceBefore=12, spaceAfter=2,  leading=20),
        'h3':       ParagraphStyle('h3',       parent=base, fontName='Helvetica-Bold', fontSize=12,   textColor=RUBY, spaceBefore=10, spaceAfter=4,  leading=15),
        'body':     ParagraphStyle('body',     parent=base, leading=14, spaceAfter=4),
        'list':     ParagraphStyle('list',     parent=base, leftIndent=18, bulletIndent=4, spaceAfter=2, leading=14),
        'end':      ParagraphStyle('end',      parent=base, alignment=TA_CENTER, textColor=MUTED, fontName='Times-Italic', fontSize=10, spaceBefore=18),
    }


def _table_block(lines, start):
    """Collect a block of consecutive pipe-prefixed lines starting at `start`.
    Returns (block, next_index). A block is any run of 2+ lines whose stripped
    form starts with '|' AND contains at least 2 pipe characters (so stray
    single-pipe prose lines don't get misread as a one-cell table). The block
    may or may not include a GFM separator row; _build_table handles both."""
    block = []
    i = start
    while i < len(lines):
        s = lines[i].strip()
        if not s:
            break
        if not s.startswith('|'):
            break
        if s.count('|') < 2:
            break
        block.append(lines[i])
        i += 1
    if len(block) >= 2:
        return block, i
    return [], start


def _build_table(table_lines, content_w, styles):
    """Build a ReportLab Table from a block of pipe-delimited lines.
    Lenient: handles missing separator rows and inconsistent column counts
    by padding short rows and truncating long rows to the header width.
    Returns None only on truly empty input."""
    if len(table_lines) < 2:
        return None

    # Drop any GFM separator rows (|---|---|) — we'll synthesise our own
    # styling. Also drop "corrupted" separator rows where the leading cells
    # are `---` but trailing cells are stray data values.
    content_lines = [
        ln for ln in table_lines
        if not _RE_TABLE_SEP.match(ln) and not _is_corrupted_separator(ln)
    ]
    if len(content_lines) < 1:
        return None

    parsed = [_split_table_row(ln) for ln in content_lines]
    header = parsed[0]
    rows = parsed[1:]

    # Normalise column count to the header width. Rows wider than the header
    # are almost always two rows merged on one line, or a separator with
    # appended data — truncate excess cells so one bad row doesn't widen the
    # whole table and force per-letter column wrapping. Short rows are padded.
    n_cols = len(header) if header else max((len(r) for r in rows), default=0)
    if n_cols == 0:
        return None
    header = (header + [''] * n_cols)[:n_cols]
    rows = [(r + [''] * n_cols)[:n_cols] for r in rows]

    cell_style = ParagraphStyle('cell', fontName='Helvetica', fontSize=9.5, leading=12, textColor=TEXT)
    header_style = ParagraphStyle('hcell', fontName='Helvetica-Bold', fontSize=9.5, leading=12, textColor=colors.white)

    coverage_idx = next(
        (i for i, h in enumerate(header) if h.lower().strip() == 'coverage'),
        None
    )

    # Build data with Paragraphs so wrapping works
    data = [[Paragraph(inline_md(h), header_style) for h in header]]
    for row in rows:
        data.append([Paragraph(inline_md(c), cell_style) for c in row])

    # Per-column widths for known audit shapes
    fixed_widths = [None] * n_cols
    for i, h in enumerate(header):
        h_lower = h.lower().strip()
        if h_lower in ('items', 'images', 'count'):
            fixed_widths[i] = 56
        elif h_lower == 'coverage':
            fixed_widths[i] = 78
        elif h_lower == 'type':
            fixed_widths[i] = 95
    fixed_total = sum(w for w in fixed_widths if w is not None)
    auto_count = sum(1 for w in fixed_widths if w is None)
    if auto_count > 0:
        remaining = max(content_w - fixed_total, 0)
        auto_w = remaining / auto_count
        col_widths = [w if w is not None else auto_w for w in fixed_widths]
    else:
        col_widths = fixed_widths

    table = Table(data, colWidths=col_widths, repeatRows=1, hAlign='LEFT')

    style_cmds = [
        ('BACKGROUND',   (0, 0), (-1, 0), NAVY),
        ('TEXTCOLOR',    (0, 0), (-1, 0), colors.white),
        ('FONTNAME',     (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('VALIGN',       (0, 0), (-1, -1), 'TOP'),
        ('GRID',         (0, 0), (-1, -1), 0.4, BORDER),
        ('LEFTPADDING',  (0, 0), (-1, -1), 7),
        ('RIGHTPADDING', (0, 0), (-1, -1), 7),
        ('TOPPADDING',   (0, 0), (-1, 0), 8),
        ('BOTTOMPADDING',(0, 0), (-1, 0), 8),
        ('TOPPADDING',   (0, 1), (-1, -1), 6),
        ('BOTTOMPADDING',(0, 1), (-1, -1), 6),
    ]

    # Right-align numeric columns; centre + bold the Coverage column body
    for i, h in enumerate(header):
        h_lower = h.lower().strip()
        if h_lower in ('items', 'images', 'count'):
            style_cmds.append(('ALIGN', (i, 1), (i, -1), 'RIGHT'))
        elif h_lower == 'coverage':
            style_cmds.append(('ALIGN', (i, 1), (i, -1), 'CENTER'))
            style_cmds.append(('FONTNAME', (i, 1), (i, -1), 'Helvetica-Bold'))

    # Zebra striping for body rows (every other body row = zebra fill)
    for r in range(1, len(data)):
        if r % 2 == 0:
            style_cmds.append(('BACKGROUND', (0, r), (-1, r), ZEBRA))

    # 100% / ✓ → green, 0% / ✗ → red, but only on the Coverage table.
    if coverage_idx is not None:
        for r in range(1, len(data)):
            cov_text = rows[r - 1][coverage_idx]
            if re.search(r'(?:^|[^\d])100\s*%', cov_text) or '✓' in cov_text:
                style_cmds.append(('BACKGROUND', (0, r), (-1, r), GREEN_BG))
                style_cmds.append(('TEXTCOLOR', (coverage_idx, r), (coverage_idx, r), GREEN_TEXT))
            elif re.search(r'(?:^|[^\d])0\s*%(?:$|[^\d.])', cov_text) or '✗' in cov_text:
                style_cmds.append(('BACKGROUND', (0, r), (-1, r), RED_BG))
                style_cmds.append(('TEXTCOLOR', (coverage_idx, r), (coverage_idx, r), RED_TEXT))

    table.setStyle(TableStyle(style_cmds))
    return table


def _parse_to_flowables(md, styles, content_w):
    lines = md.splitlines()
    flowables = []
    i = 0
    while i < len(lines):
        raw = lines[i]
        s = raw.strip()

        if not s:
            i += 1
            continue

        # Headings
        if s.startswith('### '):
            flowables.append(Paragraph(inline_md(_heading_text(s[4:])), styles['h3']))
            i += 1
            continue
        if s.startswith('## '):
            heading_block = [
                Paragraph(inline_md(_heading_text(s[3:])), styles['h2']),
                Spacer(1, 1),
                GoldRule(content_w, 1.8, GOLD),
                Spacer(1, 8),
            ]
            flowables.append(KeepTogether(heading_block))
            i += 1
            continue
        if s.startswith('# '):
            heading_block = [
                Paragraph(inline_md(_heading_text(s[2:])), styles['h2']),
                Spacer(1, 1),
                GoldRule(content_w, 1.8, GOLD),
                Spacer(1, 8),
            ]
            flowables.append(KeepTogether(heading_block))
            i += 1
            continue

        # Tables — any block of 2+ pipe-prefixed lines, separator optional
        table_lines, next_i = _table_block(lines, i)
        if table_lines:
            i = next_i
            t = _build_table(table_lines, content_w, styles)
            if t is not None:
                flowables.append(t)
                flowables.append(Spacer(1, 8))
            continue

        # Bullet list
        m = _RE_BULLET.match(s)
        if m:
            while i < len(lines) and _RE_BULLET.match(lines[i].strip()):
                item = _RE_BULLET.match(lines[i].strip()).group(1)
                # Continuation lines (indented under the bullet)
                cont = []
                j = i + 1
                while j < len(lines):
                    nxt = lines[j]
                    if not nxt.strip():
                        break
                    if _is_block_start(nxt):
                        break
                    cont.append(nxt.strip())
                    j += 1
                if cont:
                    item = item + ' ' + ' '.join(cont)
                flowables.append(Paragraph('• ' + inline_md(item), styles['list']))
                i = j
            flowables.append(Spacer(1, 4))
            continue

        # Numbered list
        m = _RE_NUMBERED.match(s)
        if m:
            n = 0
            while i < len(lines) and _RE_NUMBERED.match(lines[i].strip()):
                mm = _RE_NUMBERED.match(lines[i].strip())
                n += 1
                item = mm.group(2)
                cont = []
                j = i + 1
                while j < len(lines):
                    nxt = lines[j]
                    if not nxt.strip():
                        break
                    if _is_block_start(nxt):
                        break
                    cont.append(nxt.strip())
                    j += 1
                if cont:
                    item = item + ' ' + ' '.join(cont)
                flowables.append(Paragraph(f'{n}. ' + inline_md(item), styles['list']))
                i = j
            flowables.append(Spacer(1, 4))
            continue

        # End-of-audit marker
        if s.strip().strip('*').strip('—').strip().lower() == 'end of audit':
            flowables.append(Paragraph('— End of audit —', styles['end']))
            i += 1
            continue

        # Regular paragraph — accumulate consecutive non-blank, non-block lines
        para = [s]
        i += 1
        while i < len(lines) and lines[i].strip() and not _is_block_start(lines[i]):
            para.append(lines[i].strip())
            i += 1
        flowables.append(Paragraph(inline_md(' '.join(para)), styles['body']))

    return flowables


def _parse_to_flowables_beautify(md, styles, content_w):
    """Beautify variant of the parser. Same Markdown grammar, but:
      - Section 1 (Headline Counts): renders a coloured MetricTileGrid above
        the standard table.
      - Section 2 (Image Coverage by Category): renders the standard table
        followed by a CoverageBarChart visualisation.
      - Any standalone **bold sentence** on its own line becomes a Callout box.
    """
    lines = md.splitlines()
    flowables = []
    current_section = None
    i = 0

    while i < len(lines):
        raw = lines[i]
        s = raw.strip()

        if not s:
            i += 1
            continue

        # Headings — track which section we're in for table-aware enhancements
        if s.startswith('### '):
            flowables.append(Paragraph(inline_md(_heading_text(s[4:])), styles['h3']))
            i += 1
            continue
        if s.startswith('## ') or s.startswith('# '):
            heading_text = _heading_text(s[3:] if s.startswith('## ') else s[2:])
            # Looser section detection — accept "1.", "1)", "1:", or just "1 " before the name
            sec_m = re.match(r'^(\d+)\s*[.):\s]\s*(.+)$', heading_text)
            if sec_m:
                current_section = int(sec_m.group(1))
                banner_color = TILE_COLORS[(current_section - 1) % len(TILE_COLORS)]
            else:
                current_section = None
                # Use a stable colour for unnumbered headings (e.g. "## Net Summary")
                banner_color = NAVY
            heading_block = [
                Spacer(1, 8),
                SectionBanner(heading_text, content_w, banner_color),
                Spacer(1, 10),
            ]
            flowables.append(KeepTogether(heading_block))
            i += 1
            continue

        # Tables — any block of 2+ pipe-prefixed lines, separator optional
        table_lines, next_i = _table_block(lines, i)
        if table_lines:
            i = next_i

            # Section 1: prepend a metric-tile grid built from the table
            if current_section == 1:
                tiles = _extract_metric_tiles(table_lines)
                if tiles:
                    flowables.append(MetricTileGrid(tiles, content_w))
                    flowables.append(Spacer(1, 12))

            t = _build_table(table_lines, content_w, styles)
            if t is not None:
                flowables.append(t)
                flowables.append(Spacer(1, 8))

            # Append a horizontal bar chart whenever the table looks like a
            # coverage table — header has a "Coverage" column AND at least one
            # of "Category/Categories/Section". Triggers in BOTH the full
            # audit (§2 Image Coverage by Category) and the basic analysis
            # (Item Images section), regardless of section number.
            header_cells_raw = _split_table_row(table_lines[0]) if table_lines else []
            header_lc = [c.lower().strip() for c in header_cells_raw]
            looks_like_coverage = (
                any('coverage' in h for h in header_lc)
                and any(h in ('category', 'categories', 'section') for h in header_lc)
            )
            if looks_like_coverage:
                pairs = _extract_coverage_pairs(table_lines)
                if pairs:
                    flowables.append(Spacer(1, 4))
                    flowables.append(CoverageBarChart(pairs, content_w))
                    flowables.append(Spacer(1, 10))

            continue

        # Bullet list
        m = _RE_BULLET.match(s)
        if m:
            while i < len(lines) and _RE_BULLET.match(lines[i].strip()):
                item = _RE_BULLET.match(lines[i].strip()).group(1)
                cont = []
                j = i + 1
                while j < len(lines):
                    nxt = lines[j]
                    if not nxt.strip():
                        break
                    if _is_block_start(nxt):
                        break
                    cont.append(nxt.strip())
                    j += 1
                if cont:
                    item = item + ' ' + ' '.join(cont)
                flowables.append(Paragraph('• ' + inline_md(item), styles['list']))
                i = j
            flowables.append(Spacer(1, 4))
            continue

        # Numbered list
        m = _RE_NUMBERED.match(s)
        if m:
            n = 0
            while i < len(lines) and _RE_NUMBERED.match(lines[i].strip()):
                mm = _RE_NUMBERED.match(lines[i].strip())
                n += 1
                item = mm.group(2)
                cont = []
                j = i + 1
                while j < len(lines):
                    nxt = lines[j]
                    if not nxt.strip():
                        break
                    if _is_block_start(nxt):
                        break
                    cont.append(nxt.strip())
                    j += 1
                if cont:
                    item = item + ' ' + ' '.join(cont)
                flowables.append(Paragraph(f'{n}. ' + inline_md(item), styles['list']))
                i = j
            flowables.append(Spacer(1, 4))
            continue

        # End-of-audit marker
        if s.strip().strip('*').strip('—').strip().lower() == 'end of audit':
            flowables.append(Paragraph('— End of audit —', styles['end']))
            i += 1
            continue

        # Standalone bold statement → Callout box.
        # Must be the whole line: **…** with optional trailing punctuation.
        callout_m = re.match(r'^\*\*([^*]{6,200})\*\*[\.!?]?$', s)
        if callout_m and len(s) > 12:
            flowables.append(Spacer(1, 4))
            flowables.append(Callout(inline_md(callout_m.group(1)), content_w))
            flowables.append(Spacer(1, 8))
            i += 1
            continue

        # Regular paragraph — accumulate consecutive non-blank, non-block lines
        para = [s]
        i += 1
        while i < len(lines) and lines[i].strip() and not _is_block_start(lines[i]):
            para.append(lines[i].strip())
            i += 1
        flowables.append(Paragraph(inline_md(' '.join(para)), styles['body']))

    return flowables


def render_pdf(audit_md, restaurant_name='Menu', location='', date_str='', reports_count=0, style='standard'):
    buf = BytesIO()
    page_w = A4[0]
    margin = 56
    content_w = page_w - margin * 2

    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=margin, rightMargin=margin,
        topMargin=margin,  bottomMargin=48,
        title=f'{restaurant_name} · Menu JSON Audit',
    )

    styles = _make_styles()
    story = []

    # Cover header — thin gold rule, title, subtitle, meta block, bold gold rule
    story.append(Spacer(1, 6))
    story.append(GoldRule(content_w * 0.6, 0.8, GOLD))
    story.append(Spacer(1, 14))
    story.append(Paragraph(restaurant_name.upper(), styles['title']))
    story.append(Spacer(1, 10))
    story.append(Paragraph('Menu JSON Audit &amp; Recommendations', styles['subtitle']))
    story.append(Spacer(1, 14))

    if location:
        story.append(Paragraph(_escape(location), styles['meta']))
    story.append(Paragraph(f'Prepared by the Flipdish Menu Team · {_escape(date_str)}', styles['meta']))
    if reports_count:
        story.append(Paragraph(f'Includes {reports_count} supporting business report(s)', styles['meta']))
    story.append(Paragraph('Reviewed against gold-standard audit template', styles['meta']))
    story.append(Spacer(1, 10))
    story.append(GoldRule(content_w, 2.0, GOLD))
    story.append(Spacer(1, 14))

    if style == 'beautify':
        story.append(Paragraph('Visual edition', styles['meta']))
        story.append(Spacer(1, 6))
        story.extend(_parse_to_flowables_beautify(audit_md, styles, content_w))
    else:
        story.extend(_parse_to_flowables(audit_md, styles, content_w))

    def _draw_footer(canv, _doc):
        canv.saveState()
        canv.setFont('Helvetica-Oblique', 8.5)
        canv.setFillColor(MUTED)
        canv.drawString(margin, 26, f'{restaurant_name} · Menu JSON Audit')
        canv.drawRightString(page_w - margin, 26, f'Page {canv.getPageNumber()}')
        canv.restoreState()

    def _draw_beautify_chrome(canv, _doc):
        canv.saveState()
        # Violet accent band across the top — visible page chrome that signals
        # beautify mode regardless of section-detection results.
        canv.setFillColor(colors.HexColor('#7c3aed'))
        canv.rect(0, A4[1] - 6, page_w, 6, fill=1, stroke=0)
        # Footer
        canv.setFont('Helvetica-Oblique', 8.5)
        canv.setFillColor(MUTED)
        canv.drawString(margin, 26, f'{restaurant_name} · Menu JSON Audit · Visual Edition')
        canv.drawRightString(page_w - margin, 26, f'Page {canv.getPageNumber()}')
        canv.restoreState()

    chrome = _draw_beautify_chrome if style == 'beautify' else _draw_footer
    doc.build(story, onFirstPage=chrome, onLaterPages=chrome)
    buf.seek(0)
    return buf.read()


# ----- Vercel Python serverless handler ----------------------------------------
class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            length = int(self.headers.get('content-length') or 0)
            raw = self.rfile.read(length) if length else b''
            data = json.loads(raw or b'{}')
        except Exception as e:
            return self._json_error(400, f'Invalid JSON body: {e}')

        audit = (data.get('audit') or '').strip()
        if not audit:
            return self._json_error(400, 'Missing "audit" markdown text')

        restaurant_name = (data.get('restaurantName') or 'Menu').strip() or 'Menu'
        location        = (data.get('location') or '').strip()
        date_str        = (data.get('dateStr') or '').strip() or datetime.now().strftime('%B %d, %Y')
        style           = (data.get('style') or 'standard').strip().lower()
        if style not in ('standard', 'beautify'):
            style = 'standard'
        try:
            reports_count = int(data.get('reportsCount') or 0)
        except (TypeError, ValueError):
            reports_count = 0

        try:
            pdf_bytes = render_pdf(
                audit_md=audit,
                restaurant_name=restaurant_name,
                location=location,
                date_str=date_str,
                reports_count=reports_count,
                style=style,
            )
        except Exception as e:
            return self._json_error(500, f'PDF generation failed: {e}')

        safe_name = re.sub(r'[^A-Za-z0-9_-]+', '_', restaurant_name).strip('_') or 'Menu'
        stamp = datetime.now().strftime('%Y-%m-%d')
        suffix = '_Visual' if style == 'beautify' else ''
        filename = f'{safe_name}_Menu_Audit{suffix}_{stamp}.pdf'

        self.send_response(200)
        self.send_header('Content-Type', 'application/pdf')
        self.send_header('Content-Disposition', f'attachment; filename="{filename}"')
        self.send_header('Content-Length', str(len(pdf_bytes)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(pdf_bytes)

    def do_GET(self):
        self._json_error(
            405,
            'Method not allowed. POST { audit, restaurantName?, location?, dateStr?, reportsCount? }'
        )

    def _json_error(self, status, msg):
        body = json.dumps({'error': msg}).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)
