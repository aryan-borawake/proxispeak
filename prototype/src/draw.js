// ---------------------------------------------------------------------------
// DRAWING ON THE CANVAS
// ---------------------------------------------------------------------------
// An HTML5 <canvas> is a blank rectangle of pixels. We draw shapes on it
// with a "2D context" (ctx). Every frame we wipe it and redraw everything
// in its new position — that's how animation works, like a flip-book.
// ---------------------------------------------------------------------------
import { MAP, TILE, TILE_SIZE, MAP_WIDTH, MAP_HEIGHT, MEETING_ROOM } from './map.js'
import { AVATAR_RADIUS } from './world.js'
import { EARSHOT_RADIUS } from './proximity.js'

const COLORS = {
  floorA: '#e8cfa6',
  floorB: '#e1c597',
  floorLine: '#d4b483',
  carpetA: '#a9bdf0',
  carpetB: '#9fb4ea',
  wallTop: '#5b5486',
  wallFace: '#3f3a63',
  desk: '#9a6a3c',
  deskTop: '#b8834f',
  monitor: '#2a2d3e',
  monitorScreen: '#7fd3ff',
}

// The map never changes, so we draw it ONCE onto a hidden canvas and then
// copy that picture each frame. Copying one image is much faster than
// redrawing 450 tiles 60 times per second.
let mapImage = null

function buildMapImage() {
  const canvas = document.createElement('canvas')
  canvas.width = MAP_WIDTH
  canvas.height = MAP_HEIGHT
  const ctx = canvas.getContext('2d')

  MAP.forEach((rowTiles, row) => {
    rowTiles.forEach((tile, col) => {
      const x = col * TILE_SIZE
      const y = row * TILE_SIZE

      if (tile === TILE.WALL) {
        ctx.fillStyle = COLORS.wallFace
        ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE)
        ctx.fillStyle = COLORS.wallTop
        ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE - 8) // lighter top = fake 3D
        return
      }

      // Floor under walkable tiles AND under desks.
      const inMeetingRoom =
        tile === TILE.MEETING ||
        (col >= MEETING_ROOM.col && row >= MEETING_ROOM.row && row < MEETING_ROOM.row + MEETING_ROOM.rows)
      if (inMeetingRoom) {
        ctx.fillStyle = (row + col) % 2 === 0 ? COLORS.carpetA : COLORS.carpetB
        ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE)
      } else {
        // Wooden planks: alternating stripes per row.
        ctx.fillStyle = row % 2 === 0 ? COLORS.floorA : COLORS.floorB
        ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE)
        ctx.fillStyle = COLORS.floorLine
        ctx.fillRect(x + ((row * 13) % TILE_SIZE), y, 1, TILE_SIZE)
      }

      if (tile === TILE.DESK) {
        ctx.fillStyle = COLORS.desk
        ctx.fillRect(x, y + 4, TILE_SIZE, TILE_SIZE - 6)
        ctx.fillStyle = COLORS.deskTop
        ctx.fillRect(x, y + 4, TILE_SIZE, TILE_SIZE - 12)
        if (!inMeetingRoom) {
          // A little computer monitor on each office desk.
          ctx.fillStyle = COLORS.monitor
          ctx.fillRect(x + 9, y + 6, 14, 10)
          ctx.fillStyle = COLORS.monitorScreen
          ctx.fillRect(x + 10, y + 7, 12, 7)
        }
      }
    })
  })

  // Label the meeting room.
  ctx.fillStyle = 'rgba(40, 45, 78, 0.75)'
  ctx.font = 'bold 12px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText(
    'MEETING ROOM',
    (MEETING_ROOM.col + MEETING_ROOM.cols / 2) * TILE_SIZE,
    MEETING_ROOM.row * TILE_SIZE + 20,
  )
  return canvas
}

export function drawMap(ctx) {
  if (!mapImage) mapImage = buildMapImage()
  ctx.drawImage(mapImage, 0, 0)
}

// EARSHOT circle: everyone inside this circle can hear you (and you them).
export function drawEarshot(ctx, player) {
  ctx.beginPath()
  ctx.arc(player.x, player.y, EARSHOT_RADIUS, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(108, 114, 255, 0.12)'
  ctx.fill()
  ctx.setLineDash([6, 5])
  ctx.lineWidth = 2
  ctx.strokeStyle = 'rgba(108, 114, 255, 0.8)'
  ctx.stroke()
  ctx.setLineDash([])
}

// A line from you to each bot you can hear. Thicker/brighter = louder.
export function drawAudioLinks(ctx, player, heard) {
  for (const { bot, volume } of heard) {
    ctx.beginPath()
    ctx.moveTo(player.x, player.y)
    ctx.lineTo(bot.drawX, bot.drawY)
    ctx.strokeStyle = `rgba(6, 214, 160, ${0.25 + volume * 0.75})`
    ctx.lineWidth = 1 + volume * 4
    ctx.stroke()

    // Volume % label in the middle of the line.
    const midX = (player.x + bot.drawX) / 2
    const midY = (player.y + bot.drawY) / 2
    const label = `${Math.round(volume * 100)}%`
    ctx.font = 'bold 11px system-ui, sans-serif'
    ctx.textAlign = 'center'
    const w = ctx.measureText(label).width + 10
    roundRect(ctx, midX - w / 2, midY - 9, w, 18, 9)
    ctx.fillStyle = '#06d6a0'
    ctx.fill()
    ctx.fillStyle = '#10213a'
    ctx.fillText(label, midX, midY + 4)
  }
}

// An avatar = coloured circle + name tag above it (Gather-style).
export function drawAvatar(ctx, x, y, name, color, { isYou = false, talking = false } = {}) {
  // Soft shadow on the floor.
  ctx.beginPath()
  ctx.ellipse(x, y + AVATAR_RADIUS - 1, AVATAR_RADIUS * 0.9, 4, 0, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(0,0,0,0.18)'
  ctx.fill()

  // Body.
  ctx.beginPath()
  ctx.arc(x, y, AVATAR_RADIUS, 0, Math.PI * 2)
  ctx.fillStyle = color
  ctx.fill()
  ctx.lineWidth = 3
  ctx.strokeStyle = talking ? '#06d6a0' : '#ffffff'
  ctx.stroke()

  // Two little eyes so it looks like a character.
  ctx.fillStyle = '#1d1f33'
  ctx.beginPath()
  ctx.arc(x - 4, y - 2, 1.8, 0, Math.PI * 2)
  ctx.arc(x + 4, y - 2, 1.8, 0, Math.PI * 2)
  ctx.fill()

  // Name tag.
  ctx.font = '600 11px system-ui, sans-serif'
  ctx.textAlign = 'center'
  const text = isYou ? `${name} (you)` : name
  const textWidth = ctx.measureText(text).width
  const dotSpace = 12
  const tagW = textWidth + 14 + dotSpace
  const tagH = 18
  const tagX = x - tagW / 2
  const tagY = y - AVATAR_RADIUS - tagH - 6
  roundRect(ctx, tagX, tagY, tagW, tagH, 9)
  ctx.fillStyle = 'rgba(32, 37, 64, 0.88)'
  ctx.fill()
  // Green "online" dot, like Gather.
  ctx.beginPath()
  ctx.arc(tagX + 10, tagY + tagH / 2, 3.5, 0, Math.PI * 2)
  ctx.fillStyle = '#06d6a0'
  ctx.fill()
  ctx.fillStyle = '#ffffff'
  ctx.fillText(text, x + dotSpace / 2, tagY + 13)
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}
