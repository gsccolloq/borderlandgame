import { useEffect, useRef } from 'react';

/**
 * Lightweight Canvas Film Grain + CSS CRT Scanlines overlay.
 * Pointer-events disabled so zero interaction overhead; throttled to low CPU budget.
 */
export function CrtOverlay() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Small offscreen grain texture scaled across viewport for 60 FPS efficiency on older devices
    const w = 160;
    const h = 160;
    canvas.width = w;
    canvas.height = h;
    const imgData = ctx.createImageData(w, h);
    const buf = imgData.data;

    let rafId = 0;
    let lastDraw = 0;

    const renderGrain = (ts: number) => {
      if (ts - lastDraw > 90) {
        lastDraw = ts;
        for (let i = 0; i < buf.length; i += 4) {
          const v = (Math.random() * 255) | 0;
          buf[i] = v;
          buf[i + 1] = v;
          buf[i + 2] = v;
          buf[i + 3] = 14;
        }
        ctx.putImageData(imgData, 0, 0);
      }
      rafId = requestAnimationFrame(renderGrain);
    };

    rafId = requestAnimationFrame(renderGrain);
    return () => cancelAnimationFrame(rafId);
  }, []);

  return (
    <div className="pointer-events-none fixed inset-0 z-40 overflow-hidden" aria-hidden="true">
      <div className="crt-scanlines absolute inset-0 opacity-35" />
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full opacity-40 mix-blend-overlay"
      />
    </div>
  );
}
