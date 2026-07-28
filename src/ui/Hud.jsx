// ===================================================================================
// HUD (모바일 세로화면 기준) — 상태바 / 하단 네비 / 카메라 조작 / 말풍선 / 출석
// ===================================================================================
import { useEffect, useState } from 'react'
import { useGame } from '../game/store.js'
import { cameraApi } from '../three/Scene.jsx'
import { expToNext, LEVEL_COLOR, CHATTER, TITLES } from '../game/constants.js'
import { pickDailyPartner } from '../game/social.js'

const pad = (n) => String(n).padStart(2, '0')
export const clockText = (t) => {
  const h = Math.floor(t)
  const m = Math.floor((t - h) * 60)
  const hh = h % 12 === 0 ? 12 : h % 12
  return `${h < 12 ? '오전' : '오후'} ${hh}:${pad(m)}`
}
const timeIcon = (t) => (t < 5.6 || t > 19.4 ? '🌙' : t < 7.2 ? '🌅' : t < 17.4 ? '☀️' : '🌇')

export function Toasts() {
  const toasts = useGame((s) => s.toasts)
  return (
    <div className="toasts">
      {toasts.map((t) => <div key={t.id} className={`toast ${t.kind}`}>{t.text}</div>)}
    </div>
  )
}

/** 마을 안내원 코코의 상황별 안내 */
export function Dialogue() {
  const [msg, setMsg] = useState(null)
  const players = useGame((s) => s.players)
  const courts = useGame((s) => s.courts)
  const booted = useGame((s) => s.booted)
  const panel = useGame((s) => s.panel)
  const waiting = Object.values(players).filter((p) => p.status === 'waiting').length
  const total = Object.keys(players).length
  const key = courts.map((c) => c.status).join('')

  useEffect(() => {
    if (!booted) return
    let text = null
    if (total <= 1) text = '아직 마을이 조용하네… 아래 👥 주민에서 친구들을 불러볼까?'
    else if (waiting >= 4 && courts.every((c) => c.status === 'empty')) text = '대기석에 사람이 모였어! 오른쪽 아래 ⚡ 매칭을 눌러봐.'
    else if (courts.some((c) => c.status === 'playing')) text = '경기 시작! 코트를 손가락으로 톡 누르면 가까이서 볼 수 있어 🔍'
    if (!text) return setMsg(null)
    setMsg(text)
    const id = setTimeout(() => setMsg(null), 8000)
    return () => clearTimeout(id)
  }, [waiting, total, booted, key])

  if (!msg || panel) return null
  return (
    <div className="ac-panel dialogue" onClick={() => setMsg(null)}>
      <div style={{ fontSize: 30 }}>🐥</div>
      <div style={{ flex: 1 }}>
        <div className="who">마을 안내원 코코</div>
        <div className="msg">{msg}</div>
      </div>
    </div>
  )
}

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
  const chat = player.affinity >= 60 ? CHATTER.high : player.affinity >= 25 ? CHATTER.mid : CHATTER.low
  const line = chat[(player.name.length + player.todayGames) % chat.length]
  const together = history.filter((g) => {
    const ids = [...g.teamA, ...g.teamB]
    return ids.includes(player.id) && ids.includes('me')
  }).length

  return (
    <div className="ac-panel player-pop">
      <button className="pop-close" onClick={() => selectPlayer(null)}>✕</button>
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <div style={{ fontSize: 30 }}>{player.gender === '여' ? '👧' : '👦'}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="row wrap">
            <b style={{ fontSize: 17 }}>{player.name}</b>
            <span className="lv-tag" style={{ background: LEVEL_COLOR[player.level] }}>{player.level}</span>
            {player.isMe && <span className="ac-chip">⭐ 나</span>}
            {player.status === 'resting' && <span className="ac-chip">💤 휴식</span>}
          </div>
          {!player.isMe && (
            <div className="row" style={{ marginTop: 4 }}>
              <span>{'💛'.repeat(hearts)}{'🤍'.repeat(Math.max(0, 5 - hearts))}</span>
              <span className="muted">친밀도 {player.affinity}</span>
            </div>
          )}
          <div style={{ marginTop: 7, fontSize: 15 }}>“{line}”</div>
          <div className="muted" style={{ marginTop: 4 }}>
            오늘 {player.todayGames}경기 · {player.todayWins}승
            {!player.isMe && together > 0 && ` · 나와 ${together}번`}
          </div>
        </div>
      </div>
      <div className="row wrap" style={{ marginTop: 11 }}>
        {player.isMe ? (
          <>
            <button className="ac-btn sm green" onClick={() => (selectPlayer(null), setPanel('me'))}>⭐ 내 정보</button>
            <button className="ac-btn sm yellow" onClick={() => (selectPlayer(null), setPanel('closet'))}>✨ 꾸미기</button>
          </>
        ) : (
          <>
            {player.status !== 'oncourt' && player.status !== 'walking' && (
              <button className="ac-btn sm" onClick={() => toggleRest(player.id)}>
                {player.status === 'resting' ? '🏸 대기석으로' : '💤 잠깐 쉬기'}
              </button>
            )}
            {isAdmin && (
              <button className="ac-btn sm rose" onClick={() => confirm(`${player.name} 님을 내보낼까요?`) && removePlayer(player.id)}>
                🚪 내보내기
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}

/** 출석 도장판 — 매일 접속하게 만드는 장치 */
export function CheckIn() {
  const show = useGame((s) => s.showCheckIn)
  const streak = useGame((s) => s.streak)
  const checkIn = useGame((s) => s.checkIn)
  const close = useGame((s) => s.closeCheckIn)
  const [result, setResult] = useState(null)
  // 도장을 찍으면 스토어의 show가 꺼지지만, 보상 화면은 계속 보여준다
  if (!show && !result) return null

  const day = ((streak.count) % 7) + 1
  const rewards = [120, 150, 180, 220, 260, 320, 700]

  return (
    <div className="overlay" style={{ zIndex: 70 }}>
      <div className="ac-panel modal-card">
        <div style={{ fontSize: 40 }}>📅</div>
        <h2 style={{ margin: '6px 0 2px', fontSize: 20 }}>출석 도장판</h2>
        <div className="muted">매일 오면 도장을 찍어줄게. 7일 채우면 큰 선물이 있어!</div>
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
          <button className="ac-btn green wide" style={{ marginTop: 12 }} onClick={() => { setResult(null); close() }}>마을로 가기!</button>
        ) : (
          <button className="ac-btn yellow wide" style={{ marginTop: 12 }} onClick={() => setResult(checkIn())}>도장 찍기 🖐️</button>
        )}
      </div>
    </div>
  )
}

export default function Hud() {
  const coins = useGame((s) => s.coins)
  const me = useGame((s) => s.me)
  const meP = useGame((s) => s.players.me)
  const timeOfDay = useGame((s) => s.timeOfDay)
  const day = useGame((s) => s.day)
  const panel = useGame((s) => s.panel)
  const setPanel = useGame((s) => s.setPanel)
  const players = useGame((s) => s.players)
  const courts = useGame((s) => s.courts)
  const cameraFollow = useGame((s) => s.cameraFollow)
  const setSetting = useGame((s) => s.setSetting)
  const today = useGame((s) => s.today)
  const quests = useGame((s) => s.quests)
  const streak = useGame((s) => s.streak)
  const winStreak = useGame((s) => s.winStreak)
  const autoFill = useGame((s) => s.autoFill)
  const career = useGame((s) => s.career)
  const toast = useGame((s) => s.toast)
  const order = useGame((s) => s.order)
  const online = useGame((s) => s.online)
  const mailUnread = useGame((s) => s.mail.filter((m) => !m.read || (!m.claimed && m.coins > 0)).length)
  const partner = pickDailyPartner(players, order)

  const list = Object.values(players)
  const waiting = list.filter((p) => p.status === 'waiting').length
  const playing = courts.filter((c) => c.status === 'playing').length
  const need = expToNext(me.lv)
  const titles = TITLES.filter((t) => t.cond({ career, me }))
  const title = titles[titles.length - 1]

  const questReady = [
    ['play3', 3, today.games], ['win2', 2, today.wins],
    ['newpartner', 1, today.newPartners], ['host5', 5, today.matches],
  ].filter(([id, target, prog]) => prog >= target && !quests[id]?.claimed).length

  const NAV = [
    ['match', '🏸', '경기'],
    ['roster', '👥', '주민'],
    ['shop', '🛍️', '상점'],
    ['me', '⭐', '나'],
    ['more', '☰', '더보기', questReady + mailUnread],
  ]

  return (
    <>
      <div className="status-bar">
        <div className="sb-pill sb-village">
          <div style={{ fontSize: 22 }}>🏝️</div>
          <div>
            <div className="t1">셔틀빌리지</div>
            <div className="t2">{timeIcon(timeOfDay)} {day}일차 {clockText(timeOfDay)} · 대기{waiting} · 경기{playing}</div>
          </div>
        </div>
        <div className="sb-right">
          <div className="sb-pill sb-coin">🪙 {coins.toLocaleString()}</div>
          <div className="sb-pill sb-lv" onClick={() => setPanel('me')}>
            <div className="lv-badge"><span>Lv</span><b>{me.lv}</b></div>
            <div>
              <div className="expbar"><i style={{ width: `${Math.min(100, (me.exp / need) * 100)}%` }} /></div>
              <div style={{ fontSize: 10, color: 'var(--ink-2)', marginTop: 2 }}>
                {me.statPoints > 0 ? `스탯 +${me.statPoints}` : `${me.exp}/${need}`}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="top-badges">
        {online.status === 'room' && (
          <div className="mini-badge hot" onClick={() => setPanel('rooms')}>
            🏸 「{online.roomName}」 {online.isAdmin ? '관리자' : '참가 중'}
          </div>
        )}
        {streak.count > 0 && <div className="mini-badge">🔥 {streak.count}일 연속 출석</div>}
        {winStreak >= 2 && <div className="mini-badge hot">⚡ {winStreak}연승 중!</div>}
        {partner && !today.partnerPlayed && (
          <div className="mini-badge" onClick={() => setPanel('quests')}>💞 오늘의 파트너: {partner.name}</div>
        )}
        {title && <div className="mini-badge">{title.label}</div>}
      </div>

      <div className="side-tools">
        <button className="tool-btn" onClick={() => cameraApi.zoom(0.75)}>➕</button>
        <button className="tool-btn" onClick={() => cameraApi.zoom(1.32)}>➖</button>
        <button className={`tool-btn ${cameraFollow ? 'on' : ''}`} onClick={() => setSetting({ cameraFollow: !cameraFollow })}>🎯</button>
        <button className="tool-btn" onClick={() => { setSetting({ cameraFollow: false, focusCourt: null }); cameraApi.moveTo(0, 2, 30) }}>🗺️</button>
        <button className="tool-btn" onClick={() => setPanel('share')}>📸</button>
      </div>

      {!panel && online.status !== 'room' && (
        <button className="fab" onClick={() => autoFill(false)}>⚡ 매칭</button>
      )}

      <div className="nav-bar">
        {NAV.map(([key, icon, label, badge]) => (
          <button key={key} className={`nav-btn ${panel === key ? 'on' : ''}`} onClick={() => setPanel(key)}>
            <i>{icon}</i>{label}
            {badge > 0 && <span className="badge">{badge}</span>}
          </button>
        ))}
      </div>

      <Toasts />
      <Dialogue />
      <PlayerPopup />
      <CheckIn />
    </>
  )
}
