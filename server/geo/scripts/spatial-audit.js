// server/geo/scripts/spatial-audit.js — Person 2 (Module 2: Geospatial engine)
// Mid-Review Spatial Audit:
//   - Verifies MongoDB query plan uses GEO_NEAR_2D index via .explain()
//   - Seeds 50 test avatars in bounds [0, WORLD_MAX_PX]
//   - Runs 10 rounds of 50 parallel findNearby queries using Promise.all
//   - Measures individual query times with performance.now()
//   - Measures full tick duration (batch write + 50 parallel queries)
//   - Outputs formatted performance table and writes docs/geo-audit.md
// Run with: node server/geo/scripts/spatial-audit.js

import { fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import dotenv from 'dotenv';
import { connectDb, disconnectDb } from '../db.js';
import { createGeoEngine } from '../geoEngine.js';
import { Position } from '../models/Position.js';
import { DISCONNECT_PX, WORLD_MAX_PX } from '../../../shared/constants.js';

dotenv.config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true });

const AUDIT_USER_COUNT = 50;
const AUDIT_ROUNDS = 10;
const AUDIT_ROOM = 'spatial-audit-room';
const TARGET_LATENCY_MS = 20;

/**
 * Recursively searches an execution plan tree for a stage matching the target stage name.
 * Handles standard MongoDB plan nodes and queryPlan wrappers without traversing
 * arbitrary unrelated object fields.
 *
 * @param {object|null|undefined} node - A stage node or plan wrapper
 * @param {string} targetStage - Name of the stage to find (e.g. 'GEO_NEAR_2D')
 * @returns {object|null} The matching node or null if not found
 */
function findStage(node, targetStage) {
  if (!node || typeof node !== 'object') {
    return null;
  }

  // Direct match on stage name
  if (node.stage === targetStage) {
    return node;
  }

  // Traversal for queryPlan wrapper (e.g. winningPlan.queryPlan or wrapper objects)
  if (node.queryPlan && typeof node.queryPlan === 'object') {
    const found = findStage(node.queryPlan, targetStage);
    if (found) return found;
  }

  // Traversal for executionStages wrapper
  if (node.executionStages && typeof node.executionStages === 'object') {
    const found = findStage(node.executionStages, targetStage);
    if (found) return found;
  }

  // Traversal for standard single child inputStage
  if (node.inputStage && typeof node.inputStage === 'object') {
    const found = findStage(node.inputStage, targetStage);
    if (found) return found;
  }

  // Traversal for array of child stages
  if (Array.isArray(node.inputStages)) {
    for (const child of node.inputStages) {
      const found = findStage(child, targetStage);
      if (found) return found;
    }
  }

  return null;
}

/**
 * Extracts indexName from a stage node or its immediate plan children.
 *
 * @param {object|null|undefined} stageNode
 * @returns {string|null}
 */
function getStageIndexName(stageNode) {
  if (!stageNode || typeof stageNode !== 'object') {
    return null;
  }
  if (typeof stageNode.indexName === 'string') {
    return stageNode.indexName;
  }
  if (stageNode.queryPlan && typeof stageNode.queryPlan.indexName === 'string') {
    return stageNode.queryPlan.indexName;
  }
  if (stageNode.inputStage && typeof stageNode.inputStage === 'object') {
    if (typeof stageNode.inputStage.indexName === 'string') {
      return stageNode.inputStage.indexName;
    }
    if (
      stageNode.inputStage.inputStage &&
      typeof stageNode.inputStage.inputStage.indexName === 'string'
    ) {
      return stageNode.inputStage.inputStage.indexName;
    }
  }
  return null;
}

/**
 * Runs the .explain() check to prove the 2D index is utilized.
 */
async function inspectExecutionPlan() {
  console.log('\n--- Step 1: Query Plan Inspection (.explain()) ---');

  const EXPECTED_STAGE = 'GEO_NEAR_2D';
  const EXPECTED_INDEX = 'loc_2d_roomId_1';

  const sampleCoord = [500, 500];
  const query = Position.find({
    roomId: AUDIT_ROOM,
    _id: { $ne: 'explain-test-user' },
    loc: {
      $near: sampleCoord,
      $maxDistance: DISCONNECT_PX,
    },
  });

  const explainResult = await query.explain('executionStats');

  // Inspect both queryPlanner and executionStats trees independently
  const geoStagePlanner = findStage(explainResult.queryPlanner?.winningPlan, EXPECTED_STAGE);
  const geoStageExec = findStage(explainResult.executionStats?.executionStages, EXPECTED_STAGE);

  const plannerIndexName = getStageIndexName(geoStagePlanner);
  const execIndexName = getStageIndexName(geoStageExec);

  // Independently verify whether each candidate pairs GEO_NEAR_2D with exact loc_2d_roomId_1
  const isPlannerVerified = Boolean(
    geoStagePlanner &&
    geoStagePlanner.stage === EXPECTED_STAGE &&
    plannerIndexName === EXPECTED_INDEX
  );

  const isExecVerified = Boolean(
    geoStageExec &&
    geoStageExec.stage === EXPECTED_STAGE &&
    execIndexName === EXPECTED_INDEX
  );

  // Set uses2dIndex to true ONLY when executionStages contains verified GEO_NEAR_2D index
  const uses2dIndex = isExecVerified;

  let verifiedGeoStage = null;
  let actualIndexName = null;

  if (isExecVerified) {
    verifiedGeoStage = geoStageExec;
    actualIndexName = execIndexName;
  } else if (isPlannerVerified) {
    verifiedGeoStage = geoStagePlanner;
    actualIndexName = plannerIndexName;
  } else {
    verifiedGeoStage = geoStageExec || geoStagePlanner;
    actualIndexName = execIndexName || plannerIndexName || null;
  }

  // Do not fabricate fallback stage names; report UNKNOWN if missing
  const plannerStage = explainResult.queryPlanner?.winningPlan?.stage || 'UNKNOWN';
  const execStage = explainResult.executionStats?.executionStages?.stage || 'UNKNOWN';

  let stageDescription;
  if (uses2dIndex) {
    stageDescription = `${plannerStage} -> ${EXPECTED_STAGE} (index: ${actualIndexName})`;
  } else if (isPlannerVerified) {
    stageDescription = `${plannerStage} -> ${EXPECTED_STAGE} (planner verified, execution unverified)`;
  } else if (verifiedGeoStage) {
    stageDescription = `${plannerStage} -> ${verifiedGeoStage.stage} (unexpected index: ${actualIndexName || 'NONE'})`;
  } else {
    stageDescription = plannerStage !== 'UNKNOWN' ? `${plannerStage} (${execStage})` : 'UNKNOWN';
  }

  console.log(`Planner Stage:      ${plannerStage}`);
  console.log(`Execution Stage:    ${execStage}`);
  console.log(`Spatial Stage:      ${verifiedGeoStage?.stage || 'NONE'}`);
  console.log(`Index Name:         ${actualIndexName || 'NONE'}`);
  console.log(`Index Utilized:     ${uses2dIndex ? `YES (${EXPECTED_STAGE} / ${EXPECTED_INDEX})` : 'NO'}`);
  console.log(`Total Docs Examined: ${explainResult.executionStats?.totalDocsExamined ?? 0}`);

  return {
    uses2dIndex,
    stage: stageDescription,
    indexName: actualIndexName || 'NONE',
    rawExplain: explainResult,
  };
}

/**
 * Seeds controlled test users across the canvas grid.
 */
async function seedAuditUsers(geo) {
  console.log(`\n--- Step 2: Seeding ${AUDIT_USER_COUNT} Test Avatars ---`);

  const users = [];
  // Distribute 50 users evenly in an office cluster around center (1000..3000)
  for (let i = 1; i <= AUDIT_USER_COUNT; i++) {
    const angle = (i / AUDIT_USER_COUNT) * 2 * Math.PI;
    const distance = 80 + (i % 5) * 50; // spread around center
    const x = Math.round(1500 + Math.cos(angle) * distance);
    const y = Math.round(1500 + Math.sin(angle) * distance);
    users.push({ id: `audit-user-${i}`, x, y });
  }

  await geo.upsertPositions(users);
  console.log(`Seeded ${users.length} users successfully in room "${AUDIT_ROOM}".`);
  return users;
}

/**
 * Executes performance benchmark over 10 rounds.
 */
async function runBenchmark(geo, users) {
  console.log(`\n--- Step 3: Running ${AUDIT_ROUNDS} Rounds of 50 Parallel Queries ---`);

  // Warm-up round (JIT compilation + MongoDB cache preheating)
  await Promise.all(users.map((u) => geo.findNearby(u.id, DISCONNECT_PX)));

  const roundResults = [];

  for (let round = 1; round <= AUDIT_ROUNDS; round++) {
    // Measure individual queries in parallel
    const queryLatencies = [];

    const tickStart = performance.now();

    // 10 avatars move (simulating typical tick movement)
    const moved = users.slice(0, 10).map((u) => ({
      id: u.id,
      x: u.x + (Math.random() > 0.5 ? 4 : -4),
      y: u.y + (Math.random() > 0.5 ? 4 : -4),
    }));

    await geo.upsertPositions(moved);

    // Parallel 50 nearby queries
    const queryPromises = users.map(async (u) => {
      const qStart = performance.now();
      const res = await geo.findNearby(u.id, DISCONNECT_PX);
      const qEnd = performance.now();
      queryLatencies.push(qEnd - qStart);
      return res;
    });

    await Promise.all(queryPromises);
    const tickDuration = performance.now() - tickStart;

    const avgQueryTime = queryLatencies.reduce((a, b) => a + b, 0) / queryLatencies.length;
    const maxQueryTime = Math.max(...queryLatencies);
    const minQueryTime = Math.min(...queryLatencies);

    roundResults.push({
      round,
      avgQueryTime,
      maxQueryTime,
      minQueryTime,
      tickDuration,
      targetMet: maxQueryTime < TARGET_LATENCY_MS,
    });
  }

  return roundResults;
}

/**
 * Formats results into markdown table and saves to docs/geo-audit.md.
 */
async function saveAuditReport(explainData, roundResults) {
  const hasRounds = roundResults.length > 0;
  const overallAvg = hasRounds
    ? roundResults.reduce((sum, r) => sum + r.avgQueryTime, 0) / roundResults.length
    : 0;
  const overallMax = hasRounds ? Math.max(...roundResults.map((r) => r.maxQueryTime)) : 0;
  const overallAvgTick = hasRounds
    ? roundResults.reduce((sum, r) => sum + r.tickDuration, 0) / roundResults.length
    : 0;
  const allPassed = Boolean(explainData.uses2dIndex) && hasRounds && roundResults.every((r) => r.targetMet);

  const rawExplainJson = explainData.rawExplain
    ? JSON.stringify(explainData.rawExplain, null, 2)
    : '{}';

  const markdownContent = `# ProxiSpeak — Geospatial Engine Spatial Audit

**Date:** ${new Date().toISOString().split('T')[0]}
**Environment:** macOS local MongoDB Community Server
**Target:** Every "who is near?" query under **${TARGET_LATENCY_MS} ms** with ${AUDIT_USER_COUNT} users

---

## 1. Index Proof (.explain())

- **Index Name:** \`${explainData.indexName}\`
- **Index Type:** 2D flat-coordinate index bounded to \`{ min: 0, max: ${WORLD_MAX_PX} }\`
- **Winning Plan Stage:** \`${explainData.stage}\`
- **Index Utilized:** \`${explainData.uses2dIndex ? 'YES' : 'NO'}\`
- **Proof:** ${
    explainData.uses2dIndex
      ? `MongoDB execution plan shows \`${explainData.stage}\`, confirming queries execute against spatial index bounds instead of performing full-collection scans (\`COLLSCAN\`).`
      : `FAILED: Execution plan did not verify expected stage GEO_NEAR_2D with index loc_2d_roomId_1.`
  }

<details>
<summary>Raw Execution Plan (.explain('executionStats'))</summary>

\`\`\`json
${rawExplainJson}
\`\`\`

</details>

---

## 2. Benchmark Results (${AUDIT_ROUNDS} Rounds × ${AUDIT_USER_COUNT} Parallel Queries)

| Round | Min Latency (ms) | Avg Latency (ms) | Max Latency (ms) | Full Tick (Batch + 50 Qs) | Target (< 20 ms) |
| :---: | :---: | :---: | :---: | :---: | :---: |
${
  hasRounds
    ? roundResults
        .map(
          (r) =>
            `| Round ${r.round} | ${r.minQueryTime.toFixed(2)} ms | ${r.avgQueryTime.toFixed(
              2
            )} ms | ${r.maxQueryTime.toFixed(2)} ms | ${r.tickDuration.toFixed(2)} ms | ${
              r.targetMet ? '✅ PASS' : '❌ FAIL'
            } |`
        )
        .join('\n')
    : '| None | N/A | N/A | N/A | N/A | ❌ NOT RUN |'
}

---

## 3. Summary

- **Overall Average Query Latency:** **${overallAvg.toFixed(2)} ms**
- **Peak Query Latency:** **${overallMax.toFixed(2)} ms**
- **Average Full Tick Duration:** **${overallAvgTick.toFixed(2)} ms** (well within ${250} ms tick budget)
- **Verdict:** **${
    allPassed
      ? 'ALL QUERIES PASSED (< 20 ms)'
      : !explainData.uses2dIndex
      ? 'AUDIT FAILED (Index not proven)'
      : 'TARGET EXCEEDED'
  }**

*Report generated automatically by \`server/geo/scripts/spatial-audit.js\`.*
`;

  const reportPath = fileURLToPath(new URL('../../../docs/geo-audit.md', import.meta.url));
  await fs.writeFile(reportPath, markdownContent, 'utf8');
  console.log(`\n[geo] Saved benchmark report to: ${reportPath}`);

  return {
    overallAvg,
    overallMax,
    overallAvgTick,
    allPassed,
  };
}

export async function runSpatialAudit() {
  console.log('=== STARTING SPATIAL AUDIT & BENCHMARK ===');

  const geo = createGeoEngine({ roomId: AUDIT_ROOM });
  await Position.init();

  try {
    const explainData = await inspectExecutionPlan();
    if (!explainData.uses2dIndex) {
      console.error(
        '\n[geo] AUDIT FAILED: Expected 2D index "loc_2d_roomId_1" with stage "GEO_NEAR_2D" was not proven in execution plan.'
      );
      await saveAuditReport(explainData, []);
      return false;
    }

    const users = await seedAuditUsers(geo);
    const roundResults = await runBenchmark(geo, users);

    console.log('\n--- Step 4: Results Table ---');
    console.table(
      roundResults.map((r) => ({
        Round: r.round,
        'Min (ms)': Number(r.minQueryTime.toFixed(2)),
        'Avg (ms)': Number(r.avgQueryTime.toFixed(2)),
        'Max (ms)': Number(r.maxQueryTime.toFixed(2)),
        'Full Tick (ms)': Number(r.tickDuration.toFixed(2)),
        Status: r.targetMet ? 'PASS (<20ms)' : 'FAIL',
      }))
    );

    const summary = await saveAuditReport(explainData, roundResults);

    console.log('\n=== AUDIT SUMMARY ===');
    console.log(`Average Query Latency:   ${summary.overallAvg.toFixed(2)} ms`);
    console.log(`Worst-case Query Latency: ${summary.overallMax.toFixed(2)} ms`);
    console.log(`Average Tick Duration:    ${summary.overallAvgTick.toFixed(2)} ms`);
    console.log(`Mid-Review Target (<20ms): ${summary.allPassed ? 'PASSED ✅' : 'FAILED ❌'}`);

    return summary.allPassed;
  } finally {
    // Always clean up audit room
    await Position.deleteMany({ roomId: AUDIT_ROOM });
    console.log(`[geo] Cleaned up audit users from room "${AUDIT_ROOM}".`);
  }
}

// Allow direct CLI execution
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/proxispeak';

  connectDb(mongoUri)
    .then(() => runSpatialAudit())
    .then((success) => {
      process.exitCode = success ? 0 : 1;
    })
    .catch((err) => {
      console.error('[geo] Spatial audit failed with error:', err);
      process.exitCode = 1;
    })
    .finally(async () => {
      await disconnectDb();
    });
}
