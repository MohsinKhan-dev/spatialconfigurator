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
  modelUrl?: string; // Optional URL for GLB/GLTF models
  icon?: any; // For UI rendering
}

export interface ConfigurableObject {
  id: string;
  type: ObjectType;
  name: string;
  dimensions: Dimensions;
  position: [number, number, number];
  rotation: [number, number, number]; // Euler [x, y, z]
  color: string;
  isValid: boolean;
  violations?: string[];
  modelUrl?: string; // If present, renders GLB instead of primitive
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