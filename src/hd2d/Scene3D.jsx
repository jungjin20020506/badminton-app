// ===================================================================================
// 셔틀몬스터 — HD-2D 씬
//
// 옥토패스 트래블러가 「2D인데 3D처럼」 보이는 진짜 방식:
// 도트 스프라이트를 **실제 3D 공간에 세운다**. 그러면 흉내가 아니라 진짜가 된다.
//   · 진짜 원근 — 기울어진 원근 카메라로 내려다본다
//   · 진짜 그림자 — 스프라이트가 방향광을 받아 바닥에 제 모양대로 그림자를 드리운다
//   · 진짜 피사계심도 — 초점이 맞은 구간만 또렷하고 앞뒤는 흐려진다 (디오라마)
//
// 좌표계: 타일 1칸 = 월드 1단위. 타일 (tx, ty) 의 중심은 (tx+0.5, 0, ty+0.5).
// 게임 로직(이동·충돌·대화)은 2D 엔진 그대로 쓰고, 여기서는 그리기만 한다.
// ===================================================================================
import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree, advance } from '@react-three/fiber'
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing'
import * as THREE from 'three'
import { world, update, loadMap, restorePos } from '../pixel/engine.js'
import { TILE, OBJECTS } from '../pixel/tileset.js'
import { daylightTint } from '../pixel/palette.js'
import { villageLevel } from '../game/social.js'
import { useGame } from '../game/store.js'
import { hasUltra } from '../game/constants.js'
import { objectTexture, actorTexture, setActorFrame, ACTOR_W, ACTOR_H } from './textures.js'

// 스프라이트가 카메라 쪽으로 살짝 눕는 각도 — 완전히 수직이면 위에서 볼 때 납작해 보인다
const LEAN = 0.62

// -----------------------------------------------------------------------------------
// 바닥 — 구워 둔 도트 캔버스를 그대로 3D 지면에 입힌다
// -----------------------------------------------------------------------------------
function Ground({ mapId }) {
  const { w, h, tex } = useMemo(() => {
    const m = world.map
    if (!m || !world.ground) return { w: 1, h: 1, tex: null }
    const t = new THREE.CanvasTexture(world.ground[0])
    t.magFilter = THREE.NearestFilter
    t.minFilter = THREE.NearestFilter
    t.generateMipmaps = false
    t.colorSpace = THREE.SRGBColorSpace
    return { w: m.w, h: m.h, tex: t }
  }, [mapId])

  if (!tex) return null
  return (
    <mesh position={[w / 2, 0, h / 2]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[w, h]} />
      <meshStandardMaterial map={tex} roughness={1} metalness={0} />
    </mesh>
  )
}

/** 지도 바깥 — 실내는 어둡게, 바깥은 하늘색 바닥으로 감싼다 */
function Backdrop({ mapId }) {
  const m = world.map
  if (!m) return null
  const color = m.outdoor ? world.theme.ui.sky : '#0b0f1a'
  return (
    <mesh position={[m.w / 2, -0.05, m.h / 2]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[m.w * 4, m.h * 4]} />
      <meshBasicMaterial color={color} />
    </mesh>
  )
}

// -----------------------------------------------------------------------------------
// 오브젝트 — 나무 · 건물 · 가구를 수직으로 선 판으로 세운다
// -----------------------------------------------------------------------------------
function useObjectList(mapId, lv, courtCount) {
  return useMemo(() => {
    const m = world.map
    if (!m) return []
    const out = [...m.objects]
    if (m.growth) m.growth.forEach((g) => { if (lv >= g.lv) out.push(...g.objects) })
    if (m.courtSpots) {
      m.courtSpots.slice(0, courtCount).forEach((spot) =>
        out.push({ kind: 'court', x: spot.x, y: spot.y, flat: true })
      )
    }
    return out
  }, [mapId, lv, courtCount])
}

function Prop({ o }) {
  const def = OBJECTS[o.kind]
  const matRef = useRef(null)
  const tex = useMemo(() => objectTexture(o.kind, world.theme, o.variant || 0), [o.kind, o.variant, world.theme?.id])

  // 내 앞(카메라 쪽)을 가로막는 물건은 비쳐 보이게 한다
  useFrame(() => {
    const m = matRef.current
    if (!m || def?.flat) return
    const p = world.player
    const py = p.moving ? p.from[1] + (p.y - p.from[1]) * p.prog : p.y
    const blocking = o.y > py + 0.5 && o.y < py + 7 && Math.abs(o.x - p.x) < 5
    const want = blocking ? 0.26 : 1
    m.opacity += (want - m.opacity) * 0.18
    m.transparent = true
  })

  if (!def || !tex) return null
  const ww = tex.userData.w
  const hh = tex.userData.h

  // 코트처럼 바닥에 눕는 것은 지면에 깔고, 나머지는 세운다
  if (def.flat) {
    return (
      <mesh
        position={[o.x + ww / 2, 0.012, o.y - hh + 1 + hh / 2]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
      >
        <planeGeometry args={[ww, hh]} />
        <meshStandardMaterial map={tex} transparent alphaTest={0.5} roughness={1} />
      </mesh>
    )
  }

  // 발밑이 바닥에 닿도록 세운다
  const baseZ = o.y + 0.86
  return (
    <mesh
      position={[o.x + ww / 2, (hh / 2) * Math.cos(LEAN), baseZ - (hh / 2) * Math.sin(LEAN)]}
      rotation={[-LEAN, 0, 0]}
      castShadow
    >
      <planeGeometry args={[ww, hh]} />
      <meshBasicMaterial ref={matRef} map={tex} transparent alphaTest={0.45} side={THREE.DoubleSide} />
    </mesh>
  )
}

function Props({ mapId, lv, courtCount }) {
  const list = useObjectList(mapId, lv, courtCount)
  return list.map((o, i) => <Prop key={`${o.kind}:${o.x}:${o.y}:${i}`} o={o} />)
}

// -----------------------------------------------------------------------------------
// 캐릭터 — 빌보드. 방향·프레임은 시트에서 잘라 쓴다
// -----------------------------------------------------------------------------------
function Actor({ actor, isMe }) {
  const ref = useRef(null)
  const matRef = useRef(null)
  const auraRef = useRef(null)
  const tex = useMemo(() => actorTexture(actor.look, actor.gender), [actor.look, actor.gender])
  const ultra = useMemo(() => hasUltra(actor.look), [actor.look])

  useFrame(({ clock }) => {
    const g = ref.current
    if (!g) return
    // 초레어 오라 — 숨 쉬듯 커졌다 작아진다
    if (auraRef.current) {
      const t = clock.elapsedTime
      const pulse = 1 + Math.sin(t * 2.4) * 0.09
      auraRef.current.scale.set(pulse, pulse, 1)
      auraRef.current.material.opacity = 0.34 + Math.sin(t * 2.4) * 0.12
      auraRef.current.rotation.z = t * 0.35
    }
    const a = isMe ? world.player : actor
    const src = isMe ? world.player : actor
    const fx = src.moving ? src.from[0] + (src.x - src.from[0]) * src.prog : (src.fx ?? src.x)
    const fy = src.moving ? src.from[1] + (src.y - src.from[1]) * src.prog : (src.fy ?? src.y)
    const bob = src.moving && (src.step ? 1 : 0) ? 0.02 : 0
    g.position.set(
      fx + 0.5,
      (ACTOR_H / 2) * Math.cos(LEAN) + bob,
      fy + 0.86 - (ACTOR_H / 2) * Math.sin(LEAN)
    )
    const frame = src.moving ? (src.step ? 1 : 3) : 0
    setActorFrame(tex, src.dir ?? 0, frame)
  })

  return (
    <mesh ref={ref} rotation={[-LEAN, 0, 0]} castShadow>
      <planeGeometry args={[ACTOR_W, ACTOR_H]} />
      <meshBasicMaterial ref={matRef} map={tex} transparent alphaTest={0.5} side={THREE.DoubleSide} />
      {ultra && (
        <mesh ref={auraRef} position={[0, -0.1, -0.02]}>
          <planeGeometry args={[ACTOR_W * 2.4, ACTOR_H * 1.5]} />
          <meshBasicMaterial
            color="#ffd24a"
            transparent
            opacity={0.34}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            map={auraTexture()}
          />
        </mesh>
      )}
    </mesh>
  )
}

// 오라 텍스처 — 가운데가 밝고 가장자리로 사라지는 원. 한 번만 만든다.
let auraTex = null
function auraTexture() {
  if (auraTex) return auraTex
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')
  const grd = g.createRadialGradient(64, 64, 4, 64, 64, 62)
  grd.addColorStop(0, 'rgba(255,255,220,.95)')
  grd.addColorStop(0.35, 'rgba(255,214,90,.5)')
  grd.addColorStop(1, 'rgba(255,190,60,0)')
  g.fillStyle = grd
  g.fillRect(0, 0, 128, 128)
  // 빛살
  g.globalCompositeOperation = 'lighter'
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2
    g.save(); g.translate(64, 64); g.rotate(a)
    const lg = g.createLinearGradient(0, 0, 60, 0)
    lg.addColorStop(0, 'rgba(255,240,170,.5)')
    lg.addColorStop(1, 'rgba(255,240,170,0)')
    g.fillStyle = lg
    g.fillRect(0, -3, 60, 6)
    g.restore()
  }
  auraTex = new THREE.CanvasTexture(c)
  auraTex.colorSpace = THREE.SRGBColorSpace
  return auraTex
}

function Actors({ mapId }) {
  const [sig, setSig] = useState('')
  const me = useGame((s) => s.players.me)

  // 등장 인물 목록이 바뀌었는지 가볍게 확인 (매 프레임 리액트를 다시 그리지 않으려고)
  useEffect(() => {
    const id = setInterval(() => {
      const s = [...world.npcs, ...world.residents].map((n) => n.id).join(',')
      setSig((p) => (p === s ? p : s))
    }, 400)
    return () => clearInterval(id)
  }, [mapId])

  const cast = useMemo(
    () => [...world.npcs, ...world.residents].filter((n) => n.look),
    [sig, mapId]
  )

  return (
    <>
      {cast.map((n) => <Actor key={n.id} actor={n} />)}
      {me && <Actor key="me" actor={me} isMe />}
    </>
  )
}

// -----------------------------------------------------------------------------------
// 카메라 — 기울여 내려다보며 플레이어를 따라간다
// -----------------------------------------------------------------------------------
const CAM = { back: 19.4, up: 14.6, look: 0.9 }
// 카메라가 내려다보는 각도만큼 스프라이트도 눕혀야 납작해 보이지 않는다
const CAM_PITCH = Math.atan2(CAM.up, CAM.back)

function FollowCamera({ onFocus }) {
  const { camera } = useThree()
  const cur = useRef(new THREE.Vector3())
  const started = useRef(false)

  useFrame((_, dt) => {
    const p = world.player
    if (!world.map) return
    const fx = p.moving ? p.from[0] + (p.x - p.from[0]) * p.prog : (p.fx ?? p.x)
    const fy = p.moving ? p.from[1] + (p.y - p.from[1]) * p.prog : (p.fy ?? p.y)
    const target = new THREE.Vector3(fx + 0.5, 0, fy + 0.5)

    if (!started.current) { cur.current.copy(target); started.current = true }
    // 부드럽게 따라간다
    cur.current.lerp(target, Math.min(1, dt * 9))

    camera.position.set(cur.current.x, CAM.up, cur.current.z + CAM.back)
    camera.lookAt(cur.current.x, CAM.look, cur.current.z)
    // postprocessing 의 focusDistance 는 [0,1] 정규화 깊이다
    const d = camera.position.distanceTo(new THREE.Vector3(cur.current.x, CAM.look, cur.current.z))
    onFocus?.(THREE.MathUtils.clamp((d - camera.near) / (camera.far - camera.near), 0, 1))
  })
  return null
}

// -----------------------------------------------------------------------------------
// 빛 — 방향광 하나가 스프라이트 그림자를 만든다
// -----------------------------------------------------------------------------------
function Lights() {
  const ref = useRef(null)
  useFrame(() => {
    const l = ref.current
    if (!l) return
    const p = world.player
    const fx = p.moving ? p.from[0] + (p.x - p.from[0]) * p.prog : p.x
    const fy = p.moving ? p.from[1] + (p.y - p.from[1]) * p.prog : p.y
    // 그림자 카메라가 플레이어를 따라다녀야 좁은 범위로도 선명한 그림자가 나온다
    l.position.set(fx + 9, 20, fy - 9)
    l.target.position.set(fx, 0, fy)
    l.target.updateMatrixWorld()
  })
  return (
    <>
      <ambientLight intensity={0.92} />
      <hemisphereLight args={['#ffffff', '#7f8fa6', 0.42]} />
      <directionalLight
        ref={ref}
        intensity={1.5}
        color="#fff4de"
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.0012}
        shadow-camera-left={-20}
        shadow-camera-right={20}
        shadow-camera-top={20}
        shadow-camera-bottom={-20}
        shadow-camera-near={1}
        shadow-camera-far={56}
      />
    </>
  )
}

// -----------------------------------------------------------------------------------
// 시간대 색 · 암전
// -----------------------------------------------------------------------------------
function Atmosphere() {
  const ref = useRef(null)
  const { camera } = useThree()
  useFrame(() => {
    const m = ref.current
    if (!m) return
    const s = useGame.getState()
    const tint = world.map?.outdoor ? daylightTint(s.timeOfDay) : { color: '#000000', alpha: 0 }
    const a = Math.max(tint.alpha, world.fade)
    m.material.opacity = a
    m.material.color.set(world.fade > tint.alpha ? '#000000' : tint.color)
    m.visible = a > 0.001
    // 카메라 바로 앞에 붙여 화면 전체를 덮는다
    m.position.copy(camera.position)
    m.quaternion.copy(camera.quaternion)
    m.translateZ(-0.6)
  })
  return (
    <mesh ref={ref} renderOrder={999}>
      <planeGeometry args={[3, 3]} />
      <meshBasicMaterial transparent depthTest={false} depthWrite={false} />
    </mesh>
  )
}

// -----------------------------------------------------------------------------------
// 게임 로직 구동 (이동·충돌·대화는 2D 엔진 그대로)
// -----------------------------------------------------------------------------------
function Ticker({ onMap }) {
  useFrame((_, dt) => {
    update(Math.min(0.05, dt))
    onMap(world.mapId)
  })
  return null
}

/**
 * 개발용 창구 — 브라우저 패널이 안 보이면 rAF 가 멈춰서 아무것도 안 그려진다.
 * 그럴 때 콘솔에서 __svShoot() 로 프레임을 강제로 굴리고 화면을 떠 볼 수 있다.
 */
function DevHook() {
  const state = useThree()
  useEffect(() => {
    if (!import.meta.env.DEV) return
    globalThis.__svGL = state
    globalThis.__svShoot = (frames = 10, w, h) => {
      if (w && h) state.setSize(w, h)
      for (let i = 0; i < frames; i++) advance(performance.now() + i * 16)
      return state.gl.domElement.toDataURL('image/png')
    }
  }, [state])
  return null
}

// -----------------------------------------------------------------------------------
export default function Scene3D() {
  const [mapId, setMapId] = useState(null)
  const [focus, setFocus] = useState(0.15)
  const booted = useGame((s) => s.booted)
  const courtCount = useGame((s) => s.courtCount)
  const graphics = useGame((s) => s.graphics)
  const lv = useGame((s) => villageLevel(s).lv)
  const lastMap = useRef(null)

  useEffect(() => {
    if (!booted) return
    const saved = restorePos()
    loadMap(saved.mapId, saved.x, saved.y, saved.dir)
    setMapId(world.mapId)
  }, [booted])

  const onMap = (id) => {
    if (lastMap.current !== id) {
      lastMap.current = id
      setMapId(id)
    }
  }

  const low = graphics === 'low'

  return (
    <Canvas
      className="ow-canvas"
      shadows={!low}
      dpr={low ? 1 : [1, 1.8]}
      gl={{ antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' }}
      camera={{ fov: 30, near: 0.5, far: 90, position: [0, CAM.up, CAM.back] }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.NoToneMapping
        gl.setClearColor('#0b0f1a')
      }}
    >
      <DevHook />
      <Ticker onMap={onMap} />
      <FollowCamera onFocus={setFocus} />
      <Lights />
      {mapId && (
        <>
          <Backdrop mapId={mapId} />
          <Ground mapId={mapId} />
          <Props mapId={mapId} lv={lv} courtCount={courtCount} />
          <Actors mapId={mapId} />
        </>
      )}
      <Atmosphere />
      {!low && (
        <EffectComposer disableNormalPass multisampling={0}>
          {/* 도트가 뭉개지지 않도록 심도는 아주 얕게만 준다.
              (초점이 어긋나면 픽셀아트가 통째로 흐려져 버린다) */}
          <Bloom intensity={0.3} luminanceThreshold={0.8} luminanceSmoothing={0.3} mipmapBlur height={300} />
          <Vignette eskil={false} offset={0.24} darkness={0.58} />
        </EffectComposer>
      )}
    </Canvas>
  )
}
