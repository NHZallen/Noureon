"""deckstyle: learn the style of a PowerPoint deck or template, then make or change decks in that style.

Part of the official skill "deck-style-replica" (Noureon). It works the same in the server sandbox and in the browser's Python:

    import sys; sys.path.insert(0, "/skills/deck-style-replica/scripts")
    import deckstyle as ds
    print(ds.describe("/input/company.pptx"))                       # the style, never the old content
    report = ds.build("/input/company.pptx", spec, "/output/new.pptx")  # a new deck on the template's own layouts
    print(ds.shapes("/output/new.pptx", slide=3))                    # what is on a slide, to point at a shape
    report = ds.edit("/output/new.pptx", ops, "/output/new.pptx")     # changes in order
    print(ds.check("/output/new.pptx"))                              # problems to fix before delivering

Only python-pptx (and lxml, Pillow, which it uses) is needed. Nothing here reaches the network.
"""

import copy
import io
import json
import math
import os
import re
import zipfile
from collections import Counter

from lxml import etree
from pptx import Presentation
from pptx.chart.data import CategoryChartData
from pptx.dml.color import RGBColor
from pptx.enum.chart import XL_CHART_TYPE, XL_LEGEND_POSITION
from pptx.enum.dml import MSO_THEME_COLOR
from pptx.enum.shapes import MSO_SHAPE_TYPE, PP_PLACEHOLDER
from pptx.opc.constants import RELATIONSHIP_TYPE as RT
from pptx.opc.package import Part
from pptx.oxml.ns import qn
from pptx.parts.chart import ChartPart
from pptx.util import Emu, Pt

A = "http://schemas.openxmlformats.org/drawingml/2006/main"
P = "http://schemas.openxmlformats.org/presentationml/2006/main"
EMU_PER_PT = 12700
EMU_PER_CM = 360000
EMU_PER_IN = 914400

# ------------------------------------------------------------------ opening

_MAIN_TYPES = (
    "application/vnd.openxmlformats-officedocument.presentationml.template.main+xml",
    "application/vnd.openxmlformats-officedocument.presentationml.slideshow.main+xml",
    "application/vnd.ms-powerpoint.presentation.macroEnabled.main+xml",
    "application/vnd.ms-powerpoint.template.macroEnabled.main+xml",
    "application/vnd.ms-powerpoint.slideshow.macroEnabled.main+xml",
)
_PRESENTATION_TYPE = "application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"


def open_deck(path):
    """A Presentation from a .pptx, or from a template or show (.potx, .ppsx, ...) read as a plain deck. Macros are never kept."""
    if not isinstance(path, (str, os.PathLike)):
        return path
    with open(path, "rb") as handle:
        data = handle.read()
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as source:
            types = source.read("[Content_Types].xml").decode("utf-8")
            if not any(kind in types for kind in _MAIN_TYPES):
                return Presentation(io.BytesIO(data))
            out = io.BytesIO()
            with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as target:
                for item in source.infolist():
                    if item.filename.lower().endswith("vbaproject.bin"):
                        continue
                    body = source.read(item.filename)
                    if item.filename == "[Content_Types].xml":
                        text = body.decode("utf-8")
                        for kind in _MAIN_TYPES:
                            text = text.replace(kind, _PRESENTATION_TYPE)
                        text = re.sub(r'<Default Extension="bin"[^>]*vbaProject[^>]*/>', "", text)
                        body = text.encode("utf-8")
                    target.writestr(item, body)
            return Presentation(io.BytesIO(out.getvalue()))
    except zipfile.BadZipFile:
        raise ValueError("This file is not a PowerPoint file (.pptx, .potx). An old .ppt has to be saved as .pptx first.")


# ------------------------------------------------------------------ small helpers

def _pct(value, whole):
    return None if value is None or not whole else round(100.0 * value / whole, 1)


def _box(shape, prs):
    """The shape's place in percent of the slide: {x, y, w, h}, or None when it has none of its own."""
    if shape.left is None or shape.width is None:
        return None
    return {"x": _pct(shape.left, prs.slide_width), "y": _pct(shape.top, prs.slide_height),
            "w": _pct(shape.width, prs.slide_width), "h": _pct(shape.height, prs.slide_height)}


def _ph_kind(shape):
    try:
        fmt = shape.placeholder_format
    except ValueError:
        return None
    kind = fmt.type
    names = {
        PP_PLACEHOLDER.TITLE: "title", PP_PLACEHOLDER.CENTER_TITLE: "title", PP_PLACEHOLDER.VERTICAL_TITLE: "title",
        PP_PLACEHOLDER.SUBTITLE: "subtitle", PP_PLACEHOLDER.BODY: "body", PP_PLACEHOLDER.VERTICAL_BODY: "body",
        PP_PLACEHOLDER.OBJECT: "content", PP_PLACEHOLDER.VERTICAL_OBJECT: "content", PP_PLACEHOLDER.PICTURE: "picture",
        PP_PLACEHOLDER.TABLE: "table", PP_PLACEHOLDER.CHART: "chart", PP_PLACEHOLDER.ORG_CHART: "content",
        PP_PLACEHOLDER.MEDIA_CLIP: "content", PP_PLACEHOLDER.BITMAP: "picture", PP_PLACEHOLDER.DATE: "date",
        PP_PLACEHOLDER.FOOTER: "footer", PP_PLACEHOLDER.SLIDE_NUMBER: "slide_number", PP_PLACEHOLDER.HEADER: "header",
    }
    return names.get(kind, "other")


def _shape_kind(shape):
    ph = _ph_kind(shape) if shape.is_placeholder else None
    if ph:
        return "placeholder:" + ph
    kind = shape.shape_type
    if kind == MSO_SHAPE_TYPE.PICTURE:
        return "picture"
    if getattr(shape, "has_chart", False) and shape.has_chart:
        return "chart"
    if getattr(shape, "has_table", False) and shape.has_table:
        return "table"
    if kind == MSO_SHAPE_TYPE.GROUP:
        return "group"
    if kind == MSO_SHAPE_TYPE.LINE or shape._element.tag == qn("p:cxnSp"):
        return "line"
    if shape.has_text_frame and shape.text_frame.text.strip():
        return "text"
    return "shape"


def _theme_part(master):
    try:
        return master.part.part_related_by(RT.THEME)
    except KeyError:
        return None


def _theme(prs):
    """The theme of the first master: its colours and its two fonts."""
    part = _theme_part(prs.slide_masters[0])
    if part is None:
        return {"colors": {}, "fonts": {}}
    root = etree.fromstring(part.blob)
    colors = {}
    scheme = root.find(".//{%s}clrScheme" % A)
    if scheme is not None:
        for child in scheme:
            name = etree.QName(child).localname
            value = None
            for inner in child:
                tag = etree.QName(inner).localname
                if tag == "srgbClr":
                    value = "#" + inner.get("val").upper()
                elif tag == "sysClr":
                    value = "#" + (inner.get("lastClr") or ("000000" if inner.get("val") == "windowText" else "FFFFFF")).upper()
            colors[name] = value
    fonts = {}
    for role, tag in (("headings", "majorFont"), ("body", "minorFont")):
        node = root.find(".//{%s}%s" % (A, tag))
        if node is None:
            continue
        latin = node.find("{%s}latin" % A)
        east = node.find("{%s}ea" % A)
        fonts[role] = {"latin": latin.get("typeface") if latin is not None else None,
                       "east_asian": (east.get("typeface") or None) if east is not None else None}
    return {"colors": colors, "fonts": fonts}


def _layouts(prs):
    found = []
    for m_index, master in enumerate(prs.slide_masters):
        for l_index, layout in enumerate(master.slide_layouts):
            found.append((m_index, l_index, layout))
    return found


def _find_layout(prs, wanted):
    """A layout by its name (case and spaces do not matter), by "master/index" or by its number in describe()'s list (from 1)."""
    layouts = _layouts(prs)
    if wanted is None:
        wanted = 1 if len(layouts) > 1 else 0
    if isinstance(wanted, int):
        if 0 <= wanted < len(layouts):
            return layouts[wanted][2]
        raise ValueError("There is no layout number %d; describe() lists %d (numbered from 0)." % (wanted, len(layouts)))
    text = str(wanted).strip()
    if re.fullmatch(r"\d+", text):
        return _find_layout(prs, int(text))
    simple = re.sub(r"\s+", " ", text).lower()
    for _, _, layout in layouts:
        if re.sub(r"\s+", " ", layout.name or "").lower() == simple:
            return layout
    for _, _, layout in layouts:
        if simple in re.sub(r"\s+", " ", layout.name or "").lower():
            return layout
    raise ValueError("There is no layout named %r. The layouts are: %s." % (text, ", ".join(repr(l.name) for _, _, l in layouts)))


def _slide(prs, number):
    count = len(prs.slides)
    if not isinstance(number, int) or not 1 <= number <= count:
        raise ValueError("Slide %r does not exist: the deck has %d slides (numbered from 1)." % (number, count))
    return prs.slides[number - 1]


# ------------------------------------------------------------------ what a deck looks like

def _run_style(run):
    font = run.font
    color = None
    try:
        if font.color and font.color.type is not None:
            color = ("theme:" + str(font.color.theme_color).split(".")[-1].split(" ")[0].lower()) if font.color.theme_color else ("#" + str(font.color.rgb))
    except (AttributeError, TypeError):
        color = None
    return font.size.pt if font.size else None, font.name, color, font.bold


def inspect(path, include_text=False):
    """The style of a deck or template as a dict. Old text is left out unless include_text is True (for changing that deck itself)."""
    prs = open_deck(path)
    width, height = prs.slide_width, prs.slide_height
    theme = _theme(prs)
    slides = list(prs.slides)
    layout_use = Counter(id(slide.slide_layout) for slide in slides)

    layouts = []
    for number, (m_index, l_index, layout) in enumerate(_layouts(prs)):
        holders = []
        for shape in layout.placeholders:
            kind = _ph_kind(shape)
            if kind in ("date", "footer", "slide_number", "header"):
                continue
            holders.append({"kind": kind, "idx": shape.placeholder_format.idx, "name": shape.name, "box": _box(shape, prs)})
        decorations = [{"kind": _shape_kind(shape), "name": shape.name, "box": _box(shape, prs)} for shape in layout.shapes if not shape.is_placeholder]
        layouts.append({"number": number, "master": m_index, "name": layout.name, "placeholders": holders,
                        "decorations": decorations, "used_by_slides": layout_use.get(id(layout), 0)})

    master_marks = []
    for m_index, master in enumerate(prs.slide_masters):
        for shape in master.shapes:
            if not shape.is_placeholder:
                master_marks.append({"master": m_index, "kind": _shape_kind(shape), "name": shape.name, "box": _box(shape, prs)})

    # Elements in the same place on most slides (a logo, a band, a page number) are part of the style; one-off ones are not.
    seen = Counter()
    sources = {}
    role_styles = {"title": [], "body": []}
    footers = Counter()
    sizes = {"title": [], "body": []}
    fonts = Counter()
    colors = Counter()
    tables = Counter()
    charts = Counter()
    small_text = 0
    for slide in slides:
        keys = set()
        for shape in slide.shapes:
            kind = _shape_kind(shape)
            if kind in ("placeholder:slide_number", "placeholder:footer", "placeholder:date"):
                footers[kind.split(":")[1]] += 1
                continue
            if shape.is_placeholder:
                continue
            box = _box(shape, prs)
            if box:
                key = (kind, round(box["x"]), round(box["y"]), round(box["w"]), round(box["h"]))
                keys.add(key)
                sources.setdefault(key, (slides.index(slide) + 1, shape.shape_id))
        for key in keys:
            seen[key] += 1
        for shape in slide.placeholders:
            role = {"title": "title", "body": "body", "content": "body"}.get(_ph_kind(shape))
            if not role or not shape.has_text_frame:
                continue
            runs = [run for paragraph in shape.text_frame.paragraphs for run in paragraph.runs if run.text.strip()]
            if runs:
                role_styles[role].append(_run_style(runs[0]))
        for shape in slide.shapes:
            if getattr(shape, "has_table", False) and shape.has_table:
                style = shape._element.find(".//{%s}tableStyleId" % A)
                tables[style.text if style is not None else "none"] += 1
            if getattr(shape, "has_chart", False) and shape.has_chart:
                chart = shape.chart
                charts[(str(chart.chart_type).split(" ")[0], bool(chart.has_legend))] += 1
            if not shape.has_text_frame:
                continue
            role = "title" if _ph_kind(shape) == "title" else "body"
            for paragraph in shape.text_frame.paragraphs:
                for run in paragraph.runs:
                    if not run.text.strip():
                        continue
                    size, name, color, _ = _run_style(run)
                    if size:
                        sizes[role].append(size)
                        if size < 12:
                            small_text += 1
                    if name:
                        fonts[name] += 1
                    if color:
                        colors[color] += 1
    recurring = []
    if len(slides) >= 3:
        for (kind, x, y, w, h), count in seen.most_common():
            if count >= max(3, math.ceil(0.6 * len(slides))):
                source = sources[(kind, x, y, w, h)]
                recurring.append({"kind": kind, "box": {"x": x, "y": y, "w": w, "h": h}, "on_slides": count, "from_slide": source[0], "shape_id": source[1]})

    def steady(role):
        # A hand-set size, font, colour or weight counts as the style only when most slides with that placeholder have it.
        found = role_styles[role]
        style = {}
        for position, key in enumerate(("size_pt", "font", "color", "bold")):
            values = Counter(item[position] for item in found)
            value, count = values.most_common(1)[0] if values else (None, 0)
            if value is not None and count >= max(2, math.ceil(0.6 * len(found))):
                style[key] = value
        return style

    def median(values):
        values = sorted(values)
        return values[len(values) // 2] if values else None

    is_template = str(path).lower().endswith((".potx", ".potm")) or not slides or (len(layouts) >= 4 and len(slides) <= 2)
    result = {
        "file": os.path.basename(str(path)),
        "slide_size": {"width_cm": round(width / EMU_PER_CM, 2), "height_cm": round(height / EMU_PER_CM, 2),
                        "ratio": "16:9" if abs(width / height - 16 / 9) < 0.02 else "4:3" if abs(width / height - 4 / 3) < 0.02 else "%.3f" % (width / height)},
        "theme": theme,
        "layouts": layouts,
        "master_decorations": master_marks,
        "recurring_on_slides": recurring,
        "footers_on_slides": {kind: count for kind, count in footers.items()},
        "hand_set_style": {"title": steady("title"), "body": steady("body")},
        "slides": len(slides),
        "observed": {
            "explicit_title_size_pt": median(sizes["title"]),
            "explicit_body_size_pt": median(sizes["body"]),
            "explicit_fonts": [name for name, _ in fonts.most_common(5)],
            "explicit_colors": [name for name, _ in colors.most_common(8)],
            "table_styles": [name for name, _ in tables.most_common(3)],
            "charts": [{"type": kind, "legend": legend, "count": count} for (kind, legend), count in charts.most_common(5)],
            "runs_under_12pt": small_text,
        },
        "mode_guess": "template" if is_template else "reference",
    }
    if include_text:
        result["slide_text"] = [{"slide": n, "layout": s.slide_layout.name,
                                 "text": [sh.text_frame.text[:300] for sh in s.shapes if sh.has_text_frame and sh.text_frame.text.strip()]}
                                for n, s in enumerate(slides, 1)]
    return result


def describe(path, include_text=False):
    """inspect() as short text for reading."""
    info = inspect(path, include_text=include_text)
    lines = ["File: %s (%d slides, %s, %s x %s cm). Looks like: %s." % (
        info["file"], info["slides"], info["slide_size"]["ratio"], info["slide_size"]["width_cm"], info["slide_size"]["height_cm"],
        "a template (follow it strictly)" if info["mode_guess"] == "template" else "a finished deck (learn its style, do not copy its content)")]
    colors = info["theme"]["colors"]
    if colors:
        lines.append("Theme colours: " + ", ".join("%s %s" % (k, v) for k, v in colors.items() if v))
    fonts = info["theme"]["fonts"]
    if fonts:
        lines.append("Theme fonts: " + "; ".join("%s %s%s" % (role, f.get("latin"), (" / " + f["east_asian"]) if f.get("east_asian") else "") for role, f in fonts.items()))
    lines.append("Layouts (number: name [placeholders] used by N slides):")
    for layout in info["layouts"]:
        holders = ", ".join("%s#%s@%s,%s %sx%s" % (h["kind"], h["idx"], *(("?",) * 4 if not h["box"] else (h["box"]["x"], h["box"]["y"], h["box"]["w"], h["box"]["h"]))) for h in layout["placeholders"])
        extra = (" + %d decorations" % len(layout["decorations"])) if layout["decorations"] else ""
        lines.append("  %d: %s [%s]%s, used by %d" % (layout["number"], layout["name"], holders or "no placeholders", extra, layout["used_by_slides"]))
    if info["master_decorations"]:
        lines.append("On the master (every slide): " + "; ".join("%s %r at %s" % (d["kind"], d["name"], d["box"]) for d in info["master_decorations"]))
    if info["recurring_on_slides"]:
        lines.append("Repeated on most slides (part of the style): " + "; ".join("%s at %s on %d slides" % (r["kind"], r["box"], r["on_slides"]) for r in info["recurring_on_slides"]))
    for role, style in info["hand_set_style"].items():
        if style:
            lines.append("Set by hand on most %s placeholders (part of the style): %s" % (role, ", ".join("%s %s" % kv for kv in style.items())))
    if info["footers_on_slides"]:
        lines.append("Footers shown on slides: " + ", ".join("%s on %d" % kv for kv in info["footers_on_slides"].items()))
    observed = info["observed"]
    lines.append("Set by hand on the slides: title size %s pt, body size %s pt, fonts %s, colours %s, table styles %s, charts %s, runs under 12 pt: %d." % (
        observed["explicit_title_size_pt"], observed["explicit_body_size_pt"], observed["explicit_fonts"] or "none", observed["explicit_colors"] or "none",
        observed["table_styles"] or "none", observed["charts"] or "none", observed["runs_under_12pt"]))
    for item in info.get("slide_text", []):
        lines.append("Slide %d (%s): %s" % (item["slide"], item["layout"], " | ".join(t.replace("\n", " / ") for t in item["text"])[:400]))
    return "\n".join(lines)


# ------------------------------------------------------------------ slides: remove, move, copy

def _sld_ids(prs):
    return prs.slides._sldIdLst


def _renumber(prs):
    # python-pptx names a new slide after the count of slides (slideN+1.xml): after a slide is removed or moved, the names are made
    # 1..N again so that a new slide's name is never one that is still in use.
    prs.part.rename_slide_parts([sld_id.rId for sld_id in _sld_ids(prs)])


def _drop_slide(prs, slide):
    ids = _sld_ids(prs)
    for sld_id in list(ids):
        if prs.part.related_part(sld_id.rId) is slide.part:
            r_id = sld_id.rId
            ids.remove(sld_id)
            prs.part.drop_rel(r_id)
            _renumber(prs)
            return
    raise ValueError("That slide is not in the deck.")


def _move_slide(prs, slide, to_number):
    ids = _sld_ids(prs)
    element = next(sld_id for sld_id in ids if prs.part.related_part(sld_id.rId) is slide.part)
    ids.remove(element)
    ids.insert(max(0, min(len(ids), to_number - 1)), element)
    _renumber(prs)


_REL_ATTRS = (qn("r:embed"), qn("r:link"), qn("r:id"), qn("r:pict"))


def _clone_chart(chart_part, package):
    partname = package.next_partname("/ppt/charts/chart%d.xml")
    new = ChartPart.load(partname, chart_part.content_type, package, chart_part.blob)
    for r_id, rel in list(chart_part.rels.items()):
        if rel.is_external:
            continue
        target = rel.target_part
        if rel.reltype == RT.PACKAGE:
            ext = os.path.splitext(str(target.partname))[1] or ".xlsx"
            copy_part = Part(package.next_partname("/ppt/embeddings/Microsoft_Excel_Worksheet%d" + ext), target.content_type, package, target.blob)
        else:
            copy_part = target
        new_id = new.relate_to(copy_part, rel.reltype)
        if new_id != r_id:
            for node in new._element.iter():
                for attr in _REL_ATTRS:
                    if node.get(attr) == r_id:
                        node.set(attr, new_id)
    return new


def _copy_shapes(source, target, prs, skip_placeholders=False):
    """The shapes of one slide put on another, with their pictures, charts and links."""
    mapping = {}
    for r_id, rel in source.part.rels.items():
        if rel.reltype in (RT.SLIDE_LAYOUT, RT.NOTES_SLIDE):
            continue
        if rel.is_external:
            mapping[r_id] = target.part.relate_to(rel.target_ref, rel.reltype, is_external=True)
        elif rel.reltype == RT.CHART:
            mapping[r_id] = target.part.relate_to(_clone_chart(rel.target_part, prs.part.package), rel.reltype)
        else:
            mapping[r_id] = target.part.relate_to(rel.target_part, rel.reltype)
    tree = target.shapes._spTree
    for element in source.shapes._spTree.iterchildren():
        if etree.QName(element).localname not in ("sp", "pic", "graphicFrame", "grpSp", "cxnSp", "contentPart"):
            continue
        if skip_placeholders and element.find(".//" + qn("p:ph")) is not None:
            continue
        clone = copy.deepcopy(element)
        for node in clone.iter():
            for attr in _REL_ATTRS:
                value = node.get(attr)
                if value in mapping:
                    node.set(attr, mapping[value])
        tree.append(clone)
    # Shape ids must be unique on a slide.
    used = set()
    next_id = max([int(n.get("id")) for n in tree.iter(qn("p:cNvPr")) if (n.get("id") or "").isdigit()] + [1]) + 1
    for node in tree.iter(qn("p:cNvPr")):
        if node.get("id") in used:
            node.set("id", str(next_id))
            next_id += 1
        used.add(node.get("id"))


def _clear(slide):
    for element in list(slide.shapes._spTree.iterchildren()):
        if etree.QName(element).localname in ("sp", "pic", "graphicFrame", "grpSp", "cxnSp", "contentPart"):
            slide.shapes._spTree.remove(element)


def _duplicate(prs, slide, to_number=None):
    new = prs.slides.add_slide(slide.slide_layout)
    _clear(new)
    _copy_shapes(slide, new, prs)
    background = slide._element.find(qn("p:cSld") + "/" + qn("p:bg"))
    if background is not None:
        new._element.find(qn("p:cSld")).insert(0, copy.deepcopy(background))
    if slide.has_notes_slide and slide.notes_slide.notes_text_frame is not None:
        new.notes_slide.notes_text_frame.text = slide.notes_slide.notes_text_frame.text
    _move_slide(prs, new, to_number or (list(prs.slides).index(slide) + 2))
    return new


# ------------------------------------------------------------------ filling a slide

_CHARTS = {
    "column": XL_CHART_TYPE.COLUMN_CLUSTERED, "stacked_column": XL_CHART_TYPE.COLUMN_STACKED, "bar": XL_CHART_TYPE.BAR_CLUSTERED,
    "stacked_bar": XL_CHART_TYPE.BAR_STACKED, "line": XL_CHART_TYPE.LINE_MARKERS, "area": XL_CHART_TYPE.AREA,
    "pie": XL_CHART_TYPE.PIE, "doughnut": XL_CHART_TYPE.DOUGHNUT, "scatter": XL_CHART_TYPE.XY_SCATTER,
}
_BOLD = re.compile(r"\*\*(.+?)\*\*")


def _write_runs(paragraph, text):
    """Text with **bold** parts; everything else keeps the template's formatting."""
    at = 0
    for match in _BOLD.finditer(text):
        if match.start() > at:
            paragraph.add_run().text = text[at:match.start()]
        run = paragraph.add_run()
        run.text = match.group(1)
        run.font.bold = True
        at = match.end()
    if at < len(text):
        paragraph.add_run().text = text[at:]


def _write_text(frame, items):
    """Paragraphs into a text frame: a string, or a list of strings and {"text", "level"} (level 0 to 4)."""
    if isinstance(items, str):
        items = [line for line in items.split("\n")]
    frame.clear()
    first = True
    for item in items:
        text, level = (item, 0) if isinstance(item, str) else (str(item.get("text", "")), int(item.get("level", 0)))
        paragraph = frame.paragraphs[0] if first else frame.add_paragraph()
        first = False
        paragraph.level = max(0, min(4, level))
        _write_runs(paragraph, text)


def _area(slide, holder, prs):
    """Where content goes: the holder's box, else the body area of the layout, else the slide less margins."""
    if holder is not None and holder.width:
        return holder.left, holder.top, holder.width, holder.height
    for shape in slide.slide_layout.placeholders:
        if _ph_kind(shape) in ("body", "content") and shape.width:
            return shape.left, shape.top, shape.width, shape.height
    margin_x, margin_y = int(prs.slide_width * 0.06), int(prs.slide_height * 0.22)
    return margin_x, margin_y, prs.slide_width - 2 * margin_x, prs.slide_height - margin_y - int(prs.slide_height * 0.08)


def _remove(shape):
    shape._element.getparent().remove(shape._element)


def _picture(slide, holder, path, prs, fit="contain"):
    if holder is not None and _ph_kind(holder) == "picture" and hasattr(holder, "insert_picture"):
        # The placeholder is replaced by the picture, so its box is read first. "cover" fills it (cropped), "contain" shows all of it.
        box = (holder.left, holder.top, holder.width, holder.height)
        picture = holder.insert_picture(path)
        if fit == "contain":
            picture.crop_left = picture.crop_right = picture.crop_top = picture.crop_bottom = 0
            _fit_into(picture, *box, picture.image.size)
        return picture
    left, top, width, height = _area(slide, holder, prs)
    picture = slide.shapes.add_picture(path, left, top)
    _fit_into(picture, left, top, width, height, picture.image.size)
    if holder is not None:
        _remove(holder)
    return picture


def _fit_into(picture, left, top, width, height, pixels):
    pw, ph = pixels
    if not pw or not ph:
        return
    scale = min(width / pw, height / ph)
    picture.width, picture.height = int(pw * scale), int(ph * scale)
    picture.left = int(left + (width - picture.width) / 2)
    picture.top = int(top + (height - picture.height) / 2)


def _table(slide, holder, spec, prs, table_style=None):
    columns = [str(c) for c in spec.get("columns", [])]
    rows = [[("" if v is None else str(v)) for v in row] for row in spec.get("rows", [])]
    count_cols = max([len(columns)] + [len(r) for r in rows] + [1])
    count_rows = len(rows) + (1 if columns else 0)
    left, top, width, height = _area(slide, holder, prs)
    row_height = min(int(height / max(1, count_rows)), int(Pt(32) * 1.0))
    frame = slide.shapes.add_table(max(1, count_rows), count_cols, left, top, width, row_height * max(1, count_rows))
    table = frame.table
    if table_style and table_style != "none":
        frame._element.find(".//{%s}tableStyleId" % A).text = table_style
    at = 0
    if columns:
        table.first_row = True
        for c in range(count_cols):
            table.cell(0, c).text = columns[c] if c < len(columns) else ""
        at = 1
    else:
        table.first_row = False
    for r, row in enumerate(rows):
        for c in range(count_cols):
            table.cell(r + at, c).text = row[c] if c < len(row) else ""
    if holder is not None:
        _remove(holder)
    return frame


def _chart(slide, holder, spec, prs, style=None):
    kind = _CHARTS.get(str(spec.get("type", "column")).lower())
    if kind is None:
        raise ValueError("Chart type %r is not one of: %s." % (spec.get("type"), ", ".join(_CHARTS)))
    data = CategoryChartData()
    data.categories = list(spec.get("categories", []))
    for series in spec.get("series", []):
        data.add_series(str(series.get("name", "")), list(series.get("values", [])))
    left, top, width, height = _area(slide, holder, prs)
    frame = slide.shapes.add_chart(kind, left, top, width, height, data)
    chart = frame.chart
    style = style or {}
    many = len(spec.get("series", [])) > 1 or kind in (XL_CHART_TYPE.PIE, XL_CHART_TYPE.DOUGHNUT)
    chart.has_legend = bool(spec.get("legend", style.get("legend", many)))
    if chart.has_legend:
        chart.legend.position = XL_LEGEND_POSITION.BOTTOM
        chart.legend.include_in_layout = False
    if spec.get("data_labels", style.get("data_labels")):
        plot = chart.plots[0]
        plot.has_data_labels = True
        if spec.get("number_format"):
            plot.data_labels.number_format = spec["number_format"]
            plot.data_labels.number_format_is_linked = False
    if spec.get("title"):
        chart.has_title = True
        chart.chart_title.text_frame.text = str(spec["title"])
    else:
        chart.has_title = False
    if holder is not None:
        _remove(holder)
    return frame


def _copy_footers(slide, kinds):
    """The template's footer, date and page number on a new slide (python-pptx leaves them off)."""
    if not kinds:
        return
    tree = slide.shapes._spTree
    for shape in slide.slide_layout.placeholders:
        if _ph_kind(shape) in kinds:
            tree.append(copy.deepcopy(shape._element))


def _fill(slide, content, prs, defaults):
    holders = {}
    for shape in slide.placeholders:
        holders.setdefault(_ph_kind(shape), []).append(shape)

    def take(*kinds):
        for kind in kinds:
            if holders.get(kind):
                return holders[kind].pop(0)
        return None

    if content.get("title") is not None:
        holder = take("title")
        if holder is not None:
            _write_text(holder.text_frame, str(content["title"]))
    if content.get("subtitle") is not None:
        holder = take("subtitle", "body")
        if holder is not None:
            _write_text(holder.text_frame, content["subtitle"])
    if content.get("body") is not None:
        holder = take("body", "content")
        if holder is not None:
            _write_text(holder.text_frame, content["body"])
        else:
            left, top, width, height = _area(slide, None, prs)
            _write_text(slide.shapes.add_textbox(left, top, width, height).text_frame, content["body"])
    for column in content.get("columns", []) or []:
        holder = take("body", "content")
        if holder is not None:
            _write_text(holder.text_frame, column)
    if content.get("image"):
        _picture(slide, take("picture", "content", "body"), content["image"], prs, content.get("image_fit", "contain"))
    if content.get("table"):
        _table(slide, take("table", "content", "body"), content["table"], prs, defaults.get("table_style"))
    if content.get("chart"):
        _chart(slide, take("chart", "content", "body"), content["chart"], prs, defaults.get("chart_style"))
    for idx, value in (content.get("placeholders") or {}).items():
        match = next((s for s in slide.placeholders if str(s.placeholder_format.idx) == str(idx)), None)
        if match is not None and match.has_text_frame:
            _write_text(match.text_frame, value)
            for group in holders.values():
                if match in group:
                    group.remove(match)
    if content.get("notes"):
        slide.notes_slide.notes_text_frame.text = str(content["notes"])
    # Placeholders left empty would show "Click to add text" in PowerPoint.
    for group in holders.values():
        for shape in group:
            if not (shape.has_text_frame and shape.text_frame.text.strip()):
                _remove(shape)
    _copy_footers(slide, defaults.get("footers"))


def _apply_role_style(slide, styles):
    """The title and body formatting the old slides set by hand, on a new slide's placeholders."""
    for shape in slide.placeholders:
        role = {"title": "title", "body": "body", "content": "body"}.get(_ph_kind(shape))
        style = styles.get(role) if role else None
        if not style or not shape.has_text_frame:
            continue
        for paragraph in shape.text_frame.paragraphs:
            for run in paragraph.runs:
                if style.get("size_pt"):
                    run.font.size = Pt(style["size_pt"])
                if style.get("font"):
                    run.font.name = style["font"]
                if style.get("bold") is not None and run.font.bold is None:
                    run.font.bold = style["bold"]
                color = style.get("color")
                if color and color.startswith("#"):
                    run.font.color.rgb = RGBColor.from_string(color[1:])
                elif color and color.startswith("theme:"):
                    try:
                        _apply_color(run.font.color, color.split(":", 1)[1].replace("_", ""))
                    except ValueError:
                        pass


def _carry(source, shape_id, target, prs):
    """One element of an old slide (a logo, a band) copied onto a new slide, with its picture."""
    element = next((s._element for s in source.shapes if s.shape_id == shape_id), None)
    if element is None:
        return
    clone = copy.deepcopy(element)
    for node in clone.iter():
        for attr in _REL_ATTRS:
            value = node.get(attr)
            if value and value in source.part.rels:
                rel = source.part.rels[value]
                if rel.is_external:
                    node.set(attr, target.part.relate_to(rel.target_ref, rel.reltype, is_external=True))
                elif rel.reltype == RT.CHART:
                    node.set(attr, target.part.relate_to(_clone_chart(rel.target_part, prs.part.package), rel.reltype))
                else:
                    node.set(attr, target.part.relate_to(rel.target_part, rel.reltype))
    tree = target.shapes._spTree
    biggest = max([int(n.get("id")) for n in tree.iter(qn("p:cNvPr")) if (n.get("id") or "").isdigit()] + [1])
    for offset, node in enumerate(clone.iter(qn("p:cNvPr")), 1):
        node.set("id", str(biggest + offset))
    tree.append(clone)


def _default_footers(prs, info):
    shown = info.get("footers_on_slides") or {}
    if not info["slides"]:
        return []
    return [kind for kind, count in shown.items() if count >= info["slides"] / 2]


# ------------------------------------------------------------------ build

def build(template, spec, out_path):
    """A new deck in the template's style.

    spec = {
      "keep": [1],                      # old slides to keep (numbers from 1); all others are removed. Default: none
      "footers": "auto",                # "auto" (as most old slides), "none", or a list of "footer", "date", "slide_number"
      "repeat": "auto",                 # elements on most old slides (a logo) go on every new slide; "none" leaves them off.
                                        # A slide can say "repeat": false (a full-bleed photo, a section break)
      "hand_set_style": "auto",         # size, font, colour set by hand on most old titles or bodies is applied; "none" does not
      "table_style": "auto",            # "auto" (the one the old tables use) or a tableStyleId
      "chart_style": {"legend": true, "data_labels": false},
      "slides": [
        {"layout": "Title Slide", "title": "...", "subtitle": "..."},
        {"layout": "Title and Content", "title": "...", "body": ["point", {"text": "sub point", "level": 1}], "notes": "..."},
        {"layout": "Two Content", "title": "...", "columns": [["left"], ["right"]]},
        {"layout": "Title Only", "title": "...", "chart": {"type": "column", "categories": [...], "series": [{"name": "...", "values": [...]}]}},
        {"layout": 5, "title": "...", "table": {"columns": [...], "rows": [[...]]}},
        {"layout": "Picture with Caption", "title": "...", "image": "/input/photo.jpg", "body": "caption"},
        {"keep": 1}                     # an old slide (listed in "keep") put at this place
      ]
    }
    Returns a report: the layout used for each slide and the problems check() finds.
    """
    if isinstance(spec, str):
        spec = json.loads(spec)
    info = inspect(template)
    prs = open_deck(template)
    old = list(prs.slides)
    # What repeats on most old slides is put on every new one (unless "repeat": "none"); the slides it comes from stay readable until saving.
    repeat = [] if spec.get("repeat") == "none" else [(old[item["from_slide"] - 1], item["shape_id"]) for item in info["recurring_on_slides"]]
    role_styles = {} if spec.get("hand_set_style") == "none" else info["hand_set_style"]
    keep = set(spec.get("keep") or [n["keep"] for n in spec.get("slides", []) if isinstance(n, dict) and "keep" in n])
    for number, slide in enumerate(old, 1):
        if number not in keep:
            _drop_slide(prs, slide)
    kept = {number: slide for number, slide in enumerate(old, 1) if number in keep}

    footers = spec.get("footers", "auto")
    footers = _default_footers(prs, info) if footers == "auto" else ([] if footers in (None, "none") else list(footers))
    table_style = spec.get("table_style", "auto")
    if table_style == "auto":
        table_style = (info["observed"]["table_styles"] or [None])[0]
    defaults = {"footers": footers, "table_style": table_style, "chart_style": spec.get("chart_style") or {}}

    order = []
    used = []
    for number, content in enumerate(spec.get("slides", []), 1):
        if "keep" in content:
            slide = kept.get(content["keep"])
            if slide is None:
                raise ValueError("Slide %r of the template was not kept, so it cannot be placed." % content["keep"])
            order.append(slide)
            used.append({"slide": number, "kept": content["keep"]})
            continue
        layout = _find_layout(prs, content.get("layout"))
        slide = prs.slides.add_slide(layout)
        _fill(slide, content, prs, defaults)
        _apply_role_style(slide, role_styles)
        if content.get("repeat", True):
            for source, shape_id in repeat:
                _carry(source, shape_id, slide, prs)
        order.append(slide)
        used.append({"slide": number, "layout": layout.name})
    for slide in kept.values():
        if slide not in order:
            order.append(slide)
    for position, slide in enumerate(order, 1):
        _move_slide(prs, slide, position)
    _save(prs, out_path)
    return {"file": out_path, "slides": used, "problems": check(out_path, as_list=True, style_from=info)}


def _save(prs, out_path):
    folder = os.path.dirname(str(out_path))
    if folder:
        os.makedirs(folder, exist_ok=True)
    prs.save(out_path)


# ------------------------------------------------------------------ shapes on a slide, to point at

def shapes(path, slide=None):
    """What is on each slide (or one): id, name, kind, place in cm and in percent, and the start of the text. Ids are what edit() takes."""
    prs = open_deck(path)
    lines = []
    numbers = [slide] if slide else range(1, len(prs.slides) + 1)
    for number in numbers:
        current = _slide(prs, number)
        lines.append("Slide %d (layout %r):" % (number, current.slide_layout.name))
        for shape in current.shapes:
            box = _box(shape, prs)
            where = "" if not box else " at x %.1f cm, y %.1f cm, %.1f x %.1f cm (%s%%, %s%%)" % (
                shape.left / EMU_PER_CM, shape.top / EMU_PER_CM, shape.width / EMU_PER_CM, shape.height / EMU_PER_CM, box["x"], box["y"])
            text = shape.text_frame.text.replace("\n", " / ")[:60] if shape.has_text_frame and shape.text_frame.text.strip() else ""
            lines.append("  id %s %s %r%s%s" % (shape.shape_id, _shape_kind(shape), shape.name, where, (": " + text) if text else ""))
    return "\n".join(lines)


# ------------------------------------------------------------------ edit

def _length(value, whole):
    """A distance: a number in points, or a string "2%" (of the slide), "1cm", "5mm", "0.5in", "10pt"."""
    if isinstance(value, (int, float)):
        return int(value * EMU_PER_PT)
    text = str(value).strip().lower()
    match = re.fullmatch(r"(-?[\d.]+)\s*(%|cm|mm|in|pt|px)?", text)
    if not match:
        raise ValueError("%r is not a distance (use a number of points, or 2%%, 1cm, 5mm, 0.5in, 10pt)." % value)
    number, unit = float(match.group(1)), match.group(2) or "pt"
    return int({"%": whole / 100.0, "cm": EMU_PER_CM, "mm": EMU_PER_CM / 10, "in": EMU_PER_IN, "pt": EMU_PER_PT, "px": EMU_PER_IN / 96}[unit] * number)


def _shape(slide, ref):
    """A shape by id (a number), by name, or {"placeholder": "title"|"body"|...}."""
    if isinstance(ref, dict) and "placeholder" in ref:
        for shape in slide.shapes:
            if shape.is_placeholder and _ph_kind(shape) == ref["placeholder"]:
                return shape
        raise ValueError("Slide has no %s placeholder." % ref["placeholder"])
    for shape in slide.shapes:
        if (isinstance(ref, int) and shape.shape_id == ref) or (isinstance(ref, str) and (shape.name == ref or str(shape.shape_id) == ref)):
            return shape
    raise ValueError("No shape %r on that slide; shapes() lists them." % (ref,))


def _color(value):
    text = str(value).strip()
    if re.fullmatch(r"#?[0-9a-fA-F]{6}", text):
        return RGBColor.from_string(text.lstrip("#").upper())
    names = {"dk1": "DARK_1", "lt1": "LIGHT_1", "dk2": "DARK_2", "lt2": "LIGHT_2", "hlink": "HYPERLINK", "folhlink": "FOLLOWED_HYPERLINK"}
    key = names.get(text.lower(), text.upper().replace("ACCENT", "ACCENT_").replace("__", "_"))
    try:
        return getattr(MSO_THEME_COLOR, key)
    except AttributeError:
        raise ValueError("%r is not a colour: use a theme colour (accent1..accent6, dk1, lt1, dk2, lt2) or #RRGGBB." % value)


def _apply_color(target, value):
    color = _color(value)
    if isinstance(color, RGBColor):
        target.rgb = color
    else:
        target.theme_color = color


def _targets(prs, op):
    """The (slide, shape) pairs an operation is about: one shape, or a role ("title", "body") on some or all slides."""
    slides = range(1, len(prs.slides) + 1) if op.get("slide") in (None, "all") else ([op["slide"]] if isinstance(op["slide"], int) else op["slide"])
    pairs = []
    for number in slides:
        slide = _slide(prs, number)
        if "shape" in op:
            pairs.append((slide, _shape(slide, op["shape"])))
        elif "role" in op:
            pairs.extend((slide, s) for s in slide.shapes if s.is_placeholder and _ph_kind(s) in ((op["role"],) if op["role"] != "body" else ("body", "content")))
    return pairs


def _relayout(prs, slide, layout):
    """The same content on another layout: the title and the body move into the new placeholders, everything else is kept as it is."""
    new = prs.slides.add_slide(layout)
    old_holders = {}
    for shape in slide.placeholders:
        old_holders.setdefault(_ph_kind(shape), []).append(shape)
    targets = list(new.placeholders)
    filled = set()

    def area(shape):
        return (shape.width or 0) * (shape.height or 0)

    def move_text(source, shape):
        body = shape._element.find(qn("p:txBody"))
        body.getparent().replace(body, copy.deepcopy(source._element.find(qn("p:txBody"))))
        filled.add(id(shape))

    # Same kind first (a title to the title, a content box to a content box), then body and content stand in for each other,
    # the biggest box first, so the main text never lands in a small caption or column header.
    for exact in (True, False):
        for kind, group in old_holders.items():
            if kind in ("footer", "date", "slide_number"):
                continue
            while group:
                options = [t for t in targets if id(t) not in filled and t.has_text_frame and (
                    _ph_kind(t) == kind if exact else {kind, _ph_kind(t)} == {"body", "content"})]
                if not options or not group[0].has_text_frame:
                    break
                # Boxes about as big as the biggest count the same; of those, the one read first (top, then left) is used.
                biggest = max(area(t) for t in options)
                near = [t for t in options if area(t) >= biggest * 0.9]
                move_text(group.pop(0), min(near, key=lambda t: ((t.top or 0) // EMU_PER_CM, t.left or 0)))
    for shape in targets:
        if id(shape) not in filled and not (shape.has_text_frame and shape.text_frame.text.strip()):
            _remove(shape)
    _copy_shapes(slide, new, prs, skip_placeholders=True)
    for group in old_holders.values():
        for left in group:
            if left.has_text_frame and left.text_frame.text.strip() and _ph_kind(left) not in ("footer", "date", "slide_number"):
                new.shapes._spTree.append(copy.deepcopy(left._element))
    if slide.has_notes_slide:
        new.notes_slide.notes_text_frame.text = slide.notes_slide.notes_text_frame.text
    position = list(prs.slides).index(slide) + 1
    _drop_slide(prs, slide)
    _move_slide(prs, new, position)
    return new


def edit(path, ops, out_path=None):
    """Changes, done in order (a slide number means the deck as it is at that step). Returns what was done.

    ops = [
      {"op": "set_text", "slide": 2, "shape": {"placeholder": "title"}, "text": "New title"},
      {"op": "set_text", "slide": 2, "shape": 5, "text": ["point", {"text": "sub", "level": 1}]},
      {"op": "move", "slide": 3, "shape": 7, "dx": "1%", "dy": 0},        # "a little" is 1% of the slide
      {"op": "move_to", "slide": 3, "shape": 7, "x": "50%", "y": "10cm"},
      {"op": "resize", "slide": 3, "shape": 7, "scale": 1.2} or {"width": "8cm", "keep_ratio": true},
      {"op": "color", "slide": "all", "role": "title", "color": "accent1"},  # text colour; "fill": "#112233" for a shape's fill
      {"op": "font_size", "slide": 4, "shape": 3, "size": 20},
      {"op": "replace_image", "slide": 5, "shape": 4, "image": "/input/new.png"},
      {"op": "delete_shape", "slide": 5, "shape": 9},
      {"op": "add_slide", "at": 4, "layout": "Title and Content", "title": "...", "body": [...]},   # same content keys as build()
      {"op": "duplicate_slide", "slide": 2, "to": 3},
      {"op": "move_slide", "slide": 6, "to": 2},
      {"op": "delete_slide", "slide": 6},
      {"op": "change_layout", "slide": 4, "layout": "Two Content"},
      {"op": "notes", "slide": 4, "text": "..."}
    ]
    """
    if isinstance(ops, str):
        ops = json.loads(ops)
    info = inspect(path)
    prs = open_deck(path)
    defaults = {"footers": _default_footers(prs, info), "table_style": (info["observed"]["table_styles"] or [None])[0], "chart_style": {}}
    done = []
    for step, op in enumerate(ops, 1):
        kind = op.get("op")
        try:
            if kind == "set_text":
                slide = _slide(prs, op["slide"])
                _write_text(_shape(slide, op["shape"]).text_frame, op["text"])
            elif kind in ("move", "move_to", "resize", "font_size", "replace_image", "delete_shape"):
                slide = _slide(prs, op["slide"])
                shape = _shape(slide, op["shape"])
                if kind == "move":
                    shape.left = shape.left + _length(op.get("dx", 0), prs.slide_width)
                    shape.top = shape.top + _length(op.get("dy", 0), prs.slide_height)
                elif kind == "move_to":
                    if "x" in op:
                        shape.left = _length(op["x"], prs.slide_width)
                    if "y" in op:
                        shape.top = _length(op["y"], prs.slide_height)
                elif kind == "resize":
                    cx, cy = shape.left + shape.width / 2, shape.top + shape.height / 2
                    if "scale" in op:
                        width, height = int(shape.width * float(op["scale"])), int(shape.height * float(op["scale"]))
                    else:
                        ratio = shape.height / shape.width if shape.width else 1
                        width = _length(op["width"], prs.slide_width) if "width" in op else shape.width
                        height = _length(op["height"], prs.slide_height) if "height" in op else (int(width * ratio) if op.get("keep_ratio", True) else shape.height)
                    shape.width, shape.height = width, height
                    if op.get("keep_center", True):
                        shape.left, shape.top = int(cx - width / 2), int(cy - height / 2)
                elif kind == "font_size":
                    for paragraph in shape.text_frame.paragraphs:
                        for run in paragraph.runs:
                            run.font.size = Pt(float(op["size"]))
                elif kind == "replace_image":
                    left, top, width, height = shape.left, shape.top, shape.width, shape.height
                    picture = slide.shapes.add_picture(op["image"], left, top)
                    _fit_into(picture, left, top, width, height, picture.image.size)
                    shape._element.addprevious(picture._element)
                    _remove(shape)
                elif kind == "delete_shape":
                    _remove(shape)
            elif kind == "color":
                for _, shape in _targets(prs, op):
                    if "fill" in op:
                        shape.fill.solid()
                        _apply_color(shape.fill.fore_color, op["fill"])
                    if "color" in op and shape.has_text_frame:
                        for paragraph in shape.text_frame.paragraphs:
                            for run in paragraph.runs:
                                _apply_color(run.font.color, op["color"])
            elif kind == "add_slide":
                slide = prs.slides.add_slide(_find_layout(prs, op.get("layout")))
                _fill(slide, op, prs, defaults)
                _move_slide(prs, slide, op.get("at", len(prs.slides)))
            elif kind == "duplicate_slide":
                _duplicate(prs, _slide(prs, op["slide"]), op.get("to"))
            elif kind == "move_slide":
                _move_slide(prs, _slide(prs, op["slide"]), op["to"])
            elif kind == "delete_slide":
                _drop_slide(prs, _slide(prs, op["slide"]))
            elif kind == "change_layout":
                _relayout(prs, _slide(prs, op["slide"]), _find_layout(prs, op["layout"]))
            elif kind == "notes":
                _slide(prs, op["slide"]).notes_slide.notes_text_frame.text = str(op["text"])
            else:
                raise ValueError("Unknown op %r." % kind)
            done.append("%d. %s: done" % (step, kind))
        except (ValueError, KeyError, IndexError, TypeError) as error:
            raise ValueError("Step %d (%s) failed, nothing was saved: %s" % (step, kind, error)) from error
    out_path = out_path or path
    _save(prs, out_path)
    return {"file": out_path, "done": done, "problems": check(out_path, as_list=True, style_from=info)}


# ------------------------------------------------------------------ check

def _inherited_size(shape, level):
    """The font size (pt) a placeholder's text gets from the layout and master, when no size is set by hand."""
    def from_list(node):
        if node is None:
            return None
        for tag in ("lvl%dpPr" % (level + 1), "lvl1pPr"):
            found = node.find("{%s}%s/{%s}defRPr" % (A, tag, A))
            if found is not None and found.get("sz"):
                return int(found.get("sz")) / 100.0
        return None

    candidates = [shape]
    if shape.is_placeholder:
        try:
            layout_holder = shape.part.slide_layout.placeholders.get(idx=shape.placeholder_format.idx)
        except (AttributeError, KeyError):
            layout_holder = None
        if layout_holder is not None:
            candidates.append(layout_holder)
    for candidate in candidates:
        size = from_list(candidate._element.find(".//" + qn("a:lstStyle")))
        if size:
            return size
    try:
        master = shape.part.slide_layout.slide_master
        styles = master._element.find(qn("p:txStyles"))
        kind = _ph_kind(shape) if shape.is_placeholder else None
        tag = "titleStyle" if kind == "title" else "bodyStyle" if kind in ("body", "content", "subtitle") else "otherStyle"
        return from_list(styles.find(qn("p:" + tag))) or 18.0
    except AttributeError:
        return 18.0


def _text_height(frame, width_emu, shape):
    """About how tall the text is (EMU), with CJK characters a full em wide and others about half."""
    usable = max(1, width_emu - int(0.2 * EMU_PER_IN))
    total = 0
    for paragraph in frame.paragraphs:
        size = None
        for run in paragraph.runs:
            if run.font.size:
                size = run.font.size.pt
                break
        size = size or _inherited_size(shape, paragraph.level)
        text = "".join(run.text for run in paragraph.runs) or " "
        ems = sum(1.0 if ord(ch) > 0x2E80 else 0.55 for ch in text)
        indent = paragraph.level * 0.4 * EMU_PER_IN
        lines = max(1, math.ceil(ems * size * EMU_PER_PT / max(1, usable - indent)))
        total += lines * size * 1.2 * EMU_PER_PT + size * 0.3 * EMU_PER_PT
    return total + int(0.1 * EMU_PER_IN)


def check(path, as_list=False, style_from=None):
    """Problems to fix before delivering: text that does not fit, things off the slide, empty placeholders, squashed pictures, tiny text,
    and fonts or colours that are neither the theme's nor ones the style source (style_from: its path or its inspect()) uses itself.
    It estimates; the visual check after delivery looks at the real slides."""
    prs = open_deck(path)
    theme = _theme(prs)
    theme_fonts = {f.get(k) for f in theme["fonts"].values() for k in ("latin", "east_asian") if f.get(k)}
    theme_colors = {v for v in theme["colors"].values() if v}
    if style_from is not None:
        source = style_from if isinstance(style_from, dict) else inspect(style_from)
        theme_fonts |= set(source["observed"]["explicit_fonts"])
        theme_colors |= {c.upper() for c in source["observed"]["explicit_colors"] if c.startswith("#")}
    problems = []
    for number, slide in enumerate(prs.slides, 1):
        has_title = False
        for shape in slide.shapes:
            name = "%s (id %s)" % (shape.name, shape.shape_id)
            if shape.is_placeholder and _ph_kind(shape) == "title" and shape.has_text_frame and shape.text_frame.text.strip():
                has_title = True
            if shape.width is not None and shape.left is not None:
                if shape.left < -EMU_PER_PT or shape.top < -EMU_PER_PT or shape.left + shape.width > prs.slide_width + EMU_PER_PT or shape.top + shape.height > prs.slide_height + EMU_PER_PT:
                    problems.append({"slide": number, "shape": name, "problem": "goes past the edge of the slide"})
            if shape.has_text_frame:
                frame = shape.text_frame
                if shape.is_placeholder and not frame.text.strip() and _ph_kind(shape) not in ("footer", "date", "slide_number"):
                    problems.append({"slide": number, "shape": name, "problem": "empty placeholder (shows 'Click to add text'): fill or delete it"})
                if frame.text.strip() and shape.width and shape.height:
                    need = _text_height(frame, shape.width, shape)
                    if need > shape.height * 1.08:
                        problems.append({"slide": number, "shape": name, "problem": "text may not fit: about %d%% of the box" % (100 * need / shape.height)})
                for paragraph in frame.paragraphs:
                    for run in paragraph.runs:
                        if run.font.size and run.font.size.pt < 10 and run.text.strip():
                            problems.append({"slide": number, "shape": name, "problem": "text under 10 pt"})
                        if run.font.name and theme_fonts and run.font.name not in theme_fonts:
                            problems.append({"slide": number, "shape": name, "problem": "font %r is not one of the theme's (%s)" % (run.font.name, ", ".join(sorted(theme_fonts)))})
                        try:
                            if run.font.color and run.font.color.type is not None and not run.font.color.theme_color:
                                value = "#" + str(run.font.color.rgb)
                                if theme_colors and value.upper() not in theme_colors:
                                    problems.append({"slide": number, "shape": name, "problem": "colour %s is not one of the theme's" % value})
                        except (AttributeError, TypeError):
                            pass
            if shape.shape_type == MSO_SHAPE_TYPE.PICTURE:
                try:
                    pw, ph = shape.image.size
                    crop_w = 1 - shape.crop_left - shape.crop_right
                    crop_h = 1 - shape.crop_top - shape.crop_bottom
                    if pw and ph and shape.width and shape.height and crop_w > 0 and crop_h > 0:
                        want = (pw * crop_w) / (ph * crop_h)
                        have = shape.width / shape.height
                        if abs(have / want - 1) > 0.03:
                            problems.append({"slide": number, "shape": name, "problem": "picture is stretched (%.0f%% off its own shape)" % (100 * abs(have / want - 1))})
                except (AttributeError, ValueError, ZeroDivisionError):
                    pass
        if not has_title and len(list(slide.shapes)) > 1 and number > 1:
            problems.append({"slide": number, "shape": "-", "problem": "no title (fine for a picture or section slide; otherwise add one)"})
    # One problem of a kind per shape is enough.
    unique, seen = [], set()
    for item in problems:
        key = (item["slide"], item["shape"], item["problem"][:24])
        if key not in seen:
            seen.add(key)
            unique.append(item)
    if as_list:
        return unique
    if not unique:
        return "No problems found."
    return "\n".join("Slide %d, %s: %s" % (p["slide"], p["shape"], p["problem"]) for p in unique)


# ------------------------------------------------------------------ command line

def _main(argv):
    if len(argv) < 2 or argv[1] not in ("describe", "inspect", "build", "edit", "shapes", "check"):
        print("use: deckstyle.py describe|inspect|build|edit|shapes|check ...")
        return 2
    command = argv[1]
    if command == "describe":
        print(describe(argv[2], include_text="--text" in argv))
    elif command == "inspect":
        print(json.dumps(inspect(argv[2], include_text="--text" in argv), ensure_ascii=False, indent=1))
    elif command == "build":
        with open(argv[3], encoding="utf-8") as handle:
            print(json.dumps(build(argv[2], json.load(handle), argv[4]), ensure_ascii=False, indent=1))
    elif command == "edit":
        with open(argv[3], encoding="utf-8") as handle:
            print(json.dumps(edit(argv[2], json.load(handle), argv[4] if len(argv) > 4 else None), ensure_ascii=False, indent=1))
    elif command == "shapes":
        print(shapes(argv[2], int(argv[3]) if len(argv) > 3 else None))
    elif command == "check":
        print(check(argv[2]))
    return 0


if __name__ == "__main__":
    import sys
    raise SystemExit(_main(sys.argv))
