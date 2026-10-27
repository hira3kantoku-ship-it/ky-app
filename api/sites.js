// 現場名リスト取得API（読み取り専用）
// GET /api/sites → 現場名配列を返す
// 正本は安全書類DXの「現場マスター」（GAS の ?view=sitelist）。
// 環境変数 SAFETY_DOCS_UPLOAD_URL が未設定・取得失敗のときだけ、従来の Dropbox の現場名リストを使う

const DROPBOX_PATH = '/genba-kanri/_sites_config.json';

async function getSitesFromSiteMaster() {
  const base = process.env.SAFETY_DOCS_UPLOAD_URL;
  if (!base) return null;
  const res = await fetch(`${base}?view=sitelist`);
  if (!res.ok) throw new Error(`site_master_error(${res.status})`);
  const data = await res.json();
  if (!Array.isArray(data.sites)) throw new Error('site_master_bad_response');
  return data.sites;
}

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

async function getSitesFromDropbox() {
  const token = await getAccessToken();
  const dlRes = await fetch('https://content.dropboxapi.com/2/files/download', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Dropbox-API-Arg': JSON.stringify({ path: DROPBOX_PATH }),
    },
  });
  if (dlRes.status === 409) return [];
  if (!dlRes.ok) throw new Error(`dropbox_read_error(${dlRes.status})`);
  const data = await dlRes.json();
  return data.sites || [];
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    try {
      const sites = await getSitesFromSiteMaster();
      if (sites) return res.status(200).json({ sites });
    } catch (err) {
      console.error('site master error (fallback to dropbox):', err.message);
    }
    return res.status(200).json({ sites: await getSitesFromDropbox() });
  } catch (err) {
    console.error('sites api error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
