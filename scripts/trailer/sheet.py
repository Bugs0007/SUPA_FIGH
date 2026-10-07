# Contact sheet of preview frames: python scripts/trailer/sheet.py <out.png> <cols> <frame1.png> <frame2.png> ...
import sys
from PIL import Image, ImageDraw
out, cols, files = sys.argv[1], int(sys.argv[2]), sys.argv[3:]
tw = 640 if cols <= 3 else 480
th = tw * 9 // 16
rows = (len(files) + cols - 1) // cols
sheet = Image.new('RGB', (tw * cols, th * rows), (20, 10, 30))
d = ImageDraw.Draw(sheet)
for i, f in enumerate(files):
    im = Image.open(f).convert('RGB').resize((tw, th), Image.LANCZOS)
    x, y = (i % cols) * tw, (i // cols) * th
    sheet.paste(im, (x, y))
    d.rectangle([x, y, x + 54, y + 12], fill=(0, 0, 0))
    d.text((x + 2, y + 1), f.replace(chr(92), '/').split('_')[-1][:-4], fill=(255, 255, 0))
sheet.save(out)
