// ===================================================================================
// 셔틀몬스터 — 경기방 도킹 창 & 이야기 안내
//
// 경기방에 들어간 뒤 대진표를 닫아도, 화면 한쪽에 작은 창이 남아
// 「내가 몇 번째인지 · 몇 분쯤 남았는지 · 지금 몇 코트가 도는지」를 계속 알려 준다.
// 대기 시간이 지루하니 마을을 돌아다니다가, 창을 누르면 곧바로 대진표로 돌아온다.
// ===================================================================================
import { useEffect, useRef, useState } from 'react'
import { useGame } from '../game/store.js'
import { myTurn, turnText } from '../game/queue.js'
import { currentGoal } from '../pixel/story.js'

export function RoomDock() {
  const online = useGame((s) => s.online)
  const panel = useGame((s) => s.panel)
  const players = useGame((s) => s.players)
  const courts = useGame((s) => s.courts)
  const courtCount = useGame((s) => s.courtCount)
  const autoMatches = useGame((s) => s.autoMatches)
  const scheduled = useGame((s) => s.scheduledMatches)
  const history = useGame((s) => s.history)
  const order = useGame((s) => s.order)
  const setPanel = useGame((s) => s.setPanel)

  if (online?.status !== 'room' || panel === 'match') return null

  const t = myTurn({ players, courts, courtCount, autoMatches, scheduledMatches: scheduled, history, order })
  const waiting = Object.values(players).filter((p) => p.status === 'waiting').length
  const playing = courts.filter((c) => c.status === 'playing').length

  const cls = t.state === 'playing' ? 'now' : (t.state === 'next' || t.state === 'queued') ? 'soon' : ''
  const icon = t.state === 'playing' ? '🔥' : t.state === 'next' ? '⏰' : t.state === 'queued' ? '📋' : '🏸'
  const line = t.state === 'waiting' || t.state === 'idle' || t.state === 'resting'
    ? `${turnText(t)} · 대기 ${waiting} · ${playing}/${courtCount}코트`
    : turnText(t)

  return (
    <button className={`pk-win room-dock ${cls}`} onClick={() => setPanel('match')}>
      <span className="rd-icon">{icon}</span>
      <span className="rd-body">
        <b>{online.roomName || '경기방'}</b>
        <em>{line}</em>
      </span>
      <span className="rd-go">▶</span>
    </button>
  )
}

/**
 * 내 차례가 다가오면 한 번만 알려 준다.
 * 코트에 들어가야 할 때는 게임이 먼저 물러나야 한다 — 그게 이 앱의 예의다.
 */
export function TurnAlarm() {
  const last = useRef('')

  // 스토어 전체를 구독하면 토스트 하나에도 다시 그려지므로, 가볍게 훑어보기만 한다
  useEffect(() => {
    const id = setInterval(() => {
      const s = useGame.getState()
      if (s.online?.status !== 'room') { last.current = ''; return }
      const t = myTurn(s)
      const key = `${t.state}:${t.pos || 0}`
      if (key === last.current) return
      const prev = last.current
      last.current = key
      if (!prev) return // 처음 계산한 값은 알리지 않는다

      if (t.state === 'next') {
        s.toast('⏰ 바로 다음 차례야! 코트 앞으로 가자', 'warn')
        navigator.vibrate?.([120, 60, 120])
      } else if (t.state === 'playing') {
        s.toast(`🔥 ${(t.courtId ?? 0) + 1}번 코트 입장! 게임은 잠시 접어 두자`, 'good')
        navigator.vibrate?.([200, 80, 200])
      }
    }, 1200)
    return () => clearInterval(id)
  }, [])

  return null
}

/** 오프닝 이야기 중 「어디로 가야 하는지」 한 줄 안내 */
export function GoalHint() {
  const panel = useGame((s) => s.panel)
  const tutorial = useGame((s) => s.tutorial)
  const [text, setText] = useState(null)

  useEffect(() => {
    const tick = () => setText(currentGoal()?.text || null)
    tick()
    const id = setInterval(tick, 400)
    return () => clearInterval(id)
  }, [tutorial])

  if (!text || panel) return null
  return <div className="goal-hint">👉 {text}</div>
}
