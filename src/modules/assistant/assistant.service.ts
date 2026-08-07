import { config } from '../../config';
import { BadRequestError, InternalError } from '../../core/errors/AppError';
import { ASSISTANT_SYSTEM_PROMPT } from './assistant.knowledge';

export type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

type GeminiPart = { text: string };
type GeminiContent = { role: 'user' | 'model'; parts: GeminiPart[] };
ƒ∂
type GeminiResponse = {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  error?: { message?: string; status?: string; code?: number };
};

const FALLBACK_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-2.0-flash',
  'gemini-1.5-flash',
];

function modelChain(): string[] {
  const primary = config.GEMINI_MODEL;
  return [primary, ...FALLBACK_MODELS.filter((m) => m !== primary)];
}

function toGeminiHistory(messages: ChatMessage[]): GeminiContent[] {
  return messages.slice(-16).map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryable(status: number, message: string): boolean {
  if (status === 429 || status === 503 || status === 500) return true;
  const m = message.toLowerCase();
  return (
    m.includes('high demand') ||
    m.includes('overloaded') ||
    m.includes('resource exhausted') ||
    m.includes('unavailable') ||
    m.includes('try again')
  );
}

function friendlyGeminiError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('high demand') || m.includes('overloaded') || m.includes('try again later')) {
    return 'الخدمة مزدحمة حالياً — انتظر بضع ثوانٍ ثم أعد إرسال السؤال.';
  }
  if (m.includes('quota') || m.includes('resource exhausted') || m.includes('exceeded')) {
    return 'حصة الذكاء الاصطناعي مؤقتاً منتهية. حاول بعد دقائق.';
  }
  if (m.includes('api key') || m.includes('permission')) {
    return 'المساعد غير مفعّل بشكل صحيح. تواصل مع المسؤول.';
  }
  return 'تعذّر الحصول على رد. أعد المحاولة أو اختصر السؤال.';
}

async function callGemini(
  model: string,
  apiKey: string,
  contents: GeminiContent[],
): Promise<{ ok: true; reply: string } | { ok: false; status: number; message: string }> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const body = {
    systemInstruction: { parts: [{ text: ASSISTANT_SYSTEM_PROMPT }] },
    contents,
    generationConfig: {
      temperature: 0.55,
      maxOutputTokens: 2048,
    },
  };

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(45_000),
    });
  } catch {
    return { ok: false, status: 0, message: 'network error' };
  }

  const payload = (await res.json()) as GeminiResponse;
  const errMsg = payload.error?.message ?? res.statusText;

  if (!res.ok) {
    return { ok: false, status: res.status, message: errMsg };
  }

  const reply =
    payload.candidates?.[0]?.content?.parts
      ?.map((p) => p.text ?? '')
      .join('')
      .trim() ?? '';

  if (!reply) {
    return { ok: false, status: 502, message: 'empty response' };
  }

  return { ok: true, reply };
}

export async function chatWithAssistant(
  message: string,
  history: ChatMessage[] = [],
): Promise<{ reply: string }> {
  const trimmed = message.trim();
  if (!trimmed) {
    throw new BadRequestError('Message is required');
  }
  if (trimmed.length > 2000) {
    throw new BadRequestError('Message is too long');
  }

  const apiKey = config.GEMINI_API_KEY;
  if (!apiKey) {
    throw new InternalError('المساعد غير مفعّل حالياً. تواصل مع المسؤول.');
  }

  const contents: GeminiContent[] = [
    ...toGeminiHistory(history),
    { role: 'user', parts: [{ text: trimmed }] },
  ];

  const models = modelChain();
  const retryDelays = [0, 1500, 3000];
  let lastMessage = '';

  for (const model of models) {
    for (let attempt = 0; attempt < retryDelays.length; attempt++) {
      if (retryDelays[attempt]! > 0) {
        await sleep(retryDelays[attempt]!);
      }

      const result = await callGemini(model, apiKey, contents);
      if (result.ok) {
        return { reply: result.reply };
      }

      lastMessage = result.message;
      if (!isRetryable(result.status, result.message)) {
        break;
      }
    }
  }

  throw new InternalError(friendlyGeminiError(lastMessage));
}
