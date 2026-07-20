/* ===================================================================================
   KNK 검사기 출하검증 시스템 — 프론트엔드 (표준 JS, 빌드/CDN 불필요)
   =================================================================================== */
const App = (() => {
  const state = {
    boot: null, run: null, checkItems: [], setup: { verify_mode: '신규' }, judge: null, finish: null,
    stats: null,
    history: { rows: [], selected: new Set(), page: 1, pageSize: 10 },
    issues: { rows: [], editingId: null, page: 1, pageSize: 10, expanded: new Set() },
    chat: { messages: [], busy: false },
  };
  const $ = (id) => document.getElementById(id);
  const view = () => $('view');
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmtDate = (s) => esc((s || '').slice(0, 16));

  // ------------------------------------------------------------ API
  async function request(url, opts) {
    let r;
    try { r = await fetch(url, opts); }
    catch (e) {
      alert('서버에 연결할 수 없습니다.\n\n프로그램이 꺼져 있는 것 같습니다.\n프로젝트 폴더의 "실행하기.bat"를 더블클릭해 다시 실행한 뒤,\n자동으로 열리는 화면에서 사용해 주세요.');
      throw e;
    }
    return r.json();
  }
  const api = {
    get: (u) => request(u),
    post: (u, b) => request(u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }),
  };

  // ------------------------------------------------------------ 네비게이션
  function setNav(name) {
    document.querySelectorAll('.navbtn').forEach(b => b.classList.toggle('active', b.dataset.nav === name));
  }

  async function go(name) {
    if (!state.boot) state.boot = await api.get('/api/bootstrap');
    // 표 위주 화면(히스토리·이슈관리)은 좌우 폭을 넓혀 한 줄로 보이게 함
    document.body.classList.toggle('wide', name === 'history' || name === 'issues');
    if (name === 'home') { setNav('home'); await renderHome(); }
    else if (name === 'setup') { setNav('setup'); renderSetup(); }
    else if (name === 'verify') { setNav('setup'); renderVerify(); }
    else if (name === 'done') { setNav('setup'); renderDone(); }
    else if (name === 'history') { setNav('history'); renderHistory(); }
    else if (name === 'issues') { setNav('issues'); renderIssues(); }
    else if (name === 'analytics') { setNav('analytics'); renderAnalytics(); }
    else if (name === 'chat') { setNav('chat'); renderChat(); }
    window.scrollTo(0, 0);
  }

  // ------------------------------------------------------------ 페이지네이션(공통)
  // 클라이언트 측 페이지네이션 UI를 생성. 페이지 크기(10/100/1000) + 페이지 번호.
  function pagerHtml(total, page, pageSize, changeFn) {
    const pages = Math.max(1, Math.ceil(total / pageSize));
    page = Math.min(page, pages);
    const from = total ? (page - 1) * pageSize + 1 : 0;
    const to = Math.min(page * pageSize, total);
    // 페이지 번호 윈도우 (현재 기준 앞뒤 2개)
    let nums = [];
    const win = 2;
    let lo = Math.max(1, page - win), hi = Math.min(pages, page + win);
    if (page <= win) hi = Math.min(pages, 1 + win * 2);
    if (page > pages - win) lo = Math.max(1, pages - win * 2);
    for (let i = lo; i <= hi; i++) nums.push(i);
    const btn = (p, label, on, dis) =>
      `<button class="pg-btn${on ? ' on' : ''}" ${dis ? 'disabled' : ''} onclick="App.${changeFn}('page',${p})">${label}</button>`;
    const sizeOpts = [10, 100, 1000].map(s =>
      `<option value="${s}" ${s === pageSize ? 'selected' : ''}>${s}개씩</option>`).join('');
    return `
      <div class="pager">
        <div class="pg-info">${from.toLocaleString()}–${to.toLocaleString()} / 총 ${total.toLocaleString()}건</div>
        <div class="pg-nav">
          ${btn(1, '«', false, page === 1)}
          ${btn(Math.max(1, page - 1), '‹', false, page === 1)}
          ${nums.map(n => btn(n, n, n === page, false)).join('')}
          ${btn(Math.min(pages, page + 1), '›', false, page === pages)}
          ${btn(pages, '»', false, page === pages)}
        </div>
        <select class="pg-size" onchange="App.${changeFn}('size',this.value)">${sizeOpts}</select>
      </div>`;
  }

  function today() { return new Date().toISOString().slice(0, 10); }
  function weekAgo() { const d = new Date(); d.setDate(d.getDate() - 7); return d.toISOString().slice(0, 10); }
  function downloadWeeklyReport() {
    const start = $('f_report_start').value, end = $('f_report_end').value;
    if (!start || !end) { alert('시작일/종료일을 모두 선택하세요.'); return; }
    window.location.href = `/api/report/weekly?start=${start}&end=${end}`;
  }
  function downloadBackup() { window.location.href = '/api/backup'; }

  const resultBadge = (r) => r === 'PASS' ? 'j-정상' : r === 'FAIL' ? 'j-알림' : 'j-주의';

  // ------------------------------------------------------------ 홈 (대시보드)
  // 온라인 데모(Vercel) 여부 — 사내망·파일저장이 없는 환경이라 안내가 필요
  function isDemo() {
    return /vercel\.app$/.test(location.hostname);
  }

  async function renderHome() {
    const st = state.stats = await api.get('/api/stats');
    const recentRows = (st.recent || []).map(r => `
      <tr class="clickable" onclick="App.openRun(${r.run_id})">
        <td>${fmtDate(r.run_date)}</td>
        <td><b>${esc(r.model_name)}</b></td>
        <td>${esc(r.tester_type)}</td>
        <td>${r.unit_no ?? '-'}</td>
        <td>${esc(r.customer || '-')}</td>
        <td>${esc(r.verify_mode || '-')}</td>
        <td><span class="jbadge ${resultBadge(r.result)}">${esc(r.result)}</span></td>
      </tr>`).join('');

    view().innerHTML = `
      ${isDemo() ? `<div class="demo-banner">
        <b>온라인 데모</b> — 기능을 둘러보는 용도입니다. 데이터는 비어 있고 새로고침 시 초기화됩니다.
        실제 이슈 축적·사내 서버(Z:) 동기화는 <b>회사 PC에서 프로그램 실행</b> 시 동작합니다.
      </div>` : ''}
      <section class="hero">
        <span class="tag">케이엔케이 품질팀 · 검사기 출하검증 자동화</span>
        <h1>출하 검사 순서도대로 검증하고,<br>데이터로 자동 판정합니다.</h1>
        <p>모델을 선택하면 과거 이슈를 먼저 안내하고, 순서도 22단계를 따라 검사 항목을 체크하며,
           검사 로그를 넣으면 Open/Short·경계·이탈을 자동 판정합니다. 모든 데이터는 로컬 DB에 축적됩니다.</p>
        <div class="actions">
          <button class="btn btn-lg" onclick="App.go('setup')">＋ 새 검증 시작</button>
          <button class="btn btn-lg secondary" onclick="App.go('history')">🗂 히스토리 보기</button>
        </div>
      </section>

      <div class="stat-row">
        <div class="stat"><b>${st.total}</b><span>총 검증</span></div>
        <div class="stat"><b style="color:var(--accent)">${st.pass}</b><span>PASS</span></div>
        <div class="stat"><b style="color:var(--red)">${st.fail}</b><span>FAIL</span></div>
        <div class="stat"><b>${st.month}</b><span>이번 달 검증</span></div>
      </div>

      <div class="card mt20">
        <div class="card-title">⚡ 퀵 이슈 입력</div>
        <div class="card-sub">모델명·호기를 포함해 한 줄로 적으면 자동 인식해 바로 등록합니다. 예) "SM-A276 1호기 드림텍 마킹 위치 불량"</div>
        <div class="chat-input" style="padding:12px 0 0">
          <input class="input" id="quickIssue" placeholder="모델명 호기 증상을 한 줄로…">
          <button class="btn btn-primary" onclick="App.quickIssue()">등록</button>
        </div>
        <p class="hint mt8" id="quickMsg"></p>
      </div>

      <div class="card mt16" id="openIssuesCard" style="display:none">
        <div class="row-between">
          <div><div class="card-title">🔔 미해결·모니터링 중 이슈 <b id="openCount" style="color:var(--red)"></b></div>
            <div class="card-sub">상태를 '개선완료'로 바꿀 때까지 여기에 계속 표시됩니다.</div></div>
          <button class="btn btn-ghost" onclick="App.go('issues')">이슈 관리 →</button>
        </div>
        <div id="openList" class="mt12"></div>
      </div>

      <div class="card mt20">
        <div class="row-between">
          <div>
            <div class="card-title">🕒 최근 검증</div>
            <div class="card-sub">클릭하면 상세 내용을 볼 수 있습니다. ${st.in_progress ? `진행중(미완료) ${st.in_progress}건은 히스토리에서 이어서 할 수 있습니다.` : ''}</div>
          </div>
          <button class="btn btn-ghost" onclick="App.go('history')">전체 보기 →</button>
        </div>
        ${(st.by_type || []).length ? `<div class="summary-row mt12">${st.by_type.map(t =>
          `<span class="chip" style="background:var(--slate-100);color:var(--slate-600)">${esc(t.tester_type)} <span class="num">${t.c}</span></span>`).join('')}</div>` : ''}
        <div class="mt12" style="overflow-x:auto">
          <table class="meas"><thead><tr><th>검증일</th><th>모델명</th><th>검사기종류</th><th>호기</th><th>고객사</th><th>모드</th><th>판정</th></tr></thead>
            <tbody>${recentRows || '<tr><td colspan="7">아직 검증 데이터가 없습니다. "새 검증"으로 시작하세요.</td></tr>'}</tbody></table>
        </div>
      </div>

      ${'' /* 미해결 위젯 데이터는 아래에서 비동기 로드 */}
      <div class="pipeline">
        <div class="pipe"><div class="n">STAGE 1</div><h4>검사기 검증</h4>
          <p>순서도 안내 · 검사 항목 체크 · 로그 자동 판정 · 호기 편차 비교 · 이슈 사전 안내</p>
          <span class="badge badge-now">● 현재 동작</span></div>
        <div class="pipe"><div class="n">STAGE 2</div><h4>문서 자동화</h4>
          <p>체크시트 · 주간보고서 · 히스토리 엑셀 원클릭 출력 (검증 데이터 재사용)</p>
          <span class="badge badge-now">● 현재 동작</span></div>
        <div class="pipe"><div class="n">STAGE 3</div><h4>AI 지원</h4>
          <p>셀프 AS 챗봇 · 보고서 요약 · 메뉴얼 학습 (issue_history + 순서도 근거)</p>
          <span class="badge badge-next">확장 예정</span></div>
      </div>

      <div class="card mt20">
        <div class="card-title">📅 보고서 추출</div>
        <div class="card-sub">기간을 정하면 그 사이 검증 완료된 데이터(검사자 의견)를 주간 업무 보고서 엑셀로 묶어 내려받습니다.</div>
        <div class="grid2 mt12">
          <div class="field"><label>시작일</label>
            <input class="input" type="date" id="f_report_start" value="${weekAgo()}"></div>
          <div class="field"><label>종료일</label>
            <input class="input" type="date" id="f_report_end" value="${today()}"></div>
        </div>
        <button class="btn btn-primary mt12" onclick="App.downloadWeeklyReport()">📊 주간보고서 엑셀 다운로드</button>
      </div>

      <div class="card mt20">
        <div class="card-title">💾 데이터 백업</div>
        <div class="card-sub">로컬 DB(quality.db)를 파일로 내려받아 USB나 사내 서버 등 안전한 곳에 보관하세요.
          복원할 때는 내려받은 파일 이름을 quality.db 로 바꿔 프로젝트의 data 폴더에 덮어쓰면 됩니다.</div>
        <button class="btn mt12" onclick="App.downloadBackup()">💾 백업 파일 다운로드</button>
      </div>

      <div class="card mt20">
        <div class="card-title">🗂 등록된 검사기 (로컬 DB)</div>
        <div class="card-sub">양산 모드 검증 시 앞 호기 데이터와 자동 비교됩니다.</div>
        <div class="check-list mt12">
          ${(state.boot.testers || []).map(t => `
            <div class="check-row">
              <div class="info"><b>${esc(t.model_name)}</b>
                <small>${esc(t.tester_type)} · REV ${esc(t.model_rev || '-')} · 고객사 ${esc(t.customer || '-')}</small></div>
            </div>`).join('') || '<div class="check-row"><div class="info"><small>등록된 검사기가 없습니다.</small></div></div>'}
        </div>
      </div>`;
    const qi = $('quickIssue');
    if (qi) qi.addEventListener('keydown', e => { if (e.key === 'Enter') quickIssue(); });
    loadOpenIssuesWidget();
  }

  async function loadOpenIssuesWidget() {
    try {
      const r = await api.get('/api/issues/open');
      if (!r || !r.count || !$('openIssuesCard')) return;
      $('openIssuesCard').style.display = '';
      $('openCount').textContent = `${r.count}건`;
      $('openList').innerHTML = r.rows.slice(0, 6).map(i => `
        <div class="watch-row" onclick="App.openIssuesFor('${esc(i.model_name).replace(/'/g, "\\'")}')" title="클릭 → 이슈 관리에서 검색">
          <span class="st-tag ${i.status && i.status.startsWith('미해결') ? 'bad' : 'mid'}">${esc(i.status)}</span>
          <div class="watch-main"><b>${esc(i.model_name)}${i.unit_label ? ' · ' + esc(i.unit_label) : ''}</b>
            <span class="hint">${esc((i.title || '').slice(0, 50))}</span></div>
          <span class="hint">${esc((i.issue_date || '').slice(0, 10))}</span>
        </div>`).join('');
    } catch (e) { /* 무시 */ }
  }

  async function quickIssue() {
    const t = $('quickIssue');
    const msg = $('quickMsg');
    if (!t || !t.value.trim()) return;
    try {
      const r = await api.post('/api/issue/quick', { text: t.value.trim() });
      if (r.error) { msg.textContent = '⚠ ' + r.error; msg.style.color = 'var(--red)'; return; }
      msg.innerHTML = `✓ 등록됨 — <b>${esc(r.model)}</b>${r.unit ? ' · ' + esc(r.unit) : ''}` +
        `${r.tags ? ' · 태그 ' + esc(r.tags.replace(/^,|,$/g, '')) : ''} (이슈 관리에서 수정 가능)`;
      msg.style.color = 'var(--accent)';
      t.value = '';
    } catch (e) { msg.textContent = '⚠ 등록 실패'; msg.style.color = 'var(--red)'; }
  }

  // ------------------------------------------------------------ 검증 설정
  function renderSetup() {
    const b = state.boot, s = state.setup;
    const typeOpts = b.tester_types.map(t => `<option ${s.tester_type === t ? 'selected' : ''}>${esc(t)}</option>`).join('');
    const models = [...new Set((b.testers || []).map(t => t.model_name))];
    view().innerHTML = `
      <div class="row-between mt8"><h2 style="font-size:22px">새 검증 시작</h2></div>
      <p class="hint mt8">검사기 정보와 검증 모드를 입력하세요. 시작하면 해당 모델의 과거 이슈를 먼저 안내합니다.</p>

      <div class="card mt16">
        <div class="grid2">
          <div class="field"><label>모델명 <span class="req">*</span></label>
            <input class="input" id="f_model" list="modelList" placeholder="예) SM-S952 SUB" value="${esc(s.model_name || '')}">
            <datalist id="modelList">${models.map(m => `<option value="${esc(m)}">`).join('')}</datalist></div>
          <div class="field"><label>모델 REV.</label>
            <input class="input" id="f_rev" placeholder="예) R0.5" value="${esc(s.model_rev || '')}"></div>
          <div class="field"><label>검사기 종류 <span class="req">*</span></label>
            <select id="f_type">${typeOpts}</select></div>
          <div class="field"><label>호기 번호</label>
            <input class="input" id="f_unit" type="number" min="1" placeholder="예) 3" value="${esc(s.unit_no || '')}"></div>
          <div class="field"><label>대상 보드</label>
            <input class="input" id="f_board" placeholder="예) SUB board" value="${esc(s.board_type || '')}"></div>
          <div class="field"><label>고객사</label>
            <input class="input" id="f_customer" placeholder="예) 드림텍" value="${esc(s.customer || '')}"></div>
          <div class="field"><label>검사자 <span class="req">*</span></label>
            <input class="input" id="f_inspector" placeholder="예) 홍길동" value="${esc(s.inspector || localStorage.getItem('knk_inspector') || '')}"></div>
          <div class="field"><label>검증일</label>
            <input class="input" value="${new Date().toLocaleDateString('ko-KR')}" readonly style="background:var(--slate-50);color:var(--slate-500)"></div>
        </div>

        <div class="field mt16"><label>검증 모드 <span class="req">*</span></label>
          <div class="mode-row" id="modeRow">
            ${modeCard('신규', '1호기 첫 검증', '순서도 전 항목 + 전핀 검출력')}
            ${modeCard('MODIFY', '재검증', '변경점 비교 후 검출력 재확인')}
            ${modeCard('양산', '2호기 이상', '앞 호기 데이터와 편차 비교')}
          </div>
        </div>

        <button class="btn btn-primary btn-lg btn-block mt20" onclick="App.startRun()">검증 시작 →</button>
        <p class="hint mt8" id="setupErr" style="color:var(--red)"></p>
      </div>`;
  }

  function modeCard(id, title, sub) {
    const on = state.setup.verify_mode === id;
    return `<button type="button" class="mode-card ${on ? 'on' : ''}" onclick="App.pickMode('${id}')">
      <b>${id}</b><small>${esc(title)} · ${esc(sub)}</small></button>`;
  }
  function pickMode(m) { state.setup.verify_mode = m; document.querySelectorAll('.mode-card').forEach(c => c.classList.toggle('on', c.querySelector('b').textContent === m)); }

  function collectSetup() {
    const g = id => ($(id) ? $(id).value.trim() : '');
    const s = state.setup;
    s.model_name = g('f_model'); s.model_rev = g('f_rev'); s.tester_type = $('f_type').value;
    s.unit_no = g('f_unit') ? Number(g('f_unit')) : null; s.board_type = g('f_board');
    s.customer = g('f_customer'); s.inspector = g('f_inspector');
    if (s.inspector) localStorage.setItem('knk_inspector', s.inspector);   // 검사자 이름 기억
    return s;
  }

  async function startRun() {
    const s = collectSetup();
    if (!s.model_name || !s.tester_type || !s.inspector) {
      $('setupErr').textContent = '모델명 · 검사기 종류 · 검사자는 필수입니다.'; return;
    }
    if (s.unit_no !== null && (!Number.isInteger(s.unit_no) || s.unit_no < 1)) {
      $('setupErr').textContent = '호기 번호는 1 이상의 숫자로 입력하세요.'; return;
    }
    if (s.verify_mode === '양산' && !s.unit_no) {
      $('setupErr').textContent = '양산 모드는 앞 호기와 비교하므로 호기 번호가 필요합니다. (예: 2)'; return;
    }
    const res = await api.post('/api/run/start', s);
    if (res.error) { $('setupErr').textContent = '오류: ' + res.error; return; }
    state.run = res;
    state.run.photos = [];
    state.checkItems = res.check_items;
    state.judge = null;
    go('verify');
  }

  // ------------------------------------------------------------ 검증 진행
  function renderVerify() {
    const r = state.run, s = state.setup;
    const issues = r.issues || [];
    const priorHtml = (r.prior_units && r.prior_units.length)
      ? `<div class="hint mt8">앞 호기 기준선: ${r.prior_units.map(p => `${p.unit_no}호기 ${p.value}`).join(', ')}</div>` : '';

    view().innerHTML = `
      <div class="row-between mt8">
        <div><h2 style="font-size:22px">${esc(s.model_name)} <span style="color:var(--slate-400);font-weight:700">· ${esc(s.tester_type)}</span></h2>
          <p class="hint">REV ${esc(s.model_rev || '-')} · ${s.unit_no ? s.unit_no + '호기 · ' : ''}검사자 ${esc(s.inspector)} · <b>${esc(r.mode)}</b> 모드</p></div>
        <button class="btn btn-ghost" onclick="App.go('setup')">← 설정</button>
      </div>

      <div class="issue" ${issues.length ? '' : 'style="display:none"'}>
        <div class="head">⚠ 검사 전 확인 — ${esc(s.model_name)} 과거 이슈 ${issues.length}건</div>
        <div class="body">
          ${issues.map(i => `<div class="issue-item">
            <div class="t">${esc(i.title || i.item || '출하이슈')}${i.unit_label ? ' · ' + esc(i.unit_label) : ''}${i.issue_date ? ' · ' + esc((i.issue_date || '').slice(0, 10)) : ''}</div>
            <div class="d">${esc(i.raw_text || i.symptom || '')}</div></div>`).join('')}
        </div>
      </div>

      <div class="card">
        <div class="card-title"><span style="background:var(--brand-50);color:var(--brand-700);padding:4px 10px;border-radius:8px;font-size:13px">${esc(r.mode)}</span> 모드 안내</div>
        <p class="card-sub mt8">${esc(r.mode_guide)}</p>${priorHtml}
      </div>

      <div class="card">
        <div class="row-between">
          <div>
            <div class="card-title"><span class="section-num">1</span> 검증 체크리스트 (22단계)</div>
            <div class="card-sub">순서대로 확인하며 PASS/FAIL을 누르세요. 항목명을 누르면 절차·기준이 펼쳐집니다.</div>
          </div>
          <div style="display:flex;gap:8px;flex-shrink:0">
            <button class="btn btn-ghost btn-mini" onclick="App.markAll('PASS')" title="미검사 항목을 모두 PASS로">✓ 전체 PASS</button>
            <button class="btn btn-ghost btn-mini" onclick="App.markAll('미검사')" title="모두 미검사로 되돌리기">↺</button>
          </div>
        </div>
        <div class="ck-progress mt12"><i id="ckBar"></i><span id="ckText"></span></div>
        <div class="check-list mt12" id="checkList">
          ${renderCheckList()}
        </div>
      </div>

      <div class="card">
        <div class="card-title"><span class="section-num">2</span> 검사 로그 자동 판정</div>
        <div class="card-sub">장비 로그(.log)를 그대로 올리면 형식을 자동 인식해 판정합니다 —
          기능검사기(FUNC) · 방수(WP) · PROXIMITY · VSWR · LNA · TSP · CSV 지원.
          검출력/PASS DATA 로그는 단일 판정, 반복성 로그(10회 이상)는 회차별 산포 분석.</div>
        <div class="mt12">
          <input type="file" id="logFile" accept=".csv,.txt,.log" style="display:none" onchange="App.onFile(event)">
          <div class="uploader" id="drop" onclick="document.getElementById('logFile').click()">
            📄 CSV/로그 파일을 클릭하여 선택 &nbsp;·&nbsp; 또는 아래에 붙여넣기
          </div>
          <textarea id="logText" class="mt12" placeholder="SECTION,ITEM,VALUE,SPEC_LOW,SPEC_HIGH,REPEAT_INDEX ..."></textarea>
          <div class="row-between mt8">
            <div style="display:flex;gap:8px;align-items:center">
              <select id="sampleSel" style="width:auto">
                <option value="">기본 CSV 샘플</option>
                ${(state.boot.sample_logs || []).map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join('')}
              </select>
              <button class="btn btn-ghost" onclick="App.loadSample()">샘플 불러오기</button>
            </div>
            <button class="btn btn-primary" onclick="App.parseLog()">▶ 자동 판정 실행</button>
          </div>
          <div id="judgeResult"></div>
        </div>
      </div>

      <div class="card">
        <div class="card-title"><span class="section-num">3</span> 검증 사진 (선택)</div>
        <div class="card-sub">검사기 전면/후면·LCD·핀블록 등 사진을 첨부하면 컴퓨터(data/photos 폴더)에 저장되고, 히스토리 상세에서 다시 볼 수 있습니다.</div>
        <div class="field mt12"><label>사진 종류</label>
          <select id="f_phototype" style="max-width:260px">${(state.boot.photo_types || []).map(p => `<option>${esc(p)}</option>`).join('')}</select></div>
        <input type="file" id="photoFile" accept="image/*" multiple style="display:none" onchange="App.onPhotoFiles(event)">
        <div class="drop-zone mt12" id="runZone">
          <div class="dz-icon">📷</div>
          <div class="dz-main">사진을 <b>드래그</b>하거나 <b>클릭</b>해서 선택 · 캡처 후 <b>Ctrl+V</b></div>
          <div class="dz-sub">여러 장 한 번에 가능 · 큰 이미지는 자동 축소
            <button type="button" class="btn btn-ghost btn-mini" onclick="event.stopPropagation();App.pasteFromClipboard()">📋 클립보드에서 붙여넣기</button></div>
        </div>
        <div class="photo-grid mt12" id="photoGrid"></div>
      </div>

      <div class="card">
        <div class="card-title"><span class="section-num">4</span> 이슈 기록 & 검증 완료</div>
        <div class="card-sub">이슈가 있었다면 증상→원인→조치→상태로 나눠 적어주세요.
          <b>검증 완료 시 이슈 이력에 자동 등록</b>되어, 다음 검증의 "검사 전 확인"과 AI 도우미 답변에 바로 활용됩니다.
          (모델·호기·고객사·날짜는 자동으로 채워집니다)</div>
        <div class="field mt12"><label>① 증상 (이슈가 없으면 비워두세요)</label>
          <textarea id="f_i_symptom" class="ta-sm" placeholder="예) 반복성 검사 중 마이크 감도 전류값 가성불량 발생"
            oninput="App.autoTagInput('verify')" onblur="App.suggestTags('verify')"></textarea></div>
        <div class="grid2 mt12">
          <div class="field"><label>② 원인 (선택)</label>
            <input class="input" id="f_i_cause" placeholder="예) 메인보드 전원부 불안정"></div>
          <div class="field"><label>④ 상태</label>
            <select id="f_i_status"><option value="">선택 안 함</option>
              <option>개선완료</option><option>임시조치·모니터링</option>
              <option>미해결·추후확인</option><option>정보공유</option></select></div>
        </div>
        <div class="field mt12"><label>③ 조치</label>
          <textarea id="f_i_action" class="ta-sm" placeholder="예) 메인보드 교체 후 재측정 → 정상 확인"
            oninput="App.autoTagInput('verify')" onblur="App.suggestTags('verify')"></textarea></div>
        <div class="field mt12">
          <label>태그 <button type="button" class="btn btn-ghost btn-mini" onclick="App.suggestTags('verify')">⚡ 자동 추천</button>
            <span class="hint" id="f_tagHint" style="color:var(--brand-700);font-weight:700"></span></label>
          <div id="f_i_tags" class="tag-picker"></div></div>

        <div class="grid2 mt16">
          <div class="field"><label>관련 부품</label>
            <select id="f_component"><option value="">선택 안 함</option>${(state.boot.component_types || []).map(c => `<option>${esc(c)}</option>`).join('')}</select></div>
          <div class="field"><label>증상 분류</label>
            <select id="f_symptom"><option value="">선택 안 함</option>${(state.boot.symptom_types || []).map(s => `<option>${esc(s)}</option>`).join('')}</select></div>
        </div>
        <div class="field mt12"><label>기타 의견 (자유 기록)</label>
        <textarea id="comment" placeholder="예) 1번 시료 DIFF 값이 다소 높음. 재조립 후 재측정 예정.">${esc(r.inspector_comment || '')}</textarea></div>
        <button class="btn btn-accent btn-lg btn-block mt16" onclick="App.finish()">검증 완료 및 판정 →</button>
      </div>`;
    state.verifyTags = new Set();
    state.verifyDismissed = new Set();
    renderVerifyTagPicker();
    renderCheckProgress();
    setupDrop();
    bindPhotoZone('runZone', 'photoFile');
    renderPhotoGrid();
  }

  function renderVerifyTagPicker() {
    const box = $('f_i_tags');
    if (!box) return;
    const sel = state.verifyTags || new Set();
    box.innerHTML = tagVocab().map(t =>
      `<button type="button" class="tag-pick ${sel.has(t) ? 'on' : ''}" onclick="App.toggleVerifyTag('${esc(t).replace(/'/g, "\\'")}')">${esc(t)}</button>`).join('');
  }
  function toggleVerifyTag(t) {
    const c = tagCtx('verify');
    if (c.set.has(t)) { c.set.delete(t); c.dismissed.add(t); }   // 수동 해제 → 자동이 다시 안 붙임
    else { c.set.add(t); c.dismissed.delete(t); }
    renderVerifyTagPicker();
  }

  // 체크리스트 렌더 — 22단계 본항목 + 조건부 항목(해당 시)을 구분해 표시
  function renderCheckList() {
    const items = state.checkItems || [];
    const main = items.filter(i => i.category !== '조건부');
    const cond = items.filter(i => i.category === '조건부');
    let html = '';
    let lastCat = null;
    main.forEach(it => {
      if (it.category !== lastCat) {
        html += `<div class="ck-group">${esc(it.category)}</div>`;
        lastCat = it.category;
      }
      html += checkRow(it);
    });
    if (cond.length) {
      html += `<div class="ck-group cond">조건부 — 해당 모델/고객사에만 적용 (필요 시에만 체크)</div>`;
      html += cond.map(checkRow).join('');
    }
    return html;
  }

  function checkRow(it) {
    return `<div class="check-row" data-item="${it.id}">
      <div class="seq">${it.seq}</div>
      <div class="info" onclick="App.toggleDetail(${it.id})" title="클릭하면 절차·기준 보기">
        <b>${esc(it.item_name)}</b>
        <div class="ck-detail" id="ckd_${it.id}">
          ${it.test_desc ? `<small>절차: ${esc(it.test_desc)}</small>` : ''}
          <small class="crit">기준: ${esc(it.criteria || '-')}</small>
        </div>
      </div>
      <div class="seg">
        <button class="pass ${it.result === 'PASS' ? 'on' : ''}" onclick="App.setItem(${it.id},'PASS')">PASS</button>
        <button class="fail ${it.result === 'FAIL' ? 'on' : ''}" onclick="App.setItem(${it.id},'FAIL')">FAIL</button>
      </div></div>`;
  }

  function toggleDetail(id) {
    const el = $(`ckd_${id}`);
    if (el) el.classList.toggle('open');
  }

  // 미검사 항목 일괄 처리 (조건부 항목은 제외 — 해당 시에만 체크)
  async function markAll(result) {
    const targets = (state.checkItems || []).filter(i =>
      i.category !== '조건부' && (result === '미검사' || i.result === '미검사'));
    if (!targets.length) { renderCheckProgress(); return; }
    if (result === 'PASS' && !confirm(
      `미검사 항목 ${targets.length}건을 모두 PASS로 표시할까요?\n` +
      `(문제가 있던 항목은 개별로 FAIL로 바꿔주세요)`)) return;
    targets.forEach(i => { i.result = result; });
    $('checkList').innerHTML = renderCheckList();
    renderCheckProgress();
    await Promise.all(targets.map(i => api.post('/api/run/checkitem', { item_id: i.id, result })));
  }

  function renderCheckProgress() {
    const items = (state.checkItems || []).filter(i => i.category !== '조건부');
    const done = items.filter(i => i.result !== '미검사').length;
    const fail = items.filter(i => i.result === 'FAIL').length;
    const bar = $('ckBar'), txt = $('ckText');
    if (!bar || !txt) return;
    bar.style.width = items.length ? `${done * 100 / items.length}%` : '0%';
    bar.className = fail ? 'has-fail' : '';
    txt.textContent = `${done} / ${items.length} 완료` + (fail ? ` · FAIL ${fail}건` : '');
  }
  async function setItem(id, result) {
    const it = state.checkItems.find(x => x.id === id);
    if (it && it.result === result) result = '미검사';
    if (it) it.result = result;
    const row = document.querySelector(`.check-row[data-item="${id}"]`);
    if (row) { row.querySelector('.pass').classList.toggle('on', result === 'PASS'); row.querySelector('.fail').classList.toggle('on', result === 'FAIL'); }
    renderCheckProgress();
    await api.post('/api/run/checkitem', { item_id: id, result });
  }

  // ------------------------------------------------------------ 검증 사진
  function renderPhotoGrid() {
    const el = $('photoGrid');
    if (!el) return;
    const photos = (state.run && state.run.photos) || [];
    el.innerHTML = photos.map((p, i) => `
      <div class="photo-item" data-vw="run" data-url="${esc(p.url)}"
           data-name="${esc(p.photo_type || '사진')}" data-meta="검증 사진">
        <img src="${esc(p.url)}" alt="${esc(p.photo_type)}" onclick="App.openViewerFrom('run',${i})">
        <div class="photo-meta"><span>${esc(p.photo_type || '-')}</span>
          <button type="button" onclick="App.removePhoto(${p.id})">삭제</button></div>
      </div>`).join('') || '<div class="hint">등록된 사진이 없습니다.</div>';
  }

  function onPhotoFiles(e) {
    const files = [...e.target.files];
    e.target.value = '';
    if (files.length) receivePhotos(files, '파일선택');
  }

  async function uploadPhoto(file) {
    const data = await compressImage(file);       // 큰 사진 자동 축소 후 업로드
    const res = await api.post('/api/run/photo', {
      run_id: state.run.run_id, photo_type: $('f_phototype') ? $('f_phototype').value : '',
      filename: file.name, data,
    });
    if (res.error) { toast('사진 업로드 실패: ' + res.error, 'warn'); return; }
    state.run.photos = state.run.photos || [];
    state.run.photos.push(res);
    renderPhotoGrid();
  }

  // ------------------------------------------------------------ 이미지 뷰어(프로그램 내장)
  // 사진 클릭 → 새 창 대신 오버레이. 확대/축소·이동·회전·정보·다운로드·이전/다음.
  const viewer = { list: [], idx: 0, zoom: 1, rot: 0, tx: 0, ty: 0, drag: null };

  function openViewer(list, idx) {
    viewer.list = list || [];
    viewer.idx = idx || 0;
    if (!viewer.list.length) return;
    if (!$('imgViewer')) {
      const el = document.createElement('div');
      el.id = 'imgViewer';
      el.className = 'viewer';
      el.innerHTML = `
        <div class="vw-bar">
          <div class="vw-title"><b id="vwName"></b><span id="vwMeta"></span></div>
          <div class="vw-tools">
            <button onclick="App.vwZoom(-1)" title="축소 (-)">➖</button>
            <span id="vwZoom">100%</span>
            <button onclick="App.vwZoom(1)" title="확대 (+)">➕</button>
            <button onclick="App.vwFit()" title="화면에 맞춤 (0)">⤢ 맞춤</button>
            <button onclick="App.vwRotate()" title="회전 (R)">↻</button>
            <button onclick="App.vwDownload()" title="다운로드 (D)">⬇ 저장</button>
            <button onclick="App.vwCopy()" title="이미지 복사">⧉ 복사</button>
            <button onclick="App.vwOpenTab()" title="새 탭에서 원본">↗</button>
            <button class="vw-close" onclick="App.closeViewer()" title="닫기 (Esc)">✕</button>
          </div>
        </div>
        <button class="vw-nav prev" onclick="App.vwStep(-1)" title="이전 (←)">‹</button>
        <button class="vw-nav next" onclick="App.vwStep(1)" title="다음 (→)">›</button>
        <div class="vw-stage" id="vwStage"><img id="vwImg" alt=""></div>
        <div class="vw-foot"><span id="vwCount"></span>
          <span class="vw-hint">마우스 휠: 확대/축소 · 드래그: 이동 · 더블클릭: 맞춤 · ←/→: 이전·다음 · Esc: 닫기</span></div>`;
      document.body.appendChild(el);
      const stage = el.querySelector('#vwStage');
      stage.addEventListener('wheel', e => { e.preventDefault(); vwZoom(e.deltaY < 0 ? 1 : -1); }, { passive: false });
      stage.addEventListener('mousedown', e => {
        viewer.drag = { x: e.clientX - viewer.tx, y: e.clientY - viewer.ty };
        stage.classList.add('grabbing');
      });
      window.addEventListener('mousemove', e => {
        if (!viewer.drag) return;
        viewer.tx = e.clientX - viewer.drag.x; viewer.ty = e.clientY - viewer.drag.y; vwApply();
      });
      window.addEventListener('mouseup', () => { viewer.drag = null; stage.classList.remove('grabbing'); });
      stage.addEventListener('dblclick', () => vwFit());
      el.addEventListener('click', e => { if (e.target === el) closeViewer(); });
    }
    $('imgViewer').classList.add('on');
    document.body.style.overflow = 'hidden';
    vwLoad();
  }

  function vwLoad() {
    const it = viewer.list[viewer.idx];
    if (!it) return;
    viewer.zoom = 1; viewer.rot = 0; viewer.tx = 0; viewer.ty = 0;
    const img = $('vwImg');
    img.src = it.url;
    img.onload = () => {
      $('vwMeta').textContent =
        `${img.naturalWidth}×${img.naturalHeight}px${it.meta ? ' · ' + it.meta : ''}`;
    };
    $('vwName').textContent = it.name || '사진';
    $('vwCount').textContent = `${viewer.idx + 1} / ${viewer.list.length}`;
    const many = viewer.list.length > 1;
    $('imgViewer').querySelectorAll('.vw-nav').forEach(b => b.style.display = many ? '' : 'none');
    vwApply();
  }
  function vwApply() {
    const img = $('vwImg');
    if (!img) return;
    img.style.transform = `translate(${viewer.tx}px, ${viewer.ty}px) scale(${viewer.zoom}) rotate(${viewer.rot}deg)`;
    if ($('vwZoom')) $('vwZoom').textContent = Math.round(viewer.zoom * 100) + '%';
  }
  function vwZoom(dir) {
    viewer.zoom = Math.min(8, Math.max(0.1, viewer.zoom * (dir > 0 ? 1.25 : 0.8)));
    vwApply();
  }
  function vwFit() { viewer.zoom = 1; viewer.tx = 0; viewer.ty = 0; vwApply(); }
  function vwRotate() { viewer.rot = (viewer.rot + 90) % 360; vwApply(); }
  function vwStep(d) {
    if (viewer.list.length < 2) return;
    viewer.idx = (viewer.idx + d + viewer.list.length) % viewer.list.length;
    vwLoad();
  }
  function vwDownload() {
    const it = viewer.list[viewer.idx];
    if (!it) return;
    const a = document.createElement('a');
    a.href = it.url; a.download = it.name || 'photo.png';
    document.body.appendChild(a); a.click(); a.remove();
  }
  function vwOpenTab() {
    const it = viewer.list[viewer.idx];
    if (it) window.open(it.url, '_blank');
  }
  async function vwCopy() {
    const it = viewer.list[viewer.idx];
    if (!it) return;
    try {
      const blob = await (await fetch(it.url)).blob();
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
      alert('이미지를 클립보드에 복사했습니다. 보고서 등에 Ctrl+V 하세요.');
    } catch (e) { alert('이 브라우저에서는 이미지 복사가 지원되지 않습니다. "⬇ 저장"을 이용하세요.'); }
  }
  function closeViewer() {
    const el = $('imgViewer');
    if (el) el.classList.remove('on');
    document.body.style.overflow = '';
  }
  function viewerKeys(e) {
    const el = $('imgViewer');
    if (!el || !el.classList.contains('on')) return;
    if (e.key === 'Escape') closeViewer();
    else if (e.key === 'ArrowLeft') vwStep(-1);
    else if (e.key === 'ArrowRight') vwStep(1);
    else if (e.key === '+' || e.key === '=') vwZoom(1);
    else if (e.key === '-') vwZoom(-1);
    else if (e.key === '0') vwFit();
    else if (e.key.toLowerCase() === 'r') vwRotate();
    else if (e.key.toLowerCase() === 'd') vwDownload();
    else return;
    e.preventDefault();
  }
  // 그리드에서 클릭된 사진 열기 (data-viewer 그룹 단위)
  function openViewerFrom(group, idx) {
    const nodes = [...document.querySelectorAll(`[data-vw="${group}"]`)];
    const list = nodes.map(n => ({ url: n.dataset.url, name: n.dataset.name, meta: n.dataset.meta }));
    openViewer(list, idx);
  }

  // ------------------------------------------------------------ 클립보드 이미지 붙여넣기(Ctrl+V)
  // 화면 어디서든 이미지를 붙여넣으면, 현재 화면에 맞는 사진 첨부로 자동 연결된다.
  //  - 검증 화면(4번 사진 섹션)      → 검증 사진으로 업로드
  //  - 이슈 수정 화면(사진 섹션 표시) → 이슈 사진으로 업로드
  function handlePaste(e) {
    const items = (e.clipboardData && e.clipboardData.items) || [];
    let files = [...items].filter(it => it.kind === 'file' && it.type && it.type.startsWith('image/'))
      .map(it => it.getAsFile()).filter(Boolean);
    // 일부 환경은 items 대신 files 로만 전달
    if (!files.length && e.clipboardData && e.clipboardData.files) {
      files = [...e.clipboardData.files].filter(f => f.type && f.type.startsWith('image/'));
    }
    if (!files.length) return;                    // 텍스트 붙여넣기는 건드리지 않음
    e.preventDefault();
    receivePhotos(files, '붙여넣기');
  }

  // ------------------------------------------------------------ 사진 수집(공통 입구)
  // 붙여넣기 / 드래그&드롭 / 파일선택 모두 이 함수로 들어온다.
  // 현재 화면에 따라 검증 사진 또는 이슈 사진으로 보내고, 저장 전 이슈면 대기열에 쌓는다.
  function receivePhotos(files, how) {
    const imgs = [...files].filter(f => f.type && f.type.startsWith('image/'));
    if (!imgs.length) { toast('이미지 파일이 아닙니다.', 'warn'); return; }

    const onVerify = !!$('photoGrid') && state.run && state.run.run_id;
    const onIssueForm = !!$('issueZone');          // 이슈 폼이 화면에 있으면(열림 여부 무관)
    if (!onVerify && !onIssueForm) {
      toast('여기서는 사진을 붙여넣을 수 없어요. 새 검증 화면이나 이슈 등록 화면에서 사용하세요.', 'warn');
      return;
    }
    if (onVerify) {
      imgs.forEach((f, i) => uploadPhoto(renamed(f, how, i)));
      toast(`${how}: 검증 사진 ${imgs.length}장 추가 중…`);
      return;
    }
    // 이슈 폼 — 폼이 닫혀 있으면 열어준다
    if ($('issueForm') && !$('issueForm').open) $('issueForm').open = true;
    addIssuePhotos(imgs.map((f, i) => renamed(f, how, i)), how);
  }

  function renamed(file, how, i) {
    if (file.name && file.name !== 'image.png' && how !== '붙여넣기') return file;
    const ext = (file.type.split('/')[1] || 'png').replace('jpeg', 'jpg');
    return new File([file], `${how}_${Date.now()}_${i + 1}.${ext}`, { type: file.type });
  }

  // 큰 스크린샷 자동 축소 — 10MB 업로드 한도를 넘지 않도록 캔버스로 리사이즈/압축
  function compressImage(file, maxSide = 1800, quality = 0.85) {
    return new Promise(resolve => {
      if (file.size < 400 * 1024 && file.type === 'image/png') {   // 작으면 원본 유지
        const r0 = new FileReader(); r0.onload = () => resolve(r0.result); r0.readAsDataURL(file);
        return;
      }
      const rd = new FileReader();
      rd.onload = () => {
        const img = new Image();
        img.onload = () => {
          let { width: w, height: h } = img;
          const scale = Math.min(1, maxSide / Math.max(w, h));
          w = Math.round(w * scale); h = Math.round(h * scale);
          const cv = document.createElement('canvas');
          cv.width = w; cv.height = h;
          cv.getContext('2d').drawImage(img, 0, 0, w, h);
          try { resolve(cv.toDataURL('image/jpeg', quality)); }
          catch (e) { resolve(rd.result); }
        };
        img.onerror = () => resolve(rd.result);
        img.src = rd.result;
      };
      rd.readAsDataURL(file);
    });
  }

  // ------------------------------------------------------------ 이슈 사진 (대기열 지원)
  async function addIssuePhotos(files, how) {
    const iid = $('i_id') && $('i_id').value ? Number($('i_id').value) : 0;
    for (const f of files) {
      const dataUrl = await compressImage(f);
      if (iid) {
        const res = await api.post('/api/issue/photo', {
          issue_id: iid, filename: f.name, data: dataUrl,
          photo_type: $('ip_type') ? $('ip_type').value : '',
        });
        if (res.error) { toast('업로드 실패: ' + res.error, 'warn'); continue; }
      } else {
        // 저장 전 → 대기열에 보관했다가 저장 직후 업로드
        state.pendingPhotos = state.pendingPhotos || [];
        state.pendingPhotos.push({ name: f.name, data: dataUrl,
          photo_type: $('ip_type') ? $('ip_type').value : '' });
      }
    }
    renderIssuePhotoZone();
    toast(iid ? `${how}: 사진 ${files.length}장 첨부 완료`
              : `${how}: 사진 ${files.length}장 대기 — 저장하면 함께 등록됩니다`);
  }

  // 저장 직후 대기열 업로드
  async function flushPendingPhotos(issueId) {
    const q = state.pendingPhotos || [];
    if (!q.length || !issueId) return 0;
    for (const p of q) {
      await api.post('/api/issue/photo', {
        issue_id: issueId, filename: p.name, data: p.data, photo_type: p.photo_type,
      });
    }
    state.pendingPhotos = [];
    return q.length;
  }

  async function renderIssuePhotoZone() {
    const grid = $('issuePhotoGrid');
    if (!grid) return;
    const iid = $('i_id') && $('i_id').value ? Number($('i_id').value) : 0;
    let html = '';
    if (iid) {
      const ps = await api.get(`/api/issue/photos?issue_id=${iid}`);
      html += (ps || []).map((p, i) => `
        <div class="photo-item" data-vw="issform" data-url="/${esc(p.file_path)}"
             data-name="${esc(p.photo_type || '이슈 사진')}" data-meta="${esc(p.caption || '')}">
          <img src="/${esc(p.file_path)}" onclick="App.openViewerFrom('issform',${i})">
          <div class="photo-meta">
            <input class="cap" value="${esc(p.caption || '')}" placeholder="설명 입력"
                   onchange="App.savePhotoCaption(${p.id}, this.value)">
            <button onclick="App.deleteIssuePhoto(${p.id})" title="삭제">✕</button>
          </div>
        </div>`).join('');
    }
    (state.pendingPhotos || []).forEach((p, i) => {
      html += `
        <div class="photo-item pending">
          <img src="${p.data}">
          <div class="photo-meta"><span>저장 시 등록</span>
            <button onclick="App.removePendingPhoto(${i})" title="빼기">✕</button></div>
        </div>`;
    });
    grid.innerHTML = html;
    const cnt = $('photoCount');
    if (cnt) {
      const total = grid.querySelectorAll('.photo-item').length;
      cnt.textContent = total ? `${total}장` : '';
    }
  }

  function removePendingPhoto(i) {
    (state.pendingPhotos || []).splice(i, 1);
    renderIssuePhotoZone();
  }
  async function savePhotoCaption(pid, caption) {
    await api.post('/api/issue/photo/update', { id: pid, caption });
    toast('설명 저장됨');
  }

  // 클립보드 읽기 버튼 (권한 허용 시 즉시 붙여넣기)
  async function pasteFromClipboard() {
    try {
      const items = await navigator.clipboard.read();
      const files = [];
      for (const it of items) {
        const type = it.types.find(t => t.startsWith('image/'));
        if (type) files.push(new File([await it.getType(type)], 'clip.png', { type }));
      }
      if (!files.length) { toast('클립보드에 이미지가 없습니다. 먼저 캡처(Win+Shift+S)하세요.', 'warn'); return; }
      receivePhotos(files, '붙여넣기');
    } catch (e) {
      toast('브라우저가 막았습니다. 화면을 클릭한 뒤 Ctrl+V 를 눌러 주세요.', 'warn');
    }
  }

  // 드래그&드롭 + 클릭 바인딩
  function bindPhotoZone(zoneId, inputId) {
    const z = $(zoneId);
    if (!z || z.dataset.bound) return;
    z.dataset.bound = '1';
    ['dragenter', 'dragover'].forEach(ev =>
      z.addEventListener(ev, e => { e.preventDefault(); z.classList.add('drag'); }));
    ['dragleave', 'drop'].forEach(ev =>
      z.addEventListener(ev, e => { e.preventDefault(); z.classList.remove('drag'); }));
    z.addEventListener('drop', e => {
      const f = e.dataTransfer && e.dataTransfer.files;
      if (f && f.length) receivePhotos(f, '드래그');
    });
    z.addEventListener('click', e => {
      if (e.target.closest('button')) return;
      if ($(inputId)) $(inputId).click();
    });
  }

  // 간단 토스트 알림
  function toast(msg, kind) {
    let t = $('toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'toast'; t.className = 'toast';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.className = 'toast on' + (kind === 'warn' ? ' warn' : '');
    clearTimeout(t._timer);
    t._timer = setTimeout(() => { t.className = 'toast'; }, 2600);
  }

  async function removePhoto(id) {
    if (!confirm('이 사진을 삭제할까요?')) return;
    await api.post('/api/photo/delete', { id });
    state.run.photos = (state.run.photos || []).filter(p => p.id !== id);
    renderPhotoGrid();
  }

  // ------------------------------------------------------------ 로그 판정
  function setupDrop() {
    const drop = $('drop');
    if (!drop) return;
    ['dragover', 'dragenter'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('drag'); }));
    ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('drag'); }));
    drop.addEventListener('drop', e => { const f = e.dataTransfer.files[0]; if (f) readFile(f); });
  }
  function onFile(e) { const f = e.target.files[0]; if (f) readFile(f); }
  function readFile(f) { const rd = new FileReader(); rd.onload = () => { $('logText').value = rd.result; }; rd.readAsText(f); }
  async function loadSample() {
    const name = $('sampleSel') ? $('sampleSel').value : '';
    const r = await api.get(`/api/sample-log${name ? '?name=' + encodeURIComponent(name) : ''}`);
    if (r.error) { alert(r.error); return; }
    $('logText').value = r.text;
  }

  async function parseLog() {
    const text = $('logText').value.trim();
    if (!text) { $('judgeResult').innerHTML = '<p class="hint" style="color:var(--red)">로그 데이터를 입력하세요.</p>'; return; }
    const res = await api.post('/api/run/parse', {
      run_id: state.run.run_id, text, tester_type: state.setup.tester_type, model_name: state.setup.model_name,
    });
    if (res.error) { $('judgeResult').innerHTML = `<p class="hint" style="color:var(--red)">오류: ${esc(res.error)}</p>`; return; }
    state.judge = res;
    renderJudge(res);
  }

  function renderJudge(res) {
    const s = res.summary || {};
    const meta = res.meta || {};

    // 로그 헤더 정보 + 경고 + 장비 항목별 합부
    let metaHtml = '';
    if (meta.model || meta.program || (meta.test_items || []).length) {
      const info = [
        meta.model && `모델 <b>${esc(meta.model)}</b>`,
        meta.unit_no != null && `${esc(meta.unit_no)}호기`,
        meta.program && `프로그램 <b>${esc(meta.program)}</b>`,
        meta.blocks > 1 && `측정 블록 ${meta.blocks}회`,
      ].filter(Boolean).join(' · ');
      const warns = (meta.warnings || []).map(w =>
        `<div class="r" style="color:var(--red);font-weight:700">⚠ ${esc(w)}</div>`).join('');
      const items = meta.test_items || [];
      const ngItems = items.filter(t => t.ng > 0);
      const chips = items.length ? `<div class="summary-row" style="margin-bottom:0">
          ${ngItems.map(t => `<span class="chip alert">${esc(t.name)} NG</span>`).join('')}
          <span class="chip ok"><span class="num">${items.length - ngItems.length}</span> 항목 OK</span>
          ${ngItems.length ? `<span class="chip alert"><span class="num">${ngItems.length}</span> 항목 NG</span>` : ''}
        </div>` : '';
      metaHtml = `<div class="rep-box mt12"><b>📄 로그 정보</b>
        ${info ? `<div class="r mt8">${info}</div>` : ''}${warns}${chips ? '<div class="mt8"></div>' + chips : ''}</div>`;
    }

    // 대용량 로그(PASS DATA 등)는 알림/주의 전부 + 정상 일부만 표시
    const MAX_ROWS = 400;
    const all = res.measurements || [];
    let shown = all, hiddenNormal = 0;
    if (all.length > MAX_ROWS) {
      const abnormal = all.filter(m => m.judge !== '정상');
      const normal = all.filter(m => m.judge === '정상');
      const keep = Math.max(MAX_ROWS - abnormal.length, 50);
      shown = abnormal.concat(normal.slice(0, keep));
      hiddenNormal = normal.length - Math.min(keep, normal.length);
    }
    const rows = shown.map(m => `<tr>
      <td>${esc(m.item)}</td>
      <td class="val">${esc(m.value)}</td>
      <td>${m.spec_low ?? '-'} ~ ${m.spec_high ?? '-'}</td>
      <td><span class="jbadge j-${m.judge}">${m.judge}</span></td></tr>`).join('')
      + (hiddenNormal > 0 ? `<tr><td colspan="4" class="hint">… 정상 ${hiddenNormal}건 표시 생략 (데이터는 모두 저장되며 엑셀에 포함됩니다)</td></tr>` : '');

    let rep = '';
    for (const [item, a] of Object.entries(res.repeatability || {})) {
      rep += `<div class="rep-box"><b>반복성 · ${esc(item)}</b>
        <div class="r mt8">측정 ${a.count}회 · 평균 ${a.mean} · 표준편차 ${a.stdev} · 범위 ${a.min}~${a.max} (편차 ${a.range})</div>
        <div class="r">가성 불량 ${a.ng_count}건 · <b style="color:${a.need_remeasure ? 'var(--red)' : 'var(--accent)'}">${esc(a.note)}</b></div></div>`;
    }

    let cmp = '';
    const c = res.unit_comparison;
    if (c && c.has_baseline) {
      cmp = `<div class="cmp-box ${c.warn ? 'warn' : 'okc'}">
        <b>${c.warn ? '⚠ 호기 편차 경고' : '✓ 호기 편차 정상'}</b>
        <div class="r mt8">현재값 ${c.current} · 앞 호기 평균 ${c.baseline_mean} (${c.baseline_units.map(u => `${u.unit_no}호기 ${u.value}`).join(', ')})</div>
        <div class="r">편차 ${c.diff} (${c.diff_pct}%) · 기준 ${c.threshold_pct}% · ${esc(c.note)}</div></div>`;
    } else if (c && !c.has_baseline) {
      cmp = `<div class="rep-box"><div class="r">${esc(c.note)}</div></div>`;
    }

    $('judgeResult').innerHTML = `
      ${metaHtml}
      <div class="summary-row">
        <span class="chip ok"><span class="num">${s['정상'] || 0}</span> 정상</span>
        <span class="chip warn"><span class="num">${s['주의'] || 0}</span> 주의(경계)</span>
        <span class="chip alert"><span class="num">${s['알림'] || 0}</span> 알림(이탈)</span>
        <span class="hint" style="align-self:center">파서: ${esc(res.parser)}</span>
      </div>
      <div style="max-height:480px;overflow-y:auto">
      <table class="meas"><thead><tr><th>측정 항목</th><th>실측값</th><th>규격(low~high)</th><th>판정</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="4">측정 데이터 없음 (반복성 로그는 아래 반복성 분석에 표시)</td></tr>'}</tbody></table>
      </div>
      ${rep}${cmp}`;
  }

  // ------------------------------------------------------------ 완료
  async function finish() {
    const unchecked = state.checkItems.filter(i => i.result === '미검사').length;
    if (unchecked && !confirm(`미검사 항목이 ${unchecked}건 있습니다.\n그대로 검증을 완료할까요?`)) return;
    const comment = $('comment') ? $('comment').value.trim() : '';
    const component = $('f_component') ? $('f_component').value : '';
    const symptom_type = $('f_symptom') ? $('f_symptom').value : '';
    // 이슈 양식(증상이 있을 때만 이슈 이력에 자동 등록됨)
    const issue = {
      symptom: $('f_i_symptom') ? $('f_i_symptom').value.trim() : '',
      cause: $('f_i_cause') ? $('f_i_cause').value.trim() : '',
      action: $('f_i_action') ? $('f_i_action').value.trim() : '',
      status: $('f_i_status') ? $('f_i_status').value : '',
      tags: Array.from(state.verifyTags || []),
    };
    const res = await api.post('/api/run/finish', { run_id: state.run.run_id, comment, component, symptom_type, issue });
    state.finish = res;
    state.finish.issue_saved = !!(res.issue_id);
    go('done');
  }

  function renderDone() {
    const r = state.run, s = state.setup, f = state.finish || {};
    const pass = f.result === 'PASS';
    const items = state.checkItems;
    const failItems = items.filter(i => i.result === 'FAIL');
    view().innerHTML = `
      <div class="result-head ${pass ? 'pass' : 'fail'}">
        <div class="big">${pass ? '✓' : '!'}</div>
        <h2>검증이 완료되었습니다</h2>
        <p>${pass ? '전 항목 이상 없음 — 출하 적합 (PASS)' : `부적합 항목 확인 필요 — ${failItems.length ? 'FAIL 체크 ' + failItems.length + '건' : '측정 이탈 발생'}`}</p>
      </div>

      <div class="card mt16">
        <div class="kv">
          <div class="cell"><div class="k">모델명 / REV</div><div class="v">${esc(s.model_name)} / ${esc(s.model_rev || '-')}</div></div>
          <div class="cell"><div class="k">검사기 종류 / 호기</div><div class="v">${esc(s.tester_type)} / ${s.unit_no ? s.unit_no + '호기' : '-'}</div></div>
          <div class="cell"><div class="k">검사자 / 모드</div><div class="v">${esc(s.inspector)} / ${esc(r.mode)}</div></div>
          <div class="cell"><div class="k">종합 판정</div><div class="v" style="color:${pass ? 'var(--accent)' : 'var(--red)'}">${esc(f.result || '-')}</div></div>
        </div>
        ${f.comment ? `<div class="rep-box mt16"><b>검사자 의견</b><div class="r mt8">${esc(f.comment)}</div></div>` : ''}
        ${f.issue_saved ? `<div class="rep-box mt12" style="border-color:var(--accent-500);background:var(--accent-50)">
          <b>✓ 작성한 이슈가 이슈 이력에 자동 등록되었습니다</b>
          <div class="r mt8">이슈 관리에서 확인·수정할 수 있고, 다음 검증의 "검사 전 확인"과 AI 도우미 답변에 바로 활용됩니다.</div></div>` : ''}
      </div>

      <div class="card">
        <div class="card-title">검사 항목 결과 요약</div>
        <div class="check-list mt12">
          ${items.map(i => `<div class="check-row"><div class="seq">${i.seq}</div>
            <div class="info"><b>${esc(i.item_name)}</b></div>
            <span class="jbadge ${i.result === 'PASS' ? 'j-정상' : i.result === 'FAIL' ? 'j-알림' : ''}" style="${i.result === '미검사' ? 'background:var(--slate-100);color:var(--slate-400)' : ''}">${esc(i.result)}</span>
          </div>`).join('')}
        </div>
      </div>

      <div class="card">
        <div class="row-between">
          <div class="hint">📄 검증 데이터는 로컬 DB에 저장되었습니다. 체크시트를 엑셀 파일로 내려받을 수 있습니다.</div>
          <div style="display:flex;gap:8px">
            <a class="btn btn-ghost" href="/api/run/report?run_id=${r.run_id}">📊 엑셀 다운로드</a>
            <button class="btn btn-ghost" onclick="App.go('history')">🗂 히스토리</button>
            <button class="btn btn-primary" onclick="App.go('setup')">＋ 새 검증</button>
          </div>
        </div>
      </div>`;
  }

  // ------------------------------------------------------------ 히스토리
  function historyFilters() {
    return {
      start: $('h_start') ? $('h_start').value : '',
      end: $('h_end') ? $('h_end').value : '',
      model: $('h_model') ? $('h_model').value.trim() : '',
      customer: $('h_customer') ? $('h_customer').value.trim() : '',
      tester_type: $('h_type') ? $('h_type').value : '',
      result: $('h_result') ? $('h_result').value : '',
    };
  }

  function renderHistory() {
    const b = state.boot;
    const typeOpts = b.tester_types.map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join('');
    view().innerHTML = `
      <div class="row-between mt8"><h2 style="font-size:22px">검증 히스토리</h2></div>
      <p class="hint mt8">날짜 · 모델명 · 고객사 · 검사기 종류 · 판정 결과로 지난 검증 데이터를 검색하고,
        행을 클릭하면 상세 내용을 볼 수 있습니다. 삭제·엑셀 내보내기도 가능합니다.</p>

      <div class="card mt16">
        <div class="grid2">
          <div class="field"><label>시작일</label><input class="input" type="date" id="h_start"></div>
          <div class="field"><label>종료일</label><input class="input" type="date" id="h_end"></div>
          <div class="field"><label>모델명</label><input class="input" id="h_model" placeholder="예) SM-S952"></div>
          <div class="field"><label>고객사</label><input class="input" id="h_customer" placeholder="예) 드림텍"></div>
          <div class="field"><label>검사기 종류</label>
            <select id="h_type"><option value="">전체</option>${typeOpts}</select></div>
          <div class="field"><label>판정 결과</label>
            <select id="h_result"><option value="">전체</option><option value="PASS">PASS</option><option value="FAIL">FAIL</option><option value="진행중">진행중</option></select></div>
        </div>
        <div class="row-between mt12">
          <button class="btn btn-ghost" onclick="App.resetHistoryFilter()">초기화</button>
          <button class="btn btn-primary" onclick="App.searchHistory()">🔍 검색</button>
        </div>
      </div>

      <div class="card mt16">
        <div class="row-between">
          <div class="hint" id="h_count">검색 중…</div>
          <div style="display:flex;gap:8px">
            <button class="btn btn-ghost" onclick="App.exportHistory()">📊 엑셀 내보내기</button>
            <button class="btn btn-ghost" style="color:var(--red)" onclick="App.deleteSelectedHistory()">🗑 선택 삭제</button>
          </div>
        </div>
        <div class="mt12" style="overflow-x:auto">
          <table class="meas" id="historyTable">
            <thead><tr>
              <th style="width:36px"><input type="checkbox" id="h_all" onchange="App.toggleAllHistory(this.checked)"></th>
              <th>검증일</th><th>모델명</th><th>REV</th><th>검사기종류</th><th>호기</th><th>고객사</th><th>검사자</th><th>모드</th><th>판정</th><th></th>
            </tr></thead>
            <tbody id="historyBody"><tr><td colspan="11">검색 중…</td></tr></tbody>
          </table>
        </div>
        <div id="historyPager"></div>
      </div>`;
    ['h_start', 'h_end', 'h_model', 'h_customer'].forEach(id => {
      const el = $(id);
      if (el) el.addEventListener('keydown', e => { if (e.key === 'Enter') searchHistory(); });
    });
    loadHistory();
  }

  function resetHistoryFilter() {
    ['h_start', 'h_end', 'h_model', 'h_customer', 'h_type', 'h_result'].forEach(id => { if ($(id)) $(id).value = ''; });
    searchHistory();
  }

  function searchHistory() { loadHistory(); }

  function filterQuery() {
    const f = historyFilters();
    return Object.entries(f).filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  }

  async function loadHistory() {
    const qs = filterQuery();
    const seq = (state.history.seq = (state.history.seq || 0) + 1);
    const rows = await api.get(`/api/history/search${qs ? '?' + qs : ''}`);
    if (seq !== state.history.seq) return;          // 늦게 온 이전 요청 폐기
    state.history.rows = rows;
    state.history.selected = new Set();
    state.history.page = 1;
    renderHistoryRows();
  }

  function historyPage(kind, val) {
    if (kind === 'size') { state.history.pageSize = Number(val); state.history.page = 1; }
    else { state.history.page = Number(val); }
    renderHistoryRows();
  }

  function renderHistoryRows() {
    const { rows, page, pageSize } = state.history;
    $('h_count').textContent = `검색 결과 ${rows.length.toLocaleString()}건`;
    $('h_all').checked = false;
    const start = (page - 1) * pageSize;
    const pageRows = rows.slice(start, start + pageSize);
    $('historyBody').innerHTML = pageRows.map(r => `
      <tr class="clickable" onclick="App.openRun(${r.run_id})">
        <td onclick="event.stopPropagation()"><input type="checkbox" data-run="${r.run_id}" onchange="App.toggleHistoryRow(${r.run_id}, this.checked)"></td>
        <td class="nowrap">${fmtDate(r.run_date)}</td>
        <td class="nowrap" onclick="event.stopPropagation()"><a class="mlink" title="이 모델 이슈 검색"
          onclick="App.openIssuesFor('${esc(r.model_name).replace(/'/g, "\\'")}')"><b>${esc(r.model_name)}</b></a></td>
        <td>${esc(r.model_rev || '-')}</td>
        <td class="nowrap">${esc(r.tester_type)}</td>
        <td>${r.unit_no ?? '-'}</td>
        <td class="nowrap">${esc(r.customer || '-')}</td>
        <td class="nowrap">${esc(r.inspector || '-')}</td>
        <td class="nowrap">${esc(r.verify_mode || '-')}</td>
        <td><span class="jbadge ${resultBadge(r.result)}">${esc(r.result)}</span></td>
        <td onclick="event.stopPropagation()" class="nowrap">
          ${r.result === '진행중' ? `<button class="btn btn-ghost btn-mini" onclick="App.resumeRun(${r.run_id})">▶ 이어서</button>` : ''}
          <a class="btn btn-ghost btn-mini" href="/api/run/report?run_id=${r.run_id}">엑셀</a>
        </td>
      </tr>`).join('') || '<tr><td colspan="11">검색 결과가 없습니다.</td></tr>';
    $('historyPager').innerHTML = rows.length ? pagerHtml(rows.length, page, pageSize, 'historyPage') : '';
  }

  function toggleHistoryRow(runId, checked) {
    if (checked) state.history.selected.add(runId); else state.history.selected.delete(runId);
  }
  function toggleAllHistory(checked) {
    state.history.selected = new Set(checked ? state.history.rows.map(r => r.run_id) : []);
    document.querySelectorAll('#historyBody input[type=checkbox]').forEach(cb => { cb.checked = checked; });
  }

  async function deleteSelectedHistory() {
    const ids = Array.from(state.history.selected);
    if (!ids.length) { alert('삭제할 항목을 먼저 선택하세요.'); return; }
    if (!confirm(`선택한 ${ids.length}건을 삭제할까요?\n삭제된 데이터(검사항목·측정값·사진·검사자 의견 포함)는 복구할 수 없습니다.`)) return;
    await api.post('/api/history/delete', { run_ids: ids });
    await loadHistory();
  }

  function exportHistory() {
    const qs = filterQuery();
    window.location.href = `/api/history/export${qs ? '?' + qs : ''}`;
  }

  // ------------------------------------------------------------ 히스토리 상세
  async function openRun(runId) {
    const r = await api.get(`/api/run/get?run_id=${runId}`);
    if (!r || r.error || !r.run_id) { alert('해당 검증 데이터를 찾을 수 없습니다.'); return; }
    setNav('history');

    const measRows = (r.measurements || []).map(m => `<tr>
      <td>${esc(m.item)}</td><td class="val">${esc(m.value)}</td>
      <td>${m.spec_low ?? '-'} ~ ${m.spec_high ?? '-'}</td>
      <td><span class="jbadge j-${m.judge}">${esc(m.judge)}</span></td></tr>`).join('');

    view().innerHTML = `
      <div class="row-between mt8">
        <div><h2 style="font-size:22px">${esc(r.model_name)} <span style="color:var(--slate-400);font-weight:700">· ${esc(r.tester_type)}</span></h2>
          <p class="hint">검증 상세 (No.${r.run_id})</p></div>
        <button class="btn btn-ghost" onclick="App.go('history')">← 목록</button>
      </div>

      <div class="card mt16">
        <div class="kv">
          <div class="cell"><div class="k">검증일</div><div class="v">${fmtDate(r.run_date)}</div></div>
          <div class="cell"><div class="k">종합 판정</div><div class="v" style="color:${r.result === 'PASS' ? 'var(--accent)' : r.result === 'FAIL' ? 'var(--red)' : 'var(--amber)'}">${esc(r.result)}</div></div>
          <div class="cell"><div class="k">모델명 / REV</div><div class="v">${esc(r.model_name)} / ${esc(r.model_rev || '-')}</div></div>
          <div class="cell"><div class="k">검사기 종류 / 호기</div><div class="v">${esc(r.tester_type)} / ${r.unit_no ? r.unit_no + '호기' : '-'}</div></div>
          <div class="cell"><div class="k">고객사</div><div class="v">${esc(r.customer || '-')}</div></div>
          <div class="cell"><div class="k">검사자 / 모드</div><div class="v">${esc(r.inspector || '-')} / ${esc(r.verify_mode || '-')}</div></div>
        </div>
        ${r.inspector_comment ? `<div class="rep-box mt16"><b>검사자 의견</b><div class="r mt8">${esc(r.inspector_comment)}</div></div>` : ''}
        <div class="row-between mt16">
          <div></div>
          <div style="display:flex;gap:8px">
            ${r.result === '진행중' ? `<button class="btn btn-accent" onclick="App.resumeRun(${r.run_id})">▶ 이어서 하기</button>` : ''}
            <a class="btn btn-ghost" href="/api/run/report?run_id=${r.run_id}">📊 엑셀 다운로드</a>
            <button class="btn btn-ghost" style="color:var(--red)" onclick="App.deleteRun(${r.run_id})">🗑 삭제</button>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-title">검사 항목 결과 (Check Sheet)</div>
        <div class="check-list mt12">
          ${(r.check_items || []).map(i => `<div class="check-row"><div class="seq">${i.seq}</div>
            <div class="info"><b>${esc(i.item_name)}</b> <span class="cat-tag">${esc(i.category)}</span>
              <small>${esc(i.test_desc || '')}</small></div>
            <span class="jbadge ${i.result === 'PASS' ? 'j-정상' : i.result === 'FAIL' ? 'j-알림' : ''}" style="${i.result === '미검사' ? 'background:var(--slate-100);color:var(--slate-400)' : ''}">${esc(i.result)}</span>
          </div>`).join('') || '<div class="check-row"><div class="info"><small>검사 항목이 없습니다.</small></div></div>'}
        </div>
      </div>

      <div class="card">
        <div class="card-title">측정 데이터 (로그 자동 판정)</div>
        <div class="mt12" style="overflow-x:auto">
          <table class="meas"><thead><tr><th>측정 항목</th><th>실측값</th><th>규격(low~high)</th><th>판정</th></tr></thead>
            <tbody>${measRows || '<tr><td colspan="4">측정 데이터 없음</td></tr>'}</tbody></table>
        </div>
      </div>

      <div class="card">
        <div class="card-title">검증 사진</div>
        <div class="photo-grid mt12">
          ${(r.photos || []).map((p, i) => `
            <div class="photo-item" data-vw="detail" data-url="${esc(p.url)}"
                 data-name="${esc(p.photo_type || '사진')}" data-meta="${esc(r.model_name)} · ${esc(fmtDate(r.run_date))}">
              <img src="${esc(p.url)}" alt="${esc(p.photo_type)}" onclick="App.openViewerFrom('detail',${i})">
              <div class="photo-meta"><span>${esc(p.photo_type || '-')}</span></div>
            </div>`).join('') || '<div class="hint">등록된 사진이 없습니다.</div>'}
        </div>
      </div>`;
    window.scrollTo(0, 0);
  }

  async function deleteRun(runId) {
    if (!confirm('이 검증 기록을 삭제할까요?\n삭제된 데이터(검사항목·측정값·사진·검사자 의견 포함)는 복구할 수 없습니다.')) return;
    await api.post('/api/history/delete', { run_ids: [runId] });
    go('history');
  }

  async function resumeRun(runId) {
    const r = await api.get(`/api/run/get?run_id=${runId}`);
    if (!r || r.error || !r.run_id) { alert('해당 검증 데이터를 찾을 수 없습니다.'); return; }
    if (r.result !== '진행중' && !confirm('이미 완료된 검증입니다. 다시 열어서 수정할까요?\n(완료 버튼을 다시 누르면 판정이 갱신됩니다)')) return;
    state.setup = {
      model_name: r.model_name, model_rev: r.model_rev, tester_type: r.tester_type,
      unit_no: r.unit_no, customer: r.customer, inspector: r.inspector,
      verify_mode: r.verify_mode, board_type: '',
    };
    state.run = r;
    state.checkItems = r.check_items;
    state.judge = null;
    go('verify');
  }

  // ------------------------------------------------------------ 이슈 관리
  function renderIssues() {
    const b = state.boot;
    const typeOpts = b.tester_types.map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join('');
    const symOpts = (b.symptom_types || []).map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join('');
    const tagOpts = (b.tags || []).map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join('');
    const modelOpts = [...new Set((b.testers || []).map(t => t.model_name).filter(Boolean))]
      .sort().map(m => `<option value="${esc(m)}"></option>`).join('');
    if (!state.issues.formTags) state.issues.formTags = new Set();
    view().innerHTML = `
      <div class="row-between mt8"><h2 style="font-size:22px">이슈 이력 관리</h2></div>
      <p class="hint mt8">출하이슈사항을 날짜·모델·호기별로 모아 봅니다. 행을 클릭하면 원문 그대로 펼쳐집니다.
        같은 모델로 새 검증을 시작하면 "검사 전 확인"으로 자동 안내됩니다.</p>

      <details class="card mt16" id="issueForm">
        <summary class="card-title" style="cursor:pointer">＋ 새 이슈 직접 등록 / 수정</summary>
        <p class="hint mt8">증상 → 원인 → 조치 → 상태 순으로 나눠 적으면 검색·통계·챗봇 답변 품질이 크게 좋아집니다.
          (실제 출하이슈 분석: 절반이 조치 미기재 → 조치 칸을 꼭 채워주세요)</p>
        <input type="hidden" id="i_id" value="">
        <div class="grid3 mt12">
          <div class="field"><label>모델명 <span class="req">*</span></label>
            <input class="input" id="i_model" list="modelList" placeholder="예) SM-S952"></div>
          <div class="field"><label>고객사</label>
            <input class="input" id="i_customer" list="custList" placeholder="예) 드림텍"></div>
          <div class="field"><label>검사기 종류</label>
            <select id="i_type"><option value="">공통</option>${typeOpts}</select></div>
          <div class="field"><label>호기</label>
            <input class="input" id="i_unit" placeholder="예) 1호기 / 2~5호기"></div>
          <div class="field"><label>검증일</label>
            <input class="input" type="date" id="i_date"></div>
          <div class="field"><label>시료 버전</label>
            <input class="input" id="i_rev" placeholder="예) R0.4"></div>
        </div>
        <datalist id="modelList">${modelOpts}</datalist>
        <datalist id="custList"><option>드림텍</option><option>두성테크</option><option>한국성전</option></datalist>

        <div class="field mt12"><label>자주 쓰는 문구 <span class="hint">— 클릭하면 마지막에 입력하던 칸에 삽입</span>
            <button type="button" class="btn btn-ghost btn-mini" onclick="App.addTemplate()">＋ 추가</button></label>
          <div id="tplRow" class="tag-picker"></div></div>
        <div class="field mt12"><label>① 증상 (무엇이 발생했나) <span class="req">*</span></label>
          <textarea id="i_symptom" class="ta-sm" placeholder="예) 반복성 검사 중 마이크 감도 전류값 가성불량 발생 (40회 중 3회 NG)"
            onfocus="App.setTplTarget('i_symptom')"
            oninput="App.autoTagInput('issue')" onblur="App.suggestTags('issue')"></textarea></div>
        <div id="similarBox"></div>
        <div class="grid2 mt12">
          <div class="field"><label>② 원인 (파악된 원인 · 선택)</label>
            <input class="input" id="i_cause" placeholder="예) 메인보드 전원부 불안정"></div>
          <div class="field"><label>④ 상태</label>
            <select id="i_status"><option value="">선택 안 함</option>
              <option>개선완료</option><option>임시조치·모니터링</option>
              <option>미해결·추후확인</option><option>정보공유</option></select></div>
        </div>
        <div class="field mt12"><label>③ 조치 (무엇을 했나 · 어떻게 해결했나)</label>
          <textarea id="i_action" class="ta-sm" placeholder="예) 메인보드 교체 후 재측정 → 40회 반복성 정상 확인"
            onfocus="App.setTplTarget('i_action')"
            oninput="App.autoTagInput('issue')" onblur="App.suggestTags('issue')"></textarea></div>
        <div class="field mt12"><label>제목 (한 줄 요약 · 비우면 증상 첫 줄 사용)</label>
          <input class="input" id="i_title" placeholder="예) 마이크 감도 전류 가성불량 → 메인보드 교체"></div>
        <div class="field mt12">
          <label>태그 <button type="button" class="btn btn-ghost btn-mini" onclick="App.suggestTags('issue')">⚡ 자동 추천</button>
            <span class="hint">— 증상/조치를 적으면 실시간 자동 선택돼요. 클릭으로 직접 추가/해제.</span>
            <span class="hint" id="tagHint" style="color:var(--brand-700);font-weight:700"></span></label>
          <div id="i_tags" class="tag-picker"></div></div>
        <div class="field mt12" id="issuePhotoSec">
          <label>사진 첨부 <span class="hint" id="photoCount"></span>
            <select id="ip_type" style="width:auto;display:inline-block;padding:4px 8px;font-size:12px;margin-left:8px">
              ${(state.boot.issue_photo_types || []).map(t => `<option>${esc(t)}</option>`).join('')}
            </select></label>
          <input type="file" id="issuePhotoInput" accept="image/*" multiple style="display:none"
                 onchange="App.onIssuePhotoFile(event)">
          <div class="drop-zone" id="issueZone">
            <div class="dz-icon">🖼</div>
            <div class="dz-main">사진을 <b>드래그</b>하거나 <b>클릭</b>해서 선택 · 캡처 후 <b>Ctrl+V</b></div>
            <div class="dz-sub">여러 장 한 번에 가능 · 큰 이미지는 자동으로 축소됩니다
              <button type="button" class="btn btn-ghost btn-mini" onclick="event.stopPropagation();App.pasteFromClipboard()">📋 클립보드에서 붙여넣기</button></div>
          </div>
          <div class="photo-grid mt12" id="issuePhotoGrid"></div></div>
        <div class="row-between mt12">
          <button class="btn btn-ghost" onclick="App.resetIssueForm()">새로 작성</button>
          <button class="btn btn-primary" id="issueSaveBtn" onclick="App.saveIssue()">저장</button>
        </div>
        <p class="hint mt8" id="issueErr" style="color:var(--red)"></p>
      </details>

      <details class="card mt16">
        <summary class="card-title" style="cursor:pointer">📋 엑셀 붙여넣기 일괄 등록</summary>
        <p class="hint mt8">기존 출하이슈사항 엑셀에서 <b>날짜+내용 행들을 복사</b>해 붙여넣으면 자동 파싱해 여러 건을 한 번에 등록합니다.
          모델명·고객사·검사기 종류는 위 양식의 값을 사용합니다.</p>
        <textarea id="pasteBox" class="mt12" placeholder="예)&#10;2024-04-05&#9;1호기 -. 방수 DIFF 높음 -> 재조립 개선&#10;2024-06-19&#9;2호기 -. 특이사항 없음"></textarea>
        <div class="row-between mt12"><span class="hint" id="pasteMsg"></span>
          <button class="btn btn-primary" onclick="App.pasteImport()">일괄 등록</button></div>
      </details>

      <div class="card mt16">
        <div class="row-between">
          <div class="card-title">등록된 이슈</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <input class="input" id="if_model" placeholder="모델명" style="width:120px">
            <input class="input" id="if_customer" placeholder="고객사" style="width:100px">
            <select id="if_type" style="width:110px"><option value="">전체 종류</option>${typeOpts}</select>
            <select id="if_sym" style="width:120px"><option value="">전체 증상</option>${symOpts}</select>
            <select id="if_tag" style="width:110px" onchange="App.loadIssues()"><option value="">전체 태그</option>${tagOpts}</select>
            <button class="btn btn-ghost" onclick="App.loadIssues()">🔍 검색</button>
            <button class="btn btn-ghost" onclick="App.resetIssueFilter()" title="필터 초기화">↺</button>
            <button class="btn btn-ghost" onclick="App.exportIssues()">📊 엑셀</button>
            <button class="btn btn-ghost" onclick="App.syncServer()" id="syncBtn">🔄 서버 동기화</button>
          </div>
        </div>
        <div id="activeFilters" class="tag-chips" style="margin-top:8px"></div>
        <p class="hint" id="syncMsg"></p>
        <div class="mt12" id="issueList"><p class="hint">불러오는 중…</p></div>
        <div id="issuePager"></div>
      </div>`;
    ['if_model', 'if_customer'].forEach(id => {
      const el = $(id);
      if (el) el.addEventListener('keydown', e => { if (e.key === 'Enter') loadIssues(); });
    });
    renderTagPicker();
    renderTemplates();
    loadIssuePhotos(null);
    if ($('i_date') && !$('i_date').value) $('i_date').value = today();   // 검증일 기본 = 오늘
    loadIssues();
    pollSync();                                    // 진행 중인 서버 동기화가 있으면 상태 이어서 표시
  }

  function renderTagPicker() {
    const box = $('i_tags');
    if (!box) return;
    const sel = state.issues.formTags || new Set();
    box.innerHTML = tagVocab().map(t =>
      `<button type="button" class="tag-pick ${sel.has(t) ? 'on' : ''}" onclick="App.toggleFormTag('${esc(t).replace(/'/g, "\\'")}')">${esc(t)}</button>`).join('');
  }
  function toggleFormTag(t) {
    const c = tagCtx('issue');
    if (c.set.has(t)) { c.set.delete(t); c.dismissed.add(t); }   // 수동 해제 → 자동이 다시 안 붙임
    else { c.set.add(t); c.dismissed.delete(t); }
    renderTagPicker();
  }
  function filterByTag(t) {
    if ($('if_tag')) { $('if_tag').value = t; loadIssues(); }
  }

  async function loadIssues() {
    const model = $('if_model') ? $('if_model').value.trim() : '';
    const cust = $('if_customer') ? $('if_customer').value.trim() : '';
    const type = $('if_type') ? $('if_type').value : '';
    const sym = $('if_sym') ? $('if_sym').value : '';
    const tag = $('if_tag') ? $('if_tag').value : '';
    const qs = [model && `model=${encodeURIComponent(model)}`,
                cust && `customer=${encodeURIComponent(cust)}`,
                type && `type=${encodeURIComponent(type)}`,
                sym && `symptom_type=${encodeURIComponent(sym)}`,
                tag && `tag=${encodeURIComponent(tag)}`].filter(Boolean).join('&');
    // 요청 순번 가드 — 화면 전환 직후처럼 요청이 겹칠 때,
    // 늦게 도착한 '이전 요청' 결과가 최신 결과를 덮어쓰지 않도록 한다.
    const seq = (state.issues.seq = (state.issues.seq || 0) + 1);
    const rows = await api.get(`/api/issues/manage${qs ? '?' + qs : ''}`);
    if (seq !== state.issues.seq) return;          // 최신 요청이 아니면 폐기
    state.issues.rows = rows;
    state.issues.page = 1;
    state.issues.expanded = new Set();
    renderIssueList();
    renderActiveFilters();
  }

  // 적용된 필터를 칩으로 보여주고 × 로 개별 해제
  function renderActiveFilters() {
    const box = $('activeFilters');
    if (!box) return;
    const defs = [['if_model', '모델'], ['if_customer', '고객사'], ['if_type', '검사기'],
                  ['if_sym', '증상'], ['if_tag', '태그']];
    const on = defs.filter(([id]) => $(id) && $(id).value.trim());
    box.innerHTML = on.length
      ? on.map(([id, label]) =>
          `<span class="tpl-chip"><button type="button" style="cursor:default">${label}: ${esc($(id).value)}</button>` +
          `<i onclick="App.clearIssueFilter('${id}')" title="이 필터 해제">×</i></span>`).join('') +
        `<span class="hint" style="align-self:center">— 총 ${state.issues.rows.length.toLocaleString()}건</span>`
      : '';
  }
  function clearIssueFilter(id) { if ($(id)) { $(id).value = ''; loadIssues(); } }
  function resetIssueFilter() {
    ['if_model', 'if_customer', 'if_type', 'if_sym', 'if_tag'].forEach(id => { if ($(id)) $(id).value = ''; });
    loadIssues();
  }

  function issuePage(kind, val) {
    if (kind === 'size') { state.issues.pageSize = Number(val); state.issues.page = 1; }
    else { state.issues.page = Number(val); }
    renderIssueList();
  }

  function toggleIssue(id) {
    const s = state.issues.expanded;
    if (s.has(id)) s.delete(id); else s.add(id);
    renderIssueList();
  }

  function tagList(tagsStr) {
    return (tagsStr || '').split(',').map(t => t.trim()).filter(Boolean);
  }
  function tagChips(tagsStr, clickable) {
    const ts = tagList(tagsStr);
    if (!ts.length) return '';
    return `<div class="tag-chips">` + ts.map(t =>
      clickable
        ? `<button class="tag-chip-sm" onclick="event.stopPropagation();App.filterByTag('${esc(t).replace(/'/g, "\\'")}')">#${esc(t)}</button>`
        : `<span class="tag-chip-sm">#${esc(t)}</span>`).join('') + `</div>`;
  }

  function renderIssueList() {
    const { rows, page, pageSize, expanded } = state.issues;
    const start = (page - 1) * pageSize;
    const pageRows = rows.slice(start, start + pageSize);
    $('issueList').innerHTML = pageRows.map(i => {
      const raw = i.raw_text || i.symptom || '';
      const preview = raw.replace(/\s+/g, ' ').trim();
      const open = expanded.has(i.id);
      const date = (i.issue_date || '').slice(0, 10) || '—';
      const unit = i.unit_label || (i.unit_no != null ? i.unit_no + '호기' : '—');
      const title = i.title || i.item || '(제목 없음)';
      const stBadge = i.status
        ? `<span class="st-tag ${i.status === '개선완료' ? 'ok' : i.status.startsWith('미해결') ? 'bad' : 'mid'}">${esc(i.status)}</span>` : '';
      const recurBadge = (i.recur >= 2)
        ? `<span class="st-tag bad" title="같은 모델·같은 증상분류 반복">⚠ 재발 ${i.recur}회</span>` : '';
      const badge = (i.board_type ? `<span class="board-tag">${esc(i.board_type)}</span>` : '')
        + (i.symptom_type ? `<span class="sym-tag">${esc(i.symptom_type)}</span>` : '') + stBadge + recurBadge;
      return `
      <div class="ilist-item ${open ? 'open' : ''}">
        <div class="ilist-head" onclick="App.toggleIssue(${i.id})">
          <span class="ilist-date">${esc(date)}</span>
          <span class="ilist-model"><a class="mlink" title="이 모델로 검색"
            onclick="event.stopPropagation();App.openIssuesFor('${esc(i.model_name).replace(/'/g, "\\'")}')">${esc(i.model_name)}</a>
            <button class="mprof" title="모델 프로필 보기"
              onclick="event.stopPropagation();App.openModel('${esc(i.model_name).replace(/'/g, "\\'")}')">📦</button></span>
          <span class="ilist-unit">${esc(unit)}</span>
          <span class="ilist-type">${esc(i.tester_type || '공통')}</span>
          <div class="ilist-main">
            <div class="ilist-title">${esc(title)} ${badge}</div>
            ${open ? '' : `<div class="ilist-preview">${esc(preview)}</div>`}
            ${open ? '' : tagChips(i.tags, false)}
          </div>
          <span class="ilist-caret">${open ? '▲' : '▼'}</span>
        </div>
        ${open ? `<div class="ilist-body">
          <pre class="raw">${esc(raw)}</pre>
          ${tagChips(i.tags, true)}
          <div class="photo-grid mt12" id="iphotos_${i.id}"></div>
          <div class="ilist-meta">
            ${i.customer ? `고객사 ${esc(i.customer)}` : ''}${i.board_type ? ` · 부위 ${esc(i.board_type)}` : ''}
          </div>
          <div class="ilist-actions">
            <button class="btn btn-ghost btn-mini" onclick="App.editIssue(${i.id})">✏ 수정</button>
            <button class="btn btn-ghost btn-mini" style="color:var(--red)" onclick="App.deleteIssue(${i.id})">삭제</button>
          </div>
        </div>` : ''}
      </div>`;
    }).join('') || '<p class="hint">등록된 이슈가 없습니다. 위에서 새 이슈를 등록하세요.</p>';
    $('issuePager').innerHTML = rows.length ? pagerHtml(rows.length, page, pageSize, 'issuePage') : '';
    // 펼쳐진 이슈의 첨부 사진 lazy 로드
    expanded.forEach(async id => {
      const box = $(`iphotos_${id}`);
      if (!box) return;
      try {
        const ps = await api.get(`/api/issue/photos?issue_id=${id}`);
        box.innerHTML = (ps || []).map((p, i) =>
          `<div class="photo-item" data-vw="iss${id}" data-url="/${esc(p.file_path)}"
                data-name="이슈 #${id} 사진" data-meta="이슈 첨부">
             <img src="/${esc(p.file_path)}" onclick="App.openViewerFrom('iss${id}',${i})"></div>`).join('');
      } catch (e) { /* 무시 */ }
    });
  }

  function resetIssueForm() {
    ['i_id', 'i_model', 'i_customer', 'i_unit', 'i_rev', 'i_title',
     'i_symptom', 'i_cause', 'i_action'].forEach(id => { if ($(id)) $(id).value = ''; });
    if ($('i_type')) $('i_type').value = '';
    if ($('i_status')) $('i_status').value = '';
    if ($('i_date')) $('i_date').value = today();          // 기본값 = 오늘
    state.issues.formTags = new Set();
    state.issues.dismissedTags = new Set();
    if ($('tagHint')) $('tagHint').textContent = '';
    if ($('similarBox')) $('similarBox').innerHTML = '';
    state.issues.baseUpdatedAt = '';
    renderTagPicker();
    loadIssuePhotos(null);
    $('issueSaveBtn').textContent = '저장';
    $('issueErr').textContent = '';
  }

  function editIssue(id) {
    const i = state.issues.rows.find(x => x.id === id);
    if (!i) return;
    $('i_id').value = i.id;
    $('i_model').value = i.model_name || '';
    $('i_customer').value = i.customer || '';
    $('i_type').value = i.tester_type || '';
    $('i_unit').value = i.unit_label || (i.unit_no != null ? i.unit_no + '호기' : '');
    $('i_date').value = (i.issue_date || '').slice(0, 10);
    $('i_rev').value = i.sample_rev || '';
    $('i_title').value = i.title || '';
    // 구조화 칸이 있으면 그대로, 없는 옛(자유형) 이슈는 원문을 증상 칸에
    $('i_symptom').value = i.cause || i.action || i.status ? (i.symptom || '') : (i.raw_text || i.symptom || '');
    $('i_cause').value = i.cause || '';
    $('i_action').value = i.action || '';
    $('i_status').value = i.status || '';
    state.issues.formTags = new Set(tagList(i.tags));
    state.issues.dismissedTags = new Set();
    state.issues.baseUpdatedAt = i.updated_at || '';   // 충돌 감지 기준 시각
    renderTagPicker();
    loadIssuePhotos(i.id);
    $('issueSaveBtn').textContent = '수정 저장';
    if (i.updated_by) {
      $('issueErr').innerHTML = `<span class="hint">최근 수정: ${esc(i.updated_by)} · ${esc(i.updated_at || '')}</span>`;
    }
    if ($('issueForm')) $('issueForm').open = true;
    window.scrollTo(0, 0);
  }

  async function saveIssue() {
    const payload = {
      id: $('i_id').value ? Number($('i_id').value) : null,
      model_name: $('i_model').value.trim(),
      customer: $('i_customer').value.trim(),
      tester_type: $('i_type').value,
      unit_label: $('i_unit').value.trim(),
      issue_date: $('i_date').value,
      sample_rev: $('i_rev').value.trim(),
      title: $('i_title').value.trim(),
      symptom: $('i_symptom').value.trim(),
      cause: $('i_cause').value.trim(),
      action: $('i_action').value.trim(),
      status: $('i_status').value,
      tags: Array.from(state.issues.formTags || []),
      editor: localStorage.getItem('knk_inspector') || '',
      base_updated_at: state.issues.baseUpdatedAt || '',   // 동시 편집 충돌 감지용
    };
    if (!payload.model_name || !payload.symptom) {
      $('issueErr').textContent = '모델명과 증상은 필수입니다.'; return;
    }
    const res = await api.post('/api/issue/save', payload);
    if (res.conflict) {
      $('issueErr').innerHTML = `⚠ ${esc(res.message)}<br>` +
        `저장하면 그분의 수정 내용이 사라집니다. ` +
        `<button class="btn btn-ghost btn-mini" onclick="App.reloadIssueForSave()">최신 내용 불러오기</button> ` +
        `<button class="btn btn-ghost btn-mini" style="color:var(--red)" onclick="App.forceSaveIssue()">그래도 덮어쓰기</button>`;
      return;
    }
    if (res.error) { $('issueErr').textContent = '오류: ' + res.error; return; }
    state.issues.baseUpdatedAt = res.updated_at || '';
    // 저장 전 붙여넣기/드롭해둔 사진을 이제 업로드
    const uploaded = await flushPendingPhotos(res.id);
    if (uploaded) toast(`이슈 저장 · 사진 ${uploaded}장 함께 등록됨`);
    resetIssueForm();
    if ($('issueForm')) $('issueForm').open = false;
    loadIssues();
  }

  // ------------------------------------------------------------ 태그 자동+수동
  // 서버 미재시작·오프라인이어도 항상 동작하도록 규칙을 클라이언트에 내장(서버 규칙이 오면 그걸 우선).
  const DEFAULT_TAG_RULES = [
    { name: '가성불량', pattern: '가성|오검출|가검출' },
    { name: '핀블록', pattern: '핀\\s*블록|핀블럭' },
    { name: '메인보드/PCB', pattern: '보드|PCB|pcb|기판|PBA|pba|회로' },
    { name: '컨텍/접촉', pattern: '컨텍|컨택|접촉' },
    { name: 'FW', pattern: '\\bFW\\b|fw|펌웨어|펌웨' },
    { name: '마킹', pattern: '마킹|마커' },
    { name: '파형/전류', pattern: '파형|전류|전압|이득|검파|서지|surge|VSWR|vswr|임피던스' },
    { name: '간섭', pattern: '간섭|낌|들뜸|딸려' },
    { name: '테이블', pattern: '테이블' },
    { name: '푸셔', pattern: '푸셔' },
    { name: '마이크', pattern: '음샘|마이크|\\bmic\\b' },
    { name: '안착', pattern: '안착' },
    { name: '반복성', pattern: '반복성' },
    { name: '크랙/파손', pattern: '크랙|크렉|파손|깨|찍힘|눌림|찢|스크래치' },
    { name: '센서', pattern: '센서|sensor|근조도|조도|proximity|hall|HALL' },
    { name: '검출력', pattern: '검출력' },
    { name: 'OS/통신', pattern: '\\bOS\\b|O/S|통신|저장|부팅|datalogger|데이터로거' },
    { name: '젠더', pattern: '젠더' },
    { name: '커넥터', pattern: '커넥터|connector|클립|clip|역삽' },
    { name: '케이블', pattern: '케이블|cable|이어\\s*잭|ear\\s*jack' },
  ];
  function tagVocab() {
    const t = state.boot && state.boot.tags;
    return (t && t.length) ? t : DEFAULT_TAG_RULES.map(r => r.name);
  }
  function clientAutoTags(text) {
    const rules = (state.boot && state.boot.tag_rules && state.boot.tag_rules.length)
      ? state.boot.tag_rules : DEFAULT_TAG_RULES;
    const out = [];
    for (const r of rules) {
      try { if (new RegExp(r.pattern, 'i').test(text)) out.push(r.name); }
      catch (e) { if (text.toLowerCase().includes(r.name.toLowerCase())) out.push(r.name); }
    }
    return out;
  }
  function tagCtx(which) {
    if (which === 'verify') {
      if (!state.verifyTags) state.verifyTags = new Set();
      if (!state.verifyDismissed) state.verifyDismissed = new Set();
      return { set: state.verifyTags, dismissed: state.verifyDismissed,
               render: renderVerifyTagPicker, hint: 'f_tagHint',
               fields: ['f_i_symptom', 'f_i_cause', 'f_i_action'] };
    }
    if (!state.issues.formTags) state.issues.formTags = new Set();
    if (!state.issues.dismissedTags) state.issues.dismissedTags = new Set();
    return { set: state.issues.formTags, dismissed: state.issues.dismissedTags,
             render: renderTagPicker, hint: 'tagHint',
             fields: ['i_symptom', 'i_cause', 'i_action'] };
  }

  // 자동 추천: 즉시 클라이언트 규칙으로 붙이고, 서버 규칙(가능하면)도 병합.
  // 사용자가 손으로 해제(dismissed)한 태그는 다시 붙이지 않는다 → 자동·수동 공존.
  async function suggestTags(which) {
    const c = tagCtx(which);
    const text = c.fields.map(id => { const e = $(id); return e ? e.value : ''; }).join(' ');
    if (!text.trim()) return;
    let tags = clientAutoTags(text);
    try {
      // 백그라운드 추천은 조용히: api.post(실패 시 알림창)를 쓰지 않고 무음 fetch
      const resp = await fetch('/api/tags/suggest', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (resp.ok) {
        const r = await resp.json();
        if (r && r.tags) tags = [...new Set([...tags, ...r.tags])];
      }
    } catch (e) { /* 서버 구버전/오프라인 → 클라이언트 규칙만으로 진행 */ }
    let added = 0;
    tags.forEach(t => { if (!c.dismissed.has(t) && !c.set.has(t)) { c.set.add(t); added++; } });
    c.render();
    const h = $(c.hint);
    if (h) h.textContent = added ? `⚡ 태그 ${added}개 자동 추천됨 (클릭으로 해제 가능)` : '';
  }

  // 타이핑 중 실시간 추천(0.6초 디바운스) + 유사이슈 안내
  const _tagTimers = {};
  function autoTagInput(which) {
    clearTimeout(_tagTimers[which]);
    _tagTimers[which] = setTimeout(() => {
      suggestTags(which);
      if (which === 'issue') loadSimilar();
    }, 600);
  }

  // ------------------------------------------------------------ 유사 이슈 실시간 안내
  async function loadSimilar() {
    const box = $('similarBox');
    if (!box) return;
    const text = [$('i_model'), $('i_symptom')].map(e => e ? e.value : '').join(' ').trim();
    if (text.length < 4) { box.innerHTML = ''; return; }
    try {
      const resp = await fetch('/api/issues/similar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (!resp.ok) return;
      const r = await resp.json();
      const hits = (r.hits || []).filter(h => h.symptom || h.action);
      box.innerHTML = hits.length ? `
        <div class="sim-box">
          <b>💡 비슷한 과거 이슈 ${hits.length}건</b> <span class="hint">— 중복 등록인지, 당시 어떻게 조치했는지 확인하세요</span>
          ${hits.map(h => `<div class="sim-row" onclick="App.openIssuesFor('${esc(h.model || '').replace(/'/g, "\\'")}')" title="클릭 → 이 모델 이슈 검색">
            <span class="sim-meta">${esc(h.date || '')} · <b>${esc(h.model || '')}</b>${h.unit ? ' · ' + esc(h.unit) : ''}</span>
            <div class="sim-sym">${esc(h.symptom || '')}</div>
            ${h.action ? `<div class="sim-act">→ ${esc(h.action)}</div>` : ''}
          </div>`).join('')}
        </div>` : '';
    } catch (e) { /* 무시 */ }
  }

  // ------------------------------------------------------------ 문구 템플릿
  let _tplTarget = 'i_symptom';
  function setTplTarget(id) { _tplTarget = id; }
  async function renderTemplates() {
    const row = $('tplRow');
    if (!row) return;
    try {
      const ts = await api.get('/api/templates');
      state.templates = ts || [];
      row.innerHTML = state.templates.map(t =>
        `<span class="tpl-chip"><button type="button" onclick="App.insertTpl(${t.id})">${esc(t.text)}</button>` +
        `<i onclick="App.delTemplate(${t.id})" title="삭제">×</i></span>`).join('') ||
        '<span class="hint">저장된 문구가 없습니다. ＋추가로 만들어 보세요.</span>';
    } catch (e) { /* 무시 */ }
  }
  function insertTpl(id) {
    const t = (state.templates || []).find(x => x.id === id);
    const el = $(_tplTarget) || $('i_symptom');
    if (!t || !el) return;
    el.value = (el.value ? el.value.replace(/\s+$/, '') + '\n' : '') + t.text;
    el.focus();
    autoTagInput('issue');
  }
  async function addTemplate() {
    const text = prompt('자주 쓰는 문구를 입력하세요:');
    if (!text || !text.trim()) return;
    await api.post('/api/template/save', { text: text.trim() });
    renderTemplates();
  }
  async function delTemplate(id) {
    if (!confirm('이 문구를 삭제할까요?')) return;
    await api.post('/api/template/delete', { id });
    renderTemplates();
  }

  // ------------------------------------------------------------ 이슈 사진
  // 이슈 사진 영역 갱신(신규/수정 공용) — 대기열 + 저장된 사진을 함께 표시
  async function loadIssuePhotos(issueId) {
    bindPhotoZone('issueZone', 'issuePhotoInput');
    await renderIssuePhotoZone();
  }
  function onIssuePhotoFile(ev) {
    const files = [...(ev.target.files || [])];
    ev.target.value = '';
    if (files.length) receivePhotos(files, '파일선택');
  }
  async function deleteIssuePhoto(pid) {
    if (!confirm('이 사진을 삭제할까요?')) return;
    await api.post('/api/issue/photo/delete', { id: pid });
    renderIssuePhotoZone();
    toast('사진을 삭제했습니다.');
  }

  // ------------------------------------------------------------ 엑셀 붙여넣기 / 내보내기 / 서버 동기화
  async function pasteImport() {
    const msg = $('pasteMsg');
    const model = $('i_model') ? $('i_model').value.trim() : '';
    if (!model) { msg.textContent = '⚠ 위 양식의 모델명을 먼저 입력하세요.'; return; }
    const text = $('pasteBox') ? $('pasteBox').value : '';
    if (!text.trim()) { msg.textContent = '⚠ 붙여넣을 내용이 없습니다.'; return; }
    const r = await api.post('/api/issue/paste', {
      model_name: model,
      customer: $('i_customer') ? $('i_customer').value.trim() : '',
      tester_type: $('i_type') ? $('i_type').value : '',
      text,
    });
    if (r.error) { msg.textContent = '⚠ ' + r.error; return; }
    msg.textContent = `✓ ${r.count}건 등록 완료`;
    $('pasteBox').value = '';
    loadIssues();
  }
  function exportIssues() {
    const qs = ['model=' + encodeURIComponent($('if_model') ? $('if_model').value.trim() : ''),
                'customer=' + encodeURIComponent($('if_customer') ? $('if_customer').value.trim() : ''),
                'type=' + encodeURIComponent($('if_type') ? $('if_type').value : ''),
                'symptom_type=' + encodeURIComponent($('if_sym') ? $('if_sym').value : ''),
                'tag=' + encodeURIComponent($('if_tag') ? $('if_tag').value : '')].join('&');
    window.location.href = `/api/issues/export?${qs}`;
  }
  let _syncTimer = null;
  async function syncServer() {
    if (!confirm('Z: 서버의 출하이슈사항을 다시 읽어 최신으로 반영합니다.\n' +
      '몇 분 정도 걸릴 수 있고, 서버(Z:)에 연결돼 있어야 합니다.\n' +
      '(직접 등록한 이슈는 그대로 유지됩니다) 진행할까요?')) return;
    const r = await api.post('/api/sync/start', {});
    if (r && r.started === false) { $('syncMsg').textContent = r.reason; return; }
    $('syncBtn').disabled = true;
    pollSync();
  }
  async function pollSync() {
    clearTimeout(_syncTimer);
    try {
      const s = await api.get('/api/sync/status');
      $('syncMsg').textContent = s.message || '';
      if (s.running) { _syncTimer = setTimeout(pollSync, 2500); return; }
      $('syncBtn').disabled = false;
      if (s.error) { $('syncMsg').textContent = '⚠ ' + s.error; }
      else if (s.result) { loadIssues(); }
    } catch (e) { $('syncBtn').disabled = false; }
  }

  // ------------------------------------------------------------ 모델 프로필
  async function openModel(name) {
    if (!name) return;
    const p = await api.get(`/api/model?name=${encodeURIComponent(name)}`);
    setNav('issues');
    document.body.classList.add('wide');
    const tagRow = (p.top_tags || []).map(([t, c]) => `<span class="tag-chip-sm">#${esc(t)} ${c}</span>`).join('');
    const symRow = (p.by_symptom || []).map(([s, c]) => `<span class="chip" style="background:var(--slate-100);color:var(--slate-600)">${esc(s)} <span class="num">${c}</span></span>`).join('');
    const issueRows = (p.issues || []).slice(0, 30).map(i => `
      <div class="sim-row">
        <span class="sim-meta">${esc((i.issue_date || '').slice(0, 10))}${i.unit_label ? ' · ' + esc(i.unit_label) : ''}
          ${i.status ? `· <span class="st-tag ${i.status === '개선완료' ? 'ok' : 'mid'}">${esc(i.status)}</span>` : ''}</span>
        <div class="sim-sym">${esc((i.title || i.symptom || '').slice(0, 90))}</div>
        ${i.action ? `<div class="sim-act">→ ${esc(i.action.slice(0, 100))}</div>` : ''}
      </div>`).join('');
    view().innerHTML = `
      <div class="row-between mt8">
        <div><h2 style="font-size:22px">📦 ${esc(p.name)} <span class="hint" style="font-weight:600">모델 프로필</span></h2></div>
        <button class="btn btn-ghost" onclick="App.go('issues')">← 이슈 관리</button>
      </div>
      <div class="stat-row" style="margin-top:16px">
        <div class="stat"><b>${p.issue_count}</b><span>이슈</span></div>
        <div class="stat"><b style="color:var(--red)">${p.open_count}</b><span>미해결·모니터링</span></div>
        <div class="stat"><b>${p.unit_count}</b><span>호기</span></div>
        <div class="stat"><b>${p.run_count}</b><span>검증 이력</span></div>
      </div>
      <div class="card mt16">
        <div class="card-title">요약</div>
        <p class="hint mt8">이슈 기간: ${esc(p.first_date || '-')} ~ ${esc(p.last_date || '-')}</p>
        ${symRow ? `<div class="summary-row mt12">${symRow}</div>` : ''}
        ${tagRow ? `<div class="tag-chips mt8">${tagRow}</div>` : ''}
      </div>
      <div class="card mt16">
        <div class="row-between"><div class="card-title">이슈 타임라인 (최근 30건)</div>
          <button class="btn btn-ghost btn-mini" onclick="App.openIssuesFor('${esc(p.name).replace(/'/g, "\\'")}')">🔍 이슈 관리에서 검색</button></div>
        <div class="mt12">${issueRows || '<p class="hint">이슈가 없습니다.</p>'}</div>
      </div>`;
    window.scrollTo(0, 0);
  }

  // 충돌 시: 상대가 저장한 최신 내용을 불러와 다시 편집
  async function reloadIssueForSave() {
    const id = Number($('i_id').value);
    if (!id) return;
    await loadIssues();
    const fresh = state.issues.rows.find(x => x.id === id);
    if (!fresh) { alert('이 이슈를 찾을 수 없습니다(삭제되었을 수 있음).'); return; }
    editIssue(id);
    $('issueErr').innerHTML = '<span style="color:var(--accent)">✓ 최신 내용을 불러왔습니다. 다시 수정 후 저장하세요.</span>';
  }
  // 충돌 무시하고 덮어쓰기
  async function forceSaveIssue() {
    if (!confirm('다른 사람의 수정 내용을 덮어씁니다. 계속할까요?')) return;
    state.issues.baseUpdatedAt = '';    // 검사 우회
    await saveIssue();
  }

  async function deleteIssue(id) {
    if (!confirm('이 이슈 이력을 삭제할까요?')) return;
    await api.post('/api/issue/delete', { id });
    loadIssues();
  }

  // ------------------------------------------------------------ 분석(대시보드)
  const CUST_COLORS = { '드림텍': '#22d3ee', '두성테크': '#34d399', '한국성전': '#fbbf24' };

  async function renderAnalytics() {
    view().innerHTML = `
      <div class="row-between mt8"><h2 style="font-size:22px">📊 분석 대시보드</h2></div>
      <p class="hint mt8">축적된 출하이슈 데이터를 자동 집계합니다. 불량 유형·추이·요주의 모델을 한눈에 보고, 주간보고 초안도 만듭니다.</p>
      <div class="an-grid mt16">
        <div class="card"><div class="card-title">⚠ 요주의 모델 <span class="hint" style="font-weight:600">· 이슈 다발 Top</span></div>
          <div id="anWatch" class="mt12"><p class="hint">불러오는 중…</p></div></div>
        <div class="card"><div class="card-title">🧩 불량 유형 파레토</div>
          <div id="anPareto" class="mt12 chart-wrap"><p class="hint">불러오는 중…</p></div></div>
      </div>
      <div class="card mt16"><div class="card-title">📈 월별 이슈 추이 (고객사별)</div>
        <div id="anTrend" class="mt12 chart-wrap"><p class="hint">불러오는 중…</p></div>
        <div id="anTrendLegend" class="chart-legend"></div></div>

      <div class="an-grid mt16">
        <div class="card"><div class="card-title">🏷 태그 통계</div>
          <div class="card-sub">이슈에 붙은 태그 빈도와 자주 함께 나타나는 조합</div>
          <div id="anTags" class="mt12"></div></div>
        <div class="card"><div class="card-title">🧪 데이터 품질</div>
          <div class="card-sub">기록 문화 개선 지표 — 조치를 적을수록 챗봇 답변이 좋아집니다</div>
          <div id="anQuality" class="mt12"></div></div>
      </div>

      <details class="card mt16" id="dupCard">
        <summary class="card-title" style="cursor:pointer">🧹 모델명 정합성 정리</summary>
        <p class="hint mt8">표기가 다르거나 비슷한 모델명을 찾아 하나로 합칩니다.
          합치면 이슈·검사기 기록이 모두 대표 이름으로 바뀌어 검색·통계·챗봇 정확도가 올라갑니다.</p>
        <div id="anDup" class="mt12"><p class="hint">펼치면 검사합니다…</p></div>
      </details>

      <details class="card mt16">
        <summary class="card-title" style="cursor:pointer">🧾 변경 이력 (감사 로그)</summary>
        <div id="anAudit" class="mt12"><p class="hint">펼치면 불러옵니다…</p></div>
      </details>

      <div class="card mt16">
        <div class="card-title">📝 주간보고 초안 자동 생성</div>
        <div class="row-between mt12">
          <div style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap">
            <div class="field"><label>시작일</label><input class="input" type="date" id="dr_start"></div>
            <div class="field"><label>종료일</label><input class="input" type="date" id="dr_end"></div>
            <button class="btn btn-primary" onclick="App.genDraft()">초안 생성</button>
          </div>
          <button class="btn btn-ghost" onclick="App.copyDraft()">📋 복사</button>
        </div>
        <textarea id="draftBox" class="mt12" style="min-height:220px;font-size:13px;line-height:1.6"
          placeholder="기간을 선택하고 '초안 생성'을 누르면 이 곳에 보고 초안이 만들어집니다."></textarea>
      </div>`;
    // 기본 기간: 최근 7일
    $('dr_start').value = weekAgo(); $('dr_end').value = today();
    const a = await api.get('/api/analytics');
    renderWatch(a.watch);
    $('anPareto').innerHTML = svgPareto(a.pareto);
    $('anTrend').innerHTML = svgTrend(a.trend);
    renderTrendLegend();
    // 태그 통계
    if ($('anTags')) {
      const mx = Math.max(1, ...(a.tag_stats || []).map(x => x[1]));
      $('anTags').innerHTML =
        (a.tag_stats || []).slice(0, 12).map(([t, c]) => `
          <div class="tstat-row"><span class="tstat-name">#${esc(t)}</span>
            <div class="tstat-bar"><i style="width:${c * 100 / mx}%"></i></div>
            <span class="tstat-num">${c}</span></div>`).join('') +
        ((a.tag_pairs || []).length ? `<div class="hint mt12"><b>자주 함께 나타나는 조합:</b><br>` +
          a.tag_pairs.slice(0, 5).map(p => `${esc(p.pair)} (${p.c})`).join(' · ') + '</div>' : '');
    }
    // 데이터 품질
    if ($('anQuality') && a.quality) {
      const q = a.quality;
      $('anQuality').innerHTML = `
        <div class="watch-row"><div class="watch-main"><b>조치 미기재율</b>
          <span class="hint">결함 이슈 ${q.defect_total.toLocaleString()}건 중 ${q.no_action.toLocaleString()}건 조치 미기재</span></div>
          <span class="watch-count" style="color:${q.no_action_pct > 40 ? 'var(--red)' : 'var(--amber)'}">${q.no_action_pct}%</span></div>
        <div class="watch-row"><div class="watch-main"><b>태그 없는 이슈</b>
          <span class="hint">검색·챗봇에서 누락될 수 있음</span></div>
          <span class="watch-count">${q.untagged.toLocaleString()}건</span></div>
        <div class="watch-row"><div class="watch-main"><b>미해결·모니터링 중</b>
          <span class="hint">홈 화면에서 계속 추적됩니다</span></div>
          <span class="watch-count" style="color:var(--red)">${q.open_count}건</span></div>`;
    }
    // 모델명 정합성 (펼칠 때 검사)
    const dupDet = $('dupCard');
    if (dupDet) dupDet.addEventListener('toggle', () => { if (dupDet.open) loadDuplicates(); });
    // 감사 로그 (펼칠 때 로드)
    const audDet = [...view().querySelectorAll('details')].pop();
    if (audDet) audDet.addEventListener('toggle', async () => {
      if (!audDet.open) return;
      const rows = await api.get('/api/audit?limit=100');
      $('anAudit').innerHTML = (rows || []).map(r => `
        <div class="sim-row"><span class="sim-meta">${esc((r.ts || '').slice(0, 16))} · <b>${esc(r.action)}</b> · ${esc(r.target || '')}</span>
          <div class="sim-sym">${esc((r.detail || '').slice(0, 100))}</div></div>`).join('') ||
        '<p class="hint">기록이 없습니다.</p>';
    });
  }

  function renderWatch(rows) {
    $('anWatch').innerHTML = (rows || []).map((r, i) => `
      <div class="watch-row" onclick="App.openIssuesFor('${esc(r.model_name).replace(/'/g, "\\'")}')" title="클릭 → 이슈 관리에서 이 모델 검색">
        <span class="watch-rank">${i + 1}</span>
        <div class="watch-main"><b>${esc(r.model_name)}</b>
          <span class="hint">${esc(r.customer || '-')}${r.last_date ? ' · 최근 ' + esc((r.last_date || '').slice(0, 10)) : ''}</span></div>
        <span class="watch-count">${r.c}건</span>
        <button class="mprof" title="모델 프로필 보기"
          onclick="event.stopPropagation();App.openModel('${esc(r.model_name).replace(/'/g, "\\'")}')">📦</button>
      </div>`).join('') || '<p class="hint">데이터가 없습니다.</p>';
  }

  function svgPareto(data) {
    if (!data || !data.length) return '<p class="hint">데이터가 없습니다.</p>';
    const W = 760, H = 320, pl = 44, pr = 46, pt = 18, pb = 74;
    const iw = W - pl - pr, ih = H - pt - pb;
    const maxC = Math.max(...data.map(d => d.count));
    const bw = iw / data.length;
    let bars = '', line = '', dots = '', labels = '', pts = [];
    data.forEach((d, i) => {
      const x = pl + i * bw, bh = maxC ? (d.count / maxC) * ih : 0;
      const y = pt + ih - bh;
      bars += `<rect x="${x + bw * 0.15}" y="${y}" width="${bw * 0.7}" height="${bh}" rx="4" fill="#22d3ee" opacity="0.8"></rect>`;
      bars += `<text x="${x + bw / 2}" y="${y - 5}" text-anchor="middle" font-size="11" fill="#9fb0c3" font-weight="700">${d.count}</text>`;
      const cx = x + bw / 2, cy = pt + ih - (d.cum_pct / 100) * ih;
      pts.push(`${cx},${cy}`);
      dots += `<circle cx="${cx}" cy="${cy}" r="3.5" fill="#fbbf24"></circle>`;
      const nm = d.name.length > 6 ? d.name.slice(0, 6) + '…' : d.name;
      labels += `<text x="${cx}" y="${H - pb + 16}" text-anchor="end" font-size="11" fill="#9fb0c3" transform="rotate(-35 ${cx} ${H - pb + 16})">${esc(nm)}</text>`;
    });
    line = `<polyline points="${pts.join(' ')}" fill="none" stroke="#fbbf24" stroke-width="2"></polyline>`;
    // 좌축(건수) / 우축(누적%) 눈금
    let grid = '';
    for (let g = 0; g <= 4; g++) {
      const y = pt + ih - (g / 4) * ih;
      grid += `<line x1="${pl}" y1="${y}" x2="${W - pr}" y2="${y}" stroke="#222b36" stroke-width="1"></line>`;
      grid += `<text x="${pl - 6}" y="${y + 4}" text-anchor="end" font-size="10" fill="#64748b">${Math.round(maxC * g / 4)}</text>`;
      grid += `<text x="${W - pr + 6}" y="${y + 4}" text-anchor="start" font-size="10" fill="#fbbf24">${g * 25}%</text>`;
    }
    return `<svg viewBox="0 0 ${W} ${H}" class="chart-svg" preserveAspectRatio="xMidYMid meet">
      ${grid}${bars}${line}${dots}${labels}</svg>`;
  }

  function svgTrend(t) {
    if (!t || !t.months || !t.months.length) return '<p class="hint">추이 데이터가 없습니다.</p>';
    const W = 760, H = 300, pl = 40, pr = 20, pt = 18, pb = 46;
    const iw = W - pl - pr, ih = H - pt - pb;
    const months = t.months, n = months.length;
    const all = [].concat(...Object.values(t.series), t.total);
    const maxV = Math.max(1, ...all);
    const xAt = i => pl + (n === 1 ? iw / 2 : (i / (n - 1)) * iw);
    const yAt = v => pt + ih - (v / maxV) * ih;
    let grid = '';
    for (let g = 0; g <= 4; g++) {
      const y = pt + ih - (g / 4) * ih;
      grid += `<line x1="${pl}" y1="${y}" x2="${W - pr}" y2="${y}" stroke="#222b36"></line>`;
      grid += `<text x="${pl - 6}" y="${y + 4}" text-anchor="end" font-size="10" fill="#64748b">${Math.round(maxV * g / 4)}</text>`;
    }
    let xlabels = '';
    months.forEach((m, i) => {
      if (n > 8 && i % 2 === 1) return;
      xlabels += `<text x="${xAt(i)}" y="${H - pb + 18}" text-anchor="middle" font-size="10" fill="#64748b">${esc(m.slice(2))}</text>`;
    });
    let lines = '';
    Object.entries(t.series).forEach(([cust, vals]) => {
      const pts = vals.map((v, i) => `${xAt(i)},${yAt(v)}`).join(' ');
      lines += `<polyline points="${pts}" fill="none" stroke="${CUST_COLORS[cust] || '#64748b'}" stroke-width="2.2"></polyline>`;
      vals.forEach((v, i) => { lines += `<circle cx="${xAt(i)}" cy="${yAt(v)}" r="2.6" fill="${CUST_COLORS[cust] || '#64748b'}"></circle>`; });
    });
    return `<svg viewBox="0 0 ${W} ${H}" class="chart-svg" preserveAspectRatio="xMidYMid meet">${grid}${lines}${xlabels}</svg>`;
  }

  function renderTrendLegend() {
    $('anTrendLegend').innerHTML = Object.entries(CUST_COLORS).map(([c, col]) =>
      `<span class="leg"><i style="background:${col}"></i>${c}</span>`).join('');
  }

  // ------------------------------------------------------------ 모델명 정합성 정리
  async function loadDuplicates() {
    const box = $('anDup');
    if (!box) return;
    box.innerHTML = '<p class="hint">검사 중…</p>';
    const groups = await api.get('/api/models/duplicates');
    state.dupGroups = groups || [];
    if (!state.dupGroups.length) {
      box.innerHTML = '<p class="hint">✓ 정리할 유사 모델명이 없습니다.</p>';
      return;
    }
    box.innerHTML = state.dupGroups.map((g, gi) => `
      <div class="dup-group">
        <div class="dup-head"><span class="st-tag ${g.kind.startsWith('표기') ? 'bad' : 'mid'}">${esc(g.kind)}</span>
          <span class="hint">총 ${g.total}건</span></div>
        <div class="dup-items">
          ${g.items.map((it, ii) => `
            <label class="dup-item">
              <input type="radio" name="dup${gi}" value="${esc(it.model_name)}" ${ii === 0 ? 'checked' : ''}>
              <b>${esc(it.model_name)}</b>
              <span class="hint">${it.c}건${it.last_date ? ' · 최근 ' + esc((it.last_date || '').slice(0, 10)) : ''}</span>
            </label>`).join('')}
        </div>
        <div class="row-between mt8">
          <span class="hint">↑ 대표로 남길 이름을 고르세요 (나머지는 이 이름으로 변경됩니다)</span>
          <button class="btn btn-primary btn-mini" onclick="App.mergeModels(${gi})">합치기</button>
        </div>
      </div>`).join('');
  }

  async function mergeModels(gi) {
    const g = (state.dupGroups || [])[gi];
    if (!g) return;
    const picked = document.querySelector(`input[name="dup${gi}"]:checked`);
    if (!picked) return;
    const to = picked.value;
    const from = g.items.map(i => i.model_name).filter(n => n !== to);
    if (!from.length) { alert('합칠 대상이 없습니다.'); return; }
    if (!confirm(`다음 모델명을 "${to}" 로 합칩니다.\n\n${from.join('\n')}\n\n` +
      `이슈·검사기 기록이 모두 변경됩니다. 계속할까요?`)) return;
    const r = await api.post('/api/models/merge', { from, to });
    if (r.error) { alert('오류: ' + r.error); return; }
    alert(`✓ ${r.merged}건의 이슈를 "${r.to}" 로 통합했습니다.`);
    loadDuplicates();
  }

  async function genDraft() {
    const s = $('dr_start').value, e = $('dr_end').value;
    $('draftBox').value = '생성 중…';
    const r = await api.get(`/api/report/draft?start=${s}&end=${e}`);
    $('draftBox').value = r.text || '(내용 없음)';
  }
  function copyDraft() {
    const t = $('draftBox'); t.select();
    navigator.clipboard.writeText(t.value).then(
      () => alert('보고 초안을 복사했습니다. 원하는 문서에 붙여넣기(Ctrl+V) 하세요.'),
      () => document.execCommand('copy'));
  }
  // 모델명 클릭 → 이슈 관리로 이동 + 검색창 자동 기입 + 검색까지 실행
  function openIssuesFor(model) {
    if (!model) return;
    go('issues').then(() => {
      const f = $('if_model');
      if (f) {
        f.value = model;
        ['if_customer'].forEach(id => { if ($(id)) $(id).value = ''; });
        ['if_type', 'if_sym', 'if_tag'].forEach(id => { if ($(id)) $(id).value = ''; });
        loadIssues();
        f.scrollIntoView({ block: 'center' });
        f.classList.add('flash');
        setTimeout(() => f.classList.remove('flash'), 1200);
      }
    });
  }

  // ------------------------------------------------------------ AI 도우미(챗봇)
  const CHAT_CHIPS = ['출하검사 순서 알려줘', '드림텍 방수 이슈', '음샘 불량 대처법', 'SM-F971U 이슈', '전체 이슈 통계'];

  // 근거 하이라이트 — 서버가 [[..]] 로 표시한 구간을 <mark>로 (XSS 방지: 먼저 escape)
  function hlText(s) {
    return esc(s).replace(/\[\[(.+?)\]\]/g, '<mark class="hl">$1</mark>');
  }

  function renderChat() {
    view().innerHTML = `
      <div class="row-between mt8"><h2 style="font-size:22px">🤖 AI 도우미 <span class="hint" style="font-weight:600">· AS 챗봇 데모</span></h2></div>
      <p class="hint mt8">축적된 출하이슈 데이터와 검사 순서도를 검색해 답변합니다.
        기본은 <b>규칙기반(무료·오프라인)</b>이며, 로컬 AI(Ollama)가 설치돼 있으면 켜서 자연스러운 답변을 받을 수 있습니다.</p>
      <div class="card mt12" style="padding:14px 16px">
        <div class="row-between">
          <label class="ai-toggle"><input type="checkbox" id="aiToggle" onchange="App.toggleLocalAI(this.checked)">
            <span>🧠 로컬 AI(Ollama) 사용</span></label>
          <div style="display:flex;gap:10px;align-items:center">
            <select id="aiModel" onchange="App.setAiModel(this.value)" style="width:auto;min-width:130px;display:none"></select>
            <span class="hint" id="aiStatus">확인 중…</span>
          </div>
        </div>
      </div>
      <details class="card mt12" style="padding:14px 16px">
        <summary style="cursor:pointer;font-weight:700;font-size:14px">🕘 지난 대화 / ★ 북마크
          <label class="hint" style="margin-left:10px"><input type="checkbox" id="chatBmOnly" onchange="App.loadChatHistory()"> 북마크만</label></summary>
        <div id="chatHistBox" class="mt12"><p class="hint">펼치면 불러옵니다…</p></div>
      </details>
      <div class="card mt12 chat-card">
        <div class="chat-scroll" id="chatScroll"></div>
        <div class="chat-chips" id="chatChips"></div>
        <div class="chat-input">
          <input class="input" id="chatText" placeholder="예) SM-F971U VSWR 이슈 알려줘" autocomplete="off">
          <button class="btn btn-primary" id="chatSend" onclick="App.sendChat()">전송</button>
        </div>
      </div>`;
    const t = $('chatText');
    t.addEventListener('keydown', e => { if (e.key === 'Enter') sendChat(); });
    if (!state.chat.messages.length) {
      state.chat.messages.push({
        role: 'bot',
        reply: '안녕하세요! KNK 출하검증 AS 도우미예요. 🤖\n모델명·검사기 종류·고객사·증상 키워드로 물어보시면, 축적된 과거 출하이슈를 찾아 답해드려요.',
        sources: [], chips: CHAT_CHIPS,
      });
    }
    renderChatMessages();
    loadChatConfig();
    const det = view().querySelector('details');
    if (det) det.addEventListener('toggle', () => { if (det.open) loadChatHistory(); });
    t.focus();
  }

  async function loadChatHistory() {
    const box = $('chatHistBox');
    if (!box) return;
    const bm = $('chatBmOnly') && $('chatBmOnly').checked;
    const rows = await api.get(`/api/chat/history?limit=20${bm ? '&bookmarked=1' : ''}`);
    box.innerHTML = (rows || []).map(r => `
      <div class="sim-row">
        <span class="sim-meta">${esc((r.created_at || '').slice(0, 16))}
          <button class="msg-act ${r.bookmarked ? 'on' : ''}" onclick="App.bookmarkChat(${r.id}, this)">${r.bookmarked ? '★' : '☆'}</button></span>
        <div class="sim-sym"><b>Q.</b> ${esc((r.question || '').slice(0, 80))}</div>
        <div class="sim-act">${esc((r.reply || '').slice(0, 140))}…</div>
      </div>`).join('') || '<p class="hint">대화 이력이 없습니다.</p>';
  }

  async function bookmarkChat(id, el) {
    const on = el.textContent.includes('☆');
    await api.post('/api/chat/bookmark', { id, on });
    el.textContent = on ? '★' : '☆';
    el.classList.toggle('on', on);
    const m = state.chat.messages.find(x => x.log_id === id);
    if (m) m.bookmarked = on;
  }

  async function chatToIssue(q) {
    await go('issues');
    if ($('issueForm')) $('issueForm').open = true;
    const mm = q.match(/(SM[-_][A-Za-z0-9()]+|V[A-Z]{2,3}\d{3,4}-\d{6,7}|WATCH\d+|BUDS\d*)/i);
    if (mm && $('i_model')) $('i_model').value = mm[1];
    if ($('i_symptom')) { $('i_symptom').value = q; }
    suggestTags('issue');
    loadSimilar();
    window.scrollTo(0, 0);
  }

  async function loadChatConfig() {
    try {
      const c = await api.get('/api/chat/config');
      const on = c.config && c.config.provider === 'ollama';
      if ($('aiToggle')) $('aiToggle').checked = on;
      const models = (c.ollama && c.ollama.models) || [];
      const sel = $('aiModel');
      const st = $('aiStatus');
      const avail = c.ollama && c.ollama.available;
      // 모델 선택 드롭다운(설치된 모델이 있을 때만 노출)
      if (sel) {
        if (avail && models.length) {
          const cur = (c.config && c.config.model) || '';
          sel.innerHTML = models.map(m => `<option value="${esc(m)}" ${m === cur ? 'selected' : ''}>${esc(m)}</option>`).join('');
          sel.style.display = on ? '' : 'none';
        } else { sel.style.display = 'none'; }
      }
      if (st) {
        if (avail) {
          st.textContent = models.length
            ? `✅ Ollama 연결됨 · 모델 ${models.length}개`
            : '✅ Ollama 연결됨 · ⚠ 모델 없음 (ollama pull qwen2.5:3b 필요)';
          st.style.color = models.length ? 'var(--accent)' : 'var(--amber)';
        } else {
          st.textContent = '⚪ Ollama 미설치/미실행 — 켜도 규칙기반으로 동작';
          st.style.color = 'var(--slate-400)';
        }
      }
    } catch (e) { /* 무시 */ }
  }

  async function setAiModel(model) {
    await api.post('/api/chat/config', { model });
    state.chat.messages.push({ role: 'bot', reply: `AI 모델을 '${model}' 로 설정했어요.`, sources: [], chips: CHAT_CHIPS, mode: 'llm', model });
    renderChatMessages();
  }

  async function toggleLocalAI(on) {
    await api.post('/api/chat/config', { provider: on ? 'ollama' : '' });
    await loadChatConfig();
    const msg = on ? '로컬 AI(Ollama)를 켰어요. 설치·모델이 있으면 자연스러운 답변, 아니면 규칙기반으로 자동 전환됩니다.'
                   : '규칙기반(무료·오프라인)으로 전환했어요.';
    state.chat.messages.push({ role: 'bot', reply: msg, sources: [], chips: CHAT_CHIPS, mode: on ? 'llm' : 'rule' });
    renderChatMessages();
  }

  function renderChatMessages() {
    const box = $('chatScroll');
    if (!box) return;
    box.innerHTML = state.chat.messages.map(m => {
      if (m.role === 'user') {
        return `<div class="msg user"><div class="bubble">${esc(m.text).replace(/\n/g, '<br>')}</div></div>`;
      }
      if (m.role === 'typing') {
        return `<div class="msg bot"><div class="avatar">🤖</div><div class="bubble typing"><span></span><span></span><span></span></div></div>`;
      }
      const src = (m.sources || []).map(s => `
        <div class="src-card" onclick="App.openIssuesFor('${esc(s.model || '').replace(/'/g, "\\'")}')" title="이슈 관리에서 이 모델 보기">
          <div class="src-head"><b>${esc(s.model || '-')}</b>
            <span class="src-meta">${esc(s.date || '')}${s.unit ? ' · ' + esc(s.unit) : ''}${s.tester_type ? ' · ' + esc(s.tester_type) : ''}${s.customer ? ' · ' + esc(s.customer) : ''}</span></div>
          <div class="src-ex">${hlText(s.excerpt || '')}</div>
          <div class="src-open">이슈 관리에서 보기 →</div>
        </div>`).join('');
      const modeBadge = m.mode === 'llm'
        ? `<span class="mode-badge llm">🧠 로컬 AI${m.model ? ' · ' + esc(m.model) : ''}</span>`
        : (m.mode ? `<span class="mode-badge rule">규칙기반</span>` : '');
      const acts = (m.log_id || m.q) ? `<div class="msg-acts">
        ${m.log_id ? `<button class="msg-act ${m.bookmarked ? 'on' : ''}" onclick="App.bookmarkChat(${m.log_id}, this)" title="북마크">${m.bookmarked ? '★' : '☆'}</button>` : ''}
        ${m.q ? `<button class="msg-act" onclick="App.chatToIssue('${esc(m.q).replace(/'/g, "\\'")}')" title="이 질문을 이슈로 등록">📝 이슈로 등록</button>` : ''}
      </div>` : '';
      return `<div class="msg bot"><div class="avatar">🤖</div><div class="bubble">
        ${modeBadge}
        <div class="reply">${esc(m.reply).replace(/\n/g, '<br>')}</div>
        ${src ? `<div class="src-list">${src}</div>` : ''}
        ${acts}
      </div></div>`;
    }).join('');
    // 마지막 봇 메시지의 추천 칩
    const last = [...state.chat.messages].reverse().find(m => m.role === 'bot');
    const chips = (last && last.chips) || CHAT_CHIPS;
    $('chatChips').innerHTML = chips.map(c =>
      `<button class="chat-chip" onclick="App.chatChip('${esc(c).replace(/'/g, "\\'")}')">${esc(c)}</button>`).join('');
    box.scrollTop = box.scrollHeight;
  }

  function chatChip(text) {
    if (state.chat.busy) return;
    $('chatText').value = text;
    sendChat();
  }

  async function sendChat() {
    const t = $('chatText');
    const text = (t.value || '').trim();
    if (!text || state.chat.busy) return;
    state.chat.busy = true;
    t.value = '';
    $('chatSend').disabled = true;
    state.chat.messages.push({ role: 'user', text });
    state.chat.messages.push({ role: 'typing' });
    renderChatMessages();
    let res;
    try { res = await api.post('/api/chat', { message: text }); }
    catch (e) { res = { reply: '⚠ 답변 중 오류가 발생했어요. 프로그램이 실행 중인지 확인해 주세요.', sources: [], chips: CHAT_CHIPS }; }
    // typing 제거 후 봇 답변 추가
    state.chat.messages = state.chat.messages.filter(m => m.role !== 'typing');
    state.chat.messages.push({ role: 'bot', reply: res.reply || '(답변 없음)', sources: res.sources || [], chips: res.chips || CHAT_CHIPS, mode: res.mode, model: res.model, log_id: res.log_id, q: text });
    state.chat.busy = false;
    if ($('chatSend')) $('chatSend').disabled = false;
    renderChatMessages();
    if ($('chatText')) $('chatText').focus();
  }

  // ------------------------------------------------------------ init
  // ------------------------------------------------------------ 전역 편의
  function globalKeys(e) {
    // 뷰어가 열려 있으면 뷰어 단축키 우선
    const vw = $('imgViewer');
    if (vw && vw.classList.contains('on')) { viewerKeys(e); return; }
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target.tagName || '')) || e.target.isContentEditable;
    // Ctrl+F: 현재 화면의 첫 검색창으로 포커스
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
      const box = $('if_model') || $('h_model') || $('chatText') || $('quickIssue');
      if (box) { e.preventDefault(); box.focus(); box.select && box.select(); }
      return;
    }
    if (typing) return;
    // 숫자 단축키로 화면 이동
    const map = { 1: 'home', 2: 'setup', 3: 'history', 4: 'issues', 5: 'analytics', 6: 'chat' };
    if (map[e.key]) { go(map[e.key]); return; }
    if (e.key === '?') showHelp();
  }

  function showHelp() {
    alert('⌨ 단축키\n\n' +
      '[화면 이동] 1 홈 · 2 새 검증 · 3 히스토리 · 4 이슈 관리 · 5 분석 · 6 AI 도우미\n' +
      '[공통] Ctrl+F 검색창 포커스 · Ctrl+V 이미지 붙여넣기 · ? 이 도움말\n\n' +
      '[사진 뷰어] 사진을 클릭하면 열립니다\n' +
      '  +/− 확대·축소 · 0 화면맞춤 · R 회전 · D 저장 · ←/→ 이전·다음 · Esc 닫기\n' +
      '  마우스 휠 확대/축소 · 드래그 이동 · 더블클릭 맞춤\n\n' +
      '[모델명] 클릭 → 이슈 관리에서 자동 검색 · 📦 → 모델 프로필');
  }

  function onScroll() {
    const b = $('toTop');
    if (b) b.classList.toggle('on', window.scrollY > 400);
  }
  function toTop() { window.scrollTo({ top: 0, behavior: 'smooth' }); }

  function init() {
    $('year').textContent = new Date().getFullYear();
    document.addEventListener('paste', handlePaste);   // Ctrl+V 이미지 첨부
    document.addEventListener('keydown', globalKeys);  // 단축키(뷰어 포함)
    window.addEventListener('scroll', onScroll);
    const btn = document.createElement('button');
    btn.id = 'toTop'; btn.className = 'to-top'; btn.title = '맨 위로';
    btn.textContent = '↑'; btn.onclick = toTop;
    document.body.appendChild(btn);
    go('home');
  }
  document.addEventListener('DOMContentLoaded', init);

  return {
    go, startRun, pickMode, setItem, toggleDetail, markAll, parseLog, loadSample, onFile, finish,
    downloadWeeklyReport, downloadBackup,
    resetHistoryFilter, searchHistory, toggleHistoryRow, toggleAllHistory, deleteSelectedHistory, exportHistory,
    historyPage,
    openRun, deleteRun, resumeRun,
    onPhotoFiles, removePhoto,
    loadIssues, resetIssueForm, editIssue, saveIssue, deleteIssue,
    issuePage, toggleIssue, toggleFormTag, filterByTag,
    suggestTags, toggleVerifyTag, autoTagInput,
    renderAnalytics, genDraft, copyDraft, openIssuesFor,
    sendChat, chatChip, toggleLocalAI, setAiModel,
    quickIssue, openModel,
    setTplTarget, insertTpl, addTemplate, delTemplate,
    onIssuePhotoFile, deleteIssuePhoto,
    pasteImport, exportIssues, syncServer,
    loadChatHistory, bookmarkChat, chatToIssue,
    openViewer, openViewerFrom, closeViewer, vwZoom, vwFit, vwRotate, vwStep,
    vwDownload, vwCopy, vwOpenTab,
    resetIssueFilter, clearIssueFilter, toTop, showHelp,
    reloadIssueForSave, forceSaveIssue, loadDuplicates, mergeModels,
    pasteFromClipboard, removePendingPhoto, savePhotoCaption, receivePhotos,
  };
})();
window.App = App;
