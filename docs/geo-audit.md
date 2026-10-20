# ProxiSpeak — Geospatial Engine Spatial Audit

**Date:** 2026-10-20
**Environment:** macOS local MongoDB Community Server
**Target:** Every "who is near?" query under **20 ms** with 50 users

---

## 1. Index Proof (.explain())

- **Index Name:** `loc_2d_roomId_1`
- **Index Type:** 2D flat-coordinate index bounded to `{ min: 0, max: 4096 }`
- **Winning Plan Stage:** `FETCH (FETCH)`
- **Proof:** MongoDB execution plan shows `FETCH (FETCH)`, confirming queries execute against spatial index bounds instead of performing full-collection scans (`COLLSCAN`).

---

## 2. Benchmark Results (10 Rounds × 50 Parallel Queries)

| Round | Min Latency (ms) | Avg Latency (ms) | Max Latency (ms) | Full Tick (Batch + 50 Qs) | Target (< 20 ms) |
| :---: | :---: | :---: | :---: | :---: | :---: |
| Round 1 | 3.04 ms | 9.08 ms | 14.44 ms | 17.19 ms | ✅ PASS |
| Round 2 | 3.40 ms | 9.11 ms | 14.25 ms | 15.52 ms | ✅ PASS |
| Round 3 | 3.42 ms | 8.86 ms | 13.61 ms | 14.78 ms | ✅ PASS |
| Round 4 | 3.03 ms | 8.81 ms | 13.66 ms | 14.83 ms | ✅ PASS |
| Round 5 | 3.10 ms | 8.21 ms | 13.02 ms | 14.14 ms | ✅ PASS |
| Round 6 | 3.02 ms | 7.84 ms | 12.08 ms | 13.27 ms | ✅ PASS |
| Round 7 | 2.93 ms | 8.45 ms | 13.44 ms | 14.57 ms | ✅ PASS |
| Round 8 | 3.96 ms | 10.44 ms | 15.59 ms | 17.10 ms | ✅ PASS |
| Round 9 | 3.04 ms | 8.80 ms | 13.37 ms | 14.53 ms | ✅ PASS |
| Round 10 | 4.72 ms | 10.03 ms | 14.44 ms | 15.60 ms | ✅ PASS |

---

## 3. Summary

- **Overall Average Query Latency:** **8.96 ms**
- **Peak Query Latency:** **15.59 ms**
- **Average Full Tick Duration:** **15.15 ms** (well within 250 ms tick budget)
- **Verdict:** **ALL QUERIES PASSED (< 20 ms)**

*Report generated automatically by `server/geo/scripts/spatial-audit.js`.*
