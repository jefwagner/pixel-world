#!/usr/bin/env python3
"""
PixelWorld parameter search -- corrected model.

KEY INSIGHT (the real reason diagonals are hard):
  Under a uniform UNIT-scale ortho (sx=sy=1), a 45deg-yawed square tile's long
  diagonal projects to L*sqrt(2) screen pixels -- IRRATIONAL. So it can never
  land on an integer pixel grid. Diagonal pixel-perfect is IMPOSSIBLE under
  uniform unit-scale ortho, regardless of angles or L.

  Fix (the original idea's "allow some ortho stretch"): use a non-uniform ortho
  in diagonal views, sx_diag = p/(L*sqrt(2)) for an INTEGER long-diagonal p.
  Choosing p = round(L*sqrt(2)) makes the stretch |sx_diag - 1| as small as
  possible, ~0.5/(L*sqrt(2)) ~ 0.35/L.  This is the fundamental, unavoidable
  cost of diagonal pixel-perfect, and it shrinks as L grows.

MODEL
  Cardinal (N/E/S/W), uniform unit ortho sx0=sy0=1:
    - choose Pythagorean triple (a,b,c): sin(theta0)=a/c, cos(theta0)=b/c
    - L, H must be multiples of c (smallest L=c)
    - ground footprint:  L  x  L*a/c       (both integer)  -- axis-aligned rect
    - wall footprint:    L  x  H*b/c       (both integer)  -- axis-aligned rect
    - pixel-perfect for FREE, any (a,b,c) + L,H mult of c.

  Diagonal (NE/SE/SW/NW), non-uniform ortho (sx45, sy45) near 1:
    - long diagonal  p = sx45 * L*sqrt(2)   -> sx45 = p/(L*sqrt(2)),  p integer
    - short diagonal q = sy45 * L*sqrt(2)*sin(theta45)  -> q integer
    - wall vertical  r = sy45 * H * cos(theta45)          -> r integer
    - eliminate sy45:  tan(theta45) = sqrt(2)*q*H / (2*r*L)
    - sy45 = q / (L*sqrt(2)*sin(theta45))   (= r/(H*cos(theta45)))
    - choose p = round(L*sqrt(2)) for minimal |sx45-1|.
    - choose integers q, r -> determines theta45 and sy45.

OBJECTIVES (Pareto)
  - |theta45 - theta0| small   (matched tilt; transition hides the rest)
  - |sx45 - 1|, |sy45 - 1| small  (minimal ortho stretch; "few percent")
  - L, H small                  (chunky pixels, less art)

IMPOSSIBILITY (still true, now secondary):
  tan(theta0) = a/b is rational;  tan(theta45) = sqrt(2)*qH/(2rL) is irrational.
  So theta0 == theta45 has no exact solution.  But with non-uniform ortho freed,
  mismatch can be driven below 0.001deg at modest sizes (see below).
"""

import math
from math import gcd, atan, degrees, isqrt, sqrt, tan, sin, cos

SQRT2 = sqrt(2.0)


def primitive_triples(cmax):
    out = []
    for c in range(5, cmax + 1):
        for b in range(2, c):
            a2 = c * c - b * b
            if a2 <= 0:
                continue
            a = isqrt(a2)
            if a > 0 and a * a == a2 and a < b:
                if gcd(gcd(a, b), c) == 1:
                    out.append((a, b, c))
    return out


def diag_from_qr(L, H, q, r):
    """Given L,H and integer short-diagonal q, wall-vertical r, compute
    (theta45, sx45, sy45). Returns None if degenerate."""
    t = SQRT2 * q * H / (2 * r * L)
    th = atan(t)
    s = sin(th)
    if s == 0:
        return None
    p = round(L * SQRT2)
    sx = p / (L * SQRT2)
    sy = q / (L * SQRT2 * s)
    return th, sx, sy, p


def search_cardinal(cmax, Hmax_mult):
    """For each Pythagorean triple and small H (multiples of c), search integer
    q,r to minimize (angle mismatch, sy stretch). sx stretch is fixed by L."""
    results = []
    for (a, b, c) in primitive_triples(cmax):
        th0 = atan(a / b)
        L = c                       # smallest chunky choice
        for kH in range(1, Hmax_mult + 1):
            H = kH * c
            # q ~ L*sqrt(2)*sin(theta0) ; r ~ H*cos(theta0)  (near-matched)
            q_lo = max(1, int(0.5 * L * SQRT2 * sin(th0)))
            q_hi = int(1.6 * L * SQRT2 * sin(th0)) + 1
            r_lo = max(1, int(0.5 * H * cos(th0)))
            r_hi = int(1.6 * H * cos(th0)) + 1
            for q in range(q_lo, q_hi + 1):
                for r in range(r_lo, r_hi + 1):
                    d = diag_from_qr(L, H, q, r)
                    if d is None:
                        continue
                    th45, sx45, sy45, p = d
                    mis = abs(th45 - th0)
                    results.append({
                        'triple': (a, b, c), 'L': L, 'H': H,
                        'theta0': th0, 'theta45': th45, 'mis': mis,
                        'p': p, 'q': q, 'r': r,
                        'sx': sx45, 'sy': sy45,
                        'sx_str': abs(sx45 - 1), 'sy_str': abs(sy45 - 1),
                    })
    return results


def fmt(x):
    return (f"({x['triple'][0]},{x['triple'][1]},{x['triple'][2]}) "
            f"L={x['L']:3d} H={x['H']:3d}  "
            f"th0={degrees(x['theta0']):6.3f} th45={degrees(x['theta45']):6.3f} "
            f"mis={degrees(x['mis']):5.3f}deg  "
            f"sx={x['sx']:.4f} sy={x['sy']:.4f} "
            f"(stretch {100*x['sx_str']:.2f}%/{100*x['sy_str']:.2f}%)  "
            f"p={x['p']} q={x['q']} r={x['r']}")


def main():
    CMAX = 75
    HMAX_MULT = 6
    results = search_cardinal(CMAX, HMAX_MULT)

    print("=" * 110)
    print("FUNDAMENTAL STRETCH COST  (diagonal long-diagonal):  |sx-1| vs L")
    print("This is the unavoidable cost of diagonal pixel-perfect. Shrinks as L grows.")
    print("=" * 110)
    for L in [5, 10, 13, 17, 20, 25, 35, 50, 65, 70]:
        p = round(L * SQRT2)
        sx = p / (L * SQRT2)
        print(f"  L={L:3d}: L*sqrt2={L*SQRT2:7.4f} -> p={p:3d}  "
              f"sx_diag={sx:.5f}  stretch={100*abs(sx-1):5.2f}%")

    print()
    print("=" * 110)
    print("RECOMMENDED:  triple (3,4,5), L=5.  Best near-matched diagonal per H.")
    print("=" * 110)
    sub = [x for x in results if x['triple'] == (3, 4, 5)]
    for H in sorted({x['H'] for x in sub}):
        cands = [x for x in sub if x['H'] == H]
        # prefer small mismatch, then small sy stretch
        best = min(cands, key=lambda x: (round(degrees(x['mis']), 3), x['sy_str']))
        print("  " + fmt(best))

    print()
    print("=" * 110)
    print("BEST OVERALL by mismatch (any triple, any H<=6c).  Shows matched tilt is cheap.")
    print("=" * 110)
    for x in sorted(results, key=lambda x: x['mis'])[:12]:
        print("  " + fmt(x))

    print()
    print("=" * 110)
    print("CHUNKY FRONTIER  (L<=25):  best mismatch per (L), keeping sy stretch < 3%")
    print("=" * 110)
    chunky = [x for x in results if x['L'] <= 25 and x['sy_str'] < 0.03]
    best_per_L = {}
    for x in chunky:
        L = x['L']
        if L not in best_per_L or x['mis'] < best_per_L[L]['mis']:
            best_per_L[L] = x
    for L in sorted(best_per_L):
        print("  " + fmt(best_per_L[L]))

    print()
    print("=" * 110)
    print("STRETCH-CONSCIOUS FRONTIER  (sy stretch < 1.5%, mismatch < 0.5deg):")
    print("these keep BOTH the tilt match AND the ortho stretch tiny. Note L needed.")
    print("=" * 110)
    tight = [x for x in results if x['sy_str'] < 0.015 and degrees(x['mis']) < 0.5]
    for x in sorted(tight, key=lambda x: (x['L'], x['mis']))[:15]:
        print("  " + fmt(x))

    print()
    print("=" * 110)
    print("IMPOSSIBILITY, RESTATED")
    print("=" * 110)
    print("  1. Uniform unit ortho CANNOT render diagonal pixel-perfect: long diagonal")
    print("     = L*sqrt(2) is irrational.  Non-uniform ortho is REQUIRED (stretch ~0.35/L).")
    print("  2. Even with non-uniform ortho, theta0==theta45 exactly is impossible:")
    print("     tan(theta0)=a/b (rational) vs tan(theta45)=sqrt(2)*qH/(2rL) (irrational).")
    print("     But mismatch can be driven < 0.001deg at modest L,H -- practically zero.")
    print()
    print(f"  searched: primitive triples c<={CMAX}, H up to {HMAX_MULT}*c, "
          f"q,r in ~[0.5..1.6]*native.")


if __name__ == "__main__":
    main()
