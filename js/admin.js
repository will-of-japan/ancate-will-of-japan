// ============================================================
//  WOJ アンケートシステム — 管理画面（分岐対応版）
// ============================================================

let adminPassword = '';
let surveys = [];
let selectedSurveyId = null;
let currentQuestions = [];    // 現在選択中アンケートの全質問
let editingSurveyId = null;
let editingQuestionId = null;

// ---------- Utility ----------
function showLoading() { document.getElementById('loading').classList.add('active'); }
function hideLoading() { document.getElementById('loading').classList.remove('active'); }

async function apiGet(action, params = {}) {
  const url = new URL(CONFIG.API_BASE);
  url.searchParams.set('action', action);
  url.searchParams.set('password', adminPassword);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  return (await fetch(url.toString())).json();
}

async function apiPost(body) {
  body.password = adminPassword;
  return (await fetch(CONFIG.API_BASE, {
    method: 'POST', headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(body),
  })).json();
}

function escapeHtml(s) { const d = document.createElement('div'); d.textContent = s||''; return d.innerHTML; }
const KANJI = ['一','二','三','四','五','六','七','八','九','十'];
function toKanji(n) { return KANJI[n-1]||String(n); }

// ---------- Login ----------
async function adminLogin() {
  const pw = document.getElementById('admin-password').value.trim();
  if (!pw) return;
  adminPassword = pw;
  showLoading();
  try {
    const r = await apiGet('getSurveys');
    if (!r.success) { showLoginError(r.error||'ログイン失敗'); adminPassword=''; return; }
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('admin-screen').classList.remove('hidden');
    surveys = r.data;
    renderSurveyList();
  } catch(e) { showLoginError('サーバー接続エラー'); adminPassword=''; }
  finally { hideLoading(); }
}

function showLoginError(msg) {
  const el = document.getElementById('login-error');
  el.className = 'alert alert-error mt-8'; el.textContent = msg; el.classList.remove('hidden');
}

// ============================================================
//  Survey CRUD
// ============================================================

function renderSurveyList() {
  const list = document.getElementById('admin-survey-list');
  list.innerHTML = '';
  if (surveys.length === 0) { list.innerHTML = '<div class="alert alert-info">アンケートがありません。</div>'; return; }

  surveys.forEach(s => {
    const isOpen = s.is_open === true || s.is_open === 'TRUE';
    const card = document.createElement('div');
    card.className = 'card'; card.style.cssText = 'cursor:pointer;padding:16px 20px';
    if (s.survey_id === selectedSurveyId) card.style.borderColor = 'var(--gold)';
    card.innerHTML = `
      <div class="flex justify-between items-center">
        <div style="flex:1" onclick="selectSurveyForEdit('${s.survey_id}')">
          <div class="flex items-center gap-8" style="margin-bottom:4px">
            <span style="font-family:'Shippori Mincho B1',serif;font-size:14px;font-weight:600">${escapeHtml(s.title)}</span>
            <span class="badge ${isOpen?'badge-open':'badge-closed'}">${isOpen?'公開中':'非公開'}</span>
          </div>
          <p style="font-size:11px;color:var(--text-mute)">${escapeHtml(s.description||'')}</p>
        </div>
        <div class="flex gap-8" style="margin-left:12px">
          <button class="btn btn-secondary btn-sm" onclick="event.stopPropagation();editSurvey('${s.survey_id}')">✎</button>
          <button class="btn btn-sm ${isOpen?'btn-danger':'btn-secondary'}" onclick="event.stopPropagation();toggleSurveyStatus('${s.survey_id}')">${isOpen?'■':'▶'}</button>
          <button class="btn btn-danger btn-sm" onclick="event.stopPropagation();deleteSurveyConfirm('${s.survey_id}','${escapeHtml(s.title)}')">✕</button>
        </div>
      </div>`;
    list.appendChild(card);
  });
}

function selectSurveyForEdit(id) {
  selectedSurveyId = id;
  renderSurveyList();
  loadQuestions(id);
  loadResponses(id);
}

function openSurveyModal(id) {
  editingSurveyId = id || null;
  if (id) {
    const s = surveys.find(s => s.survey_id === id);
    document.getElementById('survey-modal-title').textContent = 'アンケートを編集';
    document.getElementById('modal-survey-title').value = s?s.title:'';
    document.getElementById('modal-survey-desc').value = s?s.description:'';
  } else {
    document.getElementById('survey-modal-title').textContent = 'アンケートを作成';
    document.getElementById('modal-survey-title').value = '';
    document.getElementById('modal-survey-desc').value = '';
  }
  document.getElementById('survey-modal').classList.add('active');
}
function closeSurveyModal() { document.getElementById('survey-modal').classList.remove('active'); }

async function saveSurvey() {
  const title = document.getElementById('modal-survey-title').value.trim();
  const desc = document.getElementById('modal-survey-desc').value.trim();
  if (!title) { alert('タイトルは必須です'); return; }
  showLoading();
  try {
    if (editingSurveyId) { await apiPost({action:'updateSurvey',surveyId:editingSurveyId,title,description:desc}); }
    else { await apiPost({action:'createSurvey',title,description:desc}); }
    closeSurveyModal(); await refreshSurveys();
  } catch(e) { alert('保存失敗'); } finally { hideLoading(); }
}

function editSurvey(id) { openSurveyModal(id); }

async function toggleSurveyStatus(id) {
  showLoading();
  try { await apiPost({action:'toggleSurvey',surveyId:id}); await refreshSurveys(); }
  catch(e) { alert('切替失敗'); } finally { hideLoading(); }
}

async function deleteSurveyConfirm(id, title) {
  if (!confirm(`「${title}」を削除しますか？`)) return;
  showLoading();
  try {
    await apiPost({action:'deleteSurvey',surveyId:id});
    if (selectedSurveyId === id) { selectedSurveyId=null; document.getElementById('question-editor').classList.add('hidden'); document.getElementById('response-viewer').classList.add('hidden'); }
    await refreshSurveys();
  } catch(e) { alert('削除失敗'); } finally { hideLoading(); }
}

async function refreshSurveys() {
  const r = await apiGet('getSurveys');
  if (r.success) { surveys = r.data; renderSurveyList(); }
}

// ============================================================
//  Question CRUD with Branch Rules
// ============================================================

async function loadQuestions(surveyId) {
  document.getElementById('question-editor').classList.remove('hidden');
  const s = surveys.find(s => s.survey_id === surveyId);
  document.getElementById('editor-survey-name').textContent = s?s.title:'';
  showLoading();
  try {
    const r = await apiGet('getQuestions', {surveyId});
    if (!r.success) throw new Error(r.error);
    currentQuestions = r.data;
    renderQuestionList();
  } catch(e) { document.getElementById('question-list').innerHTML = '<div class="alert alert-error">読み込み失敗</div>'; }
  finally { hideLoading(); }
}

function renderQuestionList() {
  const list = document.getElementById('question-list');
  const noQ = document.getElementById('no-questions');
  list.innerHTML = '';
  const active = currentQuestions.filter(q => q.active === true || q.active === 'TRUE');
  if (active.length === 0) { noQ.classList.remove('hidden'); return; }
  noQ.classList.add('hidden');

  const typeLabels = {text:'テキスト',textarea:'自由記述',radio:'単一選択',checkbox:'複数選択',select:'プルダウン'};

  active.forEach((q, idx) => {
    const isReq = q.required === true || q.required === 'TRUE';
    const hasBranch = q.branch_rules && Object.keys(q.branch_rules).length > 0;
    const hasNext = q.next_default && q.next_default !== '';

    const card = document.createElement('div');
    card.className = 'question-card';

    let branchHtml = '';
    if (hasBranch) {
      const entries = Object.entries(q.branch_rules);
      branchHtml = '<div class="branch-indicator">分岐: ' +
        entries.map(([val, qid]) => {
          const target = currentQuestions.find(x => x.question_id === qid);
          return `「${escapeHtml(val)}」→ ${target ? escapeHtml(target.title) : qid}`;
        }).join(' / ') + '</div>';
    }
    if (hasNext && !hasBranch) {
      const target = currentQuestions.find(x => x.question_id === q.next_default);
      branchHtml = `<div class="branch-indicator">次へ → ${target ? escapeHtml(target.title) : q.next_default}</div>`;
    }

    card.innerHTML = `
      <div class="question-card-header">
        <div class="flex items-center gap-8">
          <span class="question-number">${toKanji(idx+1)}</span>
          <span class="badge badge-type">${typeLabels[q.type]||q.type}</span>
          ${isReq?'<span class="badge badge-required">必須</span>':''}
          ${hasBranch?'<span class="badge badge-branch">分岐</span>':''}
        </div>
        <div class="question-actions">
          <button class="btn btn-secondary btn-sm" onclick="editQuestion('${q.question_id}')">✎</button>
          <button class="btn btn-danger btn-sm" onclick="deleteQuestionConfirm('${q.question_id}','${escapeHtml(q.title)}')">✕</button>
        </div>
      </div>
      <p style="font-size:13px;color:var(--text-sub)">${escapeHtml(q.title)}</p>
      ${q.options?`<p style="font-size:11px;color:var(--text-mute);margin-top:4px">選択肢: ${escapeHtml(String(q.options))}</p>`:''}
      ${branchHtml}`;
    list.appendChild(card);
  });
}

// --- Question Modal ---

function openQuestionModal(qData) {
  editingQuestionId = qData ? qData.question_id : null;

  if (qData) {
    document.getElementById('question-modal-title').textContent = '質問を編集';
    document.getElementById('modal-q-title').value = qData.title || '';
    document.getElementById('modal-q-type').value = qData.type || 'text';
    document.getElementById('modal-q-options').value = qData.options || '';
    document.getElementById('modal-q-required').checked = qData.required === true || qData.required === 'TRUE';
  } else {
    document.getElementById('question-modal-title').textContent = '質問を追加';
    document.getElementById('modal-q-title').value = '';
    document.getElementById('modal-q-type').value = 'text';
    document.getElementById('modal-q-options').value = '';
    document.getElementById('modal-q-required').checked = false;
  }

  onTypeChange(qData);
  document.getElementById('question-modal').classList.add('active');
}

function closeQuestionModal() { document.getElementById('question-modal').classList.remove('active'); editingQuestionId = null; }

function onTypeChange(qData) {
  const type = document.getElementById('modal-q-type').value;
  const needsOptions = ['radio','checkbox','select'].includes(type);
  document.getElementById('options-field').style.display = needsOptions ? 'block' : 'none';

  // 分岐セクション: radio/select のみ表示（checkboxは分岐しにくいので除外）
  const canBranch = ['radio','select'].includes(type);
  document.getElementById('branch-section').style.display = canBranch ? 'block' : 'none';
  document.getElementById('next-default-section').style.display = canBranch ? 'none' : 'block';

  if (canBranch) updateBranchUI(qData);
  populateNextDefaultSelects(qData);
}

function getOtherQuestions() {
  return currentQuestions.filter(q =>
    (q.active === true || q.active === 'TRUE') &&
    q.question_id !== editingQuestionId
  );
}

function populateNextDefaultSelects(qData) {
  const others = getOtherQuestions();
  const optionsHtml = '<option value="">（order順 / 終了）</option>' +
    others.map(q => `<option value="${q.question_id}">${escapeHtml(q.title)}</option>`).join('');

  const el1 = document.getElementById('modal-q-next-default');
  const el2 = document.getElementById('modal-q-next-default-simple');
  el1.innerHTML = optionsHtml;
  el2.innerHTML = optionsHtml;

  const nextDef = qData ? (qData.next_default || '') : '';
  el1.value = nextDef;
  el2.value = nextDef;
}

function updateBranchUI(qData) {
  const optionsStr = document.getElementById('modal-q-options').value;
  const options = optionsStr.split(',').map(o => o.trim()).filter(Boolean);
  const container = document.getElementById('branch-rules-container');
  const others = getOtherQuestions();

  const existingRules = (qData && qData.branch_rules) ? qData.branch_rules : {};

  if (options.length === 0) {
    container.innerHTML = '<p style="font-size:11px;color:var(--text-mute)">選択肢を入力すると分岐設定が表示されます。</p>';
    return;
  }

  container.innerHTML = options.map(opt => {
    const selectOpts = '<option value="">（分岐なし）</option>' +
      others.map(q => `<option value="${q.question_id}" ${existingRules[opt]===q.question_id?'selected':''}>${escapeHtml(q.title)}</option>`).join('');
    return `
      <div class="branch-rule-row">
        <span class="option-label">「${escapeHtml(opt)}」</span>
        <span class="arrow">→</span>
        <select class="form-select" data-option="${escapeHtml(opt)}" style="font-size:12px;padding:6px 8px">${selectOpts}</select>
      </div>`;
  }).join('');
}

async function saveQuestion() {
  const title = document.getElementById('modal-q-title').value.trim();
  const type = document.getElementById('modal-q-type').value;
  const options = document.getElementById('modal-q-options').value.trim();
  const required = document.getElementById('modal-q-required').checked;

  if (!title) { alert('質問文は必須です'); return; }
  if (['radio','checkbox','select'].includes(type) && !options) { alert('選択肢を入力してください'); return; }

  // branch_rules 収集
  let branch_rules = {};
  let next_default = '';
  const canBranch = ['radio','select'].includes(type);

  if (canBranch) {
    const rows = document.querySelectorAll('#branch-rules-container .branch-rule-row select');
    rows.forEach(sel => {
      const optVal = sel.getAttribute('data-option');
      if (sel.value) branch_rules[optVal] = sel.value;
    });
    next_default = document.getElementById('modal-q-next-default').value;
  } else {
    next_default = document.getElementById('modal-q-next-default-simple').value;
  }

  showLoading();
  try {
    if (editingQuestionId) {
      await apiPost({action:'updateQuestion', questionId:editingQuestionId, type, title, options, required, next_default, branch_rules});
    } else {
      await apiPost({action:'addQuestion', surveyId:selectedSurveyId, type, title, options, required, next_default, branch_rules});
    }
    closeQuestionModal();
    await loadQuestions(selectedSurveyId);
  } catch(e) { alert('保存失敗: '+e.message); }
  finally { hideLoading(); }
}

async function editQuestion(qid) {
  showLoading();
  try {
    const r = await apiGet('getQuestions', {surveyId:selectedSurveyId});
    if (!r.success) throw new Error(r.error);
    currentQuestions = r.data;
    const q = currentQuestions.find(x => x.question_id === qid);
    if (q) openQuestionModal(q);
  } catch(e) { alert('取得失敗'); }
  finally { hideLoading(); }
}

async function deleteQuestionConfirm(qid, title) {
  if (!confirm(`「${title}」を削除しますか？`)) return;
  showLoading();
  try { await apiPost({action:'deleteQuestion',questionId:qid}); await loadQuestions(selectedSurveyId); }
  catch(e) { alert('削除失敗'); } finally { hideLoading(); }
}

// ============================================================
//  Responses
// ============================================================

async function loadResponses(surveyId) {
  document.getElementById('response-viewer').classList.remove('hidden');
  showLoading();
  try {
    const [rr, qr] = await Promise.all([apiGet('getResponses',{surveyId}), apiGet('getQuestions',{surveyId})]);
    if (!rr.success||!qr.success) throw new Error('取得エラー');
    const responses = rr.data;
    const questions = qr.data.filter(q => q.active===true||q.active==='TRUE');

    const grouped = {};
    responses.forEach(r => {
      if (!grouped[r.response_id]) grouped[r.response_id] = {name:r.respondent_name, email:r.respondent_email, submitted_at:r.submitted_at, answers:{}};
      grouped[r.response_id].answers[r.question_id] = r.answer;
    });
    const entries = Object.values(grouped);

    document.getElementById('response-summary').innerHTML = `<div class="alert alert-info">回答数: <strong>${entries.length}</strong> 件</div>`;

    const table = document.getElementById('response-table');
    if (entries.length === 0) { table.innerHTML = '<tr><td style="color:var(--text-mute)">まだ回答がありません。</td></tr>'; return; }

    let html = '<thead><tr><th>名前</th><th>メール</th>';
    questions.forEach(q => html += `<th>${escapeHtml(q.title)}</th>`);
    html += '<th>送信日時</th></tr></thead><tbody>';
    entries.forEach(e => {
      html += '<tr>';
      html += `<td>${escapeHtml(e.name)}</td><td>${escapeHtml(e.email)}</td>`;
      questions.forEach(q => html += `<td>${escapeHtml(e.answers[q.question_id]||'-')}</td>`);
      html += `<td>${escapeHtml(e.submitted_at||'')}</td></tr>`;
    });
    table.innerHTML = html + '</tbody>';
  } catch(e) { document.getElementById('response-summary').innerHTML = '<div class="alert alert-error">取得失敗</div>'; }
  finally { hideLoading(); }
}

function exportCsv() {
  if (!selectedSurveyId) return;
  window.open(`${CONFIG.API_BASE}?action=exportCsv&surveyId=${selectedSurveyId}&password=${encodeURIComponent(adminPassword)}`, '_blank');
}
