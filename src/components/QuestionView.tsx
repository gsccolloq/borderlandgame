import { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  AlertTriangle,
  Volume2,
  VolumeX,
  Mic,
  MicOff,
  Eye,
  CheckCircle2,
  XCircle,
  ArrowRight,
  Flame,
  Clock,
  Trophy,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';
import { SUIT_META, type CardSuit } from '../types/game';
import { getLocalPlayer, useGameStore } from '../store/gameStore';
import { audioEngine, triggerHaptic } from '../lib/audioEngine';
import { SuitIcon } from './SuitIcon';

const OPTION_KEYS = ['A', 'B', 'C', 'D'] as const;

export function QuestionView() {
  const room = useGameStore((s) => s.room);
  const playerId = useGameStore((s) => s.playerId);
  const userRole = useGameStore((s) => s.userRole);
  const setActiveTab = useGameStore((s) => s.setActiveTab);
  const wagerVisa = useGameStore((s) => s.wagerVisa);
  const setWagerVisa = useGameStore((s) => s.setWagerVisa);
  const audioEnabled = useGameStore((s) => s.audioEnabled);
  const voiceEnabled = useGameStore((s) => s.voiceEnabled);
  const toggleAudio = useGameStore((s) => s.toggleAudio);
  const toggleVoice = useGameStore((s) => s.toggleVoice);

  const submitIndividualAnswer = useGameStore((s) => s.submitIndividualAnswer);
  const advancePlayerQuestion = useGameStore((s) => s.advancePlayerQuestion);
  const registerForVisaExtension = useGameStore((s) => s.registerForVisaExtension);
  const submitVisaExtensionAnswer = useGameStore((s) => s.submitVisaExtensionAnswer);

  const me = getLocalPlayer(room, playerId);
  const isHostOrAdmin = Boolean(
    (room && room.hostPlayerId === playerId) || userRole === 'admin' || userRole === 'host'
  );

  // Deck resolution
  const deck = room?.fullDeck && room.fullDeck.length > 0
    ? room.fullDeck
    : (room?.currentQuestion ? [room.currentQuestion] : []);
  const currentIdx = me?.currentQuestionIndex ?? 0;
  const q = deck[currentIdx] || deck[0] || room?.currentQuestion;

  // Local state for instant individual answering
  const [draftOption, setDraftOption] = useState<number | null>(null);
  const [confirmedOption, setConfirmedOption] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [answerResult, setAnswerResult] = useState<{
    isCorrect: boolean;
    scoreDelta: number;
    visaDelta: number;
    newVisa: number;
    newScore: number;
    explanation: string;
  } | null>(null);
  const [remainingMs, setRemainingMs] = useState<number>(q?.timeLimitMs ?? 15000);
  const [showDealerHint, setShowDealerHint] = useState(false);
  const [autoAdvanceCount, setAutoAdvanceCount] = useState<number | null>(null);

  // Visa Extension local state
  const [regBusy, setRegBusy] = useState(false);
  const [regResult, setRegResult] = useState<{ success: boolean; rank?: number; reason?: string } | null>(null);
  const [extDraftOption, setExtDraftOption] = useState<number | null>(null);
  const [extConfirmed, setExtConfirmed] = useState<number | null>(null);
  const [extResult, setExtResult] = useState<{ isCorrect: boolean; visaReward: number } | null>(null);

  const timerRef = useRef<number | null>(null);
  const autoAdvanceIntervalRef = useRef<number | null>(null);
  const qIdRef = useRef<string | null>(null);

  // Reset local answer state whenever question changes
  useEffect(() => {
    if (q && q.id !== qIdRef.current) {
      qIdRef.current = q.id;
      setDraftOption(null);
      setConfirmedOption(null);
      setAnswerResult(null);
      setShowDealerHint(false);
      setAutoAdvanceCount(null);
      setRemainingMs(q.timeLimitMs || 15000);
      if (autoAdvanceIntervalRef.current) {
        clearInterval(autoAdvanceIntervalRef.current);
        autoAdvanceIntervalRef.current = null;
      }
    }
  }, [q?.id, q?.timeLimitMs]);

  // Personal 60 FPS countdown timer for active question
  useEffect(() => {
    if (!q || confirmedOption !== null || !room || room.fsmState !== 'Question') {
      audioEngine.stopHeartbeat();
      return;
    }

    const duration = q.timeLimitMs || 15000;
    const start = Date.now();
    let rafId = 0;

    const tick = () => {
      const elapsed = Date.now() - start;
      const left = Math.max(0, duration - elapsed);
      setRemainingMs(left);

      const ratio = left / duration;
      const lowVisaStress = me && me.visa <= 1 ? 0.55 : 0;
      const timeStress = ratio < 0.45 ? (0.45 - ratio) / 0.45 : 0;
      audioEngine.setHeartbeatIntensity(Math.max(lowVisaStress, timeStress));

      if (left > 0) {
        rafId = requestAnimationFrame(tick);
      } else {
        // Auto-lock on timer expiration
        handleLockAnswer(draftOption);
      }
    };

    rafId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafId);
      audioEngine.stopHeartbeat();
    };
  }, [q?.id, confirmedOption, room?.fsmState, draftOption, me?.visa]);

  // Keyboard shortcuts 1-4 for fast answering
  useEffect(() => {
    if (!q || confirmedOption !== null || room?.fsmState !== 'Question') return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const idx = ['1', '2', '3', '4'].indexOf(e.key);
      if (idx !== -1) {
        setDraftOption(idx);
        audioEngine.playTick();
        triggerHaptic('tap');
      } else if (e.key === 'Enter' && draftOption !== null) {
        handleLockAnswer(draftOption);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [q, draftOption, confirmedOption, room?.fsmState]);

  // Auto-advance countdown timer after answer is confirmed
  useEffect(() => {
    if (autoAdvanceCount === null) return;
    if (autoAdvanceCount <= 0) {
      handleNextQuestion();
      return;
    }
    const timer = setTimeout(() => {
      setAutoAdvanceCount((c) => (c !== null ? c - 1 : null));
    }, 1000);
    return () => clearTimeout(timer);
  }, [autoAdvanceCount]);

  // Confirm / Lock Answer
  const handleLockAnswer = async (optionIdx: number | null) => {
    if (confirmedOption !== null || isSubmitting || !q) return;
    setIsSubmitting(true);
    const chosen = optionIdx !== null ? optionIdx : (draftOption !== null ? draftOption : 0);
    setConfirmedOption(chosen);

    audioEngine.playLock();
    triggerHaptic('tap');

    const responseMs = Math.max(150, (q.timeLimitMs || 15000) - remainingMs);
    const res = await submitIndividualAnswer({
      optionIndex: chosen,
      responseMs,
      wagered: wagerVisa,
    });

    setIsSubmitting(false);

    if (res) {
      setAnswerResult(res);
      if (res.isCorrect) {
        audioEngine.playCorrect();
        triggerHaptic('success');
      } else {
        audioEngine.playWrong();
        triggerHaptic('error');
        if (res.newVisa === 0) {
          audioEngine.playLaserCharge();
        }
      }
      // Start 2-second auto advance
      setAutoAdvanceCount(2);
    }
  };

  // Advance to next question immediately
  const handleNextQuestion = () => {
    if (autoAdvanceIntervalRef.current) {
      clearInterval(autoAdvanceIntervalRef.current);
      autoAdvanceIntervalRef.current = null;
    }
    setAutoAdvanceCount(null);
    setConfirmedOption(null);
    setDraftOption(null);
    setAnswerResult(null);

    advancePlayerQuestion(currentIdx + 1);
  };

  if (!room) return null;

  // =========================================================================
  // VIEW A: TRÒ CHƠI TẠM DỪNG / ĐĂNG KÝ GIA HẠN VISA (10 GIÂY)
  // =========================================================================
  if (room.fsmState === 'visa_extension_registration') {
    const isAlive = me && me.visa > 0 && me.status !== 'eliminated';
    const endsAt = room.registrationEndsAt || (Date.now() + 10000);
    const remainingSec = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
    const maxSlots = room.visaExtensionConfig?.maxSlots || 1;
    const registered = room.registeredPlayers || [];
    const isRegistered = registered.some((r) => r.playerId === playerId);
    const myRank = registered.findIndex((r) => r.playerId === playerId) + 1;
    const isQualified = myRank > 0 && myRank <= maxSlots;

    return (
      <div className="max-w-3xl mx-auto space-y-6 px-4 py-8">
        {isAlive ? (
          // ALIVE PLAYER: FULL SCREEN PAUSE NOTICE
          <div className="border border-amber-500/50 bg-[#12151C] p-8 sm:p-12 text-center space-y-6 shadow-[0_0_30px_rgba(245,158,11,0.2)]">
            <div className="w-16 h-16 rounded-full bg-amber-500/20 border border-amber-500 flex items-center justify-center mx-auto animate-pulse">
              <Clock className="w-8 h-8 text-amber-400" />
            </div>
            <div className="space-y-2">
              <span className="font-mono text-xs text-amber-400 font-bold uppercase tracking-widest">
                Thông Báo Đấu Trường
              </span>
              <h1 className="font-display text-3xl sm:text-4xl font-extrabold text-white">
                TRÒ CHƠI ĐANG TẠM DỪNG
              </h1>
              <p className="text-slate-300 text-sm sm:text-base max-w-xl mx-auto leading-relaxed">
                Host đang mở <strong className="text-amber-400">Vòng Gia hạn Visa</strong> dành riêng cho những người chơi đã bị thanh trừng.
                Bạn vẫn đang an toàn với <strong className="text-emerald-400">{me.visa} ngày Visa</strong>. Vui lòng chờ trận đấu chính tiếp tục!
              </p>
            </div>

            <div className="border border-white/10 bg-[#090A0D] p-4 inline-flex items-center gap-3 font-mono text-xs text-slate-400">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
              <span>Đang chờ hoàn tất vòng Gia hạn ({remainingSec}s)...</span>
            </div>
          </div>
        ) : (
          // ELIMINATED PLAYER: 10-SECOND SPEED RUSH REGISTRATION
          <div className="border border-red-500 bg-[#12151C] p-6 sm:p-10 space-y-6 shadow-[0_0_35px_rgba(239,68,68,0.35)]">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-b border-white/10 pb-5">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-red-600/20 border border-red-500 flex items-center justify-center shrink-0">
                  <Flame className="w-6 h-6 text-red-500 animate-bounce" />
                </div>
                <div>
                  <span className="font-mono text-[11px] text-red-400 font-bold uppercase tracking-wider">
                    Cơ Hội Sống Sót Duy Nhất
                  </span>
                  <h2 className="font-display text-2xl sm:text-3xl font-extrabold text-white">
                    ĐUA TỐC ĐỘ GIA HẠN VISA
                  </h2>
                </div>
              </div>

              {/* Big 10s Timer */}
              <div className="border border-red-500/60 bg-red-950/40 px-5 py-2.5 text-center font-mono">
                <span className="text-[10px] text-red-300 block uppercase">Thời gian còn lại</span>
                <span className="text-3xl font-black text-red-400 tabular-nums animate-pulse">
                  0{remainingSec}s
                </span>
              </div>
            </div>

            <div className="space-y-3 text-sm text-slate-300 leading-relaxed">
              <p>
                Host vừa mở cơ hội hồi sinh với <strong className="text-white">+{room.visaExtensionConfig?.visaReward || 2} ngày Visa</strong>.
                Chỉ <strong className="text-red-400 font-bold">{maxSlots} người chơi nhanh tay nhất</strong> bấm xác nhận sẽ được tham gia trả lời câu hỏi sinh tử!
              </p>
              <div className="font-mono text-xs text-slate-400">
                Đã đăng ký: <span className="text-white font-bold">{registered.length}/{maxSlots} suất</span>
              </div>
            </div>

            {/* Registration Action or Status Feedback */}
            {isRegistered ? (
              <div className={`p-4 border text-sm font-medium flex items-center gap-3 ${
                isQualified
                  ? 'border-emerald-500 bg-emerald-950/40 text-emerald-200'
                  : 'border-red-500 bg-red-950/40 text-red-200'
              }`}>
                {isQualified ? (
                  <>
                    <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                    <div>
                      <p className="font-bold text-white">BẠN ĐÃ GIÀNH ĐƯỢC SUẤT THAM GIA! (Hạng {myRank}/{maxSlots})</p>
                      <p className="text-xs text-emerald-300">Vui lòng chờ hết 10 giây để bước vào câu hỏi Gia hạn Visa.</p>
                    </div>
                  </>
                ) : (
                  <>
                    <XCircle className="w-5 h-5 text-red-400 shrink-0" />
                    <div>
                      <p className="font-bold text-white">ĐÃ HẾT SUẤT THAM GIA VÒNG NÀY</p>
                      <p className="text-xs text-red-300">Bạn bấm sau {maxSlots} người nhanh hơn. Hãy chờ cơ hội tiếp theo hoặc xem Bảng xếp hạng.</p>
                    </div>
                  </>
                )}
              </div>
            ) : registered.length >= maxSlots ? (
              <div className="p-4 border border-red-500/50 bg-red-950/30 text-red-200 text-sm flex items-center gap-3">
                <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
                <span>Rất tiếc! Đã đủ {maxSlots} người nhanh nhất giành suất. Bạn chưa kịp đăng ký.</span>
              </div>
            ) : (
              <button
                type="button"
                disabled={regBusy}
                onClick={async () => {
                  setRegBusy(true);
                  const res = await registerForVisaExtension();
                  setRegBusy(false);
                  setRegResult(res);
                  triggerHaptic('success');
                }}
                className="w-full h-16 bg-red-600 hover:bg-red-500 text-white font-display text-lg font-extrabold tracking-wide uppercase flex items-center justify-center gap-3 transition-all shadow-[0_0_25px_rgba(239,68,68,0.5)] cursor-pointer"
              >
                <Flame className="w-6 h-6 fill-current" />
                <span>{regBusy ? 'Đang xác nhận...' : 'XÁC NHẬN THAM GIA GIA HẠN VISA NGAY'}</span>
              </button>
            )}

            {/* List of fast contenders */}
            {registered.length > 0 && (
              <div className="space-y-2 pt-2">
                <span className="font-mono text-xs text-slate-400">Danh sách người chơi giành suất sớm nhất:</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {registered.map((r, idx) => (
                    <div
                      key={r.playerId}
                      className={`px-3 py-2 border font-mono text-xs flex items-center justify-between ${
                        idx < maxSlots
                          ? 'border-emerald-500/40 bg-emerald-950/20 text-emerald-200'
                          : 'border-white/10 bg-[#090A0D] text-slate-500'
                      }`}
                    >
                      <span>#{idx + 1}. {r.name} {r.playerId === playerId ? '(Bạn)' : ''}</span>
                      <span className="text-[10px]">{idx < maxSlots ? 'ĐÃ GIÀNH SUẤT' : 'Hết suất'}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // =========================================================================
  // VIEW B: VÒNG THI GIA HẠN VISA (QUIZ)
  // =========================================================================
  if (room.fsmState === 'visa_extension_quiz') {
    const qualifiedIds = room.qualifiedPlayerIds || [];
    const isQualified = qualifiedIds.includes(playerId);
    const extQ = room.visaExtensionConfig?.question || room.currentQuestion;
    const visaReward = room.visaExtensionConfig?.visaReward || 2;
    const submissions = room.extensionSubmissions || {};
    const mySub = submissions[playerId];

    if (!isQualified || !extQ) {
      // Spectator view for alive or non-qualified players
      return (
        <div className="max-w-3xl mx-auto space-y-6 px-4 py-8">
          <div className="border border-white/15 bg-[#12151C] p-8 text-center space-y-5">
            <span className="font-mono text-xs text-red-400 font-bold uppercase tracking-wider">
              Trực Tiếp Từ Đấu Trường
            </span>
            <h2 className="font-display text-3xl font-extrabold text-white">
              VÒNG THI GIA HẠN VISA ĐANG DIỄN RA
            </h2>
            <p className="text-slate-300 text-sm max-w-lg mx-auto">
              Có <strong className="text-white">{qualifiedIds.length} người chơi</strong> đang trả lời câu hỏi sinh tử để giành lấy <strong className="text-emerald-400">+{visaReward} ngày Visa</strong>.
            </p>

            <div className="border border-white/10 bg-[#090A0D] divide-y divide-white/10 max-h-60 overflow-y-auto text-left">
              {qualifiedIds.map((qId) => {
                const p = room.players.find((pl) => pl.id === qId);
                const sub = submissions[qId];
                return (
                  <div key={qId} className="px-4 py-3 flex items-center justify-between text-xs font-mono">
                    <span className="text-slate-200 font-bold">{p?.name || 'Kẻ tham gia'}</span>
                    {sub ? (
                      sub.isCorrect ? (
                        <span className="text-emerald-400 font-bold flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          HỒI SINH THÀNH CÔNG (+{visaReward} Visa)
                        </span>
                      ) : (
                        <span className="text-red-400 font-bold flex items-center gap-1">
                          <XCircle className="w-3.5 h-3.5" />
                          Trả lời sai
                        </span>
                      )
                    ) : (
                      <span className="text-amber-400 animate-pulse">Đang làm bài...</span>
                    )}
                  </div>
                );
              })}
            </div>

            {isHostOrAdmin && (
              <button
                type="button"
                onClick={() => useGameStore.getState().resumeGameAfterExtension()}
                className="h-12 px-6 bg-red-600 hover:bg-red-500 text-white text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer"
              >
                Tiếp tục Trận đấu Chính
              </button>
            )}
          </div>
        </div>
      );
    }

    // QUALIFIED PLAYER: ANSWERING THE EXTENSION QUESTION
    return (
      <div className="max-w-3xl mx-auto space-y-6 px-4 py-8">
        <div className="border border-red-500 bg-[#12151C] p-6 sm:p-8 space-y-6 shadow-[0_0_30px_rgba(239,68,68,0.3)]">
          <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-4">
            <div className="flex items-center gap-2 text-xs font-mono text-red-400 font-bold">
              <Sparkles className="w-4 h-4" />
              <span>CÂU HỎI SINH TỬ · GIA HẠN VISA</span>
            </div>
            <span className="px-3 py-1 bg-emerald-950/60 border border-emerald-500/60 text-emerald-400 text-xs font-mono font-bold">
              Phần thưởng: +{visaReward} Ngày Visa
            </span>
          </div>

          <h2 className="text-xl sm:text-2xl font-semibold text-white leading-snug">
            {extQ.prompt}
          </h2>

          {/* Options */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {extQ.options.map((opt, idx) => {
              const isSelected = extDraftOption === idx;
              const locked = extConfirmed !== null;
              const isCorrectOpt = extResult && idx === extQ.correctIndex;
              const isWrongOpt = extResult && !extResult.isCorrect && extConfirmed === idx;

              return (
                <button
                  key={idx}
                  type="button"
                  disabled={locked}
                  onClick={() => {
                    setExtDraftOption(idx);
                    audioEngine.playTick();
                    triggerHaptic('tap');
                  }}
                  className={`min-h-[64px] p-4 text-left border transition-all flex items-start gap-3 cursor-pointer ${
                    isCorrectOpt
                      ? 'border-emerald-500 bg-emerald-950/60 text-emerald-100 shadow-[0_0_15px_rgba(16,185,129,0.3)]'
                      : isWrongOpt
                        ? 'border-red-500 bg-red-950/60 text-red-200'
                        : isSelected
                          ? 'border-white bg-white text-[#090A0D]'
                          : locked
                            ? 'border-white/10 bg-[#090A0D]/50 text-slate-500'
                            : 'border-white/15 bg-[#090A0D] text-slate-100 hover:border-white/50'
                  }`}
                >
                  <span className={`font-mono text-xs font-bold w-6 h-6 flex items-center justify-center border shrink-0 mt-0.5 ${
                    isSelected ? 'border-[#090A0D] bg-[#090A0D] text-white' : 'border-white/20 text-slate-300'
                  }`}>
                    {OPTION_KEYS[idx]}
                  </span>
                  <span className="text-sm font-medium">{opt}</span>
                </button>
              );
            })}
          </div>

          {/* Result Feedback */}
          {extResult ? (
            <div className={`p-4 border text-sm font-medium flex items-center gap-3 ${
              extResult.isCorrect
                ? 'border-emerald-500 bg-emerald-950/40 text-emerald-200'
                : 'border-red-500 bg-red-950/40 text-red-200'
            }`}>
              {extResult.isCorrect ? (
                <>
                  <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0" />
                  <div>
                    <p className="text-base font-bold text-white">HỒI SINH THÀNH CÔNG! BẠN ĐÃ NHẬN ĐƯỢC +{visaReward} NGÀY VISA!</p>
                    <p className="text-xs text-emerald-300 mt-1">Trạng thái của bạn đã trở lại bình thường. Vui lòng chờ Host tiếp tục trận đấu chính.</p>
                  </div>
                </>
              ) : (
                <>
                  <XCircle className="w-6 h-6 text-red-400 shrink-0" />
                  <div>
                    <p className="text-base font-bold text-white">RẤT TIẾC, ĐÁP ÁN CHƯA CHÍNH XÁC</p>
                    <p className="text-xs text-red-300 mt-1">Bạn không nhận được Visa và tiếp tục ở chế độ Quan sát.</p>
                  </div>
                </>
              )}
            </div>
          ) : (
            <button
              type="button"
              disabled={extDraftOption === null || extConfirmed !== null}
              onClick={async () => {
                if (extDraftOption === null) return;
                setExtConfirmed(extDraftOption);
                const res = await submitVisaExtensionAnswer(extDraftOption);
                if (res) {
                  setExtResult(res);
                  if (res.isCorrect) {
                    audioEngine.playCorrect();
                    triggerHaptic('success');
                  } else {
                    audioEngine.playWrong();
                    triggerHaptic('error');
                  }
                }
              }}
              className="w-full h-14 bg-red-600 hover:bg-red-500 disabled:opacity-40 text-white font-display text-base font-extrabold tracking-wide uppercase transition-all cursor-pointer shadow-[0_0_15px_rgba(239,68,68,0.4)]"
            >
              Chốt Đáp Án Gia Hạn Visa
            </button>
          )}
        </div>
      </div>
    );
  }

  // =========================================================================
  // VIEW C: HOÀN THÀNH TOÀN BỘ CÂU HỎI
  // =========================================================================
  if (me?.completedQuestions || (currentIdx >= deck.length && deck.length > 0)) {
    return (
      <div className="max-w-3xl mx-auto space-y-6 px-4 py-8">
        <div className="border border-emerald-500/50 bg-[#12151C] p-8 sm:p-12 text-center space-y-6 shadow-[0_0_35px_rgba(16,185,129,0.25)]">
          <div className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500 flex items-center justify-center mx-auto">
            <Trophy className="w-8 h-8 text-emerald-400" />
          </div>

          <div className="space-y-2">
            <span className="font-mono text-xs text-emerald-400 font-bold uppercase tracking-widest">
              Nhiệm Vụ Hoàn Tất
            </span>
            <h1 className="font-display text-3xl sm:text-4xl font-extrabold text-white">
              HOÀN THÀNH TOÀN BỘ THỬ THÁCH
            </h1>
            <p className="text-slate-300 text-sm sm:text-base max-w-xl mx-auto">
              Bạn đã hoàn thành toàn bộ <strong className="text-white">{deck.length}/{deck.length} câu hỏi</strong> của đấu trường. Đang chờ Quản trò và các người chơi khác hoàn tất để tổng kết kết quả.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-xl mx-auto font-mono text-xs">
            <div className="p-3 border border-white/10 bg-[#090A0D]">
              <span className="text-slate-400 block text-[10px]">Điểm Tổng</span>
              <span className="text-lg font-bold text-white">{me?.score ?? 0}</span>
            </div>
            <div className="p-3 border border-white/10 bg-[#090A0D]">
              <span className="text-slate-400 block text-[10px]">Visa Còn Lại</span>
              <span className="text-lg font-bold text-emerald-400">{me?.visa ?? 0} ngày</span>
            </div>
            <div className="p-3 border border-white/10 bg-[#090A0D]">
              <span className="text-slate-400 block text-[10px]">Chuỗi Kỷ Lục</span>
              <span className="text-lg font-bold text-amber-400">{me?.streak ?? 0}</span>
            </div>
            <div className="p-3 border border-white/10 bg-[#090A0D]">
              <span className="text-slate-400 block text-[10px]">Trạng Thái</span>
              <span className="text-lg font-bold text-emerald-300 uppercase">Sống Sót</span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setActiveTab('leaderboard')}
            className="h-12 px-8 bg-white hover:bg-slate-200 text-[#090A0D] text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer"
          >
            Xem Bảng Xếp Hạng Trực Tiếp
          </button>
        </div>
      </div>
    );
  }

  // =========================================================================
  // VIEW D: NGƯỜI CHƠI BỊ THANH TRỪNG (VISA <= 0)
  // =========================================================================
  if (me && (me.visa <= 0 || me.status === 'eliminated')) {
    return (
      <div className="max-w-3xl mx-auto space-y-6 px-4 py-8">
        <div className="border border-red-500 bg-[#12151C] p-8 sm:p-12 text-center space-y-6 shadow-[0_0_35px_rgba(239,68,68,0.3)]">
          <div className="w-16 h-16 rounded-full bg-red-600/20 border border-red-500 flex items-center justify-center mx-auto">
            <ShieldAlert className="w-8 h-8 text-red-500" />
          </div>

          <div className="space-y-2">
            <span className="font-mono text-xs text-red-400 font-bold uppercase tracking-widest">
              Tia Laser Đã Kích Hoạt
            </span>
            <h1 className="font-display text-3xl sm:text-4xl font-extrabold text-white">
              BẠN ĐÃ BỊ THANH TRỪNG
            </h1>
            <p className="text-slate-300 text-sm sm:text-base max-w-xl mx-auto leading-relaxed">
              Visa của bạn đã chạm mốc 0 ngày. Bạn đang ở chế độ Quan sát.
              Khi Host mở <strong className="text-red-400">Vòng Gia hạn Visa</strong>, bạn sẽ có đúng 10 giây để đua tốc độ giành suất hồi sinh!
            </p>
          </div>

          <button
            type="button"
            onClick={() => setActiveTab('leaderboard')}
            className="h-12 px-8 border border-white/20 hover:border-white/50 text-white text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer"
          >
            Xem Bảng Xếp Hạng
          </button>
        </div>
      </div>
    );
  }

  if (!q) return null;

  // =========================================================================
  // VIEW E: TIẾN TRÌNH CÂU HỎI CÁ NHÂN (CHỐT ĐÁP ÁN -> KẾT QUẢ NGAY -> QUA CÂU MỚI)
  // =========================================================================
  const meta = SUIT_META[q.suit];
  const progress = Math.max(0, Math.min(1, remainingMs / (q.timeLimitMs || 15000)));
  const criticalTime = progress < 0.32;
  const canWager = q.suit === 'hearts' && (me?.visa ?? 0) >= 2 && confirmedOption === null;

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
            Câu {currentIdx + 1}/{deck.length}
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
            aria-label={audioEnabled ? 'Tắt âm thanh' : 'Bật âm thanh'}
            className="p-2 border border-white/15 bg-[#090A0D] text-slate-300 hover:text-white cursor-pointer"
          >
            {audioEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4 text-slate-500" />}
          </button>
          <button
            type="button"
            onClick={toggleVoice}
            aria-label={voiceEnabled ? 'Tắt giọng nói' : 'Bật giọng nói'}
            className="p-2 border border-white/15 bg-[#090A0D] text-slate-300 hover:text-white cursor-pointer"
          >
            {voiceEnabled ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4 text-slate-500" />}
          </button>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs font-mono">
          <span className="text-slate-400">
            {q.topic} · {q.source === 'gemini' ? 'Thử thách AI Quản trò' : 'Bộ bài Đấu trường'}
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

      {/* Main Question Card */}
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
              Tiến độ của bạn: Câu {currentIdx + 1}/{deck.length}
            </span>
          </div>

          <h2 className="text-xl sm:text-2xl font-semibold text-white leading-snug">
            {q.prompt}
          </h2>
        </div>

        {/* Hearts Psychological Wager & Dealer Hint */}
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

        {/* 4 Ergonomic Option Buttons */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          {q.options.map((opt, idx) => {
            const isDraftSelected = draftOption === idx;
            const isConfirmed = confirmedOption === idx;
            const locked = confirmedOption !== null;

            const isCorrectAnswer = answerResult && idx === q.correctIndex;
            const isWrongPicked = answerResult && !answerResult.isCorrect && isConfirmed;

            return (
              <motion.button
                key={idx}
                type="button"
                whileTap={!locked ? { scale: 0.985 } : undefined}
                disabled={locked}
                onClick={() => {
                  if (locked) return;
                  setDraftOption(idx);
                  audioEngine.playTick();
                  triggerHaptic('tap');
                }}
                className={`min-h-[68px] p-4 text-left border transition-all flex items-start gap-3.5 cursor-pointer disabled:cursor-default ${
                  isCorrectAnswer
                    ? 'border-emerald-500 bg-emerald-950/60 text-emerald-100 shadow-[0_0_15px_rgba(16,185,129,0.3)]'
                    : isWrongPicked
                      ? 'border-red-500 bg-red-950/60 text-red-200'
                      : isDraftSelected
                        ? 'border-white bg-white text-[#090A0D]'
                        : locked
                          ? 'border-white/10 bg-[#090A0D]/60 text-slate-500'
                          : 'border-white/15 bg-[#090A0D] text-slate-100 hover:border-white/50 hover:bg-[#171B24]'
                }`}
              >
                <span
                  className={`font-mono text-xs font-bold w-7 h-7 flex items-center justify-center border shrink-0 mt-0.5 ${
                    isDraftSelected
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

        {/* ACTION ZONE: CHỐT ĐÁP ÁN -> CÔNG BỐ KẾT QUẢ NGAY -> QUA CÂU MỚI */}
        <div className="pt-2">
          {confirmedOption === null ? (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <span className="text-xs text-slate-400">
                {draftOption !== null
                  ? `Đã chọn đáp án [ ${OPTION_KEYS[draftOption]} ]. Bấm nút để chốt hoặc chọn lại đáp án khác.`
                  : 'Chạm chọn đáp án A, B, C, D (hoặc bấm phím 1–4)'}
              </span>

              <button
                type="button"
                disabled={draftOption === null || isSubmitting}
                onClick={() => handleLockAnswer(draftOption)}
                className="w-full sm:w-auto h-12 px-8 bg-red-600 hover:bg-red-500 disabled:opacity-40 text-white font-display text-sm font-extrabold tracking-wider uppercase flex items-center justify-center gap-2 transition-all shadow-[0_0_15px_rgba(239,68,68,0.4)] cursor-pointer whitespace-nowrap"
              >
                <span>{draftOption !== null ? `Chốt Đáp Án [ ${OPTION_KEYS[draftOption]} ]` : 'Chốt Đáp Án'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          ) : (
            // INSTANT RESULT BANNER & NEXT QUESTION BUTTON
            <AnimatePresence>
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-4"
              >
                {answerResult && (
                  <div
                    className={`p-4 border text-sm font-medium space-y-2 ${
                      answerResult.isCorrect
                        ? 'border-emerald-500 bg-emerald-950/40 text-emerald-100 shadow-[0_0_20px_rgba(16,185,129,0.25)]'
                        : 'border-red-500 bg-red-950/40 text-red-100 shadow-[0_0_20px_rgba(239,68,68,0.25)]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 font-bold text-base">
                        {answerResult.isCorrect ? (
                          <>
                            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                            <span>CHÍNH XÁC! (+{answerResult.scoreDelta} điểm · Visa an toàn)</span>
                          </>
                        ) : (
                          <>
                            <XCircle className="w-5 h-5 text-red-400 shrink-0" />
                            <span>SAI RỒI! ({answerResult.visaDelta} Visa)</span>
                          </>
                        )}
                      </div>
                      <span className="font-mono text-xs text-slate-300">
                        Visa hiện tại: <strong className={answerResult.newVisa <= 1 ? 'text-red-400' : 'text-emerald-400'}>{answerResult.newVisa} ngày</strong>
                      </span>
                    </div>

                    {answerResult.explanation && (
                      <p className="text-xs text-slate-200 leading-relaxed border-t border-white/10 pt-2">
                        <strong className="text-white">Giải thích:</strong> {answerResult.explanation}
                      </p>
                    )}
                  </div>
                )}

                <div className="flex items-center justify-between gap-4">
                  <span className="text-xs font-mono text-slate-400">
                    Tự động chuyển câu sau <strong className="text-white">{autoAdvanceCount ?? 2}s</strong>...
                  </span>

                  <button
                    type="button"
                    onClick={handleNextQuestion}
                    className="h-12 px-6 bg-white hover:bg-slate-200 text-[#090A0D] font-display text-sm font-extrabold tracking-wider uppercase flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap shadow-[0_0_15px_rgba(255,255,255,0.2)]"
                  >
                    <span>Qua Câu Tiếp Theo Ngay</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </motion.div>
            </AnimatePresence>
          )}
        </div>
      </motion.div>
    </div>
  );
}
