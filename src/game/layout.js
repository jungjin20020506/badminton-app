// ===================================================================================
// 마을 좌표계 — 코트/대기석/입구 위치를 한 곳에서 계산한다.
// 3D 씬과 캐릭터 이동 로직이 같은 좌표를 보게 해서 "걸어가서 자리 잡는" 연출을 만든다.
// ===================================================================================

export const COURT_LEN = 10 // z 방향 길이
export const COURT_WID = 4.8 // x 방향 폭
export const COURT_PITCH_X = 7.2
export const COURT_PITCH_Z = 13.0

export const MAX_COURTS = 6

/** 코트 개수에 따른 코트 중심 좌표 목록 */
export function courtLayout(count) {
  const n = Math.max(1, Math.min(MAX_COURTS, count))
  const cols = Math.min(n, 3)
  const out = []
  for (let i = 0; i < n; i++) {
    const col = i % 3
    const row = Math.floor(i / 3)
    const rowCols = Math.min(3, n - row * 3)
    const x = (col - (rowCols - 1) / 2) * COURT_PITCH_X
    const z = -4 - row * COURT_PITCH_Z
    out.push({ id: i, x, z })
  }
  return out
}

/** 코트 안 4개 자리 (0,1 = 앞팀 / 2,3 = 뒷팀) */
const SLOT_OFFSETS = [
  [-1.25, 2.1],
  [1.25, 3.7],
  [1.25, -2.1],
  [-1.25, -3.7],
]

export function slotPosition(court, slot) {
  const [ox, oz] = SLOT_OFFSETS[slot] || [0, 0]
  return [court.x + ox, court.z + oz]
}

/** 자리에 섰을 때 바라보는 방향 (네트 쪽) */
export function slotFacing(slot) {
  return slot < 2 ? Math.PI : 0
}

/** 대기석 — 코트 앞쪽 잔디밭에 두 줄로 선다 */
export const WAIT_Z = 11.5
export function waitPosition(index) {
  const perRow = 9
  const row = Math.floor(index / perRow)
  const col = index % perRow
  const x = (col - (perRow - 1) / 2) * 2.3
  const z = WAIT_Z + row * 2.6
  return [x, z]
}

/** 마을 입구 (새 선수가 등장하는 곳) */
export const GATE = [0, 22]

/** 걸어 다닐 수 있는 잔디밭 반경 — 이보다 밖은 바다·언덕이라 못 나간다 */
export const ROAM_R = 27

/**
 * 코트 안(라인 + 여유)인지.
 * 코트는 경기가 배정됐을 때만 들어갈 수 있으므로, 직접 걸어가는 이동은 여기서 막는다.
 */
export function insideCourt(x, z, count, margin = 1.0) {
  const hw = COURT_WID / 2 + margin
  const hl = COURT_LEN / 2 + margin
  return courtLayout(count).some((c) => Math.abs(x - c.x) < hw && Math.abs(z - c.z) < hl)
}

/**
 * 탭한 지점을 실제로 설 수 있는 지점으로 다듬는다.
 * 코트 안이면 null (이동 불가), 마을 밖이면 가장자리로 당겨 준다.
 */
export function clampRoam(x, z, count) {
  const d = Math.hypot(x, z)
  if (d > ROAM_R) {
    x = (x / d) * ROAM_R
    z = (z / d) * ROAM_R
  }
  if (insideCourt(x, z, count)) return null
  return [x, z]
}

/** 코트 개수에 맞춘 카메라 기본 위치 */
export function cameraForCourts(count) {
  const rows = Math.ceil(Math.min(MAX_COURTS, Math.max(1, count)) / 3)
  const back = rows > 1 ? 34 : 27
  const high = rows > 1 ? 22 : 17
  return [0, high, back]
}
