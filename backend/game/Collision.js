/**
 * Collision - Distance-based tag detection for circular players.
 * Tag cooldown (1 second) is enforced per-tagger.
 */

const { Player } = require('./Player');

const PLAYER_RADIUS = Player.PLAYER_RADIUS;
const COLLISION_RADIUS = PLAYER_RADIUS * 2; // 50px total: two circles touch

/**
 * Distance between two points.
 */
function distance(ax, ay, bx, by) {
  return Math.sqrt((bx - ax) ** 2 + (by - ay) ** 2);
}

/**
 * Check all player pairs for tag collision. Returns array of { taggerId, taggedId }
 * where tagger is the one who initiated (moved into) the other. We simplify: if A and B
 * overlap, the one with lower id is tagger to avoid duplicates; in a symmetric game
 * either could be "tagger" so we pick consistently.
 */
function checkCollisions(players, now) {
  const results = [];
  const arr = [...players];

  for (let i = 0; i < arr.length; i++) {
    const a = arr[i];
    for (let j = i + 1; j < arr.length; j++) {
      const b = arr[j];
      const dist = distance(a.position.x, a.position.y, b.position.x, b.position.y);
      if (dist >= COLLISION_RADIUS) continue;

      // Collision: decide who tags whom (both could score in 1s cooldown - we allow one tag per pair per collision)
      if (a.canTag(now)) {
        results.push({ taggerId: a.id, taggedId: b.id });
      }
      if (b.canTag(now)) {
        results.push({ taggerId: b.id, taggedId: a.id });
      }
    }
  }

  return results;
}

module.exports = { checkCollisions, COLLISION_RADIUS, distance };
