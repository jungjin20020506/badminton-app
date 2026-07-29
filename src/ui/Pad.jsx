// ===================================================================================
// 셔틀몬스터 — 조작부 (십자키 · Ⓐ · Ⓑ · START)
//
// 게임보이 그대로다.
//   십자키 : 걷기 (손가락을 올린 채 방향을 바꿔도 이어서 걷는다)
//   Ⓐ     : 말 걸기 / 조사 / 대화 넘기기 / 선택지 결정
//   Ⓑ     : 누른 채 걸으면 달리기 / 대화·메뉴 닫기
//   START  : 메뉴 열기
// 키보드도 같이 받는다 — 방향키·WASD / Z·Enter·Space / X·Shift / Esc
// ===================================================================================
import { useEffect, useRef } from 'react'
import { pressDir, releaseDir, clearDirs, pressA, setRun } from '../pixel/engine.js'
import { useTalk } from '../pixel/talk.js'
import { useGame } from '../game/store.js'

const DIRS = ['down', 'up', 'left', 'right']

/** 대화 중이면 방향키가 선택지 커서를 움직인다 */
function routeDir(d) {
  const t = useTalk.getState()
  if (t.open && t.choices) {
    if (d === 1) t.moveCursor(-1)
    if (d === 0) t.moveCursor(1)
    return true
  }
  return false
}

export default function Pad({ onMenu }) {
  const padRef = useRef(null)
  const active = useRef(-1)
  const pid = useRef(null)

  // ── 키보드 ──
  useEffect(() => {
    const KEY = {
      ArrowDown: 0, KeyS: 0, ArrowUp: 1, KeyW: 1,
      ArrowLeft: 2, KeyA: 2, ArrowRight: 3, KeyD: 3,
    }
    const down = (e) => {
      if (e.target?.tagName === 'INPUT' || e.target?.tagName === 'TEXTAREA') return
      const d = KEY[e.code]
      if (d !== undefined) {
        e.preventDefault()
        if (e.repeat) return
        if (!routeDir(d)) pressDir(d)
        return
      }
      if (e.code === 'KeyZ' || e.code === 'Enter' || e.code === 'Space') {
        e.preventDefault()
        if (!e.repeat) pressA()
        return
      }
      if (e.code === 'KeyX' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
        setRun(true)
        return
      }
      if (e.code === 'Escape') {
        e.preventDefault()
        const t = useTalk.getState()
        if (t.open) return t.close()
        onMenu?.()
      }
    }
    const up = (e) => {
      const d = KEY[e.code]
      if (d !== undefined) releaseDir(d)
      if (e.code === 'KeyX' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') setRun(false)
    }
    const blur = () => { clearDirs(); setRun(false) }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', blur)
    }
  }, [onMenu])

  // ── 십자키 (손가락 위치로 방향을 계산해서, 밀면서 방향을 바꿔도 끊기지 않는다) ──
  const setFrom = (e) => {
    const el = padRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const dx = e.clientX - (r.left + r.width / 2)
    const dy = e.clientY - (r.top + r.height / 2)
    const dead = r.width * 0.16
    let d = -1
    if (Math.hypot(dx, dy) > dead) d = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 3 : 2) : dy > 0 ? 0 : 1
    if (d === active.current) return
    if (active.current >= 0) releaseDir(active.current)
    active.current = d
    if (d >= 0 && !routeDir(d)) pressDir(d)
    if (d >= 0) el.dataset.dir = DIRS[d]
    else delete el.dataset.dir
  }

  const start = (e) => {
    e.preventDefault()
    pid.current = e.pointerId
    padRef.current?.setPointerCapture?.(e.pointerId)
    setFrom(e)
  }
  const move = (e) => {
    if (pid.current !== e.pointerId) return
    setFrom(e)
  }
  const end = (e) => {
    if (pid.current !== e.pointerId) return
    pid.current = null
    if (active.current >= 0) releaseDir(active.current)
    active.current = -1
    delete padRef.current?.dataset.dir
  }

  useEffect(() => () => clearDirs(), [])

  return (
    <div className="gb-pad">
      <div
        className="dpad"
        ref={padRef}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
      >
        <span className="dpad-arm h" />
        <span className="dpad-arm v" />
        <span className="dpad-hub" />
        <i className="dpad-tip up">▲</i>
        <i className="dpad-tip down">▼</i>
        <i className="dpad-tip left">◀</i>
        <i className="dpad-tip right">▶</i>
      </div>

      <div className="ab-group">
        <button
          className="gb-btn b"
          onPointerDown={(e) => { e.preventDefault(); setRun(true) }}
          onPointerUp={() => setRun(false)}
          onPointerLeave={() => setRun(false)}
          onPointerCancel={() => setRun(false)}
          onClick={() => {
            const t = useTalk.getState()
            if (t.open) t.close()
            else if (useGame.getState().panel) useGame.setState({ panel: null })
          }}
        >
          B
        </button>
        <button className="gb-btn a" onPointerDown={(e) => { e.preventDefault(); pressA() }}>
          A
        </button>
      </div>
    </div>
  )
}
