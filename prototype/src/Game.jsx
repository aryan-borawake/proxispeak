import { useEffect, useRef, useState } from 'react'
import { MAP_WIDTH, MAP_HEIGHT, SPAWN_POINT } from './map.js'
import { updatePlayer, createBots, stepBots, BOT_TICK_MS } from './world.js'
import { getAudioMix } from './proximity.js'
import { createFakeNetwork, maybeSendPosition } from './network.js'
import { drawMap, drawEarshot, drawAudioLinks, drawAvatar } from './draw.js'
import DebugPanel from './DebugPanel.jsx'

const MOVE_KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd']

// How often we copy numbers from the game into the React debug panel.
// The game itself runs every frame; the panel only needs a few updates per
// second to be readable (re-rendering React 60x/sec would be wasteful).
const PANEL_REFRESH_MS = 200

export default function Game({ playerName, playerColor, onLeave }) {
  const canvasRef = useRef(null)

  // The two on/off switches. React state drives the buttons; the matching
  // "ref" lets the game loop read the latest value without restarting.
  const [throttling, setThrottling] = useState(true)
  const [interpolation, setInterpolation] = useState(true)
  const settingsRef = useRef({ throttling, interpolation })
  settingsRef.current = { throttling, interpolation }

  const [stats, setStats] = useState(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')

    // Make the canvas sharp on high-resolution ("retina") screens.
    const dpr = window.devicePixelRatio || 1
    canvas.width = MAP_WIDTH * dpr
    canvas.height = MAP_HEIGHT * dpr
    ctx.scale(dpr, dpr)

    // ----- All the game's data lives in plain objects (not React state) -----
    const player = { x: SPAWN_POINT.x, y: SPAWN_POINT.y }
    const bots = createBots()
    const net = createFakeNetwork()
    const keys = new Set() // which keys are held down right now

    // ----- Keyboard -----
    const onKeyDown = (e) => {
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key
      if (MOVE_KEYS.includes(key)) {
        keys.add(key)
        e.preventDefault() // stop arrow keys from scrolling the page
      }
    }
    const onKeyUp = (e) => {
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key
      keys.delete(key)
    }
    const onBlur = () => keys.clear() // switching tabs = let go of all keys
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)

    // ----- Counters for the debug panel -----
    // FPS = "frames per second": how many pictures we drew in the last second.
    let framesThisSecond = 0
    let fps = 0
    let sendsAtSecondStart = 0
    let sendsPerSecond = 0
    let secondStartedAt = performance.now()
    let lastPanelUpdate = 0

    let lastFrameTime = performance.now()
    let lastBotTick = performance.now()
    let rafId = 0

    // =======================================================================
    // THE GAME LOOP
    // =======================================================================
    // requestAnimationFrame(frame) asks the browser: "call `frame` right
    // before you next paint the screen". Inside `frame` we ask again, so it
    // runs forever, once per screen refresh (usually 60 times per second).
    // Each run is one FRAME: read input -> update the world -> draw it.
    function frame(now) {
      // dt = seconds since the previous frame. Capped at 0.1 s so that
      // coming back to a hidden tab doesn't teleport you through a wall.
      const dt = Math.min((now - lastFrameTime) / 1000, 0.1)
      lastFrameTime = now

      // 1) UPDATE YOU — every frame, so your own movement feels instant.
      updatePlayer(player, keys, dt)

      // 2) TELL "THE SERVER" WHERE YOU ARE — throttled to 10/sec (or not).
      maybeSendPosition(net, player, now, settingsRef.current.throttling)

      // 3) UPDATE THE BOTS — only 10 times per second (every 100 ms),
      //    imitating position updates arriving from a server.
      if (now - lastBotTick > 1000) lastBotTick = now - BOT_TICK_MS // tab was hidden; don't replay
      while (now - lastBotTick >= BOT_TICK_MS) {
        stepBots(bots)
        lastBotTick += BOT_TICK_MS
      }

      // 4) WORK OUT WHERE TO DRAW EACH BOT.
      // INTERPOLATION = filling in the in-between positions.
      // We only know where a bot was at the last two updates (100 ms apart).
      // `t` says how far we are between those updates: 0 = just got the
      // update, 1 = the next one is due. Drawing the bot at
      //     previous + (latest - previous) * t
      // makes it glide smoothly instead of jumping 10 times per second.
      // (The cost: what you see is up to 100 ms behind the newest data.)
      const t = Math.min((now - lastBotTick) / BOT_TICK_MS, 1)
      for (const bot of bots) {
        if (settingsRef.current.interpolation) {
          bot.drawX = bot.prevX + (bot.x - bot.prevX) * t
          bot.drawY = bot.prevY + (bot.y - bot.prevY) * t
        } else {
          // No interpolation: draw exactly the latest position. Because it
          // only changes 10x/sec, the bot visibly hops along.
          bot.drawX = bot.x
          bot.drawY = bot.y
        }
      }

      // 5) PROXIMITY AUDIO — who is within earshot, how loud, which side?
      const heard = []
      const audio = bots.map((bot) => {
        const mix = getAudioMix(player, { x: bot.drawX, y: bot.drawY })
        if (mix.inEarshot) heard.push({ bot, volume: mix.volume })
        return { name: bot.name, color: bot.color, ...mix }
      })

      // 6) DRAW EVERYTHING (back to front, like painting layers).
      ctx.clearRect(0, 0, MAP_WIDTH, MAP_HEIGHT)
      drawMap(ctx)
      drawEarshot(ctx, player)
      drawAudioLinks(ctx, player, heard)
      for (const bot of bots) {
        const isHeard = heard.some((h) => h.bot === bot)
        drawAvatar(ctx, bot.drawX, bot.drawY, bot.name, bot.color, { talking: isHeard })
      }
      drawAvatar(ctx, player.x, player.y, playerName, playerColor, { isYou: true })

      // 7) COUNT FRAMES and SENDS; once per second, turn counts into "/sec".
      framesThisSecond++
      if (now - secondStartedAt >= 1000) {
        const seconds = (now - secondStartedAt) / 1000
        fps = Math.round(framesThisSecond / seconds)
        sendsPerSecond = Math.round((net.totalSent - sendsAtSecondStart) / seconds)
        framesThisSecond = 0
        sendsAtSecondStart = net.totalSent
        secondStartedAt = now
      }

      // 8) Every 200 ms, hand a snapshot of the numbers to React.
      if (now - lastPanelUpdate >= PANEL_REFRESH_MS) {
        lastPanelUpdate = now
        setStats({
          fps,
          sendsPerSecond,
          totalSent: net.totalSent,
          lastPayload: net.lastPayload,
          player: { x: Math.round(player.x), y: Math.round(player.y) },
          audio,
        })
      }

      rafId = requestAnimationFrame(frame) // ...and again next frame!
    }

    rafId = requestAnimationFrame(frame)

    // Clean up when leaving the game screen.
    return () => {
      cancelAnimationFrame(rafId)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [playerName, playerColor])

  const heardCount = stats ? stats.audio.filter((a) => a.inEarshot).length : 0

  return (
    <div className="game-shell">
      <div className="game-main">
        <div className="map-stage">
          <canvas
            ref={canvasRef}
            className="map-canvas"
            style={{ aspectRatio: `${MAP_WIDTH} / ${MAP_HEIGHT}` }}
          />
        </div>

        {/* Bottom toolbar, Gather-style */}
        <div className="toolbar">
          <div className="toolbar-left">
            <span className="brand">◆ Proximity Office</span>
            <div className="me-chip">
              <span className="me-avatar" style={{ background: playerColor }} />
              <span className="me-name">{playerName}</span>
              <span className="status-dot" /> Available
            </div>
          </div>
          <div className="toolbar-center">
            <kbd>W</kbd>
            <kbd>A</kbd>
            <kbd>S</kbd>
            <kbd>D</kbd>
            <span className="muted">or arrow keys to move</span>
          </div>
          <div className="toolbar-right">
            <span className="pill">
              🔊 {heardCount} in earshot
            </span>
            <button className="leave-btn" onClick={onLeave}>
              Leave
            </button>
          </div>
        </div>
      </div>

      <DebugPanel
        stats={stats}
        throttling={throttling}
        onToggleThrottling={() => setThrottling((v) => !v)}
        interpolation={interpolation}
        onToggleInterpolation={() => setInterpolation((v) => !v)}
        playerName={playerName}
        playerColor={playerColor}
      />
    </div>
  )
}
