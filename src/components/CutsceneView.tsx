import { useState } from 'react';
import { motion } from 'motion/react';
import { SUIT_META } from '../types/game';
import { useGameStore } from '../store/gameStore';
import { SuitIcon } from './SuitIcon';

const SPADES_CARD_ART = '/src/assets/images/suit_spades_card_1795409270964.jpg';
const HEARTS_CARD_ART = '/src/assets/images/suit_hearts_card_1795409273659.jpg';

export function CutsceneView() {
  const room = useGameStore((s) => s.room);
  const nextPhase = useGameStore((s) => s.nextPhase);
  const [imgFailed, setImgFailed] = useState(false);

  const q = room?.currentQuestion;
  if (!room || !q) return null;

  const meta = SUIT_META[q.suit];
  const cardImage =
    q.suit === 'spades' ? SPADES_CARD_ART : q.suit === 'hearts' ? HEARTS_CARD_ART : null;

  return (
    <div className="min-h-[70vh] flex items-center justify-center py-8">
      <div className="max-w-4xl w-full grid grid-cols-1 md:grid-cols-12 gap-8 items-center border border-white/10 bg-[#12151C] p-6 sm:p-10">
        {/* Animated Card Reveal */}
        <div className="md:col-span-5 flex justify-center">
          <motion.div
            initial={{ rotateY: 90, opacity: 0, scale: 0.9 }}
            animate={{ rotateY: 0, opacity: 1, scale: 1 }}
            transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
            className={`relative w-60 aspect-[3/4] border ${meta.borderClass} bg-[#090A0D] overflow-hidden flex flex-col justify-between p-5`}
          >
            {cardImage && !imgFailed ? (
              <>
                <img
                  src={cardImage}
                  alt={`Lá bài thử thách hệ ${meta.label}`}
                  referrerPolicy="no-referrer"
                  onError={() => setImgFailed(true)}
                  className="absolute inset-0 w-full h-full object-cover opacity-80"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#090A0D] via-[#090A0D]/30 to-[#090A0D]/60" />
              </>
            ) : (
              <div className="absolute inset-0 flex items-center justify-center opacity-15">
                <SuitIcon suit={q.suit} className="w-36 h-36" />
              </div>
            )}

            <div className="relative z-10 flex items-center justify-between">
              <span className="font-display text-4xl font-extrabold text-white tabular-nums">
                {q.cardRank}
              </span>
              <SuitIcon suit={q.suit} className="w-7 h-7" />
            </div>

            <div className="relative z-10 space-y-1">
              <p className={`font-mono text-xs ${meta.textClass}`}>
                {q.isRevival ? 'TRÒ CHƠI HỒI SINH' : `ĐỘ KHÓ ${q.difficulty}/10`}
              </p>
              <p className="font-display text-2xl font-bold text-white">
                {meta.label}
              </p>
              <p className="text-xs text-slate-300">{q.topic}</p>
            </div>
          </motion.div>
        </div>

        {/* Briefing Details */}
        <motion.div
          initial={{ opacity: 0, x: 18 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
          className="md:col-span-7 space-y-5"
        >
          <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-slate-400">
            <span>{q.isRevival ? 'Hồi sinh Sinh tử' : `Vòng ${q.roundNumber} / ${q.totalRounds}`}</span>
            <span aria-hidden="true">·</span>
            <span className={meta.textClass}>{meta.viLabel}</span>
            <span aria-hidden="true">·</span>
            <span>Giới hạn {Math.round(q.timeLimitMs / 1000)} giây</span>
          </div>

          <h2 className="font-display text-4xl sm:text-5xl font-extrabold text-white tracking-tight leading-none">
            {q.isRevival ? 'Kích hoạt Trò chơi Hồi sinh' : `Lá bài ${q.cardRank} ${meta.label}`}
          </h2>

          <p className="text-base text-slate-200 leading-relaxed">
            {room.dealerMessage}
          </p>

          <div className="border-t border-white/10 pt-4 flex items-center justify-between gap-4">
            <span className="text-xs font-mono text-slate-400">
              Đang mở khóa đấu trường thử thách...
            </span>
            <button
              type="button"
              onClick={nextPhase}
              className="px-4 py-2 border border-white/20 hover:bg-white hover:text-[#090A0D] text-xs font-semibold text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Vào ngay
            </button>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
