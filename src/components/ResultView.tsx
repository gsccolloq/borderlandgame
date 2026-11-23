import { motion } from 'motion/react';
import { ArrowRight, CheckCircle2, XCircle, Flame } from 'lucide-react';
import { SUIT_META } from '../types/game';
import { getLocalPlayer, useGameStore } from '../store/gameStore';
import { SuitIcon } from './SuitIcon';

const OPTION_KEYS = ['A', 'B', 'C', 'D'] as const;

export function ResultView() {
  const room = useGameStore((s) => s.room);
  const playerId = useGameStore((s) => s.playerId);
  const nextPhase = useGameStore((s) => s.nextPhase);
  const launchRevival = useGameStore((s) => s.launchRevival);

  const q = room?.currentQuestion;
  const reveal = room?.lastReveal;
  const me = getLocalPlayer(room, playerId);

  if (!room || !q || !reveal) return null;

  const meta = SUIT_META[q.suit];
  const totalVotes = Math.max(
    1,
    reveal.optionCounts.reduce((s, c) => s + c, 0)
  );
  const hasEligibleRevival =
    !room.isRevivalActive &&
    room.players.some((p) => p.status === 'eliminated' && !p.revivalUsed);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
      className="max-w-4xl mx-auto space-y-6"
    >
      {/* Personal Outcome Header */}
      <div
        className={`border p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
          me?.lastCorrect
            ? 'border-emerald-500/50 bg-emerald-950/20'
            : 'border-red-500/50 bg-red-950/20'
        }`}
      >
        <div className="flex items-start gap-3.5">
          {me?.lastCorrect ? (
            <CheckCircle2 className="w-7 h-7 text-emerald-400 shrink-0 mt-0.5" />
          ) : (
            <XCircle className="w-7 h-7 text-red-400 shrink-0 mt-0.5" />
          )}
          <div>
            <p className="font-mono text-xs text-slate-300">
              {q.cardRank} {meta.label} · Vòng {q.roundNumber}/{q.totalRounds}
            </p>
            <h2 className="font-display text-3xl font-extrabold text-white mt-0.5">
              {me?.lastCorrect ? 'Vượt qua Thử thách' : 'Bị Trừ Ngày Visa'}
            </h2>
            <p className="text-xs font-mono text-slate-300 mt-1 tabular-nums">
              Phản xạ: {Math.round(me?.lastResponseMs ?? 0)}ms · Điểm:{' '}
              {me?.lastScoreDelta ? `+${me.lastScoreDelta}` : '0'} · Visa:{' '}
              {(me?.lastVisaDelta ?? 0) >= 0 ? `+${me?.lastVisaDelta ?? 0}` : me?.lastVisaDelta} ngày
            </p>
          </div>
        </div>

        <div className="text-left sm:text-right font-mono tabular-nums">
          <p className="text-xs text-slate-400">Visa Còn lại</p>
          <p className={`text-3xl font-bold ${(me?.visa ?? 0) <= 1 ? 'text-red-400' : 'text-white'}`}>
            {me?.visa ?? 0} Ngày
          </p>
        </div>
      </div>

      {/* Answer Reveal & Distribution */}
      <div className="border border-white/10 bg-[#12151C] p-6 space-y-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <SuitIcon suit={q.suit} className="w-4 h-4" />
            <h3 className="font-display text-xl font-bold text-white">
              Công bố Đáp án Chính thức
            </h3>
          </div>
          <span className="font-mono text-xs tabular-nums text-slate-400">
            Tỷ lệ đúng phòng {Math.round(reveal.accuracyPct)}% · TB {Math.round(reveal.avgResponseMs)}ms
          </span>
        </div>

        <div className="space-y-2.5">
          {q.options.map((opt, idx) => {
            const isCorrect = idx === reveal.correctIndex;
            const count = reveal.optionCounts[idx];
            const pct = Math.round((count / totalVotes) * 100);
            return (
              <div
                key={idx}
                className={`border p-3.5 ${
                  isCorrect
                    ? 'border-emerald-500/60 bg-emerald-950/25'
                    : 'border-white/10 bg-[#090A0D]'
                }`}
              >
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className={isCorrect ? 'font-semibold text-white' : 'text-slate-300'}>
                    <strong className="font-mono mr-2">{OPTION_KEYS[idx]}.</strong>
                    {opt}
                  </span>
                  <span className="font-mono text-xs tabular-nums text-slate-400 whitespace-nowrap shrink-0">
                    {isCorrect ? 'Đáp án đúng · ' : ''}
                    {pct}% ({count})
                  </span>
                </div>
                <div className="mt-2 h-1.5 bg-white/5 overflow-hidden">
                  <div
                    style={{ width: `${pct}%` }}
                    className={`h-full ${isCorrect ? 'bg-emerald-500' : 'bg-slate-600'}`}
                  />
                </div>
              </div>
            );
          })}
        </div>

        <div className="border-t border-white/10 pt-4 space-y-2">
          <p className="text-xs font-mono text-slate-400">Giải thích</p>
          <p className="text-sm text-slate-200 leading-relaxed">{reveal.explanation}</p>
          {reveal.consensusAchieved && (
            <p className="text-xs font-mono text-emerald-400">
              Đạt Đồng thuận Chuồn (&gt;= 60% trả lời đúng): Người sống sót được cộng thưởng +1 ngày Visa.
            </p>
          )}
        </div>
      </div>

      {/* AI Dealer Real-Time Verdict */}
      <div className="border border-white/10 bg-[#12151C] p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-5">
        <div className="space-y-1.5 max-w-2xl">
          <p className="text-xs font-mono text-red-400">
            Quản trò AI ·{' '}
            {reveal.difficultyAction === 'escalate'
              ? `Tăng độ khó (${room.difficultyLevel}/10)`
              : reveal.difficultyAction === 'revival'
                ? 'Giao thức Hồi sinh Sẵn sàng'
                : 'Giám sát Thích ứng'}
          </p>
          <p className="text-sm sm:text-base text-white leading-relaxed">
            {reveal.dealerReaction}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          {hasEligibleRevival && (
            <button
              type="button"
              onClick={launchRevival}
              className="h-11 px-4 border border-red-500/60 bg-red-950/30 hover:bg-red-600 text-white text-xs font-semibold flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Flame className="w-4 h-4" />
              <span>Mở Trò chơi Hồi sinh</span>
            </button>
          )}
          <button
            type="button"
            onClick={nextPhase}
            className="h-11 px-5 bg-white hover:bg-slate-200 text-[#090A0D] text-sm font-semibold flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <span>
              {room.currentRound >= room.totalRounds ? 'Xem Bảng xếp hạng' : 'Vòng tiếp theo'}
            </span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}
