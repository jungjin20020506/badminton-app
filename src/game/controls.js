// ===================================================================================
// 조작 (동물의 숲 방식)
//  - 아날로그 스틱 / 방향키로 "기울인 방향으로 계속 걷는다" (목적지 찍기가 아니다)
//  - 살짝 기울이면 걷기, 끝까지 기울이면 달리기
//  - 방향은 항상 "화면 기준" — 카메라를 돌려도 위로 밀면 화면 위로 간다
//  - 근처 주민에게 다가가면 Ⓐ 로 말을 건다
// ===================================================================================

const ZERO = { x: 0, z: 0, mag: 0 }

/** 화면 기준 입력 벡터. x: 오른쪽 +, z: 아래쪽 + */
let stick = ZERO
let stickActive = false

/** 내 캐릭터의 실제 위치 — 카메라·상호작용이 같은 좌표를 보게 한다 */
export const myPos = { x: 0, z: 0, ready: false, moving: false, run: false }

/** 모든 주민의 현재 위치 (말 걸기 대상 찾기용) */
export const actorPos = new Map()

export function registerActor(id, x, z) {
  const p = actorPos.get(id)
  if (p) { p.x = x; p.z = z } else actorPos.set(id, { x, z })
}
export function unregisterActor(id) {
  actorPos.delete(id)
}

export function setStick(x, z, mag) {
  stick = { x, z, mag }
  stickActive = mag > 0.02
}
export function clearStick() {
  stick = ZERO
  stickActive = false
}

// --- 키보드 (데스크톱) ---------------------------------------------------------------
const KEYMAP = {
  KeyW: 'u', ArrowUp: 'u',
  KeyS: 'd', ArrowDown: 'd',
  KeyA: 'l', ArrowLeft: 'l',
  KeyD: 'r', ArrowRight: 'r',
}
const held = new Set()

/** Ⓐ 에 해당하는 키를 눌렀을 때 불릴 콜백 */
let actionHandler = null
export function setActionHandler(fn) { actionHandler = fn }

function typing() {
  const el = document.activeElement
  if (!el) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable
}

/** 패널·모달이 열려 있으면 이동 조작을 막는다 (동물의 숲도 대화 중엔 못 움직인다) */
let movementBlocked = false
export function setMovementBlocked(v) { movementBlocked = v }
export function isMovementBlocked() { return movementBlocked }

if (typeof window !== 'undefined' && !globalThis.__svControlsBound) {
  globalThis.__svControlsBound = true
  window.addEventListener('keydown', (e) => {
    if (typing()) return
    if (movementBlocked) return // 패널이 열려 있으면 화살표로 목록을 스크롤할 수 있어야 한다
    if (KEYMAP[e.code]) {
      held.add(KEYMAP[e.code])
      e.preventDefault()
    } else if ((e.code === 'Space' || e.code === 'Enter') && actionHandler) {
      if (actionHandler()) e.preventDefault()
    }
  })
  window.addEventListener('keyup', (e) => {
    if (KEYMAP[e.code]) held.delete(KEYMAP[e.code])
  })
  window.addEventListener('blur', () => held.clear())
}

/** 이번 프레임의 입력. 스틱이 우선, 없으면 키보드 (키보드는 항상 최대 = 달리기) */
export function readInput() {
  if (movementBlocked) return ZERO
  if (stickActive) return stick
  let x = 0
  let z = 0
  if (held.has('l')) x -= 1
  if (held.has('r')) x += 1
  if (held.has('u')) z -= 1
  if (held.has('d')) z += 1
  const m = Math.hypot(x, z)
  if (m < 0.01) return ZERO
  return { x: x / m, z: z / m, mag: 1 }
}

export function inputActive() {
  return readInput().mag > 0.02
}

/** 내 위치에서 가장 가까운 다른 주민 (말 걸기 사거리 안) */
export const TALK_RANGE = 2.9
export function nearestNeighbor() {
  if (!myPos.ready) return null
  let best = null
  let bestD = TALK_RANGE
  actorPos.forEach((p, id) => {
    if (id === 'me') return
    const d = Math.hypot(p.x - myPos.x, p.z - myPos.z)
    if (d < bestD) { bestD = d; best = id }
  })
  return best
}
