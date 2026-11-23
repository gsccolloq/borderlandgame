import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import { Download, Cpu, Key, AlertCircle } from 'lucide-react';
import { getLocalPlayer, useGameStore } from '../store/gameStore';
import { getSubjectLabelVi, type CardSuit, type TopicMetric } from '../types/game';
import { exportAnalyticsWorkbook } from '../lib/exportExcel';
import { SuitIcon } from './SuitIcon';

export function AnalyticsView() {
  const room = useGameStore((s) => s.room);
  const playerId = useGameStore((s) => s.playerId);
  const matchHistory = useGameStore((s) => s.matchHistory);
  const dealerReport = useGameStore((s) => s.dealerReport);
  const dealerReportLoading = useGameStore((s) => s.dealerReportLoading);
  const dealerReportError = useGameStore((s) => s.dealerReportError);
  const requestDealerAnalysis = useGameStore((s) => s.requestDealerAnalysis);
  const setGeminiModalOpen = useGameStore((s) => s.setGeminiModalOpen);

  const me = getLocalPlayer(room, playerId);
  const hasSessionData = Boolean(me && me.answerLog.length > 0);
  const latestHistory = matchHistory[0];

  // Compute Radar Metrics (Speed, Accuracy, Teamwork/Clubs, Logic/Diamonds, Psychology/Hearts)
  const calcSuitScore = (suit: CardSuit): number => {
    if (hasSessionData && me) {
      const st = me.suitStats[suit];
      return st.attempts > 0 ? Math.round((st.correct / st.attempts) * 100) : 0;
    }
    if (latestHistory) {
      if (suit === 'spades') return Math.round(latestHistory.spadesScore);
      if (suit === 'hearts') return Math.round(latestHistory.heartsScore);
      if (suit === 'clubs') return Math.round(latestHistory.clubsScore);
      return Math.round(latestHistory.diamondsScore);
    }
    return 0;
  };

  const totalAttempts = me?.answerLog.length ?? 0;
  const totalCorrect = me?.answerLog.filter((l) => l.isCorrect).length ?? 0;
  const overallAccuracy = hasSessionData
    ? Math.round((totalCorrect / Math.max(1, totalAttempts)) * 100)
    : latestHistory
      ? Math.round(latestHistory.accuracyPct)
      : 0;

  const avgResponseMs = hasSessionData && me
    ? Math.round(me.answerLog.reduce((s, l) => s + l.responseMs, 0) / Math.max(1, totalAttempts))
    : latestHistory
      ? Math.round(latestHistory.avgResponseMs)
      : 0;

  const speedIndex =
    avgResponseMs > 0 ? Math.max(10, Math.min(100, Math.round(100 - (avgResponseMs / 20000) * 85))) : 0;

  const radarData = [
    { axis: 'Tốc độ (♠)', score: Math.max(calcSuitScore('spades'), speedIndex) },
    { axis: 'Chính xác', score: overallAccuracy },
    { axis: 'Đồng thuận (♣)', score: calcSuitScore('clubs') },
    { axis: 'Logic (♦)', score: calcSuitScore('diamonds') },
    { axis: 'Tâm lý (♥)', score: calcSuitScore('hearts') },
  ];

  // Knowledge Gap Heatmap cells
  const topicMetrics: TopicMetric[] = me ? Object.values(me.topicStats) : [];

  const statusLabelVi = (status: string) => {
    if (status === 'survived') return 'SỐNG SÓT';
    if (status === 'disqualified') return 'TRUẤT QUYỀN';
    return 'BỊ LOẠI';
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-white/10 pb-5">
        <div>
          <p className="font-mono text-xs text-slate-400">
            Chẩn đoán Lý thuyết Trò chơi · Ma trận Năng lực
          </p>
          <h1 className="font-display text-4xl sm:text-5xl font-extrabold text-white tracking-tight mt-1">
            Thống Kê Sinh Tồn
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={dealerReportLoading}
            onClick={() => void requestDealerAnalysis()}
            className="h-10 px-4 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Cpu className="w-3.5 h-3.5" />
            <span>{dealerReportLoading ? 'Đang phân tích...' : 'Phân tích bằng AI'}</span>
          </button>
          <button
            type="button"
            onClick={() =>
              exportAnalyticsWorkbook({
                player: me,
                roomCode: room?.roomCode ?? 'THONG-KE',
                subject: room?.subject ?? latestHistory?.subject ?? 'Tổng hợp',
                history: matchHistory,
              })
            }
            className="h-10 px-4 border border-white/20 bg-[#12151C] hover:bg-white hover:text-[#090A0D] text-white text-xs font-semibold flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Xuất báo cáo Excel (.xlsx)</span>
          </button>
        </div>
      </div>

      {/* KPI Summary Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="border border-white/10 bg-[#12151C] p-5">
          <p className="text-xs font-mono text-slate-400">Độ chính xác Tổng</p>
          <p className="font-display text-4xl font-extrabold text-white tabular-nums mt-1">
            {overallAccuracy}%
          </p>
          <p className="text-xs text-slate-500 mt-1">
            {hasSessionData ? `Vượt qua ${totalCorrect}/${totalAttempts} thử thách` : 'Dữ liệu phiên gần nhất'}
          </p>
        </div>

        <div className="border border-white/10 bg-[#12151C] p-5">
          <p className="text-xs font-mono text-slate-400">Thời gian Phản xạ TB</p>
          <p className="font-display text-4xl font-extrabold text-white tabular-nums mt-1">
            {avgResponseMs}ms
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Đo chính xác tại máy chủ
          </p>
        </div>

        <div className="border border-white/10 bg-[#12151C] p-5">
          <p className="text-xs font-mono text-slate-400">Số dư Visa</p>
          <p className="font-display text-4xl font-extrabold text-emerald-400 tabular-nums mt-1">
            {me ? `${me.visa} ngày` : latestHistory ? `${latestHistory.finalVisa} ngày` : '—'}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Hạn mức sinh tồn còn lại
          </p>
        </div>

        <div className="border border-white/10 bg-[#12151C] p-5">
          <p className="text-xs font-mono text-slate-400">Vi phạm Chuyển Tab</p>
          <p className="font-display text-4xl font-extrabold text-white tabular-nums mt-1">
            {me ? me.tabSwitches : latestHistory ? latestHistory.tabSwitches : 0}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Giám sát Page Visibility
          </p>
        </div>
      </div>

      {/* Radar Chart + Knowledge Gap Heatmap */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Game Theory Competency Radar Chart */}
        <section className="lg:col-span-5 border border-white/10 bg-[#12151C] p-6 flex flex-col justify-between">
          <div>
            <h2 className="font-display text-2xl font-bold text-white">
              Biểu đồ Radar Năng lực
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Hồ sơ Lý thuyết Trò chơi đa trục gồm Tốc độ, Chính xác, Đồng thuận, Logic và Tâm lý.
            </p>
          </div>

          <div className="h-[300px] w-full mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart cx="50%" cy="50%" outerRadius="72%" data={radarData}>
                <PolarGrid stroke="rgba(255,255,255,0.12)" />
                <PolarAngleAxis
                  dataKey="axis"
                  tick={{ fill: '#CBD5E1', fontSize: 12, fontFamily: 'JetBrains Mono' }}
                />
                <PolarRadiusAxis
                  angle={90}
                  domain={[0, 100]}
                  tick={{ fill: '#64748B', fontSize: 10 }}
                  axisLine={false}
                />
                <Radar
                  name="Điểm năng lực"
                  dataKey="score"
                  stroke="#EF4444"
                  fill="#EF4444"
                  fillOpacity={0.28}
                  strokeWidth={2}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#090A0D',
                    borderColor: 'rgba(255,255,255,0.18)',
                    fontSize: '12px',
                    color: '#FFFFFF',
                  }}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* Knowledge Gap Heatmap */}
        <section className="lg:col-span-7 border border-white/10 bg-[#12151C] p-6 space-y-4">
          <div className="flex items-baseline justify-between gap-4">
            <div>
              <h2 className="font-display text-2xl font-bold text-white">
                Bản đồ Nhiệt Lỗ hổng Kiến thức
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Phát hiện các mảng kiến thức dễ tổn thương và tốc độ phản xạ chậm theo từng Chất bài.
              </p>
            </div>
            <span className="font-mono text-xs text-slate-400 tabular-nums">
              {topicMetrics.length} chủ đề đã theo dõi
            </span>
          </div>

          {topicMetrics.length === 0 ? (
            <div className="border border-white/10 bg-[#090A0D] p-10 text-center space-y-2">
              <p className="text-sm font-medium text-white">Chưa có Dữ liệu Thử thách</p>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                Tham gia và hoàn thành các vòng đấu trong Đấu trường để bản đồ nhiệt chỉ rõ vùng kiến thức hổng theo thời gian thực.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {topicMetrics.map((item) => {
                const acc = item.attempts > 0 ? Math.round((item.correct / item.attempts) * 100) : 0;
                const avgMs =
                  item.attempts > 0 ? Math.round(item.totalResponseMs / item.attempts) : 0;
                const severity =
                  acc < 50
                    ? {
                        label: 'Lỗ hổng Nghiêm trọng',
                        border: 'border-red-500/60',
                        bg: 'bg-red-950/35',
                        text: 'text-red-300',
                      }
                    : acc < 80
                      ? {
                          label: 'Rủi ro Trung bình',
                          border: 'border-amber-500/50',
                          bg: 'bg-amber-950/25',
                          text: 'text-amber-300',
                        }
                      : {
                          label: 'Đã làm chủ',
                          border: 'border-emerald-500/50',
                          bg: 'bg-emerald-950/25',
                          text: 'text-emerald-300',
                        };

                return (
                  <div
                    key={`${item.topic}-${item.suit}`}
                    className={`border ${severity.border} ${severity.bg} p-4 space-y-2`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-white truncate">
                        {item.topic}
                      </span>
                      <SuitIcon suit={item.suit} className="w-4 h-4 shrink-0" />
                    </div>
                    <div className="flex items-center justify-between text-xs font-mono tabular-nums">
                      <span className={severity.text}>
                        {severity.label} · {acc}%
                      </span>
                      <span className="text-slate-300">
                        {avgMs}ms · {item.correct}/{item.attempts}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* AI Dealer Game Theory Report */}
      <section className="border border-white/10 bg-[#12151C] p-6 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <h2 className="font-display text-2xl font-bold text-white">
            Chẩn đoán Lý thuyết Trò chơi từ Quản trò AI
          </h2>
          <span className="font-mono text-xs text-slate-400">Phân tích bởi Quản trò AI</span>
        </div>

        {dealerReportError && (
          <div className="border border-red-500 bg-red-950/40 p-4 space-y-2 text-xs text-red-200">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 font-bold text-red-300">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                <span>LỖI PHÂN TÍCH TỪ QUẢN TRÒ AI (GEMINI)</span>
              </div>
              <button
                type="button"
                onClick={() => setGeminiModalOpen(true)}
                className="px-2.5 py-1 bg-red-600 hover:bg-red-500 text-white font-mono text-[10px] font-bold tracking-wider uppercase transition-colors cursor-pointer shrink-0 flex items-center gap-1"
              >
                <Key className="w-3 h-3" />
                <span>Đổi API Key</span>
              </button>
            </div>
            <div className="font-mono text-[11px] p-2 bg-black/50 border border-red-500/30 text-red-200 break-all select-all">
              {dealerReportError}
            </div>
          </div>
        )}

        {dealerReport ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 pt-2">
            <div className="border border-white/10 bg-[#090A0D] p-5 space-y-2">
              <p className="font-mono text-xs text-red-400">Hình mẫu Chiến lược</p>
              <p className="font-display text-2xl font-bold text-white">{dealerReport.archetype}</p>
              <p className="text-xs text-slate-300 leading-relaxed">
                {dealerReport.strategicDiagnosis}
              </p>
            </div>
            <div className="border border-white/10 bg-[#090A0D] p-5 space-y-2">
              <p className="font-mono text-xs text-amber-400">Chỉ thị Lấp Lỗ hổng</p>
              <p className="text-sm text-slate-200 leading-relaxed">
                {dealerReport.knowledgeGapDirective}
              </p>
            </div>
            <div className="border border-white/10 bg-[#090A0D] p-5 space-y-2">
              <p className="font-mono text-xs text-slate-400">Phán quyết của Quản trò</p>
              <p className="text-sm text-white leading-relaxed italic">
                &ldquo;{dealerReport.dealerClosingScript}&rdquo;
              </p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-400">
            Nhấn <strong className="text-white">Phân tích bằng AI</strong> để Quản trò đánh giá khẩu vị rủi ro, chiến lược cân bằng tốc độ/chính xác và xuất chỉ thị lấp lỗ hổng kiến thức.
          </p>
        )}
      </section>

      {/* Cloud Match History */}
      {matchHistory.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-display text-2xl font-bold text-white">
            Lịch sử Phiên đấu Lưu trữ
          </h2>
          <div className="border border-white/10 bg-[#12151C] overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/10 text-xs font-mono text-slate-400">
                  <th className="py-3 px-4 font-medium">Mã phòng</th>
                  <th className="py-3 px-4 font-medium">Lĩnh vực</th>
                  <th className="py-3 px-4 font-medium">Kết quả</th>
                  <th className="py-3 px-4 font-medium text-right">Độ chính xác</th>
                  <th className="py-3 px-4 font-medium text-right">Tốc độ TB</th>
                  <th className="py-3 px-4 font-medium text-right">Điểm số</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10 text-sm">
                {matchHistory.map((m) => (
                  <tr key={m.id}>
                    <td className="py-3 px-4 font-mono text-white">{m.arenaCode}</td>
                    <td className="py-3 px-4 text-slate-300">{getSubjectLabelVi(m.subject)}</td>
                    <td className="py-3 px-4 font-mono text-xs">
                      <span className={m.status === 'survived' ? 'text-emerald-400' : 'text-red-400'}>
                        {statusLabelVi(m.status)} ({m.finalVisa} ngày)
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono tabular-nums text-right text-slate-200">
                      {Math.round(m.accuracyPct)}%
                    </td>
                    <td className="py-3 px-4 font-mono tabular-nums text-right text-slate-300">
                      {Math.round(m.avgResponseMs)}ms
                    </td>
                    <td className="py-3 px-4 font-mono tabular-nums font-bold text-right text-white">
                      {m.score.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
