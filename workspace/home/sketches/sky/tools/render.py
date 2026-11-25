#!/usr/bin/env python3
"""Offscreen preview of the real sky shader (macOS, no browser, no extra packages).

Runs tools/export.mjs (Node + the repo's three) to get the shader source from
sky.js and every uniform as shots.js sets it, then compiles that same GLSL on
the GPU through CGL (desktop OpenGL 4.1 core, via ctypes), draws the full-screen
triangle into an offscreen framebuffer and writes PNGs.

  python3 render.py                       # all shots, 1440x900, tier per layout
  python3 render.py --shots space,both --tier 1 --suffix t1
  python3 render.py --stats               # also print linear-light luminance stats
  python3 render.py --time 200            # also time each shot (ms per frame)

Output: workspace/home/_dev/sky/<shot>[-suffix].png
Needs: node, numpy, Pillow (all present in this repo's environment).
"""

import argparse
import ctypes as C
import json
import os
import subprocess
import sys
import time

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
HOME = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
OUT = os.path.join(HOME, '_dev', 'sky')

# ------------------------------------------------------------------ CGL / GL

GLF = C.CDLL('/System/Library/Frameworks/OpenGL.framework/OpenGL')

kCGLPFAAccelerated = 73
kCGLPFAOpenGLProfile = 99
kCGLOGLPVersion_GL4_Core = 0x4100
kCGLPFAColorSize = 8
kCGLPFAAlphaSize = 11

GL_FRAMEBUFFER = 0x8D40
GL_RENDERBUFFER = 0x8D41
GL_RGBA8 = 0x8058
GL_RGBA32F = 0x8814
GL_COLOR_ATTACHMENT0 = 0x8CE0
GL_FRAMEBUFFER_COMPLETE = 0x8CD5
GL_FRAGMENT_SHADER = 0x8B30
GL_VERTEX_SHADER = 0x8B31
GL_COMPILE_STATUS = 0x8B81
GL_LINK_STATUS = 0x8B82
GL_INFO_LOG_LENGTH = 0x8B84
GL_ARRAY_BUFFER = 0x8892
GL_STATIC_DRAW = 0x88E4
GL_FLOAT = 0x1406
GL_TRIANGLES = 0x0004
GL_RGBA = 0x1908
GL_UNSIGNED_BYTE = 0x1401
GL_BLEND = 0x0BE2
GL_ONE = 1


def _fn(name, res, *args):
    f = getattr(GLF, name)
    f.restype = res
    f.argtypes = list(args)
    return f


CGLChoosePixelFormat = _fn('CGLChoosePixelFormat', C.c_int, C.POINTER(C.c_int), C.POINTER(C.c_void_p), C.POINTER(C.c_int))
CGLCreateContext = _fn('CGLCreateContext', C.c_int, C.c_void_p, C.c_void_p, C.POINTER(C.c_void_p))
CGLSetCurrentContext = _fn('CGLSetCurrentContext', C.c_int, C.c_void_p)

u = C.c_uint
i_ = C.c_int
fp = C.POINTER(C.c_float)
glGenFramebuffers = _fn('glGenFramebuffers', None, i_, C.POINTER(u))
glBindFramebuffer = _fn('glBindFramebuffer', None, u, u)
glGenRenderbuffers = _fn('glGenRenderbuffers', None, i_, C.POINTER(u))
glBindRenderbuffer = _fn('glBindRenderbuffer', None, u, u)
glRenderbufferStorage = _fn('glRenderbufferStorage', None, u, u, i_, i_)
glFramebufferRenderbuffer = _fn('glFramebufferRenderbuffer', None, u, u, u, u)
glCheckFramebufferStatus = _fn('glCheckFramebufferStatus', u, u)
glDeleteFramebuffers = _fn('glDeleteFramebuffers', None, i_, C.POINTER(u))
glDeleteRenderbuffers = _fn('glDeleteRenderbuffers', None, i_, C.POINTER(u))
glCreateShader = _fn('glCreateShader', u, u)
glShaderSource = _fn('glShaderSource', None, u, i_, C.POINTER(C.c_char_p), C.c_void_p)
glCompileShader = _fn('glCompileShader', None, u)
glGetShaderiv = _fn('glGetShaderiv', None, u, u, C.POINTER(i_))
glGetShaderInfoLog = _fn('glGetShaderInfoLog', None, u, i_, C.c_void_p, C.c_char_p)
glCreateProgram = _fn('glCreateProgram', u)
glAttachShader = _fn('glAttachShader', None, u, u)
glLinkProgram = _fn('glLinkProgram', None, u)
glGetProgramiv = _fn('glGetProgramiv', None, u, u, C.POINTER(i_))
glGetProgramInfoLog = _fn('glGetProgramInfoLog', None, u, i_, C.c_void_p, C.c_char_p)
glUseProgram = _fn('glUseProgram', None, u)
glDeleteProgram = _fn('glDeleteProgram', None, u)
glDeleteShader = _fn('glDeleteShader', None, u)
glGetUniformLocation = _fn('glGetUniformLocation', i_, u, C.c_char_p)
glGetAttribLocation = _fn('glGetAttribLocation', i_, u, C.c_char_p)
glUniform1f = _fn('glUniform1f', None, i_, C.c_float)
glUniform3fv = _fn('glUniform3fv', None, i_, i_, fp)
glUniform4fv = _fn('glUniform4fv', None, i_, i_, fp)
glUniformMatrix3fv = _fn('glUniformMatrix3fv', None, i_, i_, C.c_ubyte, fp)
glUniformMatrix4fv = _fn('glUniformMatrix4fv', None, i_, i_, C.c_ubyte, fp)
glGenVertexArrays = _fn('glGenVertexArrays', None, i_, C.POINTER(u))
glBindVertexArray = _fn('glBindVertexArray', None, u)
glGenBuffers = _fn('glGenBuffers', None, i_, C.POINTER(u))
glBindBuffer = _fn('glBindBuffer', None, u, u)
glBufferData = _fn('glBufferData', None, u, C.c_ssize_t, C.c_void_p, u)
glVertexAttribPointer = _fn('glVertexAttribPointer', None, u, i_, u, C.c_ubyte, i_, C.c_void_p)
glEnableVertexAttribArray = _fn('glEnableVertexAttribArray', None, u)
glViewport = _fn('glViewport', None, i_, i_, i_, i_)
glDrawArrays = _fn('glDrawArrays', None, u, i_, i_)
glReadPixels = _fn('glReadPixels', None, i_, i_, i_, i_, u, u, C.c_void_p)
glFinish = _fn('glFinish', None)
glEnable = _fn('glEnable', None, u)
glDisable = _fn('glDisable', None, u)
glBlendFunc = _fn('glBlendFunc', None, u, u)
glClearColor = _fn('glClearColor', None, C.c_float, C.c_float, C.c_float, C.c_float)
glClear = _fn('glClear', None, u)


def make_context():
    attrs = (C.c_int * 8)(kCGLPFAOpenGLProfile, kCGLOGLPVersion_GL4_Core, kCGLPFAColorSize, 24, kCGLPFAAlphaSize, 8, kCGLPFAAccelerated, 0)
    pix = C.c_void_p()
    n = C.c_int()
    if CGLChoosePixelFormat(attrs, C.byref(pix), C.byref(n)) != 0 or not pix:
        sys.exit('CGLChoosePixelFormat failed')
    ctx = C.c_void_p()
    if CGLCreateContext(pix, None, C.byref(ctx)) != 0:
        sys.exit('CGLCreateContext failed')
    CGLSetCurrentContext(ctx)
    return ctx


# ------------------------------------------------------- three.js emulation

VERT_PREFIX = """#version 410
#define attribute in
#define varying out
#define texture2D texture
precision highp float;
precision highp int;
uniform mat4 modelMatrix;
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform mat4 viewMatrix;
uniform mat3 normalMatrix;
uniform vec3 cameraPosition;
in vec3 position;
"""

FRAG_PREFIX = """#version 410
#define varying in
#define texture2D texture
out highp vec4 pc_fragColor;
#define gl_FragColor pc_fragColor
precision highp float;
precision highp int;
uniform mat4 viewMatrix;
uniform vec3 cameraPosition;
vec4 sRGBTransferOETF(in vec4 value) {
  return vec4(mix(pow(value.rgb, vec3(0.41666)) * 1.055 - vec3(0.055), value.rgb * 12.92, vec3(lessThanEqual(value.rgb, vec3(0.0031308)))), value.a);
}
"""


def build_sources(d, linear):
    defs = ''.join(f'#define {k} {v}\n' for k, v in d['defines'].items())
    vert = VERT_PREFIX + defs + d['vert']
    cs = '' if linear else 'gl_FragColor = sRGBTransferOETF(gl_FragColor);'
    frag = FRAG_PREFIX + defs + d['frag'].replace('#include <colorspace_fragment>', cs)
    return vert, frag


def compile_shader(kind, src):
    s = glCreateShader(kind)
    b = C.c_char_p(src.encode())
    glShaderSource(s, 1, C.byref(b), None)
    glCompileShader(s)
    ok = C.c_int()
    glGetShaderiv(s, GL_COMPILE_STATUS, C.byref(ok))
    if not ok.value:
        ln = C.c_int()
        glGetShaderiv(s, GL_INFO_LOG_LENGTH, C.byref(ln))
        buf = C.create_string_buffer(max(1, ln.value))
        glGetShaderInfoLog(s, ln.value, None, buf)
        lines = src.split('\n')
        log = buf.value.decode(errors='replace')
        print(log, file=sys.stderr)
        # show offending lines
        import re
        for m in re.finditer(r'0:(\d+):', log):
            k = int(m.group(1))
            print(f'{k}: {lines[k - 1] if k - 1 < len(lines) else ""}', file=sys.stderr)
        sys.exit('shader compile failed')
    return s


def link(vs, fs):
    p = glCreateProgram()
    glAttachShader(p, vs)
    glAttachShader(p, fs)
    glLinkProgram(p)
    ok = C.c_int()
    glGetProgramiv(p, GL_LINK_STATUS, C.byref(ok))
    if not ok.value:
        ln = C.c_int()
        glGetProgramiv(p, GL_INFO_LOG_LENGTH, C.byref(ln))
        buf = C.create_string_buffer(max(1, ln.value))
        glGetProgramInfoLog(p, ln.value, None, buf)
        sys.exit('link failed: ' + buf.value.decode(errors='replace'))
    return p


def farr(v):
    return (C.c_float * len(v))(*v)


def set_uniforms(p, d):
    def loc(name):
        return glGetUniformLocation(p, name.encode())

    for name, uu in d['uniforms'].items():
        l = loc(name)
        if l < 0:
            continue
        t, v = uu['t'], uu['v']
        if t == 'f':
            glUniform1f(l, v[0])
        elif t == 'v3':
            glUniform3fv(l, 1, farr(v))
        elif t == 'v4':
            glUniform4fv(l, 1, farr(v))
        elif t == 'm3':
            glUniformMatrix3fv(l, 1, 0, farr(v))
        elif t == 'm4':
            glUniformMatrix4fv(l, 1, 0, farr(v))
        elif t == 'v4[]':
            glUniform4fv(l, uu['n'], farr(v))
    ident = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
    for name, v in (('projectionMatrix', d['projectionMatrix']), ('viewMatrix', d['viewMatrix']), ('modelMatrix', ident), ('modelViewMatrix', d['viewMatrix'])):
        l = loc(name)
        if l >= 0:
            glUniformMatrix4fv(l, 1, 0, farr(v))


class Target:
    def __init__(self, w, h, fmt):
        self.w, self.h, self.fmt = w, h, fmt
        self.fbo = u()
        self.rb = u()
        glGenFramebuffers(1, C.byref(self.fbo))
        glGenRenderbuffers(1, C.byref(self.rb))
        glBindRenderbuffer(GL_RENDERBUFFER, self.rb)
        glRenderbufferStorage(GL_RENDERBUFFER, fmt, w, h)
        glBindFramebuffer(GL_FRAMEBUFFER, self.fbo)
        glFramebufferRenderbuffer(GL_FRAMEBUFFER, GL_COLOR_ATTACHMENT0, GL_RENDERBUFFER, self.rb)
        if glCheckFramebufferStatus(GL_FRAMEBUFFER) != GL_FRAMEBUFFER_COMPLETE:
            sys.exit('framebuffer incomplete')

    def read(self):
        if self.fmt == GL_RGBA8:
            buf = (C.c_ubyte * (self.w * self.h * 4))()
            glReadPixels(0, 0, self.w, self.h, GL_RGBA, GL_UNSIGNED_BYTE, buf)
            a = np.frombuffer(buf, dtype=np.uint8).reshape(self.h, self.w, 4)
        else:
            buf = (C.c_float * (self.w * self.h * 4))()
            glReadPixels(0, 0, self.w, self.h, GL_RGBA, GL_FLOAT, buf)
            a = np.frombuffer(buf, dtype=np.float32).reshape(self.h, self.w, 4)
        return np.flipud(a).copy()

    def free(self):
        glDeleteFramebuffers(1, C.byref(self.fbo))
        glDeleteRenderbuffers(1, C.byref(self.rb))


_vao = None


def draw_setup(p):
    global _vao
    if _vao is None:
        _vao = u()
        glGenVertexArrays(1, C.byref(_vao))
        glBindVertexArray(_vao)
        vbo = u()
        glGenBuffers(1, C.byref(vbo))
        glBindBuffer(GL_ARRAY_BUFFER, vbo)
        data = farr([-1, -1, 0, 3, -1, 0, -1, 3, 0])
        glBufferData(GL_ARRAY_BUFFER, C.sizeof(data), data, GL_STATIC_DRAW)
    glBindVertexArray(_vao)
    a = glGetAttribLocation(p, b'position')
    glVertexAttribPointer(a, 3, GL_FLOAT, 0, 0, None)
    glEnableVertexAttribArray(a)


def render(d, linear=False, timing=0):
    w = int(round(d['w'] * d['dpr']))
    h = int(round(d['h'] * d['dpr']))
    if linear:
        d = json.loads(json.dumps(d))
        d['uniforms']['uDither']['v'] = [0]
        d['uniforms']['uEncode']['v'] = [0]
    vs_src, fs_src = build_sources(d, linear)
    vs = compile_shader(GL_VERTEX_SHADER, vs_src)
    fs = compile_shader(GL_FRAGMENT_SHADER, fs_src)
    p = link(vs, fs)
    glUseProgram(p)
    set_uniforms(p, d)
    draw_setup(p)
    tgt = Target(w, h, GL_RGBA32F if linear else GL_RGBA8)
    glViewport(0, 0, w, h)
    glDisable(GL_BLEND)
    glDrawArrays(GL_TRIANGLES, 0, 3)
    glFinish()
    img = tgt.read()
    ms = None
    if timing:
        # additive blending so the driver cannot drop overdrawn frames
        glEnable(GL_BLEND)
        glBlendFunc(GL_ONE, GL_ONE)
        for _ in range(5):
            glDrawArrays(GL_TRIANGLES, 0, 3)
        glFinish()
        best = 1e9
        for _ in range(3):
            t0 = time.perf_counter()
            for _ in range(timing):
                glDrawArrays(GL_TRIANGLES, 0, 3)
            glFinish()
            best = min(best, (time.perf_counter() - t0) * 1000 / timing)
        ms = best
        glDisable(GL_BLEND)
    tgt.free()
    glDeleteProgram(p)
    glDeleteShader(vs)
    glDeleteShader(fs)
    return img, ms


def export(args):
    cmd = ['node', os.path.join(HERE, 'export.mjs'), '--w', str(args.w), '--h', str(args.h), '--dpr', str(args.dpr), '--tier', str(args.tier), '--t', str(args.t), '--shots', args.shots, '--seed', str(args.seed)]
    r = subprocess.run(cmd, cwd=HERE, capture_output=True, text=True)
    if r.returncode != 0:
        sys.exit(r.stderr)
    return json.loads(r.stdout)


def lum(a):
    return 0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]


def overlay_text(im, d):
    """Approximate the 'text' shot's type (main.js / index.html) for legibility checks."""
    from PIL import ImageDraw, ImageFont

    if d['shot'] != 'text':
        return im
    s = d['dpr']
    W, H = d['w'], d['h']
    portrait = d['layout'] == 'portrait'
    box = (0.08, 0.66) if portrait else (0.075, 0.38)
    size = (38 if portrait else 64) * s
    lab = (11 if portrait else 12) * s

    def font(names, px):
        for n in names:
            try:
                return ImageFont.truetype(n, int(px))
            except OSError:
                continue
        return ImageFont.load_default()

    serif = font(['/System/Library/Fonts/Supplemental/Georgia.ttf'], size)
    ital = font(['/System/Library/Fonts/Supplemental/Georgia Italic.ttf'], size)
    mono = font(['/System/Library/Fonts/Menlo.ttc'], lab)
    dr = ImageDraw.Draw(im)
    x = box[0] * W * s
    y = box[1] * H * s
    dr.text((x, y), '17 / 20 · REAL SPACE', font=mono, fill=(168, 163, 152))
    y += lab * 1.4 + (16 if portrait else 22) * s
    dr.text((x, y), 'Explore the work.', font=serif, fill=(236, 233, 225))
    y += size * 1.06
    dr.text((x, y), 'Follow the curiosity.', font=ital, fill=(236, 233, 225))
    return im


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--w', type=int, default=1440)
    ap.add_argument('--h', type=int, default=900)
    ap.add_argument('--dpr', type=float, default=1)
    ap.add_argument('--tier', type=int, default=-1)
    ap.add_argument('--t', type=float, default=0)
    ap.add_argument('--seed', type=int, default=7)
    ap.add_argument('--shots', default='space,window,both,nebula,text,plain')
    ap.add_argument('--suffix', default='')
    ap.add_argument('--stats', action='store_true')
    ap.add_argument('--time', type=int, default=0, help='draws per timing batch (0: no timing)')
    ap.add_argument('--out', default=OUT)
    ap.add_argument('--text', action='store_true', help="draw the sample type on the 'text' shot")
    args = ap.parse_args()

    os.makedirs(args.out, exist_ok=True)
    make_context()
    for d in export(args):
        img, ms = render(d, timing=args.time)
        name = d['shot'] + (f'-{args.suffix}' if args.suffix else '')
        path = os.path.join(args.out, name + '.png')
        pim = Image.fromarray(img[..., :3])
        if args.text:
            pim = overlay_text(pim, d)
        pim.save(path)
        line = f"{name}: tier {d['tier']} {img.shape[1]}x{img.shape[0]} -> {path}"
        if ms is not None:
            line += f'  {ms:.2f} ms/frame'
        if args.stats:
            lin, _ = render(d, linear=True)
            L = lum(lin)
            mx = lin[..., :3].max(axis=2)
            line += f'\n   linear lum p50 {np.percentile(L, 50):.4f} p99 {np.percentile(L, 99):.3f} p99.9 {np.percentile(L, 99.9):.3f} max {L.max():.3f}  max channel {mx.max():.3f}'
            s = img[..., :3].astype(np.float32)
            line += f'  srgb mean {s.mean(axis=(0, 1)).round(1).tolist()}'
        print(line, flush=True)


if __name__ == '__main__':
    main()
