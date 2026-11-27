# PixelWorld

I have an idea for a 2Dish 3D game engine I"m calling pixel-world. The sell for this
engine is that it will look and feel like a 2D topdown or isometric adventure game like
the old legend of zeldas or cross-code with a pixel-art feel of 'every pixel placed with
intention' but will go through a typical 3D rendering pipeline and will allow you to
rotate the view through the 8 views (4 cardinal N-E-S-W, and inbetween diagonals).

There will be two different types of rendered objects

1. Objects/Characters. These will all have 8-direction sprites that will be rendered
   onto camera facing billboards such that the tecture pixel -> screen canvas pixels
   are mapped one-to-one.

2. Buildings/Terrain. These will be low-poly meshes that have textured mapped onto
   them.

The camera view will be fixed during gameplay to the 8 allowed directions, but can
(should?) smoothing and quickly transition between them (think the view switching in
Fez).

The objects/characters will have 3D collision boxes and positions in full 3D space, they
will simply always be rended using sprites on camera-facing billboards. I'm less
concerned about this step - although I haven't worked out the details, I know this is a
solved problem. I am currious about how to handled lighting - in normal pixel-art it's
handled through the art sprites, and in most 3D engines its handed in the rendering
shader pipeline... it's a problem to think about later though.

The difficulty for me comes in the terrain/buildings. One of the things I like about
pixel art worlds are the pixel-perfect tile-maps, and I would love to keep that feeling.
That becomes difficult with the changing camera perspective. The goal for me would be to
keep a pixel-perfect repeating texture sampling for flat (ground) and vertical (wall)
tiles in both the cardinal (N-E-S-W) and diagonal (NE-SE-SW-NW) directions. Since there
is no favored direction, a flat tile should be square of side-length $L$ when viewed
from directly above. When viewed from a $\theta_0$ degree angle below the horizon, the
horizontal dimension is unchaned, but the screen-vertical dimension is foreshorted to
$L\sin(\theta_0))$. The vertical direction is special, so a vertical tile can have a
different width $L$ and height $H$ when viewed from straignt on, so while the width will
be unchanged when viewd from the angle the height will be $H\cos(theta)$. This is all
well and-good, but we also need to consider the diagonal directions. In this case the
flat tile will be a fore-shorted diamond with a half-long-diagonal of
$\frac{L}{\sqrt{2}}$ and short diagonal of $\frac{L}{\sqrt{2}}\sin{\theta_{45}}$, and a
vertical tile will be a parallelogram with same half-long-diagonal, and height
$H\cos{\theta_{45}}$. As it sits, the ratios hear will clearly not give rational
numbers, so we could never get the pixel-perfect repeating patterns for that pixelgame
style tiled terrain. To address this I was thinking of a) allowing slightly different
viewing angles ($\theta_0$ in cardinal $\theta_{45}$ in diagonal - AND allowing for some
stretching/shrinking of horizontal/vertical components in the orthographic camera
between cardinal and diagonal views to maybe push slightly off values back to
pixel-perfect. If the difference in viewing angle and orthrographic projection math is
small (say a few percent) then I don't think it'll be that noticable to the player.


