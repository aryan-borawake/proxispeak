# ProxiSpeak — Geospatial Engine Spatial Audit

**Date:** 2026-10-23
**Environment:** macOS local MongoDB Community Server
**Target:** Every "who is near?" query under **20 ms** with 50 users

---

## 1. Index Proof (.explain())

- **Index Name:** `loc_2d_roomId_1`
- **Index Type:** 2D flat-coordinate index bounded to `{ min: 0, max: 4096 }`
- **Winning Plan Stage:** `FETCH -> GEO_NEAR_2D (index: loc_2d_roomId_1)`
- **Index Utilized:** `YES`
- **Proof:** MongoDB execution plan shows `FETCH -> GEO_NEAR_2D (index: loc_2d_roomId_1)`, confirming queries execute against spatial index bounds instead of performing full-collection scans (`COLLSCAN`).

<details>
<summary>Raw Execution Plan (.explain('executionStats'))</summary>

```json
{
  "explainVersion": "1",
  "queryPlanner": {
    "namespace": "proxispeak.positions",
    "parsedQuery": {
      "$and": [
        {
          "roomId": {
            "$eq": "spatial-audit-room"
          }
        },
        {
          "_id": {
            "$not": {
              "$eq": "explain-test-user"
            }
          }
        },
        {
          "loc": {
            "$near": [
              500,
              500
            ],
            "$maxDistance": 140
          }
        }
      ]
    },
    "indexFilterSet": false,
    "queryHash": "11CC6BF8",
    "planCacheShapeHash": "11CC6BF8",
    "planCacheKey": "4C335AFA",
    "optimizationTimeMillis": 0,
    "maxIndexedOrSolutionsReached": false,
    "maxIndexedAndSolutionsReached": false,
    "maxScansToExplodeReached": false,
    "prunedSimilarIndexes": false,
    "winningPlan": {
      "isCached": false,
      "stage": "FETCH",
      "filter": {
        "_id": {
          "$not": {
            "$eq": "explain-test-user"
          }
        }
      },
      "inputStage": {
        "stage": "GEO_NEAR_2D",
        "keyPattern": {
          "loc": "2d",
          "roomId": 1
        },
        "indexName": "loc_2d_roomId_1",
        "indexVersion": 2,
        "inputStage": {
          "stage": "FETCH",
          "filter": {
            "$TwoDPtInAnnulusExpression": true
          },
          "inputStage": {
            "stage": "IXSCAN",
            "filter": {
              "roomId": {
                "$eq": "spatial-audit-room"
              }
            },
            "keyPattern": {
              "loc": "2d",
              "roomId": 1
            },
            "indexName": "loc_2d_roomId_1",
            "isMultiKey": false,
            "isUnique": false,
            "isSparse": false,
            "isPartial": false,
            "indexVersion": 2,
            "direction": "forward",
            "indexBounds": {
              "loc": [
                "[BinData(128, 036C000000000000), BinData(128, 036FFFFFFFFFFFFF)]",
                "[BinData(128, 0378000000000000), BinData(128, 037BFFFFFFFFFFFF)]",
                "[BinData(128, 037C000000000000), BinData(128, 037FFFFFFFFFFFFF)]",
                "[BinData(128, 039C000000000000), BinData(128, 039FFFFFFFFFFFFF)]",
                "[BinData(128, 03B0000000000000), BinData(128, 03BFFFFFFFFFFFFF)]",
                "[BinData(128, 03C0000000000000), BinData(128, 03FFFFFFFFFFFFFF)]",
                "[BinData(128, 0628000000000000), BinData(128, 062BFFFFFFFFFFFF)]",
                "[BinData(128, 062C000000000000), BinData(128, 062FFFFFFFFFFFFF)]",
                "[BinData(128, 063AA00000000000), BinData(128, 063AAFFFFFFFFFFF)]",
                "[BinData(128, 0680000000000000), BinData(128, 06BFFFFFFFFFFFFF)]",
                "[BinData(128, 06EA000000000000), BinData(128, 06EA3FFFFFFFFFFF)]",
                "[BinData(128, 0910000000000000), BinData(128, 091FFFFFFFFFFFFF)]",
                "[BinData(128, 0935500000000000), BinData(128, 09355FFFFFFFFFFF)]",
                "[BinData(128, 0940000000000000), BinData(128, 097FFFFFFFFFFFFF)]",
                "[BinData(128, 09D5000000000000), BinData(128, 09D53FFFFFFFFFFF)]",
                "[BinData(128, 0C00000000000000), BinData(128, 0C3FFFFFFFFFFFFF)]"
              ],
              "roomId": [
                "[MinKey, MaxKey]"
              ]
            }
          }
        }
      }
    },
    "rejectedPlans": []
  },
  "executionStats": {
    "executionSuccess": true,
    "nReturned": 0,
    "executionTimeMillis": 2,
    "totalKeysExamined": 0,
    "totalDocsExamined": 0,
    "executionStages": {
      "isCached": false,
      "stage": "FETCH",
      "filter": {
        "_id": {
          "$not": {
            "$eq": "explain-test-user"
          }
        }
      },
      "nReturned": 0,
      "executionTimeMillisEstimate": 0,
      "works": 26,
      "advanced": 0,
      "needTime": 25,
      "needYield": 0,
      "saveState": 0,
      "restoreState": 0,
      "isEOF": 1,
      "docsExamined": 0,
      "alreadyHasObj": 0,
      "inputStage": {
        "stage": "GEO_NEAR_2D",
        "nReturned": 0,
        "executionTimeMillisEstimate": 0,
        "works": 26,
        "advanced": 0,
        "needTime": 25,
        "needYield": 0,
        "saveState": 0,
        "restoreState": 0,
        "isEOF": 1,
        "keyPattern": {
          "loc": "2d",
          "roomId": 1
        },
        "indexName": "loc_2d_roomId_1",
        "indexVersion": 2,
        "searchIntervals": [
          {
            "minDistance": 0,
            "maxDistance": 140.00000000000014,
            "maxInclusive": true,
            "nBuffered": 0,
            "nReturned": 0
          }
        ],
        "inputStage": {
          "stage": "FETCH",
          "filter": {
            "$TwoDPtInAnnulusExpression": true
          },
          "nReturned": 0,
          "executionTimeMillisEstimate": 0,
          "works": 1,
          "advanced": 0,
          "needTime": 0,
          "needYield": 0,
          "saveState": 0,
          "restoreState": 0,
          "isEOF": 1,
          "docsExamined": 0,
          "alreadyHasObj": 0,
          "inputStage": {
            "stage": "IXSCAN",
            "filter": {
              "roomId": {
                "$eq": "spatial-audit-room"
              }
            },
            "nReturned": 0,
            "executionTimeMillisEstimate": 0,
            "works": 1,
            "advanced": 0,
            "needTime": 0,
            "needYield": 0,
            "saveState": 0,
            "restoreState": 0,
            "isEOF": 1,
            "keyPattern": {
              "loc": "2d",
              "roomId": 1
            },
            "indexName": "loc_2d_roomId_1",
            "isMultiKey": false,
            "isUnique": false,
            "isSparse": false,
            "isPartial": false,
            "indexVersion": 2,
            "direction": "forward",
            "indexBounds": {
              "loc": [
                "[BinData(128, 036C000000000000), BinData(128, 036FFFFFFFFFFFFF)]",
                "[BinData(128, 0378000000000000), BinData(128, 037BFFFFFFFFFFFF)]",
                "[BinData(128, 037C000000000000), BinData(128, 037FFFFFFFFFFFFF)]",
                "[BinData(128, 039C000000000000), BinData(128, 039FFFFFFFFFFFFF)]",
                "[BinData(128, 03B0000000000000), BinData(128, 03BFFFFFFFFFFFFF)]",
                "[BinData(128, 03C0000000000000), BinData(128, 03FFFFFFFFFFFFFF)]",
                "[BinData(128, 0628000000000000), BinData(128, 062BFFFFFFFFFFFF)]",
                "[BinData(128, 062C000000000000), BinData(128, 062FFFFFFFFFFFFF)]",
                "[BinData(128, 063AA00000000000), BinData(128, 063AAFFFFFFFFFFF)]",
                "[BinData(128, 0680000000000000), BinData(128, 06BFFFFFFFFFFFFF)]",
                "[BinData(128, 06EA000000000000), BinData(128, 06EA3FFFFFFFFFFF)]",
                "[BinData(128, 0910000000000000), BinData(128, 091FFFFFFFFFFFFF)]",
                "[BinData(128, 0935500000000000), BinData(128, 09355FFFFFFFFFFF)]",
                "[BinData(128, 0940000000000000), BinData(128, 097FFFFFFFFFFFFF)]",
                "[BinData(128, 09D5000000000000), BinData(128, 09D53FFFFFFFFFFF)]",
                "[BinData(128, 0C00000000000000), BinData(128, 0C3FFFFFFFFFFFFF)]"
              ],
              "roomId": [
                "[MinKey, MaxKey]"
              ]
            },
            "keysExamined": 0,
            "seeks": 1,
            "dupsTested": 0,
            "dupsDropped": 0
          }
        }
      }
    },
    "allPlansExecution": []
  },
  "queryShapeHash": "E5B89D6B0D3CCC33304E517B1EFE12E1372E338D925050FACE7F63DBBF90D13A",
  "command": {
    "find": "positions",
    "filter": {
      "roomId": "spatial-audit-room",
      "_id": {
        "$ne": "explain-test-user"
      },
      "loc": {
        "$near": [
          500,
          500
        ],
        "$maxDistance": 140
      }
    },
    "$db": "proxispeak"
  },
  "serverInfo": {
    "host": "PRATIKs-MacBook-Air.local",
    "port": 27017,
    "version": "8.0.34",
    "gitVersion": "51db4515a6597aedcf6188ee4e48a27e65b065ae"
  },
  "serverParameters": {
    "internalQueryFacetBufferSizeBytes": 104857600,
    "internalQueryFacetMaxOutputDocSizeBytes": 104857600,
    "internalLookupStageIntermediateDocumentMaxSizeBytes": 104857600,
    "internalDocumentSourceGroupMaxMemoryBytes": 104857600,
    "internalQueryMaxBlockingSortMemoryUsageBytes": 104857600,
    "internalQueryProhibitBlockingMergeOnMongoS": 0,
    "internalQueryMaxAddToSetBytes": 104857600,
    "internalDocumentSourceSetWindowFieldsMaxMemoryBytes": 104857600,
    "internalQueryFrameworkControl": "trySbeRestricted",
    "internalQueryPlannerIgnoreIndexWithCollationForRegex": 1
  },
  "ok": 1
}
```

</details>

---

## 2. Benchmark Results (10 Rounds × 50 Parallel Queries)

| Round | Min Latency (ms) | Avg Latency (ms) | Max Latency (ms) | Full Tick (Batch + 50 Qs) | Target (< 20 ms) |
| :---: | :---: | :---: | :---: | :---: | :---: |
| Round 1 | 3.40 ms | 9.69 ms | 15.61 ms | 18.96 ms | ✅ PASS |
| Round 2 | 3.38 ms | 9.35 ms | 14.23 ms | 15.55 ms | ✅ PASS |
| Round 3 | 3.46 ms | 8.57 ms | 13.40 ms | 14.63 ms | ✅ PASS |
| Round 4 | 3.03 ms | 8.21 ms | 13.11 ms | 14.36 ms | ✅ PASS |
| Round 5 | 3.19 ms | 10.30 ms | 15.87 ms | 16.93 ms | ✅ PASS |
| Round 6 | 2.69 ms | 7.94 ms | 13.29 ms | 14.41 ms | ✅ PASS |
| Round 7 | 3.37 ms | 8.20 ms | 12.24 ms | 13.32 ms | ✅ PASS |
| Round 8 | 3.44 ms | 8.14 ms | 12.15 ms | 13.28 ms | ✅ PASS |
| Round 9 | 3.77 ms | 9.74 ms | 14.52 ms | 15.69 ms | ✅ PASS |
| Round 10 | 5.39 ms | 10.73 ms | 15.19 ms | 16.49 ms | ✅ PASS |

---

## 3. Summary

- **Overall Average Query Latency:** **9.09 ms**
- **Peak Query Latency:** **15.87 ms**
- **Average Full Tick Duration:** **15.36 ms** (well within 250 ms tick budget)
- **Verdict:** **ALL QUERIES PASSED (< 20 ms)**

*Report generated automatically by `server/geo/scripts/spatial-audit.js`.*
