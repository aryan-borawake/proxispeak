// server/scripts/office-rules-test.js — Person 1
// Tests for the office's PURE functions: tiers (tiers.js), the desk rule (desks.js) and
// rebalancing (rebalance.js). Pure functions need no server and no database, so this runs alone:
//
//   node server/scripts/office-rules-test.js      (from the repo root)
//
// It uses the real floor plan (server/office/layout.json: 100 desks in wings A–D, 14 hot desks)
// with made-up departments and people. Each line prints PASS or FAIL; any FAIL → exit code 1.

import { DESKS_PER_WING, WING_IDS } from '../../shared/constants.js';
import { computeFloorTier, openWingsForTier, tierForHeadcount } from '../office/tiers.js';
import { chooseDesk, DESK_RESULTS, reserveBlock, resizeBlock } from '../office/desks.js';
import { planRebalance } from '../office/rebalance.js';
import { layout } from '../office/layout.js';
import { buildSeedDirectory } from '../office/seedData.js';

let failures = 0;
function check(name, passed, detail = '') {
  if (passed) {
    console.log(`[rules-test] PASS  ${name}`);
  } else {
    failures += 1;
    console.log(`[rules-test] FAIL  ${name}  ${detail}`);
  }
}

const { desks, hotDesks } = layout;
const wingOf = (deskId) => deskId.split('-')[0];
const deskIndex = (deskId) => desks.find((d) => d.id === deskId).index;

/** n made-up people in one department, all seated by the rule, one after another. */
function hire(departments, employees, departmentId, count, floorId = 'floor-1') {
  for (let i = 0; i < count; i += 1) {
    const onFloor = employees.filter((e) => e.floorId === floorId && e.deskId);
    const answer = chooseDesk({ desks, hotDesks, departments: departments.filter((d) => d.floorId === floorId), employees: onFloor, departmentId });
    departments.find((d) => d._id === departmentId).deskIds = answer.departmentDeskIds;
    employees.push({ _id: `${departmentId}-p${employees.length}`, departmentId, floorId, deskId: answer.deskId, hotDesk: answer.hotDesk, kind: answer.kind });
  }
  return employees;
}

// ---------------------------------------------------------------- the floor plan itself
check('0a. layout has 4 wings × 25 desks and 14 hot desks', desks.length === WING_IDS.length * DESKS_PER_WING && hotDesks.length === 14, `${desks.length} desks, ${hotDesks.length} hot`);
check(
  '0b. snake numbering: desk n and n + 1 are always next to each other',
  WING_IDS.every((wingId) => {
    const wing = desks.filter((d) => d.wingId === wingId).sort((a, b) => a.index - b.index);
    return wing.every((desk, i) => i === 0 || Math.abs(desk.row - wing[i - 1].row) + Math.abs(desk.col - wing[i - 1].col) === 1);
  }),
);

// ---------------------------------------------------------------- tiers
check('1a. tierForHeadcount: 0 → 1, 25 → 1, 26 → 2, 50 → 2, 75 → 3, 100 → 4, 130 → 4',
  [0, 25, 26, 50, 75, 100, 130].map(tierForHeadcount).join() === '1,1,2,2,3,4,4');
check('1b. openWingsForTier(2) → A, B', openWingsForTier(2).join() === 'A,B');
check('1c. tier only grows: previous 3, headcount 10 → 3', computeFloorTier({ previousTier: 3, headcount: 10, usedWingIds: ['A'] }) === 3);
check('1d. a used desk in wing C opens tier 3 even with 17 people', computeFloorTier({ previousTier: 1, headcount: 17, usedWingIds: ['A', 'C'] }) === 3);

// ---------------------------------------------------------------- reserving blocks
const blockA = reserveBlock({ desks, departments: [], employees: [], size: 8 });
check('2a. an 8-desk block on an empty floor = A-01 … A-08', blockA.join() === 'A-01,A-02,A-03,A-04,A-05,A-06,A-07,A-08', blockA.join());
const fullA = [{ _id: 'x', deskIds: desks.filter((d) => d.wingId === 'A').slice(0, 20).map((d) => d.id) }];
const blockB = reserveBlock({ desks, departments: fullA, employees: [], size: 8 });
check('2b. 20 desks of A reserved, size 8 does not fit in A → B-01 … B-08 (one unbroken run)', blockB.every((id) => wingOf(id) === 'B') && blockB.length === 8, blockB.join());

// ---------------------------------------------------------------- the desk rule
{
  const departments = [
    { _id: 'eng', floorId: 'floor-1', size: 3, deskIds: ['A-01', 'A-02', 'A-03'] },
    { _id: 'hr', floorId: 'floor-1', size: 2, deskIds: ['A-05', 'A-06'] },
  ];
  const employees = hire(departments, [], 'eng', 3);
  check('3a. first 3 hires → own block (A-01, A-02, A-03)', employees.map((e) => e.deskId).join() === 'A-01,A-02,A-03' && employees.every((e) => e.kind === DESK_RESULTS.OWN_BLOCK));
  hire(departments, employees, 'eng', 1);
  check('3b. 4th hire: block full → grow into the free neighbour A-04', employees[3].deskId === 'A-04' && employees[3].kind === DESK_RESULTS.GROWN);
  check('3c. … and A-04 is now part of the block', departments[0].deskIds.includes('A-04'));
  hire(departments, employees, 'eng', 1);
  // A-05 is HR's (reserved), so the neighbour after A-04 is taken; before A-01 there is nothing.
  check('3d. 5th hire: both neighbours taken → a free desk elsewhere (A-07, after HR)', employees[4].deskId === 'A-07' && employees[4].kind === DESK_RESULTS.ELSEWHERE, `${employees[4].deskId} ${employees[4].kind}`);
}
{
  // All 100 desks reserved by one department and taken → hot desks, then FLOOR_FULL.
  const departments = [{ _id: 'big', floorId: 'floor-1', size: 100, deskIds: desks.map((d) => d.id) }];
  const employees = desks.map((d, i) => ({ _id: `p${i}`, departmentId: 'big', floorId: 'floor-1', deskId: d.id, hotDesk: false }));
  hire(departments, employees, 'big', 1);
  const first = employees[100];
  check('4a. 101st person → hot desk H-01, hotDesk: true', first.kind === DESK_RESULTS.HOT_DESK && first.deskId === 'H-01' && first.hotDesk === true, JSON.stringify(first));
  hire(departments, employees, 'big', 13);
  hire(departments, employees, 'big', 1);
  const last = employees[employees.length - 1];
  check('4b. after all 14 hot desks → FLOOR_FULL with no desk', last.kind === DESK_RESULTS.FLOOR_FULL && last.deskId === null, JSON.stringify(last));
}
{
  // The demo directory: everyone has a real desk in wing A, all inside their own block.
  const seed = buildSeedDirectory();
  const inOwnBlock = seed.employees.every((e) => seed.departments.find((d) => d._id === e.departmentId).deskIds.includes(e.deskId));
  check('5a. demo directory: 17 people, all at desks in wing A inside their own block', seed.employees.length === 17 && seed.employees.every((e) => wingOf(e.deskId) === 'A' && !e.hotDesk) && inOwnBlock);
  check('5b. demo department blocks add up to 25 desks (tier 1)', seed.departments.reduce((sum, d) => sum + d.deskIds.length, 0) === 25);
}

// ---------------------------------------------------------------- resizing
{
  const departments = [
    { _id: 'eng', floorId: 'floor-1', size: 5, deskIds: ['A-01', 'A-02', 'A-03', 'A-04', 'A-05'] },
    { _id: 'hr', floorId: 'floor-1', size: 2, deskIds: ['A-08', 'A-09'] },
  ];
  const employees = [
    { _id: 'a', departmentId: 'eng', floorId: 'floor-1', deskId: 'A-01' },
    { _id: 'b', departmentId: 'eng', floorId: 'floor-1', deskId: 'A-04' },
  ];
  const smaller = resizeBlock({ desks, departments, employees, departmentId: 'eng', newSize: 2 });
  check('6a. shrink 5 → 2 keeps the two occupied desks (A-01, A-04)', smaller.join() === 'A-01,A-04', smaller.join());
  const bigger = resizeBlock({ desks, departments, employees, departmentId: 'eng', newSize: 7 });
  check('6b. grow 5 → 7 takes the neighbours A-06, A-07 (A-08 is HR)', bigger.join() === 'A-01,A-02,A-03,A-04,A-05,A-06,A-07', bigger.join());
  const evenBigger = resizeBlock({ desks, departments, employees, departmentId: 'eng', newSize: 8 });
  check('6c. grow 5 → 8: no free neighbour after A-07 → a desk elsewhere (A-10)', evenBigger.length === 8 && evenBigger[7] === 'A-10', evenBigger.join());
  check('6d. resizing only changes that department (HR untouched)', departments[1].deskIds.join() === 'A-08,A-09');
}

// ---------------------------------------------------------------- rebalancing
{
  // Floor 1 full: eng 60 people (A, B, part of C), mkt 40 (rest), plus 3 mkt hot-deskers.
  const departments = [
    { _id: 'eng', floorId: 'floor-1', size: 60, deskIds: desks.slice(0, 60).map((d) => d.id) },
    { _id: 'mkt', floorId: 'floor-1', size: 40, deskIds: desks.slice(60).map((d) => d.id) },
  ];
  const employees = [
    ...desks.slice(0, 60).map((d, i) => ({ _id: `e${i}`, departmentId: 'eng', floorId: 'floor-1', deskId: d.id, hotDesk: false })),
    ...desks.slice(60).map((d, i) => ({ _id: `m${i}`, departmentId: 'mkt', floorId: 'floor-1', deskId: d.id, hotDesk: false })),
    ...['H-01', 'H-02', 'H-03'].map((id, i) => ({ _id: `h${i}`, departmentId: 'mkt', floorId: 'floor-1', deskId: id, hotDesk: true })),
  ];
  const plan = planRebalance({ desks, hotDesks, departments, employees, moves: [{ departmentId: 'eng', floorId: 'floor-2' }] });
  const eng = plan.employees.filter((e) => e.departmentId === 'eng');
  const engDept = plan.departments.find((d) => d._id === 'eng');
  check('7a. all 60 engineers moved to floor-2', eng.every((e) => e.floorId === 'floor-2') && plan.moved.length === 60);
  check('7b. on floor-2 they sit in their new block, no hot desks', eng.every((e) => !e.hotDesk && engDept.deskIds.includes(e.deskId)) && engDept.floorId === 'floor-2');
  check('7c. floor-2 block starts at A-01 (an empty floor)', engDept.deskIds[0] === 'A-01');
  const hot = plan.employees.filter((e) => e._id.startsWith('h'));
  check('7d. the 3 Marketing hot-deskers on floor-1 got real desks', hot.every((e) => !e.hotDesk && e.deskId && !e.deskId.startsWith('H-')) && plan.reseated.length === 3, JSON.stringify(hot));
  const mktDesks = plan.employees.filter((e) => e.departmentId === 'mkt').map((e) => e.deskId);
  check('7e. nobody on floor-1 shares a desk', new Set(mktDesks).size === mktDesks.length);
  check('7f. the input was not changed (pure function)', employees[0].floorId === 'floor-1' && departments[0].floorId === 'floor-1');
  // The hot-deskers sit next to Marketing's block: the free neighbour before its first desk is C-10.
  check('7g. the first hot-desker joins Marketing\'s block next to it', deskIndex(hot[0].deskId) === deskIndex('C-10') && wingOf(hot[0].deskId) === 'C', hot[0].deskId);
}

if (failures > 0) {
  console.log(`[rules-test] ${failures} check(s) FAILED`);
  process.exit(1);
}
console.log('[rules-test] all checks passed');
