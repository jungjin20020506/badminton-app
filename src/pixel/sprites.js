// ===================================================================================
// 셔틀몬스터 — 캐릭터 스프라이트 (64x96 정밀)
//
// 멀리서 보면 도트, 가까이서 보면 진짜 사람.
// 그 두 가지를 같이 만족시키려고 해상도를 타일(32px)의 두 배로 잡았다.
//   · 눈 — 흰자 / 홍채 / 동공 / 하이라이트를 따로 찍는다
//   · 얼굴 — 눈썹 · 코 그늘 · 입꼬리 · 볼 홍조 · 턱 그림자
//   · 옷 — 칼라 · 소매단 · 밑단 · 봉제선 · 주름(사선 그늘)
//   · 라켓 — 프레임 링 · 스트링 격자 · 샤프트 · 그립 감기
// 실루엣 바깥은 어두운 외곽선으로 둘러 잔디 위에서도 형태가 또렷하다.
// ===================================================================================
import { SKIN_TONES } from '../game/constants.js'

export const CW = 64  // 캐릭터 칸 가로 (타일의 2배 밀도)
export const CH = 96  // 캐릭터 칸 세로

export const DIR = { down: 0, up: 1, left: 2, right: 3 }

const INK = [26, 30, 46]

const P = (g, x, y, w, h, c) => {
  g.fillStyle = c
  g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h))
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

function ramp(hex) {
  return {
    hi3: shade(hex, 62),
    hi2: shade(hex, 40),
    hi: shade(hex, 20),
    base: hex,
    lo: shade(hex, -22),
    lo2: shade(hex, -46),
    deep: shade(hex, -74),
    ink: shade(hex, -110),
  }
}

const skinOf = (id) => SKIN_TONES.find((s) => s.id === id)?.color || '#fdd0ae'

// 몸 배치 (64x96) — 발끝 89, 그림자 90
const HX = 18, HW = 28, HY = 8, HH = 36    // 머리 y8..43
const NY = 44                               // 목
const TX = 16, TW = 32, TY = 44, TH = 26    // 몸통 y44..69 (양 끝 6칸이 팔)
const LY = 70                               // 다리 y70..81
const SY = 82                               // 신발 y82..89

// -----------------------------------------------------------------------------------
// 머리 모양
// -----------------------------------------------------------------------------------
function drawHair(g, style, color, dir, behind) {
  const r = ramp(color)
  const y = HY
  const back = dir === DIR.up
  const ink = r.ink

  if (behind) {
    const long = (len, tone) => {
      P(g, HX - 2, y + 12, HW + 4, len, r.base)
      P(g, HX - 2, y + 12, 5, len, tone || r.lo)
      P(g, HX + HW - 3, y + 12, 5, len, r.lo2)
      P(g, HX + 2, y + 12, 4, Math.floor(len * 0.65), r.hi)
      for (let i = 0; i < 5; i++) P(g, HX + 1 + i * 6, y + 14, 1, len - 4, i % 2 ? r.lo2 : r.hi)
      P(g, HX - 2, y + 12 + len - 3, HW + 4, 3, r.deep)
    }
    switch (style) {
      case 'long': long(42); break
      case 'hime': long(46, r.hi); break
      case 'wave':
        long(38)
        for (let i = 0; i < 6; i++) {
          P(g, HX - 4 + (i % 2) * 4, y + 18 + i * 7, 7, 7, r.hi)
          P(g, HX + HW - 3 - (i % 2) * 4, y + 18 + i * 7, 7, 7, r.lo2)
        }
        break
      case 'curly':
        long(30)
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * Math.PI * 2
          P(g, 32 + Math.cos(a) * 20 - 4, y + 26 + Math.sin(a) * 14, 8, 8, i % 2 ? r.hi : r.lo2)
        }
        break
      case 'braid': long(30); break
      case 'bob': long(26); break
      case 'afro':
        for (let i = -10; i <= 48; i++) {
          const w = Math.round(Math.sqrt(Math.max(0, 660 - (i - 16) * (i - 16) * 1.05)))
          if (w > 0) P(g, 32 - w, y - 10 + i, w * 2, 1, i < 12 ? r.hi : r.base)
        }
        break
      default: break
    }
    return
  }

  const cap = (h = 16) => {
    P(g, HX - 2, y - 2, HW + 4, h, r.base)
    P(g, HX + 2, y - 5, HW - 4, 4, r.base)
    P(g, HX + 3, y - 3, 10, 6, r.hi3)
    P(g, HX + 13, y - 2, 8, 4, r.hi2)
    for (let i = 0; i < 6; i++) P(g, HX + i * 5, y + 1, 1, h - 4, r.lo)
    P(g, HX - 2, y + h - 4, HW + 4, 4, ink)
    P(g, HX, y + h, HW, 5, 'rgba(28,22,40,.26)')
  }
  const sides = (h) => {
    P(g, HX - 4, y + 4, 6, h, r.base)
    P(g, HX + HW - 2, y + 4, 6, h, r.lo)
    P(g, HX - 4, y + 4, 3, Math.floor(h * 0.6), r.hi2)
    P(g, HX - 4, y + 4 + h - 3, 6, 3, ink)
    P(g, HX + HW - 2, y + 4 + h - 3, 6, 3, ink)
    P(g, HX + 2, y + 4, 2, h - 3, ink)
    P(g, HX + HW - 4, y + 4, 2, h - 3, ink)
  }

  switch (style) {
    case 'buzz':
      P(g, HX - 2, y - 2, HW + 4, 12, r.base)
      P(g, HX + 3, y - 2, 12, 4, r.hi3)
      P(g, HX - 2, y + 8, HW + 4, 4, ink)
      break
    case 'short': cap(16); sides(18); break
    case 'sidepart':
      cap(16)
      P(g, HX + 16, y - 2, 12, 8, r.hi3)
      P(g, HX + 15, y - 2, 2, 14, r.deep)
      P(g, HX - 4, y + 10, 7, 16, r.base)
      break
    case 'twoblock': cap(20); P(g, HX - 4, y + 18, HW + 8, 4, r.deep); break
    case 'slick':
      cap(12)
      P(g, HX + 2, y - 10, HW - 4, 10, r.base)
      P(g, HX + 5, y - 10, 8, 6, r.hi3)
      for (let i = 0; i < 6; i++) P(g, HX + 3 + i * 4, y - 9, 2, 12, r.lo2)
      break
    case 'pixie': cap(16); sides(22); P(g, HX - 8, y + 16, 7, 12, r.base); break
    case 'spiky':
      cap(12)
      for (let i = 0; i < 6; i++) {
        const sx = HX - 2 + i * 5
        const sh = 14 + (i % 2) * 7
        P(g, sx, y - sh, 6, sh + 6, r.base)
        P(g, sx, y - sh, 2, sh, r.hi2)
        P(g, sx + 4, y - sh + 3, 1, sh - 3, r.lo2)
      }
      break
    case 'mohawk':
      P(g, HX + 8, y - 18, 13, 32, r.base)
      P(g, HX + 10, y - 18, 4, 24, r.hi3)
      P(g, HX + 18, y - 14, 2, 22, r.lo2)
      P(g, HX - 4, y + 4, 7, 12, r.lo2)
      P(g, HX + HW - 3, y + 4, 7, 12, r.lo2)
      break
    case 'afro':
      for (let i = -10; i <= 28; i++) {
        const w = Math.round(Math.sqrt(Math.max(0, 660 - (i - 12) * (i - 12) * 1.05)))
        if (w > 0) P(g, 32 - w, y - 10 + i, w * 2, 1, i < 6 ? r.hi : r.base)
      }
      P(g, HX - 6, y - 8, 12, 8, r.hi3)
      for (let i = 0; i < 30; i++) {
        const a = (i / 30) * Math.PI * 2
        P(g, 32 + Math.cos(a) * 23 - 2, y + 8 + Math.sin(a) * 20, 4, 4, i % 3 ? r.lo2 : r.hi)
      }
      break
    case 'bob': cap(16); sides(26); break
    case 'long': cap(16); sides(34); break
    case 'hime': cap(16); sides(34); P(g, HX + 2, y + 12, HW - 4, 4, r.deep); break
    case 'wave': cap(16); sides(26); break
    case 'curly':
      cap(16); sides(18)
      for (let i = 0; i < 6; i++) P(g, HX + i * 5, y - 7, 8, 8, r.hi)
      break
    case 'braid':
      cap(16); sides(22)
      if (!back) for (let i = 0; i < 6; i++) P(g, HX + HW, y + 22 + i * 7, 8, 8, i % 2 ? r.hi : r.base)
      else for (let i = 0; i < 6; i++) P(g, 28 + (i % 2) * 4, y + 34 + i * 7, 8, 8, i % 2 ? r.hi : r.base)
      break
    case 'ponytail':
      cap(16); sides(18)
      if (back) { P(g, 27, y + 16, 12, 40, r.base); P(g, 27, y + 16, 4, 36, r.hi2) }
      else { P(g, HX + HW, y + 10, 12, 36, r.base); P(g, HX + HW, y + 10, 4, 24, r.hi2) }
      break
    case 'twintail':
      cap(16); sides(18)
      P(g, HX - 13, y + 10, 12, 36, r.base)
      P(g, HX + HW, y + 10, 12, 36, r.lo)
      P(g, HX - 13, y + 10, 4, 24, r.hi2)
      P(g, HX - 13, y + 42, 12, 4, r.deep)
      break
    case 'bun':
      cap(16); sides(14)
      P(g, 22, y - 18, 20, 18, r.base)
      P(g, 25, y - 17, 8, 8, r.hi3)
      P(g, 22, y - 4, 20, 4, r.deep)
      break
    default: cap(16); sides(18)
  }
}

const LONG_HAIR = new Set(['long', 'hime', 'wave', 'curly', 'braid', 'bob', 'afro'])

// -----------------------------------------------------------------------------------
// 얼굴 — 눈 · 눈썹 · 코 · 입
// -----------------------------------------------------------------------------------
function drawEye(g, x, y, style, hairC) {
  const white = '#ffffff'
  const iris = '#5a4634'
  const pupil = '#1a1410'
  switch (style) {
    case 'dot':
      P(g, x + 1, y + 1, 5, 7, pupil)
      P(g, x + 2, y + 2, 2, 2, '#5a5048')
      break
    case 'happy':
      P(g, x, y + 5, 2, 2, pupil); P(g, x + 2, y + 3, 2, 2, pupil)
      P(g, x + 4, y + 5, 2, 2, pupil); P(g, x + 6, y + 7, 1, 1, pupil)
      break
    case 'sharp':
      P(g, x - 1, y + 2, 9, 3, pupil)
      P(g, x, y + 5, 6, 3, pupil)
      P(g, x + 1, y + 5, 2, 2, '#8a6a5a')
      break
    case 'sleepy':
      P(g, x - 1, y + 4, 9, 3, pupil)
      P(g, x + 2, y + 7, 4, 2, pupil)
      break
    case 'sparkle':
      P(g, x, y, 7, 11, white)
      P(g, x + 1, y + 1, 5, 9, iris)
      P(g, x + 2, y + 3, 3, 6, pupil)
      P(g, x + 1, y + 1, 3, 3, white)
      P(g, x + 4, y + 7, 2, 2, '#ffe8a8')
      P(g, x, y, 7, 2, shade(hairC, -60))
      break
    default: // oval
      P(g, x, y, 7, 11, white)
      P(g, x + 1, y + 1, 5, 9, iris)
      P(g, x + 2, y + 3, 3, 5, pupil)
      P(g, x + 1, y + 1, 3, 3, white)
      P(g, x, y, 7, 2, shade(hairC, -60))
      P(g, x, y + 9, 7, 2, '#c9a88c')
  }
}

function drawFace(g, look, dir) {
  if (dir === DIR.up) return
  const sk = ramp(skinOf(look.skin))
  const hairC = look.hairColor || '#2b1d16'
  const style = look.eyes || 'oval'
  const eyeY = HY + 18

  const eyes = dir === DIR.down
    ? [[HX + 4, eyeY], [HX + 17, eyeY]]
    : dir === DIR.left ? [[HX + 2, eyeY]] : [[HX + 19, eyeY]]

  eyes.forEach(([x, y]) => {
    P(g, x - 1, y - 2, 9, 2, sk.lo)          // 눈두덩 그늘
    drawEye(g, x, y, style, hairC)
    P(g, x - 1, y - 7, 9, 3, shade(hairC, -20)) // 눈썹
    P(g, x, y - 8, 6, 2, shade(hairC, -6))
  })

  if (dir === DIR.down) {
    P(g, 31, HY + 26, 3, 4, sk.lo)           // 코
    P(g, 31, HY + 29, 4, 2, sk.lo2)
    dot(g, 33, HY + 27, sk.hi2)
    P(g, 28, HY + 33, 8, 2, '#a8524c')       // 입
    P(g, 27, HY + 32, 2, 2, '#a8524c')
    P(g, 35, HY + 32, 2, 2, '#a8524c')
    P(g, 29, HY + 35, 6, 1, sk.hi)
    P(g, HX + 1, HY + 28, 6, 4, 'rgba(255,120,120,.35)')   // 볼
    P(g, HX + HW - 7, HY + 28, 6, 4, 'rgba(255,120,120,.35)')
  } else {
    const s = dir === DIR.left
    P(g, s ? HX - 1 : HX + HW - 3, HY + 25, 4, 5, sk.lo)
    P(g, s ? HX + 2 : HX + HW - 8, HY + 33, 6, 2, '#a8524c')
    P(g, s ? HX + 3 : HX + HW - 9, HY + 28, 5, 4, 'rgba(255,120,120,.3)')
  }
}

// -----------------------------------------------------------------------------------
// 상의 — 칼라 · 소매단 · 봉제선 · 주름
// -----------------------------------------------------------------------------------
function drawTop(g, look, dir, swing) {
  const c = ramp(look.top || '#3b82f6')
  const sk = ramp(skinOf(look.skin))
  const y = TY
  const style = look.outfit || 'tee'
  const bodyX = TX + 5
  const bodyW = TW - 10

  P(g, bodyX, y, bodyW, TH, c.base)
  P(g, bodyX, y, bodyW, 4, c.hi2)
  P(g, bodyX, y, 5, TH, c.hi)
  P(g, bodyX + bodyW - 7, y, 7, TH, c.lo)
  P(g, bodyX, y + TH - 4, bodyW, 4, c.lo2)
  P(g, bodyX, y, bodyW, 1, c.hi3)
  for (let i = 0; i < 3; i++) {
    P(g, bodyX + 3 + i * 6, y + 12 + i * 3, 6, 2, c.lo)
    P(g, bodyX + bodyW - 9 - i * 5, y + 16 + i * 2, 5, 2, c.lo2)
  }
  P(g, bodyX, y + TH - 5, bodyW, 1, c.deep)

  const sleeveLen = style === 'sleeveless' ? 0 : 12
  const la = swing * 3
  const ra = -swing * 3
  const arm = (ax, off, mirrored) => {
    if (sleeveLen) {
      const sc = style === 'raglan' ? c.lo2 : c.base
      P(g, ax, y + 3 + off, 6, sleeveLen, sc)
      P(g, ax, y + 3 + off, 2, sleeveLen, mirrored ? c.lo : c.hi2)
      P(g, ax, y + 3 + off + sleeveLen - 3, 6, 3, c.deep)
    }
    const armY = y + 3 + off + sleeveLen
    const armH = TH - sleeveLen - 5
    P(g, ax, armY, 6, armH, mirrored ? sk.lo : sk.base)
    P(g, ax, armY, 2, armH, mirrored ? sk.base : sk.hi)
    P(g, ax, armY + armH - 4, 6, 4, mirrored ? sk.lo2 : sk.lo)
    P(g, ax + 1, armY + armH - 3, 4, 2, mirrored ? sk.lo : sk.base)
  }
  arm(TX, la, false)
  arm(TX + TW - 6, ra, true)

  switch (style) {
    case 'vneck':
      P(g, 28, y, 8, 10, sk.base)
      P(g, 26, y, 4, 6, sk.base); P(g, 34, y, 4, 6, sk.base)
      P(g, 28, y + 9, 8, 2, sk.lo)
      P(g, 26, y, 3, 3, c.hi3); P(g, 35, y, 3, 3, c.hi3)
      break
    case 'polo':
      P(g, bodyX, y, bodyW, 4, '#ffffff')
      P(g, 27, y, 10, 12, c.hi3)
      P(g, 27, y, 4, 12, c.lo2)
      dot(g, 31, y + 4, c.deep); dot(g, 31, y + 9, c.deep)
      break
    case 'stripe':
      for (let i = 4; i < TH - 4; i += 8) P(g, bodyX, y + i, bodyW, 4, c.lo2)
      break
    case 'raglan':
      P(g, bodyX, y, bodyW, 4, '#ffffff')
      P(g, bodyX, y + 4, bodyW, 1, c.deep)
      break
    case 'zipup':
      P(g, 31, y, 2, TH, c.deep)
      P(g, 33, y, 2, TH, c.hi3)
      for (let i = 2; i < TH; i += 4) P(g, 31, y + i, 2, 1, c.hi3)
      P(g, bodyX, y, bodyW, 4, '#ffffff')
      P(g, 30, y + 2, 4, 4, '#c8ccd4')
      break
    case 'number':
      P(g, 24, y + 8, 16, 14, '#ffffff')
      P(g, 26, y + 10, 12, 10, c.lo2)
      P(g, 30, y + 11, 4, 8, '#ffffff')
      break
    case 'sash':
      for (let i = 0; i < TH; i++) P(g, bodyX + Math.min(i, bodyW - 10), y + i, 10, 1, c.lo2)
      break
    case 'hoodie':
      P(g, TX + 2, y - 5, TW - 4, 9, c.lo)
      P(g, TX + 4, y - 5, TW - 8, 3, c.base)
      P(g, TX + 5, y - 3, 6, 4, c.deep)
      P(g, 31, y + 8, 2, 14, c.deep)
      P(g, 29, y + 6, 6, 3, '#e8e4dc')
      P(g, bodyX + 3, y + TH - 10, bodyW - 6, 5, c.lo2)
      break
    case 'club':
      P(g, bodyX, y, bodyW, 8, c.lo2)
      P(g, bodyX, y + 8, bodyW, 3, '#ffffff')
      P(g, bodyX, y + 11, bodyW, 1, c.deep)
      break
    default:
      P(g, 27, y, 10, 3, c.hi3)
      break
  }
}

// -----------------------------------------------------------------------------------
// 하의 / 신발
// -----------------------------------------------------------------------------------
function drawBottom(g, look, gender, dir, step) {
  const c = ramp(look.bottom || '#1f2937')
  const sk = ramp(skinOf(look.skin))
  const style = look.bottomStyle || (gender === '여' ? 'skirt' : 'shorts')
  const y = LY

  if (style === 'skirt' || style === 'skirtLayer') {
    P(g, TX + 4, y - 4, TW - 8, 8, c.base)
    P(g, TX, y + 2, TW, 10, c.base)
    P(g, TX, y + 2, TW, 3, c.hi2)
    P(g, TX, y + 8, TW, 4, c.lo2)
    for (let i = 0; i < 6; i++) P(g, TX + 3 + i * 5, y + 2, 2, 10, c.lo)
    if (style === 'skirtLayer') {
      P(g, TX + 2, y + 12, TW - 4, 4, c.hi3)
      P(g, TX + 2, y + 15, TW - 4, 2, c.lo)
    }
    P(g, 22, y + 12, 8, 6, sk.base)
    P(g, 36, y + 12, 8, 6, sk.lo)
    P(g, 22, y + 12, 3, 6, sk.hi)
  } else if (style === 'long' || style === 'leggings') {
    const w = style === 'leggings' ? 9 : 12
    P(g, 21, y, w, 16, c.base)
    P(g, 64 - 21 - w, y, w, 16, c.lo)
    P(g, 21, y, 4, 16, c.hi)
    P(g, 30, y, 4, 8, c.deep)
    P(g, 21, y, w, 3, c.hi2)
    if (style === 'leggings') {
      P(g, 21, y + 13, w, 3, c.lo2)
      P(g, 64 - 21 - w, y + 13, w, 3, c.lo2)
    }
  } else {
    P(g, TX + 4, y, TW - 8, 12, c.base)
    P(g, TX + 4, y, TW - 8, 3, c.hi2)
    P(g, 30, y, 4, 12, c.deep)
    P(g, TX + 4, y + 10, TW - 8, 2, c.lo2)
    P(g, 22, y + 12, 8, 6, sk.base)
    P(g, 36, y + 12, 8, 6, sk.lo)
    P(g, 22, y + 12, 3, 6, sk.hi)
  }

  const s = ramp(look.shoes || '#ffffff')
  const sStyle = look.shoeStyle || 'basic'
  const h = sStyle === 'high' ? 12 : 8
  const base = SY - (h - 8)
  const ly = base + (step > 0 ? -4 : 0)
  const ry = base + (step < 0 ? -4 : 0)
  const foot = (fx, fy, mirrored) => {
    P(g, fx, fy, 14, h, s.base)
    P(g, fx, fy, 14, 2, s.hi3)
    P(g, fx, fy + h - 3, 14, 3, s.deep)
    P(g, fx, fy + h - 5, 14, 2, s.lo2)
    P(g, fx, fy, 3, h, mirrored ? s.lo : s.hi)
    for (let i = 0; i < 3; i++) P(g, fx + 3, fy + 2 + i * 2, 8, 1, s.lo2)
  }
  foot(16, ly, false)
  foot(34, ry, true)
  if (sStyle === 'stripe') { P(g, 16, ly + 3, 14, 2, '#ffffff'); P(g, 34, ry + 3, 14, 2, '#ffffff') }
  if (sStyle === 'pro') { P(g, 16, ly, 4, h - 2, '#ff4d4d'); P(g, 44, ry, 4, h - 2, '#ff4d4d') }
}

// -----------------------------------------------------------------------------------
// 액세서리
// -----------------------------------------------------------------------------------
function drawAcc(g, look, dir) {
  const y = HY
  switch (look.acc) {
    case 'cap': {
      const c = ramp('#2a4bd0')
      P(g, HX - 4, y - 2, HW + 8, 12, c.base)
      P(g, HX, y - 7, HW, 6, c.base)
      P(g, HX + 3, y - 5, 10, 4, c.hi3)
      P(g, HX - 4, y + 8, HW + 8, 3, c.lo2)
      if (dir !== DIR.up) P(g, HX - 9, y + 10, HW + 18, 5, c.lo)
      else P(g, HX + 8, y + 1, 13, 7, '#ffffff')
      break
    }
    case 'visor': {
      const c = ramp('#ff5c8a')
      P(g, HX - 4, y + 4, HW + 8, 8, c.base)
      P(g, HX - 4, y + 4, HW + 8, 3, c.hi3)
      if (dir !== DIR.up) P(g, HX - 9, y + 11, HW + 18, 4, c.lo2)
      break
    }
    case 'headband':
      P(g, HX - 4, y + 10, HW + 8, 7, '#ff4d4d')
      P(g, HX - 4, y + 10, HW + 8, 2, '#ff9a9a')
      P(g, HX - 4, y + 15, HW + 8, 2, '#a82c2c')
      break
    case 'hairpin':
      P(g, HX + HW - 10, y + 6, 12, 4, '#ffd84a')
      P(g, HX + HW - 6, y + 2, 4, 5, '#ffd84a')
      dot(g, HX + HW - 8, y + 7, '#fff1a8')
      break
    case 'glasses':
      if (dir !== DIR.up) {
        const f = '#2a3550'
        P(g, HX + 2, HY + 15, 12, 13, f)
        P(g, HX + 16, HY + 15, 12, 13, f)
        P(g, HX + 4, HY + 17, 8, 9, 'rgba(170,220,255,.5)')
        P(g, HX + 18, HY + 17, 8, 9, 'rgba(170,220,255,.5)')
        P(g, HX + 4, HY + 17, 4, 4, '#eaf7ff')
        P(g, HX + 14, HY + 19, 2, 3, f)
        P(g, HX - 2, HY + 17, 4, 3, f)
      }
      break
    case 'mask':
      if (dir !== DIR.up) {
        P(g, HX, HY + 24, HW, 14, '#f4f6fa')
        P(g, HX, HY + 24, HW, 3, '#ffffff')
        P(g, HX, HY + 34, HW, 4, '#d8dce6')
        P(g, HX + 4, HY + 28, HW - 8, 2, '#e4e8f0')
        P(g, HX - 4, HY + 24, 5, 4, '#d8dce6')
        P(g, HX + HW - 1, HY + 24, 5, 4, '#d8dce6')
      }
      break
    case 'towel':
      P(g, TX + 4, TY - 1, TW - 8, 7, '#f0f4f8')
      P(g, TX + 4, TY - 1, TW - 8, 2, '#ffffff')
      P(g, TX + 6, TY + 6, 8, 14, '#f0f4f8')
      P(g, TX + TW - 14, TY + 6, 8, 14, '#e0e6ec')
      break
    case 'wristband':
      P(g, TX, TY + 19, 6, 5, '#ff4d4d')
      P(g, TX + TW - 6, TY + 19, 6, 5, '#ff4d4d')
      break
    case 'crown': {
      const c = ramp('#ffd21f')
      P(g, HX, y - 12, HW, 12, c.base)
      P(g, HX, y - 12, HW, 4, c.hi3)
      P(g, HX, y - 20, 6, 10, c.base)
      P(g, HX + 11, y - 24, 6, 14, c.base)
      P(g, HX + HW - 6, y - 20, 6, 10, c.base)
      P(g, HX + 11, y - 22, 4, 4, '#ff5c8a')
      P(g, HX + 1, y - 18, 4, 4, '#7ad0ff')
      P(g, HX + HW - 5, y - 18, 4, 4, '#8ef08a')
      break
    }
    default: break
  }
}

// -----------------------------------------------------------------------------------
// 라켓 — 프레임 링 · 스트링 격자 · 샤프트 · 그립
// -----------------------------------------------------------------------------------
function drawRacket(g, look, dir, swing, behind) {
  const r = look.racket || {}
  const frame = ramp(r.frame || '#ef4444')
  const grip = ramp(r.grip || '#1f2937')
  const str = r.string || '#ffffff'
  const strLo = shade(str, -55)

  if ((dir === DIR.up) !== behind) return

  const right = dir !== DIR.left
  const x = right ? 45 : 3
  const gx = right ? x + 6 : x + 8
  const y = TY + 17 - swing * 3

  // 그립
  P(g, gx, y, 4, 18, grip.base)
  P(g, gx, y, 1, 18, grip.hi2)
  P(g, gx + 3, y, 1, 18, grip.deep)
  if (r.wrap === 'spiral') for (let i = 1; i < 18; i += 4) P(g, gx, y + i, 4, 2, shade(grip.base, 55))
  if (r.wrap === 'twotone') P(g, gx, y + 9, 4, 9, shade(grip.base, 65))
  P(g, gx - 1, y + 16, 6, 3, grip.deep)

  // 샤프트 (두 갈래)
  const hy = y - 26
  P(g, gx - 1, hy + 18, 2, 9, frame.lo)
  P(g, gx + 3, hy + 18, 2, 9, frame.lo)

  // 프레임 링 + 스트링
  const cx = x + 8
  const cy = hy + 10
  for (let yy = -11; yy <= 11; yy++) {
    const w = Math.round(Math.sqrt(Math.max(0, 1 - (yy * yy) / 121)) * 8)
    if (w <= 0) continue
    P(g, cx - w, cy + yy, 2, 1, frame.base)
    P(g, cx + w - 2, cy + yy, 2, 1, frame.lo2)
    if (w > 2) P(g, cx - w + 2, cy + yy, (w - 2) * 2, 1, str)
  }
  P(g, cx - 6, cy - 11, 12, 2, frame.hi3)
  P(g, cx - 6, cy + 10, 12, 2, frame.deep)
  for (let i = -6; i <= 6; i += 3) {
    P(g, cx + i, cy - 9, 1, 19, strLo)
    P(g, cx - 6, cy + i, 13, 1, strLo)
  }
}

// -----------------------------------------------------------------------------------
// 외곽선
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
  const sk = ramp(skinOf(look.skin))
  const step = frame === 1 ? 1 : frame === 3 ? -1 : 0
  const hair = look.hair || 'short'
  const hairC = look.hairColor || '#2b1d16'

  drawRacket(g, look, dir, step, true)
  if (LONG_HAIR.has(hair)) drawHair(g, hair, hairC, dir, true)

  drawBottom(g, look, gender, dir, step)
  drawTop(g, look, dir, step)

  // 목
  P(g, 26, NY - 6, 12, 8, sk.lo)
  P(g, 26, NY - 6, 12, 2, sk.lo2)
  P(g, 26, NY - 6, 3, 8, sk.base)

  // 머리
  P(g, HX, HY, HW, HH, sk.base)
  P(g, HX, HY, HW, 5, sk.hi2)
  P(g, HX, HY, 5, HH - 5, sk.hi)
  P(g, HX + HW - 6, HY + 4, 6, HH - 8, sk.lo)
  P(g, HX + 2, HY + HH - 4, HW - 4, 4, sk.lo)
  P(g, HX + 5, HY + HH, HW - 10, 2, sk.lo2)
  P(g, HX - 4, HY + 14, 5, 10, sk.base)   // 귀
  P(g, HX + HW - 1, HY + 14, 5, 10, sk.lo)
  P(g, HX - 3, HY + 17, 2, 5, sk.lo)

  drawHair(g, hair, hairC, dir, false)
  drawFace(g, look, dir)
  drawAcc(g, look, dir)
  drawRacket(g, look, dir, step, false)
}

function drawFrame(g, look, gender, dir, frame) {
  for (let i = 3; i >= 1; i--) {
    g.fillStyle = `rgba(16,20,34,${0.1 * i})`
    g.beginPath()
    g.ellipse(32, 90, 18 * (i / 3), 6 * (i / 3), 0, 0, Math.PI * 2)
    g.fill()
  }
  const b = buffer()
  drawBody(b, look, gender, dir, frame)
  addOutline(b, CW, CH)
  const bob = frame === 1 || frame === 3 ? -2 : 0
  g.drawImage(bufC, 0, bob)
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

/** 4방향 x 4프레임 시트 (256 x 384) */
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
  if (sheetCache.size > 80) sheetCache.clear()
  sheetCache.set(key, c)
  return c
}

/** 2D 캔버스에 한 명 그리기 — (x,y)는 발이 닿는 지점 */
export function drawActor(ctx, look, gender, dir, frame, x, y, scale = 0.5) {
  const sheet = getSheet(look, gender)
  const w = CW * scale
  const h = CH * scale
  ctx.drawImage(sheet, frame * CW, dir * CH, CW, CH, Math.round(x - w / 2), Math.round(y - h + 4 * scale), w, h)
}

/** 확대해서 한 장 (캐릭터 메이커 · 도감 · 대화창 초상) */
export function drawBig(ctx, look, gender, dir, frame, x, y, scale) {
  const sheet = getSheet(look, gender)
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(sheet, frame * CW, dir * CH, CW, CH, x, y, CW * scale, CH * scale)
}

export function clearSpriteCache() {
  sheetCache.clear()
}
