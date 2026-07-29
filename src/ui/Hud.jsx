// ===================================================================================
// 셔틀몬스터 — 화면 위 UI
//   위쪽   : 지역·시간 / 코인 / 레벨 (작은 창)
//   아래쪽 : 십자키 · Ⓐ · Ⓑ
//   START  : 포켓몬식 세로 메뉴
// ===================================================================================
import { useEffect, useState } from 'react'
import { useGame } from '../game/store.js'
import { expToNext, LEVEL_COLOR, readyQuests } from '../game/constants.js'
import { world } from '../pixel/engine.js'
import Pad from './Pad.jsx'
import TextBox from './TextBox.jsx'
import { RoomDock, GoalHint, TurnAlarm } from './RoomDock.jsx'

const pad2 = (n) => String(n).padStart(2, '0')
export const clockText = (t) => {
  const h = Math.floor(t)
  const m = Math.floor((t - h) * 60)
  const hh = h % 12 === 0 ? 12 : h % 12
  return `${h < 12 ? '오전' : '오후'} ${hh}:${pad2(m)}`
}
const timeIcon = (t) => (t < 5.6 || t > 19.4 ? '🌙' : t < 7.2 ? '🌅' : t < 17.4 ? '☀️' : '🌇')

// -----------------------------------------------------------------------------------
export function Toasts() {
  const toasts = useGame((s) => s.toasts)
  return (
    <div className="toasts">
      {toasts.map((t) => <div key={t.id} className={`toast ${t.kind}`}>{t.text}</div>)}
    </div>
  )
}

// -----------------------------------------------------------------------------------
// 주민 카드 — 명단에서 선수를 눌렀을 때 (필드에서는 대화로 대신한다)
// -----------------------------------------------------------------------------------
export function PlayerPopup() {
  const id = useGame((s) => s.selectedPlayer)
  const player = useGame((s) => (id ? s.players[id] : null))
  const selectPlayer = useGame((s) => s.selectPlayer)
  const toggleRest = useGame((s) => s.toggleRest)
  const removePlayer = useGame((s) => s.removePlayer)
  const setPanel = useGame((s) => s.setPanel)
  const isAdmin = useGame((s) => s.isAdmin)
  const history = useGame((s) => s.history)
  if (!player) return null

  const hearts = Math.floor(player.affinity / 20)
  const together = history.filter((g) => {
    const ids = [...g.teamA, ...g.teamB]
    return ids.includes(player.id) && ids.includes('me')
  }).length

  return (
    <div className="pk-win player-pop">
      <button className="pop-close" onClick={() => selectPlayer(null)}>✕</button>
      <div className="row wrap">
        <b style={{ fontSize: 16 }}>{player.name}</b>
        <span className="lv-tag" style={{ background: LEVEL_COLOR[player.level] }}>{player.level}</span>
        {player.isMe && <span className="pk-chip">⭐ 나</span>}
        {player.status === 'resting' && <span className="pk-chip">💤 휴식</span>}
      </div>
      {!player.isMe && (
        <div className="row" style={{ marginTop: 6 }}>
          <span>{'💛'.repeat(hearts)}{'🤍'.repeat(Math.max(0, 5 - hearts))}</span>
          <span className="muted">친밀도 {player.affinity}</span>
        </div>
      )}
      <div className="muted" style={{ marginTop: 6 }}>
        오늘 {player.todayGames}경기
        {!player.isMe && together > 0 && ` · 나와 ${together}번 함께`}
      </div>
      <div className="row wrap" style={{ marginTop: 10 }}>
        {player.isMe ? (
          <>
            <button className="pk-btn sm" onClick={() => (selectPlayer(null), setPanel('me'))}>⭐ 내 정보</button>
            <button className="pk-btn sm" onClick={() => (selectPlayer(null), setPanel('closet'))}>✨ 꾸미기</button>
          </>
        ) : (
          <>
            {player.status !== 'oncourt' && player.status !== 'walking' && (
              <button className="pk-btn sm" onClick={() => toggleRest(player.id)}>
                {player.status === 'resting' ? '🏸 대기석으로' : '💤 잠깐 쉬기'}
              </button>
            )}
            {isAdmin && (
              <button className="pk-btn sm danger" onClick={() => confirm(`${player.name} 님을 내보낼까요?`) && removePlayer(player.id)}>
                🚪 내보내기
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// -----------------------------------------------------------------------------------
// 출석 도장판
// -----------------------------------------------------------------------------------
export function CheckIn() {
  const show = useGame((s) => s.showCheckIn)
  const streak = useGame((s) => s.streak)
  const checkIn = useGame((s) => s.checkIn)
  const close = useGame((s) => s.closeCheckIn)
  const [result, setResult] = useState(null)
  if (!show && !result) return null

  const day = (streak.count % 7) + 1
  const rewards = [120, 150, 180, 220, 260, 320, 700]

  return (
    <div className="overlay" style={{ zIndex: 70 }}>
      <div className="pk-win modal-card">
        <div className="pk-title">📅 출석 도장판</div>
        <div className="muted">매일 오면 도장을 찍어 줄게. 7일 채우면 큰 선물이 있어!</div>
        <div className="stamp-grid">
          {rewards.map((r, i) => (
            <div key={i} className={`stamp ${i + 1 < day ? 'on' : ''} ${i + 1 === day ? 'today' : ''}`}>
              {i + 1 < day ? '✅' : i === 6 ? '🎁' : '🏸'}
            </div>
          ))}
        </div>
        <div className="muted" style={{ marginTop: 8 }}>
          {result ? `${result.count}일 연속 출석! 🪙${result.coins} + EXP 40 받았어!` : `오늘 보상: 🪙${rewards[day - 1]} + EXP 40`}
        </div>
        {result ? (
          <button className="pk-btn wide" style={{ marginTop: 12 }} onClick={() => { setResult(null); close() }}>고마워!</button>
        ) : (
          <button className="pk-btn wide primary" style={{ marginTop: 12 }} onClick={() => setResult(checkIn())}>도장 찍기 🖐️</button>
        )}
      </div>
    </div>
  )
}

// -----------------------------------------------------------------------------------
// 위쪽 상태창
// -----------------------------------------------------------------------------------
function TopBar({ onMenu }) {
  const coins = useGame((s) => s.coins)
  const me = useGame((s) => s.me)
  const timeOfDay = useGame((s) => s.timeOfDay)
  const day = useGame((s) => s.day)
  const streak = useGame((s) => s.streak)
  const online = useGame((s) => s.online)
  const mailUnread = useGame((s) => s.mail.filter((m) => !m.read || (!m.claimed && m.coins > 0)).length)
  const quests = useGame((s) => s.quests)
  const today = useGame((s) => s.today)
  const [place, setPlace] = useState('셔틀타운')

  // 지도가 바뀌면 이름표도 바뀐다
  useEffect(() => {
    const id = setInterval(() => {
      const label = world.map?.label
      if (label) setPlace((p) => (p === label ? p : label))
    }, 300)
    return () => clearInterval(id)
  }, [])

  const need = expToNext(me.lv)
  const questReady = readyQuests(today, quests).length
  const badge = questReady + mailUnread

  return (
    <div className="topbar">
      <div className="pk-win tb-place">
        <b>{place}</b>
        <span>{timeIcon(timeOfDay)} {day}일차 {clockText(timeOfDay)}</span>
      </div>

      <div className="tb-right">
        <div className="pk-win tb-coin">🪙 {coins.toLocaleString()}</div>
        <div className="pk-win tb-lv">
          <b>Lv.{me.lv}</b>
          <div className="expbar"><i style={{ width: `${Math.min(100, (me.exp / need) * 100)}%` }} /></div>
        </div>
        <button className="pk-btn start-btn" onClick={onMenu}>
          ☰
          {badge > 0 && <span className="badge">{badge}</span>}
        </button>
      </div>

      <div className="tb-badges">
        <RoomDock />
        {streak.count > 0 && <div className="pk-chip">🔥 {streak.count}일 연속</div>}
      </div>
    </div>
  )
}

// -----------------------------------------------------------------------------------
// START 메뉴 — 포켓몬의 그 세로 메뉴
// -----------------------------------------------------------------------------------
function StartMenu({ open, onClose }) {
  const setPanel = useGame((s) => s.setPanel)
  const setScreen = useGame((s) => s.setScreen)
  const me = useGame((s) => s.me)
  const today = useGame((s) => s.today)
  const quests = useGame((s) => s.quests)
  const mailUnread = useGame((s) => s.mail.filter((m) => !m.read || (!m.claimed && m.coins > 0)).length)
  const [cursor, setCursor] = useState(0)

  const questReady = readyQuests(today, quests).length

  const online = useGame((s) => s.online)
  const ITEMS = [
    online?.status === 'room'
      ? { icon: '🏸', label: '경기방', hint: online.roomName || '대진표', run: () => setPanel('match') }
      : { icon: '📡', label: '경기방 찾기', hint: '입장하기', run: () => setPanel('rooms') },
    { icon: '📋', label: '대진표', hint: '코트 · 대기', run: () => setPanel('match') },
    { icon: '📖', label: '선수 도감', hint: '만난 사람 모으기', run: () => setPanel('dex') },
    { icon: '👥', label: '선수 명단', hint: '마을 주민', run: () => setPanel('roster') },
    { icon: '⭐', label: '트레이너 카드', hint: `Lv.${me.lv}`, badge: me.statPoints, run: () => setPanel('me') },
    { icon: '🎒', label: '가방', hint: '가진 아이템 · 상점', run: () => setPanel('shop') },
    { icon: '📜', label: '오늘의 미션', badge: questReady, run: () => setPanel('quests') },
    { icon: '💌', label: '우편함', badge: mailUnread, run: () => setPanel('mail') },
    { icon: '🏆', label: '트로피', run: () => setPanel('trophy') },
    { icon: '📖', label: '경기 기록', run: () => setPanel('record') },
    { icon: '🥇', label: '랭킹', run: () => setPanel('rank') },
    { icon: '🗺️', label: '전국 지도', run: () => setScreen('world') },
    { icon: '📸', label: '사진 찍기', run: () => setPanel('share') },
    { icon: '⚙️', label: '설정', run: () => setPanel('settings') },
  ]

  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.code === 'ArrowUp' || e.code === 'KeyW') { e.preventDefault(); setCursor((c) => (c - 1 + ITEMS.length) % ITEMS.length) }
      if (e.code === 'ArrowDown' || e.code === 'KeyS') { e.preventDefault(); setCursor((c) => (c + 1) % ITEMS.length) }
      if (e.code === 'Enter' || e.code === 'KeyZ' || e.code === 'Space') {
        e.preventDefault()
        ITEMS[cursor]?.run()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open, cursor, onClose])

  if (!open) return null
  return (
    <div className="menu-layer" onClick={onClose}>
      <div className="pk-win start-menu" onClick={(e) => e.stopPropagation()}>
        <div className="menu-head">메뉴</div>
        <div className="menu-list">
          {ITEMS.map((it, i) => (
            <button
              key={it.label}
              className={`menu-item ${i === cursor ? 'on' : ''}`}
              onPointerEnter={() => setCursor(i)}
              onClick={() => { it.run(); onClose() }}
            >
              <i className="mi-cursor">▶</i>
              <span className="mi-icon">{it.icon}</span>
              <span className="mi-label">{it.label}</span>
              {it.hint && <span className="mi-hint">{it.hint}</span>}
              {it.badge > 0 && <span className="badge">{it.badge}</span>}
            </button>
          ))}
          <button className="menu-item close" onClick={onClose}>
            <i className="mi-cursor">▶</i>
            <span className="mi-icon">✕</span>
            <span className="mi-label">닫기</span>
          </button>
        </div>
      </div>
    </div>
  )
}

// -----------------------------------------------------------------------------------
export default function Hud() {
  const [menu, setMenu] = useState(false)
  const panel = useGame((s) => s.panel)
  const showCheckIn = useGame((s) => s.showCheckIn)
  const hidePad = !!panel || showCheckIn

  return (
    <>
      {!panel && <TopBar onMenu={() => setMenu((v) => !v)} />}
      <StartMenu open={menu} onClose={() => setMenu(false)} />
      {!hidePad && <Pad onMenu={() => setMenu((v) => !v)} />}
      <GoalHint />
      <TurnAlarm />
      <TextBox />
      <Toasts />
      <PlayerPopup />
      <CheckIn />
    </>
  )
}
