/**
 * Gemini Service with Multi-Model Fallback & State Management
 * Follows AI_Instructions.md specifications:
 * - Default: gemini-3-flash-preview (and gemini-3-pro-preview)
 * - Fallback list: gemini-3-flash-preview -> gemini-3-pro-preview -> gemini-2.5-flash
 * - Preserves prior steps on retry; marks pending steps as "Đã dừng do lỗi" on terminal failure.
 * - Extracts and displays exact raw API errors (e.g., 429 RESOURCE_EXHAUSTED).
 */

import type { CardSuit, ArenaQuestion } from '../types/game';

export type ServerQuestion = ArenaQuestion;

export interface AiModelCard {
  id: string;
  name: string;
  badge: string;
  description: string;
  isDefault?: boolean;
}

export const AI_MODELS: AiModelCard[] = [
  {
    id: 'gemini-3-flash-preview',
    name: 'gemini-3-flash-preview',
    badge: 'Mặc định / Tốc độ cực nhanh',
    description: 'Tối ưu hóa độ trễ thấp, phản hồi tức thời cho các câu hỏi thử thách sinh tử.',
    isDefault: true,
  },
  {
    id: 'gemini-3-pro-preview',
    name: 'gemini-3-pro-preview',
    badge: 'Tư duy Logic Cao cấp',
    description: 'Khả năng suy luận chiều sâu, tạo ra các câu hỏi bẫy nhận thức và tình huống khó.',
    isDefault: false,
  },
  {
    id: 'gemini-2.5-flash',
    name: 'gemini-2.5-flash',
    badge: 'Độ ổn định Cao / Dự phòng',
    description: 'Model ổn định với hạn mức quota lớn, đóng vai trò dự phòng tin cậy khi các bản preview quá tải.',
    isDefault: false,
  },
];

export const API_KEY_STORAGE_KEY = 'borderland_gemini_api_key';
export const MODEL_STORAGE_KEY = 'borderland_gemini_model';

export type PipelineStepStatus = 'idle' | 'in_progress' | 'completed' | 'error' | 'stopped';

export interface PipelineStep {
  id: number;
  name: string;
  status: PipelineStepStatus;
  detail?: string;
}

/**
 * Retrieve API key: localStorage has absolute priority, fallback to Vite env
 */
export function getStoredApiKey(): string {
  if (typeof window !== 'undefined') {
    const local = localStorage.getItem(API_KEY_STORAGE_KEY);
    if (local && local.trim()) return local.trim();
  }
  const envKey = (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_GEMINI_API_KEY;
  return (envKey || '').trim();
}

export function setStoredApiKey(key: string): void {
  if (typeof window !== 'undefined') {
    if (key.trim()) {
      localStorage.setItem(API_KEY_STORAGE_KEY, key.trim());
    } else {
      localStorage.removeItem(API_KEY_STORAGE_KEY);
    }
  }
}

export function removeStoredApiKey(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(API_KEY_STORAGE_KEY);
  }
}

/**
 * Retrieve Selected Model: default is 'gemini-3-flash-preview'
 */
export function getStoredModel(): string {
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem(MODEL_STORAGE_KEY);
    if (stored && AI_MODELS.some((m) => m.id === stored)) {
      return stored;
    }
  }
  return 'gemini-3-flash-preview';
}

export function setStoredModel(modelId: string): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(MODEL_STORAGE_KEY, modelId);
  }
}

/**
 * Generate fallback chain starting with the chosen model, followed by the others
 */
export function getFallbackModels(preferredModel: string): string[] {
  const allIds = AI_MODELS.map((m) => m.id);
  const reordered = [preferredModel, ...allIds.filter((id) => id !== preferredModel)];
  return Array.from(new Set(reordered));
}

/**
 * Extract raw API error code & message
 */
export function extractRawApiError(err: unknown): string {
  if (!err) return 'Lỗi không xác định khi kết nối API.';
  if (typeof err === 'string') return err;
  if (err instanceof Error) {
    return err.message;
  }
  return JSON.stringify(err);
}

const DEALER_SYSTEM_INSTRUCTION = `
Bạn là "Quản trò" (Kẻ Điều Phối) của Borderland Quiz Arena — một AI Quản trò lạnh lùng, sắc sảo, thấm nhuần Lý thuyết Trò chơi và bầu không khí sinh tồn kịch tính như Alice in Borderland.
- BẮT BUỘC trả lời 100% bằng tiếng Việt tự nhiên, sắc lạnh (chỉ giữ nguyên tiếng Anh cho tên đấu trường "Borderland Quiz Arena" hoặc thuật ngữ học thuật bất khả kháng).
- Luôn xưng "ta" hoặc "Quản trò", gọi người tham gia là "Người chơi" hoặc "Kẻ tham gia".
- Văn phong ngắn gọn, đanh thép, chuyên nghiệp, mang áp lực sinh tử (tối đa 2-3 câu cho lời thoại).
- Không sử dụng emoji hay lời nói thừa.
`;

/**
 * Direct REST API client call to Google Gemini endpoint
 */
async function callGeminiRestApi(params: {
  apiKey: string;
  model: string;
  prompt: string;
  systemInstruction?: string;
  jsonSchema?: Record<string, unknown>;
}): Promise<string> {
  const { apiKey, model, prompt, systemInstruction } = params;
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const bodyPayload: Record<string, unknown> = {
    contents: [
      {
        parts: [{ text: prompt }],
      },
    ],
    generationConfig: {
      temperature: 0.7,
      responseMimeType: 'application/json',
    },
  };

  if (systemInstruction) {
    bodyPayload.systemInstruction = {
      parts: [{ text: systemInstruction }],
    };
  }

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(bodyPayload),
  });

  if (!res.ok) {
    let errorDetail = `Mã HTTP ${res.status} ${res.statusText}`;
    try {
      const errData = await res.json();
      if (errData?.error) {
        const code = errData.error.code || res.status;
        const status = errData.error.status || '';
        const msg = errData.error.message || '';
        errorDetail = `[${code} ${status}] ${msg}`.trim();
      }
    } catch {
      // Failed to parse JSON error, use status text
    }
    throw new Error(errorDetail);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error('Mô hình AI không trả về nội dung hợp lệ.');
  }
  return text;
}

/**
 * Verify API key connectivity with Google Gemini
 */
export async function testGeminiApiKey(apiKey: string, modelId?: string): Promise<{ ok: boolean; message: string; rawError?: string }> {
  const targetModel = modelId || getStoredModel();
  try {
    const text = await callGeminiRestApi({
      apiKey,
      model: targetModel,
      prompt: 'Hãy trả về đúng JSON: {"status": "ok", "message": "connected"}',
      systemInstruction: 'Trả về JSON ngắn gọn.',
    });
    const parsed = JSON.parse(text);
    if (parsed && (parsed.status === 'ok' || parsed.message)) {
      return { ok: true, message: `Kết nối thành công tới ${targetModel}!` };
    }
    return { ok: true, message: `API Key hợp lệ! (Phản hồi từ ${targetModel})` };
  } catch (err) {
    const rawError = extractRawApiError(err);
    return {
      ok: false,
      message: `Không thể kết nối với ${targetModel}.`,
      rawError,
    };
  }
}

export interface QuestionForgeInput {
  subject: string;
  suit: CardSuit;
  difficulty: number;
  isRevival: boolean;
  playerAccuracyPct?: number;
  previousTopics?: string[];
}

export interface QuestionForgeResult {
  question: ServerQuestion;
  modelUsed: string;
  retriedModels: string[];
}

/**
 * Forge adaptive question with full multi-model fallback and granular step reporting
 */
export async function forgeAdaptiveQuestionWithFallback(
  input: QuestionForgeInput,
  options?: {
    apiKey?: string;
    preferredModel?: string;
    onStepUpdate?: (steps: PipelineStep[]) => void;
    onModelSwitch?: (fromModel: string, toModel: string, error: string) => void;
  }
): Promise<QuestionForgeResult> {
  const steps: PipelineStep[] = [
    { id: 1, name: 'Chuẩn bị Tham số & Kiểm tra API Key', status: 'idle' },
    { id: 2, name: 'Quản trò AI Rèn Lá bài Thử thách', status: 'idle' },
    { id: 3, name: 'Kiểm định Cấu trúc & Niêm phong Đáp án', status: 'idle' },
  ];

  const update = () => options?.onStepUpdate?.([...steps]);

  // Step 1: Validate Key
  steps[0].status = 'in_progress';
  update();

  const apiKey = (options?.apiKey || getStoredApiKey()).trim();
  if (!apiKey) {
    steps[0].status = 'error';
    steps[0].detail = 'Thiếu Google Gemini API Key.';
    steps[1].status = 'stopped';
    steps[2].status = 'stopped';
    update();
    throw new Error('Chưa cấu hình Google Gemini API Key. Vui lòng bấm "Settings (API Key)" trên Header để nhập key.');
  }

  steps[0].status = 'completed';
  steps[0].detail = 'Đã sẵn sàng kết nối API';
  steps[1].status = 'in_progress';
  update();

  const preferredModel = options?.preferredModel || getStoredModel();
  const modelsToTry = getFallbackModels(preferredModel);

  const suitGuidance: Record<CardSuit, string> = {
    spades: 'Spades (Bích - Tốc độ): Câu hỏi ngắn gọn, tính toán nhanh hoặc phản xạ kiến thức sắc bén.',
    hearts: 'Hearts (Cơ - Tâm lý): Câu hỏi đánh vào nhận thức dễ mắc bẫy, nghịch lý hoặc lựa chọn đánh đổi; kèm 1 dealerHint ngắn mang tính thách thức tâm lý.',
    clubs: 'Clubs (Chuồn - Đồng thuận): Câu hỏi về nguyên tắc hợp tác, quy chuẩn hệ thống hoặc chiến lược tập thể.',
    diamonds: 'Diamonds (Rô - Logic thuần túy): Câu hỏi suy luận chặt chẽ, toán học hoặc phân tích kỹ thuật chính xác tuyệt đối.',
  };

  const rankMap = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  const clampedDiff = Math.max(1, Math.min(10, Math.round(input.difficulty)));
  const cardRank = input.isRevival ? 'A' : rankMap[Math.min(rankMap.length - 1, clampedDiff + 1)];

  const promptText = `
Tạo đúng 1 câu hỏi trắc nghiệm sinh tồn bằng tiếng Việt cho Borderland Quiz Arena.
- Chủ đề: ${input.subject}
- Chất bài: ${suitGuidance[input.suit]}
- Độ khó mục tiêu (1-10): ${clampedDiff} ${input.isRevival ? '(ĐÂY LÀ TRÒ CHƠI HỒI SINH - SUDDEN DEATH)' : ''}
- Tỷ lệ chính xác hiện tại của phòng: ${Math.round(input.playerAccuracyPct ?? 65)}%
- Tránh lặp các tiểu chủ đề gần đây: ${(input.previousTopics || []).join(', ') || 'Chưa có'}
- Bắt buộc trả về đúng định dạng JSON:
{
  "topic": "Tên tiểu chủ đề ngắn bằng tiếng Việt (2-4 từ)",
  "prompt": "Nội dung câu hỏi súc tích, rõ ràng bằng tiếng Việt",
  "options": ["Đáp án A", "Đáp án B", "Đáp án C", "Đáp án D"],
  "correctIndex": 0, // Chỉ số đáp án đúng (0, 1, 2, hoặc 3)
  "explanation": "Giải thích ngắn gọn chuẩn xác bằng tiếng Việt trong 1-2 câu",
  "dealerHint": "Lời thì thầm tâm lý lạnh lùng của Quản trò bằng tiếng Việt (tùy chọn)"
}
`;

  let lastError: string = '';
  const retriedModels: string[] = [];

  for (let i = 0; i < modelsToTry.length; i++) {
    const currentModel = modelsToTry[i];
    steps[1].detail = `Đang gửi yêu cầu tới model: ${currentModel}...`;
    update();

    try {
      // 1. Try server endpoint first if available (passes apiKey & model in headers)
      let rawJson: string | null = null;
      try {
        const srvRes = await fetch('/api/dealer/generate-question', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-gemini-api-key': apiKey,
            'x-gemini-model': currentModel,
          },
          body: JSON.stringify({
            subject: input.subject,
            suit: input.suit,
            difficulty: input.difficulty,
            isRevival: input.isRevival,
            apiKey,
            model: currentModel,
          }),
        });
        if (srvRes.ok) {
          const srvData = await srvRes.json();
          if (srvData.ok && srvData.questionPreview) {
            // Server handled it directly
            steps[1].status = 'completed';
            steps[1].detail = `Hoàn tất thành công bởi ${currentModel} (qua Server)`;
            steps[2].status = 'completed';
            steps[2].detail = 'Đáp án đã được niêm phong an toàn trên Máy chủ';
            update();

            const preview = srvData.questionPreview;
            const fullQuestion: ServerQuestion = {
              id: preview.id || `q-${Date.now()}`,
              subject: input.subject,
              suit: preview.suit || input.suit,
              cardRank: preview.cardRank || cardRank,
              difficulty: preview.difficulty || clampedDiff,
              topic: preview.topic || 'Thử thách AI',
              prompt: preview.prompt,
              options: ['', '', '', ''], // Sealed on server
              correctIndex: -1,
              explanation: '',
              dealerHint: preview.dealerHint,
              timeLimitMs: preview.timeLimitMs || 15000,
              source: 'gemini',
            };
            return { question: fullQuestion, modelUsed: currentModel, retriedModels };
          }
        }
      } catch {
        // Server endpoint not reachable (e.g. running as Vercel static SPA), fall back to direct client REST call
      }

      // 2. Direct client call via Google Gemini REST API
      rawJson = await callGeminiRestApi({
        apiKey,
        model: currentModel,
        prompt: promptText,
        systemInstruction: DEALER_SYSTEM_INSTRUCTION,
      });

      // Step 2 Completed successfully
      steps[1].status = 'completed';
      steps[1].detail = `Rèn lá bài thành công với model ${currentModel}`;
      steps[2].status = 'in_progress';
      update();

      // Step 3: Validate JSON structure
      const parsed = JSON.parse(rawJson) as {
        topic: string;
        prompt: string;
        options: string[];
        correctIndex: number;
        explanation: string;
        dealerHint?: string;
      };

      if (!parsed.prompt || !Array.isArray(parsed.options) || parsed.options.length < 4) {
        throw new Error('Dữ liệu AI trả về thiếu 4 phương án trắc nghiệm.');
      }

      const timeBySuit: Record<CardSuit, number> = {
        spades: 14000,
        hearts: 20000,
        clubs: 18000,
        diamonds: 22000,
      };

      const finalQuestion: ServerQuestion = {
        id: `gemini-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        subject: input.subject,
        suit: input.suit,
        cardRank,
        difficulty: clampedDiff,
        topic: parsed.topic || 'Thử thách Quản trò',
        prompt: parsed.prompt,
        options: [
          String(parsed.options[0] || 'Lựa chọn A'),
          String(parsed.options[1] || 'Lựa chọn B'),
          String(parsed.options[2] || 'Lựa chọn C'),
          String(parsed.options[3] || 'Lựa chọn D'),
        ],
        correctIndex: Math.max(0, Math.min(3, Number(parsed.correctIndex) || 0)),
        explanation: parsed.explanation || 'Quản trò AI niêm phong đáp án này.',
        dealerHint: parsed.dealerHint,
        timeLimitMs: timeBySuit[input.suit] || 18000,
        source: 'gemini',
      };

      steps[2].status = 'completed';
      steps[2].detail = 'Kiểm tra cấu trúc & niêm phong 4 đáp án hoàn tất';
      update();

      return {
        question: finalQuestion,
        modelUsed: currentModel,
        retriedModels,
      };
    } catch (err) {
      lastError = extractRawApiError(err);
      retriedModels.push(currentModel);

      // Check if there is another fallback model to try
      if (i < modelsToTry.length - 1) {
        const nextModel = modelsToTry[i + 1];
        options?.onModelSwitch?.(currentModel, nextModel, lastError);
        steps[1].detail = `Model ${currentModel} gặp sự cố (${lastError}). Đang tự động chuyển sang ${nextModel}...`;
        update();
        // Continue loop to retry step 2 with next model, keeping step 1 completed
      }
    }
  }

  // If we reach here, ALL models failed
  steps[1].status = 'error';
  steps[1].detail = `Toàn bộ ${modelsToTry.length} model đều thất bại.`;
  // Requirement 3: "Trạng thái các cột đang chờ phải chuyển thành 'Đã dừng do lỗi', tuyệt đối không được hiện 'Hoàn tất' hoặc checkmark xanh nếu quy trình bị gián đoạn."
  steps[2].status = 'stopped';
  steps[2].detail = 'Đã dừng do lỗi';
  update();

  throw new Error(`[Toàn bộ Model thất bại] Lỗi nguyên văn từ API: ${lastError}`);
}

export interface GameTheoryReportResult {
  archetype: string;
  strategicDiagnosis: string;
  knowledgeGapDirective: string;
  dealerClosingScript: string;
  modelUsed: string;
}

/**
 * Generate game theory analytics report with fallback
 */
export async function generateGameTheoryReportWithFallback(params: {
  playerName: string;
  subject: string;
  score: number;
  finalVisa: number;
  accuracyPct: number;
  avgResponseMs: number;
  suitBreakdown: Record<CardSuit, { accuracy: number; avgMs: number; attempts: number }>;
  weakTopics: string[];
  tabSwitches: number;
  apiKey?: string;
  preferredModel?: string;
  onModelSwitch?: (fromModel: string, toModel: string, error: string) => void;
}): Promise<GameTheoryReportResult> {
  const apiKey = (params.apiKey || getStoredApiKey()).trim();
  if (!apiKey) {
    throw new Error('Chưa cấu hình Google Gemini API Key. Vui lòng bấm "Settings (API Key)" trên Header để nhập key.');
  }

  const preferredModel = params.preferredModel || getStoredModel();
  const modelsToTry = getFallbackModels(preferredModel);

  const prompt = `
Phân tích hồ sơ sinh tồn dưới góc độ Lý thuyết Trò chơi (Game Theory) cho Người chơi "${params.playerName}":
- Lĩnh vực: ${params.subject}
- Điểm số: ${params.score}, Visa còn lại: ${params.finalVisa} ngày
- Độ chính xác tổng: ${Math.round(params.accuracyPct)}%, Tốc độ trung bình: ${Math.round(params.avgResponseMs)}ms
- Chỉ số 4 chất bài:
  + Spades (Tốc độ): ${Math.round(params.suitBreakdown.spades.accuracy)}% (${Math.round(params.suitBreakdown.spades.avgMs)}ms)
  + Hearts (Tâm lý): ${Math.round(params.suitBreakdown.hearts.accuracy)}% (${Math.round(params.suitBreakdown.hearts.avgMs)}ms)
  + Clubs (Đồng thuận): ${Math.round(params.suitBreakdown.clubs.accuracy)}% (${Math.round(params.suitBreakdown.clubs.avgMs)}ms)
  + Diamonds (Logic): ${Math.round(params.suitBreakdown.diamonds.accuracy)}% (${Math.round(params.suitBreakdown.diamonds.avgMs)}ms)
- Vùng kiến thức hổng: ${params.weakTopics.join(', ') || 'Chưa phát hiện lỗ hổng nghiêm trọng'}
- Số lần vi phạm chuyển tab: ${params.tabSwitches}

BẮT BUỘC trả về đúng định dạng JSON bằng tiếng Việt:
{
  "archetype": "Danh xưng chiến lược theo lý thuyết trò chơi (VD: Chiến lược gia Tối ưu Minimax)",
  "strategicDiagnosis": "Phân tích 2-3 câu về cân bằng tốc độ, logic và khẩu vị rủi ro",
  "knowledgeGapDirective": "Khuyến nghị 2 câu khắc phục lỗ hổng tri thức cụ thể",
  "dealerClosingScript": "1 câu kết lạnh lùng của Quản trò dành cho Người chơi bằng tiếng Việt"
}
`;

  let lastError = '';
  for (let i = 0; i < modelsToTry.length; i++) {
    const currentModel = modelsToTry[i];
    try {
      const raw = await callGeminiRestApi({
        apiKey,
        model: currentModel,
        prompt,
        systemInstruction: DEALER_SYSTEM_INSTRUCTION,
      });
      const parsed = JSON.parse(raw);
      return {
        archetype: parsed.archetype || 'Người sống sót Lý tính',
        strategicDiagnosis: parsed.strategicDiagnosis || 'Phản ứng ổn định dưới áp lực thời gian.',
        knowledgeGapDirective: parsed.knowledgeGapDirective || 'Tập trung củng cố các lá bài có độ chính xác dưới 60%.',
        dealerClosingScript: parsed.dealerClosingScript || 'Visa của ngươi tạm thời được gia hạn. Trò chơi chưa bao giờ thực sự kết thúc.',
        modelUsed: currentModel,
      };
    } catch (err) {
      lastError = extractRawApiError(err);
      if (i < modelsToTry.length - 1) {
        params.onModelSwitch?.(currentModel, modelsToTry[i + 1], lastError);
      }
    }
  }

  throw new Error(`[Toàn bộ Model thất bại] Lỗi nguyên văn từ API: ${lastError}`);
}
