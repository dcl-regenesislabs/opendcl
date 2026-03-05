/** Pure math utilities — no ECS imports, fully unit-testable. */

import { Vector3 } from '@dcl/sdk/math'
import { Axis } from './state'

export function axisToVector(axis: Axis): Vector3 {
  switch (axis) {
    case 'x': return Vector3.Right()
    case 'y': return Vector3.Up()
    case 'z': return Vector3.Forward()
  }
}

/**
 * Pick the drag plane normal most perpendicular to the camera forward.
 * Avoids grazing-angle intersections.
 */
export function getDragPlaneNormal(axis: Axis, cameraForward: Vector3): Vector3 {
  const candidates: Vector3[] = []
  if (axis !== 'x') candidates.push(Vector3.Right())
  if (axis !== 'y') candidates.push(Vector3.Up())
  if (axis !== 'z') candidates.push(Vector3.Forward())

  let best = candidates[0]
  let bestDot = 0
  for (const n of candidates) {
    const d = Math.abs(Vector3.dot(cameraForward, n))
    if (d > bestDot) { bestDot = d; best = n }
  }
  return best
}

/** Cast a ray against an infinite plane. Returns hit point or null. */
export function rayPlaneIntersect(
  rayOrigin: Vector3, rayDir: Vector3, planePoint: Vector3, planeNormal: Vector3
): Vector3 | null {
  const denom = Vector3.dot(planeNormal, rayDir)
  if (Math.abs(denom) < 1e-6) return null
  const diff = Vector3.subtract(planePoint, rayOrigin)
  const t = Vector3.dot(diff, planeNormal) / denom
  if (t < 0) return null
  return Vector3.add(rayOrigin, Vector3.scale(rayDir, t))
}

/** Compute the angle of a hit point on the rotation plane via atan2. */
export function hitAngleOnPlane(hit: Vector3, center: Vector3, axis: Axis): number {
  const d = Vector3.subtract(hit, center)
  switch (axis) {
    case 'x': return Math.atan2(d.z, d.y)
    case 'y': return Math.atan2(d.x, d.z)
    case 'z': return Math.atan2(d.y, d.x)
  }
}

/** Round a number to N decimal places. */
export function round(v: number, decimals: number = 2): number {
  const f = Math.pow(10, decimals)
  return Math.round(v * f) / f
}
