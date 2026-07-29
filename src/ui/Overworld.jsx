// ===================================================================================
// 셔틀몬스터 — 필드 화면 (HD-2D)
//
// 도트 스프라이트를 실제 3D 공간에 세운다. 그리기는 Scene3D 가 맡고,
// 여기서는 화면을 감싸고 지역 이름표만 띄운다.
// ===================================================================================
import { useEffect, useState } from 'react'
import { world } from '../pixel/engine.js'
import Scene3D from '../hd2d/Scene3D.jsx'

export default function Overworld() {
  const [banner, setBanner] = useState(null)

  // 지도가 바뀌면 지역 이름표를 띄운다
  useEffect(() => {
    let last = null
    const id = setInterval(() => {
      if (world.banner !== last) {
        last = world.banner
        setBanner(world.banner ? { ...world.banner } : null)
      }
    }, 120)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="ow-wrap">
      <Scene3D />
      {banner && (
        <div className="place-plate" key={banner.label}>
          <b>{banner.label}</b>
          <span>{banner.sub}</span>
        </div>
      )}
    </div>
  )
}
