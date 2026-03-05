/**
 * Editor orbit camera + drag lock camera.
 *
 * Orbit model: target + yaw + pitch + distance.
 * Lock camera: freezes view during gizmo drag (non-editor-cam mode only).
 */

import {
  engine,
  Entity,
  Transform,
  VirtualCamera,
  MainCamera,
  InputModifier,
  inputSystem,
  InputAction,
  PrimaryPointerInfo,
} from '@dcl/sdk/ecs'
import { Vector3, Quaternion } from '@dcl/sdk/math'
import { state, editorEntities, selectableInfoMap, gizmoClickConsumed } from './state'

// ============================================================
// Editor Camera
// ============================================================

let editorCamEntity: Entity | undefined

const editorCam = {
  target: Vector3.create(16, 2, 16),
  yaw: -45,
  pitch: 35,
  distance: 25,
}

// Tuning
const PAN_SPEED = 12
const VERTICAL_SPEED = 8
const ORBIT_SENSITIVITY = 0.15
const ZOOM_SPEED = 15
const MIN_DISTANCE = 3
const MAX_DISTANCE = 80
const MIN_PITCH = 5
const MAX_PITCH = 89
const FOCUS_DISTANCE = 8

export function createEditorCamera() {
  editorCamEntity = engine.addEntity()
  Transform.create(editorCamEntity, {
    position: Vector3.Zero(),
    rotation: Quaternion.Identity(),
  })
  VirtualCamera.create(editorCamEntity, {
    defaultTransition: { transitionMode: VirtualCamera.Transition.Time(0) },
  })
  editorEntities.add(editorCamEntity)
}

function updateEditorCamera() {
  if (editorCamEntity === undefined) return

  const pitchRad = editorCam.pitch * (Math.PI / 180)
  const yawRad = editorCam.yaw * (Math.PI / 180)

  const cosP = Math.cos(pitchRad)
  const offset = Vector3.create(
    -Math.sin(yawRad) * cosP * editorCam.distance,
    Math.sin(pitchRad) * editorCam.distance,
    -Math.cos(yawRad) * cosP * editorCam.distance,
  )

  const camPos = Vector3.add(editorCam.target, offset)
  const forward = Vector3.normalize(Vector3.subtract(editorCam.target, camPos))
  const camRot = Quaternion.lookRotation(forward)

  const t = Transform.getMutable(editorCamEntity)
  t.position.x = camPos.x
  t.position.y = camPos.y
  t.position.z = camPos.z
  t.rotation.x = camRot.x
  t.rotation.y = camRot.y
  t.rotation.z = camRot.z
  t.rotation.w = camRot.w
}

export function activateEditorCamera() {
  if (state.editorCamActive || state.isDragging) return
  state.editorCamActive = true

  if (Transform.has(engine.CameraEntity)) {
    const camT = Transform.get(engine.CameraEntity)
    const fwd = Vector3.rotate(Vector3.Forward(), camT.rotation)
    editorCam.target = Vector3.add(camT.position, Vector3.scale(fwd, editorCam.distance * 0.5))
    editorCam.target.y = Math.max(editorCam.target.y, 0)
  }

  updateEditorCamera()
  MainCamera.getMutable(engine.CameraEntity).virtualCameraEntity = editorCamEntity

  InputModifier.createOrReplace(engine.PlayerEntity, {
    mode: InputModifier.Mode.Standard({ disableAll: true }),
  })

  console.log('[editor] editor camera ON — WASD pan, Space/Shift up/down, 2/3 zoom, drag to orbit, F focus')
}

export function deactivateEditorCamera() {
  if (!state.editorCamActive) return
  state.editorCamActive = false

  MainCamera.getMutable(engine.CameraEntity).virtualCameraEntity = undefined

  if (InputModifier.has(engine.PlayerEntity)) {
    InputModifier.deleteFrom(engine.PlayerEntity)
  }

  console.log('[editor] editor camera OFF')
}

export function toggleEditorCamera() {
  if (state.editorCamActive) deactivateEditorCamera()
  else activateEditorCamera()
}

export function focusSelectedEntity() {
  if (state.selectedEntity === undefined || !Transform.has(state.selectedEntity)) return
  const info = selectableInfoMap.get(state.selectedEntity)
  const entityPos = Transform.get(state.selectedEntity).position
  const offset = info?.centerOffset ?? Vector3.Zero()

  editorCam.target = Vector3.create(
    entityPos.x + offset.x,
    entityPos.y + offset.y,
    entityPos.z + offset.z,
  )
  editorCam.distance = FOCUS_DISTANCE

  updateEditorCamera()
  console.log(`[editor] focused on ${info?.name ?? 'entity'}`)
}

function getCamRight(): Vector3 {
  const yawRad = editorCam.yaw * (Math.PI / 180)
  return Vector3.create(Math.cos(yawRad), 0, -Math.sin(yawRad))
}

function getCamForward(): Vector3 {
  const yawRad = editorCam.yaw * (Math.PI / 180)
  return Vector3.create(Math.sin(yawRad), 0, Math.cos(yawRad))
}

export function editorCameraSystem(dt: number) {
  if (!state.editorCamActive) return

  let changed = false
  const right = getCamRight()
  const forward = getCamForward()

  if (inputSystem.isPressed(InputAction.IA_FORWARD)) {
    editorCam.target = Vector3.add(editorCam.target, Vector3.scale(forward, PAN_SPEED * dt))
    changed = true
  }
  if (inputSystem.isPressed(InputAction.IA_BACKWARD)) {
    editorCam.target = Vector3.add(editorCam.target, Vector3.scale(forward, -PAN_SPEED * dt))
    changed = true
  }
  if (inputSystem.isPressed(InputAction.IA_RIGHT)) {
    editorCam.target = Vector3.add(editorCam.target, Vector3.scale(right, PAN_SPEED * dt))
    changed = true
  }
  if (inputSystem.isPressed(InputAction.IA_LEFT)) {
    editorCam.target = Vector3.add(editorCam.target, Vector3.scale(right, -PAN_SPEED * dt))
    changed = true
  }
  if (inputSystem.isPressed(InputAction.IA_JUMP)) {
    editorCam.target.y += VERTICAL_SPEED * dt
    changed = true
  }
  if (inputSystem.isPressed(InputAction.IA_WALK)) {
    editorCam.target.y -= VERTICAL_SPEED * dt
    changed = true
  }
  if (inputSystem.isPressed(InputAction.IA_ACTION_4)) {
    editorCam.distance = Math.max(MIN_DISTANCE, editorCam.distance - ZOOM_SPEED * dt)
    changed = true
  }
  if (inputSystem.isPressed(InputAction.IA_ACTION_5)) {
    editorCam.distance = Math.min(MAX_DISTANCE, editorCam.distance + ZOOM_SPEED * dt)
    changed = true
  }

  if (inputSystem.isPressed(InputAction.IA_POINTER) && !state.isDragging && !gizmoClickConsumed) {
    const pointer = PrimaryPointerInfo.getOrNull(engine.RootEntity)
    if (pointer && pointer.screenDelta) {
      const dx = pointer.screenDelta.x ?? 0
      const dy = pointer.screenDelta.y ?? 0
      if (Math.abs(dx) > 0.001 || Math.abs(dy) > 0.001) {
        editorCam.yaw += dx * ORBIT_SENSITIVITY
        editorCam.pitch = Math.max(MIN_PITCH, Math.min(MAX_PITCH, editorCam.pitch - dy * ORBIT_SENSITIVITY))
        changed = true
      }
    }
  }

  if (changed) updateEditorCamera()
}

// ============================================================
// Drag Lock Camera
// ============================================================

let lockCamEntity: Entity | undefined

export function createLockCamera() {
  lockCamEntity = engine.addEntity()
  Transform.create(lockCamEntity, {
    position: Vector3.Zero(),
    rotation: Quaternion.Identity(),
  })
  VirtualCamera.create(lockCamEntity, {
    defaultTransition: { transitionMode: VirtualCamera.Transition.Time(0) },
  })
  editorEntities.add(lockCamEntity)
}

export function lockCamera() {
  if (state.editorCamActive || lockCamEntity === undefined) return
  if (!Transform.has(engine.CameraEntity)) return
  const camT = Transform.get(engine.CameraEntity)
  const lockT = Transform.getMutable(lockCamEntity)
  lockT.position.x = camT.position.x
  lockT.position.y = camT.position.y
  lockT.position.z = camT.position.z
  lockT.rotation.x = camT.rotation.x
  lockT.rotation.y = camT.rotation.y
  lockT.rotation.z = camT.rotation.z
  lockT.rotation.w = camT.rotation.w
  MainCamera.getMutable(engine.CameraEntity).virtualCameraEntity = lockCamEntity
}

export function unlockCamera() {
  if (state.editorCamActive || lockCamEntity === undefined) return
  MainCamera.getMutable(engine.CameraEntity).virtualCameraEntity = undefined
}

// ============================================================
// Active Camera Helper
// ============================================================

/** Returns the active camera transform — editor cam when active, otherwise player camera. */
export function getActiveCameraTransform(): { position: { x: number; y: number; z: number }; rotation: { x: number; y: number; z: number; w: number } } {
  if (state.editorCamActive && editorCamEntity !== undefined && Transform.has(editorCamEntity)) {
    return Transform.get(editorCamEntity)
  }
  return Transform.get(engine.CameraEntity)
}
