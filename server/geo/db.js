// server/geo/db.js — Person 2 (Module 2: Geospatial engine)
// Connects to MongoDB using Mongoose.
// Per CONTRACTS.md, the caller loads .env and passes the uri.

import mongoose from 'mongoose';

/**
 * Connect to MongoDB.
 * Reuses existing connection if already open or in progress.
 *
 * @param {string} uri - MongoDB connection string (e.g. process.env.MONGODB_URI)
 * @returns {Promise<typeof mongoose>}
 */
export async function connectDb(uri) {
  if (!uri) {
    throw new Error('[geo] connectDb: uri is required');
  }

  // readyState: 0 = disconnected, 1 = connected, 2 = connecting, 3 = disconnecting
  if (mongoose.connection.readyState === 1) {
    return mongoose;
  }

  try {
    await mongoose.connect(uri);
    console.log('[geo] connected');
    return mongoose;
  } catch (err) {
    console.error(`[geo] connection error: ${err.message}`);
    throw err;
  }
}

/**
 * Disconnect from MongoDB cleanly (used by tests and scripts).
 * @returns {Promise<void>}
 */
export async function disconnectDb() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
    console.log('[geo] disconnected');
  }
}
