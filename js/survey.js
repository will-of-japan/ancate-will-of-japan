// ============================================================
//  WOJ アンケートシステム — 回答画面（分岐ステッパー版）
// ============================================================

let allQuestions = [];       // 全質問（order順）
let stepperPath = [];        // 通過した質問IDのスタック
let stepperAnswers = {};     // { questionId: answer }
let stepperIndex = 0;        // stepperPath内の現在位置
let currentSurveyId = null;
const MAX_DEPTH = 5;

// ---------- ユーティリティ ----------
function showLoading() { document.getElementById('loading').classList.add('active'); }
function hideLoading() { document.getElementById('loading').classList.remove('active'); }

function goToScreen(name) {
  ['select','info','stepper','confirm','complete'].forEach(s =>
    document.getElementById('screen-' + s).classList.add('hidden'));
  document.getElementById('screen-' + name).classList.remove('hidden');
}

async function apiGet(action, params = {}) {
  const url = new URL(CONFIG.API_BASE);
  url.searchParams.set('action', action);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  return (await fetch(url.toString())).json();
}

async function apiPost(body) {
  return (await fetch(CONFIG.API_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(body),
  })).json();
}

const KANJI = ['一','二','三','四','五','六','七','八','九','十'];
function toKanji(n) { return KANJI[n - 1] || String(n); }

function escapeHtml(str) {
  const d = document.createElement('div'); d.textContent = str; return d.innerHTML;
}

function typeLabel(t) {
  return { text:'テキスト', textarea:'自由記述', radio:'単一選択', checkbox:'複数選択', select:'プルダウン' }[t] || t;
}

function findQuestion(qid) { return allQuestions.find(q => q.question_id === qid); }

// ---------- アンケート一覧 ----------
async function loadSurveys() {
  showLoading();
  try {
    const r = await apiGet('getOpenSurveys');
    if (!r.success) throw new Error(r.error);
    const list = document.getElementById('survey-list');
    list.innerHTML = '';
    if (r.data.length === 0) { document.getElementById('no-surveys').classList.remove('hidden'); return; }
    document.getElementById('no-surveys').classList.add('hidden');
    r.data.forEach(s => {
      const card = document.createElement('div');
      card.className = 'card'; card.style.cursor = 'pointer';
      card.onclick = () => selectSurvey(s.survey_id, s.title, s.description);
      card.innerHTML = `<h3 style="font-family:'Shippori Mincho B1',serif;font-size:15px;font-weight:600;letter-spacing:0.05em;margin-bottom:6px">${escapeHtml(s.title)}</h3><p style="font-size:12px;color:var(--text-sub)">${escapeHtml(s.description||'')}</p>`;
      list.appendChild(card);
    });
  } catch (e) {
    document.getElementById('survey-list').innerHTML = '<div class="alert alert-error">読み込みに失敗しました。</div>';
  } finally { hideLoading(); }
}

async function selectSurvey(id, title, desc) {
  currentSurveyId = id;
  showLoading();
  try {
    const r = await apiGet('getQuestions', { surveyId: id, activeOnly: 'true' });
    if (!r.success) throw new Error(r.error);
    allQuestions = r.data;
    document.getElementById('survey-title').textContent = title;
    document.getElementById('survey-desc').textContent = desc || '';
    document.getElementById('resp-name').value = '';
    document.getElementById('resp-email').value = '';
    goToScreen('info');
  } catch (e) { alert('質問の読み込みに失敗しました'); }
  finally { hideLoading(); }
}

// ---------- ステッパー開始 ----------
function startStepper() {
  const name = document.getElementById('resp-name').value.trim();
  const email = document.getElementById('resp-email').value.trim();
  const errEl = document.getElementById('info-error');

  if (!name || !email) { showMsg(errEl, 'error', 'お名前とメールアドレスは必須です。'); return; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showMsg(errEl, 'error', '正しいメールアドレスを入力してください。'); return; }
  errEl.classList.add('hidden');

  // 初期化
  stepperAnswers = {};
  stepperPath = [];
  stepperIndex = 0;

  if (allQuestions.length === 0) { alert('質問がありません'); return; }

  // 最初の質問（order最小）をパスに追加
  stepperPath.push(allQuestions[0].question_id);
  goToScreen('stepper');
  renderStepper();
}

// ---------- ステッパー描画 ----------
function renderStepper() {
  const qid = stepperPath[stepperIndex];
  const q = findQuestion(qid);
  if (!q) { showConfirmation(); return; }

  // プログレス
  const progEl = document.getElementById('stepper-progress');
  let progHtml = '';
  stepperPath.forEach((pid, i) => {
    if (i > 0) progHtml += '<div class="stepper-connector"></div>';
    const cls = i < stepperIndex ? 'done' : i === stepperIndex ? 'active' : '';
    progHtml += `<div class="stepper-dot ${cls}"></div>`;
  });
  progEl.innerHTML = progHtml;

  document.getElementById('stepper-count').textContent =
    `${toKanji(stepperIndex + 1)} / ${stepperPath.length} 問`;

  // 質問カード
  const isReq = q.required === true || q.required === 'TRUE';
  const container = document.getElementById('stepper-question');
  container.innerHTML = `
    <div class="question-card">
      <div class="question-card-header">
        <span class="question-number">${toKanji(stepperIndex + 1)}</span>
        <div>
          <span class="badge badge-type">${typeLabel(q.type)}</span>
          ${isReq ? '<span class="badge badge-required">必須</span>' : ''}
        </div>
      </div>
      <p style="font-family:'Shippori Mincho B1',serif;font-size:15px;font-weight:500;margin-bottom:14px">${escapeHtml(q.title)}</p>
      <div id="q-input">${renderInput(q)}</div>
    </div>`;

  // 既存回答を復元
  restoreAnswer(q);

  // ボタン制御
  document.getElementById('btn-prev').style.visibility = stepperIndex === 0 ? 'hidden' : 'visible';
  document.getElementById('btn-next').textContent = isLastQuestion() ? '確認へ →' : '次へ →';

  document.getElementById('stepper-error').classList.add('hidden');
}

function renderInput(q) {
  const id = q.question_id;
  const opts = q.options ? String(q.options).split(',').map(o => o.trim()).filter(Boolean) : [];

  switch (q.type) {
    case 'text':
      return `<input type="text" class="form-input" data-qid="${id}" placeholder="回答を入力">`;
    case 'textarea':
      return `<textarea class="form-textarea" data-qid="${id}" placeholder="回答を入力"></textarea>`;
    case 'radio':
      return `<div class="option-group">${opts.map((o,i) => `<div class="option-item"><input type="radio" name="radio-${id}" id="r-${id}-${i}" value="${escapeHtml(o)}"><label for="r-${id}-${i}">${escapeHtml(o)}</label></div>`).join('')}</div>`;
    case 'checkbox':
      return `<div class="option-group">${opts.map((o,i) => `<div class="option-item"><input type="checkbox" name="cb-${id}" id="c-${id}-${i}" value="${escapeHtml(o)}"><label for="c-${id}-${i}">${escapeHtml(o)}</label></div>`).join('')}</div>`;
    case 'select':
      return `<select class="form-select" data-qid="${id}"><option value="">選択してください</option>${opts.map(o => `<option value="${escapeHtml(o)}">${escapeHtml(o)}</option>`).join('')}</select>`;
    default:
      return `<input type="text" class="form-input" data-qid="${id}" placeholder="回答を入力">`;
  }
}

function restoreAnswer(q) {
  const saved = stepperAnswers[q.question_id];
  if (!saved) return;

  switch (q.type) {
    case 'text': { const el = document.querySelector(`input[data-qid="${q.question_id}"]`); if (el) el.value = saved; break; }
    case 'textarea': { const el = document.querySelector(`textarea[data-qid="${q.question_id}"]`); if (el) el.value = saved; break; }
    case 'select': { const el = document.querySelector(`select[data-qid="${q.question_id}"]`); if (el) el.value = saved; break; }
    case 'radio': {
      const el = document.querySelector(`input[name="radio-${q.question_id}"][value="${CSS.escape(saved)}"]`);
      if (el) el.checked = true;
      break;
    }
    case 'checkbox': {
      const vals = saved.split(', ');
      vals.forEach(v => {
        const el = document.querySelector(`input[name="cb-${q.question_id}"][value="${CSS.escape(v)}"]`);
        if (el) el.checked = true;
      });
      break;
    }
  }
}

// ---------- 回答取得 ----------
function getCurrentAnswer() {
  const qid = stepperPath[stepperIndex];
  const q = findQuestion(qid);
  if (!q) return '';

  switch (q.type) {
    case 'text': { const el = document.querySelector(`input[data-qid="${qid}"]`); return el ? el.value.trim() : ''; }
    case 'textarea': { const el = document.querySelector(`textarea[data-qid="${qid}"]`); return el ? el.value.trim() : ''; }
    case 'select': { const el = document.querySelector(`select[data-qid="${qid}"]`); return el ? el.value : ''; }
    case 'radio': { const el = document.querySelector(`input[name="radio-${qid}"]:checked`); return el ? el.value : ''; }
    case 'checkbox': { return Array.from(document.querySelectorAll(`input[name="cb-${qid}"]:checked`)).map(c => c.value).join(', '); }
    default: return '';
  }
}

// ---------- 分岐エンジン ----------
function resolveNextQuestion(q, answer) {
  // 1. branch_rules をチェック
  const rules = q.branch_rules || {};
  if (answer && rules[answer]) {
    const target = findQuestion(rules[answer]);
    if (target && (target.active === true || target.active === 'TRUE')) return target.question_id;
  }

  // 2. next_default をチェック
  if (q.next_default) {
    const target = findQuestion(q.next_default);
    if (target && (target.active === true || target.active === 'TRUE')) return target.question_id;
  }

  // 3. order順で次の質問
  const currentOrder = Number(q.order);
  const next = allQuestions.find(nq =>
    Number(nq.order) > currentOrder &&
    (nq.active === true || nq.active === 'TRUE')
  );
  return next ? next.question_id : null;
}

function isLastQuestion() {
  const qid = stepperPath[stepperIndex];
  const q = findQuestion(qid);
  const answer = getCurrentAnswer();
  return !resolveNextQuestion(q, answer);
}

// ---------- ステッパーナビゲーション ----------
function stepperNext() {
  const qid = stepperPath[stepperIndex];
  const q = findQuestion(qid);
  const answer = getCurrentAnswer();
  const errEl = document.getElementById('stepper-error');

  // 必須チェック
  if ((q.required === true || q.required === 'TRUE') && !answer) {
    showMsg(errEl, 'error', 'この質問は必須です。');
    return;
  }
  errEl.classList.add('hidden');

  // 回答保存
  stepperAnswers[qid] = answer;

  // 次の質問を解決
  const nextQid = resolveNextQuestion(q, answer);

  if (!nextQid) {
    // 終了 → 確認画面
    showConfirmation();
    return;
  }

  // 深さチェック
  if (stepperIndex + 1 >= MAX_DEPTH * allQuestions.length) {
    showConfirmation();
    return;
  }

  // パスを更新（現在位置の後ろをカット＋新しい質問を追加）
  stepperPath = stepperPath.slice(0, stepperIndex + 1);
  stepperPath.push(nextQid);
  stepperIndex++;
  renderStepper();
}

function stepperPrev() {
  if (stepperIndex <= 0) return;
  // 現在の回答も保存
  const qid = stepperPath[stepperIndex];
  stepperAnswers[qid] = getCurrentAnswer();
  stepperIndex--;
  renderStepper();
}

// ---------- 確認画面 ----------
function showConfirmation() {
  // 最後の回答も保存
  const qid = stepperPath[stepperIndex];
  if (qid) stepperAnswers[qid] = getCurrentAnswer();

  const list = document.getElementById('confirm-list');
  list.innerHTML = '';

  stepperPath.forEach(pid => {
    const q = findQuestion(pid);
    const a = stepperAnswers[pid] || '';
    if (!q) return;
    const li = document.createElement('li');
    li.className = 'confirm-item';
    li.innerHTML = `<p class="confirm-q">${escapeHtml(q.title)}</p><p class="confirm-a">${a ? escapeHtml(a) : '<span style="color:var(--text-faint)">（未回答）</span>'}</p>`;
    list.appendChild(li);
  });

  goToScreen('confirm');
}

function backToStepper() {
  goToScreen('stepper');
  renderStepper();
}

// ---------- 送信 ----------
async function submitSurvey() {
  const name = document.getElementById('resp-name').value.trim();
  const email = document.getElementById('resp-email').value.trim();
  const errEl = document.getElementById('submit-error');

  const answers = stepperPath.map(pid => ({
    questionId: pid,
    answer: stepperAnswers[pid] || ''
  }));

  document.getElementById('btn-submit').disabled = true;
  showLoading();

  try {
    const r = await apiPost({
      action: 'submitResponse',
      surveyId: currentSurveyId,
      respondent_name: name,
      respondent_email: email,
      answers
    });
    if (!r.success) throw new Error(r.error);
    goToScreen('complete');
  } catch (e) {
    showMsg(errEl, 'error', '送信に失敗しました。もう一度お試しください。');
    document.getElementById('btn-submit').disabled = false;
  } finally { hideLoading(); }
}

// ---------- ヘルパー ----------
function showMsg(el, type, text) {
  el.className = `alert alert-${type} mt-8`;
  el.textContent = text;
  el.classList.remove('hidden');
}

// ---------- 初期化 ----------
document.addEventListener('DOMContentLoaded', () => { goToScreen('select'); loadSurveys(); });
