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

// -----------------------------------------------------------------------------------
// 몸 배치 (64x96) — 4등신 히어로 비율
//
// 예전에는 머리 36px 에 몸 46px — 머리가 몸통만큼 커서(2.5등신) 인형 같았다.
// 그렇다고 4등신으로 올리면 이번엔 너무 어른스러워 캐릭터 맛이 사라진다.
// 그래서 **3.3등신** — 옥토패스·시오브스타즈가 쓰는 「살짝 귀여운데 실루엣은 영웅」
// 비율에 맞췄다. 머리는 크게 남기고, 대신 어깨를 머리의 1.6배로 벌리고 허리를 좁혀
// V자를 만든 다음, 다리를 길게 뽑아 키를 낸다.
//
//   y6  ┌ 머리 (25)  — 폭 20. 눈은 크게, 턱은 부드럽게
//   y31 ├ 목
//   y32 ├ 몸통 (26)  — 어깨 32 → 허리 16
//   y58 ├ 다리 (22)
//   y80 ├ 신발 (10)
//   y90 └ 발끝            그림자 y91
// -----------------------------------------------------------------------------------
const HY = 6, HH = 25                        // 머리 y6..30
const NY = 31                                // 목
const TX = 16, TW = 32, TY = 32, TH = 26     // 몸통 실루엣(팔 포함) x16..47 · y32..57
const CHEST_W = 22                           // 가슴 알맹이 폭
const WAIST_W = 16                           // 허리 알맹이 폭 — 여기서 V자가 나온다
const ARM_W = 5                              // 팔 굵기
const LY = 58, LH = 22                       // 다리 y58..79
const SY = 80, SH = 10                       // 신발 y80..89
const CX = 32                                // 몸 가운데

// -----------------------------------------------------------------------------------
// 방향에 따라 달라지는 값
//
// 옆을 볼 때 정면과 똑같은 폭으로 그리면 종이 인형처럼 보인다. 사람은 옆으로 서면
// 어깨가 좁아지고, 먼 쪽 팔다리가 몸 뒤로 숨는다. 그래서 프레임마다 setGeom(dir)로
// 머리 폭·몸통 폭·팔다리 위치를 통째로 바꾼다.
// -----------------------------------------------------------------------------------
let SIDE = false     // 옆을 보고 있나
let BACK = false     // 뒤통수를 보고 있나
let FACE = 1         // 바라보는 쪽 (오른쪽 +1 · 왼쪽 -1)
let HX = 23, HW = 18 // 머리 가로 — 옆을 보면 좁아진다

function setGeom(dir) {
  SIDE = dir === DIR.left || dir === DIR.right
  BACK = dir === DIR.up
  FACE = dir === DIR.left ? -1 : 1
  HW = SIDE ? 16 : 20
  HX = CX - (HW >> 1)
}

/** 몸통 알맹이 폭 — 어깨에서 허리로 좁아지고, 옆을 보면 통째로 얇아진다 */
function coreW(i) {
  let w
  if (i < 1) w = 20
  else if (i < 2) w = 21
  else if (i < 11) w = CHEST_W
  else w = Math.round(CHEST_W - ((i - 11) / (TH - 11)) * (CHEST_W - WAIST_W))
  return SIDE ? Math.max(11, Math.round(w * 0.68)) : w
}
const coreX = (i) => CX - Math.floor(coreW(i) / 2)
const ARM_L = TX + 1                   // 왼팔 x17..21
const ARM_R = TX + TW - ARM_W - 1      // 오른팔 x42..46
/** 옆을 볼 때 앞/뒤 팔이 서는 자리 */
const nearArmX = () => CX - 2 + FACE * 3
const farArmX = () => CX - 2 - FACE * 3

// -----------------------------------------------------------------------------------
// 머리 모양 — 머리통이 18px 뿐이라 모든 덩어리를 얇게 잡는다
// -----------------------------------------------------------------------------------
function drawHair(g, style, color, dir, behind) {
  const r = ramp(color)
  const y = HY
  const back = dir === DIR.up
  const ink = r.ink

  if (behind) {
    const long = (len, tone) => {
      P(g, HX - 3, y + 7, HW + 6, len, r.base)
      P(g, HX - 3, y + 7, 4, len, tone || r.lo)
      P(g, HX + HW - 1, y + 7, 4, len, r.lo2)
      P(g, HX, y + 7, 3, Math.floor(len * 0.65), r.hi)
      for (let i = 0; i < 5; i++) P(g, HX - 1 + i * 4, y + 9, 1, len - 3, i % 2 ? r.lo2 : r.hi)
      P(g, HX - 3, y + 7 + len - 2, HW + 6, 2, r.deep)
    }
    switch (style) {
      case 'long': long(26); break
      case 'hime': long(30, r.hi); break
      case 'wave':
        long(24)
        for (let i = 0; i < 5; i++) {
          P(g, HX - 5 + (i % 2) * 3, y + 12 + i * 5, 5, 5, r.hi)
          P(g, HX + HW - 1 - (i % 2) * 3, y + 12 + i * 5, 5, 5, r.lo2)
        }
        break
      case 'curly':
        long(19)
        for (let i = 0; i < 9; i++) {
          const a = (i / 9) * Math.PI * 2
          P(g, CX + Math.cos(a) * 13 - 3, y + 17 + Math.sin(a) * 9, 6, 6, i % 2 ? r.hi : r.lo2)
        }
        break
      case 'braid': long(19); break
      case 'bob': long(16); break
      case 'afro':
        for (let i = -7; i <= 30; i++) {
          const w = Math.round(Math.sqrt(Math.max(0, 260 - (i - 10) * (i - 10) * 1.05)))
          if (w > 0) P(g, CX - w, y - 6 + i, w * 2, 1, i < 8 ? r.hi : r.base)
        }
        break
      default: break
    }
    return
  }

  // 뒤통수 — 뒤를 볼 때는 머리 전체가 머리카락이다.
  // 세로줄을 촘촘히 넣으면 널빤지처럼 보이므로, 가르마 하나와 둥근 명암만 준다.
  if (back) {
    for (let i = 0; i < HH - 2; i++) {
      const t = i / (HH - 3)
      const inset = i < 2 ? 2 - i : t > 0.8 ? Math.round((t - 0.8) * 12) : 0
      P(g, HX - 1 + inset, y + i, HW + 2 - inset * 2, 1, r.base)
    }
    P(g, HX + 2, y + 1, 5, HH - 9, r.hi)          // 왼쪽에서 드는 빛
    P(g, HX + 3, y + 2, 3, HH - 13, r.hi2)
    P(g, HX + HW - 4, y + 3, 3, HH - 10, r.lo2)   // 오른쪽 그늘
    P(g, CX - 1, y + 2, 1, HH - 8, r.lo)          // 가르마
    P(g, HX + 3, y + HH - 5, HW - 6, 2, r.deep)   // 목덜미 그늘
  }

  /** 머리에 얹는 두께 h 의 덩어리 */
  const cap = (h = 8) => {
    P(g, HX - 2, y - 2, HW + 4, h, r.base)
    P(g, HX + 1, y - 4, HW - 2, 3, r.base)           // 정수리 둥글게
    P(g, HX + 2, y - 3, 6, 4, r.hi3)                 // 왼쪽 위 광택
    P(g, HX + 9, y - 2, 5, 3, r.hi2)
    for (let i = 0; i < 5; i++) P(g, HX - 1 + i * 4, y, 1, h - 3, r.lo)   // 결
    if (back) return                                  // 뒤통수엔 헤어라인이 없다
    // 앞머리 — 밑단이 일자면 가발이 된다. 가닥마다 길이를 달리해 들쭉날쭉하게.
    const BANG = [2, 0, 3, 1, 2, 0, 1]
    const step = (HW + 4) / BANG.length
    for (let i = 0; i < BANG.length; i++) {
      const bx = HX - 2 + Math.round(i * step)
      const bw = Math.ceil(step)
      P(g, bx, y + h - 3, bw, 3 + BANG[i], r.base)    // 삐져나온 가닥
      P(g, bx, y + h + BANG[i], bw, 2, ink)           // 그 끝의 진한 선
      dot(g, bx, y + h - 2, r.hi)
    }
    P(g, HX, y + h + 2, HW, 2, 'rgba(28,22,40,.24)')  // 이마에 지는 그늘
  }
  const sides = (h) => {
    P(g, HX - 3, y + 2, 4, h, r.base)
    P(g, HX + HW - 1, y + 2, 4, h, r.lo)
    P(g, HX - 3, y + 2, 2, Math.floor(h * 0.6), r.hi2)
    P(g, HX - 3, y + h, 4, 2, ink)
    P(g, HX + HW - 1, y + h, 4, 2, ink)
    if (back) return                                  // 뒤에서는 얼굴 경계선이 없다
    P(g, HX + 1, y + 2, 1, h - 2, ink)               // 옆머리와 볼의 경계
    P(g, HX + HW - 2, y + 2, 1, h - 2, ink)
  }

  switch (style) {
    case 'buzz':
      P(g, HX - 1, y - 1, HW + 2, 7, r.base)
      P(g, HX + 2, y - 1, 7, 3, r.hi3)
      P(g, HX - 1, y + 5, HW + 2, 2, ink)
      break
    case 'short': cap(10); sides(11); break
    case 'sidepart':
      cap(10)
      P(g, HX + 10, y - 2, 8, 5, r.hi3)
      P(g, HX + 9, y - 2, 1, 9, r.deep)
      P(g, HX - 3, y + 7, 4, 10, r.base)
      break
    case 'twoblock': cap(12); P(g, HX - 3, y + 11, HW + 6, 2, r.deep); break
    case 'slick':
      cap(8)
      P(g, HX + 1, y - 7, HW - 2, 6, r.base)
      P(g, HX + 3, y - 7, 5, 4, r.hi3)
      for (let i = 0; i < 5; i++) P(g, HX + 2 + i * 3, y - 6, 1, 8, r.lo2)
      break
    case 'pixie': cap(10); sides(14); P(g, HX - 5, y + 10, 4, 8, r.base); break
    case 'spiky':
      cap(8)
      // 가닥 높이를 크게 엇갈리게 하고 바깥쪽일수록 옆으로 눕혀야 삐죽해 보인다.
      // 높이가 고르면 아무리 끝을 뾰족하게 깎아도 「빗자루」가 된다.
      {
        const HS = [17, 10, 21, 12, 18, 9]
        for (let i = 0; i < HS.length; i++) {
          const sx = HX - 2 + Math.round((i * (HW + 3)) / (HS.length - 1))
          const sh = HS[i]
          const lean = (i - 2.5) * 2.8
          for (let k = 0; k < sh; k++) {
            const t = k / sh
            const w = Math.max(1, Math.round(5 - t * 4.2))
            const ox = Math.round(t * t * lean)          // 끝으로 갈수록 급하게 눕는다
            P(g, sx + ox, y - 2 - k, w, 1, t > 0.7 ? r.hi3 : t > 0.35 ? r.hi : r.base)
            if (w > 2) dot(g, sx + ox + w - 1, y - 2 - k, r.lo2)
          }
        }
      }
      break
    case 'mohawk':
      P(g, HX + 5, y - 12, 8, 20, r.base)
      P(g, HX + 6, y - 12, 3, 15, r.hi3)
      P(g, HX + 11, y - 9, 1, 14, r.lo2)
      P(g, HX - 3, y + 2, 4, 8, r.lo2)
      P(g, HX + HW - 1, y + 2, 4, 8, r.lo2)
      break
    case 'afro':
      for (let i = -7; i <= 18; i++) {
        const w = Math.round(Math.sqrt(Math.max(0, 260 - (i - 7) * (i - 7) * 1.05)))
        if (w > 0) P(g, CX - w, y - 6 + i, w * 2, 1, i < 4 ? r.hi : r.base)
      }
      P(g, HX - 4, y - 5, 8, 5, r.hi3)
      for (let i = 0; i < 22; i++) {
        const a = (i / 22) * Math.PI * 2
        P(g, CX + Math.cos(a) * 15 - 1, y + 5 + Math.sin(a) * 13, 3, 3, i % 3 ? r.lo2 : r.hi)
      }
      break
    case 'bob': cap(10); sides(16); break
    case 'long': cap(10); sides(21); break
    case 'hime': cap(10); sides(21); P(g, HX + 1, y + 7, HW - 2, 2, r.deep); break
    case 'wave': cap(10); sides(16); break
    case 'curly':
      cap(10); sides(11)
      for (let i = 0; i < 5; i++) P(g, HX - 1 + i * 4, y - 5, 6, 6, r.hi)
      break
    case 'braid':
      cap(10); sides(13)
      if (!back) for (let i = 0; i < 5; i++) P(g, HX + HW, y + 14 + i * 5, 5, 5, i % 2 ? r.hi : r.base)
      else for (let i = 0; i < 5; i++) P(g, CX - 3 + (i % 2) * 3, y + 22 + i * 5, 5, 5, i % 2 ? r.hi : r.base)
      break
    case 'ponytail':
      cap(10); sides(11)
      if (back) { P(g, CX - 4, y + 10, 8, 26, r.base); P(g, CX - 4, y + 10, 3, 22, r.hi2) }
      else { P(g, HX + HW, y + 6, 8, 23, r.base); P(g, HX + HW, y + 6, 3, 15, r.hi2) }
      break
    case 'twintail':
      cap(10); sides(11)
      P(g, HX - 9, y + 6, 8, 23, r.base)
      P(g, HX + HW + 1, y + 6, 8, 23, r.lo)
      P(g, HX - 9, y + 6, 3, 15, r.hi2)
      P(g, HX - 9, y + 27, 8, 2, r.deep)
      break
    case 'bun':
      cap(10); sides(9)
      P(g, CX - 7, y - 12, 14, 12, r.base)
      P(g, CX - 5, y - 11, 5, 5, r.hi3)
      P(g, CX - 7, y - 3, 14, 3, r.deep)
      break
    default: cap(10); sides(11)
  }
}

const LONG_HAIR = new Set(['long', 'hime', 'wave', 'curly', 'braid', 'bob', 'afro'])

// -----------------------------------------------------------------------------------
// 얼굴 — 눈은 6x8.
//
// 「약간 귀엽게」의 정체는 대부분 눈이다. 눈을 크게 잡되 안에 흰자·홍채·동공·
// 상단 반사·하단 반사를 전부 따로 찍어서, 귀여운데 디테일이 죽지 않게 한다.
// -----------------------------------------------------------------------------------
function drawEye(g, x, y, style, hairC) {
  const white = '#ffffff'
  const iris = '#5a4634'
  const irisHi = shade(iris, 46)
  const pupil = '#141010'
  const lash = shade(hairC, -60)
  switch (style) {
    case 'dot':
      P(g, x + 1, y + 1, 4, 6, pupil)
      P(g, x + 1, y + 1, 2, 2, '#6a6058')
      break
    case 'happy':
      P(g, x, y + 5, 2, 2, pupil); P(g, x + 1, y + 3, 2, 2, pupil)
      P(g, x + 3, y + 3, 2, 2, pupil); P(g, x + 4, y + 5, 2, 2, pupil)
      break
    case 'sharp':
      P(g, x - 1, y + 1, 8, 2, lash)           // 치켜 올라간 눈꼬리
      P(g, x, y + 2, 6, 5, white)
      P(g, x + 1, y + 2, 4, 5, iris)
      P(g, x + 2, y + 3, 2, 4, pupil)
      dot(g, x + 2, y + 3, '#b4907c')
      P(g, x, y + 2, 6, 1, pupil)
      break
    case 'sleepy':
      P(g, x - 1, y + 2, 8, 2, lash)
      P(g, x, y + 4, 6, 3, white)
      P(g, x + 1, y + 4, 4, 3, iris)
      P(g, x + 2, y + 4, 2, 2, pupil)
      break
    case 'sparkle':
      P(g, x, y, 6, 8, white)
      P(g, x + 1, y + 1, 4, 6, iris)
      P(g, x + 1, y + 5, 4, 2, irisHi)         // 아래쪽에서 올라오는 반사
      P(g, x + 2, y + 2, 2, 4, pupil)
      P(g, x + 1, y + 1, 2, 2, white)          // 큰 하이라이트
      P(g, x + 4, y + 5, 1, 1, '#ffe8a8')
      dot(g, x + 4, y + 2, '#fff6d0')
      P(g, x, y, 6, 2, lash)
      break
    default: // oval
      P(g, x, y, 6, 8, white)
      P(g, x + 1, y + 1, 4, 6, iris)
      P(g, x + 1, y + 5, 4, 2, irisHi)         // 홍채 아랫부분이 밝다
      P(g, x + 2, y + 2, 2, 4, pupil)
      P(g, x + 1, y + 1, 2, 2, white)          // 하이라이트
      P(g, x, y, 6, 2, lash)                   // 속눈썹
      P(g, x, y + 7, 6, 1, '#c9a88c')          // 아래 눈꺼풀
  }
}

function drawFace(g, look, dir) {
  if (dir === DIR.up) return
  const sk = ramp(skinOf(look.skin))
  const hairC = look.hairColor || '#2b1d16'
  const style = look.eyes || 'oval'
  const eyeY = HY + 11

  const eyes = dir === DIR.down
    ? [[HX + 2, eyeY], [HX + HW - 8, eyeY]]
    : dir === DIR.left ? [[HX + 1, eyeY]] : [[HX + HW - 7, eyeY]]

  eyes.forEach(([x, y]) => {
    P(g, x, y - 1, 6, 1, sk.lo)                        // 눈두덩 그늘
    drawEye(g, x, y, style, hairC)
    P(g, x - 1, y - 3, 8, 2, shade(hairC, -20))        // 눈썹 — 앞머리 바로 밑
    P(g, x, y - 4, 5, 1, shade(hairC, -6))
  })

  if (dir === DIR.down) {
    P(g, CX - 1, HY + 18, 2, 3, sk.lo)                 // 콧대
    P(g, CX - 1, HY + 20, 3, 1, sk.lo2)                // 콧망울 그늘
    dot(g, CX, HY + 18, sk.hi2)
    P(g, CX - 2, HY + 23, 5, 1, '#a8524c')             // 입
    dot(g, CX - 3, HY + 22, '#a8524c')                 // 입꼬리
    dot(g, CX + 3, HY + 22, '#a8524c')
    P(g, CX - 2, HY + 24, 4, 1, sk.hi)                 // 아랫입술 빛
    P(g, HX + 1, HY + 19, 4, 2, 'rgba(255,120,120,.32)')   // 볼
    P(g, HX + HW - 5, HY + 19, 4, 2, 'rgba(255,120,120,.32)')
  } else {
    const s = dir === DIR.left
    P(g, s ? HX - 1 : HX + HW - 1, HY + 17, 2, 3, sk.lo)   // 옆에서 본 콧날
    dot(g, s ? HX - 1 : HX + HW, HY + 17, sk.hi)
    P(g, s ? HX + 1 : HX + HW - 5, HY + 23, 4, 1, '#a8524c')
    P(g, s ? HX + 2 : HX + HW - 6, HY + 19, 4, 2, 'rgba(255,120,120,.3)')
  }
}

// -----------------------------------------------------------------------------------
// 상의 — 어깨에서 허리로 좁아지는 몸통 알맹이 + 양옆에 따로 붙는 팔
// -----------------------------------------------------------------------------------
function drawTop(g, look, dir, swing) {
  const c = ramp(look.top || '#3b82f6')
  const sk = ramp(skinOf(look.skin))
  const y = TY
  const style = look.outfit || 'tee'

  /**
   * 팔 한 짝 — 소매 → 맨살 → 손.
   * dark 를 주면 몸 뒤로 넘어간 먼 쪽 팔이라 한 단계 어둡게 깔린다.
   */
  const sleeveLen = style === 'sleeveless' ? 0 : 11
  const arm = (ax, off, mirrored, dark) => {
    const tint = (a, b) => (dark ? b : a)
    if (sleeveLen) {
      const sc = style === 'raglan' ? c.lo2 : tint(c.base, c.lo2)
      P(g, ax + 1, y + off, ARM_W - 2, 2, sc)                    // 둥근 어깨(삼각근)
      P(g, ax, y + 1 + off, ARM_W, sleeveLen, sc)
      P(g, ax, y + 1 + off, 1, sleeveLen, mirrored ? c.lo : tint(c.hi2, c.lo))
      P(g, ax + ARM_W - 1, y + 1 + off, 1, sleeveLen, mirrored ? c.deep : c.lo)
      P(g, ax, y + off + sleeveLen - 1, ARM_W, 2, c.deep)        // 소매단
    }
    const ay = y + 1 + off + sleeveLen
    const ah = TH - sleeveLen - 3
    const arm1 = tint(mirrored ? sk.lo : sk.base, sk.lo2)
    P(g, ax, ay, ARM_W, ah, arm1)                                // 팔뚝
    P(g, ax, ay, 1, ah, tint(mirrored ? sk.base : sk.hi, sk.lo2))
    P(g, ax + ARM_W - 1, ay, 1, ah, sk.lo2)
    P(g, ax, ay + ah - 4, ARM_W, 4, tint(mirrored ? sk.lo2 : sk.lo, sk.deep))  // 손
    P(g, ax + 1, ay + ah - 3, ARM_W - 2, 2, tint(mirrored ? sk.lo : sk.base, sk.lo2))
  }

  // 옆을 볼 때는 먼 쪽 팔을 몸통보다 먼저 깔아야 몸 뒤로 들어간다
  if (SIDE) arm(farArmX(), -swing * 3, true, true)

  // 몸통 — 한 줄씩 폭을 바꿔 가며 쌓아 V자 실루엣을 만든다
  for (let i = 0; i < TH; i++) {
    const w = coreW(i)
    const x = coreX(i)
    P(g, x, y + i, w, 1, c.base)
    P(g, x, y + i, 2, 1, c.hi)                         // 왼쪽에서 들어오는 빛
    P(g, x + w - 3, y + i, 3, 1, c.lo)                 // 오른쪽 그늘
    if (i < 3) P(g, x, y + i, w, 1, c.hi2)             // 어깨 윗면
  }
  P(g, coreX(0), y, coreW(0), 1, c.hi3)
  P(g, coreX(TH - 1), y + TH - 4, coreW(TH - 1), 4, c.lo2)    // 밑단
  P(g, coreX(TH - 1), y + TH - 5, coreW(TH - 1), 1, c.deep)
  if (!SIDE) {
    for (let i = 0; i < 3; i++) {                      // 가슴 아래 주름
      P(g, CX - 7 + i * 5, y + 13 + i * 3, 4, 1, c.lo)
      P(g, CX + 4 - i * 4, y + 17 + i * 2, 3, 1, c.lo2)
    }
  }

  if (SIDE) arm(nearArmX(), swing * 3, false)
  else { arm(ARM_L, swing * 3, false); arm(ARM_R, -swing * 3, true) }

  const bx = coreX(4)
  const bw = coreW(4)
  switch (style) {
    case 'vneck':
      P(g, CX - 4, y, 8, 6, sk.base)
      P(g, CX - 3, y + 5, 6, 2, sk.lo)
      P(g, CX - 5, y, 2, 2, c.hi3); P(g, CX + 3, y, 2, 2, c.hi3)
      break
    case 'polo':
      P(g, CX - 7, y, 14, 3, '#ffffff')      // 칼라는 목 둘레만 — 어깨까지 칠하면 어깨뽕이 된다
      P(g, CX - 5, y, 10, 7, c.hi3)
      P(g, CX - 5, y, 3, 7, c.lo2)
      dot(g, CX, y + 3, c.deep); dot(g, CX, y + 6, c.deep)
      break
    case 'stripe':
      for (let i = 3; i < TH - 4; i += 6) P(g, coreX(i), y + i, coreW(i), 3, c.lo2)
      break
    case 'raglan':
      P(g, CX - 7, y, 14, 3, '#ffffff')      // 칼라는 목 둘레만 — 어깨까지 칠하면 어깨뽕이 된다
      P(g, CX - 7, y + 3, 14, 1, c.deep)
      break
    case 'zipup':
      P(g, CX - 1, y, 1, TH, c.deep)
      P(g, CX, y, 1, TH, c.hi3)
      for (let i = 2; i < TH; i += 3) dot(g, CX - 1, y + i, c.hi3)
      P(g, CX - 7, y, 14, 3, '#ffffff')      // 칼라는 목 둘레만 — 어깨까지 칠하면 어깨뽕이 된다
      P(g, CX - 2, y + 2, 3, 3, '#c8ccd4')
      break
    case 'number':
      P(g, CX - 7, y + 7, 14, 12, '#ffffff')
      P(g, CX - 5, y + 9, 10, 8, c.lo2)
      P(g, CX - 2, y + 10, 3, 6, '#ffffff')
      break
    case 'sash':
      for (let i = 0; i < TH; i++) {
        const x = coreX(i)
        P(g, x + Math.min(i, coreW(i) - 8), y + i, 8, 1, c.lo2)
      }
      break
    case 'hoodie':
      P(g, CX - 11, y - 4, 22, 7, c.lo)                 // 후드
      P(g, CX - 9, y - 4, 18, 2, c.base)
      P(g, CX - 8, y - 3, 5, 3, c.deep)
      P(g, CX - 1, y + 6, 2, 11, c.deep)
      P(g, CX - 3, y + 4, 6, 2, '#e8e4dc')              // 끈
      P(g, coreX(TH - 8) + 2, y + TH - 9, coreW(TH - 8) - 4, 4, c.lo2)  // 주머니
      break
    case 'club':
      P(g, bx, y, bw, 6, c.lo2)
      P(g, coreX(6), y + 6, coreW(6), 2, '#ffffff')
      P(g, coreX(8), y + 8, coreW(8), 1, c.deep)
      break
    default:
      P(g, CX - 5, y, 10, 2, c.hi3)                     // 목선
      break
  }
}

// -----------------------------------------------------------------------------------
// 하의 / 다리 / 신발 — 다리가 길어진 만큼 허벅지에서 발목으로 가늘어지게 그린다
// -----------------------------------------------------------------------------------
function drawBottom(g, look, gender, dir, step) {
  const c = ramp(look.bottom || '#1f2937')
  const sk = ramp(skinOf(look.skin))
  const style = look.bottomStyle || (gender === '여' ? 'skirt' : 'shorts')
  const y = LY
  // 옆을 보면 두 다리가 거의 겹친다 — 앞다리만 또렷하고 뒷다리는 살짝 비켜 선다
  const LX = SIDE ? CX - 5 - FACE : CX - 8
  const RX = SIDE ? CX - 2 + FACE : CX + 2
  const LEGW = 7

  /** 맨다리 한 짝 — 위는 굵고 발목으로 갈수록 가늘어진다 */
  const bareLeg = (x, top, mirrored) => {
    for (let i = top; i < SY; i++) {
      const t = (i - top) / Math.max(1, SY - top)
      const w = Math.round(LEGW - t * 2)
      const ox = x + Math.round((LEGW - w) / 2)
      P(g, ox, i, w, 1, mirrored ? sk.lo : sk.base)
      dot(g, ox, i, mirrored ? sk.base : sk.hi)
      dot(g, ox + w - 1, i, sk.lo2)
    }
  }

  const hipW = SIDE ? 12 : 18
  const hipX = CX - (hipW >> 1)

  if (style === 'skirt' || style === 'skirtLayer') {
    P(g, hipX, y, hipW, 4, c.base)                      // 허리
    for (let i = 4; i < 14; i++) {                      // 퍼지는 치마
      const w = Math.round(hipW + (i - 4) * 1.4)
      P(g, CX - w / 2, y + i, w, 1, i < 7 ? c.hi2 : i > 11 ? c.lo2 : c.base)
    }
    for (let i = 0; i < 6; i++) P(g, CX - 11 + i * 4, y + 5, 1, 8, c.lo)   // 주름
    if (style === 'skirtLayer') {
      P(g, CX - 12, y + 13, 24, 3, c.hi3)
      P(g, CX - 12, y + 15, 24, 1, c.lo)
    }
    bareLeg(LX, y + 14, false)
    bareLeg(RX, y + 14, true)
  } else if (style === 'long' || style === 'leggings') {
    const w = style === 'leggings' ? 6 : 8
    for (const [x, mir] of [[LX, false], [RX, true]]) {
      const ox = x + Math.round((LEGW - w) / 2)
      P(g, ox, y, w, LH, mir ? c.lo : c.base)
      P(g, ox, y, 1, LH, mir ? c.base : c.hi)
      P(g, ox + w - 1, y, 1, LH, c.deep)
      P(g, ox, y, w, 2, c.hi2)
      if (style === 'leggings') P(g, ox, y + LH - 3, w, 3, c.lo2)
    }
    P(g, hipX, y, hipW, 6, c.base)                      // 골반
    P(g, hipX, y, hipW, 2, c.hi2)
    if (!SIDE) P(g, CX - 1, y, 2, 8, c.deep)            // 앞선
  } else {
    P(g, hipX, y, hipW, 11, c.base)                     // 반바지
    P(g, hipX, y, hipW, 3, c.hi2)
    P(g, hipX, y, 3, 11, c.hi)
    P(g, hipX + hipW - 4, y, 4, 11, c.lo)
    if (!SIDE) P(g, CX - 1, y + 2, 2, 9, c.deep)        // 가랑이 선
    P(g, hipX, y + 9, hipW, 2, c.lo2)                   // 밑단
    bareLeg(LX, y + 11, false)
    bareLeg(RX, y + 11, true)
  }

  // 신발 — 발등 · 밑창 · 접지면
  const s = ramp(look.shoes || '#ffffff')
  const sStyle = look.shoeStyle || 'basic'
  const h = sStyle === 'high' ? 12 : SH
  const base = SY - (h - SH)
  const ly = base + (step > 0 ? -3 : 0)
  const ry = base + (step < 0 ? -3 : 0)
  // 정면에서 신발은 앞코가 이쪽을 보고, 옆에서는 발등이 길게 눕는다
  const FW = SIDE ? 14 : 11
  const foot = (fx, fy, mirrored) => {
    P(g, fx + 1, fy, FW - 2, h - 3, s.base)
    P(g, fx + 1, fy, FW - 2, 2, s.hi3)
    P(g, fx + 1, fy, 2, h - 3, mirrored ? s.lo : s.hi)
    P(g, fx, fy + h - 4, FW, 2, s.lo2)                  // 밑창 옆면
    P(g, fx, fy + h - 2, FW, 2, s.deep)                 // 접지면
    if (SIDE) P(g, FACE > 0 ? fx + FW - 4 : fx, fy + 1, 4, h - 4, s.hi)   // 앞코
    for (let i = 0; i < 3; i++) P(g, fx + 3, fy + 2 + i * 2, FW - 6, 1, s.lo2)  // 끈
  }
  const lfx = SIDE ? CX - 8 - FACE * 2 : CX - 12
  const rfx = SIDE ? CX - 6 + FACE * 2 : CX + 2
  foot(lfx, ly, false)
  foot(rfx, ry, true)
  if (sStyle === 'stripe') {
    P(g, lfx + 1, ly + 3, FW - 2, 1, '#ffffff'); P(g, rfx + 1, ry + 3, FW - 2, 1, '#ffffff')
  }
  if (sStyle === 'pro') {
    P(g, lfx, ly, 2, h - 3, '#ff4d4d'); P(g, rfx + FW - 2, ry, 2, h - 3, '#ff4d4d')
  }
}

// -----------------------------------------------------------------------------------
// 액세서리
// -----------------------------------------------------------------------------------
function drawAcc(g, look, dir) {
  const y = HY
  switch (look.acc) {
    case 'cap': {
      const c = ramp('#2a4bd0')
      P(g, HX - 2, y - 2, HW + 4, 8, c.base)
      P(g, HX + 1, y - 5, HW - 2, 4, c.base)
      P(g, HX + 2, y - 4, 6, 3, c.hi3)
      P(g, HX - 2, y + 5, HW + 4, 2, c.lo2)
      if (dir !== DIR.up) P(g, HX - 5, y + 7, HW + 10, 3, c.lo)   // 챙
      else P(g, HX + 5, y, 8, 5, '#ffffff')
      break
    }
    case 'visor': {
      const c = ramp('#ff5c8a')
      P(g, HX - 2, y + 3, HW + 4, 5, c.base)
      P(g, HX - 2, y + 3, HW + 4, 2, c.hi3)
      if (dir !== DIR.up) P(g, HX - 5, y + 7, HW + 10, 3, c.lo2)
      break
    }
    case 'headband':
      P(g, HX - 2, y + 6, HW + 4, 4, '#ff4d4d')
      P(g, HX - 2, y + 6, HW + 4, 1, '#ff9a9a')
      P(g, HX - 2, y + 9, HW + 4, 1, '#a82c2c')
      break
    case 'hairpin':
      P(g, HX + HW - 7, y + 4, 8, 2, '#ffd84a')
      P(g, HX + HW - 4, y + 1, 2, 4, '#ffd84a')
      dot(g, HX + HW - 6, y + 4, '#fff1a8')
      break
    case 'glasses':
      if (dir !== DIR.up) {
        const f = '#2a3550'
        P(g, HX + 1, HY + 10, 8, 10, f)
        P(g, HX + HW - 9, HY + 10, 8, 10, f)
        P(g, HX + 2, HY + 11, 6, 8, 'rgba(170,220,255,.5)')
        P(g, HX + HW - 8, HY + 11, 6, 8, 'rgba(170,220,255,.5)')
        P(g, HX + 2, HY + 11, 3, 3, '#eaf7ff')
        P(g, HX + 9, HY + 13, HW - 18, 2, f)
        P(g, HX - 2, HY + 12, 3, 2, f)
      }
      break
    case 'mask':
      if (dir !== DIR.up) {
        P(g, HX + 1, HY + 17, HW - 2, 9, '#f4f6fa')
        P(g, HX + 1, HY + 17, HW - 2, 2, '#ffffff')
        P(g, HX + 1, HY + 23, HW - 2, 3, '#d8dce6')
        P(g, HX + 3, HY + 20, HW - 6, 1, '#e4e8f0')
        P(g, HX - 2, HY + 17, 3, 3, '#d8dce6')
        P(g, HX + HW - 1, HY + 17, 3, 3, '#d8dce6')
      }
      break
    case 'towel':
      P(g, CX - 10, TY - 1, 20, 5, '#f0f4f8')
      P(g, CX - 10, TY - 1, 20, 2, '#ffffff')
      P(g, CX - 9, TY + 4, 6, 11, '#f0f4f8')
      P(g, CX + 3, TY + 4, 6, 11, '#e0e6ec')
      break
    case 'wristband':
      P(g, ARM_L, TY + 20, ARM_W, 4, '#ff4d4d')
      P(g, ARM_R, TY + 20, ARM_W, 4, '#ff4d4d')
      break
    case 'crown': {
      const c = ramp('#ffd21f')
      P(g, HX, y - 8, HW, 8, c.base)
      P(g, HX, y - 8, HW, 3, c.hi3)
      P(g, HX, y - 13, 4, 6, c.base)
      P(g, CX - 2, y - 16, 4, 9, c.base)
      P(g, HX + HW - 4, y - 13, 4, 6, c.base)
      P(g, CX - 2, y - 15, 3, 3, '#ff5c8a')
      P(g, HX + 1, y - 12, 2, 2, '#7ad0ff')
      P(g, HX + HW - 3, y - 12, 2, 2, '#8ef08a')
      break
    }
    default: break
  }
}

// -----------------------------------------------------------------------------------
// 라켓 — 손에서 시작해 다리 옆으로 늘어뜨린다
// -----------------------------------------------------------------------------------
function drawRacket(g, look, dir, swing, behind) {
  const r = look.racket || {}
  const frame = ramp(r.frame || '#ef4444')
  const grip = ramp(r.grip || '#1f2937')
  const str = r.string || '#ffffff'
  const strLo = shade(str, -55)

  if ((dir === DIR.up) !== behind) return

  const right = dir !== DIR.left
  // 손 바깥쪽. 옆을 볼 때는 몸이 좁아진 만큼 라켓도 몸 가까이 붙는다.
  const gx = SIDE ? CX + FACE * 11 - 2 : right ? ARM_R + 5 : ARM_L - 6
  const y = TY + 10 - swing * 3                 // 그립 윗머리
  const cx = gx + 2                             // 라켓 중심선
  const RGRIP = 13

  // 그립
  P(g, gx, y, 4, RGRIP, grip.base)
  P(g, gx, y, 1, RGRIP, grip.hi2)
  P(g, gx + 3, y, 1, RGRIP, grip.deep)
  if (r.wrap === 'spiral') for (let i = 1; i < RGRIP; i += 3) P(g, gx, y + i, 4, 1, shade(grip.base, 55))
  if (r.wrap === 'twotone') P(g, gx, y + 8, 4, 7, shade(grip.base, 65))
  P(g, gx - 1, y - 2, 6, 2, grip.deep)          // 그립 끝

  // 샤프트 → 두 갈래로 갈라져 프레임에 붙는다
  const sy = y + RGRIP
  P(g, gx + 1, sy, 2, 4, frame.lo)
  P(g, gx - 1, sy + 3, 2, 4, frame.lo)
  P(g, gx + 3, sy + 3, 2, 4, frame.lo)

  // 프레임 링 + 스트링 — 신발을 덮지 않을 만큼만 내려온다
  const cy = sy + 14
  const R = 8
  for (let yy = -R; yy <= R; yy++) {
    const w = Math.round(Math.sqrt(Math.max(0, 1 - (yy * yy) / (R * R))) * 7)
    if (w <= 0) continue
    P(g, cx - w, cy + yy, 2, 1, frame.base)
    P(g, cx + w - 2, cy + yy, 2, 1, frame.lo2)
    if (w > 2) P(g, cx - w + 2, cy + yy, (w - 2) * 2, 1, str)
  }
  P(g, cx - 5, cy - R, 10, 2, frame.hi3)
  P(g, cx - 5, cy + R - 1, 10, 2, frame.deep)
  for (let i = -4; i <= 4; i += 3) {
    P(g, cx + i, cy - 7, 1, 15, strLo)
    P(g, cx - 5, cy + i, 11, 1, strLo)
  }

  // ── 엑스칼리버 — 금빛 프레임 + 빛나는 스트링 + 휘두른 궤적 ──
  if (r.model === 'excalibur') {
    for (let yy = -R; yy <= R; yy++) {
      const w = Math.round(Math.sqrt(Math.max(0, 1 - (yy * yy) / (R * R))) * 7)
      if (w <= 0) continue
      P(g, cx - w, cy + yy, 2, 1, '#ffd21f')
      P(g, cx + w - 2, cy + yy, 2, 1, '#c89412')
      if (w > 2) P(g, cx - w + 2, cy + yy, (w - 2) * 2, 1, 'rgba(255,250,210,.95)')
    }
    for (let i = -4; i <= 4; i += 3) {
      P(g, cx + i, cy - 7, 1, 15, 'rgba(255,214,90,.9)')
      P(g, cx - 5, cy + i, 11, 1, 'rgba(255,214,90,.9)')
    }
    P(g, cx - 6, cy - R - 1, 12, 2, '#fff6c0')
    const dirn = right ? 1 : -1
    for (let i = 0; i < 4; i++) {
      P(g, cx + dirn * (8 + i * 3), cy - 6 + i * 3 - swing * 2, 2, 7 - i, `rgba(255,226,130,${0.5 - i * 0.1})`)
    }
    P(g, gx - 1, y + 5, 6, 4, '#7ad0ff')        // 손잡이 보석
    P(g, gx, y + 6, 4, 2, '#d8f4ff')
  }
}

// -----------------------------------------------------------------------------------
// 초레어템 — 히어로 장비
// 걸음 프레임(step)에 따라 펄럭이고 반짝여서, 걷는 동안 계속 살아 움직인다.
// -----------------------------------------------------------------------------------
const GOLD = ramp('#ffd21f')
const CRIMSON = ramp('#c0243c')

/** 여명의 망토 — 어깨에서 발까지 흐르고 바람에 펄럭인다 */
function drawCape(g, look, dir, step) {
  if (look.cape !== 'heroCape') return
  const sway = step * 4
  const top = TY - 2
  const bottom = 89

  for (let y = top; y < bottom; y++) {
    const t = (y - top) / (bottom - top)
    const half = 10 + t * 11                          // 아래로 갈수록 넓게 퍼진다
    const wave = Math.sin(t * 3.1 + step * 1.2) * (3 + t * 5) + sway * t
    const cx = CX + wave
    const tone = t < 0.18 ? CRIMSON.hi : t < 0.55 ? CRIMSON.base : t < 0.85 ? CRIMSON.lo : CRIMSON.lo2
    P(g, cx - half, y, half * 2, 1, tone)
    P(g, cx - half + 4, y, 3, 1, CRIMSON.deep)        // 안쪽 접힌 그늘
    P(g, cx + half - 7, y, 3, 1, CRIMSON.deep)
    if (t > 0.1) P(g, cx - half, y, 3, 1, CRIMSON.hi2)
  }
  for (let y = top; y < bottom; y++) {                // 금빛 테두리
    const t = (y - top) / (bottom - top)
    const half = 10 + t * 11
    const wave = Math.sin(t * 3.1 + step * 1.2) * (3 + t * 5) + sway * t
    const cx = CX + wave
    if (y > bottom - 3) P(g, cx - half, y, half * 2, 1, GOLD.base)
    else { P(g, cx - half, y, 2, 1, GOLD.lo); P(g, cx + half - 2, y, 2, 1, GOLD.deep) }
  }
  // 어깨 걸쇠
  P(g, coreX(1) - 1, TY - 2, 7, 5, GOLD.base)
  P(g, coreX(1) + coreW(1) - 6, TY - 2, 7, 5, GOLD.lo)
  P(g, coreX(1), TY - 1, 3, 2, GOLD.hi3)
  // 빛의 잔상
  for (let i = 0; i < 5; i++) {
    const t = 0.3 + i * 0.14
    const wave = Math.sin(t * 3.1 + step * 1.2) * (3 + t * 5) + sway * t
    P(g, CX + wave - 16 - i * 2, top + t * (bottom - top), 3, 2, 'rgba(255,210,80,.45)')
  }
}

/** 셔틀보드 — 발밑에 떠올라 빛의 궤적을 남긴다 */
function drawMount(g, look, step) {
  if (look.mount !== 'shuttleBoard') return
  const y = 88 + (step ? -1 : 0)
  const board = ramp('#2f6fc0')
  P(g, 12, y, 40, 6, board.base)
  P(g, 12, y, 40, 2, board.hi2)
  P(g, 12, y + 4, 40, 2, board.deep)
  P(g, 10, y + 1, 4, 4, board.lo)
  P(g, 50, y + 1, 4, 4, board.lo)
  P(g, 16, y + 2, 32, 1, GOLD.base)
  for (let i = 0; i < 4; i++) {                       // 아래로 뿜는 빛
    const w = 36 - i * 7
    P(g, CX - w / 2, y + 6 + i, w, 1, `rgba(120,200,255,${0.5 - i * 0.11})`)
  }
  for (let i = 0; i < 4; i++) {                       // 궤적
    P(g, 6 - i * 2 + (step ? 2 : 0), y + 2 + i, 5, 1, `rgba(160,220,255,${0.45 - i * 0.1})`)
    P(g, 54 + i * 2 - (step ? 2 : 0), y + 2 + i, 5, 1, `rgba(160,220,255,${0.35 - i * 0.08})`)
  }
}

/** 갑주·투구·엑스칼리버에 얹는 금빛 발광 */
function drawUltraGlow(g, look, dir, step) {
  const t = step
  // 옷 — 갑주 가장자리가 흐른다
  if (look.outfit === 'heroSuit') {
    for (let i = 0; i < TH; i++) {
      const x = coreX(i)
      const w = coreW(i)
      if (i < 2) P(g, x, TY + i, w, 1, GOLD.hi3)
      if (i > TH - 4) P(g, x, TY + i, w, 1, GOLD.base)
      P(g, x, TY + i, 2, 1, GOLD.base)
      P(g, x + w - 2, TY + i, 2, 1, GOLD.lo)
    }
    P(g, CX - 4, TY + 8, 8, 7, GOLD.hi3)              // 가슴 문장
    P(g, CX - 2, TY + 6, 4, 11, GOLD.base)
    P(g, ARM_L - 1, TY + 1, 8, 6, GOLD.lo)            // 어깨 갑
    P(g, ARM_R - 2, TY + 1, 8, 6, GOLD.lo2)
    P(g, ARM_L, TY + 2, 4, 2, GOLD.hi3)
  }
  // 투구 — 눈은 가리지 않는다. 이마까지만 덮고 양옆으로 빛의 날개가 뻗는다.
  if (look.acc === 'heroHelm') {
    const y = HY
    P(g, HX - 2, y - 3, HW + 4, 8, GOLD.base)
    P(g, HX - 2, y - 3, HW + 4, 3, GOLD.hi3)
    P(g, HX - 2, y + 4, HW + 4, 1, GOLD.lo2)
    P(g, CX - 2, y - 8, 4, 6, GOLD.hi3)               // 정수리 뿔
    P(g, CX - 1, y + 5, 2, 5, GOLD.lo)                // 미간 노즈가드
    for (let i = 0; i < 4; i++) {
      const w = 6 - i
      P(g, HX - 4 - i * 3, y - 1 + i * 2 - t, w, 2, `rgba(255,232,140,${0.9 - i * 0.18})`)
      P(g, HX + HW - 2 + i * 3, y - 1 + i * 2 + t, w, 2, `rgba(255,232,140,${0.8 - i * 0.17})`)
    }
  }
  // 반짝임 — 걸음마다 자리가 바뀐다
  if (look.cape === 'heroCape' || look.outfit === 'heroSuit' || look.acc === 'heroHelm' ||
      look.mount === 'shuttleBoard' || look.racket?.model === 'excalibur') {
    const seed = (t + 2) * 7
    for (let i = 0; i < 7; i++) {
      const sx = 4 + ((i * 17 + seed * 5) % 56)
      const sy = 10 + ((i * 29 + seed * 11) % 74)
      P(g, sx, sy, 2, 2, '#fff6c0')
      P(g, sx - 1, sy, 4, 1, 'rgba(255,240,170,.65)')
      P(g, sx, sy - 1, 1, 4, 'rgba(255,240,170,.65)')
    }
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

  // 망토는 몸보다 뒤 (뒤통수를 볼 때만 앞으로 온다)
  if (dir !== DIR.up) drawCape(g, look, dir, step)
  drawMount(g, look, step)
  drawRacket(g, look, dir, step, true)
  if (LONG_HAIR.has(hair)) drawHair(g, hair, hairC, dir, true)

  drawBottom(g, look, gender, dir, step)
  drawTop(g, look, dir, step)

  // 목 — 머리보다 확실히 좁게. 여기가 좁아야 머리가 커도 답답해 보이지 않는다.
  P(g, CX - 3, NY - 4, 6, 6, sk.lo)
  P(g, CX - 3, NY - 4, 6, 1, sk.lo2)     // 턱이 드리우는 그늘
  P(g, CX - 3, NY - 4, 2, 6, sk.base)

  // 머리 — 위는 둥글고, 아래 1/3 에서 턱으로 부드럽게 좁아진다
  for (let i = 0; i < HH; i++) {
    const t = i / (HH - 1)
    let inset = 0
    if (i === 0) inset = 4
    else if (i === 1) inset = 2
    else if (i === 2) inset = 1
    else if (t > 0.66) inset = Math.round(((t - 0.66) / 0.34) * 4)
    P(g, HX + inset, HY + i, HW - inset * 2, 1, sk.base)
  }
  P(g, HX + 4, HY, HW - 8, 3, sk.hi2)                  // 이마 하이라이트
  P(g, HX + 1, HY + 2, 3, HH - 10, sk.hi)              // 왼쪽에서 드는 빛
  P(g, HX + HW - 4, HY + 3, 3, HH - 11, sk.lo)         // 오른쪽 그늘
  P(g, HX + 5, HY + HH - 3, HW - 10, 2, sk.lo)         // 턱 아래
  P(g, HX + 7, HY + HH - 1, HW - 14, 1, sk.lo2)
  if (!BACK) {
    P(g, HX - 2, HY + 11, 2, 6, sk.base)               // 귀
    P(g, HX + HW, HY + 11, 2, 6, sk.lo)
    dot(g, HX - 1, HY + 13, sk.lo)
  }

  drawHair(g, hair, hairC, dir, false)
  drawFace(g, look, dir)
  drawAcc(g, look, dir)
  drawRacket(g, look, dir, step, false)
  if (dir === DIR.up) drawCape(g, look, dir, step)
  drawUltraGlow(g, look, dir, step)
}

function drawFrame(g, look, gender, dir, frame) {
  setGeom(dir)
  for (let i = 3; i >= 1; i--) {
    g.fillStyle = `rgba(16,20,34,${0.1 * i})`
    g.beginPath()
    g.ellipse(CX, 90, (SIDE ? 11 : 15) * (i / 3), 5 * (i / 3), 0, 0, Math.PI * 2)
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
    look.acc, look.cape, look.mount, r.model, r.frame, r.string, r.grip, r.wrap,
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
  ctx.drawImage(sheet, frame * CW, dir * CH, CW, CH, Math.round(x - w / 2), Math.round(y - h + 5 * scale), w, h)
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
