// Where a field lands on the real page. Fields are stored in percent of the page AS A PERSON SEES IT (turned the right way up);
// the PDF's own coordinates may be turned by /Rotate and start at the crop box. Everything is drawn in "displayed" points
// (origin bottom-left of the page as seen, x to the right, y up) and one matrix carries that onto the page's own space.
export type Rotation = 0 | 90 | 180 | 270;
export type Crop = { x: number; y: number; width: number; height: number };
export type Matrix = [number, number, number, number, number, number];

export const normalizeRotation = (angle: number): Rotation => {
  const r = ((Math.round(angle) % 360) + 360) % 360;
  return r === 90 || r === 180 || r === 270 ? r : 0;
};

/** Size of the page as seen, in points. */
export const displaySize = (rot: Rotation, c: Crop) => (rot === 90 || rot === 270 ? { w: c.height, h: c.width } : { w: c.width, h: c.height });

/** [a b c d e f] of the PDF `cm` operator: displayed point (u, v) becomes page point (a*u + c*v + e, b*u + d*v + f). */
export function displayMatrix(rot: Rotation, c: Crop): Matrix {
  switch (rot) {
    case 0: return [1, 0, 0, 1, c.x, c.y];
    case 90: return [0, 1, -1, 0, c.x + c.width, c.y];
    case 180: return [-1, 0, 0, -1, c.x + c.width, c.y + c.height];
    case 270: return [0, -1, 1, 0, c.x, c.y + c.height];
  }
}

export const applyMatrix = (m: Matrix, u: number, v: number) => ({ x: m[0] * u + m[2] * v + m[4], y: m[1] * u + m[3] * v + m[5] });

/** A field box (percent from the top-left of the page as seen) as a rectangle in displayed points (origin bottom-left). */
export function boxToDisplay(box: { x: number; y: number; w: number; h: number }, size: { w: number; h: number }) {
  const w = (box.w / 100) * size.w, h = (box.h / 100) * size.h;
  return { x: (box.x / 100) * size.w, y: size.h - (box.y / 100) * size.h - h, w, h };
}
