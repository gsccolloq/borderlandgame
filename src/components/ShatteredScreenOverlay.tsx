import { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ShieldAlert } from 'lucide-react';

interface ShatteredScreenOverlayProps {
  active: boolean;
  onReset: () => void;
}

export function ShatteredScreenOverlay({ active, onReset }: ShatteredScreenOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!active) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, w, h);
    const cx = w * 0.5;
    const cy = h * 0.44;

    // Radial fracture lines from impact point
    const spokes = 22;
    const spokeAngles: number[] = [];
    for (let i = 0; i < spokes; i++) {
      spokeAngles.push((i / spokes) * Math.PI * 2 + (Math.random() - 0.5) * 0.18);
    }

    ctx.strokeStyle = 'rgba(239, 68, 68, 0.72)';
    ctx.lineWidth = 1.6;
    spokeAngles.forEach((angle) => {
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      let r = 0;
      let currAngle = angle;
      while (r < Math.max(w, h)) {
        r += 45 + Math.random() * 80;
        currAngle += (Math.random() - 0.5) * 0.08;
        ctx.lineTo(cx + Math.cos(currAngle) * r, cy + Math.sin(currAngle) * r);
      }
      ctx.stroke();
    });

    // Concentric spiderweb rings
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.lineWidth = 1;
    [55, 120, 210, 340, 500].forEach((radius) => {
      ctx.beginPath();
      spokeAngles.forEach((angle, idx) => {
        const jitter = radius + (Math.random() - 0.5) * 28;
        const x = cx + Math.cos(angle) * jitter;
        const y = cy + Math.sin(angle) * jitter;
        if (idx === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.closePath();
      ctx.stroke();
    });
  }, [active]);

  return (
    <AnimatePresence>
      {active && (
        <motion.div
          key="shattered-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 bg-[#090A0D]/95 flex items-center justify-center p-6"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="shatter-title"
        >
          <canvas
            ref={canvasRef}
            className="pointer-events-none absolute inset-0 w-full h-full"
            aria-hidden="true"
          />

          <motion.div
            initial={{ scale: 0.92, y: 12 }}
            animate={{ scale: 1, y: 0 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="relative z-10 max-w-lg w-full border border-red-500 bg-[#12151C]/95 p-8 space-y-5"
          >
            <div className="flex items-center gap-3 text-red-400">
              <ShieldAlert className="w-6 h-6 shrink-0" />
              <span className="font-mono text-xs tracking-wider">
                CHỐNG GIAN LẬN · VI PHẠM CHUYỂN TAB QUÁ 2 LẦN
              </span>
            </div>

            <h2
              id="shatter-title"
              className="font-display text-4xl font-extrabold tracking-tight text-white"
            >
              Phiên Đấu Bị Hủy Bỏ Ngay Lập Tức
            </h2>

            <p className="text-sm text-slate-300 leading-relaxed">
              Hệ thống giám sát Page Visibility phát hiện bạn rời khỏi cửa sổ đấu trường quá 2 lần trong lượt thi.
              Toàn bộ Visa và điểm số phiên đấu hiện tại đã bị đưa về 0 để bảo vệ tính công bằng tuyệt đối.
            </p>

            <div className="pt-2 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={onReset}
                className="px-6 py-3 bg-red-600 hover:bg-red-500 text-white text-sm font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Quay lại Sảnh chờ
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
