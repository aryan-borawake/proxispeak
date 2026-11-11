# Geospatial Engine (Module 2) — Technical Guide & Architecture

**Author:** Pratik (Person 2)  
**Branch:** `pratik`  
**Folder:** `server/geo/`  
**Review Target:** Proximity discovery query under 20 ms for 50 active avatars  

---

## 1. What This Module Does

The Geospatial Engine answers one core question four times a second (every 250 ms):
**"Who is near whom?"**

### The Riya and Sam Worked Example
Suppose three users are present in the virtual office room `office-1`:
- **Riya** is located at coordinates $x_1 = 340$, $y_1 = 210$.
- **Sam** is located at coordinates $x_2 = 395$, $y_2 = 230$.
- **Priya** is far away at coordinates $x_3 = 900$, $y_3 = 600$.

#### Distance Calculation:
Using straight-line Euclidean distance:
$$\text{distance} = \sqrt{(x_2 - x_1)^2 + (y_2 - y_1)^2} = \operatorname{Math.hypot}(\Delta x, \Delta y)$$

1. **Riya to Sam:**
   $$\Delta x = 395 - 340 = 55, \quad \Delta y = 230 - 210 = 20$$
   $$\text{distance} = \sqrt{55^2 + 20^2} = \sqrt{3025 + 400} = \sqrt{3425} \approx 58.52\text{ px}$$
   Because $58.52\text{ px} \le 100\text{ px}$ (`EARSHOT_PX`), Riya and Sam are within earshot and initiate a direct WebRTC voice connection.

2. **Riya to Priya:**
   $$\Delta x = 900 - 340 = 560, \quad \Delta y = 600 - 210 = 390$$
   $$\text{distance} = \sqrt{560^2 + 390^2} = \sqrt{313600 + 152100} = \sqrt{465700} \approx 682.42\text{ px}$$
   Because $682.42\text{ px} > 140\text{ px}$ (`DISCONNECT_PX`), Priya is far out of range.

---

## 2. Why a Flat `2d` Index (and NOT `2dsphere`)

MongoDB provides two spatial index types:
1. **`2dsphere`**: Designed for spherical Earth models (WGS 84 datum) calculating distances along a sphere in meters using longitude and latitude coordinates bounded to $[-180, 180]$ and $[-90, 90]$.
2. **`2d`**: Designed for flat Cartesian coordinate planes using Euclidean distance in pixel units.

ProxiSpeak's virtual office canvas is a flat 2D pixel grid ranging up to $4096\text{ px}$ (`WORLD_MAX_PX`). Therefore:
- Storing coordinates like $[340, 210]$ in a `2dsphere` index would fail or cause incorrect spherical distortions.
- The `2d` index is created with explicit boundaries:
  ```js
  positionSchema.index(
    { loc: '2d', roomId: 1 },
    { min: 0, max: WORLD_MAX_PX } // 0 to 4096
  );
  ```

---

## 3. High-Frequency Batch Writes (`upsertPositions`)

- Avatars send their position up to 10 times per second (`MOVE_SEND_HZ`).
- If 50 players each made independent database updates 10 times per second, the database would receive **500 writes per second**, exceeding cloud quotas and inducing network latency.
- **Solution:** Positions stay in server memory between ticks. During the 250 ms proximity tick (`PROXIMITY_TICK_MS`), all players who moved are written in **one single `bulkWrite` operation**:
  ```js
  const bulkOps = movedUsers.map((u) => ({
    updateOne: {
      filter: { _id: u.id },
      update: {
        $set: { roomId, loc: [u.x, u.y], updatedAt: new Date() },
      },
      upsert: true,
    },
  }));
  await Position.bulkWrite(bulkOps, { ordered: false });
  ```
  This reduces 500 individual writes to **4 batched operations per second**.

---

## 4. Connection / Disconnection Hysteresis (`computePeerChanges`)

To avoid voice connections rapidly flapping/flickering on and off when avatars walk along the 100 px border:
- **Connection threshold (`EARSHOT_PX`):** $100\text{ px}$. An unconnected avatar only enters voice chat when $\text{distance} \le 100\text{ px}$.
- **Disconnection threshold (`DISCONNECT_PX`):** $140\text{ px}$. An already connected avatar remains connected until $\text{distance} > 140\text{ px}$.
- **Buffer Zone ($100\text{ px} < \text{distance} \le 140\text{ px}$):** Maintains its current state. Existing calls continue; unconnected players do not start.

This is implemented as a **pure function** in `server/geo/peerChanges.js`:
```js
export function computePeerChanges(currentPeerIds, nearby, { connectPx, disconnectPx });
```

---

## 5. Public API and Handover to Person 1

Person 1 imports the module from `server/geo/index.js` matching `CONTRACTS.md`:

```js
import { connectDb, createGeoEngine, computePeerChanges } from './geo/index.js';

// 1. Connect on startup
await connectDb(process.env.MONGODB_URI);

// 2. Initialize engine for room
const geo = createGeoEngine({ roomId: DEFAULT_ROOM });

// 3. Proximity tick (every 250 ms)
const movedUsers = [{ id: 'riya', x: 340, y: 210 }];
await geo.upsertPositions(movedUsers);

// 4. Query nearby players for each moved user
const nearby = await geo.findNearby('riya', DISCONNECT_PX);
// => [{ id: 'sam', distance: 58.52 }]

// 5. Update WebRTC peer connections
const { entered, left } = computePeerChanges(currentPeers, nearby, {
  connectPx: EARSHOT_PX,
  disconnectPx: DISCONNECT_PX,
});
```

---

## 6. How to Run Verification and Audits

```bash
# 1. Run deterministic distance and hysteresis test suite (16 tests)
node server/geo/scripts/test-nearby.js

# 2. Seed configurable fake users
node server/geo/scripts/seed-fake-users.js 50

# 3. Run live mid-review spatial performance audit (10 rounds of 50 queries)
node server/geo/scripts/spatial-audit.js
```

### Measured Benchmark Summary
- **Average Query Latency:** **~9.0 ms** (Target: $< 20\text{ ms}$)
- **Worst-case Query Latency:** **15.66 ms** (Target: $< 20\text{ ms}$)
- **Average Full Tick Duration:** **15.15 ms** (Target: $< 250\text{ ms}$)
- **Query Plan:** Verified utilizing `loc_2d_roomId_1` with `GEO_NEAR_2D` stage.
