import { useState, useEffect } from 'react';
import {
  UserCheck,
  UserX,
  Mail,
  Search,
  CheckCircle2,
  AlertCircle,
  Ban,
  Radio,
  ExternalLink,
} from 'lucide-react';
import { useGameStore } from '../store/gameStore';
import {
  preauthorizeHostEmail,
  subscribeAllUsers,
  updateUserRole,
  ADMIN_EMAIL,
} from '../lib/firebase';
import type { UserProfile, UserRole } from '../types/game';

export function AdminConsoleView() {
  const user = useGameStore((s) => s.user);
  const userRole = useGameStore((s) => s.userRole);
  const liveArenas = useGameStore((s) => s.liveArenas);
  const joinRoom = useGameStore((s) => s.joinRoom);
  const setActiveTab = useGameStore((s) => s.setActiveTab);

  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Pre-authorization input state
  const [preEmail, setPreEmail] = useState('');
  const [preBusy, setPreBusy] = useState(false);
  const [preMessage, setPreMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );

  // User action busy states
  const [actionBusyUid, setActionBusyUid] = useState<string | null>(null);

  // Subscribe to all users in collection `users`
  useEffect(() => {
    if (userRole !== 'admin') return;

    setLoading(true);
    const unsub = subscribeAllUsers(
      (userList) => {
        setUsers(userList);
        setLoading(false);
      },
      (err) => {
        setError(err.message || 'Không thể tải danh sách người dùng.');
        setLoading(false);
      }
    );

    return () => unsub();
  }, [userRole]);

  const handlePreauthorize = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!preEmail.trim()) return;

    setPreBusy(true);
    setPreMessage(null);

    try {
      const res = await preauthorizeHostEmail(preEmail);
      setPreMessage({ type: 'success', text: res.message });
      setPreEmail('');
    } catch (err) {
      setPreMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Lỗi khi cấp sẵn quyền Chủ phòng.',
      });
    } finally {
      setPreBusy(false);
    }
  };

  const handleRoleChange = async (targetUid: string, newRole: UserRole) => {
    setActionBusyUid(targetUid);
    try {
      await updateUserRole(targetUid, newRole);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể cập nhật quyền.');
    } finally {
      setActionBusyUid(null);
    }
  };

  const filteredUsers = users.filter((u) => {
    const term = searchTerm.toLowerCase();
    return (
      u.email.toLowerCase().includes(term) ||
      u.displayName.toLowerCase().includes(term) ||
      u.role.toLowerCase().includes(term)
    );
  });

  const totalAdmins = users.filter((u) => u.role === 'admin').length;
  const totalHosts = users.filter((u) => u.role === 'host').length;
  const totalPending = users.filter((u) => u.role === 'pending').length;
  const totalBlocked = users.filter((u) => u.role === 'blocked').length;

  const roleBadge = (role: UserRole) => {
    switch (role) {
      case 'admin':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-[11px] font-semibold bg-red-950/60 border border-red-500/50 text-red-300">
            Quản trị viên
          </span>
        );
      case 'host':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-[11px] font-semibold bg-emerald-950/60 border border-emerald-500/50 text-emerald-300">
            Chủ phòng (Host)
          </span>
        );
      case 'pending':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-[11px] font-semibold bg-amber-950/60 border border-amber-500/50 text-amber-300">
            Chờ duyệt (Pending)
          </span>
        );
      case 'blocked':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-[11px] font-semibold bg-zinc-800 border border-zinc-600 text-zinc-400">
            Đã chặn (Blocked)
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-[11px] font-semibold bg-slate-800 border border-slate-600 text-slate-300">
            Khách (Guest)
          </span>
        );
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-white/10 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 bg-red-600 text-white font-mono text-[10px] font-bold uppercase tracking-wider">
              Cấp 1 · Super Admin
            </span>
            <p className="font-mono text-xs text-slate-400">
              Quyền Quản trị viên Tối cao: <span className="text-white">{ADMIN_EMAIL}</span>
            </p>
          </div>
          <h1 className="font-display text-4xl sm:text-5xl font-extrabold text-white tracking-tight mt-1.5">
            Quản Trị Hệ Thống
          </h1>
        </div>

        <div className="font-mono text-xs text-slate-400 flex items-center gap-3">
          <span>Người dùng: <b className="text-white">{users.length}</b></span>
          <span>·</span>
          <span>Chủ phòng: <b className="text-emerald-400">{totalHosts}</b></span>
          <span>·</span>
          <span>Chờ duyệt: <b className="text-amber-400">{totalPending}</b></span>
        </div>
      </div>

      {error && (
        <div className="border border-red-500/50 bg-red-950/40 p-3.5 flex items-center gap-3 text-xs text-red-200">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Grid: Pre-authorization Panel + Quick Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Pre-grant Host Form */}
        <section className="lg:col-span-7 border border-white/10 bg-[#12151C] p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="p-2 border border-white/15 bg-[#090A0D]">
              <Mail className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <h2 className="font-display text-xl font-bold text-white">
                Cấp Sẵn Quyền Chủ Phòng
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Nhập địa chỉ Gmail bất kỳ để cấp quyền Chủ phòng ngay cả trước khi người đó đăng nhập lần đầu.
              </p>
            </div>
          </div>

          <form onSubmit={handlePreauthorize} className="space-y-3 pt-1">
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="email"
                required
                value={preEmail}
                onChange={(e) => setPreEmail(e.target.value)}
                placeholder="Nhập địa chỉ Gmail (ví dụ: giaovien@gmail.com)"
                className="flex-1 h-11 px-3.5 bg-[#090A0D] border border-white/15 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-red-500"
              />
              <button
                type="submit"
                disabled={preBusy || !preEmail.trim()}
                className="h-11 px-5 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-xs font-semibold tracking-wide flex items-center justify-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <UserCheck className="w-4 h-4" />
                <span>{preBusy ? 'Đang xử lý...' : 'Cấp sẵn quyền Host'}</span>
              </button>
            </div>

            {preMessage && (
              <div
                className={`p-3 border text-xs flex items-center gap-2 ${
                  preMessage.type === 'success'
                    ? 'border-emerald-500/40 bg-emerald-950/30 text-emerald-200'
                    : 'border-red-500/40 bg-red-950/30 text-red-200'
                }`}
              >
                {preMessage.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                )}
                <span>{preMessage.text}</span>
              </div>
            )}
          </form>
        </section>

        {/* System Roles Summary */}
        <section className="lg:col-span-5 border border-white/10 bg-[#12151C] p-6 flex flex-col justify-between gap-4">
          <div>
            <h2 className="font-display text-xl font-bold text-white">
              Cơ Cấu Phân Quyền (RBAC)
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Phân quyền chặt chẽ theo 3 cấp độ bảo vệ cả UI, Server và Firestore.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs font-mono">
            <div className="border border-white/10 bg-[#090A0D] p-3">
              <span className="text-slate-400 block text-[11px]">Quản trị viên</span>
              <span className="text-xl font-bold text-red-400 tabular-nums">{totalAdmins}</span>
              <span className="text-[10px] text-slate-500 block mt-1">Toàn quyền hệ thống</span>
            </div>
            <div className="border border-white/10 bg-[#090A0D] p-3">
              <span className="text-slate-400 block text-[11px]">Chủ phòng (Host)</span>
              <span className="text-xl font-bold text-emerald-400 tabular-nums">{totalHosts}</span>
              <span className="text-[10px] text-slate-500 block mt-1">Quản lý câu hỏi & phòng</span>
            </div>
            <div className="border border-white/10 bg-[#090A0D] p-3">
              <span className="text-slate-400 block text-[11px]">Chờ duyệt (Pending)</span>
              <span className="text-xl font-bold text-amber-400 tabular-nums">{totalPending}</span>
              <span className="text-[10px] text-slate-500 block mt-1">Chỉ chơi với tư cách Khách</span>
            </div>
            <div className="border border-white/10 bg-[#090A0D] p-3">
              <span className="text-slate-400 block text-[11px]">Đã chặn (Blocked)</span>
              <span className="text-xl font-bold text-zinc-400 tabular-nums">{totalBlocked}</span>
              <span className="text-[10px] text-slate-500 block mt-1">Bị từ chối truy cập</span>
            </div>
          </div>
        </section>
      </div>

      {/* Users Management Section */}
      <section className="border border-white/10 bg-[#12151C] p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-4">
          <div>
            <h2 className="font-display text-2xl font-bold text-white">
              Danh Sách Tài Khoản Đã Đăng Nhập
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Tất cả các tài khoản Gmail được lưu tự động trong collection <code className="text-slate-300">users</code>.
            </p>
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Tìm theo email, tên, quyền..."
              className="w-full h-10 pl-9 pr-3.5 bg-[#090A0D] border border-white/15 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-red-500"
            />
          </div>
        </div>

        {/* Users Table */}
        <div className="border border-white/10 bg-[#090A0D] overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/10 text-[11px] font-mono text-slate-400 uppercase bg-[#0D1016]">
                <th className="py-3 px-4">Tài khoản & Tên</th>
                <th className="py-3 px-4">Quyền hạn</th>
                <th className="py-3 px-4">Trận chơi / Thắng</th>
                <th className="py-3 px-4 text-right">Thao tác Quản trị</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10 text-xs">
              {loading ? (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-slate-400">
                    Đang tải danh sách người dùng từ Firestore...
                  </td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-slate-500">
                    {searchTerm ? 'Không tìm thấy tài khoản phù hợp.' : 'Chưa có tài khoản nào được ghi nhận.'}
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u) => {
                  const isCurrentSuperAdmin = u.email.toLowerCase() === ADMIN_EMAIL.toLowerCase();
                  const isSelf = u.uid === user?.uid;
                  const isBusy = actionBusyUid === u.uid;

                  return (
                    <tr key={u.uid} className="hover:bg-white/[0.02] transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-white flex items-center gap-2">
                          <span>{u.displayName}</span>
                          {isSelf && (
                            <span className="px-1.5 py-0.2 bg-white/15 text-[10px] text-slate-300 font-mono">
                              Bạn
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] font-mono text-slate-400 mt-0.5">
                          {u.email}
                        </div>
                      </td>

                      <td className="py-3.5 px-4">{roleBadge(u.role)}</td>

                      <td className="py-3.5 px-4 font-mono text-slate-300">
                        {u.gamesPlayed ?? 0} trận · {u.gamesSurvived ?? 0} sống sót
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        {isCurrentSuperAdmin ? (
                          <span className="text-[11px] font-mono text-red-400">
                            Quản trị viên tối cao
                          </span>
                        ) : (
                          <div className="flex items-center justify-end gap-2">
                            {u.role !== 'host' && u.role !== 'admin' && (
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => handleRoleChange(u.uid, 'host')}
                                className="px-3 py-1.5 border border-emerald-500/40 bg-emerald-950/30 hover:bg-emerald-600 text-emerald-200 hover:text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                              >
                                <UserCheck className="w-3.5 h-3.5" />
                                <span>Cấp quyền Host</span>
                              </button>
                            )}

                            {u.role === 'host' && (
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => handleRoleChange(u.uid, 'pending')}
                                className="px-3 py-1.5 border border-amber-500/40 bg-amber-950/30 hover:bg-amber-600 text-amber-200 hover:text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                              >
                                <UserX className="w-3.5 h-3.5" />
                                <span>Thu hồi quyền</span>
                              </button>
                            )}

                            {u.role !== 'blocked' ? (
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => handleRoleChange(u.uid, 'blocked')}
                                className="px-2.5 py-1.5 border border-white/10 hover:border-red-500/60 hover:bg-red-950/30 text-slate-400 hover:text-red-300 text-xs font-medium transition-colors cursor-pointer disabled:opacity-50"
                                title="Chặn người dùng này"
                              >
                                <Ban className="w-3.5 h-3.5" />
                              </button>
                            ) : (
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => handleRoleChange(u.uid, 'pending')}
                                className="px-3 py-1.5 border border-white/20 bg-zinc-800 hover:bg-white hover:text-black text-white text-xs font-medium transition-colors cursor-pointer disabled:opacity-50"
                              >
                                Bỏ chặn
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Active Live Arenas Monitoring */}
      <section className="border border-white/10 bg-[#12151C] p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div>
            <h2 className="font-display text-2xl font-bold text-white flex items-center gap-2.5">
              <Radio className="w-5 h-5 text-red-500 animate-pulse" />
              <span>Toàn Bộ Phòng Đấu Trường Đang Hoạt Động</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Theo dõi trực tiếp tất cả các phòng do Chủ phòng khởi tạo.
            </p>
          </div>
          <span className="font-mono text-xs text-slate-400">
            {liveArenas.length} phòng đang mở
          </span>
        </div>

        {liveArenas.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500 border border-white/10 bg-[#090A0D]">
            Hiện chưa có phòng đấu trường nào đang trực tuyến.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {liveArenas.map((arena) => (
              <div
                key={arena.id}
                className="border border-white/10 bg-[#090A0D] p-4 flex flex-col justify-between gap-3"
              >
                <div>
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="font-bold text-white tracking-wider">{arena.roomCode}</span>
                    <span className="px-2 py-0.5 bg-red-950/60 border border-red-500/40 text-red-300">
                      {arena.fsmState}
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 font-medium mt-2 line-clamp-1">
                    {arena.subject}
                  </p>
                  <p className="text-[11px] font-mono text-slate-500 mt-1">
                    Vòng: {arena.currentRound}/{arena.maxRounds} · Người chơi: {arena.activePlayers}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    joinRoom(arena.roomCode);
                    setActiveTab('arena');
                  }}
                  className="w-full h-9 border border-white/20 bg-[#1B1F2A] hover:bg-white hover:text-black text-xs font-semibold text-white flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Vào giám sát phòng</span>
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
