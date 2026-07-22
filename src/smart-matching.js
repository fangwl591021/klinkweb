const text = (value, max = 1000) => String(value || '').trim().slice(0, max);

const MATCH_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['matches'],
  properties: {
    matches: {
      type: 'array',
      minItems: 0,
      maxItems: 3,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['index', 'score', 'reason'],
        properties: {
          index: { type: 'integer', minimum: 0, maximum: 49 },
          score: { type: 'integer', minimum: 0, maximum: 100 },
          reason: { type: 'string', minLength: 8, maxLength: 80 },
        },
      },
    },
  },
};

export function buildMatchingCandidates(contacts = []) {
  return contacts.slice(0, 50).map((card, index) => {
    const insightCards = card?.aiInsights?.cards && typeof card.aiInsights.cards === 'object'
      ? card.aiInsights.cards
      : {};
    return {
      index,
      name: text(card.displayName, 120),
      company: text(card.companyName, 180),
      title: text(card.jobTitle, 120),
      department: text(card.department, 120),
      service: text(card.serviceDescription, 500),
      tags: Object.values(insightCards).map((value) => text(value, 220)).filter(Boolean).join('｜').slice(0, 900),
    };
  });
}

function outputText(result = {}) {
  return result.output_text || result.output?.flatMap((item) => item.content || []).find((item) => item.type === 'output_text')?.text || '';
}

export function resolveMatchingResults(contacts = [], parsed = {}) {
  const seen = new Set();
  return (Array.isArray(parsed.matches) ? parsed.matches : []).flatMap((match) => {
    const index = Number(match?.index);
    const card = Number.isInteger(index) ? contacts[index] : null;
    if (!card || seen.has(card.id)) return [];
    seen.add(card.id);
    return [{ card, score: Math.max(0, Math.min(100, Math.round(Number(match.score) || 0))), reason: text(match.reason, 120) }];
  }).slice(0, 3);
}

export async function matchContacts({ contacts = [], member = {}, query = '', apiKey = '', model = '' } = {}) {
  const request = text(query, 300);
  if (request.length < 2) throw new Error('請輸入至少 2 個字的配對需求');
  if (!apiKey) throw new Error('智能配對尚未設定 AI API 金鑰');
  if (!contacts.length) throw new Error('名片收藏尚無資料，請先拍照或上傳名片');

  const candidates = buildMatchingCandidates(contacts);
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: model || 'gpt-5.6-terra',
      reasoning: { effort: 'low' },
      max_output_tokens: 900,
      input: [{
        role: 'user',
        content: `你是繁體中文商務人脈配對顧問。請依照 LINE- 智能配對方式，從候選名片中找出最符合需求的 0 至 3 人。\n\n尋求者：${text(member.displayName, 120) || '康立會員'}\n配對需求：${request}\n候選名片：${JSON.stringify(candidates)}\n\n規則：\n1. 只能選候選清單內的人，index 必須完全對應候選 index。\n2. 綜合公司、職稱、服務內容與五大標籤判斷互補性。\n3. score 為 0 至 100 的整數；reason 以 15 至 40 個繁體中文字說明具體合作理由。\n4. 資料不足時保守評分，不得捏造經歷、客戶、證照、財力或健康狀況。\n5. 若沒有合理人選，回傳空陣列。只回傳指定 JSON。`,
      }],
      text: { format: { type: 'json_schema', name: 'smart_contact_matches', strict: true, schema: MATCH_SCHEMA } },
    }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result?.error?.message || 'AI 智能配對暫時無法使用');
  const raw = outputText(result);
  if (!raw) throw new Error('AI 未回傳配對結果');
  return resolveMatchingResults(contacts, JSON.parse(raw));
}
