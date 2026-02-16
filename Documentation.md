# Spatial Configurator - Documentation

A high-performance, deterministic 3D configurator for constrained spatial placement with collision detection and rule-based validation.

---

## Table of Contents

- [Overview](#overview)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
- [Project Structure](#project-structure)
- [Architecture](#architecture)
  - [State Management](#state-management)
  - [Constraint Engine](#constraint-engine)
  - [3D Scene](#3d-scene)
  - [UI Layer](#ui-layer)
- [Type Definitions](#type-definitions)
- [Features](#features)
  - [Object Library](#object-library)
  - [GLB Model Import](#glb-model-import)
  - [Drag & Transform](#drag--transform)
  - [Scale / Resize](#scale--resize)
  - [Collision Detection](#collision-detection)
  - [Container Bounds Validation](#container-bounds-validation)
  - [Wall Snapping](#wall-snapping)
- [Configuration](#configuration)
- [Scripts](#scripts)

---

## Overview

Spatial Configurator is an interactive web application that lets users place, move, and validate 3D objects within a bounded container. Objects snap to a grid, are clamped to container walls, and are checked in real time for collisions with other objects. Visual feedback (green/red) indicates whether a placement is valid.

## Tech Stack

| Category | Technology | Version |
|---|---|---|
| UI Framework | React | ^19.2.4 |
| Language | TypeScript | ~5.8.2 |
| 3D Engine | Three.js | ^0.182.0 |
| React 3D Renderer | @react-three/fiber | ^9.5.0 |
| 3D Helpers | @react-three/drei | ^10.7.7 |
| State Management | Zustand | ^5.0.10 |
| Build Tool | Vite | ^6.2.0 |
| Styling | Tailwind CSS | CDN |
| Icons | Lucide React | ^0.563.0 |
| ID Generation | UUID | ^13.0.0 |

## Getting Started

**Prerequisites:** Node.js

```bash
# Install dependencies
npm install

# Start development server (http://localhost:3000)
npm run dev
```

## Project Structure

```
Spatial Configurator/
├── index.html                 # HTML entry point (Tailwind CDN, import maps)
├── index.tsx                  # React mount point (StrictMode)
├── App.tsx                    # Main UI component (sidebar + canvas + HUD)
├── types.ts                   # Shared TypeScript interfaces
├── store.ts                   # Zustand state store
├── metadata.json              # Project name & description
├── package.json               # Dependencies and scripts
├── tsconfig.json              # TypeScript compiler options
├── vite.config.ts             # Vite dev server & build config
├── components/
│   └── Scene.tsx              # 3D scene rendering (container, objects, controls)
└── services/
    └── constraintEngine.ts    # Spatial constraint resolution pipeline
```

## Architecture

### State Management

**File:** `store.ts`

A single Zustand store (`useStore`) holds all application state:

| State | Type | Description |
|---|---|---|
| `container` | `ContainerConfig` | Room dimensions (10m x 4m x 10m) and grid size (0.5m) |
| `objects` | `ConfigurableObject[]` | All placed scene objects with transforms and validation state |
| `library` | `LibraryItem[]` | Available object templates (built-in + imported) |
| `selectedId` | `string \| null` | Currently selected object ID |

**Actions:**

| Action | Description |
|---|---|
| `addLibraryItem(item)` | Adds a new template to the library (used for GLB imports) |
| `addObject(templateName)` | Instantiates an object from a library template at origin `[0, 0, 0]` with scale `[1, 1, 1]` and selects it |
| `updateObjectTransform(id, pos, rot, scale, isValid, violations)` | Updates an object's position, rotation, scale, and validation state |
| `updateObjectScale(id, scale)` | Updates only the scale of an object (used by sidebar inputs) |
| `selectObject(id)` | Sets the selected object (or `null` to deselect) |
| `deleteSelected()` | Removes the currently selected object |
| `resetScene()` | Clears all objects and deselects |

**Default library templates:**

| Name | Type | Dimensions (W x H x D) | Color |
|---|---|---|---|
| Crate | cube | 1.0 x 1.0 x 1.0 m | #10b981 (emerald) |
| Rack | rack | 1.2 x 2.2 x 0.6 m | #3b82f6 (blue) |
| Barrel | cylinder | 0.8 x 1.5 x 0.8 m | #f59e0b (amber) |

### Constraint Engine

**File:** `services/constraintEngine.ts`

A stateless, high-performance pipeline that validates object placement. All calculations use container-local space. Reusable Three.js helper objects (`Box3`, `Vector3`, `Matrix4`, `Quaternion`, `Euler`) are allocated once at module scope to minimize GC pressure.

**Pipeline (`resolveConstraint`):**

```
Proposed Position/Rotation/Scale
        │
        ▼
┌─────────────────────┐
│  clampToContainer() │  Wall-snap: clamp position so scaled AABB stays inside bounds
└────────┬────────────┘
         │
         ▼
┌─────────────────────────┐
│  getObjectBoundingBox() │  Compute world-space AABB from dimensions × scale + rotation
└────────┬────────────────┘
         │
         ▼
┌──────────────────────────┐
│  checkContainerBounds()  │  Verify AABB is fully inside the container
└────────┬─────────────────┘
         │
         ▼
┌─────────────────────┐
│  checkCollisions()   │  Test AABB intersection with all other objects
└────────┬────────────┘
         │
         ▼
   ConstraintResult { isValid, clampedPosition, violations[] }
```

**Key functions:**

| Function | Purpose |
|---|---|
| `getObjectBoundingBox(dims, position, rotation, target, scale?)` | Computes world-space AABB by multiplying dimensions by scale, then transforming the 8 corners through a composed matrix (position + rotation). Uses bottom-center pivot. Scale defaults to `(1,1,1)`. |
| `checkContainerBounds(objectBox, container)` | Tests if the AABB is fully contained within the container. Returns specific violations: "Exceeds Width", "Exceeds Height", "Exceeds Depth". |
| `checkCollisions(targetId, targetBox, others)` | Iterates all other objects, computes their scaled AABBs, and tests intersection. Returns colliding object IDs. |
| `clampToContainer(dims, position, rotation, container, scale?)` | Calculates the scaled AABB half-extents at origin for the given rotation, then clamps X, Y, Z to keep the object inside. Y is floor-snapped (min 0). Scale defaults to `(1,1,1)`. |
| `resolveConstraint(id, dims, pos, rot, container, others, scale?)` | Main entry point. Passes scale through the full pipeline and returns `{ isValid, clampedPosition, violations }`. Scale defaults to `(1,1,1)`. |

### 3D Scene

**File:** `components/Scene.tsx`

Built with `@react-three/fiber` and `@react-three/drei`. Contains three main components:

**`Scene`** - Root component. Creates a `<Canvas>` with shadows, camera at `[8, 8, 8]`, FOV 50, and DPR `[1, 2]`.

**`SceneContent`** - Scene graph contents:
- Ambient light (intensity 0.5) + directional light with shadow maps (2048x2048)
- `Environment` preset ("city") for reflections
- `ContainerMesh` rendering the room
- All `GroupedObjectWrapper` instances
- `ContactShadows` for ground shadows
- `OrbitControls` (clamped polar angle, max distance 25)
- `Stats` overlay (FPS counter, top-right)

**`ContainerMesh`** - Renders the container as:
- A dark floor plane
- A cyan wireframe box showing the bounds
- An infinite grid with cell size matching `gridSize` (0.5m) and 1m section lines

**`GroupedObjectWrapper`** - Per-object component handling:
- `TransformControls` with switchable mode: **translate** (default) or **scale**
  - Press **G** to switch to translate mode, **R** to switch to scale mode
  - Translate mode: grid snapping (`translationSnap = gridSize`)
  - Scale mode: snap increment of 0.1, minimum scale clamped to 0.1 per axis
- `object.scale` is applied to the `<group>` via the `scale` prop, visually resizing the object
- On every `onChange`, reads current position, rotation, and scale from the group, calls `resolveConstraint()` with scale, and snaps the visual position to the clamped result
- Renders either a GLB model (via `<Gltf>` + `<Center>`) or a primitive mesh (box/cylinder) depending on `modelUrl`
- Material turns red with emissive glow when placement is invalid
- White wireframe outline when selected
- Click to select (with `stopPropagation` to prevent deselection)

### UI Layer

**File:** `App.tsx`

Responsive layout using Tailwind CSS:

- **3D Canvas Area** (left/top, flex-grow): The `<Scene>` component plus two overlay HUDs:
  - Top-left: Title and instructions
  - Bottom-center: Validation status pill (green "Placement Valid" or red "Placement Invalid" with violation detail)

- **Sidebar** (right/bottom, 320px on desktop): Contains:
  - **Library grid**: 3-column grid of template buttons. Click to instantiate.
  - **Import GLB button**: Opens file picker (`.glb` only). Uses `GLTFLoader` + `DRACOLoader` to parse the model, computes bounding box, and adds to library.
  - **Properties panel** (when object selected): Shows name, dimensions (W/H/D), position (X/Y/Z), scale inputs (X/Y/Z with min 0.1, max 10, step 0.1), object ID, and a delete button. Includes a hint about G/R keyboard shortcuts for gizmo mode switching.
  - **Reset Scene button**: Clears all objects.

## Type Definitions

**File:** `types.ts`

```typescript
Dimensions        { width, height, depth }
ContainerConfig   { id, dimensions, gridSize }
ObjectType        'cube' | 'rack' | 'cylinder' | 'custom'
LibraryItem       { type, name, dimensions, color, modelUrl?, icon? }
ConfigurableObject { id, type, name, dimensions, position, rotation, scale, color, isValid, violations?, modelUrl? }
ConstraintResult  { isValid, clampedPosition, violations }
DragEventState    { position, rotation }
```

- `position` is stored as `[x, y, z]` tuple in the store, converted to `THREE.Vector3` for calculations.
- `rotation` is stored as `[x, y, z]` Euler angles in the store.
- `scale` is stored as `[x, y, z]` tuple, defaulting to `[1, 1, 1]`. Scale is applied to dimensions in the constraint engine and to the visual group in the scene.
- Pivot point for all objects is **bottom-center** (Y ranges from 0 to height).

## Features

### Object Library

Three built-in templates (Crate, Rack, Barrel) are available in the sidebar. Clicking a template places a new instance at the origin `[0, 0, 0]` and auto-selects it.

### GLB Model Import

Users can import custom `.glb` models via the "Import GLB" button. The system:
1. Validates the file extension (`.glb` only; `.gltf` is rejected because it requires external resources)
2. Loads the model using `GLTFLoader` with `DRACOLoader` for compressed mesh support
3. Computes the bounding box from the scene graph
4. Creates a new library item with type `'custom'` and the computed dimensions
5. The model can then be placed like any built-in template

### Drag & Transform

Selected objects show `TransformControls` gizmos. The gizmo mode can be switched with keyboard shortcuts:
- **G** — Translate mode (default). Movement snaps to the container's grid size (0.5m by default).
- **R** — Scale mode. Scale snaps in increments of 0.1.

Rotation snaps to 90-degree increments.

### Scale / Resize

Objects can be scaled per-axis (X, Y, Z) via two methods:

1. **Sidebar inputs**: Numeric fields in the Properties panel (min 0.1, max 10, step 0.1). Changes are applied immediately via `updateObjectScale()`.
2. **3D gizmo**: Press **R** to switch `TransformControls` to scale mode, then drag the axis handles. Scale is clamped to a minimum of 0.1 per axis.

Scale is factored into the constraint engine — bounding boxes, wall snapping, and collision detection all use `dimensions × scale` for their calculations.

### Collision Detection

On every transform change, the constraint engine computes AABBs for the moved object and all others, then tests for intersections. Colliding objects are reported as violations.

### Container Bounds Validation

The AABB of each object is tested against the container bounds. Specific axis violations are reported ("Exceeds Width", "Exceeds Height", "Exceeds Depth").

### Wall Snapping

Before validation, the object position is automatically clamped so its AABB stays within the container. This prevents objects from being dragged into the void. The clamping accounts for the object's rotated extents and scale.

## Configuration

**Container defaults** (in `store.ts`):
- Dimensions: 10m (W) x 4m (H) x 10m (D)
- Grid size: 0.5m
- Container is centered at world origin with floor at Y = 0

**Vite config** (`vite.config.ts`):
- Dev server: port 3000, host `0.0.0.0`
- Path alias: `@/` resolves to project root
- Environment variable: `GEMINI_API_KEY` (for future AI integration)

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start Vite dev server on port 3000 |
| `npm run build` | Production build |
| `npm run preview` | Preview production build locally |
