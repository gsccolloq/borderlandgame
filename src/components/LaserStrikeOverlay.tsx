import { AnimatePresence, motion } from 'motion/react';

interface LaserStrikeOverlayProps {
  active: boolean;
}

export function LaserStrikeOverlay({ active }: LaserStrikeOverlayProps) {
  return (
    <AnimatePresence>
      {active && (
        <motion.div
          key="laser-strike"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="pointer-events-none fixed inset-0 z-50 overflow-hidden bg-red-950/35"
          aria-live="assertive"
        >
          {/* Vertical orbital targeting beam */}
          <motion.div
            initial={{ scaleY: 0, opacity: 0 }}
            animate={{ scaleY: [0, 1, 1, 0], opacity: [0, 1, 0.9, 0] }}
            transition={{ duration: 1.25, times: [0, 0.2, 0.72, 1], ease: [0.16, 1, 0.3, 1] }}
            style={{ originY: 0 }}
            className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-1.5 bg-red-500 shadow-[0_0_48px_16px_rgba(239,68,68,0.85)]"
          />

          {/* Horizontal execution sweep */}
          <motion.div
            initial={{ y: '-10vh', opacity: 0.95 }}
            animate={{ y: '110vh', opacity: [1, 1, 0] }}
            transition={{ duration: 0.95, ease: [0.7, 0, 0.84, 0] }}
            className="absolute inset-x-0 h-1 bg-red-400 shadow-[0_0_42px_14px_rgba(239,68,68,0.95)]"
          />

          {/* Center warning imprint */}
          <motion.div
            initial={{ scale: 1.15, opacity: 0 }}
            animate={{ scale: 1, opacity: [0, 1, 1, 0] }}
            transition={{ duration: 1.4, times: [0, 0.15, 0.75, 1] }}
            className="absolute inset-0 flex items-center justify-center"
          >
            <div className="border border-red-500 bg-[#090A0D]/90 px-8 py-5 text-center">
              <p className="font-mono text-xs tracking-widest text-red-400">
                VISA HẾT HẠN · GIAO THỨC THANH TRỪNG
              </p>
              <p className="font-display text-5xl md:text-6xl font-extrabold tracking-tight text-white mt-1">
                TIA LASER KHAI HỎA
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
