import { Download, RotateCcw, BarChart3, Trophy } from 'lucide-react';
import { getLocalPlayer, useGameStore } from '../store/gameStore';
import { SUIT_META } from '../types/game';
import { exportAnalyticsWorkbook } from '../lib/exportExcel';
import { SuitIcon } from './SuitIcon';

export function LeaderboardView() {
  const room = useGameStore((s) => s.room);
  const playerId = useGameStore((s) => s.playerId);
  const user = useGameStore((s) => s.user);
  const firestoreLeaderboard = useGameStore((s) => s.firestoreLeaderboard);
  const matchHistory = useGameStore((s) => s.matchHistory);
  const startGame = useGameStore((s) => s.startGame);
  const leaveRoom = useGameStore((s) => s.leaveRoom);
  const setActiveTab = useGameStore((s) => s.setActiveTab);

  const me = getLocalPlayer(room, playerId);
  const sortedRoomPlayers = room
    ? [...room.players].sort((a, b) => b.score - a.score || b.visa - a.visa)
    : [];

  return (
    <div className="space-y-8">
      {/* Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-white/10 pb-5">
        <div>
          <p className="font-mono text-xs text-slate-400">
            Xếp hạng Sinh tồn · Đồng bộ Thời gian thực
          </p>
          <h1 className="font-display text-4xl sm:text-5xl font-extrabold text-white tracking-tight mt-1">
            Bảng Xếp Hạng Đấu Trường
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {room && (
            <>
              <button
                type="button"
                onClick={startGame}
                className="h-10 px-4 bg-red-600 hover:bg-red-500 text-white text-xs font-semibold flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Chơi lại</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('analytics')}
                className="h-10 px-4 border border-white/20 hover:bg-white hover:text-[#090A0D] text-white text-xs font-semibold flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <BarChart3 className="w-3.5 h-3.5" />
                <span>Xem Thống kê</span>
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() =>
              exportAnalyticsWorkbook({
                player: me,
                roomCode: room?.roomCode ?? 'GLOBAL',
                subject: room?.subject ?? 'Borderland Arena',
                history: matchHistory,
              })
            }
            className="h-10 px-4 border border-white/15 bg-[#12151C] hover:border-white/40 text-slate-200 text-xs font-semibold flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Xuất Excel</span>
          </button>
        </div>
      </div>

      {/* Current Room Standings */}
      {room && (
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-2xl font-bold text-white">
              Bảng điểm Phiên đấu ({room.roomCode})
            </h2>
            <button
              type="button"
              onClick={leaveRoom}
              className="text-xs font-medium text-slate-400 hover:text-white cursor-pointer"
            >
              Rời phòng
            </button>
          </div>

          <div className="border border-white/10 bg-[#12151C] overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/10 text-xs font-mono text-slate-400">
                  <th className="py-3 px-4 font-medium">Hạng</th>
                  <th className="py-3 px-4 font-medium">Người tham gia</th>
                  <th className="py-3 px-4 font-medium">Trạng thái</th>
                  <th className="py-3 px-4 font-medium text-right">Visa</th>
                  <th className="py-3 px-4 font-medium text-right">Tốc độ TB</th>
                  <th className="py-3 px-4 font-medium text-right">Điểm số</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10 text-sm">
                {sortedRoomPlayers.map((p, idx) => {
                  const avgMs =
                    p.answerLog.length > 0
                      ? Math.round(
                          p.answerLog.reduce((s, l) => s + l.responseMs, 0) / p.answerLog.length
                        )
                      : 0;
                  return (
                    <tr
                      key={p.id}
                      className={p.id === playerId ? 'bg-white/[0.04]' : undefined}
                    >
                      <td className="py-3.5 px-4 font-mono tabular-nums text-slate-300">
                        #{idx + 1}
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-white">
                        {p.name} {p.id === playerId ? '(Bạn)' : ''}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-xs">
                        <span
                          className={
                            p.status === 'active' || p.status === 'revived'
                              ? 'text-emerald-400'
                              : 'text-red-400'
                          }
                        >
                          {p.status === 'revived'
                            ? 'Đã hồi sinh'
                            : p.status === 'active'
                              ? 'Sống sót'
                              : p.status === 'disqualified'
                                ? 'Bị truất quyền'
                                : 'Bị loại'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-mono tabular-nums text-right text-slate-200">
                        {p.visa} ngày
                      </td>
                      <td className="py-3.5 px-4 font-mono tabular-nums text-right text-slate-300">
                        {avgMs}ms
                      </td>
                      <td className="py-3.5 px-4 font-mono tabular-nums font-bold text-right text-white">
                        {p.score.toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Global Firestore Leaderboard */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Trophy className="w-4 h-4 text-amber-400" />
            <h2 className="font-display text-2xl font-bold text-white">
              Sổ Vàng Sinh Tồn Toàn Cầu
            </h2>
          </div>
          <span className="font-mono text-xs text-slate-400">
            {user ? 'Đồng bộ Firestore Thời gian thực' : 'Đăng nhập để đồng bộ & xem bảng xếp hạng đám mây'}
          </span>
        </div>

        {!user ? (
          <div className="border border-white/10 bg-[#12151C] p-8 text-center space-y-2">
            <p className="text-sm font-medium text-white">
              Cần Đăng nhập Google để xem Sổ Vàng Sinh Tồn
            </p>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              Đăng nhập Google ở thanh điều hướng phía trên để đồng bộ điểm số, ngày Visa và xem bảng xếp hạng toàn cầu theo thời gian thực từ Firestore.
            </p>
          </div>
        ) : firestoreLeaderboard.length === 0 ? (
          <div className="border border-white/10 bg-[#12151C] p-8 text-center space-y-2">
            <p className="text-sm font-medium text-white">Chưa có Người sống sót nào được ghi danh</p>
            <p className="text-xs text-slate-400">
              Hoàn thành một phiên đấu trường để ghi tên lên bảng xếp hạng toàn cầu.
            </p>
          </div>
        ) : (
          <div className="border border-white/10 bg-[#12151C] overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/10 text-xs font-mono text-slate-400">
                  <th className="py-3 px-4 font-medium">Hạng</th>
                  <th className="py-3 px-4 font-medium">Người sống sót</th>
                  <th className="py-3 px-4 font-medium">Chất bài Sở trường</th>
                  <th className="py-3 px-4 font-medium text-right">Tỷ lệ sống sót</th>
                  <th className="py-3 px-4 font-medium text-right">Visa</th>
                  <th className="py-3 px-4 font-medium text-right">Tốc độ TB</th>
                  <th className="py-3 px-4 font-medium text-right">Điểm cao nhất</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10 text-sm">
                {firestoreLeaderboard.map((entry, idx) => (
                  <tr
                    key={entry.uid}
                    className={entry.uid === user.uid ? 'bg-white/[0.04]' : undefined}
                  >
                    <td className="py-3.5 px-4 font-mono tabular-nums text-slate-300">
                      #{idx + 1}
                    </td>
                    <td className="py-3.5 px-4 font-semibold text-white">
                      {entry.displayName}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="inline-flex items-center gap-1.5 text-xs font-mono text-slate-300">
                        <SuitIcon suit={entry.rankSuit} className="w-3.5 h-3.5" />
                        <span>{SUIT_META[entry.rankSuit].label}</span>
                      </span>
                    </td>
                    <td className="py-3.5 px-4 font-mono tabular-nums text-right text-slate-200">
                      {Math.round(entry.survivalRate)}%
                    </td>
                    <td className="py-3.5 px-4 font-mono tabular-nums text-right text-emerald-400">
                      {entry.visaBalance} ngày
                    </td>
                    <td className="py-3.5 px-4 font-mono tabular-nums text-right text-slate-300">
                      {Math.round(entry.avgResponseMs)}ms
                    </td>
                    <td className="py-3.5 px-4 font-mono tabular-nums font-bold text-right text-white">
                      {entry.bestScore.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
