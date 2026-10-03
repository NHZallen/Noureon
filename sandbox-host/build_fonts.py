"""Pins the app's variable fonts to regular and bold and names them plainly (Inter-Regular.ttf, NotoSansTC-Bold.ttf ...): the files the
model is told to use (public/sandbox guidance), the same as the browser sandbox makes. Run when the image is built:
    python build_fonts.py <folder with the .ttf files of src/assets/fonts> <output folder>
"""
import os
import sys

from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

FONTS = [
    ("inter.ttf", "Inter", "Inter"),
    ("noto-sans-tc.ttf", "Noto Sans TC", "NotoSansTC"),
    ("noto-serif-tc.ttf", "Noto Serif TC", "NotoSerifTC"),
    ("noto-sans-sc.ttf", "Noto Sans SC", "NotoSansSC"),
    ("noto-sans-jp.ttf", "Noto Sans JP", "NotoSansJP"),
    ("noto-sans-kr.ttf", "Noto Sans KR", "NotoSansKR"),
]
WEIGHTS = [(400, "Regular", False), (700, "Bold", True)]


def rename(font, family, style, bold):
    full = family if style == "Regular" else f"{family} {style}"
    postscript = (family + "-" + style).replace(" ", "")
    for record in font["name"].names:
        if record.nameID in (1, 16):
            record.string = family
        elif record.nameID in (2, 17):
            record.string = style
        elif record.nameID == 4:
            record.string = full
        elif record.nameID == 6:
            record.string = postscript
    os2 = font["OS/2"]
    os2.usWeightClass = 700 if bold else 400
    # fsSelection: bit 5 bold, bit 6 regular
    os2.fsSelection = (os2.fsSelection & ~0b1100001) | (0b100000 if bold else 0b1000000)
    font["head"].macStyle = 1 if bold else 0


def main(source, target):
    os.makedirs(target, exist_ok=True)
    for file, family, name in FONTS:
        path = os.path.join(source, file)
        for weight, style, bold in WEIGHTS:
            font = TTFont(path)
            if "fvar" in font:
                # Weight as asked, every other axis at its default: a plain static font.
                axes = {axis.axisTag: (weight if axis.axisTag == "wght" else axis.defaultValue) for axis in font["fvar"].axes}
                font = instancer.instantiateVariableFont(font, axes, inplace=False)
            rename(font, family, style, bold)
            font.save(os.path.join(target, f"{name}-{style}.ttf"))
            print("made", f"{name}-{style}.ttf")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
