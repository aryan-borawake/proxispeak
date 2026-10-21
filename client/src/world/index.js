// client/src/world/index.js — Person 3 (Module 3: 2D world)
export { WorldCanvas } from './WorldCanvas.jsx';
export { WorldLab } from './WorldLab.jsx';

/**
 * A pretend server with wandering bots, for testing without the real server.
 * Has exactly the same functions as `net`.
 */
export function createFakeNet({ bots }) {
  throw new Error(`Not implemented yet — see docs/briefs/module-3-world.md, Task 5`);
}