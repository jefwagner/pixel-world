# Output format and core API

Status: implemented — `project_tiles` and `save_projection` (2026-10-31).

This note fixes the generator's output contract so `pixel-world`'s loader can be
written against it while the projection code is still being built. It covers the
manifest, the two spritesheet layouts, and the Python API the CLI and notebooks
will share.

## Conventions

- Coordinates are pixels, y-down.
- `x`, `y` is the upper-left texel of a view; the rectangle is half-open:
  `x <= px < x+width`, `y <= py < y+height`.
- All sheet paths in the manifest are relative to the manifest file.
- Spritesheets are RGBA PNGs; unused pixels are transparent.
- Cardinal view canvas: **14×7**.
- Diagonal view canvas: **20×9**. The 20×10 figure from Pixel-Math is the
  theoretical outline extent; the actual rasterized diamond is 9 rows with
  widths 4, 8, 12, 16, 20, 16, 12, 8, 4.

## Manifest

```json
{
  "version": 1,
  "spritesheets": [
    { "name": "cardinal", "file": "grass.cardinal.png", "width": 56, "height": 70 },
    { "name": "diagonal", "file": "grass.diagonal.png", "width": 80, "height": 90 }
  ],
  "tiles": {
    "grass": {
      "N":  { "sheet": "cardinal", "x": 0, "y": 0, "width": 14, "height": 7 },
      "E":  { "sheet": "cardinal", "x": 14, "y": 0, "width": 14, "height": 7 },
      "S":  { "sheet": "cardinal", "x": 28, "y": 0, "width": 14, "height": 7 },
      "W":  { "sheet": "cardinal", "x": 42, "y": 0, "width": 14, "height": 7 },
      "NE": { "sheet": "diagonal", "x": 0, "y": 0, "width": 20, "height": 9 },
      "SE": { "sheet": "diagonal", "x": 20, "y": 0, "width": 20, "height": 9 },
      "SW": { "sheet": "diagonal", "x": 40, "y": 0, "width": 20, "height": 9 },
      "NW": { "sheet": "diagonal", "x": 60, "y": 0, "width": 20, "height": 9 }
    }
  }
}
```

- Views reference a sheet by its `name`, not an array index: an index would break
  silently if the list were ever reordered, and a name is readable by hand.
- `width`/`height` are stored per view even though they are currently fixed per view
  class. They are what the consumer samples, and they allow per-tile offsets
  when diagonal packing is added later.
- `version` lets the loader reject or migrate future format changes.
- `spritesheets[].width`/`height` are redundant with the PNG but make the
  manifest inspectable and let the loader validate what it opens.

## Spritesheet layout

Two sheets, one per view class, each tile occupying one row.

### Cardinal sheet — `*.cardinal.png`

- Four views per tile row, in the order **N, E, S, W**.
- Each view is 14×7, so a tile row is exactly 4 × 14 = **56 wide**.
- Height is `7 × tile_count`.
- No padding and no wasted pixels for a flat tile layout.

### Diagonal sheet — `*.diagonal.png`

- Four views per tile row, in the order **NE, SE, SW, NW**.
- Each view cell is 20×9, so a tile row is 4 × 20 = **80 wide**.
- Height is `9 × tile_count`.
- Cells are fixed-size for now (~56% fill). Interleaving diamonds with
  per-view offsets is a deliberate later optimization; the manifest already
  supports it.

## Python API

Pure generation is separated from file I/O so the same core can be used from a
notebook and from a CLI.

```python
TileInput = tuple[Image.Image, tuple[int, int, int, int]]
# (source image, crop rectangle as x, y, width, height)

@dataclass(frozen=True)
class Projection:
    cardinal: Image.Image
    diagonal: Image.Image
    manifest: dict

def project_tiles(name: str, tiles: Mapping[str, TileInput]) -> Projection:
    """Project flat top-down square tiles into cardinal and diagonal views."""
    ...

def save_projection(result: Projection, out_dir: Path, name: str) -> None:
    """Write <name>.cardinal.png, <name>.diagonal.png, and <name>.json."""
    ...
```

- `project_tiles` returns images and a manifest dict; it does no file I/O.
- `name` is the output stem and the base for the PNG/manifest filenames.
- A notebook can inspect or display `Projection.cardinal` / `.diagonal`
  directly; a CLI loads source sheets, builds the mapping, calls
  `project_tiles`, then `save_projection`.
- Tile names are supplied by the caller via the mapping keys.
- Ordering is deterministic: tile names are sorted, so sheet rows and manifest
  entries are reproducible regardless of dict insertion order.
- Input validation at the boundary: crops must lie inside their source images,
  and tile names must be non-empty and unique (guaranteed by the mapping, but
  checked for clarity).

## Implementation notes

- The four orientations of each view class are exact 90° counter-clockwise
  source transposes, in manifest order.
- Diagonal sampling inverts the square-to-diamond mapping for each output texel
  centre. The diamond is centred at `(10, 4.5)` and its outline extends half a
  pixel beyond the top and bottom rows; that is what produces the agreed
  4/8/…/20 pixel-centre row profile.
- `save_projection` derives the manifest filename from the cardinal sheet
  filename (`<name>.cardinal.png` → `<name>.json`), so the manifest remains the
  source of truth for output file names.

## Open items

- How the CLI derives tile names from source sheets — explicit input mapping
  first, then a grid/row-column convention if useful.
- Diagonal packing with per-view offsets.
- Wall / parallelogram views — later; this format has no representation for
  them yet.
