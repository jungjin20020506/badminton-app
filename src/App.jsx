import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  COMPANY,
  INSPECTION_TYPES,
  buildSteps,
} from './data/inspectionData';
import { QUICK_PROMPTS, getBotReply } from './data/chatKnowledge';
import { downloadCertificate } from './utils/excel';

// ===================================================================================
// 공용 소형 컴포넌트
// ===================================================================================
function Logo({ compact = false }) {
  return (
    <div className="flex items-center gap-2.5 select-none">
      <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 shadow-soft">
        <span className="font-extrabold text-white tracking-tight text-sm">KNK</span>
      </div>
      {!compact && (
        <div className="leading-tight">
          <div className="font-bold text-slate-900 text-[15px]">{COMPANY.system}</div>
          <div className="text-[11px] text-slate-400 font-medium tracking-wide">
            {COMPANY.slogan}
          </div>
        </div>
      )}
    </div>
  );
}

function Header({ view, setView }) {
  const tabs = [
    { id: 'home', label: '홈', icon: 'fa-house' },
    { id: 'verify', label: '출하 검증', icon: 'fa-clipboard-check' },
    { id: 'chat', label: 'AI 품질챗봇', icon: 'fa-robot' },
  ];
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <button onClick={() => setView('home')} className="cursor-pointer">
          <Logo />
        </button>
        <nav className="flex items-center gap-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setView(t.id)}
              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                view === t.id
                  ? 'bg-brand-50 text-brand-700'
                  : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
              }`}
            >
              <i className={`fa-solid ${t.icon} text-xs`} />
              <span className="hidden sm:inline">{t.label}</span>
            </button>
          ))}
        </nav>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="mt-auto border-t border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-6 py-5 text-xs text-slate-400 sm:flex-row">
        <span>© {new Date().getFullYear()} {COMPANY.nameKo}({COMPANY.nameEn}) · 품질팀</span>
        <span className="rounded-full bg-amber-50 px-3 py-1 font-medium text-amber-600">
          대표 승인용 시안(Demo) — 실제 규격 데이터 연동 전
        </span>
      </div>
    </footer>
  );
}

// ===================================================================================
// 1) 홈
// ===================================================================================
function Home({ setView }) {
  const cards = [
    {
      id: 'verify',
      tag: '01',
      title: '출하 품질 검증 프로그램',
      desc: '고객사·모델·검사기 종류를 선택하면 출하검사 순서도에 따라 항목별 검증을 진행하고, 완료 시 품질 인증서(엑셀)를 자동 발행합니다.',
      icon: 'fa-clipboard-check',
      bullets: ['출하검사 순서도 기반 단계별 검증', '부적합 시 조치사항 자동 안내', '품질 인증서 엑셀(.xlsx) 다운로드'],
      color: 'from-brand-500 to-brand-700',
    },
    {
      id: 'chat',
      tag: '02',
      title: 'AI 품질·AS 챗봇',
      desc: '사내 품질 데이터와 AI를 연동해 AS/불량 조치 질문에 즉시 답변합니다. (현재 데모 응답, 향후 사내 DB·AI API 연동)',
      icon: 'fa-robot',
      bullets: ['AS·불량 조치 즉시 응답', '검사 규격/조치 매뉴얼 검색', '사내 품질 DB + AI 연동(예정)'],
      color: 'from-accent-500 to-accent-600',
    },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-800 via-brand-700 to-brand-900 px-8 py-14 text-white shadow-soft sm:px-14 sm:py-16">
        <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/10 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-10 h-72 w-72 rounded-full bg-accent-500/20 blur-3xl" />
        <div className="relative max-w-2xl">
          <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-brand-100 ring-1 ring-white/20">
            <i className="fa-solid fa-shield-halved" /> {COMPANY.nameKo} 품질팀 통합 솔루션
          </span>
          <h1 className="mt-5 text-3xl font-extrabold leading-tight sm:text-[42px]">
            출하 품질 검증부터<br />AS 대응까지 한 곳에서.
          </h1>
          <p className="mt-4 text-brand-100/90 sm:text-lg">
            검사기 점검 · 출하 검증 · 품질 인증서 발행 · AI 품질 지원을 하나의 시스템으로 통합했습니다.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <button
              onClick={() => setView('verify')}
              className="rounded-xl bg-white px-5 py-3 text-sm font-bold text-brand-700 shadow-lg transition hover:bg-brand-50"
            >
              <i className="fa-solid fa-play mr-2" /> 출하 검증 시작
            </button>
            <button
              onClick={() => setView('chat')}
              className="rounded-xl bg-white/10 px-5 py-3 text-sm font-bold text-white ring-1 ring-white/25 transition hover:bg-white/20"
            >
              <i className="fa-solid fa-robot mr-2" /> AI 챗봇 열기
            </button>
          </div>
        </div>
      </section>

      {/* Stat strip */}
      <section className="-mt-8 relative z-10 mx-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { k: '6종', v: '검사기 종류 지원' },
          { k: '순서도', v: '기반 단계 검증' },
          { k: '.xlsx', v: '품질 인증서 자동 발행' },
          { k: 'AI', v: '품질·AS 어시스턴트' },
        ].map((s) => (
          <div key={s.v} className="rounded-2xl border border-slate-100 bg-white px-4 py-4 text-center shadow-card">
            <div className="text-xl font-extrabold text-brand-700">{s.k}</div>
            <div className="mt-1 text-xs font-medium text-slate-500">{s.v}</div>
          </div>
        ))}
      </section>

      {/* Feature cards */}
      <section className="mt-10 grid gap-5 pb-4 sm:grid-cols-2">
        {cards.map((c) => (
          <button
            key={c.id}
            onClick={() => setView(c.id)}
            className="group text-left"
          >
            <div className="flex h-full flex-col rounded-2xl border border-slate-100 bg-white p-7 shadow-card transition hover:-translate-y-1 hover:shadow-soft">
              <div className="flex items-center justify-between">
                <div className={`grid h-12 w-12 place-items-center rounded-xl bg-gradient-to-br ${c.color} text-white shadow-soft`}>
                  <i className={`fa-solid ${c.icon} text-lg`} />
                </div>
                <span className="text-3xl font-black text-slate-100 group-hover:text-brand-100">{c.tag}</span>
              </div>
              <h3 className="mt-5 text-lg font-bold text-slate-900">{c.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-500">{c.desc}</p>
              <ul className="mt-4 space-y-1.5">
                {c.bullets.map((b) => (
                  <li key={b} className="flex items-center gap-2 text-sm text-slate-600">
                    <i className="fa-solid fa-circle-check text-accent-500" /> {b}
                  </li>
                ))}
              </ul>
              <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-bold text-brand-600">
                바로가기 <i className="fa-solid fa-arrow-right transition group-hover:translate-x-1" />
              </span>
            </div>
          </button>
        ))}
      </section>
    </div>
  );
}

// ===================================================================================
// 2) 출하 검증 프로그램
// ===================================================================================
function Field({ label, children, required }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-semibold text-slate-700">
        {label} {required && <span className="text-rose-500">*</span>}
      </span>
      {children}
    </label>
  );
}

function VerifySetup({ onStart }) {
  const [customer, setCustomer] = useState('');
  const [model, setModel] = useState('');
  const [rev, setRev] = useState('');
  const [typeId, setTypeId] = useState('PBA');
  const [inspector, setInspector] = useState('');
  const valid = customer.trim() && model.trim() && inspector.trim();

  const inputCls =
    'w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none transition focus:border-brand-400 focus:ring-4 focus:ring-brand-50';

  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6">
      <div className="mb-6">
        <h2 className="text-2xl font-extrabold text-slate-900">출하 품질 검증</h2>
        <p className="mt-1 text-sm text-slate-500">검사 정보를 입력하고 검증을 시작하세요.</p>
      </div>

      <div className="rounded-2xl border border-slate-100 bg-white p-7 shadow-card">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="고객사" required>
            <input className={inputCls} value={customer} onChange={(e) => setCustomer(e.target.value)} placeholder="예) 삼성전자" />
          </Field>
          <Field label="모델명" required>
            <input className={inputCls} value={model} onChange={(e) => setModel(e.target.value)} placeholder="예) SM-S711 SUB" />
          </Field>
          <Field label="모델 REV.">
            <input className={inputCls} value={rev} onChange={(e) => setRev(e.target.value)} placeholder="예) R0.5" />
          </Field>
          <Field label="검사자 이름" required>
            <input className={inputCls} value={inspector} onChange={(e) => setInspector(e.target.value)} placeholder="예) 홍길동" />
          </Field>
          <Field label="검사일">
            <input className={`${inputCls} bg-slate-50 text-slate-500`} value={new Date().toLocaleDateString('ko-KR')} readOnly />
          </Field>
        </div>

        <div className="mt-6">
          <span className="mb-2 block text-sm font-semibold text-slate-700">검사기 종류 <span className="text-rose-500">*</span></span>
          <div className="grid gap-3 sm:grid-cols-2">
            {INSPECTION_TYPES.map((t) => (
              <button
                key={t.id}
                onClick={() => setTypeId(t.id)}
                className={`flex items-center gap-3 rounded-xl border p-3.5 text-left transition ${
                  typeId === t.id
                    ? 'border-brand-400 bg-brand-50 ring-2 ring-brand-100'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ${typeId === t.id ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                  <i className={`fa-solid ${t.icon}`} />
                </div>
                <div>
                  <div className="text-sm font-bold text-slate-800">{t.label}</div>
                  <div className="text-xs text-slate-400">{t.desc}</div>
                </div>
              </button>
            ))}
          </div>
        </div>

        <button
          disabled={!valid}
          onClick={() => {
            const type = INSPECTION_TYPES.find((t) => t.id === typeId);
            onStart({ customer, model, rev, inspector, typeId, typeLabel: type.label, machine: type.machine });
          }}
          className="mt-7 w-full rounded-xl bg-brand-600 py-3.5 text-sm font-bold text-white shadow-soft transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
        >
          <i className="fa-solid fa-flag-checkered mr-2" /> 검증 시작
        </button>
        {!valid && <p className="mt-2 text-center text-xs text-slate-400">고객사 · 모델명 · 검사자 이름을 모두 입력하세요.</p>}
      </div>
    </div>
  );
}

function VerifyFlow({ meta, steps, onComplete, onExit }) {
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState({});
  const [showAction, setShowAction] = useState(false);
  const step = steps[idx];
  const progress = Math.round((idx / steps.length) * 100);
  const answered = steps.filter((s) => answers[s.id]).length;

  const setResult = (id, result) => setAnswers((p) => ({ ...p, [id]: { result } }));

  const goNext = (nextAnswers) => {
    setShowAction(false);
    if (idx < steps.length - 1) setIdx(idx + 1);
    else onComplete(nextAnswers || answers);
  };
  const handleYes = () => {
    const next = { ...answers, [step.id]: { result: 'pass' } };
    setAnswers(next);
    goNext(next);
  };
  const handleNo = () => {
    setResult(step.id, 'fail');
    setShowAction(true);
  };
  const resolveAction = (result) => {
    const next = { ...answers, [step.id]: { result } };
    setAnswers(next);
    goNext(next);
  };
  const goPrev = () => {
    if (idx > 0) {
      setShowAction(false);
      setIdx(idx - 1);
    }
  };

  const failList = steps.filter((s) => answers[s.id]?.result === 'fail');

  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6">
      {/* 상단 정보 + 진행바 */}
      <div className="mb-5 flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-full bg-slate-100 px-3 py-1 font-semibold text-slate-600">{meta.customer}</span>
        <span className="rounded-full bg-slate-100 px-3 py-1 font-semibold text-slate-600">{meta.model}</span>
        <span className="rounded-full bg-brand-50 px-3 py-1 font-semibold text-brand-700">{meta.typeLabel}</span>
        <span className="ml-auto text-slate-400">검사자 {meta.inspector}</span>
      </div>
      <div className="mb-6">
        <div className="mb-1.5 flex items-center justify-between text-xs font-semibold text-slate-500">
          <span>진행 {answered} / {steps.length}</span>
          <span>{progress}%</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-gradient-to-r from-brand-500 to-accent-500 transition-all duration-500" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {/* 질문 카드 */}
      <div className="rounded-2xl border border-slate-100 bg-white p-7 shadow-card">
        <div className="flex items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-600 text-sm font-bold text-white">{idx + 1}</span>
          <div className="flex-1">
            <div className="text-xs font-semibold uppercase tracking-wide text-brand-500">{step.title}</div>
            <h3 className="mt-1 text-lg font-bold leading-snug text-slate-900">{step.question}</h3>
            {step.spec && (
              <div className="mt-2 inline-flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-1.5 text-xs text-slate-500">
                <i className="fa-solid fa-ruler-combined text-slate-400" /> 규격: {step.spec}
              </div>
            )}
          </div>
        </div>

        {!showAction ? (
          <div className="mt-7 grid grid-cols-2 gap-3">
            <button
              onClick={handleYes}
              className="rounded-xl border-2 border-accent-500 bg-accent-500/5 py-4 font-bold text-accent-600 transition hover:bg-accent-500 hover:text-white"
            >
              <i className="fa-solid fa-check mr-2" /> 예 (양호)
            </button>
            <button
              onClick={handleNo}
              className="rounded-xl border-2 border-rose-400 bg-rose-50 py-4 font-bold text-rose-600 transition hover:bg-rose-500 hover:text-white"
            >
              <i className="fa-solid fa-xmark mr-2" /> 아니요 (불량)
            </button>
          </div>
        ) : (
          <div className="mt-6 overflow-hidden rounded-xl border border-rose-200 bg-rose-50">
            <div className="flex items-center gap-2 border-b border-rose-200 bg-rose-100/60 px-4 py-2.5 text-sm font-bold text-rose-700">
              <i className="fa-solid fa-triangle-exclamation" /> 조치사항 안내 · {step.action?.grade}
            </div>
            <div className="px-4 py-4">
              <ol className="space-y-2">
                {step.action?.steps.map((s, i) => (
                  <li key={i} className="flex gap-2.5 text-sm text-slate-700">
                    <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-rose-200 text-[11px] font-bold text-rose-700">{i + 1}</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ol>
              {step.action?.ref && (
                <div className="mt-3 text-xs text-slate-400">
                  <i className="fa-solid fa-book mr-1" /> 근거: {step.action.ref}
                </div>
              )}
              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <button
                  onClick={() => resolveAction('pass')}
                  className="flex-1 rounded-lg bg-accent-600 py-2.5 text-sm font-bold text-white transition hover:bg-accent-500"
                >
                  <i className="fa-solid fa-wrench mr-1.5" /> 조치 완료 → 양호로 진행
                </button>
                <button
                  onClick={() => resolveAction('fail')}
                  className="flex-1 rounded-lg bg-rose-600 py-2.5 text-sm font-bold text-white transition hover:bg-rose-500"
                >
                  <i className="fa-solid fa-flag mr-1.5" /> 부적합 기록 후 다음
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 하단 네비 */}
      <div className="mt-4 flex items-center justify-between">
        <button
          onClick={idx === 0 ? onExit : goPrev}
          className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-500 transition hover:bg-slate-100"
        >
          <i className="fa-solid fa-arrow-left mr-1.5" /> {idx === 0 ? '처음으로' : '이전'}
        </button>
        {failList.length > 0 && (
          <span className="rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-500">
            부적합 {failList.length}건
          </span>
        )}
      </div>
    </div>
  );
}

function VerifyComplete({ meta, steps, answers, onRestart }) {
  const [issued, setIssued] = useState(null);
  const failCount = steps.filter((s) => answers[s.id]?.result === 'fail').length;
  const pass = failCount === 0;

  const handleDownload = () => {
    const now = new Date();
    const res = downloadCertificate({
      meta: {
        ...meta,
        date: now.toLocaleString('ko-KR'),
        dateCompact: `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`,
      },
      steps,
      answers,
    });
    if (res) setIssued(res);
  };

  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6">
      <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-card">
        <div className={`px-8 py-10 text-center text-white ${pass ? 'bg-gradient-to-br from-accent-500 to-accent-600' : 'bg-gradient-to-br from-amber-500 to-orange-600'}`}>
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-white/20 ring-4 ring-white/20">
            <i className={`fa-solid ${pass ? 'fa-circle-check' : 'fa-triangle-exclamation'} text-3xl`} />
          </div>
          <h2 className="mt-4 text-2xl font-extrabold">검증이 완료되었습니다</h2>
          <p className="mt-1 text-white/90">
            {pass ? '전 항목 양호 — 출하 적합(PASS)' : `부적합 ${failCount}건 — 조치 이력이 성적서에 기록됩니다`}
          </p>
        </div>

        <div className="p-7">
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              ['고객사', meta.customer], ['모델명', meta.model],
              ['검사기 종류', meta.typeLabel], ['검사자', meta.inspector],
            ].map(([k, v]) => (
              <div key={k} className="rounded-xl bg-slate-50 px-4 py-3">
                <div className="text-xs font-medium text-slate-400">{k}</div>
                <div className="mt-0.5 text-sm font-bold text-slate-800">{v}</div>
              </div>
            ))}
          </div>

          {/* 항목 요약 */}
          <div className="mt-5 divide-y divide-slate-100 rounded-xl border border-slate-100">
            {steps.map((s, i) => {
              const r = answers[s.id]?.result;
              return (
                <div key={s.id} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="w-5 text-xs font-bold text-slate-300">{i + 1}</span>
                  <span className="flex-1 text-sm text-slate-600">{s.title}</span>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${r === 'pass' ? 'bg-accent-500/10 text-accent-600' : 'bg-rose-50 text-rose-500'}`}>
                    {r === 'pass' ? '양호' : '부적합'}
                  </span>
                </div>
              );
            })}
          </div>

          {issued && (
            <div className="mt-5 flex items-center gap-3 rounded-xl border border-accent-200 bg-accent-50 px-4 py-3 text-sm text-accent-700">
              <i className="fa-solid fa-file-arrow-down text-lg" />
              <div>
                <div className="font-bold">품질 인증서가 발행되었습니다</div>
                <div className="text-xs">성적서 번호 {issued.certNo} · {issued.fileName}</div>
              </div>
            </div>
          )}

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <button
              onClick={handleDownload}
              className="flex-1 rounded-xl bg-brand-600 py-3.5 text-sm font-bold text-white shadow-soft transition hover:bg-brand-700"
            >
              <i className="fa-solid fa-file-excel mr-2" /> 품질 인증서 다운로드 (.xlsx)
            </button>
            <button
              onClick={onRestart}
              className="rounded-xl border border-slate-200 px-5 py-3.5 text-sm font-bold text-slate-600 transition hover:bg-slate-50"
            >
              <i className="fa-solid fa-rotate-right mr-2" /> 새 검증
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function VerifyModule() {
  const [stage, setStage] = useState('setup'); // setup | flow | done
  const [meta, setMeta] = useState(null);
  const [answers, setAnswers] = useState({});
  const steps = useMemo(() => (meta ? buildSteps(meta.typeId) : []), [meta]);

  if (stage === 'setup')
    return <VerifySetup onStart={(m) => { setMeta(m); setStage('flow'); }} />;
  if (stage === 'flow')
    return (
      <VerifyFlow
        meta={meta}
        steps={steps}
        onComplete={(a) => { setAnswers(a); setStage('done'); }}
        onExit={() => setStage('setup')}
      />
    );
  return (
    <VerifyComplete
      meta={meta}
      steps={steps}
      answers={answers}
      onRestart={() => { setMeta(null); setAnswers({}); setStage('setup'); }}
    />
  );
}

// ===================================================================================
// 3) AI 품질 챗봇
// ===================================================================================
function ChatModule() {
  const [messages, setMessages] = useState([
    {
      from: 'bot',
      text: '안녕하세요! KNK 품질 AI 어시스턴트입니다. 🤖\n제품 AS, 검사 불량 조치, 품질 규격에 대해 무엇이든 물어보세요.',
    },
  ]);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, typing]);

  const send = (text) => {
    const q = (text ?? input).trim();
    if (!q || typing) return;
    setMessages((m) => [...m, { from: 'user', text: q }]);
    setInput('');
    setTyping(true);
    setTimeout(() => {
      setMessages((m) => [...m, { from: 'bot', text: getBotReply(q) }]);
      setTyping(false);
    }, 850 + Math.random() * 600);
  };

  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6">
      <div className="mb-5 flex items-center gap-3">
        <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-accent-500 to-accent-600 text-white shadow-soft">
          <i className="fa-solid fa-robot text-lg" />
        </div>
        <div>
          <h2 className="text-xl font-extrabold text-slate-900">AI 품질·AS 챗봇</h2>
          <p className="text-xs text-slate-400">
            <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-accent-500 align-middle" />
            데모 응답 · 향후 사내 품질 DB + AI API 연동
          </p>
        </div>
      </div>

      <div className="flex h-[62vh] flex-col overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-card">
        {/* 대화 영역 */}
        <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto bg-slate-50/60 p-5">
          {messages.map((m, i) => (
            <div key={i} className={`flex gap-2.5 ${m.from === 'user' ? 'flex-row-reverse' : ''}`}>
              <div className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs text-white ${m.from === 'user' ? 'bg-brand-600' : 'bg-accent-600'}`}>
                <i className={`fa-solid ${m.from === 'user' ? 'fa-user' : 'fa-robot'}`} />
              </div>
              <div className={`max-w-[78%] whitespace-pre-line rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm ${
                m.from === 'user'
                  ? 'rounded-tr-sm bg-brand-600 text-white'
                  : 'rounded-tl-sm bg-white text-slate-700 ring-1 ring-slate-100'
              }`}>
                {m.text}
              </div>
            </div>
          ))}
          {typing && (
            <div className="flex gap-2.5">
              <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent-600 text-xs text-white">
                <i className="fa-solid fa-robot" />
              </div>
              <div className="flex items-center gap-1 rounded-2xl rounded-tl-sm bg-white px-4 py-3 ring-1 ring-slate-100">
                {[0, 1, 2].map((d) => (
                  <span key={d} className="h-2 w-2 animate-bounce rounded-full bg-slate-300" style={{ animationDelay: `${d * 0.15}s` }} />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 추천 질문 */}
        <div className="flex gap-2 overflow-x-auto border-t border-slate-100 bg-white px-4 py-2.5">
          {QUICK_PROMPTS.map((p) => (
            <button
              key={p}
              onClick={() => send(p)}
              className="whitespace-nowrap rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:border-accent-400 hover:bg-accent-50 hover:text-accent-600"
            >
              {p}
            </button>
          ))}
        </div>

        {/* 입력창 */}
        <div className="flex items-center gap-2 border-t border-slate-100 bg-white p-3">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && send()}
            placeholder="질문을 입력하세요 (예: FW 불량 조치)"
            className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none transition focus:border-accent-400 focus:bg-white focus:ring-4 focus:ring-accent-50"
          />
          <button
            onClick={() => send()}
            disabled={!input.trim() || typing}
            className="grid h-11 w-11 place-items-center rounded-xl bg-accent-600 text-white transition hover:bg-accent-500 disabled:bg-slate-200"
          >
            <i className="fa-solid fa-paper-plane" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ===================================================================================
// 루트
// ===================================================================================
export default function App() {
  const [view, setView] = useState('home');
  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <Header view={view} setView={setView} />
      <main className="w-full flex-1 py-8">
        {view === 'home' && <Home setView={setView} />}
        {view === 'verify' && <VerifyModule />}
        {view === 'chat' && <ChatModule />}
      </main>
      <Footer />
    </div>
  );
}
