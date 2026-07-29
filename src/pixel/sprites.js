// ===================================================================================
// 셔틀몬스터 — 2D 캐릭터 스프라이트
//
// 기존 3D 캐릭터가 쓰던 look 데이터(피부/머리/눈/의상/하의/신발/액세서리/라켓)를
// 그대로 받아, 16x24 픽셀 도트 캐릭터로 다시 그린다.
//
// 포켓몬 도트의 핵심은 「검은 외곽선」이다. 몸을 다 그린 뒤 실루엣 바깥을 한 겹
// 어둡게 둘러 주면, 잔디 위에서도 실내 마루 위에서도 형태가 또렷하게 읽힌다.
// 한 사람당 시트 1장(4방향 x 4프레임)을 구워 두고 계속 재사용한다.
// ===================================================================================
import { SKIN_TONES } from '../game/constants.js'

export const CW = 16 // 캐릭터 칸 가로
export const CH = 24 // 캐릭터 칸 세로 (발끝이 22, 그림자가 23)

export const DIR = { down: 0, up: 1, left: 2, right: 3 }

const INK = [26, 32, 50] // 외곽선 색

const P = (g, x, y, w, h, c) => {
  g.fillStyle = c
  g.fillRect(x | 0, y | 0, w | 0, h | 0)
}
const dot = (g, x, y, c) => P(g, x, y, 1, 1, c)

function shade(hex, amt) {
  if (!hex || hex[0] !== '#') return hex
  const n = parseInt(hex.slice(1), 16)
  const cl = (v) => Math.max(0, Math.min(255, Math.round(v)))
  const r = cl(((n >> 16) & 255) + amt)
  const g = cl(((n >> 8) & 255) + amt)
  const b = cl((n & 255) + amt)
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}

const skinOf = (id) => SKIN_TONES.find((s) => s.id === id)?.color || '#fdd0ae'

// 몸 배치 (16x24 기준) — 머리 : 몸 = 대략 4 : 6 의 데포르메 비율
const HX = 4, HW = 8, HY = 2, HH = 9   // 머리 y2..10
const NY = 11                           // 목
const TX = 4, TW = 8, TY = 11, TH = 7   // 몸통 y11..17 (양 끝 칸이 팔)
const LY = 18, LH = 3                   // 다리 y18..20
const SY = 21, SH = 2                   // 신발 y21..22

// -----------------------------------------------------------------------------------
// 머리 모양 — 18종
// -----------------------------------------------------------------------------------
function drawHair(g, style, c, dir, behind) {
  const lo = shade(c, -30)
  const hi = shade(c, 34)
  const y = HY
  const back = dir === DIR.up

  // 뒤에 깔리는 부분(긴 머리) 과 앞에 얹는 부분을 나눠 그린다
  if (behind) {
    switch (style) {
      case 'long': P(g, HX, y + 3, HW, 10, c); P(g, HX, y + 3, 2, 10, lo); P(g, HX + HW - 2, y + 3, 2, 10, lo); break
      case 'hime': P(g, HX, y + 3, HW, 11, c); P(g, HX, y + 3, 2, 11, hi); P(g, HX + HW - 2, y + 3, 2, 11, hi); break
      case 'wave': P(g, HX - 1, y + 3, HW + 2, 11, c); for (let i = 0; i < 4; i++) { P(g, HX - 1 + (i % 2), y + 5 + i * 2, 2, 2, hi); P(g, HX + HW - 1 - (i % 2), y + 5 + i * 2, 2, 2, hi) } break
      case 'curly': P(g, HX - 1, y + 3, HW + 2, 9, c); for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; P(g, 8 + Math.cos(a) * 5 - 1, y + 6 + Math.sin(a) * 3, 2, 2, hi) } break
      case 'braid': P(g, HX - 1, y + 3, HW + 2, 8, c); break
      case 'bob': P(g, HX - 1, y + 3, HW + 2, 8, c); P(g, HX - 1, y + 3, 2, 8, lo); P(g, HX + HW - 1, y + 3, 2, 8, lo); break
      case 'afro': for (let i = -2; i <= 12; i++) { const w = Math.round(Math.sqrt(Math.max(0, 40 - (i - 4) * (i - 4) * 1.1))); if (w > 0) P(g, 8 - w, y - 3 + i, w * 2, 1, c) } break
      default: break
    }
    return
  }

  const cap = (h = 4) => {
    P(g, HX, y, HW, h, c)
    P(g, HX - 1, y + 1, 1, h - 1, c)
    P(g, HX + HW, y + 1, 1, h - 1, c)
    P(g, HX + 1, y - 1, HW - 2, 1, c)
    P(g, HX + 1, y, 2, 1, hi)
  }
  const sides = (h) => {
    P(g, HX - 1, y + 1, 2, h, c)
    P(g, HX + HW - 1, y + 1, 2, h, c)
  }

  switch (style) {
    case 'buzz': P(g, HX, y, HW, 3, c); P(g, HX + 1, y, 3, 1, hi); break
    case 'short': cap(4); sides(5); break
    case 'sidepart': cap(4); P(g, HX + 5, y, 3, 2, hi); P(g, HX - 1, y + 3, 2, 4, c); break
    case 'twoblock': cap(5); P(g, HX - 1, y + 5, HW + 2, 1, lo); break
    case 'slick': cap(3); P(g, HX + 1, y - 2, HW - 2, 2, c); P(g, HX + 2, y - 2, 2, 1, hi); break
    case 'pixie': cap(4); sides(6); P(g, HX - 2, y + 4, 2, 3, c); break
    case 'spiky':
      cap(3)
      for (let i = 0; i < 4; i++) P(g, HX + i * 2, y - 3 + (i % 2), 2, 4, c)
      P(g, HX + 1, y - 2, 1, 2, hi)
      break
    case 'mohawk':
      P(g, HX + 2, y - 4, 4, 8, c)
      P(g, HX + 3, y - 4, 1, 6, hi)
      P(g, HX - 1, y + 1, 2, 3, lo)
      P(g, HX + HW - 1, y + 1, 2, 3, lo)
      break
    case 'afro':
      for (let i = -2; i <= 8; i++) {
        const w = Math.round(Math.sqrt(Math.max(0, 40 - (i - 3) * (i - 3) * 1.1)))
        if (w > 0) P(g, 8 - w, y - 3 + i, w * 2, 1, c)
      }
      P(g, HX - 1, y - 2, 3, 2, hi)
      break
    case 'bob': cap(4); sides(7); break
    case 'long': cap(4); sides(9); break
    case 'hime': cap(4); sides(9); P(g, HX + 1, y + 3, HW - 2, 1, lo); break
    case 'wave': cap(4); sides(7); break
    case 'curly': cap(4); sides(5); for (let i = 0; i < 3; i++) P(g, HX + i * 3, y - 1, 2, 2, hi); break
    case 'braid':
      cap(4); sides(6)
      if (!back) for (let i = 0; i < 4; i++) P(g, HX + HW, y + 6 + i * 2, 2, 2, i % 2 ? hi : c)
      else for (let i = 0; i < 4; i++) P(g, 7 + (i % 2), y + 9 + i * 2, 2, 2, i % 2 ? hi : c)
      break
    case 'ponytail':
      cap(4); sides(5)
      if (back) { P(g, 7, y + 4, 3, 10, c); P(g, 7, y + 4, 1, 10, hi) }
      else { P(g, HX + HW, y + 3, 3, 9, c); P(g, HX + HW, y + 3, 1, 6, hi) }
      break
    case 'twintail':
      cap(4); sides(5)
      P(g, HX - 3, y + 3, 3, 9, c)
      P(g, HX + HW, y + 3, 3, 9, c)
      P(g, HX - 3, y + 3, 1, 6, hi)
      break
    case 'bun':
      cap(4); sides(4)
      P(g, 6, y - 4, 5, 4, c)
      P(g, 7, y - 4, 2, 2, hi)
      break
    default: cap(4); sides(5)
  }
}

/** 몸통보다 뒤에 깔아야 하는 머리 모양 */
const LONG_HAIR = new Set(['long', 'hime', 'wave', 'curly', 'braid', 'bob', 'afro'])

// -----------------------------------------------------------------------------------
// 얼굴
// -----------------------------------------------------------------------------------
function drawFace(g, look, dir) {
  if (dir === DIR.up) return
  const eyeY = HY + 5
  const ink = '#241f1c'
  const white = '#ffffff'
  const style = look.eyes || 'oval'
  const pairs = dir === DIR.down ? [[HX + 1, eyeY], [HX + 5, eyeY]]
    : dir === DIR.left ? [[HX, eyeY]] : [[HX + 6, eyeY]]

  pairs.forEach(([x, y]) => {
    switch (style) {
      case 'dot': P(g, x, y, 2, 2, ink); break
      case 'oval': P(g, x, y - 1, 2, 4, white); P(g, x, y, 2, 2, ink); dot(g, x, y, '#ffffff'); break
      case 'happy': dot(g, x, y + 1, ink); dot(g, x + 1, y, ink); dot(g, x + 2, y + 1, ink); break
      case 'sharp': P(g, x, y, 2, 1, ink); dot(g, x, y + 1, ink); break
      case 'sparkle': P(g, x, y - 1, 2, 4, white); P(g, x, y, 2, 2, ink); dot(g, x, y, '#ffffff'); dot(g, x + 1, y + 2, '#ffe8a8'); break
      case 'sleepy': P(g, x, y + 1, 2, 1, ink); dot(g, x + 1, y + 2, ink); break
      default: P(g, x, y, 2, 2, ink)
    }
  })

  if (dir === DIR.down) {
    P(g, 7, HY + 8, 2, 1, shade(skinOf(look.skin), -70))
    dot(g, HX, HY + 7, 'rgba(255,120,120,.55)')
    dot(g, HX + HW - 1, HY + 7, 'rgba(255,120,120,.55)')
  }
}

// -----------------------------------------------------------------------------------
// 상의 + 팔
// -----------------------------------------------------------------------------------
function drawTop(g, look, dir, swing) {
  const c = look.top || '#3b82f6'
  const lo = shade(c, -34)
  const hi = shade(c, 28)
  const skin = skinOf(look.skin)
  const y = TY
  const style = look.outfit || 'tee'

  // 몸통 (어깨~허리)
  P(g, TX + 1, y, TW - 2, TH, c)
  P(g, TX + 1, y, TW - 2, 1, hi)
  P(g, TX + 1, y + TH - 1, TW - 2, 1, lo)

  // 팔 — 걸을 때 앞뒤로 흔들린다
  const sleeveC = style === 'raglan' ? shade(c, -60) : c
  const armT = style === 'sleeveless' ? 0 : 3
  const la = swing, ra = -swing
  if (armT) {
    P(g, TX, y + 1 + la, 1, armT, sleeveC)
    P(g, TX + TW - 1, y + 1 + ra, 1, armT, sleeveC)
  }
  P(g, TX, y + 1 + armT + la, 1, TH - armT - 1, skin)
  P(g, TX + TW - 1, y + 1 + armT + ra, 1, TH - armT - 1, skin)

  switch (style) {
    case 'vneck':
      P(g, 7, y, 2, 2, skin)
      dot(g, 6, y, skin); dot(g, 9, y, skin)
      break
    case 'polo':
      P(g, TX + 1, y, TW - 2, 1, '#ffffff')
      P(g, 7, y, 2, 3, shade(c, 44))
      dot(g, 7, y + 1, lo)
      break
    case 'stripe':
      for (let i = 1; i < TH - 1; i += 2) P(g, TX + 1, y + i, TW - 2, 1, shade(c, -55))
      break
    case 'raglan':
      P(g, TX + 1, y, TW - 2, 1, '#ffffff')
      break
    case 'zipup':
      P(g, 7, y, 1, TH, shade(c, -65))
      P(g, 8, y, 1, TH, shade(c, 48))
      P(g, TX + 1, y, TW - 2, 1, '#ffffff')
      break
    case 'number':
      P(g, 6, y + 2, 4, 4, '#ffffff')
      P(g, 7, y + 3, 2, 2, lo)
      break
    case 'sash':
      for (let i = 0; i < TH; i++) P(g, TX + 1 + Math.min(i, TW - 4), y + i, 3, 1, shade(c, -60))
      break
    case 'hoodie':
      P(g, TX, y - 1, TW, 2, shade(c, -42))
      P(g, 7, y + 2, 1, 3, shade(c, -65))
      P(g, TX + 1, y + TH - 2, TW - 2, 1, lo)
      break
    case 'club':
      P(g, TX + 1, y, TW - 2, 2, shade(c, -55))
      P(g, TX + 1, y + 2, TW - 2, 1, '#ffffff')
      break
    default: break
  }
}

// -----------------------------------------------------------------------------------
// 하의 / 신발
// -----------------------------------------------------------------------------------
function drawBottom(g, look, gender, dir, step) {
  const c = look.bottom || '#1f2937'
  const lo = shade(c, -30)
  const hi = shade(c, 22)
  const skin = skinOf(look.skin)
  const style = look.bottomStyle || (gender === '여' ? 'skirt' : 'shorts')
  const y = LY

  if (style === 'skirt' || style === 'skirtLayer') {
    P(g, TX + 1, y - 1, TW - 2, 2, c)
    P(g, TX, y + 1, TW, 2, c)
    P(g, TX, y + 2, TW, 1, lo)
    if (style === 'skirtLayer') P(g, TX + 1, y + 3, TW - 2, 1, shade(c, 40))
    P(g, 5, y + 3, 2, 1, skin)
    P(g, 9, y + 3, 2, 1, skin)
  } else if (style === 'long' || style === 'leggings') {
    const w = style === 'leggings' ? 2 : 3
    P(g, 5, y, w, 4, c)
    P(g, 16 - 5 - w, y, w, 4, c)
    P(g, 5, y, 1, 4, hi)
    P(g, 8, y, 1, 2, lo) // 다리 사이 그늘
    if (style === 'leggings') {
      P(g, 5, y + 3, w, 1, lo)
      P(g, 16 - 5 - w, y + 3, w, 1, lo)
    }
  } else {
    P(g, TX + 1, y, TW - 2, 3, c)
    P(g, 8, y, 1, 3, lo)
    P(g, 5, y + 3, 2, 1, skin)
    P(g, 9, y + 3, 2, 1, skin)
  }

  // 신발 — 걸을 때 한쪽이 올라간다
  const s = look.shoes || '#ffffff'
  const sStyle = look.shoeStyle || 'basic'
  const h = sStyle === 'high' ? 3 : 2
  const base = SY - (h - 2)
  const ly = base + (step > 0 ? -1 : 0)
  const ry = base + (step < 0 ? -1 : 0)
  P(g, 4, ly, 3, h, s)
  P(g, 9, ry, 3, h, s)
  P(g, 4, ly + h - 1, 3, 1, shade(s, -55))
  P(g, 9, ry + h - 1, 3, 1, shade(s, -55))
  if (sStyle === 'stripe') { P(g, 4, ly, 3, 1, '#ffffff'); P(g, 9, ry, 3, 1, '#ffffff') }
  if (sStyle === 'pro') { dot(g, 4, ly, '#ff4d4d'); dot(g, 11, ry, '#ff4d4d') }
}

// -----------------------------------------------------------------------------------
// 액세서리
// -----------------------------------------------------------------------------------
function drawAcc(g, look, dir) {
  const y = HY
  switch (look.acc) {
    case 'cap':
      P(g, HX - 1, y, HW + 2, 3, '#2a4bd0')
      P(g, HX, y - 1, HW, 1, '#2a4bd0')
      if (dir !== DIR.up) P(g, HX - 2, y + 3, HW + 4, 1, '#1a37a8')
      else P(g, HX + 2, y + 1, 4, 2, '#ffffff')
      P(g, HX + 1, y, 2, 1, '#4a6bf0')
      break
    case 'visor':
      P(g, HX - 1, y + 1, HW + 2, 2, '#ff5c8a')
      if (dir !== DIR.up) P(g, HX - 2, y + 3, HW + 4, 1, '#e03a68')
      break
    case 'headband':
      P(g, HX - 1, y + 3, HW + 2, 2, '#ff4d4d')
      P(g, HX, y + 3, 2, 1, '#ff9a9a')
      break
    case 'hairpin':
      P(g, HX + HW - 2, y + 2, 3, 1, '#ffd84a')
      dot(g, HX + HW - 1, y + 1, '#ffd84a')
      break
    case 'glasses':
      if (dir !== DIR.up) {
        P(g, HX, HY + 4, 3, 3, '#2a3550')
        P(g, HX + 5, HY + 4, 3, 3, '#2a3550')
        dot(g, HX + 1, HY + 5, '#9fd8ff')
        dot(g, HX + 6, HY + 5, '#9fd8ff')
        P(g, HX + 3, HY + 5, 2, 1, '#2a3550')
      }
      break
    case 'mask':
      if (dir !== DIR.up) {
        P(g, HX, HY + 6, HW, 3, '#f4f6fa')
        P(g, HX, HY + 6, HW, 1, '#d8dce6')
        dot(g, HX - 1, HY + 6, '#d8dce6')
        dot(g, HX + HW, HY + 6, '#d8dce6')
      }
      break
    case 'towel':
      P(g, TX + 1, TY, TW - 2, 2, '#f0f4f8')
      P(g, TX + 2, TY + 2, 2, 3, '#f0f4f8')
      P(g, TX + TW - 4, TY + 2, 2, 3, '#e0e6ec')
      break
    case 'wristband':
      P(g, TX, TY + 5, 1, 2, '#ff4d4d')
      P(g, TX + TW - 1, TY + 5, 1, 2, '#ff4d4d')
      break
    case 'crown':
      P(g, HX, y - 3, HW, 3, '#ffd21f')
      P(g, HX, y - 5, 1, 2, '#ffd21f')
      P(g, HX + 3, y - 6, 2, 3, '#ffd21f')
      P(g, HX + HW - 1, y - 5, 1, 2, '#ffd21f')
      dot(g, HX + 3, y - 5, '#ff5c8a')
      break
    default: break
  }
}

// -----------------------------------------------------------------------------------
// 라켓 — 몸 옆으로 비켜 들어서 실루엣을 안 가린다
// -----------------------------------------------------------------------------------
function drawRacket(g, look, dir, swing, behind) {
  const r = look.racket || {}
  const frame = r.frame || '#ef4444'
  const grip = r.grip || '#1f2937'
  const str = r.string || '#ffffff'

  // 뒤통수 방향일 때만 몸보다 먼저(뒤에) 그린다
  if ((dir === DIR.up) !== behind) return

  const right = dir !== DIR.left
  const x = right ? 11 : 1          // 라켓 머리는 4칸 폭 (x .. x+3)
  const gx = right ? x + 1 : x + 2  // 손잡이 위치
  const y = TY + 3 - swing

  // 손잡이
  P(g, gx, y, 1, 4, grip)
  if (r.wrap === 'spiral') { dot(g, gx, y + 1, shade(grip, 55)); dot(g, gx, y + 3, shade(grip, 55)) }
  if (r.wrap === 'twotone') P(g, gx, y + 2, 1, 2, shade(grip, 65))

  // 라켓 머리 — 프레임 안에 스트링. 네 귀퉁이를 파내 타원처럼 보이게 한다.
  const hy = y - 6
  P(g, x, hy, 4, 6, frame)
  P(g, x + 1, hy + 1, 2, 4, str)
  dot(g, x + 1, hy + 2, shade(str, -45))
  dot(g, x + 2, hy + 3, shade(str, -45))
  g.clearRect(x, hy, 1, 1)
  g.clearRect(x + 3, hy, 1, 1)
  g.clearRect(x, hy + 5, 1, 1)
  g.clearRect(x + 3, hy + 5, 1, 1)
}

// -----------------------------------------------------------------------------------
// 외곽선 — 실루엣 바깥을 한 겹 어둡게 둘러 형태를 또렷하게
// -----------------------------------------------------------------------------------
function addOutline(ctx, w, h) {
  const img = ctx.getImageData(0, 0, w, h)
  const d = img.data
  const on = new Uint8Array(w * h)
  for (let i = 0; i < w * h; i++) on[i] = d[i * 4 + 3] > 24 ? 1 : 0
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      if (on[i]) continue
      const near =
        (x > 0 && on[i - 1]) || (x < w - 1 && on[i + 1]) ||
        (y > 0 && on[i - w]) || (y < h - 1 && on[i + w])
      if (!near) continue
      const o = i * 4
      d[o] = INK[0]; d[o + 1] = INK[1]; d[o + 2] = INK[2]; d[o + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
}

// -----------------------------------------------------------------------------------
// 한 프레임
// -----------------------------------------------------------------------------------
let bufC = null
let bufG = null
function buffer() {
  if (!bufC) {
    bufC = document.createElement('canvas')
    bufC.width = CW
    bufC.height = CH
    bufG = bufC.getContext('2d', { willReadFrequently: true })
    bufG.imageSmoothingEnabled = false
  }
  bufG.clearRect(0, 0, CW, CH)
  return bufG
}

function drawBody(g, look, gender, dir, frame) {
  const skin = skinOf(look.skin)
  const skinLo = shade(skin, -38)
  // 0,2 = 서 있기 / 1 = 왼발 / 3 = 오른발
  const step = frame === 1 ? 1 : frame === 3 ? -1 : 0
  const swing = step
  const hair = look.hair || 'short'
  const hairC = look.hairColor || '#2b1d16'

  drawRacket(g, look, dir, swing, true)
  if (LONG_HAIR.has(hair)) drawHair(g, hair, hairC, dir, true)

  drawBottom(g, look, gender, dir, step)
  drawTop(g, look, dir, swing)

  // 목 · 머리
  P(g, 6, NY - 1, 4, 2, skinLo)
  P(g, HX, HY, HW, HH, skin)
  P(g, HX, HY + HH - 1, HW, 1, skinLo)
  P(g, HX - 1, HY + 3, 1, 3, skin) // 귀
  P(g, HX + HW, HY + 3, 1, 3, skin)

  drawHair(g, hair, hairC, dir, false)
  drawFace(g, look, dir)
  drawAcc(g, look, dir)
  drawRacket(g, look, dir, swing, false)
}

function drawFrame(g, look, gender, dir, frame) {
  // 발밑 그림자는 외곽선 대상이 아니므로 따로 먼저 깔아 둔다
  g.fillStyle = 'rgba(20,26,44,.24)'
  g.beginPath()
  g.ellipse(8, 22.5, 5, 1.8, 0, 0, Math.PI * 2)
  g.fill()

  const b = buffer()
  drawBody(b, look, gender, dir, frame)
  addOutline(b, CW, CH)
  g.drawImage(bufC, 0, 0)
}

// -----------------------------------------------------------------------------------
// 시트 굽기 + 캐시
// -----------------------------------------------------------------------------------
const sheetCache = new Map()

export function lookKey(look, gender) {
  if (!look) return 'none'
  const r = look.racket || {}
  return [
    gender, look.skin, look.hair, look.hairColor, look.eyes, look.outfit,
    look.top, look.bottom, look.bottomStyle, look.shoes, look.shoeStyle,
    look.acc, r.model, r.frame, r.string, r.grip, r.wrap,
  ].join('|')
}

/** 4방향 x 4프레임 시트 (64 x 96) */
export function getSheet(look, gender) {
  const key = lookKey(look, gender)
  const hit = sheetCache.get(key)
  if (hit) return hit
  const c = document.createElement('canvas')
  c.width = CW * 4
  c.height = CH * 4
  const g = c.getContext('2d')
  g.imageSmoothingEnabled = false
  for (let d = 0; d < 4; d++) {
    for (let f = 0; f < 4; f++) {
      g.save()
      g.translate(f * CW, d * CH)
      g.beginPath()
      g.rect(0, 0, CW, CH)
      g.clip()
      drawFrame(g, look, gender, d, f)
      g.restore()
    }
  }
  if (sheetCache.size > 120) sheetCache.clear()
  sheetCache.set(key, c)
  return c
}

/** 화면에 한 명 그리기 — (x,y)는 발이 닿는 지점 */
export function drawActor(ctx, look, gender, dir, frame, x, y) {
  const sheet = getSheet(look, gender)
  ctx.drawImage(sheet, frame * CW, dir * CH, CW, CH, Math.round(x - CW / 2), Math.round(y - CH + 2), CW, CH)
}

/** 캐릭터 메이커용 — 크게 확대해서 한 장 */
export function drawBig(ctx, look, gender, dir, frame, x, y, scale) {
  const sheet = getSheet(look, gender)
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(sheet, frame * CW, dir * CH, CW, CH, x, y, CW * scale, CH * scale)
}

export function clearSpriteCache() {
  sheetCache.clear()
}
