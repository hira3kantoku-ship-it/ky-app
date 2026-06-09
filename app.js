/* ===== State ===== */
let currentStep = 1;
const TOTAL_STEPS = 4;

const state = {
  date: '',
  weather: '',
  siteName: '',
  companyName: '',
  groupName: '',
  workerCount: 1,
  workItems: [],
  workOther: '',
  dangers: [],   // [{index, measures:[], riskLevel:'大'}]
  signatures: [] // [{name:'', pad: SignaturePad}]
};

/* ===== Init ===== */
// Brave検出
async function isBrave() {
  try { return !!(navigator.brave && await navigator.brave.isBrave()); }
  catch { return false; }
}

document.addEventListener('DOMContentLoaded', async () => {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }

  // Brave警告バナー
  if (await isBrave()) {
    document.getElementById('brave-warning').style.display = 'block';
  }

  // Set today's date
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  document.getElementById('field-date').value = `${yyyy}-${mm}-${dd}`;
  updateDayOfWeek();

  buildWeatherSelect();
  buildTradeSelect();
  await buildSiteSelect();
  showStep(1);
});

/* ===== Day of Week ===== */
function updateDayOfWeek() {
  const val = document.getElementById('field-date').value;
  const el = document.getElementById('day-of-week');
  if (!val) { el.textContent = '－'; el.style.background = '#94a3b8'; return; }

  // YYYY-MM-DD をローカル時刻で解釈（タイムゾーンズレ防止）
  const [y, m, d] = val.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const days = ['日', '月', '火', '水', '木', '金', '土'];
  const colors = {
    0: '#c0392b', // 日曜：赤
    6: '#2563ab', // 土曜：青
  };
  const day = date.getDay();
  el.textContent = days[day] + '曜';
  el.style.background = colors[day] || '#1a4a7a';
}

/* ===== Site Select ===== */
async function buildSiteSelect() {
  const sel = document.getElementById('field-site');
  try {
    const res = await fetch('/api/sites');
    if (!res.ok) throw new Error();
    const { sites } = await res.json();
    sel.innerHTML = '<option value="">現場名を選択</option>';
    sites.forEach(name => {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      sel.appendChild(opt);
    });
    if (sites.length === 0) {
      sel.innerHTML = '<option value="">現場名が登録されていません</option>';
    }
  } catch {
    sel.innerHTML = '<option value="">現場名の取得に失敗しました</option>';
  }
}

/* ===== Weather Select ===== */
function buildWeatherSelect() {
  const sel = document.getElementById('field-weather');
  WEATHER_OPTIONS.forEach(w => {
    const opt = document.createElement('option');
    opt.value = w;
    opt.textContent = w;
    sel.appendChild(opt);
  });
}

/* ===== Step 2: 工種セレクト & 工具チェックボックス ===== */
function buildTradeSelect() {
  const sel = document.getElementById('field-trade');
  CONSTRUCTION_TRADES.forEach((trade, i) => {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = trade.name;
    sel.appendChild(opt);
  });
}

function onTradeChange() {
  const idx = document.getElementById('field-trade').value;
  const container = document.getElementById('tools-checkbox-container');
  const section = document.getElementById('tools-section');
  container.innerHTML = '';

  if (idx === '') { section.style.display = 'none'; return; }

  const tools = ['脚立・はしご', ...CONSTRUCTION_TRADES[parseInt(idx)].tools];
  section.style.display = 'block';

  tools.forEach((tool, ti) => {
    const label = document.createElement('label');
    label.style.cssText = 'display:flex;align-items:center;gap:6px;padding:7px 12px;border:1.5px solid #cbd5e1;border-radius:8px;cursor:pointer;font-size:14px;background:#fff;user-select:none;transition:all 0.15s;';
    label.innerHTML = `<input type="checkbox" id="tool-${ti}" value="${tool}" style="width:18px;height:18px;accent-color:#1a4a7a;flex-shrink:0;"> ${tool}`;
    label.querySelector('input').addEventListener('change', (e) => {
      label.style.background = e.target.checked ? '#eff6ff' : '#fff';
      label.style.borderColor = e.target.checked ? '#2563ab' : '#cbd5e1';
    });
    container.appendChild(label);
  });
}

/* ===== Step 3: AI Danger Analysis ===== */
function analyzeDangers(text) {
  const scores = new Array(DANGER_ITEMS.length).fill(0);
  KEYWORD_MAP.forEach(({ idx, keywords }) => {
    keywords.forEach(kw => {
      if (text.includes(kw)) scores[idx] += 1;
    });
  });
  // スコア付き全インデックス
  return scores.map((score, idx) => ({ idx, score }));
}

async function runAIAnalysis() {
  // 工種・作業内容・工具を結合してAI分析
  const tradeIdx = document.getElementById('field-trade')?.value;
  const tradeName = tradeIdx !== '' ? CONSTRUCTION_TRADES[parseInt(tradeIdx)]?.name || '' : '';
  const workInput = document.getElementById('field-work-input').value.trim();
  const tools = Array.from(document.querySelectorAll('#tools-checkbox-container input[type=checkbox]:checked')).map(cb => cb.value);
  const otherTool = document.getElementById('field-tool-other')?.value.trim();
  if (otherTool) tools.push(otherTool);
  const text = `${tradeName} ${workInput} ${tools.join(' ')}`;

  // アニメーション表示
  document.getElementById('ai-analyzing').style.display = 'block';
  document.getElementById('ai-result').style.display = 'none';
  document.getElementById('step3-nav').style.display = 'none';

  // プログレスバーアニメーション
  const bar = document.getElementById('ai-progress-bar');
  let progress = 0;
  const timer = setInterval(() => {
    progress = Math.min(progress + Math.random() * 18, 90);
    bar.style.width = progress + '%';
  }, 120);

  await new Promise(r => setTimeout(r, 1600));
  clearInterval(timer);
  bar.style.width = '100%';
  await new Promise(r => setTimeout(r, 300));

  // 分析実行
  const scored = analyzeDangers(text);
  const recommended = scored.filter(x => x.score > 0).sort((a, b) => b.score - a.score).map(x => x.idx);
  const others = scored.filter(x => x.score === 0).map(x => x.idx);

  // DOM構築
  document.getElementById('recommend-container').innerHTML = '';
  document.getElementById('other-container').innerHTML = '';

  if (recommended.length === 0) {
    document.getElementById('recommend-container').innerHTML =
      '<p style="font-size:13px;color:#64748b;padding:10px;">キーワードが検出されませんでした。下記からご選択ください。</p>';
  } else {
    recommended.forEach(i => buildDangerCard(i, 'recommend-container', true));
  }
  others.forEach(i => buildDangerCard(i, 'other-container', false));

  // 表示切り替え
  document.getElementById('ai-analyzing').style.display = 'none';
  document.getElementById('ai-result').style.display = 'block';
  document.getElementById('step3-nav').style.display = 'flex';

  updateDangerBadge();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function buildDangerCard(i, containerId, isRecommended) {
  const item = DANGER_ITEMS[i];
  const container = document.getElementById(containerId);

  const div = document.createElement('div');
  div.className = 'danger-card';
  div.id = `danger-card-${i}`;
  // おすすめ項目は枠の色だけ変えて視覚的に区別（チェックはしない）
  if (isRecommended) div.style.borderColor = '#93c5fd';

  const measuresHTML = item.measures.map((m, mi) => `
    <div class="measure-item" data-danger="${i}" data-measure="${mi}" onclick="toggleMeasure(this)">
      <input type="checkbox" id="measure-${i}-${mi}">
      <span class="measure-text">${m}</span>
    </div>
  `).join('');

  div.innerHTML = `
    <div class="danger-header" onclick="toggleDangerCard(${i})">
      <input type="checkbox" id="danger-${i}"
        onclick="event.stopPropagation(); onDangerToggle(${i}, this)">
      <span class="danger-category">${item.category}</span>
      <span class="danger-text">${item.danger}</span>
    </div>
    <div class="danger-body" id="danger-body-${i}">
      <div style="font-size:12px;font-weight:600;color:#64748b;margin-bottom:6px;">対策を選択（複数可）</div>
      <div class="measures-list">${measuresHTML}</div>
      <textarea id="measure-other-${i}" placeholder="その他の対策を入力..." rows="2" style="margin-top:6px;font-size:13px;"></textarea>
      <div class="risk-level" style="margin-top:10px;">
        <label>リスクレベル</label>
        <div class="risk-btns">
          <button class="risk-btn" onclick="setRisk(${i},'大')" id="risk-${i}-高">大</button>
          <button class="risk-btn" onclick="setRisk(${i},'中')" id="risk-${i}-中">中</button>
          <button class="risk-btn" onclick="setRisk(${i},'小')" id="risk-${i}-小">小</button>
        </div>
      </div>
    </div>
  `;
  container.appendChild(div);
}

function toggleDangerCard(i) {
  const body = document.getElementById(`danger-body-${i}`);
  const cb = document.getElementById(`danger-${i}`);
  if (!cb.checked) {
    cb.checked = true;
    onDangerToggle(i, cb);
  }
  body.classList.toggle('open');
}

function onDangerToggle(i, cb) {
  const body = document.getElementById(`danger-body-${i}`);
  if (cb.checked) {
    body.classList.add('open');
  } else {
    body.classList.remove('open');
  }
  updateDangerBadge();
}

function toggleMeasure(el) {
  const cb = el.querySelector('input[type=checkbox]');
  cb.checked = !cb.checked;
  el.classList.toggle('selected', cb.checked);
}

function setRisk(i, level) {
  ['大','中','小'].forEach(l => {
    const btn = document.getElementById(`risk-${i}-${l === '大' ? '高' : l}`);
    btn.className = 'risk-btn';
  });
  const map = {'大':'高','中':'中','小':'小'};
  const colorMap = {'大':'selected-high','中':'selected-mid','小':'selected-low'};
  document.getElementById(`risk-${i}-${map[level]}`).className = `risk-btn ${colorMap[level]}`;
}

function updateDangerBadge() {
  const count = document.querySelectorAll('input[type=checkbox][id^="danger-"]:checked').length;
  const badge = document.getElementById('danger-badge');
  badge.textContent = count;
  badge.className = 'badge' + (count === 0 ? ' zero' : '');
}

/* ===== Step 4: Signatures ===== */
async function buildSignaturePads() {
  const count = parseInt(document.getElementById('field-workers').value) || 1;
  const container = document.getElementById('sig-container');
  container.innerHTML = '';

  // Brave使用中は警告を追加表示
  if (await isBrave()) {
    const warn = document.createElement('div');
    warn.style.cssText = 'background:#fef2f2;border:2px solid #c0392b;border-radius:10px;padding:14px;margin-bottom:12px;font-size:13px;color:#c0392b;line-height:1.7;';
    warn.innerHTML = '⚠️ <strong>Braveブラウザでは署名が正しく保存されません</strong><br>iPhoneの <strong>Safari</strong> または <strong>Chrome</strong> で開き直してください。';
    container.appendChild(warn);
  }

  document.getElementById('sig-count-info').textContent =
    `参加者 ${count} 名の署名欄。各自が署名してください。`;

  for (let i = 0; i < count; i++) {
    const card = document.createElement('div');
    card.className = 'sig-card';
    card.innerHTML = `
      <div class="sig-card-header">
        <span class="sig-name-label">${i + 1}番目の参加者</span>
        <button class="sig-clear-btn" onclick="clearSig(${i})">消去</button>
      </div>
      <div class="sig-canvas-wrapper">
        <canvas class="sig-canvas" id="sig-canvas-${i}" width="600" height="200"></canvas>
        <div class="sig-hint">↑ ここに署名してください</div>
      </div>
    `;
    container.appendChild(card);
  }

  // Init SignaturePad
  state.signatures = [];
  for (let i = 0; i < count; i++) {
    const canvas = document.getElementById(`sig-canvas-${i}`);
    resizeCanvas(canvas);
    const pad = new SignaturePad(canvas, {
      backgroundColor: 'rgb(255,255,255)',
      penColor: 'rgb(10,30,80)',
      minWidth: 1,
      maxWidth: 3
    });
    state.signatures.push({ pad });
  }
}

function resizeCanvas(canvas) {
  const ratio = Math.max(window.devicePixelRatio || 1, 1);
  const w = canvas.offsetWidth;
  canvas.width = w * ratio;
  canvas.height = 120 * ratio;
  canvas.getContext('2d').scale(ratio, ratio);
}

function clearSig(i) {
  state.signatures[i]?.pad.clear();
}

/* ===== Step Navigation ===== */
function showStep(step) {
  currentStep = step;

  document.querySelectorAll('.step-panel').forEach(p => p.classList.remove('active'));
  document.querySelector(`.step-panel[data-step="${step}"]`).classList.add('active');

  // Update dots
  document.querySelectorAll('.step-dot').forEach((dot, idx) => {
    const s = idx + 1;
    dot.classList.remove('active', 'done');
    if (s === step) dot.classList.add('active');
    else if (s < step) dot.classList.add('done');
  });

  document.querySelectorAll('.step-line').forEach((line, idx) => {
    line.classList.toggle('done', idx + 1 < step);
  });

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function goNext() {
  if (!validateStep(currentStep)) return;

  if (currentStep === 2) {
    runAIAnalysis();
    showStep(3);
    return;
  }

  if (currentStep === 3) {
    buildSignaturePads();
  }

  if (currentStep === TOTAL_STEPS) {
    generatePDF();
    return;
  }

  showStep(currentStep + 1);
}

function goPrev() {
  if (currentStep > 1) showStep(currentStep - 1);
}

/* ===== Validation ===== */
function validateStep(step) {
  if (step === 1) {
    const date = document.getElementById('field-date').value;
    const site = document.getElementById('field-site').value;
    const company = document.getElementById('field-company').value.trim();
    const workers = document.getElementById('field-workers').value;

    if (!date) { showToast('日付を入力してください'); return false; }
    if (!site) { showToast('現場名を入力してください'); return false; }
    if (!company) { showToast('会社名・グループ名を入力してください'); return false; }
    if (!workers || workers < 1) { showToast('参加人数を入力してください'); return false; }
  }

  if (step === 2) {
    const trade = document.getElementById('field-trade')?.value;
    const work = document.getElementById('field-work-input')?.value.trim();
    if (!trade) { showToast('工種を選択してください'); return false; }
    if (!work) { showToast('作業内容を入力してください'); return false; }
  }

  if (step === 3) {
    const checked = document.querySelectorAll('input[type=checkbox][id^="danger-"]:checked');
    if (checked.length === 0) { showToast('危険のポイントを1つ以上選択してください'); return false; }
  }

  return true;
}

/* ===== Collect State ===== */
function collectState() {
  // Step 1
  state.date = document.getElementById('field-date').value;
  state.weather = document.getElementById('field-weather').value;
  state.siteName = document.getElementById('field-site').value.trim();
  state.companyName = document.getElementById('field-company').value.trim();
  state.groupName = document.getElementById('field-group').value.trim();
  state.workerCount = parseInt(document.getElementById('field-workers').value) || 1;

  // Step 2
  const tradeIdx = document.getElementById('field-trade')?.value;
  const tradeName = tradeIdx !== '' ? CONSTRUCTION_TRADES[parseInt(tradeIdx)]?.name || '' : '';
  const workText = document.getElementById('field-work-input')?.value.trim() || '';
  const selectedTools = Array.from(document.querySelectorAll('#tools-checkbox-container input[type=checkbox]:checked'))
    .map(cb => cb.value);
  const otherTool = document.getElementById('field-tool-other')?.value.trim();
  if (otherTool) selectedTools.push(otherTool);

  state.tradeName = tradeName;
  state.workText = workText;
  state.selectedTools = selectedTools;
  // AI分析用テキスト（工種+作業内容+工具を結合）
  state.workItems = [workText];
  state.workAnalysisText = `${tradeName} ${workText} ${selectedTools.join(' ')}`;

  // Step 3
  state.dangers = [];
  document.querySelectorAll('input[type=checkbox][id^="danger-"]:checked').forEach(cb => {
    const i = parseInt(cb.id.replace('danger-', ''));
    const item = DANGER_ITEMS[i];

    const measures = [];
    document.querySelectorAll(`#danger-body-${i} .measure-item.selected .measure-text`).forEach(el => {
      measures.push(el.textContent.trim());
    });
    const otherMeasure = document.getElementById(`measure-other-${i}`)?.value.trim();
    if (otherMeasure) measures.push(otherMeasure);

    const riskBtn = document.querySelector(`#danger-body-${i} .risk-btn[class*="selected-"]`);
    const risk = riskBtn ? riskBtn.textContent.trim() : '中';

    state.dangers.push({ category: item.category, danger: item.danger, measures, risk });
  });
}

/* ===== 日本語フォントをjsPDFに登録 ===== */
let _jpFontLoaded = false;
async function loadJapaneseFont(doc) {
  if (_jpFontLoaded) return;
  try {
    const res = await fetch('/fonts/NotoSansJP-Regular.ttf');
    if (!res.ok) throw new Error('font fetch failed');
    const buf = await res.arrayBuffer();
    const binary = new Uint8Array(buf);
    let b64 = '';
    const chunk = 8192;
    for (let i = 0; i < binary.length; i += chunk) {
      b64 += String.fromCharCode(...binary.subarray(i, i + chunk));
    }
    b64 = btoa(b64);
    doc.addFileToVFS('NotoSansJP.ttf', b64);
    doc.addFont('NotoSansJP.ttf', 'NotoSansJP', 'normal');
    _jpFontLoaded = true;
  } catch(e) {
    console.warn('Japanese font load failed:', e);
  }
}

/* ===== PDF Generation (html2canvas 高画質版) ===== */
async function generatePDF() {
  if (!validateStep(4)) return;
  const hasSig = state.signatures.some(s => !s.pad.isEmpty());
  if (!hasSig) { showToast('少なくとも1名が署名してください'); return; }

  collectState();
  showLoading(true);
  await new Promise(r => setTimeout(r, 100));

  try {
    const [y, m, d] = state.date.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d);
    const dayNames = ['日','月','火','水','木','金','土'];
    const dayColors = { 0:'#c0392b', 6:'#2563ab' };
    const dayColor = dayColors[dateObj.getDay()] || '#1a4a7a';
    const dateStr = `${y}年${m}月${d}日（${dayNames[dateObj.getDay()]}）`;
    const riskColorMap = { '大':'#c0392b', '中':'#e67e22', '小':'#27ae60' };

    const sigImgs = state.signatures.map(s =>
      (!s.pad.isEmpty()) ? s.pad.toDataURL('image/png') : ''
    );

    const dangerRows = state.dangers.map(d => {
      const rc = riskColorMap[d.risk] || '#888';
      const measures = d.measures.length > 0
        ? d.measures.map(m => `<li>${m}</li>`).join('')
        : '<li style="color:#999">（対策未選択）</li>';
      return `
        <div style="border:1px solid #cbd5e1;border-radius:4px;margin-bottom:6px;overflow:hidden;">
          <div style="background:#fef2f2;padding:6px 10px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <span style="background:${rc};color:#fff;font-size:11px;font-weight:700;padding:2px 8px;border-radius:3px;white-space:nowrap;">${d.category}</span>
            <span style="font-size:13px;font-weight:600;flex:1;">${d.danger}</span>
            <span style="background:${rc};color:#fff;font-size:11px;font-weight:700;padding:2px 8px;border-radius:3px;white-space:nowrap;">リスク：${d.risk}</span>
          </div>
          <div style="padding:6px 12px;background:#fff;">
            <div style="font-size:11px;font-weight:700;color:#64748b;margin-bottom:3px;">【対策】</div>
            <ul style="margin:0;padding-left:18px;font-size:12px;line-height:1.7;">${measures}</ul>
          </div>
        </div>`;
    }).join('');

    const sigCells = sigImgs.map((img, i) => `
      <div style="border:1px solid #cbd5e1;border-radius:4px;overflow:hidden;width:31%;margin:3px 1%;">
        <div style="background:#f0f4f8;font-size:11px;font-weight:600;color:#1a4a7a;padding:3px 8px;">${i+1}番目の参加者</div>
        <div style="height:52px;background:#fff;display:flex;align-items:center;justify-content:center;">
          ${img ? `<img src="${img}" style="max-width:100%;max-height:48px;object-fit:contain;">` : ''}
        </div>
      </div>`).join('');

    const html = `
      <div id="pdf-report" style="
        width:794px;background:#fff;padding:18px 24px;
        font-family:'Hiragino Kaku Gothic ProN','Hiragino Sans','Noto Sans JP',sans-serif;
        color:#1a202c;box-sizing:border-box;font-size:13px;
      ">
        <div style="background:#1a4a7a;color:#fff;text-align:center;padding:10px;border-radius:6px 6px 0 0;font-size:17px;font-weight:700;letter-spacing:0.06em;">
          KY活動表（危険予知活動記録）
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:10px;">
          <colgroup><col style="width:13%"><col style="width:55%"><col style="width:13%"><col style="width:19%"></colgroup>
          <tr>
            <td style="background:#dce6f1;font-weight:700;color:#1a4a7a;padding:6px 9px;border:1px solid #8096b4;">実施日</td>
            <td style="padding:6px 9px;border:1px solid #8096b4;">
              ${dateStr}
              <span style="background:${dayColor};color:#fff;font-weight:700;font-size:12px;padding:1px 7px;border-radius:4px;margin-left:7px;">${dayNames[dateObj.getDay()]}曜</span>
            </td>
            <td style="background:#dce6f1;font-weight:700;color:#1a4a7a;padding:6px 9px;border:1px solid #8096b4;">天気</td>
            <td style="padding:6px 9px;border:1px solid #8096b4;">${state.weather || '—'}</td>
          </tr>
          <tr>
            <td style="background:#dce6f1;font-weight:700;color:#1a4a7a;padding:6px 9px;border:1px solid #8096b4;">現場名</td>
            <td style="padding:6px 9px;border:1px solid #8096b4;">${state.siteName}</td>
            <td style="background:#dce6f1;font-weight:700;color:#1a4a7a;padding:6px 9px;border:1px solid #8096b4;">参加人数</td>
            <td style="padding:6px 9px;border:1px solid #8096b4;font-weight:700;">${state.workerCount}名</td>
          </tr>
          <tr>
            <td style="background:#dce6f1;font-weight:700;color:#1a4a7a;padding:6px 9px;border:1px solid #8096b4;">会社名・グループ名</td>
            <td colspan="3" style="padding:6px 9px;border:1px solid #8096b4;">${state.companyName}${state.groupName ? '　' + state.groupName : ''}</td>
          </tr>
        </table>
        <div style="background:#1a4a7a;color:#fff;padding:6px 12px;border-radius:4px 4px 0 0;font-size:13px;font-weight:700;margin-bottom:0;">■ 本日の作業内容</div>
        <div style="border:1px solid #8096b4;border-top:none;border-radius:0 0 4px 4px;padding:8px 12px;margin-bottom:10px;background:#fff;line-height:1.7;">
          ${state.tradeName ? `<div style="margin-bottom:5px;"><span style="background:#1a4a7a;color:#fff;font-size:11px;font-weight:700;padding:2px 9px;border-radius:3px;margin-right:8px;">工種</span><span style="font-size:13px;font-weight:700;">${state.tradeName}</span></div>` : ''}
          <div style="margin-bottom:5px;"><span style="background:#64748b;color:#fff;font-size:11px;font-weight:700;padding:2px 9px;border-radius:3px;margin-right:8px;">作業内容</span><span style="font-size:20px;font-weight:700;color:#1e3a8a;">${state.workText || state.workItems[0] || ''}</span></div>
          ${state.selectedTools && state.selectedTools.length > 0 ? `<div><span style="background:#64748b;color:#fff;font-size:11px;font-weight:700;padding:2px 9px;border-radius:3px;margin-right:8px;">使用工具</span>${state.selectedTools.map(t => `<span style="display:inline-block;background:#f0f4f8;color:#374151;font-size:12px;padding:2px 8px;border-radius:3px;margin:2px;border:1px solid #cbd5e1;">${t}</span>`).join('')}</div>` : ''}
        </div>
        <div style="background:#1a4a7a;color:#fff;padding:6px 12px;border-radius:4px 4px 0 0;font-size:13px;font-weight:700;margin-bottom:8px;">■ 危険のポイントと対策</div>
        ${dangerRows}
        <div style="background:#1a4a7a;color:#fff;padding:6px 12px;border-radius:4px 4px 0 0;font-size:13px;font-weight:700;margin-top:8px;margin-bottom:8px;">■ 参加者署名</div>
        <div style="display:flex;flex-wrap:wrap;gap:0;">${sigCells}</div>
        <div style="text-align:center;font-size:10px;color:#94a3b8;margin-top:10px;padding-top:8px;border-top:1px solid #e2e8f0;">
          作成日時：${new Date().toLocaleString('ja-JP')}　　KY活動表アプリ
        </div>
      </div>`;

    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'position:fixed;left:-9999px;top:0;z-index:-1;';
    wrapper.innerHTML = html;
    document.body.appendChild(wrapper);
    const reportEl = wrapper.querySelector('#pdf-report');

    // scale:2 + JPEG圧縮（Vercel 4.5MB制限対応・印刷でも十分鮮明）
    const canvas = await html2canvas(reportEl, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false
    });
    document.body.removeChild(wrapper);

    const { jsPDF } = window.jspdf;
    const pdfW = 210, pageH = 297;
    const contentH = Math.round((canvas.height / canvas.width) * pdfW);

    // ===== 必ず1ページに収まるよう縦幅を調整 =====
    const finalH = Math.min(contentH, pageH); // はみ出す場合は縮小
    const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
    doc.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, pdfW, finalH);

    const fn = `KY活動表_${state.date}_${state.companyName}.pdf`;
    const pdfBase64 = doc.output('datauristring').split(',')[1];
    const binary = atob(pdfBase64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const pdfBlob = new Blob([bytes], { type: 'application/pdf' });

    showLoading(false);
    showStep(5);
    await uploadToDropbox(pdfBlob, fn);

    const dlBtn = document.getElementById('pdf-download-btn');
    if (dlBtn) {
      dlBtn.style.display = 'flex';
      dlBtn.textContent = '📄 PDFをダウンロード';
      dlBtn.onclick = () => doc.save(fn);
    }

  } catch (err) {
    showLoading(false);
    console.error(err);
    showToast('PDF生成に失敗しました: ' + err.message);
  }
}

/* ===== Dropbox Upload ===== */
async function uploadToDropbox(pdfBlob, fileName) {
  const statusEl = document.getElementById('dropbox-status');
  const setStatus = (msg, color) => {
    if (statusEl) { statusEl.textContent = msg; statusEl.style.color = color || '#1a4a7a'; }
    showToastLong(msg);
  };

  try {
    setStatus('📤 Dropboxにアップロード中...', '#1a4a7a');

    // Blob → Base64 変換
    const pdfBase64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(pdfBlob);
    });

    // Vercel API 経由でアップロード
    const res = await fetch('/api/upload-ky', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pdfBase64,
        fileName,
        siteName: state.siteName,
        date: state.date,
      }),
    });

    const resText = await res.text();
    if (!res.ok) throw new Error(`サーバーエラー(${res.status}): ${resText.slice(0, 100)}`);

    const data = JSON.parse(resText);
    if (!data.success) throw new Error(data.error);

    setStatus(`✅ Dropboxに保存完了！\n📁 ${data.path}`, '#27ae60');

  } catch (err) {
    console.error('Dropbox upload error:', err);
    setStatus(`❌ ${err.message}`, '#c0392b');
  }
}

function showToastLong(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 10000);
}

/* ===== Reset ===== */
function resetApp() {
  // Reset state
  Object.assign(state, {
    date: '', weather: '', siteName: '', companyName: '',
    groupName: '', workerCount: 1, workItems: [], workOther: '',
    dangers: [], signatures: []
  });

  // Reset form fields
  const today = new Date();
  document.getElementById('field-date').value =
    `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
  updateDayOfWeek();
  document.getElementById('field-company').value = '';
  document.getElementById('field-group').value = '';
  document.getElementById('field-workers').value = 1;
  document.getElementById('field-weather').selectedIndex = 0;

  // Reset work input
  const wi = document.getElementById('field-work-input');
  if (wi) wi.value = '';
  const ft = document.getElementById('field-trade');
  if (ft) ft.value = '';
  const fto = document.getElementById('field-tool-other');
  if (fto) fto.value = '';
  document.getElementById('tools-section').style.display = 'none';
  document.getElementById('tools-checkbox-container').innerHTML = '';
  state.tradeName = ''; state.workText = ''; state.selectedTools = [];

  // Reset danger sections
  document.getElementById('recommend-container').innerHTML = '';
  document.getElementById('other-container').innerHTML = '';
  document.getElementById('ai-analyzing').style.display = 'none';
  document.getElementById('ai-result').style.display = 'none';
  document.getElementById('step3-nav').style.display = 'none';
  const badge = document.getElementById('danger-badge');
  if (badge) { badge.textContent = '0'; badge.className = 'badge zero'; }

  document.getElementById('sig-container').innerHTML = '';
  const dlBtn = document.getElementById('pdf-download-btn');
  if (dlBtn) dlBtn.style.display = 'none';
  document.getElementById('print-iframe')?.remove();
  const dsEl = document.getElementById('dropbox-status');
  if (dsEl) dsEl.textContent = '📤 Dropboxにアップロード中...';

  showStep(1);
}

/* ===== UI Helpers ===== */
function showLoading(on) {
  document.getElementById('loading-overlay').classList.toggle('active', on);
}

let toastTimer;
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3000);
}
