"""Render the Mistakes BrainLift markdown into a copy of the Diagnostic Brainlift docx template.

The template supplies styles, numbering and theme; only word/document.xml is replaced.
"""

import re
import shutil
import sys
import zipfile
from pathlib import Path

FONT = ('<w:rFonts w:ascii="Times New Roman" w:cs="Times New Roman" '
        'w:eastAsia="Times New Roman" w:hAnsi="Times New Roman"/>')

HEADER = (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
    '<w:document '
    'xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" '
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" '
    'xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" '
    'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" '
    'xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml" '
    'xmlns:w15="http://schemas.microsoft.com/office/word/2012/wordml">'
    '<w:body>'
)

SECTPR = ('<w:sectPr><w:pgSz w:h="15840" w:w="12240" w:orient="portrait"/>'
          '<w:pgMar w:bottom="1440" w:top="1440" w:left="1440" w:right="1440" '
          'w:header="720" w:footer="720"/><w:pgNumType w:start="1"/></w:sectPr>')


def esc(text):
    return text.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


def inline(text):
    """Split a line into (text, style) runs where style is '', 'b' or 'i'."""
    text = text.replace('`', '')
    text = re.sub(r'<(https?://[^>]+)>', r'\1', text)
    runs = []
    for tok in re.split(r'(\*\*[^*]+\*\*|\*[^*]+\*)', text):
        if not tok:
            continue
        if tok.startswith('**') and tok.endswith('**'):
            runs.append((tok[2:-2], 'b'))
        elif tok.startswith('*') and tok.endswith('*'):
            runs.append((tok[1:-1], 'i'))
        else:
            runs.append((tok, ''))
    return runs


def run_xml(text, style, size, force_bold=False, force_italic=False):
    bold = '<w:b w:val="1"/><w:bCs w:val="1"/>' if (style == 'b' or force_bold) else ''
    italic = '<w:i w:val="1"/><w:iCs w:val="1"/>' if (style == 'i' or force_italic) else ''
    rpr = f'<w:rPr>{FONT}{bold}{italic}<w:sz w:val="{size}"/><w:szCs w:val="{size}"/><w:rtl w:val="0"/></w:rPr>'
    return f'<w:r>{rpr}<w:t xml:space="preserve">{esc(text)}</w:t></w:r>'


def para(text, size=24, spacing='<w:spacing w:before="0" w:after="100" w:line="240" w:lineRule="auto"/>',
         bold=False, italic=False, num=None, indent=None):
    ppr = ''
    if num:
        ppr += f'<w:numPr><w:ilvl w:val="0"/><w:numId w:val="{num}"/></w:numPr><w:ind w:left="720" w:hanging="360"/>'
    elif indent:
        ppr += f'<w:ind w:left="{indent}"/>'
    ppr += spacing
    ppr += f'<w:rPr>{FONT}<w:sz w:val="{size}"/><w:szCs w:val="{size}"/></w:rPr>'
    runs = ''.join(run_xml(t, s, size, bold, italic) for t, s in inline(text)) if text else ''
    return f'<w:p><w:pPr>{ppr}</w:pPr>{runs}</w:p>'


SPACER = para('', 24, '<w:spacing w:line="480" w:lineRule="auto"/>')
TIGHT = '<w:spacing w:before="0" w:after="40" w:line="240" w:lineRule="auto"/>'
LIST = '<w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/>'
HEAD1 = '<w:spacing w:before="0" w:after="120" w:line="240" w:lineRule="auto"/>'
HEAD2 = '<w:spacing w:before="0" w:after="80" w:line="240" w:lineRule="auto"/>'
QUOTE = '<w:spacing w:before="60" w:after="60" w:line="240" w:lineRule="auto"/>'

COLON_SECTIONS = {'Owners', 'Purpose', 'In Scope', 'Out of Scope'}


def convert(md):
    out = []
    quote_buffer = []

    def flush_quote():
        if quote_buffer:
            out.append(para(' '.join(quote_buffer), 24, QUOTE, italic=True, indent=720))
            quote_buffer.clear()

    # Join wrapped lines within each logical block.
    blocks = []
    for raw in md.split('\n'):
        line = raw.rstrip()
        if not line.strip():
            blocks.append(None)
            continue
        starts_block = bool(re.match(r'^(#{1,3} |- |\d+\. |> |---$)', line))
        if blocks and blocks[-1] is not None and not starts_block:
            blocks[-1] = blocks[-1].rstrip() + ' ' + line.strip()
        else:
            blocks.append(line)

    for block in blocks:
        if block is None:
            continue
        if block.strip() == '---':
            continue
        if block.startswith('> '):
            quote_buffer.append(block[2:].strip())
            continue
        flush_quote()

        if block.startswith('### '):
            out.append(SPACER)
            out.append(para(block[4:], 24, TIGHT, bold=True))
        elif block.startswith('## '):
            title = block[3:]
            if title in COLON_SECTIONS:
                title += ':'
            out.append(SPACER)
            out.append(para(title, 26, HEAD2, bold=True))
        elif block.startswith('# '):
            if out:
                out.append(SPACER)
            out.append(para(block[2:], 28, HEAD1, bold=True))
        elif block.startswith('- '):
            out.append(para(block[2:], 24, LIST, num=3))
        elif re.match(r'^\d+\. ', block):
            out.append(para(re.sub(r'^\d+\. ', '', block), 24, LIST, num=4))
        elif re.fullmatch(r'\*[^*]+\*', block):
            out.append(para(block, 24, TIGHT))
        elif re.fullmatch(r'\*\*[^*]+\*\*', block):
            out.append(para(block, 24, TIGHT))
        elif block.startswith('*') and ' <http' in block:
            out.append(para(block, 24, TIGHT))
        else:
            out.append(para(block, 24))

    flush_quote()
    return HEADER + ''.join(out) + SECTPR + '</w:body></w:document>'


def main():
    md_path, template, target = (Path(a) for a in sys.argv[1:4])
    xml = convert(md_path.read_text(encoding='utf-8'))
    tmp = target.with_suffix('.tmp.docx')
    shutil.copyfile(template, tmp)
    with zipfile.ZipFile(tmp) as src:
        items = [(i, src.read(i.filename)) for i in src.infolist()]
    with zipfile.ZipFile(target, 'w', zipfile.ZIP_DEFLATED) as dst:
        for info, data in items:
            if info.filename == 'word/document.xml':
                data = xml.encode('utf-8')
            dst.writestr(info.filename, data)
    tmp.unlink()
    print(f'wrote {target}')


if __name__ == '__main__':
    main()
