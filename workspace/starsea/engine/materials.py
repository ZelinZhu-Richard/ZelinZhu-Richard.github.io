"""Night colour designs per material (the colour stylist's sheet). Hex in sRGB.

Each entry: base, shade, shade2 (deep shadow), hi (hard highlight), line (ink colour),
spec (half-vector threshold, 0 = matte), rim (0..1), emissive (glow strength), warm (lamp response).
"""
import numpy as np

NMAT = 24


def hx(s):
    s = s.lstrip('#')
    return tuple(int(s[i:i + 2], 16) / 255.0 for i in (0, 2, 4))


def M(base, shade, shade2, hi, line, spec=0.0, rim=0.0, emis=0.0, warm=0.6, shadowT=None, lineW=1.0, pri=0.0):
    if shadowT is None:
        shadowT = 0.3 if spec > 0 else 0.06
    return dict(base=hx(base), shade=hx(shade), shade2=hx(shade2), hi=hx(hi), line=hx(line),
                spec=spec, rim=rim, emis=emis, warm=warm, shadowT=shadowT, lineW=lineW, pri=pri)


# material ids
BOILER, BRASS, COPPER, RED, STEEL, IRON, COACH, ROOF, WINDOW, LAMP, GOLD, DECK, POST, LAMPGLASS, \
    RAIL, SLEEPER, CABIN, FIRE, COAL, BRASS_DK, ROOF_LT, WHITE, BLACK, FISH = range(24)

MATERIALS = {
    BOILER: M('#2c4a54', '#172a3c', '#0f1a2c', '#6a94a4', '#0b0e1c', spec=0.993, rim=0.85, warm=0.22),
    BRASS: M('#c09a58', '#6e5640', '#3e3238', '#fff4cc', '#2e1c12', spec=0.975, rim=0.6, warm=0.9),
    COPPER: M('#b47048', '#683c36', '#3a2430', '#ffd0a8', '#2a1210', spec=0.98, rim=0.6, warm=0.9),
    RED: M('#a33240', '#5c1c34', '#3a1228', '#ee8a86', '#1c0a14', spec=0.0, rim=0.7, warm=0.7),
    STEEL: M('#7e8aa6', '#454e68', '#2c3248', '#e4ecfa', '#121726', spec=0.96, rim=0.6, warm=0.8),
    IRON: M('#2e3246', '#191c30', '#101222', '#727a9e', '#07080f', spec=0.985, rim=0.8, warm=0.5),
    COACH: M('#24486c', '#152c4c', '#0d1c34', '#5e8ab4', '#0a1020', spec=0.99, rim=0.8, warm=0.2),
    ROOF: M('#4a5076', '#2c3052', '#1c2038', '#9aa0c8', '#0e1022', spec=0.0, rim=0.9, warm=0.3),
    WINDOW: M('#ffc768', '#e89a48', '#c07034', '#fff2c8', '#9a5420', emis=1.0, lineW=0.7, pri=2),
    LAMP: M('#ffe39a', '#ffc860', '#ffa040', '#ffffff', '#d08a3a', emis=1.5, lineW=0.6, pri=3),
    GOLD: M('#b8964e', '#6e583c', '#443830', '#fff2c4', '#2e1c12', spec=0.95, rim=0.0, warm=0.9, lineW=0.0, shadowT=-0.5),
    DECK: M('#565278', '#34324e', '#22203a', '#8c88b0', '#26243c', rim=0.5, warm=0.95),
    POST: M('#3c3a58', '#24243c', '#17172a', '#6c6a90', '#1c1b30', rim=0.6, warm=0.9),
    LAMPGLASS: M('#ffd98a', '#ffc060', '#f0a040', '#ffffff', '#b06a28', emis=2.0, lineW=0.6, pri=3),
    RAIL: M('#8e98bc', '#4e5674', '#30364e', '#eef2ff', '#121626', spec=0.9, rim=0.8, warm=0.9),
    SLEEPER: M('#2e2e46', '#1c1c30', '#121222', '#5a5a7e', '#0a0a16', rim=0.4, warm=0.6),
    CABIN: M('#e8924c', '#b05a34', '#7a3a28', '#ffd090', '#8a4a1c', emis=0.6, lineW=0.0, pri=1),
    FIRE: M('#ffae52', '#ff8a3a', '#e05a28', '#fff0c0', '#8a3a10', emis=1.6, lineW=0.5, pri=1),
    COAL: M('#262a40', '#16182a', '#0e0f1c', '#6a7090', '#08090f', rim=0.5),
    BRASS_DK: M('#8e7448', '#54443a', '#342c30', '#f2e2b8', '#24160e', spec=0.98, rim=0.5, warm=0.9),
    ROOF_LT: M('#6c7298', '#40456a', '#282c48', '#b4b8dc', '#121428', rim=0.9, warm=0.3),
    WHITE: M('#d8dcf0', '#9096b8', '#5c6084', '#ffffff', '#202438', rim=0.3),
    BLACK: M('#1c1e2c', '#12131e', '#0b0c14', '#4a4e66', '#050508', rim=0.6),
    FISH: M('#bff4ff', '#7ad0f0', '#4aa0d8', '#ffffff', '#2a5a8a', emis=1.4),
}


def material_uniforms(mats):
    base = np.zeros((NMAT, 3), 'f4'); shade = np.zeros((NMAT, 3), 'f4'); shade2 = np.zeros((NMAT, 3), 'f4')
    hi = np.zeros((NMAT, 3), 'f4'); line = np.zeros((NMAT, 3), 'f4'); mp = np.zeros((NMAT, 4), 'f4')
    st = np.zeros(NMAT, 'f4'); lw = np.ones(NMAT, 'f4'); pri = np.zeros(NMAT, 'f4')
    for i, m in mats.items():
        base[i], shade[i], shade2[i], hi[i], line[i] = m['base'], m['shade'], m['shade2'], m['hi'], m['line']
        mp[i] = (m['spec'], m['rim'], m['emis'], m['warm'])
        st[i], lw[i], pri[i] = m['shadowT'], m['lineW'], m['pri']
    return {'u_base': base, 'u_shade': shade, 'u_shade2': shade2, 'u_hi': hi, 'u_line': line, 'u_mp': mp,
            'u_shadowT': st, 'u_matLine': lw, 'u_matPri': pri}
