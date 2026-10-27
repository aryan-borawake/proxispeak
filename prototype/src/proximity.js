// ---------------------------------------------------------------------------
// PROXIMITY AUDIO MATHS
// ---------------------------------------------------------------------------
// "Proximity audio" means you only hear people who are near you, and the
// closer they are, the louder they sound — just like a real room.
//
// EARSHOT = the distance within which you can hear someone.
// Here it is 100 pixels (about 3 tiles). Outside the earshot circle the
// volume is 0, so in a real app we would not even connect to their audio.
// ---------------------------------------------------------------------------

export const EARSHOT_RADIUS = 100 // pixels

// listener = you, source = the person talking.
export function getAudioMix(listener, source) {
  const dx = source.x - listener.x // positive = they are to your right
  const dy = source.y - listener.y
  const distance = Math.hypot(dx, dy) // straight-line distance (Pythagoras)

  if (distance > EARSHOT_RADIUS) {
    return { inEarshot: false, distance, volume: 0, pan: 0 }
  }

  // VOLUME: 1.0 (100%) when standing on top of them, fading to 0 at the
  // edge of earshot. This is a simple straight-line ("linear") fade.
  const volume = 1 - distance / EARSHOT_RADIUS

  // PAN: which speaker/ear the sound comes from.
  //   -1 = fully LEFT ear, 0 = centre (both ears), +1 = fully RIGHT ear.
  // We only care about left/right here, so we use the horizontal offset dx.
  const pan = Math.max(-1, Math.min(1, dx / EARSHOT_RADIUS))

  // In a real app you'd feed these numbers into the Web Audio API:
  //   gainNode.gain.value = volume
  //   stereoPannerNode.pan.value = pan
  return { inEarshot: true, distance, volume, pan }
}
