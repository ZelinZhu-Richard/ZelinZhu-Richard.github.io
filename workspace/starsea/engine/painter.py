"""Gouache background painter.

Takes a reference layout (colour + brush-flow field + masks) and repaints it with brush strokes, coarse to
fine, the way a background artist blocks in a sky and then works detail into it (after Hertzmann's
curved-stroke painterly rendering, with strokes kept long and flat so the result reads as poster
colour rather than an oil filter).
"""
import moderngl
import numpy as np
from scipy import ndimage

STROKE_FMT = '2f 2f 3f 4f 2f'
STROKE_ATTRS = ('in_pos', 'in_uv', 'in_col', 'in_par', 'in_dry')
FLOATS_PER_VERT = 13


def _sample(img, pts):
    """Bilinear sample img (H,W,C) at float pixel coords pts (N,2) given as (x, y)."""
    h, w = img.shape[:2]
    x = np.clip(pts[:, 0], 0, w - 1.001)
    y = np.clip(pts[:, 1], 0, h - 1.001)
    x0, y0 = x.astype(np.int32), y.astype(np.int32)
    fx, fy = (x - x0)[:, None], (y - y0)[:, None]
    a = img[y0, x0]
    b = img[y0, x0 + 1]
    c = img[y0 + 1, x0]
    d = img[y0 + 1, x0 + 1]
    if img.ndim == 2:
        fx, fy = fx[:, 0], fy[:, 0]
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy


class Painter:
    def __init__(self, gl, w, h, rng=None):
        self.gl, self.w, self.h = gl, w, h
        self.rng = rng or np.random.default_rng(7)
        self.canvas = gl.tex(w, h, 4, 'f4')
        self.fbo = gl.fbo(self.canvas)
        self.prog = gl.program('stroke.frag', vert='stroke.vert')

    # ------------------------------------------------------------------ canvas
    def clear(self, rgb):
        self.fbo.clear(rgb[0], rgb[1], rgb[2], 1.0)

    def set_canvas(self, img):
        a = np.concatenate([img[..., :3], np.ones(img.shape[:2] + (1,), np.float32)], axis=2)
        self.canvas.write(np.ascontiguousarray(a, dtype=np.float32).tobytes())

    def read(self):
        return self.gl.read(self.canvas, 3)

    # ------------------------------------------------------------------ strokes
    def trace(self, ref_blur, canvas, flow, starts, r, max_len, min_len, curl=0.0, jitter_col=0.02,
              stop_on_error=True, both_ways=True):
        """Grow strokes along the flow field. Returns list of (points, color) as padded arrays."""
        n = len(starts)
        rng = self.rng
        col = _sample(ref_blur, starts)
        col = col * (1 + rng.normal(0, jitter_col, (n, 1))) + rng.normal(0, jitter_col * 0.45, (n, 3))
        pts = np.zeros((n, max_len + 1, 2), np.float32)
        pts[:, 0] = starts
        alive = np.ones(n, bool)
        lens = np.ones(n, np.int32)
        sign = np.where(rng.random(n) < 0.5, -1.0, 1.0) if both_ways else np.ones(n)
        prev = None
        wob = rng.normal(0, curl, n)
        p = starts.astype(np.float64).copy()
        for k in range(1, max_len + 1):
            th = _sample(flow, p) + wob
            v = np.stack([np.cos(th), np.sin(th)], 1) * sign[:, None]
            if prev is not None:
                flip = (v * prev).sum(1) < 0
                v[flip] *= -1
            prev = v
            q = p + v * r
            inside = (q[:, 0] >= 0) & (q[:, 0] < self.w) & (q[:, 1] >= 0) & (q[:, 1] < self.h)
            if stop_on_error and k > min_len:
                rb = _sample(ref_blur, q)
                cv = _sample(canvas, q)
                diff_stroke = np.linalg.norm(rb - col, axis=1)
                diff_canvas = np.linalg.norm(rb - cv, axis=1)
                ok = diff_stroke <= diff_canvas + 0.004
            else:
                ok = np.ones(n, bool)
            alive &= inside & ok
            p = np.where(alive[:, None], q, p)
            pts[:, k] = p
            lens += alive
        return pts, lens, np.clip(col, 0, 1.5)

    def strokes_geometry(self, pts, lens, cols, r, opacity=0.95, dry=0.35, edge=0.05, ext=0.55):
        """Build triangle geometry for a batch of strokes (padded point arrays)."""
        rng = self.rng
        n, m, _ = pts.shape
        keep = lens >= 1
        pts, lens, cols = pts[keep], lens[keep], cols[keep]
        n = len(pts)
        if n == 0:
            return np.zeros((0, FLOATS_PER_VERT), np.float32)
        # single-point strokes become dabs: give them a short body along the flow
        idx = np.arange(m)[None, :]
        valid = idx < lens[:, None]
        # tangents
        d = np.zeros_like(pts)
        d[:, 1:] = pts[:, 1:] - pts[:, :-1]
        d[:, 0] = d[:, 1]
        last = np.clip(lens - 1, 0, m - 1)
        nrm = np.linalg.norm(d, axis=2, keepdims=True)
        dn = d / np.maximum(nrm, 1e-6)
        # strokes of length 1 have zero tangent: use a random short direction
        bad = (nrm[..., 0] < 1e-6)
        if bad.any():
            ang = rng.random((n, 1)) * 0 + 0.0
            fallback = np.concatenate([np.cos(ang), np.sin(ang)], 1)[:, None, :]
            dn = np.where(bad[..., None], fallback, dn)
        # smooth tangents a little so the ribbon does not kink
        dn[:, 1:-1] = dn[:, 1:-1] + 0.5 * (dn[:, :-2] + dn[:, 2:])
        dn /= np.maximum(np.linalg.norm(dn, axis=2, keepdims=True), 1e-6)
        # extend start and end points along the tangent (caps)
        start = pts[:, 0] - dn[:, 0] * r * ext
        endt = dn[np.arange(n), last]
        end = pts[np.arange(n), last] + endt * r * ext
        P = pts.copy()
        P[:, 0] = start
        # cumulative distance in radii
        seg = np.linalg.norm(np.diff(pts, axis=1), axis=2) / r
        cum = np.concatenate([np.zeros((n, 1)), np.cumsum(seg, 1)], 1)
        U = cum.copy()
        U[:, 0] = -ext
        L = cum[np.arange(n), last]
        # append end cap point
        P = np.concatenate([P, np.zeros((n, 1, 2), np.float32)], 1)
        U = np.concatenate([U, np.zeros((n, 1))], 1)
        dn = np.concatenate([dn, np.zeros((n, 1, 2))], 1)
        P[np.arange(n), last + 1] = end
        U[np.arange(n), last + 1] = L + ext
        dn[np.arange(n), last + 1] = endt
        valid = np.arange(m + 1)[None, :] <= (last + 1)[:, None]
        # width varies a touch along the stroke (pressure)
        press = 1.0 + 0.08 * np.sin(U * 0.7 + rng.random((n, 1)) * 6.28)
        nx = np.stack([-dn[..., 1], dn[..., 0]], 2) * (r * press)[..., None]
        left, right = P + nx, P - nx
        segv = valid[:, 1:] & valid[:, :-1]
        si, sj = np.nonzero(segv)
        a0, a1 = left[si, sj], left[si, sj + 1]
        b0, b1 = right[si, sj], right[si, sj + 1]
        u0, u1 = U[si, sj], U[si, sj + 1]
        seed = rng.random(n).astype(np.float32)[si]
        Ls = L[si]
        cc = cols[si]
        op = (opacity * (0.92 + 0.08 * rng.random(n)))[si]
        verts = []
        for (pp, uu, vv) in ((a0, u0, 1), (b0, u0, -1), (a1, u1, 1), (b0, u0, -1), (b1, u1, -1), (a1, u1, 1)):
            arr = np.empty((len(si), FLOATS_PER_VERT), np.float32)
            arr[:, 0:2] = pp
            arr[:, 2] = uu
            arr[:, 3] = vv
            arr[:, 4:7] = cc
            arr[:, 7] = seed
            arr[:, 8] = r
            arr[:, 9] = Ls
            arr[:, 10] = op
            arr[:, 11] = dry
            arr[:, 12] = edge
            verts.append(arr)
        out = np.stack(verts, 1).reshape(-1, FLOATS_PER_VERT)
        return out

    def draw(self, verts, paper_scale=0.35):
        if len(verts) == 0:
            return
        ctx = self.gl.ctx
        chunk = 6 * 400000
        for i in range(0, len(verts), chunk):
            part = np.ascontiguousarray(verts[i:i + chunk])
            vbo = ctx.buffer(part.tobytes())
            vao = ctx.vertex_array(self.prog, [(vbo, STROKE_FMT, *STROKE_ATTRS)])
            self.fbo.use()
            self.gl.bind(self.prog, {'u_res': (self.w, self.h), 'u_paperScale': paper_scale})
            self.gl._blend('premul')
            vao.render(moderngl.TRIANGLES)
            ctx.disable(moderngl.BLEND)
            vao.release()
            vbo.release()

    # ------------------------------------------------------------------ layers
    def layer(self, ref, flow, r, threshold, max_len=10, min_len=2, grid=None, mask=None, opacity=0.95,
              dry=0.3, edge=0.05, curl=0.04, jitter_col=0.018, blur=0.5, cover_all=False, stop_on_error=True):
        """One coarse-to-fine pass at brush radius r (plate px)."""
        canvas = self.read()
        ref_blur = ndimage.gaussian_filter(ref, sigma=(r * blur, r * blur, 0)) if r * blur > 0.3 else ref
        err = np.linalg.norm(canvas - ref_blur, axis=2)
        if mask is not None:
            err = err * mask
        g = max(1, int(round(grid or r)))
        H, W = (self.h // g) * g, (self.w // g) * g
        blocks = err[:H, :W].reshape(self.h // g, g, self.w // g, g).transpose(0, 2, 1, 3).reshape(self.h // g, self.w // g, g * g)
        mean = blocks.mean(2)
        am = blocks.argmax(2)
        cy, cx = np.nonzero((mean > threshold) | cover_all)
        if mask is not None and cover_all:
            mblocks = mask[:H, :W].reshape(self.h // g, g, self.w // g, g).mean((1, 3))
            sel = mblocks[cy, cx] > 0.05
            cy, cx = cy[sel], cx[sel]
        if len(cy) == 0:
            return 0
        off = am[cy, cx]
        sy = cy * g + off // g + self.rng.uniform(-0.55, 0.55, len(cy)) * g
        sx = cx * g + off % g + self.rng.uniform(-0.55, 0.55, len(cy)) * g
        starts = np.stack([sx, sy], 1)
        order = self.rng.permutation(len(starts))
        starts = starts[order]
        pts, lens, cols = self.trace(ref_blur, canvas, flow, starts, r, max_len, min_len, curl, jitter_col,
                                     stop_on_error=stop_on_error)
        verts = self.strokes_geometry(pts, lens, cols, r, opacity=opacity, dry=dry, edge=edge)
        self.draw(verts)
        return len(starts)
