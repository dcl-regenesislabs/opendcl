import { Entity, Transform } from '@dcl/sdk/ecs'
import { Color4, Quaternion } from '@dcl/sdk/math'
import ReactEcs, { ReactEcsRenderer, UiEntity, Label } from '@dcl/sdk/react-ecs'
import { state, selectableInfoMap, lockMap, toggleEditorActive } from './state'
import { undoCount, redoCount, undo, redo } from './history'
import { createGizmo } from './gizmo'
import { toggleEditorCamera, focusSelectedEntity } from './camera'
import { selectEntity, deselectEntity } from './selection'
import { requestReset, requestResetAll, requestLoadPrevious, requestDismissPrevious, requestSetSnapshot } from './persistence'

// ── Icons (Unicode) ─────────────────────────────────────
// Using unicode glyphs instead of external URLs for reliability

// ── Theme ───────────────────────────────────────────────

const C = {
  // Backgrounds
  panel:       Color4.create(0.10, 0.10, 0.12, 0.94),
  panelBorder: Color4.create(0.22, 0.22, 0.26, 0.60),
  header:      Color4.create(0.13, 0.13, 0.15, 1),
  bar:         Color4.create(0.10, 0.10, 0.12, 0.92),
  barBorder:   Color4.create(0.22, 0.22, 0.26, 0.50),

  // Buttons
  btn:         Color4.create(0.18, 0.18, 0.21, 0.90),
  btnHover:    Color4.create(0.26, 0.26, 0.30, 1),
  btnActive:   Color4.create(0.22, 0.42, 0.58, 1),
  btnActiveH:  Color4.create(0.28, 0.50, 0.66, 1),
  btnDanger:   Color4.create(0.50, 0.22, 0.22, 1),
  btnDangerH:  Color4.create(0.60, 0.28, 0.28, 1),
  btnSuccess:  Color4.create(0.20, 0.48, 0.38, 1),
  btnSuccessH: Color4.create(0.26, 0.56, 0.44, 1),

  // Rows
  rowA:        Color4.create(0.11, 0.11, 0.13, 1),
  rowB:        Color4.create(0.13, 0.13, 0.15, 1),
  rowHover:    Color4.create(0.20, 0.20, 0.24, 1),
  rowSel:      Color4.create(0.22, 0.42, 0.58, 0.70),
  rowLocked:   Color4.create(0.20, 0.14, 0.14, 1),

  // Separators
  sep:         Color4.create(0.28, 0.28, 0.32, 0.40),

  // Text
  text:        Color4.create(0.90, 0.90, 0.92, 1),
  textMid:     Color4.create(0.62, 0.62, 0.66, 1),
  textDim:     Color4.create(0.40, 0.40, 0.44, 1),
  textOff:     Color4.create(0.30, 0.30, 0.34, 1),

  // Semantic
  accent:      Color4.create(0.35, 0.70, 0.90, 1),
  ok:          Color4.create(0.30, 0.78, 0.48, 1),
  warn:        Color4.create(1.0, 0.80, 0.25, 1),
  err:         Color4.create(0.85, 0.35, 0.35, 1),
  off:         Color4.create(0.50, 0.50, 0.54, 1),

  // Axes
  xAxis:       Color4.create(0.95, 0.40, 0.40, 1),
  yAxis:       Color4.create(0.40, 0.90, 0.40, 1),
  zAxis:       Color4.create(0.40, 0.55, 0.95, 1),

  // Transparent
  none:        Color4.create(0, 0, 0, 0),
}

// ── Sizes ───────────────────────────────────────────────

const TOOL_SZ = 32
const PANEL_W = 200
const ROW_H = 24
const MAX_ROWS = 18

// ── Interaction ─────────────────────────────────────────

let hovered: string | null = null
let hierScroll = 0
let hierHov: number | null = null

// ── Helpers ─────────────────────────────────────────────

function pos3() {
  if (state.selectedEntity !== undefined && Transform.has(state.selectedEntity)) {
    const p = Transform.get(state.selectedEntity).position
    return { x: p.x.toFixed(2), y: p.y.toFixed(2), z: p.z.toFixed(2) }
  }
  return { x: '—', y: '—', z: '—' }
}

function rot3() {
  if (state.selectedEntity !== undefined && Transform.has(state.selectedEntity)) {
    const e = Quaternion.toEulerAngles(Transform.get(state.selectedEntity).rotation)
    return { x: e.x.toFixed(1), y: e.y.toFixed(1), z: e.z.toFixed(1) }
  }
  return { x: '—', y: '—', z: '—' }
}

function isHov(id: string) { return hovered === id }
function setHov(id: string) { hovered = id }
function clearHov(id: string) { if (hovered === id) hovered = null }

// ── Tool Button ─────────────────────────────────────────

function Tool(id: string, label: string, active: boolean, disabled: boolean, fn: () => void) {
  const h = isHov(id)
  const bg = disabled ? C.btn
    : active && h ? C.btnActiveH
    : active ? C.btnActive
    : h ? C.btnHover
    : C.btn
  const col = disabled ? C.textOff : active ? C.text : h ? C.textMid : C.textDim

  return (
    <UiEntity
      uiTransform={{
        width: TOOL_SZ, height: TOOL_SZ,
        margin: { left: 1, right: 1 },
        justifyContent: 'center', alignItems: 'center',
      }}
      uiBackground={{ color: bg }}
      onMouseEnter={() => setHov(id)}
      onMouseLeave={() => clearHov(id)}
      onMouseDown={() => { if (!disabled) fn() }}
    >
      <Label value={label} fontSize={14} color={col} uiTransform={{ height: 18 }} textAlign="middle-center" />
    </UiEntity>
  )
}

function ToolSep() {
  return (
    <UiEntity
      uiTransform={{ width: 1, height: TOOL_SZ - 10, margin: { left: 4, right: 4 }, alignSelf: 'center' }}
      uiBackground={{ color: C.sep }}
    />
  )
}

// ── Toolbar ─────────────────────────────────────────────

function Toolbar(sel: boolean) {
  const mode = state.gizmoMode
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { top: 8 },
        width: '100%',
        justifyContent: 'center',
        alignItems: 'flex-start',
      }}
    >
      <UiEntity
        uiTransform={{ padding: 1, flexDirection: 'row', alignItems: 'center' }}
        uiBackground={{ color: C.panelBorder }}
      >
        <UiEntity
          uiTransform={{
            padding: { left: 4, right: 4, top: 3, bottom: 3 },
            flexDirection: 'row', alignItems: 'center',
          }}
          uiBackground={{ color: C.panel }}
        >
          {/* Selection */}
          {Tool('sel', '⊙', !sel, false, () => { if (sel) deselectEntity() })}
          {Tool('mov', '✥', sel && mode === 'translate', !sel, () => { state.gizmoMode = 'translate'; if (sel) createGizmo() })}
          {Tool('rot', '↻', sel && mode === 'rotate', !sel, () => { state.gizmoMode = 'rotate'; if (sel) createGizmo() })}

          {ToolSep()}

          {/* Undo / Redo */}
          {Tool('und', '↶', false, undoCount() === 0, () => undo())}
          {Tool('red', '↷', false, redoCount() === 0, () => redo())}

          {ToolSep()}

          {/* Camera */}
          {Tool('cam', '◉', state.editorCamActive, false, () => toggleEditorCamera())}
          {Tool('foc', '◎', false, !sel, () => {
            if (!state.editorCamActive) toggleEditorCamera()
            focusSelectedEntity()
          })}
        </UiEntity>
      </UiEntity>
    </UiEntity>
  )
}

// ── Tree ────────────────────────────────────────────────

interface TreeRow { e: Entity; name: string; isModel: boolean; depth: number }

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

  const byName = (a: number, b: number) => {
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

// ── Right Panel ─────────────────────────────────────────

function RightPanel(sel: boolean) {
  const flat = buildTree()
  const total = flat.length
  const maxScr = Math.max(0, total - MAX_ROWS)
  hierScroll = Math.max(0, Math.min(hierScroll, maxScr))

  if (sel) {
    const selIdx = flat.findIndex(n => n.e === state.selectedEntity)
    if (selIdx >= 0) {
      if (selIdx < hierScroll) hierScroll = selIdx
      else if (selIdx >= hierScroll + MAX_ROWS) hierScroll = selIdx - MAX_ROWS + 1
    }
  }

  const vis = Math.min(MAX_ROWS, total - hierScroll)
  const canUp = hierScroll > 0
  const canDown = hierScroll < maxScr

  const rows: ReactEcs.JSX.Element[] = []
  for (let i = 0; i < vis; i++) {
    const node = flat[hierScroll + i]
    const eid = node.e as number
    const isSel = state.selectedEntity === node.e
    const isH = hierHov === eid
    const gi = hierScroll + i
    const locked = lockMap.has(node.name) && !isSel

    const bg = isSel ? C.rowSel : locked ? C.rowLocked : isH ? C.rowHover : gi % 2 === 0 ? C.rowA : C.rowB
    const col = locked ? C.textOff : isSel ? C.text : isH ? C.textMid : C.textDim
    const pad = 10 + node.depth * 12
    const maxC = Math.max(6, 20 - node.depth * 2)
    const lbl = node.name.length > maxC ? node.name.substring(0, maxC - 1) + '…' : node.name
    const icon = locked ? '🔒' : node.isModel ? '▣' : '◇'

    rows.push(
      <UiEntity
        key={eid}
        uiTransform={{
          width: '100%', height: ROW_H,
          padding: { left: pad, right: 6 },
          alignItems: 'center', flexDirection: 'row',
        }}
        uiBackground={{ color: bg }}
        onMouseEnter={() => { hierHov = eid }}
        onMouseLeave={() => { if (hierHov === eid) hierHov = null }}
        onMouseDown={() => selectEntity(eid as Entity)}
      >
        <Label value={icon} fontSize={10} color={Color4.create(col.r, col.g, col.b, 0.6)} uiTransform={{ width: 16, height: 14 }} textAlign="middle-center" />
        <Label value={lbl} fontSize={10} color={col} uiTransform={{ height: 14, margin: { left: 2 } }} />
      </UiEntity>
    )
  }

  const pos = pos3()
  const rot = rot3()

  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { top: 8, right: 8 },
        flexDirection: 'column',
      }}
    >
      {/* Hierarchy */}
      <UiEntity
        uiTransform={{ width: PANEL_W, flexDirection: 'column', padding: 1 }}
        uiBackground={{ color: C.panelBorder }}
      >
        <UiEntity uiTransform={{ width: '100%', flexDirection: 'column' }} uiBackground={{ color: C.panel }}>
          {/* Header */}
          <UiEntity
            uiTransform={{
              width: '100%', height: 28,
              flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
              padding: { left: 10, right: 10 },
            }}
            uiBackground={{ color: C.header }}
          >
            <Label value="Hierarchy" fontSize={10} color={C.textMid} uiTransform={{ height: 14 }} />
            <Label value={`${total}`} fontSize={9} color={C.textDim} uiTransform={{ height: 12 }} />
          </UiEntity>

          {/* Scroll up */}
          {canUp ? (
            <UiEntity
              uiTransform={{ width: '100%', height: 18, justifyContent: 'center', alignItems: 'center' }}
              uiBackground={{ color: C.header }}
              onMouseDown={() => { hierScroll = Math.max(0, hierScroll - 5) }}
            >
              <Label value="▲" fontSize={8} color={C.textDim} uiTransform={{ height: 10 }} textAlign="middle-center" />
            </UiEntity>
          ) : null}

          {/* Rows */}
          <UiEntity uiTransform={{ width: '100%', height: MAX_ROWS * ROW_H, flexDirection: 'column', overflow: 'hidden' }}>
            {rows}
          </UiEntity>

          {/* Scroll down */}
          {canDown ? (
            <UiEntity
              uiTransform={{ width: '100%', height: 18, justifyContent: 'center', alignItems: 'center' }}
              uiBackground={{ color: C.header }}
              onMouseDown={() => { hierScroll = Math.min(maxScr, hierScroll + 5) }}
            >
              <Label value="▼" fontSize={8} color={C.textDim} uiTransform={{ height: 10 }} textAlign="middle-center" />
            </UiEntity>
          ) : null}
        </UiEntity>
      </UiEntity>

      {/* Properties */}
      {sel ? (
        <UiEntity
          uiTransform={{ width: PANEL_W, flexDirection: 'column', padding: 1, margin: { top: 4 } }}
          uiBackground={{ color: C.panelBorder }}
        >
          <UiEntity uiTransform={{ width: '100%', flexDirection: 'column' }} uiBackground={{ color: C.panel }}>
            {/* Header */}
            <UiEntity
              uiTransform={{
                width: '100%', height: 28,
                padding: { left: 10, right: 10 },
                flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
              }}
              uiBackground={{ color: C.header }}
            >
              <Label value="Transform" fontSize={10} color={C.textMid} uiTransform={{ height: 14 }} />
              {/* Reset button in header */}
              <UiEntity
                uiTransform={{ height: 20, padding: { left: 6, right: 6 }, alignItems: 'center', justifyContent: 'center' }}
                uiBackground={{ color: isHov('rst') ? C.btnDangerH : C.btnDanger }}
                onMouseEnter={() => setHov('rst')}
                onMouseLeave={() => clearHov('rst')}
                onMouseDown={() => { if (state.selectedName) requestReset(state.selectedName) }}
              >
                <Label value="Reset" fontSize={8} color={C.text} uiTransform={{ height: 10 }} />
              </UiEntity>
            </UiEntity>

            {/* Entity name */}
            <UiEntity uiTransform={{ width: '100%', padding: { left: 10, right: 10, top: 8, bottom: 4 } }}>
              <Label value={state.selectedName} fontSize={11} color={C.text} uiTransform={{ height: 16 }} />
            </UiEntity>

            {/* Position */}
            <UiEntity uiTransform={{ width: '100%', padding: { left: 10, right: 8, top: 4 }, flexDirection: 'column' }}>
              <Label value="Position" fontSize={8} color={C.textDim} uiTransform={{ height: 12, margin: { bottom: 2 } }} />
              <UiEntity uiTransform={{ flexDirection: 'row', width: '100%', height: 20 }}>
                {AxisField('X', pos.x, C.xAxis)}
                {AxisField('Y', pos.y, C.yAxis)}
                {AxisField('Z', pos.z, C.zAxis)}
              </UiEntity>
            </UiEntity>

            {/* Rotation */}
            <UiEntity uiTransform={{ width: '100%', padding: { left: 10, right: 8, top: 4, bottom: 8 }, flexDirection: 'column' }}>
              <Label value="Rotation" fontSize={8} color={C.textDim} uiTransform={{ height: 12, margin: { bottom: 2 } }} />
              <UiEntity uiTransform={{ flexDirection: 'row', width: '100%', height: 20 }}>
                {AxisField('X', rot.x, C.xAxis)}
                {AxisField('Y', rot.y, C.yAxis)}
                {AxisField('Z', rot.z, C.zAxis)}
              </UiEntity>
            </UiEntity>
          </UiEntity>
        </UiEntity>
      ) : null}
    </UiEntity>
  )
}

function AxisField(label: string, value: string, color: Color4) {
  return (
    <UiEntity
      uiTransform={{ height: 20, margin: { right: 3 }, flexDirection: 'row', alignItems: 'center', flexGrow: 1 }}
      uiBackground={{ color: Color4.create(0.06, 0.06, 0.08, 1) }}
    >
      <UiEntity
        uiTransform={{ width: 18, height: 20, justifyContent: 'center', alignItems: 'center' }}
        uiBackground={{ color: Color4.create(color.r * 0.35, color.g * 0.35, color.b * 0.35, 1) }}
      >
        <Label value={label} fontSize={9} color={Color4.create(color.r, color.g, color.b, 0.85)} uiTransform={{ height: 12 }} textAlign="middle-center" />
      </UiEntity>
      <Label value={value} fontSize={9} color={C.text} uiTransform={{ height: 14, margin: { left: 4 } }} />
    </UiEntity>
  )
}

// ── Bottom Status Bar ───────────────────────────────────

function StatusBar() {
  const cs = state.connectionState
  const isAdmin = state.isAdmin
  const on = state.snapshotEnabled
  const count = state.snapshotCount
  const edOn = state.editorActive

  // Connection
  const connDot = cs === 'connected' ? C.ok : cs === 'syncing' ? C.warn : C.err
  const connText = cs === 'connected' ? 'Connected' : cs === 'syncing' ? 'Syncing…' : 'Disconnected'
  const connCol = cs === 'connected' ? C.textDim : cs === 'syncing' ? C.warn : C.err

  // Snapshot
  const snapText = count > 0
    ? (on ? `Scene: ${count} edits active` : `Scene: default`)
    : 'Scene: no edits'
  const snapDot = count === 0 ? C.off : on ? C.ok : C.warn
  const snapCol = count === 0 ? C.textDim : on ? C.text : C.warn

  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { bottom: 8, right: 8 },
      }}
    >
      <UiEntity
        uiTransform={{
          flexDirection: 'row',
          alignItems: 'center',
          padding: { left: 10, right: 4, top: 4, bottom: 4 },
        }}
        uiBackground={{ color: C.bar }}
      >
        {/* Connection status */}
        <UiEntity uiTransform={{ width: 6, height: 6, margin: { right: 5 } }} uiBackground={{ color: connDot }} />
        <Label value={connText} fontSize={9} color={connCol} uiTransform={{ height: 12 }} />

        {/* Separator */}
        <UiEntity uiTransform={{ width: 1, height: 12, margin: { left: 10, right: 10 } }} uiBackground={{ color: C.sep }} />

        {/* Snapshot */}
        {isAdmin ? (
          <UiEntity
            uiTransform={{
              flexDirection: 'row', alignItems: 'center',
              padding: { left: 6, right: 6, top: 2, bottom: 2 },
            }}
            uiBackground={{ color: count > 0 && isHov('snap') ? (on ? C.btnActiveH : C.btnHover) : (count > 0 && on ? C.btnActive : C.none) }}
            onMouseEnter={() => setHov('snap')}
            onMouseLeave={() => clearHov('snap')}
            onMouseDown={count > 0 ? () => requestSetSnapshot(!on) : undefined}
          >
            <Label
              value={on ? '◆' : '◇'}
              fontSize={8}
              color={snapDot}
              uiTransform={{ height: 12, margin: { right: 4 } }}
            />
            <Label value={snapText} fontSize={9} color={count > 0 && isHov('snap') ? C.text : snapCol} uiTransform={{ height: 12 }} />
          </UiEntity>
        ) : null}

        {isAdmin ? (
          <UiEntity uiTransform={{ width: 1, height: 12, margin: { left: 10, right: 10 } }} uiBackground={{ color: C.sep }} />
        ) : null}

        {/* Editor toggle */}
        {isAdmin ? (
          <UiEntity
            uiTransform={{
              flexDirection: 'row', alignItems: 'center',
              padding: { left: 6, right: 6, top: 2, bottom: 2 },
            }}
            uiBackground={{ color: isHov('edt') ? (edOn ? C.btnActiveH : C.btnHover) : (edOn ? C.btnActive : C.btn) }}
            onMouseEnter={() => setHov('edt')}
            onMouseLeave={() => clearHov('edt')}
            onMouseDown={() => toggleEditorActive()}
          >
            <Label value="✏" fontSize={10} color={edOn ? C.text : C.textDim} uiTransform={{ height: 12, margin: { right: 3 } }} />
            <Label value={edOn ? 'Editor ON' : 'Editor'} fontSize={9} color={edOn ? C.text : C.textDim} uiTransform={{ height: 12 }} />
          </UiEntity>
        ) : null}
      </UiEntity>
    </UiEntity>
  )
}

// ── Previous Layout Banner ──────────────────────────────

function PreviousBanner() {
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { bottom: 38, right: 8 },
      }}
    >
      <UiEntity
        uiTransform={{
          flexDirection: 'row',
          alignItems: 'center',
          padding: { left: 12, right: 6, top: 5, bottom: 5 },
        }}
        uiBackground={{ color: Color4.create(0.14, 0.16, 0.24, 0.96) }}
      >
        <Label
          value={`Previous layout available (${state.previousEntityCount} entities)`}
          fontSize={10}
          color={C.text}
          uiTransform={{ height: 14, margin: { right: 12 } }}
        />
        {/* Apply */}
        <UiEntity
          uiTransform={{ height: 24, padding: { left: 8, right: 8 }, margin: { right: 4 }, justifyContent: 'center', alignItems: 'center' }}
          uiBackground={{ color: isHov('pApply') ? C.btnSuccessH : C.btnSuccess }}
          onMouseEnter={() => setHov('pApply')}
          onMouseLeave={() => clearHov('pApply')}
          onMouseDown={() => requestLoadPrevious()}
        >
          <Label value="Apply" fontSize={9} color={C.text} uiTransform={{ height: 12 }} />
        </UiEntity>
        {/* Dismiss */}
        <UiEntity
          uiTransform={{ height: 24, padding: { left: 8, right: 8 }, justifyContent: 'center', alignItems: 'center' }}
          uiBackground={{ color: isHov('pDismiss') ? C.btnHover : C.btn }}
          onMouseEnter={() => setHov('pDismiss')}
          onMouseLeave={() => clearHov('pDismiss')}
          onMouseDown={() => requestDismissPrevious()}
        >
          <Label value="Dismiss" fontSize={9} color={C.textMid} uiTransform={{ height: 12 }} />
        </UiEntity>
      </UiEntity>
    </UiEntity>
  )
}

// ── Main UI ─────────────────────────────────────────────

function EditorUI() {
  // Syncing — status bar only
  if (state.connectionState === 'syncing') {
    return (
      <UiEntity uiTransform={{ width: '100%', height: '100%' }}>
        {StatusBar()}
      </UiEntity>
    )
  }

  // Not admin — nothing
  if (!state.isAdmin) return <UiEntity uiTransform={{ width: 0, height: 0 }} />

  // Admin, editor off — status bar + previous banner
  if (!state.editorActive) {
    return (
      <UiEntity uiTransform={{ width: '100%', height: '100%' }}>
        {StatusBar()}
        {state.previousAvailable ? PreviousBanner() : null}
      </UiEntity>
    )
  }

  // Admin, editor on — full UI
  const sel = state.selectedEntity !== undefined
  return (
    <UiEntity uiTransform={{ width: '100%', height: '100%' }}>
      {Toolbar(sel)}
      {RightPanel(sel)}
      {StatusBar()}
      {state.previousAvailable ? PreviousBanner() : null}
    </UiEntity>
  )
}

export function setupEditorUi() {
  ReactEcsRenderer.setUiRenderer(EditorUI, { virtualWidth: 1280, virtualHeight: 720 })
}
