// ===================================================================================
// 셔틀몬스터 — 픽셀 타일 & 오브젝트 (32px 고해상도)
//
// 옛날 게임보이 도트가 아니라, 스타듀밸리·최신 2D 닌텐도 게임처럼
// 「2D인데 입체로 보이는」 그림을 목표로 한다. 그러기 위해 세 가지를 지킨다.
//
//  ① 재질마다 명암 5단계 — 하이라이트 / 밝은면 / 기본 / 그늘 / 깊은그늘
//  ② 접지 그림자(AO) — 물건이 바닥에 닿는 자리는 반드시 어둡게
//  ③ 입체 투시 — 건물은 지붕 경사 + 정면 벽 + 측면을 함께 보여 준다
//
// 외부 이미지는 여전히 한 장도 쓰지 않는다. 전부 fillRect 로 찍어 굽는다.
// ===================================================================================

export const TILE = 32

// -----------------------------------------------------------------------------------
// 픽셀 · 색 유틸
// -----------------------------------------------------------------------------------
const P = (g, x, y, w, h, c) => {
  g.fillStyle = c
  g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h))
}
const dot = (g, x, y, c) => P(g, x, y, 1, 1, c)

/** 좌표를 씨앗으로 항상 같은 무늬가 나오게 */
export function hash2(x, y, salt = 0) {
  let h = (x * 374761393 + y * 668265263 + salt * 2246822519) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

export function shade(hex, amt) {
  if (!hex || hex[0] !== '#') return hex
  const n = parseInt(hex.slice(1), 16)
  const cl = (v) => Math.max(0, Math.min(255, Math.round(v)))
  const r = cl(((n >> 16) & 255) + amt)
  const g = cl(((n >> 8) & 255) + amt)
  const b = cl((n & 255) + amt)
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}

/** 색 하나 → 명암 5단계. 밝은 쪽은 노랗게, 어두운 쪽은 푸르게 기울여 공기감을 준다 */
export function ramp(hex) {
  const n = parseInt(hex.slice(1), 16)
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255
  const mk = (dr, dg, db) => {
    const cl = (v) => Math.max(0, Math.min(255, Math.round(v)))
    return `#${((cl(r + dr) << 16) | (cl(g + dg) << 8) | cl(b + db)).toString(16).padStart(6, '0')}`
  }
  return {
    hi2: mk(46, 44, 26),
    hi: mk(24, 23, 12),
    base: hex,
    lo: mk(-24, -22, -12),
    lo2: mk(-50, -46, -26),
    deep: mk(-78, -72, -46),
  }
}

function makeCanvas(w, h) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const g = c.getContext('2d')
  g.imageSmoothingEnabled = false
  return { c, g }
}

/** 접지 그림자 — 물건이 바닥에 닿는 자리 (부드럽게 퍼지는 타원) */
function contactShadow(g, cx, cy, rx, ry, alpha = 0.3) {
  for (let i = 3; i >= 1; i--) {
    g.fillStyle = `rgba(16,20,34,${(alpha / 3) * i * 0.55})`
    g.beginPath()
    g.ellipse(cx, cy, rx * (i / 3), ry * (i / 3), 0, 0, Math.PI * 2)
    g.fill()
  }
}

/** 덩어리 하나 (나뭇잎 뭉치 등) */
function blob(g, cx, cy, r, c) {
  for (let y = -r; y <= r; y++) {
    const w = Math.round(Math.sqrt(Math.max(0, r * r - y * y)))
    if (w > 0) P(g, cx - w, cy + y, w * 2, 1, c)
  }
}

// -----------------------------------------------------------------------------------
// 바닥 타일 — 32x32
// -----------------------------------------------------------------------------------

/** 잔디 — 밑색 위에 풀잎을 심고, 군데군데 마른 풀과 잔돌을 섞는다 */
function tGrass(g, t, x, y) {
  const p = t.ground
  const r0 = ramp(p.grass[Math.floor(hash2(x, y, 1) * p.grass.length)])
  P(g, 0, 0, TILE, TILE, r0.base)

  // 볕에 마른 황록 얼룩 — 타일 경계에 딱 맞지 않게, 칸을 넘나들며 자연스럽게 퍼진다
  if (p.grassAlt) {
    const cell = hash2(x >> 1, y >> 1, 900)
    if (cell > 0.66) {
      const alt = ramp(p.grassAlt[Math.floor(hash2(x >> 1, y >> 1, 901) * p.grassAlt.length)])
      for (let i = 0; i < 5; i++) {
        const bx = Math.floor(hash2(x, y, 910 + i) * 40) - 8
        const by = Math.floor(hash2(x, y, 920 + i) * 40) - 8
        const bw = 10 + Math.floor(hash2(x, y, 930 + i) * 16)
        const bh = 8 + Math.floor(hash2(x, y, 940 + i) * 14)
        P(g, bx, by, bw, bh, alt.base)
        P(g, bx, by, bw, 2, alt.hi)
      }
    }
  }

  // 아주 옅은 명암 얼룩 — 평평해 보이지 않을 만큼만
  for (let i = 0; i < 2; i++) {
    const bx = Math.floor(hash2(x, y, 20 + i) * 22)
    const by = Math.floor(hash2(x, y, 30 + i) * 24)
    const w = 8 + Math.floor(hash2(x, y, 40 + i) * 10)
    P(g, bx, by, w, 3, i % 2 ? r0.hi : r0.lo)
  }
  // 풀잎 — 촘촘하고 가늘게
  for (let i = 0; i < 30; i++) {
    const r = hash2(x, y, 60 + i)
    const bx = Math.floor(r * 31)
    const by = Math.floor(hash2(x, y, 90 + i) * 29)
    const h = 2 + Math.floor(hash2(x, y, 120 + i) * 3)
    const c = r > 0.78 ? r0.hi2 : r > 0.52 ? r0.hi : r0.lo
    P(g, bx, by, 1, h, c)
  }
  // 잔돌 · 마른 잎
  if (hash2(x, y, 200) > 0.82) {
    const bx = 6 + Math.floor(hash2(x, y, 201) * 18)
    const by = 6 + Math.floor(hash2(x, y, 202) * 18)
    P(g, bx, by, 3, 2, '#9c9482')
    P(g, bx, by, 2, 1, '#c0b8a4')
    P(g, bx, by + 2, 3, 1, 'rgba(16,20,34,.22)')
  }
}

/** 꽃밭 — 잔디 위에 작은 들꽃 몇 송이 */
function tFlower(g, t, x, y) {
  tGrass(g, t, x, y)
  const sets = [
    ['#ff7ba8', '#ffb3cd', '#ffd84a'],
    ['#ffe066', '#fff2ae', '#e8a13a'],
    ['#ffffff', '#e8f0ff', '#ffd84a'],
    ['#a88cff', '#cdbcff', '#ffe9a8'],
  ]
  const n = 2 + Math.floor(hash2(x, y, 3) * 2)
  for (let k = 0; k < n; k++) {
    const [c1, c2, cc] = sets[Math.floor(hash2(x, y, 4 + k) * sets.length)]
    const cx = 6 + Math.floor(hash2(x, y, 10 + k) * 20)
    const cy = 6 + Math.floor(hash2(x, y, 20 + k) * 20)
    P(g, cx, cy - 3, 3, 3, c1)
    P(g, cx, cy + 3, 3, 3, c1)
    P(g, cx - 3, cy, 3, 3, c1)
    P(g, cx + 3, cy, 3, 3, c1)
    P(g, cx, cy - 3, 2, 1, c2)
    P(g, cx - 3, cy, 1, 2, c2)
    P(g, cx, cy, 3, 3, cc)
    P(g, cx + 1, cy + 4, 1, 3, '#3f8a46')
  }
}

/** 풀숲 — 밟으면 사각사각할 것 같은 무성한 수풀 */
function tTall(g, t, x, y) {
  const p = t.ground
  const r0 = ramp(p.grassDark)
  P(g, 0, 0, TILE, TILE, r0.lo)
  const g1 = ramp(p.grass[0])
  for (let i = 0; i < 5; i++) {
    const bx = i * 6 + 1
    const off = Math.floor(hash2(x, y, 60 + i) * 3)
    // 잎 다발
    P(g, bx, 12 + off, 5, 18, g1.lo)
    P(g, bx, 12 + off, 3, 18, g1.base)
    P(g, bx + 1, 5 + off, 3, 9, g1.hi)
    P(g, bx + 1, 5 + off, 1, 7, g1.hi2)
    P(g, bx + 4, 15 + off, 1, 12, r0.lo2)
  }
  // 아래쪽 그늘
  P(g, 0, 27, TILE, 5, 'rgba(16,20,34,.26)')
  P(g, 0, 30, TILE, 2, 'rgba(16,20,34,.3)')
}

/** 흙길 — 따뜻한 모래흙. 자갈과 발자국 결이 보인다 */
function tDirt(g, t, x, y) {
  const p = t.ground
  const r0 = ramp(p.dirt[Math.floor(hash2(x, y, 7) * p.dirt.length)])
  P(g, 0, 0, TILE, TILE, r0.base)
  // 결
  for (let i = 0; i < 5; i++) {
    const bx = Math.floor(hash2(x, y, 70 + i) * 24)
    const by = Math.floor(hash2(x, y, 80 + i) * 30)
    P(g, bx, by, 5 + Math.floor(hash2(x, y, 85 + i) * 7), 2, i % 2 ? r0.hi : r0.lo)
  }
  // 자갈
  for (let i = 0; i < 7; i++) {
    const bx = Math.floor(hash2(x, y, 100 + i) * 30)
    const by = Math.floor(hash2(x, y, 110 + i) * 30)
    const s = hash2(x, y, 120 + i)
    if (s > 0.55) {
      P(g, bx, by, 2, 2, r0.lo2)
      dot(g, bx, by, r0.hi2)
    } else {
      dot(g, bx, by, r0.lo)
    }
  }
}

/** 보도블록 — 벽돌 사이 홈에 그늘이 들어가 입체로 보인다 */
function tBrick(g, t, x, y) {
  const p = t.ground
  const grout = shade(p.brickLine, -14)
  P(g, 0, 0, TILE, TILE, grout)
  for (let qy = 0; qy < 2; qy++) {
    for (let qx = 0; qx < 2; qx++) {
      const c = p.brick[Math.floor(hash2(x * 2 + qx, y * 2 + qy, 9) * p.brick.length)]
      const r0 = ramp(c)
      const ox = qx * 16
      const oy = qy * 16
      P(g, ox + 1, oy + 1, 14, 14, r0.base)
      if (hash2(x * 2 + qx, y * 2 + qy, 300) > 0.7) P(g, ox + 3, oy + 4, 8, 6, r0.lo)
      P(g, ox + 1, oy + 1, 14, 2, r0.hi)   // 윗면 빛
      P(g, ox + 1, oy + 1, 2, 14, r0.hi)
      P(g, ox + 1, oy + 13, 14, 2, r0.lo)  // 아랫면 그늘
      P(g, ox + 13, oy + 1, 2, 14, r0.lo)
      // 돌결
      for (let i = 0; i < 3; i++) {
        const bx = ox + 3 + Math.floor(hash2(x * 4 + qx, y * 4 + qy, 130 + i) * 10)
        const by = oy + 3 + Math.floor(hash2(x * 4 + qx, y * 4 + qy, 140 + i) * 10)
        dot(g, bx, by, r0.lo2)
      }
    }
  }
  // 홈의 깊은 그늘
  P(g, 0, 0, TILE, 1, 'rgba(16,20,34,.2)')
  P(g, 0, 16, TILE, 1, 'rgba(16,20,34,.2)')
  P(g, 0, 0, 1, TILE, 'rgba(16,20,34,.2)')
  P(g, 16, 0, 1, TILE, 'rgba(16,20,34,.2)')
}

/** 모래 */
function tSand(g, t, x, y) {
  const p = t.ground
  const r0 = ramp(p.sand[Math.floor(hash2(x, y, 11) * p.sand.length)])
  P(g, 0, 0, TILE, TILE, r0.base)
  for (let i = 0; i < 4; i++) {
    P(g, Math.floor(hash2(x, y, 130 + i) * 24), Math.floor(hash2(x, y, 140 + i) * 28), 8, 2, r0.hi)
  }
  for (let i = 0; i < 14; i++) {
    dot(g, Math.floor(hash2(x, y, 150 + i) * 32), Math.floor(hash2(x, y, 170 + i) * 32), i % 3 ? r0.lo : r0.hi2)
  }
}

/** 물 — 깊이감 있는 파랑에 물결과 반짝임 */
function tWater(g, t, x, y, frame) {
  const p = t.ground
  const deep = ramp(p.water[0])
  const shallow = ramp(p.water[1])
  P(g, 0, 0, TILE, TILE, deep.base)
  P(g, 0, 0, TILE, 18, shallow.base)
  P(g, 0, 14, TILE, 5, shallow.lo)
  // 물결
  const s = frame ? 6 : 0
  for (let i = 0; i < 4; i++) {
    const wy = 3 + i * 8 + Math.floor(hash2(x, y, 170 + i) * 3)
    const wx = ((Math.floor(hash2(x, y, 180 + i) * 20) + s) % 26) + 1
    P(g, wx, wy, 8, 2, p.waterFoam)
    P(g, wx + 2, wy + 1, 5, 1, '#ffffff')
    P(g, wx + 10, wy + 3, 4, 1, p.waterFoam)
  }
  // 반짝임
  if (hash2(x, y, 190) > 0.6) {
    const bx = 4 + Math.floor(hash2(x, y, 191) * 22)
    const by = 4 + Math.floor(hash2(x, y, 192) * 22)
    P(g, bx, by + (frame ? 1 : 0), 3, 1, '#ffffff')
    P(g, bx + 1, by - 1 + (frame ? 1 : 0), 1, 3, '#ffffff')
  }
  P(g, 0, TILE - 2, TILE, 2, deep.lo2)
}

/** 실내 마루 — 널판에 나뭇결과 옹이, 이음새 그늘 */
function tWood(g, t, x, y) {
  const p = t.ground
  const c = p.floor[(y + (x >> 2)) % p.floor.length]
  const r0 = ramp(c)
  P(g, 0, 0, TILE, TILE, r0.base)
  // 널판 두 줄
  for (let k = 0; k < 2; k++) {
    const oy = k * 16
    P(g, 0, oy, TILE, 1, r0.hi)
    P(g, 0, oy + 14, TILE, 2, r0.lo2)
    P(g, 0, oy + 13, TILE, 1, r0.lo)
    // 나뭇결
    for (let i = 0; i < 4; i++) {
      const gy = oy + 2 + Math.floor(hash2(x, y * 2 + k, 190 + i) * 10)
      const gx = Math.floor(hash2(x, y * 2 + k, 200 + i) * 20)
      P(g, gx, gy, 8 + Math.floor(hash2(x, y, 210 + i) * 10), 1, r0.lo)
    }
    // 옹이
    if (hash2(x, y * 2 + k, 220) > 0.78) {
      const kx = 6 + Math.floor(hash2(x, y * 2 + k, 221) * 18)
      P(g, kx, oy + 5, 4, 3, r0.lo2)
      P(g, kx + 1, oy + 6, 2, 1, ramp(c).deep)
    }
  }
  // 세로 이음새
  const seam = (x * 7 + y * 5) % 30
  P(g, seam, 0, 1, 15, r0.lo2)
  P(g, seam + 1, 0, 1, 15, r0.hi)
  P(g, (seam + 17) % 30, 16, 1, 15, r0.lo2)
}

/** 실내 타일 바닥 — 광택 있는 정사각 타일 */
function tTileFloor(g, t, x, y) {
  const p = t.ground
  const a = ramp(p.floor[0])
  const b = ramp(p.floor[1])
  for (let qy = 0; qy < 2; qy++) {
    for (let qx = 0; qx < 2; qx++) {
      const r0 = (x + y + qx + qy) % 2 ? a : b
      const ox = qx * 16
      const oy = qy * 16
      P(g, ox, oy, 16, 16, r0.base)
      P(g, ox, oy, 16, 1, r0.hi2)
      P(g, ox, oy, 1, 16, r0.hi)
      P(g, ox, oy + 15, 16, 1, r0.lo2)
      P(g, ox + 15, oy, 1, 16, r0.lo)
      // 광택
      P(g, ox + 2, oy + 2, 5, 1, r0.hi2)
      P(g, ox + 2, oy + 3, 3, 1, r0.hi2)
    }
  }
}

/** 카펫 — 짜임과 술이 보이는 융단 */
function tCarpet(g, t, x, y) {
  const r0 = ramp(t.ground.accent)
  P(g, 0, 0, TILE, TILE, r0.base)
  for (let i = 0; i < TILE; i += 4) {
    P(g, i, 0, 2, TILE, (x * 8 + i) % 8 ? r0.hi : r0.lo)
    P(g, 0, i, TILE, 1, (y * 8 + i) % 8 ? r0.lo : r0.hi)
  }
  // 가운데 마름모 무늬
  for (let i = 0; i < 8; i++) {
    P(g, 16 - i, 8 + i, i * 2, 1, r0.hi2)
    P(g, 16 - i, 23 - i, i * 2, 1, r0.hi2)
  }
  P(g, 12, 14, 8, 4, r0.lo2)
}

/** 체육관 마루 — 반들반들한 우드 코트 */
function tGymFloor(g, t, x, y) {
  const p = t.ground
  const c = p.floor[(y >> 1) % 2]
  const r0 = ramp(c)
  P(g, 0, 0, TILE, TILE, r0.base)
  P(g, 0, 0, TILE, 2, r0.hi)
  P(g, 0, TILE - 2, TILE, 2, r0.lo2)
  for (let i = 0; i < 5; i++) {
    P(g, Math.floor(hash2(x, y, 230 + i) * 20), 3 + i * 6, 14, 1, r0.lo)
  }
  P(g, ((x * 11) % 30), 0, 1, TILE, r0.lo2)
  // 조명 반사
  P(g, 4, 4, 10, 2, r0.hi2)
  P(g, 4, 6, 5, 1, r0.hi2)
}

/** 실내 벽 — 아랫단 (굽도리 + 벽 그늘) */
function tWallBot(g, t) {
  const p = t.ground
  const r0 = ramp(p.wall)
  const rl = ramp(p.wallLo)
  P(g, 0, 0, TILE, TILE, r0.base)
  P(g, 0, 0, TILE, 3, rl.lo2)     // 위쪽 벽에서 떨어지는 그늘
  P(g, 0, 3, TILE, 2, 'rgba(16,20,34,.14)')
  P(g, 0, 20, TILE, 12, rl.base)  // 굽도리
  P(g, 0, 20, TILE, 2, rl.hi)
  P(g, 0, 29, TILE, 3, rl.lo2)
  P(g, 0, 30, TILE, 2, 'rgba(16,20,34,.28)')
}

/** 실내 벽 — 윗단 (벽지 무늬) */
function tWallTop(g, t, x, y) {
  const p = t.ground
  const r0 = ramp(p.wall)
  P(g, 0, 0, TILE, TILE, r0.base)
  P(g, 0, 0, TILE, 2, r0.hi)
  P(g, 0, 12, TILE, 3, r0.lo)
  P(g, 0, 15, TILE, 1, r0.hi)
  for (let i = 0; i < TILE; i += 8) {
    P(g, i + ((x + y) % 2 ? 2 : 6), 20, 2, 8, r0.lo)
    P(g, i + ((x + y) % 2 ? 2 : 6), 20, 1, 8, r0.hi)
  }
  P(g, 0, TILE - 2, TILE, 2, ramp(p.wallLo).lo)
}

/** 문 앞 매트 */
function tMat(g, t) {
  const a = ramp(t.ground.accent)
  P(g, 0, 0, TILE, TILE, '#5c554b')
  P(g, 0, 4, TILE, 24, '#403a33')
  P(g, 1, 5, 30, 22, '#4e473e')
  for (let i = 3; i < 30; i += 4) P(g, i, 7, 2, 18, '#38322c')
  P(g, 1, 4, 30, 2, a.lo)
  P(g, 1, 26, 30, 2, a.deep)
  P(g, 0, 28, TILE, 4, 'rgba(16,20,34,.2)')
}

function tVoid(g) {
  P(g, 0, 0, TILE, TILE, '#0b0f1a')
}

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
// 오브젝트
// -----------------------------------------------------------------------------------

function oTree(g, t, seed) {
  const p = t.ground
  const trunk = ramp(p.trunk)
  const leaf = ramp(p.leaf)
  const W = 64, H = 96
  contactShadow(g, 32, 90, 24, 7, 0.34)
  // 줄기
  P(g, 26, 58, 12, 34, trunk.base)
  P(g, 26, 58, 4, 34, trunk.hi)
  P(g, 34, 58, 4, 34, trunk.lo2)
  for (let i = 0; i < 6; i++) {
    P(g, 28 + Math.floor(hash2(seed, i, 1) * 8), 62 + i * 5, 2, 4, trunk.lo)
  }
  // 뿌리
  P(g, 20, 86, 24, 6, trunk.lo)
  P(g, 20, 86, 8, 3, trunk.base)
  P(g, 38, 88, 6, 3, trunk.lo2)
  // 잎 — 뒤쪽 어두운 덩어리부터 앞쪽 밝은 덩어리 순으로 겹친다
  blob(g, 32, 40, 27, leaf.lo2)
  blob(g, 32, 36, 25, leaf.lo)
  blob(g, 28, 32, 21, leaf.base)
  blob(g, 22, 26, 13, leaf.hi)
  blob(g, 40, 30, 12, leaf.hi)
  blob(g, 24, 20, 8, leaf.hi2)
  // 잎 알갱이
  for (let i = 0; i < 60; i++) {
    const a = hash2(seed, i, 5) * Math.PI * 2
    const rr = 6 + hash2(seed, i, 6) * 22
    const px = 32 + Math.cos(a) * rr
    const py = 36 + Math.sin(a) * rr * 0.92
    const s = hash2(seed, i, 7)
    P(g, px, py, 2, 2, s > 0.72 ? leaf.hi2 : s > 0.4 ? leaf.hi : leaf.lo2)
  }
  // 아래쪽 그늘
  for (let i = 0; i < 26; i++) {
    const a = Math.PI * (0.15 + (i / 26) * 0.7)
    P(g, 32 + Math.cos(a) * 24 - 1, 36 + Math.sin(a) * 24, 3, 3, leaf.lo2)
  }
}

function oPine(g, t, seed) {
  const p = t.ground
  const trunk = ramp(p.trunk)
  const leaf = ramp(p.leafLo)
  contactShadow(g, 32, 90, 22, 6, 0.34)
  P(g, 28, 68, 8, 24, trunk.base)
  P(g, 28, 68, 3, 24, trunk.hi)
  P(g, 20, 88, 24, 5, trunk.lo)
  for (let i = 0; i < 5; i++) {
    const yy = 10 + i * 15
    const w = 8 + i * 6
    P(g, 32 - w, yy + 12, w * 2, 12, leaf.lo2)
    P(g, 32 - w + 2, yy + 7, w * 2 - 4, 9, leaf.base)
    P(g, 32 - w + 6, yy + 4, w - 2, 6, leaf.hi)
    P(g, 32 - w + 6, yy + 4, 4, 4, leaf.hi2)
  }
  P(g, 29, 2, 6, 12, leaf.base)
  P(g, 29, 2, 2, 10, leaf.hi)
}

function oBush(g, t, seed) {
  const p = t.ground
  const leaf = ramp(p.leaf)
  contactShadow(g, 16, 29, 13, 4, 0.3)
  blob(g, 16, 19, 14, leaf.lo2)
  blob(g, 16, 17, 12, leaf.base)
  blob(g, 11, 13, 7, leaf.hi)
  blob(g, 21, 15, 5, leaf.hi)
  for (let i = 0; i < 22; i++) {
    const a = hash2(seed, i, 2) * Math.PI * 2
    const rr = 3 + hash2(seed, i, 3) * 11
    P(g, 16 + Math.cos(a) * rr, 17 + Math.sin(a) * rr * 0.9, 2, 2, hash2(seed, i, 4) > 0.6 ? leaf.hi2 : leaf.lo2)
  }
  // 열매
  for (let i = 0; i < 3; i++) {
    const bx = 5 + Math.floor(hash2(seed, i, 8) * 22)
    const by = 9 + Math.floor(hash2(seed, i, 9) * 14)
    P(g, bx, by, 3, 3, '#e03a3a')
    dot(g, bx, by, '#ff8a8a')
  }
}

function oRock(g) {
  contactShadow(g, 16, 29, 12, 4, 0.32)
  const r0 = ramp('#9aa0a8')
  P(g, 5, 12, 22, 16, r0.base)
  P(g, 7, 9, 18, 6, r0.hi)
  P(g, 10, 6, 11, 5, r0.hi2)
  P(g, 5, 24, 22, 4, r0.lo2)
  P(g, 20, 12, 7, 16, r0.lo)
  // 갈라진 결
  P(g, 12, 13, 2, 9, r0.lo2)
  P(g, 14, 20, 5, 2, r0.lo2)
  P(g, 9, 11, 4, 2, r0.hi2)
}

function oSign(g) {
  contactShadow(g, 16, 30, 10, 3, 0.3)
  const wood = ramp('#b9834b')
  const board = ramp('#e6c48d')
  P(g, 14, 18, 5, 13, wood.lo)
  P(g, 14, 18, 2, 13, wood.base)
  P(g, 3, 3, 26, 17, wood.lo2)
  P(g, 5, 5, 22, 13, board.base)
  P(g, 5, 5, 22, 2, board.hi)
  P(g, 5, 16, 22, 2, board.lo)
  for (let i = 0; i < 3; i++) P(g, 8, 8 + i * 3, 14 - i * 4, 2, wood.lo)
  P(g, 3, 19, 26, 2, 'rgba(16,20,34,.28)')
}

function oLamp(g) {
  contactShadow(g, 16, 61, 11, 4, 0.34)
  const m = ramp('#4a5060')
  P(g, 12, 16, 8, 46, m.base)
  P(g, 12, 16, 3, 46, m.hi)
  P(g, 18, 16, 2, 46, m.lo2)
  P(g, 8, 58, 16, 5, m.lo)
  P(g, 8, 58, 16, 2, m.base)
  // 등
  P(g, 5, 3, 22, 16, m.lo2)
  P(g, 7, 5, 18, 12, '#ffe9a8')
  P(g, 8, 6, 8, 6, '#fffdf0')
  P(g, 7, 14, 18, 3, '#e8c878')
  P(g, 3, 1, 26, 4, m.base)
  P(g, 3, 1, 26, 2, m.hi)
  // 불빛 번짐
  g.fillStyle = 'rgba(255,224,140,.18)'
  g.beginPath(); g.ellipse(16, 11, 18, 14, 0, 0, Math.PI * 2); g.fill()
}

function oBench(g) {
  contactShadow(g, 32, 36, 26, 4, 0.3)
  const w = ramp('#c08a52')
  const m = ramp('#6b6f78')
  P(g, 3, 16, 58, 8, w.base)
  P(g, 3, 16, 58, 2, w.hi2)
  P(g, 3, 22, 58, 2, w.lo2)
  P(g, 3, 5, 58, 8, w.base)
  P(g, 3, 5, 58, 2, w.hi2)
  P(g, 3, 11, 58, 2, w.lo2)
  P(g, 8, 24, 5, 12, m.base)
  P(g, 51, 24, 5, 12, m.base)
  P(g, 8, 24, 2, 12, m.hi)
  P(g, 51, 24, 2, 12, m.hi)
}

function oFence(g) {
  const w = ramp('#d8b98a')
  const post = ramp('#b9834b')
  contactShadow(g, 16, 30, 12, 3, 0.24)
  P(g, 0, 10, TILE, 6, w.base)
  P(g, 0, 10, TILE, 2, w.hi)
  P(g, 0, 20, TILE, 6, w.base)
  P(g, 0, 20, TILE, 2, w.hi)
  P(g, 4, 4, 6, 26, post.base)
  P(g, 22, 4, 6, 26, post.base)
  P(g, 4, 4, 2, 26, post.hi)
  P(g, 22, 4, 2, 26, post.hi)
}

function oVending(g) {
  contactShadow(g, 32, 61, 16, 4, 0.34)
  const body = ramp('#c8342c')
  P(g, 3, 4, 26, 58, body.base)
  P(g, 3, 4, 4, 58, body.hi)
  P(g, 25, 4, 4, 58, body.lo2)
  P(g, 3, 4, 26, 3, body.hi2)
  // 진열창
  P(g, 5, 8, 22, 28, '#20263c')
  P(g, 6, 9, 20, 26, '#2c3550')
  const cans = ['#ffe066', '#7ad0ff', '#8ef08a', '#ff9ec4']
  for (let i = 0; i < 8; i++) {
    P(g, 8 + (i % 4) * 5, 12 + Math.floor(i / 4) * 11, 4, 9, cans[i % 4])
    P(g, 8 + (i % 4) * 5, 12 + Math.floor(i / 4) * 11, 4, 2, '#ffffff')
    P(g, 8 + (i % 4) * 5, 19 + Math.floor(i / 4) * 11, 4, 2, 'rgba(0,0,0,.3)')
  }
  P(g, 6, 9, 20, 3, 'rgba(255,255,255,.22)')
  // 버튼 · 배출구
  P(g, 6, 39, 20, 6, '#f0f0f0')
  for (let i = 0; i < 4; i++) P(g, 8 + i * 5, 41, 3, 3, '#e0524c')
  P(g, 6, 48, 12, 8, '#20263c')
  P(g, 7, 49, 10, 6, '#0d1120')
  P(g, 3, 59, 26, 3, body.deep)
}

// ── 실내 가구 ───────────────────────────────────────────────────────────────────
function oCounter(g, t) {
  const c = ramp(t.ground.accent)
  const wood = ramp('#b98a52')
  contactShadow(g, 32, 42, 30, 4, 0.32)
  // 앞판
  P(g, 2, 16, 60, 26, c.lo2)
  P(g, 4, 18, 56, 22, c.lo)
  for (let i = 6; i < 58; i += 14) {
    P(g, i, 21, 11, 16, c.deep)
    P(g, i, 21, 11, 1, c.base)
  }
  // 상판
  P(g, 0, 10, 64, 8, wood.base)
  P(g, 0, 10, 64, 2, wood.hi2)
  P(g, 0, 16, 64, 2, wood.deep)
  P(g, 0, 17, 64, 1, 'rgba(16,20,34,.3)')
  // 계산대
  P(g, 8, 1, 15, 10, '#e8ecf2')
  P(g, 8, 1, 15, 2, '#ffffff')
  P(g, 10, 3, 11, 5, '#20263c')
  P(g, 11, 4, 5, 2, '#8fa0c8')
  P(g, 8, 9, 15, 2, '#b8bec8')
  // 작은 화분
  P(g, 47, 4, 9, 7, '#8a5a3a')
  P(g, 47, 4, 9, 2, '#a87450')
  blob(g, 51, 2, 6, '#3f9a5c')
  blob(g, 49, 0, 4, '#55b872')
}

function oShelf(g) {
  const m = ramp('#8e96a8')
  contactShadow(g, 16, 62, 14, 4, 0.32)
  P(g, 0, 2, TILE, 60, m.lo2)
  P(g, 2, 4, 28, 56, m.hi)
  P(g, 2, 4, 28, 56, m.base)
  const goods = ['#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff', '#c77dff', '#ff9f45']
  for (let r = 0; r < 4; r++) {
    const sy = 6 + r * 14
    // 선반 판
    P(g, 1, sy + 11, 30, 3, m.lo2)
    P(g, 1, sy + 11, 30, 1, m.hi2)
    for (let i = 0; i < 3; i++) {
      const c = ramp(goods[(r * 3 + i) % goods.length])
      const bx = 3 + i * 9
      P(g, bx, sy, 8, 11, c.base)
      P(g, bx, sy, 3, 11, c.hi)
      P(g, bx + 6, sy, 2, 11, c.lo2)
      P(g, bx, sy, 8, 2, c.hi2)
      P(g, bx, sy + 4, 8, 2, '#ffffff')
      P(g, bx, sy + 9, 8, 2, 'rgba(16,20,34,.25)')
    }
  }
  P(g, 0, 2, 2, 60, m.hi)
  P(g, 30, 2, 2, 60, m.lo2)
}

function oPlant(g) {
  contactShadow(g, 16, 61, 12, 4, 0.32)
  const pot = ramp('#b96a3a')
  const leaf = ramp('#2f7a46')
  P(g, 7, 44, 18, 18, pot.base)
  P(g, 7, 44, 6, 18, pot.hi)
  P(g, 21, 44, 4, 18, pot.lo2)
  P(g, 5, 42, 22, 6, pot.hi)
  P(g, 5, 46, 22, 2, pot.lo)
  P(g, 8, 40, 16, 4, '#4a3a2a')
  blob(g, 16, 28, 15, leaf.lo2)
  blob(g, 16, 26, 13, leaf.base)
  blob(g, 10, 20, 8, leaf.hi)
  blob(g, 22, 22, 7, leaf.hi)
  for (let i = 0; i < 5; i++) P(g, 8 + i * 4, 12 + (i % 2) * 5, 3, 8, leaf.hi2)
}

function oTable(g) {
  const w = ramp('#d8a868')
  contactShadow(g, 32, 32, 28, 4, 0.3)
  P(g, 2, 6, 60, 14, w.base)
  P(g, 2, 6, 60, 3, w.hi2)
  P(g, 2, 17, 60, 3, w.lo2)
  P(g, 6, 20, 6, 12, w.lo)
  P(g, 52, 20, 6, 12, w.lo)
  // 위에 놓인 컵과 접시
  P(g, 24, 2, 14, 6, '#ffffff')
  P(g, 24, 2, 14, 2, '#f0f4fa')
  P(g, 26, 7, 10, 2, '#c8ccd4')
  P(g, 44, 1, 7, 8, '#e8ecf2')
  P(g, 45, 2, 5, 4, '#8a5a3a')
}

function oBed(g, t) {
  const frame = ramp('#a8703c')
  const sheet = ramp('#eae6de')
  const quilt = ramp(t.ground.accent)
  contactShadow(g, 32, 62, 30, 5, 0.3)
  P(g, 2, 4, 60, 58, frame.lo2)
  P(g, 4, 6, 56, 54, sheet.base)
  P(g, 4, 6, 56, 4, sheet.hi2)
  // 베개
  P(g, 10, 9, 44, 16, sheet.hi2)
  P(g, 10, 9, 44, 3, '#ffffff')
  P(g, 10, 22, 44, 3, sheet.lo)
  // 이불
  P(g, 4, 28, 56, 32, quilt.base)
  P(g, 4, 28, 56, 3, quilt.hi2)
  P(g, 4, 31, 56, 2, quilt.hi)
  for (let i = 8; i < 56; i += 12) {
    P(g, i, 35, 4, 22, quilt.lo2)
    P(g, i + 4, 35, 2, 22, quilt.hi)
  }
  P(g, 4, 56, 56, 4, quilt.deep)
  P(g, 2, 4, 4, 58, frame.base)
  P(g, 58, 4, 4, 58, frame.lo2)
}

function oTv(g) {
  contactShadow(g, 32, 33, 26, 4, 0.3)
  const b = ramp('#2a2e38')
  P(g, 4, 4, 56, 22, b.base)
  P(g, 4, 4, 56, 2, b.hi)
  P(g, 8, 8, 48, 14, '#7fd4f5')
  P(g, 9, 9, 20, 6, '#c9f0ff')
  P(g, 9, 17, 46, 4, '#5ab4dc')
  P(g, 4, 24, 56, 3, b.lo2)
  P(g, 26, 27, 12, 4, b.base)
  P(g, 14, 31, 36, 3, b.lo)
}

function oPc(g) {
  contactShadow(g, 16, 30, 13, 4, 0.3)
  const m = ramp('#dfe4ec')
  P(g, 2, 6, 28, 20, m.base)
  P(g, 2, 6, 28, 2, m.hi2)
  P(g, 4, 8, 24, 14, '#2b6fd8')
  P(g, 5, 9, 10, 4, '#9fd0ff')
  P(g, 5, 18, 22, 3, '#1a4fa8')
  P(g, 2, 24, 28, 3, m.lo2)
  P(g, 6, 27, 20, 4, ramp('#aab2c0').base)
  P(g, 6, 27, 20, 1, '#c8ceda')
}

function oLocker(g) {
  const m = ramp('#5e6a86')
  contactShadow(g, 16, 62, 14, 4, 0.32)
  P(g, 1, 2, 30, 60, m.lo2)
  P(g, 3, 4, 26, 26, m.base)
  P(g, 3, 34, 26, 26, m.base)
  P(g, 3, 4, 26, 2, m.hi2)
  P(g, 3, 34, 26, 2, m.hi2)
  P(g, 3, 27, 26, 3, m.deep)
  P(g, 3, 57, 26, 3, m.deep)
  P(g, 24, 14, 3, 6, '#e8e8f0')
  P(g, 24, 44, 3, 6, '#e8e8f0')
  for (let i = 0; i < 3; i++) {
    P(g, 8, 8 + i * 2, 14, 1, m.lo)
    P(g, 8, 38 + i * 2, 14, 1, m.lo)
  }
  P(g, 1, 2, 3, 60, m.hi)
}

function oMachine(g, t, seed) {
  const body = ramp(['#ff5c8a', '#4db2ff', '#ffc93c'][seed % 3])
  contactShadow(g, 16, 62, 14, 4, 0.34)
  P(g, 2, 6, 28, 56, body.base)
  P(g, 2, 6, 4, 56, body.hi)
  P(g, 26, 6, 4, 56, body.lo2)
  P(g, 2, 6, 28, 3, body.hi2)
  // 캡슐 창
  P(g, 4, 10, 24, 26, '#f4f8ff')
  P(g, 5, 11, 22, 24, '#e2ecff')
  const caps = ['#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff', '#c77dff']
  for (let i = 0; i < 12; i++) {
    const cx = 7 + (i % 4) * 6
    const cy = 14 + Math.floor(i / 4) * 7
    P(g, cx, cy, 5, 5, caps[i % caps.length])
    dot(g, cx + 1, cy + 1, '#ffffff')
  }
  P(g, 5, 11, 22, 4, 'rgba(255,255,255,.55)')
  // 손잡이 · 배출구
  P(g, 10, 40, 12, 5, '#20263c')
  P(g, 13, 41, 6, 3, '#8fa0c8')
  P(g, 11, 49, 10, 8, '#20263c')
  P(g, 12, 50, 8, 6, '#0d1120')
  P(g, 2, 59, 28, 3, body.deep)
}

function oScoreboard(g) {
  contactShadow(g, 48, 62, 34, 5, 0.32)
  const b = ramp('#20263c')
  P(g, 4, 4, 88, 44, b.base)
  P(g, 4, 4, 88, 3, b.hi)
  P(g, 8, 8, 80, 32, '#0d1120')
  P(g, 8, 8, 80, 2, '#080b14')
  for (let i = 0; i < 2; i++) {
    const ox = 16 + i * 40
    P(g, ox, 14, 10, 20, '#ff5a3c')
    P(g, ox + 14, 14, 10, 20, '#ff5a3c')
    P(g, ox, 14, 10, 3, '#ff8a6c')
    P(g, ox + 14, 14, 10, 3, '#ff8a6c')
  }
  P(g, 45, 18, 5, 5, '#ffd84a')
  P(g, 45, 27, 5, 5, '#ffd84a')
  P(g, 8, 8, 80, 6, 'rgba(255,255,255,.07)')
  P(g, 4, 45, 88, 4, b.deep)
  P(g, 20, 49, 8, 14, ramp('#4a5060').base)
  P(g, 68, 49, 8, 14, ramp('#4a5060').base)
}

// ── 자연 소품 — 빈 땅을 없애는 것들 ─────────────────────────────────────────────
function oLog(g, t, seed) {
  // 2x1 — 쓰러진 통나무
  const bark = ramp('#7b5230')
  const cut = ramp('#c9a06a')
  contactShadow(g, 32, 30, 28, 5, 0.32)
  P(g, 2, 10, 60, 18, bark.base)
  P(g, 2, 10, 60, 4, bark.hi)
  P(g, 2, 24, 60, 4, bark.lo2)
  for (let i = 0; i < 9; i++) {
    P(g, 6 + i * 6, 13, 2, 12, bark.lo)
    P(g, 7 + i * 6, 15, 1, 8, bark.hi)
  }
  // 잘린 단면
  P(g, 0, 9, 10, 20, cut.base)
  P(g, 0, 9, 10, 3, cut.hi2)
  P(g, 2, 14, 6, 10, cut.lo)
  P(g, 3, 16, 4, 6, cut.base)
  P(g, 4, 18, 2, 2, cut.lo2)
  // 이끼
  for (let i = 0; i < 5; i++) P(g, 14 + i * 9, 11 + (i % 2) * 3, 5, 3, '#5b9c42')
}

function oStump(g, t, seed) {
  const bark = ramp('#6b4626')
  const cut = ramp('#c9a06a')
  contactShadow(g, 16, 29, 13, 4, 0.3)
  P(g, 4, 12, 24, 16, bark.base)
  P(g, 4, 12, 5, 16, bark.hi)
  P(g, 22, 12, 6, 16, bark.lo2)
  P(g, 3, 9, 26, 8, cut.base)
  P(g, 3, 9, 26, 3, cut.hi2)
  P(g, 8, 11, 16, 4, cut.lo)
  P(g, 11, 12, 10, 2, cut.base)
  P(g, 14, 12, 4, 1, cut.lo2)
  for (let i = 0; i < 4; i++) P(g, 6 + i * 6, 18, 2, 8, bark.lo2)
  P(g, 2, 24, 6, 4, '#5b9c42')
  P(g, 24, 22, 6, 4, '#4e8b39')
}

function oWeed(g, t, seed) {
  const r = ramp(t.ground.grassDark)
  const hi = ramp(t.ground.grass[0])
  contactShadow(g, 16, 29, 9, 3, 0.24)
  for (let i = 0; i < 7; i++) {
    const bx = 5 + i * 3
    const h = 10 + Math.floor(hash2(seed, i, 1) * 14)
    const lean = Math.floor(hash2(seed, i, 2) * 3) - 1
    P(g, bx, 28 - h, 2, h, i % 2 ? r.base : hi.lo)
    P(g, bx + lean, 28 - h, 1, Math.floor(h * 0.6), hi.base)
  }
  P(g, 6, 24, 20, 4, r.lo2)
}

function oReeds(g, t, seed) {
  const r = ramp('#7ea83c')
  contactShadow(g, 16, 30, 10, 3, 0.22)
  for (let i = 0; i < 5; i++) {
    const bx = 6 + i * 5
    const h = 16 + Math.floor(hash2(seed, i, 3) * 12)
    P(g, bx, 30 - h, 2, h, r.base)
    P(g, bx, 30 - h, 1, h, r.hi)
    P(g, bx - 1, 30 - h - 5, 4, 6, '#a8894a') // 이삭
    P(g, bx - 1, 30 - h - 5, 2, 3, '#c8a868')
  }
}

function oAutumnBush(g, t, seed) {
  const cols = t.ground.leafAutumn || ['#d8a52c', '#c86a24', '#b8402c']
  const c = ramp(cols[seed % cols.length])
  contactShadow(g, 16, 29, 13, 4, 0.3)
  // 작은 잎 뭉치를 여러 개 겹쳐 삐죽삐죽한 실루엣을 만든다
  const clumps = [[16, 20, 11], [10, 17, 8], [22, 17, 8], [16, 12, 8], [12, 23, 6], [21, 23, 6]]
  clumps.forEach(([cx, cy, rr], i) => blob(g, cx, cy + 1, rr, c.lo2))
  clumps.forEach(([cx, cy, rr], i) => blob(g, cx, cy, rr - 1, i < 3 ? c.base : c.lo))
  blob(g, 12, 12, 5, c.hi)
  blob(g, 20, 14, 4, c.hi)
  blob(g, 11, 10, 3, c.hi2)
  // 잎 알갱이 — 가장자리를 들쭉날쭉하게
  for (let i = 0; i < 34; i++) {
    const a = hash2(seed, i, 2) * Math.PI * 2
    const rr = 8 + hash2(seed, i, 3) * 7
    const px = 16 + Math.cos(a) * rr
    const py = 17 + Math.sin(a) * rr * 0.92
    const v = hash2(seed, i, 4)
    P(g, px, py, 2, 2, v > 0.7 ? c.hi2 : v > 0.4 ? c.hi : c.lo2)
  }
  // 드러난 잔가지
  P(g, 14, 25, 2, 5, '#6e5232')
  P(g, 17, 26, 2, 4, '#6e5232')
}

function oBarrel(g, t, seed) {
  const w = ramp('#a3703c')
  const band = ramp('#6b6f78')
  contactShadow(g, 16, 30, 12, 4, 0.3)
  P(g, 5, 6, 22, 24, w.base)
  P(g, 5, 6, 6, 24, w.hi)
  P(g, 22, 6, 5, 24, w.lo2)
  for (let i = 0; i < 4; i++) P(g, 8 + i * 5, 8, 1, 20, w.lo)
  P(g, 4, 11, 24, 3, band.base)
  P(g, 4, 22, 24, 3, band.base)
  P(g, 4, 11, 24, 1, band.hi2)
  P(g, 4, 4, 22, 5, w.hi2)
  P(g, 6, 5, 18, 3, w.hi)
}

function oCrate(g, t, seed) {
  const w = ramp('#b9834b')
  contactShadow(g, 16, 30, 12, 4, 0.3)
  P(g, 4, 10, 24, 20, w.base)
  P(g, 4, 10, 24, 3, w.hi2)
  P(g, 4, 10, 3, 20, w.hi)
  P(g, 25, 10, 3, 20, w.lo2)
  P(g, 4, 27, 24, 3, w.lo2)
  P(g, 4, 18, 24, 2, w.lo)
  for (let i = 0; i < 20; i++) P(g, 6 + i, 10 + i, 2, 2, w.lo)
  P(g, 4, 10, 24, 1, w.hi2)
}

function oWoodpile(g, t, seed) {
  const bark = ramp('#7b5230')
  const cut = ramp('#c9a06a')
  contactShadow(g, 32, 32, 28, 5, 0.32)
  for (let row = 0; row < 2; row++) {
    for (let i = 0; i < 5 - row; i++) {
      const x = 4 + i * 11 + row * 5
      const y = 20 - row * 10
      P(g, x, y, 10, 10, cut.base)
      P(g, x, y, 10, 3, cut.hi2)
      P(g, x + 2, y + 3, 6, 5, cut.lo)
      P(g, x + 3, y + 4, 4, 3, cut.base)
      P(g, x, y, 1, 10, bark.lo2)
      P(g, x + 9, y, 1, 10, bark.lo2)
    }
  }
}

// ── 마을이 자라면 생기는 것들 ────────────────────────────────────────────────────
function oFlag(g, t) {
  const a = ramp(t.ground.accent)
  const pole = ramp('#c8ccd4')
  contactShadow(g, 16, 61, 8, 3, 0.3)
  P(g, 13, 8, 5, 54, pole.base)
  P(g, 13, 8, 2, 54, pole.hi2)
  P(g, 17, 10, 18, 20, a.base)
  P(g, 17, 10, 18, 4, a.hi2)
  for (let i = 0; i < 8; i++) P(g, 33 - i * 2, 12 + i * 2, 2, 20 - i * 4, a.lo2)
  P(g, 11, 4, 9, 6, '#ffd21f')
  P(g, 11, 4, 9, 2, '#ffe97a')
}

function oSakura(g, t, seed) {
  const trunk = ramp('#7b5230')
  const pink = ramp('#ffb7d5')
  contactShadow(g, 32, 90, 24, 7, 0.32)
  P(g, 26, 58, 12, 34, trunk.base)
  P(g, 26, 58, 4, 34, trunk.hi)
  P(g, 34, 58, 4, 34, trunk.lo2)
  P(g, 20, 86, 24, 6, trunk.lo)
  blob(g, 32, 40, 27, pink.lo2)
  blob(g, 32, 36, 25, pink.lo)
  blob(g, 28, 32, 21, pink.base)
  blob(g, 22, 26, 13, pink.hi)
  blob(g, 40, 30, 12, pink.hi)
  blob(g, 24, 20, 8, '#ffffff')
  for (let i = 0; i < 55; i++) {
    const a = hash2(seed, i, 5) * Math.PI * 2
    const rr = 6 + hash2(seed, i, 6) * 22
    const s = hash2(seed, i, 7)
    P(g, 32 + Math.cos(a) * rr, 36 + Math.sin(a) * rr * 0.92, 2, 2, s > 0.7 ? '#ffffff' : s > 0.4 ? pink.hi2 : pink.lo2)
  }
  // 흩날리는 꽃잎
  for (let i = 0; i < 6; i++) {
    P(g, 6 + i * 9, 62 + (i % 3) * 9, 2, 2, pink.hi)
  }
}

function oFountain(g) {
  const stone = ramp('#b8bcc6')
  const water = ramp('#4f9fe0')
  contactShadow(g, 32, 60, 30, 5, 0.32)
  P(g, 2, 26, 60, 34, stone.lo2)
  P(g, 4, 28, 56, 30, stone.base)
  P(g, 4, 28, 56, 3, stone.hi2)
  P(g, 8, 33, 48, 22, water.base)
  P(g, 8, 33, 48, 5, water.hi)
  P(g, 8, 50, 48, 5, water.lo2)
  for (let i = 0; i < 6; i++) P(g, 11 + i * 8, 39 + (i % 2) * 6, 6, 2, '#bfe6ff')
  // 물기둥
  P(g, 28, 8, 8, 26, stone.base)
  P(g, 28, 8, 3, 26, stone.hi2)
  P(g, 29, 2, 6, 8, '#9fd8ff')
  P(g, 30, 0, 4, 4, '#ffffff')
  for (let i = 0; i < 5; i++) {
    P(g, 24 - i * 2, 10 + i * 4, 2, 5, '#bfe6ff')
    P(g, 38 + i * 2, 10 + i * 4, 2, 5, '#bfe6ff')
  }
  P(g, 2, 56, 60, 4, stone.deep)
}

/** 배드민턴 코트 — 10x18 타일(320x576) */
function oCourt(g, t) {
  const p = t.ground
  const W = 160, H = 288
  const court = ramp(p.court || '#2f7d55')
  const inner = ramp(p.courtIn || '#3b8f63')
  P(g, 0, 0, W, H, court.base)
  P(g, 0, 0, W, 4, court.hi)
  P(g, 8, 8, W - 16, H - 16, inner.base)
  // 바닥 결
  for (let i = 0; i < 24; i++) P(g, 10, 12 + i * 11, W - 20, 1, inner.lo)
  const L = p.courtLine || '#f4f4e8'
  const LS = 'rgba(16,20,34,.22)'
  const line = (x, y, w, h) => { P(g, x, y + 1, w, h, LS); P(g, x, y, w, h, L) }
  line(12, 12, W - 24, 2)
  line(12, H - 14, W - 24, 2)
  line(12, 12, 2, H - 26)
  line(W - 14, 12, 2, H - 26)
  line(24, 12, 2, H - 26)
  line(W - 26, 12, 2, H - 26)
  line(12, 104, W - 24, 2)
  line(12, H - 106, W - 24, 2)
  line(W / 2 - 1, 12, 2, 92)
  line(W / 2 - 1, H - 104, 2, 92)
  line(12, 28, W - 24, 2)
  line(12, H - 30, W - 24, 2)
  // 네트
  const ny = H / 2
  P(g, 2, ny - 22, W - 4, 3, 'rgba(16,20,34,.25)')
  P(g, 2, ny - 14, W - 4, 4, '#f0f0f0')
  for (let yy = ny - 10; yy < ny + 12; yy += 3) P(g, 4, yy, W - 8, 1, 'rgba(240,240,240,.5)')
  for (let xx = 6; xx < W - 6; xx += 5) P(g, xx, ny - 10, 1, 22, 'rgba(240,240,240,.45)')
  P(g, 2, ny + 12, W - 4, 3, 'rgba(16,20,34,.2)')
  const post = ramp('#c8ccd4')
  P(g, 1, ny - 26, 5, 40, post.base)
  P(g, 1, ny - 26, 2, 40, post.hi2)
  P(g, W - 6, ny - 26, 5, 40, post.base)
  P(g, W - 6, ny - 26, 2, 40, post.hi2)
}

// -----------------------------------------------------------------------------------
// 건물 — 3/4 입체 투시
// 지붕 경사 · 처마 그림자 · 정면 벽 · 측면 벽 · 기초 석재까지 한 장에 담는다
// -----------------------------------------------------------------------------------

/**
 * 박공지붕 — 3/4 톱다운의 핵심.
 *
 * 「45도 위에서 본 것처럼, 지붕과 정면 벽을 거의 같은 비율로」 보여 주는 투영이다.
 * 그래서 지붕은 납작한 가로 띠가 아니라, 가운데 용마루에서 좌우로 흘러내리는
 * 사다리꼴(또는 A자) 이어야 한다. 빛은 항상 왼쪽 위에서 들어온다.
 *
 * @param aframe true 면 통나무집처럼 뾰족한 A자 지붕
 */
function gableRoof(g, W, H, color, aframe) {
  const r = ramp(color)
  const ridgeHalf = aframe ? 3 : Math.round(W * 0.2)
  const edgeAt = (y) => {
    const t = Math.min(1, y / (H - 1))
    const half = ridgeHalf + (W / 2 - ridgeHalf) * t
    return [Math.round(W / 2 - half), Math.round(W / 2 + half)]
  }

  for (let y = 0; y < H; y++) {
    const [lx, rx] = edgeAt(y)
    const t = y / (H - 1)
    // 아래로 갈수록 어두워진다 (경사가 눕는다)
    const band = t < 0.18 ? r.hi2 : t < 0.42 ? r.hi : t < 0.72 ? r.base : r.lo
    P(g, lx, y, rx - lx, 1, band)
    // 왼쪽에서 들어오는 빛
    P(g, lx, y, Math.max(2, Math.round((rx - lx) * 0.22)), 1, t < 0.42 ? r.hi2 : r.hi)
    // 오른쪽 그늘
    P(g, rx - Math.max(2, Math.round((rx - lx) * 0.14)), y, Math.max(2, Math.round((rx - lx) * 0.14)), 1, r.lo2)
    // 경사면 가장자리 선
    P(g, lx, y, 2, 1, r.deep)
    P(g, rx - 2, y, 2, 1, r.deep)
  }

  // 기와 — 경사를 따라 층층이
  for (let row = 8; row < H - 2; row += 8) {
    const [lx, rx] = edgeAt(row)
    P(g, lx + 2, row, rx - lx - 4, 2, r.lo2)
    P(g, lx + 2, row + 2, rx - lx - 4, 1, r.hi)
    for (let sx = lx + 4 + ((row / 8) % 2 ? 6 : 0); sx < rx - 6; sx += 12) {
      P(g, sx, row - 5, 1, 5, r.lo)
    }
  }

  // 용마루
  const [rl, rr] = edgeAt(0)
  P(g, rl - 2, 0, rr - rl + 4, 5, r.hi2)
  P(g, rl - 2, 4, rr - rl + 4, 2, r.lo)
  P(g, rl - 2, 0, rr - rl + 4, 1, '#ffffff44')

  // 처마 — 벽보다 튀어나오고 그 아래로 그늘이 진다
  P(g, 0, H - 6, W, 4, r.lo2)
  P(g, 0, H - 6, W, 1, r.hi)
  P(g, 0, H - 2, W, 2, r.deep)
}

/**
 * 집 한 채.
 * opts: { w, h (타일), roofC, wallC, sign, doorX }
 */
function makeBuilding(g, t, o) {
  const W = o.w * TILE
  const H = o.h * TILE
  const wall = ramp(o.wallC)
  // 3/4 톱다운 — 지붕과 벽을 거의 반반으로 나눈다
  const roofH = Math.round(H * 0.5)
  const wallTop = roofH - 6

  // 접지 그림자
  contactShadow(g, W / 2, H - 4, W * 0.46, 10, 0.38)

  // ── 벽 ──
  P(g, 6, wallTop, W - 12, H - wallTop - 6, wall.base)
  if (o.logs) {
    // 통나무집 — 가로로 쌓인 통나무 결
    for (let y = wallTop; y < H - 6; y += 11) {
      P(g, 6, y, W - 12, 11, wall.base)
      P(g, 6, y, W - 12, 3, wall.hi)
      P(g, 6, y + 9, W - 12, 2, wall.lo2)
      for (let x = 10; x < W - 12; x += 26) P(g, x, y + 4, 12, 2, wall.lo)
      // 통나무 끝(모서리에 툭 튀어나온 부분)
      P(g, 2, y + 1, 6, 9, wall.lo)
      P(g, 2, y + 1, 6, 3, wall.hi)
      P(g, W - 8, y + 1, 6, 9, wall.lo2)
    }
  } else {
    // 세로 사이딩
    for (let x = 6; x < W - 6; x += 8) {
      P(g, x, wallTop, 1, H - wallTop - 6, wall.lo)
      P(g, x + 1, wallTop, 1, H - wallTop - 6, wall.hi)
    }
  }
  // 좌우 모서리 — 왼쪽에서 빛, 오른쪽이 그늘 (입체감)
  P(g, 6, wallTop, 7, H - wallTop - 6, wall.hi)
  P(g, W - 15, wallTop, 9, H - wallTop - 6, wall.lo)
  P(g, W - 8, wallTop, 2, H - wallTop - 6, wall.lo2)
  // 처마 밑 그늘 — 지붕이 벽에 드리우는 그림자
  P(g, 6, wallTop, W - 12, 12, 'rgba(16,20,34,.34)')
  P(g, 6, wallTop + 12, W - 12, 6, 'rgba(16,20,34,.15)')

  // 기초 석재
  const stone = ramp('#9a9488')
  P(g, 4, H - 18, W - 8, 14, stone.base)
  P(g, 4, H - 18, W - 8, 3, stone.hi)
  for (let x = 4; x < W - 8; x += 15) {
    P(g, x, H - 18, 1, 14, stone.lo2)
    P(g, x + 7, H - 11, 1, 7, stone.lo2)
    P(g, x + 2, H - 16, 6, 3, stone.hi2)
  }
  P(g, 4, H - 6, W - 8, 3, stone.deep)

  // ── 지붕 (박공) ──
  gableRoof(g, W, roofH, o.roofC, o.aframe)

  // 처마에 걸린 전구줄
  if (o.lights) {
    const ly = roofH + 2
    for (let x = 10; x < W - 10; x += 14) {
      P(g, x, ly + (x % 28 ? 2 : 0), 12, 1, '#5a5348')
      P(g, x + 5, ly + 2, 3, 4, ['#ffe066', '#ff9ec4', '#8ef08a'][(x / 14) % 3 | 0])
      dot(g, x + 5, ly + 2, '#ffffff')
    }
  }

  // ── 간판 (처마 바로 아래, 벽 위쪽) ──
  const sw = Math.min(W - 44, 96)
  const sx = Math.round((W - sw) / 2)
  const sy = wallTop + 14
  const sh = 34
  const sr = ramp(o.roofC)
  P(g, sx - 4, sy - 4, sw + 8, sh + 8, sr.deep)
  P(g, sx - 2, sy - 2, sw + 4, sh + 4, sr.lo2)
  P(g, sx, sy, sw, sh, '#f6f2e4')
  P(g, sx, sy, sw, 3, '#ffffff')
  P(g, sx, sy + sh - 3, sw, 3, '#d8d2c0')
  emblem(g, sx + Math.floor(sw / 2) - 16, sy + 1, o.sign)
  P(g, sx - 4, sy + sh + 4, sw + 8, 4, 'rgba(16,20,34,.3)')

  // ── 자동문 ──
  const dcx = ((o.doorX ?? Math.floor(o.w / 2)) + 0.5) * TILE
  const dw = 44
  const dx = Math.round(dcx - dw / 2)
  const dTop = H - 60

  // ── 창문 — 문 양옆 ──
  if (dx - 40 > 8) window9(g, dx - 44, dTop + 6, 30, 26)
  if (dx + dw + 44 < W - 8) window9(g, dx + dw + 14, dTop + 6, 30, 26)
  P(g, dx - 4, dTop - 4, dw + 8, 56, '#232838')
  P(g, dx - 2, dTop - 2, dw + 4, 52, '#33384a')
  // 상단 표시등
  P(g, dx, dTop, dw, 10, sr.lo)
  for (let i = 0; i < 3; i++) P(g, dx + 7 + i * 11, dTop + 3, 6, 4, '#ffe066')
  // 유리
  P(g, dx + 1, dTop + 12, dw - 2, 36, '#8fd8f8')
  P(g, dx + 1, dTop + 12, dw - 2, 6, '#b4e6ff')
  P(g, dx + dw / 2 - 2, dTop + 12, 4, 36, '#33384a')
  for (let i = 0; i < 7; i++) {
    P(g, dx + 3 + i, dTop + 16 + i, 5, 2, 'rgba(255,255,255,.6)')
    P(g, dx + dw / 2 + 4 + i, dTop + 22 + i, 5, 2, 'rgba(255,255,255,.42)')
  }
  P(g, dx + 1, dTop + 45, dw - 2, 3, '#5a6070')
  // 현관 계단
  P(g, dx - 10, H - 12, dw + 20, 10, '#d6d2c6')
  P(g, dx - 10, H - 12, dw + 20, 3, '#efece2')
  P(g, dx - 14, H - 5, dw + 28, 5, '#c2beb2')
  P(g, dx - 14, H - 5, dw + 28, 2, '#dedace')
  P(g, dx - 14, H - 2, dw + 28, 2, 'rgba(16,20,34,.3)')
}

function window9(g, x, y, w, h) {
  const fr = ramp('#8a6e4e')
  P(g, x - 3, y - 3, w + 6, h + 6, fr.lo2)
  P(g, x - 2, y - 2, w + 4, h + 4, fr.base)
  P(g, x - 2, y - 2, w + 4, 2, fr.hi)
  P(g, x, y, w, h, '#3f6f9c')
  P(g, x, y, w, Math.floor(h / 2), '#8fd8f8')
  // 유리 반사
  for (let i = 0; i < 6; i++) P(g, x + 2 + i * 2, y + 2 + i * 2, 6, 2, 'rgba(255,255,255,.5)')
  // 창살
  P(g, x + Math.floor(w / 2) - 1, y, 2, h, fr.base)
  P(g, x, y + Math.floor(h / 2) - 1, w, 2, fr.base)
  // 커튼
  P(g, x, y, 5, h, 'rgba(255,240,220,.55)')
  P(g, x + w - 5, y, 5, h, 'rgba(255,240,220,.42)')
  P(g, x, y + h - 3, w, 3, 'rgba(16,20,34,.3)')
}

/** 간판 엠블럼 — 글자 대신 그림으로 어떤 가게인지 알린다 (32x32) */
function emblem(g, x, y, kind) {
  if (kind === 'shuttle') {
    P(g, x + 11, y + 17, 11, 8, '#e8e8e8')
    P(g, x + 11, y + 17, 4, 8, '#ffffff')
    P(g, x + 13, y + 24, 7, 5, '#c8c8c8')
    for (let i = 0; i < 5; i++) {
      const h = 15 - Math.abs(2 - i) * 3
      P(g, x + 5 + i * 5, y + 3 + Math.abs(2 - i) * 2, 4, h, '#ffffff')
      P(g, x + 5 + i * 5, y + 3 + Math.abs(2 - i) * 2, 1, h, '#d4d8e0')
    }
    P(g, x + 11, y + 27, 11, 2, '#a8a8a8')
  } else if (kind === 'racket') {
    P(g, x + 7, y + 1, 18, 20, '#f0b429')
    P(g, x + 9, y + 3, 14, 16, '#20263c')
    for (let i = 2; i < 14; i += 3) P(g, x + 9 + i, y + 3, 1, 16, '#8fa0c8')
    for (let i = 2; i < 16; i += 3) P(g, x + 9, y + 3 + i, 14, 1, '#8fa0c8')
    P(g, x + 7, y + 1, 18, 3, '#ffd76a')
    P(g, x + 14, y + 21, 4, 10, '#f0b429')
    P(g, x + 14, y + 21, 1, 10, '#ffd76a')
  } else if (kind === 'heal') {
    P(g, x + 12, y + 4, 8, 24, '#ff5c8a')
    P(g, x + 4, y + 12, 24, 8, '#ff5c8a')
    P(g, x + 12, y + 4, 3, 24, '#ff8fb2')
    P(g, x + 4, y + 12, 24, 3, '#ff8fb2')
  } else if (kind === 'star') {
    P(g, x + 6, y + 10, 20, 9, '#ffd84a')
    P(g, x + 12, y + 2, 8, 9, '#ffd84a')
    P(g, x + 8, y + 18, 6, 11, '#ffd84a')
    P(g, x + 18, y + 18, 6, 11, '#ffd84a')
    P(g, x + 12, y + 2, 3, 9, '#fff1a8')
    P(g, x + 6, y + 10, 8, 3, '#fff1a8')
  } else if (kind === 'home') {
    P(g, x + 5, y + 14, 22, 15, '#f0e0c0')
    for (let i = 0; i < 12; i++) P(g, x + 16 - i - 1, y + 13 - i + 8, (i + 1) * 2, 1, '#c07048')
    P(g, x + 12, y + 20, 8, 9, '#8a5a3a')
    P(g, x + 5, y + 26, 22, 3, '#d8c8a8')
  }
}

// -----------------------------------------------------------------------------------
// 오브젝트 등록표 (w,h 는 타일 개수)
// -----------------------------------------------------------------------------------
export const OBJECTS = {
  tree: { w: 2, h: 3, solidRows: 1, draw: oTree },
  pine: { w: 2, h: 3, solidRows: 1, draw: oPine },
  bush: { w: 1, h: 1, solidRows: 1, draw: oBush },
  rock: { w: 1, h: 1, solidRows: 1, draw: oRock },
  sign: { w: 1, h: 1, solidRows: 1, draw: oSign },
  lamp: { w: 1, h: 2, solidRows: 1, draw: oLamp },
  bench: { w: 2, h: 1, solidRows: 1, draw: oBench, drawH: 38 },
  fence: { w: 1, h: 1, solidRows: 1, draw: oFence },
  vending: { w: 1, h: 2, solidRows: 1, draw: oVending },
  counter: { w: 2, h: 1, solidRows: 1, draw: oCounter, drawH: 44 },
  shelf: { w: 1, h: 2, solidRows: 2, draw: oShelf },
  plant: { w: 1, h: 2, solidRows: 1, draw: oPlant },
  table: { w: 2, h: 1, solidRows: 1, draw: oTable, drawH: 34 },
  bed: { w: 2, h: 2, solidRows: 2, draw: oBed },
  tv: { w: 2, h: 1, solidRows: 1, draw: oTv, drawH: 35 },
  pc: { w: 1, h: 1, solidRows: 1, draw: oPc, drawH: 32 },
  locker: { w: 1, h: 2, solidRows: 2, draw: oLocker },
  machine: { w: 1, h: 2, solidRows: 1, draw: oMachine },
  scoreboard: { w: 3, h: 2, solidRows: 2, draw: oScoreboard },
  court: { w: 5, h: 9, solidRows: 0, flat: true, draw: oCourt },
  flag: { w: 1, h: 2, solidRows: 0, draw: oFlag },
  sakura: { w: 2, h: 3, solidRows: 0, draw: oSakura },
  fountain: { w: 2, h: 2, solidRows: 0, draw: oFountain },

  // 자연 소품 — 빈 땅을 채우는 것들
  log: { w: 2, h: 1, solidRows: 1, draw: oLog },
  stump: { w: 1, h: 1, solidRows: 1, draw: oStump },
  weed: { w: 1, h: 1, solidRows: 0, draw: oWeed },
  reeds: { w: 1, h: 1, solidRows: 0, draw: oReeds },
  autumnBush: { w: 1, h: 1, solidRows: 1, draw: oAutumnBush },
  barrel: { w: 1, h: 1, solidRows: 1, draw: oBarrel },
  crate: { w: 1, h: 1, solidRows: 1, draw: oCrate },
  woodpile: { w: 2, h: 1, solidRows: 1, draw: oWoodpile, drawH: 34 },

  martBuilding: {
    w: 6, h: 5, solidRows: 5, door: [3, 4],
    draw: (g, t) => makeBuilding(g, t, { w: 6, h: 5, roofC: '#2f6fc0', wallC: '#e8eef6', sign: 'shuttle', doorX: 3 }),
  },
  centerBuilding: {
    w: 6, h: 5, solidRows: 5, door: [3, 4],
    draw: (g, t) => makeBuilding(g, t, { w: 6, h: 5, roofC: '#f06888', wallC: '#fbf2ea', sign: 'heal', doorX: 3, lights: true }),
  },
  gymBuilding: {
    w: 7, h: 6, solidRows: 6, door: [3, 5],
    draw: (g, t) => makeBuilding(g, t, { w: 7, h: 6, roofC: '#3c4674', wallC: '#dfe4f0', sign: 'racket', doorX: 3 }),
  },
  // 내 집만 통나무집 A자 지붕 — 레퍼런스의 그 오두막
  homeBuilding: {
    w: 5, h: 5, solidRows: 5, door: [2, 4],
    draw: (g, t) => makeBuilding(g, t, { w: 5, h: 5, roofC: '#5a6470', wallC: '#b98a52', sign: 'home', doorX: 2, aframe: true, logs: true, lights: true }),
  },
  arcadeBuilding: {
    w: 5, h: 5, solidRows: 5, door: [2, 4],
    draw: (g, t) => makeBuilding(g, t, { w: 5, h: 5, roofC: '#8850d8', wallC: '#efe6fb', sign: 'star', doorX: 2, lights: true }),
  },
}

// -----------------------------------------------------------------------------------
// 굽기(캐시)
// -----------------------------------------------------------------------------------
const objCache = new Map()

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

// -----------------------------------------------------------------------------------
// 바닥 잡동사니 — 스타듀밸리 밀도의 비밀
//
// 빈 잔디를 그냥 두면 아무리 잘 그려도 허전해 보인다. 그래서 굽는 단계에서
// 잡초·잔돌·떨어진 꽃잎·버섯·잔가지를 타일마다 흩뿌린다. (한 번만 굽고 재사용)
// -----------------------------------------------------------------------------------
const PETALS = ['#ff7ba8', '#ffe066', '#ffffff', '#a88cff', '#ff9e5c', '#7ad0ff']

const CLUTTER = [
  // 잡초 다발
  (g, ox, oy, t, s) => {
    const r = ramp(t.ground.grassDark)
    const hi = ramp(t.ground.grass[2] || t.ground.grass[0])
    for (let i = 0; i < 5; i++) {
      const bx = ox + 8 + i * 3
      const h = 5 + Math.floor(hash2(s, i, 1) * 6)
      P(g, bx, oy + 22 - h, 1, h, i % 2 ? r.base : hi.base)
      dot(g, bx, oy + 22 - h, hi.hi)
    }
  },
  // 잔돌
  (g, ox, oy, t, s) => {
    for (let i = 0; i < 3; i++) {
      const bx = ox + 5 + Math.floor(hash2(s, i, 2) * 20)
      const by = oy + 6 + Math.floor(hash2(s, i, 3) * 20)
      const sz = 2 + Math.floor(hash2(s, i, 4) * 2)
      P(g, bx, by, sz, sz, '#9c9482')
      P(g, bx, by, sz - 1, 1, '#c0b8a4')
      P(g, bx, by + sz, sz, 1, 'rgba(16,20,34,.22)')
    }
  },
  // 떨어진 꽃잎 (스타듀밸리 특유의 알록달록한 점들)
  (g, ox, oy, t, s) => {
    for (let i = 0; i < 6; i++) {
      const bx = ox + 2 + Math.floor(hash2(s, i, 5) * 28)
      const by = oy + 2 + Math.floor(hash2(s, i, 6) * 28)
      P(g, bx, by, 2, 2, PETALS[Math.floor(hash2(s, i, 7) * PETALS.length)])
    }
  },
  // 버섯
  (g, ox, oy, t, s) => {
    const bx = ox + 8 + Math.floor(hash2(s, 0, 8) * 14)
    const by = oy + 12 + Math.floor(hash2(s, 0, 9) * 10)
    P(g, bx + 1, by + 4, 3, 5, '#e8dcc0')
    P(g, bx, by, 6, 5, hash2(s, 0, 10) > 0.5 ? '#d0402c' : '#b0682c')
    P(g, bx + 1, by, 3, 2, '#ff8a6c')
    dot(g, bx + 3, by + 2, '#ffffff')
    P(g, bx, by + 8, 6, 1, 'rgba(16,20,34,.24)')
  },
  // 잔가지 · 마른 잎
  (g, ox, oy, t, s) => {
    const bx = ox + 5 + Math.floor(hash2(s, 0, 11) * 18)
    const by = oy + 8 + Math.floor(hash2(s, 0, 12) * 16)
    P(g, bx, by, 9, 2, '#8a6a44')
    P(g, bx + 3, by - 3, 2, 4, '#8a6a44')
    P(g, bx + 6, by + 2, 3, 2, '#6e5232')
    P(g, bx - 3, by + 3, 4, 3, '#c08a3c')
  },
  // 클로버 — 잔디보다 아주 살짝만 밝게
  (g, ox, oy, t, s) => {
    const c = ramp(t.ground.grassDark)
    for (let i = 0; i < 4; i++) {
      const bx = ox + 6 + Math.floor(hash2(s, i, 13) * 20)
      const by = oy + 6 + Math.floor(hash2(s, i, 14) * 20)
      P(g, bx, by, 2, 2, c.hi2)
      P(g, bx + 2, by, 2, 2, c.hi)
      P(g, bx, by + 2, 2, 2, c.base)
    }
  },
]

/** 포장 바닥용 잡동사니 — 갈라진 틈, 틈에서 자란 잡초, 떨어진 낙엽 */
const PAVE_CLUTTER = [
  (g, ox, oy, t, s) => {
    // 갈라진 틈
    let x = ox + 4 + Math.floor(hash2(s, 0, 20) * 16)
    let y = oy + 4
    for (let i = 0; i < 7; i++) {
      P(g, x, y, 2, 3, 'rgba(16,20,34,.28)')
      x += hash2(s, i, 21) > 0.5 ? 1 : -1
      y += 3
    }
  },
  (g, ox, oy, t, s) => {
    // 틈에서 자란 잡초
    const c = ramp(t.ground.grassDark)
    const bx = ox + 6 + Math.floor(hash2(s, 0, 22) * 18)
    for (let i = 0; i < 4; i++) {
      const h = 5 + Math.floor(hash2(s, i, 23) * 5)
      P(g, bx + i * 2, oy + 20 - h, 1, h, i % 2 ? c.base : c.hi)
    }
    P(g, bx, oy + 19, 8, 2, 'rgba(16,20,34,.2)')
  },
  (g, ox, oy, t, s) => {
    // 떨어진 낙엽
    for (let i = 0; i < 3; i++) {
      const bx = ox + 3 + Math.floor(hash2(s, i, 24) * 24)
      const by = oy + 3 + Math.floor(hash2(s, i, 25) * 24)
      const c = ['#c8873c', '#b0602c', '#d8a52c'][Math.floor(hash2(s, i, 26) * 3)]
      P(g, bx, by, 4, 2, c)
      P(g, bx + 1, by - 1, 2, 1, c)
      P(g, bx, by + 2, 4, 1, 'rgba(16,20,34,.2)')
    }
  },
  (g, ox, oy, t, s) => {
    // 물 자국 · 얼룩
    const bx = ox + 4 + Math.floor(hash2(s, 0, 27) * 14)
    const by = oy + 6 + Math.floor(hash2(s, 0, 28) * 14)
    P(g, bx, by, 12, 8, 'rgba(16,20,34,.09)')
    P(g, bx + 2, by + 2, 8, 4, 'rgba(16,20,34,.07)')
  },
]

// 잔디가 길 위로 자라 나오는 경계 처리
const GRASSY = new Set(['.', ',', '"'])
const HARD = new Set(['=', '_', 's'])

function drawFringe(g, rows, theme, x, y) {
  const p = theme.ground
  const at = (xx, yy) => rows[yy]?.[xx]
  const ox = x * TILE
  const oy = y * TILE
  const r0 = ramp(p.grass[0])
  const pick = (i) => (i % 4 === 0 ? r0.lo2 : i % 3 === 0 ? r0.hi : r0.base)

  if (GRASSY.has(at(x, y - 1))) {
    P(g, ox, oy, TILE, 2, 'rgba(16,20,34,.13)')
    for (let i = 0; i < TILE; i++) {
      const h = 2 + Math.floor(hash2(x * TILE + i, y, 201) * 5)
      P(g, ox + i, oy, 1, h, pick(i))
    }
  }
  if (GRASSY.has(at(x, y + 1))) {
    for (let i = 0; i < TILE; i++) {
      const h = 1 + Math.floor(hash2(x * TILE + i, y, 202) * 4)
      P(g, ox + i, oy + TILE - h, 1, h, pick(i))
    }
  }
  if (GRASSY.has(at(x - 1, y))) {
    for (let i = 0; i < TILE; i++) {
      const w = 1 + Math.floor(hash2(x, y * TILE + i, 203) * 4)
      P(g, ox, oy + i, w, 1, pick(i))
    }
  }
  if (GRASSY.has(at(x + 1, y))) {
    for (let i = 0; i < TILE; i++) {
      const w = 1 + Math.floor(hash2(x, y * TILE + i, 204) * 4)
      P(g, ox + TILE - w, oy + i, w, 1, pick(i))
    }
  }
}

/**
 * 지도의 바닥을 통째로 큰 캔버스에 굽는다. (물결 때문에 프레임 2장)
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
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (HARD.has(rows[y][x])) drawFringe(g, rows, theme, x, y)
      }
    }
    // 잡동사니 — 잔디·흙 위에 흩뿌려 빈 땅을 없앤다
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const ch = rows[y][x]
        const seed = x * 131 + y * 977
        if (ch === '_') {
          if (hash2(x, y, 502) > 0.4) continue
          const p2 = Math.floor(hash2(x, y, 503) * PAVE_CLUTTER.length)
          PAVE_CLUTTER[p2](g, x * TILE, y * TILE, theme, seed)
          continue
        }
        if (ch !== '.' && ch !== ',' && ch !== '=' && ch !== 's') continue
        if (hash2(x, y, 500) > 0.52) continue
        const pick = Math.floor(hash2(x, y, 501) * CLUTTER.length)
        CLUTTER[pick](g, x * TILE, y * TILE, theme, seed)
      }
    }
    // 벽 아래로 떨어지는 그늘 (실내 입체감)
    for (let y = 1; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const above = rows[y - 1][x]
        const here = rows[y][x]
        if ((above === 'w' || above === 'W') && here !== 'w' && here !== 'W' && here !== ' ') {
          const grd = g.createLinearGradient(0, y * TILE, 0, y * TILE + 14)
          grd.addColorStop(0, 'rgba(16,20,34,.30)')
          grd.addColorStop(1, 'rgba(16,20,34,0)')
          g.fillStyle = grd
          g.fillRect(x * TILE, y * TILE, TILE, 14)
        }
      }
    }
    // 실내 채광
    ;(opts.lights || []).forEach(([lx, ly, lw, lh]) => {
      const grd = g.createLinearGradient(0, ly * TILE, 0, (ly + lh) * TILE)
      grd.addColorStop(0, 'rgba(255,246,214,.30)')
      grd.addColorStop(1, 'rgba(255,246,214,0)')
      g.fillStyle = grd
      g.beginPath()
      g.moveTo(lx * TILE, ly * TILE)
      g.lineTo((lx + lw) * TILE, ly * TILE)
      g.lineTo((lx + lw + 1.4) * TILE, (ly + lh) * TILE)
      g.lineTo((lx - 1.4) * TILE, (ly + lh) * TILE)
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
