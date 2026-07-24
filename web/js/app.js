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
  // onclick="..." 안에 문자열로 넣을 값 (Z: 경로처럼 역슬래시·따옴표가 섞인 값에 필수)
  const jsq = (s) => esc(String(s ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'"));
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
    // 복원 여부는 렌더 전에 확인해 둔다(렌더 중 플래그가 꺼지므로)
    const returning = !!(state[name] && state[name].restore);
    // 표 위주 화면(히스토리·이슈관리·모니터)은 좌우 폭을 넓혀 한 줄로 보이게 함
    document.body.classList.toggle('wide', name === 'history' || name === 'issues' || name === 'monitor');
    if (name !== 'monitor') stopMonitor();   // 모니터를 떠나면 폴링 중지(연결은 서버가 유지)
    if (name === 'home') { setNav('home'); await renderHome(); }
    else if (name === 'setup') { setNav('setup'); renderSetup(); }
    else if (name === 'verify') { setNav('setup'); renderVerify(); }
    else if (name === 'done') { setNav('setup'); renderDone(); }
    else if (name === 'history') { setNav('history'); renderHistory(); }
    else if (name === 'issues') { setNav('issues'); renderIssues(); }
    else if (name === 'analytics') { setNav('analytics'); renderAnalytics(); }
    else if (name === 'chat') { setNav('chat'); renderChat(); }
    else if (name === 'monitor') { setNav('monitor'); await renderMonitor(); }
    // 목록으로 '돌아온' 경우에는 이전 스크롤 위치를 유지한다(맨 위로 튀지 않게)
    if (returning) restoreScroll(name); else window.scrollTo(0, 0);
  }

  // ------------------------------------------------------------ 화면 상태 보존
  // 목록 → 상세 → "← 목록" 으로 돌아왔을 때 검색조건·페이지·스크롤을 그대로 되살린다.
  const _scrollPos = {};
  function markReturn(screen) {
    _scrollPos[screen] = window.scrollY;
    if (state[screen]) state[screen].restore = true;
  }
  function restoreScroll(screen) {
    const y = _scrollPos[screen];
    if (y == null) return;
    // 목록 렌더(비동기 포함)가 끝난 뒤 위치를 되돌린다
    requestAnimationFrame(() => window.scrollTo(0, y));
    setTimeout(() => window.scrollTo(0, y), 60);
    setTimeout(() => window.scrollTo(0, y), 200);
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

  // 데이터가 어디에 쌓이는지 / 팀과 공유되는지 안내
  //  - 다른 PC에서 이 주소로 접속했다면 = 팀 서버 사용 = 데이터 공유됨
  //  - 내 PC에서 혼자 실행 중이면 = 이 PC에만 쌓임 (다른 사람에게 안 보임)
  function storageBanner() {
    const st = (state.boot && state.boot.storage) || {};
    const host = location.hostname;
    const isLocal = host === '127.0.0.1' || host === 'localhost';
    if (st.on_network) {
      return `<div class="demo-banner" style="border-color:rgba(248,113,113,.35);background:var(--danger-dim)">
        <b style="color:var(--danger)">⚠ 주의</b> — 데이터 파일이 <b>네트워크 폴더</b>에 있습니다.
        여러 명이 동시에 실행하면 <b>데이터가 손상될 수 있습니다.</b>
        폴더를 내 PC로 복사해 쓰거나, 한 대에서 <b>팀서버_시작</b> 후 나머지는 브라우저로 접속하세요.
      </div>`;
    }
    if (!isLocal) {
      return `<div class="demo-banner" style="border-color:rgba(52,211,153,.3);background:var(--ok-dim)">
        <b style="color:var(--ok)">팀 서버 접속 중</b> — 이 화면의 데이터는 팀원 모두가 함께 보고 있습니다.
        내가 등록·수정하면 다른 사람 화면에도 반영됩니다. <span class="hint">(${esc(host)})</span>
      </div>`;
    }
    return `<div class="demo-banner" style="border-color:var(--line);background:var(--surface-2)">
      <b>이 PC에서만 사용 중</b> — 데이터는 이 컴퓨터에만 저장되며 다른 사람에게는 보이지 않습니다.
      팀과 함께 쓰려면 <b>팀서버_시작.bat</b> 으로 실행한 뒤, 팀원은 표시되는 주소로 접속하세요.
    </div>`;
  }

  async function renderHome() {
    const st = state.stats = await api.get('/api/stats');
    const recentRows = (st.recent || []).map(r => `
      <tr class="clickable" onclick="App.openRun(${r.run_id})">
        <td>${fmtDate(r.run_date)}</td>
        <td><b>${esc(r.model_name)}</b></td>
        <td>${esc(r.tester_type)}</td>
        <td>${esc(r.unit_label || (r.unit_no ?? '-'))}</td>
        <td>${esc(r.customer || '-')}</td>
        <td>${esc(r.verify_mode || '-')}</td>
        <td><span class="jbadge ${resultBadge(r.result)}">${esc(r.result)}</span></td>
      </tr>`).join('');

    view().innerHTML = `
      ${isDemo() ? `<div class="demo-banner">
        <b>온라인 데모</b> — 기능을 둘러보는 용도입니다. 데이터는 비어 있고 새로고침 시 초기화됩니다.
        실제 이슈 축적·사내 서버(Z:) 동기화는 <b>회사 PC에서 프로그램 실행</b> 시 동작합니다.
      </div>` : storageBanner()}
      <section class="hero">
        <span class="tag">HAIST Innovation · KNK 품질 전용 시스템 「지킴」</span>
        <h1>지킴은 검증과 기록을<br>분리하지 않습니다.</h1>
        <p class="hero-lead">검사의 모든 순간이, 그대로 <b>품질의 이력</b>이 됩니다.</p>
        <p class="hero-sub">출하 검증 22단계 순서도 · 과거 이슈 사전 안내 · Open/Short·경계·이탈 자동 판정 ·
           호기 간 편차 비교 — 사람의 경험과 데이터의 판정을 <b>하나의 흐름</b>으로 설계했습니다.</p>
        <p class="hero-close">KNK가 만드는 모든 검사기는, <b>지킴</b>을 거쳐 출하됩니다.</p>
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
      const se = r.server_export;
      if (se && !se.ok) {          // 서버 출하이슈사항 기록 실패 — 반드시 알린다 (누락 방지)
        msg.innerHTML = `⚠ 이슈는 등록됐지만 <b>서버 출하이슈사항 기록에 실패</b>했습니다. ` +
          `<button class="btn btn-mini btn-primary" onclick="App.retryIssueExport(${r.id})">↻ 다시 시도</button>`;
        msg.style.color = 'var(--warn)';
        alert('서버 출하이슈사항 기록 실패\n\n' + (se.error || '') +
              '\n\n이슈는 프로그램에 저장되어 있습니다. 문제 해결 후 [다시 시도]를 눌러 주세요.');
        t.value = '';
        return;
      }
      msg.innerHTML = `✓ 등록됨 — <b>${esc(r.model)}</b>${r.unit ? ' · ' + esc(r.unit) : ''}` +
        `${r.tags ? ' · 태그 ' + esc(r.tags.replace(/^,|,$/g, '')) : ''}` +
        `${se && se.ok ? ' · 서버 출하이슈사항 기록 ✓' : ''} (이슈 관리에서 수정 가능)`;
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
          <div class="field"><label>호기 <span class="hint" style="font-weight:600">· 여러 대 동시 검증 가능</span></label>
            <input class="input" id="f_units" placeholder="예) 3  ·  3~7  ·  1,2,5"
              value="${esc(s.units_text || '')}" oninput="App.previewUnits()">
            <div class="hint mt8" id="unitPreview"></div></div>
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

  // 호기 입력 파싱 — "3" · "3~7" · "1,2,5" 를 호기 번호 목록으로 (서버 zserver.parse_units 와 동일 규칙)
  function parseUnits(text) {
    const out = new Set();
    (text || '').replace(/호기/g, '').split(/[,/\s]+/).forEach(part => {
      if (!part) return;
      const m = part.match(/^(\d+)\s*[~\-]\s*(\d+)$/);
      if (m) {
        let a = Number(m[1]), b = Number(m[2]);
        if (a > b) { const t = a; a = b; b = t; }
        if (b - a <= 99) for (let i = a; i <= b; i++) out.add(i);
      } else if (/^\d+$/.test(part)) out.add(Number(part));
    });
    return [...out].sort((a, b) => a - b);
  }

  function unitLabel(units) {
    if (!units || !units.length) return '';
    if (units.length === 1) return `${units[0]}호기`;
    const seq = units.length >= 3 && units.every((u, i) => u === units[0] + i);
    return seq ? `${units[0]}~${units[units.length - 1]}호기` : units.join(',') + '호기';
  }

  function previewUnits() {
    const el = $('unitPreview');
    if (!el) return;
    const units = parseUnits($('f_units') ? $('f_units').value : '');
    el.innerHTML = units.length
      ? `→ <b>${esc(unitLabel(units))}</b> · 검사기 ${units.length}대를 한 번에 검증합니다.`
      : '비워두면 호기 없이 진행합니다.';
  }

  function collectSetup() {
    const g = id => ($(id) ? $(id).value.trim() : '');
    const s = state.setup;
    s.model_name = g('f_model'); s.model_rev = g('f_rev'); s.tester_type = $('f_type').value;
    s.units_text = g('f_units');
    s.units = parseUnits(s.units_text);
    s.unit_no = s.units.length ? s.units[0] : null;
    s.unit_label = unitLabel(s.units);
    s.board_type = g('f_board');
    s.customer = g('f_customer'); s.inspector = g('f_inspector');
    if (s.inspector) localStorage.setItem('knk_inspector', s.inspector);   // 검사자 이름 기억
    return s;
  }

  async function startRun() {
    const s = collectSetup();
    if (!s.model_name || !s.tester_type || !s.inspector) {
      $('setupErr').textContent = '모델명 · 검사기 종류 · 검사자는 필수입니다.'; return;
    }
    if (s.units_text && !s.units.length) {
      $('setupErr').textContent = '호기를 인식하지 못했습니다. 예) 3 · 3~7 · 1,2,5'; return;
    }
    if (s.verify_mode === '양산' && !s.units.length) {
      $('setupErr').textContent = '양산 모드는 앞 호기와 비교하므로 호기가 필요합니다. (예: 2 또는 3~7)'; return;
    }
    const res = await api.post('/api/run/start', { ...s, units: s.units_text });
    if (res.error) { $('setupErr').textContent = '오류: ' + res.error; return; }
    state.run = res;
    state.checkItems = res.check_items;
    state.judge = null;
    go('verify');
    loadPriorUnitPhotos();          // 이전 호기의 마킹·인주TEST 이력을 서버에서 불러온다
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
          <p class="hint">REV ${esc(s.model_rev || '-')} · ${s.unit_label ? esc(s.unit_label) + ' · ' : ''}검사자 ${esc(s.inspector)} · <b>${esc(r.mode)}</b> 모드</p></div>
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
            <div class="card-sub">순서대로 확인하며 PASS/FAIL을 누르세요. 항목명을 누르면 절차·기준이 펼쳐집니다.
              접어두어도 <b>마킹 · 인주TEST</b> 항목은 계속 보입니다.</div>
          </div>
          <div style="display:flex;gap:8px;flex-shrink:0">
            <button class="btn btn-ghost btn-mini" id="ckFold" onclick="App.toggleCheckList()"
              title="검사항목 접기/펴기">▾ 접기</button>
            <button class="btn btn-ghost btn-mini" onclick="App.markAll('PASS')" title="미검사 항목을 모두 PASS로">✓ 전체 PASS</button>
            <button class="btn btn-ghost btn-mini" onclick="App.markAll('미검사')" title="모두 미검사로 되돌리기">↺</button>
          </div>
        </div>
        <div class="ck-progress mt12"><i id="ckBar"></i><span id="ckText"></span></div>
        <div class="hint mt8" id="ckFoldHint" style="display:none"></div>
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
        <div class="card-title"><span class="section-num">3</span> 이슈사항 기록 & 검증 완료</div>
        <div class="card-sub">이 검증에서 발견한 이슈를 아래에 적으면 <b>검증 완료 시 서버(Z:)의 이 모델
          출하이슈사항 엑셀에 자동으로 기록</b>되고, 프로그램 이슈관리에도 함께 등록됩니다.
          (엑셀에 직접 적던 방식도 그대로 사용 가능 — 완료 시 자동으로 읽어옵니다)</div>

        <div class="z-open-row mt12">
          <button class="btn" onclick="App.openShipFolder()">📂 출하이슈사항 폴더 열기</button>
          <span class="hint" id="zFolderHint">서버 경로를 확인하는 중…</span>
        </div>
        <div id="zOpenMsg" class="mt8"></div>

        <div class="field mt16"><label>이슈 증상 <span class="hint" style="font-weight:400">— 비워 두면 이슈 없이 완료</span></label>
          <textarea class="input" id="f_iss_symptom" rows="3"
            placeholder="예) 반복성 시 3번 시료에서 C201 가성불량 발생 (정상 100, 불량 50)"></textarea></div>
        <div class="grid2 mt12">
          <div class="field"><label>원인 (선택)</label>
            <input class="input" id="f_iss_cause" placeholder="예) 푸셔 스프링 깊이값 설정 오류"></div>
          <div class="field"><label>조치 (선택)</label>
            <input class="input" id="f_iss_action" placeholder="예) 푸셔 R1으로 교체 후 정상 확인"></div>
          <div class="field"><label>상태</label>
            <select id="f_iss_status"><option value=""></option>
              <option>개선완료</option><option>임시조치·모니터링</option><option>미해결·추후확인</option></select></div>
          <div class="field"><label>관련 부품</label>
            <select id="f_component"><option value="">선택 안 함</option>${(state.boot.component_types || []).map(c => `<option>${esc(c)}</option>`).join('')}</select></div>
        </div>
        <div class="field mt12"><label>증상 분류</label>
          <select id="f_symptom"><option value="">선택 안 함</option>${(state.boot.symptom_types || []).map(s => `<option>${esc(s)}</option>`).join('')}</select></div>
        <button class="btn btn-accent btn-lg btn-block mt16" onclick="App.finish()">검증 완료 및 판정 →</button>
        <div id="finishMsg" class="mt12"></div>
      </div>`;
    renderCheckProgress();
    setupDrop();
    applyCheckFold();
    loadShipFolder();
  }

  // ---------------------------------------------------------- 출하이슈사항 폴더 (Z: 읽기 전용)
  async function loadShipFolder() {
    const hint = $('zFolderHint');
    if (!hint) return;
    const s = state.setup;
    const a = await api.get(`/api/z/model?model=${encodeURIComponent(s.model_name)}` +
      `&type=${encodeURIComponent(s.tester_type || '')}`);
    state.zAssets = a;
    if (!a.available) { hint.textContent = a.reason || '서버에 접근할 수 없습니다.'; return; }
    const t = (a.testers || [])[0];
    hint.textContent = t ? t.verify_dir
      : `서버에서 '${s.model_name}'의 출하검증 폴더를 찾지 못했습니다.`;
  }

  async function openShipFolder() {
    const msg = $('zOpenMsg');
    const t = ((state.zAssets || {}).testers || [])[0];
    if (!t) {
      msg.innerHTML = `<div class="warn-box">서버에서 이 모델의 <b>10. 출하검증</b> 폴더를 찾지 못했습니다.
        모델명·검사기 종류를 확인하거나, 이슈 관리 화면의 <b>서버 경로 설정</b>을 확인해 주세요.</div>`;
      return;
    }
    const res = await api.post('/api/z/open', { path: t.verify_dir });
    msg.innerHTML = res.error
      ? `<div class="warn-box">폴더를 열지 못했습니다: ${esc(res.error)}</div>`
      : `<div class="ok-box">탐색기에서 <b>${esc(t.verify_dir)}</b> 폴더를 열었습니다.
           출하이슈사항 엑셀을 작성한 뒤 <b>저장하고 닫아</b> 주세요.</div>`;
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

  // 마킹 · 인주TEST 항목은 접어도 계속 보이게 고정(pin)하고,
  // 클릭해 펼쳤을 때만 직전 호기 사진을 보여준다 — 출하 시 가장 자주 대조하는 항목.
  function pinKind(it) {
    const t = `${it.item_name || ''} ${it.test_desc || ''} ${it.criteria || ''}`;
    if (/마킹|marking/i.test(t)) return '마킹';
    if (/인주/.test(t)) return '인주TEST';
    return null;
  }
  function isPinned(it) { return !!pinKind(it); }

  function checkRow(it) {
    const kind = pinKind(it);
    return `<div class="check-row${kind ? ' pin' : ''}" data-item="${it.id}">
      <div class="seq">${it.seq}</div>
      <div class="info" onclick="App.toggleDetail(${it.id})"
           title="클릭하면 절차·기준${kind ? ' · 직전 호기 사진' : ''} 보기">
        <b>${esc(it.item_name)}</b>${kind
          ? `<span class="ck-photo-tag">📷 직전 호기 ${esc(kind)} 사진</span>` : ''}
        <div class="ck-detail" id="ckd_${it.id}">
          ${it.test_desc ? `<small>절차: ${esc(it.test_desc)}</small>` : ''}
          <small class="crit">기준: ${esc(it.criteria || '-')}</small>
          ${kind ? `<div class="ck-photos" id="ckph_${it.id}" data-kind="${esc(kind)}"></div>` : ''}
        </div>
      </div>
      <div class="seg">
        <button class="pass ${it.result === 'PASS' ? 'on' : ''}" onclick="App.setItem(${it.id},'PASS')">PASS</button>
        <button class="fail ${it.result === 'FAIL' ? 'on' : ''}" onclick="App.setItem(${it.id},'FAIL')">FAIL</button>
      </div></div>`;
  }

  function toggleDetail(id) {
    const el = $(`ckd_${id}`);
    if (!el) return;
    el.classList.toggle('open');
    // 펼칠 때만 사진을 그린다(항목을 열지 않으면 서버 이미지를 아예 받지 않음)
    if (el.classList.contains('open')) renderItemPhotos(id);
  }

  // 검사항목 접기/펴기 — 접어도 마킹·인주TEST(.pin) 항목은 그대로 남는다.
  function toggleCheckList() {
    state.ckCollapsed = !state.ckCollapsed;
    applyCheckFold();
  }

  function applyCheckFold() {
    const list = $('checkList'), btn = $('ckFold'), hint = $('ckFoldHint');
    if (!list) return;
    const on = !!state.ckCollapsed;
    list.classList.toggle('collapsed', on);
    if (btn) btn.textContent = on ? '▸ 펴기' : '▾ 접기';
    if (hint) {
      const pinned = list.querySelectorAll('.check-row.pin').length;
      hint.style.display = on ? '' : 'none';
      hint.innerHTML = `검사항목을 접었습니다 — <b>마킹 · 인주TEST ${pinned}개 항목</b>만 표시 중입니다.`;
    }
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
    applyCheckFold();
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

  // ------------------------------------------------------------ 이전 호기 마킹·인주TEST (Z: 읽기 전용)
  // 사진은 DB로 복사하지 않고, 서버 원본을 그때그때 스트리밍해서 보여준다.
  async function loadPriorUnitPhotos() {
    const s = state.setup;
    if (!s || !s.model_name) return;
    state.priorPhotos = { loading: true };
    renderOpenItemPhotos();
    state.priorPhotos = await api.get(
      `/api/z/prior-photos?model=${encodeURIComponent(s.model_name)}` +
      `&type=${encodeURIComponent(s.tester_type || '')}` +
      `&units=${encodeURIComponent((s.units || []).join(','))}`);
    renderOpenItemPhotos();
  }

  // 직전(가장 최근) 호기 세션 하나만 고른다 — 과거 전체가 아니라 바로 앞 출하분과 대조하는 용도.
  // 서버가 최신순으로 주므로, 해당 종류의 사진이 있는 첫 세션이 곧 직전 호기다.
  function lastShippedSession(kind) {
    const p = state.priorPhotos;
    if (!p || !p.available) return null;
    return (p.sessions || []).find(s => (s[kind] || []).length) || null;
  }

  // 검사항목을 펼쳤을 때 그 항목 안에 직전 호기 사진을 그린다.
  function renderItemPhotos(id) {
    const box = $(`ckph_${id}`);
    if (!box) return;
    const kind = box.dataset.kind;
    const p = state.priorPhotos;

    if (!p) { box.innerHTML = ''; return; }
    if (p.loading) { box.innerHTML = '<small>서버에서 직전 호기 사진을 찾는 중…</small>'; return; }
    if (!p.available) {
      box.innerHTML = `<small>${esc(p.reason || '서버에 접근할 수 없습니다.')}</small>`;
      return;
    }
    const s = lastShippedSession(kind);
    if (!s) {
      box.innerHTML = `<small>직전 호기의 ${esc(kind)} 사진이 서버에 없습니다.</small>`;
      return;
    }
    const list = s[kind];
    const g = `ckph${id}`;
    box.innerHTML = `
      <div class="ck-photo-head">
        <small><b>직전 출하: ${esc(s.unit_label || s.name)}</b>${s.date ? ' · ' + esc(s.date) : ''}
          · ${esc(kind)} ${list.length}장</small>
        <button type="button" class="btn btn-ghost btn-mini"
          onclick="event.stopPropagation();App.openZPath('${jsq(s.path)}')">📂 폴더 열기</button>
      </div>
      <div class="photo-grid mt8">${list.map((f, i) => `
        <div class="photo-item" data-vw="${g}" data-url="${esc(f.url)}"
             data-name="${esc(f.name)}" data-meta="${esc(s.unit_label || s.name)} · ${esc(kind)}">
          <img loading="lazy" src="${esc(f.thumb || f.url)}" alt="${esc(f.name)}"
               onclick="event.stopPropagation();App.openViewerFrom('${g}',${i})">
          <div class="photo-meta"><span>${esc(f.name)}</span></div>
        </div>`).join('')}</div>`;
  }

  // 이미 펼쳐져 있는 마킹·인주 항목들을 다시 그린다(사진 로딩 완료 시).
  function renderOpenItemPhotos() {
    document.querySelectorAll('.ck-detail.open .ck-photos').forEach(box => {
      renderItemPhotos(box.id.replace('ckph_', ''));
    });
  }

  async function openZPath(path) {
    const res = await api.post('/api/z/open', { path });
    if (res.error) toast('폴더를 열지 못했습니다: ' + res.error, 'warn');
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
  // 첨부 대상은 이슈 사진뿐이다(새 검증의 사진 첨부는 삭제됨 — 출하사진은 Z: 서버에서 불러온다).
  function receivePhotos(files, how) {
    const imgs = [...files].filter(f => f.type && f.type.startsWith('image/'));
    if (!imgs.length) { toast('이미지 파일이 아닙니다.', 'warn'); return; }

    if (!$('issueZone')) {                         // 이슈 폼이 화면에 있으면(열림 여부 무관)
      toast('여기서는 사진을 붙여넣을 수 없어요. 이슈 등록 화면에서 사용하세요.', 'warn');
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
    const component = $('f_component') ? $('f_component').value : '';
    const symptom_type = $('f_symptom') ? $('f_symptom').value : '';
    // 검증 화면에서 적은 이슈 — 완료 시 서버 출하이슈사항 엑셀 + 이슈관리에 함께 기록
    const issSym = $('f_iss_symptom') ? $('f_iss_symptom').value.trim() : '';
    const issue = issSym ? {
      symptom: issSym,
      cause: $('f_iss_cause') ? $('f_iss_cause').value.trim() : '',
      action: $('f_iss_action') ? $('f_iss_action').value.trim() : '',
      status: $('f_iss_status') ? $('f_iss_status').value : '',
    } : null;
    const res = await api.post('/api/run/finish',
      { run_id: state.run.run_id, component, symptom_type, issue });
    if (res.error) { toast('검증 완료 처리 실패: ' + res.error, 'warn'); return; }

    // 이슈를 적었는데 서버 출하이슈사항 기록에 실패 → 결과 화면으로 넘어가지 않는다 (누락 방지)
    const ie = res.issue_export;
    if (res.issue_id && ie && !ie.ok) {
      state.finish = res;
      const msg = $('finishMsg');
      if (msg) {
        msg.innerHTML = `<div class="warn-box">
          <b>⚠ 서버 출하이슈사항 기록 실패 — 이슈는 프로그램에 저장됐지만 서버 엑셀에는 아직 없습니다.</b>
          <div class="mt8" style="white-space:pre-line">${esc(ie.error || '')}</div>
          <div class="mt12" style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn btn-primary btn-mini" onclick="App.retryFinishExport(${res.issue_id})">↻ 서버 기록 다시 시도</button>
            <button class="btn btn-ghost btn-mini" onclick="App.openShipFolder()">📂 폴더 열기</button>
          </div></div>`;
        msg.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      alert('서버 출하이슈사항 기록에 실패했습니다.\n\n' + (ie.error || '') +
            '\n\n문제를 해결한 뒤 [서버 기록 다시 시도]를 눌러 주세요.');
      return;
    }
    if (res.issue_id && ie && ie.ok) {
      toast(ie.already ? '서버 출하이슈사항에 같은 내용이 이미 있어 중복 기록하지 않았습니다.'
        : `서버 출하이슈사항에 기록 완료 (${ie.row}행)`);
    }

    // 서버 출하이슈사항을 읽지 못했으면(엑셀 열려 있음 등) 완료 화면으로 넘어가기 전에 경고
    const si = res.server_issues;
    if (si && !si.ok && !si.not_found) {
      const msg = $('finishMsg');
      if (msg) {
        msg.innerHTML = `<div class="warn-box">
          <b>⚠ 서버의 출하이슈사항을 불러오지 못했습니다.</b>
          <div class="mt8" style="white-space:pre-line">${esc(si.error || '')}</div>
          <div class="mt8">검증 자체는 <b>완료 처리되었습니다.</b>
            엑셀을 닫은 뒤 아래 버튼을 누르면 이슈관리에 반영됩니다.</div>
          <div class="mt12" style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn btn-primary btn-mini" onclick="App.retryServerIssues()">↻ 다시 불러오기</button>
            <button class="btn btn-ghost btn-mini" onclick="App.openShipFolder()">📂 폴더 열기</button>
            <button class="btn btn-ghost btn-mini" onclick="App.skipServerIssues()">건너뛰고 결과 보기 →</button>
          </div></div>`;
        msg.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      state.finish = res;
      return;
    }
    state.finish = res;
    state.finish.issue_saved = !!(res.issue_id);
    go('done');
  }

  // 검증 완료 화면의 이슈 서버 기록 재시도 — 성공하면 결과 화면으로 진행.
  async function retryFinishExport(issueId) {
    let r;
    try { r = await api.post('/api/issue/export_server', { issue_id: issueId }); }
    catch (e) { r = { ok: false, error: '서버 기록 요청에 실패했습니다.' }; }
    if (!r || !r.ok) {
      alert('서버 출하이슈사항 기록 실패\n\n' + ((r && r.error) || '알 수 없는 오류'));
      return;
    }
    toast(r.already ? '서버 출하이슈사항에 이미 기록되어 있습니다.'
      : `서버 출하이슈사항에 기록 완료 (${r.row}행)`);
    if ($('finishMsg')) $('finishMsg').innerHTML = '';
    state.finish.issue_saved = true;
    go('done');
  }

  // 엑셀을 닫고 나서 재시도 — 성공하면 결과 화면으로 넘어간다.
  async function retryServerIssues() {
    const f = state.finish || {};
    const msg = $('finishMsg');
    if (msg) msg.innerHTML = '<p class="hint">서버에서 출하이슈사항을 다시 읽는 중…</p>';
    const si = await api.post('/api/z/import-issues',
      { model: f.model_name, tester_type: f.tester_type });
    if (!si.ok && !si.not_found) {
      if (msg) msg.innerHTML = `<div class="warn-box">
        <b>⚠ 아직 불러오지 못했습니다.</b>
        <div class="mt8" style="white-space:pre-line">${esc(si.error || '')}</div>
        <div class="mt12" style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-primary btn-mini" onclick="App.retryServerIssues()">↻ 다시 불러오기</button>
          <button class="btn btn-ghost btn-mini" onclick="App.skipServerIssues()">건너뛰고 결과 보기 →</button>
        </div></div>`;
      return;
    }
    state.finish.server_issues = si;
    go('done');
  }

  function skipServerIssues() { go('done'); }

  // 완료 화면 — 서버 출하이슈사항 반영 결과 안내
  function serverIssueBox(si) {
    if (!si) return '';
    if (si.ok) {
      if (!si.added) {
        return `<div class="rep-box mt12"><b>서버 출하이슈사항 확인 완료</b>
          <div class="r mt8">새로 추가된 이슈는 없습니다 (기존 ${si.existing || 0}건은 이미 등록되어 있음).</div></div>`;
      }
      return `<div class="rep-box mt12" style="border-color:var(--accent-500);background:var(--accent-50)">
        <b>✓ 서버 출하이슈사항 ${si.added}건이 이슈관리에 반영되었습니다</b>
        <div class="r mt8">출처: ${esc((si.files || []).join(', '))} —
          이슈 관리에서 확인·수정할 수 있고, 다음 검증의 "검사 전 확인"과 AI 도우미 답변에 바로 활용됩니다.</div></div>`;
    }
    if (si.not_found) {
      return `<div class="rep-box mt12"><b>서버에 출하이슈사항 엑셀이 없습니다</b>
        <div class="r mt8">${esc(si.error || '')}</div></div>`;
    }
    return `<div class="warn-box mt12"><b>⚠ 서버 출하이슈사항을 불러오지 못했습니다</b>
      <div class="mt8" style="white-space:pre-line">${esc(si.error || '')}</div>
      <div class="mt8"><button class="btn btn-primary btn-mini" onclick="App.retryServerIssues()">↻ 다시 불러오기</button></div></div>`;
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
          <div class="cell"><div class="k">검사기 종류 / 호기</div><div class="v">${esc(s.tester_type)} / ${esc(s.unit_label || '-')}</div></div>
          <div class="cell"><div class="k">검사자 / 모드</div><div class="v">${esc(s.inspector)} / ${esc(r.mode)}</div></div>
          <div class="cell"><div class="k">종합 판정</div><div class="v" style="color:${pass ? 'var(--accent)' : 'var(--red)'}">${esc(f.result || '-')}</div></div>
        </div>
        ${serverIssueBox(f.server_issues)}
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
  // 모델명 다중 검색 — 한 칸 안의 콤마 + 여러 칸을 모두 모아 콤마로 합친다.
  // 서버는 콤마로 나눠 OR 검색하므로, "SM-S95,SM-A2" 나 칸 여러 개나 결과가 같다.
  function modelBoxValue(boxId) {
    const box = $(boxId);
    if (!box) return '';
    return [...box.querySelectorAll('input')].map(i => i.value.trim())
      .filter(Boolean).join(',');
  }

  function addModelBox(boxId) {
    const box = $(boxId);
    if (!box) return;
    const onEnter = boxId.charAt(0) === 'h' ? searchHistory : loadIssues;
    const row = document.createElement('span');
    row.className = 'model-extra';
    const inp = document.createElement('input');
    inp.className = 'input';
    inp.placeholder = '추가 모델';
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') onEnter(); });
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'btn btn-mini model-del';
    del.textContent = '−';
    del.title = '이 검색창 제거';
    del.onclick = () => row.remove();
    row.append(inp, del);
    box.insertBefore(row, box.querySelector('.model-add'));   // ＋ 버튼 앞에 삽입
    inp.focus();
  }

  function historyFilters() {
    return {
      start: $('h_start') ? $('h_start').value : '',
      end: $('h_end') ? $('h_end').value : '',
      model: modelBoxValue('h_model_box'),
      customer: $('h_customer') ? $('h_customer').value.trim() : '',
      tester_type: $('h_type') ? $('h_type').value : '',
      result: $('h_result') ? $('h_result').value : '',
    };
  }

  function renderHistory() {
    const b = state.boot;
    const f = state.history.filters || {};      // 이전 검색 조건 복원
    const sel = (v, cur) => (v === cur ? ' selected' : '');
    const typeOpts = b.tester_types.map(t =>
      `<option value="${esc(t)}"${sel(t, f.tester_type)}>${esc(t)}</option>`).join('');
    view().innerHTML = `
      <div class="row-between mt8"><h2 style="font-size:22px">검증 히스토리</h2></div>
      <p class="hint mt8">날짜 · 모델명 · 고객사 · 검사기 종류 · 판정 결과로 지난 검증 데이터를 검색하고,
        행을 클릭하면 상세 내용을 볼 수 있습니다. 삭제·엑셀 내보내기도 가능합니다.</p>

      <div class="card mt16">
        <div class="grid2">
          <div class="field"><label>시작일</label><input class="input" type="date" id="h_start" value="${esc(f.start || '')}"></div>
          <div class="field"><label>종료일</label><input class="input" type="date" id="h_end" value="${esc(f.end || '')}"></div>
          <div class="field"><label>모델명 <span class="hint" style="font-weight:400">· 콤마(,)로 여러 개 · ＋ 로 칸 추가</span></label>
            <div class="model-multi" id="h_model_box">
              <input class="input" id="h_model" placeholder="예) SM-S95,SM-A2" value="${esc(f.model || '')}">
              <button type="button" class="btn btn-mini model-add" title="검색창 추가" onclick="App.addModelBox('h_model_box')">＋</button>
            </div></div>
          <div class="field"><label>고객사</label><input class="input" id="h_customer" placeholder="예) 드림텍" value="${esc(f.customer || '')}"></div>
          <div class="field"><label>검사기 종류</label>
            <select id="h_type"><option value="">전체</option>${typeOpts}</select></div>
          <div class="field"><label>판정 결과</label>
            <select id="h_result"><option value="">전체</option>
              <option value="PASS"${sel('PASS', f.result)}>PASS</option>
              <option value="FAIL"${sel('FAIL', f.result)}>FAIL</option>
              <option value="진행중"${sel('진행중', f.result)}>진행중</option>
              <option value="출하완료"${sel('출하완료', f.result)}>출하완료</option></select></div>
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
    // 이미 불러온 결과가 있으면 그대로 복원(재조회 없이 즉시 이전 화면), 없으면 새로 조회
    if (state.history.rows && state.history.rows.length && state.history.restore) {
      renderHistoryRows();
    } else {
      loadHistory();
    }
    state.history.restore = false;
  }

  function resetHistoryFilter() {
    ['h_start', 'h_end', 'h_model', 'h_customer', 'h_type', 'h_result'].forEach(id => { if ($(id)) $(id).value = ''; });
    document.querySelectorAll('#h_model_box .model-extra').forEach(e => e.remove());   // 추가 검색칸 제거
    state.history.filters = {};
    searchHistory();
  }

  function searchHistory() { state.history.page = 1; loadHistory(); }

  function filterQuery() {
    const f = historyFilters();
    return Object.entries(f).filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  }

  async function loadHistory(keepPage) {
    const qs = filterQuery();
    state.history.filters = historyFilters();       // 검색 조건 기억(뒤로가기 복원용)
    const seq = (state.history.seq = (state.history.seq || 0) + 1);
    const rows = await api.get(`/api/history/search${qs ? '?' + qs : ''}`);
    if (seq !== state.history.seq) return;          // 늦게 온 이전 요청 폐기
    state.history.rows = rows;
    state.history.selected = new Set();
    if (!keepPage) state.history.page = 1;
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
        <td>${esc(r.unit_label || (r.unit_no ?? '-'))}</td>
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
    markReturn('history');            // 목록으로 돌아올 때 복원할 상태 기억
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
          <div class="cell"><div class="k">검사기 종류 / 호기</div><div class="v">${esc(r.tester_type)} / ${esc(r.unit_label || (r.unit_no ? r.unit_no + '호기' : '-'))}</div></div>
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
      unit_label: r.unit_label || (r.unit_no ? r.unit_no + '호기' : ''),
      units: parseUnits(r.unit_list || (r.unit_no != null ? String(r.unit_no) : '')),
      units_text: r.unit_list || (r.unit_no != null ? String(r.unit_no) : ''),
    };
    state.run = r;
    state.checkItems = r.check_items;
    state.judge = null;
    go('verify');
    loadPriorUnitPhotos();
  }

  // ------------------------------------------------------------ 이슈 관리
  function renderIssues() {
    const b = state.boot;
    const ff = state.issues.filters || {};          // 이전 검색 조건 복원
    const sel = (v, cur) => (v === cur ? ' selected' : '');
    const typeOpts = b.tester_types.map(t => `<option value="${esc(t)}"${sel(t, ff.type)}>${esc(t)}</option>`).join('');
    const symOpts = (b.symptom_types || []).map(t => `<option value="${esc(t)}"${sel(t, ff.sym)}>${esc(t)}</option>`).join('');
    const tagOpts = (b.tags || []).map(t => `<option value="${esc(t)}"${sel(t, ff.tag)}>${esc(t)}</option>`).join('');
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
        <!-- 원문 편집 (수정 시에만 표시) — 엑셀에 쓰는 그대로의 생 텍스트를 수정하면
             서버 출하이슈사항 엑셀의 해당 행도 같은 내용으로 함께 바뀐다 -->
        <div id="rawEditBox" class="hidden mt16" style="border-top:1px solid var(--line);padding-top:14px">
          <div class="field"><label>📝 서버 기록 원문으로 수정
            <span class="hint" style="font-weight:400">— 엑셀에 적는 그대로. 저장하면 서버 출하이슈사항 엑셀의 이 행이 함께 수정됩니다</span></label>
            <textarea class="input" id="i_raw" rows="6" style="font-family:var(--mono);font-size:12.5px"
              placeholder="예)&#10;1,2호기&#10;-.R0.3 시료로 검토진행&#10;-.반복성 시 가성불량 발생&#10;->핀블록 교체 후 정상 확인"></textarea></div>
          <div style="display:flex;justify-content:flex-end;margin-top:8px">
            <button class="btn btn-primary" onclick="App.saveIssueRaw()">원문 저장 (서버 엑셀 함께 수정)</button>
          </div>
        </div>
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
            <span class="model-multi" id="if_model_box">
              <input class="input" id="if_model" placeholder="모델명 (SM-S95,SM-A2)" style="width:170px" value="${esc(ff.model || '')}">
              <button type="button" class="btn btn-mini model-add" title="검색창 추가" onclick="App.addModelBox('if_model_box')">＋</button>
            </span>
            <input class="input" id="if_customer" placeholder="고객사" style="width:100px" value="${esc(ff.customer || '')}">
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
        <div id="syncPathBox" class="sync-path" style="display:none">
          <span class="hint">사내 서버 경로</span>
          <input class="input" id="syncPath" placeholder="예) Z:\ 또는 \\서버이름\공유폴더">
          <button class="btn btn-ghost btn-mini" onclick="App.saveServerPath()">저장</button>
          <span class="hint" id="syncPathState"></span>
        </div>
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
    // 돌아온 경우엔 이전 목록·페이지·스크롤 그대로 복원, 아니면 새로 조회
    if (state.issues.rows && state.issues.rows.length && state.issues.restore) {
      renderIssueList();
      renderActiveFilters();
    } else {
      loadIssues();
    }
    state.issues.restore = false;
    loadServerPath();
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
    const model = modelBoxValue('if_model_box');
    const cust = $('if_customer') ? $('if_customer').value.trim() : '';
    const type = $('if_type') ? $('if_type').value : '';
    const sym = $('if_sym') ? $('if_sym').value : '';
    const tag = $('if_tag') ? $('if_tag').value : '';
    const qs = [model && `model=${encodeURIComponent(model)}`,
                cust && `customer=${encodeURIComponent(cust)}`,
                type && `type=${encodeURIComponent(type)}`,
                sym && `symptom_type=${encodeURIComponent(sym)}`,
                tag && `tag=${encodeURIComponent(tag)}`].filter(Boolean).join('&');
    state.issues.filters = { model, customer: cust, type, sym, tag };   // 조건 기억(복원용)
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
    document.querySelectorAll('#if_model_box .model-extra').forEach(e => e.remove());   // 추가 검색칸 제거
    state.issues.filters = {};
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
    if ($('rawEditBox')) { $('rawEditBox').classList.add('hidden'); $('i_raw').value = ''; }
  }

  // 원문(생 텍스트) 수정 저장 — 서버 출하이슈사항 엑셀의 해당 행도 함께 수정된다.
  async function saveIssueRaw() {
    const id = Number($('i_id').value);
    if (!id) { alert('수정할 이슈를 먼저 목록에서 선택하세요.'); return; }
    const text = $('i_raw').value;
    if (!text.trim()) { alert('내용이 비어 있습니다. 삭제하려면 [삭제] 버튼을 사용하세요.'); return; }
    let r;
    try { r = await api.post('/api/issue/update_raw', { issue_id: id, text }); }
    catch (e) { alert('서버 요청에 실패했습니다. 네트워크를 확인해 주세요.'); return; }
    if (!r || !r.ok) {
      const err = (r && r.error) || '알 수 없는 오류';
      $('issueErr').innerHTML = `<div class="warn-box"><b>⚠ 원문 수정 실패</b>
        <div class="mt8" style="white-space:pre-line">${esc(err)}</div></div>`;
      alert((r && r.locked)
        ? '이 모델의 출하이슈사항 엑셀이 열려 있습니다.\n\n엑셀을 닫은 뒤 다시 [원문 저장]을 눌러 주세요.'
        : '원문 수정 실패\n\n' + err);
      return;
    }
    toast(r.appended
      ? `서버 엑셀에서 기존 행을 찾지 못해 새 행(${r.row}행)으로 기록했습니다.`
      : `서버 출하이슈사항 엑셀 ${r.row}행이 함께 수정되었습니다.`);
    resetIssueForm();
    if ($('issueForm')) $('issueForm').open = false;
    loadIssues();
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
    // 원문 편집칸 — 서버 엑셀에 기록된(또는 자동수집된) 원문을 생 텍스트로 수정
    if ($('rawEditBox')) {
      $('rawEditBox').classList.remove('hidden');
      $('i_raw').value = i.server_export_text || i.raw_text || '';
    }
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
    const isNew = !payload.id;               // 신규 등록만 서버 엑셀에 기록(수정은 원문 편집으로)
    // 저장 전에 서버 엑셀이 열려 있는지 미리 확인 — 열려 있으면 닫으라고 안내하고 중단
    if (isNew) {
      let chk = null;
      try { chk = await api.post('/api/issue/check_excel', { model: payload.model_name, tester_type: payload.tester_type }); }
      catch (e) { /* 확인 실패 — 저장 단계의 기존 오류 처리에 맡김 */ }
      if (chk && chk.locked) {
        $('issueErr').innerHTML = `<div class="warn-box"><b>⚠ 서버 출하이슈사항 엑셀이 열려 있습니다.</b>
          <div class="mt8" style="white-space:pre-line">${esc(chk.error || '')}</div></div>`;
        alert('이 모델의 출하이슈사항 엑셀이 다른 곳에서 열려 있습니다.\n\n' +
              '엑셀을 닫은 뒤 다시 [저장]을 눌러 주세요.\n(닫지 않으면 서버에 기록할 수 없습니다)');
        return;
      }
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

    // 서버(Z:) 출하이슈사항 엑셀에도 기록 — 성공을 확인해야 화면을 넘어간다 (누락 방지)
    const ok = await exportIssueToServer(res.id, isNew);
    if (!ok) { $('i_id').value = res.id; return; }   // 화면 유지 — 수정모드로 재시도 가능

    if (uploaded) toast(`이슈 저장 · 사진 ${uploaded}장 함께 등록됨`);
    resetIssueForm();
    if ($('issueForm')) $('issueForm').open = false;
    loadIssues();
  }

  // 서버 출하이슈사항 기록 + 결과 안내. 실패 시 false (호출부가 화면 전환을 멈춘다).
  // 수정(isNew=false)은 서버 파일의 기존 행을 고치지 않으므로 기록을 건너뛴다.
  async function exportIssueToServer(issueId, isNew) {
    if (!isNew) return true;
    let r;
    try { r = await api.post('/api/issue/export_server', { issue_id: issueId }); }
    catch (e) { r = { ok: false, error: '서버 기록 요청에 실패했습니다. 네트워크를 확인해 주세요.' }; }
    if (r && r.ok) {
      toast(r.already
        ? '서버 출하이슈사항에 같은 내용이 이미 있어 중복 기록하지 않았습니다.'
        : `서버 출하이슈사항에 기록 완료 (${r.row}행${r.photos ? ' · 사진 ' + r.photos + '장' : ''})`);
      return true;
    }
    const err = (r && r.error) || '알 수 없는 오류';
    if ($('issueErr')) $('issueErr').innerHTML =
      `<div class="warn-box"><b>⚠ 서버 출하이슈사항 기록 실패 — 이슈는 프로그램에 저장됐지만 서버 엑셀에는 아직 없습니다.</b>
       <div class="mt8" style="white-space:pre-line">${esc(err)}</div>
       <div class="mt8"><button class="btn btn-primary btn-mini"
         onclick="App.retryIssueExport(${issueId})">↻ 서버 기록 다시 시도</button></div></div>`;
    alert('서버 출하이슈사항 기록에 실패했습니다.\n\n' + err +
          '\n\n이슈는 프로그램에 저장되어 있습니다. 문제를 해결한 뒤 [서버 기록 다시 시도]를 눌러 주세요.');
    return false;
  }

  async function retryIssueExport(issueId) {
    const ok = await exportIssueToServer(issueId, true);
    if (ok) {
      if ($('issueErr')) $('issueErr').textContent = '';
      if ($('i_id')) {             // 이슈관리 화면에서의 재시도 — 폼 닫고 목록 갱신
        resetIssueForm();
        if ($('issueForm')) $('issueForm').open = false;
        loadIssues();
      }
      if ($('quickMsg')) { $('quickMsg').textContent = '✓ 서버 출하이슈사항 기록 완료'; $('quickMsg').style.color = 'var(--accent)'; }
    }
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

  // 서버 경로 상태 표시 (PC마다 드라이브 문자가 다를 수 있어 설정 가능)
  async function loadServerPath() {
    const box = $('syncPathBox');
    if (!box) return null;
    try {
      const p = await api.get('/api/sync/path');
      $('syncPath').value = p.path || '';
      $('syncPathState').innerHTML = p.accessible
        ? `<span style="color:var(--ok)">✓ 연결됨 (${esc(p.customers.join(', '))})</span>`
        : `<span style="color:var(--danger)">✗ 접근 불가 — 경로를 확인하세요</span>`;
      box.style.display = p.accessible ? 'none' : 'flex';   // 정상이면 숨김
      return p;
    } catch (e) { return null; }
  }
  async function saveServerPath() {
    const p = await api.post('/api/sync/path', { path: $('syncPath').value.trim() });
    $('syncPathState').innerHTML = p.accessible
      ? `<span style="color:var(--ok)">✓ 연결됨 (${esc(p.customers.join(', '))})</span>`
      : `<span style="color:var(--danger)">✗ 접근 불가 — 경로를 다시 확인하세요</span>`;
    if (p.accessible) toast('서버 경로를 저장했습니다. 이제 동기화할 수 있습니다.');
  }

  async function syncServer() {
    const p = await loadServerPath();
    if (p && !p.accessible) {
      $('syncPathBox').style.display = 'flex';
      $('syncMsg').innerHTML = '<span style="color:var(--danger)">사내 서버에 접근할 수 없습니다. ' +
        '아래에 올바른 서버 경로를 입력한 뒤 다시 시도하세요.</span>';
      return;
    }
    if (!confirm(`사내 서버(${p ? p.path : ''})의 출하이슈사항을 다시 읽어 최신으로 반영합니다.\n` +
      '몇 분 정도 걸릴 수 있습니다.\n' +
      '(직접 등록한 이슈는 그대로 유지됩니다) 진행할까요?')) return;
    const r = await api.post('/api/sync/start', {});
    if (r && r.started === false) {
      $('syncMsg').textContent = r.reason;
      $('syncPathBox').style.display = 'flex';
      return;
    }
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
      if (s.error) {
        $('syncMsg').innerHTML = '<span style="color:var(--danger)">⚠ '
          + esc(s.error).split('\n').join('<br>') + '</span>';
        if ($('syncPathBox')) $('syncPathBox').style.display = 'flex';
        loadServerPath();
      }
      else if (s.result) { loadIssues(); }
    } catch (e) { $('syncBtn').disabled = false; }
  }

  // ------------------------------------------------------------ 모델 프로필
  async function openModel(name) {
    if (!name) return;
    markReturn('issues');             // "← 이슈 관리" 로 돌아올 때 복원
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
      <div class="card mt16" id="zModelCard">
        <div class="row-between">
          <div><div class="card-title">🗄 사내 서버(Z:) 자료</div>
            <div class="card-sub">출하이슈사항 엑셀 미리보기 · 출하사진 · 인주TEST · 마킹 사진.
              서버 원본을 그대로 불러오며, 파일은 <b>절대 변경되지 않습니다.</b></div></div>
          <button class="btn btn-ghost btn-mini" onclick="App.loadZModel('${jsq(p.name)}')">↻ 새로고침</button>
        </div>
        <div id="zModelBody" class="mt12"><p class="hint">서버 자료를 불러오는 중…</p></div>
      </div>

      <div class="card mt16">
        <div class="row-between"><div class="card-title">이슈 타임라인 (최근 30건)</div>
          <button class="btn btn-ghost btn-mini" onclick="App.openIssuesFor('${esc(p.name).replace(/'/g, "\\'")}')">🔍 이슈 관리에서 검색</button></div>
        <div class="mt12">${issueRows || '<p class="hint">이슈가 없습니다.</p>'}</div>
      </div>`;
    window.scrollTo(0, 0);
    loadZModel(p.name);
  }

  // ---------------------------------------------------------- 모델 프로필 · Z: 서버 자료
  async function loadZModel(model) {
    const body = $('zModelBody');
    if (!body) return;
    body.innerHTML = '<p class="hint">서버 자료를 불러오는 중… (네트워크 드라이브라 몇 초 걸릴 수 있습니다)</p>';
    const a = await api.get(`/api/z/model?model=${encodeURIComponent(model)}`);
    state.zModel = a;
    if (a.error) { body.innerHTML = `<p class="hint">불러오기 실패: ${esc(a.error)}</p>`; return; }
    if (!a.available) { body.innerHTML = `<p class="hint">${esc(a.reason || '')}</p>`; return; }
    const testers = a.testers || [];
    if (!testers.length) {
      body.innerHTML = `<p class="hint">서버에서 <b>${esc(model)}</b>의 출하검증 폴더를 찾지 못했습니다.
        (검색 위치: ${esc(a.root)})</p>`;
      return;
    }
    body.innerHTML = testers.map((t, ti) => `
      <div class="z-tester">
        <div class="row-between">
          <div><b>${esc(t.tester_dir)}</b>
            <span class="hint"> · ${esc(t.customer)} · ${esc(t.tester_type)}</span></div>
          <button class="btn btn-ghost btn-mini" onclick="App.openZPath('${jsq(t.verify_dir)}')">📂 폴더 열기</button>
        </div>
        <div class="mt8" style="display:flex;gap:8px;flex-wrap:wrap">
          ${(t.excels || []).map(x => `
            <button class="btn btn-ghost btn-mini" onclick="App.previewExcel('${jsq(x.path)}')">
              📊 ${esc(x.name)}${x.locked ? ' ⚠열림' : ''}</button>`).join('') ||
          '<span class="hint">출하이슈사항 엑셀이 없습니다.</span>'}
        </div>
        <div class="mt12">
          ${(t.sessions || []).map((s, si) => zSessionHtml(s, `z${ti}_${si}`)).join('') ||
          '<p class="hint">출하사진이 없습니다.</p>'}
        </div>
      </div>`).join('');
  }

  function zSessionHtml(s, gid) {
    const group = (kind, list) => {
      if (!list || !list.length) return '';
      const g = `${gid}_${kind === '마킹' ? 'mk' : kind === '인주TEST' ? 'ink' : 'ship'}`;
      return `<div class="mt8"><div class="ck-group">${kind} · ${list.length}장</div>
        <div class="photo-grid mt8">${list.map((f, i) => `
          <div class="photo-item" data-vw="${g}" data-url="${esc(f.url)}"
               data-name="${esc(f.name)}" data-meta="${esc(s.name)} · ${kind}">
            ${f.video
              ? `<a href="${esc(f.url)}" target="_blank" rel="noopener" class="z-video">🎬 동영상</a>`
              : `<img loading="lazy" src="${esc(f.thumb || f.url)}" alt="${esc(f.name)}"
                    onclick="App.openViewerFrom('${g}',${i})">`}
            <div class="photo-meta"><span>${esc(f.name)}</span></div>
          </div>`).join('')}</div></div>`;
    };
    const g = s.groups || {};
    return `<details class="z-session" ${s.units && s.units.length ? '' : ''}>
      <summary><b>${esc(s.name)}</b>
        <span class="hint"> · 출하사진 ${s.counts['출하사진'] || 0} · 인주TEST ${s.counts['인주TEST'] || 0} · 마킹 ${s.counts['마킹'] || 0}</span>
      </summary>
      ${group('인주TEST', g['인주TEST'])}${group('마킹', g['마킹'])}${group('출하사진', g['출하사진'])}
    </details>`;
  }

  // 출하이슈사항 엑셀 미리보기 — 다운로드 없이 화면에서 바로 표로 본다.
  async function previewExcel(path) {
    openModal('📊 출하이슈사항 미리보기', '<p class="hint">엑셀을 읽는 중…</p>');
    const r = await api.get(`/api/z/excel?path=${encodeURIComponent(path)}`);
    if (r.error) {
      setModalBody(`<div class="warn-box" style="white-space:pre-line">${esc(r.error)}</div>
        <div class="mt12"><button class="btn btn-ghost btn-mini" onclick="App.openZPath('${jsq(path)}')">📂 폴더 열기</button></div>`);
      return;
    }
    const sheets = (r.sheets || []).filter(s => s.rows.length || (s.images || []).length);
    setModalBody(`
      <div class="hint">${esc(r.name)}${r.locked ? ' · ⚠ 현재 다른 사용자가 열어둔 상태(읽기 전용으로 표시)' : ''}</div>
      ${sheets.map((s, si) => xlSheetHtml(s, `xl${si}`)).join('') || '<p class="hint">내용이 없습니다.</p>'}
      <div class="mt16"><button class="btn btn-ghost btn-mini" onclick="App.openZPath('${jsq(path)}')">📂 원본 폴더 열기</button></div>`);
  }

  // 한 시트 = 텍스트 표 + '사진' 열. 사진은 엑셀에 박힌 그대로, 앵커된 행 옆에 붙인다.
  function xlSheetHtml(s, gid) {
    const imgs = s.images || [];
    // 행 index(0-based) → 그 행에 앵커된 이미지들
    const byRow = {};
    imgs.forEach((im, i) => (byRow[im.row] = byRow[im.row] || []).push({ ...im, i }));
    const hasImg = imgs.length > 0;
    const lastRow = s.rows.length - 1;
    // 표 밖(텍스트 마지막 행보다 아래)에 앵커된 사진은 마지막 행에 몰아 보여준다
    const overflow = imgs.filter(im => im.row > lastRow).map(im => ({ ...im, i: imgs.indexOf(im) }));

    const photoCell = (ri) => {
      let list = byRow[ri] || [];
      if (ri === lastRow && overflow.length) list = list.concat(overflow);
      if (!list.length) return '';
      return list.map(im => `
        <div class="xl-photo" data-vw="${gid}" data-url="${esc(im.url)}"
             data-name="출하이슈 사진" data-meta="${esc(s.name)}">
          <img loading="lazy" src="${esc(im.url)}" alt="출하이슈 첨부 사진"
               style="${im.w ? `max-width:${Math.min(im.w, 360)}px` : ''}"
               onclick="App.openViewerFrom('${gid}',${im.i})">
        </div>`).join('');
    };

    return `<div class="mt16"><div class="ck-group">${esc(s.name)}</div>
      <div class="table-wrap mt8"><table class="xl-preview">
        ${s.rows.map((row, ri) => {
          const tag = ri === 0 ? 'th' : 'td';
          const cells = row.map(c => `<${tag}>${esc(c)}</${tag}>`).join('');
          const photo = ri === 0
            ? (hasImg ? '<th class="xl-photo-col">사진</th>' : '')
            : (hasImg ? `<td class="xl-photo-col">${photoCell(ri)}</td>` : '');
          return `<tr>${cells}${photo}</tr>`;
        }).join('')}
      </table></div>
      ${s.truncated ? '<div class="hint mt8">… 이후 행은 생략되었습니다(미리보기 300행).</div>' : ''}
    </div>`;
  }

  // ---------------------------------------------------------- 공용 모달
  function openModal(title, bodyHtml) {
    let m = $('appModal');
    if (!m) {
      m = document.createElement('div');
      m.id = 'appModal';
      m.className = 'modal';
      m.innerHTML = `<div class="modal-box">
        <div class="modal-head"><b id="modalTitle"></b>
          <button class="btn btn-ghost btn-mini" onclick="App.closeModal()">✕</button></div>
        <div class="modal-body" id="modalBody"></div></div>`;
      document.body.appendChild(m);
      m.addEventListener('click', e => { if (e.target === m) closeModal(); });
    }
    $('modalTitle').textContent = title;
    $('modalBody').innerHTML = bodyHtml;
    m.classList.add('on');
    document.body.style.overflow = 'hidden';
  }
  function setModalBody(html) { if ($('modalBody')) $('modalBody').innerHTML = html; }
  function closeModal() {
    const m = $('appModal');
    if (m) m.classList.remove('on');
    document.body.style.overflow = '';
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
    if (!confirm('이 이슈 이력을 삭제할까요?\n(서버 출하이슈사항 엑셀에 기록된 이슈면 그 행도 함께 지워집니다)')) return;
    const res = await api.post('/api/issue/delete', { id });
    if (res && res.error) { alert('삭제 실패\n\n' + res.error); return; }
    if (res && res.excel_removed) toast('서버 출하이슈사항 엑셀의 행도 함께 삭제했습니다.');
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
    state.issues.restore = false;      // 새 검색이므로 이전 상태 복원하지 않음
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

  // ------------------------------------------------------------ 📡 KNK 모니터
  // 바탕화면 KNKMonitor(TinyUK3 결과 수집 / I/O 테스트 / 원격 콘솔)를 이 프로그램에
  // 통합한 화면. 시리얼 포트는 서버(app/monitor)가 쥐고, 브라우저는 짧은 주기로
  // /api/monitor/poll 만 호출한다. 검사기 최대 3대(슬롯 1~3)를 동시에 지원 —
  // 터미널·데이터로거는 슬롯별 분할 보기, 검사 결과·I/O·콘솔·요약 보드는 1번 기준.
  // $Fx/$Bx 16색 팔레트 — KNK터미널과 같은 검은 바탕.
  // 코드별로 실제 로그에서 어디에 쓰이는지: $F1 NG·VSWR 스펙 / $F4 [RF SELECT]·시간
  // $F6 OK·[U100…:IC-F] / $F9 [POWER CHx] / $FD Test START·END / $FF 데이터 줄(기본)
  // 값은 설정 ⚙ → 화면 배색에서 직접 고칠 수 있다.
  const MON_PRESETS = {
    knkt: {   // KNKT.exe 화면을 보고 맞춘 값
      bg: '#0a0e13',
      pal: { '0': '#d8dee9', '1': '#ff5555', '2': '#50fa7b', '3': '#f1fa8c',
             '4': '#ff6e6e', '5': '#ff79c6', '6': '#00d7d7', '7': '#bbbbbb',
             '8': '#808080', '9': '#5ce6e6', 'A': '#a4ffff', 'B': '#d6acff',
             'C': '#ff6e6e', 'D': '#ff92df', 'E': '#ffffa5', 'F': '#ffffff' },
    },
    dark: {   // 이 프로그램의 예전 다크 콘솔 배색
      bg: '#0a0e13',
      pal: { '0': '#d8dee9', '1': '#ff5555', '2': '#50fa7b', '3': '#f1fa8c',
             '4': '#8be9fd', '5': '#ff79c6', '6': '#ffb86c', '7': '#bbbbbb',
             '8': '#69ff94', '9': '#6272a4', 'A': '#a4ffff', 'B': '#d6acff',
             'C': '#ff6e6e', 'D': '#ff92df', 'E': '#ffffa5', 'F': '#ffffff' },
    },
  };
  // 코드별 쓰임새 — 설정 화면의 라벨
  const MON_PAL_USE = {
    '1': 'NG · VSWR 스펙 줄', '4': '[RF SELECT] · Test Lead time',
    '6': 'OK · [U100…:IC-F]', '9': '[POWER CH2/CH3]',
    'D': 'Test START · END 구분선', 'F': '데이터 줄($$R…) · 기본',
  };
  const MON_PAL_KEYS = ['0','1','2','3','4','5','6','7','8','9','A','B','C','D','E','F'];
  const monPal = () => Object.assign({}, MON_PRESETS.knkt.pal, monCfg().palette || {});
  const monScreenBg = () => monCfg().screen_bg || MON_PRESETS.knkt.bg;

  // 설정 화면의 색 미리보기 — 실제 장비 로그 한 토막을 그대로 그린다
  const MON_PAL_SAMPLE = [
    '$FD-------------------- Test START.$FF',
    '$FS$F9[POWER CH2] 0.00V (0.00V)$FR',
    '$F6$FS$FF[$FRU100_5655(G)   $FS$FF:$FRIC-F $FS$FF]$FR 83$FF ($FR83$FF)',
    '$$TU100_5655(G)   =0x83                                           70',
    '$F6- ID CHECK                  : OK (5 / 5)$FF',
    '$FS$F4[RF SELECT] 55G=20,C3 25G=F0 25=78 25C=E1$FR',
    '$F1$FS$FF[$FRP1.M1  450MHz      $FS$FF:$FRVSWR $FS$FF]$FR     4.30$FF<$FR   569.99$FF<$FR     6.30$FF',
    '$$RP1.M1  450MHz  (          4.30 ~          6.30 )=        569.995F',
    '$F1- VSWR 01                   : NG (1 / 1)$FF',
    '$FD-------------------- Test END.$FF',
  ].join('\n');

  // 색코드 해석 → 실제 span 생성 (터미널 화면과 같은 규칙)
  function monRenderColoured(box, text, pal, bg) {
    box.innerHTML = '';
    box.style.background = bg;
    box.style.color = pal['F'];
    const st = { fg: '0', bg: null, bold: false, saved: '0' };
    const emit = (s) => {
      if (!s) return;
      const sp = document.createElement('span');
      sp.textContent = s;
      sp.style.color = pal[st.fg] || pal['0'];
      if (st.bg) sp.style.background = pal[st.bg] || '';
      if (st.bold) sp.style.fontWeight = '700';
      box.appendChild(sp);
    };
    let pos = 0, m;
    MON_TOKEN.lastIndex = 0;
    while ((m = MON_TOKEN.exec(text)) !== null) {
      if (m.index > pos) emit(text.slice(pos, m.index));
      const tok = m[0];
      if (tok === '$$') emit('$');
      else if (tok === '$FR') { st.fg = st.saved || '0'; st.bg = null; st.bold = false; }
      else if (tok === '$FS') { st.saved = st.fg; st.bold = true; }
      else if (tok[1] === 'F') st.fg = tok[2].toUpperCase();
      else if (tok[1] === 'B') { const b = tok[2].toUpperCase(); st.bg = b === '0' ? null : b; }
      pos = m.index + tok.length;
    }
    emit(text.slice(pos));
  }

  function monPalRead() {
    const pal = {};
    MON_PAL_KEYS.forEach(k => {
      const el = $('cfgPal' + k);
      if (el) pal[k] = el.value;
    });
    return pal;
  }
  function monPalPreview() {
    const box = $('cfgPalPrev');
    if (box) monRenderColoured(box, MON_PAL_SAMPLE, monPalRead(), $('cfgBg').value);
  }
  function monPalPreset(name) {
    const p = MON_PRESETS[name] || MON_PRESETS.knkt;
    $('cfgBg').value = p.bg;
    MON_PAL_KEYS.forEach(k => { const el = $('cfgPal' + k); if (el) el.value = p.pal[k]; });
    monPalPreview();
  }
  const MON_COLOUR = /\$F[0-9A-Fa-f]|\$F[SRD]|\$B[0-9A-Fa-f]|\*CLS/g;   // 콘솔용 제거
  const MON_TOKEN = /\*CLS|\$F[SR]|\$F[0-9A-Fa-f]|\$B[0-9A-Fa-f]|\$\$/g; // 화면용 해석
  // 브라우저가 한 번에 그려 두는 조각 수 상한 — 화면 표시 성능용일 뿐,
  // 저장되는 수신 로그에는 상한이 없다(설정의 스크롤백 = 무한대).
  const MON_SCREEN_NODES = 20000;

  function monState() {
    if (!state.mon) {
      const slot = () => ({ seq: 0, runs: [], sel: null, freeze: false, connected: false,
                            fs: 'm',   // 터미널 글씨 크기: s/m/l
                            line: '', hist: [], histPos: 0,   // 화면에 직접 치는 명령 줄
                            scr: { fg: '0', bg: null, bold: false, saved: '0', pending: '' } });
      state.mon = {
        meta: null, tab: 'screen', termMode: 'knk', termSlots: 1, dlSlots: 1, dlSummary: false,
        // 0 = 점검용(I/O 테스트·콘솔 전용) 세션 — 터미널 슬롯 1~3 과 완전히 독립
        slots: { 0: slot(), 1: slot(), 2: slot(), 3: slot() },
        timer: null, busy: false, pollTimer: null, pollCycle: 0,
        autoscroll: true, allowUnsafe: false, connected: false,
        do: null,   // 1번 검사기 마지막 DO 상태 (램프 클릭 토글용)
      };
    }
    return state.mon;
  }

  function stopMonitor() {
    const mon = state.mon;
    if (!mon) return;
    if (mon.timer) { clearInterval(mon.timer); mon.timer = null; }
    if (mon.pollTimer) { clearInterval(mon.pollTimer); mon.pollTimer = null; }
    if (mon.maxed) { mon.maxed = false; document.body.classList.remove('mon-maxed'); }
  }

  function monPortOpts(meta, withDefault) {
    return (meta.ports || []).map(p =>
      `<option value="${esc(p.device)}" ${withDefault && p.device === meta.default_port ? 'selected' : ''}>${esc(p.device)}</option>`).join('')
      || '<option value="">포트 없음</option>';
  }

  async function renderMonitor() {
    const mon = monState();
    let meta;
    try { meta = await api.get('/api/monitor/state'); }
    catch (e) { return; }
    mon.meta = meta;
    // 터미널 설정(⚙) — 서버 저장본을 기준으로, 없으면 KNK터미널 기본값
    mon.settings = Object.assign({}, MON_DEFAULTS, meta.settings || {});

    const baudOpts = (meta.bauds || []).map(b =>
      `<option value="${b}" ${b === meta.default_baud ? 'selected' : ''}>${b}</option>`).join('');

    const diRows = (meta.di_labels || []).map((n, i) => `
      <div class="lamp-row"><span class="lamp-name">${esc(n)}</span>
        <span class="lamp" id="mDI${i}" onclick="App.monQuickCmd('DI')" title="클릭 = 재조회">----</span></div>`).join('');
    const doRows = (meta.do_labels || []).map((n, i) => `
      <div class="lamp-row"><span class="lamp-name">${esc(n)}</span>
        <span class="lamp click" id="mDO${i}" onclick="App.monDoClick(${i})" title="클릭 = HIGH/LOW 토글">----</span></div>`).join('');

    const safeBtns = (meta.safe_commands || []).map(c =>
      `<button class="btn btn-mini" title="${esc(c.tip)}" onclick="App.monQuickCmd('${jsq(c.cmd)}')">${esc(c.cmd)}</button>`).join('');
    const unsafeBtns = (meta.unsafe_commands || []).map(c =>
      `<button class="btn btn-mini" data-unsafe disabled title="${esc(c.tip)}"
         onclick="App.monUnsafeCmd('${jsq(c.cmd)}','${jsq(c.tip)}')">${esc(c.cmd)}</button>`).join('');

    // 터미널 슬롯 — 슬롯마다 개별 포트/연결 (1번은 상단 연결 바와 자동 동기화)
    const termSlot = (i) => `
      <div class="mon-slot ${i > mon.termSlots ? 'hidden' : ''}" data-slot="${i}" id="mTSlot${i}">
        <button class="mon-swap-fab ${i < mon.termSlots ? '' : 'hidden'}" id="mTSwap${i}"
          onclick="App.monSwap(${i}, ${i + 1})"
          title="${i}번 ↔ ${i + 1}번 통째로 교환 — 연결 COM포트·터미널 화면·검사결과가 함께 바뀝니다">⇄</button>
        <div class="mon-slot-head">
          <span class="mon-dot" id="mSDot${i}"></span><b>${i}번 검사기</b>
          <select class="input" id="mSPort${i}" style="width:96px">${monPortOpts(meta, i === 1)}</select>
          <select class="input" id="mSBaud${i}" style="width:92px">${baudOpts}</select>
          <button class="btn btn-mini btn-primary" id="mSConn${i}" onclick="App.monToggleConn(${i}, true)">연결</button>
          <button class="btn btn-mini mon-auto hidden" id="mAuto${i}"
            onclick="App.monAutoClick(${i})" ondblclick="App.monAutoConfig(${i})"
            title="클릭 = 반자동 시작 ON/OFF · 더블클릭 = 설정">⚡ 반자동</button>
          <span style="flex:1"></span>
          <select class="input mon-fs" id="mSFs${i}" title="터미널 글씨 크기"
            onchange="App.monFontSize(${i}, this.value)">
            <option value="s">글씨 작게</option>
            <option value="m" selected>글씨 중간</option>
            <option value="l">글씨 크게</option>
          </select>
          <label class="mon-check"><input type="checkbox" onchange="App.monFreeze(${i}, this.checked)"> 일시정지</label>
          <button class="btn btn-mini" onclick="App.monSaveScreen(${i})"
            title="이 슬롯이 장비에서 받은 내용 + 불러온 로그 파일 전부를 바탕화면에 .txt 로 저장">💾 저장</button>
          <button class="btn btn-mini" onclick="App.monScreenClear(${i})">지우기</button>
        </div>
        <div class="mon-cnt" id="mCnt${i}"><span class="mc-dim">검사 결과 없음</span></div>
        <div class="mon-screen fs-m" id="mScreen${i}" tabindex="0"
          title="화면을 클릭하고 명령을 입력하세요 · Enter = 전송"></div>
      </div>`;

    // 데이터로거 슬롯 — 각자 미니 통계·불러오기·CSV·지우기
    const dlSlot = (i) => `
      <div class="mon-slot ${i > mon.dlSlots ? 'hidden' : ''}" data-slot="${i}" id="mDSlot${i}">
        <button class="mon-swap-fab ${i < mon.dlSlots ? '' : 'hidden'}" id="mDSwap${i}"
          onclick="App.monSwap(${i}, ${i + 1})"
          title="${i}번 ↔ ${i + 1}번 통째로 교환 — 연결 COM포트·터미널 화면·검사결과가 함께 바뀝니다">⇄</button>
        <div class="mon-slot-head">
          <b>${i}번 검사기</b>
          <span style="flex:1"></span>
          <label class="btn btn-mini" style="display:inline-flex;align-items:center">📂 불러오기
            <input type="file" hidden multiple accept=".log,.txt" onchange="App.monImportFiles(this, ${i})"></label>
          <button class="btn btn-mini" onclick="App.monDlExport(${i})">⬇ CSV</button>
          <button class="btn btn-mini btn-ghost" onclick="App.monClear(${i})">지우기</button>
        </div>
        <div class="mon-slot-stats" id="mDStats${i}"><span class="ms-dim">데이터 없음</span></div>
        <div class="table-wrap mon-tbl" style="max-height:520px">
          <table class="meas mon-dl" id="mDlTable${i}"></table>
        </div>
      </div>`;

    view().innerHTML = `
      <div class="row-between mt8">
        <h2 style="font-size:22px">📡 KNK 모니터
          <span class="hint" style="font-weight:600">· TinyUK3 결과 수집 / I/O 테스트 / 원격 콘솔</span></h2>
      </div>
      ${meta.serial_available ? '' : `<div class="demo-banner mt12"><b>pyserial 미설치</b> —
        장비 연결 기능이 꺼져 있습니다. 로그 파일 불러오기·CSV 내보내기는 그대로 사용할 수 있습니다.</div>`}
      ${(meta.slots && meta.slots[0] !== undefined) ? '' : `<div class="demo-banner mt12">
        <b>⚠ 서버가 이전 버전으로 실행 중입니다</b> — 최신 기능(점검용 연결 분리 등)이 동작하지 않습니다.
        <b>종료하기.bat</b> 실행 후 <b>실행하기.bat</b>로 다시 시작해 주세요.</div>`}

      <div class="mon-tabs">
        <button class="mon-tab" data-mtab="screen" onclick="App.monTab('screen')">터미널</button>
        <button class="mon-tab" data-mtab="io" onclick="App.monTab('io')">I/O 테스트</button>
        <button class="mon-tab" data-mtab="console" onclick="App.monTab('console')">콘솔</button>
      </div>

      <!-- ══ I/O 테스트 (점검용 연결 — 터미널 슬롯과 완전 독립) ══ -->
      <div id="mPane_io" class="hidden">
        <div class="card mt12">
          <div class="row-between">
            <div>
              <div class="card-title">I/O 테스트</div>
              <div class="card-sub">장비의 "5.I/O Test" 서비스 메뉴를 미러링합니다. 아래 <b>점검용 연결</b>은
                터미널 슬롯과 완전히 별개라 서로 영향을 주지 않습니다. 출력 제어는 '⚠ 장비 동작 명령 허용'이 필요합니다.</div>
            </div>
            <span class="hint" id="mIoInfo" style="font-family:var(--mono)">장비 시각: -&nbsp;&nbsp;|&nbsp;&nbsp;카운터: -</span>
          </div>
          <div class="mon-conn mt16">
            <span class="mon-dot" id="mDot"></span>
            <label><b>점검용 연결</b></label>
            <label>포트</label><select class="input" id="mPort" style="width:110px">${monPortOpts(meta, true)}</select>
            <label>속도</label><select class="input" id="mBaud" style="width:104px">${baudOpts}</select>
            <button class="btn" onclick="App.monRefreshPorts()">새로고침</button>
            <button class="btn btn-primary" id="mConnBtn" onclick="App.monToggleConn(0)">연결</button>
            <span class="hint" id="mStatus" style="font-family:var(--mono)">연결되지 않음</span>
            <span style="flex:1"></span>
            <label class="mon-unsafe" title="DO/GPIO/START 등 하드웨어를 실제로 움직이는 버튼을 활성화합니다">
              <input type="checkbox" id="mUnsafe" onchange="App.monUnsafeToggle(this)"> ⚠ 장비 동작 명령 허용</label>
          </div>
          <div class="mon-conn mt12">
            <label class="mon-check"><input type="checkbox" id="mAutoPoll" onchange="App.monPollToggle(this)"> 자동 조회 (DI→DO 순환)</label>
            <label>주기</label>
            <select class="input" id="mPollIv" style="width:78px" onchange="App.monPollToggle($('mAutoPoll'))">
              <option>0.5</option><option selected>1.0</option><option>2.0</option></select>
            <span class="hint">초</span>
            <span class="mon-sep"></span>
            ${['DI', 'DO', 'SET COUNTER'].map(c =>
              `<button class="btn btn-mini" onclick="App.monQuickCmd('${c}')">${c} 조회</button>`).join('')}
            <span class="mon-sep"></span>
            <button class="btn btn-mini" onclick="App.monSyncTime()">시간 동기화 (PC→장비)</button>
            <button class="btn btn-mini" onclick="App.monResetCounter()">카운터 초기화</button>
            <span class="mon-sep"></span>
            <label class="mon-check" title="끄면(기본) DI/DO 조회·프롬프트 라인을 터미널·저장 로그에서 숨깁니다. 램프 갱신은 그대로 동작합니다.">
              <input type="checkbox" id="mIoVerbose" ${meta.io_quiet ? '' : 'checked'}
                onchange="App.monIoVerbose(this.checked)"> I/O 조회 원문 표시</label>
          </div>
        </div>
        <div class="mon-io mt12">
          <div class="card">
            <div class="card-title">DI · 디지털 입력</div>
            <div class="card-sub">CH01-08 + 전면 키 — 클릭 = 재조회</div>
            <div class="lamp-grid mt16">${diRows}</div>
          </div>
          <div class="card">
            <div class="card-title">DO · 디지털 출력</div>
            <div class="card-sub">램프 클릭 = HIGH/LOW 토글 · CH01 MAIN Sol / CH02 VACUUM / CH03 MARKING Sol</div>
            <div class="lamp-grid mt16">${doRows}</div>
            <div class="mon-note" id="mDoAux">보조 상태 [----]</div>
          </div>
          <div class="card">
            <div class="card-title">▶ 검사 시작 시퀀스</div>
            <div class="card-sub">메인 실린더 동작 → 제품 인식/진공 자동 → START 명령</div>
            <div class="mon-form mt16">
              <label>메인 실린더 CH</label>
              <input class="input" id="mStartCh" type="number" min="1" max="16" value="1">
              <label>동작 레벨</label>
              <select class="input" id="mStartLv"><option selected>LOW</option><option>HIGH</option></select>
              <label>진공 대기 (초)</label>
              <input class="input" id="mStartSettle" type="number" min="0.5" max="10" step="0.5" value="2.0">
            </div>
            <div style="display:flex;gap:8px;margin-top:16px">
              <button class="btn btn-accent" data-unsafe disabled onclick="App.monStart()" style="flex:1">▶ 검사 시작</button>
              <button class="btn" data-unsafe disabled onclick="App.monAbort()" style="flex:1">■ 검사 중단</button>
            </div>
            <div class="mon-note">※ 두성테크 DS FW는 START 유지 방식 별도 — 추후 적용</div>
          </div>
        </div>
      </div>

      <!-- ══ 터미널 (KNK터미널 ↔ PBA 데이터로거 · 최대 3분할) ══ -->
      <div id="mPane_screen" class="hidden">
        <div class="card mt12" id="mTermCard">
          <div class="row-between">
            <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
              <div class="card-title">터미널</div>
              <button class="btn btn-mini" onclick="App.monSyncTimeAll()"
                title="연결된 모든 검사기의 RTC를 PC 시간으로 설정합니다">🕐 전체 시간 설정</button>
              <button class="btn btn-mini" onclick="App.monResetCounterAll()"
                title="연결된 모든 검사기의 OK/NG/TOTAL 카운터를 0으로 초기화합니다">↺ 전체 카운터 초기화</button>
            </div>
            <div class="mon-actions">
              <div class="mon-seg">
                <button id="mSegKnk" class="on" onclick="App.monTermMode('knk')">KNK터미널</button>
                <button id="mSegDl" onclick="App.monTermMode('dl')">PBA 데이터로거</button>
              </div>
              <button class="btn btn-mini" onclick="App.monSettings()"
                title="터미널 전체 설정 (KNK터미널 Configuration 과 같은 구성)">⚙ 설정</button>
              <button class="btn btn-mini" id="mMaxBtn" onclick="App.monMax()" title="창에 가득 채우기 (Esc = 축소)">⛶ 확장</button>
            </div>
          </div>
          <div id="mScrKnk">
            <div class="row-between mt12">
              <div class="mon-seg mon-seg-sm">
                ${[1, 2, 3].map(n => `<button id="mTSlots${n}" class="${mon.termSlots === n ? 'on' : ''}"
                  onclick="App.monTermSlots(${n})">${n}분할</button>`).join('')}
              </div>
              <span class="hint">화면을 클릭하고 바로 명령을 입력하세요 · <b>Enter</b> 전송 ·
                <b>↑ ↓</b> 이전 명령 · 슬롯마다 포트·저장·지우기 개별 제어</span>
            </div>
            <div class="mon-slots mt8 cols${mon.termSlots}" id="mTermSlots">
              ${[1, 2, 3].map(termSlot).join('')}
            </div>
          </div>
          <div id="mScrDl" class="hidden">
            <div class="row-between mt12">
              <div class="mon-seg mon-seg-sm">
                ${[1, 2, 3].map(n => `<button id="mDSlots${n}" class="${mon.dlSlots === n ? 'on' : ''}"
                  onclick="App.monDlSlots(${n})">${n}분할</button>`).join('')}
              </div>
              <div style="display:flex;align-items:center;gap:10px">
                <button class="btn btn-mini ${mon.dlSummary ? 'btn-primary' : ''}" id="mDlSumBtn"
                  onclick="App.monDlSummaryToggle()"
                  title="PBA 데이터로거처럼 표 맨 아래에 항목별 AVG·MIN·MAX·Peak-peak·CPK 요약을 표시">📊 VIEW SUMMARY</button>
                <span class="hint">2분할 이상이면 아래에 '검사기 간 비교' 표가 자동 표시됩니다</span>
              </div>
            </div>
            <div id="mDlCompare" class="hidden mt8"></div>
            <div class="mon-slots mt8 cols${mon.dlSlots}" id="mDlSlotsBox">
              ${[1, 2, 3].map(dlSlot).join('')}
            </div>
          </div>
        </div>
      </div>

      <!-- ══ 콘솔 (1번 검사기) ══ -->
      <div id="mPane_console" class="hidden">
        <div class="card mt12">
          <div class="row-between">
            <div>
              <div class="card-title">원격 콘솔 <span class="hint" style="font-weight:400">· 점검용 연결 사용</span></div>
              <div class="card-sub">TinyUK3 콘솔 명령을 직접 보냅니다 — 연결은 I/O 테스트 탭의 '점검용 연결'에서.
                동작 명령은 '⚠ 장비 동작 명령 허용'을 켜야 전송됩니다.</div>
            </div>
            <label class="mon-check"><input type="checkbox" checked onchange="App.monAutoscroll(this.checked)"> 자동 스크롤</label>
          </div>
          <div class="mon-quick mt16"><span class="mon-grp">조회 (안전)</span>${safeBtns}</div>
          <div class="mon-quick mt8"><span class="mon-grp">동작 명령</span>${unsafeBtns}</div>
          <div class="mon-term mt16" id="mTerm"></div>
          <div class="mon-cmd">
            <input class="input" id="mCmd" placeholder="TinyUK3 콘솔 명령 (Enter = 전송)" autocomplete="off" style="font-family:var(--mono)">
            <button class="btn btn-primary" onclick="App.monSendTyped()">전송</button>
          </div>
        </div>
      </div>`;

    $('mCmd').addEventListener('keydown', e => { if (e.key === 'Enter') monSendTyped(); });
    $('mUnsafe').checked = mon.allowUnsafe;
    monSyncUnsafe();
    monHookDnD();                 // .log/.txt 드래그앤드랍 (KNKT·PBA DataLogger 와 동일)
    monTermMode(mon.termMode || 'knk');
    monTab(mon.tab || 'screen');
    monHookInput();               // 화면에 직접 타이핑 (KNK터미널과 동일)
    monApplyScreenTheme();        // 화면 배색
    [1, 2, 3].forEach(monSlotCount);   // 슬롯 상단 총/OK/NG 카운터
    // ⚡ 반자동 버튼 — 한 번 꺼내 두면 계속 보이게(Ctrl+C 5연타로 숨김)
    let shown = false;
    try { shown = localStorage.getItem('knk_auto_btn') === '1'; } catch (e) { /* 무시 */ }
    monAutoVisible(shown, false);
    [1, 2, 3].forEach(monAutoPaint);
    [1, 2, 3].forEach(k => monFontSize(k, mon.slots[k].fs || 'm'));   // 글씨 크기 복원

    // 슬롯별 수집 상태 복원(다른 화면을 다녀와도 서버가 유지)
    [0, 1, 2, 3].forEach(k => { mon.slots[k].seq = 0; mon.slots[k].runs = []; mon.slots[k].sel = null; });
    stopMonitor();
    mon.timer = setInterval(monPoll, 700);
    monPoll();
  }

  function monTab(name) {
    const mon = monState();
    if (!['io', 'screen', 'console'].includes(name)) name = 'screen';
    mon.tab = name;
    ['io', 'screen', 'console'].forEach(t => {
      const p = $('mPane_' + t);
      if (p) p.classList.toggle('hidden', t !== name);
    });
    document.querySelectorAll('.mon-tab').forEach(b =>
      b.classList.toggle('on', b.dataset.mtab === name));
    if (name === 'screen' && mon.termMode === 'dl') monDlRender();
  }

  // 터미널 탭 내부 보기 전환 — KNK터미널(컬러 화면) ↔ PBA 데이터로거(측정 표).
  // 같은 수신 스트림을 쓰므로, 도중에 전환해도 지금까지의 내용이 즉시 반영된다.
  function monTermMode(m) {
    const mon = monState();
    mon.termMode = m;
    if ($('mScrKnk')) $('mScrKnk').classList.toggle('hidden', m !== 'knk');
    if ($('mScrDl')) $('mScrDl').classList.toggle('hidden', m !== 'dl');
    if ($('mSegKnk')) $('mSegKnk').classList.toggle('on', m === 'knk');
    if ($('mSegDl')) $('mSegDl').classList.toggle('on', m === 'dl');
    if (m === 'dl') monDlRender();        // 터미널 내용 → 표로 즉시 변환
  }

  // 터미널 글씨 크기 — 설정(⚙)의 Font Size(pt)를 기준으로 슬롯별 3단계 가감
  const MON_FS_DELTA = { s: -2, m: 0, l: 3 };
  const monFontPx = (step) =>
    Math.max(9, Math.round((monCfg().font_size || 10) * 1.35) + (MON_FS_DELTA[step] || 0));

  function monFontSize(slot, v) {
    const mon = monState();
    mon.slots[slot].fs = v;
    const scr = $('mScreen' + slot);
    if (scr) {
      scr.classList.remove('fs-s', 'fs-m', 'fs-l');
      scr.classList.add('fs-' + v);
      scr.style.fontSize = monFontPx(v) + 'px';
    }
    const sel = $('mSFs' + slot);
    if (sel && sel.value !== v) sel.value = v;
  }

  function monApplyFont() {   // 설정에서 Font Size 를 바꿨을 때 전 화면에 반영
    const mon = monState();
    [1, 2, 3].forEach(k => monFontSize(k, mon.slots[k].fs || 'm'));
    const t = $('mTerm');
    if (t) t.style.fontSize = monFontPx('m') + 'px';
  }

  // ---------------------------------------------------------- ⚙ 터미널 설정
  // KNK터미널(KNKT.exe)의 Configuration 창을 그대로 옮긴 전체 설정.
  // 값은 서버(app/monitor/manager.py)에 저장되어 프로그램을 다시 켜도 유지된다.
  const MON_DEFAULTS = {
    comm_type: 'serial', port: 'COM5', baud: 115200,
    databits: 8, parity: 'none', stopbits: 1, flow: 'none',
    ip: '127.0.0.1', net_port: 20000,
    scrollback: 0, local_echo: false, rx_newline: 'lf', tx_newline: 'crlf',
    hex2bin: true, use_download_menu: false, loader_pw: '',
    remove_color: false, font_size: 10,
    screen_bg: '#0a0e13', palette: null,   // null = MON_PRESETS.knkt 사용
    auto_src: 'do', auto_ch: 2, auto_active: 'low', auto_delay: 1.0,
    auto_steps: [{ cmd: 'START', wait: 0 }],
  };
  const MON_BAUDS = [9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600];

  function monCfg() {
    const mon = monState();
    if (!mon.settings) mon.settings = Object.assign({}, MON_DEFAULTS);
    return mon.settings;
  }

  // 초보자용 도움말 — 각 항목 오른쪽 '?' 버튼에서 열린다.
  const MON_HELP = {
    comm_type: { t: '통신 방식 (Communication Type)', b: `
      <p><b>검사기와 PC를 무엇으로 연결하는지</b> 고르는 항목입니다.</p>
      <ul><li><b>Serial</b> — USB/RS-232 케이블로 연결. 검사기는 거의 다 이 방식입니다.</li>
      <li><b>UDP / TCP</b> — 랜선(이더넷)으로 연결하는 방식.</li></ul>
      <p class="hp-tip">기본값 <b>Serial</b>. 이 프로그램은 현재 Serial 연결만 지원합니다
      (UDP/TCP 를 고르면 연결 버튼이 안내 메시지를 냅니다).</p>` },
    port: { t: 'COM 포트 (COM port)', b: `
      <p>PC에 검사기가 <b>몇 번 포트로 잡혀 있는지</b>입니다. USB 케이블을 꽂으면
      윈도우가 COM3, COM5 처럼 번호를 붙여 줍니다.</p>
      <p class="hp-tip">모르겠으면: 케이블을 뽑았다 꽂고 <b>목록 새로고침</b> → 새로 생긴 번호가 검사기입니다.
      여기 값은 <b>기본 포트</b>이고, 실제 연결은 각 슬롯(1~3번 검사기)에서 고른 포트를 씁니다.</p>` },
    baud: { t: '통신 속도 (Baud rate)', b: `
      <p>1초에 몇 비트를 주고받을지 정합니다. <b>장비에 설정된 값과 똑같아야</b> 합니다.</p>
      <p>다르면 연결은 되는데 <b>글자가 깨져서(￦?■) 보입니다.</b></p>
      <p class="hp-tip">기본값 <b>115200</b> — KNK 검사기(TinyUK3)의 표준값입니다. 특별한 이유가 없으면 바꾸지 마세요.</p>` },
    databits: { t: '데이터 비트 (Data bits)', b: `
      <p>글자 하나를 <b>몇 비트로 보낼지</b> 정합니다. 요즘 장비는 사실상 8 고정입니다.</p>
      <p class="hp-tip">기본값 <b>8</b>. (4비트는 윈도우 드라이버가 지원하지 않아 선택할 수 없습니다.)</p>` },
    parity: { t: '패리티 (Parity)', b: `
      <p>전송 중 오류가 났는지 <b>검사용으로 1비트를 더 붙일지</b> 정합니다.</p>
      <p>None = 안 붙임 / Odd·Even = 1의 개수를 홀수·짝수로 맞춤 / Mark·Space = 항상 1·0 고정.</p>
      <p class="hp-tip">기본값 <b>None</b>. 장비 설명서에 따로 적혀 있지 않으면 그대로 두세요.</p>` },
    stopbits: { t: '정지 비트 (Stop bits)', b: `
      <p>글자 하나가 <b>끝났다는 표시</b>를 몇 비트로 줄지 정합니다.</p>
      <p class="hp-tip">기본값 <b>1</b>. 아주 오래된 장비에서만 2를 씁니다.</p>` },
    flow: { t: '흐름 제어 (Flow Control)', b: `
      <p>받는 쪽이 바쁠 때 <b>"잠깐 멈춰"라고 신호를 주는 방식</b>입니다.</p>
      <ul><li><b>NONE</b> — 안 씀 (기본)</li>
      <li><b>RTS/CTS</b> — 케이블의 별도 선으로 신호 (하드웨어 방식)</li>
      <li><b>XON/XOFF</b> — 특수문자를 데이터에 섞어 신호 (소프트웨어 방식)</li></ul>
      <p class="hp-tip">기본값 <b>NONE</b>. 로그가 중간중간 빠져 보일 때만 장비 설정에 맞춰 바꿉니다.</p>` },
    ip: { t: 'IP 주소 (IP Address)', b: `
      <p>통신 방식이 <b>UDP/TCP</b>일 때 접속할 장비의 주소입니다. Serial 이면 쓰이지 않습니다.</p>
      <p class="hp-tip">기본값 <b>127.0.0.1</b> — '내 PC 자신'을 뜻하는 주소로, 사실상 미사용 상태를 의미합니다.</p>` },
    net_port: { t: '포트 번호 (Port)', b: `
      <p>UDP/TCP 로 연결할 때 <b>장비가 열어 둔 통로 번호</b>입니다. COM 포트와는 전혀 다른 개념입니다.</p>
      <p class="hp-tip">기본값 <b>20000</b>.</p>` },
    scrollback: { t: '스크롤백 (Scroll Back Row Buffers)', b: `
      <p>원래 KNK터미널에서는 <b>화면에 몇 줄까지 남겨 둘지</b>(기본 30000행) 정하는 값이었습니다.
      그 줄 수를 넘으면 오래된 로그부터 지워져서, 긴 반복성 시험은 앞부분이 잘렸습니다.</p>
      <p><b>이 프로그램은 상한이 없습니다(무한대).</b> 수신 내용을 메모리가 아니라 파일에 그대로
      기록하기 때문에, 몇 시간을 돌려도 <b>💾 저장</b>을 누르면 처음부터 끝까지 다 나옵니다.</p>
      <p class="hp-tip">화면(브라우저)에는 속도를 위해 최근 분량만 그려 두지만, <b>저장되는 로그는 전부 보존</b>됩니다.</p>` },
    local_echo: { t: '로컬 에코 (Local Echo)', b: `
      <p>Enter 로 보낸 명령을 <b>이 프로그램이 화면에 한 번 더 찍을지</b>입니다.</p>
      <p>KNK 검사기는 받은 명령을 <b>그대로 되돌려 주기 때문에</b>, 켜면 같은 줄이 두 번 보입니다.</p>
      <p class="hp-tip">기본값 <b>해제</b> (KNK터미널과 동일). 명령을 보냈는데 화면에 아무것도 안 남는
      장비를 쓸 때만 켜세요. 타이핑하는 중에는 커서 줄에 그대로 보이므로 꺼 둬도 불편하지 않습니다.</p>` },
    rx_newline: { t: '수신 줄바꿈 (Receive New Line)', b: `
      <p>장비가 보낸 데이터에서 <b>어떤 문자를 "줄 바꿈"으로 볼지</b> 정합니다.</p>
      <p>안 맞으면 로그가 <b>한 줄로 쭉 붙거나</b>, 반대로 <b>빈 줄이 한 줄씩 더</b> 생깁니다.</p>
      <p class="hp-tip">기본값 <b>LF</b>. KNK 검사기 로그는 LF 로 줄을 바꿉니다.</p>` },
    tx_newline: { t: '송신 줄바꿈 (Transmit New Line)', b: `
      <p>Enter 를 눌렀을 때 명령 <b>끝에 붙여 보낼 엔터 문자</b>입니다. 장비는 이 문자를 봐야
      "명령이 끝났다"고 인식하고 응답을 돌려줍니다.</p>
      <p class="hp-tip">KNK터미널 설정 파일에는 LF 로 되어 있지만, <b>TinyUK3 장비는 CR+LF 라야 응답</b>합니다
      (KNK터미널도 빠른명령 문자열에 <span class="hp-mono">\\r\\n</span>을 직접 붙여 씁니다).
      그래서 이 프로그램의 기본값은 <b>CR+LF</b>입니다. 엔터를 쳐도 장비가 조용하면 여기부터 확인하세요.</p>` },
    hex2bin: { t: 'HEX → BIN 자동 변환', b: `
      <p>펌웨어 파일을 불러올 때, 컴파일러가 만든 <b>.hex 파일을 자동으로 .bin 으로 바꿔</b> 주는 기능입니다.</p>
      <p class="hp-tip">기본값 <b>켜짐</b>. 펌웨어를 직접 굽지 않는 품질 업무에서는 신경 쓸 일이 없습니다.</p>` },
    use_download_menu: { t: '다운로드 메뉴 사용', b: `
      <p>장비에 <b>펌웨어를 내려보내는 메뉴</b>를 화면에 띄울지 정합니다.</p>
      <p class="hp-tip">기본값 <b>해제</b> — 꺼 두면 실수로 장비 펌웨어를 덮어쓰는 사고를 막을 수 있습니다.
      실제 펌웨어 굽기는 KNKT.exe 로 하세요(이 프로그램은 다운로드를 지원하지 않습니다).</p>` },
    loader_pw: { t: '부트로더 암호 (Loader Password)', b: `
      <p>펌웨어 다운로드 모드로 들어갈 때 장비가 <b>암호를 요구하는 경우</b>에만 입력합니다.</p>
      <p class="hp-tip">기본값 <b>비어 있음</b>. 요구하지 않는 장비에서는 비워 두세요.</p>` },
    remove_color: { t: '색상코드 제거 (Remove color code)', b: `
      <p>장비 로그에는 글자색을 지정하는 <span class="hp-mono">$F6 $FF $$R</span> 같은 <b>제어 문자</b>가 섞여 옵니다.</p>
      <p><b>해제(기본)</b> — 화면이 KNK터미널처럼 컬러로 나오고, 저장 로그에도 원문이 그대로 남습니다.<br>
      <b>체크</b> — 색이 사라지는 대신 <b>글자만 깔끔하게</b> 남아 엑셀·메모장에서 보기 좋습니다.</p>
      <p class="hp-tip">저장한 로그를 다시 이 프로그램으로 불러와 분석할 계획이면 <b>해제 상태를 권장</b>합니다.</p>` },
    palette: { t: '화면 배색 ($F0~$FF 16색)', b: `
      <p>장비는 글자색을 <span class="hp-mono">$F1 $F6 $F9</span> 같은 <b>번호</b>로 보냅니다.
      그 번호를 어떤 색으로 그릴지 여기서 직접 정합니다 — <b>KNK터미널 화면과 나란히 놓고
      다른 색만 눌러 맞추면</b> 똑같아집니다.</p>
      <p>로그에서 각 번호가 쓰이는 곳:</p>
      <table class="hp-tbl">
        <tr><td class="hp-mono">$F1</td><td>NG 판정 · VSWR 스펙 줄</td></tr>
        <tr><td class="hp-mono">$F4</td><td>[RF SELECT] · Test Lead time</td></tr>
        <tr><td class="hp-mono">$F6</td><td>OK 판정 · [U100_5655(G) : IC-F]</td></tr>
        <tr><td class="hp-mono">$F9</td><td>[POWER CH2] [POWER CH3]</td></tr>
        <tr><td class="hp-mono">$FD</td><td>Test START · Test END 구분선</td></tr>
        <tr><td class="hp-mono">$FF</td><td>데이터 줄($$R…) 등 기본 글자색</td></tr>
      </table>
      <p class="hp-tip">아래 <b>미리보기</b>는 실제 장비 로그를 지금 색으로 그린 것입니다.
      색을 바꾸면 <b>이미 화면에 찍혀 있는 로그까지</b> 함께 다시 칠해집니다.
      저장되는 파일 내용은 배색과 무관하게 원문 그대로입니다.</p>` },
    font_size: { t: '글꼴 크기 (Font Size)', b: `
      <p>터미널 화면 글씨 크기(pt)입니다. 여기서 바꾸면 <b>1·2·3번 검사기 화면과 콘솔 전체</b>에 적용됩니다.</p>
      <p class="hp-tip">기본값 <b>10pt</b>. 슬롯마다 있는 '글씨 작게/중간/크게'는 이 값을 기준으로 한 단계씩 가감합니다.</p>` },
    auto: { t: '⚡ 반자동 시작', b: `
      <p><b>제품을 지그에 올리기만 하면 검사가 시작</b>되게 하는 기능입니다.
      START 를 사람이 누르지 않아도 됩니다.</p>
      <p>동작 순서 — ① 제품 안착 → 오토베큠 작동 → ② 프로그램이 진공 신호를 감지 →
      ③ 설정한 시간(기본 1초) 대기 → ④ 시작 순서대로 명령 전송(기본
      <span class="hp-mono">START</span> 하나)</p>
      <p><b>버튼 사용법</b> — 터미널 슬롯의 <b>⚡ 반자동</b> 버튼:
      <b>클릭</b> = 켜기/끄기(켜지면 노란색), <b>더블클릭</b> = 감지 채널·지연·시작 순서 설정 창.<br>
      버튼 표시 <span class="hp-mono">Ctrl+Alt+A</span> 5연타 ·
      숨김 <span class="hp-mono">Ctrl+Alt+X</span> 5연타</p>
      <ul><li><b>진공 신호 / 채널</b> — 진공 상태를 어느 입출력에서 읽을지.
        오토베큠은 보통 <b>DO CH02(VACUUM)</b> 입니다.</li>
      <li><b>진공 ON 레벨</b> — 진공이 잡혔을 때 그 채널이 LOW 인지 HIGH 인지.
        <b>I/O 테스트 탭에서 제품을 올렸다 내렸다 하며 어느 램프가 바뀌는지 보고</b> 맞추세요.</li>
      <li><b>시작 지연</b> — 진공이 안정될 시간. 너무 짧으면 'Vacuum is OFF' 로 실패합니다.</li></ul>
      <p class="hp-tip">⚠ 안전 — 켜는 순간 확인 창이 한 번 뜨고, 그 뒤로는 <b>제품이 올라올 때마다
      지그가 사람 조작 없이 동작</b>합니다. 검사가 끝나면 <b>제품을 한 번 빼야</b> 다음 검사가 시작되므로
      같은 제품을 두 번 돌리지 않습니다. 포트 연결을 끊거나 버튼을 다시 누르면 즉시 해제됩니다.</p>` },
    cmds: { t: '명령 입력 방법 · #명령 대조표', b: `
      <p><b>터미널 화면을 클릭하고 그냥 타이핑</b>하면 됩니다. KNK터미널과 똑같습니다.</p>
      <ul><li><b>Enter</b> — 친 줄을 장비로 보냅니다</li>
      <li><b>빈 줄에서 Enter</b> — 장비가 프롬프트(케이스명)로 대답합니다. 살아 있는지 확인하는 가장 쉬운 방법</li>
      <li><b>↑ ↓</b> — 이전에 친 명령 다시 부르기 · <b>Backspace</b> 지우기 · <b>Esc</b> 입력 줄 비우기</li>
      <li><b>Ctrl+V</b> — 붙여넣기</li></ul>
      <p>특수문자는 <span class="hp-mono">\\r</span> <span class="hp-mono">\\n</span>
      <span class="hp-mono">\\t</span> <span class="hp-mono">\\x02</span>(16진수 1바이트) 로 쓸 수 있습니다.
      줄 끝의 엔터는 '송신 줄바꿈' 설정이 자동으로 붙습니다.</p>
      <p class="hp-tip">⚠ START·DO 처럼 <b>장비가 실제로 움직이는 명령</b>은 보내기 전에 안전 확인 창이
      한 번 뜹니다. (I/O 테스트 탭의 '⚠ 장비 동작 명령 허용'을 켜야 실행됩니다)</p>
      <table class="hp-tbl">
        <tr><td class="hp-mono">#CONFIG</td><td>이 ⚙ 설정 창</td></tr>
        <tr><td class="hp-mono">#OPEN / #CLOSE</td><td>슬롯의 <b>연결 / 해제</b> 버튼</td></tr>
        <tr><td class="hp-mono">#CLEAR</td><td>슬롯의 <b>지우기</b> 버튼</td></tr>
        <tr><td class="hp-mono">#CAPON / #CAPOFF</td><td>필요 없음 — <b>연결하면 항상 기록</b>(무한대). 💾 저장으로 파일 출력</td></tr>
        <tr><td class="hp-mono">#DOWN</td><td>미지원 — 펌웨어 다운로드는 KNKT.exe 사용</td></tr>
        <tr><td class="hp-mono">\\XOR \\ADD \\HXOR \\HADD</td><td>체크섬 자동계산 — 현재 미지원(그대로 전송됩니다)</td></tr>
      </table>` },
  };

  function monHelp(key) {
    const h = MON_HELP[key];
    if (!h) return;
    let p = $('monHelpPop');
    if (!p) {
      p = document.createElement('div');
      p.id = 'monHelpPop';
      p.className = 'help-pop';
      document.body.appendChild(p);
      p.addEventListener('click', e => { if (e.target === p) monHelpClose(); });
    }
    p.innerHTML = `<div class="help-box">
      <div class="help-head"><b>❔ ${esc(h.t)}</b>
        <button class="btn btn-ghost btn-mini" onclick="App.monHelpClose()">✕</button></div>
      <div class="help-body">${h.b}</div>
      <div class="help-foot"><button class="btn btn-primary btn-mini" onclick="App.monHelpClose()">알겠습니다</button></div>
    </div>`;
    p.classList.add('on');
  }
  function monHelpClose() {
    const p = $('monHelpPop');
    if (p) p.classList.remove('on');
  }

  // ---- 설정 창 만들기 ----
  const cfgQ = (key) => `<button type="button" class="cfg-q" title="이 항목 설명 보기"
    onclick="App.monHelp('${key}')">?</button>`;

  function cfgRadios(name, cur, opts) {
    return `<div class="cfg-radios">` + opts.map(o => `<label class="${o.off ? 'off' : ''}"
      title="${esc(o.tip || '')}"><input type="radio" name="${name}" value="${o.v}"
      ${String(cur) === String(o.v) ? 'checked' : ''} ${o.off ? 'disabled' : ''}> ${esc(o.n)}</label>`).join('') + `</div>`;
  }

  function monCfgHtml(s) {
    const mon = monState();
    const pal = Object.assign({}, MON_PRESETS.knkt.pal, s.palette || {});
    const bg = s.screen_bg || MON_PRESETS.knkt.bg;
    const ports = ((mon.meta || {}).ports || []).map(p => p.device);
    if (s.port && !ports.includes(s.port)) ports.unshift(s.port);
    const portOpts = ports.length
      ? ports.map(p => `<option ${p === s.port ? 'selected' : ''}>${esc(p)}</option>`).join('')
      : '<option value="">포트 없음</option>';
    const baudOpts = MON_BAUDS.map(b =>
      `<option ${Number(s.baud) === b ? 'selected' : ''}>${b}</option>`).join('');
    const nl = (id, cur) => `<select class="input" id="${id}">
      <option value="cr" ${cur === 'cr' ? 'selected' : ''}>CR (\\r)</option>
      <option value="lf" ${cur === 'lf' ? 'selected' : ''}>LF (\\n)</option>
      <option value="crlf" ${cur === 'crlf' ? 'selected' : ''}>CR+LF (\\r\\n)</option></select>`;
    return `<div class="cfg-wrap">
      <div class="cfg-col">
        <fieldset class="cfg-box"><legend>Communication Type · 통신 방식</legend>
          <div class="cfg-row">
            ${cfgRadios('cfgComm', s.comm_type, [
              { v: 'serial', n: 'Serial' },
              { v: 'udp', n: 'UDP', tip: '현재 미지원' },
              { v: 'tcp', n: 'TCP', tip: '현재 미지원' }])}
            ${cfgQ('comm_type')}
          </div>
        </fieldset>

        <fieldset class="cfg-box"><legend>Serial Parameter · 시리얼 통신 규격</legend>
          <div class="cfg-row"><label>COM 포트</label>
            <select class="input" id="cfgPort">${portOpts}</select>
            <button type="button" class="btn btn-mini" onclick="App.monCfgPorts()">새로고침</button>
            ${cfgQ('port')}</div>
          <div class="cfg-row"><label>통신 속도</label>
            <select class="input" id="cfgBaud">${baudOpts}</select>${cfgQ('baud')}</div>
          <div class="cfg-row"><label>데이터 비트</label>
            ${cfgRadios('cfgBits', s.databits, [
              { v: 4, n: '4', off: true, tip: '윈도우 드라이버 미지원' },
              { v: 5, n: '5' }, { v: 6, n: '6' }, { v: 7, n: '7' }, { v: 8, n: '8' }])}
            ${cfgQ('databits')}</div>
          <div class="cfg-row"><label>패리티</label>
            ${cfgRadios('cfgParity', s.parity, [
              { v: 'none', n: 'None' }, { v: 'odd', n: 'Odd' }, { v: 'even', n: 'Even' },
              { v: 'mark', n: 'Mark' }, { v: 'space', n: 'Space' }])}
            ${cfgQ('parity')}</div>
          <div class="cfg-row"><label>정지 비트</label>
            ${cfgRadios('cfgStop', s.stopbits, [{ v: 1, n: '1' }, { v: 2, n: '2' }])}
            ${cfgQ('stopbits')}</div>
          <div class="cfg-row"><label>흐름 제어</label>
            ${cfgRadios('cfgFlow', s.flow, [
              { v: 'none', n: 'NONE' }, { v: 'rtscts', n: 'RTS / CTS' },
              { v: 'xonxoff', n: 'XON / XOFF' }])}
            ${cfgQ('flow')}</div>
        </fieldset>

        <fieldset class="cfg-box"><legend>Network Parameter · 네트워크 (UDP/TCP)</legend>
          <div class="cfg-row"><label>IP 주소</label>
            <input class="input" id="cfgIp" value="${esc(s.ip)}" style="width:150px">${cfgQ('ip')}</div>
          <div class="cfg-row"><label>포트</label>
            <input class="input" id="cfgNetPort" type="number" min="1" max="65535"
              value="${Number(s.net_port) || 20000}" style="width:110px">${cfgQ('net_port')}</div>
        </fieldset>
      </div>

      <div class="cfg-col">
        <fieldset class="cfg-box"><legend>Terminal Windows Parameter · 화면 표시</legend>
          <div class="cfg-row"><label>스크롤백</label>
            <span class="cfg-inf">무한대 (∞)</span>
            <span class="cfg-note">용량 제한 없이 전부 기록</span>${cfgQ('scrollback')}</div>
          <div class="cfg-row"><label>로컬 에코</label>
            <label class="mon-check"><input type="checkbox" id="cfgEcho"
              ${s.local_echo ? 'checked' : ''}> 보낸 명령도 화면에 표시</label>${cfgQ('local_echo')}</div>
          <div class="cfg-row"><label>수신 줄바꿈</label>${nl('cfgRxNl', s.rx_newline)}${cfgQ('rx_newline')}</div>
          <div class="cfg-row"><label>송신 줄바꿈</label>${nl('cfgTxNl', s.tx_newline)}${cfgQ('tx_newline')}</div>
        </fieldset>

        <fieldset class="cfg-box"><legend>Miscellaneous · 펌웨어 다운로드</legend>
          <div class="cfg-row"><label></label>
            <label class="mon-check"><input type="checkbox" id="cfgHex"
              ${s.hex2bin ? 'checked' : ''}> Hex → Bin 자동 변환</label>${cfgQ('hex2bin')}</div>
          <div class="cfg-row"><label></label>
            <label class="mon-check"><input type="checkbox" id="cfgDlMenu"
              ${s.use_download_menu ? 'checked' : ''}> 다운로드 메뉴 사용</label>${cfgQ('use_download_menu')}</div>
          <div class="cfg-row"><label>부트로더 암호</label>
            <input class="input" id="cfgPw" type="password" value="${esc(s.loader_pw || '')}"
              style="width:150px">${cfgQ('loader_pw')}</div>
        </fieldset>

        <fieldset class="cfg-box"><legend>Log Option · 로그</legend>
          <div class="cfg-row"><label></label>
            <label class="mon-check"><input type="checkbox" id="cfgNoColor"
              ${s.remove_color ? 'checked' : ''}> 색상코드 제거</label>${cfgQ('remove_color')}</div>
          <div class="cfg-row"><label>글꼴 크기</label>
            <input class="input" id="cfgFont" type="number" min="6" max="30"
              value="${Number(s.font_size) || 10}" style="width:88px">
            <span class="cfg-note">pt</span>${cfgQ('font_size')}</div>
        </fieldset>

        <fieldset class="cfg-box"><legend>화면 배색 ${cfgQ('palette')}</legend>
          <div class="cfg-row"><label>바탕색</label>
            <input type="color" class="cfg-col-in" id="cfgBg" value="${esc(bg)}"
              oninput="App.monPalPreview()">
            <span style="flex:1"></span>
            <button type="button" class="btn btn-mini" onclick="App.monPalPreset('knkt')">KNK터미널 기본</button>
            <button type="button" class="btn btn-mini" onclick="App.monPalPreset('dark')">다크 콘솔</button>
          </div>
          <div class="cfg-pal">${MON_PAL_KEYS.map(k => `
            <label class="cfg-pal-item" title="${esc(MON_PAL_USE[k] || '$F' + k)}">
              <input type="color" class="cfg-col-in" id="cfgPal${k}" data-pal="${k}"
                value="${esc(pal[k])}" oninput="App.monPalPreview()">
              <span class="cp-code">$F${k}</span>
              <span class="cp-use">${esc(MON_PAL_USE[k] || '')}</span>
            </label>`).join('')}</div>
          <div class="cfg-note mt8">KNK터미널 화면과 나란히 놓고 다른 색만 눌러서 맞추세요. 아래는 실제 로그 미리보기입니다.</div>
          <div class="cfg-pal-prev" id="cfgPalPrev"></div>
        </fieldset>

        <fieldset class="cfg-box"><legend>⚡ 반자동 시작 ${cfgQ('auto')}</legend>
          <div class="cfg-row"><label>진공 신호</label>
            ${cfgRadios('cfgAutoSrc', s.auto_src || 'do', [
              { v: 'do', n: 'DO (출력)' }, { v: 'di', n: 'DI (입력)' }])}
          </div>
          <div class="cfg-row"><label>채널</label>
            <input class="input" id="cfgAutoCh" type="number" min="1" max="16"
              value="${Number(s.auto_ch) || 2}" style="width:74px">
            <span class="cfg-note">CH01~CH16 (기본 CH02 VACUUM)</span></div>
          <div class="cfg-row"><label>진공 ON 레벨</label>
            ${cfgRadios('cfgAutoAct', s.auto_active || 'low', [
              { v: 'low', n: 'LOW' }, { v: 'high', n: 'HIGH' }])}
          </div>
          <div class="cfg-row"><label>시작 지연</label>
            <input class="input" id="cfgAutoDelay" type="number" min="0.2" max="10" step="0.1"
              value="${Number(s.auto_delay) || 1}" style="width:80px">
            <span class="cfg-note">초 — 진공 감지 후 첫 명령까지</span></div>
          <div class="cfg-note mt8">시작 순서(START 앞에 실린더 동작 등)는
            <b>⚡ 반자동 버튼을 더블클릭</b>하면 편집할 수 있습니다.</div>
        </fieldset>

        <fieldset class="cfg-box"><legend>명령 입력 ${cfgQ('cmds')}</legend>
          <div class="cfg-help">
            <div class="cfg-note">터미널 화면을 클릭하고 <b>바로 타이핑</b>하면 됩니다.<br>
              <b>Enter</b> 전송 · 빈 줄에서 <b>Enter</b> = 장비 프롬프트 확인 ·
              <b>↑ ↓</b> 이전 명령 · <b>Esc</b> 입력 줄 비우기<br>
              #CONFIG = 이 창 · #OPEN/#CLOSE = 연결/해제 · #CLEAR = 지우기 ·
              #CAPON/#CAPOFF = 항상 기록(무한대) + 💾 저장</div>
          </div>
        </fieldset>
      </div>

      <div class="cfg-foot">
        <button class="btn" onclick="App.monSettingsDefault()">↺ 기본값 (Default)</button>
        <span style="flex:1"></span>
        <button class="btn btn-ghost" onclick="App.closeModal()">취소</button>
        <button class="btn btn-primary" onclick="App.monSettingsSave()">✔ 확인 (OK)</button>
      </div>
    </div>`;
  }

  function monSettings() {
    openModal('⚙ 터미널 설정 — KNK터미널 Configuration 과 같은 구성', monCfgHtml(monCfg()));
    monPalPreview();
  }

  async function monCfgPorts() {      // 설정 창 안에서 포트 목록만 다시 읽기
    await monRefreshPorts();
    const sel = $('cfgPort');
    if (!sel) return;
    const cur = sel.value;
    const ports = ((monState().meta || {}).ports || []).map(p => p.device);
    sel.innerHTML = ports.length
      ? ports.map(p => `<option ${p === cur ? 'selected' : ''}>${esc(p)}</option>`).join('')
      : '<option value="">포트 없음</option>';
  }

  function monSettingsDefault() {
    if (!confirm('모든 항목을 KNK터미널 기본값으로 되돌립니다.\n(확인을 눌러야 실제로 저장됩니다)')) return;
    setModalBody(monCfgHtml(Object.assign({}, MON_DEFAULTS,
      { screen_bg: MON_PRESETS.knkt.bg, palette: MON_PRESETS.knkt.pal })));
    monPalPreview();
  }

  function monCfgRead() {
    const pick = (name, fb) => {
      const el = document.querySelector(`input[name="${name}"]:checked`);
      return el ? el.value : fb;
    };
    return {
      comm_type: pick('cfgComm', 'serial'),
      port: $('cfgPort').value, baud: parseInt($('cfgBaud').value, 10) || 115200,
      databits: parseInt(pick('cfgBits', 8), 10),
      parity: pick('cfgParity', 'none'),
      stopbits: parseInt(pick('cfgStop', 1), 10),
      flow: pick('cfgFlow', 'none'),
      ip: $('cfgIp').value.trim() || '127.0.0.1',
      net_port: parseInt($('cfgNetPort').value, 10) || 20000,
      scrollback: 0,                       // 이 프로그램은 무한대 고정
      local_echo: $('cfgEcho').checked,
      rx_newline: $('cfgRxNl').value, tx_newline: $('cfgTxNl').value,
      hex2bin: $('cfgHex').checked, use_download_menu: $('cfgDlMenu').checked,
      loader_pw: $('cfgPw').value,
      remove_color: $('cfgNoColor').checked,
      font_size: parseInt($('cfgFont').value, 10) || 10,
      screen_bg: $('cfgBg').value, palette: monPalRead(),
      auto_src: pick('cfgAutoSrc', 'do'),
      auto_ch: parseInt($('cfgAutoCh').value, 10) || 2,
      auto_active: pick('cfgAutoAct', 'low'),
      auto_delay: parseFloat($('cfgAutoDelay').value) || 1.0,
    };
  }

  async function monSettingsSave() {
    const mon = monState();
    const next = monCfgRead();
    const r = await api.post('/api/monitor/settings', { settings: next });
    if (r && r.error) { alert('설정을 저장하지 못했습니다.\n\n' + r.error); return; }
    mon.settings = Object.assign({}, MON_DEFAULTS, (r && r.settings) || next);
    closeModal();
    monApplyFont();
    monApplyScreenTheme();
    // 시리얼 파라미터는 포트를 새로 열 때 반영된다 — 연결 중이면 알려 준다.
    const busy = (r && r.reconnect_needed) || [];
    if (busy.length) {
      alert('설정을 저장했습니다.\n\n연결 중인 세션(' + busy.join(', ') + ')의 통신 규격은\n' +
        '한 번 해제했다가 다시 연결해야 적용됩니다.');
    }
  }

  // ------------------------------------------- 터미널 직접 입력 (KNK터미널과 동일)
  // 화면을 클릭하고 그냥 타이핑하면 커서 줄에 글자가 쌓이고, Enter 를 누르면
  // 그 줄이 장비로 나간다. 빈 줄에서 Enter = 장비가 프롬프트(케이스명)로 응답.
  // 보낸 명령 자체는 장비가 그대로 되돌려 주므로 화면에 따로 찍지 않는다
  // (되돌려주지 않는 장비라면 설정 ⚙ 의 '로컬 에코'를 켜면 된다).
  function monCaret(slot) {
    const box = $('mScreen' + slot);
    if (!box) return null;
    let el = box.querySelector('.mon-caretline');
    if (!el) {
      el = document.createElement('span');
      el.className = 'mon-caretline';
      el.innerHTML = '<span class="typed"></span><span class="caret">▌</span>';
      box.appendChild(el);
    } else if (el !== box.lastChild) {
      box.appendChild(el);              // 수신 내용이 붙으면 커서를 다시 맨 끝으로
    }
    return el;
  }

  function monCaretDraw(slot) {
    const el = monCaret(slot);
    if (!el) return;
    el.querySelector('.typed').textContent = monState().slots[slot].line || '';
    const box = $('mScreen' + slot);
    if (box) box.scrollTop = box.scrollHeight;
  }

  function monHookInput() {
    [1, 2, 3].forEach(k => {
      const box = $('mScreen' + k);
      if (!box || box.dataset.hooked) return;
      box.dataset.hooked = '1';
      box.addEventListener('keydown', e => monScreenKey(k, e));
      box.addEventListener('paste', e => {
        const txt = (e.clipboardData || window.clipboardData || {}).getData
          ? (e.clipboardData || window.clipboardData).getData('text') : '';
        if (!txt) return;               // 이미지 붙여넣기는 전역 처리에 맡긴다
        e.preventDefault();
        e.stopPropagation();
        const sl = monState().slots[k];
        sl.line = (sl.line || '') + txt.replace(/[\r\n]+$/, '').replace(/[\r\n]+/g, ' ');
        monCaretDraw(k);
      });
      monCaretDraw(k);
    });
  }

  function monScreenKey(slot, e) {
    const sl = monState().slots[slot];
    if (e.ctrlKey || e.altKey || e.metaKey) return;      // 복사·붙여넣기는 브라우저에 양보
    const stop = () => { e.preventDefault(); e.stopPropagation(); };
    if (e.key === 'Enter') {
      stop();
      const text = sl.line || '';
      sl.line = '';
      if (text.trim()) {
        sl.hist.push(text);
        if (sl.hist.length > 100) sl.hist.shift();
      }
      sl.histPos = sl.hist.length;
      monCaretDraw(slot);
      monSendLine(slot, text);
      return;
    }
    if (e.key === 'Backspace') { stop(); sl.line = (sl.line || '').slice(0, -1); monCaretDraw(slot); return; }
    if (e.key === 'Escape') { stop(); sl.line = ''; monCaretDraw(slot); return; }
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {   // 이전에 친 명령 다시 부르기
      stop();
      if (!sl.hist.length) return;
      sl.histPos += (e.key === 'ArrowUp' ? -1 : 1);
      sl.histPos = Math.max(0, Math.min(sl.hist.length, sl.histPos));
      sl.line = sl.hist[sl.histPos] || '';
      monCaretDraw(slot);
      return;
    }
    if (e.key.length === 1) { stop(); sl.line = (sl.line || '') + e.key; monCaretDraw(slot); }
  }

  async function monSendLine(slot, text) {
    const sl = monState().slots[slot];
    if (!sl.connected) {
      const box = $('mScreen' + slot);
      if (box) monScreenFeed(slot, `$F1[연결되지 않음] 먼저 포트에 연결하세요.$FR\n`);
      return;
    }
    if (monCfg().local_echo) monScreenFeed(slot, text + '\n');
    await monSendSlot(slot, monUnescape(text));
  }

  // \r \n \t \xNN 을 실제 문자로 — KNK터미널의 입력 표기법과 같다.
  // 모르는 이스케이프(\XOR 등 체크섬 기능)는 손대지 않고 그대로 보낸다.
  function monUnescape(s) {
    const map = { r: '\r', n: '\n', t: '\t', '0': '\0', '\\': '\\' };
    return String(s || '').replace(/\\x([0-9A-Fa-f]{2})|\\(.)/g, (m, hex, ch) => {
      if (hex) return String.fromCharCode(parseInt(hex, 16));
      return map[ch] !== undefined ? map[ch] : m;
    });
  }

  async function monSendSlot(slot, cmd, unsafeOk) {
    const mon = monState();
    const r = await api.post('/api/monitor/send',
      { slot, command: cmd, unsafe_ok: !!unsafeOk });
    if (r && r.error) {
      if (r.unsafe_required) {
        if (!mon.allowUnsafe) {
          alert("장비가 실제로 동작하는 명령입니다.\n\nI/O 테스트 탭의 '⚠ 장비 동작 명령 허용'을 먼저 켜세요.");
          return false;
        }
        if (confirm(`'${cmd}' 를 ${monSlotName(slot)}에 보냅니다.\n\n${r.tip || ''}\n\n지그와 작업자 안전을 확인했습니까?`))
          return monSendSlot(slot, cmd, true);
        return false;
      }
      alert(r.error);
      return false;
    }
    return true;
  }

  // 확장/축소 — 터미널·데이터로거 카드를 창에 거의 가득 채운다 (Esc = 축소)
  function monMax(on) {
    const mon = monState();
    mon.maxed = (on === undefined) ? !mon.maxed : !!on;
    const card = $('mTermCard');
    if (card) card.classList.toggle('mon-max', mon.maxed);
    document.body.classList.toggle('mon-maxed', mon.maxed);
    const b = $('mMaxBtn');
    if (b) b.textContent = mon.maxed ? '🗕 축소' : '⛶ 확장';
  }

  function monTermSlots(n) {
    const mon = monState();
    mon.termSlots = n;
    for (let i = 1; i <= 3; i++) {
      const el = $('mTSlot' + i);
      if (el) el.classList.toggle('hidden', i > n);
      const b = $('mTSlots' + i);
      if (b) b.classList.toggle('on', i === n);
      const sw = $('mTSwap' + i);          // 옆칸 교환 버튼 — 다음 슬롯이 있을 때만
      if (sw) sw.classList.toggle('hidden', i >= n);
    }
    const box = $('mTermSlots');
    if (box) box.className = 'mon-slots mt8 cols' + n;
  }

  function monDlSlots(n) {
    const mon = monState();
    mon.dlSlots = n;
    for (let i = 1; i <= 3; i++) {
      const el = $('mDSlot' + i);
      if (el) el.classList.toggle('hidden', i > n);
      const b = $('mDSlots' + i);
      if (b) b.classList.toggle('on', i === n);
      const sw = $('mDSwap' + i);          // 옆칸 교환 버튼 — 다음 슬롯이 있을 때만
      if (sw) sw.classList.toggle('hidden', i >= n);
    }
    const box = $('mDlSlotsBox');
    if (box) box.className = 'mon-slots mt8 cols' + n;
    monDlRender();
  }

  // 두 슬롯을 통째로 교환 — 연결 COM포트·수신화면·검사결과가 함께 바뀐다.
  // 서버 세션을 먼저 맞바꾸고(연결/스레드/저장로그 이동), 클라이언트 슬롯 상태와
  // 화면 DOM 도 같은 순서로 맞바꾼다. 연결 중이든 끊겨 있든 동작한다.
  async function monSwap(a, b) {
    const mon = monState();
    let res, r;
    try {
      res = await fetch('/api/monitor/swap', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ a, b }),
      });
    } catch (e) {
      alert('서버에 연결할 수 없습니다. 프로그램을 다시 실행해 주세요.');
      return;
    }
    if (res.status === 404) {   // 이 라우트가 없는 구버전 서버
      alert('실행 중인 프로그램이 예전 버전이라 슬롯 교환 기능이 없습니다.\n\n' +
            '프로그램을 완전히 종료(종료하기.bat)한 뒤 다시 실행해 최신 버전으로 열어 주세요.');
      return;
    }
    try { r = await res.json(); }
    catch (e) { alert('교환 응답을 해석하지 못했습니다. 프로그램을 다시 실행해 주세요.'); return; }
    if (!r || r.error) { alert((r && r.error) || '교환하지 못했습니다.'); return; }

    const t = mon.slots[a]; mon.slots[a] = mon.slots[b]; mon.slots[b] = t;  // 클라 상태 교환
    const sa = $('mScreen' + a), sb = $('mScreen' + b);                     // 터미널 화면 DOM 교환
    if (sa && sb) { const h = sa.innerHTML; sa.innerHTML = sb.innerHTML; sb.innerHTML = h; }
    // 연결 COM포트·속도 드롭다운도 함께 교환 — 연결은 서버에서 그대로 살아 있고,
    // 화면의 포트 표시도 즉시 따라가게 한다. (폴링이 실제 연결 포트로 재확인)
    const swapVal = (pre) => {
      const ea = $(pre + a), eb = $(pre + b);
      if (ea && eb) { const v = ea.value; ea.value = eb.value; eb.value = v; }
    };
    swapVal('mSPort'); swapVal('mSBaud');

    [a, b].forEach(k => {
      monFontSize(k, mon.slots[k].fs || 'm');
      const slotEl = $('mTSlot' + k);
      const fz = slotEl && slotEl.querySelector('.mon-check input[type=checkbox]');
      if (fz) fz.checked = !!mon.slots[k].freeze;
      const typed = slotEl && slotEl.querySelector('.typed');
      if (typed) typed.textContent = mon.slots[k].line || '';
      monSlotCount(k);
      monAutoPaint(k);
    });
    monDlRender();                 // 데이터로거 표·통계도 교환된 데이터로 갱신
    monPoll();                     // 헤더(연결/상태/모델) 즉시 갱신
  }

  function monDlSummaryToggle() {
    const mon = monState();
    mon.dlSummary = !mon.dlSummary;
    const btn = $('mDlSumBtn');
    if (btn) btn.classList.toggle('btn-primary', mon.dlSummary);
    monDlRender();
  }

  // ---- 폴링 (3개 슬롯 일괄) ----
  async function monPoll() {
    const mon = state.mon;
    if (!mon || !mon.timer || mon.busy || !$('mDot')) return;
    mon.busy = true;
    const q = [0, 1, 2, 3].map(k => `s${k}=${mon.slots[k].seq},${mon.slots[k].runs.length}`).join('&');
    let r;
    try { r = await fetch(`/api/monitor/poll?${q}`).then(x => x.json()); }
    catch (e) { mon.busy = false; return; }   // 서버 재시작 등 — 조용히 재시도
    mon.busy = false;
    if (!$('mDot')) return;                   // 폴링 중 화면 이동

    let dlDirty = false;
    for (const k of [0, 1, 2, 3]) {
      const sd = (r.slots || {})[k];
      if (!sd) continue;
      const sl = mon.slots[k];
      sl.seq = sd.seq || 0;
      sl.connected = !!sd.connected;
      sl.rx = sd.rx || 0;                                            // 누적 수신량 (무응답 감지용)
      sl.counter = (sd.io && sd.io.counter) || sl.counter || null;   // 장비 카운터 (초기화 검증용)

      if (k === 0) {   // 점검용 세션 — I/O 테스트·콘솔 전용
        mon.connected = sl.connected;
        $('mStatus').textContent = sd.status || '';
        $('mDot').className = 'mon-dot' + (sl.connected ? ' on' : '');
        const btn = $('mConnBtn');
        btn.textContent = sl.connected ? '연결 해제' : '연결';
        btn.classList.toggle('btn-primary', !sl.connected);
        (sd.events || []).forEach(e => monTermFeed(e));    // 콘솔 터미널 = 점검용 스트림
        monPaintIO(sd.io || {});
        continue;
      }

      // 터미널 슬롯(1~3) 헤더
      const dot = $('mSDot' + k);
      if (dot) {
        dot.className = 'mon-dot' + (sl.connected ? ' on' : '');
        dot.title = sd.status || '';
      }
      const cb = $('mSConn' + k);
      if (cb) {
        cb.textContent = sl.connected ? '해제' : '연결';
        cb.classList.toggle('btn-primary', !sl.connected);
      }
      // 실제 연결된 COM포트를 드롭다운에 반영 — 스왑으로 포트가 옮겨오면
      // 화면 표시도 실제 연결 포트로 맞춘다. (연결된 슬롯만 손대 사용자의 선택 보존)
      sl.port = sd.port || null;
      if (sl.connected && sd.port) {
        const psel = $('mSPort' + k);
        if (psel && psel.value !== sd.port) {
          if (![...psel.options].some(o => o.value === sd.port)) {
            psel.add(new Option(sd.port, sd.port));
          }
          psel.value = sd.port;
        }
      }

      (sd.events || []).forEach(e => {
        if (e.k === 'rx' && !sl.freeze) monScreenFeed(k, e.t);
      });
      (sd.runs || []).forEach(run => {
        sl.runs.push(run);
        dlDirty = true;
      });
      const qc = sd.qc || {};
      const qcChanged = !sl.qc || sl.qc.aborted !== qc.aborted || sl.qc.repaired !== qc.repaired;
      sl.qc = qc;
      // 반자동 시작 상태 (서버가 진공을 지켜보며 갱신)
      const au = sd.auto || {};
      const auChanged = !sl.auto || sl.auto.on !== au.on || sl.auto.state !== au.state;
      sl.auto = au;
      if (auChanged) { monAutoPaint(k); monSlotCount(k); }
      if ((sd.runs || []).length || qcChanged) {
        monDlStats(k);        // 데이터로거 슬롯 미니 통계
        monSlotCount(k);      // 터미널 슬롯 상단 카운터
      }
    }
    if (dlDirty && mon.tab === 'screen' && mon.termMode === 'dl') monDlRender();
  }

  // ---- 연결 (세션별) ----
  // 0 = 점검용(I/O 테스트·콘솔), 1~3 = 터미널 슬롯. 서로 완전히 독립된 연결이라
  // 점검용 포트를 바꿔도 터미널 슬롯에는 아무 영향이 없다.
  const monSlotName = (k) => k === 0 ? '점검용(I/O)' : k + '번 검사기';

  async function monToggleConn(slot) {
    slot = slot == null ? 0 : slot;
    const mon = monState();
    if (mon.slots[slot].connected) {
      await api.post('/api/monitor/disconnect', { slot });
      monPoll();
      return;
    }
    const portEl = slot === 0 ? $('mPort') : ($('mSPort' + slot) || $('mPort'));
    const baudEl = slot === 0 ? $('mBaud') : ($('mSBaud' + slot) || $('mBaud'));
    const r = await api.post('/api/monitor/connect',
      { slot, port: portEl.value, baud: parseInt(baudEl.value, 10) });
    if (r.error) { alert(`${monSlotName(slot)} 연결 실패\n\n` + r.error); return; }
    monPoll();
    // 장비 무응답 감지 — 연결 직후 빈 명령에 프롬프트로 답하는 것이 정상.
    // 3초간 수신이 전혀 없으면 포트가 틀렸거나 장비 전원이 꺼진 것.
    const base = mon.slots[slot].rx || 0;
    setTimeout(() => {
      const s = monState().slots[slot];
      if (s.connected && (s.rx || 0) <= base) {
        alert(`⚠ ${monSlotName(slot)}: 연결은 되었지만 장비 응답이 없습니다.\n\n` +
          '· 장비 전원과 케이블을 확인하세요\n' +
          '· 장비가 다른 포트에 연결돼 있을 수 있습니다 (포트를 바꿔 시도)\n' +
          '· KNKT.exe / PBADataLogger 가 실제 장비 포트를 잡고 있으면\n' +
          '  해당 프로그램을 닫아야 그 포트에 연결할 수 있습니다');
      }
    }, 3000);
  }

  async function monRefreshPorts() {
    const meta = await api.get('/api/monitor/state');
    const mon = monState();
    mon.meta = meta;
    const fill = (el, withDefault) => {
      if (!el) return;
      const cur = el.value;
      el.innerHTML = monPortOpts(meta, withDefault);
      if (cur && [...el.options].some(o => o.value === cur)) el.value = cur;
    };
    fill($('mPort'), true);
    fill($('mSPort1'), true);
    fill($('mSPort2'), false);
    fill($('mSPort3'), false);
  }

  // ---- 명령 전송 (I/O·콘솔 = 점검용 세션 0) ----
  async function monSendCmd(cmd, unsafeOk) {
    const mon = monState();
    const r = await api.post('/api/monitor/send', { slot: 0, command: cmd, unsafe_ok: !!unsafeOk });
    if (r && r.error) {
      if (r.unsafe_required) {
        if (!mon.allowUnsafe) { alert("상단의 '⚠ 장비 동작 명령 허용'을 먼저 켜세요."); return false; }
        if (confirm(`'${cmd}' 를 보냅니다.\n\n${r.tip || ''}\n\n지그와 작업자 안전을 확인했습니까?`))
          return monSendCmd(cmd, true);
        return false;
      }
      alert(r.error);
      return false;
    }
    return true;
  }
  const monQuickCmd = (cmd) => { monSendCmd(cmd); };
  function monUnsafeCmd(cmd, tip) {
    const mon = monState();
    if (!mon.allowUnsafe) { alert("상단의 '⚠ 장비 동작 명령 허용'을 먼저 켜세요."); return; }
    if (!confirm(`'${cmd}' 를 보냅니다.\n\n${tip}\n\n지그와 작업자 안전을 확인했습니까?`)) return;
    monSendCmd(cmd, true);
  }
  function monSendTyped() {
    const t = $('mCmd');
    const text = (t.value || '').trim();
    if (!text) return;
    t.value = '';
    monSendCmd(text);           // 동작 명령이면 서버가 확인을 요구 → confirm 흐름
  }

  async function monIoVerbose(show) {
    // 체크 = 원문 표시(KNKT 방식), 해제 = I/O 조회 잡음 숨김(기본)
    await api.post('/api/monitor/quiet', { on: !show });
    if ($('mStatus')) $('mStatus').textContent = show
      ? 'I/O 조회 원문을 터미널·저장 로그에 표시합니다.'
      : 'I/O 조회 잡음을 숨깁니다 (램프 갱신은 그대로 동작).';
  }

  // ---- 동작 명령 허용 게이트 ----
  function monUnsafeToggle(el) {
    const mon = monState();
    if (el.checked && !confirm(
      'DO/GPIO/START 등 하드웨어 제어 버튼이 활성화됩니다.\n' +
      '버튼을 누르면 즉시 장비가 동작합니다.\n\n지그와 작업자 안전을 확인했습니까?')) {
      el.checked = false;
    }
    mon.allowUnsafe = el.checked;
    monSyncUnsafe();
  }
  function monSyncUnsafe() {
    const mon = monState();
    document.querySelectorAll('[data-unsafe]').forEach(b => { b.disabled = !mon.allowUnsafe; });
  }

  // ---- I/O 테스트 (1번 검사기) ----
  function monPollToggle(el) {
    const mon = monState();
    if (mon.pollTimer) { clearInterval(mon.pollTimer); mon.pollTimer = null; }
    if (!el || !el.checked) return;
    const iv = Math.max(300, parseFloat($('mPollIv').value || '1') * 1000);
    mon.pollTimer = setInterval(() => {
      if (!mon.connected || !$('mDot')) return;
      const cmds = ['DI', 'DO'];
      monSendCmd(cmds[mon.pollCycle++ % cmds.length]);
    }, iv);
  }

  function monDoClick(i) {
    const mon = monState();
    if (!mon.connected) { alert('먼저 포트에 연결하세요.'); return; }
    if (!mon.allowUnsafe) { alert("상단의 '⚠ 장비 동작 명령 허용'을 먼저 켜세요."); return; }
    const cur = mon.do ? mon.do[i] : null;
    if (cur == null) { monSendCmd('DO'); return; }   // 상태 미상 — 먼저 조회
    monSendCmd(`DO ${i} ${cur ? 0 : 1}`, true);      // FW 채널 0-기준
    setTimeout(() => monSendCmd('DO'), 300);         // 읽기 되돌림으로 보정
  }

  function monSyncTime() {
    // 실기 확인(2026-07-22): 날짜는 따옴표 없이 보내야 한다.
    const d = new Date(), p = (n) => String(n).padStart(2, '0');
    const now = `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
    monSendCmd(`TIME ${now}`).then(ok => { if (ok) setTimeout(() => monSendCmd('TIME'), 400); });
  }

  function monResetCounter() {
    if (!confirm('점검용 연결 장비의 OK / NG / TOTAL 카운터를 모두 0으로 초기화합니다.\n되돌릴 수 없습니다. 계속할까요?')) return;
    monSendCmd('SET COUNTER RESET', true).then(ok => {
      if (!ok) return;
      setTimeout(() => monSendCmd('SET COUNTER'), 500);
      // 실제 0 확인 — 읽기 되돌림이 폴링에 반영된 뒤 검사
      setTimeout(() => {
        const c = monState().slots[0].counter;
        if (c && (c.ok || c.ng || c.total)) {
          alert(`⚠ 카운터가 0으로 확인되지 않았습니다 (총 ${c.total}).\n` +
            '콘솔 탭에서 SET COUNTER RESET 에 대한 장비 응답을 확인해 주세요.');
        } else if (!c) {
          alert('⚠ 이 장비 펌웨어는 카운터 콘솔 명령을 지원하지 않습니다.\n\n' +
            '(SET COUNTER 가 HELP 명령 목록에 없음 — 두성테크 DS FW 등)\n' +
            '이 장비의 카운터는 장비 본체 메뉴에서 초기화해야 합니다.');
        }
      }, 2600);
    });
  }

  // ---- 전체 제어 — 연결된 모든 세션(점검용 + 터미널 슬롯)에 일괄 적용 ----
  async function monSendCmdSlot(slot, cmd, unsafeOk) {
    const r = await api.post('/api/monitor/send', { slot, command: cmd, unsafe_ok: !!unsafeOk });
    if (r && r.error) { alert(`${monSlotName(slot)}: ${r.error}`); return false; }
    return true;
  }

  function monConnectedSlots() {
    const mon = monState();
    return [0, 1, 2, 3].filter(k => mon.slots[k].connected);
  }

  function monResetCounterAll() {
    const conn = monConnectedSlots();
    if (!conn.length) { alert('연결된 검사기가 없습니다.\n먼저 슬롯에서 포트에 연결하세요.'); return; }
    const names = conn.map(monSlotName).join(', ');
    if (!confirm(`연결된 검사기(${names})의 OK / NG / TOTAL 카운터를 모두 0으로 초기화합니다.\n` +
      '되돌릴 수 없습니다. 계속할까요?')) return;
    (async () => {
      for (const k of conn) {
        if (await monSendCmdSlot(k, 'SET COUNTER RESET', true))
          setTimeout(() => monSendCmdSlot(k, 'SET COUNTER'), 500);   // 읽기 되돌림
      }
      if ($('mStatus')) $('mStatus').textContent = `카운터 초기화 명령 전송 — ${names}`;
      // 실제로 0이 됐는지 확인 — 읽기 되돌림 응답이 폴링에 반영된 뒤 검사.
      // 응답이 아예 없으면(카운터 미상) FW 가 SET COUNTER 를 지원하지 않는 것
      // (두성테크 DS FW: TN1_IF_CTC_DS_V1.0 은 HELP 목록에 카운터 명령이 없음 확인).
      setTimeout(() => {
        const mon = monState();
        const bad = [], unknown = [];
        conn.forEach(k => {
          const c = mon.slots[k].counter;
          if (!c) unknown.push(k);
          else if (c.ok || c.ng || c.total) bad.push(k);
        });
        if (bad.length) {
          alert('⚠ 카운터가 0으로 확인되지 않았습니다: ' +
            bad.map(k => { const c = mon.slots[k].counter; return `${monSlotName(k)} (총 ${c.total})`; }).join(', ') +
            '\n\n콘솔 탭에서 SET COUNTER RESET 에 대한 장비 응답을 확인해 주세요.');
        } else if (unknown.length) {
          alert(`⚠ ${unknown.map(monSlotName).join(', ')}: 이 장비 펌웨어는 카운터 콘솔 명령을 지원하지 않습니다.\n\n` +
            '(SET COUNTER 가 HELP 명령 목록에 없음 — 두성테크 DS FW 등)\n' +
            '이 장비의 카운터는 장비 본체 메뉴에서 초기화해야 합니다.');
        } else if ($('mStatus')) {
          $('mStatus').textContent = `카운터 초기화 확인 완료 (0 / 0 / 0) — ${names}`;
        }
      }, 2600);
    })();
  }

  function monSyncTimeAll() {
    const conn = monConnectedSlots();
    if (!conn.length) { alert('연결된 검사기가 없습니다.\n먼저 슬롯에서 포트에 연결하세요.'); return; }
    const names = conn.map(monSlotName).join(', ');
    // 실기 확인(2026-07-22): 날짜는 따옴표 없이 보내야 한다.
    const d = new Date(), p = (n) => String(n).padStart(2, '0');
    const now = `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
    if (!confirm(`연결된 검사기(${names})의 시간을 PC 시간으로 설정합니다.\n\n${now}\n\n계속할까요?`)) return;
    (async () => {
      for (const k of conn) {
        if (await monSendCmdSlot(k, `TIME ${now}`))
          setTimeout(() => monSendCmdSlot(k, 'TIME'), 400);          // 적용값 확인
      }
      if ($('mStatus')) $('mStatus').textContent = `시간 설정 완료 (${now}) — ${names}`;
    })();
  }

  async function monStart() {
    const mon = monState();
    if (!mon.allowUnsafe) { alert("상단의 '⚠ 장비 동작 명령 허용'을 먼저 켜세요."); return; }
    const ch = Math.max(1, parseInt($('mStartCh').value || '1', 10));
    const lv = $('mStartLv').value === 'LOW' ? 0 : 1;
    const settle = parseFloat($('mStartSettle').value || '2');
    if (!confirm('검사 시작 시퀀스를 보냅니다.\n\n' +
      `1) CH${ch} ${lv === 0 ? 'LOW' : 'HIGH'} (메인 실린더 → 제품 인식 → 진공 자동)\n` +
      `2) ${settle.toFixed(1)}초 대기\n3) START 명령 (검사 실행)\n\n` +
      '지그와 작업자 안전을 확인했습니까?')) return;
    const r = await api.post('/api/monitor/start',
      { slot: 0, ch: ch - 1, level: lv, settle, unsafe_ok: true });
    if (r.error) alert(r.error);
  }

  function monAbort() {
    monUnsafeCmd('RESET', '진행 중인 검사를 중단합니다 (Test User Break).');
  }

  function monPaintIO(io) {
    const mon = monState();
    const lamp = (el, bit) => {
      if (!el) return;
      if (bit == null) { el.textContent = '----'; el.className = el.className.replace(/ (hi|lo)/g, ''); return; }
      el.textContent = bit ? 'HIGH' : 'LOW';
      el.classList.toggle('hi', !!bit);
      el.classList.toggle('lo', !bit);
    };
    (io.di || []).forEach((b, i) => lamp($('mDI' + i), b));
    if (io.do) { mon.do = io.do; io.do.forEach((b, i) => lamp($('mDO' + i), b)); }
    if (io.do_aux && $('mDoAux')) {
      const s = io.do_aux.join('');
      $('mDoAux').textContent = `보조 상태 [${(s.match(/.{1,4}/g) || []).join(' ')}]`;
    }
    if ($('mIoInfo')) {
      const c = io.counter;
      $('mIoInfo').textContent = `장비 시각: ${io.time || '-'}  |  카운터: ` +
        (c ? `OK ${c.ok} / NG ${c.ng} / 총 ${c.total}` : '-');
    }
  }

  // 슬롯별 미니 통계 — 데이터로거 각 슬롯 상단 한 줄 요약
  // (모델·호기·공정 · 총/OK/NG · 수율 색상: 95%↑ 초록, 90~95 노랑, 미만 빨강)
  // ---------------------------------------------------- ⚡ 반자동 시작 (숨은 기능)
  // 버튼 표시 = Ctrl+Alt+A 5연타 · 숨김 = Ctrl+Alt+X 5연타.
  // (Ctrl+T·Ctrl+C 처럼 브라우저가 먼저 가로채는 조합은 페이지에서 막을 수 없어
  //  브라우저가 쓰지 않는 Ctrl+Alt 조합을 쓴다)
  // 켜면 서버가 그 슬롯의 진공 신호를 지켜보다가, 제품이 올라와 진공이 잡히면
  // 설정한 시간 뒤 시작 시퀀스(기본 START)를 자동으로 보낸다.
  const MON_AUTO_KEY_SHOW = 'a';    // Ctrl+Alt+A
  const MON_AUTO_KEY_HIDE = 'x';    // Ctrl+Alt+X
  const MON_AUTO_HOTKEY = 5;        // 몇 번 연타해야 하는지
  const MON_AUTO_WINDOW = 2500;     // 연타로 인정하는 시간(ms)

  function monAutoVisible(show, save) {
    const mon = monState();
    mon.autoBtn = !!show;
    if (save !== false) {
      try { localStorage.setItem('knk_auto_btn', show ? '1' : '0'); } catch (e) { /* 무시 */ }
    }
    [1, 2, 3].forEach(k => {
      const b = $('mAuto' + k);
      if (b) b.classList.toggle('hidden', !show);
    });
    if (show && save !== false)
      toast('⚡ 반자동 버튼 표시 — 클릭 ON/OFF · 더블클릭 설정 (Ctrl+Alt+X 5연타로 숨김)');
  }

  // Ctrl+Alt+A / Ctrl+Alt+X 연타 감지 — 각각 표시 / 숨김
  const monHotkey = {};
  function monAutoHotkey(e) {
    if (!e.ctrlKey || !e.altKey || e.shiftKey) return;
    const k = (e.key || '').toLowerCase();
    if (k !== MON_AUTO_KEY_SHOW && k !== MON_AUTO_KEY_HIDE) return;
    if (!$('mAuto1')) return;               // 모니터 화면이 아닐 때는 관여하지 않는다
    e.preventDefault();
    const now = Date.now();
    const hits = (monHotkey[k] || []).filter(t => now - t < MON_AUTO_WINDOW);
    hits.push(now);
    monHotkey[k] = hits;
    if (hits.length < MON_AUTO_HOTKEY) return;
    monHotkey[k] = [];
    monAutoVisible(k === MON_AUTO_KEY_SHOW);
  }

  // 클릭 = ON/OFF, 더블클릭 = 설정 창.
  // 더블클릭의 첫 클릭으로 토글이 먼저 돌지 않도록 잠깐 미뤘다가 실행한다.
  let monAutoClickTimer = null;
  function monAutoClick(slot) {
    if (monAutoClickTimer) return;              // 두 번째 클릭은 dblclick 이 처리
    monAutoClickTimer = setTimeout(() => {
      monAutoClickTimer = null;
      monAutoToggle(slot);
    }, 260);
  }

  async function monAutoToggle(slot) {
    const mon = monState();
    const sl = mon.slots[slot];
    const on = !((sl.auto || {}).on);
    if (on) {
      if (!sl.connected) { alert(`${monSlotName(slot)}가 연결되어 있지 않습니다.`); return; }
      const c = monCfg();
      if (!confirm(
        `⚡ ${monSlotName(slot)} 반자동 시작을 켭니다.\n\n` +
        `제품을 올려 진공(${String(c.auto_src || 'do').toUpperCase()} CH` +
        `${String(c.auto_ch || 2).padStart(2, '0')})이 감지되면\n` +
        `${c.auto_delay || 1}초 뒤 자동으로 START 가 나갑니다.\n` +
        '— 사람이 START 를 누르지 않아도 지그가 동작합니다 —\n\n' +
        '지그 주변에 손·공구가 없는지 확인했습니까?')) return;
    }
    const r = await api.post('/api/monitor/autostart', { slot, on, unsafe_ok: true });
    if (r && r.error) { alert(`반자동 시작을 켤 수 없습니다.\n\n${r.error}`); return; }
    sl.auto = (r && r.auto) || { on };
    monAutoPaint(slot);
    monSlotCount(slot);        // 상단 카운터에도 ⚡ 상태 표시
    monPoll();
  }

  // ---- 반자동 설정 창 (⚡ 버튼 더블클릭) ----
  function monAutoConfig(slot) {
    if (monAutoClickTimer) { clearTimeout(monAutoClickTimer); monAutoClickTimer = null; }
    const s = monCfg();
    const steps = (s.auto_steps && s.auto_steps.length)
      ? s.auto_steps : [{ cmd: 'START', wait: 0 }];
    openModal(`⚡ 반자동 시작 설정 — ${monSlotName(slot)}`, `
      <div class="cfg-wrap auto-cfg" data-slot="${slot}">
        <div class="cfg-col">
          <fieldset class="cfg-box"><legend>① 무엇을 보고 시작할지 (진공 감지)</legend>
            <div class="cfg-row"><label>신호</label>
              ${cfgRadios('acSrc', s.auto_src || 'do', [
                { v: 'do', n: 'DO (출력)' }, { v: 'di', n: 'DI (입력)' }])}</div>
            <div class="cfg-row"><label>채널</label>
              <input class="input" id="acCh" type="number" min="1" max="16"
                value="${Number(s.auto_ch) || 2}" style="width:74px">
              <span class="cfg-note">CH01~CH16 (기본 CH02 VACUUM)</span></div>
            <div class="cfg-row"><label>진공 ON 레벨</label>
              ${cfgRadios('acAct', s.auto_active || 'low', [
                { v: 'low', n: 'LOW' }, { v: 'high', n: 'HIGH' }])}</div>
            <div class="cfg-row"><label></label>
              <button type="button" class="btn btn-mini" onclick="App.monAutoProbe(${slot})">🔎 지금 읽기</button>
              <span class="cfg-note" id="acProbe">제품을 올렸다 내렸다 하며 눌러 보면 채널·레벨을 맞출 수 있습니다</span></div>
          </fieldset>

          <fieldset class="cfg-box"><legend>② 언제 시작할지</legend>
            <div class="cfg-row"><label>시작 지연</label>
              <input class="input" id="acDelay" type="number" min="0.2" max="10" step="0.1"
                value="${Number(s.auto_delay) || 1}" style="width:84px">
              <span class="cfg-note">초 — 진공 감지 후 첫 명령까지</span></div>
            <div class="cfg-note">검사가 끝나면 <b>제품을 한 번 빼야</b> 다음 검사가 시작됩니다.
              (같은 제품을 두 번 돌리지 않기 위한 안전장치 — 항상 적용)</div>
          </fieldset>
        </div>

        <div class="cfg-col">
          <fieldset class="cfg-box"><legend>③ 무엇을 보낼지 (시작 순서)</legend>
            <div class="cfg-note">위에서부터 차례로 전송합니다. 실린더 동작처럼
              START 앞에 넣어야 할 명령이 있으면 단계를 추가하세요.</div>
            <div class="auto-steps" id="acSteps">
              ${steps.map((st, i) => monAutoStepRow(st, i)).join('')}
            </div>
            <div class="cfg-row" style="margin-top:10px">
              <button type="button" class="btn btn-mini" onclick="App.monAutoStepAdd()">+ 단계 추가</button>
              <span class="cfg-note">최대 8단계</span></div>
          </fieldset>
          <div class="cfg-note" style="padding:0 4px">
            ※ 이 설정은 <b>1·2·3번 검사기 공통</b>입니다. 켜고 끄는 것만 슬롯별로 동작합니다.</div>
        </div>

        <div class="cfg-foot">
          <button class="btn" onclick="App.monAutoStepReset()">↺ 기본값 (START 하나)</button>
          <span style="flex:1"></span>
          <button class="btn btn-ghost" onclick="App.closeModal()">취소</button>
          <button class="btn btn-primary" onclick="App.monAutoConfigSave(${slot})">✔ 저장</button>
        </div>
      </div>`);
  }

  function monAutoStepRow(st, i) {
    return `<div class="auto-step" data-i="${i}">
      <span class="as-no">${i + 1}</span>
      <input class="input as-cmd" value="${esc(st.cmd || '')}" placeholder="예: START / DO 0 0"
        style="font-family:var(--mono)">
      <input class="input as-wait" type="number" min="0" max="30" step="0.1"
        value="${Number(st.wait) || 0}" title="이 명령을 보낸 뒤 다음 단계까지 대기(초)">
      <span class="cfg-note">초</span>
      <button type="button" class="btn btn-mini btn-ghost" onclick="App.monAutoStepMove(${i},-1)" title="위로">▲</button>
      <button type="button" class="btn btn-mini btn-ghost" onclick="App.monAutoStepMove(${i},1)" title="아래로">▼</button>
      <button type="button" class="btn btn-mini btn-ghost" onclick="App.monAutoStepDel(${i})" title="삭제">✕</button>
    </div>`;
  }

  // keepEmpty=true 면 아직 입력하지 않은 빈 단계도 남긴다(화면 다시 그릴 때)
  function monAutoStepsRead(keepEmpty) {
    const list = [...document.querySelectorAll('#acSteps .auto-step')].map(r => ({
      cmd: r.querySelector('.as-cmd').value.trim(),
      wait: parseFloat(r.querySelector('.as-wait').value) || 0,
    }));
    return keepEmpty ? list : list.filter(x => x.cmd);
  }
  function monAutoStepsDraw(list) {
    const box = $('acSteps');
    if (box) box.innerHTML = list.map((st, i) => monAutoStepRow(st, i)).join('');
  }
  function monAutoStepAdd() {
    const list = monAutoStepsRead(true);
    if (list.length >= 8) { alert('단계는 최대 8개까지입니다.'); return; }
    list.push({ cmd: '', wait: 0 });
    monAutoStepsDraw(list);
    const rows = document.querySelectorAll('#acSteps .as-cmd');
    if (rows.length) rows[rows.length - 1].focus();
  }
  function monAutoStepDel(i) {
    const list = monAutoStepsRead(true);
    list.splice(i, 1);
    monAutoStepsDraw(list.length ? list : [{ cmd: 'START', wait: 0 }]);
  }
  function monAutoStepMove(i, d) {
    const list = monAutoStepsRead(true);
    const j = i + d;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    monAutoStepsDraw(list);
  }
  function monAutoStepReset() { monAutoStepsDraw([{ cmd: 'START', wait: 0 }]); }

  async function monAutoProbe(slot) {
    const el = $('acProbe');
    if (el) el.textContent = '읽는 중…';
    // 화면에서 고른 값을 먼저 저장해야 서버가 그 채널을 읽는다
    await monAutoConfigSave(slot, true);
    const r = await api.post('/api/monitor/autoprobe', { slot });
    if (!el) return;
    if (r && r.error) { el.innerHTML = `<b style="color:var(--danger)">${esc(r.error)}</b>`; return; }
    el.innerHTML = `${esc(r.src.toUpperCase())} CH${String(r.ch).padStart(2, '0')} = <b>${r.level}</b> → ` +
      (r.vacuum ? '<b style="color:var(--ok)">진공 ON (제품 있음)</b>'
                : '<b style="color:var(--text-3)">진공 OFF (제품 없음)</b>');
  }

  async function monAutoConfigSave(slot, quiet) {
    const pick = (name, fb) => {
      const el = document.querySelector(`input[name="${name}"]:checked`);
      return el ? el.value : fb;
    };
    const next = {
      auto_src: pick('acSrc', 'do'),
      auto_ch: parseInt($('acCh').value, 10) || 2,
      auto_active: pick('acAct', 'low'),
      auto_delay: parseFloat($('acDelay').value) || 1.0,
      auto_steps: monAutoStepsRead(),
    };
    const r = await api.post('/api/monitor/settings', { settings: next });
    if (r && r.error) { alert('설정을 저장하지 못했습니다.\n\n' + r.error); return false; }
    const mon = monState();
    mon.settings = Object.assign({}, mon.settings, (r && r.settings) || next);
    if (!quiet) {
      closeModal();
      const on = ((mon.slots[slot] || {}).auto || {}).on;
      toast(on ? '반자동 설정 저장 — 다음 제품부터 적용됩니다' : '반자동 설정을 저장했습니다');
    }
    return true;
  }

  function monAutoPaint(slot) {
    const b = $('mAuto' + slot);
    if (!b) return;
    const a = monState().slots[slot].auto || {};
    b.classList.toggle('on', !!a.on);
    b.textContent = a.on ? '⚡ 반자동 ON' : '⚡ 반자동';
    b.title = a.on
      ? `반자동 시작 동작 중${a.state ? ' — ' + a.state : ''} (자동 시작 ${a.count || 0}회)`
      : '클릭 = 반자동 시작 ON/OFF · 더블클릭 = 설정';
  }

  // 터미널 슬롯 상단 카운터 — 이 화면에 찍힌 로그의 검사 회차 집계.
  // (검사가 끝까지 진행된 회차만 셈 — PBA 데이터로거와 같은 기준)
  function monSlotCount(k) {
    const el = $('mCnt' + k);
    if (!el) return;
    const sl = monState().slots[k];
    const runs = sl.runs || [];
    const qc = sl.qc || {};
    const warn = [];
    const au = sl.auto || {};
    if (au.on) warn.push(`<span class="mc-auto" title="반자동 시작 동작 중">⚡` +
      `${au.state ? ' ' + esc(au.state) : ''}${au.count ? ` · ${au.count}회` : ''}</span>`);
    if (qc.aborted) warn.push(`<span class="mc-warn" title="검사 시작만 하고 중간에 중단된 회차 — 집계에서 제외했습니다">⚠ 중단 ${qc.aborted}</span>`);
    if (qc.repaired) warn.push(`<span class="mc-warn" title="전송 중 글자가 깨져 들어온 측정값을 체크섬으로 복구했습니다">↺ 복구 ${qc.repaired}</span>`);
    if (!runs.length) {
      el.innerHTML = `<span class="mc-dim">검사 결과 없음</span>${warn.join('')}`;
      return;
    }
    const total = runs.length;
    const ng = runs.filter(r => r.is_ng).length;
    const ok = total - ng;
    const y = ok / total * 100;
    const ycls = y >= 95 ? 'mc-ok' : y >= 90 ? 'mc-warn' : 'mc-ng';
    const model = (runs[runs.length - 1] || {}).model || '';
    el.innerHTML =
      (model ? `<span class="mc-model" title="이 슬롯에서 마지막으로 확인된 모델">${esc(model)}</span>` : '') +
      `<span class="mc-t">총 <b>${total}</b></span>` +
      `<span class="mc-ok">OK <b>${ok}</b></span>` +
      `<span class="mc-ng">NG <b>${ng}</b></span>` +
      `<span class="${ycls}">${y >= 99.95 ? '100' : y.toFixed(1)}%</span>` +
      warn.join('');
  }

  function monDlStats(k) {
    const el = $('mDStats' + k);
    if (!el) return;
    const runs = monState().slots[k].runs;
    if (!runs.length) { el.innerHTML = '<span class="ms-dim">데이터 없음</span>'; return; }
    const last = runs[runs.length - 1];
    const total = runs.length;
    const ng = runs.filter(r => r.is_ng).length;
    const ok = total - ng;
    const y = ok / total * 100;
    const ycls = y >= 95 ? 'ms-ok' : y >= 90 ? 'ms-warn' : 'ms-ng';
    el.innerHTML = `
      <span class="ms-k">MODEL</span><span class="ms-v">${esc(last.model || '-')}</span>
      <span class="ms-k">EQ</span><span class="ms-v">${esc(last.equip_no || '0')}</span>
      <span class="ms-k">PROC</span><span class="ms-v">${esc(last.process || '-')}</span>
      <span class="ms-sep"></span>
      <span class="ms-v">총 ${total}</span>
      <span class="ms-ok">OK ${ok}</span>
      <span class="ms-ng">NG ${ng}</span>
      <span class="${ycls}">${y >= 99.95 ? '100' : y.toFixed(1)}%</span>`;
  }

  async function monImportFiles(input, slot) {
    const files = [...(input.files || [])];
    input.value = '';
    await monLoadFiles(files, slot || 1);
  }

  // 파일 불러오기 공통 처리 — 파일 선택·드래그앤드랍 모두 여기로.
  // KNKT/PBA DataLogger 처럼: 해당 슬롯의 터미널 화면에 원문을 그대로 표시하고,
  // 동시에 서버 파서로 보내 검사 결과·데이터로거 표에 반영한다.
  async function monLoadFiles(files, slot) {
    slot = slot || 1;
    files = [...(files || [])];
    if (!files.length) return;
    const sl = monState().slots[slot];
    let added = 0, captured = 0;
    for (const f of files) {
      if (f.size > 30 * 1024 * 1024) {    // 비정상적으로 큰 파일 보호
        alert(`${f.name}\n30MB가 넘는 파일은 불러올 수 없습니다.`);
        continue;
      }
      const buf = await f.arrayBuffer();
      let text;
      try { text = new TextDecoder('euc-kr').decode(buf); }     // KNK 로그는 cp949
      catch (e) { text = new TextDecoder().decode(buf); }
      if (slot === 1) monTermFeed({ k: 'tx', t: `\n>>> 파일 불러오기: ${f.name}\n` });
      // 슬롯 화면에 '어떤 파일을 얹었는지' 표시 — 이 줄은 화면에만 남고
      // 저장 파일에는 들어가지 않는다(원본과 같은 내용이 저장되도록).
      monScreenFeed(slot, `$F4[파일 불러오기] ${String(f.name).replace(/\$/g, '')}$FR\n`);
      // 해당 슬롯 터미널 화면에 컬러 렌더링 (아주 큰 파일은 표시 생략 — 파싱은 진행)
      if (!sl.freeze && text.length < 400000) monScreenFeed(slot, text);
      else if (!sl.freeze) monScreenFeed(slot, `$F3(파일이 커서 화면 표시는 생략했습니다 — 저장·분석에는 포함)$FR\n`);
      const r = await api.post('/api/monitor/import', { slot, text });
      added += (r && r.added) || 0;
      captured = (r && r.captured) || captured;   // 서버 저장 버퍼에 쌓인 총 글자 수
    }
    if (captured) monScreenFeed(slot,
      `$F4[💾 저장 대상 ${captured.toLocaleString()}자]$FR\n`);
    if ($('mStatus')) $('mStatus').textContent =
      `${slot}번 검사기: 로그 ${files.length}개에서 ${added}건 불러옴`;
    await monPoll();
  }

  // ---- 드래그앤드랍 ----
  // KNKT.exe·PBADataLogger.exe 처럼 창 어디에 놓아도 동작하도록 document 레벨로
  // 잡는다. 슬롯 위에 놓으면 그 슬롯으로, 그 외에는 1번 검사기로 들어간다.
  function monHookDnD() {
    if (state.monDndHooked) return;       // document 리스너는 앱 수명 동안 한 번만
    state.monDndHooked = true;
    const active = () => !!$('mDot');     // 모니터 화면일 때만 관여
    const hasFiles = (e) => {
      try { return [...e.dataTransfer.types].includes('Files'); }
      catch (err) { return false; }
    };
    const mark = (on) => { const v = view(); if (v) v.classList.toggle('mon-dropping', on); };
    const hotSlot = (e) => (e.target && e.target.closest) ? e.target.closest('.mon-slot') : null;
    const clearHot = (except) => document.querySelectorAll('.mon-slot.drop-hot')
      .forEach(x => { if (x !== except) x.classList.remove('drop-hot'); });
    document.addEventListener('dragenter', e => {
      if (active() && hasFiles(e)) { e.preventDefault(); mark(true); }
    });
    document.addEventListener('dragover', e => {
      if (active() && hasFiles(e)) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        mark(true);
        const hot = hotSlot(e);
        clearHot(hot);
        if (hot) hot.classList.add('drop-hot');
      }
    });
    document.addEventListener('dragleave', e => {
      // relatedTarget 이 null 이면 창 밖으로 나간 것
      if (!e.relatedTarget) { mark(false); clearHot(null); }
    });
    document.addEventListener('drop', e => {
      if (!active()) return;
      e.preventDefault();                 // 모니터 화면에서는 브라우저의 파일 열기 방지
      mark(false);
      const hot = hotSlot(e);
      clearHot(null);
      if (hasFiles(e)) monLoadFiles(e.dataTransfer.files, hot ? +hot.dataset.slot : 1);
    });
  }

  // ---- 데이터로거 (PBA) — 슬롯별 와이드 표 + 검사기 간 비교 ----
  // PBA DataLogger CSV 와 같은 구조: No/Date Time/Eqpid No/Model/Process/
  // <측정 항목 열…>/Tact Time/Result + Type·Spec MIN·Spec MAX 헤더 행.
  const MON_TYPE_MAP = { R: 'F', T: 'S', L: 'G' };   // 장비 레코드 → PBA 표기

  // 측정값 스펙 판정 (클라이언트 보강) — 서버 판정(NG)이 없어도 값이 스펙을
  // 벗어나면 불량으로 표시한다. 스펙 한쪽이 비어 있으면 그쪽은 검사하지 않음.
  function monSpecNg(value, lo, hi) {
    const v = parseFloat(value);
    if (isNaN(v)) return false;
    const l = parseFloat(lo), h = parseFloat(hi);
    if (isNaN(l) && isNaN(h)) return false;
    return (!isNaN(l) && v < l) || (!isNaN(h) && v > h);
  }
  // 빨간 표시는 '검사 항목'(First/Last/Diff 같은 실측값)에만 한다.
  // WATERPROOF 처럼 항목을 묶는 그룹 판정($L·?G)은 값이 아니라 묶음 결과라 제외.
  const MON_GROUP_TYPES = new Set(['L', 'G']);
  const monMeasNg = (m) => !MON_GROUP_TYPES.has(m.type)
    && (String(m.result || '').toUpperCase() === 'NG' || monSpecNg(m.value, m.spec_min, m.spec_max));

  function monDlBuild(runs) {
    const cols = [], meta = {};
    const keyed = (r) => {           // 같은 항목이 반복되면 PBA 처럼 -1, -2… 붙임
      const seen = {}, out = [];
      (r.measurements || []).forEach(m => {
        let key = m.caption || '(항목)';
        seen[key] = (seen[key] || 0) + 1;
        if (seen[key] > 1) key = `${key}-${seen[key] - 1}`;
        out.push([key, m]);
      });
      return out;
    };
    runs.forEach(r => keyed(r).forEach(([key, m]) => {
      if (!(key in meta)) {
        cols.push(key);
        meta[key] = { type: MON_TYPE_MAP[m.type] || m.type || '',
                      min: m.spec_min || '', max: m.spec_max || '' };
      }
    }));
    const head = ['No', 'Date Time', 'Eqpid No', 'Model', 'Process', ...cols, 'Tact Time', 'Result'];
    const typeRow = ['Type', '', 'N', 'M', 'P', ...cols.map(c => meta[c].type), 'F', 'S'];
    const minRow = ['Spec MIN', '', '', '', '', ...cols.map(c => meta[c].min), '', ''];
    const maxRow = ['Spec MAX', '', '', '', '', ...cols.map(c => meta[c].max), '', ''];
    const rows = runs.map((r, i) => {
      const vals = {};
      keyed(r).forEach(([key, m]) => {
        vals[key] = { v: m.value, ng: monMeasNg(m) };
      });
      return {
        cells: [i + 1, r.time, r.equip_no, r.model, r.process,
                ...cols.map(c => (vals[c] ? vals[c].v : '')), r.tact, r.result],
        ngCols: cols.map(c => !!(vals[c] && vals[c].ng)),
        isNg: r.is_ng,
      };
    });
    return { head, typeRow, minRow, maxRow, rows, cols, meta };
  }

  // PBA 데이터로거 하단 요약 — 열마다 AVG/MIN/MAX/Peak-peak/CPK.
  // 합격/불량 판정열(Type G·S, 값이 '0'/'F:…')은 제외하고, 아날로그 측정열과
  // Tact Time 처럼 '숫자 값' 열만 집계한다. CPK 는 스펙(MIN/MAX)이 있을 때만.
  const DL_SUM_SKIP = new Set(['G', 'S', '']);   // 그룹판정·텍스트·미상 → 요약 제외
  function monDlSummary(d) {
    const nCols = d.head.length, tactIdx = nCols - 2;
    const idxs = [];
    for (let ci = 5; ci < 5 + d.cols.length; ci++) {
      const type = d.meta[d.cols[ci - 5]].type;
      if (!DL_SUM_SKIP.has(type)) idxs.push(ci);
    }
    idxs.push(tactIdx);            // Tact Time 은 항상 집계
    const num = (x) => { const v = parseFloat(x); return isNaN(v) ? null : v; };
    const per = {};
    idxs.forEach(ci => {
      const vals = d.rows.map(r => num(r.cells[ci])).filter(v => v != null);
      if (!vals.length) { per[ci] = null; return; }
      const n = vals.length, mean = vals.reduce((a, b) => a + b, 0) / n;
      const mn = Math.min(...vals), mx = Math.max(...vals);
      const sd = n > 1 ? Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)) : 0;
      let cpk = null;
      const lsl = num(d.minRow[ci]), usl = num(d.maxRow[ci]);
      if (sd > 0 && (lsl != null || usl != null)) {
        const cps = [];
        if (usl != null) cps.push((usl - mean) / (3 * sd));
        if (lsl != null) cps.push((mean - lsl) / (3 * sd));
        cpk = Math.min(...cps);
      }
      per[ci] = { avg: mean, min: mn, max: mx, pp: mx - mn, cpk };
    });
    const fmt = (v) => v == null ? '' : (Math.abs(v) >= 1000 ? v.toFixed(0) : v.toFixed(2));
    const mk = (label, pick) => {
      const cells = new Array(nCols).fill('');
      cells[0] = label;
      idxs.forEach(ci => { cells[ci] = per[ci] ? fmt(pick(per[ci])) : ''; });
      return cells;
    };
    return [
      mk('AVG', s => s.avg), mk('MIN', s => s.min), mk('MAX', s => s.max),
      mk('Peak-peak', s => s.pp), mk('CPK', s => s.cpk),
    ];
  }

  function monDlRenderSlot(k) {
    const tbl = $('mDlTable' + k);
    if (!tbl) return;
    const runs = monState().slots[k].runs;
    if (!runs.length) {
      tbl.innerHTML = `<tbody><tr><td class="mon-empty">아직 데이터가 없습니다.<br>
        장비 연결 후 검사를 진행하거나, <b>.log/.txt</b> 파일을 이 슬롯에 끌어다 놓으세요.</td></tr></tbody>`;
      return;
    }
    const d = monDlBuild(runs);
    const metaTr = (row, cls) => `<tr class="${cls}">${row.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`;
    const summary = monState().dlSummary
      ? `<tfoot>${monDlSummary(d).map(row => metaTr(row, 'dl-sum')).join('')}</tfoot>` : '';
    // Type 행은 화면에 표시하지 않는다 (CSV 내보내기에는 PBA 호환용으로 유지)
    tbl.innerHTML = `
      <thead>
        <tr>${d.head.map(h => `<th>${esc(h)}</th>`).join('')}</tr>
        ${metaTr(d.minRow, 'dl-meta')}${metaTr(d.maxRow, 'dl-meta')}
      </thead>
      <tbody>
        ${d.rows.map(r => {
          const last = r.cells.length - 1;
          return `<tr>${r.cells.map((c, ci) => {
            if (ci === 0) return `<td class="${r.isNg ? 'dl-ngno' : ''}">${esc(c)}</td>`;
            if (ci === last) return `<td><span class="jbadge ${r.isNg ? 'j-알림' : 'j-정상'}">${esc(c)}</span></td>`;
            const ng = ci >= 5 && ci < 5 + d.cols.length && r.ngCols[ci - 5];
            return `<td class="${ci >= 5 ? 'val' : ''}${ng ? ' dl-ng' : ''}">${esc(c)}</td>`;
          }).join('')}</tr>`;
        }).join('')}
      </tbody>
      ${summary}`;
  }

  function monDlRender() {
    const mon = monState();
    for (let k = 1; k <= 3; k++) {
      if (k <= mon.dlSlots) monDlRenderSlot(k);
      monDlStats(k);
    }
    monDlCompare();
  }

  // 검사기 간 비교 — 2분할 이상일 때 항목별 평균을 나란히 놓고 편차를 강조한다.
  // 편차율 = (최대-최소) / 중간값 × 100.  5%↑ 노랑, 10%↑ 빨강.
  function monDlCompare() {
    const mon = monState();
    const box = $('mDlCompare');
    if (!box) return;
    const act = [1, 2, 3].slice(0, mon.dlSlots).filter(k => mon.slots[k].runs.length);
    if (mon.dlSlots < 2 || act.length < 2) { box.classList.add('hidden'); box.innerHTML = ''; return; }
    box.classList.remove('hidden');

    const stats = {};   // caption → {slot: {sum, n, ng}}
    act.forEach(k => mon.slots[k].runs.forEach(r => {
      // 불량은 '회차(가로줄)' 단위로 센다 — 한 회차에서 같은 항목이 여러 번
      // 스펙을 벗어나도 그 항목의 불량은 1회. (검사항목만 — 그룹 판정 제외)
      const ngInRun = new Set();
      (r.measurements || []).forEach(m => {
        const c = m.caption || '(항목)';
        const s = (stats[c] = stats[c] || {});
        const e = (s[k] = s[k] || { sum: 0, n: 0, ng: 0 });
        const v = parseFloat(m.value);
        if (!isNaN(v)) { e.sum += v; e.n++; }
        if (monMeasNg(m)) ngInRun.add(c);
      });
      ngInRun.forEach(c => { stats[c][k].ng++; });
    }));

    const rows = Object.entries(stats).map(([cap, s]) => {
      const avgs = act.map(k => (s[k] && s[k].n) ? s[k].sum / s[k].n : null);
      const nums = avgs.filter(v => v != null);
      let dev = null;
      if (nums.length >= 2) {
        const mx = Math.max(...nums), mn = Math.min(...nums), mid = (mx + mn) / 2;
        dev = mid ? Math.abs(mx - mn) / Math.abs(mid) * 100 : (mx === mn ? 0 : 100);
      }
      return { cap, avgs, dev, ngs: act.map(k => s[k] ? s[k].ng : 0) };
    }).sort((a, b) => ((b.dev == null ? -1 : b.dev) - (a.dev == null ? -1 : a.dev)));

    const fmt = (v) => v == null ? '–' : (Math.abs(v) >= 1000 ? v.toFixed(0) : v.toFixed(2));
    box.innerHTML = `
      <div class="mon-cmp">
        <div class="card-title" style="font-size:13px">🔍 검사기 간 비교
          <span class="hint" style="font-weight:400">항목별 평균 — 편차 5%↑ <span style="color:var(--warn)">노랑</span> · 10%↑ <span style="color:var(--danger)">빨강</span> (편차 큰 순 정렬)</span></div>
        <div class="table-wrap mon-tbl mt8" style="max-height:280px">
          <table class="meas mon-dl"><thead><tr>
            <th>측정 항목</th>${act.map(k => `<th>${k}번 평균</th>`).join('')}<th>편차</th>${act.map(k => `<th>${k}번 NG</th>`).join('')}
          </tr></thead><tbody>
          ${rows.map(r => {
            const cls = r.dev == null ? '' : (r.dev >= 10 ? 'cmp-bad' : (r.dev >= 5 ? 'cmp-warn' : ''));
            return `<tr class="${cls}"><td>${esc(r.cap)}</td>
              ${r.avgs.map(v => `<td class="val">${fmt(v)}</td>`).join('')}
              <td class="val"><b>${r.dev == null ? '–' : r.dev.toFixed(1) + '%'}</b></td>
              ${r.ngs.map(n => `<td class="val${n ? ' dl-ng' : ''}">${n}</td>`).join('')}</tr>`;
          }).join('')}
          </tbody></table>
        </div>
      </div>`;
  }

  function monDlExport(slot) {
    slot = slot || 1;
    const runs = monState().slots[slot].runs;
    if (!runs.length) { alert(`${slot}번 검사기에 내보낼 데이터가 없습니다.`); return; }
    const d = monDlBuild(runs);
    const cell = (c) => {
      c = String(c == null ? '' : c);
      return /[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c;
    };
    const lines = [d.head, d.typeRow, d.minRow, d.maxRow, ...d.rows.map(r => r.cells)]
      .map(row => row.map(cell).join(','));
    // utf-8 BOM — 엑셀에서 한글 항목명이 바로 열리도록
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    const dt = new Date(), p = (n) => String(n).padStart(2, '0');
    a.href = URL.createObjectURL(blob);
    a.download = `PBA_데이터로거_${slot}번_${dt.getFullYear()}${p(dt.getMonth() + 1)}${p(dt.getDate())}_${p(dt.getHours())}${p(dt.getMinutes())}${p(dt.getSeconds())}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  // 데이터로거 쪽 지우기 — 터미널 지우기와 같은 동작(슬롯 전체 초기화)
  async function monClear(slot) {
    await monScreenClear(slot || 1);
  }

  // ---- 콘솔 터미널 / 슬롯 화면 ----
  function monTermFeed(e) {
    const mon = monState();
    const box = $('mTerm');
    if (!box) return;
    if (e.k === 'tx' && !monCfg().local_echo) return;   // 설정: 로컬 에코 해제
    const span = document.createElement('span');
    if (e.k === 'tx') span.className = 'tx';
    span.textContent = (e.t || '').replace(MON_COLOUR, '');
    box.appendChild(span);
    // 화면에 그려 두는 분량만 제한(성능) — 저장되는 로그는 서버에 전부 남는다
    while (box.childNodes.length > MON_SCREEN_NODES) box.removeChild(box.firstChild);
    if (mon.autoscroll) box.scrollTop = box.scrollHeight;
  }
  const monAutoscroll = (on) => { monState().autoscroll = on; };
  const monFreeze = (slot, on) => { monState().slots[slot || 1].freeze = on; };
  // 지우기 = 이 슬롯을 새 로그로 시작한다 —
  // 화면 글자 + 집계(총/OK/NG) + 서버의 저장 버퍼까지 함께 비운다.
  // (예전에는 화면만 지워서, 지우고 새로 찍은 뒤 저장하면 지우기 이전 내용까지 파일에 나왔다)
  async function monScreenClear(slot) {
    slot = slot || 1;
    const sl = monState().slots[slot];
    if (sl.runs.length && !confirm(
      `${slot}번 검사기를 새 로그로 시작합니다.\n\n` +
      `· 화면 내용\n· 수집된 검사 결과 ${sl.runs.length}건\n· 저장(💾)될 로그 전체\n\n` +
      '위 내용이 모두 지워집니다. 계속할까요?')) return;
    await api.post('/api/monitor/clear', { slot });
    const b = $('mScreen' + slot);
    if (b) b.innerHTML = '';
    sl.runs = [];
    sl.sel = null;
    sl.qc = {};
    sl.scr = { fg: '0', bg: null, bold: false, saved: '0', pending: '' };
    monCaretDraw(slot);          // 입력 커서 줄은 다시 만들어 준다
    monSlotCount(slot);
    monDlStats(slot);
    monDlRender();
  }

  async function monSaveScreen(slot) {
    // KNK터미널의 로그 저장과 동일 — 이름을 물어보고 바탕화면에 .txt 로 저장.
    // 서버가 연결 후 수신한 원문 전체(컬러코드 포함)를 쓰므로, 저장한 파일을
    // '로그 파일 불러오기'로 다시 읽어 재분석할 수 있다.
    slot = slot || 1;
    // 파일 이름 기본값 = "모델명 N호기" (뒤에 아무것도 붙이지 않는다).
    // 모델명·호기번호는 이 슬롯이 실제로 받은 로그($$M · $$N 레코드)에서 가져온다.
    const sl = monState().slots[slot];
    const last = [...(sl.runs || [])].reverse().find(r => r.model);
    const clean = (s) => String(s || '').replace(/[<>:"/\\|?*]/g, '').trim();
    const eq = last ? (parseInt(last.equip_no, 10) || 0) : 0;
    const def = last ? `${clean(last.model)} ${eq}호기` : `KNK 장비로그 ${slot}번`;
    const name = prompt(
      `${slot}번 검사기 — 바탕화면에 저장할 파일 이름을 입력하세요 (.log)` +
      (last ? '' : '\n※ 아직 모델명을 확인하지 못했습니다(검사 결과 수신 전)'), def);
    if (name == null) return;                       // 취소
    const r = await api.post('/api/monitor/save', { slot, name });
    if (r.error) { alert(r.error); return; }
    if ($('mStatus')) $('mStatus').textContent = `저장됨: ${r.path}`;
    alert('바탕화면에 저장했습니다.\n\n' + r.path);
  }

  // ---- 화면 배색 (KNK터미널 흰 바탕 ↔ 다크 콘솔) ----
  function monPaintSpan(span) {
    const pal = monPal();
    span.style.color = pal[span.dataset.fg] || pal['0'];
    span.style.background = span.dataset.bg ? (pal[span.dataset.bg] || '') : '';
  }

  function monApplyScreenTheme() {
    const pal = monPal(), bg = monScreenBg();
    document.querySelectorAll('.mon-screen, .mon-term').forEach(box => {
      box.style.background = bg;
      box.style.color = pal['F'];
      box.querySelectorAll('span[data-fg]').forEach(monPaintSpan);   // 이미 찍힌 글자도 다시 칠함
    });
    document.querySelectorAll('.mon-caretline .typed').forEach(e => { e.style.color = pal['F']; });
  }

  function monScreenFeed(slot, chunk) {
    // KNKT.exe 와 같은 컬러 터미널 해석: $Fx 전경 / $Bx 배경 / $$ 리터럴 '$' /
    // *CLS 화면 지우기.
    //   $FS = 지금 색을 기억하고 굵게      $FR = 기억한 색으로 되돌리고 굵게 해제
    // 장비 로그는 `$F1$FS$FF[$FRP1.M1 450MHz$FS$FF:$FR...` 처럼 괄호·콜론만
    // 잠깐 다른 색으로 찍고 $FR 로 줄 색(여기선 빨강)으로 돌아온다. $FR 을
    // '기본색으로 초기화' 로 해석하면 항목명이 전부 기본색이 되어 KNK터미널과
    // 달라 보인다(실기 화면 대조 확인).
    // 청크 경계에서 토큰이 잘릴 수 있어 꼬리를 보관했다가 다음 청크와 이어붙인다.
    const sl = monState().slots[slot || 1];
    const box = $('mScreen' + (slot || 1));
    if (!box) return;
    let data = sl.scr.pending + chunk;
    let keep = 0;
    for (const k of [4, 3, 2, 1]) {
      const tail = data.slice(-k);
      if (['$$', '$F', '$B', '*CLS'].some(t => t.startsWith(tail))) { keep = k; break; }
    }
    if (keep) { sl.scr.pending = data.slice(-keep); data = data.slice(0, -keep); }
    else sl.scr.pending = '';
    if (!data) return;

    const emit = (s) => {
      if (!s) return;
      const span = document.createElement('span');
      span.textContent = s;
      // 색 번호를 남겨 둔다 — 배색을 바꿔도 이미 찍힌 글자까지 다시 칠할 수 있게
      span.dataset.fg = sl.scr.fg;
      if (sl.scr.bg && sl.scr.bg !== '0') span.dataset.bg = sl.scr.bg;
      if (sl.scr.bold) span.style.fontWeight = '700';
      monPaintSpan(span);
      box.appendChild(span);
    };
    let pos = 0, m;
    MON_TOKEN.lastIndex = 0;
    while ((m = MON_TOKEN.exec(data)) !== null) {
      if (m.index > pos) emit(data.slice(pos, m.index));
      const tok = m[0];
      if (tok === '*CLS') box.innerHTML = '';
      else if (tok === '$$') emit('$');
      else if (tok === '$FR') { sl.scr.fg = sl.scr.saved || '0'; sl.scr.bg = null; sl.scr.bold = false; }
      else if (tok === '$FS') { sl.scr.saved = sl.scr.fg; sl.scr.bold = true; }
      else if (tok[1] === 'F') sl.scr.fg = tok[2].toUpperCase();
      else {
        // $Bx 배경색 — DOS 팔레트에서 0 = 기본(검정)이므로 '$B0' 은 배경 해제.
        // (팔레트 0번을 배경으로 칠하면 배너 이후 모든 줄에 회색 띠가 생긴다)
        const bg = tok[2].toUpperCase();
        sl.scr.bg = bg === '0' ? null : bg;
      }
      pos = m.index + tok.length;
    }
    if (pos < data.length) emit(data.slice(pos));
    // 화면 렌더링 분량만 제한 — 수신 원문은 서버가 파일로 전부 보관(스크롤백 무한대)
    while (box.childNodes.length > MON_SCREEN_NODES) box.removeChild(box.firstChild);
    monCaretDraw(slot || 1);     // 입력 커서는 항상 받은 내용 뒤에
    box.scrollTop = box.scrollHeight;
  }

  // ------------------------------------------------------------ init
  // ------------------------------------------------------------ 전역 편의
  function globalKeys(e) {
    monAutoHotkey(e);            // Ctrl+T / Ctrl+C 5연타 — 반자동 버튼 표시/숨김
    // 설명(?) 팝업이 떠 있으면 Esc 로 먼저 닫는다
    const hp = $('monHelpPop');
    if (hp && hp.classList.contains('on')) {
      if (e.key === 'Escape') { monHelpClose(); e.preventDefault(); }
      return;
    }
    // 모니터 확장 모드 — Esc 로 축소
    if (state.mon && state.mon.maxed && e.key === 'Escape') {
      App.monMax(false);
      e.preventDefault();
      return;
    }
    // 뷰어가 열려 있으면 뷰어 단축키 우선
    const vw = $('imgViewer');
    if (vw && vw.classList.contains('on')) { viewerKeys(e); return; }
    const md = $('appModal');
    if (md && md.classList.contains('on')) {
      if (e.key === 'Escape') { closeModal(); e.preventDefault(); }
      return;
    }
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target.tagName || '')) || e.target.isContentEditable;
    // Ctrl+F: 현재 화면의 첫 검색창으로 포커스
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
      const box = $('if_model') || $('h_model') || $('chatText') || $('quickIssue');
      if (box) { e.preventDefault(); box.focus(); box.select && box.select(); }
      return;
    }
    if (typing) return;
    // 숫자 단축키로 화면 이동
    const map = { 1: 'home', 2: 'setup', 3: 'history', 4: 'issues', 5: 'analytics', 6: 'chat', 7: 'monitor' };
    if (map[e.key]) { go(map[e.key]); return; }
    if (e.key === '?') showHelp();
  }

  function showHelp() {
    alert('⌨ 단축키\n\n' +
      '[화면 이동] 1 홈 · 2 새 검증 · 3 히스토리 · 4 이슈 관리 · 5 분석 · 6 AI 도우미 · 7 모니터\n' +
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
    initPwa();                                          // 홈 화면에 추가(앱 설치) 안내
    initUpdateCheck();                                  // 새 버전 배포 감지
    if (isDemo() && $('demoBar')) $('demoBar').classList.remove('hidden');   // 데모 전역 안내
    go('home');
  }
  document.addEventListener('DOMContentLoaded', init);

  // ---------------------------------------------------- 📲 홈 화면에 추가 (PWA)
  // 설치 전이면 상단에 작은 안내 바가 계속 표시되고, 설치(standalone 실행)하면 사라진다.
  let deferredInstall = null;

  function isStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches
      || window.navigator.standalone === true;           // iOS Safari
  }

  function initPwa() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
    const bar = $('a2hsBar');
    if (!bar || isStandalone()) return;                  // 이미 앱으로 실행 중 → 안내 불필요

    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    bar.classList.remove('hidden');
    if (isIos) {                                         // iOS는 설치 API가 없어 방법 안내
      $('a2hsBtn').classList.add('hidden');
      $('a2hsIos').classList.remove('hidden');
    }
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();                                // 브라우저 기본 미니바 대신 우리 버튼으로
      deferredInstall = e;
      bar.classList.remove('hidden');
    });
    window.addEventListener('appinstalled', () => {      // 설치 완료 → 안내 제거
      bar.classList.add('hidden');
      deferredInstall = null;
      toast('KNK 지킴이 홈 화면에 추가되었습니다.');
    });
  }

  // -------------------------------------------- 🔄 새 버전 배포 감지 (자동 업데이트 안내)
  // 깃허브 main 에 푸시하면 Vercel 이 자동 재배포한다. 이미 열려 있는 화면은 그대로이므로,
  // 배포 파일(app.js/style.css/index.html)의 ETag 를 주기적으로 비교해 바뀌면 안내한다.
  // (버전 번호를 따로 관리할 필요 없음 — 파일 내용이 바뀌면 ETag 가 바뀐다)
  const UPDATE_FILES = ['/js/app.js', '/css/style.css', '/'];
  let updateBaseline = null;

  async function updateFingerprint() {
    const tags = [];
    for (const u of UPDATE_FILES) {
      try {
        const r = await fetch(u, { method: 'HEAD', cache: 'no-store' });
        tags.push(r.headers.get('etag') || r.headers.get('last-modified') || '');
      } catch (e) { return null; }              // 오프라인 등 — 이번 확인은 건너뜀
    }
    if (!tags.some(Boolean)) return null;       // 로컬 서버(ETag 없음)에서는 비활성
    return tags.join('|');
  }

  async function initUpdateCheck() {
    updateBaseline = await updateFingerprint();
    if (updateBaseline == null) return;         // 감지 불가 환경(로컬 실행 등)
    const check = async () => {
      const now = await updateFingerprint();
      if (now && updateBaseline && now !== updateBaseline) {
        const bar = $('updateBar');
        if (bar) bar.classList.remove('hidden');
      }
    };
    setInterval(check, 5 * 60 * 1000);          // 5분마다
    document.addEventListener('visibilitychange', () => {   // 탭/앱으로 돌아올 때 즉시
      if (!document.hidden) check();
    });
  }

  async function applyUpdate() {
    try {                                        // 서비스워커 캐시 비우고 새로 받는다
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) await reg.update();
    } catch (e) { /* 캐시 정리 실패해도 새로고침으로 진행 */ }
    location.reload();
  }

  async function installApp() {
    if (deferredInstall) {
      deferredInstall.prompt();
      const choice = await deferredInstall.userChoice.catch(() => null);
      if (choice && choice.outcome === 'accepted') $('a2hsBar').classList.add('hidden');
      deferredInstall = null;
      return;
    }
    // 설치 이벤트가 아직 없을 때(데스크톱 크롬 등) — 브라우저 메뉴 안내
    alert('브라우저 주소창 오른쪽의 설치 아이콘(⊕ 또는 모니터 모양)을 누르거나,\n' +
          '메뉴(⋮) → "앱 설치" / "홈 화면에 추가"를 선택해 주세요.');
  }

  return {
    go, startRun, pickMode, setItem, toggleDetail, markAll, parseLog, loadSample, onFile, finish,
    installApp, applyUpdate, retryFinishExport,
    downloadWeeklyReport, downloadBackup,
    resetHistoryFilter, searchHistory, toggleHistoryRow, toggleAllHistory, deleteSelectedHistory, exportHistory,
    historyPage,
    openRun, deleteRun, resumeRun,
    loadIssues, resetIssueForm, editIssue, saveIssue, saveIssueRaw, deleteIssue, retryIssueExport,
    issuePage, toggleIssue, toggleFormTag, filterByTag,
    suggestTags, autoTagInput,
    renderAnalytics, genDraft, copyDraft, openIssuesFor,
    sendChat, chatChip, toggleLocalAI, setAiModel,
    quickIssue, openModel,
    setTplTarget, insertTpl, addTemplate, delTemplate,
    onIssuePhotoFile, deleteIssuePhoto,
    pasteImport, exportIssues, syncServer, saveServerPath, loadServerPath,
    loadChatHistory, bookmarkChat, chatToIssue,
    openViewer, openViewerFrom, closeViewer, vwZoom, vwFit, vwRotate, vwStep,
    vwDownload, vwCopy, vwOpenTab,
    resetIssueFilter, clearIssueFilter, toTop, showHelp,
    reloadIssueForSave, forceSaveIssue, loadDuplicates, mergeModels,
    pasteFromClipboard, removePendingPhoto, savePhotoCaption, receivePhotos,
    // 호기 묶음 · Z: 서버 연동
    previewUnits, toggleCheckList,
    loadPriorUnitPhotos, openZPath, openShipFolder,
    retryServerIssues, skipServerIssues,
    loadZModel, previewExcel, closeModal,
    // 📡 KNK 모니터
    monToggleConn, monRefreshPorts, monTab, monUnsafeToggle,
    monQuickCmd, monUnsafeCmd, monSendTyped,
    monPollToggle, monDoClick, monSyncTime, monResetCounter, monIoVerbose,
    monSyncTimeAll, monResetCounterAll,
    monStart, monAbort, monImportFiles, monClear,
    monAutoscroll, monFreeze, monScreenClear, monSaveScreen, monDlExport, monTermMode,
    monTermSlots, monDlSlots, monMax, monFontSize, monSwap, monDlSummaryToggle,
    addModelBox,
    // ⚙ 터미널 설정 · 초보자용 ? 도움말
    monSettings, monSettingsSave, monSettingsDefault, monCfgPorts,
    monHelp, monHelpClose, monPalPreview, monPalPreset,
    // ⚡ 반자동 시작 (Ctrl+Alt+A 5연타로 버튼 표시 · 더블클릭 = 설정)
    monAutoClick, monAutoToggle, monAutoConfig, monAutoConfigSave, monAutoProbe,
    monAutoStepAdd, monAutoStepDel, monAutoStepMove, monAutoStepReset,
  };
})();
window.App = App;
