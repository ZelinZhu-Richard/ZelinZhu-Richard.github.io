#!/usr/bin/env python3
"""Compile and link every custom shader of the room viewer without a browser (macOS).

    python3 sketches/room/glsl_check.py          (from workspace/home)

Node dumps the GLSL from room.js, post.js and reflect.js (their exported SHADERS); each vertex/fragment pair is
compiled and linked on the GPU through CGL (desktop OpenGL 4.1 core, via ctypes), with three's ShaderMaterial
prefix emulated (built-in uniforms and attributes, `varying`/`texture2D`/`gl_FragColor` defines), the same way
sketches/sky/tools/render.py checks the sky. Desktop GLSL is a little more permissive than GLSL ES 3.00 (it
accepts implicit int-to-float conversions), so the script also flags integer literals next to float operators.
Exit code 1 on any error.
"""
import ctypes as C
import json
import os
import re
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
HOME = os.path.abspath(os.path.join(HERE, '..', '..'))
GLF = C.CDLL('/System/Library/Frameworks/OpenGL.framework/OpenGL')


def fn(name, res, *args):
    f = getattr(GLF, name)
    f.restype = res
    f.argtypes = list(args)
    return f


u, i_ = C.c_uint, C.c_int
CGLChoosePixelFormat = fn('CGLChoosePixelFormat', C.c_int, C.POINTER(C.c_int), C.POINTER(C.c_void_p), C.POINTER(C.c_int))
CGLCreateContext = fn('CGLCreateContext', C.c_int, C.c_void_p, C.c_void_p, C.POINTER(C.c_void_p))
CGLSetCurrentContext = fn('CGLSetCurrentContext', C.c_int, C.c_void_p)
glCreateShader = fn('glCreateShader', u, u)
glShaderSource = fn('glShaderSource', None, u, i_, C.POINTER(C.c_char_p), C.c_void_p)
glCompileShader = fn('glCompileShader', None, u)
glGetShaderiv = fn('glGetShaderiv', None, u, u, C.POINTER(i_))
glGetShaderInfoLog = fn('glGetShaderInfoLog', None, u, i_, C.c_void_p, C.c_char_p)
glCreateProgram = fn('glCreateProgram', u)
glAttachShader = fn('glAttachShader', None, u, u)
glLinkProgram = fn('glLinkProgram', None, u)
glGetProgramiv = fn('glGetProgramiv', None, u, u, C.POINTER(i_))
glGetProgramInfoLog = fn('glGetProgramInfoLog', None, u, i_, C.c_void_p, C.c_char_p)
GL_FRAGMENT_SHADER, GL_VERTEX_SHADER = 0x8B30, 0x8B31
GL_COMPILE_STATUS, GL_LINK_STATUS = 0x8B81, 0x8B82

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
uniform bool isOrthographic;
in vec3 position;
in vec3 normal;
in vec2 uv;
"""
FRAG_PREFIX = """#version 410
#define varying in
#define texture2D texture
precision highp float;
precision highp int;
layout(location = 0) out highp vec4 pc_fragColor;
#define gl_FragColor pc_fragColor
uniform mat4 viewMatrix;
uniform vec3 cameraPosition;
uniform bool isOrthographic;
"""

DUMP = """
import * as THREE from 'three';
import { SHADERS as R, brassMaterial } from './sketches/room/room.js';
import { SHADERS as P } from './sketches/room/post.js';
import { SHADERS as F } from './sketches/room/reflect.js';
// the armillary's brass: three's own MeshBasicMaterial program with room.js's injection, includes resolved
const shader = { vertexShader: THREE.ShaderLib.basic.vertexShader, fragmentShader: THREE.ShaderLib.basic.fragmentShader, uniforms: {} };
brassMaterial(null).onBeforeCompile(shader);
const resolve = (s) => s.replace(/^[ \\t]*#include +<([\\w\\d./]+)>/gm, (_, n) => resolve(THREE.ShaderChunk[n]));
const B = { vert: resolve(shader.vertexShader), frag: resolve(shader.fragmentShader), colorspace: THREE.ShaderChunk.colorspace_pars_fragment };
console.log(JSON.stringify({ R, P, F, B }));
"""


def context():
    attrs = (C.c_int * 6)(99, 0x4100, 73, 0, 0, 0)  # core 4.1 profile, accelerated
    pix, n = C.c_void_p(), C.c_int()
    if CGLChoosePixelFormat(attrs, C.byref(pix), C.byref(n)) != 0 or not pix:
        sys.exit('CGLChoosePixelFormat failed')
    ctx = C.c_void_p()
    if CGLCreateContext(pix, None, C.byref(ctx)) != 0:
        sys.exit('CGLCreateContext failed')
    CGLSetCurrentContext(ctx)


def compile_(kind, src):
    s = glCreateShader(kind)
    b = src.encode()
    arr = (C.c_char_p * 1)(b)
    glShaderSource(s, 1, arr, None)
    glCompileShader(s)
    ok = i_()
    glGetShaderiv(s, GL_COMPILE_STATUS, C.byref(ok))
    log = C.create_string_buffer(8192)
    glGetShaderInfoLog(s, 8192, None, log)
    return s, bool(ok.value), log.value.decode(errors='replace')


def link(vs, fs):
    p = glCreateProgram()
    glAttachShader(p, vs)
    glAttachShader(p, fs)
    glLinkProgram(p)
    ok = i_()
    glGetProgramiv(p, GL_LINK_STATUS, C.byref(ok))
    log = C.create_string_buffer(8192)
    glGetProgramInfoLog(p, 8192, None, log)
    return bool(ok.value), log.value.decode(errors='replace')


# integer literal used where GLSL ES needs a float: "* 2)" "+ 1;" "(3 *" etc. (not array indices, loop counters,
# ivec/int contexts or texelFetch's lod)
INT_RE = re.compile(r'(?<![\w.\[])(?<!int )(?<!< )(?<!e-)(?<!e\+)(\d+)(?![\w.\]])')


def es_lint(name, src):
    bad = []
    for ln, line in enumerate(src.splitlines(), 1):
        code = line.split('//')[0]
        if not code.strip() or code.strip().startswith('#') or 'for (' in code or 'int ' in code or 'ivec' in code \
                or 'texelFetch' in code or 'uniform' in code or '[' in code:
            continue
        for m in INT_RE.finditer(code):
            s, e = m.span()
            before = code[:s].rstrip()[-1:] if code[:s].rstrip() else ''
            after = code[e:].lstrip()[:1]
            if before in '*/+-(,=' or after in '*/+-':
                bad.append(f'{name}:{ln}: integer literal {m.group(1)!r} in "{code.strip()}"')
    return bad


def main():
    out = subprocess.run(['node', '--input-type=module', '-e', DUMP], cwd=HOME, capture_output=True, text=True)
    if out.returncode:
        sys.exit(out.stderr)
    S = json.loads(out.stdout)
    pairs = [
        ('room backdrop', S['R']['BG_VERT'], S['R']['BG_FRAG']),
        ('room floor', S['R']['FLOOR_VERT'], S['R']['FLOOR_FRAG']),
        ('room sea', S['R']['SEA_VERT'], S['R']['SEA_FRAG']),
        ('post bright', S['P']['VERT'], S['P']['BRIGHT_FRAG']),
        ('post copy', S['P']['VERT'], S['P']['COPY_FRAG']),
        ('post blur', S['P']['VERT'], S['P']['BLUR_FRAG']),
        ('post dof', S['P']['VERT'], S['P']['DOF_DOWN_FRAG']),
        ('post out', S['P']['VERT'], S['P']['OUT_FRAG']),
        ('reflect blur', S['F']['VERT'], S['F']['BLUR_FRAG']),
        ('reflect copy', S['F']['VERT'], S['F']['COPY_FRAG']),
    ]
    # three's defines for a mapped, double-sided MeshBasicMaterial, without and with the floor mirror's clip plane
    for clip in (0, 1):
        d = f'#define USE_MAP\n#define USE_UV\n#define MAP_UV uv\n#define DOUBLE_SIDED\n' \
            f'#define NUM_CLIPPING_PLANES {clip}\n#define UNION_CLIPPING_PLANES {clip}\n#define NUM_SPOT_LIGHT_COORDS 0\n'
        pairs.append((f'brass (MeshBasicMaterial + injection, clip {clip})', d + S['B']['vert'],
                      d + S['B']['colorspace'] +
                      '\nvec4 linearToOutputTexel( vec4 value ) { return value; }\n' + S['B']['frag']))
    context()
    fails = 0
    for name, v, f in pairs:
        vs, vok, vlog = compile_(GL_VERTEX_SHADER, VERT_PREFIX + v)
        fs, fok, flog = compile_(GL_FRAGMENT_SHADER, FRAG_PREFIX + f)
        lok, llog = link(vs, fs) if vok and fok else (False, '')
        ok = vok and fok and lok
        fails += not ok
        print(f"{'ok  ' if ok else 'FAIL'} {name}")
        for log in (vlog, flog, llog):
            if log.strip() and not ok:
                print('     ' + log.strip().replace('\n', '\n     '))
        if name.startswith('brass'):
            continue  # three's own chunks: lint only room.js's injected snippets (below)
        for b in es_lint(name, f) + es_lint(name + ' (vert)', v):
            fails += 1
            print('LINT ' + b)
    for k in ('BRASS_VERT', 'BRASS_FRAG'):
        for b in es_lint(k, S['R'][k]):
            fails += 1
            print('LINT ' + b)
    print('all shaders compile and link' if not fails else f'{fails} problem(s)')
    sys.exit(1 if fails else 0)


if __name__ == '__main__':
    main()
