"""The Starsea Pacific: an original 4-6-2 with tender and clerestory coaches, built from the design sheet
(dimensions in metres; x_b = distance behind the front buffer beam). Local frame: X forward, Y up
(rail top = 0), Z right. Wheels and motion are separate parts so they can turn and slide every drawing."""
import math

import numpy as np

from . import mesh as mk
from .cel import Part
from .materials import (BLACK, BOILER, BRASS, BRASS_DK, CABIN, COACH, COAL, COPPER, FIRE, GOLD, IRON,
                        LAMP, RED, ROOF, ROOF_LT, STEEL, WHITE, WINDOW)
from .track import vehicle_matrix

# ----------------------------------------------------------------- design sheet (abridged)
DRV_R, DRV_AXLES, CRANK_R = 0.95, (5.05, 7.15, 9.25), 0.35
LEAD_R, LEAD_AXLES = 0.46, (1.25, 3.25)
TRAIL_R, TRAIL_AXLE = 0.535, 11.55
WHEEL_Z = 0.745
ROD_Z, COUPLE_Z = 1.06, 0.95
L_MAIN, ECC = 3.40, 0.05
VG = dict(return_crank_r=0.13, return_crank_phase=-math.pi / 2, K_xb=5.85, K_y=1.57, link_tail=0.40,
          ecc_rod=1.32, die_offset=0.18, radius_rod=2.72, Q_y=1.56, B_y=0.70, union_link=0.62, QV=0.12)
TENDER_BOGIES, TENDER_WB = (15.30, 19.50), 1.80
COACH_LEN = 18.40
LOCO_LEN = 21.93
N_COACHES = 4
COACH_BOGIES, COACH_WB = (3.10, 15.30), 2.40


def X(xb):
    return -xb


def rev_x(profile, seg=40, mat=0, smooth=False, at=(0.0, 0.0)):
    """Revolve [(r, X)...] (X increasing) around a line parallel to X at (y, z)=at."""
    m = mk.lathe([(r, x) for r, x in profile], seg, mat, caps=False, smooth=smooth)
    return m.transformed(mk.chain(mk.T(0, at[0], at[1]), mk.R('z', -90)))


def rev_y(profile, xz=(0.0, 0.0), seg=36, mat=0, smooth=True):
    return mk.lathe(profile, seg, mat, caps=False, smooth=smooth).transformed(mk.T(xz[0], 0, xz[1]))


def box_xb(xb0, xb1, y0, y1, z0, z1, mat):
    return mk.box(abs(xb1 - xb0), y1 - y0, z1 - z0, mat, center=(-(xb0 + xb1) / 2, (y0 + y1) / 2, (z0 + z1) / 2))


def both_sides(fn):
    return fn(1.0) + fn(-1.0)


# ----------------------------------------------------------------- wheels
def spoked_wheel(R, spokes, mat=RED, counterweight=None, crank=False, ivory=True, tyre_w=0.14):
    """Wheel in its own frame: axle along +Z, centre at origin, crank pin at angle 0 (+X)."""
    parts = []
    t = tyre_w / 2
    tyre = mk.lathe([(R * 0.9, -t), (R, -t), (R, t), (R * 0.9, t), (R * 0.9, -t)], 64, STEEL, caps=False, smooth=False)
    parts.append(tyre)
    rim = mk.lathe([(R * 0.84, -t * 0.7), (R * 0.9, -t * 0.7), (R * 0.9, t * 0.7), (R * 0.84, t * 0.7), (R * 0.84, -t * 0.7)],
                   64, mat, caps=False, smooth=False)
    parts.append(rim)
    if ivory:
        parts.append(mk.lathe([(R * 0.905, t + 0.004), (R * 0.95, t + 0.004)], 64, WHITE, caps=False, smooth=False))
    hub_r = R * 0.24
    parts.append(mk.lathe([(0.0, t * 1.1), (hub_r, t * 1.1), (hub_r, -t * 0.8), (0.0, -t * 0.8)][::-1], 28, mat,
                          caps=False, smooth=False))
    parts.append(mk.lathe([(0.0, t * 1.6), (hub_r * 0.45, t * 1.6), (hub_r * 0.45, t * 1.1)][::-1], 18, STEEL, caps=False))
    for k in range(spokes):
        a = 2 * math.pi * (k + 0.5) / spokes
        sp = mk.box(R * 0.86 - hub_r * 0.8, 0.05 * R + 0.02, 0.06, mat, center=((R * 0.86 + hub_r * 0.8) / 2, 0, 0))
        parts.append(sp.transformed(mk.R('y', math.degrees(a))))
    if counterweight:
        rin, rout, half = counterweight
        pts = []
        for a in np.linspace(math.pi - math.radians(half), math.pi + math.radians(half), 14):
            pts.append((rout * math.cos(a), rout * math.sin(a)))
        for a in np.linspace(math.pi + math.radians(half), math.pi - math.radians(half), 14):
            pts.append((rin * math.cos(a), rin * math.sin(a)))
        cw = mk.prism(pts, 0.07, mat).transformed(mk.R('x', 90))
        parts.append(cw)
    if crank:
        boss = mk.lathe([(0.0, t * 1.2), (0.11, t * 1.2), (0.11, -t * 0.5), (0.0, -t * 0.5)][::-1], 18, mat, caps=False)
        pin = mk.lathe([(0.0, t * 2.6), (0.05, t * 2.6), (0.05, t * 1.2)][::-1], 12, STEEL, caps=False)
        parts.append((boss + pin).transformed(mk.T(CRANK_R, 0, 0)))
    w = mk.merge(parts)
    # lathe axis is +y; lay the wheel so its axle points along +Z (outer face toward +Z)
    return w.transformed(mk.R('x', 90)).transformed(mk.S(1, 1, -1))


def blur_wheel(R, counterweight):
    """Driver drawn at speed: spokes smeared into a disc, with two speed arcs and the crank still crisp."""
    t = 0.07
    tyre = mk.lathe([(R * 0.9, -t), (R, -t), (R, t), (R * 0.9, t), (R * 0.9, -t)], 64, STEEL, caps=False, smooth=False)
    ivory = mk.lathe([(R * 0.905, t + 0.004), (R * 0.95, t + 0.004)], 64, WHITE, caps=False, smooth=False)
    disc = mk.lathe([(0.0, t * 0.5), (R * 0.9, t * 0.5), (R * 0.9, -t * 0.5)][::-1], 64, RED, caps=False, smooth=False)
    parts = [tyre, ivory, disc]
    for rr, a0, a1 in ((0.55, 20, 110), (0.72, 200, 300), (0.4, 250, 330)):
        pts = [(rr * R * math.cos(math.radians(a)), rr * R * math.sin(math.radians(a))) for a in np.linspace(a0, a1, 14)]
        arc = mk.tube([(x, y, t * 0.55) for x, y in pts], 0.012, 5, BLACK)
        parts.append(arc)
    hub = mk.lathe([(0.0, t * 1.4), (R * 0.22, t * 1.4), (R * 0.22, t * 0.5)][::-1], 24, RED, caps=False)
    parts.append(hub)
    w = mk.merge(parts).transformed(mk.R('x', 90)).transformed(mk.S(1, 1, -1))
    rin, rout, half = counterweight
    pts = [(rout * math.cos(a), rout * math.sin(a)) for a in np.linspace(math.pi - math.radians(half), math.pi + math.radians(half), 14)]
    pts += [(rin * math.cos(a), rin * math.sin(a)) for a in np.linspace(math.pi + math.radians(half), math.pi - math.radians(half), 14)]
    cw = mk.prism(pts, 0.07, RED).transformed(mk.T(0, 0, 0.06))
    boss = mk.cyl_between((CRANK_R, 0, 0.0), (CRANK_R, 0, 0.12), 0.11, 18, RED)
    pin = mk.cyl_between((CRANK_R, 0, 0.12), (CRANK_R, 0, 0.2), 0.05, 12, STEEL)
    return w + cw + boss + pin


def disc_wheel(R, mat=BLACK):
    t = 0.07
    tyre = mk.lathe([(R * 0.9, -t), (R, -t), (R, t), (R * 0.9, t), (R * 0.9, -t)], 40, STEEL, caps=False, smooth=False)
    disc = mk.lathe([(0.0, t * 0.6), (R * 0.9, t * 0.6), (R * 0.9, -t * 0.4)][::-1], 40, mat, caps=False, smooth=False)
    hub = mk.lathe([(0.0, t * 1.4), (R * 0.22, t * 1.4), (R * 0.22, t * 0.6)][::-1], 18, STEEL, caps=False)
    return (tyre + disc + hub).transformed(mk.R('x', 90)).transformed(mk.S(1, 1, -1))


# ----------------------------------------------------------------- locomotive body
def loco_body():
    m = []
    # frames, buffer beam, buffers
    m.append(both_sides(lambda s: box_xb(0.18, 12.95, 0.72, 1.58, s * 0.58, s * 0.62, RED)))
    m.append(both_sides(lambda s: box_xb(0.18, 12.95, 0.70, 0.74, s * 0.57, s * 0.63, BLACK)))
    m.append(box_xb(0.0, 0.18, 0.82, 1.42, -1.40, 1.40, RED))
    for s in (1, -1):
        m.append(mk.cyl_between((X(0.0), 1.10, s * 0.87), (X(-0.40), 1.10, s * 0.87), 0.09, 14, BLACK))
        m.append(mk.cyl_between((X(-0.40), 1.10, s * 0.87), (X(-0.55), 1.10, s * 0.87), 0.20, 24, IRON))
    # pilot (small cowcatcher) below the beam
    pil = []
    for k in range(7):
        z = -1.0 + k * (2.0 / 6)
        pil.append(mk.cyl_between((X(0.05), 0.82, z * 0.95), (X(-0.45), 0.18, z * 0.75), 0.035, 8, RED))
    m.append(mk.merge(pil))
    m.append(box_xb(-0.48, 0.05, 0.12, 0.2, -0.85, 0.85, RED))
    # lamps: the two golden eyes
    for s in (1, -1):
        z = s * 0.87
        drum = mk.cyl_between((X(0.25), 1.66, z), (X(-0.05), 1.66, z), 0.17, 24, BRASS_DK)
        bezel = mk.torus(0.165, 0.03, 28, 8, BRASS).transformed(mk.chain(mk.T(X(-0.06), 1.66, z), mk.R('z', 90)))
        lens = mk.cyl_between((X(-0.05), 1.66, z), (X(-0.075), 1.66, z), 0.14, 24, LAMP)
        vent = mk.cyl_between((X(0.10), 1.80, z), (X(0.10), 1.93, z), 0.05, 12, BRASS_DK)
        cap = mk.cyl_between((X(0.10), 1.93, z), (X(0.10), 1.96, z), 0.075, 12, BRASS)
        bracket = box_xb(0.05, 0.30, 1.42, 1.50, z - 0.1, z + 0.1, BLACK)
        m += [drum, bezel, lens, vent, cap, bracket]
    # smokebox + door
    m.append(rev_x([(0.0, X(2.85)), (0.86, X(2.85)), (0.86, X(0.90))], 48, IRON, at=(2.70, 0)))
    m.append(rev_x([(0.86, X(0.90)), (0.70, X(0.90)), (0.69, X(0.87)), (0.55, X(0.83)), (0.3, X(0.81)), (0.0, X(0.80))],
                   48, IRON, smooth=True, at=(2.70, 0)))
    m.append(mk.torus(0.70, 0.022, 48, 8, BRASS).transformed(mk.chain(mk.T(X(0.885), 2.70, 0), mk.R('z', 90))))
    m.append(mk.cyl_between((X(0.79), 2.70, 0), (X(0.70), 2.70, 0), 0.06, 14, BRASS))
    for y in (2.45, 2.98):
        m.append(box_xb(0.79, 0.83, y - 0.025, y + 0.025, 0.0, 0.62, STEEL))
    star = []
    for k in range(16):
        a = math.pi / 2 + k * math.pi / 8
        rr = 0.14 if k % 2 == 0 else 0.06
        star.append((rr * math.cos(a), rr * math.sin(a)))
    m.append(mk.prism(star, 0.03, BRASS).transformed(mk.chain(mk.T(X(0.80), 3.12, 0), mk.R('y', 90))))
    # boiler, bands, handrails
    m.append(rev_x([(0.81, X(8.95)), (0.81, X(2.85))], 48, BOILER, at=(2.70, 0)))
    for xb in (3.60, 5.10, 7.50, 8.90):
        m.append(rev_x([(0.822, X(xb + 0.03)), (0.822, X(xb - 0.03))], 48, BRASS, at=(2.70, 0)))
    for s in (1, -1):
        m.append(mk.cyl_between((X(1.0), 3.23, s * 0.72), (X(10.75), 3.23, s * 0.72), 0.018, 8, BRASS))
        for xb in (1.3, 3.2, 5.6, 7.8, 10.2):
            m.append(mk.cyl_between((X(xb), 3.23, s * 0.72), (X(xb), 3.1, s * 0.66), 0.012, 6, STEEL))
    # firebox: round top, flat sides
    pts = [(0.84 * math.cos(a), 2.74 + 0.84 * math.sin(a)) for a in np.linspace(0, math.pi, 18)]
    pts = [(0.84, 2.02)] + pts + [(-0.84, 2.02)]
    fb = mk.prism(pts, 1.90, BOILER).transformed(mk.chain(mk.T(X(9.90), 0, 0), mk.R('y', 90)))
    m.append(fb)
    # chimney (black with a copper-brass flared cap), domes, safety valve, whistle
    m.append(rev_y([(0.42, 3.48), (0.34, 3.60), (0.27, 3.72), (0.25, 3.86), (0.24, 4.02), (0.255, 4.16), (0.275, 4.22)],
                   (X(1.80), 0), 36, IRON))
    m.append(rev_y([(0.275, 4.22), (0.30, 4.22), (0.30, 4.28), (0.325, 4.33), (0.355, 4.38), (0.35, 4.42), (0.22, 4.42), (0.22, 4.30)],
                   (X(1.80), 0), 36, COPPER, smooth=False))
    m.append(rev_y([(0.42, 3.38), (0.33, 3.50), (0.30, 3.56), (0.30, 3.70), (0.26, 3.80), (0.16, 3.86), (0.0, 3.88)],
                   (X(4.35), 0), 32, BOILER))
    m.append(rev_y([(0.312, 3.70), (0.312, 3.735)], (X(4.35), 0), 32, BRASS, smooth=False))
    m.append(rev_y([(0.55, 3.36), (0.45, 3.50), (0.41, 3.58), (0.40, 3.66), (0.40, 3.84), (0.37, 3.96), (0.29, 4.05), (0.16, 4.10), (0.0, 4.12)],
                   (X(6.40), 0), 40, BRASS))
    m.append(rev_y([(0.30, 3.50), (0.24, 3.60), (0.15, 3.70), (0.13, 3.78), (0.16, 3.86), (0.20, 3.92), (0.20, 3.94), (0.0, 3.95)],
                   (X(9.30), 0), 24, BRASS))
    m.append(whistle_mesh())
    # running boards with the curved front drop, valance
    for s in (1, -1):
        m.append(box_xb(3.10, 10.85, 1.98, 2.02, s * 0.70, s * 1.42, BLACK))
        m.append(box_xb(3.10, 10.85, 1.88, 2.02, s * 1.40, s * 1.43, BOILER))
        m.append(box_xb(3.10, 10.85, 1.895, 1.905, s * 1.432, s * 1.435, GOLD))
        prev = None
        for t in np.linspace(0, 1, 13):
            xb = 0.55 + (3.10 - 0.55) * t
            y = 1.42 + (2.02 - 1.42) * 0.5 * (1 - math.cos(math.pi * t))
            if prev is not None:
                xb0, y0 = prev
                L = math.hypot(xb - xb0, y - y0)
                ang = math.degrees(math.atan2(y - y0, -(xb - xb0)))
                cx, cy = X((xb + xb0) / 2), (y + y0) / 2
                plate = mk.box(L + 0.01, 0.04, 0.72, BLACK).transformed(mk.chain(mk.T(cx, cy, s * 1.06), mk.R('z', ang)))
                val = mk.box(L + 0.01, 0.14, 0.03, BOILER).transformed(mk.chain(mk.T(cx, cy - 0.07, s * 1.415), mk.R('z', ang)))
                m += [plate, val]
            prev = (xb, y)
    # cylinders, valve chests, slide bars, motion bracket
    for s in (1, -1):
        z = s * ROD_Z
        m.append(mk.cyl_between((X(2.67), 1.00, z), (X(1.62), 1.00, z), 0.34, 28, BOILER))
        for xb in (1.62, 2.67):
            m.append(mk.cyl_between((X(xb + 0.03), 1.00, z), (X(xb - 0.03), 1.00, z), 0.36, 28, BOILER))
        m.append(mk.torus(0.33, 0.018, 28, 6, BRASS).transformed(mk.chain(mk.T(X(1.58), 1.0, z), mk.R('z', 90))))
        m.append(mk.cyl_between((X(2.75), 1.44, z), (X(1.55), 1.44, z), 0.16, 20, BOILER))
        for y in (0.865, 1.135):
            m.append(box_xb(2.67, 4.20, y - 0.03, y + 0.03, z - 0.035, z + 0.035, STEEL))
        m.append(box_xb(4.20, 4.28, 1.22, 1.95, z - 0.09, z + 0.09, BLACK))
        # steam pipe from smokebox to cylinder
        m.append(mk.cyl_between((X(2.6), 2.2, s * 0.62), (X(2.3), 1.45, s * 0.98), 0.1, 14, BOILER))
    # cab
    m.append(cab_mesh())
    # trailing truck frame and lead bogie frame (static parts)
    for s in (1, -1):
        m.append(box_xb(0.7, 3.8, 0.42, 0.62, s * 0.5, s * 0.56, BLACK))
        m.append(box_xb(11.0, 12.1, 0.50, 0.70, s * 0.92, s * 0.98, BLACK))
    return mk.merge(m)


def whistle_mesh():
    prof = [(0.03, 3.56), (0.03, 3.70), (0.055, 3.70), (0.055, 3.78), (0.07, 3.78), (0.07, 4.02), (0.085, 4.02),
            (0.085, 4.06), (0.0, 4.07)]
    return rev_y(prof, (X(10.60), 0.30), 20, BRASS, smooth=False)


def cab_mesh():
    m = []
    for s in (1, -1):
        z0, z1 = s * 1.36, s * 1.40
        m.append(box_xb(10.85, 13.05, 1.80, 2.75, z0, z1, BOILER))           # lower panel
        m.append(box_xb(10.85, 13.05, 3.50, 3.72, z0, z1, BOILER))           # top band
        m.append(box_xb(10.85, 11.00, 2.75, 3.50, z0, z1, BOILER))
        m.append(box_xb(11.50, 11.75, 2.75, 3.50, z0, z1, BOILER))
        m.append(box_xb(12.85, 13.05, 2.75, 3.50, z0, z1, BOILER))
        m.append(box_xb(11.00, 11.50, 2.75, 2.95, z0, z1, BOILER))
        m.append(box_xb(11.02, 11.48, 2.97, 3.48, s * 1.37, s * 1.375, WINDOW))   # glazed front side window
        m.append(box_xb(10.85, 13.05, 2.73, 2.75, s * 1.40, s * 1.41, GOLD))      # waist lining
        m.append(box_xb(11.9, 12.7, 2.05, 2.35, s * 1.40, s * 1.415, BRASS))     # number plate
        m.append(box_xb(11.95, 12.65, 2.1, 2.3, s * 1.415, s * 1.42, RED))
    # front wall with round spectacles glowing from the firebox
    m.append(box_xb(10.85, 10.90, 2.02, 3.72, -1.40, 1.40, BOILER))
    for s in (1, -1):
        sp = mk.cyl_between((X(10.84), 3.30, s * 1.08), (X(10.83), 3.30, s * 1.08), 0.17, 24, WINDOW)
        rim = mk.torus(0.17, 0.02, 24, 6, BRASS).transformed(mk.chain(mk.T(X(10.835), 3.30, s * 1.08), mk.R('z', 90)))
        m += [sp, rim]
    # under the cab and the fall plate to the tender, so no sky shows through
    m.append(box_xb(10.85, 13.05, 1.55, 1.82, -1.30, 1.30, BLACK))
    m.append(box_xb(13.0, 13.62, 1.55, 1.85, -1.0, 1.0, BLACK))
    # interior: warm firelight on the backhead and floor
    m.append(box_xb(10.92, 10.95, 1.85, 3.6, -1.3, 1.3, CABIN))
    m.append(box_xb(10.95, 11.25, 1.95, 2.35, -0.35, 0.35, FIRE))
    m.append(box_xb(10.95, 13.0, 1.80, 1.84, -1.36, 1.36, BLACK))
    # roof: shallow arc with overhang
    roof = []
    zs = np.linspace(-1.47, 1.47, 15)
    Rr = 2.7205
    cy = 4.12 - Rr
    for a, b in zip(zs[:-1], zs[1:]):
        ya, yb = cy + math.sqrt(Rr * Rr - a * a), cy + math.sqrt(Rr * Rr - b * b)
        L = math.hypot(b - a, yb - ya)
        ang = math.degrees(math.atan2(yb - ya, b - a))
        roof.append(mk.box(2.85, 0.05, L + 0.005, ROOF).transformed(
            mk.chain(mk.T(X(12.125), (ya + yb) / 2, (a + b) / 2), mk.R('x', -ang))))
    m.append(mk.merge(roof))
    return mk.merge(m)


# ----------------------------------------------------------------- tender
def tender_body():
    m = []
    m.append(box_xb(13.60, 21.20, 1.00, 1.22, -1.30, 1.30, BLACK))
    m.append(box_xb(13.60, 21.20, 1.22, 3.10, -1.38, 1.38, BOILER))
    m.append(box_xb(13.55, 13.62, 1.0, 3.3, -1.2, 1.2, BLACK))
    for s in (1, -1):
        m.append(mk.box(7.6, 0.2, 0.06, BOILER).transformed(mk.chain(mk.T(X(17.40), 3.18, s * 1.40), mk.R('x', s * 18))))
        # gold lining panel
        x0, x1, y0, y1 = 13.85, 20.95, 1.42, 2.90
        w = 0.025
        zz = (s * 1.381, s * 1.386)
        m.append(box_xb(x0, x1, y0, y0 + w, *zz, GOLD))
        m.append(box_xb(x0, x1, y1 - w, y1, *zz, GOLD))
        m.append(box_xb(x0, x0 + w, y0, y1, *zz, GOLD))
        m.append(box_xb(x1 - w, x1, y0, y1, *zz, GOLD))
        m.append(box_xb(15.0, 19.8, 0.45, 0.62, s * 0.92, s * 0.98, BLACK))
    # coal heap
    coal = []
    for xb in np.linspace(13.8, 17.1, 8):
        h = 3.1 + 0.42 * math.sin(math.pi * (xb - 13.7) / 3.5)
        coal.append(mk.lathe([(1.25, 0), (1.0, 0.2), (0.6, 0.35), (0.0, 0.42)], 14, COAL, caps=False, smooth=True)
                    .transformed(mk.chain(mk.T(X(xb), h - 0.42, 0), mk.S(0.45, 1.0, 1.0))))
    m.append(mk.merge(coal))
    m.append(mk.cyl_between((X(20.2), 3.10, 0.6), (X(20.2), 3.22, 0.6), 0.25, 20, BLACK))
    m.append(box_xb(21.20, 21.38, 0.95, 1.40, -1.38, 1.38, RED))
    return mk.merge(m)


# ----------------------------------------------------------------- coaches
def coach_body(observation=False):
    m = []
    body_end = 15.80 if observation else 17.90
    L = body_end - 0.50
    cx = X((0.50 + body_end) / 2)
    m.append(mk.box(L, 0.17, 2.6, BLACK, center=(cx, 1.135, 0)))
    m.append(mk.box(L, 2.13, 2.74, COACH, center=(cx, 1.22 + 2.13 / 2, 0)))
    # lower roof arcs and clerestory
    for s in (1, -1):
        ang = math.degrees(math.atan2(3.58 - 3.35, 0.67))
        m.append(mk.box(L + 0.2, 0.06, 0.74, ROOF).transformed(mk.chain(mk.T(cx, 3.465, s * 1.035), mk.R('x', s * ang))))
    cl0, cl1 = 1.30, (body_end - 0.8)
    ccx, cL = X((cl0 + cl1) / 2), cl1 - cl0
    m.append(mk.box(cL, 0.30, 1.40, COACH, center=(ccx, 3.73, 0)))
    m.append(mk.box(cL + 0.3, 0.05, 1.52, ROOF, center=(ccx, 3.905, 0)))
    m.append(mk.box(cL + 0.1, 0.06, 1.2, ROOF_LT, center=(ccx, 3.95, 0)))
    for k in range(5):
        xb = 2.5 + k * (body_end - 4.0) / 4
        m.append(rev_y([(0.10, 3.58), (0.10, 3.64), (0.06, 3.68), (0.0, 3.69)], (X(xb), s * 0.0 + 1.0), 12, ROOF_LT))
        m.append(rev_y([(0.10, 3.58), (0.10, 3.64), (0.06, 3.68), (0.0, 3.69)], (X(xb), -1.0), 12, ROOF_LT))
    n_win = 8 if observation else 9
    for s in (1, -1):
        zf = s * 1.371
        zl = s * 1.374
        # gold lining at waist and eaves
        m.append(mk.box(L, 0.03, 0.01, GOLD, center=(cx, 2.10, s * 1.373)))
        m.append(mk.box(L, 0.025, 0.01, GOLD, center=(cx, 3.30, s * 1.373)))
        m.append(mk.box(L, 0.025, 0.01, GOLD, center=(cx, 1.40, s * 1.373)))
        wrng = np.random.default_rng(7 if s > 0 else 8)
        for i in range(n_win):
            xc = 3.00 + i * 1.55
            m.append(mk.box(0.92, 0.84, 0.01, WINDOW, center=(X(xc), 2.60, zf)))
            r = wrng.random()
            if r < 0.22:
                # blind drawn down: the window glows through cloth, deeper amber
                m.append(mk.box(0.66, 0.6 if r < 0.12 else 0.4, 0.011, CABIN, center=(X(xc), 2.72 if r < 0.12 else 2.82, zl - s * 0.0005)))
            # curtains gathered at each side, lit from inside
            m.append(mk.box(0.14, 0.62, 0.012, CABIN, center=(X(xc - 0.37), 2.70, zl)))
            m.append(mk.box(0.14, 0.62, 0.012, CABIN, center=(X(xc + 0.37), 2.70, zl)))
            m.append(mk.box(0.92, 0.1, 0.012, CABIN, center=(X(xc), 2.98, zl)))
            # toplights
            for j in range(2):
                m.append(mk.box(0.4, 0.15, 0.01, WINDOW, center=(X(xc - 0.22 + j * 0.44), 3.19, zf)))
        n_cl = int(cL / 0.85)
        for i in range(n_cl):
            xc = cl0 + 0.45 + i * (cL - 0.9) / max(n_cl - 1, 1)
            m.append(mk.box(0.5, 0.18, 0.01, WINDOW, center=(X(xc), 3.73, s * 0.701)))
        # doors with droplights
        for (d0, d1) in ((0.95, 1.61),) + (() if observation else ((16.79, 17.45),)):
            m.append(mk.box(0.44, 0.62, 0.01, WINDOW, center=(X((d0 + d1) / 2), 2.61, zf)))
            m.append(box_xb(d0, d0 + 0.02, 1.3, 3.25, s * 1.37, s * 1.375, BLACK))
            m.append(box_xb(d1 - 0.02, d1, 1.3, 3.25, s * 1.37, s * 1.375, BLACK))
            m.append(mk.box(0.06, 0.06, 0.04, BRASS, center=(X(d1 - 0.12), 2.2, s * 1.39)))
        # truss rods
        m.append(mk.tube([(X(4.6), 1.05, s * 1.05), (X(7.4), 0.55, s * 1.05), (X(11.0), 0.55, s * 1.05),
                          (X(min(13.8, body_end - 2)), 1.05, s * 1.05)], 0.025, 8, STEEL))
        # underframe equipment: battery boxes and a gas cylinder
        m.append(mk.box(1.6, 0.42, 0.5, BLACK, center=(X(6.2), 0.86, s * 0.7)))
        m.append(mk.box(1.2, 0.36, 0.45, BLACK, center=(X(min(12.0, body_end - 5)), 0.9, s * 0.75)))
        m.append(mk.cyl_between((X(8.4), 0.82, s * 0.55), (X(10.4), 0.82, s * 0.55), 0.22, 14, IRON))
    # ends
    m.append(mk.box(0.06, 2.0, 0.8, BLACK, center=(X(0.47), 2.25, 0)))
    if not observation:
        m.append(mk.box(0.06, 2.0, 0.8, BLACK, center=(X(17.93), 2.25, 0)))
    else:
        m.append(observation_balcony())
    return mk.merge(m)


def observation_balcony():
    m = []
    m.append(box_xb(15.80, 17.60, 1.18, 1.26, -1.30, 1.30, BLACK))
    m.append(box_xb(15.80, 15.86, 1.26, 3.30, -1.37, 1.37, COACH))
    m.append(mk.box(0.012, 1.4, 0.60, WINDOW, center=(X(15.79), 2.45, 0)))
    m.append(box_xb(15.78, 17.55, 3.35, 3.42, -1.40, 1.40, ROOF))
    for k in range(9):
        z = -1.25 + k * 2.5 / 8
        m.append(mk.cyl_between((X(17.55), 1.26, z), (X(17.55), 2.30, z), 0.02, 6, BRASS))
    for s in (1, -1):
        for k in range(6):
            xb = 15.9 + k * 0.33
            m.append(mk.cyl_between((X(xb), 1.26, s * 1.28), (X(xb), 2.30, s * 1.28), 0.02, 6, BRASS))
        m.append(mk.cyl_between((X(15.86), 2.30, s * 1.28), (X(17.55), 2.30, s * 1.28), 0.03, 8, BRASS))
        m.append(mk.cyl_between((X(17.55), 1.80, s * 1.28), (X(15.86), 1.80, s * 1.28), 0.02, 6, BRASS))
    m.append(mk.cyl_between((X(17.55), 2.30, -1.28), (X(17.55), 2.30, 1.28), 0.03, 8, BRASS))
    # drumhead (lit) and red tail lamps
    m.append(mk.cyl_between((X(17.58), 1.85, 0), (X(17.63), 1.85, 0), 0.36, 32, WINDOW))
    m.append(mk.torus(0.36, 0.025, 32, 6, BRASS).transformed(mk.chain(mk.T(X(17.62), 1.85, 0), mk.R('z', 90))))
    for s in (1, -1):
        m.append(mk.cyl_between((X(17.58), 2.05, s * 0.98), (X(17.70), 2.05, s * 0.98), 0.09, 14, RED))
    for k in range(4):
        m.append(mk.cyl_between((X(15.80), 3.30, -1.2 + k * 0.8), (X(17.55), 2.32, -1.2 + k * 0.8), 0.015, 5, BRASS))
    return mk.merge(m)


def bogie_frame(wb, R):
    m = []
    for s in (1, -1):
        m.append(mk.box(wb + 1.0, 0.25, 0.08, BLACK, center=(0, R, s * 0.98)))
        for k in (-1, 1):
            m.append(mk.box(0.3, 0.32, 0.12, BLACK, center=(k * wb / 2, R, s * 1.02)))
        m.append(mk.box(0.6, 0.12, 0.10, STEEL, center=(0, R - 0.18, s * 1.0)))
    m.append(mk.box(0.3, 0.2, 2.0, BLACK, center=(0, R + 0.15, 0)))
    return mk.merge(m)


UNIT_BOX = mk.box(1, 1, 1, STEEL)


def _circle_intersect(p0, r0, p1, r1):
    dx, dy = p1[0] - p0[0], p1[1] - p0[1]
    d = math.hypot(dx, dy)
    a = (r0 * r0 - r1 * r1 + d * d) / (2 * d)
    h = math.sqrt(max(r0 * r0 - a * a, 0.0))
    mx, my = p0[0] + a * dx / d, p0[1] + a * dy / d
    s1, s2 = (mx + h * dy / d, my - h * dx / d), (mx - h * dy / d, my + h * dx / d)
    return min((s1, s2), key=lambda s: s[1])


def motion(phi):
    """Walschaerts motion for one side at driver angle phi (X fwd, Y up), from the design sheet."""
    R, r, L, e = DRV_R, CRANK_R, L_MAIN, ECC
    A = [(-xb, R) for xb in DRV_AXLES]
    P = [(ax + r * math.cos(phi), ay + r * math.sin(phi)) for ax, ay in A]
    P2 = P[1]
    yC = R + e
    Cx = P2[0] + math.sqrt(L * L - (P2[1] - yC) ** 2)
    C = (Cx, yC)
    vg = VG
    A2 = A[1]
    pe = phi + vg['return_crank_phase']
    E = (A2[0] + vg['return_crank_r'] * math.cos(pe), A2[1] + vg['return_crank_r'] * math.sin(pe))
    K = (-vg['K_xb'], vg['K_y'])
    F = _circle_intersect(E, vg['ecc_rod'], K, vg['link_tail'])
    psi = math.atan2(F[0] - K[0], K[1] - F[1])
    D = (K[0] - vg['die_offset'] * math.sin(psi), K[1] + vg['die_offset'] * math.cos(psi))
    Q = (D[0] + math.sqrt(max(vg['radius_rod'] ** 2 - (D[1] - vg['Q_y']) ** 2, 0)), vg['Q_y'])
    B = (Cx + vg['union_link'], vg['B_y'])
    return dict(P=P, C=C, E=E, F=F, K=K, psi=psi, D=D, Q=Q, B=B, P2=P2)


def rod_matrix(a, b, h, w, z):
    """Unit box stretched from 2D point a to b (X,Y) at lateral z."""
    dx, dy = b[0] - a[0], b[1] - a[1]
    L = math.hypot(dx, dy)
    ang = math.degrees(math.atan2(dy, dx))
    return mk.chain(mk.T((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, z), mk.R('z', ang), mk.S(L, h, w))


class Train:
    def __init__(self, gl):
        pid = iter(range(1, 400))
        self.body = Part(gl, loco_body(), next(pid), 1.0, 'loco')
        self.tender = Part(gl, tender_body(), next(pid), 1.0, 'tender')
        self.coach = Part(gl, coach_body(), next(pid), 1.0, 'coach')
        self.obs = Part(gl, coach_body(True), next(pid), 1.0, 'obs')
        self.coach_bogie = Part(gl, bogie_frame(COACH_WB, 0.46), next(pid), 0.8, 'cbogie')
        self.tender_bogie = Part(gl, bogie_frame(TENDER_WB, 0.46), next(pid), 0.8, 'tbogie')
        cw = (0.48, 0.78, 34)
        cwm = (0.46, 0.78, 44)
        self.driver = [Part(gl, spoked_wheel(DRV_R, 18, RED, cwm if i == 1 else cw, crank=True), next(pid), 0.9, 'drv')
                       for i in range(3)]
        self.driver_blur = [Part(gl, blur_wheel(DRV_R, cwm if i == 1 else cw), next(pid), 0.9, 'drv') for i in range(3)]
        self.lead = Part(gl, spoked_wheel(LEAD_R, 10, RED, ivory=False), next(pid), 0.8, 'lead')
        self.trail = Part(gl, spoked_wheel(TRAIL_R, 12, RED, ivory=False), next(pid), 0.8, 'trail')
        self.small = Part(gl, spoked_wheel(0.46, 10, RED, ivory=False), next(pid), 0.8, 'tw')
        self.disc = Part(gl, disc_wheel(0.46), next(pid), 0.8, 'cw')
        self.boss = Part(gl, mk.cyl_between((0, 0, -0.04), (0, 0, 0.04), 1.0, 18, STEEL), next(pid), 0.6, 'boss')
        self.rod = {k: Part(gl, UNIT_BOX, next(pid), w, k) for k, w in
                    (('couple', 0.75), ('main', 0.8), ('xhead', 0.7), ('valve', 0.6), ('piston', 0.6))}
        self._pid = pid

    def items(self, s, phi0=0.6, coaches=N_COACHES, rods=True, detail=True, phi=None, blur=False):
        """All parts for a train whose front buffer is at track distance s. phi overrides the driver angle
        (wheel rotation is directed per shot so the spokes never strobe)."""
        out = []
        M = vehicle_matrix(s, 2.25, 11.55)
        out.append((self.body, M))
        if phi is None:
            phi = phi0 - s / DRV_R
        small_phi = phi * DRV_R
        # the left side crank trails the right by 90 degrees
        for side in (1, -1):
            ph = phi + (0.0 if side > 0 else math.pi / 2)
            z = side * WHEEL_Z
            flip = mk.S(1, 1, side)
            drv = self.driver_blur if blur else self.driver
            for i, xb in enumerate(DRV_AXLES):
                out.append((drv[i], M @ mk.T(X(xb), DRV_R, z) @ flip @ mk.R('z', math.degrees(ph))))
            for xb in LEAD_AXLES:
                out.append((self.lead, M @ mk.T(X(xb), LEAD_R, z) @ flip @ mk.R('z', math.degrees(small_phi / LEAD_R))))
            out.append((self.trail, M @ mk.T(X(TRAIL_AXLE), TRAIL_R, z) @ flip @ mk.R('z', math.degrees(small_phi / TRAIL_R))))
            if rods:
                mo = motion(ph)
                P = mo['P']
                zc = side * (COUPLE_Z + 0.12)
                zm = side * (ROD_Z + 0.05)
                for a, b in ((P[0], P[1]), (P[1], P[2])):
                    a2 = (a[0] - 0.12, a[1]) if a is P[0] else a
                    b2 = (b[0] + 0.12, b[1]) if b is P[2] else b
                    out.append((self.rod['couple'], M @ rod_matrix(a2, b2, 0.12, 0.05, zc)))
                out.append((self.rod['main'], M @ rod_matrix(mo['P2'], mo['C'], 0.15, 0.06, zm)))
                for pin in P:
                    out.append((self.boss, M @ mk.chain(mk.T(pin[0], pin[1], side * (COUPLE_Z + 0.17)), mk.S(0.085, 0.085, 1.0))))
                out.append((self.boss, M @ mk.chain(mk.T(mo['C'][0], mo['C'][1], side * (ROD_Z + 0.1)), mk.S(0.07, 0.07, 1.0))))
                cx, cy = mo['C']
                out.append((self.rod['xhead'], M @ mk.chain(mk.T(cx, cy, side * ROD_Z), mk.S(0.42, 0.26, 0.14))))
                out.append((self.rod['piston'], M @ rod_matrix((cx, cy), (X(2.67), 1.0), 0.06, 0.06, side * ROD_Z)))
                if detail:
                    zv = side * (ROD_Z + 0.11)
                    out.append((self.rod['valve'], M @ rod_matrix(mo['E'], mo['F'], 0.07, 0.04, zv)))
                    out.append((self.rod['valve'], M @ rod_matrix(mo['D'], mo['Q'], 0.07, 0.04, side * (ROD_Z + 0.08))))
                    out.append((self.rod['valve'], M @ rod_matrix(mo['Q'], mo['B'], 0.08, 0.04, side * (ROD_Z + 0.13))))
                    out.append((self.rod['valve'], M @ rod_matrix((cx, VG['B_y']), mo['B'], 0.06, 0.04, side * (ROD_Z + 0.13))))
                    K, psi = mo['K'], mo['psi']
                    l0 = (K[0] + 0.28 * math.sin(psi), K[1] - 0.28 * math.cos(psi))
                    l1 = (K[0] - 0.28 * math.sin(psi), K[1] + 0.28 * math.cos(psi))
                    out.append((self.rod['valve'], M @ rod_matrix(l0, l1, 0.1, 0.06, side * (ROD_Z + 0.1))))
                    out.append((self.rod['valve'], M @ rod_matrix(mo['P2'], mo['E'], 0.08, 0.05, side * (ROD_Z + 0.16))))
        # tender
        Mt = vehicle_matrix(s, TENDER_BOGIES[0], TENDER_BOGIES[1])
        out.append((self.tender, Mt))
        for bc in TENDER_BOGIES:
            out.append((self.tender_bogie, Mt @ mk.T(X(bc), 0, 0)))
            for side in (1, -1):
                for k in (-1, 1):
                    out.append((self.small, Mt @ mk.T(X(bc) + k * TENDER_WB / 2, 0.46, side * WHEEL_Z) @ mk.S(1, 1, side)
                                @ mk.R('z', math.degrees(small_phi / 0.46))))
        # coaches
        for c in range(coaches):
            off = LOCO_LEN + COACH_LEN * c
            Mc = vehicle_matrix(s - off, COACH_BOGIES[0], COACH_BOGIES[1])
            obs = c == coaches - 1
            out.append((self.obs if obs else self.coach, Mc))
            for bc in COACH_BOGIES:
                out.append((self.coach_bogie, Mc @ mk.T(X(bc), 0, 0)))
                for side in (1, -1):
                    for k in (-1, 1):
                        out.append((self.disc, Mc @ mk.T(X(bc) + k * COACH_WB / 2, 0.46, side * WHEEL_Z) @ mk.S(1, 1, side)
                                    @ mk.R('z', math.degrees(small_phi / 0.46))))
        return out

    @staticmethod
    def lamp_positions(s):
        M = vehicle_matrix(s, 2.25, 11.55)
        return [(M @ np.array([X(-0.08), 1.66, z, 1.0]))[:3] for z in (0.87, -0.87)]

    @staticmethod
    def point(s, xb, y, z=0.0, vehicle='loco'):
        if vehicle == 'loco':
            M = vehicle_matrix(s, 2.25, 11.55)
        else:
            M = vehicle_matrix(s, TENDER_BOGIES[0], TENDER_BOGIES[1])
        return (M @ np.array([X(xb), y, z, 1.0]))[:3]
