/* ===================================================================================
   KNK 검사기 출하검증 시스템 — 프론트엔드 (표준 JS, 빌드/CDN 불필요)
   =================================================================================== */
const App = (() => {
  const state = { boot: null, run: null, checkItems: [], setup: { verify_mode: '신규' }, judge: null };
  const $ = (id) => document.getElementById(id);
  const view = () => $('view');
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ------------------------------------------------------------ API
  const api = {
    get: (u) => fetch(u).then(r => r.json()),
    post: (u, b) => fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }).then(r => r.json()),
  };

  // ------------------------------------------------------------ 네비게이션
  function setNav(name) {
    document.querySelectorAll('.navbtn').forEach(b => b.classList.toggle('active', b.dataset.nav === name));
  }

  async function go(name) {
    if (!state.boot) state.boot = await api.get('/api/bootstrap');
    if (name === 'home') { setNav('home'); renderHome(); }
    else if (name === 'setup') { setNav('setup'); renderSetup(); }
    else if (name === 'verify') { setNav('setup'); renderVerify(); }
    else if (name === 'done') { setNav('setup'); renderDone(); }
    window.scrollTo(0, 0);
  }

  // ------------------------------------------------------------ 홈
  function renderHome() {
    view().innerHTML = `
      <section class="hero">
        <span class="tag">케이엔케이 품질팀 · 검사기 출하검증 자동화</span>
        <h1>출하 검사 순서도대로 검증하고,<br>데이터로 자동 판정합니다.</h1>
        <p>모델을 선택하면 과거 이슈를 먼저 안내하고, 순서도 22단계를 따라 검사 항목을 체크하며,
           검사 로그를 넣으면 Open/Short·경계·이탈을 자동 판정합니다. 모든 데이터는 로컬 DB에 축적됩니다.</p>
        <div class="actions">
          <button class="btn btn-lg" onclick="App.go('setup')">＋ 새 검증 시작</button>
        </div>
      </section>

      <div class="stat-row">
        <div class="stat"><b>7종</b><span>검사기 종류 지원</span></div>
        <div class="stat"><b>22단계</b><span>출하검사 순서도</span></div>
        <div class="stat"><b>자동</b><span>Open/Short 판정</span></div>
        <div class="stat"><b>호기편차</b><span>양산 모드 비교</span></div>
      </div>

      <div class="pipeline">
        <div class="pipe"><div class="n">STAGE 1</div><h4>검사기 검증</h4>
          <p>순서도 안내 · 검사 항목 체크 · 로그 자동 판정 · 호기 편차 비교 · 이슈 사전 안내</p>
          <span class="badge badge-now">● 현재 동작</span></div>
        <div class="pipe"><div class="n">STAGE 2</div><h4>문서 자동화</h4>
          <p>고객사별 체크시트 · 사진 배치 · 주말보고서 원클릭 (검증 데이터 재사용)</p>
          <span class="badge badge-next">확장 예정</span></div>
        <div class="pipe"><div class="n">STAGE 3</div><h4>AI 지원</h4>
          <p>셀프 AS 챗봇 · 보고서 요약 · 메뉴얼 학습 (issue_history + 순서도 근거)</p>
          <span class="badge badge-next">확장 예정</span></div>
      </div>

      <div class="card mt20">
        <div class="card-title">🗂 등록된 검사기 (로컬 DB)</div>
        <div class="card-sub">시연용 더미 데이터가 포함되어 있습니다. 양산 모드 검증 시 앞 호기 데이터와 자동 비교됩니다.</div>
        <div class="check-list mt12">
          ${(state.boot.testers || []).map(t => `
            <div class="check-row">
              <div class="info"><b>${esc(t.model_name)}</b>
                <small>${esc(t.tester_type)} · REV ${esc(t.model_rev || '-')} · 고객사 ${esc(t.customer || '-')}</small></div>
            </div>`).join('') || '<div class="check-row"><div class="info"><small>등록된 검사기가 없습니다.</small></div></div>'}
        </div>
      </div>`;
  }

  // ------------------------------------------------------------ 검증 설정
  function renderSetup() {
    const b = state.boot, s = state.setup;
    const typeOpts = b.tester_types.map(t => `<option ${s.tester_type === t ? 'selected' : ''}>${esc(t)}</option>`).join('');
    view().innerHTML = `
      <div class="row-between mt8"><h2 style="font-size:22px">새 검증 시작</h2></div>
      <p class="hint mt8">검사기 정보와 검증 모드를 입력하세요. 시작하면 해당 모델의 과거 이슈를 먼저 안내합니다.</p>

      <div class="card mt16">
        <div class="grid2">
          <div class="field"><label>모델명 <span class="req">*</span></label>
            <input class="input" id="f_model" placeholder="예) SM-S952 SUB" value="${esc(s.model_name || '')}"></div>
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
            <input class="input" id="f_inspector" placeholder="예) 홍길동" value="${esc(s.inspector || '')}"></div>
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
    return s;
  }

  async function startRun() {
    const s = collectSetup();
    if (!s.model_name || !s.tester_type || !s.inspector) {
      $('setupErr').textContent = '모델명 · 검사기 종류 · 검사자는 필수입니다.'; return;
    }
    const res = await api.post('/api/run/start', s);
    if (res.error) { $('setupErr').textContent = '오류: ' + res.error; return; }
    state.run = res;
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
            <div class="t">[${esc(i.item)}] ${esc(i.symptom)}</div>
            <div class="d">→ 조치/결론: ${esc(i.action)}</div>
            ${i.note ? `<div class="n">※ ${esc(i.note)}</div>` : ''}</div>`).join('')}
        </div>
      </div>

      <div class="card">
        <div class="card-title"><span style="background:var(--brand-50);color:var(--brand-700);padding:4px 10px;border-radius:8px;font-size:13px">${esc(r.mode)}</span> 모드 안내</div>
        <p class="card-sub mt8">${esc(r.mode_guide)}</p>${priorHtml}
      </div>

      <div class="card">
        <div class="card-title"><span class="section-num">1</span> 출하검사 순서도 (22단계)</div>
        <div class="card-sub">"지금 할 일"을 순서대로 안내합니다. 클릭하면 진행 표시됩니다.</div>
        <div class="flow mt12" id="flow">
          ${r.flow_steps.map((f, i) => flowStep(f, i)).join('')}
        </div>
      </div>

      <div class="card">
        <div class="card-title"><span class="section-num">2</span> 검사 항목 체크 (Check Sheet)</div>
        <div class="card-sub">최종 check Sheet 기준 항목. PASS/FAIL을 선택하세요. (고객사 전용 항목 포함)</div>
        <div class="check-list mt12" id="checkList">
          ${state.checkItems.map(checkRow).join('')}
        </div>
      </div>

      <div class="card">
        <div class="card-title"><span class="section-num">3</span> 검사 로그 자동 판정</div>
        <div class="card-sub">PASS DATA(CSV)를 붙여넣거나 파일을 올리면 Open/Short·경계·이탈을 자동 판정합니다.</div>
        <div class="mt12">
          <input type="file" id="logFile" accept=".csv,.txt,.log" style="display:none" onchange="App.onFile(event)">
          <div class="uploader" id="drop" onclick="document.getElementById('logFile').click()">
            📄 CSV/로그 파일을 클릭하여 선택 &nbsp;·&nbsp; 또는 아래에 붙여넣기
          </div>
          <textarea id="logText" class="mt12" placeholder="SECTION,ITEM,VALUE,SPEC_LOW,SPEC_HIGH,REPEAT_INDEX ..."></textarea>
          <div class="row-between mt8">
            <button class="btn btn-ghost" onclick="App.loadSample()">샘플 로그 불러오기</button>
            <button class="btn btn-primary" onclick="App.parseLog()">▶ 자동 판정 실행</button>
          </div>
          <div id="judgeResult"></div>
        </div>
      </div>

      <div class="card">
        <div class="card-title"><span class="section-num">4</span> 검사자 의견 & 검증 완료</div>
        <div class="card-sub">의견은 부품/증상 분류와 함께 축적되어, 이후 같은 부품 문제가 다른 모델에서 발생해도 검색됩니다.</div>
        <div class="grid2 mt12">
          <div class="field"><label>관련 부품</label>
            <select id="f_component"><option value="">선택 안 함</option>${(state.boot.component_types || []).map(c => `<option>${esc(c)}</option>`).join('')}</select></div>
          <div class="field"><label>증상 분류</label>
            <select id="f_symptom"><option value="">선택 안 함</option>${(state.boot.symptom_types || []).map(s => `<option>${esc(s)}</option>`).join('')}</select></div>
        </div>
        <textarea id="comment" class="mt12" placeholder="예) 1번 시료 DIFF 값이 다소 높음. 재조립 후 재측정 예정."></textarea>
        <button class="btn btn-accent btn-lg btn-block mt16" onclick="App.finish()">검증 완료 및 판정 →</button>
      </div>`;
    setupDrop();
  }

  function flowStep(f, i) {
    return `<div class="flow-step" data-step="${f.step_no}" onclick="App.toggleStep(${f.step_no})">
      <div class="no">${f.step_no}</div>
      <div class="body">
        <div class="title">${esc(f.title)}</div>
        ${f.description ? `<div class="desc">${esc(f.description)}</div>` : ''}
        ${f.action ? `<div class="action"><b>조치:</b> ${esc(f.action)}</div>` : ''}
      </div></div>`;
  }
  function toggleStep(no) {
    const el = document.querySelector(`.flow-step[data-step="${no}"]`);
    if (el) el.classList.toggle('done');
  }

  function checkRow(it) {
    return `<div class="check-row" data-item="${it.id}">
      <div class="seq">${it.seq}</div>
      <div class="info">
        <b>${esc(it.item_name)}</b> <span class="cat-tag">${esc(it.category)}</span>
        <small>${esc(it.test_desc || '')}</small>
        <small class="crit">규격: ${esc(it.criteria || '-')}</small>
      </div>
      <div class="seg">
        <button class="pass ${it.result === 'PASS' ? 'on' : ''}" onclick="App.setItem(${it.id},'PASS')">PASS</button>
        <button class="fail ${it.result === 'FAIL' ? 'on' : ''}" onclick="App.setItem(${it.id},'FAIL')">FAIL</button>
      </div></div>`;
  }
  async function setItem(id, result) {
    const it = state.checkItems.find(x => x.id === id);
    if (it && it.result === result) result = '미검사';
    if (it) it.result = result;
    const row = document.querySelector(`.check-row[data-item="${id}"]`);
    if (row) { row.querySelector('.pass').classList.toggle('on', result === 'PASS'); row.querySelector('.fail').classList.toggle('on', result === 'FAIL'); }
    await api.post('/api/run/checkitem', { item_id: id, result });
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
  async function loadSample() { const r = await api.get('/api/sample-log'); $('logText').value = r.text; }

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
    const rows = res.measurements.map(m => `<tr>
      <td>${esc(m.item)}</td>
      <td class="val">${esc(m.value)}</td>
      <td>${m.spec_low ?? '-'} ~ ${m.spec_high ?? '-'}</td>
      <td><span class="jbadge j-${m.judge}">${m.judge}</span></td></tr>`).join('');

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
      <div class="summary-row">
        <span class="chip ok"><span class="num">${s['정상'] || 0}</span> 정상</span>
        <span class="chip warn"><span class="num">${s['주의'] || 0}</span> 주의(경계)</span>
        <span class="chip alert"><span class="num">${s['알림'] || 0}</span> 알림(이탈)</span>
        <span class="hint" style="align-self:center">파서: ${esc(res.parser)}</span>
      </div>
      <table class="meas"><thead><tr><th>측정 항목</th><th>실측값</th><th>규격(low~high)</th><th>판정</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="4">측정 데이터 없음</td></tr>'}</tbody></table>
      ${rep}${cmp}`;
  }

  // ------------------------------------------------------------ 완료
  async function finish() {
    const comment = $('comment') ? $('comment').value.trim() : '';
    const component = $('f_component') ? $('f_component').value : '';
    const symptom_type = $('f_symptom') ? $('f_symptom').value : '';
    const res = await api.post('/api/run/finish', { run_id: state.run.run_id, comment, component, symptom_type });
    state.finish = res;
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
            <button class="btn btn-primary" onclick="App.go('setup')">＋ 새 검증</button>
          </div>
        </div>
      </div>`;
  }

  // ------------------------------------------------------------ init
  function init() { $('year').textContent = new Date().getFullYear(); go('home'); }
  document.addEventListener('DOMContentLoaded', init);

  return { go, startRun, pickMode, toggleStep, setItem, parseLog, loadSample, onFile, finish };
})();
window.App = App;
