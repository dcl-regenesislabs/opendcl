import { Entity, Transform, VisibilityComponent, engine } from '@dcl/sdk/ecs'
import { Color4, Quaternion } from '@dcl/sdk/math'
import { isWeb } from '@dcl/sdk/platform'
import ReactEcs, { ReactEcsRenderer, UiEntity, Label } from '@dcl/sdk/react-ecs'
import { getExplorerInformation } from '~system/Runtime'
import { toggleEditorCamera, focusSelectedEntity } from './camera'
import { createGizmo } from './gizmo'
import { undoCount, redoCount, undo, redo } from './history'
import { selectEntity, deselectEntity } from './selection'
import { state, selectableInfoMap, toggleEditorActive, editorEntities } from './state'

// ── Platform detection ──────────────────────────────────

let isBevy = false
void getExplorerInformation({}).then($ => { isBevy = $.agent === 'bevy' }).catch(() => {})

// ── Icons (Lucide via Iconify CDN) ──────────────────────

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
  model:     `${IC}/box.svg?color=white&width=64&height=64`,
  primitive: `${IC}/diamond.svg?color=white&width=64&height=64`,
  help:      `${IC}/circle-help.svg?color=white&width=64&height=64`,
  eyeOn:     `${IC}/eye.svg?color=white&width=64&height=64`,
  eyeOff:    `${IC}/eye-off.svg?color=white&width=64&height=64`,
}

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
  model:     '▣',
  primitive: '◇',
  help:      '?',
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
  // Backgrounds (all fully opaque — partial alpha causes the scene to bleed
  // through and creates apparent two-tone effects on rounded buttons).
  panel:       Color4.create(0.10, 0.10, 0.12, 1),
  panelBorder: Color4.create(0.32, 0.32, 0.38, 1),

  // Buttons
  btn:         Color4.create(0.18, 0.18, 0.21, 1),
  btnHover:    Color4.create(0.26, 0.26, 0.30, 1),
  btnActive:   Color4.create(0.22, 0.42, 0.58, 1),
  btnActiveH:  Color4.create(0.28, 0.50, 0.66, 1),

  // Rows
  rowHover:    Color4.create(0.20, 0.20, 0.24, 1),
  rowSel:      Color4.create(0.22, 0.42, 0.58, 0.70),

  // Separators
  sep:         Color4.create(0.28, 0.28, 0.32, 0.40),

  // Text
  text:        Color4.create(0.90, 0.90, 0.92, 1),
  textMid:     Color4.create(0.62, 0.62, 0.66, 1),
  textDim:     Color4.create(0.40, 0.40, 0.44, 1),
  textOff:     Color4.create(0.30, 0.30, 0.34, 1),

  // Axes
  xAxis:       Color4.create(0.95, 0.40, 0.40, 1),
  yAxis:       Color4.create(0.40, 0.90, 0.40, 1),
  zAxis:       Color4.create(0.40, 0.55, 0.95, 1),

  // Transparent
  none:        Color4.create(0, 0, 0, 0),
}

// ── Sizes ───────────────────────────────────────────────

const TOOL_SZ = 28
const PANEL_W = 200
const ROW_H = 22
const MAX_ROWS = 12
const HEADER_H = 26
const RADIUS_PANEL = 8
const RADIUS_BTN = 6

// ── Interaction ─────────────────────────────────────────

let hovered: string | null = null
let hierScroll = 0
let hierHov: number | null = null
let showShortcuts = false
const hiddenEntities = new Set<Entity>()

function toggleVisibility(entity: Entity) {
  const nowHidden = !hiddenEntities.has(entity)
  if (nowHidden) hiddenEntities.add(entity)
  else hiddenEntities.delete(entity)
  VisibilityComponent.createOrReplace(entity, { visible: !nowHidden })
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

function Tool(id: string, iconKey: keyof typeof ICON, active: boolean, disabled: boolean, fn: () => void) {
  const h = isHov(id)
  const bg = toolBg(active, disabled, h)
  const opacity = toolOpacity(active, disabled, h)

  return (
    <UiEntity
      uiTransform={{
        width: TOOL_SZ, height: TOOL_SZ,
        margin: { left: 2, right: 2 },
        justifyContent: 'center', alignItems: 'center',
        borderRadius: RADIUS_BTN,
      }}
      uiBackground={{ color: bg }}
      onMouseEnter={() => setHov(id)}
      onMouseLeave={() => clearHov(id)}
      onMouseDown={() => { if (!disabled) fn() }}
    >
      {Icon({ icon: iconKey, size: 14, color: Color4.create(1, 1, 1, opacity) })}
    </UiEntity>
  )
}

function ToolSep() {
  return (
    <UiEntity
      uiTransform={{ width: 1, height: TOOL_SZ - 8, margin: { left: 3, right: 3 }, alignSelf: 'center' }}
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
        position: { top: 8, left: -8 },
        width: '100%',
        justifyContent: 'center',
        alignItems: 'flex-start',
        flexDirection: 'row',
      }}
    >
      <UiEntity
        uiTransform={{
          padding: { left: 4, right: 4, top: 6, bottom: 6 },
          flexDirection: 'row', alignItems: 'center',
          borderRadius: RADIUS_PANEL,
        }}
        uiBackground={{ color: C.panel }}
      >
        {/* Selection */}
        {Tool('sel', 'select', !sel, false, () => { if (sel) deselectEntity() })}

        {Tool('mov', 'move', sel && mode === 'translate', !sel, () => { state.gizmoMode = 'translate'; if (sel) createGizmo() })}
        {Tool('rot', 'rotate', sel && mode === 'rotate', !sel, () => { state.gizmoMode = 'rotate'; if (sel) createGizmo() })}

        {ToolSep()}

        {/* Undo / Redo */}
        {Tool('und', 'undo', false, undoCount() === 0, () => undo())}
        {Tool('red', 'redo', false, redoCount() === 0, () => redo())}

        {ToolSep()}

        {/* Camera */}
        {Tool('cam', 'camera', state.editorCamActive, false, () => toggleEditorCamera())}
        {Tool('foc', 'focus', false, !sel, () => {
          if (!state.editorCamActive) toggleEditorCamera()
          focusSelectedEntity()
        })}
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

  // Only Named entities make it into selectableInfoMap (filtered at
  // discovery), so the hierarchy already excludes runtime-spawned dynamic
  // entities by convention.
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

// ── Hierarchy Panel (top-left) ──────────────────────────

function HierarchyPanel() {
  const flat = buildTree()
  const total = flat.length
  const maxScr = Math.max(0, total - MAX_ROWS)
  hierScroll = Math.max(0, Math.min(hierScroll, maxScr))

  const sel = state.selectedEntity !== undefined
  if (sel) {
    const selIdx = flat.findIndex((n) => n.e === state.selectedEntity)
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

    let bg: Color4
    if (isSel) bg = C.rowSel
    else if (isH) bg = C.rowHover
    else bg = C.none

    let col: Color4
    if (isSel) col = C.text
    else if (isH) col = C.textMid
    else col = C.textDim
    const pad = 8 + node.depth * 10
    const maxC = Math.max(6, 22 - node.depth * 2)
    const lbl = node.name.length > maxC ? node.name.substring(0, maxC - 1) + '..' : node.name
    const iconKey: keyof typeof ICON = node.isModel ? 'model' : 'primitive'
    const isHidden = hiddenEntities.has(node.e)

    rows.push(
      <UiEntity
        key={eid}
        uiTransform={{
          width: '100%', height: ROW_H,
          padding: { left: pad, right: 6 },
          alignItems: 'center', flexDirection: 'row',
          borderRadius: 5, margin: { top: 1, bottom: 1 },
        }}
        uiBackground={{ color: bg }}
        onMouseEnter={() => { hierHov = eid }}
        onMouseLeave={() => { if (hierHov === eid) hierHov = null }}
      >
        <UiEntity
          uiTransform={{ flexGrow: 1, flexDirection: 'row', alignItems: 'center', height: ROW_H }}
          onMouseDown={() => selectEntity(eid as Entity)}
        >
          {Icon({ icon: iconKey, size: 12, color: Color4.create(col.r, col.g, col.b, 0.7) })}
          <Label value={lbl} fontSize={11} color={isHidden ? C.textOff : col} uiTransform={{ height: 14, margin: { left: 6 } }} />
        </UiEntity>
        <UiEntity
          uiTransform={{ width: 16, height: 16, margin: { left: 4 } }}
          onMouseDown={() => toggleVisibility(node.e)}
        >
          {Icon({ icon: isHidden ? 'eyeOff' : 'eyeOn', size: 16, color: Color4.create(1, 1, 1, isHidden ? 0.3 : (isH ? 0.7 : 0.3)) })}
        </UiEntity>
      </UiEntity>
    )
  }

  // Visible row span height (cells + their margins). ROW_H + 2 margin per row.
  const ROW_FULL = ROW_H + 2
  return (
    <UiEntity
      uiTransform={{
        width: PANEL_W, flexDirection: 'column',
        borderRadius: RADIUS_PANEL,
        borderWidth: 1,
        borderColor: C.panelBorder,
      }}
      uiBackground={{ color: C.panel }}
    >
      {/* Header — no separate background, just text inside the panel */}
      <UiEntity
        uiTransform={{
          width: '100%', height: HEADER_H,
          flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
          padding: { left: 14, right: 14 },
        }}
      >
        <Label value="HIERARCHY" fontSize={9} color={C.textMid} uiTransform={{ height: 12 }} />
        <Label value={`${total}`} fontSize={9} color={C.textDim} uiTransform={{ height: 12 }} />
      </UiEntity>

      {/* Thin separator under the header */}
      <UiEntity
        uiTransform={{ width: '100%', height: 1, margin: { left: 12, right: 12 } }}
        uiBackground={{ color: C.sep }}
      />

      {/* Scroll up */}
      {canUp ? (
        <UiEntity
          uiTransform={{ width: '100%', height: 16, justifyContent: 'center', alignItems: 'center' }}
          onMouseDown={() => { hierScroll = Math.max(0, hierScroll - 5) }}
        >
          {Icon({ icon: 'chevUp', size: 12, color: C.textDim })}
        </UiEntity>
      ) : null}

      {/* Rows */}
      <UiEntity uiTransform={{ width: '100%', height: vis * ROW_FULL, flexDirection: 'column', padding: { left: 4, right: 4, top: 4, bottom: 4 } }}>
        {rows}
      </UiEntity>

      {/* Scroll down */}
      {canDown ? (
        <UiEntity
          uiTransform={{ width: '100%', height: 16, justifyContent: 'center', alignItems: 'center' }}
          onMouseDown={() => { hierScroll = Math.min(maxScr, hierScroll + 5) }}
        >
          {Icon({ icon: 'chevDown', size: 12, color: C.textDim })}
        </UiEntity>
      ) : null}
    </UiEntity>
  )
}

// ── Inspector Panel (top-right) ─────────────────────────

function InspectorPanel() {
  if (state.selectedEntity === undefined) return null

  const pos = pos3()
  const rot = rot3()

  return (
    <UiEntity
      uiTransform={{
        width: PANEL_W, flexDirection: 'column',
        margin: { top: 6 }, borderRadius: RADIUS_PANEL,
        borderWidth: 1,
        borderColor: C.panelBorder,
      }}
      uiBackground={{ color: C.panel }}
    >
      {/* Entity name */}
      <UiEntity
        uiTransform={{
          width: '100%', height: HEADER_H + 4,
          flexDirection: 'row', alignItems: 'center',
          padding: { left: 14, right: 14 },
        }}
      >
        <Label value={state.selectedName} fontSize={12} color={C.text} uiTransform={{ height: 16 }} />
      </UiEntity>

      {/* Separator */}
      <UiEntity
        uiTransform={{ width: '100%', height: 1, margin: { left: 12, right: 12 } }}
        uiBackground={{ color: C.sep }}
      />

      {/* TRANSFORM section */}
      <UiEntity uiTransform={{ width: '100%', flexDirection: 'column', padding: { left: 14, right: 14, top: 10, bottom: 12 } }}>
        <Label value="TRANSFORM" fontSize={9} color={C.textMid} uiTransform={{ height: 12, margin: { bottom: 8 } }} />

        {/* Position */}
        <UiEntity uiTransform={{ width: '100%', flexDirection: 'column', margin: { bottom: 6 } }}>
          <Label value="Position" fontSize={8} color={C.textDim} uiTransform={{ height: 11, margin: { bottom: 3 } }} />
          <UiEntity uiTransform={{ flexDirection: 'row', width: '100%', height: 18 }}>
            {AxisField('X', pos.x, C.xAxis)}
            {AxisField('Y', pos.y, C.yAxis)}
            {AxisField('Z', pos.z, C.zAxis)}
          </UiEntity>
        </UiEntity>

        {/* Rotation */}
        <UiEntity uiTransform={{ width: '100%', flexDirection: 'column' }}>
          <Label value="Rotation" fontSize={8} color={C.textDim} uiTransform={{ height: 11, margin: { bottom: 3 } }} />
          <UiEntity uiTransform={{ flexDirection: 'row', width: '100%', height: 18 }}>
            {AxisField('X', rot.x, C.xAxis)}
            {AxisField('Y', rot.y, C.yAxis)}
            {AxisField('Z', rot.z, C.zAxis)}
          </UiEntity>
        </UiEntity>
      </UiEntity>
    </UiEntity>
  )
}

function AxisField(label: string, value: string, color: Color4) {
  return (
    <UiEntity
      uiTransform={{
        height: 18,
        margin: { right: 4 },
        flexDirection: 'row',
        alignItems: 'center',
        flexGrow: 1,
        borderRadius: 9,
        padding: { left: 2, right: 4 }
      }}
      uiBackground={{ color: Color4.create(0.06, 0.06, 0.08, 1) }}
    >
      <UiEntity
        uiTransform={{ width: 14, height: 14, justifyContent: 'center', alignItems: 'center', borderRadius: 7, margin: { right: 4 } }}
        uiBackground={{ color: Color4.create(color.r * 0.35, color.g * 0.35, color.b * 0.35, 1) }}
      >
        <Label value={label} fontSize={9} color={Color4.create(color.r, color.g, color.b, 0.95)} uiTransform={{ height: 11 }} textAlign="middle-center" />
      </UiEntity>
      <Label value={value} fontSize={9} color={C.text} uiTransform={{ height: 13 }} />
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
            padding: { left: 12, right: 14, top: 10, bottom: 10 },
            margin: { bottom: 4 },
            borderRadius: RADIUS_PANEL,
            borderWidth: 1,
            borderColor: C.panelBorder,
          }}
          uiBackground={{ color: C.panel }}
        >
          <UiEntity
            uiTransform={{
              flexDirection: 'column',
            }}
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
          width: 28, height: 28,
          justifyContent: 'center', alignItems: 'center',
          borderRadius: RADIUS_BTN,
        }}
        uiBackground={{ color: showShortcuts ? C.btnActive : h ? C.btnHover : C.btn }}
        onMouseEnter={() => setHov('help')}
        onMouseLeave={() => clearHov('help')}
        onMouseDown={() => { showShortcuts = !showShortcuts }}
      >
        {Icon({ icon: 'help', size: 14, color: Color4.create(1, 1, 1, showShortcuts ? 1.0 : h ? 0.8 : 0.5) })}
      </UiEntity>
    </UiEntity>
  )
}

// ── Editor Toggle Button (preview only) ─────────────────

function EditorToggle() {
  const edOn = state.editorActive
  const h = isHov('edt')

  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { bottom: 8, right: 8 },
        width: 28, height: 28,
        justifyContent: 'center', alignItems: 'center',
        borderRadius: RADIUS_BTN,
      }}
      uiBackground={{ color: toolBg(edOn, false, h) }}
      onMouseEnter={() => setHov('edt')}
      onMouseLeave={() => clearHov('edt')}
      onMouseDown={() => toggleEditorActive()}
    >
      {Icon({ icon: 'edit', size: 14, color: Color4.create(1, 1, 1, edOn ? 1.0 : h ? 0.8 : 0.5) })}
    </UiEntity>
  )
}

// ── Main UI ─────────────────────────────────────────────

function EditorUI() {
  // Deployed scenes (not preview, not studio) never see any editor UI —
  // not even the toggle button. Decided async by realmDetectSystem in
  // index.ts once RealmInfo is published.
  if (!state.isPreview) {
    return <UiEntity uiTransform={{ width: 0, height: 0, display: 'none' }} />
  }

  // Editor off — just the pencil button.
  if (!state.editorActive) {
    return (
      <UiEntity uiTransform={{ width: '100%', height: '100%' }}>
        {EditorToggle()}
      </UiEntity>
    )
  }

  // Editor on — full UI.
  const sel = state.selectedEntity !== undefined
  return (
    <UiEntity uiTransform={{ width: '100%', height: '100%' }}>
      {Toolbar(sel)}
      {/* Right-side stack: hierarchy + inspector */}
      <UiEntity
        uiTransform={{
          positionType: 'absolute',
          position: { top: 8, right: 8 },
          flexDirection: 'column',
          alignItems: 'flex-end',
        }}
      >
        {HierarchyPanel()}
        {InspectorPanel()}
      </UiEntity>
      {ShortcutsPanel()}
      {EditorToggle()}
    </UiEntity>
  )
}

export function setupEditorUi() {
  const uiEntity = engine.addEntity()
  editorEntities.add(uiEntity)
  ReactEcsRenderer.addUiRenderer(uiEntity, EditorUI, { virtualWidth: 1280, virtualHeight: 720 })
}
