import { useGameStore, type NavTab } from '../store/gameStore';
import { signInWithGoogle, signOutUser } from '../lib/firebase';
import { hasConnectedApiKey } from '../lib/geminiService';
import { useState, useEffect } from 'react';
import { Key, AlertTriangle, X, ExternalLink, CheckCircle2 } from 'lucide-react';

export function TopBar() {
  const activeTab = useGameStore((s) => s.activeTab);
  const setActiveTab = useGameStore((s) => s.setActiveTab);
  const user = useGameStore((s) => s.user);
  const userRole = useGameStore((s) => s.userRole);
  const geminiModalOpen = useGameStore((s) => s.geminiModalOpen);
  const setGeminiModalOpen = useGameStore((s) => s.setGeminiModalOpen);
  const wsConnected = useGameStore((s) => s.wsConnected);

  const [authBusy, setAuthBusy] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(() => hasConnectedApiKey());
  const [authErrorModal, setAuthErrorModal] = useState<{
    title: string;
    message: string;
    instruction?: string;
  } | null>(null);

  useEffect(() => {
    setHasApiKey(hasConnectedApiKey());
  }, [geminiModalOpen]);

  const handleAuthClick = async () => {
    setAuthBusy(true);
    setAuthErrorModal(null);
    try {
      if (user) {
        await signOutUser();
      } else {
        await signInWithGoogle();
      }
    } catch (err: unknown) {
      console.error('Auth error:', err);
      const errStr = err instanceof Error ? err.message : String(err);
      const domain =
        typeof window !== 'undefined' ? window.location.hostname : 'borderlandgame-five.vercel.app';

      if (
        errStr.includes('api-key-not-valid') ||
        errStr.includes('invalid-api-key') ||
        errStr.includes('Firebase API Key không hợp lệ')
      ) {
        setAuthErrorModal({
          title: 'Khóa API Firebase không hợp lệ (API Key Invalid)',
          message: 'Khóa VITE_FIREBASE_API_KEY được truyền vào từ Vercel không khớp hoặc bị thiếu ký tự.',
          instruction: `Cách khắc phục:\n1. Mở Firebase Console > Chọn dự án > Bấm vào biểu tượng bánh răng (Project settings).\n2. Tại tab General, cuộn xuống mục "Your apps" (Web apps) để copy mã "apiKey" (bắt đầu bằng AIzaSy...).\n3. Mở Vercel Dashboard > Project Settings > Environment Variables.\n4. Cập nhật lại giá trị cho VITE_FIREBASE_API_KEY (không chứa khoảng trắng ở 2 đầu) rồi bấm Redeploy.`,
        });
      } else if (
        errStr.includes('unauthorized-domain') ||
        errStr.includes('chưa được cấp phép') ||
        errStr.includes(domain)
      ) {
        setAuthErrorModal({
          title: 'Tên miền chưa được cấp phép (Unauthorized Domain)',
          message: `Tên miền hiện tại [${domain}] chưa nằm trong danh sách được phép đăng nhập Google của Firebase.`,
          instruction: `Hướng dẫn kích hoạt nhanh:\n1. Truy cập Firebase Console (https://console.firebase.google.com)\n2. Chọn dự án Firebase của bạn > Authentication > Settings.\n3. Tại mục "Authorized domains" (Tên miền được cấp phép), bấm "Add domain".\n4. Nhập chính xác tên miền: ${domain}\n5. Nhấn Add/Save và quay lại đây bấm Đăng nhập lại.`,
        });
      } else {
        setAuthErrorModal({
          title: 'Lỗi Đăng nhập Google',
          message: errStr || 'Đã xảy ra lỗi khi kết nối Google Authentication.',
          instruction:
            'Nếu trình duyệt chặn cửa sổ popup, vui lòng cho phép cửa sổ bật lên cho trang web này và thử lại.',
        });
      }
    } finally {
      setAuthBusy(false);
    }
  };

  // Determine allowed navigation links based on RBAC
  const navItems: { id: NavTab; label: string }[] = [
    { id: 'arena', label: 'Đấu trường' },
    { id: 'leaderboard', label: 'Bảng xếp hạng' },
    { id: 'analytics', label: 'Thống kê' },
  ];

  if (userRole === 'admin' || userRole === 'host') {
    navItems.push({ id: 'dealer', label: 'Bảng điều khiển Quản trò' });
  }

  if (userRole === 'admin') {
    navItems.push({ id: 'admin', label: 'Quản trị Hệ thống' });
  }

  // Super Admin / Host check for API key settings button
  const isHostOrAdmin = Boolean(user && (userRole === 'admin' || userRole === 'host'));

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#090A0D]/95 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-2 sm:gap-6">
          {/* Zone 1: Single-line Brand Wordmark & Connection Status */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <button
              type="button"
              onClick={() => setActiveTab('arena')}
              className="font-display text-xl sm:text-2xl font-extrabold tracking-tight text-white whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-red-500"
            >
              Borderland Arena
            </button>
            <span
              className={`hidden lg:inline-flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-mono border ${
                wsConnected
                  ? 'border-emerald-500/40 bg-emerald-950/30 text-emerald-400'
                  : 'border-amber-500/40 bg-amber-950/30 text-amber-400'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${wsConnected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
              <span>{wsConnected ? 'Đã kết nối Firestore' : 'Đang kết nối...'}</span>
            </span>
          </div>

          {/* Zone 2: Dynamic single-line nav links based on RBAC */}
          <nav className="hidden md:flex items-center gap-7" aria-label="Điều hướng chính">
            {navItems.map((item) => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`relative py-2 text-sm font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-red-500 ${
                    isActive ? 'text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {item.label}
                  {isActive && (
                    <span className="absolute inset-x-0 -bottom-[17px] h-0.5 bg-red-500" />
                  )}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: Role Indicator & Auth Action & Settings (API Key) */}
          <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
            {/* Settings (API Key) Button - CHỈ hiển thị với Host/Admin */}
            {isHostOrAdmin && (
              <button
                type="button"
                onClick={() => setGeminiModalOpen(true)}
                className={`flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1 sm:py-1.5 border transition-all cursor-pointer group shrink-0 ${
                  hasApiKey
                    ? 'border-emerald-500/70 bg-emerald-950/35 hover:bg-emerald-900/40 text-white shadow-[0_0_12px_rgba(16,185,129,0.25)]'
                    : 'border-red-500/70 bg-red-950/35 hover:bg-red-900/40 text-white shadow-[0_0_10px_rgba(239,68,68,0.2)]'
                }`}
                title="Thiết lập Model & Google Gemini API Key"
              >
                <Key
                  className={`w-3.5 h-3.5 group-hover:rotate-12 transition-transform shrink-0 ${
                    hasApiKey ? 'text-emerald-400' : 'text-red-500'
                  }`}
                />
                <div className="flex flex-col text-left">
                  <span className="font-mono text-[11px] sm:text-xs font-bold text-white leading-tight whitespace-nowrap">
                    Settings (API Key)
                  </span>
                  {hasApiKey ? (
                    <span className="text-[9px] sm:text-[10px] text-emerald-400 font-bold leading-none whitespace-nowrap flex items-center gap-1">
                      <CheckCircle2 className="w-2.5 h-2.5" />
                      Đã kết nối API Key
                    </span>
                  ) : (
                    <span className="text-[9px] sm:text-[10px] text-red-400 font-bold leading-none whitespace-nowrap animate-pulse">
                      Cài đặt Gemini Key
                    </span>
                  )}
                </div>
              </button>
            )}

            {user && (
              <div className="hidden sm:flex items-center gap-1.5 font-mono text-[11px]">
                {userRole === 'admin' && (
                  <span className="px-2 py-0.5 bg-red-600/90 text-white font-semibold">
                    Admin
                  </span>
                )}
                {userRole === 'host' && (
                  <span className="px-2 py-0.5 bg-emerald-600/90 text-white font-semibold">
                    Host
                  </span>
                )}
                {userRole === 'pending' && (
                  <span className="px-2 py-0.5 bg-amber-600/90 text-white font-semibold" title="Đang chờ cấp quyền Host">
                    Chờ duyệt
                  </span>
                )}
                {userRole === 'blocked' && (
                  <span className="px-2 py-0.5 bg-zinc-700 text-zinc-300 font-semibold">
                    Bị chặn
                  </span>
                )}
              </div>
            )}

            <button
              type="button"
              disabled={authBusy}
              onClick={handleAuthClick}
              className="px-2.5 sm:px-4 py-1.5 sm:py-2 text-[11px] sm:text-xs font-semibold tracking-wide bg-white text-[#090A0D] hover:bg-slate-200 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-red-500"
            >
              {authBusy
                ? 'Đang kết nối...'
                : user
                  ? `Đăng xuất (${(user.displayName || 'Người chơi').split(' ')[0]})`
                  : 'Đăng nhập Google'}
            </button>
          </div>
        </div>

        {/* Mobile compact navigation row */}
        <nav
          className="md:hidden border-t border-white/10 px-4 flex items-center gap-2 overflow-x-auto"
          aria-label="Điều hướng di động"
        >
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`py-2.5 px-2 text-xs font-medium whitespace-nowrap shrink-0 border-b-2 transition-colors cursor-pointer ${
                  isActive
                    ? 'border-red-500 text-white'
                    : 'border-transparent text-slate-400 hover:text-white'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>
      </header>

      {/* Auth Error Guidance Modal */}
      {authErrorModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in"
        >
          <div className="w-full max-w-lg bg-[#0F1218] border-2 border-red-500/60 p-6 space-y-4 shadow-2xl relative">
            <div className="flex items-start justify-between gap-3 border-b border-white/10 pb-3">
              <div className="flex items-center gap-2.5 text-red-400">
                <AlertTriangle className="w-5 h-5 shrink-0" />
                <h3 className="font-display text-lg font-bold text-white tracking-wide">
                  {authErrorModal.title}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setAuthErrorModal(null)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-200 leading-relaxed">
              {authErrorModal.message}
            </p>

            {authErrorModal.instruction && (
              <div className="p-3 bg-red-950/30 border border-red-500/30 text-xs font-mono text-slate-300 whitespace-pre-line leading-relaxed">
                {authErrorModal.instruction}
              </div>
            )}

            <div className="flex items-center justify-between pt-2">
              <a
                href="https://console.firebase.google.com"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 underline"
              >
                <span>Mở Firebase Console</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>

              <button
                type="button"
                onClick={() => setAuthErrorModal(null)}
                className="px-4 py-2 bg-white text-[#090A0D] text-xs font-bold hover:bg-slate-200 cursor-pointer"
              >
                Đã hiểu
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
