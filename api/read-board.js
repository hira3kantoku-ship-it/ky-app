// 工事黒板読み取りAPI（Google Gemini API 無料枠を使用）
// POST /api/read-board  { image: "<base64 JPEG>" }
// → { koushu, basho, naiyou }  （工事件名は返さない）
// 環境変数: GEMINI_API_KEY（必須・Google AI Studioで無料発行） / GEMINI_MODEL（任意）

const MODEL = process.env.GEMINI_MODEL || 'gemini-flash-latest';

const PROMPT = `この工事写真に写っている工事黒板の文字を読み取ってください。
次の3項目を抽出します（工事件名・工事名は不要）。
- koushu: 工種（例: バルコニー補修、外壁塗装、防水工事）
- basho: 工事場所（例: 203、2F廊下、北面）。工事場所欄が空でも、自由記述欄に部屋番号や場所があればそれを使う
- naiyou: 作業内容（例: シール擦り込み、高圧洗浄、施工前）
黒板の記入欄の名前（工種/種別/場所/内容など）があればそれに従い、自由記述のみの場合は文脈で振り分けてください。
読み取れない・該当しない項目は空文字にしてください。黒板の文字をそのまま使い、言い換えないでください。`;

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    koushu: { type: 'STRING' },
    basho: { type: 'STRING' },
    naiyou: { type: 'STRING' },
  },
  required: ['koushu', 'basho', 'naiyou'],
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  if (!process.env.GEMINI_API_KEY) return res.status(500).json({ error: 'GEMINI_API_KEY が未設定です' });

  const image = req.body?.image;
  if (!image || typeof image !== 'string') return res.status(400).json({ error: 'image がありません' });

  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
      body: JSON.stringify({
        contents: [{
          parts: [
            { inline_data: { mime_type: 'image/jpeg', data: image } },
            { text: PROMPT },
          ],
        }],
        generationConfig: { responseMimeType: 'application/json', responseSchema: SCHEMA, temperature: 0 },
      }),
    });
    if (r.status === 429) return res.status(429).json({ error: '無料枠の回数制限です。少し待って再試行します' });
    if (!r.ok) return res.status(502).json({ error: `gemini_error(${r.status}): ${await r.text()}` });
    const data = await r.json();
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '{}';
    const out = JSON.parse(text);
    return res.status(200).json({
      koushu: out.koushu || '',
      basho: out.basho || '',
      naiyou: out.naiyou || '',
    });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}
