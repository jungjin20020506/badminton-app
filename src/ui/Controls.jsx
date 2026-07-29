// ===================================================================================
// 화면 조작 — 동물의 숲 방식
//  왼쪽 아날로그 스틱: 기울인 방향으로 계속 걷는다 (살짝=걷기 / 끝까지=달리기)
//  오른쪽 Ⓐ 버튼: 가까이 있는 주민에게 말을 건다 (스페이스/엔터도 같다)
// ===================================================================================
import { useEffect, useRef, useState } from 'react'
import { useGame } from '../game/store.js'
import {
  setStick, clearStick, setActionHandler, setMovementBlocked,
  nearestNeighbor, myPos,
} from '../game/controls.js'

const R = 46 // 스틱이 움직일 수 있는 반경(px)

function Stick() {
  const base = useRef(null)
  const knob = useRef(null)
  const pid = useRef(null)
  const origin = useRef({ x: 0, y: 0 })

  const move = (e) => {
    if (pid.current !== e.pointerId) return
    const rx = e.clientX - origin.current.x
    const ry = e.clientY - origin.current.y
    const d = Math.hypot(rx, ry)
    if (d < 0.001) { setStick(0, 0, 0); return }
    const ux = rx / d
    const uy = ry / d
    const mag = Math.min(1, d / R)
    if (knob.current) knob.current.style.transform = `translate(${ux * mag * R}px, ${uy * mag * R}px)`
    setStick(ux, uy, mag < 0.14 ? 0 : mag) // 데드존
  }

  const end = (e) => {
    if (pid.current !== e.pointerId) return
    pid.current = null
    clearStick()
    if (knob.current) knob.current.style.transform = 'translate(0px, 0px)'
    base.current?.classList.remove('on')
  }

  const start = (e) => {
    e.preventDefault()
    pid.current = e.pointerId
    const r = base.current.getBoundingClientRect()
    origin.current = { x: r.left + r.width / 2, y: r.top + r.height / 2 }
    base.current.setPointerCapture?.(e.pointerId)
    base.current.classList.add('on')
    move(e)
  }

  useEffect(() => () => clearStick(), [])

  return (
    <div
      ref={base}
      className="stick"
      onPointerDown={start}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
    >
      <div className="stick-ring" />
      <div className="stick-knob" ref={knob} />
    </div>
  )
}

export default function Controls() {
  const panel = useGame((s) => s.panel)
  const selected = useGame((s) => s.selectedPlayer)
  const selectPlayer = useGame((s) => s.selectPlayer)
  const players = useGame((s) => s.players)
  const me = players.me
  const [near, setNear] = useState(null)

  // 패널·주민 카드가 떠 있으면 이동을 멈춘다 (동물의 숲도 대화 중엔 못 움직인다)
  const blocked = !!panel || !!selected
  useEffect(() => { setMovementBlocked(blocked) }, [blocked])

  // 경기 중에는 조작할 수 없다 (코트 자리에 서 있어야 하므로)
  const onCourt = me && (me.status === 'oncourt' || me.status === 'walking')
  const canMove = !!me && !onCourt && me.status !== 'resting'

  // 가까운 주민을 계속 살펴 Ⓐ 안내를 띄운다
  useEffect(() => {
    if (!canMove || blocked) { setNear(null); return }
    const id = setInterval(() => {
      const n = nearestNeighbor()
      setNear((prev) => (prev === n ? prev : n))
    }, 160)
    return () => clearInterval(id)
  }, [canMove, blocked])

  // Ⓐ / 스페이스 / 엔터
  useEffect(() => {
    setActionHandler(() => {
      if (blocked || !canMove) return false
      const n = nearestNeighbor()
      if (!n) return false
      selectPlayer(n)
      return true
    })
    return () => setActionHandler(null)
  }, [blocked, canMove, selectPlayer])

  if (!canMove || blocked) return null

  const nearName = near && players[near] ? players[near].name : null

  return (
    <>
      <Stick />
      {nearName && (
        <button
          className="a-btn"
          onPointerDown={(e) => { e.preventDefault(); selectPlayer(near) }}
        >
          <b>A</b>
          <span>{nearName}</span>
        </button>
      )}
    </>
  )
}
