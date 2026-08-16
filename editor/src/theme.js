// Everything stylistic lives in style.css. This reads it back out, so the app
// and the stylesheet can never disagree about what the palette is.

const css = (name) => {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  // An empty token means the stylesheet had not been applied when this ran —
  // which used to surface as every strand quietly rendering white.
  if (!value) throw new Error(`theme: ${name} is not defined; is style.css loaded?`);
  return value;
};

/** Saturation and lightness every strand colour shares. Only hue varies. */
export const STRAND_S = Number(css('--strand-s'));
export const STRAND_L = Number(css('--strand-l'));

export const PALETTE = Array.from({ length: 9 }, (_, i) => css(`--strand-${i + 1}`));

/** Where the draw cycle starts. */
export const DEFAULT_COLOR = css('--strand-default');

/** Tube radius a strand gets unless it says otherwise, in world units. */
export const DEFAULT_RADIUS = Number(css('--strand-radius'));

/** The strand colour at a given hue, on the locked S/L. */
export function hueColor(h) {
  return `hsl(${((h % 360) + 360) % 360} ${STRAND_S}% ${STRAND_L}%)`;
}

/** Hue of a strand colour, so the picker opens where the strand already is. */
export function colorHue(value) {
  const hsl = /hsl\(\s*([\d.]+)/.exec(value);
  if (hsl) return Number(hsl[1]);

  const hex = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(value.trim());
  if (!hex) return 0;
  const [r, g, b] = [1, 2, 3].map((i) => parseInt(hex[i], 16) / 255);
  const max = Math.max(r, g, b);
  const span = max - Math.min(r, g, b);
  if (!span) return 0;

  const sixth =
    max === r ? (g - b) / span : max === g ? (b - r) / span + 2 : (r - g) / span + 4;
  return ((sixth * 60) % 360 + 360) % 360;
}
