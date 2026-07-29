// ===================================================================================
// 셔틀몬스터 — 지도
//
// 포켓몬스터처럼 「바깥 마을 한 장 + 건물 안 여러 장」 구조다.
// 문 앞 매트를 밟으면 화면이 어두워졌다 밝아지면서 다른 지도로 넘어가고,
// 그 순간 타일 색과 UI 색이 그 지역 테마로 통째로 바뀐다.
//
// 오브젝트 좌표는 전부 「아래쪽 왼칸(발밑)」 기준이다. 나무든 건물이든
// 발밑 칸을 찍으면 위로 자라난다 — 그래서 뒤로 걸어가면 가려진다.
// ===================================================================================
import { OBJECTS } from './tileset.js'

// -----------------------------------------------------------------------------------
// 지도를 코드로 그리는 작은 도구들 (긴 ASCII 그림표보다 실수가 적다)
// -----------------------------------------------------------------------------------
function grid(w, h, fill = '.') {
  return Array.from({ length: h }, () => Array.from({ length: w }, () => fill))
}
function rect(g, x, y, w, h, ch) {
  for (let j = y; j < y + h; j++) {
    for (let i = x; i < x + w; i++) {
      if (g[j] && g[j][i] !== undefined) g[j][i] = ch
    }
  }
}
function hline(g, x1, x2, y, ch) { rect(g, Math.min(x1, x2), y, Math.abs(x2 - x1) + 1, 1, ch) }
function vline(g, x, y1, y2, ch) { rect(g, x, Math.min(y1, y2), 1, Math.abs(y2 - y1) + 1, ch) }
function scatter(g, x, y, w, h, ch, n, seed = 1) {
  let s = seed * 9301 + 49297
  for (let i = 0; i < n; i++) {
    s = (s * 9301 + 49297) % 233280
    const px = x + Math.floor((s / 233280) * w)
    s = (s * 9301 + 49297) % 233280
    const py = y + Math.floor((s / 233280) * h)
    if (g[py] && g[py][px] === '.') g[py][px] = ch
  }
}
const toRows = (g) => g.map((r) => r.join(''))

// 실내 공통 — 위 2줄은 윗벽, 3번째 줄은 굽도리 벽, 양옆은 벽
function room(w, h, floor) {
  const g = grid(w, h, floor)
  rect(g, 0, 0, w, 2, 'W')
  rect(g, 0, 2, w, 1, 'w')
  vline(g, 0, 3, h - 1, 'w')
  vline(g, w - 1, 3, h - 1, 'w')
  return g
}

// -----------------------------------------------------------------------------------
// ① 셔틀타운 — 바깥 마을
// -----------------------------------------------------------------------------------
function buildTown() {
  const W = 40
  const H = 34
  const g = grid(W, H, '.')

  // 바깥 테두리는 숲과 물 — 마을 밖으로는 못 나간다
  rect(g, 0, 0, W, 2, '#')
  rect(g, 0, H - 2, W, 2, '#')
  rect(g, 0, 0, 2, H, '#')
  rect(g, W - 2, 0, 2, H, '#')

  // 큰길 — 세로 대로 + 가로 두 줄
  rect(g, 19, 9, 2, 23, '_')
  rect(g, 6, 11, 28, 1, '_')
  rect(g, 6, 25, 25, 1, '_')

  // 각 건물 앞 진입로
  vline(g, 8, 10, 11, '_')
  vline(g, 31, 10, 11, '_')
  vline(g, 7, 25, 25, '_')
  vline(g, 30, 25, 25, '_')

  // 가운데 광장
  rect(g, 14, 13, 13, 9, '_')

  // 연못 (왼쪽 아래) — 네 귀퉁이를 모래로 깎아 물가를 둥글게
  rect(g, 3, 27, 9, 5, 's')
  rect(g, 4, 28, 7, 3, '~')
  ;[[4, 28], [10, 28], [4, 30], [10, 30]].forEach(([x, y]) => (g[y][x] = 's'))

  // 풀숲 · 꽃밭
  rect(g, 25, 27, 8, 4, '"')
  scatter(g, 12, 3, 6, 6, ',', 10, 3)
  scatter(g, 24, 14, 4, 6, ',', 6, 9)
  scatter(g, 3, 13, 8, 8, ',', 12, 17)
  scatter(g, 33, 13, 4, 10, '"', 10, 23)
  scatter(g, 3, 3, 8, 2, '#', 5, 31)
  scatter(g, 24, 2, 12, 3, '#', 6, 41)
  scatter(g, 12, 27, 6, 4, '#', 4, 47)

  // 문 앞 매트 (여기를 밟으면 안으로 들어간다)
  const mats = [[19, 9], [8, 10], [31, 10], [7, 25], [30, 25]]
  mats.forEach(([x, y]) => (g[y][x] = 'D'))

  return {
    id: 'town',
    theme: 'town',
    label: '셔틀타운',
    outdoor: true,
    rows: toRows(g),
    objects: [
      // 건물 — 발밑(아래 왼칸) 좌표
      { kind: 'gymBuilding', x: 16, y: 8 },
      { kind: 'centerBuilding', x: 5, y: 9 },
      { kind: 'martBuilding', x: 28, y: 9 },
      { kind: 'homeBuilding', x: 5, y: 24 },
      { kind: 'arcadeBuilding', x: 28, y: 24 },
      // 광장 살림살이
      { kind: 'scoreboard', x: 15, y: 15 },
      { kind: 'bench', x: 15, y: 19 },
      { kind: 'bench', x: 23, y: 19 },
      { kind: 'lamp', x: 14, y: 14 },
      { kind: 'lamp', x: 26, y: 14 },
      { kind: 'lamp', x: 14, y: 21 },
      { kind: 'lamp', x: 26, y: 21 },
      { kind: 'vending', x: 25, y: 17 },
      // 안내판
      { kind: 'sign', x: 18, y: 10 },
      { kind: 'sign', x: 9, y: 10 },
      { kind: 'sign', x: 32, y: 10 },
      { kind: 'sign', x: 6, y: 25 },
      { kind: 'sign', x: 31, y: 25 },
      { kind: 'sign', x: 21, y: 24 },
      // 조경
      { kind: 'pine', x: 12, y: 12 }, { kind: 'pine', x: 12, y: 22 },
      { kind: 'pine', x: 28, y: 12 }, { kind: 'pine', x: 28, y: 22 },
      { kind: 'tree', x: 4, y: 16 }, { kind: 'tree', x: 35, y: 16 },
      { kind: 'tree', x: 35, y: 27 }, { kind: 'tree', x: 14, y: 30 },
      { kind: 'bush', x: 13, y: 26 }, { kind: 'bush', x: 26, y: 26 },
      { kind: 'bush', x: 3, y: 24 }, { kind: 'bush', x: 36, y: 24 },
      { kind: 'rock', x: 12, y: 29 }, { kind: 'rock', x: 34, y: 30 },
    ],
    warps: [
      { x: 19, y: 9, to: 'gym', tx: 10, ty: 25, dir: 1 },
      { x: 8, y: 10, to: 'center', tx: 6, ty: 12, dir: 1 },
      { x: 31, y: 10, to: 'mart', tx: 6, ty: 12, dir: 1 },
      { x: 7, y: 25, to: 'home', tx: 5, ty: 10, dir: 1 },
      { x: 30, y: 25, to: 'arcade', tx: 6, ty: 12, dir: 1 },
    ],
    interacts: [
      { x: 18, y: 10, script: 'sign_gym' },
      { x: 9, y: 10, script: 'sign_center' },
      { x: 32, y: 10, script: 'sign_mart' },
      { x: 6, y: 25, script: 'sign_home' },
      { x: 31, y: 25, script: 'sign_arcade' },
      { x: 21, y: 24, script: 'sign_town' },
      { x: 25, y: 17, script: 'vending' },
      { x: 15, y: 15, script: 'scoreboard' },
    ],
    npcs: [
      {
        id: 'koko', name: '안내원 코코', x: 21, y: 12, dir: 0, wander: 0, script: 'koko',
        gender: '여',
        look: { skin: 's2', hair: 'twintail', hairColor: '#f2d49b', eyes: 'sparkle', outfit: 'polo', top: '#ffd166', bottom: '#f97316', bottomStyle: 'skirt', shoes: '#ffffff', shoeStyle: 'basic', acc: 'visor', racket: { model: 'classic', frame: '#ffffff', string: '#ffffff', grip: '#f59e0b', wrap: 'plain' } },
      },
      {
        id: 'kid1', name: '꼬마 지훈', x: 12, y: 17, dir: 3, wander: 1, notice: 3, script: 'kid1',
        gender: '남',
        look: { skin: 's3', hair: 'spiky', hairColor: '#2b1d16', eyes: 'happy', outfit: 'stripe', top: '#22c55e', bottom: '#1f2937', bottomStyle: 'shorts', shoes: '#ef4444', shoeStyle: 'stripe', acc: 'cap', racket: { model: 'classic', frame: '#22c55e', string: '#ffffff', grip: '#1f2937', wrap: 'plain' } },
      },
      {
        id: 'granny', name: '이웃 아주머니', x: 27, y: 16, dir: 2, wander: 0, script: 'granny',
        gender: '여',
        look: { skin: 's4', hair: 'bun', hairColor: '#9aa4b2', eyes: 'happy', outfit: 'tee', top: '#ec4899', bottom: '#6366f1', bottomStyle: 'long', shoes: '#94a3b8', shoeStyle: 'basic', acc: 'none', racket: { model: 'classic', frame: '#ec4899', string: '#ffffff', grip: '#1f2937', wrap: 'plain' } },
      },
      {
        id: 'coach', name: '동네 코치', x: 22, y: 27, dir: 1, wander: 1, notice: 4, script: 'coach',
        gender: '남',
        look: { skin: 's5', hair: 'buzz', hairColor: '#2b1d16', eyes: 'sharp', outfit: 'zipup', top: '#1f2937', bottom: '#1f2937', bottomStyle: 'long', shoes: '#ffffff', shoeStyle: 'pro', acc: 'towel', racket: { model: 'pro', frame: '#111827', string: '#ffffff', grip: '#ef4444', wrap: 'spiral' } },
      },
    ],
    // 마을 발전 단계마다 늘어나는 장식 (길을 막지 않는 자리에만 둔다)
    growth: [
      { lv: 2, objects: [
        { kind: 'flag', x: 17, y: 12 }, { kind: 'flag', x: 23, y: 12 },
        { kind: 'flag', x: 17, y: 23 }, { kind: 'flag', x: 23, y: 23 },
      ] },
      { lv: 3, objects: [
        { kind: 'sakura', x: 11, y: 16, variant: 1 }, { kind: 'sakura', x: 29, y: 16, variant: 2 },
        { kind: 'sakura', x: 11, y: 21, variant: 3 }, { kind: 'sakura', x: 29, y: 21, variant: 4 },
      ] },
      { lv: 4, objects: [{ kind: 'fountain', x: 22, y: 17 }] },
      { lv: 5, objects: [
        { kind: 'sakura', x: 15, y: 30, variant: 5 }, { kind: 'sakura', x: 25, y: 30, variant: 6 },
      ] },
    ],
    // 마을 주민(선수 명단)이 서성이는 자리
    roamSpots: [
      [17, 14], [23, 15], [16, 20], [24, 20], [12, 13], [27, 13],
      [10, 17], [29, 18], [15, 27], [22, 30], [11, 21], [30, 21],
    ],
    spawn: { x: 19, y: 26, dir: 1 },
  }
}

// -----------------------------------------------------------------------------------
// ② 셔틀마트 — 상점 (테마: 파랑)
// -----------------------------------------------------------------------------------
function buildMart() {
  const W = 14
  const H = 13
  const g = room(W, H, 'f')
  g[H - 1][6] = 'D'
  g[H - 1][7] = 'D'
  return {
    id: 'mart',
    theme: 'mart',
    label: '셔틀마트',
    rows: toRows(g),
    lights: [[2, 3, 3, 5], [9, 3, 3, 5]],
    objects: [
      { kind: 'counter', x: 2, y: 5 },
      { kind: 'shelf', x: 7, y: 6 }, { kind: 'shelf', x: 9, y: 6 }, { kind: 'shelf', x: 11, y: 6 },
      { kind: 'shelf', x: 7, y: 9 }, { kind: 'shelf', x: 9, y: 9 }, { kind: 'shelf', x: 11, y: 9 },
      { kind: 'plant', x: 12, y: 4 },
      { kind: 'plant', x: 1, y: 11 },
      { kind: 'bench', x: 3, y: 11 },
    ],
    warps: [
      { x: 6, y: 12, to: 'town', tx: 31, ty: 11, dir: 0 },
      { x: 7, y: 12, to: 'town', tx: 31, ty: 11, dir: 0 },
    ],
    interacts: [
      { x: 7, y: 6, script: 'martShelf' }, { x: 9, y: 6, script: 'martShelf' }, { x: 11, y: 6, script: 'martShelf' },
      { x: 7, y: 9, script: 'martShelf' }, { x: 9, y: 9, script: 'martShelf' }, { x: 11, y: 9, script: 'martShelf' },
    ],
    npcs: [
      {
        id: 'clerk', name: '마트 점원', x: 2, y: 4, dir: 0, wander: 0, script: 'clerk',
        gender: '여',
        look: { skin: 's2', hair: 'bob', hairColor: '#4a2f1e', eyes: 'oval', outfit: 'polo', top: '#3b82f6', bottom: '#1f2937', bottomStyle: 'long', shoes: '#ffffff', shoeStyle: 'basic', acc: 'none', racket: { model: 'classic', frame: '#3b82f6', string: '#ffffff', grip: '#1f2937', wrap: 'plain' } },
      },
      {
        id: 'shopper', name: '단골 손님', x: 8, y: 7, dir: 3, wander: 1, script: 'shopper',
        gender: '남',
        look: { skin: 's3', hair: 'twoblock', hairColor: '#7b4b26', eyes: 'dot', outfit: 'hoodie', top: '#8b5cf6', bottom: '#3b82f6', bottomStyle: 'shorts', shoes: '#facc15', shoeStyle: 'high', acc: 'glasses', racket: { model: 'nano', frame: '#8b5cf6', string: '#ffffff', grip: '#111827', wrap: 'twotone' } },
      },
    ],
    spawn: { x: 6, y: 12, dir: 1 },
  }
}

// -----------------------------------------------------------------------------------
// ③ 셔틀센터 — 회복 · 우편 · 오늘의 미션 (테마: 분홍)
// -----------------------------------------------------------------------------------
function buildCenter() {
  const W = 14
  const H = 13
  const g = room(W, H, 'f')
  rect(g, 3, 7, 8, 4, 'c')
  g[H - 1][6] = 'D'
  g[H - 1][7] = 'D'
  return {
    id: 'center',
    theme: 'center',
    label: '셔틀센터',
    rows: toRows(g),
    lights: [[2, 3, 3, 6], [9, 3, 3, 6]],
    objects: [
      { kind: 'counter', x: 4, y: 5 },
      { kind: 'plant', x: 1, y: 5 }, { kind: 'plant', x: 12, y: 5 },
      { kind: 'pc', x: 12, y: 9 },
      { kind: 'table', x: 1, y: 11 },
      { kind: 'bench', x: 10, y: 11 },
    ],
    warps: [
      { x: 6, y: 12, to: 'town', tx: 8, ty: 11, dir: 0 },
      { x: 7, y: 12, to: 'town', tx: 8, ty: 11, dir: 0 },
    ],
    interacts: [
      { x: 12, y: 9, script: 'centerPc' },
      { x: 1, y: 11, script: 'centerTable' }, { x: 2, y: 11, script: 'centerTable' },
    ],
    npcs: [
      {
        id: 'nurse', name: '접수원 하나', x: 4, y: 4, dir: 0, wander: 0, script: 'nurse',
        gender: '여',
        look: { skin: 's1', hair: 'long', hairColor: '#e05a7a', eyes: 'happy', outfit: 'tee', top: '#ffffff', bottom: '#ec4899', bottomStyle: 'skirt', shoes: '#ffffff', shoeStyle: 'basic', acc: 'hairpin', racket: { model: 'classic', frame: '#ec4899', string: '#ffffff', grip: '#ffffff', wrap: 'plain' } },
      },
      {
        id: 'resting', name: '쉬는 사람', x: 9, y: 8, dir: 0, wander: 0, script: 'resting',
        gender: '남',
        look: { skin: 's6', hair: 'afro', hairColor: '#2b1d16', eyes: 'sleepy', outfit: 'sleeveless', top: '#f59e0b', bottom: '#1f2937', bottomStyle: 'shorts', shoes: '#10b981', shoeStyle: 'basic', acc: 'wristband', racket: { model: 'power', frame: '#f97316', string: '#ffffff', grip: '#1f2937', wrap: 'plain' } },
      },
    ],
    spawn: { x: 6, y: 12, dir: 1 },
  }
}

// -----------------------------------------------------------------------------------
// ④ 셔틀 체육관 — 코트 6면 (테마: 남색). 코트는 설정한 개수만큼만 깔린다.
// -----------------------------------------------------------------------------------
function buildGym() {
  const W = 22
  const H = 26
  const g = room(W, H, 'G')
  g[H - 1][10] = 'D'
  g[H - 1][11] = 'D'
  return {
    id: 'gym',
    theme: 'gym',
    label: '셔틀 체육관',
    rows: toRows(g),
    lights: [[3, 3, 4, 8], [14, 3, 4, 8]],
    objects: [
      { kind: 'scoreboard', x: 9, y: 3 },
      { kind: 'locker', x: 20, y: 6 }, { kind: 'locker', x: 20, y: 9 },
      { kind: 'locker', x: 20, y: 12 },
      { kind: 'bench', x: 19, y: 17 },
      { kind: 'vending', x: 20, y: 21 },
      { kind: 'counter', x: 14, y: 24 },
      { kind: 'plant', x: 1, y: 24 }, { kind: 'plant', x: 20, y: 24 },
    ],
    // 코트 자리 (아래 왼칸 기준) — courtCount 만큼만 그린다
    courtSpots: [
      { x: 2, y: 12 }, { x: 8, y: 12 }, { x: 14, y: 12 },
      { x: 2, y: 22 }, { x: 8, y: 22 }, { x: 14, y: 22 },
    ],
    warps: [
      { x: 10, y: 25, to: 'town', tx: 19, ty: 10, dir: 0 },
      { x: 11, y: 25, to: 'town', tx: 19, ty: 10, dir: 0 },
    ],
    interacts: [
      { x: 9, y: 3, script: 'gymBoard' },
      { x: 20, y: 21, script: 'vending' },
      { x: 20, y: 6, script: 'gymLocker' },
      { x: 14, y: 24, script: 'gymDesk' }, { x: 15, y: 24, script: 'gymDesk' },
    ],
    npcs: [
      {
        id: 'leader', name: '관장 태호', x: 10, y: 23, dir: 0, wander: 0, script: 'leader',
        gender: '남',
        look: { skin: 's4', hair: 'slick', hairColor: '#2b1d16', eyes: 'sharp', outfit: 'club', top: '#1f2937', bottom: '#1f2937', bottomStyle: 'long', shoes: '#ffffff', shoeStyle: 'pro', acc: 'none', racket: { model: 'neon', frame: '#d4af37', string: '#ffffff', grip: '#111827', wrap: 'spiral' } },
      },
      {
        id: 'referee', name: '심판 보조', x: 19, y: 14, dir: 2, wander: 0, script: 'referee',
        gender: '여',
        look: { skin: 's3', hair: 'ponytail', hairColor: '#2b1d16', eyes: 'oval', outfit: 'raglan', top: '#facc15', bottom: '#1f2937', bottomStyle: 'shorts', shoes: '#ffffff', shoeStyle: 'stripe', acc: 'cap', racket: { model: 'speed', frame: '#facc15', string: '#ffffff', grip: '#1f2937', wrap: 'plain' } },
      },
    ],
    spawn: { x: 10, y: 25, dir: 1 },
  }
}

// -----------------------------------------------------------------------------------
// ⑤ 내 방 — 저장 · 옷장 · PC (테마: 나무)
// -----------------------------------------------------------------------------------
function buildHome() {
  const W = 12
  const H = 11
  const g = room(W, H, 'F')
  rect(g, 4, 7, 5, 3, 'c')
  g[H - 1][5] = 'D'
  g[H - 1][6] = 'D'
  return {
    id: 'home',
    theme: 'home',
    label: '내 방',
    rows: toRows(g),
    lights: [[2, 3, 3, 5], [7, 3, 3, 5]],
    objects: [
      { kind: 'bed', x: 1, y: 5 },
      { kind: 'locker', x: 4, y: 5 },
      { kind: 'pc', x: 7, y: 5 },
      { kind: 'tv', x: 8, y: 9 },
      { kind: 'table', x: 2, y: 9 },
      { kind: 'plant', x: 10, y: 5 },
    ],
    warps: [
      { x: 5, y: 10, to: 'town', tx: 7, ty: 26, dir: 0 },
      { x: 6, y: 10, to: 'town', tx: 7, ty: 26, dir: 0 },
    ],
    interacts: [
      { x: 1, y: 5, script: 'bed' }, { x: 2, y: 5, script: 'bed' },
      { x: 4, y: 5, script: 'closet' },
      { x: 7, y: 5, script: 'homePc' },
      { x: 8, y: 9, script: 'homeTv' }, { x: 9, y: 9, script: 'homeTv' },
    ],
    npcs: [],
    spawn: { x: 5, y: 8, dir: 0 },
  }
}

// -----------------------------------------------------------------------------------
// ⑥ 뽑기 코너 — 셔틀콕 뽑기 · 리프팅 미니게임 (테마: 보라)
// -----------------------------------------------------------------------------------
function buildArcade() {
  const W = 14
  const H = 13
  const g = room(W, H, 'f')
  g[H - 1][6] = 'D'
  g[H - 1][7] = 'D'
  return {
    id: 'arcade',
    theme: 'arcade',
    label: '뽑기 코너',
    rows: toRows(g),
    objects: [
      { kind: 'counter', x: 9, y: 5 },
      { kind: 'machine', x: 2, y: 6, variant: 0 },
      { kind: 'machine', x: 4, y: 6, variant: 1 },
      { kind: 'machine', x: 6, y: 6, variant: 2 },
      { kind: 'machine', x: 2, y: 10, variant: 2 },
      { kind: 'machine', x: 4, y: 10, variant: 0 },
      { kind: 'machine', x: 11, y: 10, variant: 1 },
      { kind: 'plant', x: 12, y: 4 },
      { kind: 'bench', x: 8, y: 11 },
    ],
    warps: [
      { x: 6, y: 12, to: 'town', tx: 30, ty: 26, dir: 0 },
      { x: 7, y: 12, to: 'town', tx: 30, ty: 26, dir: 0 },
    ],
    interacts: [
      { x: 2, y: 6, script: 'gachaMachine' }, { x: 4, y: 6, script: 'gachaMachine' },
      { x: 6, y: 6, script: 'gachaMachine' },
      { x: 2, y: 10, script: 'gachaMachine' }, { x: 4, y: 10, script: 'gachaMachine' },
      { x: 11, y: 10, script: 'liftMachine' },
    ],
    npcs: [
      {
        id: 'arcadeClerk', name: '코너 직원', x: 9, y: 4, dir: 0, wander: 0, script: 'arcadeClerk',
        gender: '남',
        look: { skin: 's2', hair: 'mohawk', hairColor: '#c04ad6', eyes: 'sparkle', outfit: 'number', top: '#8b5cf6', bottom: '#111827', bottomStyle: 'long', shoes: '#facc15', shoeStyle: 'high', acc: 'glasses', racket: { model: 'neon', frame: '#c04ad6', string: '#ffffff', grip: '#facc15', wrap: 'twotone' } },
      },
    ],
    spawn: { x: 6, y: 12, dir: 1 },
  }
}

// -----------------------------------------------------------------------------------
// 지도 묶음 + 충돌표 계산
// -----------------------------------------------------------------------------------
const RAW = {
  town: buildTown(),
  mart: buildMart(),
  center: buildCenter(),
  gym: buildGym(),
  home: buildHome(),
  arcade: buildArcade(),
}

/** 타일 + 오브젝트로부터 「못 지나가는 칸」 표를 만든다 */
function bakeSolid(map, TILES) {
  const h = map.rows.length
  const w = map.rows[0].length
  const solid = Array.from({ length: h }, () => new Uint8Array(w))
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const def = TILES[map.rows[y][x]]
      if (def?.solid) solid[y][x] = 1
    }
  }
  const mark = (kind, bx, by) => {
    const def = OBJECTS[kind]
    if (!def) return
    const top = by - def.h + 1
    const doorX = def.door ? bx + def.door[0] : null
    const doorY = def.door ? top + def.door[1] : null
    for (let r = 0; r < (def.solidRows ?? 1); r++) {
      const y = by - r
      for (let i = 0; i < def.w; i++) {
        const x = bx + i
        if (doorX === x && doorY === y) continue
        if (solid[y]) solid[y][x] = 1
      }
    }
  }
  map.objects.forEach((o) => mark(o.kind, o.x, o.y))
  // 지도 문자로 심어 둔 나무·덤불도 같은 규칙으로 막는다
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (map.rows[y][x] === '#') solid[y][x] = 1
    }
  }
  return { solid, w, h }
}

/** '#' 문자를 실제 나무 오브젝트로 바꿔 심는다 (지도 글자는 잔디로 되돌린다) */
function growTrees(map) {
  const rows = map.rows.map((r) => r.split(''))
  const extra = []
  for (let y = 0; y < rows.length; y++) {
    for (let x = 0; x < rows[y].length; x++) {
      if (rows[y][x] === '#') {
        rows[y][x] = '.'
        extra.push({ kind: (x + y) % 3 === 0 ? 'pine' : 'tree', x, y, variant: (x * 7 + y * 13) % 5 })
      }
    }
  }
  map.rows = rows.map((r) => r.join(''))
  map.objects = [...extra, ...map.objects]
  return map
}

let prepared = null

/** 지도를 쓸 수 있는 형태로 준비 (한 번만) */
export function getMaps(TILES) {
  if (prepared) return prepared
  prepared = {}
  Object.entries(RAW).forEach(([id, m]) => {
    // '#' 를 진짜 나무로 바꾼 뒤 충돌표를 굽는다 (나무도 발밑 한 칸만 막는다)
    const map = growTrees({ ...m, rows: [...m.rows], objects: [...m.objects] })
    const { solid, w, h } = bakeSolid(map, TILES)
    // 문 앞 매트는 반드시 밟을 수 있어야 한다
    ;(map.warps || []).forEach((wp) => { if (solid[wp.y]) solid[wp.y][wp.x] = 0 })
    map.solid = solid
    map.w = w
    map.h = h
    // 빠른 조회용 색인
    map.warpAt = new Map((map.warps || []).map((wp) => [`${wp.x},${wp.y}`, wp]))
    map.interactAt = new Map((map.interacts || []).map((it) => [`${it.x},${it.y}`, it]))
    prepared[id] = map
  })
  return prepared
}

/** 체육관 코트 i 의 4개 자리 (타일 단위 실수 좌표) */
export function courtSlot(spot, slot) {
  // 코트는 5칸 x 9칸. 위쪽이 상대팀, 아래쪽이 우리팀.
  const left = spot.x
  const top = spot.y - 8
  const off = [
    [1.2, 6.4], [3.0, 7.6], // 0,1 = 아래팀
    [3.0, 1.4], [1.2, 2.6], // 2,3 = 위팀
  ][slot] || [2, 4]
  return { x: left + off[0], y: top + off[1], dir: slot < 2 ? 1 : 0 }
}
