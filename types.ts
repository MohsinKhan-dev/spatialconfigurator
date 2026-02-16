import * as THREE from 'three';

export interface Dimensions {
  width: number;
  height: number;
  depth: number;
}

export interface ContainerConfig {
  id: string;
  dimensions: Dimensions;
  gridSize: number;
}

export type ObjectType = 'cube' | 'rack' | 'cylinder' | 'custom';

export interface LibraryItem {
  type: ObjectType;
  name: string;
  dimensions: Dimensions;
  color: string;
  modelUrl?: string; // Blob URL for rendering (session-only)
  modelData?: string; // Base64-encoded GLB for persistence
  icon?: any; // For UI rendering
}

export interface ConfigurableObject {
  id: string;
  type: ObjectType;
  name: string;
  dimensions: Dimensions;
  position: [number, number, number];
  rotation: [number, number, number]; // Euler [x, y, z]
  scale: [number, number, number];
  color: string;
  isValid: boolean;
  violations?: string[];
  modelUrl?: string; // Blob URL for rendering (session-only)
  modelData?: string; // Base64-encoded GLB for persistence
}

export interface ConstraintResult {
  isValid: boolean;
  clampedPosition: THREE.Vector3;
  violations: string[];
}

export interface DragEventState {
  position: THREE.Vector3;
  rotation: THREE.Euler;
}

export interface SceneFile {
  version: string;
  container: ContainerConfig;
  objects: Omit<ConfigurableObject, 'isValid' | 'violations' | 'modelUrl'>[];
}