// ===================================================================================
// 3D 씬 — 카메라(줌/회전) · 낮밤 조명 · 환경광 · 후처리 · 마을 · 코트 · 선수
// ===================================================================================
import { Suspense, useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, Sky, Stars, Environment, Lightformer, Cloud, AdaptiveDpr } from '@react-three/drei'
import { EffectComposer, Bloom, DepthOfField, Vignette, HueSaturation, SMAA } from '@react-three/postprocessing'
import * as THREE from 'three'
import Village from './Village.jsx'
import Court from './Court.jsx'
import Actors from './Actors.jsx'
import { useGame, gameTick } from '../game/store.js'
import { courtLayout, slotPosition, waitPosition, cameraForCourts, COURT_LEN, COURT_WID } from '../game/layout.js'
import { villageLevel } from '../game/social.js'

/** HUD에서 카메라를 조작할 수 있도록 컨트롤을 밖으로 노출 */
export const cameraApi = {
  controls: null,
  gl: null,
  zoom(delta) {
    const c = this.controls
    if (!c) return
    const cam = c.object
    const dir = new THREE.Vector3().subVectors(cam.position, c.target)
    const len = THREE.MathUtils.clamp(dir.length() * delta, c.minDistance, c.maxDistance)
    dir.setLength(len)
    cam.position.copy(c.target).add(dir)
    c.update()
  },
  moveTo(x, z, dist) {
    const c = this.controls
    if (!c) return
    const cam = c.object
    const d = dist ?? new THREE.Vector3().subVectors(cam.position, c.target).length()
    c.target.set(x, 1, z)
    cam.position.set(x, d * 0.6, z + d * 0.8)
    c.update()
  },
  /** 화면을 이미지로 저장 (마을 사진 찍기) */
  snapshot() {
    const canvas = document.querySelector('.canvas-wrap canvas')
    if (!canvas) return null
    return canvas.toDataURL('image/png')
  },
}

function Clock() {
  useFrame((_, dt) => gameTick(Math.min(dt, 0.05)))
  return null
}

/**
 * 캔버스 크기를 화면 크기에 직접 맞춘다.
 * 모바일 브라우저는 주소창이 나타났다 사라질 때 컨테이너 관측이 늦어 화면이
 * 잘리거나 안 그려지는 일이 있어서, 창 크기를 기준으로 강제로 맞춰 준다.
 */
function ForceSize() {
  const setSize = useThree((s) => s.setSize)
  useEffect(() => {
    const apply = () => setSize(Math.max(1, window.innerWidth), Math.max(1, window.innerHeight))
    apply()
    const t = setTimeout(apply, 60)
    window.addEventListener('resize', apply)
    window.addEventListener('orientationchange', apply)
    window.visualViewport?.addEventListener('resize', apply)
    return () => {
      clearTimeout(t)
      window.removeEventListener('resize', apply)
      window.removeEventListener('orientationchange', apply)
      window.visualViewport?.removeEventListener('resize', apply)
    }
  }, [setSize])
  return null
}

function Lights({ quality }) {
  const t = useGame((s) => s.timeOfDay)
  const night = t < 5.6 || t > 19.4
  const dusk = (t >= 17.4 && t <= 19.4) || (t >= 5.6 && t <= 7.2)

  const angle = ((t - 6) / 12) * Math.PI
  const sun = useMemo(() => [Math.cos(angle) * 55, Math.max(-8, Math.sin(angle) * 62), 28], [angle])

  const ambient = night ? 0.5 : dusk ? 0.8 : 1.15
  const dirI = night ? 0.3 : dusk ? 1.3 : 2.6
  const skyC = night ? '#8ea3d8' : dusk ? '#ffcfa3' : '#dff0ff'
  const groundC = night ? '#28304a' : '#5d8a4a'

  return (
    <>
      <hemisphereLight args={[skyC, groundC, ambient]} />
      <directionalLight
        position={sun}
        intensity={dirI}
        color={night ? '#9fb6ff' : dusk ? '#ffb375' : '#fff4dc'}
        castShadow
        shadow-mapSize={quality === 'low' ? [1024, 1024] : [2560, 2560]}
        shadow-camera-left={-40}
        shadow-camera-right={40}
        shadow-camera-top={40}
        shadow-camera-bottom={-40}
        shadow-camera-far={180}
        shadow-normalBias={0.035}
        shadow-bias={-0.0004}
      />
      {/* 반대쪽에서 살짝 채워 주는 빛 — 그림자가 새까맣게 죽지 않게 */}
      <directionalLight position={[-sun[0], 26, -sun[2]]} intensity={night ? 0.15 : 0.45} color={night ? '#6d7fb8' : '#cfe4ff'} />

      {night ? (
        <>
          <color attach="background" args={['#101a33']} />
          <Stars radius={110} depth={45} count={2600} factor={3.6} fade speed={0.5} />
          <fog attach="fog" args={['#1a2444', 48, 118]} />
        </>
      ) : (
        <>
          <Sky sunPosition={sun} turbidity={dusk ? 9 : 2.6} rayleigh={dusk ? 3.6 : 0.9} mieCoefficient={0.005} mieDirectionalG={0.85} />
          <fog attach="fog" args={[dusk ? '#f7cba6' : '#d6ecff', 62, 132]} />
        </>
      )}

      {/* 절차적 환경광 — 외부 HDR 파일 없이 부드러운 반사광을 만든다 */}
      <Environment resolution={quality === 'low' ? 64 : 128} frames={1}>
        <Lightformer intensity={night ? 0.25 : 1.6} form="ring" scale={12} position={[0, 12, 0]} rotation={[Math.PI / 2, 0, 0]} color={night ? '#5a6ba8' : '#fff2d8'} />
        <Lightformer intensity={night ? 0.12 : 0.7} form="rect" scale={[24, 8, 1]} position={[0, 4, -22]} color={night ? '#2a3358' : '#bfe0ff'} />
        <Lightformer intensity={night ? 0.1 : 0.55} form="rect" scale={[24, 8, 1]} position={[0, 4, 22]} rotation={[0, Math.PI, 0]} color={night ? '#2a3358' : '#cfeacd'} />
      </Environment>
    </>
  )
}

function Clouds({ night }) {
  if (night) return null
  return (
    <group>
      <Cloud position={[-26, 22, -26]} speed={0.12} opacity={0.42} segments={16} bounds={[9, 2, 3]} volume={7} color="#ffffff" />
      <Cloud position={[24, 25, -14]} speed={0.1} opacity={0.34} segments={14} bounds={[8, 2, 3]} volume={6} color="#fefaff" />
      <Cloud position={[6, 27, 26]} speed={0.09} opacity={0.28} segments={12} bounds={[7, 2, 3]} volume={5} color="#ffffff" />
    </group>
  )
}

function Courts() {
  const courts = useGame((s) => s.courts)
  const courtCount = useGame((s) => s.courtCount)
  const skin = useGame((s) => s.courtSkin)
  const speed = useGame((s) => s.gameSpeed)
  const focus = useGame((s) => s.focusCourt)
  const setFocusCourt = useGame((s) => s.setFocusCourt)
  const layout = useMemo(() => courtLayout(courtCount), [courtCount])

  return (
    <group>
      {layout.map((c) => {
        const court = courts[c.id]
        if (!court) return null
        return (
          <Court
            key={c.id}
            court={court}
            x={c.x}
            z={c.z}
            skinId={skin}
            speed={speed}
            focused={focus === c.id}
            onClick={(e) => {
              e?.stopPropagation?.()
              const next = focus === c.id ? null : c.id
              setFocusCourt(next)
              if (next != null) cameraApi.moveTo(c.x, c.z + 3, 15)
            }}
          />
        )
      })}
    </group>
  )
}

/** 카메라 모드: 내 캐릭터 따라가기 */
function CameraRig() {
  const follow = useGame((s) => s.cameraFollow)
  const players = useGame((s) => s.players)
  const order = useGame((s) => s.order)
  const courtCount = useGame((s) => s.courtCount)
  const targetRef = useRef(new THREE.Vector3(0, 1, 2))

  useFrame((_, dt) => {
    if (!follow || !cameraApi.controls) return
    const me = players.me
    if (!me) return
    let pos
    if (me.courtId != null && me.slot != null) {
      const l = courtLayout(courtCount)[me.courtId]
      if (l) pos = slotPosition(l, me.slot)
    }
    if (!pos) {
      const waiting = order.map((id) => players[id]).filter((p) => p && p.status === 'waiting')
      const idx = waiting.findIndex((p) => p.id === 'me')
      pos = waitPosition(Math.max(0, idx))
    }
    targetRef.current.set(pos[0], 1.1, pos[1])
    const c = cameraApi.controls
    c.target.lerp(targetRef.current, Math.min(1, dt * 2.6))
    c.update()
  })
  return null
}

function Fx({ quality }) {
  if (quality === 'low') return null
  return (
    <EffectComposer multisampling={0} enableNormalPass={false}>
      <SMAA />
      <Bloom intensity={0.42} luminanceThreshold={0.78} luminanceSmoothing={0.25} mipmapBlur radius={0.7} />
      {quality === 'high' ? (
        <DepthOfField focusDistance={0.014} focalLength={0.045} bokehScale={3.2} height={480} />
      ) : (
        <></>
      )}
      <HueSaturation saturation={0.14} hue={0} />
      <Vignette eskil={false} offset={0.24} darkness={0.62} />
    </EffectComposer>
  )
}

export default function Scene() {
  const courtCount = useGame((s) => s.courtCount)
  const owned = useGame((s) => s.owned)
  const quality = useGame((s) => s.graphics)
  const timeOfDay = useGame((s) => s.timeOfDay)
  const selectPlayer = useGame((s) => s.selectPlayer)
  const villageLv = useGame((s) => villageLevel(s).lv)
  const trophyCount = useGame((s) => Object.keys(s.achievements).length)
  const initial = useMemo(() => cameraForCourts(courtCount), [])
  const rows = Math.ceil(courtCount / 3)
  const night = timeOfDay < 5.6 || timeOfDay > 19.4

  const courtBoxes = useMemo(
    () => courtLayout(courtCount).map((c) => [c.x, c.z, COURT_WID / 2 + 1.6, COURT_LEN / 2 + 1.6]),
    [courtCount]
  )

  return (
    <Canvas
      shadows="soft"
      dpr={[1, quality === 'high' ? 2 : 1.6]}
      gl={{
        preserveDrawingBuffer: true,
        antialias: false,
        powerPreference: 'high-performance',
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 1.08,
      }}
      camera={{ position: initial, fov: 40, near: 0.5, far: 300 }}
      onPointerMissed={() => selectPlayer(null)}
      onCreated={({ gl }) => {
        cameraApi.gl = gl
        gl.shadowMap.type = THREE.PCFSoftShadowMap
      }}
    >
      <ForceSize />
      <Suspense fallback={null}>
        <Lights quality={quality} />
        <Clouds night={night} />
        <Village owned={owned} courtRows={rows} night={night} quality={quality} courtBoxes={courtBoxes} villageLv={villageLv} trophyCount={trophyCount} />
        <Courts />
        <Actors />
        <Clock />
        <CameraRig />
        <Fx quality={quality} />
        <AdaptiveDpr pixelated={false} />
        <OrbitControls
          makeDefault
          ref={(r) => (cameraApi.controls = r)}
          target={[0, 1, 2]}
          enableDamping
          dampingFactor={0.09}
          minDistance={5}
          maxDistance={70}
          maxPolarAngle={Math.PI * 0.47}
          minPolarAngle={0.12}
          rotateSpeed={0.6}
          zoomSpeed={1.1}
          panSpeed={0.8}
          touches={{ ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN }}
        />
      </Suspense>
    </Canvas>
  )
}
