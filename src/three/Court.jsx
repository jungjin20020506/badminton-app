// ===================================================================================
// 배드민턴 코트 — 라인/네트/전광판/셔틀콕 랠리 연출
// ===================================================================================
import { useMemo, useRef, useState, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { COURT_LEN, COURT_WID } from '../game/layout.js'
import { COURT_SKINS } from '../game/constants.js'

const L = COURT_LEN / 2 // 5
const W = COURT_WID / 2 // 2.4
const LINE_Y = 0.035
const LINE = '#f8fafc'

function Line({ x = 0, z = 0, w, h }) {
  return (
    <mesh position={[x, LINE_Y, z]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[w, h]} />
      <meshStandardMaterial color={LINE} roughness={0.6} />
    </mesh>
  )
}

/** 모서리가 둥근 판 — 잔디에 딱딱한 직사각형이 박히지 않도록 (동물의 숲풍) */
function roundedPad(w, h, r) {
  const s = new THREE.Shape()
  const x = -w / 2
  const y = -h / 2
  s.moveTo(x + r, y)
  s.lineTo(x + w - r, y)
  s.quadraticCurveTo(x + w, y, x + w, y + r)
  s.lineTo(x + w, y + h - r)
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  s.lineTo(x + r, y + h)
  s.quadraticCurveTo(x, y + h, x, y + h - r)
  s.lineTo(x, y + r)
  s.quadraticCurveTo(x, y, x + r, y)
  return new THREE.ShapeGeometry(s, 10)
}

const PAD_W = COURT_WID + 1.6 // 6.4 — 코트 사이 간격(7.2)보다 좁게 둬서 판이 서로 붙지 않는다
const PAD_L = COURT_LEN + 1.6
const TRIM_W = PAD_W + 0.5
const TRIM_L = PAD_L + 0.5
const TRIM_COLOR = '#e7d9ac' // 코트를 감싸는 모랫길

let netTex = null
function getNetTexture() {
  if (netTex) return netTex
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 64
  const g = c.getContext('2d')
  g.clearRect(0, 0, 256, 64)
  g.strokeStyle = 'rgba(240,245,255,0.75)'
  g.lineWidth = 1.4
  for (let i = 0; i <= 256; i += 8) {
    g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 64); g.stroke()
  }
  for (let j = 0; j <= 64; j += 8) {
    g.beginPath(); g.moveTo(0, j); g.lineTo(256, j); g.stroke()
  }
  netTex = new THREE.CanvasTexture(c)
  return netTex
}

function Shuttle({ speed }) {
  const ref = useRef()
  useFrame((state) => {
    if (!ref.current) return
    const t = state.clock.elapsedTime * 1.15 * Math.min(2.2, speed)
    const u = (Math.sin(t) + 1) / 2
    ref.current.position.z = THREE.MathUtils.lerp(3.4, -3.4, u)
    ref.current.position.y = 0.7 + Math.sin(u * Math.PI) * 2.4
    ref.current.position.x = Math.sin(t * 0.63) * 1.35
    ref.current.rotation.x = Math.cos(t) * 0.9
    ref.current.rotation.z = t * 2
  })
  return (
    <group ref={ref}>
      <mesh>
        <sphereGeometry args={[0.06, 10, 8]} />
        <meshStandardMaterial color="#ffffff" roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.11, 0]}>
        <coneGeometry args={[0.1, 0.2, 12, 1, true]} />
        <meshStandardMaterial color="#ffffff" transparent opacity={0.85} side={THREE.DoubleSide} roughness={0.9} />
      </mesh>
    </group>
  )
}

/** 콕스타 경기방 모드에서 쓰는 경과 시간 표시 (MM:SS) */
function CourtTimer({ startTime }) {
  const [txt, setTxt] = useState('00:00')
  useEffect(() => {
    if (!startTime) return setTxt('00:00')
    const tick = () => {
      const sec = Math.max(0, Math.floor((Date.now() - new Date(startTime).getTime()) / 1000))
      setTxt(`${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [startTime])
  return <div className="cb-score" style={{ fontSize: 24 }}>{txt}</div>
}

export default function Court({ court, x, z, skinId, speed = 1, onClick, focused }) {
  const skin = COURT_SKINS.find((s) => s.id === skinId) || COURT_SKINS[0]
  const tex = useMemo(() => getNetTexture(), [])
  const padGeo = useMemo(() => roundedPad(PAD_W, PAD_L, 1.0), [])
  const trimGeo = useMemo(() => roundedPad(TRIM_W, TRIM_L, 1.25), [])
  const playing = court.status === 'playing'

  const shortService = 1.5
  const longService = L - 0.6
  const singleSide = W - 0.36

  return (
    <group position={[x, 0, z]}>
      {/* 잔디 → 코트 사이를 잇는 모랫길 테두리 */}
      <mesh geometry={trimGeo} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.006, 0]} receiveShadow>
        <meshStandardMaterial color={TRIM_COLOR} roughness={1} />
      </mesh>
      {/* 코트 바닥 + 여백 */}
      <mesh geometry={padGeo} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]} receiveShadow onClick={onClick}>
        <meshStandardMaterial color={skin.floor} roughness={0.95} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.022, 0]} receiveShadow>
        <planeGeometry args={[COURT_WID, COURT_LEN]} />
        <meshStandardMaterial color={skin.inner} roughness={0.95} />
      </mesh>

      {/* 라인 */}
      <Line z={L} w={COURT_WID} h={0.07} />
      <Line z={-L} w={COURT_WID} h={0.07} />
      <Line x={W} w={0.07} h={COURT_LEN} />
      <Line x={-W} w={0.07} h={COURT_LEN} />
      <Line x={singleSide} w={0.05} h={COURT_LEN} />
      <Line x={-singleSide} w={0.05} h={COURT_LEN} />
      <Line z={shortService} w={COURT_WID} h={0.05} />
      <Line z={-shortService} w={COURT_WID} h={0.05} />
      <Line z={longService} w={COURT_WID} h={0.05} />
      <Line z={-longService} w={COURT_WID} h={0.05} />
      <mesh position={[0, LINE_Y, (shortService + L) / 2]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.05, L - shortService]} />
        <meshStandardMaterial color={LINE} />
      </mesh>
      <mesh position={[0, LINE_Y, -(shortService + L) / 2]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.05, L - shortService]} />
        <meshStandardMaterial color={LINE} />
      </mesh>

      {/* 네트 */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * (W + 0.12), 0.55, 0]} castShadow>
          <cylinderGeometry args={[0.055, 0.065, 1.1, 10]} />
          <meshStandardMaterial color="#e2e8f0" roughness={0.5} metalness={0.3} />
        </mesh>
      ))}
      <mesh position={[0, 0.72, 0]}>
        <planeGeometry args={[COURT_WID + 0.24, 0.62]} />
        <meshBasicMaterial map={tex} transparent side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <mesh position={[0, 1.05, 0]}>
        <boxGeometry args={[COURT_WID + 0.24, 0.07, 0.02]} />
        <meshStandardMaterial color="#ffffff" roughness={0.7} />
      </mesh>

      {/* 셔틀콕 */}
      {playing && <Shuttle speed={speed} />}

      {/* 코트 번호 자리 표시 — 바닥에 그린 링 (예전엔 회색 물웅덩이처럼 보였다) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, L + 0.55]}>
        <ringGeometry args={[0.34, 0.5, 24]} />
        <meshStandardMaterial color={focused ? '#ffd166' : '#f4f7fb'} roughness={0.8} transparent opacity={0.9} />
      </mesh>

      {/* 전광판 */}
      <Html position={[0, 2.9, 0]} center distanceFactor={17} zIndexRange={[10, 0]}>
        <div className={`court-board ${playing ? 'live' : ''} ${court.status}`} onClick={onClick}>
          <div className="cb-no">{court.id + 1}번 코트</div>
          {playing && (court.remote
            ? <CourtTimer startTime={court.startTime} />
            : (
              <div className="cb-score">
                <span>{court.score[0]}</span>
                <i>:</i>
                <span>{court.score[1]}</span>
              </div>
            )
          )}
          {court.status === 'filling' && <div className="cb-msg">이동 중…</div>}
          {court.status === 'empty' && <div className="cb-msg">비어 있음</div>}
          {court.status === 'done' && court.result && (
            <div className="cb-msg win">
              {court.result.winner === 0
                ? `${court.result.names[0]}·${court.result.names[1]}`
                : `${court.result.names[2]}·${court.result.names[3]}`}{' '}
              승! {court.result.score[0]}:{court.result.score[1]}
            </div>
          )}
        </div>
      </Html>
    </group>
  )
}
