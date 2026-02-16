# Feature: Scene Save & Load

## Problem

Users lose all placed objects and configurations when the page is refreshed or closed. There is no way to persist, export, or restore a scene layout.

## Solution

Add the ability to **save** the current scene to a JSON file (download), **load** a previously saved scene from a JSON file (upload), and **auto-persist** the scene to `localStorage` so it survives page refreshes.

---

## Scope

### 1. Auto-Save to localStorage

- On every state change (objects added, moved, scaled, deleted), persist the scene to `localStorage`
- On app load, restore the scene from `localStorage` if data exists
- Uses Zustand's `persist` middleware for minimal code changes

### 2. Export Scene as JSON

- "Export Scene" button in the sidebar (under Scene Actions)
- Downloads a `.json` file containing:
  - `version`: Schema version string (e.g. `"1.0"`)
  - `container`: Current container config
  - `objects`: Array of all `ConfigurableObject` entries (excluding `modelUrl` blob URLs which are not portable)
- File is named `scene-<timestamp>.json`

### 3. Import Scene from JSON

- "Import Scene" button in the sidebar
- Opens a file picker (`.json` only)
- Validates the JSON structure before applying
- Replaces current scene objects with imported data
- Shows an error alert if the file is invalid

---

## Files to Modify

### `store.ts`

- Add Zustand `persist` middleware wrapping the store
- `persist` config: key = `"spatial-configurator-scene"`, storage = `localStorage`
- Only persist `objects` and `container` (not `selectedId` or `library`)
- Add `exportScene()` action — returns serializable scene JSON
- Add `importScene(data)` action — validates and replaces `objects` array

### `App.tsx`

- Add "Export Scene" button below "Reset Scene" in the Scene Actions section
- Add "Import Scene" button with a hidden file input (same pattern as GLB import)
- Wire buttons to `exportScene()` and `importScene()` store actions
- Add `Download` and `FolderOpen` icons from lucide-react

### `types.ts`

- Add `SceneFile` interface:
  ```typescript
  interface SceneFile {
    version: string;
    container: ContainerConfig;
    objects: Omit<ConfigurableObject, 'isValid' | 'violations'>[];
  }
  ```

---

## Implementation Details

### Auto-Save (Zustand persist)

```
zustand/middleware → persist({...}, { name, partialize, storage })
```

- `partialize`: Only persist `objects` and `container` fields
- On hydration, revalidate all objects through the constraint engine to restore `isValid` / `violations`

### Export

1. Read `objects` and `container` from store
2. Strip runtime fields (`isValid`, `violations`) and non-portable fields (`modelUrl` blob URLs)
3. Wrap in `{ version: "1.0", container, objects }`
4. `JSON.stringify` with 2-space indent
5. Create a `Blob`, generate object URL, trigger download via a hidden `<a>` element

### Import

1. Read file via `FileReader.readAsText()`
2. `JSON.parse` the contents
3. Validate: check `version` field exists, `objects` is an array, each object has required fields (`id`, `type`, `name`, `dimensions`, `position`, `rotation`, `scale`, `color`)
4. Assign `isValid: true, violations: []` to each imported object (will be revalidated on first interaction)
5. Replace store `objects` with imported data
6. On failure, `alert()` with error message and do not modify the scene

---

## UI Changes

Sidebar Scene Actions section (below Reset Scene):

```
[ Export Scene  ]   ← Download icon, downloads JSON
[ Import Scene  ]   ← FolderOpen icon, opens file picker
[ Reset Scene   ]   ← Existing button (moved to last)
```

---

## Verification

- Refresh the page — objects should persist from localStorage
- Click "Export Scene" — a JSON file should download
- Click "Reset Scene", then "Import Scene" with the exported file — scene should restore
- Import an invalid JSON file — should show an error alert without changing the scene
- Verify exported JSON does not contain blob URLs or runtime-only fields
