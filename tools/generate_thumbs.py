#!/usr/bin/env python3
"""
Gera as miniaturas quadradas usadas no tabuleiro e no álbum.

Lê data/saints.json e, para cada santo, recorta um quadrado centrado no
rosto (campo "crop") a partir do retrato ORIGINAL em Santos/ — que nunca é
modificado — e grava assets/saints/<id>.jpg em 256x256.

Uso (na raiz do projeto):
    python3 tools/generate_thumbs.py            # gera todas
    python3 tools/generate_thumbs.py --sheet    # também cria uma prancha de conferência

Requer Pillow (pip install pillow).

Campo "crop" em data/saints.json:
    x, y  -> centro do rosto, em fração da largura/altura do retrato (0..1)
    size  -> lado do recorte, em fração da menor dimensão do retrato (0..1)
"""
import json
import os
import sys

from PIL import Image, ImageOps

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_SIZE = 256
FACE_ANCHOR_Y = 0.42  # o rosto fica levemente acima do centro do recorte


def crop_box(w, h, crop):
    side = max(16, min(w, h) * float(crop.get("size", 1)))
    side = min(side, w, h)
    cx = w * float(crop.get("x", 0.5))
    cy = h * float(crop.get("y", 0.4))
    left = cx - side / 2
    top = cy - side * FACE_ANCHOR_Y
    left = max(0, min(left, w - side))
    top = max(0, min(top, h - side))
    return (round(left), round(top), round(left + side), round(top + side))


def main():
    with open(os.path.join(ROOT, "data", "saints.json"), encoding="utf-8") as fh:
        saints = json.load(fh)["saints"]

    made = []
    for s in saints:
        src = os.path.join(ROOT, s["image"])
        dst = os.path.join(ROOT, s["thumb"])
        if not os.path.exists(src):
            print("FALTANDO:", s["image"])
            continue
        im = ImageOps.exif_transpose(Image.open(src))
        if im.mode in ("RGBA", "LA", "P"):
            im = im.convert("RGBA")
            bg = Image.new("RGB", im.size, (40, 20, 70))
            bg.paste(im, mask=im.split()[-1])
            im = bg
        else:
            im = im.convert("RGB")
        box = crop_box(im.width, im.height, s.get("crop", {}))
        tile = im.crop(box).resize((OUT_SIZE, OUT_SIZE), Image.LANCZOS)
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        tile.save(dst, "JPEG", quality=86, optimize=True, progressive=True)
        made.append((s, tile))
        print("ok", s["id"], box)

    if "--sheet" in sys.argv:
        from PIL import ImageDraw
        cols = 6
        rows = (len(made) + cols - 1) // cols
        sheet = Image.new("RGB", (cols * 140, rows * 160), "white")
        draw = ImageDraw.Draw(sheet)
        for i, (s, tile) in enumerate(made):
            x, y = (i % cols) * 140, (i // cols) * 160
            sheet.paste(tile.resize((128, 128)), (x + 6, y + 6))
            draw.text((x + 6, y + 138), s["id"][:22], fill="black")
        path = os.path.join(ROOT, "tools", "thumbs_sheet.jpg")
        sheet.save(path, quality=80)
        print("prancha:", path)


if __name__ == "__main__":
    main()
