// 工事黒板読み取りAPI
// POST /api/read-board  { image: "<base64 JPEG>" }
// → { koushu, basho, naiyou }  （工事件名は返さない）
// 環境変数: ANTHROPIC_API_KEY（必須） / CLAUDE_MODEL（任意）

const MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-5-5';

const PROMPT = `この工事写真に写っている工事黒板の文字を読み取ってください。
次の3項目を抽出します（工事件名・工事名は不要）。
- koushu: 工種（例: バルコニー補修、外壁塗装、防水工事）
- basho: 工事場所（例: 203、2F廊下、北面）。工事場所欄が空でも、自由記述欄に部屋番号や場所があればそれを使う
- naiyou: 作業内容（例: シール擦り込み、高圧洗浄、施工前）
黒板の記入欄の名前（工種/種別/場所/内容など）があればそれに従い、自由記述のみの場合は文脈で振り分けてください。
読み取れない・該当しない項目は空文字にしてください。黒板の文字をそのまま使い、言い換えないでください。`;

const TOOL = {
  name: 'board_fields',
  description: '工事黒板から読み取った項目',
  input_schema: {
    type: 'object',
    properties: {
      koushu: { type: 'string' },
      basho: { type: 'string' },
      naiyou: { type: 'string' },
    },
    required: ['koushu', 'basho', 'naiyou'],
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY が未設定です' });

  const image = req.body?.image;
  if (!image || typeof image !== 'string') return res.status(400).json({ error: 'image がありません' });

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 300,
        tools: [TOOL],
        tool_choice: { type: 'tool', name: 'board_fields' },
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: image } },
            { type: 'text', text: PROMPT },
          ],
        }],
      }),
    });
    if (!r.ok) return res.status(502).json({ error: `claude_error(${r.status}): ${await r.text()}` });
    const data = await r.json();
    const out = data.content?.find((c) => c.type === 'tool_use')?.input || {};
    return res.status(200).json({
      koushu: out.koushu || '',
      basho: out.basho || '',
      naiyou: out.naiyou || '',
    });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}
