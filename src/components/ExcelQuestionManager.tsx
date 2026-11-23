import { useState, useRef, useId } from 'react';
import {
  Download,
  Upload,
  FileSpreadsheet,
  Shuffle,
  CheckCircle2,
  AlertTriangle,
  Layers,
  ArrowRight,
  Database,
  Trash2,
} from 'lucide-react';
import {
  downloadQuestionTemplate,
  readExcelWorkbook,
  detectColumnMapping,
  parseQuestionsFromRows,
  convertToArenaQuestions,
} from '../lib/excelImporter';
import { useGameStore } from '../store/gameStore';
import type { ColumnMapping, ExcelQuestionRow } from '../types/game';

interface ExcelQuestionManagerProps {
  onLoaded?: (count: number) => void;
}

export function ExcelQuestionManager({ onLoaded }: ExcelQuestionManagerProps) {
  const room = useGameStore((s) => s.room);
  const applyCustomDeckToRoom = useGameStore((s) => s.applyCustomDeckToRoom);
  const setCustomDeck = useGameStore((s) => s.setCustomDeck);
  const fileInputId = useId();

  const [fileName, setFileName] = useState<string | null>(null);
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string>('');
  const [sheetData, setSheetData] = useState<Record<string, Record<string, unknown>[]>>({});
  const [availableHeaders, setAvailableHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>({
    prompt: '',
    optionA: '',
    optionB: '',
    optionC: '',
    optionD: '',
    correctAnswer: '',
    difficulty: '',
    timeLimitSec: '',
    roundNumber: '',
  });

  const [shuffleAnswers, setShuffleAnswers] = useState<boolean>(true);
  const [parsedRows, setParsedRows] = useState<ExcelQuestionRow[]>([]);
  const [loadingFile, setLoadingFile] = useState<boolean>(false);
  const [loadNotice, setLoadNotice] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (file: File) => {
    if (!file.name.match(/\.(xlsx|xls)$/i)) {
      alert('Vui lòng chọn file định dạng Excel (.xlsx hoặc .xls)');
      return;
    }

    setLoadingFile(true);
    setLoadNotice(null);

    try {
      const { sheetNames: names, sheets } = await readExcelWorkbook(file);
      setFileName(file.name);
      setSheetNames(names);
      setSheetData(sheets);

      const firstSheet = names[0] || '';
      setSelectedSheet(firstSheet);

      const firstSheetRows = sheets[firstSheet] || [];
      const headers = firstSheetRows.length > 0 ? Object.keys(firstSheetRows[0]) : [];
      setAvailableHeaders(headers);

      // Auto detect mapping
      const autoMap = detectColumnMapping(headers);
      setMapping(autoMap);

      // Parse with auto detected mapping
      const parsed = parseQuestionsFromRows(firstSheetRows, autoMap, shuffleAnswers);
      setParsedRows(parsed);
    } catch (err) {
      alert('Không thể đọc file Excel: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setLoadingFile(false);
    }
  };

  const handleSheetChange = (sheet: string) => {
    setSelectedSheet(sheet);
    const rows = sheetData[sheet] || [];
    const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
    setAvailableHeaders(headers);
    const autoMap = detectColumnMapping(headers);
    setMapping(autoMap);
    const parsed = parseQuestionsFromRows(rows, autoMap, shuffleAnswers);
    setParsedRows(parsed);
  };

  const handleMappingChange = (field: keyof ColumnMapping, value: string) => {
    const updated = { ...mapping, [field]: value };
    setMapping(updated);
    const rows = sheetData[selectedSheet] || [];
    const parsed = parseQuestionsFromRows(rows, updated, shuffleAnswers);
    setParsedRows(parsed);
  };

  const handleShuffleToggle = (checked: boolean) => {
    setShuffleAnswers(checked);
    const rows = sheetData[selectedSheet] || [];
    const parsed = parseQuestionsFromRows(rows, mapping, checked);
    setParsedRows(parsed);
  };

  const handleLoadToArena = () => {
    const validRows = parsedRows.filter((r) => r.isValid);
    if (validRows.length === 0) {
      alert('Chưa có câu hỏi hợp lệ nào để nạp vào phòng.');
      return;
    }

    const arenaQuestions = convertToArenaQuestions(
      validRows,
      room?.subject || 'Bộ câu hỏi Excel tùy chỉnh'
    );

    setCustomDeck(arenaQuestions);
    applyCustomDeckToRoom(arenaQuestions);

    setLoadNotice(
      `Đã nạp thành công ${arenaQuestions.length} câu hỏi tùy chỉnh vào phòng đấu${
        room ? ` ${room.roomCode}` : ''
      }. Khi trận đấu bắt đầu, toàn bộ các ải sẽ sử dụng bộ câu hỏi này.`
    );

    if (onLoaded) {
      onLoaded(arenaQuestions.length);
    }
  };

  const validCount = parsedRows.filter((r) => r.isValid).length;
  const invalidCount = parsedRows.length - validCount;

  return (
    <div className="space-y-6 border border-white/10 bg-[#12151C] p-6">
      {/* Top action row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 bg-emerald-950/60 border border-emerald-500/40 text-emerald-400">
              <FileSpreadsheet className="w-4 h-4" />
            </span>
            <h2 className="font-display text-2xl font-bold text-white">
              Tải Lên Bộ Câu Hỏi Bằng Excel
            </h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Hỗ trợ file <code className="text-slate-300">.xlsx</code>, <code className="text-slate-300">.xls</code>. Tự động nhận diện cột, cho phép gán bảng và xáo trộn vị trí đáp án ngẫu nhiên.
          </p>
        </div>

        <button
          type="button"
          onClick={downloadQuestionTemplate}
          className="h-10 px-4 border border-white/20 bg-[#090A0D] hover:bg-white hover:text-black text-xs font-semibold text-slate-200 flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Download className="w-4 h-4 text-emerald-400" />
          <span>Tải file Excel mẫu (.xlsx)</span>
        </button>
      </div>

      {/* Upload Zone */}
      {!fileName ? (
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            if (e.dataTransfer.files && e.dataTransfer.files[0]) {
              void handleFileUpload(e.dataTransfer.files[0]);
            }
          }}
          className="border-2 border-dashed border-white/20 hover:border-red-500/60 bg-[#090A0D] p-8 text-center transition-colors cursor-pointer group"
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            id={fileInputId}
            ref={fileInputRef}
            type="file"
            accept=".xlsx, .xls"
            onChange={(e) => {
              if (e.target.files && e.target.files[0]) {
                void handleFileUpload(e.target.files[0]);
              }
            }}
            className="hidden"
          />
          <div className="flex flex-col items-center justify-center gap-3">
            <div className="p-3.5 border border-white/10 bg-[#12151C] group-hover:border-red-500/50 transition-colors">
              <Upload className="w-6 h-6 text-red-500" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">
                Kéo thả file Excel vào đây, hoặc nhấn để chọn file
              </p>
              <p className="text-xs text-slate-400 mt-1">
                Định dạng hỗ trợ: .xlsx, .xls (Tối đa 50 câu hỏi mỗi bộ)
              </p>
            </div>
            {loadingFile && (
              <span className="text-xs font-mono text-amber-400">Đang đọc dữ liệu bảng tính...</span>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          {/* File & Sheet status banner */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 border border-white/10 bg-[#090A0D]">
            <div className="flex items-center gap-3">
              <FileSpreadsheet className="w-5 h-5 text-emerald-400 shrink-0" />
              <div>
                <span className="text-xs font-semibold text-white">{fileName}</span>
                <span className="text-[11px] font-mono text-slate-400 ml-2">
                  ({parsedRows.length} dòng dữ liệu)
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {sheetNames.length > 1 && (
                <div className="flex items-center gap-2">
                  <label htmlFor="sheet-select" className="text-xs text-slate-400 font-medium">
                    Bảng (Sheet):
                  </label>
                  <select
                    id="sheet-select"
                    value={selectedSheet}
                    onChange={(e) => handleSheetChange(e.target.value)}
                    className="h-8 px-2.5 bg-[#12151C] border border-white/20 text-xs text-white"
                  >
                    {sheetNames.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <button
                type="button"
                onClick={() => {
                  setFileName(null);
                  setParsedRows([]);
                  setLoadNotice(null);
                }}
                className="px-2.5 py-1.5 border border-white/10 hover:border-red-500/50 hover:bg-red-950/20 text-slate-400 hover:text-red-300 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                title="Chọn file khác"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Đổi file</span>
              </button>
            </div>
          </div>

          {/* Column Mapping Section */}
          <div className="border border-white/10 bg-[#0D1016] p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/10 pb-2">
              <span className="text-xs font-semibold text-white flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-amber-400" />
                Gán Cột Bảng Tính (Column Mapping)
              </span>
              <span className="text-[11px] font-mono text-slate-400">
                Tự động nhận diện sẵn nếu khớp tên mẫu
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">Cột Câu hỏi (*)</label>
                <select
                  value={mapping.prompt}
                  onChange={(e) => handleMappingChange('prompt', e.target.value)}
                  className="w-full h-8 px-2 bg-[#12151C] border border-white/20 text-white font-mono text-xs"
                >
                  <option value="">-- Chọn cột --</option>
                  {availableHeaders.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Đáp án A (*)</label>
                <select
                  value={mapping.optionA}
                  onChange={(e) => handleMappingChange('optionA', e.target.value)}
                  className="w-full h-8 px-2 bg-[#12151C] border border-white/20 text-white font-mono text-xs"
                >
                  <option value="">-- Chọn cột --</option>
                  {availableHeaders.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Đáp án B (*)</label>
                <select
                  value={mapping.optionB}
                  onChange={(e) => handleMappingChange('optionB', e.target.value)}
                  className="w-full h-8 px-2 bg-[#12151C] border border-white/20 text-white font-mono text-xs"
                >
                  <option value="">-- Chọn cột --</option>
                  {availableHeaders.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Đáp án C (*)</label>
                <select
                  value={mapping.optionC}
                  onChange={(e) => handleMappingChange('optionC', e.target.value)}
                  className="w-full h-8 px-2 bg-[#12151C] border border-white/20 text-white font-mono text-xs"
                >
                  <option value="">-- Chọn cột --</option>
                  {availableHeaders.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Đáp án D (*)</label>
                <select
                  value={mapping.optionD}
                  onChange={(e) => handleMappingChange('optionD', e.target.value)}
                  className="w-full h-8 px-2 bg-[#12151C] border border-white/20 text-white font-mono text-xs"
                >
                  <option value="">-- Chọn cột --</option>
                  {availableHeaders.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Đáp án Đúng (*)</label>
                <select
                  value={mapping.correctAnswer}
                  onChange={(e) => handleMappingChange('correctAnswer', e.target.value)}
                  className="w-full h-8 px-2 bg-[#12151C] border border-white/20 text-white font-mono text-xs"
                >
                  <option value="">-- Chọn cột --</option>
                  {availableHeaders.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Độ khó (1-10)</label>
                <select
                  value={mapping.difficulty}
                  onChange={(e) => handleMappingChange('difficulty', e.target.value)}
                  className="w-full h-8 px-2 bg-[#12151C] border border-white/20 text-white font-mono text-xs"
                >
                  <option value="">(Mặc định 7)</option>
                  {availableHeaders.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Thời gian (Giây)</label>
                <select
                  value={mapping.timeLimitSec}
                  onChange={(e) => handleMappingChange('timeLimitSec', e.target.value)}
                  className="w-full h-8 px-2 bg-[#12151C] border border-white/20 text-white font-mono text-xs"
                >
                  <option value="">(Mặc định 20s)</option>
                  {availableHeaders.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Ải số / STT</label>
                <select
                  value={mapping.roundNumber}
                  onChange={(e) => handleMappingChange('roundNumber', e.target.value)}
                  className="w-full h-8 px-2 bg-[#12151C] border border-white/20 text-white font-mono text-xs"
                >
                  <option value="">(Tự động tăng)</option>
                  {availableHeaders.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>

              {/* Shuffling control toggle */}
              <div className="flex flex-col justify-end">
                <label className="flex items-center gap-2 cursor-pointer py-1.5">
                  <input
                    type="checkbox"
                    checked={shuffleAnswers}
                    onChange={(e) => handleShuffleToggle(e.target.checked)}
                    className="w-4 h-4 accent-red-600 rounded cursor-pointer"
                  />
                  <span className="text-white font-medium flex items-center gap-1">
                    <Shuffle className="w-3.5 h-3.5 text-red-400" />
                    Đảo vị trí 4 đáp án
                  </span>
                </label>
              </div>
            </div>
          </div>

          {/* Validation Summary & Load Button */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 border border-white/10 bg-[#090A0D]">
            <div className="flex items-center gap-4 text-xs font-mono">
              <span className="flex items-center gap-1.5 text-emerald-400">
                <CheckCircle2 className="w-4 h-4" />
                Hợp lệ: <b>{validCount}</b> câu
              </span>
              {invalidCount > 0 && (
                <span className="flex items-center gap-1.5 text-red-400">
                  <AlertTriangle className="w-4 h-4" />
                  Lỗi / Thiếu: <b>{invalidCount}</b> câu
                </span>
              )}
            </div>

            <button
              type="button"
              disabled={validCount === 0}
              onClick={handleLoadToArena}
              className="h-11 px-5 bg-red-600 hover:bg-red-500 disabled:opacity-40 text-white text-xs font-semibold tracking-wide flex items-center justify-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Database className="w-4 h-4" />
              <span>Nạp {validCount} câu vào Phòng Đấu trường</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {loadNotice && (
            <div className="p-3.5 border border-emerald-500/40 bg-emerald-950/30 text-xs text-emerald-200 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{loadNotice}</span>
            </div>
          )}

          {/* Preview Table */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider font-mono">
              Bảng Xem Trước & Kiểm Tra Lỗi ({parsedRows.length} câu)
            </h3>

            <div className="border border-white/10 bg-[#090A0D] overflow-x-auto max-h-[360px] divide-y divide-white/10">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="sticky top-0 bg-[#12151C] border-b border-white/10 text-[11px] font-mono text-slate-400 uppercase">
                  <tr>
                    <th className="py-2.5 px-3 w-14">Ải</th>
                    <th className="py-2.5 px-3">Nội dung câu hỏi</th>
                    <th className="py-2.5 px-3">4 Lựa chọn (Đáp án đúng màu xanh)</th>
                    <th className="py-2.5 px-3 w-28">Độ khó / Giây</th>
                    <th className="py-2.5 px-3 w-32">Kiểm tra</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {parsedRows.map((r) => (
                    <tr
                      key={r.stt}
                      className={
                        r.isValid
                          ? 'hover:bg-white/[0.02] transition-colors'
                          : 'bg-red-950/20 hover:bg-red-950/30 transition-colors'
                      }
                    >
                      <td className="py-3 px-3 font-mono text-slate-400 tabular-nums">
                        #{r.roundNumber || r.stt}
                      </td>

                      <td className="py-3 px-3 text-white font-medium max-w-sm">
                        <p className="line-clamp-2">{r.prompt || <i className="text-red-400">Trống</i>}</p>
                      </td>

                      <td className="py-3 px-3 max-w-md">
                        <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                          {r.options.map((opt, optIdx) => {
                            const isCorrect = optIdx === r.correctIndex;
                            return (
                              <div
                                key={optIdx}
                                className={`px-2 py-1 rounded-xs border truncate ${
                                  isCorrect
                                    ? 'border-emerald-500/60 bg-emerald-950/40 text-emerald-200 font-semibold'
                                    : 'border-white/10 bg-[#12151C] text-slate-400'
                                }`}
                              >
                                <b className="mr-1">{String.fromCharCode(65 + optIdx)}.</b>
                                {opt}
                              </div>
                            );
                          })}
                        </div>
                      </td>

                      <td className="py-3 px-3 font-mono text-slate-400 text-[11px]">
                        <div>Khó: {r.difficulty}/10</div>
                        <div>TG: {r.timeLimitSec}s</div>
                      </td>

                      <td className="py-3 px-3">
                        {r.isValid ? (
                          <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400 font-medium">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Hợp lệ
                          </span>
                        ) : (
                          <div className="space-y-0.5">
                            {r.errors.map((err, ei) => (
                              <div
                                key={ei}
                                className="text-[10px] text-red-300 flex items-start gap-1"
                              >
                                <AlertTriangle className="w-3 h-3 text-red-400 shrink-0 mt-0.5" />
                                <span>{err}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
