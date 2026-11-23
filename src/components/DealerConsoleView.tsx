import { useState } from 'react';
import {
  Cpu,
  Flame,
  Sparkles,
  Key,
  CheckCircle2,
  XCircle,
  AlertCircle,
  RefreshCw,
  Ban,
} from 'lucide-react';
import {
  ARENA_SUBJECTS,
  FSM_LABELS_VI,
  SUIT_META,
  getSubjectLabelVi,
  type CardSuit,
  type DealerLogEntry,
  type FsmState,
} from '../types/game';
import { useGameStore } from '../store/gameStore';
import { SuitIcon } from './SuitIcon';
import { ExcelQuestionManager } from './ExcelQuestionManager';
import { getStoredModel } from '../lib/geminiService';

const FSM_STATES: FsmState[] = [
  'Lobby',
  'Cutscene',
  'Question',
  'Result',
  'Elimination',
  'Leaderboard',
];

const ACTION_LABELS_VI: Record<DealerLogEntry['action'], string> = {
  briefing: 'CHỈ THỊ',
  escalate: 'TĂNG ĐỘ KHÓ',
  taunt: 'KHIÊU KHÍCH',
  revival: 'HỒI SINH',
  execution: 'THANH TRỪNG',
  violation: 'VI PHẠM',
};

export function DealerConsoleView() {
  const room = useGameStore((s) => s.room);
  const wsConnected = useGameStore((s) => s.wsConnected);
  const latencyMs = useGameStore((s) => s.latencyMs);
  const aiQuestionLoading = useGameStore((s) => s.aiQuestionLoading);
  const aiQuestionError = useGameStore((s) => s.aiQuestionError);
  const aiQuestionNotice = useGameStore((s) => s.aiQuestionNotice);
  const injectAiQuestion = useGameStore((s) => s.injectAiQuestion);
  const launchRevival = useGameStore((s) => s.launchRevival);
  const setActiveTab = useGameStore((s) => s.setActiveTab);
  const aiSteps = useGameStore((s) => s.aiSteps);
  const aiActiveModel = useGameStore((s) => s.aiActiveModel);
  const setGeminiModalOpen = useGameStore((s) => s.setGeminiModalOpen);

  const [subject, setSubject] = useState<string>(room?.subject || ARENA_SUBJECTS[0]);
  const [suit, setSuit] = useState<CardSuit>('diamonds');
  const [difficulty, setDifficulty] = useState<number>(8);

  const suits: CardSuit[] = ['spades', 'hearts', 'clubs', 'diamonds'];

  const handleForge = async (immediate: boolean) => {
    await injectAiQuestion({
      subject: room?.subject || subject,
      suit,
      difficulty,
      immediate,
    });
    if (immediate && room) {
      setActiveTab('arena');
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-white/10 pb-5">
        <div>
          <p className="font-mono text-xs text-slate-400">
            Quản trò AI · Điều phối Máy chủ Độc quyền
          </p>
          <h1 className="font-display text-4xl sm:text-5xl font-extrabold text-white tracking-tight mt-1">
            Bảng Điều Khiển Quản Trò
          </h1>
        </div>
        <div className="font-mono text-xs text-slate-400 tabular-nums flex items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 border ${wsConnected ? 'border-emerald-500/40 bg-emerald-950/30 text-emerald-400' : 'border-amber-500/40 bg-amber-950/30 text-amber-400'}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${wsConnected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
            <span>{wsConnected ? 'Đã kết nối Firestore' : 'Đang kết nối...'}</span>
          </span>
          <span>· Phòng: {room ? room.roomCode : 'Chưa tạo'}</span>
        </div>
      </div>

      {/* Finite State Machine Pipeline */}
      <section className="border border-white/10 bg-[#12151C] p-6 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <h2 className="font-display text-2xl font-bold text-white">
            Chuỗi Trạng thái Trò chơi (FSM)
          </h2>
          <span className="font-mono text-xs text-slate-400">
            Trạng thái hiện tại: {FSM_LABELS_VI[room?.fsmState ?? 'Lobby']}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
          {FSM_STATES.map((st, idx) => {
            const active = (room?.fsmState ?? 'Lobby') === st;
            return (
              <div
                key={st}
                className={`border p-3 font-mono text-xs ${
                  active
                    ? 'border-red-500 bg-red-950/35 text-white font-bold'
                    : 'border-white/10 bg-[#090A0D] text-slate-400'
                }`}
              >
                <span className="text-slate-500 mr-1.5">0{idx + 1}.</span>
                {FSM_LABELS_VI[st]}
              </div>
            );
          })}
        </div>
      </section>

      {/* AI Question Forge + Dealer Log */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Gemini Adaptive Trial Generator */}
        <section className="lg:col-span-6 border border-white/10 bg-[#12151C] p-6 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-2xl font-bold text-white">
                Rèn Lá bài Thử thách bằng AI
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Model hiện tại: <span className="font-mono text-red-400 font-bold">{aiActiveModel || getStoredModel()}</span> · Cơ chế Fallback đa tầng
              </p>
            </div>
            <button
              type="button"
              onClick={() => setGeminiModalOpen(true)}
              className="px-2.5 py-1.5 border border-red-500/50 bg-red-950/30 hover:bg-red-900/40 text-white text-[11px] font-mono flex items-center gap-1.5 shrink-0 transition-colors cursor-pointer"
            >
              <Key className="w-3.5 h-3.5 text-red-400" />
              <span>Đổi Key / Model</span>
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <label htmlFor="dealer-subject" className="block text-xs font-medium text-slate-300 mb-1.5">
                Lĩnh vực
              </label>
              <select
                id="dealer-subject"
                value={room?.subject || subject}
                disabled={Boolean(room)}
                onChange={(e) => setSubject(e.target.value)}
                className="w-full h-11 px-3.5 bg-[#090A0D] border border-white/15 text-sm text-white disabled:opacity-60"
              >
                {ARENA_SUBJECTS.map((s) => (
                  <option key={s} value={s}>
                    {getSubjectLabelVi(s)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <span className="block text-xs font-medium text-slate-300 mb-1.5">Chất bài</span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {suits.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSuit(s)}
                    className={`h-11 px-3 border flex items-center justify-center gap-2 text-xs font-semibold transition-colors cursor-pointer ${
                      suit === s
                        ? 'border-white bg-white text-[#090A0D]'
                        : 'border-white/15 bg-[#090A0D] text-slate-300 hover:border-white/40'
                    }`}
                  >
                    <SuitIcon suit={s} className="w-3.5 h-3.5" />
                    <span>{SUIT_META[s].label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between text-xs mb-1.5">
                <label htmlFor="dealer-diff" className="font-medium text-slate-300">
                  Độ khó Mục tiêu
                </label>
                <span className="font-mono tabular-nums text-white">{difficulty}/10</span>
              </div>
              <input
                id="dealer-diff"
                type="range"
                min={1}
                max={10}
                value={difficulty}
                onChange={(e) => setDifficulty(Number(e.target.value))}
                className="w-full accent-red-600 cursor-pointer"
              />
            </div>

            {/* Step-by-Step Progress & Status Pipeline per AI_Instructions.md */}
            {aiSteps.length > 0 && (
              <div className="border border-white/10 bg-[#090A0D] p-3.5 space-y-2.5">
                <div className="flex items-center justify-between text-[11px] font-mono">
                  <span className="text-slate-300 font-bold uppercase tracking-wider">
                    Tiến trình Rèn Thử Thách (Step Pipeline)
                  </span>
                  <span className="text-slate-400">
                    {aiSteps.filter((s) => s.status === 'completed').length}/{aiSteps.length} Hoàn tất
                  </span>
                </div>

                {/* Progress bar */}
                <div className="h-1.5 w-full bg-white/10 overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 ${
                      aiSteps.some((s) => s.status === 'error' || s.status === 'stopped')
                        ? 'bg-red-600'
                        : aiSteps.every((s) => s.status === 'completed')
                          ? 'bg-emerald-500'
                          : 'bg-red-500 animate-pulse'
                    }`}
                    style={{
                      width: `${
                        aiSteps.every((s) => s.status === 'completed')
                          ? 100
                          : Math.round(
                              (aiSteps.filter((s) => s.status === 'completed').length /
                                aiSteps.length) *
                                100
                            )
                      }%`,
                    }}
                  />
                </div>

                {/* Step Columns */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                  {aiSteps.map((step) => {
                    const isCompleted = step.status === 'completed';
                    const isInProgress = step.status === 'in_progress';
                    const isError = step.status === 'error';
                    const isStopped = step.status === 'stopped';

                    return (
                      <div
                        key={step.id}
                        className={`p-2.5 border text-xs space-y-1 ${
                          isCompleted
                            ? 'border-emerald-500/40 bg-emerald-950/20 text-emerald-200'
                            : isInProgress
                              ? 'border-red-500/50 bg-red-950/20 text-white ring-1 ring-red-500/40'
                              : isError
                                ? 'border-red-500 bg-red-950/40 text-red-200'
                                : isStopped
                                  ? 'border-red-500/40 bg-red-950/30 text-red-300'
                                  : 'border-white/10 bg-[#12151C] text-slate-500'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-mono text-[10px] text-slate-400 font-bold">
                            BƯỚC 0{step.id}
                          </span>
                          {isCompleted && (
                            <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-400">
                              <CheckCircle2 className="w-3 h-3" />
                              Hoàn tất
                            </span>
                          )}
                          {isInProgress && (
                            <span className="flex items-center gap-1 text-[10px] font-bold text-amber-400">
                              <RefreshCw className="w-3 h-3 animate-spin" />
                              Đang xử lý
                            </span>
                          )}
                          {isError && (
                            <span className="flex items-center gap-1 text-[10px] font-bold text-red-400">
                              <XCircle className="w-3 h-3" />
                              Lỗi API
                            </span>
                          )}
                          {isStopped && (
                            <span className="flex items-center gap-1 text-[10px] font-bold text-red-400">
                              <Ban className="w-3 h-3" />
                              Đã dừng do lỗi
                            </span>
                          )}
                          {!isCompleted && !isInProgress && !isError && !isStopped && (
                            <span className="text-[10px] text-slate-500">Chờ</span>
                          )}
                        </div>

                        <p className="font-semibold text-[11px] leading-tight text-white">
                          {step.name}
                        </p>

                        {step.detail && (
                          <p
                            className={`text-[10px] leading-snug break-words ${
                              isError || isStopped ? 'text-red-300 font-mono' : 'text-slate-400'
                            }`}
                          >
                            {step.detail}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Error Banner with Raw Error Code & Change Key Button */}
            {aiQuestionError && (
              <div className="border border-red-500 bg-red-950/40 p-4 space-y-2 text-xs text-red-200">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 font-bold text-red-300">
                    <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                    <span>LỖI PHÁT SINH TỪ GOOGLE GEMINI API</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setGeminiModalOpen(true)}
                    className="px-2.5 py-1 bg-red-600 hover:bg-red-500 text-white font-mono text-[10px] font-bold tracking-wider uppercase transition-colors cursor-pointer shrink-0"
                  >
                    Đổi API Key Ngay
                  </button>
                </div>
                <div className="font-mono text-[11px] p-2 bg-black/50 border border-red-500/30 text-red-200 break-all select-all">
                  {aiQuestionError}
                </div>
                <p className="text-[11px] text-slate-300">
                  Nếu lỗi là <code className="text-red-400">429 RESOURCE_EXHAUSTED</code>, hạn mức quota của key này đã hết. Vui lòng bấm <strong className="text-white">"Đổi API Key Ngay"</strong> và dán một key mới từ <a href="https://aistudio.google.com/api-keys" target="_blank" rel="noreferrer" className="underline text-red-300">Google AI Studio</a>.
                </p>
              </div>
            )}

            {aiQuestionNotice && (
              <div className="border border-emerald-500/40 bg-emerald-950/25 p-3 text-xs text-emerald-200">
                {aiQuestionNotice}
              </div>
            )}

            <div className="flex flex-wrap gap-3 pt-1">
              <button
                type="button"
                disabled={aiQuestionLoading}
                onClick={() => void handleForge(false)}
                className="h-11 px-5 bg-white hover:bg-slate-200 disabled:opacity-50 text-[#090A0D] text-xs font-semibold flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Sparkles className="w-4 h-4" />
                <span>{aiQuestionLoading ? 'Đang rèn lá bài...' : 'Tạo & Nạp vào Bộ bài'}</span>
              </button>

              {room && (room.fsmState === 'Lobby' || room.fsmState === 'Result') && (
                <button
                  type="button"
                  disabled={aiQuestionLoading}
                  onClick={() => void handleForge(true)}
                  className="h-11 px-5 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Cpu className="w-4 h-4" />
                  <span>Trình chiếu Ngay</span>
                </button>
              )}

              {room && room.players.some((p) => p.status === 'eliminated' && !p.revivalUsed) && (
                <button
                  type="button"
                  onClick={() => {
                    launchRevival();
                    setActiveTab('arena');
                  }}
                  className="h-11 px-4 border border-red-500/60 bg-red-950/30 hover:bg-red-600 text-white text-xs font-semibold flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Flame className="w-4 h-4" />
                  <span>Kích hoạt Hồi sinh</span>
                </button>
              )}
            </div>
          </div>
        </section>

        {/* Live Dealer Transcript */}
        <section className="lg:col-span-6 border border-white/10 bg-[#12151C] p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-2xl font-bold text-white">
              Nhật ký Điều phối của Quản trò
            </h2>
            <span className="font-mono text-xs text-slate-400">
              {room?.dealerLogs.length ?? 0} bản ghi
            </span>
          </div>

          <div className="border border-white/10 bg-[#090A0D] divide-y divide-white/10 max-h-[340px] overflow-y-auto">
            {room && room.dealerLogs.length > 0 ? (
              room.dealerLogs.map((log) => (
                <div key={log.id} className="p-3.5 space-y-1">
                  <div className="flex items-center justify-between text-[11px] font-mono text-slate-500">
                    <span>
                      {FSM_LABELS_VI[log.phase]} · {ACTION_LABELS_VI[log.action]}
                    </span>
                    <span className="tabular-nums">
                      {new Date(log.timestamp).toLocaleTimeString('vi-VN')}
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm text-slate-200 leading-relaxed">
                    {log.message}
                  </p>
                </div>
              ))
            ) : (
              <div className="p-8 text-center text-xs text-slate-500">
                Tạo hoặc tham gia một phòng Đấu trường để theo dõi chỉ thị trực tiếp từ Quản trò AI.
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Excel Question Upload & Question Bank Management */}
      <section>
        <ExcelQuestionManager
          onLoaded={(_count) => {
            // Optional callback
          }}
        />
      </section>
    </div>
  );
}
