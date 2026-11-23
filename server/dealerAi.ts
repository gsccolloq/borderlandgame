import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import type { CardSuit } from '../src/types/game.ts';
import type { ServerQuestion } from './questionBank.ts';

const FALLBACK_MODELS = [
  'gemini-3-flash-preview',
  'gemini-3-pro-preview',
  'gemini-2.5-flash',
];

function getAiClient(customApiKey?: string): GoogleGenAI {
  const apiKey = (customApiKey || process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) {
    throw new Error('Chưa cấu hình Google Gemini API Key. Vui lòng nhập key trong Settings hoặc thiết lập GEMINI_API_KEY.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function getModelChain(preferredModel?: string): string[] {
  if (preferredModel && FALLBACK_MODELS.includes(preferredModel)) {
    return [preferredModel, ...FALLBACK_MODELS.filter((m) => m !== preferredModel)];
  }
  return [...FALLBACK_MODELS];
}

const DEALER_SYSTEM_INSTRUCTION = `
Bạn là "Quản trò" (Kẻ Điều Phối) của Borderland Quiz Arena — một AI Quản trò lạnh lùng, sắc sảo, thấm nhuần Lý thuyết Trò chơi và bầu không khí sinh tồn kịch tính như Alice in Borderland.
- BẮT BUỘC trả lời 100% bằng tiếng Việt tự nhiên, sắc lạnh (chỉ giữ nguyên tiếng Anh cho tên đấu trường "Borderland Quiz Arena" hoặc thuật ngữ học thuật bất khả kháng).
- Luôn xưng "ta" hoặc "Quản trò", gọi người tham gia là "Người chơi" hoặc "Kẻ tham gia".
- Văn phong ngắn gọn, đanh thép, chuyên nghiệp, mang áp lực sinh tử (tối đa 2-3 câu cho lời thoại).
- Không sử dụng emoji hay lời nói thừa.
`;

export async function generateAdaptiveQuestion(params: {
  subject: string;
  suit: CardSuit;
  difficulty: number;
  isRevival: boolean;
  previousTopics: string[];
  playerAccuracyPct: number;
  apiKey?: string;
  model?: string;
}): Promise<ServerQuestion> {
  const ai = getAiClient(params.apiKey);
  const modelsToTry = getModelChain(params.model);

  const suitGuidance: Record<CardSuit, string> = {
    spades: 'Spades (Bích - Tốc độ): Câu hỏi ngắn gọn, tính toán nhanh hoặc phản xạ kiến thức sắc bén.',
    hearts: 'Hearts (Cơ - Tâm lý): Câu hỏi đánh vào nhận thức dễ mắc bẫy, nghịch lý hoặc lựa chọn đánh đổi; kèm 1 dealerHint ngắn mang tính thách thức tâm lý.',
    clubs: 'Clubs (Chuồn - Đồng thuận): Câu hỏi về nguyên tắc hợp tác, quy chuẩn hệ thống hoặc chiến lược tập thể.',
    diamonds: 'Diamonds (Rô - Logic thuần túy): Câu hỏi suy luận chặt chẽ, toán học hoặc phân tích kỹ thuật chính xác tuyệt đối.',
  };

  const rankMap = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  const clampedDiff = Math.max(1, Math.min(10, Math.round(params.difficulty)));
  const cardRank = params.isRevival ? 'A' : rankMap[Math.min(rankMap.length - 1, clampedDiff + 1)];

  const promptText = `
Tạo đúng 1 câu hỏi trắc nghiệm sinh tồn bằng tiếng Việt cho Borderland Quiz Arena.
- Chủ đề: ${params.subject}
- Chất bài: ${suitGuidance[params.suit]}
- Độ khó mục tiêu (1-10): ${clampedDiff} ${params.isRevival ? '(ĐÂY LÀ TRÒ CHƠI HỒI SINH - SUDDEN DEATH)' : ''}
- Tỷ lệ chính xác hiện tại của phòng: ${Math.round(params.playerAccuracyPct)}%
- Tránh lặp các tiểu chủ đề gần đây: ${params.previousTopics.join(', ') || 'Chưa có'}
- Bắt buộc có đúng 4 đáp án ngắn gọn, rõ ràng, chỉ 1 đáp án đúng duy nhất (correctIndex từ 0 đến 3).
- explanation giải thích chính xác, học thuật, súc tích trong 1-2 câu.
`;

  let lastError: Error | null = null;

  for (const currentModel of modelsToTry) {
    try {
      const response = await ai.models.generateContent({
        model: currentModel,
        contents: promptText,
        config: {
          systemInstruction: DEALER_SYSTEM_INSTRUCTION,
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              topic: { type: Type.STRING, description: 'Tên tiểu chủ đề ngắn bằng tiếng Việt (2-4 từ)' },
              prompt: { type: Type.STRING, description: 'Nội dung câu hỏi súc tích, rõ ràng bằng tiếng Việt' },
              options: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: 'Đúng 4 lựa chọn trả lời bằng tiếng Việt',
              },
              correctIndex: { type: Type.INTEGER, description: 'Chỉ số đáp án đúng (0, 1, 2, hoặc 3)' },
              explanation: { type: Type.STRING, description: 'Giải thích ngắn gọn chuẩn xác bằng tiếng Việt' },
              dealerHint: { type: Type.STRING, description: 'Lời thì thầm tâm lý lạnh lùng của Quản trò bằng tiếng Việt (tùy chọn)' },
            },
            required: ['topic', 'prompt', 'options', 'correctIndex', 'explanation'],
          },
        },
      });

      const rawText = (response.text ?? '').trim();
      const parsed = JSON.parse(rawText) as {
        topic: string;
        prompt: string;
        options: string[];
        correctIndex: number;
        explanation: string;
        dealerHint?: string;
      };

      if (!Array.isArray(parsed.options) || parsed.options.length < 4) {
        throw new Error('Quản trò AI trả về ít hơn 4 lựa chọn đáp án.');
      }

      const timeBySuit: Record<CardSuit, number> = {
        spades: 14000,
        hearts: 22000,
        clubs: 20000,
        diamonds: 24000,
      };

      return {
        id: `ai-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        subject: params.subject,
        suit: params.suit,
        cardRank,
        difficulty: clampedDiff,
        topic: String(parsed.topic || params.subject).slice(0, 48),
        prompt: String(parsed.prompt),
        options: [
          String(parsed.options[0]),
          String(parsed.options[1]),
          String(parsed.options[2]),
          String(parsed.options[3]),
        ],
        correctIndex: Math.max(0, Math.min(3, Number(parsed.correctIndex) || 0)),
        explanation: String(parsed.explanation),
        dealerHint: parsed.dealerHint ? String(parsed.dealerHint) : undefined,
        timeLimitMs: params.isRevival ? 18000 : timeBySuit[params.suit],
        source: 'gemini',
      };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.warn(`[AI Dealer] Model ${currentModel} thất bại (${lastError.message}), đang chuyển sang model tiếp theo...`);
    }
  }

  throw new Error(`[Toàn bộ Model thất bại] ${lastError?.message || 'Không thể tạo câu hỏi thử thách.'}`);
}

export async function generateDealerRoundReaction(params: {
  subject: string;
  suit: CardSuit;
  accuracyPct: number;
  avgResponseMs: number;
  eliminatedCount: number;
  activeCount: number;
  difficulty: number;
  tabViolations: number;
  apiKey?: string;
  model?: string;
}): Promise<{
  reaction: string;
  difficultyAction: 'escalate' | 'maintain' | 'revival';
}> {
  const ai = getAiClient(params.apiKey);
  const modelsToTry = getModelChain(params.model);

  const prompt = `
Phân tích kết quả vòng đấu vừa kết thúc trong Borderland Quiz Arena:
- Môn học: ${params.subject}
- Chất bài: ${params.suit} (Độ khó: ${params.difficulty}/10)
- Tỷ lệ trả lời đúng: ${Math.round(params.accuracyPct)}%
- Thời gian phản hồi trung bình: ${Math.round(params.avgResponseMs)}ms
- Người chơi còn sống: ${params.activeCount}, Bị loại: ${params.eliminatedCount}
- Số lần vi phạm chuyển tab: ${params.tabViolations}

Quy tắc quyết định:
- Nếu tỷ lệ đúng >= 75% và thời gian < 10000ms: chọn "escalate" và chế nhạo lạnh lùng rằng thử thách vừa rồi quá dễ, độ khó sẽ tăng vọt.
- Nếu số người bị loại >= số người còn sống (hoặc còn 0 người sống): chọn "revival" và cảnh báo kích hoạt Trò Chơi Hồi Sinh.
- Còn lại: chọn "maintain" và nhận xét sắc lạnh theo phong cách Quản trò.
Trả về JSON bằng tiếng Việt.
`;

  for (const currentModel of modelsToTry) {
    try {
      const response = await ai.models.generateContent({
        model: currentModel,
        contents: prompt,
        config: {
          systemInstruction: DEALER_SYSTEM_INSTRUCTION,
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              reaction: { type: Type.STRING, description: 'Lời thoại ngắn 1-2 câu bằng tiếng Việt của Quản trò' },
              difficultyAction: {
                type: Type.STRING,
                description: 'Một trong ba giá trị: escalate, maintain, hoặc revival',
              },
            },
            required: ['reaction', 'difficultyAction'],
          },
        },
      });

      const parsed = JSON.parse((response.text ?? '{}').trim()) as {
        reaction?: string;
        difficultyAction?: string;
      };

      const action: 'escalate' | 'maintain' | 'revival' =
        parsed.difficultyAction === 'escalate' || parsed.difficultyAction === 'revival'
          ? parsed.difficultyAction
          : 'maintain';

      return {
        reaction: parsed.reaction || 'Dữ liệu vòng đấu đã được ghi nhận. Chuẩn bị cho lá bài kế tiếp.',
        difficultyAction: action,
      };
    } catch {
      // Continue to next model
    }
  }

  return {
    reaction: 'Dữ liệu vòng đấu đã được ghi nhận. Chuẩn bị cho lá bài kế tiếp.',
    difficultyAction: 'maintain',
  };
}

export async function generateGameTheoryReport(params: {
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
  model?: string;
}): Promise<{
  archetype: string;
  strategicDiagnosis: string;
  knowledgeGapDirective: string;
  dealerClosingScript: string;
}> {
  const ai = getAiClient(params.apiKey);
  const modelsToTry = getModelChain(params.model);

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

Trả về JSON bằng tiếng Việt, ngắn gọn, sắc bén, giàu giá trị học thuật.
`;

  let lastError: Error | null = null;

  for (const currentModel of modelsToTry) {
    try {
      const response = await ai.models.generateContent({
        model: currentModel,
        contents: prompt,
        config: {
          systemInstruction: DEALER_SYSTEM_INSTRUCTION,
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              archetype: { type: Type.STRING, description: 'Danh xưng chiến lược theo lý thuyết trò chơi (VD: Chiến lược gia Tối ưu Minimax)' },
              strategicDiagnosis: { type: Type.STRING, description: 'Phân tích 2-3 câu về cân bằng tốc độ, logic và khẩu vị rủi ro' },
              knowledgeGapDirective: { type: Type.STRING, description: 'Khuyến nghị 2 câu khắc phục lỗ hổng tri thức cụ thể' },
              dealerClosingScript: { type: Type.STRING, description: '1 câu kết lạnh lùng của Quản trò dành cho Người chơi bằng tiếng Việt' },
            },
            required: ['archetype', 'strategicDiagnosis', 'knowledgeGapDirective', 'dealerClosingScript'],
          },
        },
      });

      const parsed = JSON.parse((response.text ?? '{}').trim()) as {
        archetype?: string;
        strategicDiagnosis?: string;
        knowledgeGapDirective?: string;
        dealerClosingScript?: string;
      };

      return {
        archetype: parsed.archetype || 'Người sống sót Lý tính',
        strategicDiagnosis: parsed.strategicDiagnosis || 'Phản ứng ổn định dưới áp lực thời gian.',
        knowledgeGapDirective: parsed.knowledgeGapDirective || 'Tập trung củng cố các lá bài có độ chính xác dưới 60%.',
        dealerClosingScript: parsed.dealerClosingScript || 'Visa của ngươi tạm thời được gia hạn. Trò chơi chưa bao giờ thực sự kết thúc.',
      };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.warn(`[Game Theory] Model ${currentModel} thất bại (${lastError.message}), đang thử model tiếp theo...`);
    }
  }

  throw new Error(`[Toàn bộ Model thất bại] ${lastError?.message || 'Phân tích chiến lược từ Quản trò AI thất bại.'}`);
}
