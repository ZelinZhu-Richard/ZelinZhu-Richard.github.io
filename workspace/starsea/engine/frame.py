"""Frame assembly: plates, star layer, cel reflections, world pass, cels, effects, glow, photography."""
import math
import os
from dataclasses import dataclass, field

import moderngl
import numpy as np

from .camera import Camera
from .cel import CelRenderer
from .gl import GL
from .materials import MATERIALS
from .plates import CACHE, catalogue, paint_sky
from .platform import SIGN_MAT, Platform, sign_decal
from .stars import StarPainter, project, star_style
from .track import TRACK
from .train import Train
from .steam import CLOUD_COLORS, SkyClouds, SteamPainter
from .fx import FishPainter, RibbonPainter, kira_geometry, kira_scale, ribbon

W, H = 1920, 1040
PLATE_VERSION = 5


class Plate:
    def __init__(self, gl, cam, img):
        self.cam = cam
        self.h, self.w = img.shape[:2]
        self.tex = gl.tex_from_array(img.astype(np.float32), dtype='f2')
        # mip levels: the sea samples a softened level so painted stars smear into dashes, not dotted rows
        self.tex.build_mipmaps()
        self.tex.filter = (moderngl.LINEAR_MIPMAP_LINEAR, moderngl.LINEAR)

    def uniforms(self):
        c = self.cam
        return {'u_pRot': c.rot().T.astype('f4').copy(), 'u_pTanH': c.tanh, 'u_pAspect': c.aspect,
                'u_pShift': tuple(c.shift), 'u_pRes': (self.w, self.h)}


def plate_for(gl, cam, name, scale=1.25, margin=1.0, seed=3, force=False):
    """Paint (or load) the sky plate for a camera. margin enlarges the field of view to allow moves."""
    pc = cam.copy(vfov=2 * math.degrees(math.atan(math.tan(math.radians(cam.vfov) / 2) * margin)))
    w, h = int(W * scale * margin) // 4 * 4, int(H * scale * margin) // 4 * 4
    path = os.path.join(CACHE, f'plate_{name}.npy')
    if os.path.exists(path) and not force:
        img = np.load(path).astype(np.float32)
    else:
        img, _, _ = paint_sky(gl, pc, w, h, seed=seed, scale=scale)
        np.save(path, img.astype(np.float16))
    return Plate(gl, pc, img)


@dataclass
class State:
    cam: Camera
    plate: Plate
    t: float
    frame: int
    train_s: float = None          # track distance of the loco front (drawn pose)
    train_v: float = 0.0
    coaches: int = 4
    platform: bool = True
    lights: list = field(default_factory=list)      # (pos, intensity, rgb)
    cel_lights: list = field(default_factory=list)  # (pos, radius, rgb) warm pools on cels
    rings: list = field(default_factory=list)       # (x, z, t0, strength)
    mist: float = 0.5
    mist_col: tuple = (0.36, 0.48, 0.64)
    rail_vis: float = 0.6
    reveal_s: float = -1e9
    star_boost: float = 1.0
    plate_gain: float = 1.0
    fade: float = 1.0
    line_base: float = 1.1
    ref_dist: float = 20.0
    lamp_on: float = 1.0          # platform lamp
    head_on: float = 1.0          # train headlamps (emissive boost)
    fx_back: list = field(default_factory=list)   # callables(renderer, state, fbo)
    fx_front: list = field(default_factory=list)
    glow_dots: list = field(default_factory=list) # (pos, radius px, intensity, rgb) extra emitters
    key_dir: tuple = (-0.35, 0.8, 0.48)
    rim_dir: tuple = (0.45, 0.55, -0.7)
    detail: bool = True
    steam: object = None
    meteors: list = field(default_factory=list)
    fishes: list = field(default_factory=list)
    kiras: list = field(default_factory=list)      # (world pos, t0, L px, rgb, variant, diag)
    ribbons: list = field(default_factory=list)    # (world pts (N,3), half-width px array, rgba array)
    world_blur: int = 1
    phi: float = None
    blur_wheels: bool = False
    cel_blur: int = 1
    sky_clouds: bool = False
    sky_rails: bool = False
    rail_glow: float = 1.0
    sky_rail_vis: float = 0.0
    beams: float = 0.0
    rail_anchor: float = 0.0
    cam_prev: object = None                        # camera half a frame earlier, for world motion blur


class Renderer:
    def __init__(self, gl=None):
        self.gl = gl or GL()
        gl = self.gl
        self.cel = CelRenderer(gl, W, H)
        self.train = Train(gl)
        self.platform = Platform(gl)
        self.stars = StarPainter(gl)
        self.cat = catalogue()
        self.bright = self.cat.bright_ids(360)
        # targets
        self.t_refl = gl.tex(W, H, 4, 'f2'); self.f_refl = gl.fbo(self.t_refl)
        self.t_reflH = gl.tex(W, H, 1, 'f2', linear=False); self.f_reflH = gl.fbo(self.t_reflH)
        self.t_stars = gl.tex(W, H, 4, 'f2'); self.f_stars = gl.fbo(self.t_stars)
        self.t_world = gl.tex(W, H, 4, 'f2'); self.t_aux = gl.tex(W, H, 4, 'f4', linear=False)
        self.f_world = gl.fbo(self.t_world, self.t_aux)
        self.f_world0 = gl.fbo(self.t_world)
        self.t_cel = gl.tex(W, H, 4, 'f2'); self.f_cel = gl.fbo(self.t_cel)
        self.t_fxb = gl.tex(W, H, 4, 'f2'); self.f_fxb = gl.fbo(self.t_fxb)
        self.t_fxf = gl.tex(W, H, 4, 'f2'); self.f_fxf = gl.fbo(self.t_fxf)
        self.t_glow = gl.tex(W, H, 4, 'f2'); self.f_glow = gl.fbo(self.t_glow)
        self.t_sglow = gl.tex(W, H, 4, 'f2'); self.f_sglow = gl.fbo(self.t_sglow)   # sky light: behind the cels
        self.t_sga = gl.tex(W // 2, H // 2, 4, 'f2'); self.f_sga = gl.fbo(self.t_sga)
        self.t_sgb = gl.tex(W // 2, H // 2, 4, 'f2'); self.f_sgb = gl.fbo(self.t_sgb)
        self.t_comp = gl.tex(W, H, 4, 'f2'); self.f_comp = gl.fbo(self.t_comp)
        self.t_out = gl.tex(W, H, 4, 'f2'); self.f_out = gl.fbo(self.t_out)
        self.pyr = []
        for k, sig in ((2, 1.0), (4, 2.0), (8, 3.0), (16, 4.0)):
            a = gl.tex(W // k, H // k, 4, 'f2'); b = gl.tex(W // k, H // k, 4, 'f2')
            self.pyr.append((a, gl.fbo(a), b, gl.fbo(b), sig))
        self.t_d1 = gl.tex(W // 4, H // 4, 4, 'f2'); self.f_d1 = gl.fbo(self.t_d1)
        self.t_d2 = gl.tex(W // 4, H // 4, 4, 'f2'); self.f_d2 = gl.fbo(self.t_d2)
        self.p_world = gl.program('world.frag')
        self.p_comp = gl.program('comp.frag')
        self.p_final = gl.program('final.frag')
        self.p_blur = gl.program('blur.frag')
        self.p_thr = gl.program('thresh.frag')
        self.p_scale = gl.program("""#version 410
in vec2 v_uv; uniform sampler2D t_src; uniform float u_k; out vec4 o; void main(){ o = texture(t_src, v_uv)*u_k; }""")
        self.p_copy = gl.program("""#version 410
in vec2 v_uv; uniform sampler2D t_src; out vec4 o; void main(){ o = texture(t_src, v_uv); }""")
        # height above the water of the mirrored cel surface (the mirror G-buffer holds y < 0)
        self.p_height = gl.program("""#version 410
in vec2 v_uv; uniform sampler2D t_src; out vec4 o;
void main(){ vec4 p = texture(t_src, v_uv); o = vec4(p.w > 0.0 ? max(-p.y, 0.0) : -1.0, 0.0, 0.0, 1.0); }""")
        self.seg_cache = None
        self.steam = SteamPainter(gl)
        self.rib = RibbonPainter(gl)
        self.clouds = SkyClouds()
        self.fishp = FishPainter(gl)
        self.t_wacc = gl.tex(W, H, 4, 'f4'); self.f_wacc = gl.fbo(self.t_wacc)

    # ------------------------------------------------------------------ helpers
    def track_segments(self, cam):
        """Rail centreline as a short polyline: one straight run, then the climb."""
        from .track import CLIMB_START
        pts = [TRACK.at(-4200.0)[0], TRACK.at(CLIMB_START - 40)[0]]
        ss = [-4200.0, CLIMB_START - 40]
        for s in np.arange(CLIMB_START - 20, 6000, 26.0):
            if len(pts) >= 95:
                break
            pts.append(TRACK.at(s)[0]); ss.append(s)
        seg = np.zeros((96, 4), 'f4')
        seg[:len(pts), :3] = pts
        seg[:len(pts), 3] = ss
        return seg, len(pts)

    def train_items(self, st):
        items = []
        if st.train_s is not None:
            items += self.train.items(st.train_s, coaches=st.coaches, detail=st.detail, phi=st.phi, blur=st.blur_wheels)
        return items

    def draw_stars(self, st):
        gl = self.gl
        self.f_stars.use(); self.f_stars.clear(0, 0, 0, 0)
        ids = self.bright
        pix, front = project(st.cam, self.cat.dir[ids], W, H)
        ok = front & (self.cat.dir[ids, 1] > 0.004) & (pix[:, 0] > -30) & (pix[:, 0] < W + 30) & (pix[:, 1] > -30) & (pix[:, 1] < H + 30)
        idx = ids[ok]
        c = pix[ok]
        mag = self.cat.mag[idx] / max(self.cat.mag[ids].max(), 1e-6) * 0.012
        r, a, kind = star_style(mag, 1.0)
        r = r * 1.15 + 0.25
        kind = np.where(np.arange(len(idx)) % 1 == 0, kind, kind)
        rank = np.argsort(np.argsort(self.cat.mag[idx]))
        # only a handful of hero stars carry a glint; a few more a soft halo; the rest are painted dots
        kind = np.where(rank < 3, 2, np.where(rank < 12, 1, 0)).astype(float)
        # twinkle: brightest few percent, stepped holds of 3-5 frames
        seed = self.cat.seed[idx]
        hold = 3 + (seed * 3).astype(int)
        step = (st.frame // hold).astype(float)
        tw = np.array([1.0, 0.8, 0.6, 0.9, 0.7])[(np.floor(seed * 97 + step * 7.31) % 5).astype(int)]
        twinkles = (seed < 0.25) & (rank < 60)
        amp = np.where(twinkles, tw, 1.0) * st.star_boost
        el = np.degrees(np.arcsin(self.cat.dir[idx, 1]))
        amp *= np.clip(el / 4.0, 0, 1)
        a = np.clip(a * amp, 0, 1)
        col = self.cat.col[idx]
        self.stars.draw(self.f_stars, W, H, c, r, a, kind, seed, col, 1.0)
        self.stars.draw(self.f_sglow, W, H, c, r, a * 0.7 * st.star_boost, kind, seed, col, 1.0, glow=True)
        # reflections: mirrored directions, drawn as short horizontal dashes
        md = self.cat.dir[idx] * np.array([1, -1, 1])
        mpix, mfront = project(st.cam, md, W, H)
        mok = mfront & (mpix[:, 1] > -10) & (mpix[:, 1] < H + 10)
        self.stars.draw(self.f_stars, W, H, mpix[mok], r[mok] * 0.85, a[mok] * 0.5, np.zeros(mok.sum()), seed[mok], col[mok],
                        1.0, stretch=(4.6, 0.42))

    def draw_glow_dots(self, st):
        if not st.glow_dots:
            return
        pts = np.array([g[0] for g in st.glow_dots])
        pix, front = self._proj_points(st.cam, pts)
        rad = np.array([g[1] for g in st.glow_dots], float)
        inten = np.array([g[2] for g in st.glow_dots], float)
        col = np.array([g[3] for g in st.glow_dots], float)
        ok = front
        if not ok.any():
            return
        kind = np.full(ok.sum(), 1.0)
        seed = np.linspace(0.1, 0.9, ok.sum())
        self.stars.draw(self.f_glow, W, H, pix[ok], rad[ok], inten[ok], kind, seed, col[ok], 1.0, glow=True)
        self.stars.draw(self.f_stars, W, H, pix[ok], rad[ok] * 0.6, np.clip(inten[ok], 0, 1), np.zeros(ok.sum()), seed, col[ok], 1.0)

    def draw_sky_rails(self, st, fbo, glow_fbo, mirror=False):
        """The climbing line as two luminous rails and a faint ladder of sleepers, drawn as ribbons."""
        from .track import CLIMB_START, TRACK
        cam = st.cam
        focal = H / (2 * cam.tanh)
        ss = CLIMB_START + 20 + np.cumsum(np.r_[0, np.geomspace(1.0, 60.0, 260)])
        ss = ss[ss < 5900]
        pos, tan, up, side = TRACK.at(ss)
        m = np.array([1, -1, 1]) if mirror else np.ones(3)
        lift = np.clip((pos[:, 1] - 1.5) / 10.0, 0, 1)
        for sg in (1, -1):
            pts = (pos + side * sg * 0.7175) * m
            px, depth = cam.project(pts, W, H)
            ok = depth > 0.8
            if ok.sum() < 2:
                continue
            idx = np.nonzero(ok)[0]
            px, depth, lf, sv = px[idx], depth[idx], lift[idx], ss[idx]
            wpx = np.maximum(0.06 * focal / depth, 0.75)
            near = np.clip(1 - (sv - (st.train_s or 0)) / 900.0, 0.3, 1)
            colc = np.stack([np.full(len(sv), 1.0), 0.86 + 0.1 * (1 - near), 0.62 + 0.36 * (1 - near)], 1)
            ts = st.train_s if st.train_s is not None else st.rail_anchor
            rel = sv - ts
            taper = np.where(rel < 0, np.exp(rel / 700.0), 0.45 + 0.55 * np.exp(-rel / 1800.0))
            # a hand-drawn line of light: pressure varies, it breaks here and there, it fades from the engine
            ph = sg * 1.7
            press = 0.7 + 0.45 * np.sin(sv * 0.031 + ph) * np.sin(sv * 0.0123 + 2.0 * ph)
            brk = np.clip(1.6 * np.sin(sv * 0.047 + ph * 3.0) + 1.4, 0, 1) * np.clip(1.5 * np.sin(sv * 0.019 + ph) + 1.3, 0, 1)
            a = lf * st.rail_glow * taper * (0.4 + 0.6 * brk) * (0.55 if mirror else 1.0)
            wpx = wpx * press * (0.75 + 0.5 * np.exp(-np.abs(rel) / 120.0))
            cols = np.c_[colc, np.clip(a, 0, 1)]
            self.rib.draw(fbo, ribbon(px, wpx, cols, soft=0.55), W, H)
            if glow_fbo is not None:
                gc = cols.copy(); gc[:, 3] *= 0.35
                self.rib.draw(glow_fbo, ribbon(px, wpx * 3 + 1.5, gc, soft=1.0), W, H, blend='add')
        if not mirror and glow_fbo is not None:
            # star dust shed along the line behind the engine, redrawn on 3s
            ts = st.train_s if st.train_s is not None else st.rail_anchor
            rng = np.random.default_rng(int(st.frame // 3) * 7 + 3)
            sd = ts - rng.uniform(5, 500, 70) ** 1.0
            sd = sd[sd > CLIMB_START + 30]
            if len(sd):
                pp, tt, uu, sdv = TRACK.at(sd)
                pts = pp + sdv * rng.normal(0, 1.4, (len(sd), 1)) + uu * rng.normal(0.6, 1.2, (len(sd), 1))
                pxd, dd = cam.project(pts, W, H)
                ok = dd > 1
                age = (ts - sd)[ok]
                al = np.clip(np.exp(-age / 260.0) * rng.uniform(0.4, 1.0, ok.sum()), 0, 1) * np.clip((pts[ok, 1] - 2) / 10, 0, 1)
                rad = np.clip(0.06 * focal / dd[ok], 0.6, 2.2) * rng.uniform(0.6, 1.3, ok.sum())
                colr = np.tile([1.0, 0.94, 0.8], (ok.sum(), 1))
                self.stars.draw(fbo, W, H, pxd[ok], rad, al, np.zeros(ok.sum()), rng.random(ok.sum()), colr, 1.0)
                self.stars.draw(glow_fbo, W, H, pxd[ok], rad, al * 0.6, np.ones(ok.sum()), rng.random(ok.sum()), colr, 1.0, glow=True)
        # sleepers: short rungs, only reasonably near the camera
        if not mirror:
            sr = np.arange(CLIMB_START + 30, 5900, 3.0)
            p2, t2, u2, sd2 = TRACK.at(sr)
            a_ = (p2 + sd2 * 0.9); b_ = (p2 - sd2 * 0.9)
            pa, da = cam.project(a_, W, H); pb, db = cam.project(b_, W, H)
            keep = (da > 1) & (db > 1) & (da < 600)
            verts = []
            for i in np.nonzero(keep)[0]:
                lf = np.clip((p2[i, 1] - 1.5) / 10.0, 0, 1) * st.rail_glow * 0.35
                if lf <= 0.01:
                    continue
                w = max(0.05 * focal / da[i], 0.5)
                c = np.array([[0.95, 0.9, 0.8, lf], [0.95, 0.9, 0.8, lf]])
                verts.append(ribbon(np.array([pa[i], pb[i]]), np.array([w, w]), c, soft=0.5))
            if verts:
                self.rib.draw(fbo, np.concatenate(verts), W, H)

    def draw_beams(self, st):
        """Headlamp cones where the mist catches them: soft additive light, painted in a few steps."""
        from .track import TRACK
        lamps = Train.lamp_positions(st.train_s)
        _, tan, _, side = TRACK.at(st.train_s)
        focal = H / (2 * st.cam.tanh)
        for lp in lamps:
            ds = np.linspace(0.3, 70.0, 28)
            pts = lp[None] + tan[None] * ds[:, None] - np.array([0, 0.012, 0]) * ds[:, None]
            px, depth = st.cam.project(pts, W, H)
            ok = depth > 0.5
            if ok.sum() < 2:
                continue
            half = 0.2 + ds * math.tan(math.radians(6.0))
            wpx = half * focal / np.maximum(depth, 0.5)
            a = 0.09 * st.beams * np.exp(-ds / 30.0) * np.clip(ds / 2.0, 0, 1)
            a = np.round(a / 0.025) * 0.025          # a few visible steps, like painted light
            cols = np.c_[np.tile([1.0, 0.72, 0.38], (len(ds), 1)), a]
            self.rib.draw(self.f_glow, ribbon(px[ok], wpx[ok], cols[ok], soft=0.8), W, H, blend='add')
            self.rib.draw(self.f_fxb, ribbon(px[ok], wpx[ok] * 0.8, cols[ok] * np.array([1, 1, 1, 0.6]), soft=0.9), W, H)

    @staticmethod
    def _proj_points(cam, pts):
        px, depth = cam.project(pts, W, H)
        return px, depth > 0.1

    # ------------------------------------------------------------------ main
    def render(self, st):
        gl, cel = self.gl, self.cel
        self.f_glow.use(); self.f_glow.clear(0, 0, 0, 0)
        self.f_sglow.use(); self.f_sglow.clear(0, 0, 0, 0)
        self.draw_stars(st)
        self.draw_glow_dots(st)
        items = self.train_items(st)
        plat_items = self.platform.items() if st.platform else []
        mats = dict(MATERIALS)
        from .materials import M
        mats[SIGN_MAT] = M('#e8e4d6', '#8a8aa6', '#5a5a78', '#ffffff', '#1c2236', warm=0.95)
        lamp_mat = dict(mats)
        decal = None
        if st.platform:
            o, u, v = sign_decal()
            decal = (self.platform.sign, o, u, v, SIGN_MAT)
        common = dict(lights=st.cel_lights, line_base=st.line_base, ref_dist=st.ref_dist, key_dir=st.key_dir,
                      rim_dir=st.rim_dir, materials=lamp_mat, decal=decal)
        # reflections (mirrored geometry, same camera)
        self.f_refl.use(); self.f_refl.clear(0, 0, 0, 0)
        self.f_reflH.use(); self.f_reflH.clear(-1, 0, 0, 0)
        if items or plat_items:
            col, _ = cel.render(items + plat_items, st.cam, mirror=True, line_alpha=0.42, emis_boost=st.head_on, **common)
            gl.run(self.p_copy, self.f_refl, {}, {'t_src': col})
            gl.run(self.p_height, self.f_reflH, {}, {'t_src': cel.t_p})
        if st.steam is not None:
            rows = st.steam.puffs(st.t, st.cam, W, H, mirror=True)
            self.steam.draw(self.f_refl, rows, W, H, depth_tex=cel.t_p if (items or plat_items) else None, mirror=True,
                            gain=0.85, line_min_r=st.steam.line_min_r)
        if st.sky_clouds:
            self.steam.draw(self.f_refl, self.clouds.rows(st.t, st.cam, W, H, mirror=True), W, H, mirror=True,
                            colors=CLOUD_COLORS, line_w=1.0, hi=0.6, line_on=0.0)
        if st.sky_rails:
            self.draw_sky_rails(st, self.f_refl, None, mirror=True)
        for m in st.meteors:
            core, _ = m.geometry(st.t, st.cam, W, H, mirror=True)
            if core is not None:
                self.rib.draw(self.f_refl, core, W, H)
        if st.fishes:
            self.fishp.draw(self.f_refl, st.fishes, st.t, st.cam, W, H, mirror=True)
        # world
        seg, nseg = self.track_segments(st.cam)
        lights = np.zeros((4, 4), 'f4'); lcol = np.zeros((4, 3), 'f4')
        for i, (p, inten, rgb) in enumerate(st.lights[:4]):
            lights[i, :3], lights[i, 3], lcol[i] = p, inten, rgb
        rings = np.zeros((8, 4), 'f4')
        for i, r in enumerate(st.rings[:8]):
            rings[i] = r
        u = {**st.cam.uniforms(), **st.plate.uniforms(), 'u_res': (W, H), 'u_time': st.t,
             'u_t3': math.floor(st.frame / 3) * 3 / 24.0, 'u_plateGain': st.plate_gain,
             'u_reflOn': 1.0, 'u_trainS': st.train_s if st.train_s is not None else -1e9,
             'u_trainV': st.train_v, 'u_trainLen': 96.0, 'u_onWater': 1.0 if st.train_s is not None else 0.0,
             'u_seg': seg, 'u_nseg': nseg, 'u_railVis': st.rail_vis, 'u_revealS': st.reveal_s,
             'u_light': lights, 'u_lightCol': lcol, 'u_ring': rings, 'u_mist': st.mist, 'u_mistCol': st.mist_col,
             'u_horizonGlow': 1.0, 'u_skyRailVis': st.sky_rail_vis}
        texs = {'t_plate': st.plate.tex, 't_refl': self.t_refl, 't_stars': self.t_stars, 't_reflH': self.t_reflH}
        if st.world_blur > 1 and st.cam_prev is not None:
            self.f_wacc.use(); self.f_wacc.clear(0, 0, 0, 0)
            n = st.world_blur
            for i in range(n):
                f = (i + 0.5) / n
                c = st.cam_prev.copy(pos=st.cam_prev.pos * (1 - f) + st.cam.pos * f)
                u2 = dict(u); u2.update(c.uniforms())
                gl.run(self.p_world, self.f_world, u2, texs)
                gl.run(self.p_copy, self.f_wacc, {}, {'t_src': self.t_world}, blend='add')
            gl.run(self.p_scale, self.f_world0, {'u_k': 1.0 / n}, {'t_src': self.t_wacc})
        else:
            gl.run(self.p_world, self.f_world, u, texs)
        # cels
        self.f_cel.use(); self.f_cel.clear(0, 0, 0, 0)
        if (items or plat_items) and st.cel_blur > 1 and st.train_s is not None:
            n = st.cel_blur
            ds = st.train_v / 24.0 * 0.5
            self.f_wacc.use(); self.f_wacc.clear(0, 0, 0, 0)
            for i in range(n):
                off = ds * (i / (n - 1) - 0.5)
                its = self.train.items(st.train_s + off, coaches=st.coaches, detail=st.detail, phi=st.phi,
                                       blur=st.blur_wheels)
                col, glow = cel.render(its + plat_items, st.cam, mirror=False, emis_boost=st.head_on, **common)
                gl.run(self.p_scale, self.f_wacc, {'u_k': 1.0 / n}, {'t_src': col}, blend='add')
                gl.run(self.p_scale, self.f_glow, {'u_k': 1.0 / n}, {'t_src': glow}, blend='add')
            gl.run(self.p_copy, self.f_cel, {}, {'t_src': self.t_wacc})
        elif items or plat_items:
            col, glow = cel.render(items + plat_items, st.cam, mirror=False, emis_boost=st.head_on, **common)
            gl.run(self.p_copy, self.f_cel, {}, {'t_src': col})
            gl.run(self.p_copy, self.f_glow, {}, {'t_src': glow}, blend='add')
        # effects
        self.f_fxb.use(); self.f_fxb.clear(0, 0, 0, 0)
        self.f_fxf.use(); self.f_fxf.clear(0, 0, 0, 0)
        if st.steam is not None:
            rows = st.steam.puffs(st.t, st.cam, W, H)
            self.steam.draw(self.f_fxf, rows, W, H, depth_tex=cel.t_p if (items or plat_items) else None,
                            line_min_r=st.steam.line_min_r)
        if st.sky_clouds:
            self.steam.draw(self.f_fxb, self.clouds.rows(st.t, st.cam, W, H), W, H, colors=CLOUD_COLORS, line_w=1.2,
                            hi=0.6, line_on=0.0)
        if st.sky_rails:
            self.draw_sky_rails(st, self.f_fxb, self.f_sglow)
        if st.beams > 0 and st.train_s is not None:
            self.draw_beams(st)
        for m in st.meteors:
            core, glow = m.geometry(st.t, st.cam, W, H)
            if core is not None:
                self.rib.draw(self.f_fxb, core, W, H)
                self.rib.draw(self.f_sglow, glow, W, H, blend='add')
        for (pts, wid, cols) in st.ribbons:
            px, depth = st.cam.project(np.asarray(pts), W, H)
            ok = depth > 0.5
            if ok.sum() >= 2:
                core = ribbon(px[ok], np.asarray(wid)[ok], np.asarray(cols)[ok], soft=1.0)
                self.rib.draw(self.f_fxb, core, W, H)
                gc = np.asarray(cols)[ok].copy(); gc[:, 3] *= 0.8
                self.rib.draw(self.f_sglow, ribbon(px[ok], np.asarray(wid)[ok] * 4, gc, soft=1.0), W, H, blend='add')
        if st.fishes:
            heads = self.fishp.draw(self.f_fxf, st.fishes, st.t, st.cam, W, H)
            for (hp, Lpx) in heads:
                self.stars.draw(self.f_glow, W, H, np.array([hp]), np.array([max(Lpx * 0.25, 1.5)]), np.array([0.9]),
                                np.array([1.0]), np.array([0.5]), np.array([[0.75, 1.0, 0.95]]), 1.0, glow=True)
        kiras = list(st.kiras)
        if st.steam is not None:
            kiras += st.steam.sparkles(st.t)
        for (wp, t0, L, rgb, variant, diag) in kiras:
            k = (st.t - t0) * 24.0
            sc = kira_scale(k, variant)
            if sc <= 0:
                continue
            px, depth = st.cam.project(np.asarray(wp)[None], W, H)
            if depth[0] < 0.3:
                continue
            if diag < 0:
                # a plain round glint of light (no four-point sprite)
                self.stars.draw(self.f_fxb, W, H, px[:1], np.array([L * sc * 0.18 + 0.6]), np.array([0.95]),
                                np.array([0.0]), np.array([0.3]), np.array([rgb]), 1.0)
                self.stars.draw(self.f_sglow, W, H, px[:1], np.array([L * sc * 0.2 + 0.8]), np.array([0.7]),
                                np.array([1.0]), np.array([0.3]), np.array([rgb]), 1.0, glow=True)
                continue
            geo = kira_geometry(px[0], L * sc, np.asarray(rgb), 0.9, rot=0.0, diag=diag)
            self.rib.draw(self.f_fxb, geo, W, H)
            self.rib.draw(self.f_sglow, kira_geometry(px[0], L * sc * 1.1, np.asarray(rgb), 0.5, diag=diag), W, H, blend='add')
            self.stars.draw(self.f_sglow, W, H, px[:1], np.array([L * sc * 0.1 + 0.8]), np.array([0.8]), np.array([1.0]),
                            np.array([0.3]), np.array([rgb]), 1.0, glow=True)
        for fx in st.fx_back:
            fx(self, st, self.f_fxb)
        for fx in st.fx_front:
            fx(self, st, self.f_fxf)
        # glow pyramid
        src = self.t_glow
        outs = []
        for (a, fa, b, fb, sig) in self.pyr:
            gl.run(self.p_copy, fa, {}, {'t_src': src})
            gl.run(self.p_blur, fb, {'u_dir': (1.0 / a.width, 0.0), 'u_sigma': sig}, {'t_src': a})
            gl.run(self.p_blur, fa, {'u_dir': (0.0, 1.0 / a.height), 'u_sigma': sig}, {'t_src': b})
            outs.append(a)
            src = a
        # sky glow (stars, glints, the line of light) is blurred lightly and sits behind cels and steam
        gl.run(self.p_copy, self.f_sga, {}, {'t_src': self.t_sglow})
        gl.run(self.p_blur, self.f_sgb, {'u_dir': (1.0 / self.t_sga.width, 0.0), 'u_sigma': 2.0}, {'t_src': self.t_sga})
        gl.run(self.p_blur, self.f_sga, {'u_dir': (0.0, 1.0 / self.t_sga.height), 'u_sigma': 2.0}, {'t_src': self.t_sgb})
        gl.run(self.p_comp, self.f_comp, {'u_gw': (0.6, 0.35, 0.22, 0.12), 'u_glowGain': 1.0, 'u_fade': st.fade,
                                          'u_para': 1.0},
               {'t_world': self.t_world, 't_fxBack': self.t_fxb, 't_cel': self.t_cel, 't_fxFront': self.t_fxf,
                't_g1': outs[0], 't_g2': outs[1], 't_g3': outs[2], 't_g4': outs[3], 't_sglow': self.t_sga})
        # diffusion source
        gl.run(self.p_thr, self.f_d1, {'u_thr': 0.35}, {'t_src': self.t_comp})
        gl.run(self.p_blur, self.f_d2, {'u_dir': (1.0 / self.t_d1.width, 0.0), 'u_sigma': 2.5}, {'t_src': self.t_d1})
        gl.run(self.p_blur, self.f_d1, {'u_dir': (0.0, 1.0 / self.t_d1.height), 'u_sigma': 2.5}, {'t_src': self.t_d2})
        gl.run(self.p_final, self.f_out, {'u_res': (W, H), 'u_frame': float(st.frame), 'u_diffuse': 0.12,
                                          'u_vignette': 0.13, 'u_grain': 0.35},
               {'t_src': self.t_comp, 't_diff': self.t_d1})
        return gl.read(self.t_out, 3)


def plate_cover(gl, cams, name, scale=1.2, margin=1.06, seed=3, force=False, ref_cam=None, max_px=5200, banks=None):
    """Paint one sky plate that covers every frame camera of a shot (and their sea reflections).
    The plate keeps the orientation of ref_cam (default: the middle camera) with zero roll."""
    ref = ref_cam or cams[len(cams) // 2]
    r, u, f = ref.basis()
    xs, ys = [], []
    ppu = 0.0
    for c in cams:
        cr, cu, cf = c.basis()
        t = c.tanh
        ppu = max(ppu, H / (2 * t))
        for gx in np.linspace(-1, 1, 7):
            for gy in np.linspace(-1, 1, 7):
                nx, ny = gx + c.shift[0], gy + c.shift[1]
                d = cf + nx * c.aspect * t * cr + ny * t * cu
                d = d / np.linalg.norm(d)
                for dd in ((d,) if d[1] >= 0 else (d * np.array([1, -1, 1]), d)):
                    z = dd @ f
                    if z <= 0.05:
                        continue
                    xs.append(dd @ r / z); ys.append(dd @ u / z)
    xs, ys = np.array(xs), np.array(ys)
    x0, x1 = xs.min(), xs.max()
    y0, y1 = ys.min(), ys.max()
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    hw, hh = (x1 - x0) / 2 * margin, (y1 - y0) / 2 * margin
    w = int(min(2 * hw * ppu * scale, max_px)) // 4 * 4
    h = int(min(2 * hh * ppu * scale, max_px)) // 4 * 4
    eff = min(w / (2 * hw * ppu), h / (2 * hh * ppu))
    pc = Camera(pos=ref.pos, yaw=ref.yaw, pitch=ref.pitch, roll=0.0, vfov=2 * math.degrees(math.atan(hh)),
                aspect=hw / hh, shift=(cx / hw, cy / hh))
    import hashlib
    bank_dirs = None
    if banks:
        mid = cams[len(cams) // 2].pos
        bank_dirs = []
        for (wp, R, sd, aspect, bright) in banks:
            v = np.asarray(wp, float) - mid
            dist = np.linalg.norm(v)
            if dist < 50:
                continue
            bank_dirs.append((v / dist, float(np.arctan(R / dist)), sd, aspect, bright))
    key = hashlib.md5(repr((PLATE_VERSION, bank_dirs and [(np.round(b[0], 3).tolist(), round(b[1], 4)) for b in bank_dirs],
                            np.round(pc.pos, 2).tolist(), round(pc.yaw, 3), round(pc.pitch, 3), round(pc.vfov, 3),
                            round(pc.aspect, 4), np.round(pc.shift, 4).tolist(), w, h, seed)).encode()).hexdigest()[:10]
    path = os.path.join(CACHE, f'plate_{name}_{key}.npy')
    if os.path.exists(path) and not force:
        img = np.load(path).astype(np.float32)
    else:
        img, _, masks = paint_sky(gl, pc, w, h, seed=seed, scale=eff, banks=bank_dirs)
        img = np.concatenate([img[..., :3], np.clip(masks[..., 2:3] * 1.5, 0, 1)], axis=2)
        np.save(path, img.astype(np.float16))
    return Plate(gl, pc, img)
