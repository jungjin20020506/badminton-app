// ===================================================================================
// 캐릭터 — 프리미티브만으로 만든 3D 치비(동물의 숲 느낌) 배드민턴 선수
// 머리스타일/헤어컬러/피부톤/눈매/의상/라켓 색이 전부 프롭으로 갈린다.
// ===================================================================================
import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { RoundedBox } from '@react-three/drei'
import * as THREE from 'three'
import { SKIN_TONES, LEVEL_COLOR } from '../game/constants.js'

const skinOf = (id) => SKIN_TONES.find((s) => s.id === id)?.color || '#fdd0ae'

// -----------------------------------------------------------------------------------
// 이름표 — 캔버스로 그려 스프라이트로 붙인다 (한글 그대로 나오고 가볍다)
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

export function NameTag({ name, level, isMe, y = 1.95 }) {
  const tex = useMemo(() => nameTexture(name, level, isMe), [name, level, isMe])
  return (
    <sprite position={[0, y, 0]} scale={[1.5, 0.4, 1]}>
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
  g.strokeStyle = 'rgba(255,255,255,0.92)'
  g.lineWidth = 2.2
  for (let i = 10; i < 128; i += 11) {
    g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 128); g.stroke()
    g.beginPath(); g.moveTo(0, i); g.lineTo(128, i); g.stroke()
  }
  stringTex = new THREE.CanvasTexture(c)
  return stringTex
}

export function Racket({ racket = {}, scale = 1, simple = false }) {
  const { frame = '#ef4444', string = '#ffffff', grip = '#1f2937', model = 'classic' } = racket
  const tex = useMemo(() => (simple ? null : getStringTexture()), [simple])
  const headY = model === 'power' ? 0.5 : 0.47
  const headR = model === 'power' ? 0.145 : model === 'speed' ? 0.12 : 0.13
  return (
    <group scale={scale}>
      {/* 그립 */}
      <mesh position={[0, 0.09, 0]} castShadow>
        <cylinderGeometry args={[0.038, 0.042, 0.19, 10]} />
        <meshStandardMaterial color={grip} roughness={0.9} />
      </mesh>
      {/* 샤프트 */}
      <mesh position={[0, 0.27, 0]}>
        <cylinderGeometry args={[0.016, 0.02, 0.19, 8]} />
        <meshStandardMaterial color={frame} roughness={0.5} metalness={0.2} />
      </mesh>
      {/* 프레임 */}
      <mesh position={[0, headY, 0]} scale={[1, 1.18, 1]}>
        <torusGeometry args={[headR, 0.016, 8, 28]} />
        <meshStandardMaterial color={frame} roughness={0.4} metalness={0.25} />
      </mesh>
      {/* 스트링 */}
      {!simple && (
        <mesh position={[0, headY, 0]} scale={[1, 1.18, 1]}>
          <circleGeometry args={[headR - 0.006, 24]} />
          <meshBasicMaterial map={tex} color={string} transparent opacity={0.75} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
      )}
    </group>
  )
}

// -----------------------------------------------------------------------------------
// 머리스타일
// -----------------------------------------------------------------------------------
function Hair({ style, color, R = 0.33 }) {
  const mat = <meshStandardMaterial color={color} roughness={0.75} />
  const cap = (r = R * 1.04, cut = 0.56) => (
    <mesh position={[0, 0, 0]} castShadow>
      <sphereGeometry args={[r, 24, 18, 0, Math.PI * 2, 0, Math.PI * cut]} />
      {mat}
    </mesh>
  )
  switch (style) {
    case 'buzz':
      return <group>{cap(R * 1.01, 0.5)}</group>
    case 'short':
      return (
        <group>
          {cap(R * 1.05, 0.62)}
          <mesh position={[0, 0.05, 0.3]} rotation={[0.3, 0, 0]}>
            <boxGeometry args={[0.34, 0.1, 0.06]} />
            {mat}
          </mesh>
        </group>
      )
    case 'bob':
      return (
        <group>
          {cap(R * 1.06, 0.66)}
          {[-1, 1].map((s) => (
            <mesh key={s} position={[s * R * 0.92, -0.14, 0.02]} scale={[0.55, 1.25, 0.9]} castShadow>
              <sphereGeometry args={[R * 0.5, 16, 12]} />
              {mat}
            </mesh>
          ))}
          <mesh position={[0, -0.08, -R * 0.72]} scale={[1.1, 1.1, 0.7]}>
            <sphereGeometry args={[R * 0.6, 16, 12]} />
            {mat}
          </mesh>
        </group>
      )
    case 'long':
      return (
        <group>
          {cap(R * 1.06, 0.66)}
          <mesh position={[0, -0.3, -R * 0.5]} scale={[1, 1.5, 0.75]} castShadow>
            <sphereGeometry args={[R * 0.85, 18, 14]} />
            {mat}
          </mesh>
          {[-1, 1].map((s) => (
            <mesh key={s} position={[s * R * 0.88, -0.24, 0.04]} scale={[0.5, 1.7, 0.8]}>
              <sphereGeometry args={[R * 0.45, 14, 12]} />
              {mat}
            </mesh>
          ))}
        </group>
      )
    case 'ponytail':
      return (
        <group>
          {cap(R * 1.05, 0.6)}
          <mesh position={[0, 0.02, -R * 0.98]} castShadow>
            <sphereGeometry args={[0.1, 14, 12]} />
            {mat}
          </mesh>
          <mesh position={[0, -0.2, -R * 1.12]} rotation={[0.42, 0, 0]} castShadow>
            <capsuleGeometry args={[0.085, 0.34, 4, 12]} />
            {mat}
          </mesh>
        </group>
      )
    case 'twintail':
      return (
        <group>
          {cap(R * 1.05, 0.62)}
          {[-1, 1].map((s) => (
            <group key={s} position={[s * R * 0.96, 0.06, -0.06]}>
              <mesh castShadow>
                <sphereGeometry args={[0.085, 12, 10]} />
                {mat}
              </mesh>
              <mesh position={[s * 0.07, -0.24, -0.02]} rotation={[0.15, 0, s * 0.4]} castShadow>
                <capsuleGeometry args={[0.075, 0.3, 4, 10]} />
                {mat}
              </mesh>
            </group>
          ))}
        </group>
      )
    case 'bun':
      return (
        <group>
          {cap(R * 1.05, 0.62)}
          <mesh position={[0, R * 0.72, -R * 0.55]} castShadow>
            <sphereGeometry args={[0.15, 16, 14]} />
            {mat}
          </mesh>
        </group>
      )
    case 'spiky':
      return (
        <group>
          {cap(R * 1.02, 0.55)}
          {[...Array(7)].map((_, i) => {
            const a = (i / 7) * Math.PI * 2
            return (
              <mesh
                key={i}
                position={[Math.cos(a) * R * 0.55, R * 0.72, Math.sin(a) * R * 0.55]}
                rotation={[Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5]}
                castShadow
              >
                <coneGeometry args={[0.07, 0.2, 6]} />
                {mat}
              </mesh>
            )
          })}
        </group>
      )
    case 'wave':
      return (
        <group>
          {cap(R * 1.07, 0.66)}
          {[-1, 1].map((s) =>
            [0, 1, 2].map((i) => (
              <mesh key={`${s}${i}`} position={[s * R * (0.85 - i * 0.06), -0.1 - i * 0.15, -0.05 + (i % 2) * 0.08]} castShadow>
                <sphereGeometry args={[R * 0.36, 12, 10]} />
                {mat}
              </mesh>
            ))
          )}
        </group>
      )
    case 'mohawk':
      return (
        <group>
          {cap(R * 1.0, 0.48)}
          {[...Array(5)].map((_, i) => (
            <mesh key={i} position={[0, R * 0.78 + (i === 2 ? 0.04 : 0), -0.18 + i * 0.09]} castShadow>
              <coneGeometry args={[0.06, 0.26 - Math.abs(i - 2) * 0.04, 5]} />
              {mat}
            </mesh>
          ))}
        </group>
      )
    default:
      return <group>{cap()}</group>
  }
}

// -----------------------------------------------------------------------------------
// 눈매
// -----------------------------------------------------------------------------------
function Eyes({ style }) {
  const dark = '#241c1a'
  const eye = (s) => {
    const x = s * 0.125
    switch (style) {
      case 'dot':
        return (
          <mesh key={s} position={[x, 0.035, 0.305]} scale={[1, 1.15, 0.5]}>
            <sphereGeometry args={[0.037, 12, 10]} />
            <meshStandardMaterial color={dark} roughness={0.4} />
          </mesh>
        )
      case 'happy':
        return (
          <mesh key={s} position={[x, 0.045, 0.305]} rotation={[0, 0, Math.PI]} scale={[1, 1, 0.5]}>
            <torusGeometry args={[0.05, 0.014, 6, 12, Math.PI]} />
            <meshStandardMaterial color={dark} roughness={0.4} />
          </mesh>
        )
      case 'sharp':
        return (
          <mesh key={s} position={[x, 0.045, 0.305]} rotation={[0, 0, -s * 0.32]}>
            <boxGeometry args={[0.09, 0.028, 0.02]} />
            <meshStandardMaterial color={dark} roughness={0.4} />
          </mesh>
        )
      case 'sleepy':
        return (
          <mesh key={s} position={[x, 0.035, 0.305]}>
            <boxGeometry args={[0.085, 0.02, 0.02]} />
            <meshStandardMaterial color={dark} roughness={0.4} />
          </mesh>
        )
      case 'sparkle':
        return (
          <group key={s}>
            <mesh position={[x, 0.04, 0.3]} scale={[0.85, 1.25, 0.5]}>
              <sphereGeometry args={[0.055, 14, 12]} />
              <meshStandardMaterial color={dark} roughness={0.25} />
            </mesh>
            <mesh position={[x + s * 0.018, 0.07, 0.33]}>
              <sphereGeometry args={[0.019, 8, 8]} />
              <meshBasicMaterial color="#ffffff" />
            </mesh>
            <mesh position={[x - s * 0.02, 0.015, 0.33]}>
              <sphereGeometry args={[0.011, 8, 8]} />
              <meshBasicMaterial color="#ffffff" />
            </mesh>
          </group>
        )
      default: // oval
        return (
          <group key={s}>
            <mesh position={[x, 0.04, 0.3]} scale={[0.8, 1.3, 0.5]}>
              <sphereGeometry args={[0.05, 14, 12]} />
              <meshStandardMaterial color={dark} roughness={0.3} />
            </mesh>
            <mesh position={[x + s * 0.015, 0.068, 0.325]}>
              <sphereGeometry args={[0.016, 8, 8]} />
              <meshBasicMaterial color="#ffffff" />
            </mesh>
          </group>
        )
    }
  }
  return <group>{[-1, 1].map(eye)}</group>
}

// -----------------------------------------------------------------------------------
// 액세서리
// -----------------------------------------------------------------------------------
function Accessory({ id, color = '#ef4444' }) {
  if (!id || id === 'none') return null
  if (id === 'headband')
    return (
      <mesh position={[0, 0.14, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.33, 0.032, 8, 24]} />
        <meshStandardMaterial color={color} roughness={0.7} />
      </mesh>
    )
  if (id === 'cap')
    return (
      <group position={[0, 0.1, 0]}>
        <mesh castShadow>
          <sphereGeometry args={[0.35, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.5]} />
          <meshStandardMaterial color={color} roughness={0.7} />
        </mesh>
        <mesh position={[0, -0.01, 0.28]} rotation={[-0.1, 0, 0]} scale={[1, 0.16, 1]}>
          <cylinderGeometry args={[0.22, 0.22, 0.1, 16, 1, false, Math.PI * 0.9, Math.PI * 1.2]} />
          <meshStandardMaterial color={color} roughness={0.7} />
        </mesh>
      </group>
    )
  if (id === 'glasses')
    return (
      <group position={[0, 0.045, 0.29]}>
        <mesh scale={[1, 0.42, 0.3]}>
          <sphereGeometry args={[0.2, 16, 12, 0, Math.PI * 2, 0, Math.PI]} />
          <meshStandardMaterial color={color} transparent opacity={0.55} roughness={0.15} metalness={0.3} />
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
  const body = useRef()
  const legL = useRef()
  const legR = useRef()
  const armL = useRef()
  const armR = useRef()
  const head = useRef()
  const root = useRef()

  const skin = skinOf(look.skin)
  const female = gender === '여'
  const h = look.height ?? 1
  const phase = (seed % 100) * 0.37

  useFrame((state) => {
    const t = state.clock.elapsedTime + phase
    if (!body.current) return

    if (anim === 'walk') {
      const w = t * 8.5
      const s = Math.sin(w)
      if (legL.current) legL.current.rotation.x = s * 0.62
      if (legR.current) legR.current.rotation.x = -s * 0.62
      if (armL.current) armL.current.rotation.x = -s * 0.5
      if (armR.current) armR.current.rotation.x = s * 0.22 - 0.15
      body.current.position.y = Math.abs(Math.sin(w)) * 0.045
      body.current.rotation.z = Math.sin(w) * 0.035
      if (head.current) head.current.rotation.z = Math.sin(w) * 0.05
    } else if (anim === 'play') {
      const w = t * 3.2
      const swing = Math.max(0, Math.sin(t * 2.1))
      if (legL.current) legL.current.rotation.x = Math.sin(w * 2) * 0.2
      if (legR.current) legR.current.rotation.x = -Math.sin(w * 2) * 0.2
      if (armR.current) armR.current.rotation.x = -0.5 - swing * 2.1
      if (armR.current) armR.current.rotation.z = -swing * 0.5
      if (armL.current) armL.current.rotation.x = -0.3 + Math.sin(w) * 0.3
      body.current.position.y = Math.abs(Math.sin(w * 2)) * 0.07
      body.current.rotation.y = Math.sin(w) * 0.18
      if (head.current) head.current.rotation.x = -0.12 - swing * 0.15
    } else if (anim === 'cheer') {
      const w = t * 4
      if (armL.current) armL.current.rotation.x = -2.4 + Math.sin(w) * 0.25
      if (armR.current) armR.current.rotation.x = -2.4 - Math.sin(w) * 0.25
      body.current.position.y = Math.abs(Math.sin(w)) * 0.12
      if (legL.current) legL.current.rotation.x = 0
      if (legR.current) legR.current.rotation.x = 0
    } else {
      // idle — 자연스러운 숨쉬기 + 가끔 몸 흔들기
      const w = t * 1.6
      const fidget = Math.sin(t * 0.55 + phase) > 0.93 ? Math.sin(t * 12) * 0.25 : 0
      body.current.position.y = Math.sin(w) * 0.022
      body.current.rotation.z = Math.sin(w * 0.5) * 0.02
      body.current.rotation.y = 0
      if (legL.current) legL.current.rotation.x = 0
      if (legR.current) legR.current.rotation.x = 0
      if (armL.current) armL.current.rotation.x = Math.sin(w) * 0.08 + fidget
      if (armR.current) armR.current.rotation.x = -Math.sin(w) * 0.08 - 0.12
      if (head.current) {
        head.current.rotation.y = Math.sin(t * 0.4 + phase) * 0.35
        head.current.rotation.z = Math.sin(w * 0.6) * 0.04
      }
    }
  })

  const bodyColor = look.top
  const legColor = look.bottom

  return (
    <group ref={root} scale={h} onClick={onClick} onPointerOver={(e) => (e.stopPropagation(), (document.body.style.cursor = 'pointer'))} onPointerOut={() => (document.body.style.cursor = 'auto')}>
      {/* 발밑 그림자 (가벼운 가짜 그림자) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.015, 0]}>
        <circleGeometry args={[0.34, 18]} />
        <meshBasicMaterial color="#1b3a24" transparent opacity={0.22} depthWrite={false} />
      </mesh>

      <group ref={body}>
        {/* 다리 */}
        {[-1, 1].map((s) => (
          <group key={s} ref={s < 0 ? legL : legR} position={[s * 0.11, 0.42, 0]}>
            <mesh position={[0, -0.17, 0]} castShadow>
              <capsuleGeometry args={[0.085, 0.2, 4, 10]} />
              <meshStandardMaterial color={legColor} roughness={0.9} />
            </mesh>
            <mesh position={[0, -0.36, 0.03]} castShadow>
              <boxGeometry args={[0.16, 0.1, 0.24]} />
              <meshStandardMaterial color={look.shoes} roughness={0.8} />
            </mesh>
          </group>
        ))}

        {/* 치마 (여성 캐릭터) */}
        {female && (
          <mesh position={[0, 0.44, 0]} castShadow>
            <cylinderGeometry args={[0.18, 0.31, 0.2, 16, 1, true]} />
            <meshStandardMaterial color={legColor} roughness={0.9} side={THREE.DoubleSide} />
          </mesh>
        )}

        {/* 몸통 */}
        <RoundedBox
          args={[female ? 0.42 : 0.46, 0.44, 0.3]}
          radius={0.12}
          smoothness={4}
          position={[0, 0.63, 0]}
          castShadow
        >
          <meshStandardMaterial color={bodyColor} roughness={0.85} />
        </RoundedBox>

        {/* 의상 디테일 */}
        {!simple && look.outfit === 'stripe' && (
          <>
            {[0.55, 0.66, 0.77].map((y) => (
              <mesh key={y} position={[0, y, 0.155]}>
                <boxGeometry args={[female ? 0.4 : 0.44, 0.045, 0.01]} />
                <meshStandardMaterial color="#ffffff" roughness={0.8} />
              </mesh>
            ))}
          </>
        )}
        {!simple && look.outfit === 'raglan' && (
          <mesh position={[0, 0.79, 0]}>
            <cylinderGeometry args={[0.155, 0.155, 0.06, 14]} />
            <meshStandardMaterial color="#ffffff" roughness={0.8} />
          </mesh>
        )}
        {!simple && look.outfit === 'zipup' && (
          <mesh position={[0, 0.63, 0.152]}>
            <boxGeometry args={[0.03, 0.42, 0.012]} />
            <meshStandardMaterial color="#e5e7eb" roughness={0.5} metalness={0.4} />
          </mesh>
        )}

        {/* 팔 */}
        {[-1, 1].map((s) => {
          const sleeveless = look.outfit === 'sleeveless'
          return (
            <group key={s} ref={s < 0 ? armL : armR} position={[s * (female ? 0.25 : 0.27), 0.78, 0]}>
              {!sleeveless && (
                <mesh position={[0, -0.08, 0]} castShadow>
                  <capsuleGeometry args={[0.075, 0.08, 4, 8]} />
                  <meshStandardMaterial color={bodyColor} roughness={0.85} />
                </mesh>
              )}
              <mesh position={[0, -0.21, 0]} castShadow>
                <capsuleGeometry args={[0.066, 0.18, 4, 8]} />
                <meshStandardMaterial color={skin} roughness={0.85} />
              </mesh>
              {look.acc === 'wristband' && (
                <mesh position={[0, -0.3, 0]}>
                  <cylinderGeometry args={[0.078, 0.078, 0.05, 10]} />
                  <meshStandardMaterial color={look.top} roughness={0.8} />
                </mesh>
              )}
              {/* 손 */}
              <mesh position={[0, -0.34, 0]} castShadow>
                <sphereGeometry args={[0.078, 12, 10]} />
                <meshStandardMaterial color={skin} roughness={0.85} />
              </mesh>
              {/* 오른손에 라켓 */}
              {s > 0 && (
                <group position={[0, -0.36, 0.02]} rotation={[-0.35, 0, -0.25]}>
                  <Racket racket={look.racket} />
                </group>
              )}
            </group>
          )
        })}

        {/* 머리 */}
        <group ref={head} position={[0, 1.14, 0]}>
          <mesh castShadow>
            <sphereGeometry args={[0.33, 26, 22]} />
            <meshStandardMaterial color={skin} roughness={0.88} />
          </mesh>
          <Hair style={look.hair} color={look.hairColor} />
          <Eyes style={look.eyes} />
          <Accessory id={look.acc} color={look.top} />
          {/* 볼터치 */}
          {[-1, 1].map((s) => (
            <mesh key={s} position={[s * 0.215, -0.055, 0.245]} scale={[1, 0.7, 0.4]}>
              <sphereGeometry args={[0.055, 10, 8]} />
              <meshBasicMaterial color="#ff9aa8" transparent opacity={0.5} />
            </mesh>
          ))}
          {/* 입 */}
          <mesh position={[0, -0.1, 0.305]} scale={[1, 0.55, 0.4]}>
            <sphereGeometry args={[0.035, 10, 8]} />
            <meshStandardMaterial color="#8a4a4a" roughness={0.6} />
          </mesh>
        </group>
      </group>

      {showTag && <NameTag name={name} level={level} isMe={isMe} y={2.05 / h} />}
    </group>
  )
}
