/**
 * Spatial Audio Formulas for ProxiSpeak (Module 4)
 * 
 * Rules:
 * - Earshot distance: 100px. Volume must be 0 at >= 100px.
 * - Direction to pan: speaker to right -> positive pan; speaker to left -> negative pan.
 */

export const EARSHOT_PX = 100;
export const DISCONNECT_PX = 140;

/**
 * Converts distance in pixels to an audio gain (volume) value between 0.0 and 1.0.
 * Uses a smooth cosine/gentle falloff curve for natural acoustics.
 * 
 * @param {number} distancePx - Distance between self and the other avatar in pixels.
 * @param {string} [curve='smooth'] - 'linear' | 'smooth' | 'quadratic'
 * @returns {number} Gain value from 0.0 (silent) to 1.0 (full volume).
 */
export function distanceToGain(distancePx, curve = 'smooth') {
  if (distancePx <= 0) return 1.0;
  if (distancePx >= EARSHOT_PX) return 0.0;

  const normalized = distancePx / EARSHOT_PX; // 0 to 1

  switch (curve) {
    case 'linear':
      // Straight line: 1 - d/100
      return Math.max(0, Math.min(1, 1 - normalized));
    case 'quadratic':
      // Gentle drop early, steeper drop later
      return Math.max(0, Math.min(1, Math.pow(1 - normalized, 2)));
    case 'smooth':
    default:
      // Half-cosine curve: smooth roll-off without sharp corners at 0 and 100px
      return Math.max(0, Math.min(1, 0.5 * (1 + Math.cos(normalized * Math.PI))));
  }
}

/**
 * Converts horizontal delta (dx = target.x - self.x) to stereo panning [-1.0 .. 1.0].
 * - dx > 0 : Person is to our right -> sound pans right (> 0)
 * - dx < 0 : Person is to our left -> sound pans left (< 0)
 * 
 * Clamped between -0.9 and +0.9 so users never experience total silence in one ear.
 * 
 * @param {number} dxPx - Horizontal distance in pixels.
 * @param {number} [panWidth=80] - Distance at which maximum pan is achieved.
 * @returns {number} Panning value between -0.9 and +0.9.
 */
export function dxToPan(dxPx, panWidth = 80) {
  if (dxPx === 0) return 0.0;
  const rawPan = dxPx / panWidth;
  // Clamp to [-0.9, 0.9] for comfortable listening
  return Math.max(-0.9, Math.min(0.9, rawPan));
}

/**
 * Helper to generate a diagnostic table of distance to gain across distances (0 to 140 px).
 * Matches Task 3 requirement.
 */
export function generateVolumeTable() {
  const steps = [];
  for (let d = 0; d <= 140; d += 10) {
    steps.push({
      distance: d,
      linearGain: Number(distanceToGain(d, 'linear').toFixed(3)),
      smoothGain: Number(distanceToGain(d, 'smooth').toFixed(3)),
      quadraticGain: Number(distanceToGain(d, 'quadratic').toFixed(3)),
    });
  }
  return steps;
}
