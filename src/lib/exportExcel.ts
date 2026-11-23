import * as XLSX from 'xlsx';
import {
  SUIT_META,
  getSubjectLabelVi,
  type CardSuit,
  type MatchHistoryRecord,
  type PlayerState,
} from '../types/game';

export function exportAnalyticsWorkbook(params: {
  player: PlayerState | null;
  roomCode: string;
  subject: string;
  history: MatchHistoryRecord[];
}): void {
  const { player, roomCode, subject, history } = params;
  const wb = XLSX.utils.book_new();

  // Sheet 1: Tổng quan phiên đấu
  const attempts = player?.answerLog.length ?? 0;
  const correct = player?.answerLog.filter((a) => a.isCorrect).length ?? 0;
  const avgResponseMs =
    attempts > 0
      ? Math.round((player?.answerLog.reduce((sum, a) => sum + a.responseMs, 0) ?? 0) / attempts)
      : 0;
  const accuracyPct = attempts > 0 ? Number(((correct / attempts) * 100).toFixed(1)) : 0;

  const suitAcc = (suit: CardSuit) => {
    const st = player?.suitStats[suit];
    if (!st || st.attempts === 0) return '0%';
    return `${Math.round((st.correct / st.attempts) * 100)}%`;
  };

  const statusText = (status?: string) => {
    if (status === 'revived') return 'Đã hồi sinh';
    if (status === 'eliminated') return 'Bị loại';
    if (status === 'disqualified') return 'Bị truất quyền';
    if (status === 'survived') return 'Sống sót';
    return 'Đang thi đấu';
  };

  const summaryRows = [
    {
      ChiSo: 'Tên Người chơi',
      GiaTri: player?.name ?? 'Chưa có',
    },
    {
      ChiSo: 'Mã phòng Đấu trường',
      GiaTri: roomCode || 'CỤC BỘ',
    },
    {
      ChiSo: 'Lĩnh vực Thử thách',
      GiaTri: getSubjectLabelVi(subject || 'Tổng hợp'),
    },
    {
      ChiSo: 'Trạng thái Sinh tồn',
      GiaTri: statusText(player?.status),
    },
    {
      ChiSo: 'Tổng Điểm số',
      GiaTri: player?.score ?? 0,
    },
    {
      ChiSo: 'Số ngày Visa Còn lại',
      GiaTri: player?.visa ?? 0,
    },
    {
      ChiSo: 'Độ chính xác (%)',
      GiaTri: accuracyPct,
    },
    {
      ChiSo: 'Thời gian Phản xạ Trung bình (ms)',
      GiaTri: avgResponseMs,
    },
    {
      ChiSo: 'Số lần Vi phạm Chuyển Tab',
      GiaTri: player?.tabSwitches ?? 0,
    },
    {
      ChiSo: 'Độ chính xác Bích (Tốc độ)',
      GiaTri: suitAcc('spades'),
    },
    {
      ChiSo: 'Độ chính xác Cơ (Tâm lý)',
      GiaTri: suitAcc('hearts'),
    },
    {
      ChiSo: 'Độ chính xác Chuồn (Đồng thuận)',
      GiaTri: suitAcc('clubs'),
    },
    {
      ChiSo: 'Độ chính xác Rô (Logic)',
      GiaTri: suitAcc('diamonds'),
    },
  ];
  const summarySheet = XLSX.utils.json_to_sheet(summaryRows);
  XLSX.utils.book_append_sheet(wb, summarySheet, 'Tong_Quan');

  // Sheet 2: Nhật ký từng câu hỏi
  const logRows = (player?.answerLog ?? []).map((entry) => ({
    Vong: entry.roundNumber,
    LaBai: `${entry.cardRank} ${SUIT_META[entry.suit].label}`,
    DoKho: entry.difficulty,
    ChuDe: entry.topic,
    KetQua: entry.isCorrect ? 'VƯỢT QUA' : 'THẤT BẠI',
    ThoiGianPhanXa_ms: Math.round(entry.responseMs),
    BienDongVisa: entry.visaDelta,
    BienDongDiem: entry.scoreDelta,
    CuocChatCo: entry.wagered ? 'CÓ' : 'KHÔNG',
  }));
  const logSheet = XLSX.utils.json_to_sheet(
    logRows.length > 0
      ? logRows
      : [
          {
            Vong: '-',
            LaBai: '-',
            DoKho: '-',
            ChuDe: 'Chưa có vòng đấu nào được ghi nhận',
            KetQua: '-',
            ThoiGianPhanXa_ms: 0,
            BienDongVisa: 0,
            BienDongDiem: 0,
            CuocChatCo: 'KHÔNG',
          },
        ]
  );
  XLSX.utils.book_append_sheet(wb, logSheet, 'Nhat_Ky_Cau_Hoi');

  // Sheet 3: Bản đồ nhiệt lỗ hổng kiến thức
  const topicRows = Object.values(player?.topicStats ?? {}).map((t) => {
    const acc = t.attempts > 0 ? Math.round((t.correct / t.attempts) * 100) : 0;
    const avgMs = t.attempts > 0 ? Math.round(t.totalResponseMs / t.attempts) : 0;
    return {
      ChuDe: t.topic,
      ChatBai: SUIT_META[t.suit].label,
      SoLuot: t.attempts,
      TraLoiDung: t.correct,
      TyLeChinhXac_Pct: acc,
      ThoiGianPhanXaTB_ms: avgMs,
      MucDoLoHong: acc < 50 ? 'LỖ HỔNG NGHIÊM TRỌNG' : acc < 80 ? 'RỦI RO TRUNG BÌNH' : 'ĐÃ LÀM CHỦ',
    };
  });
  const topicSheet = XLSX.utils.json_to_sheet(
    topicRows.length > 0
      ? topicRows
      : [
          {
            ChuDe: 'Hoàn thành ít nhất một vòng để xuất dữ liệu Lỗ hổng Kiến thức',
            ChatBai: '-',
            SoLuot: 0,
            TraLoiDung: 0,
            TyLeChinhXac_Pct: 0,
            ThoiGianPhanXaTB_ms: 0,
            MucDoLoHong: '-',
          },
        ]
  );
  XLSX.utils.book_append_sheet(wb, topicSheet, 'Lo_Hong_Kien_Thuc');

  // Sheet 4: Lịch sử Firestore
  if (history.length > 0) {
    const historyRows = history.map((h) => ({
      MaPhong: h.arenaCode,
      LinhVuc: getSubjectLabelVi(h.subject),
      KetQua: statusText(h.status),
      DiemSo: h.score,
      VisaConLai: h.finalVisa,
      DoChinhXac_Pct: h.accuracyPct,
      ThoiGianPhanXaTB_ms: Math.round(h.avgResponseMs),
      ViPhamChuyenTab: h.tabSwitches,
      Bich_Pct: h.spadesScore,
      Co_Pct: h.heartsScore,
      Chuon_Pct: h.clubsScore,
      Ro_Pct: h.diamondsScore,
    }));
    const historySheet = XLSX.utils.json_to_sheet(historyRows);
    XLSX.utils.book_append_sheet(wb, historySheet, 'Lich_Su_Dau_Truong');
  }

  const filename = `borderland_thong_ke_${(roomCode || 'phien_dau').toLowerCase()}_${Date.now()}.xlsx`;
  XLSX.writeFile(wb, filename);
}
