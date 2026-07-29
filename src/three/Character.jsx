// ===================================================================================
// 캐릭터 — 3D 게임 품질을 목표로 만든 치비 배드민턴 선수
//
// 좋아 보이게 만드는 요소들:
//   · 몸통을 회전체(Lathe)로 만들어 어깨~허리가 부드럽게 이어진다
//   · 팔다리에 관절(무릎·팔꿈치) 구체를 넣어 접힐 때 끊기지 않는다
//   · 눈은 흰자 + 홍채 + 하이라이트 2개로 만들고, 실제로 깜빡인다
//   · 가만히 있으면 카메라(플레이어)를 쳐다본다
//   · 머리카락이 몸을 따라 한 박자 늦게 흔들린다 (관성)
//   · 모든 재질에 림 라이트가 들어가 배경에서 실루엣이 또렷하게 떠 보인다
// ===================================================================================
import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { SKIN_TONES, LEVEL_COLOR } from '../game/constants.js'
import { skinMaterial, clothMaterial, hairMaterial, glossMaterial, eyeMaterial, charMaterial } from './materials.js'
import { faceTexture, FACE_PATCH } from './face.js'

/** 머리 반지름 — 헤어·얼굴·액세서리가 모두 이 값을 기준으로 맞춘다 */
const HEAD_R = 0.37

const skinOf = (id) => SKIN_TONES.find((s) => s.id === id)?.color || '#fdd0ae'
const clamp = THREE.MathUtils.clamp

// 프레임마다 새로 만들지 않도록 미리 잡아두는 계산용 임시 객체
const _wp = new THREE.Vector3()
const _dir = new THREE.Vector3()
const _q = new THREE.Quaternion()
const _e = new THREE.Euler(0, 0, 0, 'YXZ')

// -----------------------------------------------------------------------------------
// 이름표
// -----------------------------------------------------------------------------------
const tagCache = new Map()
function nameTexture(name, level, isMe) {
  const key = `${name}|${level}|${isMe}`
  if (tagCache.has(key)) return tagCache.get(key)
  const c = document.createElement('canvas')
  c.width = 320
  c.height = 84
  const g = c.getContext('2d')
  const badge = LEVEL_COLOR[level] || '#22c55e'
  const r = 30
  g.fillStyle = isMe ? 'rgba(255,214,102,0.96)' : 'rgba(28,32,44,0.86)'
  g.beginPath()
  g.moveTo(r, 6)
  g.arcTo(314, 6, 314, 78, r)
  g.arcTo(314, 78, 6, 78, r)
  g.arcTo(6, 78, 6, 6, r)
  g.arcTo(6, 6, 314, 6, r)
  g.closePath()
  g.fill()
  g.fillStyle = badge
  g.beginPath()
  g.arc(46, 42, 22, 0, Math.PI * 2)
  g.fill()
  g.fillStyle = '#fff'
  g.font = 'bold 26px "Malgun Gothic", sans-serif'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText(level[0], 46, 44)
  g.fillStyle = isMe ? '#2a1d05' : '#ffffff'
  g.font = 'bold 34px "Malgun Gothic", sans-serif'
  g.textAlign = 'left'
  g.fillText(isMe ? `★ ${name}` : name, 78, 45)
  const tex = new THREE.CanvasTexture(c)
  tex.anisotropy = 4
  tagCache.set(key, tex)
  return tex
}

export function NameTag({ name, level, isMe, y = 2.1 }) {
  const tex = useMemo(() => nameTexture(name, level, isMe), [name, level, isMe])
  return (
    <sprite position={[0, y, 0]} scale={[1.5, 0.4, 1]} renderOrder={10}>
      <spriteMaterial map={tex} transparent depthWrite={false} />
    </sprite>
  )
}

// -----------------------------------------------------------------------------------
// 라켓
// -----------------------------------------------------------------------------------
let stringTex = null
function getStringTexture() {
  if (stringTex) return stringTex
  const S = 256
  const c = document.createElement('canvas')
  c.width = c.height = S
  const g = c.getContext('2d')
  g.clearRect(0, 0, S, S)
  // 줄 하나를 어두운 테두리 + 밝은 심지 2겹으로 그린다.
  // 재질 color 는 곱해지므로, 어두운 테두리는 어떤 줄 색을 골라도 남아
  // 작게 축소돼도 격자가 흰 덩어리로 뭉치지 않는다.
  const line = (x1, y1, x2, y2) => { g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke() }
  const pass = (color, w) => {
    g.strokeStyle = color
    g.lineWidth = w
    for (let i = 16; i < S; i += 22) { line(i, 0, i, S); line(0, i, S, i) }
  }
  pass('rgba(52,56,68,0.85)', 5.2)   // 어두운 테두리
  pass('rgba(255,255,255,1)', 2.2)   // 밝은 심지
  stringTex = new THREE.CanvasTexture(c)
  stringTex.anisotropy = 4
  return stringTex
}

/** 라켓 모델별 형태 */
const RACKET_SPEC = {
  classic: { headY: 0.48, headR: 0.132, ratio: 1.2, tube: 0.015, seg: 34 },
  power:   { headY: 0.51, headR: 0.145, ratio: 1.16, tube: 0.019, seg: 34 },
  speed:   { headY: 0.47, headR: 0.12, ratio: 1.28, tube: 0.012, seg: 34 },
  iso:     { headY: 0.49, headR: 0.138, ratio: 1.06, tube: 0.016, seg: 10 }, // 각진 헤드
  nano:    { headY: 0.5, headR: 0.126, ratio: 1.3, tube: 0.0095, seg: 40 },
  retro:   { headY: 0.46, headR: 0.128, ratio: 1.1, tube: 0.024, seg: 24 },
  pro:     { headY: 0.5, headR: 0.14, ratio: 1.22, tube: 0.014, seg: 40 },
  neon:    { headY: 0.5, headR: 0.14, ratio: 1.22, tube: 0.016, seg: 40 },
}

export function Racket({ racket = {}, simple = false }) {
  const { frame = '#ef4444', string = '#ffffff', grip = '#1f2937', model = 'classic', wrap = 'plain' } = racket
  const tex = useMemo(() => (simple ? null : getStringTexture()), [simple])
  const spec = RACKET_SPEC[model] || RACKET_SPEC.classic
  const { headY, headR, ratio, tube, seg } = spec

  const frameMat = useMemo(
    () =>
      model === 'neon'
        ? charMaterial({ color: frame, roughness: 0.25, metalness: 0.3, emissive: frame, emissiveIntensity: 0.8, rimIntensity: 0.7 })
        : model === 'retro'
        ? charMaterial({ color: frame, roughness: 0.85, metalness: 0 })
        : glossMaterial(frame),
    [frame, model]
  )
  const gripMat = useMemo(() => charMaterial({ color: grip, roughness: 0.95, rimIntensity: 0.2 }), [grip])
  const wrapMat = useMemo(() => charMaterial({ color: '#f4f4f5', roughness: 0.9 }), [])
  const stringMat = useMemo(
    () => new THREE.MeshBasicMaterial({ map: tex, color: string, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }),
    [tex, string]
  )

  return (
    <group>
      {/* 그립 */}
      <mesh position={[0, 0.095, 0]} material={gripMat} castShadow>
        <cylinderGeometry args={[0.037, 0.043, 0.2, 12]} />
      </mesh>
      {/* 그립 무늬 — GRIP_WRAPS 3종. 지금까지 값만 저장되고 그려지지 않았다. */}
      {wrap === 'spiral' &&
        [0, 1, 2, 3, 4].map(i => (
          <mesh key={i} position={[0, 0.03 + i * 0.037, 0]} rotation={[Math.PI / 2 - 0.22, 0, 0]} material={wrapMat}>
            <torusGeometry args={[0.0405 - i * 0.0013, 0.0055, 6, 14]} />
          </mesh>
        ))}
      {wrap === 'twotone' && (
        <mesh position={[0, 0.145, 0]} material={wrapMat}>
          <cylinderGeometry args={[0.0378, 0.0398, 0.09, 12]} />
        </mesh>
      )}
      {/* 그립 끝 마감 */}
      <mesh position={[0, -0.008, 0]} material={frameMat}>
        <cylinderGeometry args={[0.045, 0.042, 0.022, 12]} />
      </mesh>
      {/* 샤프트 */}
      <mesh position={[0, 0.26, 0]} material={frameMat}>
        <cylinderGeometry args={[0.014, 0.019, 0.15, 10]} />
      </mesh>
      {/* T 조인트 */}
      <mesh position={[0, 0.335, 0]} material={frameMat}>
        <sphereGeometry args={[0.026, 10, 8]} />
      </mesh>
      {/* 프레임 — 모델별 굵기(tube)·분할수(seg)·세로비(ratio)를 실제로 반영한다.
          seg 가 작을수록 각진 헤드(아이소메트릭), tube 가 굵을수록 묵직해 보인다. */}
      <mesh position={[0, headY, 0]} scale={[1, ratio, 1]} material={frameMat} castShadow>
        <torusGeometry args={[headR, tube, 10, seg]} />
      </mesh>
      {/* 스트링 */}
      {!simple && (
        <mesh position={[0, headY, 0]} scale={[1, ratio, 1]} material={stringMat}>
          <circleGeometry args={[headR - tube * 0.5, Math.max(seg, 20)]} />
        </mesh>
      )}
    </group>
  )
}

// -----------------------------------------------------------------------------------
// 몸통 — 회전체로 부드럽게 (어깨에서 허리까지 자연스러운 곡선)
// -----------------------------------------------------------------------------------
const torsoGeoCache = {}
function torsoGeometry(female) {
  const key = female ? 'f' : 'm'
  if (torsoGeoCache[key]) return torsoGeoCache[key]
  const w = female ? 0.93 : 1
  const shoulder = female ? 0.94 : 1
  // 아래(엉덩이)가 가장 넓고 위(어깨)로 갈수록 좁아지는 배 모양
  const pts = [
    [0.0, 0.0],
    [0.196 * w, 0.0],
    [0.204 * w, 0.06],
    [0.200 * w, 0.15],
    [0.188 * w, 0.24],
    [0.166 * w * shoulder, 0.32],
    [0.142 * w * shoulder, 0.39],
    [0.106 * w * shoulder, 0.44],
    [0.08, 0.47],
    [0.0, 0.48],
  ].map(([x, y]) => new THREE.Vector2(x, y))
  const g = new THREE.LatheGeometry(pts, 28)
  g.computeVertexNormals()
  torsoGeoCache[key] = g
  return g
}

// -----------------------------------------------------------------------------------
// 얼굴 — 머리 앞면에 살짝 띄운 곡면에 얼굴 그림을 입힌다.
// 눈알을 3D로 붙이지 않고 그림으로 그리면 속눈썹·홍채 같은 디테일이 살아난다.
// -----------------------------------------------------------------------------------
// 범위는 face.js 가 그림을 그릴 때 쓰는 값과 반드시 같아야 한다 (거기서 가져온다)
const FACE = FACE_PATCH

function Face({ look, R, blinkRef }) {
  const open = useMemo(() => faceTexture(look, false), [look.eyes, look.hairColor])
  const closed = useMemo(() => faceTexture(look, true), [look.eyes, look.hairColor])
  const mat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        map: open,
        transparent: true,
        roughness: 0.75,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
      }),
    [open]
  )
  // 깜빡임 = 텍스처 교체
  blinkRef.current = { mat, open, closed }
  return (
    <mesh material={mat} renderOrder={2}>
      <sphereGeometry args={[R * 1.008, 40, 32, FACE.phiStart, FACE.phiLength, FACE.thetaStart, FACE.thetaLength]} />
    </mesh>
  )
}

// -----------------------------------------------------------------------------------
// (구) 3D 눈 — 간략 모드에서만 사용
// -----------------------------------------------------------------------------------
function Eye({ side, style, blinkRef, simple = false }) {
  const x = side * 0.132
  const dark = eyeMaterial(style === 'sharp' ? '#241c1a' : '#221b26')
  const white = useMemo(() => charMaterial({ color: '#ffffff', roughness: 0.25, rimIntensity: 0.25, envMapIntensity: 1.2 }), [])
  const hi = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ffffff' }), [])

  // 눈매별 크기/기울기
  const cfg = {
    dot: { w: 0.72, h: 0.85, tilt: 0, iris: 0.7, whiteOn: false },
    oval: { w: 0.92, h: 1.15, tilt: 0, iris: 0.72, whiteOn: true },
    happy: { w: 1.0, h: 0.5, tilt: 0, iris: 0.6, whiteOn: false },
    sharp: { w: 1.02, h: 0.82, tilt: side * -0.22, iris: 0.66, whiteOn: true },
    sleepy: { w: 0.95, h: 0.6, tilt: side * 0.12, iris: 0.6, whiteOn: true },
    sparkle: { w: 1.0, h: 1.25, tilt: 0, iris: 0.78, whiteOn: true },
  }[style] || { w: 0.92, h: 1.15, tilt: 0, iris: 0.72, whiteOn: true }

  return (
    <group ref={blinkRef} position={[x, 0.04, 0.263]} rotation={[0, side * -0.13, cfg.tilt]}>
      {/* 흰자 */}
      {cfg.whiteOn && !simple && (
        <mesh scale={[0.066 * cfg.w, 0.066 * cfg.h, 0.03]} material={white}>
          <sphereGeometry args={[1, 16, 14]} />
        </mesh>
      )}
      {/* 홍채 */}
      <mesh position={[0, 0, 0.016]} scale={[0.062 * cfg.w * cfg.iris, 0.062 * cfg.h * cfg.iris, 0.028]} material={dark}>
        <sphereGeometry args={[1, 16, 14]} />
      </mesh>
      {/* 하이라이트 (큰 것 + 작은 것) — 눈이 살아 보이게 하는 핵심 */}
      <mesh position={[side * 0.016, 0.024, 0.044]} material={hi}>
        <sphereGeometry args={[0.0165, 8, 8]} />
      </mesh>
      {!simple && (
        <mesh position={[side * -0.018, -0.018, 0.042]} material={hi}>
          <sphereGeometry args={[0.0085, 8, 8]} />
        </mesh>
      )}
      {style === 'sparkle' && !simple && (
        <mesh position={[side * 0.028, -0.006, 0.042]} material={hi}>
          <sphereGeometry args={[0.007, 6, 6]} />
        </mesh>
      )}
    </group>
  )
}

// -----------------------------------------------------------------------------------
// 머리카락
// -----------------------------------------------------------------------------------
function Hair({ style, color, R = 0.37, simple }) {
  const mat = useMemo(() => hairMaterial(color), [color])
  // 두상 껍질 — 정수리에서 시작해 아래로 내려오는 하나의 매끈한 껍질.
  // (구 조각을 여러 장 겹치면 잘린 모서리가 계단처럼 보인다)
  // 얼굴(theta 0.25π~0.71π)을 가리지 않도록 앞쪽은 bangs 로만 처리한다.

  /**
   * 헤어라인이 앞은 높고 옆·뒤는 낮은 "덮개".
   * 각 세로줄(phi)마다 내려오는 깊이를 다르게 준 커스텀 지오메트리라
   * 조각을 겹치지 않아 이음새가 생기지 않는다.
   * @param {number} front 앞쪽 깊이(rad) — 작을수록 이마가 넓다
   * @param {number} side  옆쪽 깊이
   * @param {number} rear  뒤쪽 깊이
   */
  const shell = (front = Math.PI * 0.3, side = Math.PI * 0.5, rear = Math.PI * 0.7, r = R * 1.03) => {
    const SEG = 48
    const RING = 18
    const pos = []
    const idx = []
    for (let i = 0; i <= SEG; i++) {
      const phi = (i / SEG) * Math.PI * 2
      // 정면(+Z, phi=π/2)에서 0, 옆에서 0.5, 뒤에서 1 이 되는 값
      const t = (1 - Math.sin(phi)) / 2
      // 앞 → 옆 → 뒤 를 차례로 잇는 단조 보간.
      // (세 값을 한꺼번에 가중합하면 뒤통수 한 줄만 뾰족하게 내려와 쐐기가 생긴다)
      const u = t < 0.5 ? t * 2 : (t - 0.5) * 2
      const s = u * u * (3 - 2 * u) // smoothstep — 경계에서 꺾이지 않게
      const depth = t < 0.5 ? front + (side - front) * s : side + (rear - side) * s
      for (let j = 0; j <= RING; j++) {
        const th = (j / RING) * depth
        pos.push(-r * Math.cos(phi) * Math.sin(th), r * Math.cos(th), r * Math.sin(phi) * Math.sin(th))
      }
    }
    for (let i = 0; i < SEG; i++) {
      for (let j = 0; j < RING; j++) {
        const a = i * (RING + 1) + j
        const c = a + RING + 1
        idx.push(a, a + 1, c, a + 1, c + 1, c)
      }
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.setIndex(idx)
    g.computeVertexNormals()
    return <mesh geometry={g} material={mat} castShadow />
  }
  // 앞머리 — 이마 앞쪽 호에만 얹되, 가장자리가 칼로 자른 듯 직선이 되지 않도록
  // 가운데 한 덩어리 + 좌우 옆머리로 나눠 굴곡 있는 헤어라인을 만든다.
  const bangs = (
    <group>
      {/* 가운데 앞머리 — 이마가 보이도록 눈썹보다 충분히 위에서 끝난다 */}
      <mesh material={mat} castShadow position={[0, 0.004, 0.004]}>
        <sphereGeometry args={[R * 1.028, 36, 26, Math.PI / 2 - Math.PI * 0.52, Math.PI * 1.04, 0, Math.PI * 0.35]} />
      </mesh>
      {/* 좌우 구레나룻 — 머리에 딱 붙는 얇은 조각 (떨어져 있으면 귀마개처럼 보인다) */}
      {[-1, 1].map((s) => (
        <mesh
          key={s}
          material={mat}
          castShadow
          position={[s * R * 0.9, R * 0.02, R * 0.04]}
          rotation={[0, s * -0.2, s * 0.04]}
          scale={[0.12, 0.42, 0.3]}
        >
          <sphereGeometry args={[R, 16, 14]} />
        </mesh>
      ))}
    </group>
  )

  if (simple) return <group>{shell(Math.PI * 0.32, Math.PI * 0.5, Math.PI * 0.68, R * 1.02)}</group>

  switch (style) {
    case 'buzz':
      return <group>{shell(Math.PI * 0.33, Math.PI * 0.5, Math.PI * 0.74, R * 1.015)}</group>
    case 'short':
      return (
        <group>
          {shell(Math.PI * 0.3, Math.PI * 0.54, Math.PI * 0.74)}
          <mesh position={[0, -0.02, -R * 0.5]} scale={[1, 0.82, 0.72]} material={mat}>
            <sphereGeometry args={[R * 0.7, 20, 16]} />
          </mesh>
        </group>
      )
    case 'bob':
      return (
        <group>
          {shell(Math.PI * 0.3, Math.PI * 0.62, Math.PI * 0.7)}
          {[-1, 1].map((s) => (
            <mesh key={s} position={[s * R * 0.9, -0.15, 0.02]} scale={[0.55, 1.3, 0.92]} material={mat} castShadow>
              <sphereGeometry args={[R * 0.52, 16, 12]} />
            </mesh>
          ))}
          <mesh position={[0, -0.09, -R * 0.66]} scale={[1.12, 1.15, 0.72]} material={mat} castShadow>
            <sphereGeometry args={[R * 0.62, 16, 12]} />
          </mesh>
        </group>
      )
    case 'long':
      return (
        <group>
          {shell(Math.PI * 0.3, Math.PI * 0.6, Math.PI * 0.72)}
          <mesh position={[0, -0.3, -R * 0.5]} scale={[0.92, 1.5, 0.72]} material={mat} castShadow>
            <sphereGeometry args={[R * 0.8, 22, 18]} />
          </mesh>
          {[-1, 1].map((s) => (
            <mesh key={s} position={[s * R * 0.8, -0.24, -R * 0.16]} scale={[0.28, 1.5, 0.5]} material={mat} castShadow>
              <sphereGeometry args={[R * 0.52, 14, 12]} />
            </mesh>
          ))}
        </group>
      )
    case 'ponytail':
      return (
        <group>
          {shell(Math.PI * 0.3, Math.PI * 0.5, Math.PI * 0.72)}
          <mesh position={[0, 0.05, -R * 0.9]} material={mat} castShadow>
            <sphereGeometry args={[0.095, 14, 12]} />
          </mesh>
          {/* 머리끈 — 매듭에 딱 붙인다 */}
          <mesh position={[0, -0.015, -R * 0.94]} rotation={[Math.PI / 2 - 0.35, 0, 0]}>
            <torusGeometry args={[0.062, 0.02, 8, 16]} />
            <meshStandardMaterial color="#e05a7a" roughness={0.7} />
          </mesh>
          {/* 꼬리 — 위는 굵고 아래로 갈수록 가늘어지는 물방울 3덩이 */}
          <mesh position={[0, -0.1, -R * 1.0]} rotation={[0.28, 0, 0]} scale={[1, 1.35, 1]} material={mat} castShadow>
            <sphereGeometry args={[0.075, 14, 12]} />
          </mesh>
          <mesh position={[0, -0.26, -R * 1.05]} rotation={[0.32, 0, 0]} scale={[1, 1.4, 1]} material={mat} castShadow>
            <sphereGeometry args={[0.06, 14, 12]} />
          </mesh>
          <mesh position={[0, -0.4, -R * 1.09]} rotation={[0.36, 0, 0]} scale={[1, 1.5, 1]} material={mat} castShadow>
            <sphereGeometry args={[0.042, 12, 10]} />
          </mesh>
        </group>
      )
    case 'twintail':
      return (
        <group>
          {shell(Math.PI * 0.3, Math.PI * 0.5, Math.PI * 0.72)}
          {[-1, 1].map((s) => (
            <group key={s} position={[s * R * 0.6, R * 0.05, -R * 0.8]}>
              <mesh material={mat} castShadow>
                <sphereGeometry args={[0.08, 12, 10]} />
              </mesh>
              <mesh position={[s * 0.02, -0.045, 0]} rotation={[0.3, 0, s * 0.5]}>
                <torusGeometry args={[0.05, 0.016, 8, 14]} />
                <meshStandardMaterial color="#e05a7a" roughness={0.7} />
              </mesh>
              <mesh position={[s * 0.06, -0.16, -0.02]} rotation={[0.1, 0, s * 0.3]} scale={[1, 1.4, 1]} material={mat} castShadow>
                <sphereGeometry args={[0.062, 12, 10]} />
              </mesh>
              <mesh position={[s * 0.1, -0.3, -0.04]} rotation={[0.1, 0, s * 0.35]} scale={[1, 1.5, 1]} material={mat} castShadow>
                <sphereGeometry args={[0.046, 12, 10]} />
              </mesh>
            </group>
          ))}
        </group>
      )
    case 'bun':
      return (
        <group>
          {shell(Math.PI * 0.32, Math.PI * 0.5, Math.PI * 0.72)}
          {bangs}
          <mesh position={[0, R * 0.74, -R * 0.5]} material={mat} castShadow>
            <sphereGeometry args={[0.152, 18, 16]} />
          </mesh>
          <mesh position={[0, R * 0.74, -R * 0.5]} rotation={[0.4, 0, 0]} scale={[1, 0.35, 1]} material={mat}>
            <torusGeometry args={[0.155, 0.028, 8, 20]} />
          </mesh>
        </group>
      )
    case 'spiky':
      return (
        <group>
          {shell(Math.PI * 0.34, Math.PI * 0.5, Math.PI * 0.72, R * 1.02)}
          {[...Array(8)].map((_, i) => {
            const a = (i / 8) * Math.PI * 2
            return (
              <mesh
                key={i}
                position={[Math.cos(a) * R * 0.5, R * 0.76, Math.sin(a) * R * 0.5]}
                rotation={[Math.sin(a) * 0.55, 0, -Math.cos(a) * 0.55]}
                material={mat}
                castShadow
              >
                <coneGeometry args={[0.065, 0.22, 6]} />
              </mesh>
            )
          })}
        </group>
      )
    case 'wave':
      // 웨이브 — 뒤로 흐르는 굵은 웨이브 두 갈래
      return (
        <group>
          {shell(Math.PI * 0.3, Math.PI * 0.62, Math.PI * 0.74)}
          {[-1, 1].map((s) => (
            <group key={s}>
              <mesh material={mat} castShadow position={[s * R * 0.78, -R * 0.42, -R * 0.28]} rotation={[0, 0, s * 0.16]} scale={[0.34, 0.72, 0.42]}>
                <sphereGeometry args={[R * 0.6, 16, 14]} />
              </mesh>
              <mesh material={mat} castShadow position={[s * R * 0.72, -R * 0.86, -R * 0.3]} rotation={[0, 0, -s * 0.18]} scale={[0.3, 0.6, 0.36]}>
                <sphereGeometry args={[R * 0.54, 14, 12]} />
              </mesh>
            </group>
          ))}
        </group>
      )
    case 'curly':
      // 곱슬 — 두피에 붙은 방울 곱슬
      return (
        <group>
          {shell(Math.PI * 0.32, Math.PI * 0.5, Math.PI * 0.72, R * 1.015)}
          {[...Array(18)].map((_, i) => {
            const a = (i / 9) * Math.PI + (i % 2) * 0.35
            const ring = i % 2 ? 0.62 : 0.86
            const y = i % 2 ? R * 0.62 : R * 0.3
            return (
              <mesh key={i} material={mat} castShadow position={[Math.cos(a) * R * ring, y, Math.sin(a) * R * ring * 0.9]}>
                <sphereGeometry args={[R * 0.21, 10, 8]} />
              </mesh>
            )
          })}
        </group>
      )
    case 'afro':
      return (
        <group>
          {[...Array(14)].map((_, i) => {
            const a = (i / 14) * Math.PI * 2
            const y = R * (0.45 + Math.sin(i * 1.7) * 0.25)
            return (
              <mesh key={i} material={mat} castShadow position={[Math.cos(a) * R * 0.85, y, Math.sin(a) * R * 0.85]}>
                <sphereGeometry args={[R * 0.5, 14, 12]} />
              </mesh>
            )
          })}
          <mesh material={mat} castShadow position={[0, R * 0.55, 0]}>
            <sphereGeometry args={[R * 1.02, 20, 16]} />
          </mesh>
        </group>
      )
    case 'sidepart':
      // 가르마 — 이마 위에서 한쪽으로 쓸어넘긴 앞머리
      return (
        <group>
          {shell(Math.PI * 0.3, Math.PI * 0.5, Math.PI * 0.72)}
          <mesh material={mat} castShadow position={[R * 0.12, R * 0.34, R * 0.16]} rotation={[0.08, 0, -0.22]} scale={[1.04, 0.62, 1.0]}>
            <sphereGeometry args={[R * 0.9, 22, 16, 0, Math.PI * 2, 0, Math.PI * 0.52]} />
          </mesh>
        </group>
      )
    case 'twoblock':
      // 투블럭 — 옆은 바짝, 위는 볼륨
      return (
        <group>
          {/* 옆은 바짝 깎이고 뒤통수는 목덜미까지 덮인다 */}
          {shell(Math.PI * 0.3, Math.PI * 0.4, Math.PI * 0.72, R * 1.0)}
          <mesh material={mat} castShadow position={[0, R * 0.16, -R * 0.02]} scale={[1.0, 0.72, 1.0]}>
            <sphereGeometry args={[R * 1.0, 26, 20]} />
          </mesh>
          {bangs}
        </group>
      )
    case 'pixie':
      return (
        <group>
          {shell(Math.PI * 0.3, Math.PI * 0.5, Math.PI * 0.7)}
          {[-1, 1].map((s) => (
            <mesh key={s} material={mat} castShadow
              position={[s * R * 0.86, -R * 0.06, R * 0.22]} rotation={[0, 0, s * 0.45]} scale={[0.15, 0.4, 0.28]}>
              <sphereGeometry args={[R, 14, 12]} />
            </mesh>
          ))}
        </group>
      )
    case 'slick':
      // 올백 — 뒤로 넘겨 이마가 다 드러난다
      return (
        <group>
          {shell(Math.PI * 0.22, Math.PI * 0.5, Math.PI * 0.74, R * 1.025)}
          <mesh material={mat} castShadow position={[0, R * 0.34, -R * 0.32]} scale={[1.02, 0.8, 1.25]}>
            <sphereGeometry args={[R * 0.86, 20, 16, 0, Math.PI * 2, 0, Math.PI * 0.55]} />
          </mesh>
        </group>
      )
    case 'hime':
      // 히메컷 — 일자 앞머리 + 귀 옆 일자 단 + 긴 뒷머리
      return (
        <group>
          {shell(Math.PI * 0.3, Math.PI * 0.66, Math.PI * 0.76)}
          {[-1, 1].map((s) => (
            <mesh key={s} material={mat} castShadow position={[s * R * 0.78, -R * 0.34, -R * 0.02]} scale={[0.2, 0.78, 0.42]}>
              <sphereGeometry args={[R * 0.92, 16, 16]} />
            </mesh>
          ))}
          <mesh material={mat} castShadow position={[0, -R * 0.72, -R * 0.62]} scale={[0.82, 1.15, 0.6]}>
            <sphereGeometry args={[R * 0.8, 18, 16]} />
          </mesh>
        </group>
      )
    case 'braid':
      // 땋은머리 — 뒤로 마디마디 이어진 줄기
      return (
        <group>
          {shell(Math.PI * 0.3, Math.PI * 0.5, Math.PI * 0.72)}
          {[0, 1, 2, 3, 4].map((i) => (
            <mesh key={i} material={mat} castShadow
              position={[0, -R * 0.12 - i * R * 0.3, -R * (0.78 + i * 0.04)]}
              scale={[0.8 - i * 0.1, 0.7 - i * 0.07, 0.8 - i * 0.1]}>
              <sphereGeometry args={[R * 0.3, 14, 12]} />
            </mesh>
          ))}
        </group>
      )
    case 'mohawk':
      return (
        <group>
          {shell(Math.PI * 0.32, Math.PI * 0.42, Math.PI * 0.7, R * 1.01)}
          {[...Array(6)].map((_, i) => (
            <mesh key={i} position={[0, R * 0.8, -0.2 + i * 0.085]} material={mat} castShadow>
              <coneGeometry args={[0.075, 0.4 - Math.abs(i - 2.5) * 0.06, 6]} />
            </mesh>
          ))}
        </group>
      )
    default:
      return <group>{shell()}</group>
  }
}

// -----------------------------------------------------------------------------------
// 액세서리
// -----------------------------------------------------------------------------------
/** 색을 흰색 쪽으로 t만큼 당긴다 — 같은 색끼리 붙었을 때 형태를 살리는 용도 */
function lighten(hex, t) {
  const c = new THREE.Color(hex)
  return '#' + c.lerp(new THREE.Color('#ffffff'), t).getHexString()
}

function Accessory({ id, color = '#ef4444', R = 0.37 }) {
  const mat = useMemo(() => charMaterial({ color, roughness: 0.7 }), [color])
  const glass = useMemo(
    // opacity가 높으면 렌즈가 눈을 지워버린다 — 눈이 비쳐 보일 만큼 얇게
    () => charMaterial({ color, roughness: 0.1, metalness: 0.3, transparent: true, opacity: 0.26, rimIntensity: 0.7, envMapIntensity: 2 }),
    [color]
  )
  // 테/스트랩용 어두운 색 — 상의색을 그대로 쓰면 밝은 옷일 때 얼굴에 묻힌다
  const frameMat = useMemo(() => charMaterial({ color: '#2f3643', roughness: 0.5 }), [])
  // 천 액세서리(목수건)용 — 상의와 같은 색이면 형태가 전혀 안 읽혀서 밝기를 올린다
  const clothMat = useMemo(() => charMaterial({ color: lighten(color, 0.55), roughness: 0.85 }), [color])
  if (!id || id === 'none') return null
  if (id === 'headband')
    return (
      <mesh position={[0, R * 0.42, 0.02]} rotation={[Math.PI / 2, 0, 0]} material={mat} castShadow>
        <torusGeometry args={[R * 0.98, 0.03, 10, 26]} />
      </mesh>
    )
  if (id === 'cap')
    return (
      <group position={[0, R * 0.3, 0]}>
        <mesh material={mat} castShadow>
          <sphereGeometry args={[R * 1.04, 22, 16, 0, Math.PI * 2, 0, Math.PI * 0.5]} />
        </mesh>
        {/* 챙 — 아래로 기울여야 정면에서 윗면이 보인다. 평평하면 선 하나로만 읽힌다 */}
        <mesh position={[0, -0.03, 0.24]} rotation={[0.2, 0, 0]} scale={[1.45, 0.13, 1.25]} material={mat} castShadow>
          <sphereGeometry args={[0.24, 18, 10, 0, Math.PI, 0, Math.PI]} />
        </mesh>
        <mesh position={[0, 0.35, 0]} material={mat}>
          <sphereGeometry args={[0.035, 8, 8]} />
        </mesh>
      </group>
    )
  if (id === 'glasses')
    // 스포츠 고글 — 얼굴 표면(z≈R)보다 앞으로 나와야 보인다. 안쪽에 두면 두상에 파묻힌다
    return (
      // 눈은 얼굴 텍스처상 EYE_Y=268(중심 256)·EYE_DX=116이라 두상 중심보다 살짝 아래·좌우 R*0.45에 있다.
      // 렌즈를 한 덩어리로 만들면 눈을 통째로 덮어버려서, 눈마다 하나씩 얹고 렌즈는 거의 투명하게 둔다.
      <group position={[0, -R * 0.085, 0]}>
        {[-1, 1].map((s) => (
          <group key={s} position={[s * R * 0.45, 0, R * 0.8]}>
            <mesh scale={[1, 0.84, 0.34]} material={glass}>
              <sphereGeometry args={[R * 0.34, 16, 12]} />
            </mesh>
            {/* 토러스는 기본이 XY 평면(=카메라를 마주본다). X축으로 돌리면 정면에서 막대기 하나로 보인다 */}
            <mesh scale={[1, 0.84, 1]} material={frameMat}>
              <torusGeometry args={[R * 0.34, 0.02, 8, 22]} />
            </mesh>
          </group>
        ))}
        {/* 콧대 브릿지 */}
        <mesh position={[0, 0, R * 0.88]} material={frameMat}>
          <boxGeometry args={[R * 0.32, 0.026, 0.026]} />
        </mesh>
        {/* 다리는 달지 않는다 — 두상이 구형이라 어떤 각도로 붙여도 얼굴 밖으로 삐져나온 막대기로 보인다 */}
      </group>
    )
  if (id === 'towel')
    // 목수건 — 목에 두르고 가슴 앞으로 두 가닥이 늘어진다
    return (
      <group position={[0, -R * 0.86, 0]}>
        <mesh rotation={[Math.PI / 2, 0, 0]} scale={[1, 1, 0.85]} material={clothMat} castShadow>
          <torusGeometry args={[R * 0.56, 0.062, 10, 24]} />
        </mesh>
        {/* 늘어진 두 가닥 — 넓으면 가슴을 덮는 앞치마처럼 보인다. 좁게, 좌우로 벌려서 */}
        {[-1, 1].map((s) => (
          <mesh
            key={s}
            position={[s * R * 0.3, -R * 0.34, R * 0.46]}
            rotation={[0.18, 0, s * 0.24]}
            material={clothMat}
            castShadow
          >
            <boxGeometry args={[R * 0.17, R * 0.64, 0.045]} />
          </mesh>
        ))}
      </group>
    )
  if (id === 'visor')
    // 썬바이저 — 챙만 있고 정수리는 뚫려 있다
    return (
      <group position={[0, R * 0.36, 0]}>
        <mesh material={mat} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <torusGeometry args={[R * 0.98, 0.035, 10, 26]} />
        </mesh>
        <mesh position={[0, -0.04, R * 0.66]} rotation={[0.22, 0, 0]} scale={[1.4, 0.12, 1.2]} material={mat} castShadow>
          <sphereGeometry args={[R * 0.66, 18, 10, 0, Math.PI, 0, Math.PI]} />
        </mesh>
      </group>
    )
  if (id === 'hairpin')
    return (
      <group position={[R * 0.62, R * 0.54, R * 0.48]} rotation={[0, -0.5, 0.5]}>
        <mesh material={mat} castShadow>
          <boxGeometry args={[0.13, 0.028, 0.028]} />
        </mesh>
        <mesh position={[0.06, 0, 0]} material={mat}>
          <sphereGeometry args={[0.032, 10, 8]} />
        </mesh>
      </group>
    )
  if (id === 'mask')
    return (
      // 입은 얼굴 텍스처상 MOUTH_Y=372(중심 256) — 두상 중심에서 R*0.45쯤 아래다. 그보다 위에 두면 입이 노출된다
      // z를 당기면 두상 표면에 파묻혀 윗부분이 잘리고 입이 다시 드러난다 — 앞으로 충분히 빼 둔다
      <mesh position={[0, -R * 0.42, R * 0.4]} scale={[0.92, 0.5, 0.56]} castShadow>
        <sphereGeometry args={[R * 0.82, 20, 16, Math.PI * 0.28, Math.PI * 0.44, Math.PI * 0.32, Math.PI * 0.5]} />
        <meshStandardMaterial color="#f7fafc" roughness={0.9} side={THREE.DoubleSide} />
      </mesh>
    )
  if (id === 'crown')
    return (
      <group position={[0, R * 0.92, 0]}>
        <mesh castShadow>
          <cylinderGeometry args={[0.2, 0.22, 0.08, 14]} />
          <meshStandardMaterial color="#ffd166" metalness={0.85} roughness={0.2} />
        </mesh>
        {[...Array(6)].map((_, i) => {
          const a = (i / 6) * Math.PI * 2
          return (
            <mesh key={i} position={[Math.cos(a) * 0.2, 0.08, Math.sin(a) * 0.2]} castShadow>
              <coneGeometry args={[0.045, 0.12, 5]} />
              <meshStandardMaterial color="#ffd166" metalness={0.85} roughness={0.2} />
            </mesh>
          )
        })}
      </group>
    )
  return null
}

// -----------------------------------------------------------------------------------
// 캐릭터 본체
// -----------------------------------------------------------------------------------
export default function Character({
  look,
  gender = '남',
  anim = 'idle',
  seed = 0,
  showTag = false,
  name = '',
  level = 'C조',
  isMe = false,
  simple = false,
  onClick,
}) {
  const root = useRef()
  const body = useRef()
  const legL = useRef()
  const legR = useRef()
  const calfL = useRef()
  const calfR = useRef()
  const armL = useRef()
  const armR = useRef()
  const foreL = useRef()
  const foreR = useRef()
  const head = useRef()
  const hairRef = useRef()
  const eyeL = useRef()
  const eyeR = useRef()
  const faceRef = useRef(null)
  const blink = useRef({ next: 2 + Math.random() * 4, t: 0, shut: false })

  const skin = skinOf(look.skin)
  const female = gender === '여'
  const h = look.height ?? 1
  const phase = (seed % 100) * 0.37

  const skinMat = useMemo(() => skinMaterial(skin), [skin])
  const topMat = useMemo(() => clothMaterial(look.top), [look.top])
  const bandMat = useMemo(() => clothMaterial(lighten(look.top, 0.55)), [look.top])
  const bottomMat = useMemo(() => clothMaterial(look.bottom), [look.bottom])
  const shoeMat = useMemo(() => glossMaterial(look.shoes), [look.shoes])
  const soleMat = useMemo(() => charMaterial({ color: '#f4f4f5', roughness: 0.8 }), [])
  const whiteMat = useMemo(() => clothMaterial('#ffffff'), [])
  // 신발 장식 — 신발이 밝으면 어둡게, 어두우면 밝게. 안 그러면 흰 신발에서 무늬가 사라진다
  const shoeAccentMat = useMemo(() => {
    const c = new THREE.Color(look.shoes || '#ffffff')
    const lum = 0.299 * c.r + 0.587 * c.g + 0.114 * c.b
    return glossMaterial(lum > 0.55 ? '#2b3446' : '#fdfdfd')
  }, [look.shoes])
  const browMat = useMemo(() => charMaterial({ color: look.hairColor, roughness: 0.7 }), [look.hairColor])
  const mouthMat = useMemo(() => charMaterial({ color: '#8d4a4f', roughness: 0.5 }), [])
  const blushMat = useMemo(
    () => new THREE.MeshBasicMaterial({ color: '#ff93a3', transparent: true, opacity: 0.42 }),
    []
  )
  const torsoGeo = useMemo(() => torsoGeometry(female), [female])

  // 몸통 표면 반지름 (월드 y 기준). 의상 디테일을 이 값에 맞춰야 몸에 붙는다.
  // 몸통은 y 0.30~0.78 이고 0.70 위로는 머리에 가려진다 — 칼라·넥라인은 0.62~0.70 사이에 둔다.
  const torsoR = useMemo(() => {
    const w = female ? 0.93 : 1
    const sh = female ? 0.94 : 1
    const P = [
      [0.30, 0.196 * w], [0.36, 0.204 * w], [0.45, 0.200 * w], [0.54, 0.188 * w],
      [0.62, 0.166 * w * sh], [0.69, 0.142 * w * sh], [0.74, 0.106 * w * sh],
    ]
    return (y) => {
      if (y <= P[0][0]) return P[0][1]
      for (let i = 1; i < P.length; i++) {
        if (y <= P[i][0]) {
          const t = (y - P[i - 1][0]) / (P[i][0] - P[i - 1][0])
          return P[i - 1][1] + t * (P[i][1] - P[i - 1][1])
        }
      }
      return P[P.length - 1][1]
    }
  }, [female])

  // 하의 스타일 — 예전 데이터는 성별로만 갈렸으므로 없으면 그때 규칙을 따른다
  const bottomStyle = look.bottomStyle || (female ? 'skirt' : 'shorts')
  const shoeStyle = look.shoeStyle || 'basic'

  // 등번호 (없으면 이름 길이로 정해 준다)
  const numberMat = useMemo(() => {
    const n = look.number ?? ((name.length * 7) % 98) + 1
    const c = document.createElement('canvas')
    c.width = c.height = 128
    const g = c.getContext('2d')
    g.clearRect(0, 0, 128, 128)
    g.fillStyle = '#ffffff'
    g.font = 'bold 88px "Malgun Gothic", sans-serif'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.lineWidth = 8
    g.strokeStyle = 'rgba(0,0,0,0.35)'
    g.strokeText(String(n), 64, 68)
    g.fillText(String(n), 64, 68)
    const tex = new THREE.CanvasTexture(c)
    tex.colorSpace = THREE.SRGBColorSpace
    return new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.9 })
  }, [look.number, name])

  useFrame((state, rawDt) => {
    const t = state.clock.elapsedTime + phase
    if (!body.current) return
    // 탭을 다시 켜거나 첫 프레임에는 간격이 비정상적으로 커진다 → 상한을 둔다
    const dt = Math.min(rawDt, 0.05)

    // ── 눈 깜빡임 ────────────────────────────────────────────────
    const b = blink.current
    b.next -= dt
    if (b.next <= 0) {
      b.t = 0.14
      b.next = 2.2 + Math.random() * 4.5
    }
    const shut = b.t > 0
    if (shut) b.t -= dt
    // 얼굴 그림 방식 — 감은 눈 텍스처로 교체
    const f = faceRef.current
    if (f && b.shut !== shut) {
      b.shut = shut
      f.mat.map = shut ? f.closed : f.open
      f.mat.needsUpdate = true
    }
    // 간략 모드(3D 눈) — 세로로 눌러서 감는다
    if (eyeL.current) eyeL.current.scale.y = shut ? 0.08 : 1
    if (eyeR.current) eyeR.current.scale.y = shut ? 0.08 : 1

    body.current.rotation.x = 0 // 달리기 기울기는 아래에서만 켠다
    if (anim === 'walk' || anim === 'run') {
      // 달리기는 더 빠르고 보폭이 크며, 동물의 숲처럼 상체를 앞으로 기울인다
      const dash = anim === 'run'
      const k = dash ? 1.42 : 1
      const w = t * (dash ? 12.6 : 8.6)
      const s = Math.sin(w)
      if (legL.current) legL.current.rotation.x = s * 0.66 * k
      if (legR.current) legR.current.rotation.x = -s * 0.66 * k
      // 무릎은 뒤로 갈 때만 접힌다
      if (calfL.current) calfL.current.rotation.x = Math.max(0, -s) * 0.85 * k
      if (calfR.current) calfR.current.rotation.x = Math.max(0, s) * 0.85 * k
      if (armL.current) armL.current.rotation.x = -s * 0.52 * k
      if (armR.current) armR.current.rotation.x = s * 0.26 * k - 0.16
      if (foreL.current) foreL.current.rotation.x = -0.25 - Math.max(0, s) * 0.4
      if (foreR.current) foreR.current.rotation.x = -0.3
      body.current.position.y = Math.abs(s) * (dash ? 0.085 : 0.05)
      body.current.rotation.z = s * 0.035
      body.current.rotation.y = s * 0.07
      body.current.rotation.x = dash ? 0.17 : 0
      if (head.current) {
        head.current.rotation.y = 0
        head.current.rotation.z = -s * 0.05
        head.current.rotation.x = dash ? -0.14 : 0
      }
    } else if (anim === 'play') {
      const w = t * 3.3
      const swing = Math.max(0, Math.sin(t * 2.2))
      const step = Math.sin(w * 2)
      if (legL.current) legL.current.rotation.x = step * 0.24
      if (legR.current) legR.current.rotation.x = -step * 0.24
      if (calfL.current) calfL.current.rotation.x = Math.abs(step) * 0.3
      if (calfR.current) calfR.current.rotation.x = Math.abs(step) * 0.3
      if (armR.current) {
        armR.current.rotation.x = -0.55 - swing * 2.2
        armR.current.rotation.z = -swing * 0.55
      }
      if (foreR.current) foreR.current.rotation.x = -0.5 + swing * 0.4
      if (armL.current) armL.current.rotation.x = -0.35 + Math.sin(w) * 0.35
      if (foreL.current) foreL.current.rotation.x = -0.6
      body.current.position.y = Math.abs(step) * 0.075
      body.current.rotation.y = Math.sin(w) * 0.2
      body.current.rotation.z = 0
      if (head.current) {
        head.current.rotation.x = -0.14 - swing * 0.16
        head.current.rotation.y = 0
      }
    } else if (anim === 'cheer') {
      const w = t * 4.2
      if (armL.current) { armL.current.rotation.x = -2.5 + Math.sin(w) * 0.28; armL.current.rotation.z = 0.25 }
      if (armR.current) { armR.current.rotation.x = -2.5 - Math.sin(w) * 0.28; armR.current.rotation.z = -0.25 }
      if (foreL.current) foreL.current.rotation.x = -0.3
      if (foreR.current) foreR.current.rotation.x = -0.3
      const jump = Math.abs(Math.sin(w))
      body.current.position.y = jump * 0.14
      body.current.scale.y = 1 + jump * 0.04 // 살짝 늘어나는 스쿼시&스트레치
      if (legL.current) legL.current.rotation.x = -jump * 0.3
      if (legR.current) legR.current.rotation.x = -jump * 0.3
      if (head.current) head.current.rotation.x = -0.2 * jump
    } else {
      // ── 대기: 숨쉬기 + 무게중심 이동 + 카메라 쳐다보기 ──
      const w = t * 1.5
      body.current.position.y = Math.sin(w) * 0.018
      body.current.rotation.z = Math.sin(w * 0.5) * 0.022
      body.current.rotation.y = Math.sin(t * 0.33 + phase) * 0.06
      body.current.scale.y = 1 + Math.sin(w) * 0.012
      if (legL.current) legL.current.rotation.x = 0
      if (legR.current) legR.current.rotation.x = 0
      if (calfL.current) calfL.current.rotation.x = 0
      if (calfR.current) calfR.current.rotation.x = 0
      const fidget = Math.sin(t * 0.45 + phase) > 0.95 ? Math.sin(t * 13) * 0.22 : 0
      // 팔을 몸통에서 살짝 띄워 실루엣이 붙어 보이지 않게 한다
      if (armL.current) { armL.current.rotation.x = Math.sin(w) * 0.07 + fidget; armL.current.rotation.z = 0 }
      if (armR.current) { armR.current.rotation.x = -Math.sin(w) * 0.07 - 0.1; armR.current.rotation.z = 0 }
      if (foreL.current) foreL.current.rotation.x = -0.16
      if (foreR.current) foreR.current.rotation.x = -0.2

      // 카메라(=플레이어) 쪽으로 고개를 돌린다
      if (head.current && root.current) {
        root.current.getWorldPosition(_wp)
        _dir.copy(state.camera.position).sub(_wp)
        const world = Math.atan2(_dir.x, _dir.z)
        root.current.getWorldQuaternion(_q)
        _e.setFromQuaternion(_q, 'YXZ')
        let rel = ((world - _e.y + Math.PI * 3) % (Math.PI * 2)) - Math.PI
        const targetY = clamp(rel, -0.85, 0.85) * 0.62
        const targetX = clamp(-Math.atan2(_dir.y - 1.2, Math.hypot(_dir.x, _dir.z)), -0.25, 0.3)
        head.current.rotation.y += (targetY - head.current.rotation.y) * Math.min(1, dt * 3)
        head.current.rotation.x += (targetX - head.current.rotation.x) * Math.min(1, dt * 2.5)
        head.current.rotation.z = Math.sin(w * 0.6) * 0.035
      }
    }

    // ── 머리카락 관성: 머리 회전을 한 박자 늦게 따라간다 ──
    if (hairRef.current && head.current) {
      const target = -head.current.rotation.y * 0.28
      hairRef.current.rotation.y += (target - hairRef.current.rotation.y) * Math.min(1, dt * 6)
      hairRef.current.rotation.x = Math.sin(t * 2.1) * 0.014 + body.current.position.y * -0.5
    }
  })

  const legPart = (s, legRef, calfRef) => (
    <group key={s} ref={legRef} position={[s * 0.125, 0.32, 0]}>
      {/* 허벅지 — 스커트면 맨다리가 보인다 */}
      <mesh
        position={[0, -0.1, 0]}
        material={bottomStyle === 'skirt' || bottomStyle === 'skirtLayer' ? skinMat : bottomMat}
        castShadow
      >
        <capsuleGeometry args={[0.088, 0.03, 6, 14]} />
      </mesh>
      {/* 무릎 — 맨다리가 드러나는 하의면 살색이어야 한다 */}
      <mesh
        position={[0, -0.2, 0]}
        material={bottomStyle === 'long' || bottomStyle === 'leggings' ? bottomMat : skinMat}
      >
        <sphereGeometry args={[0.084, 14, 12]} />
      </mesh>
      <group ref={calfRef} position={[0, -0.14, 0]}>
        {/* 종아리 — 긴바지·레깅스는 발목까지 옷감 */}
        <mesh
          position={[0, -0.1, 0]}
          material={bottomStyle === 'long' || bottomStyle === 'leggings' ? bottomMat : skinMat}
          castShadow
        >
          <capsuleGeometry args={[bottomStyle === 'long' ? 0.084 : 0.078, 0.02, 6, 14]} />
        </mesh>
        {/* 신발 */}
        <group position={[0, -0.13, 0]}>
          {/* 밑창 — 흰 벽돌처럼 보이지 않게 얇고 둥글게 */}
          <mesh position={[0, -0.022, 0.028]} scale={[1, 0.32, 1.45]} material={soleMat} castShadow>
            <sphereGeometry args={[0.082, 16, 10]} />
          </mesh>
          <mesh position={[0, 0.018, 0.024]} scale={[1, 0.9, 1.35]} material={shoeMat} castShadow>
            <sphereGeometry args={[0.08, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.66]} />
          </mesh>
          {/* 하이탑 — 발목까지 올라온다 */}
          {shoeStyle === 'high' && (
            <>
              {/* 종아리(반지름 0.078~0.084)보다 굵어야 발목을 감싼 게 보인다 */}
              <mesh position={[0, 0.055, -0.005]} material={shoeMat} castShadow>
                <cylinderGeometry args={[0.086, 0.09, 0.09, 16]} />
              </mesh>
              {/* 발목 테두리 — 하이탑이라는 걸 한눈에 알아보게.
                  종아리가 테두리 가장자리에서 뚫고 나오지 않게 목을 낮게 잡는다 */}
              {!simple && (
                <mesh position={[0, 0.088, -0.005]} material={shoeAccentMat}>
                  <cylinderGeometry args={[0.092, 0.088, 0.028, 16]} />
                </mesh>
              )}
            </>
          )}
          {/* 장식은 신발 곡면을 그대로 따라가는 띠로 얹는다 — 각진 상자는 신발을 뚫는다 */}
          {!simple && (shoeStyle === 'stripe' || shoeStyle === 'pro') && (
            <mesh position={[0, 0.018, 0.024]} scale={[1, 0.9, 1.35]} material={shoeAccentMat}>
              <sphereGeometry
                args={[0.0818, 20, 12, 0, Math.PI * 2, Math.PI * 0.4, Math.PI * 0.14]}
              />
            </mesh>
          )}
          {/* 앞코 — 기본화·프로화의 구분점 */}
          {!simple && (shoeStyle === 'basic' || shoeStyle === 'pro') && (
            <mesh position={[0, 0.018, 0.024]} scale={[1, 0.9, 1.35]} material={shoeAccentMat}>
              <sphereGeometry
                args={[0.0815, 20, 12, Math.PI * 0.5 - 0.4, 0.8, Math.PI * 0.32, Math.PI * 0.3]}
              />
            </mesh>
          )}
          {/* 프로 코트화 — 뒤꿈치 보강까지 들어간다 */}
          {!simple && shoeStyle === 'pro' && (
            <mesh position={[0, 0.018, 0.024]} scale={[1, 0.9, 1.35]} material={shoeAccentMat}>
              <sphereGeometry
                args={[0.0815, 20, 12, Math.PI * 1.5 - 0.42, 0.84, Math.PI * 0.06, Math.PI * 0.34]}
              />
            </mesh>
          )}
        </group>
      </group>
    </group>
  )

  const armPart = (s, armRef, foreRef) => {
    // 동물의 숲 팔 — 관절 없이 짧고 뭉툭한 토막에 벙어리 손
    const sleeveless = look.outfit === 'sleeveless'
    // 라글란은 소매만 다른 색으로 빠지는 게 특징이다 — 이게 없으면 기본 티와 구분이 안 된다
    const sleeveMat = sleeveless ? skinMat : look.outfit === 'raglan' ? whiteMat : topMat
    return (
      <group key={`arm${s}`} position={[s * (female ? 0.174 : 0.188), 0.7, 0.022]} rotation={[0, 0, s * 0.5]}>
      <group ref={armRef}>
        {/* 소매 */}
        <mesh material={sleeveMat} castShadow scale={[0.9, 1, 0.9]}>
          <sphereGeometry args={[0.076, 14, 12]} />
        </mesh>
        <mesh position={[0, -0.055, 0]} material={sleeveMat} castShadow>
          <capsuleGeometry args={[0.07, 0.055, 6, 12]} />
        </mesh>
        <group ref={foreRef} position={[0, -0.135, 0]}>
          {look.acc === 'wristband' && !simple && (
            // 상의색 그대로 쓰면 소매와 구분이 안 된다 — 밝게 빼고 조금 더 두껍게
            <mesh position={[0, -0.014, 0]} material={bandMat}>
              <cylinderGeometry args={[0.082, 0.082, 0.055, 14]} />
            </mesh>
          )}
          {/* 손 — 벙어리장갑처럼 동그랗게 */}
          <mesh position={[0, -0.068, 0]} scale={[1, 1.02, 0.9]} material={skinMat} castShadow>
            <sphereGeometry args={[0.085, 14, 12]} />
          </mesh>
          {/* 오른손에 라켓 — 바깥으로 눕혀서 든다. 세우면 라켓 헤드가 얼굴을 가린다 */}
          {s > 0 && (
            <group position={[-0.01, -0.085, 0.06]} rotation={[-0.14, 0.2, -1.0]} scale={1.0}>
              <Racket racket={look.racket} simple={simple} />
            </group>
          )}
        </group>
      </group>
      </group>
    )
  }

  return (
    <group
      ref={root}
      scale={h}
      onClick={onClick}
      onPointerOver={(e) => (e.stopPropagation(), (document.body.style.cursor = 'pointer'))}
      onPointerOut={() => (document.body.style.cursor = 'auto')}
    >
      {/* 발밑 그림자 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.015, 0]}>
        <circleGeometry args={[0.33, 20]} />
        <meshBasicMaterial color="#16351f" transparent opacity={0.24} depthWrite={false} />
      </mesh>

      <group ref={body}>
        {legPart(-1, legL, calfL)}
        {legPart(1, legR, calfR)}

        {/* 하의 스타일 */}
        {bottomStyle === 'skirt' && (
          <mesh position={[0, 0.3, 0]} material={bottomMat} castShadow>
            <cylinderGeometry args={[0.175, 0.28, 0.15, 22, 1, true]} />
          </mesh>
        )}
        {bottomStyle === 'skirtLayer' && (
          <>
            <mesh position={[0, 0.31, 0]} material={bottomMat} castShadow>
              <cylinderGeometry args={[0.175, 0.26, 0.14, 22, 1, true]} />
            </mesh>
            <mesh position={[0, 0.25, 0]} material={whiteMat} castShadow>
              <cylinderGeometry args={[0.225, 0.3, 0.1, 22, 1, true]} />
            </mesh>
          </>
        )}
        {/* 반바지 — 허벅지를 덮는 짧은 통 */}
        {bottomStyle === 'shorts' && (
          <mesh position={[0, 0.27, 0]} material={bottomMat} castShadow>
            <cylinderGeometry args={[0.19, 0.215, 0.15, 20, 1, true]} />
          </mesh>
        )}
        {/* 긴바지·레깅스 — 골반을 덮어 준다. 없으면 다리 두 개가 따로 노는 막대처럼 보인다 */}
        {(bottomStyle === 'long' || bottomStyle === 'leggings') && (
          <mesh position={[0, 0.265, 0]} material={bottomMat} castShadow>
            <cylinderGeometry
              args={[0.19, bottomStyle === 'long' ? 0.212 : 0.2, 0.17, 20, 1, true]}
            />
          </mesh>
        )}
        {/* 허리 밴드 */}
        <mesh position={[0, 0.33, 0]} scale={[1, 1, 0.94]} material={whiteMat}>
          <cylinderGeometry args={[0.196, 0.196, 0.03, 20, 1, true]} />
        </mesh>

        {/* 몸통 — 옆에서 봐도 통통해야 동물의 숲 느낌이 난다 */}
        <mesh geometry={torsoGeo} position={[0, 0.3, 0]} scale={[1, 1, 0.92]} material={topMat} castShadow receiveShadow />

        {/* 의상 디테일 */}
        {!simple && look.outfit === 'stripe' &&
          [0.44, 0.545, 0.65].map((y) => (
            <mesh key={y} position={[0, y, 0]} scale={[1, 1, 0.92]} material={whiteMat}>
              <cylinderGeometry args={[torsoR(y) + 0.004, torsoR(y) + 0.004, 0.042, 24, 1, true]} />
            </mesh>
          ))}
        {/* 라글란 — 목둘레 배색. 소매도 흰색으로 빠진다 (armPart 참고) */}
        {!simple && look.outfit === 'raglan' && (
          <mesh position={[0, 0.663, 0]} scale={[1, 1, 0.92]} material={whiteMat}>
            <cylinderGeometry args={[torsoR(0.69) + 0.005, torsoR(0.635) + 0.005, 0.055, 20, 1, true]} />
          </mesh>
        )}
        {/* 지퍼 — 몸통이 위로 갈수록 좁아지므로 살짝 뒤로 눕혀야 표면에 붙는다 */}
        {!simple && (look.outfit === 'zipup' || look.outfit === 'hoodie') && (
          <mesh
            position={[0, 0.55, torsoR(0.55) * 0.92 + 0.006]}
            rotation={[-0.16, 0, 0]}
            material={charMaterial({ color: '#e5e7eb', roughness: 0.4, metalness: 0.5 })}
          >
            <boxGeometry args={[0.026, 0.26, 0.014]} />
          </mesh>
        )}
        {/* 후드 — 목 뒤로 넘어간 두건 + 목을 감싸는 칼라 */}
        {!simple && look.outfit === 'hoodie' && (
          <>
            <mesh position={[0, 0.72, -0.2]} rotation={[0.4, 0, 0]} scale={[1.2, 0.8, 0.72]} material={topMat} castShadow>
              <sphereGeometry args={[0.235, 18, 14]} />
            </mesh>
            <mesh position={[0, 0.678, 0]} scale={[1, 1, 0.94]} material={topMat} castShadow>
              <cylinderGeometry args={[torsoR(0.71) + 0.022, torsoR(0.645) + 0.022, 0.07, 20, 1, true]} />
            </mesh>
            {[-1, 1].map((s) => (
              <mesh key={s} position={[s * 0.045, 0.585, torsoR(0.585) * 0.92 + 0.012]} rotation={[-0.16, 0, 0]} material={whiteMat}>
                <cylinderGeometry args={[0.012, 0.012, 0.13, 6]} />
              </mesh>
            ))}
          </>
        )}
        {/* 폴로 칼라 — 턱 바로 아래에서 밖으로 벌어진다 */}
        {!simple && look.outfit === 'polo' && (
          <mesh position={[0, 0.668, 0.008]} rotation={[0.14, 0, 0]} scale={[1, 1, 0.94]} material={whiteMat} castShadow>
            <cylinderGeometry args={[torsoR(0.705) + 0.004, torsoR(0.63) + 0.028, 0.078, 18, 1, true]} />
          </mesh>
        )}
        {/* 브이넥 — 마름모 한 장이면 무늬처럼 보인다. 실제로 V자 두 획을 그어 준다 */}
        {!simple && look.outfit === 'vneck' &&
          [-1, 1].map((s) => (
            <mesh
              key={s}
              position={[s * 0.033, 0.652, torsoR(0.652) * 0.92 + 0.004]}
              rotation={[0, s * -0.35, s * 0.62]}
              material={skinMat}
            >
              <boxGeometry args={[0.036, 0.125, 0.012]} />
            </mesh>
          ))}
        {/* 사선 배색 */}
        {!simple && look.outfit === 'sash' && (
          <mesh position={[0, 0.7, 0]} rotation={[0, 0, 0.5]} scale={[1, 1, 0.83]} material={whiteMat}>
            <cylinderGeometry args={[0.222, 0.222, 0.09, 24, 1, true]} />
          </mesh>
        )}
        {/* 등번호 · 클럽 저지 — 등판 한가운데. 예전엔 턱 뒤라 아예 안 보였다 */}
        {!simple && (look.outfit === 'number' || look.outfit === 'club') && (
          <mesh position={[0, 0.555, -(torsoR(0.555) * 0.92 + 0.006)]} rotation={[0, Math.PI, 0]} material={numberMat}>
            <planeGeometry args={[0.2, 0.2]} />
          </mesh>
        )}
        {!simple && look.outfit === 'club' && (
          <>
            {[-1, 1].map((s) => (
              <mesh key={s} position={[s * 0.145, 0.56, 0.1]} rotation={[0, s * 0.62, 0]} material={whiteMat}>
                <boxGeometry args={[0.046, 0.24, 0.012]} />
              </mesh>
            ))}
          </>
        )}

        {armPart(-1, armL, foreL)}
        {armPart(1, armR, foreR)}

        {/* 목 */}
        <mesh position={[0, 0.76, 0]} material={skinMat}>
          <cylinderGeometry args={[0.088, 0.1, 0.07, 14]} />
        </mesh>

        {/* 머리 */}
        <group ref={head} position={[0, 1.02, 0]}>
          {/* 두개골 */}
          <mesh scale={[1, 0.97, 0.95]} material={skinMat} castShadow>
            <sphereGeometry args={[HEAD_R, 32, 26]} />
          </mesh>
          {/* 턱 — 살짝 갸름하게 */}
          {!simple && (
            <mesh position={[0, -HEAD_R * 0.42, HEAD_R * 0.08]} scale={[0.92, 0.62, 0.94]} material={skinMat}>
              <sphereGeometry args={[HEAD_R * 0.73, 20, 16]} />
            </mesh>
          )}
          {/* 귀 */}
          {!simple && [-1, 1].map((s) => (
            <mesh key={`ear${s}`} position={[s * HEAD_R * 0.96, -HEAD_R * 0.05, -0.01]} scale={[0.42, 0.95, 0.65]} material={skinMat}>
              <sphereGeometry args={[HEAD_R * 0.2, 12, 10]} />
            </mesh>
          ))}

          <group ref={hairRef}>
            <Hair style={look.hair} color={look.hairColor} R={HEAD_R} simple={simple} />
          </group>

          {/* 얼굴 — 눈·눈썹·입·볼터치가 전부 이 그림 한 장에 들어있다 */}
          {simple ? (
            <>
              <Eye side={-1} style={look.eyes} blinkRef={eyeL} simple />
              <Eye side={1} style={look.eyes} blinkRef={eyeR} simple />
            </>
          ) : (
            <Face look={look} R={HEAD_R} blinkRef={faceRef} />
          )}

          {!simple && <Accessory id={look.acc} color={look.top} R={HEAD_R} />}
        </group>
      </group>

      {showTag && <NameTag name={name} level={level} isMe={isMe} y={2.2 / h} />}
    </group>
  )
}
