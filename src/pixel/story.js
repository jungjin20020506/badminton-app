// ===================================================================================
// 셔틀몬스터 — 오프닝 이야기
//
// 포켓몬스터의 시작이 「집에서 나오면 박사가 데리러 오는」 것처럼,
// 여기서도 첫 걸음을 혼자 두지 않는다.
//
//   ① 내 방에서 눈을 뜬다
//   ② 마을로 나오면 안내원 코코가 달려와 말을 건다
//   ③ 코코가 가리킨 체육관까지 간다 (문 위에 화살표가 떠 있다)
//   ④ 체육관 관장이 오늘 열린 경기방을 보여 준다
//   ⑤ 경기방에 입장하면 이야기 끝 — 이제부터가 진짜 배드민턴이다
// ===================================================================================
import { useGame, TUTORIAL } from '../game/store.js'
import { useTalk } from './talk.js'
import { getScript } from './scripts.js'
import { world } from './engine.js'

const faceOf = (npcId) => {
  const n = world.npcs.find((x) => x.id === npcId)
  return n ? { look: n.look, gender: n.gender } : null
}
const nameOf = (npcId) => world.npcs.find((x) => x.id === npcId)?.name || ''

/** 지도를 열 때마다 불린다 — 이야기할 차례면 알아서 말을 건다 */
export function onMapEnter(mapId) {
  const s = useGame.getState()
  const step = s.tutorial ?? TUTORIAL.done
  if (step >= TUTORIAL.done) return
  if (useTalk.getState().open) return

  // ① 첫 아침 — 내 방
  if (mapId === 'home' && step === TUTORIAL.wake) {
    useGame.getState().setTutorial(TUTORIAL.toTown)
    setTimeout(() => useTalk.getState().start('', getScript('storyWake')), 420)
    return
  }

  // ② 마을로 나옴 — 코코가 달려온다
  if (mapId === 'town' && step <= TUTORIAL.toTown) {
    const koko = world.npcs.find((n) => n.id === 'koko')
    if (koko) {
      // 플레이어 옆으로 옮겨 세우고 이쪽을 보게 한다
      const p = world.player
      const spot = [[p.x + 1, p.y], [p.x - 1, p.y], [p.x, p.y + 1]].find(
        ([x, y]) => world.map.solid[y]?.[x] === 0
      )
      if (spot) {
        koko.x = koko.fx = koko.hx = spot[0]
        koko.y = koko.fy = koko.hy = spot[1]
        koko.from = [spot[0], spot[1]]
        koko.dir = spot[0] > p.x ? 2 : spot[0] < p.x ? 3 : 1
        koko.wander = 0
      }
    }
    useGame.getState().setTutorial(TUTORIAL.toGym)
    setTimeout(() => useTalk.getState().start(nameOf('koko') || '안내원 코코', getScript('storyKoko'), faceOf('koko')), 420)
    return
  }

  // ④ 체육관 도착 — 관장이 경기방을 보여 준다
  if (mapId === 'gym' && step === TUTORIAL.toGym) {
    useGame.getState().setTutorial(TUTORIAL.toRoom)
    setTimeout(() => useTalk.getState().start(nameOf('leader') || '관장 태호', getScript('storyLeader'), faceOf('leader')), 420)
  }
}

/** 지금 화면에서 어디로 가야 하는지 (필드 위 화살표 · HUD 안내에 쓴다) */
export function currentGoal() {
  const s = useGame.getState()
  const step = s.tutorial ?? TUTORIAL.done
  if (s.online?.status === 'room') return null
  if (step >= TUTORIAL.done) return null
  if (step === TUTORIAL.wake || step === TUTORIAL.toTown) {
    return world.mapId === 'home'
      ? { map: 'home', tile: [5, 10], text: '문으로 나가 보자' }
      : { map: 'town', tile: [19, 9], text: '셔틀 체육관으로 가자' }
  }
  if (step === TUTORIAL.toGym) {
    return world.mapId === 'town'
      ? { map: 'town', tile: [19, 9], text: '셔틀 체육관으로 가자' }
      : { map: 'town', tile: null, text: '마을로 나가 체육관을 찾자' }
  }
  if (step === TUTORIAL.toRoom) {
    return world.mapId === 'gym'
      ? { map: 'gym', tile: [10, 23], text: '관장에게 경기방을 물어보자' }
      : { map: 'gym', tile: null, text: '체육관으로 돌아가자' }
  }
  return null
}
