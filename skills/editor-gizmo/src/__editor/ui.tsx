import { Entity, Transform } from '@dcl/sdk/ecs'
import { Color4, Quaternion } from '@dcl/sdk/math'
import ReactEcs, { ReactEcsRenderer, UiEntity, Label } from '@dcl/sdk/react-ecs'
import { state, selectableInfoMap } from './state'
import { undoCount, redoCount, undo, redo } from './history'
import { createGizmo } from './gizmo'
import { toggleEditorCamera, focusSelectedEntity } from './camera'
import { selectEntity, deselectEntity } from './selection'

// ── Icons ───────────────────────────────────────────────

const IC = {
  deselect: 'https://www.iconsdb.com/icons/download/white/cursor-48.png',
  move:     'https://www.iconsdb.com/icons/download/white/expand-48.png',
  rotate:   'https://www.iconsdb.com/icons/download/white/rotate-48.png',
  undo:     'https://www.iconsdb.com/icons/download/white/undo-48.png',
  redo:     'https://www.iconsdb.com/icons/download/white/redo-48.png',
  camera:   'https://www.iconsdb.com/icons/download/white/camera-48.png',
  focus:    'https://www.iconsdb.com/icons/download/white/location-48.png',
  model:    'https://www.iconsdb.com/icons/download/white/box-48.png',
  mesh:     'https://www.iconsdb.com/icons/download/white/puzzle-48.png',
}

// ── Theme ───────────────────────────────────────────────

// Dark green-tinted palette inspired by Creator Hub
const T = {
  bg:          Color4.create(0.12, 0.14, 0.13, 0.96),
  bgDark:      Color4.create(0.09, 0.11, 0.10, 0.98),
  border:      Color4.create(0.20, 0.24, 0.22, 0.50),
  headerBg:    Color4.create(0.14, 0.17, 0.15, 1),
  btnDefault:  Color4.create(0.16, 0.19, 0.17, 0.9),
  btnHover:    Color4.create(0.22, 0.27, 0.24, 1),
  btnActive:   Color4.create(0.20, 0.38, 0.32, 1),
  btnActiveH:  Color4.create(0.24, 0.46, 0.38, 1),
  sep:         Color4.create(0.26, 0.30, 0.28, 0.35),
  rowEven:     Color4.create(0.11, 0.13, 0.12, 1),
  rowOdd:      Color4.create(0.13, 0.15, 0.14, 1),
  rowHover:    Color4.create(0.18, 0.22, 0.20, 1),
  rowSelected: Color4.create(0.20, 0.38, 0.32, 1),
  textDim:     Color4.create(0.42, 0.48, 0.45, 1),
  textMed:     Color4.create(0.60, 0.68, 0.64, 1),
  textBright:  Color4.create(0.88, 0.92, 0.90, 1),
  textDisabled:Color4.create(0.28, 0.32, 0.30, 1),
  accent:      Color4.create(0.30, 0.75, 0.55, 1),
  xAxis:       Color4.create(0.95, 0.40, 0.40, 1),
  yAxis:       Color4.create(0.40, 0.90, 0.40, 1),
  zAxis:       Color4.create(0.40, 0.55, 0.95, 1),
  statusOk:    Color4.create(0.30, 0.80, 0.45, 1),
  statusWarn:  Color4.create(1.0, 0.80, 0.20, 1),
  statusOff:   Color4.create(0.55, 0.28, 0.28, 1),
}

// ── Sizes ───────────────────────────────────────────────

const BTN = 34
const ICON_SZ = 18
const SEP_GAP = 6
const PANEL_W = 190
const ROW_H = 22
const MAX_ROWS = 20

// ── Interaction State ───────────────────────────────────

let hovered: string | null = null
let hierScroll = 0
let hierHov: number | null = null

// ── Helpers ─────────────────────────────────────────────

function pos3() {
  if (state.selectedEntity !== undefined && Transform.has(state.selectedEntity)) {
    const p = Transform.get(state.selectedEntity).position
    return { x: p.x.toFixed(2), y: p.y.toFixed(2), z: p.z.toFixed(2) }
  }
  return { x: '-', y: '-', z: '-' }
}

function rot3() {
  if (state.selectedEntity !== undefined && Transform.has(state.selectedEntity)) {
    const e = Quaternion.toEulerAngles(Transform.get(state.selectedEntity).rotation)
    return { x: e.x.toFixed(1), y: e.y.toFixed(1), z: e.z.toFixed(1) }
  }
  return { x: '-', y: '-', z: '-' }
}

// ── Toolbar Button ──────────────────────────────────────

function TBtn(id: string, icon: string, key: string, active: boolean, disabled: boolean, fn: () => void) {
  const h = hovered === id
  const bg = disabled ? T.btnDefault
    : active && h ? T.btnActiveH
    : active ? T.btnActive
    : h ? T.btnHover
    : T.btnDefault
  const op = disabled ? 0.18 : active ? 1.0 : h ? 0.85 : 0.48

  return (
    <UiEntity
      uiTransform={{ width: BTN, height: BTN, margin: { left: 2, right: 2 }, justifyContent: 'center', alignItems: 'center', flexDirection: 'column' }}
      uiBackground={{ color: bg }}
      onMouseEnter={() => { hovered = id }}
      onMouseLeave={() => { if (hovered === id) hovered = null }}
      onMouseDown={() => { if (!disabled) fn() }}
    >
      <UiEntity
        uiTransform={{ width: ICON_SZ, height: ICON_SZ }}
        uiBackground={{ textureMode: 'stretch', texture: { src: icon }, color: Color4.create(1, 1, 1, op) }}
      />
      <Label value={key} fontSize={7} color={active ? T.textMed : T.textDim} uiTransform={{ height: 9 }} textAlign="middle-center" />
    </UiEntity>
  )
}

function Sep() {
  return <UiEntity uiTransform={{ width: 1, height: BTN - 12, margin: { left: SEP_GAP, right: SEP_GAP }, alignSelf: 'center' }} uiBackground={{ color: T.sep }} />
}

// ── Toolbar ─────────────────────────────────────────────

function Toolbar(sel: boolean) {
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { top: 6 },
        width: '100%', height: 48,
        justifyContent: 'center', alignItems: 'flex-start',
      }}
    >
      <UiEntity uiTransform={{ padding: 1, flexDirection: 'row', alignItems: 'center' }} uiBackground={{ color: T.border }}>
        <UiEntity uiTransform={{ padding: { left: 6, right: 6, top: 3, bottom: 3 }, flexDirection: 'row', alignItems: 'center' }} uiBackground={{ color: T.bg }}>
          {TBtn('desel', IC.deselect, 'F', !sel, false, () => { if (sel) deselectEntity() })}
          {TBtn('move', IC.move, 'E', sel && state.gizmoMode === 'translate', !sel, () => { state.gizmoMode = 'translate'; if (sel) createGizmo() })}
          {TBtn('rot', IC.rotate, 'E', sel && state.gizmoMode === 'rotate', !sel, () => { state.gizmoMode = 'rotate'; if (sel) createGizmo() })}
          {Sep()}
          {TBtn('undo', IC.undo, '4', false, undoCount() === 0, () => { undo() })}
          {TBtn('redo', IC.redo, 'Sh4', false, redoCount() === 0, () => { redo() })}
          {Sep()}
          {TBtn('cam', IC.camera, '1', state.editorCamActive, false, () => { toggleEditorCamera() })}
          {TBtn('foc', IC.focus, 'F', false, !sel, () => { if (!state.editorCamActive) toggleEditorCamera(); focusSelectedEntity() })}
          {Sep()}
          <UiEntity uiTransform={{ width: 8, height: 8, margin: { left: 3, right: 2 }, alignSelf: 'center' }}
            uiBackground={{ color: state.wsConnected ? (state.pendingChanges > 0 ? T.statusWarn : T.statusOk) : T.statusOff }} />
        </UiEntity>
      </UiEntity>
    </UiEntity>
  )
}

// ── Tree Builder ────────────────────────────────────────

interface TreeRow {
  e: Entity
  name: string
  isModel: boolean
  depth: number
}

/** Build a flattened, depth-first, alphabetically sorted hierarchy list. */
function buildTree(): TreeRow[] {
  const names = new Map<number, { name: string; isModel: boolean }>()
  const childrenOf = new Map<number, number[]>()
  const rootIds: number[] = []

  for (const [entity, info] of selectableInfoMap) {
    const id = entity as number
    names.set(id, { name: info.name, isModel: info.isModel })

    const pid = info.parentEntity
    if (pid !== undefined && selectableInfoMap.has(pid as Entity)) {
      const kids = childrenOf.get(pid)
      if (kids) kids.push(id)
      else childrenOf.set(pid, [id])
    } else {
      rootIds.push(id)
    }
  }

  const byName = (a: number, b: number): number => {
    const na = names.get(a)!.name.toLowerCase()
    const nb = names.get(b)!.name.toLowerCase()
    return na < nb ? -1 : na > nb ? 1 : 0
  }
  rootIds.sort(byName)
  for (const [, kids] of childrenOf) kids.sort(byName)

  const flat: TreeRow[] = []
  const visit = (ids: number[], depth: number) => {
    for (const id of ids) {
      const { name, isModel } = names.get(id)!
      flat.push({ e: id as Entity, name, isModel, depth })
      const kids = childrenOf.get(id)
      if (kids) visit(kids, depth + 1)
    }
  }
  visit(rootIds, 0)
  return flat
}

// ── Right Panel (Hierarchy + Properties) ────────────────

function RightPanel(sel: boolean) {
  const flat = buildTree()
  const total = flat.length
  const maxScr = Math.max(0, total - MAX_ROWS)
  hierScroll = Math.max(0, Math.min(hierScroll, maxScr))

  // Auto-scroll to keep selected entity visible
  if (sel) {
    const selIdx = flat.findIndex(n => n.e === state.selectedEntity)
    if (selIdx >= 0) {
      if (selIdx < hierScroll) hierScroll = selIdx
      else if (selIdx >= hierScroll + MAX_ROWS) hierScroll = selIdx - MAX_ROWS + 1
    }
  }

  const pos = pos3()
  const rot = rot3()
  const visibleCount = Math.min(MAX_ROWS, total - hierScroll)
  const canUp = hierScroll > 0
  const canDown = hierScroll < maxScr

  // Build row elements in a for-loop (not .map() — DCL React-ECS renders .map() in reverse)
  // Uses entity ID as key for stable rendering order
  const hierRows: ReactEcs.JSX.Element[] = []
  for (let i = 0; i < visibleCount; i++) {
    const node = flat[hierScroll + i]
    const eid = node.e as number
    const isSel = state.selectedEntity === node.e
    const isHov = hierHov === eid
    const globalIdx = hierScroll + i

    let bg: Color4
    if (isSel) bg = T.rowSelected
    else if (isHov) bg = T.rowHover
    else bg = globalIdx % 2 === 0 ? T.rowEven : T.rowOdd

    const textCol = isSel ? T.textBright : isHov ? T.textMed : T.textDim
    const leftPad = 8 + node.depth * 10
    const maxChars = Math.max(8, 18 - node.depth * 2)
    const label = node.name.length > maxChars ? node.name.substring(0, maxChars - 1) + '..' : node.name

    hierRows.push(
      <UiEntity
        key={eid}
        uiTransform={{ width: '100%', height: ROW_H, padding: { left: leftPad, right: 4 }, alignItems: 'center', flexDirection: 'row' }}
        uiBackground={{ color: bg }}
        onMouseEnter={() => { hierHov = eid }}
        onMouseLeave={() => { if (hierHov === eid) hierHov = null }}
        onMouseDown={() => { selectEntity(eid as Entity) }}
      >
        <UiEntity
          uiTransform={{ width: 12, height: 12, margin: { right: 4 } }}
          uiBackground={{
            textureMode: 'stretch',
            texture: { src: node.isModel ? IC.model : IC.mesh },
            color: Color4.create(1, 1, 1, isSel ? 0.7 : 0.3),
          }}
        />
        <Label value={label} fontSize={9} color={textCol} uiTransform={{ height: 14 }} />
      </UiEntity>
    )
  }

  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { top: 6, right: 6 },
        flexDirection: 'column',
      }}
    >
      {/* ── Hierarchy Panel ──────────────────── */}
      <UiEntity
        uiTransform={{ width: PANEL_W, flexDirection: 'column', padding: 1 }}
        uiBackground={{ color: T.border }}
      >
        <UiEntity uiTransform={{ width: '100%', flexDirection: 'column' }} uiBackground={{ color: T.bgDark }}>
          {/* Header */}
          <UiEntity
            uiTransform={{ width: '100%', height: 26, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: { left: 10, right: 10 } }}
            uiBackground={{ color: T.headerBg }}
          >
            <Label value="HIERARCHY" fontSize={9} color={T.textMed} uiTransform={{ height: 12 }} />
            <Label value={`${total}`} fontSize={9} color={T.textDim} uiTransform={{ height: 12 }} />
          </UiEntity>

          {/* Scroll Up */}
          <UiEntity
            uiTransform={{ width: '100%', height: canUp ? 16 : 0, justifyContent: 'center', alignItems: 'center', display: canUp ? 'flex' : 'none' }}
            uiBackground={{ color: T.headerBg }}
            onMouseDown={() => { hierScroll = Math.max(0, hierScroll - 5) }}
          >
            <Label value="^ ^ ^" fontSize={8} color={T.textDim} uiTransform={{ height: 10 }} textAlign="middle-center" />
          </UiEntity>

          {/* Rows container — fixed height */}
          <UiEntity
            uiTransform={{ width: '100%', height: MAX_ROWS * ROW_H, flexDirection: 'column', overflow: 'hidden' }}
          >
            {hierRows}
          </UiEntity>

          {/* Scroll Down */}
          <UiEntity
            uiTransform={{ width: '100%', height: canDown ? 16 : 0, justifyContent: 'center', alignItems: 'center', display: canDown ? 'flex' : 'none' }}
            uiBackground={{ color: T.headerBg }}
            onMouseDown={() => { hierScroll = Math.min(maxScr, hierScroll + 5) }}
          >
            <Label value="v v v" fontSize={8} color={T.textDim} uiTransform={{ height: 10 }} textAlign="middle-center" />
          </UiEntity>
        </UiEntity>
      </UiEntity>

      {/* ── Properties Panel (separate) ──────── */}
      <UiEntity
        uiTransform={{
          width: PANEL_W,
          flexDirection: 'column',
          padding: 1,
          margin: { top: 4 },
          display: sel ? 'flex' : 'none',
        }}
        uiBackground={{ color: T.border }}
      >
        <UiEntity uiTransform={{ width: '100%', flexDirection: 'column' }} uiBackground={{ color: T.bgDark }}>
          {/* Properties header */}
          <UiEntity
            uiTransform={{ width: '100%', height: 24, padding: { left: 10, right: 10 }, alignItems: 'center' }}
            uiBackground={{ color: T.headerBg }}
          >
            <Label value="TRANSFORM" fontSize={9} color={T.textMed} uiTransform={{ height: 12 }} />
          </UiEntity>

          {/* Entity name */}
          <UiEntity uiTransform={{ width: '100%', padding: { left: 10, right: 10, top: 6, bottom: 2 } }}>
            <Label value={state.selectedName} fontSize={11} color={T.textBright} uiTransform={{ height: 16 }} />
          </UiEntity>

          {/* Position */}
          <UiEntity uiTransform={{ width: '100%', padding: { left: 10, right: 6, top: 4 }, flexDirection: 'column' }}>
            <Label value="Position" fontSize={8} color={T.textDim} uiTransform={{ height: 11, margin: { bottom: 2 } }} />
            <UiEntity uiTransform={{ flexDirection: 'row', width: '100%', height: 18 }}>
              {ValField('X', pos.x, T.xAxis)}
              {ValField('Y', pos.y, T.yAxis)}
              {ValField('Z', pos.z, T.zAxis)}
            </UiEntity>
          </UiEntity>

          {/* Rotation */}
          <UiEntity uiTransform={{ width: '100%', padding: { left: 10, right: 6, top: 4, bottom: 8 }, flexDirection: 'column' }}>
            <Label value="Rotation" fontSize={8} color={T.textDim} uiTransform={{ height: 11, margin: { bottom: 2 } }} />
            <UiEntity uiTransform={{ flexDirection: 'row', width: '100%', height: 18 }}>
              {ValField('X', rot.x, T.xAxis)}
              {ValField('Y', rot.y, T.yAxis)}
              {ValField('Z', rot.z, T.zAxis)}
            </UiEntity>
          </UiEntity>
        </UiEntity>
      </UiEntity>

    </UiEntity>
  )
}

/** Labeled value field like Creator Hub: [X 12.34] */
function ValField(label: string, value: string, color: Color4) {
  return (
    <UiEntity
      uiTransform={{ height: 18, margin: { right: 3 }, flexDirection: 'row', alignItems: 'center', flexGrow: 1 }}
      uiBackground={{ color: Color4.create(0.08, 0.10, 0.09, 1) }}
    >
      <UiEntity
        uiTransform={{ width: 16, height: 18, justifyContent: 'center', alignItems: 'center' }}
        uiBackground={{ color: Color4.create(color.r * 0.4, color.g * 0.4, color.b * 0.4, 1) }}
      >
        <Label value={label} fontSize={8} color={Color4.create(color.r, color.g, color.b, 0.9)} uiTransform={{ height: 10 }} textAlign="middle-center" />
      </UiEntity>
      <Label value={value} fontSize={9} color={T.textBright} uiTransform={{ height: 14, margin: { left: 4 } }} />
    </UiEntity>
  )
}

// ── Main UI ─────────────────────────────────────────────

const EditorUI = () => {
  const sel = state.selectedEntity !== undefined

  return (
    <UiEntity uiTransform={{ width: '100%', height: '100%' }}>
      {Toolbar(sel)}
      {RightPanel(sel)}
    </UiEntity>
  )
}

export function setupEditorUi() {
  ReactEcsRenderer.setUiRenderer(EditorUI, { virtualWidth: 1280, virtualHeight: 720 })
}
