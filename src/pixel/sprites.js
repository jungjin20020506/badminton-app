// ===================================================================================
// 셔틀몬스터 — 2D 캐릭터 스프라이트 (32x48 고해상도)
//
// 옛날 도트가 아니라 요즘 2D 게임의 캐릭터를 목표로 한다.
//  · 피부·옷·머리마다 명암 3~4단계 + 위쪽에서 들어오는 빛
//  · 실루엣 바깥 1px 어두운 외곽선 (잔디 위에서도 형태가 또렷하게)
//  · 발밑 접지 그림자와 걸을 때의 상하 흔들림
// look 데이터(피부/머리/눈/의상/하의/신발/액세서리/라켓)는 그대로 쓴다.
// ===================================================================================
import { SKIN_TONES } from '../game/constants.js'

export const CW = 32 // 캐릭터 칸 가로
export const CH = 48 // 캐릭터 칸 세로 (발끝 44, 그림자 45)

export const DIR = { down: 0, up: 1, left: 2, right: 3 }

const INK = [24, 28, 44] // 외곽선

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

/** 색 하나 → 명암 단계 */
function ramp(hex) {
  return {
    hi2: shade(hex, 46),
    hi: shade(hex, 24),
    base: hex,
    lo: shade(hex, -26),
    lo2: shade(hex, -52),
    deep: shade(hex, -80),
  }
}

const skinOf = (id) => SKIN_TONES.find((s) => s.id === id)?.color || '#fdd0ae'

// 몸 배치 (32x48)
const HX = 9, HW = 14, HY = 4, HH = 17   // 머리 y4..20
const NY = 21                             // 목
const TX = 8, TW = 16, TY = 21, TH = 14   // 몸통 y21..34 (양 끝 3칸이 팔)
const LY = 35, LH = 6                     // 다리 y35..40
const SY = 41, SH = 4                     // 신발 y41..44

// -----------------------------------------------------------------------------------
// 머리 모양 — 18종 (앞머리 / 뒷머리를 나눠 그린다)
// -----------------------------------------------------------------------------------
function drawHair(g, style, color, dir, behind) {
  const r = ramp(color)
  const y = HY
  const back = dir === DIR.up

  if (behind) {
    // 몸통보다 뒤에 깔리는 긴 머리
    const long = (len, side) => {
      P(g, HX - 1, y + 6, HW + 2, len, r.base)
      P(g, HX - 1, y + 6, 3, len, side || r.lo)
      P(g, HX + HW - 2, y + 6, 3, len, r.lo2)
      P(g, HX + 1, y + 6, 2, Math.floor(len * 0.6), r.hi)
    }
    switch (style) {
      case 'long': long(21); break
      case 'hime': long(23, r.hi); break
      case 'wave':
        long(19)
        for (let i = 0; i < 5; i++) {
          P(g, HX - 2 + (i % 2) * 2, y + 9 + i * 4, 4, 4, r.hi)
          P(g, HX + HW - 2 - (i % 2) * 2, y + 9 + i * 4, 4, 4, r.lo2)
        }
        break
      case 'curly':
        long(15)
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2
          P(g, 16 + Math.cos(a) * 10 - 2, y + 12 + Math.sin(a) * 7, 4, 4, i % 2 ? r.hi : r.lo2)
        }
        break
      case 'braid': long(15); break
      case 'bob': long(14); break
      case 'afro':
        for (let i = -5; i <= 24; i++) {
          const w = Math.round(Math.sqrt(Math.max(0, 165 - (i - 8) * (i - 8) * 1.05)))
          if (w > 0) P(g, 16 - w, y - 5 + i, w * 2, 1, i < 6 ? r.hi : r.base)
        }
        break
      default: break
    }
    return
  }

  const dark = shade(color, -118)
  const cap = (h = 8) => {
    P(g, HX - 1, y - 1, HW + 2, h, r.base)
    P(g, HX + 1, y - 2, HW - 2, 2, r.base)
    P(g, HX + 1, y - 1, 5, 3, r.hi2)   // 정수리 빛
    P(g, HX + 6, y - 1, 4, 2, r.hi)
    P(g, HX - 1, y + h - 2, HW + 2, 2, dark)          // 헤어라인
    P(g, HX, y + h, HW, 3, 'rgba(26,20,36,.24)')       // 이마에 지는 그늘
  }
  const sides = (h) => {
    P(g, HX - 2, y + 2, 3, h, r.base)
    P(g, HX + HW - 1, y + 2, 3, h, r.lo)
    P(g, HX - 2, y + 2, 2, Math.floor(h * 0.6), r.hi)
    P(g, HX - 2, y + h, 3, 2, dark)
    P(g, HX + HW - 1, y + h, 3, 2, dark)
    P(g, HX + 1, y + 2, 1, h - 2, dark)                // 옆머리 안쪽 경계
    P(g, HX + HW - 2, y + 2, 1, h - 2, dark)
  }

  switch (style) {
    case 'buzz':
      P(g, HX - 1, y - 1, HW + 2, 6, r.base)
      P(g, HX + 1, y - 1, 6, 2, r.hi2)
      P(g, HX - 1, y + 4, HW + 2, 2, r.lo2)
      break
    case 'short': cap(8); sides(9); break
    case 'sidepart':
      cap(8)
      P(g, HX + 8, y - 1, 6, 4, r.hi2)
      P(g, HX - 2, y + 5, 4, 8, r.base)
      break
    case 'twoblock': cap(10); P(g, HX - 2, y + 9, HW + 4, 2, r.deep); break
    case 'slick':
      cap(6)
      P(g, HX + 1, y - 5, HW - 2, 5, r.base)
      P(g, HX + 3, y - 5, 4, 3, r.hi2)
      for (let i = 0; i < 4; i++) P(g, HX + 2 + i * 3, y - 4, 1, 6, r.lo2)
      break
    case 'pixie': cap(8); sides(11); P(g, HX - 4, y + 8, 4, 6, r.base); break
    case 'spiky':
      cap(6)
      for (let i = 0; i < 5; i++) {
        const sx = HX - 1 + i * 3
        const sh = 7 + (i % 2) * 3
        P(g, sx, y - sh, 3, sh + 3, r.base)
        P(g, sx, y - sh, 1, sh, r.hi)
      }
      break
    case 'mohawk':
      P(g, HX + 4, y - 9, 7, 16, r.base)
      P(g, HX + 5, y - 9, 2, 12, r.hi2)
      P(g, HX - 2, y + 2, 4, 6, r.lo2)
      P(g, HX + HW - 2, y + 2, 4, 6, r.lo2)
      break
    case 'afro':
      for (let i = -5; i <= 14; i++) {
        const w = Math.round(Math.sqrt(Math.max(0, 165 - (i - 6) * (i - 6) * 1.05)))
        if (w > 0) P(g, 16 - w, y - 5 + i, w * 2, 1, i < 3 ? r.hi : r.base)
      }
      P(g, HX - 3, y - 4, 6, 4, r.hi2)
      break
    case 'bob': cap(8); sides(13); break
    case 'long': cap(8); sides(17); break
    case 'hime': cap(8); sides(17); P(g, HX + 1, y + 6, HW - 2, 2, r.lo2); break
    case 'wave': cap(8); sides(13); break
    case 'curly':
      cap(8); sides(9)
      for (let i = 0; i < 4; i++) P(g, HX + i * 4, y - 3, 4, 4, r.hi)
      break
    case 'braid':
      cap(8); sides(11)
      if (!back) for (let i = 0; i < 5; i++) P(g, HX + HW, y + 11 + i * 4, 4, 4, i % 2 ? r.hi : r.base)
      else for (let i = 0; i < 5; i++) P(g, 14 + (i % 2) * 2, y + 17 + i * 4, 4, 4, i % 2 ? r.hi : r.base)
      break
    case 'ponytail':
      cap(8); sides(9)
      if (back) { P(g, 14, y + 8, 6, 20, r.base); P(g, 14, y + 8, 2, 18, r.hi) }
      else { P(g, HX + HW, y + 5, 6, 18, r.base); P(g, HX + HW, y + 5, 2, 12, r.hi) }
      break
    case 'twintail':
      cap(8); sides(9)
      P(g, HX - 6, y + 5, 6, 18, r.base)
      P(g, HX + HW, y + 5, 6, 18, r.lo)
      P(g, HX - 6, y + 5, 2, 12, r.hi)
      break
    case 'bun':
      cap(8); sides(7)
      P(g, 11, y - 9, 10, 9, r.base)
      P(g, 12, y - 9, 4, 4, r.hi2)
      P(g, 11, y - 2, 10, 2, r.lo2)
      break
    default: cap(8); sides(9)
  }
}

const LONG_HAIR = new Set(['long', 'hime', 'wave', 'curly', 'braid', 'bob', 'afro'])

// -----------------------------------------------------------------------------------
// 얼굴
// -----------------------------------------------------------------------------------
function drawFace(g, look, dir) {
  if (dir === DIR.up) return
  const eyeY = HY + 9
  const ink = '#241f1c'
  const white = '#ffffff'
  const style = look.eyes || 'oval'
  const pairs = dir === DIR.down ? [[HX + 2, eyeY], [HX + 9, eyeY]]
    : dir === DIR.left ? [[HX + 1, eyeY]] : [[HX + 10, eyeY]]

  pairs.forEach(([x, y]) => {
    switch (style) {
      case 'dot':
        P(g, x, y, 3, 4, ink); dot(g, x, y, '#4a423c')
        break
      case 'oval':
        P(g, x - 1, y - 2, 5, 8, white)
        P(g, x, y - 1, 3, 6, ink)
        P(g, x, y - 1, 2, 2, '#ffffff')
        P(g, x, y + 4, 3, 1, '#6a5a50')
        break
      case 'happy':
        P(g, x - 1, y + 2, 2, 2, ink); P(g, x + 1, y, 2, 2, ink); P(g, x + 3, y + 2, 2, 2, ink)
        break
      case 'sharp':
        P(g, x - 1, y, 6, 2, ink); P(g, x - 1, y + 2, 4, 2, ink); dot(g, x, y + 1, '#8a6a5a')
        break
      case 'sparkle':
        P(g, x - 1, y - 2, 5, 8, white)
        P(g, x, y - 1, 3, 6, ink)
        P(g, x, y - 1, 2, 2, '#ffffff')
        P(g, x + 1, y + 3, 2, 2, '#ffe8a8')
        break
      case 'sleepy':
        P(g, x - 1, y + 1, 5, 2, ink); P(g, x + 1, y + 3, 2, 2, ink)
        break
      default: P(g, x, y, 3, 4, ink)
    }
    // 눈썹
    P(g, x - 1, y - 4, 5, 2, shade(look.hairColor || '#2b1d16', -10))
  })

  const sk = ramp(skinOf(look.skin))
  if (dir === DIR.down) {
    P(g, 15, HY + 13, 2, 2, sk.lo)          // 코
    P(g, 14, HY + 16, 4, 1, shade(sk.base, -70)) // 입
    P(g, 15, HY + 17, 2, 1, shade(sk.base, -70))
    P(g, HX + 1, HY + 14, 3, 2, 'rgba(255,120,120,.45)')  // 볼
    P(g, HX + HW - 4, HY + 14, 3, 2, 'rgba(255,120,120,.45)')
  } else {
    P(g, dir === DIR.left ? HX - 1 : HX + HW - 1, HY + 12, 2, 2, sk.lo)
    P(g, dir === DIR.left ? HX + 1 : HX + HW - 4, HY + 16, 3, 1, shade(sk.base, -70))
  }
}

// -----------------------------------------------------------------------------------
// 상의 + 팔
// -----------------------------------------------------------------------------------
function drawTop(g, look, dir, swing) {
  const c = ramp(look.top || '#3b82f6')
  const skin = ramp(skinOf(look.skin))
  const y = TY
  const style = look.outfit || 'tee'

  // 몸통 — 위는 밝고 아래는 어둡게
  P(g, TX + 2, y, TW - 4, TH, c.base)
  P(g, TX + 2, y, TW - 4, 3, c.hi)
  P(g, TX + 2, y, 3, TH, c.hi)          // 왼쪽에서 빛
  P(g, TX + TW - 6, y, 4, TH, c.lo)
  P(g, TX + 2, y + TH - 3, TW - 4, 3, c.lo2)
  P(g, TX + 2, y, TW - 4, 1, c.hi2)     // 어깨 림라이트

  // 팔
  const sleeveC = style === 'raglan' ? c.lo2 : c.base
  const armLen = style === 'sleeveless' ? 0 : 6
  const la = swing * 2, ra = -swing * 2
  if (armLen) {
    P(g, TX, y + 2 + la, 3, armLen, sleeveC)
    P(g, TX, y + 2 + la, 1, armLen, c.hi)
    P(g, TX + TW - 3, y + 2 + ra, 3, armLen, sleeveC)
    P(g, TX + TW - 3, y + 2 + ra, 3, 1, c.hi)
  }
  P(g, TX, y + 2 + armLen + la, 3, TH - armLen - 3, skin.base)
  P(g, TX, y + 2 + armLen + la, 1, TH - armLen - 3, skin.hi)
  P(g, TX + TW - 3, y + 2 + armLen + ra, 3, TH - armLen - 3, skin.lo)
  P(g, TX + TW - 3, y + 2 + armLen + ra, 1, TH - armLen - 3, skin.base)

  switch (style) {
    case 'vneck':
      P(g, 14, y, 4, 5, skin.base)
      P(g, 13, y, 2, 3, skin.base); P(g, 18, y, 2, 3, skin.base)
      P(g, 14, y + 5, 4, 1, skin.lo)
      break
    case 'polo':
      P(g, TX + 2, y, TW - 4, 2, '#ffffff')
      P(g, 14, y, 4, 6, c.hi2)
      P(g, 15, y + 2, 1, 2, c.lo2); P(g, 15, y + 5, 1, 2, c.lo2)
      break
    case 'stripe':
      for (let i = 2; i < TH - 2; i += 4) P(g, TX + 2, y + i, TW - 4, 2, c.lo2)
      break
    case 'raglan':
      P(g, TX + 2, y, TW - 4, 2, '#ffffff')
      break
    case 'zipup':
      P(g, 15, y, 1, TH, c.deep)
      P(g, 16, y, 1, TH, c.hi2)
      P(g, TX + 2, y, TW - 4, 2, '#ffffff')
      for (let i = 2; i < TH; i += 3) dot(g, 15, y + i, c.hi2)
      break
    case 'number':
      P(g, 12, y + 4, 8, 8, '#ffffff')
      P(g, 13, y + 5, 6, 6, c.lo2)
      P(g, 15, y + 6, 2, 4, '#ffffff')
      break
    case 'sash':
      for (let i = 0; i < TH; i++) P(g, TX + 2 + Math.min(i, TW - 8), y + i, 5, 1, c.lo2)
      break
    case 'hoodie':
      P(g, TX + 1, y - 2, TW - 2, 4, c.lo)
      P(g, TX + 2, y - 2, TW - 4, 1, c.base)
      P(g, 15, y + 4, 2, 7, c.deep)
      P(g, TX + 3, y + TH - 5, TW - 6, 2, c.lo2)
      break
    case 'club':
      P(g, TX + 2, y, TW - 4, 4, c.lo2)
      P(g, TX + 2, y + 4, TW - 4, 2, '#ffffff')
      break
    default: break
  }
}

// -----------------------------------------------------------------------------------
// 하의 / 신발
// -----------------------------------------------------------------------------------
function drawBottom(g, look, gender, dir, step) {
  const c = ramp(look.bottom || '#1f2937')
  const skin = ramp(skinOf(look.skin))
  const style = look.bottomStyle || (gender === '여' ? 'skirt' : 'shorts')
  const y = LY

  if (style === 'skirt' || style === 'skirtLayer') {
    P(g, TX + 2, y - 2, TW - 4, 4, c.base)
    P(g, TX, y + 1, TW, 5, c.base)
    P(g, TX, y + 1, TW, 2, c.hi)
    P(g, TX, y + 4, TW, 3, c.lo2)
    for (let i = 0; i < 4; i++) P(g, TX + 2 + i * 4, y + 1, 1, 5, c.lo)
    if (style === 'skirtLayer') { P(g, TX + 1, y + 6, TW - 2, 2, c.hi2); P(g, TX + 1, y + 7, TW - 2, 1, c.lo) }
    // 맨다리
    P(g, 11, y + 6, 4, 3, skin.base)
    P(g, 18, y + 6, 4, 3, skin.lo)
    P(g, 11, y + 6, 1, 3, skin.hi)
  } else if (style === 'long' || style === 'leggings') {
    const w = style === 'leggings' ? 4 : 6
    P(g, 11, y, w, 8, c.base)
    P(g, 32 - 11 - w, y, w, 8, c.lo)
    P(g, 11, y, 2, 8, c.hi)
    P(g, 15, y, 2, 4, c.deep)
    if (style === 'leggings') { P(g, 11, y + 6, w, 2, c.lo2); P(g, 32 - 11 - w, y + 6, w, 2, c.lo2) }
  } else {
    P(g, TX + 2, y, TW - 4, 6, c.base)
    P(g, TX + 2, y, TW - 4, 2, c.hi)
    P(g, 15, y, 2, 6, c.deep)
    P(g, TX + 2, y + 5, TW - 4, 1, c.lo2)
    P(g, 11, y + 6, 4, 3, skin.base)
    P(g, 18, y + 6, 4, 3, skin.lo)
    P(g, 11, y + 6, 1, 3, skin.hi)
  }

  // 신발
  const s = ramp(look.shoes || '#ffffff')
  const sStyle = look.shoeStyle || 'basic'
  const h = sStyle === 'high' ? 6 : 4
  const base = SY - (h - 4)
  const ly = base + (step > 0 ? -2 : 0)
  const ry = base + (step < 0 ? -2 : 0)
  const foot = (fx, fy) => {
    P(g, fx, fy, 7, h, s.base)
    P(g, fx, fy, 7, 1, s.hi2)
    P(g, fx, fy + h - 2, 7, 2, s.deep)
    P(g, fx, fy, 2, h, s.hi)
  }
  foot(8, ly)
  foot(17, ry)
  if (sStyle === 'stripe') { P(g, 8, ly + 1, 7, 1, '#ffffff'); P(g, 17, ry + 1, 7, 1, '#ffffff') }
  if (sStyle === 'pro') { P(g, 8, ly, 2, h - 1, '#ff4d4d'); P(g, 22, ry, 2, h - 1, '#ff4d4d') }
}

// -----------------------------------------------------------------------------------
// 액세서리
// -----------------------------------------------------------------------------------
function drawAcc(g, look, dir) {
  const y = HY
  switch (look.acc) {
    case 'cap': {
      const c = ramp('#2a4bd0')
      P(g, HX - 2, y - 1, HW + 4, 6, c.base)
      P(g, HX, y - 3, HW, 3, c.base)
      P(g, HX + 1, y - 2, 5, 2, c.hi2)
      if (dir !== DIR.up) P(g, HX - 4, y + 5, HW + 8, 3, c.lo2)
      else P(g, HX + 4, y + 1, 7, 4, '#ffffff')
      break
    }
    case 'visor': {
      const c = ramp('#ff5c8a')
      P(g, HX - 2, y + 2, HW + 4, 4, c.base)
      P(g, HX - 2, y + 2, HW + 4, 1, c.hi2)
      if (dir !== DIR.up) P(g, HX - 4, y + 6, HW + 8, 2, c.lo2)
      break
    }
    case 'headband':
      P(g, HX - 2, y + 5, HW + 4, 4, '#ff4d4d')
      P(g, HX - 2, y + 5, HW + 4, 1, '#ff9a9a')
      P(g, HX - 2, y + 8, HW + 4, 1, '#c02c2c')
      break
    case 'hairpin':
      P(g, HX + HW - 5, y + 3, 6, 2, '#ffd84a')
      P(g, HX + HW - 3, y + 1, 2, 2, '#ffd84a')
      dot(g, HX + HW - 4, y + 3, '#fff1a8')
      break
    case 'glasses':
      if (dir !== DIR.up) {
        const f = '#2a3550'
        P(g, HX, HY + 6, 6, 6, f)
        P(g, HX + 8, HY + 6, 6, 6, f)
        P(g, HX + 1, HY + 7, 4, 4, 'rgba(160,215,255,.55)')
        P(g, HX + 9, HY + 7, 4, 4, 'rgba(160,215,255,.55)')
        P(g, HX + 1, HY + 7, 2, 2, '#e8f6ff')
        P(g, HX + 6, HY + 8, 2, 2, f)
      }
      break
    case 'mask':
      if (dir !== DIR.up) {
        P(g, HX, HY + 12, HW, 6, '#f4f6fa')
        P(g, HX, HY + 12, HW, 2, '#ffffff')
        P(g, HX, HY + 16, HW, 2, '#d8dce6')
        P(g, HX - 2, HY + 12, 2, 2, '#d8dce6')
        P(g, HX + HW, HY + 12, 2, 2, '#d8dce6')
      }
      break
    case 'towel':
      P(g, TX + 2, TY, TW - 4, 4, '#f0f4f8')
      P(g, TX + 2, TY, TW - 4, 1, '#ffffff')
      P(g, TX + 3, TY + 4, 4, 7, '#f0f4f8')
      P(g, TX + TW - 7, TY + 4, 4, 7, '#e0e6ec')
      break
    case 'wristband':
      P(g, TX, TY + 10, 3, 3, '#ff4d4d')
      P(g, TX + TW - 3, TY + 10, 3, 3, '#ff4d4d')
      break
    case 'crown': {
      const c = ramp('#ffd21f')
      P(g, HX, y - 6, HW, 6, c.base)
      P(g, HX, y - 6, HW, 2, c.hi2)
      P(g, HX, y - 10, 3, 5, c.base)
      P(g, HX + 6, y - 12, 3, 7, c.base)
      P(g, HX + HW - 3, y - 10, 3, 5, c.base)
      dot(g, HX + 6, y - 10, '#ff5c8a')
      dot(g, HX + 1, y - 8, '#7ad0ff')
      break
    }
    default: break
  }
}

// -----------------------------------------------------------------------------------
// 라켓
// -----------------------------------------------------------------------------------
function drawRacket(g, look, dir, swing, behind) {
  const r = look.racket || {}
  const frame = ramp(r.frame || '#ef4444')
  const grip = ramp(r.grip || '#1f2937')
  const str = r.string || '#ffffff'

  if ((dir === DIR.up) !== behind) return

  // 손에서 아래로 늘어뜨려 든다 — 프레임 머리가 허리 옆에 온다
  const right = dir !== DIR.left
  const x = right ? 23 : 1       // 라켓 머리 8칸 폭
  const gx = right ? x + 2 : x + 5
  const y = TY + 8 - swing * 2   // 손 위치

  // 손잡이 (손 → 아래)
  P(g, gx, y, 2, 8, grip.base)
  P(g, gx, y, 1, 8, grip.hi)
  if (r.wrap === 'spiral') for (let i = 1; i < 8; i += 3) P(g, gx, y + i, 2, 1, shade(grip.base, 60))
  if (r.wrap === 'twotone') P(g, gx, y + 4, 2, 4, shade(grip.base, 70))

  // 머리 (손잡이 아래)
  const hy = y + 8
  P(g, x, hy + 1, 8, 11, frame.base)
  P(g, x + 1, hy, 6, 13, frame.base)
  P(g, x + 1, hy, 6, 2, frame.hi2)
  P(g, x, hy + 1, 2, 11, frame.hi)
  P(g, x + 6, hy + 1, 2, 11, frame.lo2)
  // 스트링
  P(g, x + 2, hy + 2, 4, 9, str)
  for (let i = 0; i < 4; i += 2) P(g, x + 2 + i, hy + 2, 1, 9, shade(str, -40))
  for (let i = 0; i < 9; i += 2) P(g, x + 2, hy + 2 + i, 4, 1, shade(str, -40))
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
  const skin = ramp(skinOf(look.skin))
  const step = frame === 1 ? 1 : frame === 3 ? -1 : 0
  const swing = step
  const hair = look.hair || 'short'
  const hairC = look.hairColor || '#2b1d16'

  drawRacket(g, look, dir, swing, true)
  if (LONG_HAIR.has(hair)) drawHair(g, hair, hairC, dir, true)

  drawBottom(g, look, gender, dir, step)
  drawTop(g, look, dir, swing)

  // 목
  P(g, 13, NY - 3, 6, 4, skin.lo)
  P(g, 13, NY - 3, 6, 1, skin.lo2)

  // 머리 — 위에서 빛이 들어오고 턱 아래로 그늘
  P(g, HX, HY, HW, HH, skin.base)
  P(g, HX, HY, HW, 3, skin.hi)
  P(g, HX, HY, 3, HH - 3, skin.hi)
  P(g, HX + HW - 3, HY + 2, 3, HH - 4, skin.lo)
  P(g, HX + 1, HY + HH - 2, HW - 2, 2, skin.lo2)
  P(g, HX + 2, HY + HH, HW - 4, 1, skin.lo2)
  // 귀
  P(g, HX - 2, HY + 6, 2, 5, skin.base)
  P(g, HX + HW, HY + 6, 2, 5, skin.lo)

  drawHair(g, hair, hairC, dir, false)
  drawFace(g, look, dir)
  drawAcc(g, look, dir)
  drawRacket(g, look, dir, swing, false)
}

function drawFrame(g, look, gender, dir, frame) {
  // 접지 그림자 (외곽선 대상이 아니므로 먼저 깐다)
  for (let i = 3; i >= 1; i--) {
    g.fillStyle = `rgba(16,20,34,${0.1 * i})`
    g.beginPath()
    g.ellipse(16, 45, 9 * (i / 3), 3.2 * (i / 3), 0, 0, Math.PI * 2)
    g.fill()
  }

  const b = buffer()
  drawBody(b, look, gender, dir, frame)
  addOutline(b, CW, CH)
  // 걸을 때 살짝 위아래로 흔들린다
  const bob = frame === 1 || frame === 3 ? -1 : 0
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

/** 4방향 x 4프레임 시트 (128 x 192) */
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
  ctx.drawImage(sheet, frame * CW, dir * CH, CW, CH, Math.round(x - CW / 2), Math.round(y - CH + 4), CW, CH)
}

/** 캐릭터 메이커 · 도감용 — 확대해서 한 장 */
export function drawBig(ctx, look, gender, dir, frame, x, y, scale) {
  const sheet = getSheet(look, gender)
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(sheet, frame * CW, dir * CH, CW, CH, x, y, CW * scale, CH * scale)
}

export function clearSpriteCache() {
  sheetCache.clear()
}
