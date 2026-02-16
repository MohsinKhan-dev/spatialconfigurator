# Bug Report: Scene Blinking After Loading Saved Scene with GLB Models

**Status:** Fixed
**Severity:** High
**Component:** `components/Scene.tsx`

## Description

After importing a saved scene (`.json`) containing GLB model objects, the entire 3D scene would blink/flicker repeatedly. The canvas would blank out and reappear multiple times as each GLB model loaded.

## Steps to Reproduce

1. Import one or more GLB models into the library
2. Place them in the scene
3. Export the scene to a `.json` file
4. Reset or reload the application
5. Import the saved `.json` scene file
6. Observe the entire scene blinking as GLB objects load

## Root Causes

### 1. Missing `<Suspense>` Boundary Around `<Gltf>`

The `<Gltf>` component from `@react-three/drei` uses React Suspense internally to load models. Without a local `<Suspense>` boundary, the suspension propagated up to the `<Canvas>`-level boundary, which renders `null` as its fallback. This blanked the **entire scene** (grid, container, all objects) every time a single GLB started loading.

With multiple GLB objects in a scene, their blob URLs resolved at staggered times, causing repeated full-scene blinks.

### 2. Unnecessary Re-renders of `<Gltf>` on Every Store Update

Any object drag triggers `updateObjectTransform` in the Zustand store, which creates a new `objects` array via `.map()`. This caused **all** `GroupedObjectWrapper` components to re-render — including ones with GLB models. Each re-render of the `<Gltf>` + `<Center>` tree risked re-cloning or re-mounting the 3D model, producing per-frame visual flashing.

### 3. Primitive Mesh Flash During Blob URL Resolution

Saved scenes store GLB data as base64 `modelData` (not blob URLs, which are session-only). On import, the blob URL is created asynchronously via `fetch(dataUrl)`. During this async gap, the component fell through to the primitive mesh branch (box/cylinder geometry), then abruptly switched to the GLB model once the blob URL resolved — causing a visible shape-to-model flash.

## Fix Applied

### `GltfModel` Memoized Component

```tsx
const GltfModel = memo<{ url: string; height: number }>(({ url, height }) => (
  <Suspense fallback={null}>
    <Center position={[0, height / 2, 0]}>
      <Gltf src={url} castShadow receiveShadow />
    </Center>
  </Suspense>
));
```

- **`React.memo`** prevents `<Gltf>` from re-rendering when the parent re-renders due to unrelated store updates. It only re-renders when `url` or `height` actually change.
- **`<Suspense fallback={null}>`** isolates each GLB's loading state. While one model loads, the rest of the scene (container, grid, other objects, shadows) remains visible.

### Skip Primitive Mesh for Pending GLB Objects

```tsx
if (object.modelData) {
  return null;
}
```

For GLB objects whose blob URL is still resolving, render nothing instead of a primitive mesh. This eliminates the box/cylinder-to-GLB visual flash.

## Files Changed

- `components/Scene.tsx`
