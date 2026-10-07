// Prints the trailer cut as JSON: [{ id, frames }] (used by build.mjs).
import { SHOTS, TIMELINE } from '../../src/trailer/shots';
console.log(JSON.stringify(TIMELINE.map((id) => ({ id, frames: SHOTS[id].frames }))));
