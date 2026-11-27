# Pixel World v2

This is an idea about a pixel-art world-building engine that creates a 3D world that
captures the visuals of a full 2D topdown game (old-school Zelda, old-school Square Enix
(Final Fantasy VI, or ChronoTrigger), Cross code) with the 'every pixel placed with
intention' while using a standard 3D rendering pipeline. The 'hook' of the engine would
be that you can view the world from 8 fixed camera angles: N, NE, E, SE, S, SW, W, NW,
with quick (150ms or so) Fez style transitions between the views. The pixel-perfect
requirement is not required during the transitions. The world would bemade up of two 
distinct types

1. Characters/Objects - these would have a position in 3D space, and would have a 3D
   collider shape, and would be rendered as 8-direction sprites on camera facing
   billboards.

2. Terrain/buildings - these would be rendered as textures onto a low-poly mesh that is
   mostly vertical/horizontal planes. I want the world to be tile-based, so that we can
   have a mostly repeating pattern. This is of-course impossible if we keep a fixed
   aspect ratio of the orthographic camera since sqrt(2) is irrational, but if we allow
   some limited change of the camera angle and orthographic camera stretch, we CAN get
   exact repeating integer patterns for the horizontal and vertical tiles. One sublty
   here is that the tiles require (at least) two pre-distorted art-sets, one for the
   cardinal and one for diagonal views.

## Math requirements

I want horizontal and vertical tiles to have an exact repeating pattern of pixels in
both the cardinal (N-E-S-W) and diagonal (NE-SE-SW-NW) views. In the cardinal view, a
square tile (as viewed from directly above) would look like a foreshortened rectangle
with length $L$ and screen height $W$, and a vertical tile would have (foreshortened) 
height $V$ and length $L$. In diagonal view, the square would look like a diamond with 
width long diagonal $2p$ and short diagonal $q$, A vertical tile will be a parallegram
with a (foreshortened) height of $V$ and diagonal with a (screen) horizontal size $p$
and vertical size $q/2$ (note sublties about the even-ness/oddness of q below)$. So we 
have the condition $L, W, p, q$ are integers.

The relations are:

$$
W = L \sin(\theta_0) \\
V = V_{\text{true}} \cos(\theta_0) \\
p = s_x L / \sqrt{2} \\
q = s_y L \sin(\theta_{45})/ \sqrt{2} \\
V = s_y V_{\text{true}} \cos(\theta_{45})
$$

where $\theta_0$ is the viewing angle below the horizontal in the cardinal view,
$\theta_{45}$ the diagonal view, $s_x$ and $s_y$ are the stretch of in the horizontal
and vertical directions for the orthographic camera when viewing from the diagonal view.

### Solving for the unknowns

We can make explorations with the following logic

* Choose an $L$ to start with
* Select at $W$ within some $theta_0$ range near 30 degrees ($W \approx \tfrac{1}/{2}
  L$)
* Select $q$ as integer next to $\sqrt{2} \cdot W$
   - One $q$ value (above or below exact value above) will always be even
      - if $q$ is even -> $p = q - 1$
   - The other $q$ value will be odd
      - if $q$ is odd -> $p = q + 1$
* Solve for $\theta_0 = \sin^{-1}(\tfrac{W}{L})$
* Solve for $s_x = \frac{\sqrt{2} \cdot p}{L}$
* Solve for $\s_y = \sqrt{\cos^2(\theta_0) + \frac{2 q^2}{L^2}}$
* Solve for $\theta_{45} = \sin^{-1}\left( \tfrac{\sqrt{2} \cdot q}{L s_y}} \right)$

Note: We enforces the relationship that that the long diagonal is 2 more or less than
the short diagonal so that the diamonds will tile nicely. If $q$ is odd, the left and
right corners of the diamond are 1 pixel tall, and when tiled, the left and right
corners of neigboring tiles touch, separating the top and bottom corners, which are 4
pixels wide. If $q$ is even, the left and right corners of the diamond are 2 pixels
tall, and the top and bottom cornders are 2 pixels wide. In that case the top and bottom
corners touch, seprating the left and right corners by 2 pixels.

I created two animated gifs that rotate a 4-tile shape a full 360 in 8 frames, one for
even $q% and one for odd $q$.

One important result: the $V_{\text{true}}$ note does NOT need to be pixel-exact, and
$V$ cancels out completely! That means we can capture any single-pixel step up in the
horizontal plane.

I created a marimo notebook (pixelworld-explorer.py) which looks at various sizes of
$L$, $W$, $p$, and $q$ and gauges how close the viewing angle is to 30 degrees , and 
how close the diagonal horizontal and vertical stretch are to 1.

## Project outputs

The project would have 2 outputs: a proof-of-concept (POC) and a minimum-viable-product
(MVP).

### POC

The proof-of-concept would simple be a viewer that allows a you to control a character
to wander around a small world with simple view rotations commands.

#### Desires

I want to render the scene to a target texture of a fixed size (initial thought 480:360)
and then used integer scaling to project the texture to the screen with black padding
to preserve the exact integer scaline

I want exact 1-to-1 texel to target pixel for both the character sprites and the
terrain/building tiles. I think that means we need to both 1. snap the charater sprite
billboards to fixed pixel steps relative to the camera and (exact mapping of character
sprites) and 2. snap the camera to fixed pixel coordinates with respect to the world
(exact mapping of terrain coordinates).

I would love to also support the smooth camera movements to follow the character, which
I believe means tracking subpixel offset between render to target texture and render of
the scaled target texture to the screen.

#### Tech stack

I want to have a rough outline of the inputs to display a world (single vs multiple
texture atlases, and (json or toml or msgpack) file that describes the layout of the
atlas(es) and the structure of the world to explore.

I think the POC will simply use THREE.js and should load a single zipped bundle for
world rendering.

### MVP

The minimum-viable-product would be a pair: world viewer world creation engine. The
world viewer that takes character/object spritesheets, and terrain/building tile-sets
and some layout data and renders the world and allows a character to explore (the is the
extension of the POC). The world creation engine would help in creating the world. I
think of it as laying down blocks lego or minecraft style.


