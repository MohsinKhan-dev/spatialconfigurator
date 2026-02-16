import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { ConfigurableObject, ContainerConfig, LibraryItem, SceneFile } from './types';
import { v4 as uuidv4 } from 'uuid';

interface AppState {
  container: ContainerConfig;
  objects: ConfigurableObject[];
  library: LibraryItem[];
  selectedId: string | null;

  // Actions
  addLibraryItem: (item: LibraryItem) => void;
  addObject: (templateName: string) => void;
  updateObjectTransform: (id: string, pos: [number, number, number], rot: [number, number, number], scale: [number, number, number], isValid: boolean, violations: string[]) => void;
  updateObjectScale: (id: string, scale: [number, number, number]) => void;
  selectObject: (id: string | null) => void;
  deleteSelected: () => void;
  resetScene: () => void;
  exportScene: () => SceneFile;
  importScene: (data: unknown) => { success: boolean; error?: string };
}

const DEFAULT_CONTAINER: ContainerConfig = {
  id: 'room-1',
  dimensions: { width: 10, height: 4, depth: 10 },
  gridSize: 0.5,
};

const DEFAULT_LIBRARY: LibraryItem[] = [
  {
    type: 'cube',
    name: 'Crate',
    dimensions: { width: 1, height: 1, depth: 1 },
    color: '#10b981'
  },
  {
    type: 'rack',
    name: 'Rack',
    dimensions: { width: 1.2, height: 2.2, depth: 0.6 },
    color: '#3b82f6'
  },
  {
    type: 'cylinder',
    name: 'Barrel',
    dimensions: { width: 0.8, height: 1.5, depth: 0.8 },
    color: '#f59e0b'
  }
];

const INITIAL_OBJECTS: ConfigurableObject[] = [
  {
    id: 'init-1',
    type: 'rack',
    name: 'Rack',
    dimensions: { width: 1.2, height: 2.2, depth: 0.6 },
    position: [-3, 0, -3],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    color: '#3b82f6',
    isValid: true,
  }
];

const validateSceneFile = (data: any): data is SceneFile => {
  if (!data || typeof data !== 'object') return false;
  if (typeof data.version !== 'string') return false;
  if (!data.container || !data.container.dimensions) return false;
  if (!Array.isArray(data.objects)) return false;

  for (const obj of data.objects) {
    if (!obj.id || !obj.type || !obj.name) return false;
    if (!obj.dimensions || typeof obj.dimensions.width !== 'number') return false;
    if (!Array.isArray(obj.position) || obj.position.length !== 3) return false;
    if (!Array.isArray(obj.rotation) || obj.rotation.length !== 3) return false;
    if (!Array.isArray(obj.scale) || obj.scale.length !== 3) return false;
    if (typeof obj.color !== 'string') return false;
  }

  return true;
};

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      container: DEFAULT_CONTAINER,
      objects: INITIAL_OBJECTS,
      library: DEFAULT_LIBRARY,
      selectedId: null,

      addLibraryItem: (item) => {
        set((state) => ({ library: [...state.library, item] }));
      },

      addObject: (templateName) => {
        const { library } = get();
        const template = library.find(item => item.name === templateName);

        if (!template) {
          console.error(`Template ${templateName} not found`);
          return;
        }

        const newObj: ConfigurableObject = {
          id: uuidv4(),
          type: template.type,
          name: template.name,
          dimensions: { ...template.dimensions },
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
          color: template.color,
          isValid: true,
          modelUrl: template.modelUrl,
          modelData: template.modelData
        };

        set((state) => ({ objects: [...state.objects, newObj], selectedId: newObj.id }));
      },

      updateObjectTransform: (id, pos, rot, scale, isValid, violations) => {
        set((state) => ({
          objects: state.objects.map((obj) =>
            obj.id === id
              ? { ...obj, position: pos, rotation: rot, scale, isValid, violations }
              : obj
          ),
        }));
      },

      updateObjectScale: (id, scale) => {
        set((state) => ({
          objects: state.objects.map((obj) =>
            obj.id === id ? { ...obj, scale } : obj
          ),
        }));
      },

      selectObject: (id) => set({ selectedId: id }),

      deleteSelected: () => {
        set((state) => ({
          objects: state.objects.filter((o) => o.id !== state.selectedId),
          selectedId: null,
        }));
      },

      resetScene: () => set({ objects: [], selectedId: null }),

      exportScene: () => {
        const { container, objects } = get();
        // Strip runtime fields and blob URLs. Keep modelData (data URL) for GLB persistence.
        const exportObjects = objects.map(({ isValid, violations, modelUrl, ...rest }) => rest);
        return {
          version: '1.0',
          container,
          objects: exportObjects,
        };
      },

      importScene: (data: unknown) => {
        if (!validateSceneFile(data)) {
          return { success: false, error: 'Invalid scene file format.' };
        }

        // Don't set modelUrl here — Scene.tsx will resolve it from modelData
        const objects: ConfigurableObject[] = data.objects.map((obj) => ({
          ...obj,
          isValid: true,
          violations: [],
        }));

        set({ objects, container: data.container, selectedId: null });
        return { success: true };
      },
    }),
    {
      name: 'spatial-configurator-scene',
      partialize: (state) => ({
        // Strip blob URLs and modelData (too large for localStorage's ~5MB limit).
        // modelData is only used for JSON file export/import.
        objects: state.objects.map(({ modelUrl, modelData, ...rest }) => rest),
        container: state.container,
      }),
    }
  )
);
