import { engine, Transform } from '@dcl/sdk/ecs'
import { Color4, Quaternion } from '@dcl/sdk/math'
import ReactEcs, { ReactEcsRenderer, UiEntity, Label } from '@dcl/sdk/react-ecs'
import { state } from './state'

function getPos(): { x: string; y: string; z: string } {
  if (state.selectedEntity !== undefined && Transform.has(state.selectedEntity)) {
    const t = Transform.get(state.selectedEntity).position
    return { x: t.x.toFixed(2), y: t.y.toFixed(2), z: t.z.toFixed(2) }
  }
  return { x: '-', y: '-', z: '-' }
}

function getRot(): { x: string; y: string; z: string } {
  if (state.selectedEntity !== undefined && Transform.has(state.selectedEntity)) {
    const t = Transform.get(state.selectedEntity).rotation
    const euler = Quaternion.toEulerAngles(t)
    return { x: euler.x.toFixed(1), y: euler.y.toFixed(1), z: euler.z.toFixed(1) }
  }
  return { x: '-', y: '-', z: '-' }
}

const EditorUI = () => {
  const pos = getPos()
  const rot = getRot()
  const hasSelection = state.selectedEntity !== undefined
  const modeLabel = state.gizmoMode === 'translate' ? 'Move' : 'Rotate'

  return (
    <UiEntity uiTransform={{ width: '100%', height: '100%' }}>
      <UiEntity
        uiTransform={{
          positionType: 'absolute',
          position: { top: 10, left: 10 },
          width: 280,
          height: hasSelection ? 185 : 70,
          padding: { top: 10, bottom: 10, left: 14, right: 14 },
          flexDirection: 'column',
        }}
        uiBackground={{ color: Color4.create(0.05, 0.05, 0.08, 0.85) }}
      >
        <Label
          value={`GIZMO v2  [${modeLabel}]`}
          fontSize={13}
          color={Color4.create(0.5, 0.5, 0.6, 1)}
          uiTransform={{ width: '100%', height: 18 }}
        />
        <Label
          value="E: toggle Move / Rotate  |  F: deselect"
          fontSize={11}
          color={Color4.create(0.4, 0.4, 0.5, 1)}
          uiTransform={{ width: '100%', height: 16 }}
        />

        {hasSelection ? (
          <UiEntity uiTransform={{ flexDirection: 'column', width: '100%' }}>
            <Label
              value={`Selected: ${state.selectedName}`}
              fontSize={16}
              color={Color4.White()}
              uiTransform={{ width: '100%', height: 24, margin: { top: 4 } }}
            />
            <Label
              value={`Pos  X: ${pos.x}   Y: ${pos.y}   Z: ${pos.z}`}
              fontSize={14}
              color={Color4.create(0.8, 0.9, 1, 1)}
              uiTransform={{ width: '100%', height: 20, margin: { top: 2 } }}
            />
            <Label
              value={`Rot  X: ${rot.x}   Y: ${rot.y}   Z: ${rot.z}`}
              fontSize={14}
              color={Color4.create(0.8, 0.9, 1, 1)}
              uiTransform={{ width: '100%', height: 20, margin: { top: 2 } }}
            />
            <Label
              value={
                state.isDragging
                  ? `${state.gizmoMode === 'translate' ? 'Moving' : 'Rotating'} ${state.dragAxis.toUpperCase()}...`
                  : `Drag ${state.gizmoMode === 'translate' ? 'arrow' : 'disc'} | click ground or F to deselect`
              }
              fontSize={12}
              color={Color4.create(0.5, 0.5, 0.6, 1)}
              uiTransform={{ width: '100%', height: 18, margin: { top: 2 } }}
            />
          </UiEntity>
        ) : (
          <Label
            value="Click an object to select"
            fontSize={13}
            color={Color4.create(0.5, 0.5, 0.6, 1)}
            uiTransform={{ width: '100%', height: 18, margin: { top: 4 } }}
          />
        )}
      </UiEntity>
    </UiEntity>
  )
}

export function setupUi() {
  ReactEcsRenderer.setUiRenderer(EditorUI)
}
