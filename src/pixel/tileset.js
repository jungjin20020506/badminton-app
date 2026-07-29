// ===================================================================================
// 셔틀몬스터 — 픽셀 타일 & 오브젝트 그리기
//
// 외부 이미지 파일을 하나도 쓰지 않는다. 잔디 한 포기, 지붕 기와 한 장까지
// 전부 이 파일 안에서 fillRect 로 찍어 만든 뒤 오프스크린 캔버스에 구워 둔다.
//  - 바닥 타일(16x16) : 맵을 열 때 한 번에 큰 캔버스로 구워 두고 잘라 쓴다
//  - 오브젝트(나무/건물/진열대…) : 종류·테마별로 한 번만 구워 두고 drawImage
// 덕분에 맵이 커져도 매 프레임 비용은 drawImage 몇 번이면 끝난다.
// ===================================================================================

export const TILE = 16

// -----------------------------------------------------------------------------------
// 픽셀 유틸
// -----------------------------------------------------------------------------------
const P = (g, x, y, w, h, c) => {
  g.fillStyle = c
  g.fillRect(x | 0, y | 0, w | 0, h | 0)
}
const dot = (g, x, y, c) => P(g, x, y, 1, 1, c)

/** 좌표를 씨앗으로 항상 같은 무늬가 나오게 (맵을 다시 열어도 잔디가 안 흔들린다) */
export function hash2(x, y, salt = 0) {
  let h = (x * 374761393 + y * 668265263 + salt * 2246822519) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

function makeCanvas(w, h) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const g = c.getContext('2d')
  g.imageSmoothingEnabled = false
  return { c, g }
}

/** #rrggbb 를 조금 어둡게/밝게 */
export function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16)
  const cl = (v) => Math.max(0, Math.min(255, Math.round(v)))
  const r = cl(((n >> 16) & 255) + amt)
  const gg = cl(((n >> 8) & 255) + amt)
  const b = cl((n & 255) + amt)
  return `#${((r << 16) | (gg << 8) | b).toString(16).padStart(6, '0')}`
}

// -----------------------------------------------------------------------------------
// 바닥 타일 — 16x16
// key 는 맵 문자열에서 쓰는 글자다.
// -----------------------------------------------------------------------------------

/** 잔디 — 밑색 3종을 섞고 풀잎을 두세 개 심는다 */
function tGrass(g, t, x, y) {
  const p = t.ground
  const base = p.grass[Math.floor(hash2(x, y, 1) * p.grass.length)]
  P(g, 0, 0, 16, 16, base)
  for (let i = 0; i < 5; i++) {
    const r = hash2(x, y, 10 + i)
    const bx = Math.floor(r * 14) + 1
    const by = Math.floor(hash2(x, y, 40 + i) * 14) + 1
    const c = r > 0.55 ? p.grassDot : p.grassDark
    P(g, bx, by, 1, 2, c)
    if (r > 0.8) dot(g, bx + 1, by + 1, c)
  }
}

/** 꽃밭 — 잔디 위에 네잎 꽃 한 송이 */
function tFlower(g, t, x, y) {
  tGrass(g, t, x, y)
  const petals = ['#ff7ba8', '#ffe066', '#ffffff', '#a88cff']
  const c = petals[Math.floor(hash2(x, y, 3) * petals.length)]
  const cx = 4 + Math.floor(hash2(x, y, 4) * 7)
  const cy = 4 + Math.floor(hash2(x, y, 5) * 7)
  P(g, cx, cy - 2, 2, 2, c)
  P(g, cx, cy + 2, 2, 2, c)
  P(g, cx - 2, cy, 2, 2, c)
  P(g, cx + 2, cy, 2, 2, c)
  P(g, cx, cy, 2, 2, '#ffd84a')
}

/** 풀숲 — 포켓몬의 그 풀숲. 밟으면 사각사각 소리가 날 것 같은 뭉치 */
function tTall(g, t, x, y) {
  const p = t.ground
  P(g, 0, 0, 16, 16, p.grassDark)
  for (let i = 0; i < 3; i++) {
    const bx = i * 5 + 1
    const off = hash2(x, y, 60 + i) > 0.5 ? 0 : 1
    P(g, bx, 6 + off, 4, 8, p.grass[0])
    P(g, bx + 1, 3 + off, 2, 4, p.grass[2])
    P(g, bx, 6 + off, 1, 6, p.grassDot)
    P(g, bx + 3, 8 + off, 1, 5, shade(p.grassDark, -14))
  }
  P(g, 0, 14, 16, 2, shade(p.grassDark, -18))
}

/** 흙길 */
function tDirt(g, t, x, y) {
  const p = t.ground
  P(g, 0, 0, 16, 16, p.dirt[Math.floor(hash2(x, y, 7) * p.dirt.length)])
  for (let i = 0; i < 6; i++) {
    const bx = Math.floor(hash2(x, y, 70 + i) * 15)
    const by = Math.floor(hash2(x, y, 90 + i) * 15)
    dot(g, bx, by, hash2(x, y, 110 + i) > 0.5 ? p.dirtDot : shade(p.dirt[0], 14))
  }
}

/** 보도블록 — 8x8 네 장 */
function tBrick(g, t, x, y) {
  const p = t.ground
  P(g, 0, 0, 16, 16, p.brickLine)
  for (let qy = 0; qy < 2; qy++) {
    for (let qx = 0; qx < 2; qx++) {
      const c = p.brick[Math.floor(hash2(x * 2 + qx, y * 2 + qy, 9) * p.brick.length)]
      P(g, qx * 8, qy * 8, 7, 7, c)
      P(g, qx * 8, qy * 8, 7, 1, shade(c, 10))
    }
  }
}

/** 모래 */
function tSand(g, t, x, y) {
  const p = t.ground
  P(g, 0, 0, 16, 16, p.sand[Math.floor(hash2(x, y, 11) * p.sand.length)])
  for (let i = 0; i < 7; i++) {
    dot(g, Math.floor(hash2(x, y, 130 + i) * 16), Math.floor(hash2(x, y, 150 + i) * 16), shade(p.sand[1], -10))
  }
}

/** 물 — frame 0/1 로 물결이 흐른다 */
function tWater(g, t, x, y, frame) {
  const p = t.ground
  P(g, 0, 0, 16, 16, p.water[0])
  P(g, 0, 0, 16, 8, p.water[1])
  const s = frame ? 4 : 0
  for (let i = 0; i < 2; i++) {
    const wy = 3 + i * 7 + (hash2(x, y, 170 + i) > 0.5 ? 1 : 0)
    const wx = ((Math.floor(hash2(x, y, 180 + i) * 10) + s) % 12) + 1
    P(g, wx, wy, 4, 1, p.waterFoam)
    P(g, wx + 5, wy + 2, 2, 1, p.waterFoam)
  }
  P(g, 0, 15, 16, 1, shade(p.water[0], -18))
}

/** 실내 마루 — 가로 널판 */
function tWood(g, t, x, y) {
  const p = t.ground
  const c = p.floor[(y + (x >> 2)) % p.floor.length]
  P(g, 0, 0, 16, 16, c)
  P(g, 0, 0, 16, 1, shade(c, 12))
  P(g, 0, 7, 16, 1, p.floorLine)
  P(g, 0, 15, 16, 1, p.floorLine)
  const seam = (x * 5 + y * 3) % 16
  P(g, seam, 0, 1, 7, p.floorLine)
  P(g, (seam + 9) % 16, 8, 1, 7, p.floorLine)
  for (let i = 0; i < 3; i++) {
    P(g, Math.floor(hash2(x, y, 190 + i) * 12) + 2, i * 5 + 2, 3, 1, shade(c, -8))
  }
}

/** 실내 타일 바닥 — 체크 */
function tTileFloor(g, t, x, y) {
  const p = t.ground
  const a = p.floor[0]
  const b = p.floor[1]
  for (let qy = 0; qy < 2; qy++) {
    for (let qx = 0; qx < 2; qx++) {
      P(g, qx * 8, qy * 8, 8, 8, (x + y + qx + qy) % 2 ? a : b)
    }
  }
  P(g, 0, 0, 16, 1, p.floorLine)
  P(g, 0, 0, 1, 16, p.floorLine)
  P(g, 0, 8, 16, 1, p.floorLine)
  P(g, 8, 0, 1, 16, p.floorLine)
}

/** 카펫 — 짜임 무늬가 들어간 융단 */
function tCarpet(g, t, x, y) {
  const a = t.ground.accent
  const hi = shade(a, 26)
  const lo = shade(a, -26)
  P(g, 0, 0, 16, 16, a)
  // 씨실·날실
  for (let i = 0; i < 16; i += 4) {
    P(g, i, 0, 1, 16, (x + i) % 8 ? hi : lo)
    P(g, 0, i, 16, 1, (y + i) % 8 ? lo : hi)
  }
  // 가운데 마름모
  for (let i = 0; i < 4; i++) {
    P(g, 8 - i, 4 + i, i * 2 + 1, 1, hi)
    P(g, 8 - i, 11 - i, i * 2 + 1, 1, hi)
  }
}

/** 실내 벽 — 아랫단(굽도리 있음) */
function tWallBot(g, t) {
  const p = t.ground
  P(g, 0, 0, 16, 16, p.wall)
  P(g, 0, 0, 16, 1, shade(p.wall, -10))
  P(g, 0, 11, 16, 5, p.wallLo)
  P(g, 0, 11, 16, 1, shade(p.wallLo, 20))
}

/** 실내 벽 — 윗단(벽지 줄무늬) */
function tWallTop(g, t, x, y) {
  const p = t.ground
  P(g, 0, 0, 16, 16, p.wall)
  P(g, 0, 6, 16, 2, shade(p.wall, -12))
  for (let i = 0; i < 16; i += 4) P(g, i + ((x + y) % 2 ? 1 : 3), 10, 1, 4, shade(p.wall, -8))
  P(g, 0, 15, 16, 1, p.wallLo)
}

/** 문 앞 매트 — 여기를 밟으면 다른 지도로 넘어간다 (발판처럼 차분하게) */
function tMat(g, t) {
  const a = t.ground.accent
  P(g, 0, 0, 16, 16, '#6b6257')
  P(g, 0, 2, 16, 12, '#4c453d')
  P(g, 1, 3, 14, 10, '#5a534a')
  // 발판 결
  for (let i = 2; i < 15; i += 3) P(g, i, 4, 1, 8, '#443e37')
  // 살짝 들어간 테두리에 지역 색을 한 줄
  P(g, 1, 2, 14, 1, shade(a, 10))
  P(g, 1, 13, 14, 1, shade(a, -30))
}

/** 체육관 마루 */
function tGymFloor(g, t, x, y) {
  const p = t.ground
  const c = p.floor[(y >> 1) % 2]
  P(g, 0, 0, 16, 16, c)
  P(g, 0, 15, 16, 1, p.floorLine)
  P(g, ((x * 7) % 16), 0, 1, 16, shade(c, -6))
  P(g, 0, 3, 10, 1, shade(c, 8))
}

/** 아무것도 없는 칸 (지도 바깥) */
function tVoid(g, t) {
  P(g, 0, 0, 16, 16, '#101018')
}

// 맵 문자 → 타일 정의
export const TILES = {
  '.': { draw: tGrass, solid: 0 },
  ',': { draw: tFlower, solid: 0 },
  '"': { draw: tTall, solid: 0, tall: 1 },
  '=': { draw: tDirt, solid: 0 },
  '_': { draw: tBrick, solid: 0 },
  s: { draw: tSand, solid: 0 },
  '~': { draw: tWater, solid: 1, anim: 1 },
  F: { draw: tWood, solid: 0 },
  f: { draw: tTileFloor, solid: 0 },
  c: { draw: tCarpet, solid: 0 },
  G: { draw: tGymFloor, solid: 0 },
  W: { draw: tWallTop, solid: 1 },
  w: { draw: tWallBot, solid: 1 },
  D: { draw: tMat, solid: 0, warp: 1 },
  ' ': { draw: tVoid, solid: 1 },
}

// -----------------------------------------------------------------------------------
// 오브젝트 — 타일 위에 세워지는 입체물. 아래쪽 기준으로 정렬해서 뒤로 걸어갈 수 있다.
// w,h 는 타일 개수. solidRows 는 아래에서 몇 줄이 막히는지.
// -----------------------------------------------------------------------------------

/** 나뭇잎 뭉치 하나 */
function blob(g, cx, cy, r, c) {
  for (let y = -r; y <= r; y++) {
    const w = Math.round(Math.sqrt(Math.max(0, r * r - y * y)))
    P(g, cx - w, cy + y, w * 2 + 1, 1, c)
  }
}

function oTree(g, t, seed) {
  const p = t.ground
  // 32 x 48
  P(g, 13, 30, 6, 16, p.trunk)
  P(g, 13, 30, 2, 16, shade(p.trunk, 16))
  P(g, 17, 30, 2, 16, p.trunkLo)
  P(g, 11, 44, 10, 3, p.trunkLo)
  blob(g, 16, 20, 13, p.leafLo)
  blob(g, 16, 18, 12, p.leaf)
  blob(g, 12, 14, 8, p.leafHi)
  blob(g, 21, 16, 6, p.leafHi)
  for (let i = 0; i < 14; i++) {
    const a = hash2(seed, i, 5) * Math.PI * 2
    const rr = 4 + hash2(seed, i, 6) * 9
    dot(g, 16 + Math.cos(a) * rr, 18 + Math.sin(a) * rr * 0.9, p.leafLo)
  }
  P(g, 4, 44, 24, 3, 'rgba(0,0,0,.16)')
}

function oPine(g, t, seed) {
  const p = t.ground
  P(g, 14, 34, 4, 12, p.trunk)
  P(g, 10, 44, 12, 3, p.trunkLo)
  for (let i = 0; i < 4; i++) {
    const y = 8 + i * 8
    const w = 6 + i * 4
    P(g, 16 - w, y + 6, w * 2, 6, p.leafLo)
    P(g, 16 - w + 1, y + 4, w * 2 - 2, 4, p.leaf)
    P(g, 16 - w + 3, y + 3, 5, 3, p.leafHi)
  }
  P(g, 14, 4, 4, 6, p.leaf)
  P(g, 4, 44, 24, 3, 'rgba(0,0,0,.16)')
}

function oBush(g, t, seed) {
  const p = t.ground
  blob(g, 8, 10, 7, p.leafLo)
  blob(g, 8, 9, 6, p.leaf)
  blob(g, 6, 7, 3, p.leafHi)
  for (let i = 0; i < 3; i++) {
    dot(g, 3 + Math.floor(hash2(seed, i, 2) * 11), 5 + Math.floor(hash2(seed, i, 3) * 8), '#ff5c6c')
  }
  P(g, 2, 14, 12, 2, 'rgba(0,0,0,.14)')
}

function oRock(g, t) {
  P(g, 3, 6, 10, 8, '#9aa0a8')
  P(g, 4, 5, 8, 3, '#b6bcc4')
  P(g, 5, 4, 5, 2, '#cbd0d6')
  P(g, 3, 12, 10, 2, '#767c86')
  P(g, 2, 14, 12, 2, 'rgba(0,0,0,.16)')
}

function oSign(g, t) {
  P(g, 7, 9, 2, 6, '#7b5230')
  P(g, 2, 2, 12, 8, '#b9834b')
  P(g, 3, 3, 10, 6, '#e6c48d')
  P(g, 4, 4, 8, 1, '#8a6234')
  P(g, 4, 6, 6, 1, '#8a6234')
  P(g, 2, 14, 12, 2, 'rgba(0,0,0,.16)')
}

function oLamp(g, t) {
  P(g, 6, 8, 4, 22, '#4a5060')
  P(g, 4, 28, 8, 3, '#343a48')
  P(g, 3, 2, 10, 8, '#2c3240')
  P(g, 4, 3, 8, 6, '#ffe9a8')
  P(g, 5, 4, 3, 3, '#fffdf0')
  P(g, 2, 1, 12, 2, '#4a5060')
}

function oBench(g, t) {
  P(g, 2, 8, 28, 4, '#c08a52')
  P(g, 2, 8, 28, 1, '#dba86e')
  P(g, 2, 3, 28, 4, '#c08a52')
  P(g, 2, 3, 28, 1, '#dba86e')
  P(g, 4, 12, 3, 6, '#6b6f78')
  P(g, 25, 12, 3, 6, '#6b6f78')
  P(g, 2, 17, 28, 2, 'rgba(0,0,0,.16)')
}

function oFence(g, t) {
  P(g, 0, 5, 16, 3, '#d8b98a')
  P(g, 0, 10, 16, 3, '#d8b98a')
  P(g, 2, 2, 3, 13, '#b9834b')
  P(g, 11, 2, 3, 13, '#b9834b')
  P(g, 0, 15, 16, 1, 'rgba(0,0,0,.14)')
}

function oVending(g, t) {
  P(g, 1, 2, 14, 28, '#c8342c')
  P(g, 2, 3, 12, 14, '#2c3240')
  for (let i = 0; i < 6; i++) {
    P(g, 3 + (i % 3) * 4, 4 + Math.floor(i / 3) * 6, 3, 5, ['#ffe066', '#7ad0ff', '#8ef08a'][i % 3])
  }
  P(g, 3, 19, 10, 3, '#f0f0f0')
  P(g, 3, 24, 5, 4, '#2c3240')
  P(g, 1, 30, 14, 2, '#8a1e18')
  P(g, 0, 31, 16, 1, 'rgba(0,0,0,.2)')
}

// ── 실내 가구 ───────────────────────────────────────────────────────────────────
function oCounter(g, t) {
  // 2x1 칸을 쓰지만 그림은 22px — 상판이 살짝 솟아 보이게
  const c = t.ground.accent
  const wood = '#b98a52'
  // 앞면(옆판)
  P(g, 1, 8, 30, 13, shade(c, -42))
  P(g, 2, 9, 28, 11, shade(c, -26))
  for (let i = 4; i < 29; i += 7) P(g, i, 11, 5, 7, shade(c, -36))
  // 상판
  P(g, 0, 5, 32, 4, wood)
  P(g, 0, 5, 32, 1, shade(wood, 26))
  P(g, 0, 8, 32, 1, shade(wood, -34))
  // 계산대 + 작은 화분
  P(g, 4, 1, 7, 5, '#e8ecf2')
  P(g, 5, 2, 5, 2, '#2a3550')
  P(g, 5, 4, 2, 1, '#8fa0c8')
  P(g, 24, 2, 4, 4, '#8a5a3a')
  P(g, 23, 0, 6, 3, '#3f9a5c')
  P(g, 1, 21, 30, 1, 'rgba(0,0,0,.3)')
}

function oShelf(g, t) {
  // 1x2 — 마트 진열대
  P(g, 0, 2, 16, 30, '#8e96a8')
  P(g, 1, 3, 14, 28, '#c6ccd8')
  const goods = ['#ff6b6b', '#ffd93d', '#6bcB77', '#4d96ff', '#c77dff', '#ff9f45']
  for (let r = 0; r < 4; r++) {
    P(g, 1, 3 + r * 7, 14, 1, '#8e96a8')
    for (let i = 0; i < 3; i++) {
      P(g, 2 + i * 5, 5 + r * 7, 4, 5, goods[(r * 3 + i) % goods.length])
      P(g, 2 + i * 5, 5 + r * 7, 4, 1, '#ffffff')
    }
  }
  P(g, 0, 31, 16, 1, 'rgba(0,0,0,.25)')
}

function oPlant(g, t) {
  P(g, 4, 22, 8, 9, '#b96a3a')
  P(g, 4, 22, 8, 2, '#d98a54')
  blob(g, 8, 15, 7, '#2f7a46')
  blob(g, 5, 11, 4, '#43a05c')
  blob(g, 11, 12, 4, '#43a05c')
  P(g, 3, 30, 10, 2, 'rgba(0,0,0,.2)')
}

function oTable(g, t) {
  P(g, 1, 3, 30, 8, '#d8a868')
  P(g, 1, 3, 30, 2, '#eec48c')
  P(g, 3, 11, 3, 5, '#a87840')
  P(g, 26, 11, 3, 5, '#a87840')
  P(g, 12, 5, 8, 4, '#ffffff')
  P(g, 1, 15, 30, 1, 'rgba(0,0,0,.2)')
}

function oBed(g, t) {
  // 2x2
  P(g, 1, 2, 30, 28, '#a8703c')
  P(g, 2, 3, 28, 26, '#e8e4dc')
  P(g, 2, 3, 28, 9, '#f6f4ee')
  P(g, 5, 5, 22, 6, '#ffffff')
  P(g, 2, 14, 28, 15, t.ground.accent)
  P(g, 2, 14, 28, 2, shade(t.ground.accent, 26))
  for (let i = 4; i < 28; i += 6) P(g, i, 18, 2, 8, shade(t.ground.accent, -20))
  P(g, 1, 29, 30, 2, 'rgba(0,0,0,.2)')
}

function oTv(g, t) {
  P(g, 2, 2, 28, 11, '#2a2e38')
  P(g, 4, 4, 24, 7, '#7fd4f5')
  P(g, 5, 5, 10, 3, '#c9f0ff')
  P(g, 13, 13, 6, 2, '#2a2e38')
  P(g, 6, 15, 20, 2, '#4a505c')
  P(g, 2, 16, 28, 1, 'rgba(0,0,0,.2)')
}

function oPc(g, t) {
  P(g, 1, 4, 14, 10, '#dfe4ec')
  P(g, 2, 5, 12, 7, '#2b6fd8')
  P(g, 3, 6, 5, 2, '#9fd0ff')
  P(g, 3, 14, 10, 2, '#aab2c0')
  P(g, 1, 15, 14, 1, 'rgba(0,0,0,.2)')
}

function oLocker(g, t) {
  P(g, 1, 2, 14, 29, '#5e6a86')
  P(g, 2, 3, 12, 13, '#8b97b4')
  P(g, 2, 17, 12, 13, '#8b97b4')
  P(g, 11, 8, 2, 3, '#e8e8f0')
  P(g, 11, 22, 2, 3, '#e8e8f0')
  P(g, 3, 5, 8, 1, '#41496a')
  P(g, 1, 30, 14, 2, 'rgba(0,0,0,.25)')
}

function oMachine(g, t, seed) {
  // 1x2 — 뽑기 기계
  const body = ['#ff5c8a', '#4db2ff', '#ffc93c'][seed % 3]
  P(g, 1, 4, 14, 27, body)
  P(g, 1, 4, 14, 2, shade(body, 30))
  P(g, 2, 6, 12, 12, '#f4f8ff')
  for (let i = 0; i < 7; i++) {
    P(g, 3 + (i % 4) * 3, 8 + Math.floor(i / 4) * 4, 2, 2, ['#ff6b6b', '#ffd93d', '#6bcB77', '#4d96ff'][i % 4])
  }
  P(g, 5, 20, 6, 3, '#2a2e38')
  P(g, 6, 25, 4, 3, '#2a2e38')
  P(g, 1, 30, 14, 1, 'rgba(0,0,0,.3)')
}

function oScoreboard(g, t) {
  // 3x2
  P(g, 2, 2, 44, 22, '#20263c')
  P(g, 4, 4, 40, 14, '#0d1120')
  for (let i = 0; i < 2; i++) {
    P(g, 8 + i * 20, 7, 5, 8, '#ff5a3c')
    P(g, 15 + i * 20, 7, 5, 8, '#ff5a3c')
  }
  P(g, 22, 9, 2, 2, '#ffd84a')
  P(g, 22, 13, 2, 2, '#ffd84a')
  P(g, 10, 24, 5, 8, '#4a5060')
  P(g, 33, 24, 5, 8, '#4a5060')
  P(g, 2, 31, 44, 1, 'rgba(0,0,0,.25)')
}

// ── 마을이 자라면 생기는 것들 ────────────────────────────────────────────────────
function oFlag(g, t) {
  // 1x2 — 축제 깃발
  const a = t.ground.accent
  P(g, 6, 4, 2, 26, '#c8ccd4')
  P(g, 6, 4, 1, 26, '#e8ecf2')
  P(g, 8, 5, 8, 9, a)
  P(g, 8, 5, 8, 2, shade(a, 30))
  for (let i = 0; i < 4; i++) P(g, 15 - i, 6 + i, 1, 9 - i * 2, shade(a, -30))
  P(g, 5, 2, 4, 3, '#ffd21f')
  P(g, 4, 29, 6, 2, 'rgba(0,0,0,.18)')
}

function oSakura(g, t, seed) {
  // 2x3 — 벚나무
  P(g, 13, 30, 6, 16, '#7b5230')
  P(g, 13, 30, 2, 16, '#96683f')
  P(g, 11, 44, 10, 3, '#5c3c22')
  const pink = '#ffb7d5'
  const pinkLo = '#f090b8'
  const pinkHi = '#ffdcec'
  blob(g, 16, 20, 13, pinkLo)
  blob(g, 16, 18, 12, pink)
  blob(g, 12, 14, 8, pinkHi)
  blob(g, 21, 16, 6, pinkHi)
  for (let i = 0; i < 16; i++) {
    const a = hash2(seed, i, 5) * Math.PI * 2
    const rr = 4 + hash2(seed, i, 6) * 10
    dot(g, 16 + Math.cos(a) * rr, 18 + Math.sin(a) * rr * 0.9, i % 3 ? pinkHi : '#ffffff')
  }
  // 흩날리는 꽃잎
  for (let i = 0; i < 4; i++) dot(g, 4 + i * 7, 34 + (i % 3) * 4, pink)
  P(g, 4, 44, 24, 3, 'rgba(0,0,0,.16)')
}

function oFountain(g, t) {
  // 2x2 — 분수대
  P(g, 1, 14, 30, 16, '#b8bcc6')
  P(g, 2, 15, 28, 14, '#d6dae2')
  P(g, 4, 17, 24, 10, '#4f9fe0')
  P(g, 4, 17, 24, 3, '#78c0f0')
  for (let i = 0; i < 5; i++) P(g, 6 + i * 5, 21 + (i % 2) * 3, 3, 1, '#bfe6ff')
  // 가운데 물기둥
  P(g, 14, 4, 4, 14, '#c8ccd4')
  P(g, 15, 2, 2, 4, '#9fd8ff')
  P(g, 13, 6, 1, 5, '#bfe6ff')
  P(g, 18, 6, 1, 5, '#bfe6ff')
  P(g, 11, 10, 1, 4, '#bfe6ff')
  P(g, 20, 10, 1, 4, '#bfe6ff')
  P(g, 1, 29, 30, 2, 'rgba(0,0,0,.2)')
}

/** 배드민턴 코트 — 5x9 타일(80x144). 라인·네트까지 전부 픽셀로 */
function oCourt(g, t) {
  const p = t.ground
  const W = 80
  const H = 144
  P(g, 0, 0, W, H, p.court || '#2f7d55')
  P(g, 4, 4, W - 8, H - 8, p.courtIn || '#3b8f63')
  const L = p.courtLine || '#f4f4e8'
  const line = (x, y, w, h) => P(g, x, y, w, h, L)
  // 바깥 라인
  line(6, 6, W - 12, 1)
  line(6, H - 7, W - 12, 1)
  line(6, 6, 1, H - 12)
  line(W - 7, 6, 1, H - 12)
  // 단식 사이드라인
  line(12, 6, 1, H - 12)
  line(W - 13, 6, 1, H - 12)
  // 짧은 서비스 라인
  line(6, 52, W - 12, 1)
  line(6, H - 53, W - 12, 1)
  // 센터라인
  line(W / 2 - 1, 6, 1, 46)
  line(W / 2 - 1, H - 52, 1, 46)
  // 롱 서비스 라인(복식)
  line(6, 14, W - 12, 1)
  line(6, H - 15, W - 12, 1)
  // 네트
  P(g, 2, H / 2 - 6, W - 4, 2, '#e8e8e8')
  for (let y = H / 2 - 4; y < H / 2 + 5; y += 2) P(g, 2, y, W - 4, 1, 'rgba(240,240,240,.55)')
  for (let x = 3; x < W - 3; x += 3) P(g, x, H / 2 - 4, 1, 9, 'rgba(240,240,240,.5)')
  P(g, 1, H / 2 - 10, 2, 18, '#c8ccd4')
  P(g, W - 3, H / 2 - 10, 2, 18, '#c8ccd4')
}

// ── 건물 ────────────────────────────────────────────────────────────────────────

/** 지붕 기와 */
function roof(g, x, y, w, h, c) {
  P(g, x, y, w, h, c)
  P(g, x, y, w, 2, shade(c, 26))
  for (let ry = y + 3; ry < y + h; ry += 4) {
    P(g, x, ry, w, 1, shade(c, -22))
    for (let rx = x + ((ry / 4) % 2 ? 3 : 0); rx < x + w; rx += 6) P(g, rx, ry - 3, 1, 3, shade(c, -14))
  }
  P(g, x, y + h - 1, w, 1, shade(c, -34))
}

function window9(g, x, y, w, h) {
  P(g, x, y, w, h, '#2a3550')
  P(g, x + 1, y + 1, w - 2, h - 2, '#8fd8f8')
  P(g, x + 1, y + 1, Math.floor(w / 2), Math.floor(h / 2), '#c8f0ff')
  P(g, x + Math.floor(w / 2), y + 1, 1, h - 2, '#2a3550')
  P(g, x + 1, y + Math.floor(h / 2), w - 2, 1, '#2a3550')
}

/** 간판 엠블럼 — 글자 대신 그림으로 어떤 가게인지 알린다 */
function emblem(g, x, y, kind) {
  if (kind === 'shuttle') {
    // 셔틀콕
    P(g, x + 5, y + 8, 6, 4, '#e8e8e8')
    P(g, x + 6, y + 11, 4, 3, '#d0d0d0')
    for (let i = 0; i < 5; i++) P(g, x + 2 + i * 2, y + 1 + Math.abs(2 - i), 2, 7 - Math.abs(2 - i), '#ffffff')
    P(g, x + 5, y + 12, 6, 1, '#b0b0b0')
  } else if (kind === 'racket') {
    P(g, x + 4, y + 1, 8, 9, '#f0b429')
    P(g, x + 5, y + 2, 6, 7, '#2a3550')
    for (let i = 1; i < 6; i += 2) P(g, x + 5 + i, y + 2, 1, 7, '#8fa0c8')
    for (let i = 1; i < 7; i += 2) P(g, x + 5, y + 2 + i, 6, 1, '#8fa0c8')
    P(g, x + 7, y + 10, 2, 5, '#f0b429')
  } else if (kind === 'heal') {
    P(g, x + 6, y + 2, 4, 12, '#ffffff')
    P(g, x + 2, y + 6, 12, 4, '#ffffff')
  } else if (kind === 'star') {
    const pts = [[7, 1], [6, 3], [8, 3], [4, 5], [10, 5], [3, 7], [11, 7], [5, 9], [9, 9], [4, 12], [10, 12]]
    P(g, x + 3, y + 4, 10, 5, '#ffd84a')
    P(g, x + 6, y + 1, 4, 4, '#ffd84a')
    P(g, x + 4, y + 8, 3, 5, '#ffd84a')
    P(g, x + 9, y + 8, 3, 5, '#ffd84a')
    pts.forEach(([px, py]) => dot(g, x + px, y + py, '#fff1a8'))
  } else if (kind === 'home') {
    P(g, x + 2, y + 7, 12, 8, '#f0e0c0')
    for (let i = 0; i < 7; i++) P(g, x + 8 - i - 1, y + 6 - i + 5, (i + 1) * 2, 1, '#c07048')
    P(g, x + 6, y + 10, 4, 5, '#8a5a3a')
  }
}

/**
 * 가게 건물 한 채.
 * opts: { w,h(타일), roofC, wallC, sign, doorX }
 */
function makeBuilding(g, t, o) {
  const W = o.w * TILE
  const H = o.h * TILE
  const rh = Math.floor(H * 0.42)
  // 그림자
  P(g, 2, H - 3, W - 4, 3, 'rgba(0,0,0,.18)')
  // 벽
  P(g, 2, rh - 4, W - 4, H - rh + 2, o.wallC)
  P(g, 2, rh - 4, 3, H - rh + 2, shade(o.wallC, 16))
  P(g, W - 5, rh - 4, 3, H - rh + 2, shade(o.wallC, -18))
  P(g, 2, H - 5, W - 4, 3, shade(o.wallC, -28))
  // 지붕 (벽보다 넓게 튀어나오게)
  roof(g, 0, 2, W, rh, o.roofC)
  P(g, 2, 0, W - 4, 3, shade(o.roofC, 34)) // 용마루
  P(g, 0, rh + 1, W, 2, shade(o.roofC, -38))
  P(g, 2, rh + 3, W - 4, 2, 'rgba(0,0,0,.16)') // 처마 그늘
  // 간판판
  const sw = Math.min(W - 20, 42)
  const sx = Math.floor((W - sw) / 2)
  const sy = rh + 4
  P(g, sx - 2, sy - 2, sw + 4, 22, shade(o.roofC, -40))
  P(g, sx, sy, sw, 18, '#f6f2e4')
  emblem(g, sx + Math.floor(sw / 2) - 8, sy + 1, o.sign)
  // 창문
  const wy = sy + 24
  if (wy + 12 < H - 22) {
    window9(g, 8, wy, 14, 12)
    window9(g, W - 22, wy, 14, 12)
  }
  // 문 — 포켓몬 상점의 그 자동문 (유리 두 짝 + 위쪽 표시등)
  const dcx = ((o.doorX ?? Math.floor(o.w / 2)) + 0.5) * TILE
  const dw = 20
  const dx = Math.round(dcx - dw / 2)
  const dTop = H - 30
  P(g, dx - 1, dTop, dw + 2, 28, '#33384a')       // 문틀
  P(g, dx, dTop + 1, dw, 5, shade(o.roofC, -14))  // 상단 표시등 판
  for (let i = 0; i < 3; i++) P(g, dx + 4 + i * 5, dTop + 2, 3, 2, '#ffe066')
  P(g, dx + 1, dTop + 7, dw - 2, 19, '#8fd8f8')   // 유리
  P(g, dx + dw / 2 - 1, dTop + 7, 2, 19, '#33384a') // 가운데 문설주
  // 유리에 비친 빛
  for (let i = 0; i < 4; i++) {
    P(g, dx + 2 + i, dTop + 9 + i, 3, 1, '#d6f2ff')
    P(g, dx + dw / 2 + 2 + i, dTop + 12 + i, 3, 1, '#c2ecff')
  }
  P(g, dx + 1, dTop + 25, dw - 2, 1, '#5a6070')
  // 계단
  P(g, dx - 4, H - 4, dw + 8, 4, '#d6d2c6')
  P(g, dx - 4, H - 4, dw + 8, 1, '#efece2')
  P(g, dx - 2, H - 1, dw + 4, 1, 'rgba(0,0,0,.2)')
}

// -----------------------------------------------------------------------------------
// 오브젝트 등록표
//   w,h        : 타일 크기
//   solidRows  : 아래에서 몇 줄이 막히는지 (0 이면 안 막힘)
//   drawW/drawH: 실제 그림 크기(픽셀). 없으면 w*16, h*16
// -----------------------------------------------------------------------------------
export const OBJECTS = {
  tree: { w: 2, h: 3, solidRows: 1, draw: oTree },
  pine: { w: 2, h: 3, solidRows: 1, draw: oPine },
  bush: { w: 1, h: 1, solidRows: 1, draw: oBush },
  rock: { w: 1, h: 1, solidRows: 1, draw: oRock },
  sign: { w: 1, h: 1, solidRows: 1, draw: oSign },
  lamp: { w: 1, h: 2, solidRows: 1, draw: oLamp },
  bench: { w: 2, h: 1, solidRows: 1, draw: oBench, drawH: 19 },
  fence: { w: 1, h: 1, solidRows: 1, draw: oFence },
  vending: { w: 1, h: 2, solidRows: 1, draw: oVending },
  counter: { w: 2, h: 1, solidRows: 1, draw: oCounter, drawH: 22 },
  shelf: { w: 1, h: 2, solidRows: 2, draw: oShelf },
  plant: { w: 1, h: 2, solidRows: 1, draw: oPlant },
  table: { w: 2, h: 1, solidRows: 1, draw: oTable },
  bed: { w: 2, h: 2, solidRows: 2, draw: oBed },
  tv: { w: 2, h: 1, solidRows: 1, draw: oTv, drawH: 17 },
  pc: { w: 1, h: 1, solidRows: 1, draw: oPc },
  locker: { w: 1, h: 2, solidRows: 2, draw: oLocker },
  machine: { w: 1, h: 2, solidRows: 1, draw: oMachine },
  scoreboard: { w: 3, h: 2, solidRows: 2, draw: oScoreboard },
  court: { w: 5, h: 9, solidRows: 0, flat: true, draw: oCourt },
  // 마을이 자라면 생기는 장식 — 길을 막지 않도록 전부 통과 가능
  flag: { w: 1, h: 2, solidRows: 0, draw: oFlag },
  sakura: { w: 2, h: 3, solidRows: 0, draw: oSakura },
  fountain: { w: 2, h: 2, solidRows: 0, draw: oFountain },

  martBuilding: {
    w: 6, h: 5, solidRows: 5, door: [3, 4],
    draw: (g, t) => makeBuilding(g, t, { w: 6, h: 5, roofC: '#2f6fc0', wallC: '#e8eef6', sign: 'shuttle', doorX: 3 }),
  },
  centerBuilding: {
    w: 6, h: 5, solidRows: 5, door: [3, 4],
    draw: (g, t) => makeBuilding(g, t, { w: 6, h: 5, roofC: '#f06888', wallC: '#fbf2ea', sign: 'heal', doorX: 3 }),
  },
  gymBuilding: {
    w: 7, h: 6, solidRows: 6, door: [3, 5],
    draw: (g, t) => makeBuilding(g, t, { w: 7, h: 6, roofC: '#3c4674', wallC: '#dfe4f0', sign: 'racket', doorX: 3 }),
  },
  homeBuilding: {
    w: 5, h: 5, solidRows: 5, door: [2, 4],
    draw: (g, t) => makeBuilding(g, t, { w: 5, h: 5, roofC: '#c07048', wallC: '#f0e0c4', sign: 'home', doorX: 2 }),
  },
  arcadeBuilding: {
    w: 5, h: 5, solidRows: 5, door: [2, 4],
    draw: (g, t) => makeBuilding(g, t, { w: 5, h: 5, roofC: '#8850d8', wallC: '#efe6fb', sign: 'star', doorX: 2 }),
  },
}

// -----------------------------------------------------------------------------------
// 굽기(캐시)
// -----------------------------------------------------------------------------------
const objCache = new Map()

/** 오브젝트 스프라이트 한 장 (테마·변형별로 한 번만 굽는다) */
export function objectSprite(kind, theme, variant = 0) {
  const key = `${kind}|${theme.id}|${variant}`
  const hit = objCache.get(key)
  if (hit) return hit
  const def = OBJECTS[kind]
  if (!def) return null
  const w = def.drawW || def.w * TILE
  const h = def.drawH || def.h * TILE
  const { c, g } = makeCanvas(w, h)
  def.draw(g, theme, variant)
  objCache.set(key, c)
  return c
}

// 잔디가 길 위로 자라 나오는 경계 처리 — 이 한 겹이 지도를 확 살린다
const GRASSY = new Set(['.', ',', '"'])
const HARD = new Set(['=', '_', 's'])

function drawFringe(g, rows, theme, x, y) {
  const p = theme.ground
  const at = (xx, yy) => rows[yy]?.[xx]
  const ox = x * TILE
  const oy = y * TILE
  const c1 = p.grass[0]
  const c2 = p.grassDark

  // 위쪽이 잔디 → 잔디가 길 위로 늘어진다
  if (GRASSY.has(at(x, y - 1))) {
    for (let i = 0; i < TILE; i++) {
      const h = 1 + Math.floor(hash2(x * 16 + i, y, 201) * 3)
      P(g, ox + i, oy, 1, h, i % 3 ? c1 : c2)
    }
  }
  if (GRASSY.has(at(x, y + 1))) {
    for (let i = 0; i < TILE; i++) {
      const h = 1 + Math.floor(hash2(x * 16 + i, y, 202) * 2)
      P(g, ox + i, oy + TILE - h, 1, h, i % 3 ? c1 : c2)
    }
  }
  if (GRASSY.has(at(x - 1, y))) {
    for (let i = 0; i < TILE; i++) {
      const wq = 1 + Math.floor(hash2(x, y * 16 + i, 203) * 2)
      P(g, ox, oy + i, wq, 1, i % 3 ? c1 : c2)
    }
  }
  if (GRASSY.has(at(x + 1, y))) {
    for (let i = 0; i < TILE; i++) {
      const wq = 1 + Math.floor(hash2(x, y * 16 + i, 204) * 2)
      P(g, ox + TILE - wq, oy + i, wq, 1, i % 3 ? c1 : c2)
    }
  }
}

/**
 * 지도의 바닥을 통째로 큰 캔버스에 굽는다.
 * 물결 때문에 프레임 2장을 만들어 번갈아 쓴다.
 * opts.lights — 실내 창문에서 들어오는 빛 [x, y, w, h] (타일 단위)
 */
export function bakeGround(rows, theme, opts = {}) {
  const h = rows.length
  const w = rows[0].length
  const frames = []
  for (let f = 0; f < 2; f++) {
    const { c, g } = makeCanvas(w * TILE, h * TILE)
    const { c: cell, g: cg } = makeCanvas(TILE, TILE)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const ch = rows[y][x]
        const def = TILES[ch] || TILES['.']
        cg.clearRect(0, 0, TILE, TILE)
        def.draw(cg, theme, x, y, f)
        g.drawImage(cell, x * TILE, y * TILE)
      }
    }
    // 길 위로 잔디가 삐져나오는 경계
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (HARD.has(rows[y][x])) drawFringe(g, rows, theme, x, y)
      }
    }
    // 실내 채광 — 창문에서 들어온 빛이 바닥에 깔린다
    ;(opts.lights || []).forEach(([lx, ly, lw, lh]) => {
      const grd = g.createLinearGradient(0, ly * TILE, 0, (ly + lh) * TILE)
      grd.addColorStop(0, 'rgba(255,246,214,.34)')
      grd.addColorStop(1, 'rgba(255,246,214,0)')
      g.fillStyle = grd
      g.beginPath()
      g.moveTo(lx * TILE, ly * TILE)
      g.lineTo((lx + lw) * TILE, ly * TILE)
      g.lineTo((lx + lw + 1) * TILE, (ly + lh) * TILE)
      g.lineTo((lx - 1) * TILE, (ly + lh) * TILE)
      g.closePath()
      g.fill()
    })
    frames.push(c)
  }
  return frames
}

export function clearTileCache() {
  objCache.clear()
}
