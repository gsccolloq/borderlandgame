import { useGameStore, type NavTab } from '../store/gameStore';
import { signInWithGoogle, signOutUser } from '../lib/firebase';
import { useState } from 'react';
import { Key } from 'lucide-react';

export function TopBar() {
  const activeTab = useGameStore((s) => s.activeTab);
  const setActiveTab = useGameStore((s) => s.setActiveTab);
  const user = useGameStore((s) => s.user);
  const userRole = useGameStore((s) => s.userRole);
  const setGeminiModalOpen = useGameStore((s) => s.setGeminiModalOpen);
  const [authBusy, setAuthBusy] = useState(false);

  const handleAuthClick = async () => {
    setAuthBusy(true);
    try {
      if (user) {
        await signOutUser();
      } else {
        await signInWithGoogle();
      }
    } catch (err) {
      console.error('Auth error:', err);
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

  return (
    <header className="sticky top-0 z-30 border-b border-white/10 bg-[#090A0D]/95 backdrop-blur-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
        {/* Zone 1: Single-line Brand Wordmark */}
        <button
          type="button"
          onClick={() => setActiveTab('arena')}
          className="font-display text-2xl font-extrabold tracking-tight text-white whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-red-500"
        >
          Borderland Arena
        </button>

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
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {/* Settings (API Key) Button - Always visible with red notice per AI_Instructions.md */}
          <button
            type="button"
            onClick={() => setGeminiModalOpen(true)}
            className="flex items-center gap-2 px-3 py-1.5 border border-red-500/70 bg-red-950/35 hover:bg-red-900/40 text-white transition-all cursor-pointer group shadow-[0_0_10px_rgba(239,68,68,0.2)]"
            title="Thiết lập Model & Google Gemini API Key"
          >
            <Key className="w-3.5 h-3.5 text-red-500 group-hover:rotate-12 transition-transform shrink-0" />
            <div className="flex flex-col text-left">
              <span className="font-mono text-xs font-bold text-white leading-tight whitespace-nowrap">
                Settings (API Key)
              </span>
              <span className="text-[10px] text-red-400 font-bold leading-none whitespace-nowrap animate-pulse">
                Lấy API key để sử dụng app
              </span>
            </div>
          </button>

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
            className="px-4 py-2 text-xs font-semibold tracking-wide bg-white text-[#090A0D] hover:bg-slate-200 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-red-500"
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
  );
}
