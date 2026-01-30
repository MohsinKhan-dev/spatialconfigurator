import React, { useRef } from 'react';
import { Scene } from './components/Scene';
import { useStore } from './store';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { 
  Box, 
  Layers, 
  AlertTriangle, 
  CheckCircle, 
  RotateCcw, 
  Trash2, 
  MousePointer2,
  Upload,
  Package
} from 'lucide-react';

const App: React.FC = () => {
  const { 
    objects, 
    library,
    addObject, 
    addLibraryItem,
    selectedId, 
    deleteSelected, 
    resetScene 
  } = useStore();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const selectedObject = objects.find(o => o.id === selectedId);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // STRICT CHECK: Ensure file is .glb
    // The previous error "Failed to load buffer .bin" occurs when a .gltf references external files 
    // that are not accessible via the single blob URL. .glb files are self-contained.
    if (!file.name.toLowerCase().endsWith('.glb')) {
      alert('Please select a .glb file. \n\n.gltf files typically require external .bin and texture files which are not supported in this simple importer. Please convert your model to a single binary .glb file.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    const url = URL.createObjectURL(file);
    const loader = new GLTFLoader();
    
    // Add Draco support to handle compressed meshes commonly found in optimization pipelines
    const dracoLoader = new DRACOLoader();
    // Use a reliable CDN for the decoder
    dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
    loader.setDRACOLoader(dracoLoader);

    loader.load(url, (gltf) => {
      // Calculate Bounding Box
      const box = new THREE.Box3().setFromObject(gltf.scene);
      const size = new THREE.Vector3();
      box.getSize(size);

      // Check if size is valid (sometimes empty scenes return 0)
      if (size.lengthSq() < 0.0001) {
        // Fallback for empty or point objects
        size.set(1, 1, 1);
      }

      // Create new Library Item
      const name = file.name.replace('.glb', '').replace('.gltf', '');
      
      addLibraryItem({
        type: 'custom',
        name: name,
        dimensions: { width: size.x, height: size.y, depth: size.z },
        color: '#ffffff',
        modelUrl: url
      });
      
      dracoLoader.dispose();

    }, undefined, (error) => {
      console.error('An error happened loading the GLB', error);
      alert('Failed to load GLB file. It may be corrupt or require external resources not embedded in the file.');
      URL.revokeObjectURL(url); // Clean up memory on failure
      dracoLoader.dispose();
    });

    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Helper to get icon based on type
  const getIcon = (type: string) => {
    switch (type) {
      case 'rack': return <Layers className="mb-2 text-blue-500 group-hover:scale-110 transition-transform" />;
      case 'cube': return <Box className="mb-2 text-emerald-500 group-hover:scale-110 transition-transform" />;
      case 'cylinder': return <div className="w-6 h-6 rounded-full border-2 border-amber-500 mb-2 group-hover:scale-110 transition-transform"></div>;
      default: return <Package className="mb-2 text-purple-500 group-hover:scale-110 transition-transform" />;
    }
  };

  return (
    <div className="w-screen h-screen flex flex-col md:flex-row overflow-hidden text-slate-200 font-sans">
      
      {/* 3D Canvas Area */}
      <div className="relative flex-grow h-2/3 md:h-full order-2 md:order-1">
        <Scene />
        
        {/* Top Overlay HUD */}
        <div className="absolute top-4 left-4 pointer-events-none">
          <div className="bg-slate-900/80 backdrop-blur border border-slate-700 p-4 rounded-lg shadow-xl text-sm max-w-xs">
            <h1 className="font-bold text-white text-lg mb-1">Spatial Configurator</h1>
            <p className="text-slate-400">Drag objects. Valid placements glow green. Invalid glow red.</p>
            <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
               <MousePointer2 size={12} />
               <span>Click to select</span>
            </div>
          </div>
        </div>

        {/* Validation Status Overlay */}
        {selectedObject && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 pointer-events-none">
             <div className={`
               px-6 py-3 rounded-full backdrop-blur shadow-2xl border flex items-center gap-3 transition-colors duration-300
               ${selectedObject.isValid 
                 ? 'bg-emerald-900/80 border-emerald-500/50 text-emerald-100' 
                 : 'bg-red-900/80 border-red-500/50 text-red-100'}
             `}>
               {selectedObject.isValid ? <CheckCircle size={20} /> : <AlertTriangle size={20} />}
               <span className="font-semibold">
                 {selectedObject.isValid ? 'Placement Valid' : 'Placement Invalid'}
               </span>
               {!selectedObject.isValid && selectedObject.violations && (
                 <span className="text-xs opacity-80 border-l border-white/20 pl-3 ml-1">
                   {selectedObject.violations[0]}
                 </span>
               )}
             </div>
          </div>
        )}
      </div>

      {/* Sidebar Controls */}
      <div className="w-full md:w-80 bg-slate-900 border-l border-slate-700 flex flex-col p-4 space-y-6 overflow-y-auto order-1 md:order-2 z-10 shadow-2xl">
        
        {/* Library */}
        <div>
          <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Library</h2>
          
          <div className="grid grid-cols-3 gap-2 mb-4">
            {library.map((item) => (
              <button 
                key={item.name}
                onClick={() => addObject(item.name)}
                className="flex flex-col items-center justify-center p-3 bg-slate-800 hover:bg-slate-700 rounded border border-slate-700 transition-colors group"
                title={item.name}
              >
                {getIcon(item.type)}
                <span className="text-xs truncate w-full text-center">{item.name}</span>
              </button>
            ))}
          </div>

          {/* Import Button */}
          <input 
            type="file" 
            accept=".glb" 
            ref={fileInputRef} 
            className="hidden" 
            onChange={handleFileUpload} 
          />
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="w-full py-2 bg-slate-800 border border-dashed border-slate-600 hover:border-blue-500 hover:text-blue-400 text-slate-400 rounded flex items-center justify-center gap-2 text-xs transition-colors"
          >
            <Upload size={14} /> Import GLB
          </button>
        </div>

        {/* Selected Object Properties */}
        {selectedObject ? (
          <div className="flex-grow">
            <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center justify-between">
              <span>Properties</span>
              <span className="text-blue-400 font-mono text-[10px]">{selectedObject.id.slice(0,8)}</span>
            </h2>
            
            <div className="bg-slate-800 rounded p-4 border border-slate-700 space-y-4">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Name</label>
                <div className="text-sm font-medium">{selectedObject.name}</div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                   <label className="text-xs text-slate-400 block mb-1">Width</label>
                   <div className="bg-slate-900 p-2 rounded text-xs font-mono">{selectedObject.dimensions.width.toFixed(2)}m</div>
                </div>
                <div>
                   <label className="text-xs text-slate-400 block mb-1">Height</label>
                   <div className="bg-slate-900 p-2 rounded text-xs font-mono">{selectedObject.dimensions.height.toFixed(2)}m</div>
                </div>
                <div>
                   <label className="text-xs text-slate-400 block mb-1">Depth</label>
                   <div className="bg-slate-900 p-2 rounded text-xs font-mono">{selectedObject.dimensions.depth.toFixed(2)}m</div>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-700">
                 <label className="text-xs text-slate-400 block mb-1">Position (Local)</label>
                 <div className="font-mono text-xs text-slate-300">
                    X: {selectedObject.position[0].toFixed(2)} <br/>
                    Y: {selectedObject.position[1].toFixed(2)} <br/>
                    Z: {selectedObject.position[2].toFixed(2)}
                 </div>
              </div>
              
              <div className="pt-2">
                 <button 
                   onClick={deleteSelected}
                   className="w-full py-2 bg-red-900/50 hover:bg-red-900 text-red-200 text-xs rounded border border-red-800 flex items-center justify-center gap-2 transition-colors"
                 >
                   <Trash2 size={14} /> Delete Object
                 </button>
              </div>
            </div>
          </div>
        ) : (
           <div className="flex-grow flex items-center justify-center text-slate-600 text-sm italic">
             Select an object to edit
           </div>
        )}

        {/* Scene Actions */}
        <div className="mt-auto pt-4 border-t border-slate-700">
          <button 
            onClick={resetScene}
            className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-600 flex items-center justify-center gap-2 transition-colors text-sm font-medium"
          >
            <RotateCcw size={16} /> Reset Scene
          </button>
        </div>

      </div>
    </div>
  );
};

export default App;