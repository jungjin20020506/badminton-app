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
  camera = [0, 1.25, 2.5],
  target = [0, 0.95, 0],
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
  root.unmount()
  return url
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
