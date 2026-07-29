// ===================================================================================
// 셔틀몬스터 — 월드 엔진
//
// 포켓몬스터식 「칸 단위 이동」이 핵심이다.
//  · 방향키를 처음 누르면 제자리에서 몸만 돌고(짧은 유예), 계속 누르면 한 칸씩 걷는다
//  · Ⓑ 를 누른 채 걸으면 달린다
//  · 문 앞 매트를 밟으면 화면이 어두워졌다 밝아지며 다른 지도로 넘어간다
//  · Ⓐ 는 「내가 보고 있는 칸」을 조사한다 — 사람이면 대화, 간판이면 읽기
// ===================================================================================
import { TILE, TILES, bakeGround, objectSprite, OBJECTS } from './tileset.js'
import { getMaps, courtSlot } from './maps.js'
import { themeOf, applyThemeToDom, daylightTint } from './palette.js'
import { drawActor } from './sprites.js'
import { useGame, gameTick } from '../game/store.js'
import { villageLevel } from '../game/social.js'
import { useTalk, isTalking } from './talk.js'
import { getScript } from './scripts.js'
import { onMapEnter, currentGoal } from './story.js'

// 방향: 0 아래 / 1 위 / 2 왼쪽 / 3 오른쪽
export const DX = [0, 0, -1, 1]
export const DY = [1, -1, 0, 0]

const WALK = 4.2   // 초당 칸 수
const RUN = 7.6
const TURN_HOLD = 0.09 // 이 시간 안에 방향키를 떼면 몸만 돌린다

// -----------------------------------------------------------------------------------
// 입력
// -----------------------------------------------------------------------------------
export const input = {
  held: new Set(),   // 눌려 있는 방향들
  dir: -1,           // 가장 최근에 눌린 방향
  b: false,
  aQueue: 0,         // Ⓐ 를 누른 횟수(엔진이 소비한다)
}

export function pressDir(d) {
  input.held.add(d)
  input.dir = d
}
export function releaseDir(d) {
  input.held.delete(d)
  if (input.dir === d) input.dir = input.held.size ? [...input.held][input.held.size - 1] : -1
}
export function clearDirs() {
  input.held.clear()
  input.dir = -1
}
export function pressA() {
  // 대화 중이면 대화창이 받아 간다
  const t = useTalk.getState()
  if (t.open) {
    if (t.choices) t.choose()
    else t.advance()
    return
  }
  input.aQueue++
}
export function setRun(v) { input.b = !!v }

// -----------------------------------------------------------------------------------
// 월드 상태
// -----------------------------------------------------------------------------------
export const world = {
  ready: false,
  maps: null,
  mapId: null,
  map: null,
  theme: null,
  ground: null,      // [프레임0, 프레임1]
  player: { x: 0, y: 0, dir: 0, moving: false, prog: 0, from: [0, 0], step: 0, hold: 0 },
  npcs: [],
  residents: [],
  time: 0,
  fade: 0,           // 0 = 밝음, 1 = 완전 암전
  fadeDir: 0,        // -1 어두워지는 중, +1 밝아지는 중
  pending: null,     // 암전 뒤에 갈 곳
  justWarped: true,
  banner: null,      // { label, sub, t }
  residentTimer: 0,
  onBanner: null,    // React 쪽에서 지역 이름표를 띄우게 알려 주는 콜백
}

const groundCache = new Map()

// 개발 중 콘솔에서 월드 상태를 들여다보기 위한 창구
if (import.meta.env.DEV) globalThis.__svWorld = world

// 어디에 서 있었는지 기억한다 — 새로고침해도 그 자리에서 다시 시작
const POS_KEY = 'shuttle-monster-pos-v1'
function savePos() {
  try {
    localStorage.setItem(POS_KEY, JSON.stringify({
      mapId: world.mapId, x: world.player.x, y: world.player.y, dir: world.player.dir,
    }))
  } catch {}
}
export function restorePos() {
  try {
    const d = JSON.parse(localStorage.getItem(POS_KEY) || 'null')
    if (d && d.mapId) return d
  } catch {}
  // 처음 시작은 포켓몬처럼 「내 방」에서 눈을 뜬다
  return { mapId: 'home', x: 5, y: 8, dir: 0 }
}

/** 지도를 연다 */
export function loadMap(id, tx, ty, dir = 0) {
  if (!world.maps) world.maps = getMaps(TILES)
  const map = world.maps[id]
  if (!map) return
  world.mapId = id
  world.map = map
  world.theme = themeOf(map.theme)
  if (!groundCache.has(id)) groundCache.set(id, bakeGround(map.rows, world.theme, { lights: map.lights }))
  world.ground = groundCache.get(id)

  const sp = map.spawn || { x: 1, y: 1, dir: 0 }
  world.player.x = tx ?? sp.x
  world.player.y = ty ?? sp.y
  world.player.dir = dir ?? sp.dir
  world.player.moving = false
  world.player.prog = 0
  world.player.from = [world.player.x, world.player.y]
  // 문 위에 내려섰을 때만 「방금 넘어옴」으로 잠근다.
  // (그래야 되돌아 나갈 때 바로 다시 빨려 들어가지 않는다)
  world.justWarped = map.warpAt.has(`${world.player.x},${world.player.y}`)

  // NPC 를 지도에서 복사해 온다 (원본을 안 건드리려고)
  world.npcs = (map.npcs || []).map((n) => ({
    ...n,
    hx: n.x, hy: n.y,
    fx: n.x, fy: n.y,          // 화면에 그릴 실수 좌표
    moving: false, prog: 0, from: [n.x, n.y], step: 0,
    cool: 1 + Math.random() * 3,
  }))
  buildResidents()
  applyThemeToDom(map.theme)
  world.banner = { label: map.label, sub: themeOf(map.theme).sub, t: 0 }
  world.ready = true
  savePos()
  onMapEnter(id)
}

/** 마을 주민(선수 명단) 을 지도 위에 세운다 */
function buildResidents() {
  const map = world.map
  if (!map) return
  const s = useGame.getState()
  const out = []

  if (map.id === 'gym') {
    // 체육관에서는 배정된 코트 자리에 선다
    const spots = map.courtSpots || []
    s.courts.forEach((c, ci) => {
      const spot = spots[ci]
      if (!spot) return
      c.players.forEach((pid, slot) => {
        const p = pid && s.players[pid]
        if (!p || p.isMe) return
        const pos = courtSlot(spot, slot)
        out.push({
          id: `player:${p.id}`, name: p.name, look: p.look, gender: p.gender,
          fx: pos.x, fy: pos.y, x: Math.round(pos.x), y: Math.round(pos.y),
          dir: pos.dir, moving: false, prog: 0, step: 0, wander: 0,
          script: `player:${p.id}`, oncourt: true,
        })
      })
    })
  } else if (map.roamSpots) {
    const list = s.order.map((id) => s.players[id]).filter((p) => p && !p.isMe && p.status !== 'oncourt')
    map.roamSpots.forEach((spot, i) => {
      const p = list[i]
      if (!p) return
      out.push({
        id: `player:${p.id}`, name: p.name, look: p.look, gender: p.gender,
        hx: spot[0], hy: spot[1],
        x: spot[0], y: spot[1], fx: spot[0], fy: spot[1],
        dir: i % 4, moving: false, prog: 0, from: spot, step: 0,
        wander: p.status === 'resting' ? 0 : 1,
        cool: 1 + Math.random() * 4,
        script: `player:${p.id}`,
      })
    })
  }
  world.residents = out
}

// -----------------------------------------------------------------------------------
// 통행 판정
// -----------------------------------------------------------------------------------
function occupied(x, y, self) {
  for (const n of world.npcs) if (n !== self && n.x === x && n.y === y) return true
  for (const n of world.residents) if (n !== self && n.x === x && n.y === y) return true
  const p = world.player
  if (self !== p && p.x === x && p.y === y) return true
  return false
}

export function passable(x, y, self) {
  const m = world.map
  if (!m) return false
  if (x < 0 || y < 0 || x >= m.w || y >= m.h) return false
  if (m.solid[y][x]) return false
  if (occupied(x, y, self)) return false
  return true
}

// -----------------------------------------------------------------------------------
// Ⓐ 조사
// -----------------------------------------------------------------------------------
function actorAt(x, y) {
  return world.npcs.find((n) => n.x === x && n.y === y) || world.residents.find((n) => n.x === x && n.y === y)
}

function talkTo(target) {
  const steps = getScript(target.script)
  if (!steps?.length) return false
  // 말을 걸면 이쪽을 본다
  if (target.dir !== undefined && !target.oncourt) {
    const p = world.player
    const dx = p.x - target.x
    const dy = p.y - target.y
    target.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 3 : 2) : dy > 0 ? 0 : 1
  }
  useTalk.getState().start(target.name || '', steps, target.look ? { look: target.look, gender: target.gender } : null)
  return true
}

function interact() {
  const p = world.player
  const m = world.map
  if (!m) return
  const fx = p.x + DX[p.dir]
  const fy = p.y + DY[p.dir]

  const actor = actorAt(fx, fy)
  if (actor) return void talkTo(actor)

  const it = m.interactAt.get(`${fx},${fy}`)
  if (it) {
    const steps = getScript(it.script)
    if (steps?.length) useTalk.getState().start('', steps)
    return
  }

  // 카운터 너머의 점원처럼, 한 칸 더 뒤에 있는 사람에게도 말이 닿는다
  const bx = fx + DX[p.dir]
  const by = fy + DY[p.dir]
  const behind = actorAt(bx, by)
  if (behind && m.solid[fy]?.[fx]) return void talkTo(behind)

  const it2 = m.interactAt.get(`${bx},${by}`)
  if (it2 && m.solid[fy]?.[fx]) {
    const steps = getScript(it2.script)
    if (steps?.length) useTalk.getState().start('', steps)
  }
}

// -----------------------------------------------------------------------------------
// 갱신
// -----------------------------------------------------------------------------------
function stepActor(a, dt, speed) {
  if (!a.moving) return
  a.prog += dt * speed
  if (a.prog >= 1) {
    a.prog = 0
    a.moving = false
    a.fx = a.x
    a.fy = a.y
    return
  }
  a.fx = a.from[0] + (a.x - a.from[0]) * a.prog
  a.fy = a.from[1] + (a.y - a.from[1]) * a.prog
}

function tryStep(a, dir) {
  const nx = a.x + DX[dir]
  const ny = a.y + DY[dir]
  if (!passable(nx, ny, a)) return false
  a.from = [a.x, a.y]
  a.x = nx
  a.y = ny
  a.moving = true
  a.prog = 0
  a.step = a.step ? 0 : 1
  return true
}

/**
 * 포켓몬의 그 「!」 — 트레이너가 나를 발견하면 느낌표를 띄우고 다가와 말을 건다.
 * NPC 가 보고 있는 방향으로 일직선상에 내가 들어오면 발동한다.
 */
function updateNotice(n, dt) {
  if (!n.notice || n.noticed) return false

  // ① 아직 못 봤으면 시야를 살핀다
  if (!n.state) {
    if (isTalking()) return false
    const p = world.player
    const dx = DX[n.dir]
    const dy = DY[n.dir]
    for (let i = 1; i <= n.notice; i++) {
      const x = n.x + dx * i
      const y = n.y + dy * i
      if (world.map.solid[y]?.[x]) break
      if (p.x === x && p.y === y) {
        n.state = 'bang'
        n.bang = 0.9
        return true
      }
    }
    return false
  }

  // ② 느낌표를 띄우고 잠깐 멈춘다
  if (n.state === 'bang') {
    n.bang -= dt
    if (n.bang <= 0) n.state = 'approach'
    return true
  }

  // ③ 내 앞까지 걸어와서 말을 건다
  if (n.state === 'approach') {
    if (n.moving) return true
    const p = world.player
    const dx = p.x - n.x
    const dy = p.y - n.y
    if (Math.abs(dx) + Math.abs(dy) <= 1) {
      n.state = null
      n.noticed = true
      talkTo(n)
      return false
    }
    const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 3 : 2) : dy > 0 ? 0 : 1
    n.dir = dir
    if (!tryStep(n, dir)) { n.state = null; n.noticed = true; talkTo(n) }
    return true
  }
  return false
}

function updateWander(a, dt) {
  if (!a.wander || a.moving) return
  a.cool -= dt
  if (a.cool > 0) return
  a.cool = 1.6 + Math.random() * 4
  const d = Math.floor(Math.random() * 4)
  a.dir = d
  // 원래 자리에서 너무 멀리 가지 않는다
  const nx = a.x + DX[d]
  const ny = a.y + DY[d]
  if (Math.abs(nx - a.hx) > 2 || Math.abs(ny - a.hy) > 2) return
  tryStep(a, d)
}

// 코트를 배정받은 선수가 자리에 서기까지 남은 시간 (id → 초)
const arriving = new Map()

/**
 * 코트로 불려 간 선수들을 자리에 세운다.
 * 3D 마을에서는 캐릭터가 실제로 걸어가서 도착을 알렸는데,
 * 2D 에서는 「코트까지 가는 데 걸리는 시간」만큼 기다렸다가 도착 처리한다.
 */
function tickArrivals(dt) {
  const st = useGame.getState()
  for (const p of Object.values(st.players)) {
    if (p.status !== 'walking') {
      if (arriving.has(p.id)) arriving.delete(p.id)
      continue
    }
    const left = (arriving.get(p.id) ?? 1.5) - dt
    if (left <= 0) {
      arriving.delete(p.id)
      st.arrive(p.id)
    } else {
      arriving.set(p.id, left)
    }
  }
}

/**
 * 내가 경기에 배정됐으면 체육관 코트 자리에 세운다.
 * 경기 중에는 코트를 벗어날 수 없다 — 돌아온 값이 true 면 조작을 잠근다.
 */
function syncMeToCourt() {
  const st = useGame.getState()
  const me = st.players.me
  const p = world.player
  if (!me || (me.status !== 'oncourt' && me.status !== 'walking') || me.courtId == null || me.slot == null) {
    if (p.fx !== undefined) { p.fx = undefined; p.fy = undefined }
    return false
  }
  if (world.mapId !== 'gym') return false
  const spot = world.map.courtSpots?.[me.courtId]
  if (!spot) return false
  const pos = courtSlot(spot, me.slot)
  p.x = Math.round(pos.x)
  p.y = Math.round(pos.y)
  p.fx = pos.x
  p.fy = pos.y
  p.moving = false
  p.prog = 0
  p.from = [p.x, p.y]
  p.dir = pos.dir
  return true
}

export function update(dt) {
  if (!world.ready) return
  world.time += dt
  // 마을 시계와 (경기방 밖일 때의) 자동 매칭을 굴린다
  gameTick(dt)
  tickArrivals(dt)

  // 화면 암전 처리 (지도 이동)
  if (world.fadeDir < 0) {
    world.fade = Math.min(1, world.fade + dt * 4)
    if (world.fade >= 1 && world.pending) {
      const p = world.pending
      world.pending = null
      loadMap(p.to, p.tx, p.ty, p.dir)
      world.fadeDir = 1
    }
    return
  }
  if (world.fadeDir > 0) {
    world.fade = Math.max(0, world.fade - dt * 3)
    if (world.fade <= 0) world.fadeDir = 0
  }

  const p = world.player
  const s = useGame.getState()
  const onCourt = syncMeToCourt()
  // 누군가 나를 발견해서 다가오는 중이면 그동안은 움직일 수 없다
  let noticing = false
  world.npcs.forEach((n) => { if (updateNotice(n, dt)) noticing = true })
  const blocked = isTalking() || !!s.panel || s.showCheckIn || !!s.selectedPlayer || onCourt || noticing

  // Ⓐ 조사
  while (input.aQueue > 0) {
    input.aQueue--
    if (!blocked && !p.moving) interact()
  }

  // 걷기 — 걷던 중이었다면 대화가 떠도 그 한 칸은 마저 딛는다
  if (p.moving) {
    stepActor(p, dt, input.b ? RUN : WALK)
    if (!p.moving) arrived()
  } else if (!blocked && input.dir >= 0) {
    if (p.dir !== input.dir) {
      // 방향 전환 — 제자리에서 몸만 돌린다 (포켓몬의 그 반 박자)
      p.dir = input.dir
      p.hold = 0
    } else {
      p.hold += dt
      if (p.hold >= TURN_HOLD) tryStep(p, p.dir)
    }
  } else {
    p.hold = 0
  }

  // NPC · 주민
  world.npcs.forEach((n) => {
    if (!n.state) updateWander(n, dt)
    stepActor(n, dt, n.state === 'approach' ? 3.6 : 2.6)
  })
  world.residents.forEach((n) => { updateWander(n, dt); stepActor(n, dt, 2.6) })

  // 주민 목록은 조금씩만 다시 계산한다 (경기가 시작되면 코트로 옮겨 서야 하니까)
  world.residentTimer -= dt
  if (world.residentTimer <= 0) {
    world.residentTimer = 1.5
    if (world.mapId === 'gym') buildResidents()
  }

  if (world.banner) {
    world.banner.t += dt
    if (world.banner.t > 2.6) world.banner = null
  }
}

/** 한 칸 도착 — 문 앞 매트면 지도를 넘긴다 */
function arrived() {
  const p = world.player
  const m = world.map
  const key = `${p.x},${p.y}`
  const wp = m.warpAt.get(key)
  if (wp) {
    if (world.justWarped) return
    world.pending = wp
    world.fadeDir = -1
    return
  }
  world.justWarped = false
  savePos()
  grassEvent()
}

/** 풀숲을 밟았을 때 — 포켓몬의 그 두근거림을, 셔틀콕 줍기로 */
function grassEvent() {
  const p = world.player
  const m = world.map
  if (m.rows[p.y]?.[p.x] !== '"') return
  if (isTalking()) return
  if (Math.random() > 0.14) return
  const steps = getScript('grassFind')
  if (steps?.length) useTalk.getState().start('', steps)
}

// -----------------------------------------------------------------------------------
// 그리기
// -----------------------------------------------------------------------------------
function playerLook() {
  const s = useGame.getState()
  return s.players.me
}

export function render(ctx, viewW, viewH) {
  const m = world.map
  if (!m) return
  const t = world.theme

  ctx.imageSmoothingEnabled = false
  // 지도 바깥 여백 — 바깥이면 하늘색, 실내면 어둡게 깔아 액자처럼 보이게
  ctx.fillStyle = m.outdoor ? t.ui.sky : '#0b0f1a'
  ctx.fillRect(0, 0, viewW, viewH)

  const p = world.player
  const pfx = p.moving ? p.from[0] + (p.x - p.from[0]) * p.prog : (p.fx ?? p.x)
  const pfy = p.moving ? p.from[1] + (p.y - p.from[1]) * p.prog : (p.fy ?? p.y)
  const px = (pfx + 0.5) * TILE
  const py = (pfy + 1) * TILE

  const mapW = m.w * TILE
  const mapH = m.h * TILE
  let camX = Math.round(px - viewW / 2)
  let camY = Math.round(py - viewH / 2 - TILE * 0.4)
  camX = mapW <= viewW ? Math.round((mapW - viewW) / 2) : Math.max(0, Math.min(mapW - viewW, camX))
  camY = mapH <= viewH ? Math.round((mapH - viewH) / 2) : Math.max(0, Math.min(mapH - viewH, camY))

  // ── 바닥 ──
  const frame = Math.floor(world.time * 2.2) % 2
  ctx.drawImage(world.ground[frame], -camX, -camY)

  // ── 세울 것들을 모아 발밑 y 로 정렬 (뒤로 걸어가면 가려진다) ──
  const draws = []
  const push = (sortY, fn) => draws.push({ sortY, fn })

  const addObject = (o) => {
    const def = OBJECTS[o.kind]
    if (!def) return
    const sprite = objectSprite(o.kind, t, o.variant || 0)
    if (!sprite) return
    const ox = o.x * TILE - camX
    const oy = (o.y + 1) * TILE - sprite.height - camY
    if (ox > viewW || oy > viewH || ox + sprite.width < 0 || oy + sprite.height < 0) return
    push((o.y + 1) * TILE - (def.flat ? 9999 : 0), (g) => g.drawImage(sprite, ox, oy))
  }

  m.objects.forEach(addObject)

  // 마을이 자란 만큼 장식이 늘어난다 (깃발 → 벚나무 → 분수대)
  if (m.growth) {
    const lv = villageLevel(useGame.getState()).lv
    m.growth.forEach((g) => { if (lv >= g.lv) g.objects.forEach(addObject) })
  }

  // 체육관 코트는 설정한 개수만큼만 깐다
  if (m.courtSpots) {
    const n = useGame.getState().courtCount
    m.courtSpots.slice(0, n).forEach((spot) => addObject({ kind: 'court', x: spot.x, y: spot.y }))
  }

  const drawOne = (a, look, gender) => {
    const fx = a.moving ? a.from[0] + (a.x - a.from[0]) * a.prog : (a.fx ?? a.x)
    const fy = a.moving ? a.from[1] + (a.y - a.from[1]) * a.prog : (a.fy ?? a.y)
    const sx = (fx + 0.5) * TILE - camX
    const sy = (fy + 1) * TILE - camY
    if (sx < -32 || sy < -48 || sx > viewW + 32 || sy > viewH + 48) return
    const f = a.moving ? (a.step ? 1 : 3) : 0
    push(sy, (g) => drawActor(g, look, gender, a.dir, f, sx, sy))
  }

  world.npcs.forEach((n) => drawOne(n, n.look, n.gender))
  world.residents.forEach((n) => drawOne(n, n.look, n.gender))

  const me = playerLook()
  if (me) {
    const f = p.moving ? (p.step ? 1 : 3) : 0
    const sx = px - camX
    const sy = py - camY
    push(sy, (g) => drawActor(g, me.look, me.gender, p.dir, f, sx, sy))
  }

  draws.sort((a, b) => a.sortY - b.sortY)
  draws.forEach((d) => d.fn(ctx))

  // ── 풀숲은 발목을 덮는다 ──
  drawGrassOverlay(ctx, camX, camY, viewW, viewH)

  // ── 「!」 — 누군가 나를 발견했다 ──
  world.npcs.forEach((n) => {
    if (n.state !== 'bang') return
    const bx = Math.round((n.x + 0.5) * TILE - camX)
    const by = Math.round((n.y) * TILE - camY - 14)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(bx - 6, by - 2, 12, 14)
    ctx.fillStyle = '#1a2032'
    ctx.fillRect(bx - 7, by - 1, 1, 12)
    ctx.fillRect(bx + 6, by - 1, 1, 12)
    ctx.fillRect(bx - 6, by - 3, 12, 1)
    ctx.fillRect(bx - 6, by + 12, 12, 1)
    ctx.fillRect(bx - 1, by + 12, 3, 3) // 꼬리
    ctx.fillStyle = '#d8365c'
    ctx.fillRect(bx - 1, by + 1, 2, 7)
    ctx.fillRect(bx - 1, by + 9, 2, 2)
  })

  // ── 이야기 안내 화살표 — 「여기로 가라」 ──
  const goal = currentGoal()
  if (goal?.tile && goal.map === m.id) {
    const bob = Math.round(Math.sin(world.time * 4) * 2)
    const ax = Math.round((goal.tile[0] + 0.5) * TILE - camX)
    const ay = Math.round(goal.tile[1] * TILE - camY - 12 + bob)
    if (ax > -12 && ax < viewW + 12 && ay > -16 && ay < viewH + 16) {
      ctx.fillStyle = '#1a2032'
      ctx.beginPath()
      ctx.moveTo(ax - 6, ay - 7); ctx.lineTo(ax + 6, ay - 7); ctx.lineTo(ax, ay + 2)
      ctx.closePath(); ctx.fill()
      ctx.fillStyle = '#ffd21f'
      ctx.beginPath()
      ctx.moveTo(ax - 4, ay - 6); ctx.lineTo(ax + 4, ay - 6); ctx.lineTo(ax, ay)
      ctx.closePath(); ctx.fill()
    }
  }

  // ── 시간대에 따른 색 물들이기 (바깥에서만) ──
  if (m.outdoor) {
    const tint = daylightTint(useGame.getState().timeOfDay)
    if (tint.alpha > 0) {
      ctx.globalAlpha = tint.alpha
      ctx.fillStyle = tint.color
      ctx.fillRect(0, 0, viewW, viewH)
      ctx.globalAlpha = 1
    }
  }

  // ── 암전 ──
  if (world.fade > 0) {
    ctx.globalAlpha = world.fade
    ctx.fillStyle = '#000000'
    ctx.fillRect(0, 0, viewW, viewH)
    ctx.globalAlpha = 1
  }
}

/** 캐릭터가 풀숲에 서면 다리가 풀에 묻히도록 앞쪽 풀을 한 번 더 그린다 */
function drawGrassOverlay(ctx, camX, camY, viewW, viewH) {
  const m = world.map
  const t = world.theme
  const list = [world.player, ...world.npcs, ...world.residents]
  list.forEach((a) => {
    const x = a.x
    const y = a.y
    if (m.rows[y]?.[x] !== '"') return
    const sx = x * TILE - camX
    const sy = y * TILE - camY
    if (sx < -16 || sy < -16 || sx > viewW || sy > viewH) return
    const p = t.ground
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = p.grass[0]
      ctx.fillRect(sx + i * 5 + 1, sy + 8, 4, 7)
      ctx.fillStyle = p.grassDot
      ctx.fillRect(sx + i * 5 + 1, sy + 8, 1, 6)
    }
  })
}

// -----------------------------------------------------------------------------------
// 바깥에서 쓰는 것들
// -----------------------------------------------------------------------------------
/** 지금 지도의 테마 id */
export const currentTheme = () => world.map?.theme || 'town'

/** 문으로 들어가지 않고 바로 옮겨 가기 (메뉴의 「마을로 돌아가기」 등) */
export function warpTo(to, tx, ty, dir = 0) {
  if (world.fadeDir) return
  world.pending = { to, tx, ty, dir }
  world.fadeDir = -1
}

/** 캐릭터를 새로 만들거나 옷을 갈아입었을 때 — 주민 목록을 다시 세운다 */
export function refreshResidents() {
  buildResidents()
}

// 개발 중 콘솔에서 한 프레임씩 돌려 보거나 조작을 흉내 낼 수 있게 열어 둔다
if (import.meta.env.DEV) {
  globalThis.__svEngine = {
    world, update, render, loadMap, warpTo, interact,
    input, pressDir, releaseDir, clearDirs, pressA, setRun,
    /** 지금 화면을 n초만큼 돌린 뒤 다시 그린다 (탭이 안 보여서 rAF 가 멈춰 있을 때 쓴다) */
    tick(seconds = 0.1, steps = 6) {
      const cv = document.querySelector('canvas.ow-canvas')
      if (!cv) return 'no canvas'
      const ctx = cv.getContext('2d')
      for (let i = 0; i < steps; i++) update(seconds / steps)
      render(ctx, cv.width, cv.height)
      return { mapId: world.mapId, x: world.player.x, y: world.player.y, dir: world.player.dir }
    },
  }
}
