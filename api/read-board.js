// 工事黒板読み取りAPI（Google Gemini API 無料枠を使用）
// POST /api/read-board  { images: ["<base64 JPEG>", ...] }（1回最大10枚）
// → { results: [{ koushu, basho, naiyou }, ...] }  （工事件名は返さない）
// 複数枚を1リクエストにまとめ、無料枠の回数制限に掛かりにくくしている
// 環境変数: GEMINI_API_KEY（必須・Google AI Studioで無料発行） / GEMINI_MODEL（任意）

// 無料枠の回数に余裕がある旧モデルを優先。提供終了(404)なら次の候補を使う
const MODELS = [process.env.GEMINI_MODEL, 'gemini-2.0-flash-lite', 'gemini-2.0-flash', 'gemini-flash-lite-latest'].filter(Boolean);
const MAX_IMAGES = 10;

const PROMPT = `複数の工事写真を「画像1」「画像2」…の順で渡します。各写真に写っている工事黒板の文字を読み取り、画像の順番どおりに結果を配列で返してください。
各写真について次の3項目を抽出します（工事件名・工事名は不要）。
- koushu: 工種（例: バルコニー補修、外壁塗装、防水工事）
- basho: 工事場所（例: 203、2F廊下、北面）。工事場所欄が空でも、自由記述欄に部屋番号や場所があればそれを使う
- naiyou: 作業内容（例: シール擦り込み、高圧洗浄、施工前）
黒板の記入欄の名前（工種/種別/場所/内容など）があればそれに従い、自由記述のみの場合は文脈で振り分けてください。
読み取れない・該当しない項目は空文字にしてください。黒板の文字をそのまま使い、言い換えないでください。`;

const SCHEMA = {
  type: 'ARRAY',
  items: {
    type: 'OBJECT',
    properties: {
      image_no: { type: 'INTEGER' },
      koushu: { type: 'STRING' },
      basho: { type: 'STRING' },
      naiyou: { type: 'STRING' },
    },
    required: ['image_no', 'koushu', 'basho', 'naiyou'],
  },
};

async function callGemini(model, images) {
  const parts = [];
  images.forEach((data, i) => {
    parts.push({ text: `画像${i + 1}` }, { inline_data: { mime_type: 'image/jpeg', data } });
  });
  parts.push({ text: PROMPT });
  return fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: { responseMimeType: 'application/json', responseSchema: SCHEMA, temperature: 0 },
    }),
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  if (!process.env.GEMINI_API_KEY) return res.status(500).json({ error: 'GEMINI_API_KEY が未設定です' });

  const images = req.body?.images;
  if (!Array.isArray(images) || !images.length) return res.status(400).json({ error: 'images がありません' });
  if (images.length > MAX_IMAGES) return res.status(400).json({ error: `1回${MAX_IMAGES}枚までです` });

  try {
    let r;
    for (const model of MODELS) {
      r = await callGemini(model, images);
      if (r.status !== 404) break;
    }
    if (r.status === 429) return res.status(429).json({ error: '無料枠の回数制限です。少し待って再試行します' });
    if (!r.ok) return res.status(502).json({ error: `gemini_error(${r.status}): ${await r.text()}` });
    const data = await r.json();
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '[]';
    const arr = JSON.parse(text);
    const results = images.map((_, i) => {
      const o = arr.find((x) => x.image_no === i + 1) || arr[i] || {};
      return { koushu: o.koushu || '', basho: o.basho || '', naiyou: o.naiyou || '' };
    });
    return res.status(200).json({ results });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}
