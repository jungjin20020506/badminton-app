// ===================================================================================
// 셔틀몬스터 — 필드 화면
//
// 캔버스는 「작은 논리 해상도」로 그린 뒤 CSS 로 확대한다(image-rendering: pixelated).
// 그래서 어떤 화면 크기에서도 도트가 뭉개지지 않고 각지게 보인다.
// ===================================================================================
import { useEffect, useRef, useState } from 'react'
import { world, update, render, loadMap, restorePos } from '../pixel/engine.js'
import { TILE } from '../pixel/tileset.js'
import { useGame } from '../game/store.js'

// 짧은 쪽에 대략 몇 칸을 보여 줄지 — 작을수록 확대돼 보인다
const TILES_ON_SHORT_SIDE = 11

export default function Overworld() {
  const ref = useRef(null)
  const [banner, setBanner] = useState(null)
  const booted = useGame((s) => s.booted)

  useEffect(() => {
    if (!booted) return
    const saved = restorePos()
    loadMap(saved.mapId, saved.x, saved.y, saved.dir)
  }, [booted])

  useEffect(() => {
    const cv = ref.current
    if (!cv) return
    const ctx = cv.getContext('2d')
    let raf = 0
    let last = performance.now()
    let lastBanner = null

    // 화면 크기 → 논리 해상도. 창이 아직 크기를 못 받은 순간(0/NaN)에는 건너뛰고
    // 매 프레임 다시 확인해서, 어떤 상황에서도 캔버스가 0x0 으로 남지 않게 한다.
    const resize = () => {
      const box = cv.parentElement
      const vw = box?.clientWidth || window.innerWidth
      const vh = box?.clientHeight || window.innerHeight
      if (!vw || !vh) return
      const unit = Math.min(vw, vh) / (TILES_ON_SHORT_SIDE * TILE)
      if (!unit || !isFinite(unit)) return
      const w = Math.max(320, Math.min(1100, Math.round(vw / unit)))
      const h = Math.max(320, Math.min(1500, Math.round(vh / unit)))
      if (cv.width !== w || cv.height !== h) {
        cv.width = w
        cv.height = h
        ctx.imageSmoothingEnabled = false
      }
    }
    resize()
    window.addEventListener('resize', resize)
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null
    if (ro && cv.parentElement) ro.observe(cv.parentElement)

    const loop = (now) => {
      raf = requestAnimationFrame(loop)
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      if (!cv.width || !cv.height) resize()
      update(dt)
      render(ctx, cv.width, cv.height)
      if (world.banner !== lastBanner) {
        lastBanner = world.banner
        setBanner(world.banner ? { ...world.banner } : null)
      }
    }
    raf = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      ro?.disconnect()
    }
  }, [])

  return (
    <div className="ow-wrap">
      <canvas ref={ref} className="ow-canvas" />
      {banner && (
        <div className="place-plate" key={banner.label}>
          <b>{banner.label}</b>
          <span>{banner.sub}</span>
        </div>
      )}
    </div>
  )
}
