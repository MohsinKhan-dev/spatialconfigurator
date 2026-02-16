import React, { useEffect, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { 
  OrbitControls, 
  Grid, 
  TransformControls, 
  ContactShadows, 
  Environment,
  Stats,
  Gltf,
  Center
} from '@react-three/drei';
import * as THREE from 'three';
import { useStore } from '../store';
import { resolveConstraint } from '../services/constraintEngine';
import { ConfigurableObject, ContainerConfig } from '../types';

// -- Sub-Components --

const ContainerMesh: React.FC<{ config: ContainerConfig }> = ({ config }) => {
  const { width, height, depth } = config.dimensions;
  
  return (
    <group>
      {/* Floor Visualization */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
        <planeGeometry args={[width, depth]} />
        <meshStandardMaterial color="#1e293b" depthWrite={false} />
      </mesh>

      {/* Wireframe Bounds */}
      <mesh position={[0, height / 2, 0]}>
        <boxGeometry args={[width, height, depth]} />
        <meshBasicMaterial wireframe color="#06b6d4" opacity={0.3} transparent />
      </mesh>
      
      {/* Grid Helper */}
      <Grid 
        position={[0, 0.01, 0]} 
        args={[width, depth]} 
        cellSize={config.gridSize} 
        sectionSize={1} 
        infiniteGrid 
        fadeDistance={20}
        sectionColor="#64748b" 
        cellColor="#334155" 
      />
    </group>
  );
};

// -- Main Scene --

const SceneContent: React.FC = () => {
  const { container, objects, selectedId, updateObjectTransform, updateObjectScale, selectObject } = useStore();
  
  return (
    <>
      <ambientLight intensity={0.5} />
      <directionalLight 
        position={[10, 20, 10]} 
        intensity={1.5} 
        castShadow 
        shadow-mapSize={[2048, 2048]}
      />
      
      <Environment preset="city" />

      <group>
        <ContainerMesh config={container} />
        
        {objects.map((obj) => (
          <GroupedObjectWrapper
            key={obj.id}
            object={obj}
            container={container}
            allObjects={objects}
            isSelected={selectedId === obj.id}
            onSelect={selectObject}
            onUpdate={updateObjectTransform}
            onScaleUpdate={updateObjectScale}
          />
        ))}
      </group>

      <ContactShadows position={[0, 0, 0]} opacity={0.4} scale={20} blur={2} far={4} />

      <OrbitControls 
        makeDefault 
        minPolarAngle={0} 
        maxPolarAngle={Math.PI / 2.1} 
        maxDistance={25}
        target={[0, container.dimensions.height / 2, 0]}
      />
      
      <Stats className="!left-auto !right-0" />
    </>
  );
};

interface GroupedObjectWrapperProps {
  object: ConfigurableObject;
  container: ContainerConfig;
  allObjects: ConfigurableObject[];
  isSelected: boolean;
  onSelect: (id: string) => void;
  onUpdate: (id: string, pos: [number, number, number], rot: [number, number, number], scale: [number, number, number], isValid: boolean, violations: string[]) => void;
  onScaleUpdate: (id: string, scale: [number, number, number]) => void;
}

// Helper to handle the Pivot Offset cleanly
const GroupedObjectWrapper: React.FC<GroupedObjectWrapperProps> = (props) => {
  const { object, container } = props;
  const { width, height, depth } = object.dimensions;

  // Use state callback ref to ensure TransformControls has a valid target on mount
  const [group, setGroup] = useState<THREE.Group | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [transformMode, setTransformMode] = useState<'translate' | 'scale'>('translate');

  // Toggle transform mode with keyboard shortcut when selected
  useEffect(() => {
    if (!props.isSelected) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'r' || e.key === 'R') setTransformMode('scale');
      if (e.key === 'g' || e.key === 'G') setTransformMode('translate');
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [props.isSelected]);

  // Sync group position/rotation/scale with store, but only if not dragging
  useEffect(() => {
    if (group && !isDragging) {
      group.position.set(object.position[0], object.position[1], object.position[2]);
      group.rotation.set(object.rotation[0], object.rotation[1], object.rotation[2]);
      group.scale.set(object.scale[0], object.scale[1], object.scale[2]);
    }
  }, [object.position, object.rotation, object.scale, isDragging, group]);

  const materialColor = object.isValid ? object.color : '#ef4444';

  const renderVisuals = () => {
    if (object.modelUrl) {
      return (
        <Center position={[0, height / 2, 0]}>
           <Gltf
            src={object.modelUrl}
            castShadow
            receiveShadow
          />
        </Center>
      );
    }

    return (
      <mesh position={[0, height / 2, 0]} castShadow receiveShadow>
        {object.type === 'cylinder' ? (
            <cylinderGeometry args={[width/2, width/2, height, 32]} />
        ) : (
            <boxGeometry args={[width, height, depth]} />
        )}
        <meshStandardMaterial
          color={materialColor}
          emissive={object.isValid ? '#000000' : '#ef4444'}
          emissiveIntensity={object.isValid ? 0 : 0.4}
          roughness={0.3}
        />
      </mesh>
    );
  };

  return (
    <>
       {props.isSelected && group && (
          <TransformControls
            object={group}
            mode={transformMode}
            translationSnap={container.gridSize}
            rotationSnap={Math.PI / 2}
            scaleSnap={0.1}
            space="local"
            onMouseDown={() => setIsDragging(true)}
            onMouseUp={() => setIsDragging(false)}
            onChange={() => {
              if (group) {
                const currentPos = group.position.clone();
                const currentRot = group.rotation.clone();
                const currentScale: [number, number, number] = [
                  Math.max(0.1, group.scale.x),
                  Math.max(0.1, group.scale.y),
                  Math.max(0.1, group.scale.z),
                ];

                // Enforce minimum scale
                group.scale.set(currentScale[0], currentScale[1], currentScale[2]);

                const scaleVec = new THREE.Vector3(...currentScale);

                const result = resolveConstraint(
                  object.id,
                  object.dimensions,
                  currentPos,
                  currentRot,
                  props.container,
                  props.allObjects,
                  scaleVec
                );

                // Hard constraint: Snap visual to clamp
                group.position.copy(result.clampedPosition);

                props.onUpdate(
                  object.id,
                  [result.clampedPosition.x, result.clampedPosition.y, result.clampedPosition.z],
                  [currentRot.x, currentRot.y, currentRot.z],
                  currentScale,
                  result.isValid,
                  result.violations
                );
              }
            }}
          />
        )}

      <group
        ref={setGroup}
        onClick={(e) => {
          e.stopPropagation();
          props.onSelect(object.id);
        }}
        position={[object.position[0], object.position[1], object.position[2]]}
        rotation={[object.rotation[0], object.rotation[1], object.rotation[2]]}
        scale={[object.scale[0], object.scale[1], object.scale[2]]}
      >
        {renderVisuals()}

        {/* Selection Highlight */}
        {props.isSelected && (
          <mesh position={[0, height / 2, 0]}>
             <boxGeometry args={[width + 0.05, height + 0.05, depth + 0.05]} />
             <meshBasicMaterial color="white" wireframe transparent opacity={0.3} />
          </mesh>
        )}
      </group>
    </>
  )
}

export const Scene: React.FC = () => {
  return (
    <div className="w-full h-full bg-slate-900">
      <Canvas shadows camera={{ position: [8, 8, 8], fov: 50 }} dpr={[1, 2]}>
        <SceneContent />
      </Canvas>
    </div>
  );
};