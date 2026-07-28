// ===================================================================================
// 게임 패널 모음 — 주민 / 경기 / 상점 / 나 / 할일 / 기록 / 설정
// 콕스타(기존 매칭 앱)의 운영 기능을 동물의 숲 톤으로 옮겨 담았다.
// ===================================================================================
import { useState, useMemo } from 'react'
import { useGame } from '../game/store.js'
import {
  LEVELS, LEVEL_COLOR, SENSITIVITIES, STAT_KEYS, DAILY_QUESTS, TITLES,
  HAIR_STYLES, EYE_STYLES, OUTFIT_STYLES, ACCESSORIES, RACKET_MODELS,
  DECORS, COURT_SKINS, expToNext,
} from '../game/constants.js'
import { MAX_COURTS } from '../game/layout.js'
import { clockText } from './Hud.jsx'
import { villageLevel, VILLAGE_LEVELS, TROPHIES, pickDailyPartner } from '../game/social.js'
import { cockstar } from '../net/cockstar.js'
import RoomList from './RoomList.jsx'

const ago = (ts) => {
  const s = Math.floor((Date.now() - ts) / 1000)
  if (s < 60) return `${s}초`
  return `${Math.floor(s / 60)}분`
}

function Sheet({ title, children, onClose }) {
  return (
    <>
      <div className="sheet-back" onClick={onClose} />
      <div className="sheet">
        <div className="grip" />
        <div className="head">
          <div className="ttl">{title}</div>
          <button className="close" onClick={onClose}>✕</button>
        </div>
        <div className="body">{children}</div>
      </div>
    </>
  )
}

// -----------------------------------------------------------------------------------
// 👥 주민
// -----------------------------------------------------------------------------------
function RosterPanel() {
  const players = useGame((s) => s.players)
  const order = useGame((s) => s.order)
  const addPlayer = useGame((s) => s.addPlayer)
  const addSeedRoster = useGame((s) => s.addSeedRoster)
  const addRandomPlayers = useGame((s) => s.addRandomPlayers)
  const toggleRest = useGame((s) => s.toggleRest)
  const removePlayer = useGame((s) => s.removePlayer)
  const selectPlayer = useGame((s) => s.selectPlayer)
  const setPlayerInfo = useGame((s) => s.setPlayerInfo)
  const isAdmin = useGame((s) => s.isAdmin)
  const toast = useGame((s) => s.toast)

  const [name, setName] = useState('')
  const [gender, setGender] = useState('남')
  const [level, setLevel] = useState('C조')
  const [q, setQ] = useState('')
  const [sort, setSort] = useState('wait')
  const [editing, setEditing] = useState(null)

  const list = useMemo(() => {
    let l = order.map((id) => players[id]).filter(Boolean)
    if (q.trim()) l = l.filter((p) => p.name.includes(q.trim()))
    const rank = { A조: 1, B조: 2, C조: 3, D조: 4, N조: 5 }
    if (sort === 'name') l = [...l].sort((a, b) => a.name.localeCompare(b.name))
    if (sort === 'level') l = [...l].sort((a, b) => (rank[a.level] || 9) - (rank[b.level] || 9))
    if (sort === 'games') l = [...l].sort((a, b) => b.todayGames - a.todayGames)
    if (sort === 'wait') l = [...l].sort((a, b) => (a.waitSince || 0) - (b.waitSince || 0))
    return l
  }, [players, order, q, sort])

  const restAll = (rest) => {
    Object.values(players).forEach((p) => {
      if (p.status === 'oncourt' || p.status === 'walking') return
      if (rest && p.status === 'waiting') toggleRest(p.id)
      if (!rest && p.status === 'resting') toggleRest(p.id)
    })
    toast(rest ? '모두 휴식 상태가 됐어.' : '모두 대기석으로 모였어!', 'good')
  }

  return (
    <>
      <div className="sect">🚪 마을에 부르기</div>
      <div className="row" style={{ marginBottom: 8 }}>
        <input className="ac-input" placeholder="이름" value={name} maxLength={10} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="row wrap" style={{ marginBottom: 8 }}>
        {['남', '여'].map((g) => (
          <button key={g} className={`ac-btn sm ${gender === g ? 'green' : ''}`} onClick={() => setGender(g)}>{g}</button>
        ))}
        <span style={{ width: 8 }} />
        {LEVELS.map((l) => (
          <button key={l} className={`ac-btn sm ${level === l ? 'green' : ''}`} onClick={() => setLevel(l)}>{l}</button>
        ))}
      </div>
      <div className="row wrap">
        <button className="ac-btn green" onClick={() => { addPlayer({ name, gender, level }); setName('') }}>➕ 초대하기</button>
        <button className="ac-btn sky sm" onClick={() => addRandomPlayers(8)}>🎲 8명 부르기</button>
        <button className="ac-btn yellow sm" onClick={addSeedRoster}>📋 클럽 전체 명단</button>
      </div>

      <div className="sect">🧑‍🤝‍🧑 주민 {list.length}명</div>
      <div className="row" style={{ marginBottom: 8 }}>
        <input className="ac-input" placeholder="이름 검색" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="row wrap" style={{ marginBottom: 10 }}>
        {[['wait', '대기순'], ['name', '이름순'], ['level', '급수순'], ['games', '경기순']].map(([k, l]) => (
          <button key={k} className={`ac-btn sm ${sort === k ? 'green' : ''}`} onClick={() => setSort(k)}>{l}</button>
        ))}
        <span style={{ flex: 1 }} />
        <button className="ac-btn sm" onClick={() => restAll(false)}>전체 대기</button>
        <button className="ac-btn sm" onClick={() => restAll(true)}>전체 휴식</button>
      </div>

      <div className="plist">
        {list.map((p) => (
          <div key={p.id} className={`pcard ${p.isMe ? 'me' : ''} ${p.status === 'oncourt' || p.status === 'walking' ? 'playing' : ''} ${p.status === 'resting' ? 'resting' : ''}`}>
            <span className="lv-tag" style={{ background: LEVEL_COLOR[p.level] }}>{p.level}</span>
            <div className="nm" onClick={() => selectPlayer(p.id)} style={{ cursor: 'pointer' }}>
              {p.isMe && '⭐ '}{p.name} <span className="muted">{p.gender}</span>
              <div className="sub">
                {p.status === 'oncourt' || p.status === 'walking'
                  ? `🏸 ${p.courtId + 1}번 코트`
                  : p.status === 'resting'
                  ? '💤 휴식 중'
                  : `⏳ ${ago(p.waitSince)} 대기`} · 오늘 {p.todayGames}경기 {p.todayWins}승
                {!p.isMe && p.affinity > 0 && ` · 💛${Math.floor(p.affinity / 20)}`}
              </div>
            </div>
            {p.status !== 'oncourt' && p.status !== 'walking' && (
              <button className="ac-btn sm" onClick={() => toggleRest(p.id)}>{p.status === 'resting' ? '복귀' : '휴식'}</button>
            )}
            {isAdmin && !p.isMe && (
              <button className="ac-btn sm" onClick={() => setEditing(editing === p.id ? null : p.id)}>✏️</button>
            )}
            {isAdmin && !p.isMe && (
              <button className="ac-btn sm rose" onClick={() => confirm(`${p.name} 님을 내보낼까요?`) && removePlayer(p.id)}>✕</button>
            )}
            {editing === p.id && (
              <div style={{ flexBasis: '100%', marginTop: 6 }}>
                <div className="row wrap">
                  {LEVELS.map((l) => (
                    <button key={l} className={`ac-btn sm ${p.level === l ? 'green' : ''}`} onClick={() => setPlayerInfo(p.id, { level: l })}>{l}</button>
                  ))}
                  {['남', '여'].map((g) => (
                    <button key={g} className={`ac-btn sm ${p.gender === g ? 'green' : ''}`} onClick={() => setPlayerInfo(p.id, { gender: g })}>{g}</button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  )
}

// -----------------------------------------------------------------------------------
// 🏸 경기
// -----------------------------------------------------------------------------------
function MatchPanel() {
  const courts = useGame((s) => s.courts)
  const players = useGame((s) => s.players)
  const order = useGame((s) => s.order)
  const courtCount = useGame((s) => s.courtCount)
  const setCourtCount = useGame((s) => s.setCourtCount)
  const autoFill = useGame((s) => s.autoFill)
  const clearCourt = useGame((s) => s.clearCourt)
  const assign = useGame((s) => s.assign)
  const autoMatch = useGame((s) => s.autoMatch)
  const sensitivity = useGame((s) => s.sensitivity)
  const targetScore = useGame((s) => s.targetScore)
  const gameSpeed = useGame((s) => s.gameSpeed)
  const setSetting = useGame((s) => s.setSetting)
  const history = useGame((s) => s.history)
  const [pick, setPick] = useState(null)

  const waiting = order.map((id) => players[id]).filter((p) => p && p.status === 'waiting')
  const sens = SENSITIVITIES.find((s) => s.key === sensitivity)
  const online = useGame((s) => s.online)
  const roomInfo = useGame((s) => s.roomInfo)

  // ── 콕스타 경기방 모드 ──────────────────────────────────────────
  if (online.status === 'room') {
    const pickWaiting = (n) => waiting.slice(0, n).map((p) => p.id)
    const act = (fn) => fn().catch((e) => useGame.getState().toast(e.message, 'warn'))
    return (
      <>
        <div className="court-mini live" style={{ padding: 12 }}>
          <div className="spread">
            <b>🏸 {online.roomName}</b>
            <span className="ac-chip">{online.isAdmin ? '👑 관리자' : '🙋 참가자'}</span>
          </div>
          <div className="muted" style={{ marginTop: 4 }}>
            📍 {roomInfo?.location || '-'} · 참가 {order.length}명 / 정원 {roomInfo?.maxPlayers || '-'}명
          </div>
        </div>

        {online.isAdmin && (
          <>
            <div className="sect">🏟️ 코트 {courtCount}개</div>
            <div className="row wrap" style={{ marginBottom: 10 }}>
              {Array.from({ length: MAX_COURTS }, (_, i) => i + 1).map((n) => (
                <button key={n} className={`ac-btn sm ${courtCount === n ? 'green' : ''}`}
                  onClick={() => act(() => cockstar.setCourtCountRemote(n))}>{n}</button>
              ))}
            </div>
          </>
        )}

        <div className="sect">코트 현황</div>
        <div className="grid2">
          {courts.map((c) => (
            <div key={c.id} className={`court-mini ${c.status === 'playing' ? 'live' : ''}`}>
              <div className="spread">
                <b>{c.id + 1}번 코트</b>
                <span className="muted">
                  {c.status === 'playing' ? '경기 중' : c.status === 'filling' ? '이동 중' : '비어 있음'}
                </span>
              </div>
              <div className="slots">
                {c.players.map((pid, i) => (
                  <div key={i} className={`slot ${pid ? 'filled' : 'empty'}`}>{pid ? players[pid]?.name : '-'}</div>
                ))}
              </div>
              {online.isAdmin && (
                c.players.some(Boolean) ? (
                  <button className="ac-btn sm wide" style={{ marginTop: 6 }}
                    onClick={() => confirm('경기를 종료할까요?') && act(() => cockstar.endCourt(c.id))}>
                    경기 종료
                  </button>
                ) : (
                  <button className="ac-btn sm green wide" style={{ marginTop: 6 }} disabled={waiting.length < 4}
                    onClick={() => act(() => cockstar.startCourt(c.id, pickWaiting(4)))}>
                    앞 4명 투입
                  </button>
                )
              )}
            </div>
          ))}
        </div>

        <div className="sect">⏳ 대기 {waiting.length}명</div>
        <div className="plist">
          {waiting.map((p, i) => (
            <div key={p.id} className={`pcard ${p.isMe ? 'me' : ''}`}>
              <span className="ac-chip">{i + 1}</span>
              <span className="lv-tag" style={{ background: LEVEL_COLOR[p.level] }}>{p.level}</span>
              <div className="nm">{p.name}<div className="sub">오늘 {p.todayGames}경기</div></div>
              {(p.isMe || online.isAdmin) && (
                <button className="ac-btn sm" onClick={() => act(() => cockstar.setResting(p.id, true))}>휴식</button>
              )}
            </div>
          ))}
          {!waiting.length && <div className="muted">대기 중인 선수가 없어.</div>}
        </div>

        <div className="muted" style={{ marginTop: 14 }}>
          여기서 바꾸면 콕스타 앱에도 똑같이 반영돼. 반대로 콕스타에서 바꿔도 이 마을이 바로 움직여!
        </div>
      </>
    )
  }


  // '안 친 사람' — 나와 오늘 아직 경기하지 않은 주민
  const playedWithMe = new Set()
  history.forEach((g) => {
    const ids = [...g.teamA, ...g.teamB]
    if (ids.includes('me')) ids.forEach((i) => playedWithMe.add(i))
  })

  return (
    <>
      <div className="sect">🏟️ 코트 {courtCount}개</div>
      <div className="row wrap" style={{ marginBottom: 10 }}>
        {Array.from({ length: MAX_COURTS }, (_, i) => i + 1).map((n) => (
          <button key={n} className={`ac-btn sm ${courtCount === n ? 'green' : ''}`} onClick={() => setCourtCount(n)}>{n}</button>
        ))}
      </div>

      <div className="grid2">
        {courts.map((c) => (
          <div key={c.id} className={`court-mini ${c.status === 'playing' ? 'live' : ''}`}>
            <div className="spread">
              <b>{c.id + 1}번 코트</b>
              <span className="muted">
                {c.status === 'playing' ? `${c.score[0]}:${c.score[1]}` : c.status === 'filling' ? '이동 중' : c.status === 'done' ? '정리 중' : '비어 있음'}
              </span>
            </div>
            <div className="slots">
              {c.players.map((pid, i) => (
                <div
                  key={i}
                  className={`slot ${pid ? 'filled' : 'empty'}`}
                  onClick={() => c.status !== 'playing' && setPick(pid ? null : { courtId: c.id, slot: i })}
                >
                  {pid ? players[pid]?.name : '＋'}
                </div>
              ))}
            </div>
            {c.status !== 'playing' && c.players.some(Boolean) && (
              <button className="ac-btn sm wide" style={{ marginTop: 6 }} onClick={() => clearCourt(c.id)}>비우기</button>
            )}
          </div>
        ))}
      </div>

      {pick && (
        <>
          <div className="sect">누구를 {pick.courtId + 1}번 코트에 넣을까?</div>
          <div className="row wrap">
            {waiting.map((p) => (
              <button key={p.id} className="ac-btn sm" onClick={() => { assign(p.id, pick.courtId, pick.slot); setPick(null) }}>
                {p.name}
              </button>
            ))}
            <button className="ac-btn sm rose" onClick={() => setPick(null)}>취소</button>
          </div>
        </>
      )}

      <div className="sect">🤖 자동 매칭</div>
      <div className="row wrap" style={{ marginBottom: 8 }}>
        <button className={`ac-btn ${autoMatch ? 'green' : ''}`} onClick={() => setSetting({ autoMatch: !autoMatch })}>
          {autoMatch ? '✅ 자동 매칭 켜짐' : '⛔ 자동 매칭 꺼짐'}
        </button>
        <button className="ac-btn yellow" onClick={() => autoFill(false)}>⚡ 지금 짜기</button>
      </div>
      <div className="row wrap">
        {SENSITIVITIES.map((s) => (
          <button key={s.key} className={`ac-btn sm ${sensitivity === s.key ? 'green' : ''}`} onClick={() => setSetting({ sensitivity: s.key })}>
            {s.label}
          </button>
        ))}
      </div>
      <div className="muted" style={{ marginTop: 6 }}>{sens.short} — {sens.desc}</div>

      <div className="sect">🎮 경기 설정</div>
      <div className="row wrap" style={{ marginBottom: 8 }}>
        <span className="muted">목표 점수</span>
        {[11, 15, 21].map((n) => (
          <button key={n} className={`ac-btn sm ${targetScore === n ? 'green' : ''}`} onClick={() => setSetting({ targetScore: n })}>{n}점</button>
        ))}
      </div>
      <div className="row wrap">
        <span className="muted">진행 속도</span>
        {[1, 2, 4].map((n) => (
          <button key={n} className={`ac-btn sm ${gameSpeed === n ? 'green' : ''}`} onClick={() => setSetting({ gameSpeed: n })}>{n}배</button>
        ))}
      </div>

      <div className="sect">⏳ 대기석 {waiting.length}명</div>
      <div className="plist">
        {waiting.map((p, i) => (
          <div key={p.id} className={`pcard ${p.isMe ? 'me' : ''}`}>
            <span className="ac-chip">{i + 1}</span>
            <span className="lv-tag" style={{ background: LEVEL_COLOR[p.level] }}>{p.level}</span>
            <div className="nm">
              {p.name}
              <div className="sub">
                ⏳ {ago(p.waitSince)} 대기 · {p.todayGames}경기
                {!p.isMe && !playedWithMe.has(p.id) && <b style={{ color: '#e0687e' }}> · 아직 안 친 사이!</b>}
              </div>
            </div>
          </div>
        ))}
        {!waiting.length && <div className="muted">대기석이 비었어. 👥 주민 메뉴에서 사람을 불러보자!</div>}
      </div>
    </>
  )
}

// -----------------------------------------------------------------------------------
// 🛍️ 상점
// -----------------------------------------------------------------------------------
function ShopPanel() {
  const coins = useGame((s) => s.coins)
  const owned = useGame((s) => s.owned)
  const buy = useGame((s) => s.buy)
  const setLook = useGame((s) => s.setLook)
  const setSetting = useGame((s) => s.setSetting)
  const courtSkin = useGame((s) => s.courtSkin)
  const [tab, setTab] = useState('hair')

  const CATS = [
    ['hair', '💇 머리', HAIR_STYLES],
    ['eyes', '👀 눈매', EYE_STYLES],
    ['outfit', '👕 유니폼', OUTFIT_STYLES],
    ['acc', '🧢 액세서리', ACCESSORIES],
    ['racket', '🏸 라켓', RACKET_MODELS],
    ['decor', '🌳 마당 꾸미기', DECORS],
    ['court', '🎨 코트 바닥', COURT_SKINS],
  ]
  const items = CATS.find((c) => c[0] === tab)[2].filter((i) => (i.price ?? 0) > 0 || tab === 'court')

  const equip = (it) => {
    if (tab === 'hair') setLook('me', { hair: it.id })
    else if (tab === 'eyes') setLook('me', { eyes: it.id })
    else if (tab === 'outfit') setLook('me', { outfit: it.id })
    else if (tab === 'acc') setLook('me', { acc: it.id })
    else if (tab === 'racket') setLook('me', { racket: { ...useGame.getState().players.me.look.racket, model: it.id } })
    else if (tab === 'court') setSetting({ courtSkin: it.id })
  }

  return (
    <>
      <div className="spread">
        <div className="muted">너굴상점에 온 걸 환영해! 🪙 코인은 경기를 뛰면 모여.</div>
        <div className="ac-chip">🪙 {coins.toLocaleString()}</div>
      </div>
      <div className="tabs" style={{ marginTop: 10 }}>
        {CATS.map(([k, l]) => (
          <button key={k} className={`tab ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>
      <div className="opt-grid">
        {items.map((it) => {
          const have = owned[it.id]
          const isOn = tab === 'court' && courtSkin === it.id
          return (
            <button
              key={it.id}
              className={`opt ${isOn ? 'on' : ''} ${!have ? 'locked' : ''}`}
              onClick={() => (have ? equip(it) : buy(it))}
            >
              {it.label}
              <span className="price">{have ? (tab === 'decor' ? '✅ 설치됨' : isOn ? '사용 중' : '착용하기') : `🪙 ${it.price}`}</span>
            </button>
          )
        })}
      </div>
      <div className="muted" style={{ marginTop: 12 }}>
        🌳 마당 꾸미기 아이템은 사면 바로 마을에 놓여! 카메라를 돌려서 구경해봐.
      </div>
    </>
  )
}

// -----------------------------------------------------------------------------------
// ⭐ 나
// -----------------------------------------------------------------------------------
function MePanel() {
  const me = useGame((s) => s.me)
  const meP = useGame((s) => s.players.me)
  const addStat = useGame((s) => s.addStat)
  const career = useGame((s) => s.career)
  const players = useGame((s) => s.players)
  const setPanel = useGame((s) => s.setPanel)
  const need = expToNext(me.lv)
  const titles = TITLES.filter((t) => t.cond({ career, me }))
  const friends = Object.values(players).filter((p) => !p.isMe && p.affinity > 0).sort((a, b) => b.affinity - a.affinity).slice(0, 8)
  const winRate = career.games ? Math.round((career.wins / career.games) * 100) : 0

  return (
    <>
      <div className="row">
        <div style={{ fontSize: 40 }}>{meP?.gender === '여' ? '👧' : '👦'}</div>
        <div style={{ flex: 1 }}>
          <div className="row">
            <b style={{ fontSize: 19 }}>{meP?.name}</b>
            <span className="lv-tag" style={{ background: LEVEL_COLOR[meP?.level] }}>{meP?.level}</span>
          </div>
          <div className="expbar" style={{ width: '100%', marginTop: 5 }}>
            <i style={{ width: `${Math.min(100, (me.exp / need) * 100)}%` }} />
          </div>
          <div className="muted">Lv.{me.lv} · EXP {me.exp}/{need}</div>
        </div>
      </div>
      <button className="ac-btn yellow wide" style={{ marginTop: 10 }} onClick={() => setPanel('closet')}>✨ 옷장 열기 (모습 바꾸기)</button>

      <div className="sect">💪 능력치 {me.statPoints > 0 && <span className="ac-chip">포인트 {me.statPoints}</span>}</div>
      {STAT_KEYS.map((s) => (
        <div key={s.key} className="stat-row">
          <span className="lbl">{s.icon} {s.label}</span>
          <span className="stat-bar"><i style={{ width: `${Math.min(100, me.stats[s.key] * 4)}%` }} /></span>
          <span className="val">{me.stats[s.key]}</span>
          <button className="ac-btn sm green" disabled={me.statPoints <= 0} onClick={() => addStat(s.key)}>＋</button>
        </div>
      ))}
      <div className="muted">능력치를 올리면 경기에서 점수를 딸 확률이 올라가.</div>

      <div className="sect">📊 통산 기록</div>
      <div className="grid3">
        <div className="court-mini"><div className="muted">경기</div><b>{career.games}</b></div>
        <div className="court-mini"><div className="muted">승리</div><b>{career.wins}</b></div>
        <div className="court-mini"><div className="muted">승률</div><b>{winRate}%</b></div>
      </div>

      <div className="sect">🏅 칭호</div>
      <div className="row wrap">
        {titles.map((t) => <span key={t.id} className="ac-chip">{t.label}</span>)}
      </div>
      <div className="muted" style={{ marginTop: 6 }}>
        잠긴 칭호: {TITLES.filter((t) => !titles.includes(t)).map((t) => t.label).join(' · ') || '전부 모았어! 🎉'}
      </div>

      <div className="sect">💛 친한 주민</div>
      <div className="plist">
        {friends.map((p) => (
          <div key={p.id} className="pcard">
            <span className="lv-tag" style={{ background: LEVEL_COLOR[p.level] }}>{p.level}</span>
            <div className="nm">{p.name}<div className="sub">{'💛'.repeat(Math.floor(p.affinity / 20))}{'🤍'.repeat(Math.max(0, 5 - Math.floor(p.affinity / 20)))} {p.affinity}</div></div>
          </div>
        ))}
        {!friends.length && <div className="muted">아직 친해진 주민이 없어. 같이 경기를 뛰면 친밀도가 올라가!</div>}
      </div>
    </>
  )
}

// -----------------------------------------------------------------------------------
// 📜 할일
// -----------------------------------------------------------------------------------
function QuestPanel() {
  const today = useGame((s) => s.today)
  const quests = useGame((s) => s.quests)
  const claim = useGame((s) => s.claimQuest)
  const players = useGame((s) => s.players)
  const order = useGame((s) => s.order)
  const partner = pickDailyPartner(players, order)
  return (
    <>
      <div className="muted">매일 자정이 지나면 새로운 할 일이 도착해!</div>
      {partner && (
        <div className="court-mini live" style={{ marginTop: 10, padding: 12 }}>
          <div className="spread">
            <b>💞 오늘의 추천 파트너</b>
            {today.partnerPlayed && <span className="ac-chip">✅ 완료!</span>}
          </div>
          <div style={{ marginTop: 5 }}>
            <span className="lv-tag" style={{ background: LEVEL_COLOR[partner.level] }}>{partner.level}</span>{' '}
            <b>{partner.name}</b> 님과 <b>같은 팀</b>으로 뛰면 그 경기 코인이 <b>2배!</b>
          </div>
          <div className="muted" style={{ marginTop: 4 }}>파트너는 매일 자정에 바뀌어.</div>
        </div>
      )}
      <div style={{ marginTop: 12 }}>
        {DAILY_QUESTS.map((q) => {
          const prog = today[q.track] || 0
          const done = prog >= q.target
          const claimed = quests[q.id]?.claimed
          return (
            <div key={q.id} className={`quest ${done ? 'done' : ''}`}>
              <div style={{ fontSize: 22 }}>{claimed ? '✅' : done ? '🎁' : '📌'}</div>
              <div className="qp">
                <div>{q.label}</div>
                <div className="qbar"><i style={{ width: `${Math.min(100, (prog / q.target) * 100)}%` }} /></div>
                <div className="muted">{Math.min(prog, q.target)}/{q.target} · 보상 🪙{q.coin} · EXP{q.exp}</div>
              </div>
              <button className="ac-btn sm green" disabled={!done || claimed} onClick={() => claim(q)}>
                {claimed ? '완료' : '받기'}
              </button>
            </div>
          )
        })}
      </div>
      <div className="sect">오늘의 활동</div>
      <div className="grid3">
        <div className="court-mini"><div className="muted">내 경기</div><b>{today.games}</b></div>
        <div className="court-mini"><div className="muted">승리</div><b>{today.wins}</b></div>
        <div className="court-mini"><div className="muted">진행한 경기</div><b>{today.matches}</b></div>
      </div>
    </>
  )
}

// -----------------------------------------------------------------------------------
// 📖 기록
// -----------------------------------------------------------------------------------
function RecordPanel() {
  const history = useGame((s) => s.history)
  const players = useGame((s) => s.players)
  const nameOf = (id) => players[id]?.name || '?'
  return (
    <>
      <div className="muted">마을에서 있었던 경기들이야.</div>
      <div className="plist" style={{ marginTop: 10 }}>
        {history.map((g) => {
          const winA = g.winner === 0
          return (
            <div key={g.id} className="pcard">
              <span className="ac-chip">{g.courtId + 1}코트</span>
              <div className="nm">
                <span style={{ color: winA ? '#4f9d55' : undefined }}>
                  {winA && '🏆 '}{nameOf(g.teamA[0])}·{nameOf(g.teamA[1])}
                </span>
                <b> {g.score[0]}:{g.score[1]} </b>
                <span style={{ color: !winA ? '#4f9d55' : undefined }}>
                  {!winA && '🏆 '}{nameOf(g.teamB[0])}·{nameOf(g.teamB[1])}
                </span>
                <div className="sub">{ago(g.at)} 전</div>
              </div>
            </div>
          )
        })}
        {!history.length && <div className="muted">아직 경기 기록이 없어. 첫 경기를 시작해볼까?</div>}
      </div>
    </>
  )
}

// -----------------------------------------------------------------------------------
// ⚙️ 설정
// -----------------------------------------------------------------------------------
function SettingsPanel() {
  const s = useGame()
  const setSetting = useGame((st) => st.setSetting)
  const resetAll = useGame((st) => st.resetAll)
  const advanceTime = useGame((st) => st.advanceTime)
  const setPanel = useGame((st) => st.setPanel)

  return (
    <>
      <div className="sect">👤 콕스타 계정</div>
      {s.auth ? (
        <div className="row wrap">
          <span className="ac-chip">
            {s.auth.superAdmin && '👑 '}{s.auth.profile?.name || '선수'} · {s.auth.profile?.level || 'N조'}
          </span>
          <button className="ac-btn sm" onClick={() => setPanel('rooms')}>🏸 경기방</button>
          <button className="ac-btn sm rose" onClick={() => cockstar.logout()}>로그아웃</button>
        </div>
      ) : (
        <>
          <button className="ac-btn green wide" onClick={() => setPanel('login')}>🔑 콕스타 계정으로 로그인</button>
          <div className="muted" style={{ marginTop: 6 }}>
            콕스타에서 쓰던 계정 그대로 로그인하면, 콕스타 경기방에 그대로 입장할 수 있어요.
            로그인하지 않아도 혼자 노는 마을은 그대로 즐길 수 있어요.
          </div>
        </>
      )}

      <div className="sect">🕐 마을 시간</div>
      <div className="row wrap">
        <span className="ac-chip">{clockText(s.timeOfDay)}</span>
        <button className="ac-btn sm" onClick={() => advanceTime(-1)}>◀ 1시간</button>
        <button className="ac-btn sm" onClick={() => advanceTime(1)}>1시간 ▶</button>
        <button className="ac-btn sm yellow" onClick={() => setSetting({ timeOfDay: 13 })}>☀️ 낮</button>
        <button className="ac-btn sm sky" onClick={() => setSetting({ timeOfDay: 21 })}>🌙 밤</button>
      </div>

      <div className="sect">🏟️ 코트</div>
      <div className="row wrap">
        {Array.from({ length: MAX_COURTS }, (_, i) => i + 1).map((n) => (
          <button key={n} className={`ac-btn sm ${s.courtCount === n ? 'green' : ''}`} onClick={() => s.setCourtCount(n)}>{n}개</button>
        ))}
      </div>

      <div className="sect">🎮 경기</div>
      <div className="row wrap" style={{ marginBottom: 8 }}>
        <span className="muted">목표 점수</span>
        {[11, 15, 21].map((n) => (
          <button key={n} className={`ac-btn sm ${s.targetScore === n ? 'green' : ''}`} onClick={() => setSetting({ targetScore: n })}>{n}</button>
        ))}
      </div>
      <div className="row wrap">
        <span className="muted">속도</span>
        {[1, 2, 4].map((n) => (
          <button key={n} className={`ac-btn sm ${s.gameSpeed === n ? 'green' : ''}`} onClick={() => setSetting({ gameSpeed: n })}>{n}배</button>
        ))}
      </div>

      <div className="sect">🏆 시즌</div>
      <input
        className="ac-input"
        placeholder="예: 2026 여름 리그"
        value={s.seasonName}
        onChange={(e) => setSetting({ seasonName: e.target.value })}
      />

      <div className="sect">🎨 그래픽 품질</div>
      <div className="row wrap">
        {[['low', '가볍게'], ['mid', '보통 (추천)'], ['high', '최고 화질']].map(([k, l]) => (
          <button key={k} className={`ac-btn sm ${s.graphics === k ? 'green' : ''}`} onClick={() => s.setGraphics(k)}>{l}</button>
        ))}
      </div>
      <div className="muted" style={{ marginTop: 6 }}>
        폰이 뜨겁거나 느리면 '가볍게'로 바꿔봐. 최고 화질은 배경 흐림(심도) 효과까지 켜져.
      </div>

      <div className="sect">🧹 운영 정리</div>
      <div className="row wrap">
        <button className="ac-btn sm sky" onClick={() => s.systemReset()}>모두 대기석으로</button>
        <button className="ac-btn sm" onClick={() => confirm('오늘 경기 기록을 모두 지울까요?') && s.clearHistory()}>오늘 기록 지우기</button>
      </div>

      <div className="sect">🔑 관리자</div>
      <button className={`ac-btn ${s.isAdmin ? 'green' : ''}`} onClick={() => setSetting({ isAdmin: !s.isAdmin })}>
        {s.isAdmin ? '✅ 관리자 모드 켜짐' : '⛔ 관리자 모드 꺼짐'}
      </button>
      <div className="muted" style={{ marginTop: 6 }}>관리자 모드에서는 주민 편집·삭제, 코트 강제 배정을 할 수 있어.</div>

      <div className="sect">💾 데이터</div>
      <button className="ac-btn rose wide" onClick={() => confirm('정말 마을을 처음부터 다시 시작할까요? 모든 기록이 사라져요!') && resetAll()}>
        🗑️ 마을 초기화
      </button>
    </>
  )
}

// -----------------------------------------------------------------------------------
// ☰ 더보기
// -----------------------------------------------------------------------------------
function MorePanel() {
  const setPanel = useGame((s) => s.setPanel)
  const today = useGame((s) => s.today)
  const quests = useGame((s) => s.quests)
  const mailUnread = useGame((s) => s.mail.filter((m) => !m.read || (!m.claimed && m.coins > 0)).length)
  const ready = DAILY_QUESTS.filter((q) => (today[q.track] || 0) >= q.target && !quests[q.id]?.claimed).length
  const ITEMS = [
    ['rooms', '🏸', '콕스타 경기방'],
    ['quests', '📜', '오늘의 할 일', ready],
    ['mail', '💌', '우편함', mailUnread],
    ['gacha', '🎁', '셔틀콕 뽑기'],
    ['minigame', '🪶', '셔틀 리프팅'],
    ['share', '📸', '스토리 공유'],
    ['trophy', '🏆', '트로피룸'],
    ['rank', '🥇', '마을 랭킹'],
    ['record', '📖', '경기 기록'],
    ['closet', '✨', '옷장'],
    ['settings', '⚙️', '설정'],
  ]
  return (
    <div className="opt-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
      {ITEMS.map(([k, icon, label, badge]) => (
        <button key={k} className="opt" style={{ minHeight: 84 }} onClick={() => setPanel(k)}>
          <div style={{ fontSize: 26 }}>{icon}</div>
          {label}
          {badge > 0 && <span className="price" style={{ color: 'var(--rose-dark)' }}>받을 보상 {badge}개!</span>}
        </button>
      ))}
    </div>
  )
}

// -----------------------------------------------------------------------------------
// 💌 우편함
// -----------------------------------------------------------------------------------
function MailPanel() {
  const mail = useGame((s) => s.mail)
  const readMail = useGame((s) => s.readMail)
  const claimMail = useGame((s) => s.claimMail)
  const [open, setOpen] = useState(null)

  return (
    <>
      <div className="muted">코코와 마을 소식지가 편지를 보내와. 선물도 들어 있어!</div>
      <div className="plist" style={{ marginTop: 10 }}>
        {mail.map((m) => (
          <div key={m.id} className={`pcard ${!m.read ? 'me' : ''}`} style={{ cursor: 'pointer' }}
            onClick={() => { setOpen(open === m.id ? null : m.id); if (!m.read) readMail(m.id) }}>
            <span style={{ fontSize: 22 }}>{m.icon}</span>
            <div className="nm">
              {!m.read && '🔴 '}{m.title}
              <div className="sub">{m.from} · {new Date(m.at).toLocaleDateString('ko-KR')}</div>
              {open === m.id && (
                <div style={{ marginTop: 8, fontSize: 14, whiteSpace: 'pre-line', lineHeight: 1.55 }}>{m.body}</div>
              )}
            </div>
            {m.coins > 0 && (
              <button className="ac-btn sm yellow" disabled={m.claimed}
                onClick={(e) => { e.stopPropagation(); claimMail(m.id) }}>
                {m.claimed ? '받음' : `🪙${m.coins} 받기`}
              </button>
            )}
          </div>
        ))}
        {!mail.length && <div className="muted">아직 도착한 편지가 없어.</div>}
      </div>
    </>
  )
}

// -----------------------------------------------------------------------------------
// 🏆 트로피룸 + 마을 발전도
// -----------------------------------------------------------------------------------
function TrophyPanel() {
  const achievements = useGame((s) => s.achievements)
  const state = useGame()
  const v = villageLevel(state)
  const earned = TROPHIES.filter((t) => achievements[t.id])
  const locked = TROPHIES.filter((t) => !achievements[t.id])
  const progress = v.next ? Math.min(100, ((v.score - v.need) / (v.next.need - v.need)) * 100) : 100

  return (
    <>
      <div className="court-mini" style={{ padding: 12 }}>
        <div className="spread">
          <b>🏝️ 마을 발전도 Lv.{v.lv}</b>
          <span className="ac-chip">{v.label}</span>
        </div>
        <div className="qbar" style={{ marginTop: 8 }}><i style={{ width: `${progress}%` }} /></div>
        <div className="muted" style={{ marginTop: 6 }}>
          {v.next
            ? `다음 단계(${v.next.label})까지 ${v.next.need - v.score}점 — ${v.next.unlock}`
            : '최고 단계 달성! 마을이 반짝반짝해 ✨'}
        </div>
        <div className="muted" style={{ marginTop: 4 }}>
          마당 꾸미기·경기 개최·연속 출석으로 점수가 올라가.
        </div>
      </div>

      <div className="sect">🏆 진열장 ({earned.length}/{TROPHIES.length})</div>
      <div className="opt-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        {earned.map((t) => (
          <div key={t.id} className="opt on" style={{ minHeight: 78 }}>
            <div style={{ fontSize: 26 }}>{t.icon}</div>
            {t.label}
            <span className="price">{new Date(achievements[t.id]).toLocaleDateString('ko-KR')}</span>
          </div>
        ))}
        {locked.map((t) => (
          <div key={t.id} className="opt locked" style={{ minHeight: 78, opacity: 0.55 }}>
            <div style={{ fontSize: 26 }}>🔒</div>
            {t.label}
            <span className="price">{t.desc}</span>
          </div>
        ))}
      </div>
      <div className="muted" style={{ marginTop: 10 }}>
        획득한 트로피는 클럽하우스 앞 진열대에 실제로 세워져!
      </div>
    </>
  )
}

// -----------------------------------------------------------------------------------
// 🥇 랭킹
// -----------------------------------------------------------------------------------
function RankPanel() {
  const players = useGame((s) => s.players)
  const [tab, setTab] = useState('games')
  const list = Object.values(players)
  const sorted = [...list].sort((a, b) =>
    tab === 'games' ? b.todayGames - a.todayGames
      : tab === 'wins' ? b.todayWins - a.todayWins
      : b.affinity - a.affinity
  ).slice(0, 20)

  return (
    <>
      <div className="tabs">
        {[['games', '🏸 경기수'], ['wins', '🏆 승리'], ['affinity', '💛 친밀도']].map(([k, l]) => (
          <button key={k} className={`tab ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>
      <div style={{ marginTop: 10 }}>
        {sorted.map((p, i) => (
          <div key={p.id} className={`rank-row ${i === 0 ? 'top1' : i === 1 ? 'top2' : i === 2 ? 'top3' : ''}`}>
            <div className="rank-no">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}</div>
            <span className="lv-tag" style={{ background: LEVEL_COLOR[p.level] }}>{p.level}</span>
            <div style={{ flex: 1 }}>{p.isMe ? `⭐ ${p.name}` : p.name}</div>
            <b>{tab === 'games' ? `${p.todayGames}경기` : tab === 'wins' ? `${p.todayWins}승` : `💛${p.affinity}`}</b>
          </div>
        ))}
      </div>
    </>
  )
}

// -----------------------------------------------------------------------------------
// 🎁 뽑기
// -----------------------------------------------------------------------------------
function GachaPanel() {
  const pull = useGame((s) => s.pullGacha)
  const coins = useGame((s) => s.coins)
  const pulls = useGame((s) => s.gachaPulls)
  const [rolling, setRolling] = useState(false)
  const [result, setResult] = useState(null)

  const go = () => {
    if (rolling) return
    setResult(null)
    setRolling(true)
    setTimeout(() => {
      setResult(pull())
      setRolling(false)
    }, 900)
  }

  return (
    <div className="gacha-box">
      <div className="gacha-ball" style={{ animationPlayState: rolling ? 'running' : 'paused' }}>
        {rolling ? '🎰' : result ? (result.rare ? '✨' : '🎁') : '🏸'}
      </div>
      <div style={{ fontSize: 18, marginTop: 8 }}>
        {rolling ? '두구두구…' : result ? `${result.rare ? '레어! ' : ''}${result.label}` : '셔틀콕 뽑기'}
      </div>
      <div className="muted" style={{ marginTop: 6 }}>
        1회 300🪙 · 머리·옷·라켓·마당 장식이 랜덤으로 나와!<br />지금까지 {pulls}번 뽑았어.
      </div>
      <button className="ac-btn yellow wide" style={{ marginTop: 16 }} disabled={rolling || coins < 300} onClick={go}>
        {coins < 300 ? '코인이 부족해 🪙' : '🎁 300🪙로 뽑기'}
      </button>
    </div>
  )
}

// -----------------------------------------------------------------------------------
export default function Panels() {
  const panel = useGame((s) => s.panel)
  const setPanel = useGame((s) => s.setPanel)
  if (!panel || panel === 'closet' || panel === 'minigame' || panel === 'share' || panel === 'login') return null

  const TITLE = {
    roster: '👥 마을 주민',
    match: '🏸 경기 운영',
    shop: '🛍️ 너굴상점',
    me: '⭐ 내 정보',
    more: '☰ 더보기',
    rooms: '🏸 콕스타 경기방',
    quests: '📜 오늘의 할 일',
    mail: '💌 우편함',
    trophy: '🏆 트로피룸',
    record: '📖 경기 기록',
    rank: '🥇 마을 랭킹',
    gacha: '🎁 셔틀콕 뽑기',
    settings: '⚙️ 마을 설정',
  }[panel]

  return (
    <Sheet title={TITLE} onClose={() => setPanel(panel)}>
      {panel === 'roster' && <RosterPanel />}
      {panel === 'match' && <MatchPanel />}
      {panel === 'shop' && <ShopPanel />}
      {panel === 'me' && <MePanel />}
      {panel === 'more' && <MorePanel />}
      {panel === 'rooms' && <RoomList onClose={() => setPanel('rooms')} />}
      {panel === 'quests' && <QuestPanel />}
      {panel === 'mail' && <MailPanel />}
      {panel === 'trophy' && <TrophyPanel />}
      {panel === 'record' && <RecordPanel />}
      {panel === 'rank' && <RankPanel />}
      {panel === 'gacha' && <GachaPanel />}
      {panel === 'settings' && <SettingsPanel />}
    </Sheet>
  )
}
