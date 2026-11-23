import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { AlertTriangle, Volume2, VolumeX, Mic, MicOff, Eye } from 'lucide-react';
import { SUIT_META } from '../types/game';
import { getLocalPlayer, useGameStore } from '../store/gameStore';
import { audioEngine } from '../lib/audioEngine';
import { SuitIcon } from './SuitIcon';

const OPTION_KEYS = ['A', 'B', 'C', 'D'] as const;

export function QuestionView() {
  const room = useGameStore((s) => s.room);
  const playerId = useGameStore((s) => s.playerId);
  const selectedOption = useGameStore((s) => s.selectedOption);
  const submitAnswer = useGameStore((s) => s.submitAnswer);
  const wagerVisa = useGameStore((s) => s.wagerVisa);
  const setWagerVisa = useGameStore((s) => s.setWagerVisa);
  const audioEnabled = useGameStore((s) => s.audioEnabled);
  const voiceEnabled = useGameStore((s) => s.voiceEnabled);
  const toggleAudio = useGameStore((s) => s.toggleAudio);
  const toggleVoice = useGameStore((s) => s.toggleVoice);

  const q = room?.currentQuestion;
  const me = getLocalPlayer(room, playerId);

  const [remainingMs, setRemainingMs] = useState<number>(q?.timeLimitMs ?? 15000);
  const [showDealerHint, setShowDealerHint] = useState(false);

  // 60 FPS GPU progress bar + escalating Howler heartbeat
  useEffect(() => {
    if (!q) return;
    setShowDealerHint(false);
    const deadline = q.startedAt + q.timeLimitMs;
    let rafId = 0;

    const tick = () => {
      const left = Math.max(0, deadline - Date.now());
      setRemainingMs(left);

      const ratio = left / q.timeLimitMs;
      const lowVisaStress = me && me.visa <= 1 ? 0.55 : 0;
      const timeStress = ratio < 0.45 ? (0.45 - ratio) / 0.45 : 0;
      audioEngine.setHeartbeatIntensity(Math.max(lowVisaStress, timeStress));

      if (left > 0) {
        rafId = requestAnimationFrame(tick);
      }
    };

    rafId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafId);
      audioEngine.stopHeartbeat();
    };
  }, [q?.id, q?.startedAt, q?.timeLimitMs, me?.visa]);

  // Keyboard shortcuts 1-4 for speed play
  useEffect(() => {
    if (!q || selectedOption !== null) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const idx = ['1', '2', '3', '4'].indexOf(e.key);
      if (idx !== -1) {
        submitAnswer(idx);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [q, selectedOption, submitAnswer]);

  if (!room || !q) return null;

  const meta = SUIT_META[q.suit];
  const progress = Math.max(0, Math.min(1, remainingMs / q.timeLimitMs));
  const criticalTime = progress < 0.32;
  const canParticipate = q.isRevival
    ? me?.status === 'eliminated' && !me.revivalUsed
    : me?.status === 'active' || me?.status === 'revived';
  const canWager = q.wagerAllowed && (me?.visa ?? 0) >= 2 && selectedOption === null && canParticipate;

  const answeredCount = room.players.filter((p) => p.hasAnsweredCurrent).length;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Compact Survival HUD Strip */}
      <div className="border border-white/10 bg-[#12151C] px-4 sm:px-6 py-3.5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-mono">
          <span className="flex items-center gap-1.5 font-bold text-white">
            <SuitIcon suit={q.suit} className="w-4 h-4" />
            <span>
              {q.cardRank} {meta.label}
            </span>
          </span>
          <span className="text-slate-600" aria-hidden="true">/</span>
          <span className="tabular-nums text-slate-300">
            {q.isRevival ? 'HỒI SINH' : `Vòng ${q.roundNumber}/${q.totalRounds}`}
          </span>
          <span className="text-slate-600" aria-hidden="true">/</span>
          <span className={`tabular-nums font-semibold ${(me?.visa ?? 0) <= 1 ? 'text-red-400' : 'text-emerald-400'}`}>
            Visa: {me?.visa ?? 0} {me?.visa === 1 ? 'ngày (Nguy kịch)' : 'ngày'}
          </span>
          <span className="text-slate-600" aria-hidden="true">/</span>
          <span className="tabular-nums text-slate-200">Điểm: {me?.score ?? 0}</span>
          <span className="text-slate-600" aria-hidden="true">/</span>
          <span className={`tabular-nums ${(me?.tabSwitches ?? 0) > 0 ? 'text-amber-400' : 'text-slate-400'}`}>
            Cảnh cáo Tab: {me?.tabSwitches ?? 0}/2
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleAudio}
            aria-label={audioEnabled ? 'Tắt hiệu ứng âm thanh' : 'Bật hiệu ứng âm thanh'}
            className="p-2 border border-white/15 bg-[#090A0D] text-slate-300 hover:text-white cursor-pointer"
          >
            {audioEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4 text-slate-500" />}
          </button>
          <button
            type="button"
            onClick={toggleVoice}
            aria-label={voiceEnabled ? 'Tắt giọng nói Quản trò' : 'Bật giọng nói Quản trò'}
            className="p-2 border border-white/15 bg-[#090A0D] text-slate-300 hover:text-white cursor-pointer"
          >
            {voiceEnabled ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4 text-slate-500" />}
          </button>
        </div>
      </div>

      {/* Liquid-Flowing 60 FPS GPU Neon Progress Bar */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs font-mono">
          <span className="text-slate-400">
            {q.topic} · {q.source === 'gemini' ? 'Thử thách Quản trò AI' : 'Bộ bài Đấu trường'}
          </span>
          <span
            className={`text-sm font-bold tabular-nums ${
              criticalTime ? 'text-red-400' : 'text-white'
            }`}
          >
            {(remainingMs / 1000).toFixed(1)}s
          </span>
        </div>
        <div className="relative h-2.5 w-full bg-[#1B1F2A] overflow-hidden border border-white/10">
          <div
            style={{
              transform: `scaleX(${progress})`,
              transformOrigin: 'left center',
              backgroundColor: criticalTime ? '#EF4444' : meta.color,
            }}
            className="relative h-full w-full overflow-hidden will-change-transform"
          >
            <div className="neon-liquid-shimmer absolute inset-y-0 left-0 w-[200%] bg-gradient-to-r from-transparent via-white/35 to-transparent" />
          </div>
        </div>
      </div>

      {/* Question Card */}
      <motion.div
        key={q.id}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        className="border border-white/15 bg-[#12151C] p-6 sm:p-8 space-y-6"
      >
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono text-slate-400">
            <span className={meta.textClass}>{meta.viLabel}</span>
            <span className="tabular-nums">
              Đã khóa đáp án: {answeredCount}/{room.players.length}
            </span>
          </div>

          <h2 className="text-xl sm:text-2xl font-semibold text-white leading-snug">
            {q.prompt}
          </h2>
        </div>

        {/* Hearts Psychological Modifiers: Wager & Dealer Hint */}
        {(q.wagerAllowed || q.dealerHint) && (
          <div className="border-t border-b border-white/10 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            {q.wagerAllowed && (
              <label className="flex items-center gap-3 text-xs text-slate-200 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={wagerVisa}
                  disabled={!canWager}
                  onChange={(e) => setWagerVisa(e.target.checked)}
                  className="w-4 h-4 accent-red-600 cursor-pointer"
                />
                <span>
                  <strong className="text-red-400">Cược Chất Cơ:</strong> Cược thêm 1 Visa (Đúng: x2 điểm &amp; +1 Visa · Sai: -2 Visa)
                </span>
              </label>
            )}

            {q.dealerHint && (
              <button
                type="button"
                onClick={() => setShowDealerHint((v) => !v)}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-300 hover:text-amber-200 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Eye className="w-3.5 h-3.5" />
                <span>{showDealerHint ? 'Ẩn lời thì thầm của Quản trò' : 'Nghe lời thì thầm của Quản trò'}</span>
              </button>
            )}
          </div>
        )}

        {showDealerHint && q.dealerHint && (
          <div className="border border-amber-500/35 bg-amber-950/20 p-3.5 text-xs text-amber-200 leading-relaxed">
            {q.dealerHint}
          </div>
        )}

        {!canParticipate && (
          <div className="border border-red-500/40 bg-red-950/25 p-4 flex items-center gap-3 text-xs text-red-200">
            <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
            <span>
              {q.isRevival
                ? 'Bạn vẫn còn Visa nên đang ở chế độ quan sát lượt Trò Chơi Hồi Sinh.'
                : 'Tài khoản của bạn đã bị loại khỏi lượt này. Đang ở chế độ quan sát.'}
            </span>
          </div>
        )}

        {/* Mobile-First Large Ergonomic Answer Grid (>= 60px touch target) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          {q.options.map((opt, idx) => {
            const isSelected = selectedOption === idx;
            const locked = selectedOption !== null || !canParticipate;
            return (
              <motion.button
                key={idx}
                type="button"
                whileTap={!locked ? { scale: 0.985 } : undefined}
                disabled={locked}
                onClick={() => submitAnswer(idx)}
                className={`min-h-[68px] p-4 text-left border transition-colors flex items-start gap-3.5 cursor-pointer disabled:cursor-default focus-visible:outline-2 focus-visible:outline-red-500 ${
                  isSelected
                    ? 'border-white bg-white text-[#090A0D]'
                    : locked
                      ? 'border-white/10 bg-[#090A0D]/60 text-slate-500'
                      : 'border-white/15 bg-[#090A0D] text-slate-100 hover:border-white/50 hover:bg-[#171B24]'
                }`}
              >
                <span
                  className={`font-mono text-xs font-bold w-7 h-7 flex items-center justify-center border shrink-0 mt-0.5 ${
                    isSelected
                      ? 'border-[#090A0D] bg-[#090A0D] text-white'
                      : 'border-white/20 text-slate-300'
                  }`}
                >
                  {OPTION_KEYS[idx]}
                </span>
                <span className="text-sm sm:text-base font-medium leading-snug">
                  {opt}
                </span>
              </motion.button>
            );
          })}
        </div>

        <div className="flex items-center justify-between text-xs text-slate-500 pt-1">
          <span>
            {selectedOption !== null
              ? `Đáp án ${OPTION_KEYS[selectedOption]} đã được khóa trên máy chủ. Đang chờ công bố...`
              : 'Nhấn phím 1–4 hoặc chạm ô đáp án để chốt lựa chọn'}
          </span>
          <span className="font-mono">Xác thực Máy chủ</span>
        </div>
      </motion.div>
    </div>
  );
}
