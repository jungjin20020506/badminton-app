// ===================================================================================
// 개발용 캐릭터 촬영 도구
//
// 브라우저 탭이 화면에 안 보이면 requestAnimationFrame 이 멈춰서 3D가 렌더되지 않는다.
// 그래서 크기를 직접 지정한 별도 렌더 루트를 만들고, 프레임을 수동으로 돌려서
// 캐릭터 모습을 이미지로 뽑는다. (개발 서버에서만 쓰인다)
//
//   const m = await import('/src/devtools/charShot.jsx')
//   await m.shootSheet()   // .snapshots/character.png 로 저장
// ===================================================================================
import * as THREE from 'three'
import { createRoot, advance } from '@react-three/fiber'
import Character from '../three/Character.jsx'
import { defaultLook } from '../game/store.js'

function Stage({ look, gender, anim }) {
  return (
    <>
      <color attach="background" args={['#cfe9d8']} />
      <hemisphereLight args={['#ffffff', '#6f9a63', 1.1]} />
      <directionalLight
        position={[3.5, 6, 4]}
        intensity={2.4}
        color="#fff4dc"
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-3}
        shadow-camera-right={3}
        shadow-camera-top={3}
        shadow-camera-bottom={-3}
      />
      {/* 뒤에서 비추는 빛 — 실루엣이 살아난다 */}
      <directionalLight position={[-3, 3, -4]} intensity={1.1} color="#bfe0ff" />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[3, 32]} />
        <meshStandardMaterial color="#8fd67f" roughness={1} />
      </mesh>
      <group position={[0, 0, 0]}>
        <Character look={look} gender={gender} anim={anim} seed={3} />
      </group>
    </>
  )
}

/**
 * 캐릭터 한 컷을 그려서 dataURL 로 돌려준다.
 */
export async function shoot({
  look = defaultLook('남'),
  gender = '남',
  anim = 'idle',
  width = 420,
  height = 560,
  frames = 40,
  camera = [0, 1.0, 3.3],
  target = [0, 0.72, 0],
} = {}) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const root = createRoot(canvas)
  root.configure({
    size: { width, height, top: 0, left: 0 },
    frameloop: 'never',
    dpr: 2,
    shadows: true,
    gl: {
      antialias: true,
      preserveDrawingBuffer: true,
      toneMapping: THREE.ACESFilmicToneMapping,
      toneMappingExposure: 1.05,
    },
    camera: { position: camera, fov: 32, near: 0.1, far: 100 },
    onCreated: (state) => {
      state.camera.lookAt(...target)
      state.camera.updateProjectionMatrix()
    },
  })
  root.render(<Stage look={look} gender={gender} anim={anim} />)

  // React 커밋을 기다린 뒤 프레임을 수동으로 진행 (애니메이션이 자리를 잡게)
  await new Promise((r) => setTimeout(r, 120))
  const t0 = performance.now()
  for (let i = 0; i < frames; i++) advance(t0 + i * 16.7, true)

  const url = canvas.toDataURL('image/png')
  disposeRoot(root)
  return url
}

/**
 * 옷장(CharacterCreator) 미리보기와 완전히 동일한 카메라·조명·배치로 찍는다.
 * 여기서 보이는 그대로가 사용자 화면이다 — 캐릭터 수정은 반드시 이걸로 확인한다.
 */
export async function shootCreatorView({ look = defaultLook('남'), gender = '남', yaw = 0, width = 360, height = 460 } = {}) {
  function CreatorStage() {
    return (
      <>
        <color attach="background" args={['#d8f0e2']} />
        <hemisphereLight args={['#fff6e8', '#7aa86a', 1.1]} />
        <directionalLight position={[2.5, 5, 3.5]} intensity={2.1} color="#fff2d9" castShadow shadow-mapSize={[1024, 1024]} />
        <directionalLight position={[-3, 2.5, -3]} intensity={0.7} color="#cfe6ff" />
        <group position={[0, -0.68, 0]} rotation={[0, yaw, 0]}>
          <Character look={look} gender={gender} anim="idle" seed={7} />
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]} receiveShadow>
            <circleGeometry args={[1.1, 28]} />
            <meshStandardMaterial color="#8fd67f" roughness={1} />
          </mesh>
        </group>
      </>
    )
  }
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const root = createRoot(canvas)
  root.configure({
    size: { width, height, top: 0, left: 0 },
    frameloop: 'never', dpr: 2, shadows: true,
    gl: { antialias: true, preserveDrawingBuffer: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.05 },
    camera: { position: [0, 0.25, 2.35], fov: 36, near: 0.1, far: 100 },
    onCreated: (st) => { st.camera.lookAt(0, 0.08, 0); st.camera.updateProjectionMatrix() },
  })
  root.render(<CreatorStage />)
  await new Promise((r) => setTimeout(r, 120))
  const t0 = performance.now()
  for (let i = 0; i < 30; i++) advance(t0 + i * 16.7, true)
  const url = canvas.toDataURL('image/png')
  disposeRoot(root)
  return url
}

/** 옷장 구도로 여러 캐릭터 × 여러 각도 시트 저장 */
export async function shootCreatorSheet(looks, name = 'creator.png', yaws = [0, Math.PI * 0.35, Math.PI]) {
  const W = 300
  const H = 384
  const c = document.createElement('canvas')
  c.width = W * looks.length
  c.height = H * yaws.length
  const g = c.getContext('2d')
  for (let i = 0; i < looks.length; i++) {
    for (let j = 0; j < yaws.length; j++) {
      const url = await shootCreatorView({ ...looks[i], yaw: yaws[j], width: W, height: H })
      const img = new Image()
      await new Promise((r) => { img.onload = r; img.src = url })
      g.drawImage(img, i * W, j * H, W, H)
    }
    g.fillStyle = '#20301f'
    g.font = 'bold 16px "Malgun Gothic", sans-serif'
    g.fillText(looks[i].label || '', i * W + 10, 22)
  }
  return save(name, c.toDataURL('image/png'))
}

/** 동작(애니메이션)을 시간대별로 여러 컷 찍어 한 장에 모은다 */
export async function shootMotion(anim = 'play', name = 'motion.png', shots = 6) {
  const W = 260
  const H = 340
  const look = { ...defaultLook('남'), hair: 'short', top: '#3b82f6' }
  const c = document.createElement('canvas')
  c.width = W * shots
  c.height = H
  const g = c.getContext('2d')
  for (let i = 0; i < shots; i++) {
    // 프레임 수를 달리해 애니메이션의 서로 다른 순간을 잡는다
    const url = await shoot({
      look, gender: '남', anim, width: W, height: H,
      frames: 6 + i * 7, camera: [1.6, 1.0, 2.6], target: [0, 0.72, 0],
    })
    const img = new Image()
    await new Promise((r) => { img.onload = r; img.src = url })
    g.drawImage(img, i * W, 0, W, H)
  }
  return save(name, c.toDataURL('image/png'))
}

/** WebGL 컨텍스트는 브라우저당 개수 제한이 있어서 반드시 놓아줘야 한다 */
function disposeRoot(root) {
  try {
    const st = root.getState?.()
    root.unmount()
    st?.gl?.dispose?.()
    st?.gl?.forceContextLoss?.()
  } catch {
    /* 이미 정리됨 */
  }
}

const save = (name, dataUrl) =>
  fetch('/__save', { method: 'POST', body: JSON.stringify({ name, dataUrl }) }).then((r) => r.text())

/** 여러 종류를 한 장에 모아 저장 */
export async function shootSheet(name = 'character.png') {
  const looks = [
    { label: '남 · 숏컷', gender: '남', look: { ...defaultLook('남'), hair: 'short', eyes: 'oval', top: '#3b82f6', bottom: '#1f2937' } },
    { label: '여 · 포니테일', gender: '여', look: { ...defaultLook('여'), hair: 'ponytail', hairColor: '#7b4b26', eyes: 'sparkle', top: '#ff8fa3', bottom: '#ffffff' } },
    { label: '남 · 스파이키', gender: '남', look: { ...defaultLook('남'), hair: 'spiky', hairColor: '#2b1d16', eyes: 'sharp', top: '#22c55e', bottom: '#1f2937', acc: 'headband' } },
    { label: '여 · 단발', gender: '여', look: { ...defaultLook('여'), hair: 'bob', hairColor: '#2b1d16', eyes: 'happy', top: '#facc15', bottom: '#3b82f6' } },
  ]
  const W = 420
  const H = 560
  const c = document.createElement('canvas')
  c.width = W * looks.length
  c.height = H
  const g = c.getContext('2d')

  for (let i = 0; i < looks.length; i++) {
    const url = await shoot({ look: looks[i].look, gender: looks[i].gender, anim: 'idle' })
    const img = new Image()
    await new Promise((r) => { img.onload = r; img.src = url })
    g.drawImage(img, i * W, 0, W, H)
    g.fillStyle = '#20301f'
    g.font = 'bold 20px "Malgun Gothic", sans-serif'
    g.fillText(looks[i].label, i * W + 14, 30)
  }
  return save(name, c.toDataURL('image/png'))
}

/**
 * 마을 전체 촬영 — 지형·코트·선수까지 실제 컴포넌트를 그대로 쓴다.
 * 스토어에 선수를 채워 넣고 프레임을 돌려 자리를 잡게 한 뒤 찍는다.
 */
export async function shootVillage(name = 'village.png', { width = 1000, height = 640, camera = [0, 14, 26], target = [0, 1, 0], frames = 200 } = {}) {
  const [{ useGame }, Village, Court, Actors, layout] = await Promise.all([
    import('../game/store.js'),
    import('../three/Village.jsx').then((m) => m.default),
    import('../three/Court.jsx').then((m) => m.default),
    import('../three/Actors.jsx').then((m) => m.default),
    import('../game/layout.js'),
  ])

  const s = useGame.getState()
  if (Object.keys(s.players).length < 6) s.addRandomPlayers(10)
  useGame.setState({ screen: 'village' })
  const courts = layout.courtLayout(useGame.getState().courtCount)

  function VillageStage() {
    const owned = useGame((st) => st.owned)
    const cs = useGame((st) => st.courts)
    return (
      <>
        <color attach="background" args={['#bfe6f7']} />
        <hemisphereLight args={['#dff0ff', '#5d8a4a', 1.1]} />
        <directionalLight
          position={[26, 34, 18]} intensity={2.5} color="#fff4dc" castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-camera-left={-34} shadow-camera-right={34}
          shadow-camera-top={34} shadow-camera-bottom={-34} shadow-camera-far={140}
          shadow-normalBias={0.035}
        />
        <directionalLight position={[-20, 16, -18]} intensity={0.5} color="#cfe4ff" />
        <fog attach="fog" args={['#d6ecff', 62, 132]} />
        <Village owned={owned} courtRows={1} night={false} quality="high"
          courtBoxes={courts.map((c) => [c.x, c.z, layout.COURT_WID / 2 + 1.6, layout.COURT_LEN / 2 + 1.6])} />
        {courts.map((c) => (
          <Court key={c.id} court={cs[c.id]} x={c.x} z={c.z} skinId="green" speed={1} />
        ))}
        <Actors />
      </>
    )
  }

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const root = createRoot(canvas)
  root.configure({
    size: { width, height, top: 0, left: 0 },
    frameloop: 'never', dpr: 1.5, shadows: true,
    gl: { antialias: true, preserveDrawingBuffer: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.06 },
    camera: { position: camera, fov: 40, near: 0.5, far: 300 },
    onCreated: (st) => { st.camera.lookAt(...target); st.camera.updateProjectionMatrix() },
  })
  root.render(<VillageStage />)

  await new Promise((r) => setTimeout(r, 400))
  // 선수들이 걸어가 자리를 잡도록 실제 시간을 흘려보내며 프레임 진행
  for (let i = 0; i < frames; i++) {
    advance(performance.now(), true)
    if (i % 20 === 0) await new Promise((r) => setTimeout(r, 16))
  }
  const url = canvas.toDataURL('image/png')
  disposeRoot(root)
  return save(name, url)
}

/**
 * 조작 확인용 — 스틱을 실제로 기울인 채 프레임을 돌려서
 * 내 캐릭터가 그 방향으로 걸어/뛰어가는지 위치와 그림으로 확인한다.
 *   await m.shootDrive('drive.png', { dir: [0, -1], mag: 1, seconds: 1.6 })
 */
export async function shootDrive(name = 'drive.png', { dir = [0, -1], mag = 1, seconds = 1.5, width = 760, height = 500 } = {}) {
  const [{ useGame }, Village, Court, Actors, layout, controls] = await Promise.all([
    import('../game/store.js'),
    import('../three/Village.jsx').then((m) => m.default),
    import('../three/Court.jsx').then((m) => m.default),
    import('../three/Actors.jsx').then((m) => m.default),
    import('../game/layout.js'),
    import('../game/controls.js'),
  ])

  const s = useGame.getState()
  if (Object.keys(s.players).length < 6) s.addRandomPlayers(10)
  useGame.setState({ screen: 'village' })
  const courts = layout.courtLayout(useGame.getState().courtCount)

  function Stage2() {
    const owned = useGame((st) => st.owned)
    const cs = useGame((st) => st.courts)
    return (
      <>
        <color attach="background" args={['#bfe6f7']} />
        <hemisphereLight args={['#dff0ff', '#5d8a4a', 1.1]} />
        <directionalLight position={[26, 34, 18]} intensity={2.5} color="#fff4dc" castShadow shadow-mapSize={[2048, 2048]}
          shadow-camera-left={-34} shadow-camera-right={34} shadow-camera-top={34} shadow-camera-bottom={-34} shadow-camera-far={140} />
        <directionalLight position={[-20, 16, -18]} intensity={0.5} color="#cfe4ff" />
        <Village owned={owned} courtRows={1} night={false} quality="high"
          courtBoxes={courts.map((c) => [c.x, c.z, layout.COURT_WID / 2 + 1.6, layout.COURT_LEN / 2 + 1.6])} />
        {courts.map((c) => (<Court key={c.id} court={cs[c.id]} x={c.x} z={c.z} skinId="green" speed={1} />))}
        <Actors />
      </>
    )
  }

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const root = createRoot(canvas)
  root.configure({
    size: { width, height, top: 0, left: 0 },
    frameloop: 'never', dpr: 1.5, shadows: true,
    gl: { antialias: true, preserveDrawingBuffer: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.06 },
    // 카메라는 캐릭터에서 충분히 떨어뜨린다 (가까우면 "화면 위쪽" 방향이 불안정해진다)
    camera: { position: [0, 15, 42], fov: 40, near: 0.5, far: 300 },
    onCreated: (st) => { st.camera.lookAt(0, 1, 8); st.camera.updateProjectionMatrix() },
  })
  root.render(<Stage2 />)
  await new Promise((r) => setTimeout(r, 400))

  // 먼저 선수들이 자리를 잡게 한다
  for (let i = 0; i < 90; i++) {
    advance(performance.now(), true)
    await new Promise((r) => setTimeout(r, 8))
  }
  const from = { x: +controls.myPos.x.toFixed(2), z: +controls.myPos.z.toFixed(2) }

  // 스틱을 기울인 채 실제 시간을 흘려보낸다
  controls.setStick(dir[0], dir[1], mag)
  const t0 = performance.now()
  let run = false
  while (performance.now() - t0 < seconds * 1000) {
    advance(performance.now(), true)
    run = controls.myPos.run
    await new Promise((r) => setTimeout(r, 12))
  }
  const to = { x: +controls.myPos.x.toFixed(2), z: +controls.myPos.z.toFixed(2) }
  controls.clearStick()
  for (let i = 0; i < 8; i++) { advance(performance.now(), true); await new Promise((r) => setTimeout(r, 12)) }

  const url = canvas.toDataURL('image/png')
  disposeRoot(root)
  await save(name, url)
  return { from, to, moved: +Math.hypot(to.x - from.x, to.z - from.z).toFixed(2), run, roam: useGame.getState().roam }
}

/** 얼굴 클로즈업 */
export async function shootFace(name = 'character-face.png') {
  const looks = [
    { gender: '남', look: { ...defaultLook('남'), hair: 'short', eyes: 'oval' } },
    { gender: '여', look: { ...defaultLook('여'), hair: 'ponytail', hairColor: '#7b4b26', eyes: 'sparkle' } },
    { gender: '남', look: { ...defaultLook('남'), hair: 'spiky', eyes: 'sharp' } },
  ]
  const W = 380
  const H = 380
  const c = document.createElement('canvas')
  c.width = W * looks.length
  c.height = H
  const g = c.getContext('2d')
  for (let i = 0; i < looks.length; i++) {
    const url = await shoot({
      ...looks[i], width: W, height: H, camera: [0, 1.32, 1.15], target: [0, 1.26, 0],
    })
    const img = new Image()
    await new Promise((r) => { img.onload = r; img.src = url })
    g.drawImage(img, i * W, 0, W, H)
  }
  return save(name, c.toDataURL('image/png'))
}
