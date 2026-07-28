// ===================================================================================
// 절차적 텍스처 — 외부 이미지 파일 없이 캔버스로 재질을 만들어 쓴다.
// (오프라인·설치 없이 돌아가야 해서 모든 텍스처를 코드로 생성한다)
// ===================================================================================
import * as THREE from 'three'

const cache = new Map()
const memo = (key, fn) => {
  if (!cache.has(key)) cache.set(key, fn())
  return cache.get(key)
}

function canvas(size = 256) {
  const c = document.createElement('canvas')
  c.width = c.height = size
  return c
}

/** 이어붙여도 티가 안 나는 값 노이즈 (fBm) */
function makeNoise(size, octaves = 4, seed = 1) {
  const rnd = (x, y, s) => {
    const n = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453
    return n - Math.floor(n)
  }
  const smooth = (x, y, period, s) => {
    const xi = Math.floor(x / period)
    const yi = Math.floor(y / period)
    const xf = (x / period) - xi
    const yf = (y / period) - yi
    const w = size / period
    const g = (a, b) => rnd(((a % w) + w) % w, ((b % w) + w) % w, s)
    const u = xf * xf * (3 - 2 * xf)
    const v = yf * yf * (3 - 2 * yf)
    const a = g(xi, yi), b = g(xi + 1, yi), c = g(xi, yi + 1), d = g(xi + 1, yi + 1)
    return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v
  }
  const data = new Float32Array(size * size)
  let max = 0
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let amp = 1, period = size / 4, val = 0, norm = 0
      for (let o = 0; o < octaves; o++) {
        val += smooth(x, y, period, seed + o) * amp
        norm += amp
        amp *= 0.5
        period /= 2
        if (period < 2) break
      }
      const v = val / norm
      data[y * size + x] = v
      if (v > max) max = v
    }
  }
  return data
}

const mix = (a, b, t) => a + (b - a) * t
const hexToRgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]

/** 노이즈로 두 색을 섞은 타일 텍스처 */
function noiseTexture({ size = 256, colorA, colorB, octaves = 4, seed = 1, contrast = 1, speckle = 0 }) {
  const c = canvas(size)
  const g = c.getContext('2d')
  const img = g.createImageData(size, size)
  const n = makeNoise(size, octaves, seed)
  const [r1, g1, b1] = hexToRgb(colorA)
  const [r2, g2, b2] = hexToRgb(colorB)
  for (let i = 0; i < size * size; i++) {
    let t = (n[i] - 0.5) * contrast + 0.5
    t = Math.max(0, Math.min(1, t))
    img.data[i * 4] = mix(r1, r2, t)
    img.data[i * 4 + 1] = mix(g1, g2, t)
    img.data[i * 4 + 2] = mix(b1, b2, t)
    img.data[i * 4 + 3] = 255
  }
  g.putImageData(img, 0, 0)
  if (speckle) {
    for (let i = 0; i < speckle; i++) {
      const x = Math.random() * size
      const y = Math.random() * size
      g.fillStyle = `rgba(255,255,255,${0.05 + Math.random() * 0.12})`
      g.beginPath()
      g.arc(x, y, 0.6 + Math.random() * 1.6, 0, Math.PI * 2)
      g.fill()
    }
  }
  const tex = new THREE.CanvasTexture(c)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

/** 잔디 — 색 변화 + 잔디날 결 */
export const grassTexture = () =>
  memo('grass', () => {
    const size = 512
    const c = canvas(size)
    const g = c.getContext('2d')
    const base = noiseTexture({ size, colorA: '#4f9d4a', colorB: '#7cc46a', octaves: 4, seed: 3, contrast: 1.25 })
    g.drawImage(base.image, 0, 0)
    // 잔디날
    for (let i = 0; i < 5200; i++) {
      const x = Math.random() * size
      const y = Math.random() * size
      const len = 3 + Math.random() * 6
      const dark = Math.random() > 0.55
      g.strokeStyle = dark ? `rgba(46,102,44,${0.16 + Math.random() * 0.22})` : `rgba(146,205,110,${0.14 + Math.random() * 0.24})`
      g.lineWidth = 0.9 + Math.random() * 0.9
      g.beginPath()
      g.moveTo(x, y)
      g.lineTo(x + (Math.random() - 0.5) * 2.5, y - len)
      g.stroke()
    }
    const tex = new THREE.CanvasTexture(c)
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = 8
    return tex
  })

/** 흙길 */
export const soilTexture = () =>
  memo('soil', () => {
    const size = 256
    const c = canvas(size)
    const g = c.getContext('2d')
    const base = noiseTexture({ size, colorA: '#c9a877', colorB: '#e3c99a', octaves: 5, seed: 11, contrast: 1.1 })
    g.drawImage(base.image, 0, 0)
    for (let i = 0; i < 700; i++) {
      const x = Math.random() * size
      const y = Math.random() * size
      g.fillStyle = `rgba(140,110,74,${0.1 + Math.random() * 0.25})`
      g.beginPath()
      g.arc(x, y, 0.5 + Math.random() * 2.2, 0, Math.PI * 2)
      g.fill()
    }
    const tex = new THREE.CanvasTexture(c)
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping
    tex.colorSpace = THREE.SRGBColorSpace
    return tex
  })

/** 나무판자 */
export const woodTexture = (colorA = '#b5793f', colorB = '#d39a58') =>
  memo(`wood-${colorA}-${colorB}`, () => {
    const size = 256
    const c = canvas(size)
    const g = c.getContext('2d')
    g.fillStyle = colorB
    g.fillRect(0, 0, size, size)
    for (let i = 0; i < 220; i++) {
      const y = Math.random() * size
      g.strokeStyle = `rgba(120,78,40,${0.05 + Math.random() * 0.16})`
      g.lineWidth = 0.6 + Math.random() * 2.4
      g.beginPath()
      g.moveTo(0, y)
      g.bezierCurveTo(size * 0.3, y + (Math.random() - 0.5) * 9, size * 0.7, y + (Math.random() - 0.5) * 9, size, y)
      g.stroke()
    }
    // 판자 이음새
    g.strokeStyle = 'rgba(90,58,30,0.5)'
    g.lineWidth = 2.5
    for (let i = 1; i < 5; i++) {
      g.beginPath()
      g.moveTo(0, (size / 5) * i)
      g.lineTo(size, (size / 5) * i)
      g.stroke()
    }
    const tex = new THREE.CanvasTexture(c)
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping
    tex.colorSpace = THREE.SRGBColorSpace
    return tex
  })

/** 코트 바닥 (고운 입자) */
export const courtTexture = (color = '#2f7d55') =>
  memo(`court-${color}`, () => {
    const size = 256
    const c = canvas(size)
    const g = c.getContext('2d')
    g.fillStyle = color
    g.fillRect(0, 0, size, size)
    for (let i = 0; i < 9000; i++) {
      const a = Math.random()
      g.fillStyle = a > 0.5 ? `rgba(255,255,255,${0.02 + Math.random() * 0.05})` : `rgba(0,0,0,${0.02 + Math.random() * 0.06})`
      g.fillRect(Math.random() * size, Math.random() * size, 1.4, 1.4)
    }
    const tex = new THREE.CanvasTexture(c)
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping
    tex.colorSpace = THREE.SRGBColorSpace
    return tex
  })

/** 지붕 기와 */
export const roofTexture = (color = '#d9534f') =>
  memo(`roof-${color}`, () => {
    const size = 256
    const c = canvas(size)
    const g = c.getContext('2d')
    g.fillStyle = color
    g.fillRect(0, 0, size, size)
    const rows = 8
    const h = size / rows
    for (let r = 0; r < rows; r++) {
      for (let x = -h; x < size + h; x += h) {
        const off = (r % 2) * (h / 2)
        g.beginPath()
        g.arc(x + off + h / 2, r * h + h, h * 0.62, Math.PI, 0)
        g.fillStyle = `rgba(0,0,0,${0.05 + (r % 2) * 0.04})`
        g.fill()
        g.strokeStyle = 'rgba(0,0,0,0.22)'
        g.lineWidth = 1.6
        g.stroke()
      }
    }
    const tex = new THREE.CanvasTexture(c)
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping
    tex.colorSpace = THREE.SRGBColorSpace
    return tex
  })

/** 옷감 (미세한 결) */
export const fabricTexture = () =>
  memo('fabric', () => {
    const size = 128
    const c = canvas(size)
    const g = c.getContext('2d')
    g.fillStyle = '#ffffff'
    g.fillRect(0, 0, size, size)
    for (let i = 0; i < size; i += 2) {
      g.strokeStyle = `rgba(0,0,0,0.035)`
      g.lineWidth = 1
      g.beginPath(); g.moveTo(i, 0); g.lineTo(i, size); g.stroke()
      g.beginPath(); g.moveTo(0, i); g.lineTo(size, i); g.stroke()
    }
    const tex = new THREE.CanvasTexture(c)
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping
    return tex
  })

/** 나뭇잎 덩어리용 미세 요철 */
export const leafBump = () =>
  memo('leafbump', () => {
    const size = 128
    const c = canvas(size)
    const g = c.getContext('2d')
    g.fillStyle = '#808080'
    g.fillRect(0, 0, size, size)
    for (let i = 0; i < 900; i++) {
      const x = Math.random() * size
      const y = Math.random() * size
      g.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.45)'
      g.beginPath()
      g.ellipse(x, y, 2 + Math.random() * 3.5, 1.2 + Math.random() * 2, Math.random() * Math.PI, 0, Math.PI * 2)
      g.fill()
    }
    const tex = new THREE.CanvasTexture(c)
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping
    return tex
  })

/** 반복 설정 헬퍼 */
export function repeat(tex, x, y = x) {
  const t = tex.clone()
  t.needsUpdate = true
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(x, y)
  return t
}
