// ---------------------------------------------------------------------------
// MOVEMENT, COLLISION AND BOTS
// ---------------------------------------------------------------------------
import { TILE_SIZE, tileAt, isSolid, tileCenter } from './map.js'

export const AVATAR_RADIUS = 11 // avatars are circles this many pixels wide from the centre
export const PLAYER_SPEED = 160 // pixels per second

// ---------- Collision ------------------------------------------------------
// "Collision" = checking whether a thing would overlap a wall or desk.
// We treat the avatar as a small square box around its centre and ask:
// does that box touch any solid tile?
export function collides(x, y, radius = AVATAR_RADIUS) {
  const leftCol = Math.floor((x - radius) / TILE_SIZE)
  const rightCol = Math.floor((x + radius - 0.01) / TILE_SIZE)
  const topRow = Math.floor((y - radius) / TILE_SIZE)
  const bottomRow = Math.floor((y + radius - 0.01) / TILE_SIZE)

  for (let row = topRow; row <= bottomRow; row++) {
    for (let col = leftCol; col <= rightCol; col++) {
      if (isSolid(tileAt(col, row))) return true
    }
  }
  return false
}

// Try to move by (dx, dy). We test the X and Y directions separately, so if
// you walk diagonally into a wall you still "slide" along it instead of
// getting stuck.
export function moveWithCollision(entity, dx, dy) {
  if (dx !== 0 && !collides(entity.x + dx, entity.y)) entity.x += dx
  if (dy !== 0 && !collides(entity.x, entity.y + dy)) entity.y += dy
}

// ---------- Player ---------------------------------------------------------
// Called once per FRAME. A "frame" is one picture drawn on the screen;
// the browser draws about 60 of them every second.
//
// `dt` ("delta time") is how many seconds passed since the last frame
// (about 0.016 s at 60 FPS). Multiplying speed by dt means the avatar moves
// at the same speed whether your computer draws 30 or 144 frames per second.
export function updatePlayer(player, keys, dt) {
  let dirX = 0
  let dirY = 0
  if (keys.has('ArrowLeft') || keys.has('a')) dirX -= 1
  if (keys.has('ArrowRight') || keys.has('d')) dirX += 1
  if (keys.has('ArrowUp') || keys.has('w')) dirY -= 1
  if (keys.has('ArrowDown') || keys.has('s')) dirY += 1

  if (dirX === 0 && dirY === 0) return

  // Moving diagonally would otherwise be ~41% faster (Pythagoras!), so we
  // shrink the direction to length 1.
  const length = Math.hypot(dirX, dirY)
  dirX /= length
  dirY /= length

  moveWithCollision(player, dirX * PLAYER_SPEED * dt, dirY * PLAYER_SPEED * dt)
}

// ---------- Bots -----------------------------------------------------------
// The bots pretend to be other people in the office. In a real app their
// positions would arrive from a server over the network. To imitate that,
// we only update ("tick") them 10 times per second, NOT every frame.
export const BOT_TICK_MS = 100 // 1000 ms / 10 = one update every 100 ms
const BOT_SPEED = 80 // pixels per second

const BOT_DEFINITIONS = [
  { name: 'Maya', color: '#ff7b9c', start: tileCenter(12, 8) },
  { name: 'Leo', color: '#ffb547', start: tileCenter(19, 5) },
  { name: 'Priya', color: '#4ecdc4', start: tileCenter(20, 15) },
]

export function createBots() {
  return BOT_DEFINITIONS.map((def) => ({
    name: def.name,
    color: def.color,
    // x / y = the newest position "the server" told us about.
    x: def.start.x,
    y: def.start.y,
    // prevX / prevY = the position from the update before that.
    // We need both to do interpolation (see Game.jsx).
    prevX: def.start.x,
    prevY: def.start.y,
    dirX: 0,
    dirY: 0,
    ticksUntilTurn: 0,
  }))
}

function pickNewDirection(bot) {
  if (Math.random() < 0.25) {
    // Sometimes just stand still for a moment, like a real person chatting.
    bot.dirX = 0
    bot.dirY = 0
  } else {
    const angle = Math.random() * Math.PI * 2
    bot.dirX = Math.cos(angle)
    bot.dirY = Math.sin(angle)
  }
  bot.ticksUntilTurn = 10 + Math.floor(Math.random() * 25) // 1 to 3.5 seconds
}

// One "server tick": move every bot a little. Runs 10 times per second.
export function stepBots(bots) {
  const step = BOT_SPEED * (BOT_TICK_MS / 1000) // 8 px per tick

  for (const bot of bots) {
    // Remember where it was, so the screen can slide from old -> new.
    bot.prevX = bot.x
    bot.prevY = bot.y

    if (bot.ticksUntilTurn <= 0) pickNewDirection(bot)
    bot.ticksUntilTurn--

    const beforeX = bot.x
    const beforeY = bot.y
    moveWithCollision(bot, bot.dirX * step, bot.dirY * step)

    // Bumped into a wall or desk? Pick a new random direction next tick.
    const isMoving = bot.dirX !== 0 || bot.dirY !== 0
    const barelyMoved = Math.abs(bot.x - beforeX) + Math.abs(bot.y - beforeY) < step * 0.5
    if (isMoving && barelyMoved) bot.ticksUntilTurn = 0
  }
}
