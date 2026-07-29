// ===================================================================================
// 셔틀 랠리 — 판정 규칙
//
// 대기 시간에 혼자 하는 놀이지만, 상대는 「마을 주민」이다.
// 승패는 없다 — 랠리는 이기는 게 아니라 **끊기지 않게 같이 이어 가는 것**이라서,
// 이 게임의 규칙(참여로만 성장한다)과 정확히 맞는다.
//
// 그리기(rAF)와 판정을 일부러 떼어 놨다. 판정은 오로지 시계(performance.now)로만
// 계산하므로, 화면이 버벅여도 타이밍이 밀리지 않는다.
// ===================================================================================

/** 셔틀콕 3개 = 목숨 3개 */
export const RALLY_LIVES = 3

/** 너무 이르게 휘두른 것도 헛스윙으로 친다 — 그 전의 탭은 그냥 무시한다 */
export const PRE_SWING_MS = 700

/** 상대가 받아 넘길 때까지 (연출용) */
export const RETURN_MS = 420

/** 랠리가 길어질수록 셔틀콕이 빨리 온다 (1.5초 → 0.52초) */
export function flightDur(rally) {
  return Math.max(520, 1500 - rally * 34)
}

/** 랠리가 길어질수록 칠 수 있는 구간이 좁아진다 (±250ms → ±95ms) */
export function hitWindow(rally) {
  return Math.max(95, 250 - rally * 5)
}

/**
 * 판정.
 * @param rally 지금까지 이어 온 횟수
 * @param delta 친 시각 - 셔틀콕이 도착한 시각 (ms). 음수면 이르게 친 것.
 * @returns 'perfect' | 'good' | 'miss'
 */
export function judge(rally, delta) {
  const w = hitWindow(rally)
  const a = Math.abs(delta)
  if (a <= w * 0.32) return 'perfect'
  if (a <= w) return 'good'
  return 'miss'
}

/** 이 탭을 「이 셔틀콕을 향한 스윙」으로 볼지 (너무 이른 탭은 무시) */
export function isSwing(delta) {
  return delta >= -PRE_SWING_MS
}

/** 랠리 1회 6코인, 퍼펙트는 3코인 더 (실제 지급은 하루 미니게임 한도 안에서) */
export function rallyCoins(rally, perfect) {
  return rally * 6 + perfect * 3
}

/** 함께 랠리를 오래 이어 갈수록 그 사람과 가까워진다 (하루 한 사람당 한 번) */
export function rallyAffinity(rally) {
  return Math.min(8, Math.floor(rally / 4))
}

export const RALLY_GRADES = [
  { min: 40, label: '전설의 랠리', icon: '👑' },
  { min: 25, label: '숨이 턱까지', icon: '🔥' },
  { min: 15, label: '제법인데!', icon: '✨' },
  { min: 8, label: '몸이 풀렸다', icon: '🙂' },
  { min: 1, label: '워밍업', icon: '🪶' },
  { min: 0, label: '…시작이 반이다', icon: '💧' },
]

export function rallyGrade(rally) {
  return RALLY_GRADES.find((g) => rally >= g.min) || RALLY_GRADES[RALLY_GRADES.length - 1]
}
