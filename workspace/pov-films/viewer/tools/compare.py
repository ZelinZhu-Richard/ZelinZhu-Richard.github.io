"""Side-by-side of the Blender still (left) and the web frame (right) at 540x960, plus region stats.

Usage (from workspace/pov-films): python3 viewer/tools/compare.py <slug> <seconds> <web.png> <out.png>
Prints mean luma, mean saturation and the share of pixels above luma 200 for the top, middle and
bottom thirds of both images, so the match can be judged by numbers as well as by eye.
"""
import sys
from PIL import Image, ImageStat

slug, t, web, out = sys.argv[1], float(sys.argv[2]), sys.argv[3], sys.argv[4]
ref = Image.open('films/%s/stills/t%.1f.png' % (slug, t)).convert('RGB').resize((540, 960), Image.LANCZOS)
w = Image.open(web).convert('RGB').resize((540, 960), Image.LANCZOS)
sheet = Image.new('RGB', (1080, 960))
sheet.paste(ref, (0, 0))
sheet.paste(w, (540, 0))
sheet.save(out)


def stats(im):
    rows = []
    for name, box in (('top', (0, 0, 540, 320)), ('mid', (0, 320, 540, 640)), ('bot', (0, 640, 540, 960))):
        c = im.crop(box)
        l = c.convert('L')
        hsv = c.convert('HSV')
        hist = l.histogram()
        hi = sum(hist[201:]) / float(sum(hist))
        rows.append('%s luma %5.1f sat %5.1f hi %4.1f%%' % (name, ImageStat.Stat(l).mean[0],
                                                          ImageStat.Stat(hsv).mean[1], hi * 100))
    return rows


for a, b in zip(stats(ref), stats(w)):
    print('blender %s  |  web %s' % (a, b))
print('sheet:', out)
