// ===================================================================================
// 매칭 보드 — 관리자가 경기를 짜는 핵심 화면
//
// 설계 원칙 (불편하면 아무도 안 쓴다):
//   1) 탭 두 번이면 끝난다      — 대기 선수 4명 탭 → [투입] 한 번
//   2) 손가락으로 누를 수 있게   — 카드 최소 높이 64px
//   3) 색으로 먼저 읽힌다        — 급수 색 띠, 대기 오래면 빨강
//   4) 팀 밸런스를 눈으로 확인   — 코트마다 밸런스 게이지
//   5) 자동 추천은 "왜 이 조합인지" 이유를 같이 보여준다
// ===================================================================================
import { useState, useMemo, useEffect } from 'react'
import { useGame } from '../game/store.js'
import { LEVEL_COLOR, LEVEL_VALUE, SENSITIVITIES } from '../game/constants.js'
import { pickBestCombo, bestLevelSplit } from '../game/matching.js'
import { cockstar } from '../net/cockstar.js'
import PlayerCard from './PlayerCard.jsx'
import { avatarUrl } from './avatar.js'

const fmt = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

function Timer({ start }) {
  const [, tick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 1000)
    return () => clearInterval(id)
  }, [])
  if (!start) return null
  return <span className="ct-timer">⏱ {fmt(Date.now() - new Date(start).getTime())}</span>
}

/** 팀 급수 합 차이를 게이지로 */
function Balance({ ids, players }) {
  const four = ids.map((id) => players[id]).filter(Boolean)
  if (four.length < 4) return null
  const { diff } = bestLevelSplit(four)
  const label = diff === 0 ? '완벽' : diff === 1 ? '좋음' : diff === 2 ? '보통' : '한쪽 우세'
  const tone = diff === 0 ? 'ok' : diff <= 1 ? 'ok' : diff <= 2 ? 'mid' : 'bad'
  return (
    <div className={`balance ${tone}`}>
      <span className="net-line" />
      <span className="bl">⚖ 밸런스 {label}</span>
      <span className="net-line" />
    </div>
  )
}

export default function MatchBoard() {
  const players = useGame((s) => s.players)
  const order = useGame((s) => s.order)
  const courts = useGame((s) => s.courts)
  const courtCount = useGame((s) => s.courtCount)
  const online = useGame((s) => s.online)
  const history = useGame((s) => s.history)
  const sensitivity = useGame((s) => s.sensitivity)
  const setSetting = useGame((s) => s.setSetting)
  const setCourtCount = useGame((s) => s.setCourtCount)
  const assign = useGame((s) => s.assign)
  const clearCourt = useGame((s) => s.clearCourt)
  const toggleRest = useGame((s) => s.toggleRest)
  const autoFill = useGame((s) => s.autoFill)
  const toast = useGame((s) => s.toast)

  const [tab, setTab] = useState('court')
  const [sel, setSel] = useState([])
  const [suggest, setSuggest] = useState(null)

  const inRoom = online.status === 'room'
  const isAdmin = inRoom ? online.isAdmin : true

  const waiting = useMemo(
    () => order.map((id) => players[id]).filter((p) => p && p.status === 'waiting'),
    [order, players]
  )
  const resting = useMemo(
    () => order.map((id) => players[id]).filter((p) => p && p.status === 'resting'),
    [order, players]
  )
  const emptyCourts = courts.filter((c) => !c.players.some(Boolean))

  // 나와 아직 안 친 사람 표시용
  const metMe = useMemo(() => {
    const s = new Set()
    history.forEach((g) => {
      const ids = [...g.teamA, ...g.teamB]
      if (ids.includes('me')) ids.forEach((i) => s.add(i))
    })
    return s
  }, [history])

  const run = (fn) => fn().catch((e) => toast(e.message || '실패했어요.', 'warn'))

  const toggleSel = (id) => {
    setSel((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : cur.length >= 4 ? cur : [...cur, id]))
  }

  /** 선택한 4명을 코트에 투입 */
  const deploy = async (courtId) => {
    if (sel.length !== 4) return toast('4명을 골라주세요.', 'warn')
    const ordered = bestLevelSplit(sel.map((id) => players[id])).order.map((p) => p.id)
    if (inRoom) {
      await run(() => cockstar.startCourt(courtId, ordered))
    } else {
      ordered.forEach((pid, slot) => assign(pid, courtId, slot))
    }
    setSel([])
    setTab('court')
    toast(`${courtId + 1}번 코트로 이동합니다 🏃`, 'good')
  }

  /** 자동 추천 조합 만들기 */
  const makeSuggest = () => {
    const res = pickBestCombo(waiting, { history, sensitivity })
    if (!res) {
      toast(waiting.length < 4 ? '대기 인원이 4명 미만이에요.' : '지금은 좋은 조합이 없어요. 민감도를 낮춰보세요.', 'warn')
      return
    }
    setSuggest(res)
    setTab('auto')
  }

  const acceptSuggest = async () => {
    if (!suggest) return
    const court = emptyCourts[0]
    if (!court) return toast('빈 코트가 없어요.', 'warn')
    const ids = suggest.players.map((p) => p.id)
    if (inRoom) await run(() => cockstar.startCourt(court.id, ids))
    else ids.forEach((pid, slot) => assign(pid, court.id, slot))
    setSuggest(null)
    setTab('court')
  }

  const endCourt = async (c) => {
    if (!confirm(`${c.id + 1}번 코트 경기를 끝낼까요?`)) return
    if (inRoom) await run(() => cockstar.endCourt(c.id))
    else clearCourt(c.id)
  }

  return (
    <div className="mboard">
      {/* 상단 요약 */}
      <div className="mb-top">
        <div className="mb-stat"><b>{courts.filter((c) => c.status === 'playing').length}</b><span>경기중</span></div>
        <div className="mb-stat"><b>{emptyCourts.length}</b><span>빈 코트</span></div>
        <div className="mb-stat"><b>{waiting.length}</b><span>대기</span></div>
        <div className="mb-stat"><b>{resting.length}</b><span>휴식</span></div>
      </div>

      <div className="mb-tabs">
        {[['court', `🏟 코트 ${courtCount}`], ['wait', `⏳ 대기 ${waiting.length}`], ['auto', '⚡ 자동 추천']].map(([k, l]) => (
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => (k === 'auto' ? makeSuggest() : setTab(k))}>
            {l}
          </button>
        ))}
      </div>

      <div className="mb-body">
        {/* ── 코트 ── */}
        {tab === 'court' && (
          <>
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
              const filled = c.players.filter(Boolean).length
              const live = c.status === 'playing'
              return (
                <div key={c.id} className={`ct-card ${live ? 'live' : filled ? 'filling' : ''}`}>
                  <div className="ct-head">
                    <b>{c.id + 1}번 코트</b>
                    {live ? (
                      c.remote ? <Timer start={c.startTime} /> : <span className="ct-score">{c.score[0]} : {c.score[1]}</span>
                    ) : (
                      <span className="muted">{filled ? '이동 중' : '비어 있음'}</span>
                    )}
                  </div>

                  {filled > 0 ? (
                    <>
                      <div className="ct-team">
                        {[0, 1].map((i) => {
                          const p = players[c.players[i]]
                          return p ? <PlayerCard key={i} player={p} compact /> : <div key={i} className="pslot empty">－</div>
                        })}
                      </div>
                      <Balance ids={c.players} players={players} />
                      <div className="ct-team">
                        {[2, 3].map((i) => {
                          const p = players[c.players[i]]
                          return p ? <PlayerCard key={i} player={p} compact /> : <div key={i} className="pslot empty">－</div>
                        })}
                      </div>
                      {isAdmin && (
                        <button className="ac-btn sm rose wide" style={{ marginTop: 8 }} onClick={() => endCourt(c)}>
                          경기 종료
                        </button>
                      )}
                    </>
                  ) : (
                    <div className="ct-empty">
                      <div className="ct-slots-ghost">
                        {[0, 1, 2, 3].map((i) => <span key={i}>＋</span>)}
                      </div>
                      {isAdmin && (
                        <div className="row" style={{ marginTop: 8 }}>
                          <button className="ac-btn sm green" style={{ flex: 1 }}
                            disabled={sel.length !== 4} onClick={() => deploy(c.id)}>
                            {sel.length === 4 ? '선택한 4명 투입' : `선수 선택 (${sel.length}/4)`}
                          </button>
                          <button className="ac-btn sm yellow" onClick={makeSuggest}>⚡ 자동</button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </>
        )}

        {/* ── 대기 ── */}
        {tab === 'wait' && (
          <>
            <div className="row wrap" style={{ marginBottom: 8 }}>
              <span className="muted">탭해서 4명을 고르세요</span>
              {sel.length > 0 && <button className="ac-btn sm" onClick={() => setSel([])}>선택 해제</button>}
            </div>
            <div className="pgrid">
              {waiting.map((p) => (
                <PlayerCard
                  key={p.id}
                  player={p}
                  selected={sel.includes(p.id)}
                  order={sel.indexOf(p.id) >= 0 ? sel.indexOf(p.id) : null}
                  fresh={!p.isMe && !metMe.has(p.id)}
                  onClick={() => (isAdmin ? toggleSel(p.id) : toggleRest(p.id))}
                />
              ))}
              {!waiting.length && <div className="muted">대기 중인 선수가 없어요.</div>}
            </div>

            {resting.length > 0 && (
              <>
                <div className="sect">💤 휴식 {resting.length}명</div>
                <div className="pgrid">
                  {resting.map((p) => (
                    <PlayerCard key={p.id} player={p} dim showWait={false}
                      onClick={() => (inRoom ? run(() => cockstar.setResting(p.id, false)) : toggleRest(p.id))} />
                  ))}
                </div>
              </>
            )}
          </>
        )}

        {/* ── 자동 추천 ── */}
        {tab === 'auto' && (
          <>
            <div className="row wrap" style={{ marginBottom: 10 }}>
              <span className="muted">추천 성향</span>
              {SENSITIVITIES.map((s) => (
                <button key={s.key} className={`ac-btn sm ${sensitivity === s.key ? 'green' : ''}`}
                  onClick={() => setSetting({ sensitivity: s.key })}>{s.label}</button>
              ))}
            </div>

            {suggest ? (
              <div className="ct-card live">
                <div className="ct-head"><b>이 조합 어때요?</b><span className="muted">점수 {suggest.score}</span></div>
                <div className="ct-team">
                  {suggest.players.slice(0, 2).map((p) => <PlayerCard key={p.id} player={p} compact />)}
                </div>
                <Balance ids={suggest.players.map((p) => p.id)} players={players} />
                <div className="ct-team">
                  {suggest.players.slice(2).map((p) => <PlayerCard key={p.id} player={p} compact />)}
                </div>
                <div className="reason">💡 {suggest.reason}</div>
                <div className="row" style={{ marginTop: 10 }}>
                  <button className="ac-btn green" style={{ flex: 1 }} disabled={!emptyCourts.length} onClick={acceptSuggest}>
                    {emptyCourts.length ? `${emptyCourts[0].id + 1}번 코트로 시작` : '빈 코트 없음'}
                  </button>
                  <button className="ac-btn sm" onClick={makeSuggest}>🔄 다시</button>
                </div>
              </div>
            ) : (
              <div className="muted">추천할 조합을 만드는 중…</div>
            )}

            {!inRoom && (
              <button className="ac-btn yellow wide" style={{ marginTop: 12 }} onClick={() => autoFill(false)}>
                ⚡ 빈 코트 한 번에 채우기
              </button>
            )}
          </>
        )}
      </div>

      {/* 선택 중일 때 뜨는 액션 바 */}
      {sel.length > 0 && tab === 'wait' && (
        <div className="mb-action">
          <div className="sel-faces">
            {sel.map((id) => <img key={id} src={avatarUrl(players[id]?.look, players[id]?.gender, 64)} alt="" />)}
            {Array.from({ length: 4 - sel.length }).map((_, i) => <span key={i} className="ghost">＋</span>)}
          </div>
          {emptyCourts.length ? (
            <div className="row">
              {emptyCourts.slice(0, 3).map((c) => (
                <button key={c.id} className="ac-btn sm green" disabled={sel.length !== 4} onClick={() => deploy(c.id)}>
                  {c.id + 1}번
                </button>
              ))}
            </div>
          ) : (
            <span className="muted">빈 코트 없음</span>
          )}
        </div>
      )}
    </div>
  )
}
