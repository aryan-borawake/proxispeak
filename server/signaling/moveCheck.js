// server/signaling/moveCheck.js — Person 1, v6
// The server's speed check for moves. Never trust the browser: a changed browser could send
// "I'm across the office" ten times a second and fly through walls into any room.
//
// The idea is a MOVEMENT BUDGET (like a fuel tank), counted in pixels:
//   - it fills up with time at the top speed (RUN_SPEED_PX_PER_SEC, 440 px/s, Shift held),
//   - it holds at most MOVE_BUDGET_MS of running (250 ms → 110 px), to absorb network bunching,
//   - every move spends its length.
// A move longer than the budget is SHORTENED to what the budget allows (not refused): a slow network
// can never get anyone stuck, and the position catches up as soon as the budget fills again.
//
// Example: Riya runs (44 px per 100 ms message). Each message: +44 px of budget, −44 px spent → fine.
//          A cheat jumps 600 px at once: budget 110 px → the server moves Riya only 110 px that way.
//
// Allowed jumps (no budget needed), because the app really does them:
//   - the first move after joining or changing floor (a reconnect puts you back where you were);
//   - my own desk (Ctrl+D "My desk"), the lobby spawn and the elevator spot.
// Labs and robot tests (a { name } join, no employee) are not checked: they teleport on purpose.

import { MOVE_BUDGET_MS, RUN_SPEED_PX_PER_SEC } from '../../shared/constants.js';
import { deskById, layout } from '../office/layout.js';

/** The fullest the budget can be, in px (440 px/s × 0.25 s = 110 px). */
export const MAX_BUDGET_PX = (RUN_SPEED_PX_PER_SEC * MOVE_BUDGET_MS) / 1000;

// A jump this close (px) to an allowed spot counts as that spot.
const JUMP_MATCH_PX = 1;

/** Reset the budget, and allow one free jump: call after a join or a floor change. */
export function allowFreeMove(player, now = Date.now()) {
  player.freeMove = true;
  player.moveBudget = MAX_BUDGET_PX;
  player.lastMoveAt = now;
}

/** Is (x, y) one of the spots the app jumps to: my desk, the lobby spawn, the elevator? */
function isAllowedJump(player, x, y) {
  const spots = [layout.spawn, layout.elevator];
  const desk = player.deskId ? deskById(player.deskId) : null;
  if (desk) spots.push(desk);
  return spots.some((spot) => Math.hypot(spot.x - x, spot.y - y) <= JUMP_MATCH_PX);
}

/**
 * Where may this player go, given the move they asked for?
 * @param {object} player - from players.js (x, y = where the server has them now)
 * @param {number} x - the asked-for x
 * @param {number} y - the asked-for y
 * @param {number} [now] - Date.now(), passed in by tests
 * @returns {{ x: number, y: number, shortened: boolean }}
 */
export function checkMoveSpeed(player, x, y, now = Date.now()) {
  if (!player.employeeId) return { x, y, shortened: false };
  if (player.lastMoveAt === undefined) allowFreeMove(player, now);

  // Fill the budget for the time since the last move, up to the maximum.
  const seconds = Math.max(0, now - player.lastMoveAt) / 1000;
  player.moveBudget = Math.min(MAX_BUDGET_PX, player.moveBudget + RUN_SPEED_PX_PER_SEC * seconds);
  player.lastMoveAt = now;

  if (player.freeMove || isAllowedJump(player, x, y)) {
    player.freeMove = false;
    return { x, y, shortened: false };
  }

  const dx = x - player.x;
  const dy = y - player.y;
  const length = Math.hypot(dx, dy);
  if (length <= player.moveBudget) {
    player.moveBudget -= length;
    return { x, y, shortened: false };
  }

  // Too far for the budget: go only as far as the budget allows, in the same direction.
  const share = player.moveBudget / length;
  player.moveBudget = 0;
  return { x: player.x + dx * share, y: player.y + dy * share, shortened: true };
}
