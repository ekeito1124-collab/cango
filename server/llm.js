// AI（Google Gemini API）の呼び出しをまとめた場所。翻訳と AI キャラクター機能の両方がここを使う。
// GEMINI_API_KEY が設定されると自動で有効になる（コードの変更は不要。本番は再デプロイ、手元は開発サーバーの再起動のみ）

// 既定は「最新の Flash モデル」を指す別名。特定のモデルに固定したいときは GEMINI_MODEL で指定する
const model = () => process.env.GEMINI_MODEL || 'gemini-flash-latest';
const baseUrl = () => (process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com').replace(/\/$/, '');

export const PROVIDER_LABEL = 'Google Gemini';
export const llmEnabled = () => Boolean(process.env.GEMINI_API_KEY);
// Google AI Studio で発行したキーは「AIza」で始まる
export const keyLooksValid = () => /^AIza[\w-]{20,}$/.test(process.env.GEMINI_API_KEY || '');

// 直近の状態（関数のインスタンスごと）。運営画面の「自動翻訳」欄に表示する
const state = { lastSuccessAt: null, lastError: null, lastErrorAt: null, pausedUntil: 0 };

export function llmStatus() {
  return {
    provider: PROVIDER_LABEL,
    enabled: llmEnabled(),
    keyLooksValid: keyLooksValid(),
    model: model(),
    lastSuccessAt: state.lastSuccessAt,
    lastError: state.lastError,
    lastErrorAt: state.lastErrorAt,
    pausedUntil: state.pausedUntil > Date.now() ? new Date(state.pausedUntil) : null,
  };
}

export class LlmUnavailable extends Error {
  constructor(code, detail) {
    super(detail || code);
    this.code = code;
  }
}

// JSON Schema を Gemini の responseSchema 形式（OpenAPI のサブセット）に変換する
function toGeminiSchema(s) {
  const out = { type: String(s.type).toUpperCase() };
  if (s.description) out.description = s.description;
  if (s.enum) out.enum = s.enum;
  if (s.items) out.items = toGeminiSchema(s.items);
  if (s.properties) {
    out.properties = Object.fromEntries(Object.entries(s.properties).map(([k, v]) => [k, toGeminiSchema(v)]));
    out.propertyOrdering = Object.keys(s.properties);
  }
  if (s.required) out.required = s.required;
  return out;
}

// HTTP の応答から、運営画面で原因が分かる短いコードにする
function errorCode(status, body) {
  const err = body?.error || {};
  const reasons = (err.details || []).map((d) => d.reason).filter(Boolean);
  if (reasons.includes('API_KEY_INVALID') || /api key not valid/i.test(err.message || '')) return 'invalid_key';
  if (status === 403) return 'no_permission';
  if (status === 429) return 'quota';
  if (status === 404) return 'model_not_found';
  if (status >= 500) return 'server_error';
  return `api_error_${status}`;
}

function record(code, detail) {
  state.lastError = code;
  state.lastErrorAt = new Date();
  // キーが無効・権限なしのときは、毎回失敗を待たされないよう 10 分間呼び出しを止める。
  // 無料枠の上限（1 分あたりの回数など）に達したときは 1 分止める
  if (['invalid_key', 'no_permission', 'model_not_found'].includes(code)) state.pausedUntil = Date.now() + 10 * 60e3;
  else if (code === 'quota') state.pausedUntil = Date.now() + 60e3;
  console.error('[gemini]', code, detail || '');
}

/**
 * JSON スキーマどおりの結果を返させる呼び出し。失敗したら LlmUnavailable（code にエラーの種類）を投げる
 * @param {{system: string, user: string, schema: object}} p
 */
export async function llmJson({ system, user, schema }) {
  if (!llmEnabled()) throw new LlmUnavailable('disabled');
  if (Date.now() < state.pausedUntil) throw new LlmUnavailable('paused');

  let res;
  try {
    res = await fetch(`${baseUrl()}/v1beta/models/${encodeURIComponent(model())}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 8192,
          responseMimeType: 'application/json',
          responseSchema: toGeminiSchema(schema),
        },
      }),
      // Vercel の関数は最大 60 秒。1 回の待ち時間を短く区切る
      signal: AbortSignal.timeout(25_000),
    });
  } catch (e) {
    const code = e?.name === 'TimeoutError' ? 'timeout' : 'network';
    record(code, e?.message);
    throw new LlmUnavailable(code);
  }

  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const code = errorCode(res.status, body);
    record(code, body?.error?.message);
    throw new LlmUnavailable(code);
  }

  const cand = body?.candidates?.[0];
  if (!cand || body?.promptFeedback?.blockReason || cand.finishReason === 'SAFETY' || cand.finishReason === 'PROHIBITED_CONTENT') {
    record('refusal', body?.promptFeedback?.blockReason || cand?.finishReason);
    throw new LlmUnavailable('refusal');
  }
  if (cand.finishReason && cand.finishReason !== 'STOP') {
    record('incomplete', cand.finishReason);
    throw new LlmUnavailable('incomplete');
  }
  const text = (cand.content?.parts || []).map((p) => p.text || '').join('');
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    record('bad_output', text.slice(0, 200));
    throw new LlmUnavailable('bad_output');
  }
  state.lastSuccessAt = new Date();
  state.lastError = null;
  return parsed;
}
