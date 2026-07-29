// ===================================================================================
// 내 순번 · 예상 대기시간
//
// 코트를 기다리는 사람이 가장 궁금한 건 「대기 12명」이 아니라
// **"내가 몇 번째야? 몇 분 남았어?"** 다.
// 이걸 알려 주지 않으면 사람들은 게임을 하는 게 아니라 불안해서 앱만 계속 켠다.
//
// 승패를 안 세기 때문에 순번은 오로지 「기다린 시간」과 「예정된 대진」으로만 정해진다.
// ===================================================================================
import { PLAYERS_PER_MATCH } from './constants.js'

/** 최근 경기들의 평균 길이(분). 기록이 없으면 12분으로 본다. */
export function avgMatchMinutes(history = []) {
  const durs = history.filter((g) => g.duration > 45000).slice(0, 12).map((g) => g.duration)
  if (!durs.length) return 12
  const avg = durs.reduce((a, b) => a + b, 0) / durs.length / 60000
  return Math.max(4, Math.min(40, Math.round(avg)))
}

/**
 * 내 차례가 언제쯤인지.
 * @returns {{state:string, pos?:number, ahead?:number, minutes?:number, avg?:number, courtId?:number}}
 *  state — playing(코트 위) | next(바로 다음) | queued(대진에 이름이 올라감)
 *          | waiting(대기석) | resting(휴식) | idle(대기 인원 부족 등)
 */
export function myTurn(s) {
  const me = s.players?.me
  if (!me) return { state: 'idle' }
  if (me.status === 'oncourt' || me.status === 'walking') {
    return { state: 'playing', courtId: me.courtId ?? 0 }
  }
  if (me.status === 'resting') return { state: 'resting' }

  const courts = Math.max(1, s.courtCount || 1)
  const avg = avgMatchMinutes(s.history)

  // ① 이미 대진(경기 예정 · 자동 매칭)에 이름이 올라가 있으면 그 자리가 곧 내 순번
  const queued = []
  Object.keys(s.scheduledMatches || {})
    .sort((a, b) => Number(a) - Number(b))
    .forEach((k) => queued.push(s.scheduledMatches[k]))
  ;(s.autoMatches || []).forEach((m) => queued.push(m))
  const qi = queued.findIndex((m) => Array.isArray(m) && m.includes('me'))
  if (qi >= 0) {
    const rounds = Math.floor(qi / courts)
    return {
      state: rounds === 0 ? 'next' : 'queued',
      pos: qi + 1,
      ahead: qi,
      minutes: rounds * avg,
      avg,
    }
  }

  // ② 아직 대진에 없으면 대기석에서 오래 기다린 순서로 추정한다
  const waiting = s.order
    .map((id) => s.players[id])
    .filter((p) => p && p.status === 'waiting')
    .sort((a, b) => (a.waitSince || 0) - (b.waitSince || 0))
  const idx = waiting.findIndex((p) => p.isMe)
  if (idx < 0) return { state: 'idle' }

  const teamsAhead = Math.floor(idx / PLAYERS_PER_MATCH)
  const rounds = Math.floor(teamsAhead / courts)
  return {
    state: rounds === 0 && teamsAhead === 0 ? 'next' : 'waiting',
    pos: teamsAhead + 1,
    ahead: idx,
    minutes: rounds * avg,
    avg,
    waitingCount: waiting.length,
  }
}

/** 화면에 그대로 쓸 수 있는 한 줄 요약 */
export function turnText(t) {
  if (!t) return ''
  switch (t.state) {
    case 'playing': return `${(t.courtId ?? 0) + 1}번 코트에서 경기 중!`
    case 'next': return '바로 다음 차례야! 준비하자'
    case 'queued': return `내 순번 ${t.pos}번째 · 약 ${t.minutes}분 뒤`
    case 'waiting': return t.minutes > 0
      ? `대기 ${t.pos}번째 · 약 ${t.minutes}분 뒤`
      : `대기 ${t.pos}번째 · 곧 차례`
    case 'resting': return '휴식 중 — 대기석으로 돌아가면 순번이 잡혀'
    default: return '대기 인원이 모이면 순번이 잡혀'
  }
}
