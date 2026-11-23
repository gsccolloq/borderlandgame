import * as XLSX from 'xlsx';
import type { ArenaQuestion, CardSuit, ColumnMapping, ExcelQuestionRow } from '../types/game';

/**
 * Generates and triggers download of a standardized Excel template for question upload.
 * Contains standard columns and 2 rich sample questions.
 */
export function downloadQuestionTemplate(): void {
  const wb = XLSX.utils.book_new();

  const sampleRows = [
    {
      CauHoi:
        'Trong cấu trúc dữ liệu đồ thị, thuật toán Dijkstra tìm đường đi ngắn nhất hoạt động chính xác trên loại đồ thị nào?',
      DapAnA: 'Chỉ đồ thị có trọng số dương hoặc bằng 0',
      DapAnB: 'Mọi loại đồ thị bao gồm cả chu trình âm',
      DapAnC: 'Chỉ đồ thị có trọng số âm',
      DapAnD: 'Chỉ cây nhị phân tìm kiếm',
      DapAnDung: 'A',
      DoKho: 7,
      ThoiGianGiay: 20,
      AiSo: 1,
    },
    {
      CauHoi:
        'Trong Lý thuyết Trò chơi (Game Theory), Cân bằng Nash (Nash Equilibrium) đạt được khi nào?',
      DapAnA: 'Khi tất cả người chơi đều nhận được điểm số tối đa có thể',
      DapAnB: 'Khi không người chơi nào có động lực đơn phương thay đổi chiến lược của mình',
      DapAnC: 'Khi một người chơi loại bỏ hoàn toàn các đối thủ khác',
      DapAnD: 'Khi tổng lợi ích của toàn bộ người chơi bằng 0',
      DapAnDung: 'B',
      DoKho: 8,
      ThoiGianGiay: 25,
      AiSo: 2,
    },
  ];

  const ws = XLSX.utils.json_to_sheet(sampleRows, {
    header: [
      'CauHoi',
      'DapAnA',
      'DapAnB',
      'DapAnC',
      'DapAnD',
      'DapAnDung',
      'DoKho',
      'ThoiGianGiay',
      'AiSo',
    ],
  });

  // Set explicit column widths for usability
  ws['!cols'] = [
    { wch: 60 }, // CauHoi
    { wch: 30 }, // DapAnA
    { wch: 30 }, // DapAnB
    { wch: 30 }, // DapAnC
    { wch: 30 }, // DapAnD
    { wch: 15 }, // DapAnDung
    { wch: 10 }, // DoKho
    { wch: 14 }, // ThoiGianGiay
    { wch: 10 }, // AiSo
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Mau_Cau_Hoi');
  XLSX.writeFile(wb, 'borderland_mau_cau_hoi.xlsx');
}

/**
 * Reads an uploaded Excel file (.xlsx, .xls) and returns available sheets & raw JSON rows.
 */
export async function readExcelWorkbook(
  file: File
): Promise<{ sheetNames: string[]; sheets: Record<string, Record<string, unknown>[]> }> {
  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data, { type: 'array' });
  const sheets: Record<string, Record<string, unknown>[]> = {};

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (sheet) {
      sheets[sheetName] = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
        defval: '',
      });
    }
  }

  return {
    sheetNames: workbook.SheetNames,
    sheets,
  };
}

function normalizeHeader(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Intelligent automatic detection of column mappings matching standard names and Vietnamese variations.
 */
export function detectColumnMapping(availableHeaders: string[]): ColumnMapping {
  const mapping: ColumnMapping = {
    prompt: '',
    optionA: '',
    optionB: '',
    optionC: '',
    optionD: '',
    correctAnswer: '',
    difficulty: '',
    timeLimitSec: '',
    roundNumber: '',
  };

  const headerMap = new Map<string, string>();
  for (const h of availableHeaders) {
    headerMap.set(normalizeHeader(h), h);
  }

  // Matching heuristics
  const findMatch = (patterns: string[]): string => {
    for (const pat of patterns) {
      const normalizedPat = normalizeHeader(pat);
      for (const [normHeader, original] of headerMap.entries()) {
        if (normHeader === normalizedPat || normHeader.includes(normalizedPat)) {
          return original;
        }
      }
    }
    return '';
  };

  mapping.prompt = findMatch([
    'cauhoi',
    'câu hỏi',
    'question',
    'prompt',
    'debai',
    'noidung',
  ]);
  mapping.optionA = findMatch([
    'dapana',
    'đáp án a',
    'optiona',
    'caua',
    'a',
  ]);
  mapping.optionB = findMatch([
    'dapanb',
    'đáp án b',
    'optionb',
    'caub',
    'b',
  ]);
  mapping.optionC = findMatch([
    'dapanc',
    'đáp án c',
    'optionc',
    'cauc',
    'c',
  ]);
  mapping.optionD = findMatch([
    'dapand',
    'đáp án d',
    'optiond',
    'caud',
    'd',
  ]);
  mapping.correctAnswer = findMatch([
    'dapandung',
    'đáp án đúng',
    'correct',
    'answer',
    'dapan',
    'key',
  ]);
  mapping.difficulty = findMatch([
    'dokho',
    'độ khó',
    'difficulty',
    'level',
    'mucdo',
  ]);
  mapping.timeLimitSec = findMatch([
    'thoigiangiay',
    'thời gian',
    'thoigian',
    'time',
    'seconds',
    'duration',
  ]);
  mapping.roundNumber = findMatch([
    'aiso',
    'ải số',
    'vong',
    'round',
    'stt',
    'order',
  ]);

  return mapping;
}

/**
 * Fisher-Yates array shuffle.
 */
function shuffleArray<T>(array: T[]): T[] {
  const out = [...array];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Parses raw Excel rows using the specified ColumnMapping and performs:
 * - Answer key resolution (A/B/C/D, 1/2/3/4, or exact text)
 * - Validation & error reporting
 * - Accurate answer shuffling keeping the right answer intact
 */
export function parseQuestionsFromRows(
  rows: Record<string, unknown>[],
  mapping: ColumnMapping,
  shuffleAnswers: boolean
): ExcelQuestionRow[] {
  const results: ExcelQuestionRow[] = [];

  rows.forEach((row, index) => {
    const rawPrompt = String(row[mapping.prompt] ?? '').trim();
    const rawA = String(row[mapping.optionA] ?? '').trim();
    const rawB = String(row[mapping.optionB] ?? '').trim();
    const rawC = String(row[mapping.optionC] ?? '').trim();
    const rawD = String(row[mapping.optionD] ?? '').trim();
    const rawCorrect = String(row[mapping.correctAnswer] ?? '').trim();
    const rawDiff = Number(row[mapping.difficulty]);
    const rawTime = Number(row[mapping.timeLimitSec]);
    const rawRound = Number(row[mapping.roundNumber]);

    // Skip empty lines
    if (!rawPrompt && !rawA && !rawB && !rawC && !rawD) {
      return;
    }

    const errors: string[] = [];

    if (!rawPrompt) {
      errors.push('Thiếu nội dung câu hỏi.');
    }
    if (!rawA) errors.push('Thiếu đáp án A.');
    if (!rawB) errors.push('Thiếu đáp án B.');
    if (!rawC) errors.push('Thiếu đáp án C.');
    if (!rawD) errors.push('Thiếu đáp án D.');

    const originalOptions: [string, string, string, string] = [
      rawA || 'Lựa chọn A',
      rawB || 'Lựa chọn B',
      rawC || 'Lựa chọn C',
      rawD || 'Lựa chọn D',
    ];

    // Determine correctIndex
    let correctIndex = -1;
    const normCorrect = normalizeHeader(rawCorrect);

    if (normCorrect === 'a' || normCorrect === '1' || normCorrect === 'dapana') {
      correctIndex = 0;
    } else if (normCorrect === 'b' || normCorrect === '2' || normCorrect === 'dapanb') {
      correctIndex = 1;
    } else if (normCorrect === 'c' || normCorrect === '3' || normCorrect === 'dapanc') {
      correctIndex = 2;
    } else if (normCorrect === 'd' || normCorrect === '4' || normCorrect === 'dapand') {
      correctIndex = 3;
    } else {
      // Check if text matches one of the options
      const matchIdx = originalOptions.findIndex(
        (opt) => opt.toLowerCase().trim() === rawCorrect.toLowerCase().trim()
      );
      if (matchIdx !== -1) {
        correctIndex = matchIdx;
      }
    }

    if (correctIndex === -1) {
      errors.push(
        `Không xác định được đáp án đúng từ giá trị "${rawCorrect}". Hãy nhập A, B, C, D hoặc nội dung đáp án.`
      );
    }

    let finalOptions: [string, string, string, string] = [...originalOptions];

    // Accurate shuffling: shuffle options and track the correct answer
    if (shuffleAnswers && correctIndex !== -1) {
      const correctText = originalOptions[correctIndex];
      const shuffled = shuffleArray(originalOptions);
      const newCorrectIndex = shuffled.findIndex((opt) => opt === correctText);
      finalOptions = [shuffled[0], shuffled[1], shuffled[2], shuffled[3]];
      correctIndex = newCorrectIndex !== -1 ? newCorrectIndex : 0;
    }

    const difficulty = Math.max(1, Math.min(10, Number.isFinite(rawDiff) && rawDiff > 0 ? Math.round(rawDiff) : 7));
    const timeLimitSec = Math.max(5, Math.min(120, Number.isFinite(rawTime) && rawTime > 0 ? Math.round(rawTime) : 20));
    const roundNumber = Number.isFinite(rawRound) && rawRound > 0 ? Math.round(rawRound) : index + 1;

    results.push({
      stt: index + 1,
      prompt: rawPrompt,
      options: finalOptions,
      correctAnswerRaw: rawCorrect,
      correctIndex: correctIndex !== -1 ? correctIndex : 0,
      difficulty,
      timeLimitSec,
      roundNumber,
      isValid: errors.length === 0,
      errors,
    });
  });

  return results;
}

const SUITS_CYCLE: CardSuit[] = ['spades', 'diamonds', 'hearts', 'clubs'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

/**
 * Converts validated ExcelQuestionRow array into ArenaQuestion array for gameplay.
 */
export function convertToArenaQuestions(
  rows: ExcelQuestionRow[],
  subject = 'Bộ câu hỏi Excel tùy chỉnh'
): ArenaQuestion[] {
  const validRows = rows.filter((r) => r.isValid);

  return validRows.map((r, i) => {
    const suit: CardSuit = r.suit || SUITS_CYCLE[i % SUITS_CYCLE.length];
    const rankIndex = Math.min(RANKS.length - 1, Math.max(0, r.difficulty + 2));
    const cardRank = RANKS[rankIndex] || `${r.difficulty}`;

    return {
      id: `excel-q-${Date.now()}-${i + 1}`,
      subject,
      suit,
      cardRank,
      difficulty: r.difficulty,
      topic: r.topic || `Thử thách Ải ${r.roundNumber || i + 1}`,
      prompt: r.prompt,
      options: r.options,
      correctIndex: r.correctIndex,
      explanation: `Đáp án chính xác là [${String.fromCharCode(65 + r.correctIndex)}]: ${
        r.options[r.correctIndex]
      }.`,
      dealerHint:
        suit === 'hearts'
          ? 'Quản trò thì thầm: Hãy tin vào phán đoán logic đầu tiên của ngươi.'
          : undefined,
      timeLimitMs: r.timeLimitSec * 1000,
      source: 'excel',
    };
  });
}
