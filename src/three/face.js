// ===================================================================================
// 얼굴 텍스처 — 눈·눈썹·입을 3D 도형이 아니라 그림으로 그려서 머리에 입힌다.
// (원신·VRoid 같은 스타일라이즈드 게임이 쓰는 방식)
//
// 좌표 규칙
//   · 512x512 캔버스에 "늘어나지 않은 얼굴"을 그린다.
//   · 실제로 붙는 머리 표면(구면 패치)은 세로보다 가로가 넓어서 그림이 옆으로
//     늘어난다. 그래서 마지막에 가로를 SQUEEZE 만큼 줄여 보정한다.
// ===================================================================================
import * as THREE from 'three'

const cache = new Map()
const S = 512

/** 얼굴이 붙는 구면 패치 범위 — Character.jsx 와 반드시 같아야 한다 */
export const FACE_PATCH = {
  phiStart: Math.PI / 2 - Math.PI * 0.28,
  phiLength: Math.PI * 0.56,
  thetaStart: Math.PI * 0.24,
  thetaLength: Math.PI * 0.46,
}
/** 가로/세로 호 길이 비 → 그림을 이만큼 가로로 줄여 두면 모델에서 정상 비율이 된다 */
const SQUEEZE = FACE_PATCH.thetaLength / FACE_PATCH.phiLength // ≈ 0.82

const hex2rgb = (h) => {
  const n = parseInt(h.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
const mix = (a, b, t) => {
  const A = hex2rgb(a)
  const B = hex2rgb(b)
  return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(',')})`
}

// -----------------------------------------------------------------------------------
// 배치 (512 기준) — 눈을 크고 가깝게, 눈썹은 얇고 눈 가까이
// -----------------------------------------------------------------------------------
// 동물의 숲 기준 — 눈은 작고 서로 멀리, 눈썹은 거의 없다시피 얇게
const EYE_Y = 268
const EYE_DX = 116   // 중심에서 좌우 거리 (넓게)
const EYE_W = 64     // 눈 전체 너비 (작게)
const EYE_H = 82     // 눈 전체 높이
const BROW_Y = 176
const MOUTH_Y = 372
const BLUSH_Y = 322

/** 눈매별 형태 */
const EYE = {
  oval:    { w: 1.0,  h: 1.0,  tilt: 0.0,   lash: 1.0, tail: 1.0 },
  dot:     { w: 0.72, h: 0.78, tilt: 0.0,   lash: 0.7, tail: 0.5 },
  sharp:   { w: 1.08, h: 0.8,  tilt: -0.14, lash: 1.35, tail: 1.5 },
  sleepy:  { w: 1.0,  h: 0.66, tilt: 0.1,   lash: 0.9, tail: 0.7 },
  sparkle: { w: 1.02, h: 1.12, tilt: -0.03, lash: 1.05, tail: 1.0 },
  happy:   { w: 1.0,  h: 1.0,  tilt: 0.0,   lash: 1.0, tail: 1.0, arc: true },
}

const IRIS = { sharp: '#5b3a24', sparkle: '#2f7fd0', sleepy: '#6d5a42', dot: '#3a2a20' }

function drawEye(g, cx, cy, side, cfg, closed, iris) {
  const w = EYE_W * cfg.w
  const h = EYE_H * cfg.h

  g.save()
  g.translate(cx, cy)
  g.rotate(side * cfg.tilt)

  // ── 감은 눈 / 웃는 눈 ──
  if (closed || cfg.arc) {
    g.strokeStyle = '#33272f'
    g.lineWidth = 10
    g.lineCap = 'round'
    g.beginPath()
    g.arc(0, h * 0.16, w * 0.52, Math.PI * 1.1, Math.PI * 1.9)
    g.stroke()
    g.restore()
    return
  }

  // ── 동물의 숲 스타일: 흰자에 큰 검은 눈동자 + 작은 하이라이트 ──
  // 흰자
  g.fillStyle = '#ffffff'
  g.beginPath()
  g.ellipse(0, 0, w * 0.5, h * 0.5, 0, 0, Math.PI * 2)
  g.fill()
  // 눈동자 — 흰자를 거의 채운다
  g.save()
  g.beginPath()
  g.ellipse(0, 0, w * 0.5, h * 0.5, 0, 0, Math.PI * 2)
  g.clip()
  const pr = Math.min(w, h) * 0.44
  const pg = g.createRadialGradient(0, -pr * 0.2, pr * 0.15, 0, 0, pr)
  pg.addColorStop(0, mix(iris, '#ffffff', 0.25))
  pg.addColorStop(0.6, iris)
  pg.addColorStop(1, mix(iris, '#000000', 0.55))
  g.fillStyle = pg
  g.beginPath()
  g.ellipse(0, h * 0.04, pr * 1.02, pr * 1.24, 0, 0, Math.PI * 2)
  g.fill()
  g.restore()
  // 하이라이트 하나 (작게)
  g.fillStyle = '#ffffff'
  g.beginPath()
  g.arc(side * -w * 0.14, -h * 0.2, pr * 0.3, 0, Math.PI * 2)
  g.fill()
  // 눈 테두리 — 아주 얇게
  g.strokeStyle = 'rgba(45,34,42,0.55)'
  g.lineWidth = 3.5
  g.beginPath()
  g.ellipse(0, 0, w * 0.5, h * 0.5, 0, 0, Math.PI * 2)
  g.stroke()
  g.restore()
  return

}

/**
 * @param {object} look 캐릭터 외모
 * @param {boolean} closed 눈 감은 버전
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

  // 구면에 붙을 때 옆으로 늘어나는 만큼 미리 가로를 줄여 둔다
  g.translate(S / 2, 0)
  g.scale(SQUEEZE, 1)
  g.translate(-S / 2, 0)

  const cfg = EYE[style] || EYE.oval
  const iris = IRIS[style] || '#4a3226'

  // ── 볼터치 ──
  ;[-1, 1].forEach((s) => {
    const bx = S / 2 + s * 178
    const rg = g.createRadialGradient(bx, BLUSH_Y, 3, bx, BLUSH_Y, 68)
    rg.addColorStop(0, 'rgba(255,126,148,0.45)')
    rg.addColorStop(1, 'rgba(255,126,148,0)')
    g.fillStyle = rg
    g.beginPath()
    g.ellipse(bx, BLUSH_Y, 68, 44, 0, 0, Math.PI * 2)
    g.fill()
  })

  // ── 눈썹 ──
  // 동물의 숲 주민은 눈썹이 거의 없다. 아주 얇고 짧게, 눈매를 강조할 때만.
  if (style === 'sharp' || style === 'sleepy') {
    g.strokeStyle = mix(brow, '#000000', 0.1)
    g.lineWidth = 6
    g.lineCap = 'round'
    ;[-1, 1].forEach((s) => {
      const bx = S / 2 + s * EYE_DX
      g.beginPath()
      if (style === 'sharp') {
        g.moveTo(bx - s * 30, BROW_Y + 10)
        g.lineTo(bx + s * 28, BROW_Y - 2)
      } else {
        g.moveTo(bx - s * 28, BROW_Y - 2)
        g.lineTo(bx + s * 28, BROW_Y + 10)
      }
      g.stroke()
    })
  }

  // ── 눈 ──
  drawEye(g, S / 2 - EYE_DX, EYE_Y, -1, cfg, closed, iris)
  drawEye(g, S / 2 + EYE_DX, EYE_Y, 1, cfg, closed, iris)

  // ── 코 (아주 작은 점) ──
  g.fillStyle = 'rgba(150,100,90,0.22)'
  g.beginPath()
  g.ellipse(S / 2, 322, 6, 4.5, 0, 0, Math.PI * 2)
  g.fill()

  // ── 입 — 작고 짧은 미소 ──
  g.strokeStyle = '#8f4348'
  g.lineWidth = 7
  g.lineCap = 'round'
  g.beginPath()
  g.arc(S / 2, MOUTH_Y - 14, 22, Math.PI * 0.16, Math.PI * 0.84)
  g.stroke()

  // ── 가장자리 페이드 ──
  // 얼굴은 머리보다 아주 살짝 큰 곡면에 붙는다. 그림 테두리를 그대로 두면
  // 얼굴 주위에 네모난 이음새가 보이므로, 바깥으로 갈수록 투명하게 지운다.
  g.setTransform(1, 0, 0, 1, 0, 0)
  g.globalCompositeOperation = 'destination-in'
  const fade = g.createRadialGradient(S / 2, S * 0.52, S * 0.2, S / 2, S * 0.52, S * 0.54)
  fade.addColorStop(0, 'rgba(0,0,0,1)')
  fade.addColorStop(0.68, 'rgba(0,0,0,1)')
  fade.addColorStop(0.88, 'rgba(0,0,0,0.45)')
  fade.addColorStop(1, 'rgba(0,0,0,0)')
  g.fillStyle = fade
  g.fillRect(0, 0, S, S)
  g.globalCompositeOperation = 'source-over'

  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  tex.needsUpdate = true
  cache.set(key, tex)
  return tex
}

/** 확인용 */
export function faceDataUrl(look, closed = false) {
  return faceTexture(look, closed).image.toDataURL('image/png')
}
