// client/src/world/officeOverlay.js — Person 3's world module, office layer added by Person 1 (v5)
// Everything drawn ON TOP of the map in the Infotact office: department borders around their desk
// blocks, darkened closed wings with an "Opens at tier N" sign, room labels, the elevator, the
// pulse on my desk, avatars and name tags with a status dot.
//
// Two kinds of drawing:
//   world space  — positions in map pixels; the camera's zoom and shift apply (borders, avatars).
//   screen space — positions on the screen; text stays the same size at every zoom (labels).
// WorldCanvas sets the canvas transform for world space, and resets it for screen space.
//
// buildOverlay() does the slow work (which edges of which desks form a department's outline) ONCE
// when the office changes, so each frame only draws ready-made lines.

/** Darken a hex colour like '#2f80ed' and give it an alpha: hexToRgba('#2f80ed', 0.1). */
export function hexToRgba(hex, alpha) {
  const value = parseInt(String(hex).replace('#', ''), 16);
  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

/**
 * Turn the floor plan (layout) and the floor's snapshot (office) into ready-to-draw shapes.
 *
 * A department's outline: every desk owns a 4 × 4-tile square ("area"). A side of a square is part
 * of the outline when the square next to it (same wing, row ± 1 or col ± 1) is NOT in the same
 * department. Example: Engineering = desks in row 0, cols 0–4 and row 1, cols 3–4 → an L-shaped outline.
 *
 * @param {{ layout: object | null, office: object | null }} input
 * @returns {object | null}
 */
export function buildOverlay({ layout, office }) {
  if (!layout) return null;
  const desksById = new Map(layout.desks.map((desk) => [desk.id, desk]));
  const openWings = new Set(office ? office.openWings : layout.wings.map((wing) => wing.id));

  const departments = (office ? office.departments : []).map((department) => {
    const desks = department.deskIds.map((id) => desksById.get(id)).filter(Boolean);
    const cellKey = (wingId, row, col) => `${wingId}:${row}:${col}`;
    const inBlock = new Set(desks.map((desk) => cellKey(desk.wingId, desk.row, desk.col)));
    const edges = [];
    for (const desk of desks) {
      const { x, y, w, h } = desk.area;
      if (!inBlock.has(cellKey(desk.wingId, desk.row - 1, desk.col))) edges.push([x, y, x + w, y]);
      if (!inBlock.has(cellKey(desk.wingId, desk.row + 1, desk.col))) edges.push([x, y + h, x + w, y + h]);
      if (!inBlock.has(cellKey(desk.wingId, desk.row, desk.col - 1))) edges.push([x, y, x, y + h]);
      if (!inBlock.has(cellKey(desk.wingId, desk.row, desk.col + 1))) edges.push([x + w, y, x + w, y + h]);
    }
    // The label goes on the top-left desk of the block.
    const first = [...desks].sort((a, b) => a.area.y - b.area.y || a.area.x - b.area.x)[0];
    return {
      id: department.id,
      name: department.name,
      color: department.color,
      areas: desks.map((desk) => desk.area),
      edges,
      labelAt: first ? { x: first.area.x + 6, y: first.area.y + 4 } : null,
    };
  });

  const closedWings = layout.wings.filter((wing) => !openWings.has(wing.id));
  return {
    departments,
    closedWings,
    // The browser's collision check also blocks closed wings (the server refuses those moves too).
    blockedRects: closedWings.map((wing) => wing.rect),
    rooms: layout.rooms.filter((room) => !room.id.startsWith('wing-') && !room.id.includes('corridor') && room.id !== 'hallway'),
    elevator: layout.elevator,
    wings: layout.wings,
  };
}

/** Is an avatar at (x, y) inside one of the blocked rectangles? (Same middle point as the server.) */
export function isBlockedByOverlay(overlay, x, y) {
  if (!overlay) return false;
  const middleX = x + 12;
  const middleY = y + 16;
  return overlay.blockedRects.some((r) => middleX >= r.x && middleX < r.x + r.w && middleY >= r.y && middleY < r.y + r.h);
}

/** World space: a pale fill and a thick coloured outline around each department's desks. */
export function drawDepartmentBlocks(ctx, overlay) {
  for (const department of overlay.departments) {
    ctx.fillStyle = hexToRgba(department.color, 0.13);
    for (const area of department.areas) ctx.fillRect(area.x, area.y, area.w, area.h);
    ctx.strokeStyle = hexToRgba(department.color, 0.9);
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (const [x1, y1, x2, y2] of department.edges) {
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
    }
    ctx.stroke();
  }
}

/** World space: closed wings are darkened, with hatching, so they read as "not open yet". */
export function drawClosedWings(ctx, overlay) {
  for (const wing of overlay.closedWings) {
    const { x, y, w, h } = wing.outer;
    ctx.fillStyle = 'rgba(15, 27, 45, 0.62)';
    ctx.fillRect(x, y, w, h);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.lineWidth = 10;
    for (let offset = -h; offset < w; offset += 48) {
      ctx.beginPath();
      ctx.moveTo(x + offset, y + h);
      ctx.lineTo(x + offset + h, y);
      ctx.stroke();
    }
    ctx.restore();
  }
}

/** World space: the elevator, a steel panel with two doors. */
export function drawElevator(ctx, overlay, isNear) {
  const { x, y, w, h } = overlay.elevator.rect;
  ctx.fillStyle = '#5b6878';
  ctx.fillRect(x + 4, y + 2, w - 8, h - 4);
  ctx.fillStyle = isNear ? '#cfe9f3' : '#aab6c3';
  ctx.fillRect(x + 10, y + 8, w / 2 - 12, h - 14);
  ctx.fillRect(x + w / 2 + 2, y + 8, w / 2 - 12, h - 14);
  ctx.fillStyle = '#2b3542';
  ctx.fillRect(x + w / 2 - 1, y + 8, 2, h - 14);
  ctx.fillStyle = '#f2c94c';
  ctx.beginPath();
  ctx.arc(x + w - 10, y + h / 2, 3, 0, Math.PI * 2);
  ctx.fill();
}

/** World space: a ring that grows and fades around my desk for a few seconds ("this is your desk"). */
export function drawPulse(ctx, pulse, now) {
  const age = (now - pulse.startedAt) / 1000;
  const wave = age % 1; // 0 → 1 every second
  ctx.strokeStyle = `rgba(10, 126, 164, ${1 - wave})`;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(pulse.x + 16, pulse.y + 18, 18 + wave * 30, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = 'rgba(10, 126, 164, 0.18)';
  ctx.fillRect(pulse.x - 16, pulse.y - 40, 64, 96);
}

/**
 * World space: one avatar. A soft shadow, a coloured body and a head, and a small mark showing
 * which way they face. (x, y) is the avatar's top-left, as everywhere in the world module.
 */
export function drawAvatar(ctx, x, y, color, dir, isSelf) {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
  ctx.beginPath();
  ctx.ellipse(x + 16, y + 34, 12, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = color;
  roundRect(ctx, x + 6, y + 14, 20, 20, 7);
  ctx.fill();
  ctx.fillStyle = '#f6d7b8';
  ctx.beginPath();
  ctx.arc(x + 16, y + 10, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#3b2a20'; // hair
  ctx.beginPath();
  ctx.arc(x + 16, y + 8, 9, Math.PI, Math.PI * 2);
  ctx.fill();
  if (dir !== 'up') {
    ctx.fillStyle = '#2b2b2b';
    const eyeShift = dir === 'left' ? -3 : dir === 'right' ? 3 : 0;
    ctx.fillRect(x + 12 + eyeShift, y + 11, 2, 2);
    ctx.fillRect(x + 18 + eyeShift, y + 11, 2, 2);
  }
  if (isSelf) {
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    roundRect(ctx, x + 6, y + 14, 20, 20, 7);
    ctx.stroke();
  }
}

/** Screen space: a dark rounded name tag with a status dot, centred above (screenX, screenY). */
export function drawNameTag(ctx, screenX, screenY, name, statusColor) {
  ctx.font = '600 12px system-ui, -apple-system, Segoe UI, sans-serif';
  const textWidth = ctx.measureText(name).width;
  const width = textWidth + 26;
  const left = Math.round(screenX - width / 2);
  const top = Math.round(screenY - 22);
  ctx.fillStyle = 'rgba(15, 27, 45, 0.78)';
  roundRect(ctx, left, top, width, 19, 9.5);
  ctx.fill();
  ctx.fillStyle = statusColor;
  ctx.beginPath();
  ctx.arc(left + 10, top + 9.5, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'middle';
  ctx.fillText(name, left + 18, top + 10);
  ctx.textBaseline = 'alphabetic';
}

/**
 * Screen space: room names, department names (in their colour) and the "Opens at tier N" signs.
 * `toScreen(x, y)` turns map pixels into screen pixels.
 */
export function drawOverlayLabels(ctx, overlay, toScreen, zoom) {
  ctx.textBaseline = 'middle';
  if (zoom >= 0.7) {
    ctx.font = '600 11px system-ui, -apple-system, Segoe UI, sans-serif';
    for (const room of overlay.rooms) {
      const point = toScreen(room.rect.x + room.rect.w / 2, room.rect.y + 14);
      const width = ctx.measureText(room.name).width + 14;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
      roundRect(ctx, point.x - width / 2, point.y - 9, width, 18, 9);
      ctx.fill();
      ctx.fillStyle = '#4b5a6e';
      ctx.fillText(room.name, point.x - width / 2 + 7, point.y);
    }
  }

  ctx.font = '700 12px system-ui, -apple-system, Segoe UI, sans-serif';
  for (const department of overlay.departments) {
    if (!department.labelAt) continue;
    const point = toScreen(department.labelAt.x, department.labelAt.y);
    const width = ctx.measureText(department.name).width + 16;
    ctx.fillStyle = department.color;
    roundRect(ctx, point.x, point.y, width, 20, 6);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.fillText(department.name, point.x + 8, point.y + 10.5);
  }

  for (const wing of overlay.closedWings) {
    const centre = toScreen(wing.outer.x + wing.outer.w / 2, wing.outer.y + wing.outer.h / 2);
    const title = `Wing ${wing.id}`;
    const line = `Opens at tier ${wing.tier}`;
    ctx.font = '700 15px system-ui, -apple-system, Segoe UI, sans-serif';
    const width = Math.max(ctx.measureText(title).width, 120) + 40;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
    roundRect(ctx, centre.x - width / 2, centre.y - 28, width, 56, 12);
    ctx.fill();
    ctx.fillStyle = '#0f1b2d';
    ctx.textAlign = 'center';
    ctx.fillText(title, centre.x, centre.y - 9);
    ctx.font = '600 12px system-ui, -apple-system, Segoe UI, sans-serif';
    ctx.fillStyle = '#0a7ea4';
    ctx.fillText(line, centre.x, centre.y + 12);
    ctx.textAlign = 'left';
  }
  ctx.textBaseline = 'alphabetic';
}

/** A rounded rectangle path (filled or stroked by the caller). */
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
