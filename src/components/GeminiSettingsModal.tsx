import { useState, useEffect } from 'react';
import {
  X,
  Key,
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
  Cpu,
  Eye,
  EyeOff,
  RefreshCw,
  Trash2,
  Sparkles,
} from 'lucide-react';
import {
  AI_MODELS,
  getStoredApiKey,
  getStoredModel,
  setStoredApiKey,
  setStoredModel,
  removeStoredApiKey,
  testGeminiApiKey,
  type AiModelCard,
} from '../lib/geminiService';

interface GeminiSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: (apiKey: string, model: string) => void;
  requireKey?: boolean;
}

export function GeminiSettingsModal({
  isOpen,
  onClose,
  onSaved,
  requireKey = false,
}: GeminiSettingsModalProps) {
  const [apiKeyInput, setApiKeyInput] = useState<string>('');
  const [selectedModel, setSelectedModel] = useState<string>('gemini-3-flash-preview');
  const [showKey, setShowKey] = useState<boolean>(false);
  const [isTesting, setIsTesting] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string; rawError?: string } | null>(null);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      const currentKey = getStoredApiKey();
      const currentModel = getStoredModel();
      setApiKeyInput(currentKey);
      setSelectedModel(currentModel);
      setTestResult(null);
      setSaveNotice(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleTestKey = async () => {
    const key = apiKeyInput.trim();
    if (!key) {
      setTestResult({
        ok: false,
        message: 'Vui lòng nhập API Key trước khi kiểm tra.',
      });
      return;
    }

    setIsTesting(true);
    setTestResult(null);
    setSaveNotice(null);

    const result = await testGeminiApiKey(key, selectedModel);
    setIsTesting(false);
    setTestResult(result);
  };

  const handleSave = () => {
    const key = apiKeyInput.trim();
    setStoredApiKey(key);
    setStoredModel(selectedModel);
    setSaveNotice('Đã lưu thành công cấu hình Model & API Key vào trình duyệt!');
    onSaved?.(key, selectedModel);

    setTimeout(() => {
      onClose();
    }, 900);
  };

  const handleClear = () => {
    removeStoredApiKey();
    setApiKeyInput('');
    setTestResult(null);
    setSaveNotice('Đã xóa API Key khỏi bộ nhớ trình duyệt.');
  };

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget && !requireKey) {
      onClose();
    }
  };

  return (
    <div
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-2xl bg-[#0F1218] border-2 border-white/20 shadow-2xl p-6 sm:p-8 space-y-6 relative overflow-hidden text-left">
        {/* Neon corner decorative lines */}
        <div className="absolute top-0 left-0 w-8 h-1 bg-red-600" />
        <div className="absolute top-0 left-0 w-1 h-8 bg-red-600" />
        <div className="absolute bottom-0 right-0 w-8 h-1 bg-red-600" />
        <div className="absolute bottom-0 right-0 w-1 h-8 bg-red-600" />

        {/* Modal Header */}
        <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-red-600/20 border border-red-500/40 text-red-500">
              <Key className="w-6 h-6" />
            </div>
            <div>
              <h2 className="font-display text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                Thiết Lập Model & API Key
              </h2>
              <p className="font-mono text-xs text-slate-400 mt-0.5">
                Google Gemini Engine · Cơ chế Fallback Tự động
              </p>
            </div>
          </div>

          {!requireKey && (
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              title="Đóng modal"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Instruction Banner & Link */}
        <div className="border border-red-500/30 bg-red-950/20 p-4 space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-red-400">
            <Sparkles className="w-4 h-4 text-red-400 shrink-0" />
            <span>LẤY API KEY ĐỂ SỬ DỤNG TẤT CẢ TÍNH NĂNG AI TRONG APP</span>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            Google cung cấp hạn mức miễn phí mỗi ngày. Bạn có thể lấy API Key trực tiếp trong 30 giây tại Google AI Studio:
          </p>
          <a
            href="https://aistudio.google.com/api-keys"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-mono font-bold text-red-400 hover:text-red-300 underline underline-offset-4 decoration-red-500/60 transition-colors"
          >
            <span>https://aistudio.google.com/api-keys</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>

        {/* Model Selection Cards */}
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-mono font-semibold uppercase tracking-wider text-slate-300">
              1. Chọn Model AI Hoạt Động (Cards)
            </span>
            <span className="text-slate-500 text-[11px]">
              Tự động fallback nếu model quá tải
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {AI_MODELS.map((model: AiModelCard) => {
              const isSelected = selectedModel === model.id;
              return (
                <div
                  key={model.id}
                  onClick={() => setSelectedModel(model.id)}
                  className={`p-3.5 border transition-all cursor-pointer relative flex flex-col justify-between ${
                    isSelected
                      ? 'border-red-500 bg-red-950/25 shadow-[0_0_15px_rgba(239,68,68,0.25)] ring-1 ring-red-500'
                      : 'border-white/10 bg-[#12151C] hover:border-white/30 text-slate-400'
                  }`}
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-1">
                      <span
                        className={`text-[10px] font-mono px-1.5 py-0.5 font-bold uppercase ${
                          isSelected
                            ? 'bg-red-500 text-white'
                            : 'bg-white/10 text-slate-300'
                        }`}
                      >
                        {model.badge}
                      </span>
                      {isSelected && (
                        <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                      )}
                    </div>
                    <p className={`font-mono text-xs font-bold ${isSelected ? 'text-white' : 'text-slate-200'}`}>
                      {model.name}
                    </p>
                    <p className="text-[11px] text-slate-400 leading-snug">
                      {model.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* API Key Input Section */}
        <div className="space-y-2">
          <label htmlFor="gemini-api-key-input" className="block text-xs font-mono font-semibold uppercase tracking-wider text-slate-300">
            2. Nhập Google Gemini API Key
          </label>
          <div className="relative flex items-center">
            <input
              id="gemini-api-key-input"
              type={showKey ? 'text' : 'password'}
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              placeholder="Dán mã API Key của bạn (bắt đầu bằng AIzaSy...)"
              className="w-full h-11 pl-3.5 pr-24 bg-[#090A0D] border border-white/20 text-sm font-mono text-white placeholder:text-slate-600 focus:border-red-500 focus:outline-none transition-colors"
            />
            <div className="absolute right-2 flex items-center gap-1">
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="p-1.5 text-slate-400 hover:text-white transition-colors"
                title={showKey ? 'Ẩn key' : 'Hiện key'}
              >
                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <p className="text-[11px] text-slate-500">
            Khóa API được lưu cục bộ trong <code className="text-slate-400">localStorage</code> của trình duyệt. Không bao giờ gửi về máy chủ bên thứ ba.
          </p>
        </div>

        {/* Test Result / Feedback Messages */}
        {testResult && (
          <div
            className={`p-3.5 border text-xs leading-relaxed ${
              testResult.ok
                ? 'border-emerald-500/50 bg-emerald-950/30 text-emerald-200'
                : 'border-red-500/60 bg-red-950/40 text-red-200'
            }`}
          >
            <div className="flex items-start gap-2">
              {testResult.ok ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              )}
              <div className="space-y-1">
                <p className="font-semibold">{testResult.message}</p>
                {testResult.rawError && (
                  <p className="font-mono text-[11px] text-red-300 break-all bg-black/40 p-2 border border-red-500/20">
                    {testResult.rawError}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {saveNotice && (
          <div className="p-3 border border-emerald-500/50 bg-emerald-950/30 text-emerald-300 text-xs font-medium flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{saveNotice}</span>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-white/10">
          <div>
            {apiKeyInput && (
              <button
                type="button"
                onClick={handleClear}
                className="h-10 px-3 border border-red-500/30 text-red-400 hover:bg-red-950/30 hover:border-red-500 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Xóa Key</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={isTesting || !apiKeyInput.trim()}
              onClick={handleTestKey}
              className="h-10 px-4 border border-white/20 bg-[#12151C] hover:bg-white hover:text-[#090A0D] disabled:opacity-40 text-white text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin' : ''}`} />
              <span>{isTesting ? 'Đang kiểm tra...' : 'Kiểm tra Kết nối'}</span>
            </button>

            <button
              type="button"
              onClick={handleSave}
              className="h-10 px-6 bg-red-600 hover:bg-red-500 text-white text-xs font-bold tracking-wider uppercase flex items-center gap-2 transition-colors shadow-[0_0_15px_rgba(239,68,68,0.4)] cursor-pointer"
            >
              <Cpu className="w-4 h-4" />
              <span>Lưu Cài Đặt</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
