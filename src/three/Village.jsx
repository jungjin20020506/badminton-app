// ===================================================================================
// 마을 — 지형 / 잔디 / 나무 / 클럽하우스 / 연못 / 울타리 / 장식물
// 외부 3D 파일 없이 절차적 지오메트리 + 절차적 텍스처로 만든다.
// ===================================================================================
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Instances, Instance, RoundedBox } from '@react-three/drei'
import * as THREE from 'three'
import { GATE, WAIT_Z } from '../game/layout.js'
import { DECORS } from '../game/constants.js'
import { grassTexture, soilTexture, woodTexture, roofTexture, leafBump, repeat } from './textures.js'
import { windMaterial, charMaterial } from './materials.js'

const GROUND = 110
/** 잔디 섬 반지름 — 이 바깥은 백사장, 더 바깥은 바다 */
const ISLAND_R = 44
const SEA_Y = -1.35

/** 결정적 난수 (매번 같은 마을이 나오도록) */
function rng(seed) {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

// -----------------------------------------------------------------------------------
// 지형 — 가운데는 평평하고 바깥으로 갈수록 완만한 언덕
// -----------------------------------------------------------------------------------
/** 해안선이 물결치도록 — 방위각에 따라 섬 반지름을 조금씩 흔든다. 정원(正圓)이면 인공적으로 보인다 */
function isleRadius(x, z) {
  const a = Math.atan2(z, x)
  return ISLAND_R + Math.sin(a * 3) * 2.2 + Math.sin(a * 5 + 1.7) * 1.3
}

function Terrain({ flatRadius = 30 }) {
  const tex = useMemo(() => repeat(grassTexture(), 26, 26), [])
  const geo = useMemo(() => {
    const g = new THREE.PlaneGeometry(GROUND, GROUND, 140, 140)
    const pos = g.attributes.position
    const r = rng(7)
    const seeds = Array.from({ length: 10 }, () => [r() * 2 - 1, r() * 2 - 1, r()])
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i)
      const y = pos.getY(i)
      const d = Math.hypot(x, y)
      const R0 = isleRadius(x, y)
      const falloff = THREE.MathUtils.clamp((d - flatRadius) / 22, 0, 1)
      let h = 0
      seeds.forEach(([sx, sy, sa], k) => {
        h += Math.sin(x * (0.05 + sa * 0.05) + sx * 6) * Math.cos(y * (0.045 + sa * 0.05) + sy * 6) * (1.1 + k * 0.06)
      })
      // 해변은 평평해야 백사장 링이 지형을 뚫지 않는다 — 물가로 갈수록 언덕을 눌러 없앤다
      const coastFlat = 1 - THREE.MathUtils.clamp((d - (R0 - 7)) / 7, 0, 1)
      let zz = h * 0.42 * falloff * falloff * coastFlat
      // 섬 밖 — 물속으로 떨어진다
      const shore = THREE.MathUtils.clamp((d - R0) / 8, 0, 1)
      zz -= shore * shore * 11
      pos.setZ(i, zz)
    }
    g.computeVertexNormals()
    return g
  }, [flatRadius])

  return (
    <mesh geometry={geo} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <meshStandardMaterial map={tex} roughness={0.98} metalness={0} />
    </mesh>
  )
}

// -----------------------------------------------------------------------------------
// 바다 · 백사장 · 수평선의 먼 섬
// -----------------------------------------------------------------------------------
function Beach() {
  // 잔디와 물 사이 모래띠. 해안선이 물결치므로 링도 같은 함수로 찌그러뜨린다
  const geo = useMemo(() => {
    // inner≠outer여야 한다. inner==outer면 RingGeometry의 uv가 0으로 나눠져 NaN이 되고 아무것도 안 그려진다
    const g = new THREE.RingGeometry(1, 2, 180, 4)
    const pos = g.attributes.position
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i)
      const y = pos.getY(i)
      const a = Math.atan2(y, x)
      const t = THREE.MathUtils.clamp(Math.hypot(x, y) - 1, 0, 1) // 0=안쪽 1=바깥쪽
      const R0 = ISLAND_R + Math.sin(a * 3) * 2.2 + Math.sin(a * 5 + 1.7) * 1.3
      const rr = R0 - 4.5 + t * 8
      pos.setXY(i, Math.cos(a) * rr, Math.sin(a) * rr)
      // 바깥쪽 끝은 물속으로 내려가야 지형과 어긋나지 않는다
      pos.setZ(i, -Math.pow(THREE.MathUtils.clamp((rr - R0) / 3.5, 0, 1), 2) * 2.2)
    }
    g.computeVertexNormals()
    return g
  }, [])
  return (
    <mesh geometry={geo} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.06, 0]} receiveShadow>
      <meshStandardMaterial color="#efe0b6" roughness={1} metalness={0} />
    </mesh>
  )
}

function Ocean({ night }) {
  const deep = useRef()
  // 잔물결 — 판 전체를 아주 느리게 위아래로 흔들어 '살아있는 물'로 보이게
  useFrame((s) => {
    if (deep.current) deep.current.position.y = SEA_Y + Math.sin(s.clock.elapsedTime * 0.5) * 0.045
  })
  return (
    <group>
      <mesh ref={deep} rotation={[-Math.PI / 2, 0, 0]} position={[0, SEA_Y, 0]}>
        <circleGeometry args={[420, 64]} />
        <meshStandardMaterial
          color={night ? '#16305c' : '#2f8fd0'}
          roughness={0.16}
          metalness={0.45}
          envMapIntensity={1.4}
        />
      </mesh>
      {/* 얕은 물 — 해변 바로 앞의 밝은 청록. 이게 있어야 물 깊이가 읽힌다 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, SEA_Y + 0.5, 0]}>
        <circleGeometry args={[ISLAND_R + 7.5, 96]} />
        <meshStandardMaterial
          color={night ? '#2a5f8f' : '#7fd8dc'}
          roughness={0.2}
          metalness={0.3}
          transparent
          opacity={0.72}
        />
      </mesh>
    </group>
  )
}

function FarIslands({ night }) {
  const isles = useMemo(() => {
    const r = rng(313)
    // fog가 62~132라 100 밖에 두면 형체 없이 하얗게 씻겨 '유령 언덕'이 된다. 62~88 사이에 둔다
    return [
      [-0.85, 68], [0.4, 80], [1.85, 64], [2.95, 86], [4.25, 72], [5.4, 78],
    ].map(([a, d]) => ({
      p: [Math.cos(a) * d, 0, Math.sin(a) * d],
      s: 6 + r() * 7,
      h: 0.4 + r() * 0.35,
      trees: 2 + Math.floor(r() * 3),
      seed: r(),
    }))
  }, [])
  // fog에 섞여도 실루엣이 남도록 잔디보다 진한 초록을 쓴다
  const land = night ? '#25384f' : '#4c8b45'
  return (
    <group>
      {isles.map((it, i) => (
        <group key={i} position={it.p}>
          {/* 돔 하나면 매끈한 반구라 인공적이다 — 크기 다른 언덕 셋을 겹쳐 실루엣을 흐트러뜨린다 */}
          {[[0, 0, 1, 1], [0.55, 0.3, 0.6, 0.72], [-0.5, -0.35, 0.52, 0.6]].map(([ox, oz, ss, hh], k) => (
            <mesh
              key={k}
              position={[ox * it.s, SEA_Y + 0.2, oz * it.s]}
              scale={[it.s * ss, it.s * it.h * hh, it.s * ss]}
            >
              <sphereGeometry args={[1, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.5]} />
              <meshStandardMaterial color={land} roughness={1} />
            </mesh>
          ))}
          {/* 물가 모래 */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, SEA_Y + 0.24, 0]}>
            <circleGeometry args={[it.s * 1.2, 24]} />
            <meshStandardMaterial color={night ? '#3a4356' : '#dfcb9a'} roughness={1} />
          </mesh>
          {[...Array(it.trees)].map((_, k) => {
            const a = (k / it.trees) * Math.PI * 2 + it.seed * 3
            const rr = it.s * 0.45
            return (
              <group key={k} position={[Math.cos(a) * rr, SEA_Y + it.s * it.h * 0.55, Math.sin(a) * rr]}>
                <mesh scale={[0.5, 2.4, 0.5]} position={[0, 1.2, 0]}>
                  <cylinderGeometry args={[0.3, 0.42, 1, 6]} />
                  <meshStandardMaterial color={night ? '#1c2839' : '#70502f'} roughness={1} />
                </mesh>
                <mesh position={[0, 3.0, 0]} scale={[1, 0.8, 1]}>
                  <sphereGeometry args={[1.9, 10, 8]} />
                  <meshStandardMaterial color={night ? '#1b2c3d' : '#3f8340'} roughness={1} />
                </mesh>
              </group>
            )
          })}
        </group>
      ))}
    </group>
  )
}

// -----------------------------------------------------------------------------------
// 잔디 포기 / 꽃 / 돌 — 인스턴싱으로 한 번에 그린다
// -----------------------------------------------------------------------------------
function GrassTufts({ count = 1400, keepOut = [] }) {
  // 균일하게 뿌리면 "들판에 박힌 뿔"처럼 보인다.
  // 무리(clump) 중심을 먼저 잡고 그 주변에 옹기종기 심어야 자연스럽다.
  const items = useMemo(() => {
    const r = rng(21)
    const out = []
    let guard = 0
    while (out.length < count && guard++ < count * 8) {
      const cx0 = (r() - 0.5) * 92
      const cz0 = (r() - 0.5) * 92
      const clump = 3 + Math.floor(r() * 7)
      for (let i = 0; i < clump && out.length < count; i++) {
        const a = r() * Math.PI * 2
        const rad = r() * 1.5
        const x = cx0 + Math.cos(a) * rad
        const z = cz0 + Math.sin(a) * rad
        if (keepOut.some(([cx, cz, w, d]) => Math.abs(x - cx) < w && Math.abs(z - cz) < d)) continue
        if (Math.abs(x) < 3 && z > 8) continue // 입구 길
        if (Math.hypot(x, z) > isleRadius(x, z) - 4.5) continue // 백사장·바다 위에 잔디가 뜨면 안 된다
        out.push({ p: [x, 0, z], s: 0.7 + r() * 0.6, ry: r() * Math.PI, c: r() })
      }
    }
    return out
  }, [count, keepOut])

  const mat = useMemo(() => windMaterial({ color: '#5faf52', strength: 0.13 }), [])

  return (
    <Instances limit={2200} castShadow={false} receiveShadow={false} frustumCulled={false} material={mat}>
      {/* 캐릭터 발목보다 훨씬 낮게 — 잔디 '결' 정도로만 보이게 */}
      <coneGeometry args={[0.055, 0.19, 4, 1]} />
      {items.map((it, i) => (
        <Instance
          key={i}
          position={[it.p[0], 0.09 * it.s, it.p[2]]}
          scale={[it.s, it.s * (0.75 + it.c * 0.6), it.s]}
          rotation={[0, it.ry, (it.c - 0.5) * 0.25]}
          color={it.c > 0.6 ? '#79c266' : it.c > 0.3 ? '#57a24c' : '#6bb85c'}
        />
      ))}
    </Instances>
  )
}

function Flowers({ count = 220, keepOut = [] }) {
  const items = useMemo(() => {
    const r = rng(33)
    const colors = ['#ff7a95', '#ffd166', '#ffffff', '#b78bf0', '#ff9f5a']
    const out = []
    let guard = 0
    while (out.length < count && guard++ < count * 6) {
      const x = (r() - 0.5) * 80
      const z = (r() - 0.5) * 80
      if (keepOut.some(([cx, cz, w, d]) => Math.abs(x - cx) < w && Math.abs(z - cz) < d)) continue
      if (Math.hypot(x, z) > isleRadius(x, z) - 5) continue // 백사장 위에 꽃이 피면 안 된다
      out.push({ x, z, c: colors[Math.floor(r() * colors.length)], s: 0.8 + r() * 0.5 })
    }
    return out
  }, [count, keepOut])

  return (
    <group>
      <Instances limit={400} frustumCulled={false}>
        <cylinderGeometry args={[0.018, 0.022, 0.26, 4]} />
        <meshStandardMaterial color="#4a9440" roughness={1} />
        {items.map((f, i) => <Instance key={i} position={[f.x, 0.13, f.z]} scale={f.s} />)}
      </Instances>
      <Instances limit={400} castShadow frustumCulled={false}>
        <sphereGeometry args={[0.075, 8, 6]} />
        <meshStandardMaterial roughness={0.7} />
        {items.map((f, i) => <Instance key={i} position={[f.x, 0.27 * f.s, f.z]} scale={f.s} color={f.c} />)}
      </Instances>
    </group>
  )
}

function Rocks({ count = 40, keepOut = [] }) {
  const items = useMemo(() => {
    const r = rng(51)
    const out = []
    let guard = 0
    while (out.length < count && guard++ < count * 8) {
      const x = (r() - 0.5) * 88
      const z = (r() - 0.5) * 88
      if (keepOut.some(([cx, cz, w, d]) => Math.abs(x - cx) < w + 1 && Math.abs(z - cz) < d + 1)) continue
      if (Math.hypot(x, z) > isleRadius(x, z) - 2) continue // 물 위에 돌이 떠 있으면 안 된다
      out.push({ x, z, s: 0.25 + r() * 0.5, ry: r() * 6, rx: r() })
    }
    return out
  }, [count, keepOut])
  return (
    <Instances limit={80} castShadow receiveShadow frustumCulled={false}>
      <dodecahedronGeometry args={[0.5, 0]} />
      <meshStandardMaterial color="#9aa0a6" roughness={0.95} flatShading />
      {items.map((r2, i) => (
        <Instance key={i} position={[r2.x, r2.s * 0.35, r2.z]} scale={[r2.s, r2.s * 0.75, r2.s * 1.1]} rotation={[r2.rx, r2.ry, 0]} />
      ))}
    </Instances>
  )
}

// -----------------------------------------------------------------------------------
// 나무 — 층층이 겹친 잎 덩어리 + 살짝 흔들림
// -----------------------------------------------------------------------------------
function Tree({ position, kind = 'green', scale = 1, seed = 1 }) {
  const g = useRef()
  const bump = useMemo(() => leafBump(), [])
  const palette = {
    green: ['#3f8f47', '#4da356', '#5cb862'],
    sakura: ['#f090b4', '#f8aec9', '#ffc8dc'],
    maple: ['#d8552c', '#e8763a', '#f2984b'],
    pine: ['#2f6b46', '#377a4f', '#408a59'],
  }[kind]
  const r = useMemo(() => rng(seed * 977), [seed])
  const blobs = useMemo(
    () =>
      Array.from({ length: 5 }, (_, i) => {
        const a = r() * Math.PI * 2
        const rad = i === 0 ? 0 : 0.45 + r() * 0.5
        return {
          p: [Math.cos(a) * rad, 1.95 + (i === 0 ? 0.35 : r() * 0.7), Math.sin(a) * rad],
          s: i === 0 ? 1.05 : 0.5 + r() * 0.42,
          c: palette[Math.floor(r() * palette.length)],
        }
      }),
    [r]
  )

  useFrame((s) => {
    if (g.current) g.current.rotation.z = Math.sin(s.clock.elapsedTime * 0.7 + seed) * 0.018
  })

  if (kind === 'pine') {
    return (
      <group position={[position[0], 0, position[1]]} scale={scale}>
        <mesh position={[0, 0.9, 0]} castShadow>
          <cylinderGeometry args={[0.16, 0.26, 1.8, 8]} />
          <meshStandardMaterial color="#7a4f33" roughness={1} bumpMap={bump} bumpScale={0.02} />
        </mesh>
        <group ref={g}>
          {[0, 1, 2].map((i) => (
            <mesh key={i} position={[0, 1.9 + i * 0.95, 0]} castShadow>
              <coneGeometry args={[1.35 - i * 0.32, 1.5, 9]} />
              <meshStandardMaterial color={palette[i]} roughness={0.95} bumpMap={bump} bumpScale={0.06} />
            </mesh>
          ))}
        </group>
      </group>
    )
  }

  return (
    <group position={[position[0], 0, position[1]]} scale={scale}>
      <mesh position={[0, 0.95, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.19, 0.32, 1.9, 9]} />
        <meshStandardMaterial color="#8a5a3b" roughness={1} bumpMap={bump} bumpScale={0.03} />
      </mesh>
      {/* 뿌리 */}
      {[0, 1, 2, 3].map((i) => {
        const a = (i / 4) * Math.PI * 2 + 0.4
        return (
          <mesh key={i} position={[Math.cos(a) * 0.26, 0.1, Math.sin(a) * 0.26]} rotation={[0, -a, 0.5]} castShadow>
            <capsuleGeometry args={[0.09, 0.2, 3, 6]} />
            <meshStandardMaterial color="#7d5134" roughness={1} />
          </mesh>
        )
      })}
      <group ref={g}>
        {blobs.map((b, i) => (
          <mesh key={i} position={b.p} scale={[b.s, b.s * 0.86, b.s]} castShadow
            material={charMaterial({ color: b.c, roughness: 0.92, rimColor: '#e8ffd8', rimPower: 2.8, rimIntensity: 0.3, wrap: 0.55 })}>
            <sphereGeometry args={[1.0, 18, 14]} />
          </mesh>
        ))}
      </group>
    </group>
  )
}

function Bush({ position, scale = 1, color = '#4a9c4f' }) {
  const bump = useMemo(() => leafBump(), [])
  return (
    <group position={[position[0], 0, position[1]]} scale={scale}>
      {[[0, 0.35, 0, 1], [0.4, 0.28, 0.15, 0.72], [-0.36, 0.3, -0.12, 0.78]].map(([x, y, z, s], i) => (
        <mesh key={i} position={[x, y, z]} scale={[s, s * 0.85, s]} castShadow receiveShadow>
          <sphereGeometry args={[0.5, 14, 11]} />
          <meshStandardMaterial color={color} roughness={0.95} bumpMap={bump} bumpScale={0.08} />
        </mesh>
      ))}
    </group>
  )
}

// -----------------------------------------------------------------------------------
// 클럽하우스
// -----------------------------------------------------------------------------------
function Clubhouse({ position }) {
  const wood = useMemo(() => repeat(woodTexture('#a86d3c', '#d9a565'), 3, 2), [])
  const roof = useMemo(() => repeat(roofTexture('#c9504c'), 5, 3), [])
  const stone = useMemo(() => repeat(woodTexture('#9a9a9a', '#c2c2c2'), 4, 1), [])

  return (
    <group position={[position[0], 0, position[1]]} rotation={[0, -0.35, 0]}>
      {/* 기단 */}
      <mesh position={[0, 0.22, 0]} receiveShadow castShadow>
        <boxGeometry args={[8.2, 0.44, 6.2]} />
        <meshStandardMaterial map={stone} roughness={0.95} />
      </mesh>
      {/* 벽 */}
      <RoundedBox args={[7.4, 3.3, 5.4]} radius={0.1} smoothness={3} position={[0, 2.05, 0]} castShadow receiveShadow>
        <meshStandardMaterial map={wood} roughness={0.9} />
      </RoundedBox>
      {/* 지붕 */}
      <mesh position={[0, 4.35, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
        <coneGeometry args={[5.9, 2.1, 4]} />
        <meshStandardMaterial map={roof} roughness={0.85} />
      </mesh>
      <mesh position={[0, 5.45, 0]}>
        <sphereGeometry args={[0.2, 12, 10]} />
        <meshStandardMaterial color="#ffd166" metalness={0.7} roughness={0.25} />
      </mesh>
      {/* 굴뚝 */}
      <mesh position={[2.1, 4.6, -1.3]} castShadow>
        <boxGeometry args={[0.7, 1.5, 0.7]} />
        <meshStandardMaterial map={stone} roughness={0.95} />
      </mesh>
      {/* 문 */}
      <mesh position={[0, 1.35, 2.73]}>
        <boxGeometry args={[1.35, 2.3, 0.12]} />
        <meshStandardMaterial color="#7a4a28" roughness={0.85} />
      </mesh>
      <mesh position={[0.45, 1.35, 2.82]}>
        <sphereGeometry args={[0.08, 10, 8]} />
        <meshStandardMaterial color="#f4c542" metalness={0.75} roughness={0.25} />
      </mesh>
      {/* 차양 */}
      <mesh position={[0, 2.75, 3.1]} rotation={[-0.5, 0, 0]} castShadow>
        <boxGeometry args={[3.4, 0.1, 1.3]} />
        <meshStandardMaterial color="#e07a5f" roughness={0.85} />
      </mesh>
      {/* 창문 */}
      {[-2.3, 2.3].map((x) => (
        <group key={x} position={[x, 2.2, 2.73]}>
          <mesh>
            <boxGeometry args={[1.5, 1.25, 0.1]} />
            <meshStandardMaterial color="#a8dcf0" roughness={0.1} metalness={0.2} envMapIntensity={1.6} />
          </mesh>
          <mesh position={[0, 0, 0.07]}>
            <boxGeometry args={[1.62, 0.1, 0.06]} />
            <meshStandardMaterial color="#f7f2e6" roughness={0.7} />
          </mesh>
          <mesh position={[0, 0, 0.07]}>
            <boxGeometry args={[0.1, 1.36, 0.06]} />
            <meshStandardMaterial color="#f7f2e6" roughness={0.7} />
          </mesh>
          <mesh position={[0, -0.72, 0.16]}>
            <boxGeometry args={[1.72, 0.14, 0.34]} />
            <meshStandardMaterial color="#f7f2e6" roughness={0.8} />
          </mesh>
        </group>
      ))}
      {/* 간판 */}
      <group position={[0, 3.5, 2.85]}>
        <mesh castShadow>
          <boxGeometry args={[3.6, 0.8, 0.16]} />
          <meshStandardMaterial color="#2f7d55" roughness={0.8} />
        </mesh>
        <mesh position={[-1.1, 0, 0.1]} scale={0.5}>
          <torusGeometry args={[0.42, 0.07, 8, 20]} />
          <meshStandardMaterial color="#ffd166" metalness={0.4} roughness={0.4} />
        </mesh>
        {[0.2, 0.75, 1.3].map((x, i) => (
          <mesh key={i} position={[x, -0.05, 0.1]}>
            <boxGeometry args={[0.32, 0.32, 0.05]} />
            <meshStandardMaterial color="#fdf3dc" roughness={0.7} />
          </mesh>
        ))}
      </group>
      {/* 화분 */}
      {[-3.3, 3.3].map((x) => (
        <group key={x} position={[x, 0.44, 3.0]}>
          <mesh castShadow>
            <cylinderGeometry args={[0.42, 0.32, 0.6, 12]} />
            <meshStandardMaterial color="#c1663f" roughness={0.9} />
          </mesh>
          <mesh position={[0, 0.5, 0]} castShadow>
            <sphereGeometry args={[0.5, 14, 11]} />
            <meshStandardMaterial color="#4a9c4f" roughness={0.95} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

// -----------------------------------------------------------------------------------
// 연못
// -----------------------------------------------------------------------------------
function Pond({ position = [22, 18] }) {
  const ref = useRef()
  useFrame((s) => {
    if (ref.current) {
      const t = s.clock.elapsedTime
      ref.current.material.opacity = 0.82 + Math.sin(t * 0.8) * 0.03
      ref.current.position.y = 0.06 + Math.sin(t * 0.6) * 0.012
    }
  })
  return (
    <group position={[position[0], 0, position[1]]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} receiveShadow>
        <circleGeometry args={[4.4, 32]} />
        <meshStandardMaterial color="#6b5b45" roughness={1} />
      </mesh>
      <mesh ref={ref} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.06, 0]}>
        <circleGeometry args={[4.1, 32]} />
        <meshPhysicalMaterial
          color="#2f8fbf" roughness={0.08} metalness={0.1}
          transparent opacity={0.85} transmission={0.35} thickness={0.6}
          envMapIntensity={2}
        />
      </mesh>
      {[...Array(9)].map((_, i) => {
        const a = (i / 9) * Math.PI * 2
        return (
          <mesh key={i} position={[Math.cos(a) * 4.35, 0.18, Math.sin(a) * 4.35]} rotation={[i, a, 0]} castShadow>
            <dodecahedronGeometry args={[0.42, 0]} />
            <meshStandardMaterial color="#9aa0a6" roughness={0.95} flatShading />
          </mesh>
        )
      })}
      {/* 연잎 */}
      {[[1.4, 1.1], [-1.8, 0.6], [0.4, -1.9]].map(([x, z], i) => (
        <mesh key={i} position={[x, 0.09, z]} rotation={[-Math.PI / 2, 0, i]}>
          <circleGeometry args={[0.55, 14, 0.4, Math.PI * 1.85]} />
          <meshStandardMaterial color="#3f9b52" roughness={0.9} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </group>
  )
}

// -----------------------------------------------------------------------------------
// 벤치 / 울타리 / 가로등
// -----------------------------------------------------------------------------------
function Bench({ position, rotation = 0 }) {
  const wood = useMemo(() => repeat(woodTexture('#a2622f', '#c98a4b'), 2, 1), [])
  return (
    <group position={[position[0], 0, position[1]]} rotation={[0, rotation, 0]}>
      {[0, 1, 2].map((i) => (
        <mesh key={i} position={[0, 0.45, -0.18 + i * 0.18]} castShadow receiveShadow>
          <boxGeometry args={[2.0, 0.08, 0.15]} />
          <meshStandardMaterial map={wood} roughness={0.9} />
        </mesh>
      ))}
      {[0, 1, 2].map((i) => (
        <mesh key={i} position={[0, 0.7 + i * 0.19, -0.34]} rotation={[-0.22, 0, 0]} castShadow>
          <boxGeometry args={[2.0, 0.14, 0.07]} />
          <meshStandardMaterial map={wood} roughness={0.9} />
        </mesh>
      ))}
      {[-0.85, 0.85].map((x) => (
        <group key={x}>
          <mesh position={[x, 0.22, 0]} castShadow>
            <boxGeometry args={[0.1, 0.44, 0.5]} />
            <meshStandardMaterial color="#5c6670" roughness={0.6} metalness={0.4} />
          </mesh>
          <mesh position={[x, 0.62, -0.36]} castShadow>
            <boxGeometry args={[0.09, 0.55, 0.09]} />
            <meshStandardMaterial color="#5c6670" roughness={0.6} metalness={0.4} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

function Fence({ backZ }) {
  const posts = useMemo(() => {
    const pts = []
    const half = 30
    for (let x = -half; x <= half; x += 2.4) {
      pts.push([x, backZ])
      if (Math.abs(x) > 2.6) pts.push([x, 28])
    }
    for (let z = backZ; z <= 28; z += 2.4) {
      pts.push([-half, z])
      pts.push([half, z])
    }
    return pts
  }, [backZ])

  const rails = useMemo(() => {
    const out = []
    const half = 30
    for (let x = -half; x < half; x += 2.4) {
      out.push({ p: [x + 1.2, backZ], r: 0 })
      if (Math.abs(x + 1.2) > 3.2) out.push({ p: [x + 1.2, 28], r: 0 })
    }
    for (let z = backZ; z < 28; z += 2.4) {
      out.push({ p: [-half, z + 1.2], r: Math.PI / 2 })
      out.push({ p: [half, z + 1.2], r: Math.PI / 2 })
    }
    return out
  }, [backZ])

  const wood = useMemo(() => repeat(woodTexture('#b98a4e', '#e0b878'), 1, 1), [])

  return (
    <group>
      <Instances limit={300} castShadow receiveShadow frustumCulled={false}>
        <boxGeometry args={[0.16, 1.35, 0.16]} />
        <meshStandardMaterial map={wood} roughness={0.9} />
        {posts.map((p, i) => <Instance key={i} position={[p[0], 0.66, p[1]]} />)}
      </Instances>
      <Instances limit={600} castShadow frustumCulled={false}>
        <boxGeometry args={[2.4, 0.13, 0.08]} />
        <meshStandardMaterial map={wood} roughness={0.9} />
        {rails.map((r, i) => (
          <group key={i}>
            <Instance position={[r.p[0], 0.95, r.p[1]]} rotation={[0, r.r, 0]} />
            <Instance position={[r.p[0], 0.55, r.p[1]]} rotation={[0, r.r, 0]} />
          </group>
        ))}
      </Instances>
    </group>
  )
}

function StreetLamp({ position, on }) {
  return (
    <group position={[position[0], 0, position[1]]}>
      <mesh position={[0, 0.12, 0]} castShadow>
        <cylinderGeometry args={[0.28, 0.34, 0.24, 10]} />
        <meshStandardMaterial color="#3b4252" roughness={0.6} metalness={0.5} />
      </mesh>
      <mesh position={[0, 1.75, 0]} castShadow>
        <cylinderGeometry args={[0.075, 0.11, 3.3, 8]} />
        <meshStandardMaterial color="#3b4252" roughness={0.5} metalness={0.6} />
      </mesh>
      <mesh position={[0, 3.5, 0]} castShadow>
        <coneGeometry args={[0.42, 0.36, 10]} />
        <meshStandardMaterial color="#3b4252" roughness={0.5} metalness={0.6} />
      </mesh>
      <mesh position={[0, 3.28, 0]}>
        <sphereGeometry args={[0.26, 14, 12]} />
        <meshStandardMaterial color="#fff6d0" emissive="#ffcf7a" emissiveIntensity={on ? 2.4 : 0.1} roughness={0.3} />
      </mesh>
      {on && <pointLight position={[0, 3.2, 0]} intensity={14} distance={13} decay={2} color="#ffd9a0" />}
    </group>
  )
}

// -----------------------------------------------------------------------------------
// 관중석
// -----------------------------------------------------------------------------------
function Bleachers({ position, rotation = 0 }) {
  return (
    <group position={[position[0], 0, position[1]]} rotation={[0, rotation, 0]}>
      {[0, 1, 2].map((i) => (
        <group key={i}>
          <mesh position={[0, 0.28 + i * 0.44, -i * 0.75]} castShadow receiveShadow>
            <boxGeometry args={[7.5, 0.56 + i * 0.44, 0.75]} />
            <meshStandardMaterial color={i % 2 ? '#e8e3d5' : '#dcd6c5'} roughness={0.9} />
          </mesh>
          <mesh position={[0, 0.58 + i * 0.44, -i * 0.75 + 0.1]} castShadow>
            <boxGeometry args={[7.3, 0.1, 0.62]} />
            <meshStandardMaterial color={['#5aa9e0', '#7cc576', '#ffd166'][i]} roughness={0.7} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

// -----------------------------------------------------------------------------------
// 마을 발전도 보상 — 레벨이 오르면 마을에 실제로 나타난다
// -----------------------------------------------------------------------------------

/** 축제 깃발 줄 (Lv.2) — 두 기둥 사이에 늘어진 삼각 깃발 */
function Bunting({ from, to, sag = 0.7 }) {
  const flags = useMemo(() => {
    const n = 9
    const colors = ['#ff8fa3', '#ffd166', '#7cc576', '#7fd4f5', '#c8a6ff']
    return Array.from({ length: n }, (_, i) => {
      const t = (i + 0.5) / n
      const x = from[0] + (to[0] - from[0]) * t
      const z = from[2] + (to[2] - from[2]) * t
      const y = from[1] + (to[1] - from[1]) * t - Math.sin(t * Math.PI) * sag
      return { p: [x, y, z], c: colors[i % colors.length] }
    })
  }, [from, to, sag])

  return (
    <group>
      {[from, to].map((p, i) => (
        <mesh key={i} position={[p[0], p[1] / 2, p[2]]} castShadow>
          <cylinderGeometry args={[0.06, 0.08, p[1], 8]} />
          <meshStandardMaterial color="#8a5a3b" roughness={0.9} />
        </mesh>
      ))}
      {flags.map((f, i) => (
        <mesh key={i} position={f.p} rotation={[Math.PI, 0, 0]}>
          <coneGeometry args={[0.16, 0.4, 3]} />
          <meshStandardMaterial color={f.c} roughness={0.85} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </group>
  )
}

/** 열기구 (Lv.4) — 마을 위를 천천히 떠다닌다 */
function Balloon() {
  const g = useRef()
  useFrame((s) => {
    const t = s.clock.elapsedTime * 0.07
    if (g.current) {
      g.current.position.set(Math.cos(t) * 20, 17 + Math.sin(s.clock.elapsedTime * 0.4) * 0.9, Math.sin(t) * 16 - 4)
      g.current.rotation.y = t
    }
  })
  return (
    <group ref={g}>
      <mesh castShadow>
        <sphereGeometry args={[2.4, 18, 16]} />
        <meshStandardMaterial color="#ff8fa3" roughness={0.75} />
      </mesh>
      {[0, 1, 2, 3].map((i) => (
        <mesh key={i} rotation={[0, (i / 4) * Math.PI * 2, 0]}>
          <sphereGeometry args={[2.42, 18, 16, -0.3, 0.6]} />
          <meshStandardMaterial color={i % 2 ? '#ffd166' : '#7fd4f5'} roughness={0.75} />
        </mesh>
      ))}
      <mesh position={[0, -3.3, 0]} castShadow>
        <boxGeometry args={[1.1, 0.85, 1.1]} />
        <meshStandardMaterial color="#a2622f" roughness={0.95} />
      </mesh>
      {[[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]].map(([x, z], i) => (
        <mesh key={i} position={[x, -2.6, z]}>
          <cylinderGeometry args={[0.02, 0.02, 1.4, 4]} />
          <meshStandardMaterial color="#6b4a2f" />
        </mesh>
      ))}
    </group>
  )
}

/** 황금 셔틀콕 기념비 (Lv.5) */
function GoldenShuttle({ night }) {
  const g = useRef()
  useFrame((s) => {
    if (g.current) g.current.rotation.y = s.clock.elapsedTime * 0.5
  })
  return (
    <group position={[0, 0, 9]}>
      <mesh position={[0, 0.5, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[1.1, 1.35, 1.0, 8]} />
        <meshStandardMaterial color="#d5d8dd" roughness={0.7} />
      </mesh>
      <group ref={g} position={[0, 2.1, 0]}>
        <mesh castShadow>
          <sphereGeometry args={[0.42, 14, 12]} />
          <meshStandardMaterial color="#ffd166" metalness={0.85} roughness={0.2} emissive="#8a6a10" emissiveIntensity={night ? 0.8 : 0.15} />
        </mesh>
        <mesh position={[0, 0.75, 0]} castShadow>
          <coneGeometry args={[0.72, 1.5, 14, 1, true]} />
          <meshStandardMaterial color="#ffe9a6" metalness={0.75} roughness={0.25} side={THREE.DoubleSide} emissive="#8a6a10" emissiveIntensity={night ? 0.6 : 0.1} />
        </mesh>
      </group>
      {night && <pointLight position={[0, 2.6, 0]} intensity={10} distance={10} color="#ffd166" />}
    </group>
  )
}

/** 트로피 진열대 — 획득한 개수만큼 금 트로피가 실제로 놓인다 */
function TrophyStand({ count }) {
  const wood = useMemo(() => repeat(woodTexture('#a2622f', '#c98a4b'), 2, 1), [])
  const n = Math.min(15, count)
  if (n === 0) return null
  return (
    <group position={[-11, 0, 20]} rotation={[0, 0.5, 0]}>
      {[0, 1, 2].map((row) => (
        <mesh key={row} position={[0, 0.42 + row * 0.5, -row * 0.42]} castShadow receiveShadow>
          <boxGeometry args={[4.4, 0.12, 0.6]} />
          <meshStandardMaterial map={wood} roughness={0.85} />
        </mesh>
      ))}
      {[-1.9, 1.9].map((x) => (
        <mesh key={x} position={[x, 0.7, -0.42]} castShadow>
          <boxGeometry args={[0.14, 1.4, 1.5]} />
          <meshStandardMaterial map={wood} roughness={0.85} />
        </mesh>
      ))}
      {Array.from({ length: n }, (_, i) => {
        const row = Math.floor(i / 5)
        const col = i % 5
        return (
          <group key={i} position={[-1.6 + col * 0.8, 0.48 + row * 0.5, -row * 0.42]}>
            <mesh castShadow>
              <cylinderGeometry args={[0.1, 0.13, 0.1, 8]} />
              <meshStandardMaterial color="#8a5a3b" roughness={0.8} />
            </mesh>
            <mesh position={[0, 0.16, 0]} castShadow>
              <sphereGeometry args={[0.11, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.62]} />
              <meshStandardMaterial color="#ffd166" metalness={0.85} roughness={0.25} />
            </mesh>
          </group>
        )
      })}
    </group>
  )
}

// -----------------------------------------------------------------------------------
// 상점에서 산 장식물
// -----------------------------------------------------------------------------------
function Decor({ item, night }) {
  const [x, z] = item.pos
  const ref = useRef()
  useFrame((s) => {
    if (item.kind === 'fountain' && ref.current) ref.current.rotation.y = s.clock.elapsedTime * 0.7
    if (item.kind === 'doghouse' && ref.current) {
      ref.current.position.y = 0.3 + Math.abs(Math.sin(s.clock.elapsedTime * 3)) * 0.09
      ref.current.rotation.y = Math.sin(s.clock.elapsedTime * 1.4) * 0.4
    }
  })

  switch (item.kind) {
    case 'sakura': return <Tree position={[x, z]} kind="sakura" scale={1.25} seed={5} />
    case 'maple': return <Tree position={[x, z]} kind="maple" scale={1.15} seed={9} />
    case 'flowerbed':
      return (
        <group position={[x, 0, z]}>
          <mesh position={[0, 0.18, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[1.4, 1.5, 0.36, 16]} />
            <meshStandardMaterial color="#a8703f" roughness={0.95} />
          </mesh>
          <mesh position={[0, 0.37, 0]}>
            <cylinderGeometry args={[1.3, 1.3, 0.06, 16]} />
            <meshStandardMaterial color="#6b4a2f" roughness={1} />
          </mesh>
          {[...Array(14)].map((_, i) => {
            const a = (i / 14) * Math.PI * 2
            const rad = i % 2 ? 0.9 : 0.5
            const c = ['#ff6b8a', '#ffd166', '#a78bfa', '#ffffff', '#ff9f5a'][i % 5]
            return (
              <group key={i} position={[Math.cos(a) * rad, 0.4, Math.sin(a) * rad]}>
                <mesh position={[0, 0.14, 0]}><cylinderGeometry args={[0.025, 0.03, 0.28, 5]} /><meshStandardMaterial color="#3f9b52" /></mesh>
                <mesh position={[0, 0.32, 0]} castShadow><sphereGeometry args={[0.12, 10, 8]} /><meshStandardMaterial color={c} roughness={0.7} /></mesh>
              </group>
            )
          })}
        </group>
      )
    case 'lamp': return <StreetLamp position={[x, z]} on={night} />
    case 'vending':
      return (
        <group position={[x, 0, z]}>
          <RoundedBox args={[1.5, 2.4, 0.85]} radius={0.07} position={[0, 1.2, 0]} castShadow receiveShadow>
            <meshStandardMaterial color="#d4404f" roughness={0.35} metalness={0.25} envMapIntensity={1.3} />
          </RoundedBox>
          <mesh position={[-0.3, 1.5, 0.44]}>
            <boxGeometry args={[0.72, 1.4, 0.04]} />
            <meshStandardMaterial color="#0f172a" emissive="#38bdf8" emissiveIntensity={night ? 1.1 : 0.4} roughness={0.15} />
          </mesh>
          {[...Array(4)].map((_, i) => (
            <mesh key={i} position={[-0.52 + (i % 2) * 0.22, 1.75 - Math.floor(i / 2) * 0.4, 0.47]}>
              <cylinderGeometry args={[0.07, 0.07, 0.22, 8]} />
              <meshStandardMaterial color={['#facc15', '#22c55e', '#38bdf8', '#f472b6'][i]} roughness={0.3} />
            </mesh>
          ))}
          <mesh position={[0.45, 1.0, 0.44]}>
            <boxGeometry args={[0.42, 0.5, 0.04]} />
            <meshStandardMaterial color="#1f2937" roughness={0.4} />
          </mesh>
        </group>
      )
    case 'parasol':
      return (
        <group position={[x, 0, z]}>
          <mesh position={[0, 0.75, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[1.0, 1.0, 0.09, 20]} />
            <meshStandardMaterial color="#f5f0e6" roughness={0.7} />
          </mesh>
          <mesh position={[0, 0.38, 0]}><cylinderGeometry args={[0.1, 0.14, 0.75, 8]} /><meshStandardMaterial color="#8a5a3b" roughness={0.85} /></mesh>
          <mesh position={[0, 1.55, 0]}><cylinderGeometry args={[0.05, 0.05, 1.7, 8]} /><meshStandardMaterial color="#8a5a3b" roughness={0.85} /></mesh>
          <mesh position={[0, 2.5, 0]} castShadow>
            <coneGeometry args={[1.9, 0.75, 14]} />
            <meshStandardMaterial color="#ff8fa3" roughness={0.85} side={THREE.DoubleSide} />
          </mesh>
          {[[-1.35, 0], [1.35, 0], [0, 1.35], [0, -1.35]].map(([cx, cz], i) => (
            <group key={i} position={[cx, 0, cz]}>
              <mesh position={[0, 0.24, 0]} castShadow><cylinderGeometry args={[0.32, 0.32, 0.48, 12]} /><meshStandardMaterial color="#e8dcc6" roughness={0.85} /></mesh>
            </group>
          ))}
        </group>
      )
    case 'fountain':
      return (
        <group position={[x, 0, z]}>
          <mesh position={[0, 0.26, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[2.2, 2.35, 0.52, 26]} />
            <meshStandardMaterial color="#d5d8dd" roughness={0.75} />
          </mesh>
          <mesh position={[0, 0.5, 0]}>
            <cylinderGeometry args={[1.95, 1.95, 0.1, 26]} />
            <meshPhysicalMaterial color="#3fa0cf" roughness={0.05} transmission={0.4} thickness={0.5} transparent opacity={0.9} envMapIntensity={2} />
          </mesh>
          <mesh position={[0, 1.0, 0]}><cylinderGeometry args={[0.22, 0.34, 1.1, 12]} /><meshStandardMaterial color="#d5d8dd" roughness={0.7} /></mesh>
          <mesh position={[0, 1.6, 0]}><cylinderGeometry args={[0.85, 0.2, 0.22, 16]} /><meshStandardMaterial color="#d5d8dd" roughness={0.7} /></mesh>
          <group ref={ref} position={[0, 1.85, 0]}>
            {[...Array(8)].map((_, i) => {
              const a = (i / 8) * Math.PI * 2
              return (
                <mesh key={i} position={[Math.cos(a) * 0.5, -0.12 - (i % 3) * 0.1, Math.sin(a) * 0.5]}>
                  <sphereGeometry args={[0.1, 8, 6]} />
                  <meshPhysicalMaterial color="#a8e4ff" transparent opacity={0.7} roughness={0.05} transmission={0.6} />
                </mesh>
              )
            })}
          </group>
        </group>
      )
    case 'scoreboard':
      return (
        <group position={[x, 0, z]}>
          {[-2.4, 2.4].map((px) => (
            <mesh key={px} position={[px, 1.6, 0]} castShadow>
              <cylinderGeometry args={[0.13, 0.16, 3.2, 8]} />
              <meshStandardMaterial color="#475569" metalness={0.5} roughness={0.45} />
            </mesh>
          ))}
          <RoundedBox args={[6.0, 2.8, 0.4]} radius={0.1} position={[0, 4.3, 0]} castShadow>
            <meshStandardMaterial color="#1e293b" roughness={0.6} metalness={0.2} />
          </RoundedBox>
          <mesh position={[0, 4.3, 0.22]}>
            <planeGeometry args={[5.5, 2.3]} />
            <meshStandardMaterial color="#0b1220" emissive="#2bd44f" emissiveIntensity={night ? 1.0 : 0.45} roughness={0.3} />
          </mesh>
        </group>
      )
    case 'doghouse':
      return (
        <group position={[x, 0, z]}>
          <RoundedBox args={[1.6, 1.2, 1.5]} radius={0.07} position={[0, 0.6, 0]} castShadow receiveShadow>
            <meshStandardMaterial color="#c98a4b" roughness={0.9} />
          </RoundedBox>
          <mesh position={[0, 1.42, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
            <coneGeometry args={[1.32, 0.75, 4]} />
            <meshStandardMaterial color="#c9504c" roughness={0.85} />
          </mesh>
          <mesh position={[0, 0.46, 0.76]}><circleGeometry args={[0.38, 18]} /><meshStandardMaterial color="#2e2118" roughness={1} /></mesh>
          <group ref={ref} position={[1.3, 0.3, 0.55]}>
            <mesh castShadow><capsuleGeometry args={[0.19, 0.3, 4, 12]} /><meshStandardMaterial color="#f0d9a8" roughness={0.9} /></mesh>
            <mesh position={[0, 0.3, 0.18]} castShadow><sphereGeometry args={[0.21, 14, 12]} /><meshStandardMaterial color="#f0d9a8" roughness={0.9} /></mesh>
            <mesh position={[0, 0.28, 0.38]}><sphereGeometry args={[0.07, 8, 6]} /><meshStandardMaterial color="#3b2b20" roughness={0.4} /></mesh>
            {[-1, 1].map((s) => (
              <mesh key={s} position={[s * 0.14, 0.45, 0.13]} rotation={[0, 0, s * 0.4]}><coneGeometry args={[0.08, 0.18, 6]} /><meshStandardMaterial color="#c9a06a" roughness={0.9} /></mesh>
            ))}
            <mesh position={[0, 0.1, -0.28]} rotation={[0.6, 0, 0]}><capsuleGeometry args={[0.05, 0.18, 3, 6]} /><meshStandardMaterial color="#f0d9a8" /></mesh>
          </group>
        </group>
      )
    case 'shuttlepile':
      return (
        <group position={[x, 0, z]}>
          <mesh position={[0, 0.38, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[0.44, 0.44, 0.76, 16]} />
            <meshStandardMaterial color="#f2ede0" roughness={0.55} />
          </mesh>
          <mesh position={[0, 0.78, 0]}><cylinderGeometry args={[0.46, 0.46, 0.06, 16]} /><meshStandardMaterial color="#4f9d55" roughness={0.6} /></mesh>
          {[...Array(6)].map((_, i) => (
            <group key={i} position={[Math.cos(i * 1.05) * 0.78, 0.1, Math.sin(i * 1.05) * 0.78]} rotation={[Math.PI / 2.3, i, 0]}>
              <mesh castShadow><sphereGeometry args={[0.065, 10, 8]} /><meshStandardMaterial color="#f8f8f8" roughness={0.5} /></mesh>
              <mesh position={[0, 0.12, 0]}><coneGeometry args={[0.11, 0.22, 12, 1, true]} /><meshStandardMaterial color="#ffffff" transparent opacity={0.92} side={THREE.DoubleSide} roughness={0.85} /></mesh>
            </group>
          ))}
        </group>
      )
    default: return null
  }
}

// -----------------------------------------------------------------------------------
export default function Village({ owned = {}, courtRows = 1, night = false, quality = 'mid', courtBoxes = [], villageLv = 1, trophyCount = 0 }) {
  const soil = useMemo(() => repeat(soilTexture(), 2, 8), [])
  const backZ = -(12 + courtRows * 13)

  const keepOut = useMemo(
    () => [...courtBoxes, [0, 17, 2.6, 12], [-16, 16, 6, 5], [22, 18, 5.5, 5.5], [0, WAIT_Z + 3, 12, 6]],
    [courtBoxes]
  )

  const dense = quality !== 'low'

  return (
    <group>
      <Terrain flatRadius={Math.max(30, 18 + courtRows * 13)} />
      <Beach />
      <Ocean night={night} />
      <FarIslands night={night} />

      {/* 입구 길 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 18]} receiveShadow>
        <planeGeometry args={[3.8, 16]} />
        <meshStandardMaterial map={soil} roughness={1} />
      </mesh>
      {[...Array(9)].map((_, i) => (
        <group key={i}>
          <mesh position={[-2.1, 0.06, 11 + i * 1.8]} rotation={[0, i, 0]} castShadow>
            <dodecahedronGeometry args={[0.2, 0]} />
            <meshStandardMaterial color="#b9b2a3" roughness={0.95} flatShading />
          </mesh>
          <mesh position={[2.1, 0.06, 11 + i * 1.8]} rotation={[0, i + 1, 0]} castShadow>
            <dodecahedronGeometry args={[0.2, 0]} />
            <meshStandardMaterial color="#b9b2a3" roughness={0.95} flatShading />
          </mesh>
        </group>
      ))}

      {dense && <GrassTufts count={quality === 'high' ? 1500 : 850} keepOut={keepOut} />}
      {dense && <Flowers count={quality === 'high' ? 220 : 130} keepOut={keepOut} />}
      {dense && <Rocks count={quality === 'high' ? 38 : 22} keepOut={keepOut} />}

      {/* 대기석 */}
      {[-7, 0, 7].map((x) => <Bench key={x} position={[x, WAIT_Z + 4.6]} rotation={Math.PI} />)}
      <Bleachers position={[-13.5, WAIT_Z + 5.5]} rotation={Math.PI} />
      <Bleachers position={[13.5, WAIT_Z + 5.5]} rotation={Math.PI} />

      <Clubhouse position={[-17, 16]} />
      <Pond position={[22, 18]} />

      {/* 나무 · 덤불 */}
      <Tree position={[26, 12]} scale={1.3} seed={1} />
      <Tree position={[28, 4]} scale={1.05} kind="pine" seed={2} />
      <Tree position={[-27, 8]} scale={1.15} seed={3} />
      <Tree position={[-28, -2]} scale={0.95} kind="pine" seed={4} />
      <Tree position={[27, -4]} scale={1.2} seed={6} />
      <Tree position={[-12, 24]} scale={1.0} seed={8} />
      <Tree position={[12, 24]} scale={1.1} seed={10} />
      <Tree position={[-24, backZ + 4]} scale={1.25} seed={12} />
      <Tree position={[24, backZ + 4]} scale={1.15} kind="pine" seed={13} />
      {dense && [[20, 24], [-21, 23], [25, -10], [-25, -10], [-8, 26], [8, 26]].map((p, i) => (
        <Bush key={i} position={p} scale={0.9 + (i % 3) * 0.25} color={i % 2 ? '#4a9c4f' : '#3f8b45'} />
      ))}

      <Fence backZ={backZ} />

      {/* 코트 옆 가로등 */}
      <StreetLamp position={[-11, 6]} on={night} />
      <StreetLamp position={[11, 6]} on={night} />

      {/* 입구 아치 */}
      <group position={[GATE[0], 0, GATE[1] + 3]}>
        {[-2.0, 2.0].map((x) => (
          <mesh key={x} position={[x, 1.45, 0]} castShadow>
            <cylinderGeometry args={[0.17, 0.22, 2.9, 10]} />
            <meshStandardMaterial color="#8a5a3b" roughness={0.9} />
          </mesh>
        ))}
        <mesh position={[0, 3.05, 0]} castShadow>
          <boxGeometry args={[4.8, 0.5, 0.4]} />
          <meshStandardMaterial color="#2f7d55" roughness={0.8} />
        </mesh>
        <mesh position={[0, 3.05, 0.22]} scale={0.42}>
          <torusGeometry args={[0.5, 0.08, 8, 22]} />
          <meshStandardMaterial color="#ffd166" metalness={0.5} roughness={0.35} />
        </mesh>
        {[-1, 1].map((s) => (
          <mesh key={s} position={[s * 2.0, 2.95, 0]} castShadow>
            <sphereGeometry args={[0.24, 12, 10]} />
            <meshStandardMaterial color="#ffd166" metalness={0.4} roughness={0.4} />
          </mesh>
        ))}
      </group>

      {DECORS.filter((d) => owned[d.id]).map((d) => <Decor key={d.id} item={d} night={night} />)}

      {/* ── 마을 발전도 보상 ── */}
      {villageLv >= 2 && (
        <>
          <Bunting from={[-6.5, 2.7, 12.5]} to={[6.5, 2.7, 12.5]} />
          <Bunting from={[-8, 2.5, WAIT_Z + 2.2]} to={[8, 2.5, WAIT_Z + 2.2]} sag={0.55} />
        </>
      )}
      {villageLv >= 3 && (
        <>
          <Tree position={[-5.2, 15]} kind="sakura" scale={0.95} seed={31} />
          <Tree position={[5.2, 15]} kind="sakura" scale={0.9} seed={32} />
          <Tree position={[-5.2, 21]} kind="sakura" scale={0.88} seed={33} />
          <Tree position={[5.2, 21]} kind="sakura" scale={0.96} seed={34} />
        </>
      )}
      {villageLv >= 4 && <Balloon />}
      {villageLv >= 5 && <GoldenShuttle night={night} />}

      <TrophyStand count={trophyCount} />
    </group>
  )
}
