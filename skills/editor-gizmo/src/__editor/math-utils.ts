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
 *
 * When worldAxis is provided (parent-rotated), candidates are computed
 * as the two axes perpendicular to it. Otherwise falls back to world axes.
 */
export function getDragPlaneNormal(axis: Axis, cameraForward: Vector3, worldAxis?: Vector3): Vector3 {
  let candidates: Vector3[]

  if (worldAxis) {
    // Build two axes perpendicular to the (potentially rotated) drag axis
    const up = Vector3.Up()
    let perp1 = Vector3.cross(worldAxis, up)
    if (Vector3.length(perp1) < 0.001) {
      // worldAxis is nearly vertical — use Forward as fallback
      perp1 = Vector3.cross(worldAxis, Vector3.Forward())
    }
    perp1 = Vector3.normalize(perp1)
    const perp2 = Vector3.normalize(Vector3.cross(worldAxis, perp1))
    candidates = [perp1, perp2]
  } else {
    const others = getOtherAxes(axis)
    candidates = [axisToVector(others[0]), axisToVector(others[1])]
  }

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

export function copyVec3(dst: { x: number; y: number; z: number }, src: { x: number; y: number; z: number }) {
  dst.x = src.x; dst.y = src.y; dst.z = src.z
}

export function copyQuat(dst: { x: number; y: number; z: number; w: number }, src: { x: number; y: number; z: number; w: number }) {
  dst.x = src.x; dst.y = src.y; dst.z = src.z; dst.w = src.w
}

/**
 * Compute the angle of a hit point on an arbitrarily oriented rotation plane.
 * worldAxis is the plane normal (rotation axis in world space).
 */
export function hitAngleOnWorldPlane(hit: Vector3, center: Vector3, worldAxis: Vector3): number {
  const d = Vector3.subtract(hit, center)
  // Build two perpendicular vectors in the plane
  const up = Math.abs(Vector3.dot(worldAxis, Vector3.Up())) < 0.99
    ? Vector3.Up() : Vector3.Forward()
  const u = Vector3.normalize(Vector3.cross(worldAxis, up))
  const v = Vector3.normalize(Vector3.cross(worldAxis, u))
  return Math.atan2(Vector3.dot(d, v), Vector3.dot(d, u))
}

export function getOtherAxes(axis: Axis): [Axis, Axis] {
  switch (axis) {
    case 'x': return ['y', 'z']
    case 'y': return ['x', 'z']
    case 'z': return ['x', 'y']
  }
}

export function applyFlatTransform(
  t: { position: {x:number;y:number;z:number}; rotation: {x:number;y:number;z:number;w:number}; scale: {x:number;y:number;z:number} },
  s: { px:number; py:number; pz:number; rx:number; ry:number; rz:number; rw:number; sx:number; sy:number; sz:number }
) {
  t.position.x = s.px; t.position.y = s.py; t.position.z = s.pz
  t.rotation.x = s.rx; t.rotation.y = s.ry; t.rotation.z = s.rz; t.rotation.w = s.rw
  t.scale.x = s.sx;    t.scale.y = s.sy;    t.scale.z = s.sz
}

/** Round a number to N decimal places. */
export function round(v: number, decimals: number = 2): number {
  const f = Math.pow(10, decimals)
  return Math.round(v * f) / f
}
