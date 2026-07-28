// ===================================================================================
// 얼굴 텍스처 — 눈·눈썹·입을 3D 도형이 아니라 그림으로 그려서 머리에 입힌다.
//
// 원신·VRoid 같은 스타일라이즈드 게임이 쓰는 방식이다.
// 구슬 같은 눈알을 붙이는 대신 2D로 그리면
//   · 속눈썹, 홍채 그라데이션, 하이라이트, 아이라인 같은 디테일이 가능하고
//   · 표정(깜빡임·미소)을 텍스처 교체만으로 바꿀 수 있으며
//   · 폴리곤을 거의 안 쓴다.
// ===================================================================================
import * as THREE from 'three'

const cache = new Map()
const S = 512

const hex2rgb = (h) => {
  const n = parseInt(h.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
const mixHex = (a, b, t) => {
  const A = hex2rgb(a)
  const B = hex2rgb(b)
  return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(',')})`
}

/** 눈매별 형태 파라미터 */
const EYE = {
  oval:    { w: 1.0,  h: 1.0,  tilt: 0.0,  lash: 1.0, round: 0.55 },
  dot:     { w: 0.62, h: 0.72, tilt: 0.0,  lash: 0.5, round: 0.9 },
  sharp:   { w: 1.12, h: 0.82, tilt: -0.16, lash: 1.4, round: 0.3 },
  sleepy:  { w: 1.02, h: 0.62, tilt: 0.1,  lash: 0.8, round: 0.5 },
  sparkle: { w: 1.05, h: 1.15, tilt: -0.04, lash: 1.1, round: 0.62 },
  happy:   { w: 1.0,  h: 1.0,  tilt: 0.0,  lash: 1.0, round: 0.55, arc: true },
}

/**
 * 한쪽 눈을 그린다.
 * @param {CanvasRenderingContext2D} g
 * @param {number} cx,cy 중심
 * @param {number} side -1(왼) | 1(오)
 */
function drawEye(g, cx, cy, side, cfg, closed, browColor, irisColor) {
  const w = 62 * cfg.w
  const h = 74 * cfg.h

  g.save()
  g.translate(cx, cy)
  g.rotate(side * cfg.tilt)

  // ── 감은 눈 / 웃는 눈: 아치형 선 ──
  if (closed || cfg.arc) {
    g.strokeStyle = '#2a2129'
    g.lineWidth = 9
    g.lineCap = 'round'
    g.beginPath()
    g.arc(0, closed ? 6 : 10, w * 0.62, Math.PI * 1.12, Math.PI * 1.88)
    g.stroke()
    // 아래 속눈썹 살짝
    g.lineWidth = 4
    g.beginPath()
    g.moveTo(side * w * 0.5, -2)
    g.lineTo(side * w * 0.68, -10)
    g.stroke()
    g.restore()
    return
  }

  // ── 흰자 ──
  g.fillStyle = '#fdfcff'
  g.beginPath()
  g.ellipse(0, 0, w * 0.5, h * 0.5, 0, 0, Math.PI * 2)
  g.fill()

  // ── 홍채 ──
  const irisR = Math.min(w, h) * 0.42
  const grad = g.createRadialGradient(0, -irisR * 0.25, irisR * 0.2, 0, 0, irisR)
  grad.addColorStop(0, mixHex(irisColor, '#ffffff', 0.45))
  grad.addColorStop(0.55, irisColor)
  grad.addColorStop(1, mixHex(irisColor, '#000000', 0.5))
  g.save()
  g.beginPath()
  g.ellipse(0, 0, w * 0.5, h * 0.5, 0, 0, Math.PI * 2)
  g.clip()
  g.fillStyle = grad
  g.beginPath()
  g.arc(0, h * 0.04, irisR, 0, Math.PI * 2)
  g.fill()
  // 홍채 방사선
  g.strokeStyle = mixHex(irisColor, '#000000', 0.35)
  g.lineWidth = 2
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2
    g.beginPath()
    g.moveTo(Math.cos(a) * irisR * 0.4, h * 0.04 + Math.sin(a) * irisR * 0.4)
    g.lineTo(Math.cos(a) * irisR * 0.92, h * 0.04 + Math.sin(a) * irisR * 0.92)
    g.stroke()
  }
  // 동공
  g.fillStyle = '#1a1420'
  g.beginPath()
  g.arc(0, h * 0.04, irisR * 0.42, 0, Math.PI * 2)
  g.fill()
  // 아래쪽 반사광
  g.fillStyle = mixHex(irisColor, '#ffffff', 0.6)
  g.beginPath()
  g.arc(0, h * 0.04 + irisR * 0.42, irisR * 0.38, 0, Math.PI * 2)
  g.fill()
  g.restore()

  // ── 하이라이트 ──
  g.fillStyle = '#ffffff'
  g.beginPath()
  g.arc(side * -w * 0.15, -h * 0.16, irisR * 0.3, 0, Math.PI * 2)
  g.fill()
  g.beginPath()
  g.arc(side * w * 0.16, h * 0.18, irisR * 0.14, 0, Math.PI * 2)
  g.fill()
  if (cfg.w > 1.02) {
    g.globalAlpha = 0.75
    g.beginPath()
    g.arc(side * w * 0.05, -h * 0.3, irisR * 0.1, 0, Math.PI * 2)
    g.fill()
    g.globalAlpha = 1
  }

  // ── 윗 아이라인 + 속눈썹 (눈매를 결정하는 가장 중요한 선) ──
  g.strokeStyle = '#221b26'
  g.lineCap = 'round'
  g.lineWidth = 11 * cfg.lash
  g.beginPath()
  g.ellipse(0, 0, w * 0.5, h * 0.5, 0, Math.PI * 1.05, Math.PI * 1.95)
  g.stroke()
  // 바깥쪽 속눈썹 뾰족하게
  g.lineWidth = 7 * cfg.lash
  g.beginPath()
  g.moveTo(side * w * 0.42, -h * 0.2)
  g.lineTo(side * w * 0.72, -h * 0.42)
  g.stroke()

  // ── 아랫 라인 (연하게) ──
  g.strokeStyle = 'rgba(60,45,60,0.45)'
  g.lineWidth = 4
  g.beginPath()
  g.ellipse(0, 0, w * 0.46, h * 0.46, 0, Math.PI * 0.15, Math.PI * 0.85)
  g.stroke()

  g.restore()
}

/**
 * 얼굴 텍스처를 만든다.
 * @param {object} look 캐릭터 외모
 * @param {boolean} closed 눈 감은 버전
 * @returns {THREE.CanvasTexture}
 */
export function faceTexture(look, closed = false) {
  const style = look.eyes || 'oval'
  const brow = look.hairColor || '#2b1d16'
  const key = `${style}|${brow}|${closed}`
  if (cache.has(key)) return cache.get(key)

  const c = document.createElement('canvas')
  c.width = c.height = S
  const g = c.getContext('2d')
  g.clearRect(0, 0, S, S)

  const cfg = EYE[style] || EYE.oval
  const eyeY = S * 0.46
  const eyeX = S * 0.215 // 중심에서 좌우 거리

  // ── 볼터치 (가장 아래 레이어) ──
  const blush = g.createRadialGradient(0, 0, 0, 0, 0, 1)
  ;[-1, 1].forEach((s) => {
    const bx = S / 2 + s * S * 0.315
    const by = S * 0.6
    const rg = g.createRadialGradient(bx, by, 2, bx, by, S * 0.105)
    rg.addColorStop(0, 'rgba(255,132,152,0.5)')
    rg.addColorStop(1, 'rgba(255,132,152,0)')
    g.fillStyle = rg
    g.beginPath()
    g.ellipse(bx, by, S * 0.105, S * 0.07, 0, 0, Math.PI * 2)
    g.fill()
  })

  // ── 눈썹 ──
  const browY = S * 0.29
  g.strokeStyle = mixHex(brow, '#000000', 0.15)
  g.lineWidth = 15
  g.lineCap = 'round'
  ;[-1, 1].forEach((s) => {
    const bx = S / 2 + s * eyeX
    g.beginPath()
    if (style === 'sharp') {
      g.moveTo(bx - s * 46, browY + 12)
      g.quadraticCurveTo(bx, browY - 16, bx + s * 46, browY + 2)
    } else if (style === 'sleepy') {
      g.moveTo(bx - s * 44, browY - 2)
      g.quadraticCurveTo(bx, browY + 6, bx + s * 44, browY + 14)
    } else {
      g.moveTo(bx - s * 44, browY + 10)
      g.quadraticCurveTo(bx, browY - 12, bx + s * 46, browY + 6)
    }
    g.stroke()
  })

  // ── 눈 ──
  const iris = { sharp: '#5a3b2a', sparkle: '#3f7fd4', sleepy: '#6b5b45' }[style] || '#4a3328'
  drawEye(g, S / 2 - eyeX, eyeY, -1, cfg, closed, brow, iris)
  drawEye(g, S / 2 + eyeX, eyeY, 1, cfg, closed, brow, iris)

  // ── 코 (아주 옅은 그림자 점) ──
  g.fillStyle = 'rgba(150,100,90,0.22)'
  g.beginPath()
  g.ellipse(S / 2, S * 0.605, 7, 5, 0, 0, Math.PI * 2)
  g.fill()

  // ── 입 ──
  g.strokeStyle = '#9c4f52'
  g.lineWidth = 8
  g.lineCap = 'round'
  g.beginPath()
  g.arc(S / 2, S * 0.66, S * 0.075, Math.PI * 0.18, Math.PI * 0.82)
  g.stroke()
  // 아랫입술 하이라이트
  g.strokeStyle = 'rgba(255,180,180,0.55)'
  g.lineWidth = 4
  g.beginPath()
  g.arc(S / 2, S * 0.652, S * 0.062, Math.PI * 0.28, Math.PI * 0.72)
  g.stroke()

  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  tex.needsUpdate = true
  cache.set(key, tex)
  return tex
}

/** 확인용 — 그려진 얼굴을 데이터 URL 로 뽑는다 */
export function faceDataUrl(look, closed = false) {
  const tex = faceTexture(look, closed)
  return tex.image.toDataURL('image/png')
}
