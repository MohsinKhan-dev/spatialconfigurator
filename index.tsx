import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Patch addEventListener to default scroll-blocking events to passive.
// This silences "[Violation] Added non-passive event listener" warnings
// caused by three-stdlib's OrbitControls/TransformControls.
const origAddEventListener = EventTarget.prototype.addEventListener;
const passiveEvents = new Set(['wheel', 'mousewheel', 'touchstart', 'touchmove']);
EventTarget.prototype.addEventListener = function (type: string, listener: any, options?: any) {
  if (passiveEvents.has(type) && options === undefined) {
    options = { passive: true };
  } else if (passiveEvents.has(type) && typeof options === 'object' && options !== null && options.passive === undefined) {
    options = { ...options, passive: true };
  }
  return origAddEventListener.call(this, type, listener, options);
};

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);