// ===================================================================================
// 자동 매칭 엔진
// 기존 배드민턴 앱의 설계(급수 밸런스 + 대기시간 + 다양성 + 민감도)를 그대로 옮겨왔다.
// 다르게 만든 점: 조합을 고른 "이유"를 함께 돌려줘서 게임 안에서 설명해 줄 수 있다.
// ===================================================================================
import { LEVEL_VALUE, LEVEL_POWER, PLAYERS_PER_MATCH, SENSITIVITIES } from './constants.js'

export const getSensitivity = (key) =>
  SENSITIVITIES.find((s) => s.key === key) || SENSITIVITIES[1]

const levelValue = (p) => LEVEL_VALUE[p.level] ?? 4

/**
 * 4인 조합을 2:2로 나눌 때 팀 간 급수합 차이가 가장 작은 분할을 찾는다.
 * @returns {{diff:number, spread:number, order:object[]}} order[0,1]=팀A / order[2,3]=팀B
 */
export function bestLevelSplit(combo) {
  if (combo.length !== 4) return { diff: 0, spread: 0, order: combo }
  const v = combo.map(levelValue)
  const splits = [
    [[0, 1], [2, 3]],
    [[0, 2], [1, 3]],
    [[0, 3], [1, 2]],
  ]
  let best = null
  for (const [t1, t2] of splits) {
    const diff = Math.abs(v[t1[0]] + v[t1[1]] - (v[t2[0]] + v[t2[1]]))
    if (!best || diff < best.diff) {
      best = { diff, order: [combo[t1[0]], combo[t1[1]], combo[t2[0]], combo[t2[1]]] }
    }
  }
  return { diff: best.diff, spread: Math.max(...v) - Math.min(...v), order: best.order }
}

/** 두 선수가 최근에 얼마나 자주 만났는지 (최근일수록 큰 페널티) */
function encounterPenalty(a, b, history) {
  let penalty = 0
  const recent = history.slice(0, 12)
  recent.forEach((g, idx) => {
    const ids = [...g.teamA, ...g.teamB]
    if (ids.includes(a.id) && ids.includes(b.id)) {
      const recency = 1 - idx / 14 // 최근 경기일수록 1에 가까움
      const samePartner =
        (g.teamA.includes(a.id) && g.teamA.includes(b.id)) ||
        (g.teamB.includes(a.id) && g.teamB.includes(b.id))
      penalty += (samePartner ? 26 : 16) * recency
    }
  })
  return penalty
}

/** 인원수에 따른 기준 점수 — 사람이 많을수록 좋은 조합을 기다릴 여유가 있다 */
function baseMinScore(waitingCount) {
  if (waitingCount <= 5) return 20
  if (waitingCount <= 8) return 45
  if (waitingCount <= 12) return 62
  return 74
}

function comboScore(combo, ctx) {
  const { history, now, maxGames } = ctx
  const { diff, spread, order } = bestLevelSplit(combo)

  // 1) 대기시간 — 오래 기다린 사람이 들어갈수록 높은 점수
  const waitSec = combo.map((p) => Math.max(0, (now - (p.waitSince || now)) / 1000))
  const waitScore = Math.min(60, (waitSec.reduce((a, b) => a + b, 0) / 4) * 0.9)

  // 2) 공평성 — 오늘 경기 수가 적은 사람 우대
  const fairness = combo.reduce((acc, p) => acc + (maxGames - (p.todayGames || 0)) * 7, 0)

  // 3) 다양성 — 최근에 만난 사이면 감점
  let diversityPenalty = 0
  for (let i = 0; i < 4; i++)
    for (let j = i + 1; j < 4; j++)
      diversityPenalty += encounterPenalty(combo[i], combo[j], history)

  // 4) 밸런스 — 팀 급수합 차이 / 조합 내 급수 격차
  const balancePenalty = diff * 22 + Math.max(0, spread - 1) * 14

  const score = 40 + waitScore + fairness - diversityPenalty - balancePenalty
  return { score, diff, spread, order, waitScore, diversityPenalty, balancePenalty }
}

function* combinations(arr, k, start = 0, acc = []) {
  if (acc.length === k) {
    yield acc.slice()
    return
  }
  for (let i = start; i < arr.length; i++) {
    acc.push(arr[i])
    yield* combinations(arr, k, i + 1, acc)
    acc.pop()
  }
}

/**
 * 대기 인원에서 최고의 4인 조합 하나를 고른다.
 * @returns {{players:object[], reason:string, score:number}|null} 기준 미달이면 null
 */
export function pickBestCombo(waiting, { history = [], sensitivity = 'normal', now = Date.now() } = {}) {
  if (waiting.length < PLAYERS_PER_MATCH) return null

  // 대기시간이 긴 순으로 정렬 후 앞쪽 12명만 후보로 (조합 폭발 방지)
  const sorted = [...waiting].sort((a, b) => (a.waitSince || 0) - (b.waitSince || 0))
  const pool = sorted.slice(0, 12)
  const maxGames = Math.max(...waiting.map((p) => p.todayGames || 0), 0)
  const ctx = { history, now, maxGames }

  let best = null
  for (const combo of combinations(pool, PLAYERS_PER_MATCH)) {
    const r = comboScore(combo, ctx)
    if (!best || r.score > best.score) best = { ...r, combo }
  }
  if (!best) return null

  const threshold = baseMinScore(waiting.length) + getSensitivity(sensitivity).offset
  if (best.score < threshold) return null

  return {
    players: best.order,
    score: Math.round(best.score),
    reason: buildReason(best),
  }
}

function buildReason(best) {
  const bits = []
  bits.push(best.diff === 0 ? '팀 급수합 동일 (완벽 밸런스)' : `팀 급수합 차이 ${best.diff}`)
  if (best.diversityPenalty === 0) bits.push('최근에 안 만난 조합')
  else if (best.diversityPenalty < 20) bits.push('겹침 적음')
  else bits.push('겹치지만 대기시간 우선')
  if (best.waitScore > 25) bits.push('오래 기다린 순 반영')
  return bits.join(' · ')
}

/** 팀 전력 — 경기 시뮬레이션에 사용 */
export function teamPower(players, statBonusFor) {
  return players.reduce((acc, p) => {
    const base = LEVEL_POWER[p.level] ?? 0.66
    const bonus = statBonusFor ? statBonusFor(p) : 0
    return acc + base + bonus
  }, 0)
}
