import { useState, useEffect } from 'react';
import {
  Copy,
  Check,
  Play,
  Users,
  Volume2,
  VolumeX,
  Mic,
  MicOff,
  Shield,
  FileSpreadsheet,
  Link,
  AlertCircle,
  Sparkles,
} from 'lucide-react';
import {
  ARENA_SUBJECTS,
  FSM_LABELS_VI,
  SUIT_META,
  getSubjectLabelVi,
  type CardSuit,
} from '../types/game';
import { useGameStore } from '../store/gameStore';
import { SuitIcon } from './SuitIcon';
import { hasConnectedApiKey, forgeQuestionDeckFromTopic } from '../lib/geminiService';
import { GeminiSettingsModal } from './GeminiSettingsModal';

import arenaBackdrop from '../assets/images/arena_backdrop_1795409273443.jpg';
import dealerEmblem from '../assets/images/dealer_emblem_1795409271275.jpg';

const ARENA_BACKDROP = arenaBackdrop;
const DEALER_EMBLEM = dealerEmblem;

export function LobbyView() {
  const room = useGameStore((s) => s.room);
  const playerId = useGameStore((s) => s.playerId);
  const playerName = useGameStore((s) => s.playerName);
  const setPlayerName = useGameStore((s) => s.setPlayerName);
  const user = useGameStore((s) => s.user);
  const userRole = useGameStore((s) => s.userRole);
  const createRoom = useGameStore((s) => s.createRoom);
  const joinRoom = useGameStore((s) => s.joinRoom);
  const startGame = useGameStore((s) => s.startGame);
  const leaveRoom = useGameStore((s) => s.leaveRoom);
  const roomError = useGameStore((s) => s.roomError);
  const clearRoomError = useGameStore((s) => s.clearRoomError);
  const liveArenas = useGameStore((s) => s.liveArenas);
  const wsConnected = useGameStore((s) => s.wsConnected);
  const latencyMs = useGameStore((s) => s.latencyMs);
  const audioEnabled = useGameStore((s) => s.audioEnabled);
  const voiceEnabled = useGameStore((s) => s.voiceEnabled);
  const toggleAudio = useGameStore((s) => s.toggleAudio);
  const toggleVoice = useGameStore((s) => s.toggleVoice);
  const setActiveTab = useGameStore((s) => s.setActiveTab);
  const customDeck = useGameStore((s) => s.customDeck);

  const isHostOrAdmin = userRole === 'admin' || userRole === 'host';
  const isHostOfCurrentRoom = room && (room.hostPlayerId === playerId || userRole === 'admin');

  const [subject, setSubject] = useState<string>('');
  const [joinCode, setJoinCode] = useState('');
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [backdropFailed, setBackdropFailed] = useState(false);
  const [emblemFailed, setEmblemFailed] = useState(false);

  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  const [aiProgressMsg, setAiProgressMsg] = useState('');
  const [showMissingKeyWarning, setShowMissingKeyWarning] = useState(false);
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);

  // Auto-detect room parameter from URL (?room=BL-XXXX or ?code=BL-XXXX)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const roomParam = urlParams.get('room') || urlParams.get('code');
      if (roomParam) {
        setJoinCode(roomParam.toUpperCase().trim());
      }
    }
  }, []);

  const handleCopyCode = () => {
    if (!room) return;
    navigator.clipboard?.writeText(room.roomCode).catch(() => {});
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 1800);
  };

  const handleCopyLink = () => {
    if (!room) return;
    const directUrl = `${window.location.origin}/?room=${room.roomCode}`;
    navigator.clipboard?.writeText(directUrl).catch(() => {});
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 1800);
  };

  const handleHostCreateRoom = async () => {
    const currentSubject = subject.trim() || 'Thử thách Trí tuệ Sinh tồn';

    // Trường hợp 1: Host đã tải file Excel lên -> Dùng trực tiếp bộ câu hỏi Excel
    if (customDeck && customDeck.length > 0) {
      await createRoom(currentSubject, customDeck);
      return;
    }

    // Trường hợp 2: Host không tải file Excel -> Dùng Gemini AI sinh bộ câu hỏi theo đúng chủ đề
    const hasKey = hasConnectedApiKey();
    if (hasKey) {
      try {
        setIsGeneratingAi(true);
        setAiProgressMsg('AI đang soạn bộ câu hỏi bám sát chủ đề...');
        const generatedDeck = await forgeQuestionDeckFromTopic({
          topicPrompt: currentSubject,
          count: 8,
          onProgress: (msg) => setAiProgressMsg(msg),
        });
        await createRoom(currentSubject, generatedDeck);
      } catch (err: unknown) {
        console.error('Lỗi khi AI soạn đề:', err);
        setAiProgressMsg(err instanceof Error ? err.message : 'Lỗi không xác định khi gọi AI.');
        setShowMissingKeyWarning(true);
      } finally {
        setIsGeneratingAi(false);
      }
      return;
    }

    // Trường hợp 3: Chưa có Excel và chưa có API Key -> Hiện cảnh báo rõ ràng
    setShowMissingKeyWarning(true);
  };

  const handleProceedWithoutAi = async () => {
    setShowMissingKeyWarning(false);
    const currentSubject = subject.trim() || 'Thử thách Trí tuệ Sinh tồn';
    await createRoom(currentSubject);
  };

  const suits: CardSuit[] = ['spades', 'hearts', 'clubs', 'diamonds'];

  return (
    <div className="space-y-10">
      {/* Main Hero & Entry Split */}
      <section className="relative border border-white/10 bg-[#12151C] overflow-hidden">
        <div className="grid grid-cols-1 lg:grid-cols-12 items-stretch">
          {/* Left Visual Arena Showcase */}
          <div className="lg:col-span-7 relative min-h-[340px] lg:min-h-[460px] flex flex-col justify-between p-6 sm:p-10 bg-[#0D1016]">
            {!backdropFailed ? (
              <img
                src={ARENA_BACKDROP}
                alt="Đấu trường bê tông ngầm sinh tồn Borderland"
                referrerPolicy="no-referrer"
                onError={() => setBackdropFailed(true)}
                className="absolute inset-0 w-full h-full object-cover opacity-55"
              />
            ) : (
              <div className="absolute inset-0 bg-gradient-to-br from-[#151A24] via-[#0E1117] to-[#1A0D10]" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-[#090A0D] via-[#090A0D]/70 to-[#090A0D]/30" />

            <div className="relative z-10 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 text-xs font-mono text-slate-300">
                <span>Giao thức Sinh tồn</span>
                <span aria-hidden="true">/</span>
                <span className={wsConnected ? 'text-emerald-400 font-semibold flex items-center gap-1.5' : 'text-amber-400'}>
                  <span className={`w-1.5 h-1.5 rounded-full ${wsConnected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
                  <span>{wsConnected ? 'Đã kết nối Firestore' : 'Đang kết nối...'}</span>
                </span>
                <span aria-hidden="true">/</span>
                <span>Chống gian lận: Bật</span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={toggleAudio}
                  aria-label={audioEnabled ? 'Tắt hiệu ứng âm thanh' : 'Bật hiệu ứng âm thanh'}
                  className="p-2 border border-white/15 bg-[#090A0D]/80 text-slate-200 hover:border-white/40 transition-colors cursor-pointer"
                >
                  {audioEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4 text-slate-500" />}
                </button>
                <button
                  type="button"
                  onClick={toggleVoice}
                  aria-label={voiceEnabled ? 'Tắt giọng nói Quản trò' : 'Bật giọng nói Quản trò'}
                  className="p-2 border border-white/15 bg-[#090A0D]/80 text-slate-200 hover:border-white/40 transition-colors cursor-pointer"
                >
                  {voiceEnabled ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4 text-slate-500" />}
                </button>
              </div>
            </div>

            <div className="relative z-10 space-y-4 max-w-xl mt-12">
              <div className="flex items-center gap-3">
                {!emblemFailed ? (
                  <img
                    src={DEALER_EMBLEM}
                    alt="Biểu tượng bốn chất bài của Quản trò Borderland"
                    referrerPolicy="no-referrer"
                    onError={() => setEmblemFailed(true)}
                    className="w-12 h-12 object-cover border border-white/20 shrink-0"
                  />
                ) : (
                  <div className="w-12 h-12 border border-white/20 bg-[#1B1F2A] flex items-center justify-center shrink-0">
                    <Shield className="w-5 h-5 text-red-400" />
                  </div>
                )}
                <p className="text-xs font-mono text-slate-300">
                  Sinh tồn Tri thức Thời gian thực · Hệ thống Thanh trừng Visa
                </p>
              </div>

              <h1 className="font-display text-5xl sm:text-6xl font-extrabold tracking-tight text-white leading-[0.98]">
                Borderland Quiz Arena
              </h1>

              <p className="text-sm sm:text-base text-slate-300 leading-relaxed max-w-lg">
                Mỗi Người chơi khởi đầu với đúng 3 ngày Visa. Trả lời sai sẽ bị trừ Visa; chạm 0 sẽ kích hoạt
                tia laser thanh trừng ngay lập tức. Toàn bộ đáp án bị niêm phong trên máy chủ và Quản trò AI trực tiếp điều phối độ khó theo từng nhịp thở.
              </p>
            </div>
          </div>

          {/* Right Action Panel: Either Create/Join or Active Room Lobby */}
          <div className="lg:col-span-5 border-t lg:border-t-0 lg:border-l border-white/10 bg-[#12151C] p-6 sm:p-8 flex flex-col justify-between gap-6">
            {!room ? (
              <div className="space-y-6">
                <div>
                  <div className="flex items-center gap-2">
                    {isHostOrAdmin ? (
                      <span className="px-2 py-0.5 bg-emerald-950/60 border border-emerald-500/40 text-[10px] font-mono font-semibold text-emerald-300 uppercase tracking-wide">
                        {userRole === 'admin' ? 'Quyền Admin' : 'Quyền Chủ phòng'}
                      </span>
                    ) : userRole === 'pending' ? (
                      <span className="px-2 py-0.5 bg-amber-950/60 border border-amber-500/40 text-[10px] font-mono font-semibold text-amber-300 uppercase tracking-wide">
                        Chờ cấp quyền
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 bg-blue-950/60 border border-blue-500/40 text-[10px] font-mono font-semibold text-blue-300 uppercase tracking-wide">
                        Người chơi Ẩn danh
                      </span>
                    )}
                  </div>
                  <h2 className="font-display text-2xl font-bold text-white mt-1">
                    {isHostOrAdmin ? 'Khởi Tạo & Quản Trò' : 'Tham Gia Đấu Trường'}
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">
                    {isHostOrAdmin
                      ? 'Tạo phòng sinh tồn mới, nạp câu hỏi từ Excel hoặc nhập mã đấu trường để tham chiến.'
                      : 'Người chơi ẩn danh không cần đăng nhập Gmail. Chỉ cần nhập tên hiển thị và mã phòng để bước vào đấu trường.'}
                  </p>
                </div>

                {roomError && (
                  <div className="border border-red-500/50 bg-red-950/30 p-3 flex items-center justify-between gap-3">
                    <p className="text-xs text-red-200">{roomError}</p>
                    <button
                      type="button"
                      onClick={clearRoomError}
                      className="text-xs text-red-300 hover:text-white cursor-pointer"
                    >
                      Đóng
                    </button>
                  </div>
                )}

                {/* If user logged in but pending host role */}
                {user && userRole === 'pending' && (
                  <div className="p-3 border border-amber-500/40 bg-amber-950/30 text-amber-200 text-xs flex items-start gap-2.5">
                    <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <p>
                      Tài khoản của bạn đang chờ Quản trị viên cấp quyền Chủ phòng. Bạn vẫn có thể tham gia đấu trường với tư cách Người chơi.
                    </p>
                  </div>
                )}

                <div className="space-y-4">
                  <div>
                    <label htmlFor="player-name" className="block text-xs font-medium text-slate-300 mb-1.5">
                      Tên hiển thị / Biệt danh
                    </label>
                    <input
                      id="player-name"
                      type="text"
                      value={playerName}
                      onChange={(e) => setPlayerName(e.target.value)}
                      maxLength={32}
                      placeholder="Nhập tên hiển thị của bạn"
                      className="w-full h-11 px-3.5 bg-[#090A0D] border border-white/15 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-red-500"
                    />
                  </div>

                  {/* Host-only Room Creation */}
                  {isHostOrAdmin ? (
                    <div className="space-y-4 pt-1">
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <label htmlFor="arena-subject" className="block text-xs font-medium text-slate-300">
                            Lĩnh vực Thử thách & Yêu cầu đề thi
                          </label>
                          <button
                            type="button"
                            onClick={() => setActiveTab('dealer')}
                            className="text-[11px] font-mono text-emerald-400 hover:text-emerald-300 flex items-center gap-1 cursor-pointer"
                          >
                            <FileSpreadsheet className="w-3.5 h-3.5" />
                            <span>Tải đề bằng Excel</span>
                          </button>
                        </div>

                        {/* Excel Loaded Status Badge */}
                        {customDeck && customDeck.length > 0 ? (
                          <div className="mb-2 p-2 bg-emerald-950/40 border border-emerald-500/30 flex items-center justify-between text-xs text-emerald-300">
                            <span className="flex items-center gap-1.5">
                              <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                              Đang nạp bộ câu hỏi Excel ({customDeck.length} câu)
                            </span>
                            <span className="text-[10px] text-emerald-400 font-mono">Đã sẵn sàng</span>
                          </div>
                        ) : null}

                        {/* Free-text input / textarea for custom topic */}
                        <textarea
                          id="arena-subject"
                          value={subject}
                          onChange={(e) => setSubject(e.target.value)}
                          rows={2}
                          placeholder="Nhập chủ đề hoặc yêu cầu để AI tự tạo câu hỏi, ví dụ: Tâm lý học đại cương, 10 câu độ khó trung bình..."
                          className="w-full px-3.5 py-2.5 bg-[#090A0D] border border-white/15 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-red-500 resize-none font-sans"
                        />

                        {!customDeck && (
                          <p className="text-[11px] text-slate-400 mt-1 flex items-center gap-1">
                            <Sparkles className="w-3 h-3 text-amber-400 shrink-0" />
                            <span>AI Quản trò sẽ tự động soạn 8 câu hỏi bám sát đúng chủ đề trên khi bấm Tạo phòng.</span>
                          </p>
                        )}
                      </div>

                      {/* AI Generation In-progress Banner */}
                      {isGeneratingAi && (
                        <div className="p-3 bg-red-950/40 border border-red-500/50 flex items-center gap-3">
                          <div className="w-4 h-4 border-2 border-red-500 border-t-transparent rounded-full animate-spin shrink-0" />
                          <span className="text-xs text-red-200 font-mono">
                            {aiProgressMsg || 'AI đang soạn bộ câu hỏi...'}
                          </span>
                        </div>
                      )}

                      {/* Missing API Key & Missing Excel Notice */}
                      {showMissingKeyWarning && (
                        <div className="p-3.5 bg-amber-950/40 border border-amber-500/50 space-y-2.5">
                          <div className="flex items-start gap-2 text-amber-300 text-xs">
                            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
                            <div>
                              <p className="font-semibold text-amber-200">Chưa cài đặt Gemini API Key và chưa nạp file Excel</p>
                              <p className="text-amber-300/90 mt-0.5">
                                Để AI tự động soạn bộ câu hỏi theo chủ đề của bạn, hãy nhập Gemini API Key hoặc tải file Excel có sẵn.
                              </p>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2 pt-1">
                            <button
                              type="button"
                              onClick={() => {
                                setShowMissingKeyWarning(false);
                                setShowApiKeyModal(true);
                              }}
                              className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-black text-xs font-semibold cursor-pointer"
                            >
                              Cài đặt API Key
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setShowMissingKeyWarning(false);
                                setActiveTab('dealer');
                              }}
                              className="px-3 py-1.5 bg-[#1B1F2A] hover:bg-white hover:text-black border border-white/20 text-xs text-white font-medium cursor-pointer"
                            >
                              Tải đề bằng Excel
                            </button>
                            <button
                              type="button"
                              onClick={handleProceedWithoutAi}
                              className="px-3 py-1.5 text-xs text-slate-400 hover:text-white underline cursor-pointer"
                            >
                              Vẫn tiếp tục tạo phòng
                            </button>
                          </div>
                        </div>
                      )}

                      <button
                        type="button"
                        disabled={isGeneratingAi}
                        onClick={handleHostCreateRoom}
                        className="w-full h-12 px-5 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-sm font-semibold tracking-wide flex items-center justify-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        {isGeneratingAi ? (
                          <>
                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            <span>AI đang soạn bộ câu hỏi...</span>
                          </>
                        ) : (
                          <>
                            <Play className="w-4 h-4" />
                            <span>Tạo phòng Đấu trường (Host)</span>
                          </>
                        )}
                      </button>
                    </div>
                  ) : null}
                </div>

                {/* Join by Room Code (Available to ALL 3 tiers: Guest, Pending, Host, Admin) */}
                <div className="border-t border-white/10 pt-5 space-y-3">
                  <label htmlFor="join-code" className="block text-xs font-medium text-slate-300">
                    {isHostOrAdmin ? 'Hoặc tham gia phòng khác bằng Mã phòng' : 'Nhập Mã phòng để tham chiến'}
                  </label>
                  <div className="flex gap-2">
                    <input
                      id="join-code"
                      type="text"
                      value={joinCode}
                      onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                      maxLength={12}
                      placeholder="VD: BL-7K2M"
                      className="flex-1 h-11 px-3.5 bg-[#090A0D] border border-white/15 font-mono text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-white/40"
                    />
                    <button
                      type="button"
                      disabled={joinCode.trim().length < 4}
                      onClick={() => joinRoom(joinCode)}
                      className="h-11 px-5 border border-white/20 bg-[#1B1F2A] hover:bg-white hover:text-[#090A0D] disabled:opacity-40 text-sm font-semibold text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      {isHostOrAdmin ? 'Vào phòng' : 'Tham gia ngay'}
                    </button>
                  </div>
                  {!isHostOrAdmin && (
                    <p className="text-[11px] text-slate-400">
                      Đang ở chế độ Người chơi ẩn danh. Kết quả của bạn được lưu trong phiên và hiển thị đầy đủ trên Bảng xếp hạng.
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-6 flex-1 flex flex-col justify-between">
                <div className="space-y-5">
                  <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-4">
                    <div>
                      <p className="text-xs font-mono text-slate-400">Sảnh chờ Đang mở</p>
                      <h2 className="font-display text-3xl font-extrabold text-white tracking-tight mt-0.5">
                        {room.roomCode}
                      </h2>
                      <p className="text-xs text-slate-400 mt-1">{getSubjectLabelVi(room.subject)}</p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleCopyCode}
                        className="px-3 py-2 border border-white/15 bg-[#090A0D] hover:border-white/40 text-xs font-medium text-slate-200 flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                        title="Sao chép mã phòng"
                      >
                        {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedCode ? 'Đã sao chép' : 'Sao chép mã'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleCopyLink}
                        className="px-3 py-2 border border-white/15 bg-[#090A0D] hover:border-white/40 text-xs font-medium text-slate-200 flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                        title="Sao chép link mời trực tiếp"
                      >
                        {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Link className="w-3.5 h-3.5" />}
                        <span>{copiedLink ? 'Đã chép link' : 'Link mời'}</span>
                      </button>
                    </div>
                  </div>

                  {/* Live Connected Players Roster */}
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span className="flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5" />
                        Người chơi đã vào sảnh
                      </span>
                      <span className="font-mono tabular-nums text-white">{room.players.length}</span>
                    </div>

                    <div className="divide-y divide-white/10 border border-white/10 bg-[#090A0D] max-h-48 overflow-y-auto">
                      {room.players.map((p) => (
                        <div key={p.id} className="px-3.5 py-2.5 flex items-center justify-between gap-3 text-sm">
                          <span className="font-medium text-white truncate">
                            {p.name} {p.id === playerId ? '(Bạn)' : ''}
                          </span>
                          <span className="font-mono text-xs tabular-nums text-slate-400 whitespace-nowrap shrink-0">
                            Visa {p.visa} ngày · {p.id === room.hostPlayerId ? 'Chủ phòng' : 'Sẵn sàng'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <p className="text-xs text-slate-400 leading-relaxed">
                    {room.dealerMessage}
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row gap-3 pt-2">
                  {isHostOfCurrentRoom ? (
                    room.players && room.players.length >= 1 ? (
                      <button
                        type="button"
                        onClick={startGame}
                        className="flex-1 h-12 px-5 bg-red-600 hover:bg-red-500 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer shadow-[0_0_15px_rgba(239,68,68,0.35)]"
                      >
                        <Play className="w-4 h-4 fill-current" />
                        <span>Bắt đầu Trận đấu ({room.players.length} người chơi)</span>
                      </button>
                    ) : (
                      <div className="flex-1 h-12 px-4 border border-amber-500/40 bg-amber-950/20 text-amber-300 text-xs font-medium flex items-center justify-center gap-2">
                        <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                        <span>Cần ít nhất 1 người chơi trong phòng để bắt đầu trận đấu.</span>
                      </div>
                    )
                  ) : (
                    <div className="flex-1 h-12 px-5 border border-white/15 bg-[#090A0D] text-slate-400 text-xs font-medium flex items-center justify-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                      <span>Đang chờ Chủ phòng bắt đầu trận đấu...</span>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={leaveRoom}
                    className="h-12 px-4 border border-white/15 hover:border-white/40 text-xs font-semibold text-slate-300 hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Rời phòng
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Four Card Suits Classification Protocol */}
      <section className="space-y-4">
        <div className="flex items-baseline justify-between gap-4 border-b border-white/10 pb-3">
          <h2 className="font-display text-2xl font-bold text-white">
            Luật chơi 4 Chất bài
          </h2>
          <p className="text-xs text-slate-400">
            Bốn hệ thử thách sinh tồn quyết định tốc độ, tâm lý và sự đồng thuận
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {suits.map((suit) => {
            const meta = SUIT_META[suit];
            const desc: Record<CardSuit, string> = {
              spades: 'Thử thách tốc độ 14 giây. Phản xạ càng nhanh, điểm thưởng sinh tồn càng lớn.',
              hearts: 'Thao túng tâm lý. Có thể cược thêm 1 Visa để nhân đôi điểm hoặc dò gợi ý từ Quản trò.',
              clubs: 'Trò chơi đồng thuận. Khi từ 60% phòng trả lời đúng, người sống sót được thưởng +1 Visa.',
              diamonds: 'Logic thuần túy với hệ số điểm cao nhất (1.35x). Sai một bước là mất ngay Visa.',
            };
            return (
              <div
                key={suit}
                className="border border-white/10 bg-[#12151C] p-5 flex flex-col justify-between gap-4"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <SuitIcon suit={suit} className="w-5 h-5 shrink-0" />
                    <h3 className="font-display text-xl font-bold text-white">
                      {meta.label}
                    </h3>
                  </div>
                  <span className={`font-mono text-xs ${meta.textClass}`}>
                    {meta.timeBaseMs / 1000} giây
                  </span>
                </div>

                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-slate-200">{meta.viLabel}</p>
                  <p className="text-xs text-slate-400 leading-relaxed">{desc[suit]}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Live Firestore Public Arenas (when signed in & rooms exist) */}
      {liveArenas.length > 0 && !room && (
        <section className="space-y-3">
          <div className="flex items-baseline justify-between border-b border-white/10 pb-2">
            <h2 className="font-display text-xl font-bold text-white">
              Đấu trường Đang hoạt động
            </h2>
            <span className="text-xs font-mono text-slate-400">
              Đồng bộ Firestore Thời gian thực
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {liveArenas.slice(0, 6).map((arena) => (
              <div
                key={arena.id}
                className="border border-white/10 bg-[#12151C] p-4 flex items-center justify-between gap-4"
              >
                <div className="min-w-0">
                  <p className="font-mono text-sm font-bold text-white">{arena.roomCode}</p>
                  <p className="text-xs text-slate-400 truncate mt-0.5">
                    {getSubjectLabelVi(arena.subject)}
                  </p>
                  <p className="text-xs font-mono text-slate-500 mt-1">
                    {FSM_LABELS_VI[arena.fsmState]} · {arena.activePlayers} người chơi
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => joinRoom(arena.roomCode)}
                  className="px-3.5 py-2 border border-white/20 hover:bg-white hover:text-[#090A0D] text-xs font-semibold text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Tham gia
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Gemini API Key Modal for Host configuration */}
      <GeminiSettingsModal
        isOpen={showApiKeyModal}
        onClose={() => setShowApiKeyModal(false)}
      />
    </div>
  );
}
