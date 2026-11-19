export function snapMirrorAngle(angle, required, tolerance, powered) {
  if (!powered) return angle;
  const delta = Math.atan2(Math.sin(required - angle), Math.cos(required - angle));
  return Math.abs(delta) <= tolerance ? angle + delta : angle;
}

export function withinMirrorTarget(x, y, centerX, centerY, depth, radius) {
  return depth >= -1 && depth <= 1 && Math.hypot(x - centerX, y - centerY) <= radius;
}
