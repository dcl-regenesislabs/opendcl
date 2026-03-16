# UI Components Reference — React ECS

## Setup

```typescript
// ui.tsx
import ReactEcs, { ReactEcsRenderer, UiEntity, Label, Button, Input, Dropdown } from '@dcl/sdk/react-ecs'

export function setupUi() {
  ReactEcsRenderer.setUiRenderer(MyUI)
}
```

Only call `ReactEcsRenderer.setUiRenderer()` once per scene. Combine all UI into a single root component.

## UiEntity — All Props

```tsx
<UiEntity
  uiTransform={{
    // Size
    width: 300,                  // Pixels or '50%'
    height: 200,
    minWidth: 100,
    maxWidth: 500,
    minHeight: 50,
    maxHeight: 400,

    // Position
    positionType: 'absolute',    // 'absolute' | 'relative' (default)
    position: { top: 10, right: 10, bottom: 10, left: 10 },

    // Display
    display: 'flex',             // 'flex' | 'none'

    // Flexbox
    flexDirection: 'column',     // 'row' | 'column'
    justifyContent: 'center',    // 'flex-start' | 'center' | 'flex-end' | 'space-between' | 'space-around'
    alignItems: 'center',        // 'flex-start' | 'center' | 'flex-end' | 'stretch'
    flexWrap: 'wrap',            // 'nowrap' | 'wrap'

    // Spacing
    padding: { top: 10, bottom: 10, left: 10, right: 10 },  // or single number
    margin: { top: 5, bottom: 5, left: 5, right: 5 }        // or single number
  }}

  uiBackground={{
    color: Color4.create(0, 0, 0, 0.8),           // Solid color
    texture: { src: 'images/bg.png' },             // Image
    textureMode: 'stretch',                         // 'stretch' | 'nine-slices' | 'center'
    textureSlices: { top: 0.1, bottom: 0.1, left: 0.1, right: 0.1 },  // For nine-slices
    avatarTexture: { userId: 'user-id' }           // Avatar portrait
  }}

  uiText={{
    value: 'Hello!',
    fontSize: 18,
    color: Color4.White(),
    textAlign: 'middle-center',
    font: 'sans-serif',          // 'sans-serif' | 'serif' | 'monospace'
    fontWeight: 'bold'           // 'normal' | 'bold'
  }}

  // Events
  onMouseDown={() => { }}
  onMouseUp={() => { }}
  onMouseEnter={() => { }}
  onMouseLeave={() => { }}
/>
```

## Label

```tsx
<Label
  value="Score: 100"
  fontSize={18}
  color={Color4.White()}
  textAlign="middle-center"
  font="serif"
  uiTransform={{ width: 200, height: 30 }}
/>
```

**textAlign values:** `top-left`, `top-center`, `top-right`, `middle-left`, `middle-center`, `middle-right`, `bottom-left`, `bottom-center`, `bottom-right`

**font values:** `sans-serif` (default), `serif`, `monospace`

## Button

```tsx
<Button
  value="Click Me"
  variant="primary"           // 'primary' | 'secondary'
  fontSize={16}
  color={Color4.White()}      // Text color
  uiTransform={{ width: 150, height: 40 }}
  uiBackground={{ color: Color4.Blue() }}  // Override default style
  onMouseDown={() => { console.log('clicked') }}
/>
```

## Input

```tsx
<Input
  placeholder="Enter text..."
  placeholderColor={Color4.Gray()}
  color={Color4.Black()}
  fontSize={16}
  uiTransform={{ width: 250, height: 40 }}
  onChange={(value) => { console.log('Changing:', value) }}
  onSubmit={(value) => { console.log('Submitted:', value) }}
/>
```

## Dropdown

```tsx
<Dropdown
  options={['Option A', 'Option B', 'Option C']}
  selectedIndex={0}
  onChange={(index) => { console.log('Selected:', index) }}
  fontSize={14}
  color={Color4.Black()}
  uiTransform={{ width: 200, height: 40 }}
  acceptEmpty={true}
  emptyLabel="-- Select --"
  disabled={false}
/>
```

## Layout Patterns

### Health Bar

```tsx
<UiEntity
  uiTransform={{ width: 200, height: 20, positionType: 'absolute', position: { bottom: 20, left: '50%' } }}
  uiBackground={{ color: Color4.create(0.3, 0.3, 0.3, 0.8) }}
>
  <UiEntity
    uiTransform={{ width: `${health}%`, height: '100%' }}
    uiBackground={{ color: Color4.create(0.2, 0.8, 0.2, 1) }}
  />
</UiEntity>
```

### Modal Dialog

```tsx
const Modal = () => {
  if (!isOpen) return null
  return (
    <UiEntity
      uiTransform={{ width: '100%', height: '100%', positionType: 'absolute', alignItems: 'center', justifyContent: 'center' }}
      uiBackground={{ color: Color4.create(0, 0, 0, 0.5) }}
    >
      <UiEntity
        uiTransform={{ width: 400, height: 300, flexDirection: 'column', alignItems: 'center', padding: 20 }}
        uiBackground={{ color: Color4.create(0.2, 0.2, 0.2, 1) }}
      >
        <Label value="Title" fontSize={24} />
        <Button value="Close" variant="primary" onMouseDown={() => { isOpen = false }} uiTransform={{ width: 100, height: 40 }} />
      </UiEntity>
    </UiEntity>
  )
}
```

### Inventory Grid

```tsx
<UiEntity uiTransform={{ width: 350, flexDirection: 'row', flexWrap: 'wrap' }}>
  {items.map((item, i) => (
    <UiEntity
      key={i}
      uiTransform={{ width: 70, height: 70, margin: 5, alignItems: 'center', justifyContent: 'center' }}
      uiBackground={{ color: Color4.create(0.3, 0.3, 0.3, 1) }}
      uiText={{ value: item.name, fontSize: 10 }}
      onMouseDown={() => selectItem(i)}
    />
  ))}
</UiEntity>
```

## UiCanvasInformation (Responsive Design)

```typescript
import { UiCanvasInformation, engine } from '@dcl/sdk/ecs'

const canvasInfo = UiCanvasInformation.get(engine.RootEntity)
const screenWidth = canvasInfo.width
const screenHeight = canvasInfo.height
const pixelRatio = canvasInfo.devicePixelRatio
```

Use canvas info to adapt UI layout for different screen sizes.

## State Management

React hooks (`useState`, `useEffect`) are NOT available. Use module-level variables:

```typescript
let score = 0
let showMenu = false

const UI = () => (
  <UiEntity uiTransform={{ width: '100%', height: '100%' }}>
    <Label value={`Score: ${score}`} fontSize={20} />
    {showMenu && <MenuPanel />}
  </UiEntity>
)

// Update from game logic
export function addScore(points: number) { score += points }
export function toggleMenu() { showMenu = !showMenu }
```

The UI re-renders every frame, so module-level variable changes are reflected immediately.

## Important Rules

- File must be `.tsx` for JSX support
- Only one `ReactEcsRenderer.setUiRenderer()` per scene
- No React hooks — use module-level variables
- Use `display: 'none'` to hide elements without removing them
- UI renders as a 2D overlay on top of the 3D scene
