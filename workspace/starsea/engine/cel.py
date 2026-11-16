"""Cel renderer: G-buffer at 2x, ink seeds, cel colour + lines, downsample to frame size."""
import moderngl
import numpy as np

from .materials import MATERIALS, NMAT, material_uniforms

DOWN_FS = """
#version 410
in vec2 v_uv;
uniform sampler2D t_src;
uniform vec2 u_srcRes;
out vec4 o;
void main(){
  vec2 px = 1.0/u_srcRes;
  vec2 c = v_uv;
  vec4 s = vec4(0.0); float wsum = 0.0;
  for(int y=-1;y<=2;y++) for(int x=-1;x<=2;x++){
    vec2 off = vec2(float(x)-0.5, float(y)-0.5);
    float w = (1.5-abs(off.x))*(1.5-abs(off.y));
    s += texture(t_src, c + off*px)*w; wsum += w;
  }
  o = s/wsum;
}
"""


SHADOW_VS = """
#version 410
in vec3 in_pos;
in vec3 in_nrm;
in float in_mat;
uniform mat4 u_model;
uniform mat4 u_lvp;
void main(){ gl_Position = u_lvp*u_model*vec4(in_pos, 1.0); }
"""
SHADOW_FS = """
#version 410
out vec4 o;
void main(){ o = vec4(1.0); }
"""


def light_matrix(items, key_dir, pad=12.0):
    """Orthographic light view-projection fitted around the parts' origins."""
    pts = np.array([m[:3, 3] for _, m in items])
    c = (pts.min(0) + pts.max(0)) / 2
    r = np.linalg.norm(pts - c, axis=1).max() + pad
    L = np.asarray(key_dir, float); L /= np.linalg.norm(L)
    eye = c + L * r * 2
    f = -L
    right = np.cross(f, [0, 1, 0]) if abs(f[1]) < 0.99 else np.cross(f, [1, 0, 0])
    right /= np.linalg.norm(right)
    up = np.cross(right, f)
    V = np.eye(4)
    V[0, :3], V[1, :3], V[2, :3] = right, up, -f
    V[:3, 3] = -V[:3, :3] @ eye
    P = np.eye(4)
    P[0, 0] = P[1, 1] = 1 / r
    near, far = 0.1, r * 4
    P[2, 2] = -2 / (far - near)
    P[2, 3] = -(far + near) / (far - near)
    return P @ V


class Part:
    def __init__(self, gl, mesh, part_id, line_scale=1.0, name=''):
        data = mesh.interleaved()
        self.vbo = gl.ctx.buffer(data.tobytes())
        self.count = len(data)
        self.part_id = float(part_id)
        self.line_scale = line_scale
        self.name = name
        self.vao = None


class CelRenderer:
    def __init__(self, gl, w, h, ss=2):
        self.gl, self.w, self.h, self.ss = gl, w, h, ss
        W, H = w * ss, h * ss
        self.W, self.H = W, H
        ctx = gl.ctx
        self.t_n = gl.tex(W, H, 4, 'f2', linear=False)
        self.t_p = gl.tex(W, H, 4, 'f4', linear=False)
        self.t_id = gl.tex(W, H, 4, 'f2', linear=False)
        self.depth = ctx.depth_renderbuffer((W, H))
        self.gfbo = ctx.framebuffer([self.t_n, self.t_p, self.t_id], self.depth)
        self.t_edge = gl.tex(W, H, 4, 'f4', linear=False)
        self.efbo = gl.fbo(self.t_edge)
        self.t_col = gl.tex(W, H, 4, 'f2')
        self.t_glow = gl.tex(W, H, 4, 'f2')
        self.cfbo = gl.fbo(self.t_col, self.t_glow)
        self.out_col = gl.tex(w, h, 4, 'f2')
        self.out_glow = gl.tex(w, h, 4, 'f2')
        self.ofbo_c = gl.fbo(self.out_col)
        self.ofbo_g = gl.fbo(self.out_glow)
        self.gprog = gl.program('gbuf.frag', vert='gbuf.vert')
        self.eprog = gl.program('edges.frag')
        self.cprog = gl.program('cel.frag')
        self.dprog = gl.program(DOWN_FS)
        self.mat_uniforms = material_uniforms(MATERIALS)
        self.sprog = gl.program(SHADOW_FS, vert=SHADOW_VS)
        self.shadow = ctx.depth_texture((4096, 4096))
        self.shadow.compare_func = ''
        self.shadow.filter = (moderngl.NEAREST, moderngl.NEAREST)
        self.sfbo = ctx.framebuffer(depth_attachment=self.shadow)
        self._svaos = {}

    def _vao(self, part):
        if part.vao is None:
            part.vao = self.gl.ctx.vertex_array(self.gprog, [(part.vbo, '3f 3f 1f', 'in_pos', 'in_nrm', 'in_mat')])
        return part.vao

    def shadow_pass(self, items, key_dir, cam=None):
        ctx = self.gl.ctx
        fit = items
        if cam is not None:
            # fit the light frustum to what is near the lens, so close-ups get fine shadow detail
            d = np.array([np.linalg.norm(m[:3, 3] - cam.pos) for _, m in items])
            near = d.min()
            keep = d < max(near * 3.0, near + 25.0)
            if keep.sum() >= 2:
                fit = [it for it, k in zip(items, keep) if k]
        lvp = light_matrix(fit, key_dir)
        self.sfbo.use()
        self.sfbo.clear(depth=1.0)
        ctx.enable(moderngl.DEPTH_TEST)
        for part, model in items:
            if part.line_scale < 0.85 or part.name in ('drv', 'lead', 'trail', 'tw', 'cw'):
                continue   # thin and turning parts cast no shadow (anime keeps only the big readable ones)
            vao = self._svaos.get(id(part))
            if vao is None:
                vao = ctx.vertex_array(self.sprog, [(part.vbo, '3f 16x', 'in_pos')])
                self._svaos[id(part)] = vao
            self.gl.bind(self.sprog, {'u_model': np.asarray(model, 'f4').T.copy(), 'u_lvp': lvp.astype('f4').T.copy()})
            vao.render(moderngl.TRIANGLES)
        ctx.disable(moderngl.DEPTH_TEST)
        return lvp

    def render(self, items, cam, mirror=False, lights=(), line_base=1.1, ref_dist=20.0, line_alpha=1.0,
               key_dir=(-0.35, 0.8, 0.45), rim_dir=(0.55, 0.45, -0.7), rim_col=(0.78, 0.8, 1.0),
               crease_deg=38.0, emis_boost=1.0, materials=None, decal=None, shadows=True, rim_w=3.0):
        """items: list of (Part, 4x4 model matrix). Returns (colour tex, glow tex) at frame size."""
        gl, ctx = self.gl, self.gl.ctx
        lvp = self.shadow_pass(items, key_dir, cam) if (shadows and items) else np.eye(4)
        self.gfbo.use()
        self.gfbo.clear(0, 0, 0, -1.0, depth=1.0)
        # the colour attachments need distinct clear values: material=-1 marks empty
        ctx.enable(moderngl.DEPTH_TEST)
        ctx.disable(moderngl.CULL_FACE)
        vp = cam.viewproj(near=0.3, far=30000.0)
        for part, model in items:
            gl.bind(self.gprog, {'u_model': np.asarray(model, 'f4').T.copy(), 'u_vp': vp.astype('f4').T.copy(),
                                 'u_mirror': 1.0 if mirror else 0.0, 'u_part': part.part_id,
                                 'u_lineScale': part.line_scale, 'u_eye': tuple(cam.pos)})
            self._vao(part).render(moderngl.TRIANGLES)
        ctx.disable(moderngl.DEPTH_TEST)
        res = (self.W, self.H)
        mu = self.mat_uniforms if materials is None else material_uniforms(materials)
        gl.run(self.eprog, self.efbo, {'u_matLine': mu['u_matLine'], 'u_matPri': mu['u_matPri'], 'u_res': res, 'u_lineBase': line_base * self.ss,
                                       'u_refDist': ref_dist, 'u_creaseCos': float(np.cos(np.radians(crease_deg)))},
               {'t_n': self.t_n, 't_p': self.t_p, 't_id': self.t_id})
        lp = np.zeros((6, 4), 'f4')
        lc = np.zeros((6, 3), 'f4')
        for i, (pos, rad, colr) in enumerate(lights[:6]):
            lp[i, :3], lp[i, 3], lc[i] = pos, rad, colr
        tex_extra = {'t_shadow': self.shadow}
        dec = {'u_decalMat': -1}
        if decal is not None:
            dtex, o, u, v, mid = decal
            tex_extra['t_decal'] = dtex
            dec = {'u_decalMat': mid, 'u_decalO': tuple(o), 'u_decalU': tuple(u), 'u_decalV': tuple(v)}
        gl.run(self.cprog, self.cfbo, {**mu, **dec, 'u_res': res, 'u_eye': tuple(cam.pos), 'u_mirror': 1.0 if mirror else 0.0,
                                       'u_keyDir': tuple(_n(key_dir)), 'u_rimDir': tuple(_n(rim_dir)),
                                       'u_rimCol': tuple(rim_col), 'u_viewDir': tuple(-cam.basis()[2]), 'u_lp': lp, 'u_lc': lc,
                                       'u_lineAlpha': line_alpha, 'u_emisBoost': emis_boost,
                                       'u_rimW': rim_w * self.ss, 'u_lvp': lvp.astype('f4').T.copy(),
                                       'u_shadowOn': 1.0 if shadows else 0.0},
               {'t_n': self.t_n, 't_p': self.t_p, 't_id': self.t_id, 't_edge': self.t_edge, **tex_extra})
        gl.run(self.dprog, self.ofbo_c, {'u_srcRes': res}, {'t_src': self.t_col})
        gl.run(self.dprog, self.ofbo_g, {'u_srcRes': res}, {'t_src': self.t_glow})
        return self.out_col, self.out_glow


def _n(v):
    v = np.asarray(v, float)
    return v / np.linalg.norm(v)
