// ===================================================================================
// 코트 월드 — 전국 경기방을 동물의 숲 스타일 지도에 마을로 표시
//
// 콕스타의 방(rooms)에는 주소 좌표(coords)가 들어 있어서, 그 좌표를 화면에 투영해
// 실제 위치에 마을 아이콘을 찍는다. 좌표가 없는 방은 아래 '떠도는 마을' 목록으로.
//
// 참고한 게임 UI: 포켓몬 GO·모노폴리 GO의 지도 위 거점, 클래시 로얄의 카드형 정보,
//                동물의 숲 포켓캠프의 캠프 지도.
// ===================================================================================
import { useEffect, useMemo, useRef, useState } from 'react'
import { useGame } from '../game/store.js'
import { cockstar } from '../net/cockstar.js'
import { LEVEL_COLOR } from '../game/constants.js'

// 대한민국 대략 경계 (단순화한 해안선 — 스타일화한 섬 느낌으로 그린다)
const KOREA = [
  [126.72, 37.85], [127.05, 38.28], [128.05, 38.5], [128.42, 38.6],
  [129.02, 37.5], [129.42, 36.82], [129.5, 35.95], [129.28, 35.42],
  [129.02, 35.08], [128.4, 34.88], [127.72, 34.72], [127.2, 34.5],
  [126.72, 34.3], [126.28, 34.82], [126.42, 35.5], [126.5, 36.02],
  [126.28, 36.82], [126.62, 37.02], [126.5, 37.42],
]
const JEJU = [126.53, 33.42]

const BOUNDS = { minLng: 125.9, maxLng: 129.8, minLat: 33.0, maxLat: 38.8 }
const VB = { w: 460, h: 640 }

/** 위경도 → SVG 좌표 */
function project([lng, lat]) {
  const x = ((lng - BOUNDS.minLng) / (BOUNDS.maxLng - BOUNDS.minLng)) * VB.w
  const y = VB.h - ((lat - BOUNDS.minLat) / (BOUNDS.maxLat - BOUNDS.minLat)) * VB.h
  return [x, y]
}

const pathOf = (pts) => pts.map((p, i) => `${i ? 'L' : 'M'}${project(p).map((n) => n.toFixed(1)).join(' ')}`).join(' ') + ' Z'

/** 좌표가 없는 방을 지역 이름으로라도 대충 배치 */
const REGION_POS = {
  서울: [126.98, 37.57], 경기: [127.2, 37.3], 인천: [126.7, 37.46], 강원: [128.3, 37.8],
  충북: [127.7, 36.8], 충남: [126.9, 36.6], 대전: [127.38, 36.35], 세종: [127.29, 36.48],
  전북: [127.1, 35.75], 전남: [126.9, 34.9], 광주: [126.85, 35.16], 대구: [128.6, 35.87],
  경북: [128.7, 36.4], 경남: [128.4, 35.3], 부산: [129.07, 35.18], 울산: [129.31, 35.54],
  제주: [126.53, 33.42],
}
function guessCoords(room) {
  const text = `${room.location || ''} ${room.address || ''}`
  const hit = Object.keys(REGION_POS).find((k) => text.includes(k))
  return hit ? REGION_POS[hit] : null
}

export default function WorldMap() {
  const auth = useGame((s) => s.auth)
  const online = useGame((s) => s.online)
  const setScreen = useGame((s) => s.setScreen)
  const setPanel = useGame((s) => s.setPanel)
  const toast = useGame((s) => s.toast)

  const [rooms, setRooms] = useState(null)
  const [err, setErr] = useState(null)
  const [picked, setPicked] = useState(null)
  const [pw, setPw] = useState('')
  const [busy, setBusy] = useState(false)
  const [q, setQ] = useState('')
  const [view, setView] = useState('map') // map | list

  useEffect(() => {
    if (!auth) return
    let stop = null
    cockstar.subscribeRooms((list, e) => { setRooms(list); setErr(e) }).then((fn) => { stop = fn })
    return () => stop?.()
  }, [auth])

  const marks = useMemo(() => {
    if (!rooms) return []
    return rooms.map((r) => {
      const c = r.coords?.lat && r.coords?.lng ? [r.coords.lng, r.coords.lat] : guessCoords(r)
      return { room: r, ll: c, xy: c ? project(c) : null }
    })
  }, [rooms])

  const filtered = useMemo(
    () => marks.filter((m) => !q || (m.room.name || '').includes(q) || (m.room.location || '').includes(q)),
    [marks, q]
  )
  const placed = filtered.filter((m) => m.xy)
  const floating = filtered.filter((m) => !m.xy)

  const enter = async (room, password) => {
    setBusy(true)
    try {
      await cockstar.enterRoom(room, password)
      toast(`🏸 「${room.name}」 마을에 도착!`, 'good')
      setPicked(null); setPw('')
      setScreen('village')
    } catch (e) {
      toast(e.message || '입장하지 못했어요.', 'warn')
    } finally { setBusy(false) }
  }

  if (!auth) {
    return (
      <div className="world">
        <div className="world-hero">
          <div className="wh-title">🗺️ 코트 월드</div>
          <div className="wh-sub">전국의 배드민턴 마을이 여기 다 모여 있어요.</div>
        </div>
        <div className="ac-panel modal-card" style={{ margin: '20px auto' }}>
          <div style={{ fontSize: 40 }}>🔑</div>
          <h3 style={{ margin: '6px 0' }}>먼저 로그인해 주세요</h3>
          <div className="muted">콕스타 계정으로 로그인하면 전국 경기방이 지도에 나타나요.</div>
          <button className="ac-btn green wide" style={{ marginTop: 14 }} onClick={() => setPanel('login')}>
            콕스타 계정으로 로그인
          </button>
          <button className="ac-btn wide" style={{ marginTop: 8 }} onClick={() => setScreen('village')}>
            🏝️ 내 연습 마을로 가기
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="world">
      <div className="world-hero">
        <div>
          <div className="wh-title">🗺️ 코트 월드</div>
          <div className="wh-sub">마을 {rooms?.length ?? '…'}곳 · 눌러서 입장</div>
        </div>
        <div className="row">
          <button className={`ac-btn sm ${view === 'map' ? 'green' : ''}`} onClick={() => setView('map')}>지도</button>
          <button className={`ac-btn sm ${view === 'list' ? 'green' : ''}`} onClick={() => setView('list')}>목록</button>
        </div>
      </div>

      <div className="world-search">
        <input className="ac-input" placeholder="마을·지역 검색" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {err && <div className="muted" style={{ padding: '0 14px', color: 'var(--rose-dark)' }}>{err}</div>}

      {view === 'map' ? (
        <div className="map-wrap">
          <svg viewBox={`-20 -20 ${VB.w + 40} ${VB.h + 40}`} className="korea">
            <defs>
              <radialGradient id="sea" cx="50%" cy="40%">
                <stop offset="0%" stopColor="#9fdcf5" />
                <stop offset="100%" stopColor="#63bfe4" />
              </radialGradient>
              <linearGradient id="land" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#8fd97f" />
                <stop offset="100%" stopColor="#5fae56" />
              </linearGradient>
            </defs>
            <rect x="-20" y="-20" width={VB.w + 40} height={VB.h + 40} fill="url(#sea)" />
            {/* 파도 */}
            {[...Array(14)].map((_, i) => (
              <path key={i} d={`M${(i * 47) % VB.w - 10} ${(i * 71) % VB.h} q 10 -6 20 0 q 10 6 20 0`}
                stroke="rgba(255,255,255,.45)" strokeWidth="2.5" fill="none" strokeLinecap="round" />
            ))}
            {/* 육지 */}
            <path d={pathOf(KOREA)} fill="#f2e2b8" stroke="#e6cd94" strokeWidth="9" strokeLinejoin="round" />
            <path d={pathOf(KOREA)} fill="url(#land)" stroke="#4c9a48" strokeWidth="2" strokeLinejoin="round" />
            {/* 제주 */}
            <ellipse cx={project(JEJU)[0]} cy={project(JEJU)[1]} rx="30" ry="17" fill="#f2e2b8" stroke="#e6cd94" strokeWidth="8" />
            <ellipse cx={project(JEJU)[0]} cy={project(JEJU)[1]} rx="26" ry="13" fill="url(#land)" stroke="#4c9a48" strokeWidth="2" />

            {/* 마을 마커 */}
            {placed.map(({ room, xy }) => {
              const on = picked?.id === room.id
              return (
                <g key={room.id} transform={`translate(${xy[0]},${xy[1]})`} className="mark"
                   onClick={() => { setPicked(room); setPw('') }}>
                  <ellipse cy="7" rx="13" ry="5" fill="rgba(0,0,0,.18)" />
                  {/* 집 */}
                  <path d="M-11 2 L0 -11 L11 2 Z" fill="#e2604f" stroke="#fff" strokeWidth="2" strokeLinejoin="round" />
                  <rect x="-8" y="1" width="16" height="10" rx="2.5" fill="#fdf3dc" stroke="#fff" strokeWidth="2" />
                  <circle cx="0" cy="-15" r={on ? 6 : 4} fill={room.password ? '#f4c542' : '#7cc576'} stroke="#fff" strokeWidth="2" />
                  {on && <circle cx="0" cy="0" r="24" fill="none" stroke="#fff" strokeWidth="3" opacity=".9" />}
                </g>
              )
            })}
          </svg>

          {floating.length > 0 && (
            <div className="floating-rooms">
              <div className="muted" style={{ marginBottom: 6 }}>📍 위치 미등록 마을 {floating.length}곳</div>
              <div className="row wrap">
                {floating.map(({ room }) => (
                  <button key={room.id} className="ac-btn sm" onClick={() => { setPicked(room); setPw('') }}>
                    {room.password && '🔒'}{room.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="room-list">
          {(filtered || []).map(({ room }) => (
            <button key={room.id} className="room-row" onClick={() => { setPicked(room); setPw('') }}>
              <span className="rr-icon">{room.password ? '🔒' : '🏸'}</span>
              <span className="rr-main">
                <b>{room.name}</b>
                <em>📍 {room.location || '위치 미등록'} · 정원 {room.maxPlayers || '-'}명</em>
              </span>
              <span className="rr-go">›</span>
            </button>
          ))}
          {rooms && !filtered.length && <div className="muted" style={{ padding: 14 }}>찾는 마을이 없어요.</div>}
          {!rooms && <div className="muted" style={{ padding: 14 }}>불러오는 중…</div>}
        </div>
      )}

      {/* 마을 정보 카드 */}
      {picked && (
        <>
          <div className="sheet-back" onClick={() => setPicked(null)} />
          <div className="ac-panel village-card-pop">
            <button className="pop-close" onClick={() => setPicked(null)}>✕</button>
            <div className="vcp-title">
              <span style={{ fontSize: 28 }}>{picked.password ? '🔒' : '🏸'}</span>
              <div>
                <b>{picked.name}</b>
                <div className="muted">📍 {picked.location || '위치 미등록'}</div>
              </div>
            </div>
            <div className="vcp-meta">
              <span className="ac-chip">👤 정원 {picked.maxPlayers || '-'}</span>
              <span className="ac-chip">🏟 코트 {picked.numInProgressCourts || 2}</span>
              {picked.levelLimit && picked.levelLimit !== 'N조' && (
                <span className="ac-chip" style={{ color: LEVEL_COLOR[picked.levelLimit] }}>{picked.levelLimit} 이상</span>
              )}
              <span className="ac-chip">👑 {picked.adminName || '-'}</span>
            </div>
            {picked.description && <div className="muted" style={{ marginTop: 8 }}>{picked.description}</div>}
            {picked.password && picked.adminUid !== auth.uid && (
              <input className="ac-input" style={{ marginTop: 10 }} type="password" placeholder="마을 비밀번호"
                value={pw} onChange={(e) => setPw(e.target.value)} />
            )}
            <button className="ac-btn green wide" style={{ marginTop: 12 }} disabled={busy}
              onClick={() => enter(picked, pw)}>
              {busy ? '입장 중…' : '🚪 이 마을로 들어가기'}
            </button>
          </div>
        </>
      )}

      {online.status === 'room' && (
        <button className="world-back" onClick={() => setScreen('village')}>
          🏝️ 「{online.roomName}」 마을로 돌아가기
        </button>
      )}
    </div>
  )
}
