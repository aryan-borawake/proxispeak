// ---------------------------------------------------------------------------
// FAKE NETWORK
// ---------------------------------------------------------------------------
// In a real multiplayer app, every time you move we must tell the server
// "I am now at (x, y)" so everyone else can see you move.
//
// The game draws ~60 frames per second. Sending a message on EVERY frame
// would be 60 messages per second, per person — a lot of wasted traffic,
// because other people can't tell the difference between 60 and 10 updates
// once interpolation smooths it out (see Game.jsx).
//
// THROTTLING = deliberately limiting how often something is allowed to
// happen. Here: "send at most 10 position messages per second, no matter
// how many frames we draw".
// ---------------------------------------------------------------------------

export const SENDS_PER_SECOND = 10
export const SEND_INTERVAL_MS = 1000 / SENDS_PER_SECOND // 100 ms

export function createFakeNetwork() {
  return {
    totalSent: 0, // how many messages we've "sent" since joining
    lastSentAt: -Infinity, // time (ms) of the last allowed send
    lastPayload: null, // what we sent last time (shown in the debug panel)
  }
}

// Pretend to send our position to a server. Nothing actually leaves your
// computer — we just count the calls so we can show the number on screen.
export function sendPosition(net, x, y) {
  net.totalSent++
  net.lastPayload = { x: Math.round(x), y: Math.round(y) }
  // A real version would be something like:
  //   socket.send(JSON.stringify({ type: 'move', x, y }))
}

// Called once per frame. Decides whether we're allowed to send right now.
export function maybeSendPosition(net, player, now, throttlingOn) {
  if (!throttlingOn) {
    // Throttling OFF: send every single frame (~60/sec).
    sendPosition(net, player.x, player.y)
    return
  }

  // Throttling ON: only send if at least 100 ms have passed since last time.
  if (now - net.lastSentAt >= SEND_INTERVAL_MS) {
    // Step the "last sent" clock forward by exactly 100 ms (not to `now`), so
    // small frame-timing wobbles don't drag us below 10/sec. If we fell far
    // behind (e.g. tab was hidden), just restart from now.
    net.lastSentAt = Math.max(net.lastSentAt + SEND_INTERVAL_MS, now - SEND_INTERVAL_MS)
    sendPosition(net, player.x, player.y)
  }
}
