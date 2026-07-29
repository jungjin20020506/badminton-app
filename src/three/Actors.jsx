// ===================================================================================
// Actor — 선수 한 명의 "움직임". 목표 지점으로 걸어가고, 도착하면 스토어에 알린다.
// (대기석 → 코트 → 경기 → 대기석 복귀 흐름이 여기서 눈에 보이게 된다)
// ===================================================================================
import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import Character from './Character.jsx'
import { useGame } from '../game/store.js'
import { courtLayout, slotPosition, slotFacing, waitPosition, GATE } from '../game/layout.js'

const SPEED = 3.1

function Actor({ player, target, facing, anim, simple, showTag, onClick }) {
  const g = useRef()
  const arrived = useRef(false)
  const started = useRef(false)
  const cur = useMemo(() => new THREE.Vector3(GATE[0] + (Math.random() - 0.5) * 3, 0, GATE[1] + Math.random() * 3), [])
  const seed = useMemo(() => Math.floor(Math.random() * 100), [])
  const moving = useRef(false)

  const arrive = useGame((s) => s.arrive)

  useFrame((_, dt) => {
    if (!g.current) return
    if (!started.current) {
      g.current.position.copy(cur)
      started.current = true
    }
    const tx = target[0]
    const tz = target[1]
    const dx = tx - g.current.position.x
    const dz = tz - g.current.position.z
    const dist = Math.hypot(dx, dz)

    if (dist > 0.14) {
      moving.current = true
      arrived.current = false
      const step = Math.min(dist, SPEED * Math.min(dt, 0.05))
      g.current.position.x += (dx / dist) * step
      g.current.position.z += (dz / dist) * step
      const want = Math.atan2(dx, dz)
      const cr = g.current.rotation.y
      let diff = ((want - cr + Math.PI * 3) % (Math.PI * 2)) - Math.PI
      g.current.rotation.y = cr + diff * Math.min(1, dt * 9)
    } else {
      moving.current = false
      const want = facing
      const cr = g.current.rotation.y
      let diff = ((want - cr + Math.PI * 3) % (Math.PI * 2)) - Math.PI
      g.current.rotation.y = cr + diff * Math.min(1, dt * 6)
      if (!arrived.current) {
        arrived.current = true
        if (player.status === 'walking') arrive(player.id)
      }
    }
  })

  const finalAnim = moving.current ? 'walk' : anim

  return (
    <group ref={g}>
      <Character
        look={player.look}
        gender={player.gender}
        name={player.name}
        level={player.level}
        isMe={player.isMe}
        anim={finalAnim}
        seed={seed}
        simple={simple}
        showTag={showTag}
        onClick={(e) => {
          e.stopPropagation()
          onClick(player.id)
        }}
      />
    </group>
  )
}

export default function Actors() {
  const players = useGame((s) => s.players)
  const order = useGame((s) => s.order)
  const courts = useGame((s) => s.courts)
  const courtCount = useGame((s) => s.courtCount)
  const history = useGame((s) => s.history)
  const selectPlayer = useGame((s) => s.selectPlayer)
  const roam = useGame((s) => s.roam)

  const layout = useMemo(() => courtLayout(courtCount), [courtCount])
  const list = order.map((id) => players[id]).filter(Boolean)

  // 대기 중인 선수들의 자리 번호
  const waitIndex = {}
  let wi = 0
  list.forEach((p) => {
    if (p.status === 'waiting') waitIndex[p.id] = wi++
  })
  let ri = 0
  const restIndex = {}
  list.forEach((p) => {
    if (p.status === 'resting') restIndex[p.id] = ri++
  })

  const simpleMode = list.length > 16
  const recent = history[0]
  const celebrateIds = new Set()
  if (recent && Date.now() - recent.at < 4200) {
    const winners = recent.winner === 0 ? recent.teamA : recent.teamB
    winners.forEach((id) => celebrateIds.add(id))
  }

  return (
    <group>
      {list.map((p) => {
        let target
        let facing = Math.PI
        let anim = 'idle'

        if ((p.status === 'walking' || p.status === 'oncourt') && p.courtId != null && layout[p.courtId]) {
          target = slotPosition(layout[p.courtId], p.slot)
          facing = slotFacing(p.slot)
          const c = courts[p.courtId]
          anim = c && c.status === 'playing' ? 'play' : 'idle'
        } else if (p.status === 'resting') {
          const i = restIndex[p.id] ?? 0
          target = [-13.5 + (i % 4) * 1.6, 19.5 + Math.floor(i / 4) * 1.8]
          facing = Math.PI * 0.85
        } else if (p.isMe && roam) {
          // 내가 잔디밭을 탭해 직접 찍은 자리 (코트 밖만 가능)
          target = roam
          facing = Math.PI
          anim = celebrateIds.has(p.id) ? 'cheer' : 'idle'
        } else {
          const i = waitIndex[p.id] ?? 0
          target = waitPosition(i)
          facing = Math.PI + (((i * 37) % 20) - 10) * 0.02
          anim = celebrateIds.has(p.id) ? 'cheer' : 'idle'
        }

        const onCourt = p.status === 'oncourt' || p.status === 'walking'
        return (
          <Actor
            key={p.id}
            player={p}
            target={target}
            facing={facing}
            anim={anim}
            simple={simpleMode && !p.isMe && !onCourt}
            showTag={!simpleMode || p.isMe || onCourt}
            onClick={selectPlayer}
          />
        )
      })}
    </group>
  )
}
