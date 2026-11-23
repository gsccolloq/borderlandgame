import { useState, useEffect } from 'react';
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
  Play,
  Pause,
  Monitor,
  Clock,
  Trophy,
  ArrowRight,
  ShieldAlert,
  Sliders,
  Check,
} from 'lucide-react';
import {
  ARENA_SUBJECTS,
  FSM_LABELS_VI,
  SUIT_META,
  getSubjectLabelVi,
  type ArenaQuestion,
  type CardSuit,
  type DealerLogEntry,
  type FsmState,
} from '../types/game';
import { useGameStore, DEFAULT_VISA_EXTENSION_QUESTION } from '../store/gameStore';
import { SuitIcon } from './SuitIcon';
import { ExcelQuestionManager } from './ExcelQuestionManager';
import { forgeAdaptiveQuestionWithFallback, getStoredModel } from '../lib/geminiService';

const FSM_STATES: FsmState[] = [
  'Lobby',
  'Cutscene',
  'Question',
  'Result',
  'Elimination',
  'Leaderboard',
  'visa_extension_registration',
  'visa_extension_quiz',
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
  const aiQuestionLoading = useGameStore((s) => s.aiQuestionLoading);
  const aiQuestionError = useGameStore((s) => s.aiQuestionError);
  const aiQuestionNotice = useGameStore((s) => s.aiQuestionNotice);
  const injectAiQuestion = useGameStore((s) => s.injectAiQuestion);
  const launchRevival = useGameStore((s) => s.launchRevival);
  const setActiveTab = useGameStore((s) => s.setActiveTab);
  const aiSteps = useGameStore((s) => s.aiSteps);
  const aiActiveModel = useGameStore((s) => s.aiActiveModel);
  const setGeminiModalOpen = useGameStore((s) => s.setGeminiModalOpen);
  const startGame = useGameStore((s) => s.startGame);
  const nextPhase = useGameStore((s) => s.nextPhase);

  // Visa Extension & Projector Mode Actions
  const visaExtensionDraft = useGameStore((s) => s.visaExtensionDraft);
  const setVisaExtensionDraft = useGameStore((s) => s.setVisaExtensionDraft);
  const visaRewardDays = useGameStore((s) => s.visaRewardDays);
  const setVisaRewardDays = useGameStore((s) => s.setVisaRewardDays);
  const extensionRatio = useGameStore((s) => s.extensionRatio);
  const setExtensionRatio = useGameStore((s) => s.setExtensionRatio);
  const activateVisaExtension = useGameStore((s) => s.activateVisaExtension);
  const resumeGameAfterExtension = useGameStore((s) => s.resumeGameAfterExtension);
  const finishMatch = useGameStore((s) => s.finishMatch);
  const projectorModeOpen = useGameStore((s) => s.projectorModeOpen);
  const setProjectorModeOpen = useGameStore((s) => s.setProjectorModeOpen);

  // Local Form state for Visa Extension Question
  const [extPrompt, setExtPrompt] = useState(visaExtensionDraft.prompt);
  const [extOptions, setExtOptions] = useState<[string, string, string, string]>([
    visaExtensionDraft.options[0],
    visaExtensionDraft.options[1],
    visaExtensionDraft.options[2],
    visaExtensionDraft.options[3],
  ]);
  const [extCorrectIndex, setExtCorrectIndex] = useState(visaExtensionDraft.correctIndex);
  const [extExplanation, setExtExplanation] = useState(visaExtensionDraft.explanation);
  const [extAiGenerating, setExtAiGenerating] = useState(false);
  const [extSavedNotice, setExtSavedNotice] = useState<string | null>(null);

  // Sync draft from store if draft changes externally
  useEffect(() => {
    setExtPrompt(visaExtensionDraft.prompt);
    setExtOptions([
      visaExtensionDraft.options[0],
      visaExtensionDraft.options[1],
      visaExtensionDraft.options[2],
      visaExtensionDraft.options[3],
    ]);
    setExtCorrectIndex(visaExtensionDraft.correctIndex);
    setExtExplanation(visaExtensionDraft.explanation);
  }, [visaExtensionDraft]);

  const [subject, setSubject] = useState<string>(room?.subject || ARENA_SUBJECTS[0]);
  const [suit, setSuit] = useState<CardSuit>('diamonds');
  const [difficulty, setDifficulty] = useState<number>(8);

  const suits: CardSuit[] = ['spades', 'hearts', 'clubs', 'diamonds'];

  // Alive & Dead player calculations
  const players = room?.players || [];
  const alivePlayers = players.filter((p) => p.visa > 0 && p.status !== 'eliminated');
  const deadPlayers = players.filter((p) => p.visa <= 0 || p.status === 'eliminated');
  const calculatedMaxSlots = Math.max(1, Math.ceil(deadPlayers.length * (extensionRatio / 100)));

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

  const handleSaveExtensionDraft = () => {
    const updated: ArenaQuestion = {
      ...visaExtensionDraft,
      prompt: extPrompt.trim(),
      options: extOptions,
      correctIndex: extCorrectIndex,
      explanation: extExplanation.trim(),
    };
    setVisaExtensionDraft(updated);
    setExtSavedNotice('Đã lưu cấu hình Câu hỏi Gia hạn Visa thành công!');
    setTimeout(() => setExtSavedNotice(null), 3000);
  };

  const handleGenerateAiExtensionQuestion = async () => {
    setExtAiGenerating(true);
    setExtSavedNotice(null);
    try {
      const forged = await forgeAdaptiveQuestionWithFallback({
        subject: room?.subject || subject,
        suit: 'hearts',
        targetDifficulty: 9,
        playerStrengths: ['Thử thách Sinh Tử', 'Tâm lý Áp lực'],
      });
      setExtPrompt(forged.prompt);
      setExtOptions(forged.options);
      setExtCorrectIndex(forged.correctIndex);
      setExtExplanation(forged.explanation);

      setVisaExtensionDraft({
        ...forged,
        id: `ext-ai-${Date.now()}`,
        topic: 'Gia hạn Visa Sinh tử AI',
      });
      setExtSavedNotice('AI Quản trò đã rèn xong Câu hỏi Gia hạn Visa mới!');
      setTimeout(() => setExtSavedNotice(null), 3500);
    } catch (e) {
      console.error('Error generating AI extension question:', e);
    } finally {
      setExtAiGenerating(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-white/10 pb-5">
        <div>
          <p className="font-mono text-xs text-slate-400">
            Quản trò AI · Điều phối Máy chủ Độc quyền (Chủ phòng &amp; Admin)
          </p>
          <h1 className="font-display text-4xl sm:text-5xl font-extrabold text-white tracking-tight mt-1">
            Bảng Điều Khiển Quản Trò
          </h1>
        </div>
        <div className="font-mono text-xs text-slate-400 tabular-nums flex flex-wrap items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 border ${wsConnected ? 'border-emerald-500/40 bg-emerald-950/30 text-emerald-400' : 'border-amber-500/40 bg-amber-950/30 text-amber-400'}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${wsConnected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
            <span>{wsConnected ? 'Đã kết nối Firestore' : 'Đang kết nối...'}</span>
          </span>
          <span>· Phòng: {room ? room.roomCode : 'Chưa tạo'}</span>

          {room && (
            <button
              type="button"
              onClick={() => setProjectorModeOpen(true)}
              className="px-3 py-1 bg-red-600 hover:bg-red-500 text-white font-mono text-[11px] font-bold flex items-center gap-1.5 transition-colors cursor-pointer ml-1"
            >
              <Monitor className="w-3.5 h-3.5" />
              <span>Chế độ Trình chiếu</span>
            </button>
          )}
        </div>
      </div>

      {/* Finite State Machine Pipeline */}
      <section className="border border-white/10 bg-[#12151C] p-6 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <h2 className="font-display text-2xl font-bold text-white">
            Chuỗi Trạng thái Trò chơi (FSM)
          </h2>
          <span className="font-mono text-xs text-slate-400">
            Trạng thái hiện tại: <strong className="text-red-400">{FSM_LABELS_VI[room?.fsmState ?? 'Lobby']}</strong>
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
          {FSM_STATES.map((st, idx) => {
            const active = (room?.fsmState ?? 'Lobby') === st;
            return (
              <div
                key={st}
                className={`border p-2.5 font-mono text-[11px] ${
                  active
                    ? 'border-red-500 bg-red-950/40 text-white font-bold ring-1 ring-red-500'
                    : 'border-white/10 bg-[#090A0D] text-slate-400'
                }`}
              >
                <span className="text-slate-500 mr-1 block text-[10px]">0{idx + 1}.</span>
                <span className="leading-tight">{FSM_LABELS_VI[st]}</span>
              </div>
            );
          })}
        </div>
      </section>

      {/* MATCH CONTROL PANEL & LIVE OVERSEER */}
      <section className="border border-red-500/40 bg-[#12151C] p-5 sm:p-6 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-white/10 pb-4">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
              <h2 className="font-display text-2xl font-bold text-white">
                Bảng Điều Phối Trực Tiếp
              </h2>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              {room
                ? `Mã phòng: ${room.roomCode} · Trạng thái: ${FSM_LABELS_VI[room.fsmState]} · Tổng người chơi: ${players.length} người`
                : 'Chưa có phòng đấu đang hoạt động. Tạo phòng tại tab Đấu trường.'}
            </p>
          </div>

          {/* SỐNG vs CHẾT Live Badges */}
          <div className="flex items-center gap-3 font-mono text-xs">
            <div className="px-3 py-1.5 bg-emerald-950/60 border border-emerald-500/60 text-emerald-300 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>CÒN SỐNG: <strong className="text-white text-sm">{alivePlayers.length}</strong></span>
            </div>
            <div className="px-3 py-1.5 bg-red-950/60 border border-red-500/60 text-red-300 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-red-500" />
              <span>ĐÃ CHẾT: <strong className="text-white text-sm">{deadPlayers.length}</strong></span>
            </div>
          </div>
        </div>

        {/* Dynamic Controls based on FsmState */}
        <div className="flex flex-wrap items-center gap-3">
          {/* 1. START GAME (When Lobby) */}
          {room && room.fsmState === 'Lobby' && (
            players.length >= 1 ? (
              <button
                type="button"
                onClick={async () => {
                  await startGame();
                  setActiveTab('arena');
                }}
                className="h-12 px-6 bg-red-600 hover:bg-red-500 text-white text-xs font-bold tracking-wider uppercase flex items-center gap-2 transition-all shadow-[0_0_15px_rgba(239,68,68,0.4)] cursor-pointer whitespace-nowrap shrink-0"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>Bắt đầu Trận đấu ({players.length} người)</span>
              </button>
            ) : (
              <div className="h-12 px-4 border border-amber-500/50 bg-amber-950/30 text-amber-300 text-xs font-medium flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                <span>Cần ít nhất 1 người chơi trong phòng để bắt đầu</span>
              </div>
            )
          )}

          {/* 2. PAUSE & OPEN VISA EXTENSION (During Question) */}
          {room && room.fsmState === 'Question' && (
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 w-full border border-white/10 bg-[#090A0D] p-3.5">
              <div className="flex-1 space-y-1">
                <div className="flex items-center gap-2">
                  <Flame className="w-4 h-4 text-red-500 shrink-0" />
                  <span className="text-xs font-bold text-white">Vòng Gia Hạn Visa:</span>
                  <span className="font-mono text-xs text-amber-400 font-semibold">
                    {deadPlayers.length > 0
                      ? `Hiện có ${deadPlayers.length} người đã chết • Tỉ lệ ${extensionRatio}% = ${calculatedMaxSlots} suất nhanh nhất`
                      : 'Chưa có người chơi nào bị thanh trừng (Visa = 0)'}
                  </span>
                </div>
                <div className="flex items-center gap-3 pt-1">
                  <label htmlFor="ext-ratio-slider" className="text-[11px] text-slate-400 whitespace-nowrap">
                    Tỉ lệ suất ({extensionRatio}%):
                  </label>
                  <input
                    id="ext-ratio-slider"
                    type="range"
                    min={10}
                    max={100}
                    step={5}
                    value={extensionRatio}
                    onChange={(e) => setExtensionRatio(Number(e.target.value))}
                    className="w-36 accent-red-600 cursor-pointer"
                  />
                  <span className="text-[11px] font-mono text-slate-300">
                    Thưởng: +{visaRewardDays} Visa
                  </span>
                </div>
              </div>

              <button
                type="button"
                disabled={deadPlayers.length === 0}
                onClick={async () => {
                  await activateVisaExtension({
                    ratio: extensionRatio,
                    visaReward: visaRewardDays,
                    question: visaExtensionDraft,
                  });
                }}
                className={`h-11 px-5 text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                  deadPlayers.length > 0
                    ? 'bg-amber-600 hover:bg-amber-500 text-white shadow-[0_0_15px_rgba(245,158,11,0.4)]'
                    : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                }`}
              >
                <Pause className="w-4 h-4 fill-current" />
                <span>Tạm dừng &amp; Mở Gia hạn Visa</span>
              </button>
            </div>
          )}

          {/* 3. RESUME AFTER EXTENSION (During extension registration or quiz) */}
          {room && (room.fsmState === 'visa_extension_registration' || room.fsmState === 'visa_extension_quiz') && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 w-full border border-amber-500/50 bg-amber-950/20 p-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-amber-300 font-bold text-xs">
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                  <span>
                    {room.fsmState === 'visa_extension_registration'
                      ? 'Đang mở đăng ký đua tốc độ 10 giây...'
                      : 'Đang trong vòng thi câu hỏi Gia hạn Visa...'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-300">
                  Đã đăng ký: {room.registeredPlayers?.length || 0}/{room.visaExtensionConfig?.maxSlots || 1} người ·
                  Người trúng suất: {(room.qualifiedPlayerIds || []).length}
                </p>
              </div>

              <div className="flex items-center gap-2">
                {room.fsmState === 'visa_extension_registration' && (
                  <button
                    type="button"
                    onClick={() => useGameStore.getState().startVisaExtensionQuiz()}
                    className="h-10 px-4 bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer whitespace-nowrap"
                  >
                    Bắt đầu Thi Ngay
                  </button>
                )}

                <button
                  type="button"
                  onClick={async () => {
                    await resumeGameAfterExtension();
                  }}
                  className="h-10 px-5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Tiếp tục Trận đấu Chính</span>
                </button>
              </div>
            </div>
          )}

          {/* 4. RESULT -> NEXT PHASE */}
          {room && room.fsmState === 'Result' && (
            <button
              type="button"
              onClick={async () => {
                await nextPhase();
                setActiveTab('arena');
              }}
              className="h-12 px-6 bg-red-600 hover:bg-red-500 text-white text-xs font-bold tracking-wider uppercase flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap shrink-0"
            >
              <span>Chuyển Sang Vòng Tiếp Theo ({room.currentRound + 1}/{room.totalRounds})</span>
            </button>
          )}

          {/* Global Utility buttons for Host */}
          {room && (
            <>
              <button
                type="button"
                onClick={() => setProjectorModeOpen(true)}
                className="h-11 px-4 border border-red-500/50 bg-red-950/20 hover:bg-red-900/40 text-red-200 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <Monitor className="w-4 h-4" />
                <span>Mở Trình Chiếu</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('arena')}
                className="h-11 px-4 border border-white/20 hover:border-white/50 text-slate-200 hover:text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <span>Vào Đấu Trường</span>
              </button>

              <button
                type="button"
                onClick={() => finishMatch()}
                className="h-11 px-3 border border-white/10 hover:border-red-500/50 text-slate-400 hover:text-red-300 text-xs font-mono transition-colors cursor-pointer whitespace-nowrap shrink-0"
                title="Kết thúc trận đấu và niêm phong kết quả"
              >
                Kết thúc trận đấu
              </button>
            </>
          )}
        </div>
      </section>

      {/* VISA EXTENSION QUESTION MANAGEMENT (MỤC CÂU HỎI GIA HẠN VISA CỦA HOST) */}
      <section className="border border-white/10 bg-[#12151C] p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 border-b border-white/10 pb-4">
          <div>
            <div className="flex items-center gap-2 text-red-400 font-bold text-xs font-mono">
              <Flame className="w-4 h-4" />
              <span>CẤU HÌNH CÂU HỎI GIA HẠN VISA</span>
            </div>
            <h2 className="font-display text-2xl font-bold text-white mt-1">
              Câu Hỏi Gia Hạn Visa (Vòng Hồi Sinh)
            </h2>
            <p className="text-xs text-slate-400 mt-1 max-w-2xl leading-relaxed">
              Câu hỏi này hoàn toàn tách biệt với bộ câu hỏi chính của trận đấu. Khi Host bấm Tạm dừng &amp; Mở Gia hạn Visa, người chơi trúng suất sẽ giải quyết câu hỏi này để nhận số ngày Visa cấu hình bên dưới.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={extAiGenerating}
              onClick={handleGenerateAiExtensionQuestion}
              className="px-3.5 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{extAiGenerating ? 'AI Đang rèn...' : 'Rèn bằng AI (Gemini)'}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setExtPrompt(DEFAULT_VISA_EXTENSION_QUESTION.prompt);
                setExtOptions([...DEFAULT_VISA_EXTENSION_QUESTION.options]);
                setExtCorrectIndex(DEFAULT_VISA_EXTENSION_QUESTION.correctIndex);
                setExtExplanation(DEFAULT_VISA_EXTENSION_QUESTION.explanation);
                setVisaExtensionDraft(DEFAULT_VISA_EXTENSION_QUESTION);
                setExtSavedNotice('Đã tải câu hỏi mẫu mặc định!');
                setTimeout(() => setExtSavedNotice(null), 3000);
              }}
              className="px-3 py-2 border border-white/20 hover:border-white/50 text-slate-200 text-xs font-mono transition-colors cursor-pointer"
            >
              Chọn Mẫu Mặc Định
            </button>
          </div>
        </div>

        {extSavedNotice && (
          <div className="p-3 border border-emerald-500/50 bg-emerald-950/30 text-emerald-300 text-xs font-medium flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{extSavedNotice}</span>
          </div>
        )}

        {/* Extension Form Fields */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="lg:col-span-8 space-y-4">
            <div>
              <label htmlFor="ext-prompt" className="block text-xs font-medium text-slate-300 mb-1.5">
                Nội dung Câu hỏi Sinh tử
              </label>
              <textarea
                id="ext-prompt"
                rows={3}
                value={extPrompt}
                onChange={(e) => setExtPrompt(e.target.value)}
                placeholder="Nhập nội dung câu hỏi thử thách sinh tử..."
                className="w-full p-3 bg-[#090A0D] border border-white/15 text-sm text-white resize-none focus:border-red-500 outline-none"
              />
            </div>

            <div className="space-y-2.5">
              <span className="block text-xs font-medium text-slate-300">
                4 Lựa chọn &amp; Chọn Đáp án Đúng:
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {extOptions.map((opt, idx) => (
                  <div
                    key={idx}
                    className={`flex items-center gap-2 p-2 border ${
                      extCorrectIndex === idx
                        ? 'border-emerald-500 bg-emerald-950/20'
                        : 'border-white/10 bg-[#090A0D]'
                    }`}
                  >
                    <input
                      type="radio"
                      name="extCorrectOption"
                      id={`ext-opt-${idx}`}
                      checked={extCorrectIndex === idx}
                      onChange={() => setExtCorrectIndex(idx)}
                      className="accent-emerald-500 cursor-pointer w-4 h-4"
                    />
                    <label htmlFor={`ext-opt-${idx}`} className="font-mono text-xs text-slate-400 cursor-pointer font-bold">
                      {['A', 'B', 'C', 'D'][idx]}:
                    </label>
                    <input
                      type="text"
                      value={opt}
                      onChange={(e) => {
                        const copy = [...extOptions] as [string, string, string, string];
                        copy[idx] = e.target.value;
                        setExtOptions(copy);
                      }}
                      className="flex-1 bg-transparent border-none text-xs text-white outline-none"
                    />
                  </div>
                ))}
              </div>
            </div>

            <div>
              <label htmlFor="ext-expl" className="block text-xs font-medium text-slate-300 mb-1.5">
                Giải thích Đáp án
              </label>
              <input
                id="ext-expl"
                type="text"
                value={extExplanation}
                onChange={(e) => setExtExplanation(e.target.value)}
                placeholder="Giải thích ngắn gọn cho đáp án đúng..."
                className="w-full h-10 px-3 bg-[#090A0D] border border-white/15 text-xs text-white focus:border-red-500 outline-none"
              />
            </div>
          </div>

          <div className="lg:col-span-4 border border-white/10 bg-[#090A0D] p-4 space-y-4">
            <h3 className="font-mono text-xs font-bold text-white uppercase tracking-wider">
              Cấu hình Phần Thưởng
            </h3>

            <div>
              <label htmlFor="visa-reward-select" className="block text-xs text-slate-400 mb-1.5">
                Số ngày Visa cộng khi trả lời đúng:
              </label>
              <select
                id="visa-reward-select"
                value={visaRewardDays}
                onChange={(e) => setVisaRewardDays(Number(e.target.value))}
                className="w-full h-10 px-3 bg-[#12151C] border border-white/15 text-sm text-white font-mono"
              >
                <option value={1}>+1 Ngày Visa</option>
                <option value={2}>+2 Ngày Visa (Mặc định)</option>
                <option value={3}>+3 Ngày Visa</option>
                <option value={4}>+4 Ngày Visa</option>
                <option value={5}>+5 Ngày Visa (Hồi máu tối đa)</option>
              </select>
            </div>

            <div className="border-t border-white/10 pt-3 space-y-2">
              <span className="text-[11px] text-slate-400 block leading-snug">
                Khi lưu, câu hỏi này sẽ sẵn sàng xuất hiện ngay khi bạn bấm nút &quot;Tạm dừng &amp; Mở Gia hạn Visa&quot;.
              </span>

              <button
                type="button"
                onClick={handleSaveExtensionDraft}
                className="w-full h-11 bg-white hover:bg-slate-200 text-[#090A0D] text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer flex items-center justify-center gap-2"
              >
                <Check className="w-4 h-4" />
                <span>Lưu Câu Hỏi Gia Hạn</span>
              </button>
            </div>
          </div>
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

          <div className="border border-white/10 bg-[#090A0D] divide-y divide-white/10 max-h-[360px] overflow-y-auto">
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

      {/* =========================================================================
          STAGE PROJECTOR MODE MODAL (CHẾ ĐỘ TRÌNH CHIẾU SÂN KHẤU CỦA HOST)
          ========================================================================= */}
      {projectorModeOpen && room && (
        <div className="fixed inset-0 z-50 bg-[#090A0D] text-white flex flex-col p-6 sm:p-10 overflow-y-auto">
          {/* Top Projector Bar */}
          <div className="flex items-center justify-between border-b border-white/15 pb-4">
            <div className="flex items-center gap-3">
              <span className="w-3.5 h-3.5 rounded-full bg-red-600 animate-pulse" />
              <h1 className="font-display text-2xl sm:text-3xl font-black tracking-wider uppercase text-white">
                CHẾ ĐỘ TRÌNH CHIẾU ĐẤU TRƯỜNG · MÃ PHÒNG: <span className="text-red-500">{room.roomCode}</span>
              </h1>
            </div>

            <button
              type="button"
              onClick={() => setProjectorModeOpen(false)}
              className="px-4 py-2 border border-white/20 hover:border-white/50 text-xs font-mono font-bold uppercase transition-colors cursor-pointer"
            >
              Thoát Trình Chiếu (ESC)
            </button>
          </div>

          {/* Projector Big Counters: SỐNG vs CHẾT */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 my-8">
            <div className="border border-emerald-500 bg-emerald-950/30 p-6 text-center space-y-2">
              <span className="font-mono text-xs uppercase tracking-widest text-emerald-400 font-bold block">
                Người Chơi Còn Sống
              </span>
              <span className="font-display text-6xl font-black text-white tabular-nums">
                {alivePlayers.length}
              </span>
            </div>

            <div className="border border-red-500 bg-red-950/30 p-6 text-center space-y-2">
              <span className="font-mono text-xs uppercase tracking-widest text-red-400 font-bold block">
                Người Chơi Bị Thanh Trừng
              </span>
              <span className="font-display text-6xl font-black text-red-500 tabular-nums">
                {deadPlayers.length}
              </span>
            </div>

            <div className="border border-white/20 bg-[#12151C] p-6 text-center space-y-2">
              <span className="font-mono text-xs uppercase tracking-widest text-slate-400 font-bold block">
                Trạng Thái Trận Đấu
              </span>
              <span className="font-display text-2xl font-black text-amber-400 block pt-3">
                {FSM_LABELS_VI[room.fsmState]}
              </span>
            </div>
          </div>

          {/* VISA EXTENSION ACTIVE OVERLAY ON PROJECTOR */}
          {(room.fsmState === 'visa_extension_registration' || room.fsmState === 'visa_extension_quiz') && (
            <div className="border-2 border-red-500 bg-red-950/40 p-8 space-y-5 my-4 shadow-[0_0_50px_rgba(239,68,68,0.4)] animate-pulse">
              <div className="flex items-center justify-between">
                <span className="font-display text-2xl font-black text-white uppercase flex items-center gap-3">
                  <Flame className="w-8 h-8 text-red-500 animate-bounce" />
                  <span>VÒNG GIA HẠN VISA ĐANG DIỄN RA</span>
                </span>
                <span className="font-mono text-lg text-amber-300 font-bold">
                  {room.fsmState === 'visa_extension_registration' ? '10 Giây Đua Tốc Độ' : 'Vòng Thi Trả Lời'}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 bg-[#090A0D] border border-white/10 space-y-2">
                  <span className="font-mono text-xs text-slate-400 block">Danh Sách Giành Suất Nhanh Nhất:</span>
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {(room.registeredPlayers || []).map((r, i) => (
                      <div key={r.playerId} className="text-sm font-mono flex items-center justify-between text-slate-200">
                        <span>#{i + 1}. {r.name}</span>
                        <span className="text-xs text-emerald-400 font-bold">Đã giành suất</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="p-4 bg-[#090A0D] border border-white/10 space-y-2">
                  <span className="font-mono text-xs text-slate-400 block">Thông Báo Hồi Sinh Trực Tiếp:</span>
                  <div className="space-y-2">
                    {Object.entries(room.extensionSubmissions || {}).map(([plId, sub]) => {
                      const p = room.players.find((x) => x.id === plId);
                      return (
                        <div key={plId} className={`p-2 border text-xs font-mono font-bold flex items-center gap-2 ${
                          sub.isCorrect ? 'border-emerald-500 bg-emerald-950/50 text-emerald-300' : 'border-red-500 bg-red-950/50 text-red-300'
                        }`}>
                          {sub.isCorrect ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <XCircle className="w-4 h-4 text-red-400" />}
                          <span>{p?.name}: {sub.isCorrect ? '⚡ HỒI SINH THÀNH CÔNG!' : 'Thất bại'}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Quick Host Actions from Projector View */}
          <div className="mt-auto border-t border-white/15 pt-5 flex flex-wrap items-center justify-between gap-4">
            <span className="font-mono text-xs text-slate-400">
              Điều khiển Quản trò · Tự động đồng bộ thời gian thực 100%
            </span>

            <div className="flex items-center gap-3">
              {room.fsmState === 'Question' && (
                <button
                  type="button"
                  disabled={deadPlayers.length === 0}
                  onClick={() => activateVisaExtension({
                    ratio: extensionRatio,
                    visaReward: visaRewardDays,
                    question: visaExtensionDraft,
                  })}
                  className="h-11 px-5 bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white font-mono text-xs font-bold uppercase transition-colors cursor-pointer"
                >
                  Tạm Dừng &amp; Mở Gia Hạn Visa
                </button>
              )}

              {(room.fsmState === 'visa_extension_registration' || room.fsmState === 'visa_extension_quiz') && (
                <button
                  type="button"
                  onClick={() => resumeGameAfterExtension()}
                  className="h-11 px-6 bg-emerald-600 hover:bg-emerald-500 text-white font-mono text-xs font-bold uppercase transition-colors cursor-pointer"
                >
                  Tiếp Tục Trận Đấu Chính
                </button>
              )}

              <button
                type="button"
                onClick={() => finishMatch()}
                className="h-11 px-4 border border-red-500/60 hover:bg-red-950/50 text-red-300 font-mono text-xs font-bold transition-colors cursor-pointer"
              >
                Kết Thúc Trận Đấu
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
