// server/scripts/move-speed-test.js — Person 1, v6
// Tests the server's speed check (server/signaling/moveCheck.js) with a made-up player and a made-up
// clock. No server needed: checkMoveSpeed is a plain function.
//
// Run it:   node server/scripts/move-speed-test.js

import { MOVE_SEND_HZ, RUN_SPEED_PX_PER_SEC, WALK_SPEED_PX_PER_SEC } from '../../shared/constants.js';
import { layout } from '../office/layout.js';
import { allowFreeMove, checkMoveSpeed, MAX_BUDGET_PX } from '../signaling/moveCheck.js';

let failures = 0;
function check(name, passed, detail = '') {
  if (passed) console.log(`[speed-test] PASS  ${name}`);
  else {
    failures += 1;
    console.log(`[speed-test] FAIL  ${name}  ${detail}`);
  }
}

const STEP_MS = 1000 / MOVE_SEND_HZ; // 100 ms between moves

/** Walk `messages` moves of `stepPx` each to the right, one every STEP_MS; returns how many were shortened. */
function walk(player, stepPx, messages, startMs) {
  let shortened = 0;
  let now = startMs;
  for (let i = 0; i < messages; i += 1) {
    now += STEP_MS;
    const answer = checkMoveSpeed(player, player.x + stepPx, player.y, now);
    if (answer.shortened) shortened += 1;
    player.x = answer.x;
    player.y = answer.y;
  }
  return { shortened, now };
}

const employee = () => ({ employeeId: 'emp-test', deskId: 'A-01', x: 1000, y: 1000 });

{
  const player = employee();
  allowFreeMove(player, 0);
  const first = checkMoveSpeed(player, 3000, 2000, 10);
  check('1. the first move after joining may jump anywhere (a reconnect)', first.x === 3000 && first.y === 2000 && !first.shortened);
}
{
  const player = employee();
  allowFreeMove(player, 0);
  player.freeMove = false;
  const { shortened } = walk(player, WALK_SPEED_PX_PER_SEC / MOVE_SEND_HZ, 50, 0);
  check(`2. walking (${WALK_SPEED_PX_PER_SEC} px/s) for 5 s: never shortened`, shortened === 0, `${shortened}`);
}
{
  const player = employee();
  allowFreeMove(player, 0);
  player.freeMove = false;
  const { shortened } = walk(player, RUN_SPEED_PX_PER_SEC / MOVE_SEND_HZ, 50, 0);
  check(`3. running with Shift (${RUN_SPEED_PX_PER_SEC} px/s) for 5 s: never shortened`, shortened === 0, `${shortened}`);
}
{
  const player = employee();
  allowFreeMove(player, 0);
  player.freeMove = false;
  const startX = player.x;
  const { shortened, now } = walk(player, (RUN_SPEED_PX_PER_SEC * 2) / MOVE_SEND_HZ, 30, 0);
  const allowed = startX + (RUN_SPEED_PX_PER_SEC * now) / 1000 + MAX_BUDGET_PX;
  check(`4. a cheat at twice the run speed for 3 s is held to the run speed (x ${Math.round(player.x)} ≤ ${Math.round(allowed)})`, shortened > 0 && player.x <= allowed + 0.001, `${shortened} shortened`);
}
{
  const player = employee();
  allowFreeMove(player, 0);
  player.freeMove = false;
  const jump = checkMoveSpeed(player, player.x + 900, player.y, 100);
  check(`5. a 900 px jump is shortened to the budget (${MAX_BUDGET_PX} px)`, jump.shortened && Math.abs(jump.x - (1000 + MAX_BUDGET_PX)) < 0.001, `${jump.x}`);
}
{
  const player = employee();
  allowFreeMove(player, 0);
  player.freeMove = false;
  const desk = layout.desks.find((d) => d.id === 'A-01');
  const toDesk = checkMoveSpeed(player, desk.x, desk.y, 100);
  const toLobby = checkMoveSpeed(player, layout.spawn.x, layout.spawn.y, 200);
  const toElevator = checkMoveSpeed(player, layout.elevator.x, layout.elevator.y, 300);
  check('6. Ctrl+D to my own desk, the lobby and the elevator are allowed jumps', !toDesk.shortened && !toLobby.shortened && !toElevator.shortened);
  const otherDesk = layout.desks.find((d) => d.id === 'D-25');
  check('7. a jump to someone else\'s desk is shortened', checkMoveSpeed({ ...player, x: 1000, y: 1000 }, otherDesk.x, otherDesk.y, 400).shortened);
}
{
  const lab = { x: 0, y: 0 }; // a { name } join (labs, robot tests): no employeeId
  const jump = checkMoveSpeed(lab, 3000, 3000, 0);
  check('8. labs and robot tests (no employee) are not checked', jump.x === 3000 && !jump.shortened);
}

if (failures > 0) {
  console.log(`[speed-test] ${failures} check(s) FAILED`);
  process.exit(1);
}
console.log('[speed-test] all checks passed');
