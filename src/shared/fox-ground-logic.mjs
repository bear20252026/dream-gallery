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
export const CLOUDS = 'Nubes_2'; // lowered to a low mist bank
export const CLOUD_LIFT = 0.3; // m of mist above the sand
export const SEAT_LANTERN = 0.35; // m above the sand for the glowing seat marker
