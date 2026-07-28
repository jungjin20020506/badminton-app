// ===================================================================================
// 선수 카드용 얼굴 아바타 — 3D 캐릭터와 같은 피부/머리/눈 설정으로 2D 초상을 그린다.
// 카드에서 "누구인지" 한눈에 알아보게 하는 장치. 캔버스로 그려 캐시한다.
// ===================================================================================
import { SKIN_TONES } from '../game/constants.js'

const cache = new Map()
const skinOf = (id) => SKIN_TONES.find((s) => s.id === id)?.color || '#fdd0ae'

const shade = (hex, amt) => {
  const n = parseInt(hex.slice(1), 16)
  const r = Math.max(0, Math.min(255, ((n >> 16) & 255) + amt))
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amt))
  const b = Math.max(0, Math.min(255, (n & 255) + amt))
  return `rgb(${r},${g},${b})`
}

/**
 * @param {object} look 캐릭터 외모
 * @param {string} gender '남' | '여'
 * @param {number} size 픽셀
 * @returns {string} dataURL
 */
export function avatarUrl(look, gender = '남', size = 96) {
  if (!look) return ''
  const key = [look.skin, look.hair, look.hairColor, look.eyes, look.top, look.acc, gender, size].join('|')
  if (cache.has(key)) return cache.get(key)

  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')
  const S = size
  const cx = S / 2
  const cy = S * 0.54
  const R = S * 0.31
  const skin = skinOf(look.skin)
  const hair = look.hairColor || '#2b1d16'

  // 배경 — 옷 색을 옅게 깐다
  const grad = g.createLinearGradient(0, 0, 0, S)
  grad.addColorStop(0, shade(look.top || '#7cc576', 55))
  grad.addColorStop(1, look.top || '#7cc576')
  g.fillStyle = grad
  g.fillRect(0, 0, S, S)

  // 어깨
  g.fillStyle = shade(look.top || '#7cc576', -28)
  g.beginPath()
  g.ellipse(cx, S * 1.08, S * 0.42, S * 0.34, 0, 0, Math.PI * 2)
  g.fill()

  // 뒷머리
  g.fillStyle = shade(hair, -18)
  g.beginPath()
  g.ellipse(cx, cy - R * 0.05, R * 1.16, R * 1.2, 0, 0, Math.PI * 2)
  g.fill()

  // 긴 머리 계열은 옆으로 흘러내리게
  if (['long', 'wave', 'bob', 'twintail'].includes(look.hair)) {
    g.beginPath()
    g.ellipse(cx - R * 0.95, cy + R * 0.5, R * 0.4, R * 0.95, 0, 0, Math.PI * 2)
    g.ellipse(cx + R * 0.95, cy + R * 0.5, R * 0.4, R * 0.95, 0, 0, Math.PI * 2)
    g.fill()
  }

  // 얼굴
  g.fillStyle = skin
  g.beginPath()
  g.ellipse(cx, cy, R, R * 1.04, 0, 0, Math.PI * 2)
  g.fill()

  // 앞머리 (스타일별 실루엣)
  g.fillStyle = hair
  g.beginPath()
  if (look.hair === 'buzz') {
    g.ellipse(cx, cy - R * 0.52, R * 0.98, R * 0.5, 0, Math.PI, 0)
  } else if (look.hair === 'spiky' || look.hair === 'mohawk') {
    g.moveTo(cx - R, cy - R * 0.25)
    for (let i = 0; i <= 6; i++) {
      const x = cx - R + (i * 2 * R) / 6
      g.lineTo(x + R / 12, cy - R * (i % 2 ? 1.05 : 0.72))
      g.lineTo(x + R / 6, cy - R * 0.3)
    }
    g.lineTo(cx + R, cy - R * 0.25)
  } else {
    g.ellipse(cx, cy - R * 0.46, R * 1.03, R * 0.62, 0, Math.PI, 0)
    g.rect(cx - R * 1.03, cy - R * 0.5, R * 2.06, R * 0.28)
  }
  g.fill()

  // 똥머리 / 포니테일 포인트
  if (look.hair === 'bun') {
    g.beginPath()
    g.arc(cx, cy - R * 1.12, R * 0.32, 0, Math.PI * 2)
    g.fill()
  }
  if (look.hair === 'twintail') {
    g.beginPath()
    g.arc(cx - R * 1.1, cy - R * 0.35, R * 0.26, 0, Math.PI * 2)
    g.arc(cx + R * 1.1, cy - R * 0.35, R * 0.26, 0, Math.PI * 2)
    g.fill()
  }

  // 눈
  const ex = R * 0.38
  const ey = cy + R * 0.08
  const style = look.eyes || 'oval'
  g.fillStyle = '#241c1a'
  if (style === 'happy') {
    g.lineWidth = S * 0.035
    g.strokeStyle = '#241c1a'
    g.lineCap = 'round'
    ;[-1, 1].forEach((s) => {
      g.beginPath()
      g.arc(cx + s * ex, ey + R * 0.06, R * 0.2, Math.PI * 1.15, Math.PI * 1.85)
      g.stroke()
    })
  } else if (style === 'sleepy') {
    g.lineWidth = S * 0.03
    g.strokeStyle = '#241c1a'
    g.lineCap = 'round'
    ;[-1, 1].forEach((s) => {
      g.beginPath()
      g.moveTo(cx + s * ex - R * 0.17, ey)
      g.lineTo(cx + s * ex + R * 0.17, ey)
      g.stroke()
    })
  } else {
    const w = style === 'dot' ? 0.11 : style === 'sharp' ? 0.19 : 0.15
    const hgt = style === 'dot' ? 0.13 : style === 'sharp' ? 0.12 : 0.19
    ;[-1, 1].forEach((s) => {
      g.beginPath()
      g.ellipse(cx + s * ex, ey, R * w, R * hgt, 0, 0, Math.PI * 2)
      g.fill()
    })
    // 하이라이트
    g.fillStyle = '#ffffff'
    ;[-1, 1].forEach((s) => {
      g.beginPath()
      g.arc(cx + s * ex + R * 0.05, ey - R * 0.06, R * 0.05, 0, Math.PI * 2)
      g.fill()
    })
  }

  // 볼터치
  g.fillStyle = 'rgba(255,140,160,0.35)'
  ;[-1, 1].forEach((s) => {
    g.beginPath()
    g.ellipse(cx + s * R * 0.66, cy + R * 0.36, R * 0.17, R * 0.11, 0, 0, Math.PI * 2)
    g.fill()
  })

  // 입
  g.strokeStyle = '#8d4a4f'
  g.lineWidth = S * 0.026
  g.lineCap = 'round'
  g.beginPath()
  g.arc(cx, cy + R * 0.36, R * 0.2, Math.PI * 0.2, Math.PI * 0.8)
  g.stroke()

  // 헤어밴드 / 모자
  if (look.acc === 'headband') {
    g.fillStyle = look.top || '#ef4444'
    g.fillRect(cx - R * 1.02, cy - R * 0.6, R * 2.04, R * 0.18)
  } else if (look.acc === 'cap') {
    g.fillStyle = look.top || '#ef4444'
    g.beginPath()
    g.ellipse(cx, cy - R * 0.5, R * 1.06, R * 0.62, 0, Math.PI, 0)
    g.fill()
    g.fillRect(cx - R * 1.25, cy - R * 0.54, R * 2.5, R * 0.16)
  }

  const url = c.toDataURL('image/png')
  cache.set(key, url)
  return url
}
