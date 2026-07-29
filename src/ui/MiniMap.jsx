// ===================================================================================
// 셔틀몬스터 — 미니맵
//
// 3D 시점이라 내가 지도의 어디쯤 있는지 감이 잘 안 온다. 그래서 오른쪽 위에
// 지도를 축소해 붙이고, 내 위치를 깜빡이는 점으로 찍는다.
// 지도 밑그림은 한 번만 굽고, 그 위에 점만 매 프레임 다시 찍는다.
// ===================================================================================
import { useEffect, useRef, useState } from 'react'
import { world } from '../pixel/engine.js'
import { OBJECTS } from '../pixel/tileset.js'

const MAX = 132 // 미니맵 최대 변 길이(px)

// 타일 문자 → 미니맵 색
const TILE_COLOR = {
  '.': '#4e8b39', ',': '#5b9c42', '"': '#356c2c',
  '=': '#bc9663', _: '#b8b0a0', s: '#ddc596',
  '~': '#3f86dc',
  F: '#c9a06a', f: '#c8d2dc', c: '#c86a9c', G: '#c89a5c',
  W: '#2c3348', w: '#3a4258',
  D: '#ffd21f',
  ' ': '#0b0f1a',
}

/** 지도 밑그림을 한 번 굽는다 */
function bakeMini(map) {
  const scale = Math.max(1, Math.floor(MAX / Math.max(map.w, map.h)))
  const c = document.createElement('canvas')
  c.width = map.w * scale
  c.height = map.h * scale
  const g = c.getContext('2d')
  g.imageSmoothingEnabled = false

  for (let y = 0; y < map.h; y++) {
    for (let x = 0; x < map.w; x++) {
      g.fillStyle = TILE_COLOR[map.rows[y][x]] || '#4e8b39'
      g.fillRect(x * scale, y * scale, scale, scale)
    }
  }
  // 건물은 지붕 색 덩어리로 (어디가 무슨 건물인지 한눈에)
  const ROOF = {
    gymBuilding: '#3c4674', martBuilding: '#2f6fc0', centerBuilding: '#f06888',
    homeBuilding: '#8a6a44', arcadeBuilding: '#8850d8',
  }
  map.objects.forEach((o) => {
    const roof = ROOF[o.kind]
    if (!roof) return
    const def = OBJECTS[o.kind]
    g.fillStyle = roof
    g.fillRect(o.x * scale, (o.y - def.h + 1) * scale, def.w * scale, def.h * scale)
  })
  // 문(워프)은 노란 점
  ;(map.warps || []).forEach((wp) => {
    g.fillStyle = '#ffd21f'
    g.fillRect(wp.x * scale, wp.y * scale, scale, scale)
  })
  // 코트
  if (map.courtSpots) {
    g.fillStyle = '#2f7d55'
    map.courtSpots.forEach((sp) => g.fillRect(sp.x * scale, (sp.y - 8) * scale, 5 * scale, 9 * scale))
  }
  return { canvas: c, scale }
}

export default function MiniMap() {
  const ref = useRef(null)
  const baked = useRef(null)
  const [size, setSize] = useState([MAX, MAX])
  const [label, setLabel] = useState('')

  useEffect(() => {
    let raf = 0
    let lastMap = null
    const loop = () => {
      raf = requestAnimationFrame(loop)
      const map = world.map
      const cv = ref.current
      if (!map || !cv) return

      if (lastMap !== map.id) {
        lastMap = map.id
        baked.current = bakeMini(map)
        setSize([baked.current.canvas.width, baked.current.canvas.height])
        setLabel(map.label)
      }
      const { canvas, scale } = baked.current
      if (cv.width !== canvas.width) { cv.width = canvas.width; cv.height = canvas.height }
      const g = cv.getContext('2d')
      g.imageSmoothingEnabled = false
      g.drawImage(canvas, 0, 0)

      // 주민 · NPC
      const dotAt = (x, y, color, s = 1) => {
        g.fillStyle = color
        g.fillRect(Math.round(x * scale) - s, Math.round(y * scale) - s, scale + s * 2, scale + s * 2)
      }
      world.npcs.forEach((n) => dotAt(n.x, n.y, '#ffffff', 0))
      world.residents.forEach((n) => dotAt(n.x, n.y, '#9fd8ff', 0))

      // 나 — 깜빡이는 빨간 점
      const p = world.player
      const blink = (Math.sin(performance.now() / 260) + 1) / 2
      g.fillStyle = `rgba(255,64,80,${0.55 + blink * 0.45})`
      const px = Math.round(p.x * scale)
      const py = Math.round(p.y * scale)
      g.fillRect(px - 2, py - 2, scale + 4, scale + 4)
      g.fillStyle = '#ffffff'
      g.fillRect(px, py, scale, scale)
      // 보고 있는 방향
      const dx = [0, 0, -1, 1][p.dir] * (scale + 3)
      const dy = [1, -1, 0, 0][p.dir] * (scale + 3)
      g.fillStyle = '#ffd21f'
      g.fillRect(px + dx, py + dy, scale, scale)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <div className="pk-win minimap">
      <canvas ref={ref} width={size[0]} height={size[1]} />
      <span className="mm-label">{label}</span>
    </div>
  )
}
