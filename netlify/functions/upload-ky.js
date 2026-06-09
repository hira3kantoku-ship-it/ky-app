// Netlify Function: PDF を受け取り Dropbox へアップロード
// 環境変数: DROPBOX_APP_KEY, DROPBOX_APP_SECRET, DROPBOX_REFRESH_TOKEN

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: 'Method Not Allowed' };

  try {
    const { pdfBase64, fileName, siteName, date } = JSON.parse(event.body || '{}');

    // デバッグ: 環境変数確認
    const refreshToken = process.env.DROPBOX_REFRESH_TOKEN || '';
    console.log('REFRESH_TOKEN_PREFIX:', refreshToken.slice(0, 10));
    console.log('APP_KEY:', process.env.DROPBOX_APP_KEY);

    // 1. Refresh Token → Access Token
    const tokenRes = await fetch('https://api.dropbox.com/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: process.env.DROPBOX_APP_KEY,
        client_secret: process.env.DROPBOX_APP_SECRET,
      }),
    });
    const tokenText = await tokenRes.text();
    console.log('TOKEN_RESPONSE:', tokenText.slice(0, 200));
    if (!tokenRes.ok) throw new Error(`token_error: ${tokenText}`);
    const { access_token } = JSON.parse(tokenText);

    // 2. アップロード先パス
    const safeSite = (siteName || '不明').replace(/[/\\:*?"<>|]/g, '_');
    const safeDate = date || new Date().toISOString().slice(0, 10);
    const uploadPath = `/KY記録/${safeSite}/${safeDate}/${fileName}`;

    // 3. Dropbox へアップロード（サーバー側から）
    const pdfBuffer = Buffer.from(pdfBase64, 'base64');
    const uploadRes = await fetch('https://content.dropboxapi.com/2/files/upload', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${access_token}`,
        'Content-Type': 'application/octet-stream',
        // 日本語パスをASCIIセーフな \uXXXX 形式にエスケープ（HTTPヘッダー制約対応）
      'Dropbox-API-Arg': JSON.stringify({
          path: uploadPath, mode: 'add', autorename: true, mute: false,
        }).replace(/[^\x00-\x7F]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0')),
      },
      body: pdfBuffer,
    });
    if (!uploadRes.ok) throw new Error(`dropbox_error(${uploadRes.status}): ${await uploadRes.text()}`);

    const result = await uploadRes.json();
    return { statusCode: 200, headers, body: JSON.stringify({ success: true, path: result.path_display }) };

  } catch (err) {
    console.error('upload-ky error:', err.message);
    return { statusCode: 500, headers, body: JSON.stringify({ success: false, error: err.message }) };
  }
};
