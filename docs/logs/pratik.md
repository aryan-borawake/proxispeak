# Pratik — Geospatial Engine Learning Log

## 20 October 2026

### What I learned today

- ProxiSpeak is a browser-based virtual office where users move around a 2D map.
- The Geospatial Engine works with map positions represented as pixel coordinates (`x` and `y`), rather than geographic latitude/longitude.
- MongoDB's `2d` geospatial index is appropriate for this 2D pixel plane. The project brief specifies using `2d`, not `2dsphere`.
- MongoDB `$near` will be used to find nearby users.
- MongoDB `$geoWithin` is planned for checking whether users are inside a defined zone in a later phase.
- The planned proximity rule is to connect users at 100 pixels and disconnect them when they move beyond 140 pixels. The gap helps avoid repeatedly connecting and disconnecting users near one boundary.
- The team plan is to keep frequently changing positions in server memory and batch-write moved positions to MongoDB four times per second.
- The target in the project brief is to support 50+ users and keep spatial queries under 20 ms.

### What I completed today

- Set up MongoDB Community Server locally on my Mac and started the MongoDB service.
- Connected to the local database with `mongosh`.
- Tested a local MongoDB connection from Node.js.
- Successfully inserted a test document and read it back, confirming that the local database connection and basic read/write flow work.
- Reviewed the Geospatial Engine responsibilities and identified the first implementation steps: define the position data shape, create a `2d` index, seed fake users, and test a `$near` query.

### Current status

**Completed:** Local MongoDB setup and a basic Node.js database read/write test.

**Next steps:** Check the repository's current `AGENTS.md` and `CONTRACTS.md` instructions when available; then work only inside `server/geo/`, create the position/index setup, seed fake users, and verify a `$near` query against local test data.

### Notes

This entry records setup and learning progress. The Geospatial Engine implementation, batch updates, proximity connection rules, zones, and performance audit are not yet marked complete.
