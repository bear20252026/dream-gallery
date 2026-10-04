// fox-ground-logic.mjs — keeps the fox diorama (scene10-fox) on the sand (2026-10-04).
// The Sketchfab diorama has its own origin, so loaded as-is it hovered about 0.7-1.1 m above the terrain
// with a strip of cloud 3.7 m up. These pure helpers do the arithmetic; the scene applies the shifts.

/** How far (in y) to move an object whose lowest point is `minY` so that it rests `clearance` above `groundY`. */
export function groundShift(minY, groundY, clearance = 0) {
  if (![minY, groundY, clearance].every(Number.isFinite)) return 0;
  return groundY + clearance - minY;
}

/**
 * Lowest terrain height over an (n+1) x (n+1) grid of samples inside a footprint.
 * `box` is {minX, maxX, minZ, maxZ}; `heightAt(x, z)` is the terrain height.
 */
export function lowestGround(heightAt, box, n = 4) {
  let low = Infinity;
  const steps = Math.max(1, Math.floor(n));
  for (let i = 0; i <= steps; i++) {
    for (let j = 0; j <= steps; j++) {
      const x = box.minX + ((box.maxX - box.minX) * i) / steps;
      const z = box.minZ + ((box.maxZ - box.minZ) * j) / steps;
      const h = heightAt(x, z);
      if (Number.isFinite(h) && h < low) low = h;
    }
  }
  return Number.isFinite(low) ? low : 0;
}

// Parts of the diorama and how each one is grounded.
export const STAGE = 'Escenario_0'; // the rocky stage: sunk just under the lowest sand in its footprint
export const STAGE_SINK = 0.12; // m below that lowest sand, so no gap shows on the low side
export const STANDING = ['Zorro_5', 'Principito_4', 'Pasto_8', 'Trigo_9']; // fox, prince, grass, wheat: feet on the sand under them
// Backdrop pieces of the original diorama that look wrong in an open desert: the grey stone wedge and spiky
// sheets (Object_4, Object_6), the flat slabs that only peek out of the sand (Object_5, 7, 8) and the cloud strip.
// The leafy trees (Object_9 trunks, Hojas_3 leaves), the fox, the prince, the grass and the wheat stay.
export const HIDDEN_PARTS = ['Nubes_2', 'Object_4', 'Object_5', 'Object_6', 'Object_7', 'Object_8'];
export const SEAT_LANTERN = 0.35; // m above the sand for the glowing seat marker

/**
 * A round meadow patch as a flat disc of rings: positions are offsets from the centre (x, z) with an alpha
 * that is solid in the middle and fades to zero at the rim, so it blends into the sand. The scene sets each
 * vertex height from the terrain, so the patch follows the dunes.
 * Returns { verts: [{x, z, a, t}], index: number[] } where t is 0 at the centre and 1 at the rim.
 */
export function meadowDisc(radius = 5.5, rings = 7, segments = 28, solid = 0.55) {
  const verts = [{ x: 0, z: 0, a: 1, t: 0 }];
  for (let r = 1; r <= rings; r++) {
    const t = r / rings;
    const a = t <= solid ? 1 : Math.max(0, 1 - (t - solid) / (1 - solid));
    for (let k = 0; k < segments; k++) {
      const ang = (k / segments) * Math.PI * 2;
      verts.push({ x: Math.cos(ang) * radius * t, z: Math.sin(ang) * radius * t, a, t });
    }
  }
  const index = [];
  const ring = (r, k) => 1 + (r - 1) * segments + (k % segments);
  for (let k = 0; k < segments; k++) index.push(0, ring(1, k + 1), ring(1, k));
  for (let r = 1; r < rings; r++) {
    for (let k = 0; k < segments; k++) {
      const a = ring(r, k),
        b = ring(r, k + 1),
        c = ring(r + 1, k),
        d = ring(r + 1, k + 1);
      index.push(a, b, d, a, d, c);
    }
  }
  return { verts, index };
}
export const MEADOW_RADIUS = 5.5;
export const MEADOW_LIFT = 0.04; // m above the sand, so the patch never sinks into it
