import * as THREE from 'three';
import { ConfigurableObject, ContainerConfig, Dimensions } from '../types';

/**
 * High-performance constraint resolution pipeline.
 * All calculations are performed in Container Local Space.
 */

const HELPER_BOX_A = new THREE.Box3();
const HELPER_BOX_B = new THREE.Box3();
const HELPER_VEC = new THREE.Vector3();
const HELPER_MAT = new THREE.Matrix4();
const HELPER_QUAT = new THREE.Quaternion();
const HELPER_EULER = new THREE.Euler();

/**
 * Creates a THREE.Box3 for a given object definition and transform
 */
export const getObjectBoundingBox = (
  dims: Dimensions,
  position: THREE.Vector3,
  rotation: THREE.Euler,
  target: THREE.Box3,
  scale: THREE.Vector3 = new THREE.Vector3(1, 1, 1)
): THREE.Box3 => {
  // Apply scale to dimensions
  const scaledW = dims.width * scale.x;
  const scaledH = dims.height * scale.y;
  const scaledD = dims.depth * scale.z;

  const halfW = scaledW / 2;
  const halfD = scaledD / 2;

  // Construct local geometry box (Pivot at bottom-center)
  const min = new THREE.Vector3(-halfW, 0, -halfD);
  const max = new THREE.Vector3(halfW, scaledH, halfD);

  target.makeEmpty();

  const corners = [
    new THREE.Vector3(min.x, min.y, min.z),
    new THREE.Vector3(min.x, min.y, max.z),
    new THREE.Vector3(min.x, max.y, min.z),
    new THREE.Vector3(min.x, max.y, max.z),
    new THREE.Vector3(max.x, min.y, min.z),
    new THREE.Vector3(max.x, min.y, max.z),
    new THREE.Vector3(max.x, max.y, min.z),
    new THREE.Vector3(max.x, max.y, max.z),
  ];

  HELPER_MAT.compose(position, HELPER_QUAT.setFromEuler(rotation), new THREE.Vector3(1, 1, 1));

  for (const corner of corners) {
    corner.applyMatrix4(HELPER_MAT);
    target.expandByPoint(corner);
  }

  return target;
};

/**
 * Checks if an object is strictly within the container bounds
 */
export const checkContainerBounds = (
  objectBox: THREE.Box3,
  container: ContainerConfig
): { isInside: boolean; violations: string[] } => {
  const cWidth = container.dimensions.width;
  const cHeight = container.dimensions.height;
  const cDepth = container.dimensions.depth;

  // Container is centered at (0,0,0) in world, but usually floor is at y=0.
  // Let's assume container floor is at y=0.
  // X: -width/2 to width/2
  // Z: -depth/2 to depth/2
  // Y: 0 to height

  const cMin = new THREE.Vector3(-cWidth / 2, 0, -cDepth / 2);
  const cMax = new THREE.Vector3(cWidth / 2, cHeight, cDepth / 2);
  const containerBox = new THREE.Box3(cMin, cMax);

  if (containerBox.containsBox(objectBox)) {
    return { isInside: true, violations: [] };
  }

  // Generate specific violation messages
  const violations: string[] = [];
  if (objectBox.min.x < cMin.x || objectBox.max.x > cMax.x) violations.push("Exceeds Width");
  if (objectBox.min.y < cMin.y || objectBox.max.y > cMax.y) violations.push("Exceeds Height");
  if (objectBox.min.z < cMin.z || objectBox.max.z > cMax.z) violations.push("Exceeds Depth");

  return { isInside: false, violations };
};

/**
 * Checks intersection with other objects in the scene
 */
export const checkCollisions = (
  targetId: string,
  targetBox: THREE.Box3,
  others: ConfigurableObject[]
): { isColliding: boolean; collidingIds: string[] } => {
  const collidingIds: string[] = [];
  
  for (const obj of others) {
    if (obj.id === targetId) continue;

    // Convert other object to Box3
    const pos = new THREE.Vector3(...obj.position);
    const rot = new THREE.Euler(...obj.rotation);
    const scl = new THREE.Vector3(...obj.scale);
    getObjectBoundingBox(obj.dimensions, pos, rot, HELPER_BOX_B, scl);

    if (targetBox.intersectsBox(HELPER_BOX_B)) {
      collidingIds.push(obj.id);
    }
  }

  return {
    isColliding: collidingIds.length > 0,
    collidingIds
  };
};

/**
 * Clamps a position to stay within the container (Wall Snapping)
 */
export const clampToContainer = (
  dims: Dimensions,
  position: THREE.Vector3,
  rotation: THREE.Euler,
  container: ContainerConfig,
  scale: THREE.Vector3 = new THREE.Vector3(1, 1, 1)
): THREE.Vector3 => {
  const clamped = position.clone();

  // Calculate extent of the object in its current rotation relative to its center
  // We need the half-extents of the AABB
  HELPER_BOX_A.makeEmpty();
  getObjectBoundingBox(dims, new THREE.Vector3(0,0,0), rotation, HELPER_BOX_A, scale);
  
  const halfX = (HELPER_BOX_A.max.x - HELPER_BOX_A.min.x) / 2;
  const halfZ = (HELPER_BOX_A.max.z - HELPER_BOX_A.min.z) / 2;
  // Height is 0 to H usually for bottom pivot
  const maxY = HELPER_BOX_A.max.y;

  const cHalfW = container.dimensions.width / 2;
  const cHalfD = container.dimensions.depth / 2;
  
  // Clamp X
  // minX must be >= -cHalfW => pos.x - halfX >= -cHalfW => pos.x >= -cHalfW + halfX
  // maxX must be <= cHalfW => pos.x + halfX <= cHalfW => pos.x <= cHalfW - halfX
  const minX = -cHalfW + halfX;
  const maxX = cHalfW - halfX;
  clamped.x = Math.max(minX, Math.min(clamped.x, maxX));

  // Clamp Z
  const minZ = -cHalfD + halfZ;
  const maxZ = cHalfD - halfZ;
  clamped.z = Math.max(minZ, Math.min(clamped.z, maxZ));

  // Clamp Y (Floor snap)
  clamped.y = Math.max(0, Math.min(clamped.y, container.dimensions.height - maxY));

  return clamped;
};

/**
 * Main resolution function
 */
export const resolveConstraint = (
  id: string,
  dims: Dimensions,
  proposedPos: THREE.Vector3,
  proposedRot: THREE.Euler,
  container: ContainerConfig,
  others: ConfigurableObject[],
  scale: THREE.Vector3 = new THREE.Vector3(1, 1, 1)
) => {
  // 1. Clamp to Walls (Auto-Snap)
  const clampedPos = clampToContainer(dims, proposedPos, proposedRot, container, scale);

  // 2. Generate AABB for the clamped position
  const targetBox = getObjectBoundingBox(dims, clampedPos, proposedRot, HELPER_BOX_A, scale);

  // 3. Check specific bounds violations (double check after clamp, though clamp handles most)
  // We keep this to catch height violations or impossible sizes.
  const boundsCheck = checkContainerBounds(targetBox, container);

  // 4. Check Collisions
  const collisionCheck = checkCollisions(id, targetBox, others);

  const violations = [...boundsCheck.violations];
  if (collisionCheck.isColliding) {
    violations.push(`Collides with ${collisionCheck.collidingIds.length} object(s)`);
  }

  return {
    isValid: violations.length === 0,
    clampedPosition: clampedPos,
    violations,
  };
};