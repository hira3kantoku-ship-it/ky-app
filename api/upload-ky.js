// Vercel Serverless Function: PDF を受け取り Dropbox へアップロード
// 環境変数: DROPBOX_APP_KEY, DROPBOX_APP_SECRET, DROPBOX_REFRESH_TOKEN

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const { pdfBase64, fileName, siteName, date } = req.body;

    // 1. Refresh Token → Access Token
    const tokenRes = await fetch('https://api.dropbox.com/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: process.env.DROPBOX_REFRESH_TOKEN,
        client_id: process.env.DROPBOX_APP_KEY,
        client_secret: process.env.DROPBOX_APP_SECRET,
      }),
    });
    if (!tokenRes.ok) throw new Error(`token_error: ${await tokenRes.text()}`);
    const { access_token } = await tokenRes.json();

    // 2. アップロード先パス
    const safeSite = (siteName || '不明').replace(/[/\\:*?"<>|]/g, '_');
    const safeDate = date || new Date().toISOString().slice(0, 10);
    const uploadPath = `/KY記録/${safeSite}/${safeDate}/${fileName}`;

    // 3. Dropbox へアップロード
    const pdfBuffer = Buffer.from(pdfBase64, 'base64');
    const uploadRes = await fetch('https://content.dropboxapi.com/2/files/upload', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${access_token}`,
        'Content-Type': 'application/octet-stream',
        'Dropbox-API-Arg': JSON.stringify({
          path: uploadPath, mode: 'add', autorename: true, mute: false,
        }).replace(/[^\x00-\x7F]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0')),
      },
      body: pdfBuffer,
    });
    if (!uploadRes.ok) throw new Error(`dropbox_error(${uploadRes.status}): ${await uploadRes.text()}`);

    const result = await uploadRes.json();
    return res.status(200).json({ success: true, path: result.path_display });

  } catch (err) {
    console.error('upload-ky error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
}
