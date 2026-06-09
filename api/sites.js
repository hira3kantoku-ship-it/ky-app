// 現場名リスト取得API（読み取り専用）
// GET /api/sites → 現場名配列を返す

const DROPBOX_PATH = '/genba-kanri/_sites_config.json';

async function getAccessToken() {
  const res = await fetch('https://api.dropbox.com/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: process.env.DROPBOX_REFRESH_TOKEN,
      client_id: process.env.DROPBOX_APP_KEY,
      client_secret: process.env.DROPBOX_APP_SECRET,
    }),
  });
  if (!res.ok) throw new Error(`token_error: ${await res.text()}`);
  const { access_token } = await res.json();
  return access_token;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const token = await getAccessToken();
    const dlRes = await fetch('https://content.dropboxapi.com/2/files/download', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Dropbox-API-Arg': JSON.stringify({ path: DROPBOX_PATH }),
      },
    });
    if (dlRes.status === 409) return res.status(200).json({ sites: [] });
    if (!dlRes.ok) throw new Error(`dropbox_read_error(${dlRes.status})`);
    const data = await dlRes.json();
    return res.status(200).json({ sites: data.sites || [] });
  } catch (err) {
    console.error('sites api error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
