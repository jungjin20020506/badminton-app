// ===================================================================================
// 미니게임 — 셔틀 리프팅
// 떨어지는 셔틀콕을 손가락으로 톡톡 쳐서 최대한 오래 띄운다. 개수만큼 코인!
// ===================================================================================
import { useEffect, useRef, useState } from 'react'
import { useGame } from '../game/store.js'

const G = 1750 // 중력 px/s²
const HIT_R = 74 // 터치 판정 반경

export default function MiniGame({ onClose }) {
  const addMiniReward = useGame((s) => s.addMiniReward)
  const bestLift = useGame((s) => s.bestLift)
  const miniCoins = useGame((s) => s.today.miniCoins || 0)

  const [phase, setPhase] = useState('ready') // ready | play | over
  const [score, setScore] = useState(0)
  const [reward, setReward] = useState(0)

  const areaRef = useRef(null)
  const birdRef = useRef(null)
  const shadowRef = useRef(null)
  const sim = useRef(null)
  const raf = useRef(0)
  const scoreRef = useRef(0)

  const start = () => {
    const el = areaRef.current
    if (!el) return
    const W = el.clientWidth
    const H = el.clientHeight
    sim.current = { x: W / 2, y: H * 0.3, vx: 0, vy: -150, W, H, spin: 0, last: performance.now() }
    scoreRef.current = 0
    setScore(0)
    setPhase('play')
  }

  // 물리 루프 — React 상태를 거치지 않고 DOM을 직접 움직인다 (60fps 유지)
  useEffect(() => {
    if (phase !== 'play') return
    const step = (now) => {
      const s = sim.current
      if (!s) return
      const dt = Math.min(0.032, (now - s.last) / 1000)
      s.last = now
      s.vy += G * dt
      s.x += s.vx * dt
      s.y += s.vy * dt
      s.spin += s.vx * dt * 0.02

      // 벽 튕김
      if (s.x < 34) { s.x = 34; s.vx = Math.abs(s.vx) * 0.8 }
      if (s.x > s.W - 34) { s.x = s.W - 34; s.vx = -Math.abs(s.vx) * 0.8 }

      if (birdRef.current) {
        birdRef.current.style.transform =
          `translate(${s.x - 34}px, ${s.y - 34}px) rotate(${Math.max(-30, Math.min(30, s.vy * 0.02 + s.spin))}deg)`
      }
      if (shadowRef.current) {
        const t = Math.max(0.2, Math.min(1, s.y / s.H))
        shadowRef.current.style.transform = `translateX(${s.x - 30}px) scale(${t})`
        shadowRef.current.style.opacity = String(0.12 + t * 0.2)
      }

      // 바닥 → 게임 종료
      if (s.y > s.H - 26) {
        setPhase('over')
        setReward(addMiniReward(scoreRef.current))
        return
      }
      raf.current = requestAnimationFrame(step)
    }
    raf.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf.current)
  }, [phase, addMiniReward])

  const tap = (e) => {
    if (phase === 'ready') return start()
    if (phase !== 'play') return
    const s = sim.current
    const rect = areaRef.current.getBoundingClientRect()
    const px = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left
    const py = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top
    const d = Math.hypot(px - s.x, py - s.y)
    if (d < HIT_R) {
      // 친 위치의 반대쪽으로 튀어 오른다
      const power = 620 + Math.min(260, scoreRef.current * 9) // 갈수록 살짝 강하게(=어렵게)
      s.vy = -power
      s.vx = (s.x - px) * 11 + (Math.random() - 0.5) * 120
      scoreRef.current += 1
      setScore(scoreRef.current)
      if (navigator.vibrate) navigator.vibrate(8)
    }
  }

  return (
    <div className="overlay" style={{ zIndex: 65, padding: 0 }} onPointerDown={tap}>
      <div
        ref={areaRef}
        style={{
          position: 'absolute', inset: 0, overflow: 'hidden', touchAction: 'none',
          background: 'linear-gradient(#8fd4f0 0%, #bfe9fb 55%, #7cc576 55.2%, #5aa353 100%)',
        }}
      >
        {/* 코트 라인 느낌 */}
        <div style={{ position: 'absolute', left: 0, right: 0, top: '55%', height: 3, background: 'rgba(255,255,255,.75)' }} />
        <div style={{ position: 'absolute', left: '50%', top: '55%', bottom: 0, width: 3, background: 'rgba(255,255,255,.4)' }} />

        {/* 점수 */}
        <div style={{ position: 'absolute', top: 'calc(env(safe-area-inset-top, 0px) + 18px)', left: 0, right: 0, textAlign: 'center', pointerEvents: 'none' }}>
          <div style={{ fontSize: 64, color: '#fff', textShadow: '0 4px 0 rgba(0,0,0,.15)', fontFamily: 'var(--font)' }}>{score}</div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,.9)', fontFamily: 'var(--font)' }}>
            최고 기록 {Math.max(bestLift, score)}개 · 오늘 획득 {miniCoins}/300🪙
          </div>
        </div>

        {/* 그림자 */}
        <div ref={shadowRef} style={{ position: 'absolute', bottom: 14, width: 60, height: 14, borderRadius: '50%', background: '#234a22', opacity: 0.25 }} />
        {/* 셔틀콕 */}
        {phase !== 'ready' && (
          <div ref={birdRef} style={{ position: 'absolute', width: 68, height: 68, fontSize: 54, lineHeight: '68px', textAlign: 'center', willChange: 'transform', pointerEvents: 'none' }}>
            🏸
          </div>
        )}

        {/* 시작 안내 */}
        {phase === 'ready' && (
          <div className="ac-panel modal-card" style={{ position: 'absolute', left: '50%', top: '42%', transform: 'translate(-50%,-50%)', width: 'min(340px, 86vw)' }}>
            <div style={{ fontSize: 44 }}>🪶</div>
            <h2 style={{ margin: '4px 0', fontSize: 20 }}>셔틀 리프팅</h2>
            <div className="muted">
              떨어지는 셔틀콕을 <b>톡톡 눌러서</b> 계속 띄워봐!<br />
              1개당 6🪙 (하루 300🪙까지)
            </div>
            <button className="ac-btn green wide" style={{ marginTop: 14 }}>시작! (화면을 터치)</button>
          </div>
        )}

        {/* 종료 */}
        {phase === 'over' && (
          <div className="ac-panel modal-card" style={{ position: 'absolute', left: '50%', top: '42%', transform: 'translate(-50%,-50%)', width: 'min(340px, 86vw)' }}>
            <div style={{ fontSize: 44 }}>{score >= bestLift && score > 0 ? '🎉' : '🪶'}</div>
            <h2 style={{ margin: '4px 0', fontSize: 20 }}>
              {score >= bestLift && score > 0 ? '신기록!' : '수고했어!'} {score}개
            </h2>
            <div className="muted">획득 코인 +{reward}🪙</div>
            <div className="row" style={{ marginTop: 14 }}>
              <button className="ac-btn yellow" style={{ flex: 1 }} onPointerDown={(e) => { e.stopPropagation(); start() }}>🔁 한 번 더</button>
              <button className="ac-btn" style={{ flex: 1 }} onPointerDown={(e) => { e.stopPropagation(); onClose() }}>나가기</button>
            </div>
          </div>
        )}

        {/* 닫기 */}
        {phase !== 'over' && (
          <button
            className="pop-close"
            style={{ position: 'absolute', top: 'calc(env(safe-area-inset-top, 0px) + 14px)', right: 14 }}
            onPointerDown={(e) => { e.stopPropagation(); onClose() }}
          >
            ✕
          </button>
        )}
      </div>
    </div>
  )
}
