"""Window sky plate for 02-bedroom-railway (round 3), run once with system Python:

    python3 -I films/02-bedroom-railway/make_plate.py

ESO potw1713a (ESO/B. Tafreshi, CC BY 4.0), crop of the top 62 percent (everything above Cerro
Paranal). Round 2 blurred the whole chroma plane, which smeared each bright star's colour into a
blue or pink disc around a sharp white core: the critics read those as "sprite stars with
coloured halos". Here the chroma is denoised with the stars masked out (normalised
convolution), so the background loses its RGB speckle but no star colour leaks into it, and the
stars themselves keep only a little of their own colour (desaturated to 45 percent). The luma is
untouched except round the brightest stars: the photo was shot through a diffusion filter, so
each bright star is a flat 20 px disc with a broad glow, which at frame scale read as a blue
sprite. Round each of those the excess over the local background is dimmed to 20 percent
outside a kept point core (r < 2 px), easing back to full at r = 36 px, and the colour is
desaturated toward the centre, so they read as bright points with a faint photographic glow. Then the crop is pre-shrunk with a Lanczos filter to 3400 px wide (about 1.8 plate px
per output px at the window's on-screen size)."""
import os
import sys
import numpy as np

from PIL import Image
from scipy import ndimage as ndi

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, '..', '..', 'assets', 'sky', 'eso-potw1713a', 'potw1713a.tif')
DST = os.path.join(HERE, 'plates', 'potw1713a_top62_w3400_v4.png')
LUMA = np.array([0.2126, 0.7152, 0.0722], np.float32)


def s2l(a):
    return np.where(a <= 0.04045, a / 12.92, ((a + 0.055) / 1.055) ** 2.4).astype(np.float32)


def l2s(a):
    a = np.clip(a, 0.0, 1.0)
    return np.where(a <= 0.0031308, a * 12.92, 1.055 * np.power(a, 1 / 2.4) - 0.055).astype(np.float32)


def shrink_halos(lin, thresh=0.2, R=40, Rh=36.0, K=3.0):
    """Collapse the diffusion-filter discs of bright stars to point cores."""
    Y = lin @ LUMA
    H, W = Y.shape
    d = Y[::4, ::4]
    bgd = np.stack([ndi.median_filter(lin[::4, ::4, c], size=31) for c in range(3)], -1)
    bgY = bgd @ LUMA
    halo = ndi.gaussian_filter(d, 1.5) - bgY            # excess at 4x decimation (sigma 6 px)
    mx = ndi.maximum_filter(halo, size=9)
    pk = (halo == mx) & (halo > thresh)
    ys, xs = np.nonzero(pk)
    out = lin.copy()
    yy, xx = np.mgrid[-R:R + 1, -R:R + 1].astype(np.float32)
    n = 0
    for y4, x4 in zip(ys, xs):
        # exact centre: brightest pixel near the decimated peak
        y0, x0 = int(y4 * 4), int(x4 * 4)
        ya, yb, xa, xb = max(0, y0 - 6), min(H, y0 + 7), max(0, x0 - 6), min(W, x0 + 7)
        sub = ndi.gaussian_filter(Y[ya:yb, xa:xb], 1.0)
        dy, dx = np.unravel_index(np.argmax(sub), sub.shape)
        cy, cx = ya + dy, xa + dx
        y1, y2, x1, x2 = max(0, cy - R), min(H, cy + R + 1), max(0, cx - R), min(W, cx + R + 1)
        rr = np.sqrt(yy[y1 - cy + R:y2 - cy + R, x1 - cx + R:x2 - cx + R] ** 2 +
                     xx[y1 - cy + R:y2 - cy + R, x1 - cx + R:x2 - cx + R] ** 2)
        # dim the flat diffusion disc round a kept point core: the excess over the local
        # background (median of an annulus at Rh) is scaled to 20 percent between r = 5 and
        # r = Rh / 2, back to 100 percent at Rh; the core (r < 2) is untouched
        win = out[y1:y2, x1:x2]
        ann = (rr >= Rh) & (rr < Rh + 4)
        if ann.sum() < 20:
            continue
        b = np.median(win[ann], axis=0)
        E = win - b
        def ss(e0, e1, x):
            t = np.clip((x - e0) / (e1 - e0), 0.0, 1.0)
            return t * t * (3 - 2 * t)
        bump = ss(1.5, 5.0, rr) * (1.0 - ss(Rh * 0.5, Rh, rr))
        f = (1.0 - 0.8 * bump)[..., None]
        E2 = np.where(E > 0, E * f, E)
        new = b + E2
        Lw = (new @ LUMA)[..., None]
        u = np.clip(rr / Rh, 0.0, 1.0)[..., None]
        new = new + (Lw - new) * 0.6 * (1.0 - u)
        out[y1:y2, x1:x2] = np.where((rr < Rh)[..., None], new, win)
        n += 1
    print('shrunk halos of %d bright stars' % n)
    return np.clip(out, 0.0, 1.0)


def main():
    if os.path.exists(DST) and '--force' not in sys.argv:
        print('exists', DST)
        return
    Image.MAX_IMAGE_PIXELS = None
    a = np.asarray(Image.open(SRC).convert("RGB"))
    H = a.shape[0]
    a = a[: int(H * 0.62)].astype(np.float32) / 255.0
    lin = s2l(a)
    lin = shrink_halos(lin)
    Y = lin @ LUMA
    # local background (median on a 4x decimated copy), then the star mask
    bg = ndi.median_filter(Y[::4, ::4], size=9)
    bg = ndi.zoom(bg, 4, order=1)[: Y.shape[0], : Y.shape[1]]
    pad = [(0, Y.shape[0] - bg.shape[0]), (0, Y.shape[1] - bg.shape[1])]
    bg = np.pad(bg, pad, mode='edge')
    resid = Y - bg
    star = resid > np.maximum(0.02, bg * 0.4)
    star = ndi.binary_dilation(star, iterations=1)
    w = ndi.gaussian_filter((~star).astype(np.float32), 4.5)
    C = lin - Y[..., None]
    Cb = np.empty_like(C)
    for c in range(3):
        Cb[..., c] = ndi.gaussian_filter(C[..., c] * (~star), 4.5) / np.maximum(w, 1e-3)
    sm = ndi.gaussian_filter(star.astype(np.float32), 1.0)[..., None]
    Cf = Cb * (1.0 - sm) + C * 0.45 * sm
    out = np.clip(Y[..., None] + Cf, 0.0, 1.0)
    img = Image.fromarray((l2s(out) * 255.0 + 0.5).astype(np.uint8))
    W2 = 3400
    H2 = int(round(W2 * img.height / img.width))
    img = img.resize((W2, H2), Image.LANCZOS)
    os.makedirs(os.path.dirname(DST), exist_ok=True)
    img.save(DST, optimize=False, compress_level=3)
    print('wrote', DST, img.size, 'star px %.2f%%' % (100 * star.mean()))


if __name__ == '__main__':
    main()
