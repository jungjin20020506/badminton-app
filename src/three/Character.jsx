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
import { faceTexture } from './face.js'

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
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')
  g.clearRect(0, 0, 128, 128)
  g.strokeStyle = 'rgba(255,255,255,0.95)'
  g.lineWidth = 2.4
  for (let i = 8; i < 128; i += 10) {
    g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 128); g.stroke()
    g.beginPath(); g.moveTo(0, i); g.lineTo(128, i); g.stroke()
  }
  stringTex = new THREE.CanvasTexture(c)
  return stringTex
}

export function Racket({ racket = {}, simple = false }) {
  const { frame = '#ef4444', string = '#ffffff', grip = '#1f2937', model = 'classic' } = racket
  const tex = useMemo(() => (simple ? null : getStringTexture()), [simple])
  const headY = model === 'power' ? 0.51 : 0.48
  const headR = model === 'power' ? 0.145 : model === 'speed' ? 0.12 : 0.132

  const frameMat = useMemo(() => glossMaterial(frame), [frame])
  const gripMat = useMemo(() => charMaterial({ color: grip, roughness: 0.95, rimIntensity: 0.2 }), [grip])
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
      {/* 프레임 */}
      <mesh position={[0, headY, 0]} scale={[1, 1.2, 1]} material={frameMat} castShadow>
        <torusGeometry args={[headR, 0.015, 10, 34]} />
      </mesh>
      {/* 스트링 */}
      {!simple && (
        <mesh position={[0, headY, 0]} scale={[1, 1.2, 1]} material={stringMat}>
          <circleGeometry args={[headR - 0.005, 26]} />
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
  const pts = [
    [0.0, 0.0],
    [0.165 * w, 0.0],
    [0.192 * w, 0.05],
    [0.208 * w, 0.14],
    [0.216 * w, 0.25],
    [0.222 * w * shoulder, 0.36],
    [0.212 * w * shoulder, 0.44],
    [0.178 * w * shoulder, 0.5],
    [0.1, 0.535],
    [0.0, 0.545],
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
const FACE = {
  phiStart: Math.PI / 2 - Math.PI * 0.42,
  phiLength: Math.PI * 0.84,
  thetaStart: Math.PI * 0.25,
  thetaLength: Math.PI * 0.46,
}

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
function Hair({ style, color, R = 0.34, simple }) {
  const mat = useMemo(() => hairMaterial(color), [color])
  // 두상을 덮는 캡. cut 이 클수록 아래로 많이 내려온다.
  // 얼굴(theta 0.25π~0.71π)을 가리지 않도록 앞쪽은 bangs 로만 처리한다.
  const cap = (r = R * 1.035, cut = 0.34) => (
    <mesh material={mat} castShadow>
      <sphereGeometry args={[r, 28, 22, 0, Math.PI * 2, 0, Math.PI * cut]} />
    </mesh>
  )
  // 뒤통수·옆머리 — 뒤쪽 180°만 아래로 길게 내린다
  const back = (cut = 0.62, r = R * 1.03) => (
    <mesh material={mat} castShadow>
      <sphereGeometry args={[r, 28, 22, Math.PI / 2 + Math.PI * 0.42, Math.PI * 1.16, 0, Math.PI * cut]} />
    </mesh>
  )
  // 앞머리 — 이마 앞쪽 '호(arc)'에만 얹는다.
  // (예전엔 360° 반구를 앞으로 당겨서 얼굴 전체를 덮어버렸다)
  const bangs = (
    <mesh material={mat} castShadow>
      <sphereGeometry
        args={[R * 1.035, 28, 20,
          Math.PI / 2 - Math.PI * 0.5, Math.PI * 1.0,  // 앞쪽 180°만
          0, Math.PI * 0.34]}                          // 정수리~이마까지만
      />
    </mesh>
  )

  if (simple) return <group>{cap(R * 1.02, 0.4)}{back(0.46)}</group>

  switch (style) {
    case 'buzz':
      return <group>{cap(R * 1.02, 0.36)}{back(0.42)}</group>
    case 'short':
      return (
        <group>
          {cap()}{back(0.5)}
          {bangs}
          <mesh position={[0, -0.02, -R * 0.55]} scale={[1, 0.8, 0.7]} material={mat}>
            <sphereGeometry args={[R * 0.72, 16, 12]} />
          </mesh>
        </group>
      )
    case 'bob':
      return (
        <group>
          {cap()}{back(0.68)}
          {bangs}
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
          {cap()}{back(0.68)}
          {bangs}
          <mesh position={[0, -0.34, -R * 0.46]} scale={[1.05, 1.6, 0.8]} material={mat} castShadow>
            <sphereGeometry args={[R * 0.88, 20, 16]} />
          </mesh>
          {[-1, 1].map((s) => (
            <mesh key={s} position={[s * R * 0.86, -0.26, 0.03]} scale={[0.5, 1.75, 0.85]} material={mat} castShadow>
              <sphereGeometry args={[R * 0.46, 14, 12]} />
            </mesh>
          ))}
        </group>
      )
    case 'ponytail':
      return (
        <group>
          {cap()}{back(0.5)}
          {bangs}
          <mesh position={[0, 0.04, -R * 0.95]} material={mat} castShadow>
            <sphereGeometry args={[0.1, 14, 12]} />
          </mesh>
          <mesh position={[0, -0.2, -R * 1.1]} rotation={[0.4, 0, 0]} material={mat} castShadow>
            <capsuleGeometry args={[0.085, 0.36, 6, 14]} />
          </mesh>
          <mesh position={[0, -0.4, -R * 1.22]} rotation={[0.55, 0, 0]} material={mat} castShadow>
            <coneGeometry args={[0.07, 0.16, 10]} />
          </mesh>
        </group>
      )
    case 'twintail':
      return (
        <group>
          {cap()}{back(0.5)}
          {bangs}
          {[-1, 1].map((s) => (
            <group key={s} position={[s * R * 0.95, 0.07, -0.06]}>
              <mesh material={mat} castShadow>
                <sphereGeometry args={[0.085, 12, 10]} />
              </mesh>
              <mesh position={[s * 0.075, -0.25, -0.02]} rotation={[0.12, 0, s * 0.42]} material={mat} castShadow>
                <capsuleGeometry args={[0.072, 0.32, 6, 12]} />
              </mesh>
            </group>
          ))}
        </group>
      )
    case 'bun':
      return (
        <group>
          {cap()}{back(0.5)}
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
          {cap(R * 1.02, 0.38)}{back(0.44)}
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
      return (
        <group>
          {cap()}{back(0.72)}
          {bangs}
          {[-1, 1].map((s) =>
            [0, 1, 2].map((i) => (
              <mesh
                key={`${s}${i}`}
                position={[s * R * (0.86 - i * 0.05), -0.12 - i * 0.16, -0.04 + (i % 2) * 0.07]}
                material={mat}
                castShadow
              >
                <sphereGeometry args={[R * 0.37, 14, 12]} />
              </mesh>
            ))
          )}
        </group>
      )
    case 'mohawk':
      return (
        <group>
          {cap(R * 1.0, 0.34)}{back(0.4)}
          {[...Array(6)].map((_, i) => (
            <mesh key={i} position={[0, R * 0.8, -0.2 + i * 0.085]} material={mat} castShadow>
              <coneGeometry args={[0.055, 0.3 - Math.abs(i - 2.5) * 0.05, 6]} />
            </mesh>
          ))}
        </group>
      )
    default:
      return <group>{cap()}{back(0.5)}{bangs}</group>
  }
}

// -----------------------------------------------------------------------------------
// 액세서리
// -----------------------------------------------------------------------------------
function Accessory({ id, color = '#ef4444' }) {
  const mat = useMemo(() => charMaterial({ color, roughness: 0.7 }), [color])
  const glass = useMemo(
    () => charMaterial({ color, roughness: 0.1, metalness: 0.3, transparent: true, opacity: 0.5, rimIntensity: 0.7, envMapIntensity: 2 }),
    [color]
  )
  if (!id || id === 'none') return null
  if (id === 'headband')
    return (
      <mesh position={[0, 0.15, 0.02]} rotation={[Math.PI / 2, 0, 0]} material={mat} castShadow>
        <torusGeometry args={[0.335, 0.03, 10, 26]} />
      </mesh>
    )
  if (id === 'cap')
    return (
      <group position={[0, 0.11, 0]}>
        <mesh material={mat} castShadow>
          <sphereGeometry args={[0.355, 22, 16, 0, Math.PI * 2, 0, Math.PI * 0.5]} />
        </mesh>
        <mesh position={[0, 0.0, 0.27]} rotation={[-0.12, 0, 0]} scale={[1.15, 0.14, 1]} material={mat} castShadow>
          <sphereGeometry args={[0.24, 16, 10, 0, Math.PI, 0, Math.PI]} />
        </mesh>
        <mesh position={[0, 0.35, 0]} material={mat}>
          <sphereGeometry args={[0.035, 8, 8]} />
        </mesh>
      </group>
    )
  if (id === 'glasses')
    return (
      <group position={[0, 0.045, 0.255]}>
        <mesh scale={[1, 0.44, 0.34]} material={glass}>
          <sphereGeometry args={[0.205, 18, 14, 0, Math.PI * 2, 0, Math.PI]} />
        </mesh>
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
  const bottomMat = useMemo(() => clothMaterial(look.bottom), [look.bottom])
  const shoeMat = useMemo(() => glossMaterial(look.shoes), [look.shoes])
  const soleMat = useMemo(() => charMaterial({ color: '#f4f4f5', roughness: 0.8 }), [])
  const whiteMat = useMemo(() => clothMaterial('#ffffff'), [])
  const browMat = useMemo(() => charMaterial({ color: look.hairColor, roughness: 0.7 }), [look.hairColor])
  const mouthMat = useMemo(() => charMaterial({ color: '#8d4a4f', roughness: 0.5 }), [])
  const blushMat = useMemo(
    () => new THREE.MeshBasicMaterial({ color: '#ff93a3', transparent: true, opacity: 0.42 }),
    []
  )
  const torsoGeo = useMemo(() => torsoGeometry(female), [female])

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime + phase
    if (!body.current) return

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

    if (anim === 'walk') {
      const w = t * 8.6
      const s = Math.sin(w)
      if (legL.current) legL.current.rotation.x = s * 0.66
      if (legR.current) legR.current.rotation.x = -s * 0.66
      // 무릎은 뒤로 갈 때만 접힌다
      if (calfL.current) calfL.current.rotation.x = Math.max(0, -s) * 0.85
      if (calfR.current) calfR.current.rotation.x = Math.max(0, s) * 0.85
      if (armL.current) armL.current.rotation.x = -s * 0.52
      if (armR.current) armR.current.rotation.x = s * 0.26 - 0.16
      if (foreL.current) foreL.current.rotation.x = -0.25 - Math.max(0, s) * 0.4
      if (foreR.current) foreR.current.rotation.x = -0.3
      body.current.position.y = Math.abs(Math.sin(w)) * 0.05
      body.current.rotation.z = Math.sin(w) * 0.035
      body.current.rotation.y = Math.sin(w) * 0.07
      if (head.current) {
        head.current.rotation.y = 0
        head.current.rotation.z = -Math.sin(w) * 0.05
        head.current.rotation.x = 0
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
      if (armL.current) { armL.current.rotation.x = Math.sin(w) * 0.07 + fidget; armL.current.rotation.z = 0.07 }
      if (armR.current) { armR.current.rotation.x = -Math.sin(w) * 0.07 - 0.1; armR.current.rotation.z = -0.07 }
      if (foreL.current) foreL.current.rotation.x = -0.22
      if (foreR.current) foreR.current.rotation.x = -0.3

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
    <group key={s} ref={legRef} position={[s * 0.115, 0.48, 0]}>
      {/* 허벅지 */}
      <mesh position={[0, -0.1, 0]} material={bottomMat} castShadow>
        <capsuleGeometry args={[0.086, 0.11, 6, 14]} />
      </mesh>
      {/* 무릎 */}
      <mesh position={[0, -0.2, 0]} material={bottomMat}>
        <sphereGeometry args={[0.084, 14, 12]} />
      </mesh>
      <group ref={calfRef} position={[0, -0.2, 0]}>
        {/* 종아리 */}
        <mesh position={[0, -0.1, 0]} material={female ? skinMat : bottomMat} castShadow>
          <capsuleGeometry args={[0.075, 0.1, 6, 14]} />
        </mesh>
        {/* 신발 */}
        <group position={[0, -0.2, 0]}>
          <mesh position={[0, -0.025, 0.035]} material={soleMat} castShadow>
            <boxGeometry args={[0.155, 0.045, 0.26]} />
          </mesh>
          <mesh position={[0, 0.025, 0.02]} scale={[1, 0.95, 1.25]} material={shoeMat} castShadow>
            <sphereGeometry args={[0.078, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.62]} />
          </mesh>
          {!simple && (
            <mesh position={[0, 0.035, 0.075]} material={whiteMat}>
              <boxGeometry args={[0.09, 0.02, 0.05]} />
            </mesh>
          )}
        </group>
      </group>
    </group>
  )

  const armPart = (s, armRef, foreRef) => {
    const sleeveless = look.outfit === 'sleeveless'
    return (
      <group key={s} ref={armRef} position={[s * (female ? 0.205 : 0.222), 0.9, 0]}>
        {/* 어깨 */}
        <mesh material={sleeveless ? skinMat : topMat} castShadow>
          <sphereGeometry args={[0.082, 14, 12]} />
        </mesh>
        {/* 위팔 */}
        <mesh position={[0, -0.09, 0]} material={sleeveless ? skinMat : topMat} castShadow>
          <capsuleGeometry args={[0.069, 0.09, 6, 12]} />
        </mesh>
        {/* 팔꿈치 */}
        <mesh position={[0, -0.175, 0]} material={skinMat}>
          <sphereGeometry args={[0.064, 12, 10]} />
        </mesh>
        <group ref={foreRef} position={[0, -0.175, 0]}>
          <mesh position={[0, -0.08, 0]} material={skinMat} castShadow>
            <capsuleGeometry args={[0.058, 0.09, 6, 12]} />
          </mesh>
          {look.acc === 'wristband' && !simple && (
            <mesh position={[0, -0.145, 0]} material={topMat}>
              <cylinderGeometry args={[0.068, 0.068, 0.045, 12]} />
            </mesh>
          )}
          {/* 손 */}
          <mesh position={[0, -0.185, 0]} scale={[1, 1.12, 0.78]} material={skinMat} castShadow>
            <sphereGeometry args={[0.072, 14, 12]} />
          </mesh>
          {/* 오른손에 라켓 */}
          {s > 0 && (
            <group position={[0, -0.205, 0.015]} rotation={[-0.42, 0, -0.2]}>
              <Racket racket={look.racket} simple={simple} />
            </group>
          )}
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

        {/* 치마 */}
        {female && (
          <mesh position={[0, 0.47, 0]} material={bottomMat} castShadow>
            <cylinderGeometry args={[0.175, 0.3, 0.19, 20, 1, true]} />
          </mesh>
        )}

        {/* 몸통 */}
        <mesh geometry={torsoGeo} position={[0, 0.46, 0]} scale={[1, 1, 0.82]} material={topMat} castShadow receiveShadow />

        {/* 의상 디테일 */}
        {!simple && look.outfit === 'stripe' &&
          [0.6, 0.72, 0.84].map((y) => (
            <mesh key={y} position={[0, y, 0]} scale={[1, 1, 0.82]} material={whiteMat}>
              <cylinderGeometry args={[0.219, 0.219, 0.042, 24, 1, true]} />
            </mesh>
          ))}
        {!simple && look.outfit === 'raglan' && (
          <mesh position={[0, 0.94, 0]} scale={[1, 1, 0.82]} material={whiteMat}>
            <cylinderGeometry args={[0.155, 0.175, 0.05, 20, 1, true]} />
          </mesh>
        )}
        {!simple && look.outfit === 'zipup' && (
          <mesh position={[0, 0.7, 0.175]} material={charMaterial({ color: '#e5e7eb', roughness: 0.4, metalness: 0.5 })}>
            <boxGeometry args={[0.026, 0.4, 0.014]} />
          </mesh>
        )}

        {armPart(-1, armL, foreL)}
        {armPart(1, armR, foreR)}

        {/* 목 */}
        <mesh position={[0, 1.0, 0]} material={skinMat}>
          <cylinderGeometry args={[0.082, 0.095, 0.09, 14]} />
        </mesh>

        {/* 머리 */}
        <group ref={head} position={[0, 1.24, 0]}>
          {/* 두개골 */}
          <mesh scale={[1, 1.02, 0.97]} material={skinMat} castShadow>
            <sphereGeometry args={[0.34, 30, 24]} />
          </mesh>
          {/* 턱 — 살짝 갸름하게 */}
          {!simple && (
            <mesh position={[0, -0.15, 0.035]} scale={[0.88, 0.68, 0.92]} material={skinMat}>
              <sphereGeometry args={[0.24, 20, 16]} />
            </mesh>
          )}
          {/* 귀 */}
          {!simple && [-1, 1].map((s) => (
            <mesh key={s} position={[s * 0.325, -0.01, -0.01]} scale={[0.45, 1, 0.7]} material={skinMat}>
              <sphereGeometry args={[0.075, 12, 10]} />
            </mesh>
          ))}

          <group ref={hairRef}>
            <Hair style={look.hair} color={look.hairColor} simple={simple} />
          </group>

          {/* 얼굴 — 눈·눈썹·입·볼터치가 전부 이 그림 한 장에 들어있다 */}
          {simple ? (
            <>
              <Eye side={-1} style={look.eyes} blinkRef={eyeL} simple />
              <Eye side={1} style={look.eyes} blinkRef={eyeR} simple />
            </>
          ) : (
            <Face look={look} R={0.34} blinkRef={faceRef} />
          )}

          {!simple && <Accessory id={look.acc} color={look.top} />}
        </group>
      </group>

      {showTag && <NameTag name={name} level={level} isMe={isMe} y={2.2 / h} />}
    </group>
  )
}
