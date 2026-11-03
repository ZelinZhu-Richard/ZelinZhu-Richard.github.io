"""Background plates: reference layout -> painted gouache plate (sky, Milky Way, clouds, stars)."""
import os
import time

import numpy as np
from scipy import ndimage

from .painter import Painter, _sample
from .stars import Catalogue, StarPainter, project, star_style
from .world import sky_uniforms

CACHE = os.path.join(os.path.dirname(__file__), '..', 'cache')
_CAT = None


def catalogue():
    global _CAT
    if _CAT is None:
        _CAT = Catalogue()
    return _CAT


def render_reference(gl, cam, w, h, frag='sky_ref.frag', extra=None):
    col = gl.tex(w, h, 4, 'f4')
    mask = gl.tex(w, h, 4, 'f4')
    fbo = gl.fbo(col, mask)
    prog = gl.program(frag)
    gl.run(prog, fbo, {**cam.uniforms(), **sky_uniforms(), 'u_res': (w, h), **(extra or {})})
    c = gl.read(col)
    m = gl.read(mask)
    fbo.release(); col.release(); mask.release()
    return c[..., :3].copy(), c[..., 3].copy(), m


def paint_sky(gl, cam, w, h, seed=3, scale=1.0, star_target=11000, n_dynamic=360, log=print, banks=None):
    """Paint the sky plate for a camera. scale = plate px per frame px (brush sizes are in frame px)."""
    t0 = time.time()
    S = scale
    bk = np.zeros((8, 4), 'f4'); bp = np.zeros((8, 4), 'f4')   # always set: uniforms persist between plates
    for i, (dvec, rad, sd, aspect, bright) in enumerate((banks or [])[:8]):
        bk[i] = (*dvec, rad); bp[i] = (sd, aspect, bright, 1.0)
    extra = {'u_bank': bk, 'u_bankP': bp}
    ref, flow, masks = render_reference(gl, cam, w, h, extra=extra)
    band, dust, cloud, sea = (masks[..., i] for i in range(4))
    rng = np.random.default_rng(seed)
    p = Painter(gl, w, h, rng)
    sky = 1.0 - sea
    p.set_canvas(ndimage.gaussian_filter(ref, sigma=(26 * S, 26 * S, 0)))

    bandm = ndimage.gaussian_filter(np.clip((band - 0.06) * 3.0, 0, 1), 4 * S)
    brightm = ndimage.gaussian_filter(np.clip((band - 0.55) * 2.5, 0, 1), 3 * S)
    dustm = ndimage.gaussian_filter(np.clip(dust * 2.0, 0, 1), 3 * S)
    cloudm = ndimage.gaussian_filter(np.clip(cloud * 3.0, 0, 1), 2 * S)

    # brush direction inside and around clouds follows their contours, not the horizon
    cm = ndimage.gaussian_filter(cloud, 3 * S)
    gy, gx = np.gradient(cm)
    gmag = np.hypot(gx, gy)
    tangent = np.arctan2(gx, -gy)
    cflow = np.where(gmag > 0.004 / S, tangent, flow).astype(np.float32)
    flows = {'cloud': cflow}

    def L(name, **kw):
        r = kw.pop('r') * S
        fl = flows.get(kw.pop('flowname', ''), flow)
        n = p.layer(ref, fl, r, **kw)
        log(f'  {name:8s} r={r:5.1f} {n:6d} strokes  {time.time() - t0:5.1f}s')

    # broad, flat, mostly horizontal strokes: the hand-blended gradient
    L('wash', r=46, threshold=0, cover_all=True, max_len=20, dry=0.08, opacity=0.6, jitter_col=0.007,
      blur=0.9, stop_on_error=True, curl=0.02, edge=0.02, mask=1.0 - np.clip(cloudm * 2.0, 0, 1))
    L('gradient', r=26, threshold=0.012, max_len=16, dry=0.15, opacity=0.65, jitter_col=0.008, blur=0.9,
      curl=0.03, edge=0.03)
    # Milky Way body: scumbled dry-brush along the band
    L('band', r=14, threshold=0.0, cover_all=True, mask=bandm, max_len=10, dry=0.6, opacity=0.6,
      jitter_col=0.014, blur=0.6, stop_on_error=False, curl=0.22)
    L('band2', r=8, threshold=0.02, mask=bandm, max_len=8, dry=0.65, opacity=0.55, jitter_col=0.016, blur=0.5,
      curl=0.3)
    # cross-scumble: a lighter pass in several directions so the band is not one smudge
    L('scumble', r=7, threshold=0.0, cover_all=True, mask=bandm * 0.8, max_len=5, dry=0.75, opacity=0.35,
      jitter_col=0.02, blur=0.5, stop_on_error=False, curl=0.65)
    L('knots', r=4.5, threshold=0.0, cover_all=True, mask=brightm, max_len=1, dry=0.55, opacity=0.5,
      jitter_col=0.02, blur=0.4, stop_on_error=False, curl=1.5)
    # dark lanes: firmer, more opaque paint
    L('dust', r=5, threshold=0.025, mask=dustm, max_len=6, dry=0.35, opacity=0.75, jitter_col=0.012, blur=0.6,
      curl=0.25, edge=0.06)
    L('dust2', r=2.6, threshold=0.035, mask=dustm, max_len=4, dry=0.5, opacity=0.7, jitter_col=0.012, blur=0.5,
      curl=0.35)
    # feathered dry-brush over the lane edges, crossing them, so no edge stays stepped
    L('feather', r=3.5, threshold=0.0, cover_all=True, mask=np.clip(dustm * 2.5, 0, 1) * (1 - np.clip(dustm * 1.2 - 0.6, 0, 1)),
      max_len=4, dry=0.7, opacity=0.45, jitter_col=0.015, blur=0.9, stop_on_error=False, curl=0.9)
    # cloud ribbons: crisp poster-colour shapes
    L('cloudbody', r=10, threshold=0.0, cover_all=True, mask=cloudm, max_len=5, dry=0.3, opacity=0.85, jitter_col=0.012,
      blur=0.5, curl=0.25, edge=0.05, flowname='cloud')
    L('cloud', r=5, threshold=0.02, mask=cloudm, max_len=6, dry=0.3, opacity=0.92, jitter_col=0.01, blur=0.35,
      curl=0.15, edge=0.06, flowname='cloud')
    L('cloud2', r=2.6, threshold=0.03, mask=cloudm, max_len=4, dry=0.4, opacity=0.92, jitter_col=0.01, blur=0.25,
      curl=0.2, flowname='cloud')

    # stars: spatter and placed stars (the brightest are left for the animated layer)
    cat = catalogue()
    pix, front = project(cam, cat.dir, w, h)
    inside = front & (pix[:, 0] > -4) & (pix[:, 0] < w + 4) & (pix[:, 1] > -4) & (pix[:, 1] < h + 4)
    inside &= cat.dir[:, 1] > 0
    dyn = np.zeros(len(cat.mag), bool)
    dyn[cat.bright_ids(n_dynamic)] = True
    ids = np.nonzero(inside & ~dyn)[0]
    target = star_target * (w * h) / (1920 * 1040 * S * S)
    if len(ids) > target:
        lim = np.quantile(cat.mag[ids], target / len(ids))
        ids = ids[cat.mag[ids] <= lim]
    c = pix[ids]
    r, a, kind = star_style(cat.mag[ids], S)
    el = np.degrees(np.arcsin(cat.dir[ids, 1]))
    a *= np.clip(el / 3.5, 0, 1) ** 1.5
    dd = _sample(dust, c)
    a *= 1 - 0.75 * np.clip(dd * 1.4, 0, 1)
    a *= 1 - np.clip(_sample(cloud, c) * 1.6, 0, 1)
    sp = StarPainter(gl)
    sp.draw(p.fbo, w, h, c, r, a, kind, cat.seed[ids], cat.col[ids], scale=S)
    sp.draw(p.fbo, w, h, c, r, a * 0.6, kind, cat.seed[ids], cat.col[ids], scale=S, glow=True)
    log(f'  stars    {len(ids)}  {time.time() - t0:5.1f}s')
    img = p.read()
    return img, ref, masks
