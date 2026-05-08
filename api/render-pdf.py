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
}
Returns: application/pdf binary, with Content-Disposition: attachment
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


def _build_table(table_lines, content_w, styles):
    """Build a ReportLab Table from raw markdown lines. Returns None on malformed."""
    if len(table_lines) < 2:
        return None

    header = _split_table_row(table_lines[0])
    if not _RE_TABLE_SEP.match(table_lines[1]):
        return None
    rows = [_split_table_row(line) for line in table_lines[2:] if line.strip()]
    n_cols = len(header)
    if n_cols == 0:
        return None

    # Pad/truncate rows to header width
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
            flowables.append(Paragraph(inline_md(s[4:].strip()), styles['h3']))
            i += 1
            continue
        if s.startswith('## '):
            heading_block = [
                Paragraph(inline_md(s[3:].strip()), styles['h2']),
                Spacer(1, 1),
                GoldRule(content_w, 1.8, GOLD),
                Spacer(1, 8),
            ]
            flowables.append(KeepTogether(heading_block))
            i += 1
            continue
        if s.startswith('# '):
            heading_block = [
                Paragraph(inline_md(s[2:].strip()), styles['h2']),
                Spacer(1, 1),
                GoldRule(content_w, 1.8, GOLD),
                Spacer(1, 8),
            ]
            flowables.append(KeepTogether(heading_block))
            i += 1
            continue

        # Tables — pipe-prefixed line followed by separator line
        if s.startswith('|') and i + 1 < len(lines) and _RE_TABLE_SEP.match(lines[i + 1]):
            table_lines = []
            while i < len(lines) and lines[i].strip().startswith('|'):
                table_lines.append(lines[i])
                i += 1
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


def render_pdf(audit_md, restaurant_name='Menu', location='', date_str='', reports_count=0):
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

    story.extend(_parse_to_flowables(audit_md, styles, content_w))

    def _draw_footer(canv, _doc):
        canv.saveState()
        canv.setFont('Helvetica-Oblique', 8.5)
        canv.setFillColor(MUTED)
        canv.drawString(margin, 26, f'{restaurant_name} · Menu JSON Audit')
        canv.drawRightString(page_w - margin, 26, f'Page {canv.getPageNumber()}')
        canv.restoreState()

    doc.build(story, onFirstPage=_draw_footer, onLaterPages=_draw_footer)
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
            )
        except Exception as e:
            return self._json_error(500, f'PDF generation failed: {e}')

        safe_name = re.sub(r'[^A-Za-z0-9_-]+', '_', restaurant_name).strip('_') or 'Menu'
        stamp = datetime.now().strftime('%Y-%m-%d')
        filename = f'{safe_name}_Menu_Audit_{stamp}.pdf'

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
