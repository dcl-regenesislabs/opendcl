import { Entity, Transform, VisibilityComponent } from '@dcl/sdk/ecs'

import { Color4, Quaternion } from '@dcl/sdk/math'
import ReactEcs, { ReactEcsRenderer, UiEntity, Label } from '@dcl/sdk/react-ecs'
import { state, selectableInfoMap, lockMap, toggleEditorActive } from './state'
import { undoCount, redoCount, undo, redo } from './history'
import { createGizmo } from './gizmo'
import { toggleEditorCamera, focusSelectedEntity } from './camera'
import { selectEntity, deselectEntity } from './selection'
import { requestReset, requestResetAll, requestLoadPrevious, requestDismissPrevious, requestSetSnapshot } from './persistence'

// ── Icons (Lucide via Iconify CDN) ──────────────────────

// ── Platform detection ──────────────────────────────────
import { isWeb } from '@dcl/sdk/platform'
import { getExplorerInformation } from '~system/Runtime'

let isBevy = false
void getExplorerInformation({}).then($ => { isBevy = $.agent === 'bevy' }).catch(() => {})

const IC = 'https://api.iconify.design/lucide'
const ICON = {
  select:    `${IC}/mouse-pointer.svg?color=white&width=64&height=64`,
  move:      `${IC}/move.svg?color=white&width=64&height=64`,
  rotate:    `${IC}/rotate-cw.svg?color=white&width=64&height=64`,
  undo:      `${IC}/undo-2.svg?color=white&width=64&height=64`,
  redo:      `${IC}/redo-2.svg?color=white&width=64&height=64`,
  camera:    `${IC}/video.svg?color=white&width=64&height=64`,
  focus:     `${IC}/crosshair.svg?color=white&width=64&height=64`,
  edit:      `${IC}/pencil.svg?color=white&width=64&height=64`,
  chevUp:    `${IC}/chevron-up.svg?color=white&width=64&height=64`,
  chevDown:  `${IC}/chevron-down.svg?color=white&width=64&height=64`,
  lock:      `${IC}/lock.svg?color=white&width=64&height=64`,
  model:     `${IC}/box.svg?color=white&width=64&height=64`,
  primitive: `${IC}/diamond.svg?color=white&width=64&height=64`,
  snapOn:    `${IC}/toggle-right.svg?color=white&width=64&height=64`,
  snapOff:   `${IC}/toggle-left.svg?color=white&width=64&height=64`,
  help:      `${IC}/circle-help.svg?color=white&width=64&height=64`,
  info:      `${IC}/info.svg?color=white&width=64&height=64`,
  eyeOn:     `${IC}/eye.svg?color=white&width=64&height=64`,
  eyeOff:    `${IC}/eye-off.svg?color=white&width=64&height=64`,
}

const LOADING_BG = 'https://raw.githubusercontent.com/dcl-regenesislabs/bevy-ui-scene/refs/heads/main/scene/assets/images/login/gradient-background.png'
const LOADING_LOGO = 'https://raw.githubusercontent.com/dcl-regenesislabs/bevy-ui-scene/refs/heads/main/scene/assets/images/logo.png'

// Unicode fallbacks for Unity renderer
const UNI = {
  select:    '⊙',
  move:      '✥',
  rotate:    '↻',
  undo:      '↶',
  redo:      '↷',
  camera:    '◉',
  focus:     '◎',
  edit:      '✏',
  chevUp:    '▲',
  chevDown:  '▼',
  lock:      '🔒',
  model:     '▣',
  primitive: '◇',
  snapOn:    '◆',
  snapOff:   '◇',
  help:      '?',
  info:      'i',
  eyeOn:     '◉',
  eyeOff:    '○',
}

/** Render an icon — URL texture on Bevy-web, Unicode label on Unity */
function Icon(props: { icon: keyof typeof ICON, size: number, color: Color4 }) {
  if (isWeb() || isBevy) {
    return (
      <UiEntity
        uiTransform={{ width: props.size, height: props.size }}
        uiBackground={{
          textureMode: 'stretch',
          texture: { src: ICON[props.icon] },
          color: props.color,
        }}
      />
    )
  }
  return (
    <UiEntity uiTransform={{ width: props.size, height: props.size, justifyContent: 'center', alignItems: 'center' }}>
      <Label
        value={UNI[props.icon]}
        fontSize={props.size}
        color={props.color}
        uiTransform={{ width: props.size, height: props.size }}
        textAlign="middle-center"
      />
    </UiEntity>
  )
}

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

const TOOL_SZ = 42
const PANEL_W = 200
const ROW_H = 24
const MAX_ROWS = 18

// ── Interaction ─────────────────────────────────────────

let hovered: string | null = null
let hierScroll = 0
let hierHov: number | null = null
let showShortcuts = false
let showStatusBar = true
const hiddenEntities = new Set<Entity>()

function toggleVisibility(entity: Entity) {
  if (hiddenEntities.has(entity)) {
    hiddenEntities.delete(entity)
    if (VisibilityComponent.has(entity)) {
      VisibilityComponent.getMutable(entity).visible = true
    }
  } else {
    hiddenEntities.add(entity)
    if (VisibilityComponent.has(entity)) {
      VisibilityComponent.getMutable(entity).visible = false
    } else {
      VisibilityComponent.create(entity, { visible: false })
    }
  }
}

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

function isHov(id: string) { return hovered === id }
function setHov(id: string) { hovered = id }
function clearHov(id: string) { if (hovered === id) hovered = null }

// ── Tool Button ─────────────────────────────────────────

function toolBg(active: boolean, disabled: boolean, hovering: boolean): Color4 {
  if (disabled) return C.btn
  if (active) return hovering ? C.btnActiveH : C.btnActive
  if (hovering) return C.btnHover
  return C.btn
}

function toolOpacity(active: boolean, disabled: boolean, hovering: boolean): number {
  if (disabled) return 0.25
  if (active) return 1.0
  if (hovering) return 0.8
  return 0.5
}

function Tool(id: string, iconKey: keyof typeof ICON, active: boolean, disabled: boolean, fn: () => void, shortcut?: string) {
  const h = isHov(id)
  const bg = toolBg(active, disabled, h)
  const opacity = toolOpacity(active, disabled, h)

  return (
    <UiEntity
      uiTransform={{
        width: TOOL_SZ, height: TOOL_SZ,
        margin: { left: 1, right: 1 },
        flexDirection: 'column',
        justifyContent: 'center', alignItems: 'center',
      }}
      uiBackground={{ color: bg }}
      onMouseEnter={() => setHov(id)}
      onMouseLeave={() => clearHov(id)}
      onMouseDown={() => { if (!disabled) fn() }}
    >
      {Icon({ icon: iconKey, size: 24, color: Color4.create(1, 1, 1, opacity) })}
      <Label value={shortcut ?? ' '} fontSize={8} color={Color4.create(1, 1, 1, shortcut ? opacity * 0.6 : 0)} uiTransform={{ width: '100%', height: 10 }} textAlign="middle-center" />
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
        position: { top: 8, left: 0 },
        width: '100%',
        justifyContent: 'center',
        alignItems: 'flex-start',
        flexDirection: 'row',
        padding: { right: PANEL_W },
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
          {Tool('sel', 'select', !sel, false, () => { if (sel) deselectEntity() }, 'F')}

          {Tool('mov', 'move', sel && mode === 'translate', !sel, () => { state.gizmoMode = 'translate'; if (sel) createGizmo() }, 'E')}
          {Tool('rot', 'rotate', sel && mode === 'rotate', !sel, () => { state.gizmoMode = 'rotate'; if (sel) createGizmo() }, 'E')}

          {ToolSep()}

          {/* Undo / Redo */}
          {Tool('und', 'undo', false, undoCount() === 0, () => undo())}
          {Tool('red', 'redo', false, redoCount() === 0, () => redo())}

          {ToolSep()}

          {/* Camera */}
          {Tool('cam', 'camera', state.editorCamActive, false, () => toggleEditorCamera(), '1')}
          {Tool('foc', 'focus', false, !sel, () => {
            if (!state.editorCamActive) toggleEditorCamera()
            focusSelectedEntity()
          }, '2')}
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

    let bg: Color4
    if (isSel) bg = C.rowSel
    else if (locked) bg = C.rowLocked
    else if (isH) bg = C.rowHover
    else bg = gi % 2 === 0 ? C.rowA : C.rowB

    let col: Color4
    if (locked) col = C.textOff
    else if (isSel) col = C.text
    else if (isH) col = C.textMid
    else col = C.textDim
    const pad = 10 + node.depth * 12
    const maxC = Math.max(6, 20 - node.depth * 2)
    const lbl = node.name.length > maxC ? node.name.substring(0, maxC - 1) + '..' : node.name
    const iconKey: keyof typeof ICON = locked ? 'lock' : node.isModel ? 'model' : 'primitive'
    const isHidden = hiddenEntities.has(node.e)

    rows.push(
      <UiEntity
        key={eid}
        uiTransform={{
          width: '100%', height: ROW_H,
          padding: { left: pad, right: 4 },
          alignItems: 'center', flexDirection: 'row',
        }}
        uiBackground={{ color: bg }}
        onMouseEnter={() => { hierHov = eid }}
        onMouseLeave={() => { if (hierHov === eid) hierHov = null }}
      >
        {/* Type icon + name (click to select) */}
        <UiEntity
          uiTransform={{ flexGrow: 1, flexDirection: 'row', alignItems: 'center', height: ROW_H }}
          onMouseDown={() => selectEntity(eid as Entity)}
        >
          {Icon({ icon: iconKey, size: 12, color: Color4.create(col.r, col.g, col.b, 0.6) })}
          <Label value={lbl} fontSize={10} color={isHidden ? C.textOff : col} uiTransform={{ height: 14, margin: { left: 2 } }} />
        </UiEntity>
        {/* Visibility toggle */}
        <UiEntity
          uiTransform={{ width: 16, height: 16, margin: { left: 2 } }}
          onMouseDown={() => toggleVisibility(node.e)}
        >
          {Icon({ icon: isHidden ? 'eyeOff' : 'eyeOn', size: 16, color: Color4.create(1, 1, 1, isHidden ? 0.3 : (isH ? 0.6 : 0.25)) })}
        </UiEntity>
      </UiEntity>
    )
  }

  const pos = pos3()
  const rot = rot3()

  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { top: 56, right: 8 },
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
              {Icon({ icon: 'chevUp', size: 12, color: C.textDim })}
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
              {Icon({ icon: 'chevDown', size: 12, color: C.textDim })}
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

// ── Shortcuts Panel ─────────────────────────────────────

function ShortcutRow(key: string, label: string) {
  return (
    <UiEntity uiTransform={{ flexDirection: 'row', alignItems: 'center', height: 16, width: '100%' }}>
      <UiEntity
        uiTransform={{
          width: 28, height: 14,
          justifyContent: 'center', alignItems: 'center',
          margin: { right: 6 },
        }}
        uiBackground={{ color: Color4.create(0.22, 0.22, 0.26, 0.8) }}
      >
        <Label value={key} fontSize={8} color={C.text} uiTransform={{ height: 10 }} textAlign="middle-center" />
      </UiEntity>
      <Label value={label} fontSize={8} color={C.textDim} uiTransform={{ height: 10 }} />
    </UiEntity>
  )
}

function ShortcutsPanel() {
  const camOn = state.editorCamActive
  const sel = state.selectedEntity !== undefined
  const h = isHov('help')

  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { bottom: 8, left: 64 },
        flexDirection: 'column',
        alignItems: 'flex-start',
      }}
    >
      {/* Expanded panel */}
      {showShortcuts ? (
        <UiEntity
          uiTransform={{
            flexDirection: 'column',
            padding: 1,
            margin: { bottom: 4 },
          }}
          uiBackground={{ color: C.panelBorder }}
        >
          <UiEntity
            uiTransform={{
              flexDirection: 'column',
              padding: { left: 8, right: 10, top: 6, bottom: 6 },
            }}
            uiBackground={{ color: C.panel }}
          >
            {/* Header */}
            <Label
              value={camOn ? 'Editor Camera' : 'Shortcuts'}
              fontSize={9}
              color={C.textMid}
              uiTransform={{ height: 14, margin: { bottom: 4 } }}
            />

            {/* Camera controls */}
            {camOn ? ShortcutRow('WASD', 'Pan') : null}
            {camOn ? ShortcutRow('Space', 'Up') : null}
            {camOn ? ShortcutRow('Shift', 'Down') : null}
            {camOn ? ShortcutRow('2 / 3', 'Zoom in / out') : null}
            {camOn ? ShortcutRow('Drag', 'Orbit') : null}
            {/* Separator */}
            {camOn ? (
              <UiEntity uiTransform={{ width: '100%', height: 1, margin: { top: 4, bottom: 4 } }} uiBackground={{ color: C.sep }} />
            ) : null}

            {/* General */}
            {ShortcutRow('Click', 'Select')}
            {ShortcutRow('E', 'Move / Rotate')}
            {ShortcutRow('F', 'Deselect')}
            {ShortcutRow('1', camOn ? 'Exit camera' : 'Editor camera')}
            {sel ? ShortcutRow('2', 'Focus selected') : null}

          </UiEntity>
        </UiEntity>
      ) : null}

      {/* Toggle button */}
      <UiEntity
        uiTransform={{
          width: 30, height: 30,
          justifyContent: 'center', alignItems: 'center',
        }}
        uiBackground={{ color: showShortcuts ? C.btnActive : h ? C.btnHover : C.btn }}
        onMouseEnter={() => setHov('help')}
        onMouseLeave={() => clearHov('help')}
        onMouseDown={() => { showShortcuts = !showShortcuts }}
      >
        {Icon({ icon: 'help', size: 18, color: Color4.create(1, 1, 1, showShortcuts ? 1.0 : h ? 0.8 : 0.5) })}
      </UiEntity>
    </UiEntity>
  )
}

// ── Bottom Status Bar ───────────────────────────────────

// ── Editor Toggle Button (always visible for admins) ────

function EditorToggle() {
  const edOn = state.editorActive
  const h = isHov('edt')

  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { bottom: 8, right: 8 },
        flexDirection: 'row',
        alignItems: 'center',
      }}
    >
      {/* Info toggle (connection/snapshot details) */}
      {edOn ? (
        <UiEntity
          uiTransform={{
            width: 30, height: 30,
            justifyContent: 'center', alignItems: 'center',
            margin: { right: 4 },
          }}
          uiBackground={{ color: showStatusBar ? C.btnActive : isHov('sbar') ? C.btnHover : C.btn }}
          onMouseEnter={() => setHov('sbar')}
          onMouseLeave={() => clearHov('sbar')}
          onMouseDown={() => { showStatusBar = !showStatusBar }}
        >
          {Icon({ icon: 'info', size: 16, color: Color4.create(1, 1, 1, showStatusBar ? 1.0 : isHov('sbar') ? 0.8 : 0.5) })}
        </UiEntity>
      ) : null}

      {/* Editor on/off button */}
      <UiEntity
        uiTransform={{
          width: 30, height: 30,
          justifyContent: 'center', alignItems: 'center',
        }}
        uiBackground={{ color: toolBg(edOn, false, h) }}
        onMouseEnter={() => setHov('edt')}
        onMouseLeave={() => clearHov('edt')}
        onMouseDown={() => toggleEditorActive()}
      >
        {Icon({ icon: 'edit', size: 18, color: Color4.create(1, 1, 1, edOn ? 1.0 : h ? 0.8 : 0.5) })}
      </UiEntity>
    </UiEntity>
  )
}

// ── Status Info Panel (togglable) ───────────────────────

function StatusPanel() {
  if (!showStatusBar) return null

  const cs = state.connectionState
  const on = state.snapshotEnabled
  const count = state.snapshotCount

  let connDot: Color4
  let connText: string
  let connCol: Color4
  if (cs === 'connected') {
    connDot = C.ok
    connText = 'Connected'
    connCol = C.textMid
  } else if (cs === 'syncing') {
    connDot = C.warn
    connText = 'Syncing..'
    connCol = C.warn
  } else {
    connDot = C.err
    connText = 'Disconnected'
    connCol = C.err
  }

  let snapText: string
  let snapDot: Color4
  let snapCol: Color4
  if (count === 0) {
    snapText = 'No edits'
    snapDot = C.off
    snapCol = C.textMid
  } else if (on) {
    snapText = `${count} edits active`
    snapDot = C.ok
    snapCol = C.text
  } else {
    snapText = 'Default (edits paused)'
    snapDot = C.warn
    snapCol = C.warn
  }

  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { bottom: 44, right: 8 },
        flexDirection: 'column',
        padding: 1,
      }}
      uiBackground={{ color: C.panelBorder }}
    >
      <UiEntity
        uiTransform={{
          flexDirection: 'column',
          padding: { left: 10, right: 10, top: 8, bottom: 8 },
        }}
        uiBackground={{ color: C.panel }}
      >
        {/* Connection */}
        <UiEntity uiTransform={{ flexDirection: 'row', alignItems: 'center', height: 20 }}>
          <UiEntity uiTransform={{ width: 8, height: 8, margin: { right: 6 } }} uiBackground={{ color: connDot }} />
          <Label value={connText} fontSize={11} color={connCol} uiTransform={{ height: 14 }} />
        </UiEntity>

        {/* Separator */}
        <UiEntity uiTransform={{ width: '100%', height: 1, margin: { top: 4, bottom: 4 } }} uiBackground={{ color: C.sep }} />

        {/* Snapshot */}
        <UiEntity
          uiTransform={{
            flexDirection: 'row', alignItems: 'center', height: 22,
            padding: { left: 4, right: 4 },
          }}
          uiBackground={{ color: count > 0 && isHov('snap') ? (on ? C.btnActiveH : C.btnHover) : C.none }}
          onMouseEnter={() => setHov('snap')}
          onMouseLeave={() => clearHov('snap')}
          onMouseDown={count > 0 ? () => requestSetSnapshot(!on) : undefined}
        >
          <UiEntity uiTransform={{ margin: { right: 6 } }}>
            {Icon({ icon: on ? 'snapOn' : 'snapOff', size: 16, color: snapDot })}
          </UiEntity>
          <Label value={snapText} fontSize={11} color={count > 0 && isHov('snap') ? C.text : snapCol} uiTransform={{ height: 14 }} />
        </UiEntity>
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

function LoadingScreen() {
  return (
    <UiEntity
      uiTransform={{
        width: '100%', height: '100%',
        positionType: 'absolute',
        position: { top: 0, left: 0 },
        justifyContent: 'center',
        alignItems: 'center',
        flexDirection: 'column',
      }}
      uiBackground={{
        textureMode: 'stretch',
        texture: { src: LOADING_BG },
      }}
    >
      {/* Logo */}
      <UiEntity
        uiTransform={{ width: 160, height: 160, margin: { bottom: 20 } }}
        uiBackground={{
          textureMode: 'stretch',
          texture: { src: LOADING_LOGO },
        }}
      />
      {/* Loading text */}
      <Label
        value="Loading editor..."
        fontSize={14}
        color={Color4.create(1, 1, 1, 0.7)}
        uiTransform={{ height: 20 }}
        textAlign="middle-center"
      />
    </UiEntity>
  )
}

function EditorUI() {
  // Syncing — show loading screen
  if (state.connectionState === 'syncing') {
    return LoadingScreen()
  }

  // Not admin — nothing
  if (!state.isAdmin) return <UiEntity uiTransform={{ width: 0, height: 0 }} />

  // Admin, editor off — just the pencil button
  if (!state.editorActive) {
    return (
      <UiEntity uiTransform={{ width: '100%', height: '100%' }}>
        {EditorToggle()}
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
      {ShortcutsPanel()}
      {EditorToggle()}
      {StatusPanel()}
      {state.previousAvailable ? PreviousBanner() : null}
    </UiEntity>
  )
}

export function setupEditorUi() {
  ReactEcsRenderer.setUiRenderer(EditorUI, { virtualWidth: 1280, virtualHeight: 720 })
}
