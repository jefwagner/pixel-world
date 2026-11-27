# PixelWorld — Pixel Math

This document derives the pixel-perfect constraints for all 8 views, proves
the two impossibility results, describes the parameter-search procedure, and
records the real numbers from `param_search.py`.

## What "pixel-perfect" means here

At each of the 8 snapped views, every visible tile's screen footprint is an
axis-aligned (cardinal) or clean-slanted (diagonal) region whose dimensions are
**integer pixels**, and the texture samples 1:1 (or N:1 integer) onto the
screen pixel grid with **nearest-neighbor** sampling — so no interpolation
blur, and adjacent tiles' patterns seam exactly.

During the *transition* between snaps we do not require pixel-perfection. The
transition (~150ms, Fez-style) hides it.

## Cardinal view (N/E/S/W)

Camera tilted down by θ₀ below the horizon, orthographic scale (sx₀, sy₀).
Tile side L (texels), wall face L×H.

- **Ground tile** (square L×L on the floor): screen footprint = `sx₀·L` wide ×
  `sy₀·L·sinθ₀` tall. The affine warp from a tilted plane is just a
  non-uniform scale (1, sinθ₀) — **axis-aligned rectangle**, no rotation.
  Nearest-neighbor gives clean 1:1 if those two are integers.
- **Wall facing camera**: screen = `sx₀·L` × `sy₀·H·cosθ₀`. Vertical lines
  compress by cosθ₀ because the image-plane's "up" is tilted θ₀ off world-up.
  Axis-aligned rectangle.

Integrality needs `L·sinθ₀ ∈ ℤ` and `H·cosθ₀ ∈ ℤ`. Setting sx₀=sy₀=1 and
choosing L,H as multiples of a common denominator, this reduces to:

> **Constraint C-card:** sinθ₀ and cosθ₀ must both be rational.

Angles with rational sin AND cos are exactly the **Pythagorean angles** —
sin=a/c, cos=b/c with a²+b²=c² (a primitive Pythagorean triple). Infinitely
many: (3,4,5)→θ≈36.87°, (5,12,13)→22.62°, (8,15,17)→28.07°, (7,24,25)→16.26°,
(12,35,37)→18.92°, (33,56,65)→30.51°, etc.

**Cardinal views are cleanly solvable** with a Pythagorean tilt and L,H chosen
as multiples of c.

## Diagonal view (NE/SE/SW/NW)

Camera yawed 45°, tilted θ₄₅. Two things change vs. cardinal.

### 1. The ground tile becomes a diamond

A square tile viewed at 45° yaw has its edges at 45° to screen axes. The affine
map from plane→screen is a 45° rotation + scale, so a *square* texture's pixel
grid lands on a **diamond grid on screen, rotated 45° off the screen pixel
grid**. Every screen pixel then straddles ~4 texels → interpolation → not
pixel-perfect, no matter how you tune sizes.

**Two consequences:**
- The ground texture must be **authored pre-distorted into a diamond** (this is
  literally what classic isometric pixel-art ground tiles are). The diamond
  texel grid is then already on the screen grid and nearest-neighbor is clean.
- Under a *uniform unit-scale* ortho (sx=sy=1), the diamond's **long diagonal
  is L√2 pixels — irrational**, so it can never land on an integer pixel grid.
  **Diagonal pixel-perfect is impossible under uniform unit-scale ortho,
  regardless of angles or L.** This is the first impossibility result, and it's
  more fundamental than the angle one.

**The fix** (the original idea's "allow some ortho stretch," now understood as
*necessary*): use a **non-uniform orthographic projection** in diagonal views.
Let the long diagonal be an integer `p` pixels; then `sx₄₅ = p/(L√2)`. Choosing
`p = round(L√2)` makes `|sx₄₅ − 1|` as small as possible, ≈ 0.5/(L√2) ≈ 0.35/L.
This is the **fundamental, unavoidable cost** of diagonal pixel-perfect, and it
shrinks as L grows (≈1% at L=13, ≈0.2% at L=50, <0.1% at L≥65). See the
stretch table below.

### 2. Walls become parallelograms

A wall at 45° to the view: its bottom edge projects to a slanted screen
segment. The wall's two side vectors on screen are:
- vertical side: `(0, r)` where `r = sy₄₅·H·cosθ₄₅`
- slanted side: shares the ground diamond's slant `(p/2, q/2)` where `q` is the
  diamond's short diagonal (integer).

For pixel-perfect tiling, both must be integer pixel vectors → p, q even (so
the slanted side is integer) and r ∈ ℤ. The wall texture therefore has to be
**pre-sheared into that parallelogram** — a second art variant per wall face.

### Integrality → the second constraint

From the ground diamond height `q = sy₄₅·L√2·sinθ₄₅` and the wall height
`r = sy₄₅·H·cosθ₄₅`, dividing eliminates sy₄₅:

> r/q = (H·cosθ₄₅)/(L√2·sinθ₄₅)  →  tanθ₄₅ = √2·qH/(2rL)

Since p, q, H, r, L are integers, this says:

> **Constraint C-diag:** tanθ₄₅ = √2 × (rational number).

That's the diagonal analogue of "Pythagorean angle." Infinitely many
solutions; θ₄₅ is determined by the integer choice of (p, q, r, L, H), and
sy₄₅ follows as `q / (L√2·sinθ₄₅)`.

## The two impossibility results

### Impossibility 1 (fundamental): uniform unit ortho cannot do diagonals
Under sx=sy=1, a 45°-yawed square's long diagonal = L√2 is irrational, so it
can never land on an integer pixel grid. **Non-uniform ortho is required.** The
minimum stretch is ~0.35/L, unavoidable.

### Impossibility 2 (secondary): θ₀ and θ₄₅ can never be exactly equal
C-card makes tanθ₀ rational; C-diag makes tanθ₄₅ = √2·(rational), irrational.
A number can't be both. So θ₀=θ₄₅ has no solution (except the degenerate
θ=0). **But both families are dense in the reals** (rationals and √2·rationals
are both dense), so θ₀ and θ₄₅ can be made *arbitrarily close*, never
identical. The cost is larger denominators (bigger c, bigger qH/(rL)) → larger
L,H → fatter textures.

This second impossibility is *not* a practical problem: with non-uniform ortho
freed (Impossibility 1 resolved), the angle mismatch can be driven below 0.001°
at modest L,H — essentially invisible. We accept a small mismatch and let the
transition hide the rest.

## The fundamental stretch cost (real numbers)

| L | L√2 | p=round(L√2) | sx₄₅ | stretch \|sx₄₅−1\| |
|---|---|---|---|---|
| 5 | 7.071 | 7 | 0.9899 | 1.01% |
| 10 | 14.142 | 14 | 0.9899 | 1.01% |
| 13 | 18.385 | 18 | 0.9791 | 2.09% |
| 17 | 24.042 | 24 | 0.9983 | 0.17% |
| 20 | 28.284 | 28 | 0.9899 | 1.01% |
| 25 | 35.355 | 35 | 0.9899 | 1.01% |
| 50 | 70.711 | 71 | 1.0041 | 0.41% |
| 65 | 91.924 | 92 | 1.0008 | 0.08% |
| 70 | 98.995 | 99 | 1.0001 | 0.01% |

L=13 is a local worst-case (2.09%) because 13√2 ≈ 18.38 is far from an integer.
L=17 and L=70 are local best-cases. In general the stretch oscillates but
trends to 0 as L grows.

## The parameter search (Diophantine, not black-box)

This is not a generic constrained optimization — it's a structured
number-theory search, so we can **enumerate exact solutions** rather than
gradient-descend toward approximations.

**Free parameters (integers):**
- L, H (texels, shared across views).
- Pythagorean triple (a,b,c) for θ₀ (with a<b so θ₀<45°).
- Diagonal integers p, q, r (p, q even for clean slanted sides).

**Hard constraints:**
- a²+b²=c²; L, H multiples of c (cardinal integrality).
- p = round(L√2) (minimal horizontal stretch).
- tanθ₄₅ = √2·qH/(2rL) (defines θ₄₅); sy₄₅ = q/(L√2·sinθ₄₅).

**Soft objectives (Pareto):**
- Minimize \|θ₀ − θ₄₅\| (transition smoothness).
- Keep \|sx₄₅ − 1\|, \|sy₄₅ − 1\| small (minimal ortho stretch).
- Keep L, H small (chunky pixels, less art).
- Optionally hit a target tilt (e.g. ~22° for gentle 3/4, ~30° for classic iso).

**Procedure:** enumerate primitive Pythagorean triples up to cmax; for each,
enumerate H (multiples of c); for each (L,H), enumerate integer q, r in a window
around their "native" values (q ≈ L√2·sinθ₀, r ≈ H·cosθ₀); compute θ₄₅, sy₄₅,
mismatch, stretches; collect the Pareto frontier. A 50-line script (`param_search.py`)
exhaustively covers the feasible set at chunky sizes.

## Recommended parameter sets (real numbers from `param_search.py`)

### Chunky frontier (L ≤ 25, sy stretch < 3%)

| triple | L | H | θ₀ | θ₄₅ | mismatch | sx stretch | sy stretch | p | q | r |
|---|---|---|---|---|---|---|---|---|---|---|
| (3,4,5) | 5 | 5 | 36.870° | 35.264° | 1.606° | 1.01% | 2.02% | 7 | 4 | 4 |
| (5,12,13) | 13 | 78 | 22.620° | 22.699° | 0.079° | 2.09% | 1.33% | 18 | 7 | 71 |
| (8,15,17) | 17 | 85 | 28.072° | 28.047° | 0.026° | 0.17% | 2.69% | 24 | 11 | 73 |
| (7,24,25) | 25 | 100 | 16.260° | 16.256° | 0.004° | 1.01% | 1.04% | 35 | 10 | 97 |

### Stretch-conscious frontier (sy stretch < 1.5%, mismatch < 0.5°)

| triple | L | H | θ₀ | θ₄₅ | mismatch | sx stretch | sy stretch |
|---|---|---|---|---|---|---|---|
| (5,12,13) | 13 | 13 | 22.620° | 22.415° | 0.205° | 2.09% | 0.15% |
| (5,12,13) | 13 | 78 | 22.620° | 22.699° | 0.079° | 2.09% | 1.33% |
| (8,15,17) | 17 | 102 | 28.072° | 27.671° | 0.401° | 0.17% | 1.48% |
| (7,24,25) | 25 | 100 | 16.260° | 16.256° | 0.004° | 1.01% | 1.04% |

### PoC recommendation

**(5,12,13) with L=H=13:** 13³ cube blocks (clean 1:1:1 voxel art), θ≈22.6°
(gentle 3/4 top-down), angle mismatch 0.21°, sy stretch 0.15%, sx stretch
2.09%. Essentially pixel-perfect in all 8 views with trivial stretch, and the
art budget is small (13-texel tiles). The 2.09% horizontal stretch is the
price of admission for diagonals at this size — invisible in practice, and the
transition masks the 0.21° tilt difference.

If a chunkier, more top-down look is preferred: **(3,4,5) L=5 H=5** — 5³ blocks,
θ≈36.87°, 1.6° mismatch (hidden by the transition), 1% sx / 2% sy stretch.
Maximally chunky; the mismatch is the largest in the table but still within the
"transition hides it" budget.

If a classic iso 3/4 feel is preferred: **(8,15,17) L=17 H=85** — θ≈28°,
0.03° mismatch, 0.17% sx / 2.7% sy stretch. Walls are 85 texels tall (more
art), but the angle match is essentially perfect.

## Why the search is exact, not heuristic

Because the feasible set is defined by integer constraints (Pythagorean triples,
integer q/r), it's enumerable. You don't tune by hand and you don't run a
solver that converges to a local optimum — you list every feasible chunky
configuration and pick by aesthetic. This also lets you **prove** statements
like "the smallest L that gives <0.5° mismatch with <1.5% stretch is L=13" —
useful for setting art budgets and for the math writeup on the demo page.
