'use client';
// SyberLabs v2 atmosphere + Relay sigil. Mount only on the first-job empty state and the
// about/privacy pages; the runtime workbench stays calm ink. The kit modules are vendored
// unmodified in /vendor/syber and lazy-loaded so they never join the first-load bundle.
import { useEffect, useRef } from 'react';

const RELAY_ACCENT = '#62e3d8';

// One still exposure (the kit's reduced-motion path): the plate costs one frame instead of a
// continuous loop. The kit also refuses software WebGL, leaving the CSS nebula behind it.
export function AtlasAmbient() {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let plate: { destroy(): void } | undefined;
    let live = true;
    void import('../vendor/syber/syber-atmosphere.js').then(({ mount }) => {
      if (live && canvas.current)
        plate = mount(canvas.current, { mode: 'ambient', reduced: true });
    });
    return () => {
      live = false;
      plate?.destroy();
    };
  }, []);
  return (
    <div aria-hidden="true" className="atlas-ambient">
      <canvas className="atlas-canvas" ref={canvas} />
      <div className="atlas-scrim" />
    </div>
  );
}

export function RelaySigil({ size = 64 }: { size?: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let sigil: { cancel(): void } | undefined;
    let live = true;
    void import('../vendor/syber/syber-sigil.js').then(({ draw }) => {
      if (live && canvas.current)
        sigil = draw(canvas.current, 'relay', { color: RELAY_ACCENT });
    });
    return () => {
      live = false;
      sigil?.cancel();
    };
  }, []);
  return (
    <canvas
      aria-hidden="true"
      className="atlas-sigil"
      ref={canvas}
      style={{ width: size, height: size }}
    />
  );
}
