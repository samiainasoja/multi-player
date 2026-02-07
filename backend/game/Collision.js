/**
 * Collision - Distance utility for circular collision detection.
 */

/**
 * Distance between two points.
 */
function distance(ax, ay, bx, by) {
  return Math.sqrt((bx - ax) ** 2 + (by - ay) ** 2);
}

module.exports = { distance };
