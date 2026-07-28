/* 셔틀빌리지 앱 아이콘 생성기 — 외부 라이브러리 없이 PNG를 직접 인코딩한다.
   실행:  node tools/make-icons.cjs                                            */
const fs = require('fs')
const path = require('path')
const zlib = require('zlib')

// ---- PNG 인코더 ---------------------------------------------------------------
let crcTable = null
function crc32(buf) {
  if (!crcTable) {
    crcTable = []
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      crcTable[n] = c >>> 0
    }
  }
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}
function encodePNG(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// ---- 그리기 도구 --------------------------------------------------------------
const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
const mix = (a, b, t) => a + (b - a) * t
const lerpC = (c1, c2, t) => [mix(c1[0], c2[0], t), mix(c1[1], c2[1], t), mix(c1[2], c2[2], t)]

/** 아이콘 한 장을 RGBA 버퍼로 그린다 */
function drawIcon(S, { maskable = false, rounded = true } = {}) {
  const buf = Buffer.alloc(S * S * 4)
  const px = (x, y, c, a = 1) => {
    if (x < 0 || y < 0 || x >= S || y >= S) return
    const i = (y * S + x) * 4
    const na = a
    buf[i] = clamp(mix(buf[i], c[0], na), 0, 255)
    buf[i + 1] = clamp(mix(buf[i + 1], c[1], na), 0, 255)
    buf[i + 2] = clamp(mix(buf[i + 2], c[2], na), 0, 255)
    buf[i + 3] = clamp(Math.max(buf[i + 3], 255 * na), 0, 255)
  }

  const R = maskable ? S : S * 0.22 // 라운드 반경
  const scale = maskable ? 0.72 : 1 // 마스커블은 안전영역 안쪽에 그린다
  const cx = S / 2
  const cyOff = maskable ? 0 : 0

  // 배경: 하늘 → 잔디 그라데이션
  const sky = [[126, 205, 240], [168, 224, 250]]
  const grass = [[124, 197, 118], [79, 157, 85]]
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      // 라운드 사각형 마스크
      if (rounded && !maskable) {
        const dx = Math.max(R - x, 0, x - (S - R))
        const dy = Math.max(R - y, 0, y - (S - R))
        const d = Math.hypot(dx, dy)
        if (d > R) continue
      }
      const t = y / S
      let c
      if (t < 0.62) c = lerpC(sky[0], sky[1], t / 0.62)
      else c = lerpC(grass[0], grass[1], (t - 0.62) / 0.38)
      px(x, y, c, 1)
    }
  }

  // 언덕 (잔디 경계에 부드러운 곡선)
  for (let x = 0; x < S; x++) {
    const h = 0.62 * S - Math.sin((x / S) * Math.PI) * S * 0.055 - S * 0.01
    for (let y = Math.floor(h); y < 0.64 * S; y++) {
      const t = clamp((y - h) / (S * 0.03), 0, 1)
      px(x, y, lerpC(sky[1], grass[0], t), 1)
    }
  }

  // 셔틀콕 — 약간 기울여 그린다
  const ang = -0.32
  const sc = S * scale
  const ox = cx
  const oy = S * 0.56 + cyOff
  const rot = (x, y) => [ox + (x * Math.cos(ang) - y * Math.sin(ang)) * sc, oy + (x * Math.sin(ang) + y * Math.cos(ang)) * sc]

  // 스커트(깃털) : 아래 좁고 위 넓은 사다리꼴
  const corkR = 0.115
  const skirtBottom = 0.02
  const skirtTop = -0.34
  const wBottom = 0.115
  const wTop = 0.235

  // 역변환으로 픽셀 판정
  const inv = (X, Y) => {
    const dx = (X - ox) / sc
    const dy = (Y - oy) / sc
    return [dx * Math.cos(-ang) - dy * Math.sin(-ang), dx * Math.sin(-ang) + dy * Math.cos(-ang)]
  }

  for (let Y = 0; Y < S; Y++) {
    for (let X = 0; X < S; X++) {
      if (rounded && !maskable) {
        const dx = Math.max(R - X, 0, X - (S - R))
        const dy = Math.max(R - Y, 0, Y - (S - R))
        if (Math.hypot(dx, dy) > R) continue
      }
      const [u, v] = inv(X, Y)

      // 그림자
      const sd = Math.hypot(u, (v - 0.2) * 2.4)
      if (sd < 0.2 && v > 0.12) px(X, Y, [60, 110, 70], 0.18 * (1 - sd / 0.2))

      // 코르크
      const dc = Math.hypot(u, v - skirtBottom)
      if (dc < corkR) {
        const shade = clamp(1 - (v - skirtBottom + corkR) / (corkR * 2.4), 0, 1)
        px(X, Y, lerpC([214, 158, 72], [246, 205, 130], shade), 1)
        continue
      }

      // 스커트
      if (v <= skirtBottom && v >= skirtTop) {
        const t = (skirtBottom - v) / (skirtBottom - skirtTop)
        const halfW = mix(wBottom, wTop, t * t * 0.7 + t * 0.3)
        if (Math.abs(u) <= halfW) {
          // 깃털 결
          const rib = Math.abs(((u / halfW) * 4) % 1 - 0.5)
          const edge = 1 - clamp((Math.abs(u) / halfW - 0.82) / 0.18, 0, 1)
          const base = rib < 0.09 ? [226, 232, 240] : [255, 255, 255]
          px(X, Y, base, 1)
          if (edge < 1) px(X, Y, [203, 213, 225], (1 - edge) * 0.55)
          continue
        }
        // 위쪽 테두리 라인
      }

      // 스커트 상단 띠
      if (v < skirtTop && v > skirtTop - 0.028 && Math.abs(u) <= wTop + 0.004) {
        px(X, Y, [255, 255, 255], 1)
      }
    }
  }

  return buf
}

const outDir = path.join(__dirname, '..', 'public')
fs.mkdirSync(outDir, { recursive: true })

const targets = [
  ['icon-192.png', 192, {}],
  ['icon-512.png', 512, {}],
  ['icon-maskable-512.png', 512, { maskable: true }],
  ['apple-touch-icon.png', 180, {}],
  ['og-image.png', 512, {}],
]
targets.forEach(([name, size, opts]) => {
  const buf = drawIcon(size, opts)
  fs.writeFileSync(path.join(outDir, name), encodePNG(size, size, buf))
  console.log('생성:', name, size + 'x' + size)
})
console.log('완료 — public/ 에 아이콘을 만들었습니다.')
