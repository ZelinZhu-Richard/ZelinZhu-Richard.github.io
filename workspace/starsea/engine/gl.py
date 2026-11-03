"""Thin moderngl wrapper: one headless context, shader includes, render targets, readback."""
import os
import re
import subprocess

import moderngl
import numpy as np

SHADER_DIR = os.path.join(os.path.dirname(__file__), 'shaders')

FULLSCREEN_VS = """
#version 410
in vec2 in_pos;
out vec2 v_uv;
void main(){ v_uv = in_pos*0.5+0.5; gl_Position = vec4(in_pos,0.0,1.0); }
"""


def _load(name):
    with open(os.path.join(SHADER_DIR, name)) as f:
        return f.read()


def preprocess(src):
    """Resolve `#include "file"` lines recursively."""
    def sub(m):
        return preprocess(_load(m.group(1)))
    return re.sub(r'^\s*#include\s+"([^"]+)"\s*$', sub, src, flags=re.M)


class GL:
    def __init__(self):
        self.ctx = moderngl.create_standalone_context(require=410)
        quad = np.array([-1, -1, 1, -1, -1, 1, 1, 1], dtype='f4')
        self.quad_vbo = self.ctx.buffer(quad.tobytes())
        self._progs = {}
        self._vaos = {}

    # ------------------------------------------------------------------ programs
    def program(self, frag, vert=None, defines=None, key=None):
        """frag/vert are file names in shaders/ or literal sources (detected by '#version')."""
        k = key or (frag, vert, tuple(sorted((defines or {}).items())))
        if k in self._progs:
            return self._progs[k]
        fs = frag if '#version' in frag else _load(frag)
        vs = FULLSCREEN_VS if vert is None else (vert if '#version' in vert else _load(vert))
        if defines:
            block = ''.join(f'#define {a} {b}\n' for a, b in defines.items())
            fs = fs.replace('#version 410\n', '#version 410\n' + block, 1)
            vs = vs.replace('#version 410\n', '#version 410\n' + block, 1)
        fs, vs = preprocess(fs), preprocess(vs)
        try:
            p = self.ctx.program(vertex_shader=vs, fragment_shader=fs)
        except moderngl.Error as e:
            raise RuntimeError(f'shader {frag}: {e}') from None
        self._progs[k] = p
        return p

    # ------------------------------------------------------------------ textures
    def tex(self, w, h, comps=4, dtype='f2', data=None, linear=True, repeat=False):
        if data is not None:
            data = np.ascontiguousarray(data)
            if dtype == 'f2':
                data = data.astype(np.float16)
            elif dtype == 'f4':
                data = data.astype(np.float32)
            data = data.tobytes()
        t = self.ctx.texture((w, h), comps, data=data, dtype=dtype)
        f = moderngl.LINEAR if linear else moderngl.NEAREST
        t.filter = (f, f)
        t.repeat_x = t.repeat_y = repeat
        return t

    def tex_from_array(self, arr, dtype='f2', linear=True, repeat=False):
        arr = np.asarray(arr)
        if arr.ndim == 2:
            arr = arr[..., None]
        h, w, c = arr.shape
        return self.tex(w, h, c, dtype, arr, linear, repeat)

    def fbo(self, *texs):
        return self.ctx.framebuffer(color_attachments=list(texs))

    # ------------------------------------------------------------------ passes
    def run(self, prog, target, uniforms=None, textures=None, blend=None, clear=None):
        """Full-screen pass. target: framebuffer. textures: {name: tex}."""
        vao = self._vaos.get(id(prog))
        if vao is None:
            vao = self.ctx.vertex_array(prog, [(self.quad_vbo, '2f', 'in_pos')])
            self._vaos[id(prog)] = vao
        target.use()
        if clear is not None:
            target.clear(*clear)
        self.bind(prog, uniforms, textures)
        self._blend(blend)
        vao.render(moderngl.TRIANGLE_STRIP)
        self.ctx.disable(moderngl.BLEND)

    def bind(self, prog, uniforms=None, textures=None):
        if textures:
            for i, (name, t) in enumerate(textures.items()):
                t.use(location=i)
                if name in prog:
                    prog[name].value = i
        if uniforms:
            for k, v in uniforms.items():
                if k not in prog:
                    continue
                if isinstance(v, np.ndarray):
                    prog[k].write(v.astype('f4').tobytes())
                elif isinstance(v, (list, tuple)) and v and isinstance(v[0], (list, tuple, np.ndarray)):
                    prog[k].write(np.asarray(v, dtype='f4').tobytes())
                else:
                    prog[k].value = v

    def _blend(self, blend):
        if blend is None:
            self.ctx.disable(moderngl.BLEND)
            return
        self.ctx.enable(moderngl.BLEND)
        if blend == 'premul':
            self.ctx.blend_func = moderngl.ONE, moderngl.ONE_MINUS_SRC_ALPHA
        elif blend == 'alpha':
            self.ctx.blend_func = (moderngl.SRC_ALPHA, moderngl.ONE_MINUS_SRC_ALPHA,
                                   moderngl.ONE, moderngl.ONE_MINUS_SRC_ALPHA)
        elif blend == 'add':
            self.ctx.blend_func = moderngl.ONE, moderngl.ONE
        elif blend == 'max':
            self.ctx.blend_func = moderngl.ONE, moderngl.ONE
            self.ctx.blend_equation = moderngl.MAX
            return
        self.ctx.blend_equation = moderngl.FUNC_ADD

    def read(self, t, comps=None):
        comps = comps or t.components
        dt = {'f1': np.uint8, 'f2': np.float16, 'f4': np.float32}[t.dtype]
        a = np.frombuffer(t.read(), dtype=dt).reshape(t.height, t.width, t.components)
        return a[..., :comps].astype(np.float32) / (255.0 if dt == np.uint8 else 1.0)


def to_u8(img):
    return (np.clip(img, 0, 1) * 255 + 0.5).astype(np.uint8)


def save_png(path, img):
    from PIL import Image
    a = to_u8(img[..., :3] if img.shape[-1] >= 3 else img[..., 0])
    Image.fromarray(np.flipud(a)).save(path)


def load_png(path):
    from PIL import Image
    a = np.asarray(Image.open(path).convert('RGB'), dtype=np.float32) / 255.0
    return np.flipud(a).copy()


class VideoWriter:
    """Pipes raw RGB frames (GL bottom-up float arrays) into ffmpeg."""

    def __init__(self, path, w, h, fps=24, crf=12, preset='slow'):
        self.p = subprocess.Popen(
            ['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24',
             '-s', f'{w}x{h}', '-r', str(fps), '-i', '-',
             '-c:v', 'libx264', '-preset', preset, '-crf', str(crf), '-tune', 'film',
             '-pix_fmt', 'yuv420p', '-movflags', '+faststart', path],
            stdin=subprocess.PIPE)

    def write(self, img):
        self.p.stdin.write(np.flipud(to_u8(img[..., :3])).tobytes())

    def close(self):
        self.p.stdin.close()
        self.p.wait()
