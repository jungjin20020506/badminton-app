// ===================================================================================
// 콕스타 계정 로그인 — 카카오 / 휴대폰 / (숨김) 관리자
// 콕스타에서 쓰던 계정 그대로 들어온다. 프로필이 없으면 콕스타와 동일한 항목을 받는다.
// ===================================================================================
import { useState } from 'react'
import { useGame } from '../game/store.js'
import { cockstar } from '../net/cockstar.js'
import { LEVELS, LEVEL_COLOR } from '../game/constants.js'

const REGIONS = ['서울', '경기', '인천', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주']

export default function Login({ onClose }) {
  const auth = useGame((s) => s.auth)
  const toast = useGame((s) => s.toast)
  const meLook = useGame((s) => s.players.me?.look)

  const [mode, setMode] = useState('select') // select | phone | admin
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [sent, setSent] = useState(false)
  const [id, setId] = useState('')
  const [pw, setPw] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  // 프로필 입력 (최초 로그인)
  const [form, setForm] = useState({ name: '', level: 'N조', gender: '남', birthYear: '2000', region: '서울' })

  const run = async (fn, okMsg) => {
    setBusy(true)
    setErr('')
    try {
      await fn()
      if (okMsg) toast(okMsg, 'good')
    } catch (e) {
      // 파이어베이스 오류코드를 사람이 읽을 수 있게 바꿔 준다
      const raw = String(e?.code || e?.message || '')
      const msg =
        raw.includes('invalid-credential') || raw.includes('wrong-password') || raw.includes('user-not-found')
          ? '아이디 또는 비밀번호가 맞지 않아요.'
          : raw.includes('operation-not-allowed')
            ? '이 계정 방식이 파이어베이스에서 꺼져 있어요. (콘솔 → Authentication → 이메일/비밀번호 사용 설정)'
            : raw.includes('too-many-requests')
              ? '시도가 너무 많아요. 잠시 뒤에 다시 해 주세요.'
              : raw.includes('network')
                ? '네트워크에 연결하지 못했어요.'
                : (e?.message || '').replace('Firebase: ', '') || '실패했어요.'
      setErr(msg)
      toast(msg, 'warn')
    } finally {
      setBusy(false)
    }
  }

  /** 창 안에 그대로 보여 주는 오류 줄 */
  const ErrLine = () =>
    err ? (
      <div className="login-err">⚠ {err}</div>
    ) : null

  // ── 프로필 완성 단계 ──────────────────────────────────────────────
  if (auth?.needsProfile) {
    return (
      <div className="overlay" style={{ zIndex: 80 }}>
        <div className="ac-panel modal-card" style={{ textAlign: 'left', maxHeight: '92%', overflowY: 'auto' }}>
          <div style={{ fontSize: 38, textAlign: 'center' }}>🐥</div>
          <h2 style={{ margin: '4px 0 2px', fontSize: 20, textAlign: 'center' }}>선수 프로필 만들기</h2>
          <div className="muted" style={{ textAlign: 'center' }}>
            콕스타에도 함께 저장돼. 한 번만 적으면 돼!
          </div>

          <div className="sect">이름 (실명)</div>
          <input className="ac-input" placeholder="본명을 입력해주세요" maxLength={12}
            value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />

          <div className="sect">급수</div>
          <div className="row wrap">
            {LEVELS.map((l) => (
              <button key={l} className={`ac-btn sm ${form.level === l ? 'green' : ''}`}
                style={form.level === l ? {} : { color: LEVEL_COLOR[l] }}
                onClick={() => setForm({ ...form, level: l })}>{l}</button>
            ))}
          </div>

          <div className="sect">성별</div>
          <div className="row">
            {['남', '여'].map((g) => (
              <button key={g} className={`ac-btn sm ${form.gender === g ? 'green' : ''}`}
                onClick={() => setForm({ ...form, gender: g })}>{g === '남' ? '👦 남자' : '👧 여자'}</button>
            ))}
          </div>

          <div className="sect">출생연도</div>
          <select className="ac-input" value={form.birthYear} onChange={(e) => setForm({ ...form, birthYear: e.target.value })}>
            {Array.from({ length: 60 }, (_, i) => String(2012 - i)).map((y) => <option key={y} value={y}>{y}년</option>)}
          </select>

          <div className="sect">지역</div>
          <div className="row wrap">
            {REGIONS.map((r) => (
              <button key={r} className={`ac-btn sm ${form.region === r ? 'green' : ''}`}
                onClick={() => setForm({ ...form, region: r })}>{r}</button>
            ))}
          </div>

          <button className="ac-btn green wide" style={{ marginTop: 16 }} disabled={busy}
            onClick={() => {
              if (!form.name.trim()) return toast('이름을 입력해주세요.', 'warn')
              run(() => cockstar.saveProfile({ ...form, name: form.name.trim(), svLook: meLook }), '프로필 완성! 🎉')
            }}>
            {busy ? '저장 중…' : '✅ 저장하고 시작하기'}
          </button>
          <button className="ac-btn wide" style={{ marginTop: 8 }} onClick={() => cockstar.logout()}>다른 계정으로 로그인</button>
        </div>
      </div>
    )
  }

  // ── 로그인 단계 ──────────────────────────────────────────────────
  return (
    <div className="overlay" style={{ zIndex: 80 }}>
      <div className="ac-panel modal-card" style={{ textAlign: 'left' }}>
        <button className="pop-close" style={{ top: -12, right: -8 }} onClick={onClose}>✕</button>
        <div style={{ fontSize: 38, textAlign: 'center' }}>🏸</div>
        <h2 style={{ margin: '4px 0 2px', fontSize: 20, textAlign: 'center' }}>콕스타 계정으로 입장</h2>
        <div className="muted" style={{ textAlign: 'center' }}>
          콕스타에서 쓰던 계정 그대로 쓸 수 있어.<br />경기방도 그대로 이어져!
        </div>

        {mode === 'select' && (
          <div style={{ marginTop: 18 }}>
            <button className="ac-btn yellow wide" disabled={busy}
              onClick={() => run(() => cockstar.signInKakao())}>💬 카카오로 로그인</button>
            <button className="ac-btn sky wide" style={{ marginTop: 9 }} onClick={() => setMode('phone')}>
              📱 휴대폰 번호로 로그인
            </button>
            <button className="ac-btn wide" style={{ marginTop: 9 }} onClick={onClose}>
              🏝️ 그냥 혼자 놀기 (로그인 없이)
            </button>
            <ErrLine />
            <button className="muted" style={{ marginTop: 14, width: '100%', textAlign: 'center', background: 'none' }}
              onClick={() => { setMode('admin'); setErr('') }}>
              시스템 관리자 전용 로그인
            </button>
          </div>
        )}

        {mode === 'phone' && (
          <div style={{ marginTop: 16 }}>
            <input className="ac-input" placeholder="휴대폰 번호 (01012345678)" inputMode="numeric"
              value={phone} onChange={(e) => setPhone(e.target.value)} disabled={sent} />
            {sent && (
              <input className="ac-input" style={{ marginTop: 8 }} placeholder="인증번호 6자리" inputMode="numeric"
                maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} />
            )}
            {/* 휴대폰 인증에 반드시 필요한 컨테이너 */}
            <div id="recaptcha-container" />
            <button className="ac-btn green wide" style={{ marginTop: 10 }} disabled={busy}
              onClick={() =>
                sent
                  ? run(() => cockstar.verifyPhoneCode(code), '로그인 완료!')
                  : run(async () => { await cockstar.sendPhoneCode(phone); setSent(true) }, '인증번호를 보냈어!')
              }>
              {busy ? '처리 중…' : sent ? '인증하고 입장' : '인증번호 받기'}
            </button>
            <ErrLine />
            <button className="ac-btn wide" style={{ marginTop: 8 }} onClick={() => { setMode('select'); setSent(false); setErr('') }}>뒤로</button>
          </div>
        )}

        {mode === 'admin' && (
          <div style={{ marginTop: 16 }}>
            <input className="pk-input" placeholder="아이디" autoCapitalize="none" autoCorrect="off"
              value={id} onChange={(e) => setId(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && run(() => cockstar.signInAdmin(id, pw), '로그인 완료!')} />
            <input className="pk-input" style={{ marginTop: 8 }} type="password" placeholder="비밀번호"
              value={pw} onChange={(e) => setPw(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && run(() => cockstar.signInAdmin(id, pw), '로그인 완료!')} />
            <div className="muted" style={{ marginTop: 6 }}>
              아이디는 콕스타와 같은 규칙으로 <b>{cockstar.convertToEmail(id || '아이디')}</b> 로 바뀌어 로그인합니다.
            </div>
            <ErrLine />
            <button className="pk-btn primary wide" style={{ marginTop: 10 }} disabled={busy || !id || !pw}
              onClick={() => run(() => cockstar.signInAdmin(id, pw), '로그인 완료!')}>
              {busy ? '로그인 중…' : '로그인'}
            </button>
            <button className="pk-btn wide" style={{ marginTop: 8 }} onClick={() => { setMode('select'); setErr('') }}>뒤로</button>
          </div>
        )}
      </div>
    </div>
  )
}
