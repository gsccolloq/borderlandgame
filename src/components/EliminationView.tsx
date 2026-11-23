import { motion } from 'motion/react';
import { Flame, ArrowRight, Skull } from 'lucide-react';
import { getLocalPlayer, useGameStore } from '../store/gameStore';

export function EliminationView() {
  const room = useGameStore((s) => s.room);
  const playerId = useGameStore((s) => s.playerId);
  const launchRevival = useGameStore((s) => s.launchRevival);
  const nextPhase = useGameStore((s) => s.nextPhase);

  if (!room) return null;

  const me = getLocalPlayer(room, playerId);
  const eliminatedPlayers = room.players.filter(
    (p) => p.status === 'eliminated' || p.status === 'disqualified'
  );
  const canLaunchRevival =
    !room.isRevivalActive &&
    room.players.some((p) => p.status === 'eliminated' && !p.revivalUsed);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      className="max-w-3xl mx-auto border border-red-500/60 bg-[#12151C] p-6 sm:p-10 space-y-6"
    >
      <div className="flex items-center gap-3 text-red-400">
        <Skull className="w-6 h-6 shrink-0" />
        <span className="font-mono text-xs tracking-wider">
          GIAI ĐOẠN THANH TRỪNG · VISA CẠN KIỆT
        </span>
      </div>

      <div className="space-y-2">
        <h2 className="font-display text-4xl sm:text-5xl font-extrabold text-white tracking-tight">
          {me?.visa === 0 ? 'Visa Của Bạn Đã Chạm 0' : 'Người Chơi Bị Thanh Trừng'}
        </h2>
        <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
          {room.lastReveal?.dealerReaction || room.dealerMessage}
        </p>
      </div>

      {room.lastReveal && (
        <div className="border border-white/10 bg-[#090A0D] p-4 space-y-1.5">
          <p className="text-xs font-mono text-emerald-400">Phân tích Đáp án Chính xác</p>
          <p className="text-sm text-slate-200 leading-relaxed">{room.lastReveal.explanation}</p>
        </div>
      )}

      <div className="border-t border-white/10 pt-4 space-y-2">
        <p className="text-xs font-mono text-slate-400">
          Danh sách Bị loại ({eliminatedPlayers.length})
        </p>
        <div className="divide-y divide-white/10 border border-white/10 bg-[#090A0D]">
          {eliminatedPlayers.map((p) => (
            <div key={p.id} className="px-4 py-2.5 flex items-center justify-between text-sm">
              <span className="text-white font-medium">{p.name}</span>
              <span className="font-mono text-xs text-red-400">
                {p.status === 'disqualified' ? 'Bị truất quyền (Chống gian lận)' : 'Bị loại · 0 ngày Visa'}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="pt-2 flex flex-wrap items-center gap-3">
        {canLaunchRevival && (
          <button
            type="button"
            onClick={launchRevival}
            className="h-12 px-6 bg-red-600 hover:bg-red-500 text-white text-sm font-semibold flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Flame className="w-4 h-4" />
            <span>Mở Trò chơi Hồi sinh (A♥)</span>
          </button>
        )}
        <button
          type="button"
          onClick={nextPhase}
          className="h-12 px-6 border border-white/20 bg-[#1B1F2A] hover:bg-white hover:text-[#090A0D] text-white text-sm font-semibold flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <span>Tiếp tục tới Bảng xếp hạng</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </motion.div>
  );
}
