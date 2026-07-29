// ===================================================================================
// 매칭 화면 — 콕스타 매칭앱(badminton-app-new)의 구조를 그대로 옮기고 옷만 갈아입혔다.
//
// 구조 (원본과 동일)
//   [경기 예정 탭]  대기 명단 → 🤖 자동 매칭 → 경기 예정
//   [경기 진행 탭]  진행 중인 코트 (타이머 + FINISH)
//
// 조작도 원본과 같다
//   · 대기 카드 탭 = 다중 선택 → 빈 슬롯 탭 = 선택 순서대로 채움
//   · 배정된 카드 두 개 탭 = 자리 교환
//   · 카드 우상단 × = 대기로 되돌리기 / 내보내기
//   · START 는 4명 다 차야 활성 → 빈 코트가 여러 개면 코트 선택
//   · FINISH 는 확인 후 종료
// ===================================================================================
import { useState, useMemo } from 'react'
import { useGame } from '../game/store.js'
import { LEVEL_COLOR, LEVEL_ORDER } from '../game/constants.js'
import { bestLevelSplit, pickBestCombo } from '../game/matching.js'
import { myTurn, turnText } from '../game/queue.js'
import { cockstar } from '../net/cockstar.js'
import { avatarUrl } from './avatar.js'

const PER = 4

const waitMin = (p) => Math.max(0, Math.floor((Date.now() - (p.waitSince || Date.now())) / 60000))
const fmtDur = (start) => {
  if (!start) return '00:00'
  const s = Math.max(0, Math.floor((Date.now() - new Date(start).getTime()) / 1000))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

// -----------------------------------------------------------------------------------
// 선수 카드 (원본의 PlayerCard)
// -----------------------------------------------------------------------------------
function PCard({ p, selected, order, onClick, onRemove, showX, dim }) {
  if (!p) return null
  const color = LEVEL_COLOR[p.level] || '#a1a1aa'
  const mins = waitMin(p)
  return (
    <div
      className={`mp ${selected ? 'sel' : ''} ${dim ? 'dim' : ''} ${p.isMe ? 'me' : ''}`}
      style={{ '--lv': color }}
      onClick={onClick}
    >
      <span className={`mp-gender ${p.gender === '여' ? 'f' : 'm'}`} />
      <img src={avatarUrl(p.look, p.gender, 72)} alt="" />
      <div className="mp-txt">
        <b>{p.name}</b>
        <span className="mp-sub">
          <i className="mp-lv" style={{ color }}>{p.level}</i>
          <i className="mp-g">{p.todayGames || 0}G</i>
          {mins > 0 && <i className={mins >= 15 ? 'mp-w long' : 'mp-w'}>{mins}분</i>}
        </span>
      </div>
      {selected && <span className="mp-no">{order + 1}</span>}
      {showX && (
        <button className="mp-x" onClick={(e) => { e.stopPropagation(); onRemove?.() }}>✕</button>
      )}
    </div>
  )
}

function EmptySlot({ onClick }) {
  return <button className="mp empty" onClick={onClick}>＋</button>
}

/** 나간 선수 (원본 LeftPlayerCard) */
function LeftCard() {
  return <div className="mp left">🚪 나간 선수</div>
}

// -----------------------------------------------------------------------------------
export default function MatchBoard() {
  const players = useGame((s) => s.players)
  const orderIds = useGame((s) => s.order)
  const courts = useGame((s) => s.courts)
  const courtCount = useGame((s) => s.courtCount)
  const online = useGame((s) => s.online)
  const history = useGame((s) => s.history)
  const sensitivity = useGame((s) => s.sensitivity)
  const autoMatch = useGame((s) => s.autoMatch)
  const setSetting = useGame((s) => s.setSetting)
  const setCourtCount = useGame((s) => s.setCourtCount)
  const assign = useGame((s) => s.assign)
  const clearCourt = useGame((s) => s.clearCourt)
  const finishMatch = useGame((s) => s.finishMatch)
  const toggleRest = useGame((s) => s.toggleRest)
  const removePlayer = useGame((s) => s.removePlayer)
  const toast = useGame((s) => s.toast)

  const [tab, setTab] = useState('plan') // plan | live
  const [sel, setSel] = useState([])
  const [pickCourt, setPickCourt] = useState(null) // 코트 선택 모달
  const [, force] = useState(0)

  // 경기 예정 / 자동 매칭은 저장소에 둔다.
  // 경기방에 있으면 방 문서(rooms.scheduledMatches)에 그대로 저장돼
  // 새로고침해도 남고, 콕스타 앱에서도 똑같이 보인다.
  const scheduled = useGame((s) => s.scheduledMatches)
  const autoQ = useGame((s) => s.autoMatches)
  const numScheduledStore = useGame((s) => s.numScheduled)
  const setMatchQueues = useGame((s) => s.setMatchQueues)
  const setScheduled = (v) =>
    setMatchQueues({ scheduledMatches: typeof v === 'function' ? v(useGame.getState().scheduledMatches) : v })
  const setAutoQ = (v) =>
    setMatchQueues({ autoMatches: typeof v === 'function' ? v(useGame.getState().autoMatches) : v })

  const inRoom = online.status === 'room'
  const isAdmin = inRoom ? online.isAdmin : true

  // 1초마다 타이머 갱신
  useMemo(() => {
    const id = setInterval(() => force((n) => n + 1), 1000)
    return () => clearInterval(id)
  }, [])

  const assignedIds = useMemo(() => {
    const s = new Set()
    Object.values(scheduled).forEach((m) => m?.forEach((x) => x && s.add(x)))
    autoQ.forEach((m) => m.forEach((x) => x && s.add(x)))
    return s
  }, [scheduled, autoQ])

  // 대기 명단 — 원본 정렬 규칙: 휴식 맨 뒤 → 급수 → 입장 순
  const waiting = useMemo(() => {
    const l = orderIds
      .map((id) => players[id])
      .filter((p) => p && (p.status === 'waiting' || p.status === 'resting') && !assignedIds.has(p.id))
    return l.sort((a, b) => {
      const ar = a.status === 'resting' ? 1 : 0
      const br = b.status === 'resting' ? 1 : 0
      if (ar !== br) return ar - br
      const al = LEVEL_ORDER[a.level] || 9
      const bl = LEVEL_ORDER[b.level] || 9
      if (al !== bl) return al - bl
      return (a.waitSince || 0) - (b.waitSince || 0)
    })
  }, [orderIds, players, assignedIds])

  const males = waiting.filter((p) => p.gender !== '여')
  const females = waiting.filter((p) => p.gender === '여')
  const emptyCourts = courts.filter((c) => !c.players.some(Boolean))
  const run = (fn) => fn().catch((e) => toast(e.message || '실패했어요.', 'warn'))

  // ── 카드 탭: 대기는 다중 선택, 배정된 카드끼리는 자리 교환 ──
  const tapWaiting = (id) => {
    if (!isAdmin) return toggleRest(id)
    setSel((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]))
  }

  const [swapFrom, setSwapFrom] = useState(null)
  const tapAssigned = (kind, mi, si) => {
    if (!isAdmin) return
    const from = swapFrom
    if (!from) return setSwapFrom({ kind, mi, si })
    // 같은 카드 다시 탭 → 해제
    if (from.kind === kind && from.mi === mi && from.si === si) return setSwapFrom(null)
    swap(from, { kind, mi, si })
    setSwapFrom(null)
  }

  const readMatch = (kind, mi) => (kind === 'plan' ? scheduled[mi] || Array(PER).fill(null) : autoQ[mi] || Array(PER).fill(null))
  const writeMatch = (kind, mi, arr) => {
    if (kind === 'plan') setScheduled((s) => ({ ...s, [mi]: arr }))
    else setAutoQ((q) => q.map((m, i) => (i === mi ? arr : m)))
  }

  const swap = (a, b) => {
    const A = [...readMatch(a.kind, a.mi)]
    const B = a.kind === b.kind && a.mi === b.mi ? A : [...readMatch(b.kind, b.mi)]
    const tmp = A[a.si]
    A[a.si] = B[b.si]
    B[b.si] = tmp
    writeMatch(a.kind, a.mi, A)
    if (!(a.kind === b.kind && a.mi === b.mi)) writeMatch(b.kind, b.mi, B)
  }

  // ── 빈 슬롯 탭: 선택한 선수들을 순서대로 채운다 ──
  const fillSlot = (kind, mi, si) => {
    if (!isAdmin) return
    if (!sel.length) return toast('대기 명단에서 선수를 먼저 골라주세요.', 'warn')
    const arr = [...readMatch(kind, mi)]
    let k = si
    const left = [...sel]
    while (k < PER && left.length) {
      if (!arr[k]) arr[k] = left.shift()
      k++
    }
    if (left.length) toast(`자리가 부족합니다. (${left.length}명 남음)`, 'warn')
    writeMatch(kind, mi, arr)
    setSel(left)
  }

  const pullBack = (kind, mi, si) => {
    const arr = [...readMatch(kind, mi)]
    arr[si] = null
    writeMatch(kind, mi, arr)
  }

  // ── 자동 매칭 ──
  const makeAuto = () => {
    const pool = waiting.filter((p) => p.status === 'waiting')
    const res = pickBestCombo(pool, { history, sensitivity })
    if (!res) return toast(pool.length < PER ? '대기 인원이 4명 미만이에요.' : '지금은 좋은 조합이 없어요. 민감도를 낮춰보세요.', 'warn')
    setAutoQ((q) => [...q, res.players.map((p) => p.id)])
    toast(`자동 매칭 추가 — ${res.reason}`, 'good')
  }

  // ── 경기 시작 ──
  const startMatch = async (kind, mi) => {
    const ids = readMatch(kind, mi).filter(Boolean)
    if (ids.length !== PER) return toast('4명이 모두 차야 시작할 수 있어요.', 'warn')
    if (!emptyCourts.length) return toast('빈 코트가 없습니다.', 'warn')
    if (emptyCourts.length > 1) return setPickCourt({ kind, mi })
    await doStart(kind, mi, emptyCourts[0].id)
  }

  const doStart = async (kind, mi, courtId) => {
    const ids = readMatch(kind, mi).filter(Boolean)
    const ordered = bestLevelSplit(ids.map((id) => players[id])).order.map((p) => p.id)
    if (inRoom) await run(() => cockstar.startCourt(courtId, ordered))
    else ordered.forEach((pid, slot) => assign(pid, courtId, slot))
    // 목록에서 제거 (원본과 동일하게 앞으로 당김)
    if (kind === 'plan') {
      setScheduled((s) => {
        const keys = Object.keys(s).map(Number).sort((a, b) => a - b).filter((k) => k !== mi)
        const next = {}
        keys.forEach((k, i) => { next[i] = s[k] })
        return next
      })
    } else {
      setAutoQ((q) => q.filter((_, i) => i !== mi))
    }
    setPickCourt(null)
    setTab('live')
  }

  // ── 경기 종료 ──
  // 진행 중이면 참여 기록·보상을 남기고, 아직 시작 전이면 그냥 배정을 푼다 (승패는 남기지 않는다)
  const finish = async (c) => {
    if (!confirm(`${c.id + 1}번 코트 경기를 종료할까요?`)) return
    if (inRoom) await run(() => cockstar.endCourt(c.id))
    else if (c.status === 'playing') finishMatch(c.id)
    else clearCourt(c.id)
  }

  // ── 매치 한 줄 렌더 (자동/예정 공용) ──
  const MatchRow = ({ kind, mi, arr, onDelete }) => {
    const count = arr.filter(Boolean).length
    return (
      <div className="mrow">
        <button className="mrow-no" onClick={onDelete} title="길게 눌러 삭제">{mi + 1}</button>
        <div className="mrow-slots">
          {Array.from({ length: PER }).map((_, si) => {
            const pid = arr[si]
            const p = pid ? players[pid] : null
            const isSwap = swapFrom && swapFrom.kind === kind && swapFrom.mi === mi && swapFrom.si === si
            return p ? (
              <PCard
                key={si}
                p={p}
                selected={isSwap}
                order={0}
                onClick={() => tapAssigned(kind, mi, si)}
                showX
                onRemove={() => pullBack(kind, mi, si)}
              />
            ) : (
              <EmptySlot key={si} onClick={() => fillSlot(kind, mi, si)} />
            )
          })}
        </div>
        <button
          className={`mrow-start ${count === PER && isAdmin ? 'on' : ''}`}
          disabled={count !== PER || !isAdmin}
          onClick={() => startMatch(kind, mi)}
        >
          START
        </button>
      </div>
    )
  }

  const turn = myTurn(useGame.getState())
  const turnCls = turn.state === 'playing' ? 'now' : (turn.state === 'next' || turn.state === 'queued') ? 'soon' : ''

  return (
    <div className="mboard">
      {/* 내 순번 — 기다리는 사람이 제일 궁금해하는 것 */}
      <div className={`turn-card ${turnCls}`}>
        <span className="tk-icon">
          {turn.state === 'playing' ? '🔥' : turn.state === 'next' ? '⏰' : turn.state === 'resting' ? '💤' : '⏳'}
        </span>
        <span className="tk-body">
          <b>{turnText(turn)}</b>
          <em>
            {turn.avg ? `최근 경기 평균 ${turn.avg}분` : '아직 평균을 잴 기록이 없어'}
            {turn.waitingCount != null && ` · 대기 ${turn.waitingCount}명`}
          </em>
        </span>
      </div>

      {/* 상단 탭 — 원본의 하단 네비 2탭 구조 */}
      <div className="mb-tabs">
        <button className={tab === 'plan' ? 'on' : ''} onClick={() => setTab('plan')}>
          경기 예정
        </button>
        <button className={tab === 'live' ? 'on' : ''} onClick={() => setTab('live')}>
          경기 진행 {courts.filter((c) => c.players.some(Boolean)).length}/{courtCount}
        </button>
      </div>

      <div className="mb-body">
        {tab === 'plan' ? (
          <>
            {/* ── 대기 명단 ── */}
            <div className="msec">
              <div className="msec-h">
                <b>대기 명단</b>
                <span className="msec-cnt">{waiting.length}명</span>
                {isAdmin && sel.length > 0 && (
                  <button className="ac-btn sm" onClick={() => setSel([])}>선택 해제 {sel.length}</button>
                )}
              </div>
              <div className="mgrid">
                {males.map((p) => (
                  <PCard key={p.id} p={p} selected={sel.includes(p.id)} order={sel.indexOf(p.id)}
                    dim={p.status === 'resting'} onClick={() => tapWaiting(p.id)}
                    showX={isAdmin && !p.isMe} onRemove={() => confirm(`${p.name} 님을 내보낼까요?`) && removePlayer(p.id)} />
                ))}
              </div>
              {females.length > 0 && (
                <>
                  <div className="mdiv" />
                  <div className="mgrid">
                    {females.map((p) => (
                      <PCard key={p.id} p={p} selected={sel.includes(p.id)} order={sel.indexOf(p.id)}
                        dim={p.status === 'resting'} onClick={() => tapWaiting(p.id)}
                        showX={isAdmin && !p.isMe} onRemove={() => confirm(`${p.name} 님을 내보낼까요?`) && removePlayer(p.id)} />
                    ))}
                  </div>
                </>
              )}
              {!waiting.length && <div className="muted">대기 중인 선수가 없어요.</div>}
            </div>

            {/* ── 자동 매칭 ── */}
            <div className="msec">
              <div className="msec-h">
                <b>🤖 자동 매칭</b>
                <span className={`msec-badge ${autoMatch ? 'on' : ''}`} onClick={() => setSetting({ autoMatch: !autoMatch })}>
                  {autoMatch ? 'ON' : 'OFF'}
                </span>
                {isAdmin && <button className="ac-btn sm yellow" onClick={makeAuto}>＋ 만들기</button>}
                {isAdmin && autoQ.length > 0 && <button className="ac-btn sm" onClick={() => setAutoQ([])}>전체삭제</button>}
              </div>
              {autoQ.length === 0 ? (
                <div className="muted">
                  {autoMatch ? '＋ 만들기를 누르면 가장 공평한 조합을 찾아줘요.' : '자동 매칭이 꺼져 있어요.'}
                </div>
              ) : (
                autoQ.map((arr, mi) => (
                  <MatchRow key={mi} kind="auto" mi={mi} arr={arr}
                    onDelete={() => setAutoQ((q) => q.filter((_, i) => i !== mi))} />
                ))
              )}
              <div className="row wrap" style={{ marginTop: 8 }}>
                <span className="muted">민감도</span>
                {['low', 'normal', 'high', 'max'].map((k, i) => (
                  <button key={k} className={`ac-btn sm ${sensitivity === k ? 'green' : ''}`}
                    onClick={() => setSetting({ sensitivity: k })}>
                    {['낮음', '보통', '높음', '최고'][i]}
                  </button>
                ))}
              </div>
            </div>

            {/* ── 경기 예정 ── */}
            <div className="msec">
              <div className="msec-h">
                <b>경기 예정</b>
                {isAdmin && Object.keys(scheduled).length > 0 && (
                  <button className="ac-btn sm" onClick={() => setScheduled({})}>전체삭제</button>
                )}
              </div>
              {Array.from({ length: numScheduledStore || 4 }).map((_, mi) => (
                <MatchRow key={mi} kind="plan" mi={mi} arr={scheduled[mi] || Array(PER).fill(null)}
                  onDelete={() => setScheduled((s) => { const n = { ...s }; delete n[mi]; return n })} />
              ))}
            </div>
          </>
        ) : (
          <>
            {/* ── 경기 진행 ── */}
            {isAdmin && (
              <div className="row wrap" style={{ marginBottom: 10 }}>
                <span className="muted">코트 수</span>
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <button key={n} className={`ac-btn sm ${courtCount === n ? 'green' : ''}`}
                    onClick={() => (inRoom ? run(() => cockstar.setCourtCountRemote(n)) : setCourtCount(n))}>{n}</button>
                ))}
              </div>
            )}
            {courts.map((c) => {
              const busy = c.players.some(Boolean)
              return (
                <div key={c.id} className={`ct2 ${busy ? 'live' : ''}`}>
                  <div className="ct2-h">
                    <b>{c.id + 1}번 코트</b>
                    {busy ? (
                      <span className="ct2-time">
                        ⏱ {fmtDur(c.remote ? c.startTime : c.startedAt)}
                      </span>
                    ) : (
                      <span className="muted">대기 중</span>
                    )}
                  </div>
                  <div className="mrow-slots">
                    {Array.from({ length: PER }).map((_, si) => {
                      const pid = c.players[si]
                      if (!pid) return busy ? <LeftCard key={si} /> : <div key={si} className="mp empty">－</div>
                      const p = players[pid]
                      return p ? <PCard key={si} p={p} /> : <LeftCard key={si} />
                    })}
                  </div>
                  {busy && isAdmin && (
                    <button className="ct2-finish" onClick={() => finish(c)}>FINISH</button>
                  )}
                </div>
              )
            })}
          </>
        )}
      </div>

      {/* 코트 선택 모달 (원본 CourtSelectionModal) */}
      {pickCourt && (
        <>
          <div className="sheet-back" onClick={() => setPickCourt(null)} />
          <div className="ac-panel court-pick">
            <b>어느 코트에서 할까요?</b>
            <div className="row wrap" style={{ marginTop: 10 }}>
              {emptyCourts.map((c) => (
                <button key={c.id} className="ac-btn green" onClick={() => doStart(pickCourt.kind, pickCourt.mi, c.id)}>
                  {c.id + 1}번 코트
                </button>
              ))}
              <button className="ac-btn" onClick={() => setPickCourt(null)}>취소</button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
