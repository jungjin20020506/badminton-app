// ===================================================================================
// 미니게임 — 셔틀 랠리
//
// 코트를 기다리는 15분. 혼자 리프팅만 하기엔 심심하다.
// 그래서 마을 주민 한 명을 불러 세워 놓고 **같이** 랠리를 이어 간다.
// 이기고 지는 건 없다. 끊기지 않게 오래 주고받는 것, 그거 하나뿐이다.
//
// 판정은 rally.js 가 맡는다 — 오직 시계로만 계산하므로 화면이 버벅여도 밀리지 않는다.
// rAF 는 셔틀콕을 눈으로 따라가게 해 주는 「그림」일 뿐이다.
// ===================================================================================
import { useEffect, useMemo, useRef, useState } from 'react'
import { useGame } from '../game/store.js'
import { LEVEL_COLOR } from '../game/constants.js'
import { dexEntry } from '../game/social.js'
import {
  RALLY_LIVES, RETURN_MS, flightDur, hitWindow, judge, isSwing, rallyGrade,
} from '../game/rally.js'
import { avatarUrl } from './avatar.js'

const JUDGE_TEXT = { perfect: 'PERFECT!', good: 'NICE', miss: '헛스윙…' }

export default function RallyGame({ onClose }) {
  const players = useGame((s) => s.players)
  const order = useGame((s) => s.order)
  const metPartners = useGame((s) => s.metPartners)
  const bestRally = useGame((s) => s.bestRally)
  const miniCoins = useGame((s) => s.today.miniCoins || 0)
  // 셀렉터가 매번 새 배열을 돌려주면 리액트가 「상태가 계속 바뀐다」고 보고 무한 렌더에 빠진다
  const rallyFriends = useGame((s) => s.today.rallyFriends)
  const addRallyReward = useGame((s) => s.addRallyReward)

  const [phase, setPhase] = useState('pick')   // pick | play | over
  const [partnerId, setPartnerId] = useState(null)
  const [rally, setRally] = useState(0)
  const [lives, setLives] = useState(RALLY_LIVES)
  const [flash, setFlash] = useState(null)     // 판정 글자
  const [result, setResult] = useState(null)

  const areaRef = useRef(null)
  const birdRef = useRef(null)
  const raf = useRef(0)
  const timer = useRef(0)
  // 살아 있는 값들 — 리액트 렌더를 거치면 판정이 한 프레임 늦는다.
  // 상대(pid)까지 여기 담는다: 타이머 콜백은 예약한 순간의 렌더를 붙잡고 있어서
  // 방금 setState 한 partnerId 를 못 본다.
  const sim = useRef({ pid: null, dir: 'in', at: 0, dur: 900, rally: 0, lives: RALLY_LIVES, perfect: 0, alive: false })

  // 함께 뛴 적 있는 사람을 앞에, 그 다음 친밀도 순으로 최대 12명
  const candidates = useMemo(() => {
    return order
      .map((id) => players[id])
      .filter((p) => p && !p.isMe && p.status !== 'oncourt' && p.status !== 'walking')
      .map((p) => ({ p, met: !!dexEntry(metPartners[p.id]) }))
      .sort((a, b) => (b.met - a.met) || (b.p.affinity - a.p.affinity) || a.p.name.localeCompare(b.p.name, 'ko'))
      .slice(0, 12)
      .map((x) => x.p)
  }, [order, players, metPartners])

  const partner = partnerId ? players[partnerId] : null

  // 정리 — 패널을 닫아도 타이머가 남지 않도록
  useEffect(() => () => {
    cancelAnimationFrame(raf.current)
    clearTimeout(timer.current)
    sim.current.alive = false
  }, [])

  // --- 진행 -------------------------------------------------------------------------
  const serve = (delay = 600) => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      if (!sim.current.alive) return
      const dur = flightDur(sim.current.rally)
      sim.current.dir = 'in'
      sim.current.at = performance.now()
      sim.current.dur = dur
      // 놓쳤을 때 — 도착 시각 + 판정 구간이 지나면 자동으로 실패
      clearTimeout(timer.current)
      timer.current = setTimeout(() => miss(), dur + hitWindow(sim.current.rally) + 20)
    }, delay)
  }

  const showFlash = (kind) => {
    const key = Math.random()
    setFlash({ kind, key })
    setTimeout(() => setFlash((f) => (f && f.key === key ? null : f)), 520)
  }

  const miss = () => {
    if (!sim.current.alive) return
    showFlash('miss')
    navigator.vibrate?.(30)
    const left = sim.current.lives - 1
    sim.current.lives = left
    setLives(left)
    if (left <= 0) return finish()
    serve(900)
  }

  const finish = () => {
    sim.current.alive = false
    cancelAnimationFrame(raf.current)
    clearTimeout(timer.current)
    const n = sim.current.rally
    const prevBest = useGame.getState().bestRally || 0
    const got = addRallyReward(n, sim.current.perfect, sim.current.pid)
    setResult({ rally: n, perfect: sim.current.perfect, ...got, best: n > prevBest })
    setPhase('over')
  }

  const start = (pid) => {
    const id = pid || partnerId
    if (!id) return
    setPartnerId(id)
    sim.current = { pid: id, dir: 'in', at: 0, dur: 900, rally: 0, lives: RALLY_LIVES, perfect: 0, alive: true }
    setRally(0)
    setLives(RALLY_LIVES)
    setFlash(null)
    setResult(null)
    setPhase('play')
    serve(900)
  }

  // --- 그리기 (rAF 는 순전히 눈요기다) -----------------------------------------------
  useEffect(() => {
    if (phase !== 'play') return
    const draw = () => {
      const s = sim.current
      const el = birdRef.current
      if (el && s.at) {
        const t = Math.min(1.25, (performance.now() - s.at) / s.dur)
        // 상대(위) ↔ 나(아래). 왕복 모두 0→1 로 흐른다
        const p = s.dir === 'in' ? t : 1 - t
        const y = 8 + p * 74                       // %
        const x = 50 + Math.sin(p * Math.PI) * 12  // 살짝 휘어 날아간다
        const lift = Math.sin(p * Math.PI) * 10    // 포물선
        el.style.left = `${x}%`
        el.style.top = `${y - lift}%`
        el.style.transform = `translate(-50%,-50%) rotate(${s.dir === 'in' ? 160 + p * 40 : -20 - p * 40}deg)`
      }
      raf.current = requestAnimationFrame(draw)
    }
    raf.current = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf.current)
  }, [phase])

  // --- 스윙 -------------------------------------------------------------------------
  const swing = () => {
    const s = sim.current
    if (phase !== 'play' || !s.alive || !s.at || s.dir !== 'in') return
    const delta = performance.now() - (s.at + s.dur)
    if (!isSwing(delta)) return // 아직 셔틀콕이 저 멀리 — 헛스윙으로도 안 친다

    const v = judge(s.rally, delta)
    clearTimeout(timer.current)
    if (v === 'miss') return miss()

    s.rally += 1
    if (v === 'perfect') s.perfect += 1
    setRally(s.rally)
    showFlash(v)
    navigator.vibrate?.(v === 'perfect' ? [12, 20, 12] : 10)

    // 상대에게 넘어갔다가 다시 온다
    s.dir = 'out'
    s.at = performance.now()
    s.dur = RETURN_MS
    serve(RETURN_MS)
  }

  // 스페이스/엔터로도 칠 수 있게 (PC)
  useEffect(() => {
    if (phase !== 'play') return
    const onKey = (e) => {
      if (e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyZ') { e.preventDefault(); swing() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase])

  // --- 화면 -------------------------------------------------------------------------
  const grade = rallyGrade(result?.rally ?? 0)

  return (
    <div className="overlay rally-overlay" style={{ zIndex: 65, padding: 0 }}>
      <div ref={areaRef} className="rally-court" onPointerDown={phase === 'play' ? swing : undefined}>
        {/* 코트 */}
        <div className="rc-net" />
        <div className="rc-line rc-line-far" />
        <div className="rc-line rc-line-near" />

        {/* 상대 */}
        {partner && (
          <div className="rc-side far">
            <img src={avatarUrl(partner.look, partner.gender, 88)} alt="" />
            <b>{partner.name}</b>
          </div>
        )}
        {/* 나 */}
        {players.me && (
          <div className="rc-side near">
            <img src={avatarUrl(players.me.look, players.me.gender, 88)} alt="" />
            <b>{players.me.name}</b>
          </div>
        )}

        {/* 셔틀콕 */}
        {phase === 'play' && <div ref={birdRef} className="rc-bird">🏸</div>}

        {/* 점수 · 목숨 */}
        {phase === 'play' && (
          <div className="rc-hud">
            <div className="rc-count">{rally}</div>
            <div className="rc-lives">{'🏸'.repeat(lives)}{'·'.repeat(RALLY_LIVES - lives)}</div>
            <div className="rc-sub">최고 {Math.max(bestRally || 0, rally)}회 · 오늘 {miniCoins}/300🪙</div>
          </div>
        )}

        {flash && <div key={flash.key} className={`rc-flash ${flash.kind}`}>{JUDGE_TEXT[flash.kind]}</div>}

        {/* 상대 고르기 */}
        {phase === 'pick' && (
          <div className="ac-panel modal-card rally-pick">
            <div style={{ fontSize: 40 }}>🏸</div>
            <h2 style={{ margin: '4px 0', fontSize: 20 }}>셔틀 랠리</h2>
            <div className="muted">
              날아오는 셔틀콕에 맞춰 <b>화면을 톡</b>! 승패는 없어 —<br />
              끊기지 않게 <b>같이</b> 오래 이어 가면 돼.<br />
              1회당 6🪙 (하루 300🪙까지) · 오래 이어 가면 친밀도도 올라!
            </div>
            <div className="sect">누구와 칠까?</div>
            <div className="rally-cands">
              {candidates.map((p) => (
                <button key={p.id} className="rally-cand" onClick={() => start(p.id)}>
                  <img src={avatarUrl(p.look, p.gender, 64)} alt="" />
                  <span className="rc-nm">{p.name}</span>
                  <span className="rc-lv" style={{ background: LEVEL_COLOR[p.level] }}>{p.level.replace('조', '')}</span>
                  {rallyFriends?.includes(p.id) && <span className="rc-done" title="오늘 이미 함께 쳤어">✅</span>}
                </button>
              ))}
              {!candidates.length && <div className="muted">지금 마을에 함께 칠 사람이 없어. 주민을 먼저 불러 보자!</div>}
            </div>
            <button className="ac-btn wide" style={{ marginTop: 12 }} onClick={onClose}>나가기</button>
          </div>
        )}

        {/* 결과 */}
        {phase === 'over' && result && (
          <div className="ac-panel modal-card">
            <div style={{ fontSize: 44 }}>{grade.icon}</div>
            <h2 style={{ margin: '4px 0', fontSize: 20 }}>
              {result.best && result.rally > 0 ? '신기록! ' : ''}{result.rally}회 랠리
            </h2>
            <div className="muted">
              {grade.label} · PERFECT {result.perfect}회<br />
              획득 코인 +{result.coins}🪙
              {result.affinity > 0 && ` · ${partner?.name} 친밀도 +${result.affinity}`}
            </div>
            <div className="row" style={{ marginTop: 14 }}>
              <button className="ac-btn yellow" style={{ flex: 1 }} onClick={() => start()}>🔁 한 번 더</button>
              <button className="ac-btn" style={{ flex: 1 }} onClick={() => setPhase('pick')}>👥 상대 바꾸기</button>
            </div>
            <button className="ac-btn wide" style={{ marginTop: 8 }} onClick={onClose}>나가기</button>
          </div>
        )}

        {/* 닫기 */}
        {phase === 'play' && (
          <button
            className="pop-close"
            style={{ position: 'absolute', top: 'calc(env(safe-area-inset-top, 0px) + 14px)', right: 14 }}
            onPointerDown={(e) => { e.stopPropagation(); sim.current.alive = false; onClose() }}
          >
            ✕
          </button>
        )}
      </div>
    </div>
  )
}
