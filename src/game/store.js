// ===================================================================================
// 셔틀빌리지 — 게임 상태 저장소 (zustand)
// 마을/선수/코트/경기 진행/육성/상점을 한 곳에서 관리하고 localStorage에 저장한다.
// ===================================================================================
import { create } from 'zustand'
import {
  SKIN_TONES, HAIR_STYLES, HAIR_COLORS, EYE_STYLES, CLOTH_COLORS,
  OUTFIT_STYLES, RACKET_MODELS, RACKET_COLORS, ACCESSORIES,
  DECORS, COURT_SKINS, DAILY_QUESTS, TITLES, expToNext, chapterOf,
  ROSTER_SEED, BOTTOM_STYLES, SHOE_STYLES, GRIP_WRAPS, CAPES, MOUNTS,
} from './constants.js'
import { pickBestCombo } from './matching.js'
import { MAX_COURTS } from './layout.js'
import {
  pickDailyPartner, PARTNER_BONUS, welcomeLetter, daySummaryLetter,
  trophyLetter, newTrophies, chapterLetter,
} from './social.js'

const SAVE_KEY = 'shuttle-village-save-v1'

/**
 * 오프닝 이야기의 진행 단계.
 * 포켓몬처럼 「집에서 눈을 뜬다 → 누군가 데리러 온다 → 체육관까지 간다 →
 * 경기방에 들어간다」 까지가 한 줄기다. 경기방 입장이 이 게임의 목적지다.
 */
export const TUTORIAL = {
  wake: 0,     // 내 방에서 눈을 떴다
  toTown: 1,   // 마을로 나가야 한다
  toGym: 2,    // 코코를 만났다 — 체육관으로 가야 한다
  toRoom: 3,   // 관장을 만났다 — 경기방을 골라야 한다
  done: 9,     // 경기방에 들어갔다
}

// -----------------------------------------------------------------------------------
// 유틸
// -----------------------------------------------------------------------------------
const hashStr = (s) => {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}
const mulberry = (seed) => () => {
  seed |= 0
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
const pick = (arr, r) => arr[Math.floor(r() * arr.length)]
const todayKey = () => new Date().toDateString()
const uid = () => Math.random().toString(36).slice(2, 9)

/** 이름을 씨앗으로 항상 같은 외모를 만들어 준다 (마을 주민이 매번 바뀌지 않도록) */
export function randomLook(name, gender) {
  const r = mulberry(hashStr(name + gender))
  const femaleHair = ['bob', 'ponytail', 'twintail', 'bun', 'long', 'wave']
  const maleHair = ['short', 'buzz', 'spiky', 'short', 'bob', 'mohawk']
  const hairPool = gender === '여' ? femaleHair : maleHair
  return {
    skin: pick(SKIN_TONES, r).id,
    hair: hairPool[Math.floor(r() * hairPool.length)],
    hairColor: pick(HAIR_COLORS, r),
    eyes: pick(EYE_STYLES, r).id,
    outfit: pick(OUTFIT_STYLES, r).id,
    top: pick(CLOTH_COLORS, r),
    bottom: pick(CLOTH_COLORS, r),
    shoes: pick(CLOTH_COLORS, r),
    acc: r() > 0.72 ? pick(ACCESSORIES, r).id : 'none',
    racket: {
      model: pick(RACKET_MODELS, r).id,
      frame: pick(RACKET_COLORS, r),
      string: '#ffffff',
      grip: pick(RACKET_COLORS, r),
    },
    height: 0.92 + r() * 0.16,
  }
}

export const defaultLook = (gender = '남') => ({
  skin: 's2',
  hair: gender === '여' ? 'ponytail' : 'short',
  hairColor: '#2b1d16',
  eyes: 'oval',
  outfit: 'tee',
  top: '#3b82f6',
  bottom: '#1f2937',
  bottomStyle: gender === '여' ? 'skirt' : 'shorts',
  shoes: '#ffffff',
  shoeStyle: 'basic',
  acc: 'none',
  cape: 'noCape',
  mount: 'noMount',
  racket: { model: 'classic', frame: '#ef4444', string: '#ffffff', grip: '#1f2937', wrap: 'plain' },
  height: 1,
})

function makePlayer({ name, gender = '남', level = 'C조', isMe = false, look }) {
  return {
    id: isMe ? 'me' : `p_${uid()}`,
    name,
    gender,
    level,
    isMe,
    look: look || randomLook(name, gender),
    status: 'waiting', // waiting | walking | oncourt | resting
    courtId: null,
    slot: null,
    waitSince: Date.now(),
    todayGames: 0,
    affinity: 0, // 나와의 친밀도 0~100
    mood: Math.floor(Math.random() * 4),
    joinedAt: Date.now(),
  }
}

const emptyCourt = (id) => ({
  id,
  players: [null, null, null, null],
  status: 'empty', // empty | filling | ready | playing | done
  score: [0, 0],
  winner: null,
  reason: '',
  result: null,
})

const defaultOwned = () => {
  const owned = {}
  ;[...HAIR_STYLES, ...EYE_STYLES, ...OUTFIT_STYLES, ...RACKET_MODELS, ...ACCESSORIES, ...COURT_SKINS,
    ...BOTTOM_STYLES, ...SHOE_STYLES, ...GRIP_WRAPS, ...CAPES, ...MOUNTS]
    .filter((i) => (i.price ?? 0) === 0)
    .forEach((i) => (owned[i.id] = true))
  return owned
}

// -----------------------------------------------------------------------------------
// 저장 / 불러오기
// -----------------------------------------------------------------------------------
function saveState(s) {
  try {
    const data = {
      booted: s.booted,
      players: Object.values(s.players).map((p) => ({
        id: p.id, name: p.name, gender: p.gender, level: p.level, isMe: p.isMe,
        look: p.look, affinity: p.affinity, todayGames: p.todayGames,
        status: p.status === 'resting' ? 'resting' : 'waiting',
      })),
      order: s.order,
      courtCount: s.courtCount,
      gameSpeed: s.gameSpeed,
      sensitivity: s.sensitivity,
      autoMatch: s.autoMatch,
      courtSkin: s.courtSkin,
      coins: s.coins,
      me: s.me,
      owned: s.owned,
      career: s.career,
      today: s.today,
      quests: s.quests,
      metPartners: s.metPartners,
      history: s.history.slice(0, 60),
      timeOfDay: s.timeOfDay,
      day: s.day,
      graphics: s.graphics,
      streak: s.streak,
      gachaPulls: s.gachaPulls,
      achievements: s.achievements,
      seasonName: s.seasonName,
      isAdmin: s.isAdmin,
      mail: s.mail.slice(0, 40),
      bestLift: s.bestLift,
      onlineCode: s.online?.code || '',
      scheduledMatches: s.scheduledMatches,
      autoMatches: s.autoMatches,
      tutorial: s.tutorial,
    }
    localStorage.setItem(SAVE_KEY, JSON.stringify(data))
  } catch (e) {
    console.warn('저장 실패', e)
  }
}

function loadState() {
  try {
    const raw = localStorage.getItem(SAVE_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

// -----------------------------------------------------------------------------------
// 스토어
// -----------------------------------------------------------------------------------
export const useGame = create((set, get) => ({
  booted: false,
  players: {},
  order: [],
  courts: [emptyCourt(0), emptyCourt(1)],
  courtCount: 2,
  gameSpeed: 2,
  sensitivity: 'normal',
  autoMatch: true,
  courtSkin: 'green',
  timeOfDay: 10,
  day: 1,
  coins: 500,
  owned: defaultOwned(),
  me: {
    lv: 1,
    exp: 0,
    statPoints: 3,
    stats: { power: 5, technique: 5, speed: 5, stamina: 5, sense: 5 },
    title: 'rookie',
  },
  career: { games: 0, partners: 0, earned: 0, matchesHosted: 0 },
  today: { date: todayKey(), games: 0, matches: 0, newPartners: 0, talks: 0 },
  quests: {},
  metPartners: {},
  history: [],
  toasts: [],
  selectedPlayer: null,
  panel: null, // 'roster' | 'shop' | 'me' | 'quests' | 'settings' | 'record'
  focusCourt: null,
  cameraFollow: false,
  isAdmin: true,
  seasonName: '',
  notice: '',
  graphics: 'mid', // low | mid | high
  streak: { lastDate: null, count: 0 },
  gachaPulls: 0,
  achievements: {},
  showCheckIn: false,
  mail: [],
  bestLift: 0,
  // 콕스타 연동 상태
  auth: null, // { uid, email, profile, needsProfile, superAdmin }
  online: { status: 'off', roomId: null, roomName: '', isAdmin: false, code: '' },
  // 경기 예정 — 콕스타 rooms.scheduledMatches 와 같은 형식 { "0": [id|null x4] }
  scheduledMatches: {},
  // 자동 매칭 대기 큐 — [[id x4], ...]
  autoMatches: [],
  numScheduled: 4,
  roomInfo: null, // 입장한 경기방 정보
  tutorial: TUTORIAL.wake,

  /** 오프닝 이야기 단계를 옮긴다 */
  setTutorial: (step) => {
    if (get().tutorial === step) return
    set({ tutorial: step })
    saveState(get())
  },

  /** 경기 예정/자동매칭 저장. 경기방에 있으면 방 문서에도 반영해 모두가 같이 본다 */
  setMatchQueues: ({ scheduledMatches, autoMatches }) => {
    const patch = {}
    if (scheduledMatches !== undefined) patch.scheduledMatches = scheduledMatches
    if (autoMatches !== undefined) patch.autoMatches = autoMatches
    set(patch)
    const s = get()
    if (s.online?.status === 'room') globalThis.__svSaveQueues?.(patch)
    else saveState(s)
  },
  screen: 'village', // village(2D 필드) | world(전국 지도)
  setScreen: (screen) => set({ screen, panel: null }),

  // ---------------------------------------------------------------------------------
  hydrate: () => {
    const data = loadState()
    if (!data) return
    const players = {}
    ;(data.players || []).forEach((p) => {
      players[p.id] = {
        ...makePlayer({ name: p.name, gender: p.gender, level: p.level, isMe: p.isMe, look: p.look }),
        id: p.id,
        affinity: p.affinity || 0,
        todayGames: p.todayGames || 0,
        status: p.status === 'resting' ? 'resting' : 'waiting',
      }
    })
    const count = Math.min(MAX_COURTS, Math.max(1, data.courtCount || 2))
    const state = {
      booted: !!data.booted,
      players,
      order: (data.order || Object.keys(players)).filter((id) => players[id]),
      courts: Array.from({ length: count }, (_, i) => emptyCourt(i)),
      courtCount: count,
      gameSpeed: data.gameSpeed || 2,
      sensitivity: data.sensitivity || 'normal',
      autoMatch: data.autoMatch !== false,
      courtSkin: data.courtSkin || 'green',
      coins: data.coins ?? 500,
      me: data.me || get().me,
      owned: { ...defaultOwned(), ...(data.owned || {}) },
      career: data.career || get().career,
      today: data.today || get().today,
      quests: data.quests || {},
      metPartners: data.metPartners || {},
      history: data.history || [],
      timeOfDay: data.timeOfDay ?? 10,
      day: data.day || 1,
      graphics: data.graphics || 'mid',
      streak: data.streak || { lastDate: null, count: 0 },
      gachaPulls: data.gachaPulls || 0,
      achievements: data.achievements || {},
      seasonName: data.seasonName || '',
      isAdmin: data.isAdmin !== false,
      mail: data.mail || [],
      bestLift: data.bestLift || 0,
      scheduledMatches: data.scheduledMatches || {},
      autoMatches: data.autoMatches || [],
      online: { status: 'off', code: data.onlineCode || '' },
      // 이미 하던 사람에게 튜토리얼을 다시 강요하지 않는다
      tutorial: data.tutorial ?? (data.booted ? TUTORIAL.done : TUTORIAL.wake),
    }
    // 출석 체크 — 하루 한 번 보상, 연속 출석이면 더 많이
    const tk = todayKey()
    if (state.streak.lastDate !== tk) state.showCheckIn = true
    // 날짜가 바뀌었으면 오늘 기록·퀘스트 초기화 (+ 어제 소식 편지)
    if (state.today.date !== todayKey()) {
      state.mail = [daySummaryLetter(state.day, state.today), ...state.mail].slice(0, 40)
      state.today = { date: todayKey(), games: 0, matches: 0, newPartners: 0, talks: 0 }
      state.quests = {}
      state.day = state.day + 1
      Object.values(state.players).forEach((p) => {
        p.todayGames = 0
      })
    }
    set(state)
  },

  createMe: ({ name, gender, level, look }) => {
    const me = makePlayer({ name, gender, level, isMe: true, look })
    set((s) => ({
      booted: true,
      players: { ...s.players, me },
      order: [...s.order.filter((i) => i !== 'me'), 'me'],
      mail: [welcomeLetter(name), ...s.mail].slice(0, 40),
    }))
    get().toast(`${name} 트레이너, 셔틀타운에 온 걸 환영해! 🏸`, 'good')
    saveState(get())
  },

  // --- 선수 -------------------------------------------------------------------------
  addPlayer: ({ name, gender, level }) => {
    const s = get()
    if (!name?.trim()) return
    if (Object.values(s.players).some((p) => p.name === name.trim())) {
      get().toast('이미 마을에 있는 이름이에요.', 'warn')
      return
    }
    const p = makePlayer({ name: name.trim(), gender, level })
    set((st) => ({ players: { ...st.players, [p.id]: p }, order: [...st.order, p.id] }))
    get().toast(`${p.name} 님이 마을에 도착했어요!`)
    saveState(get())
  },

  addSeedRoster: () => {
    const s = get()
    const exist = new Set(Object.values(s.players).map((p) => p.name))
    const add = {}
    const ids = []
    ROSTER_SEED.filter((r) => !exist.has(r.name)).forEach((r) => {
      const p = makePlayer(r)
      add[p.id] = p
      ids.push(p.id)
    })
    if (!ids.length) return get().toast('이미 모두 등록돼 있어요.', 'warn')
    set((st) => ({ players: { ...st.players, ...add }, order: [...st.order, ...ids] }))
    get().toast(`클럽 명단 ${ids.length}명이 마을에 입장했어요!`, 'good')
    saveState(get())
  },

  addRandomPlayers: (n = 8) => {
    const s = get()
    const exist = new Set(Object.values(s.players).map((p) => p.name))
    const pool = ROSTER_SEED.filter((r) => !exist.has(r.name))
    const chosen = pool.sort(() => Math.random() - 0.5).slice(0, n)
    if (!chosen.length) return get().toast('더 부를 사람이 없어요.', 'warn')
    const add = {}
    const ids = []
    chosen.forEach((r) => {
      const p = makePlayer(r)
      add[p.id] = p
      ids.push(p.id)
    })
    set((st) => ({ players: { ...st.players, ...add }, order: [...st.order, ...ids] }))
    get().toast(`${ids.length}명이 마을에 들어왔어요!`)
    saveState(get())
  },

  removePlayer: (id) => {
    if (id === 'me') return
    set((s) => {
      const players = { ...s.players }
      const p = players[id]
      delete players[id]
      const courts = s.courts.map((c) =>
        c.players.includes(id)
          ? { ...c, players: c.players.map((x) => (x === id ? null : x)), status: c.status === 'playing' ? c.status : 'filling' }
          : c
      )
      return { players, order: s.order.filter((x) => x !== id), courts, selectedPlayer: s.selectedPlayer === id ? null : s.selectedPlayer }
    })
    saveState(get())
  },

  toggleRest: (id) => {
    // 온라인 손님 모드 — 호스트에게 요청만 보낸다
    const net = globalThis.__svNet
    if (net?.isGuest?.()) {
      net.sendRest(id)
      return
    }
    set((s) => {
      const p = s.players[id]
      if (!p || p.status === 'oncourt' || p.status === 'walking') return s
      const next = p.status === 'resting' ? 'waiting' : 'resting'
      return { players: { ...s.players, [id]: { ...p, status: next, waitSince: Date.now() } } }
    })
    saveState(get())
  },

  setLook: (id, patch) => {
    set((s) => {
      const p = s.players[id]
      if (!p) return s
      return { players: { ...s.players, [id]: { ...p, look: { ...p.look, ...patch } } } }
    })
    saveState(get())
    // 로그인 상태면 콕스타 계정에도 외모를 저장해 다른 기기에서도 같은 캐릭터가 나온다
    if (id === 'me' && get().auth?.uid) {
      globalThis.__svSaveLook?.(get().players.me.look)
    }
  },

  setPlayerInfo: (id, patch) => {
    set((s) => {
      const p = s.players[id]
      if (!p) return s
      return { players: { ...s.players, [id]: { ...p, ...patch } } }
    })
    saveState(get())
  },

  // --- 설정 -------------------------------------------------------------------------
  setCourtCount: (n) => {
    const count = Math.max(1, Math.min(MAX_COURTS, n))
    set((s) => {
      const courts = Array.from({ length: count }, (_, i) => s.courts[i] || emptyCourt(i))
      // 줄어든 코트에 있던 선수는 대기석으로
      const players = { ...s.players }
      s.courts.slice(count).forEach((c) => {
        c.players.forEach((pid) => {
          if (pid && players[pid]) players[pid] = { ...players[pid], status: 'waiting', courtId: null, slot: null, waitSince: Date.now() }
        })
      })
      return { courtCount: count, courts, players }
    })
    saveState(get())
  },

  setSetting: (patch) => {
    set(patch)
    saveState(get())
  },

  setPanel: (panel) => set((s) => ({ panel: s.panel === panel ? null : panel })),
  selectPlayer: (id) => set({ selectedPlayer: id }),
  setFocusCourt: (id) => set({ focusCourt: id }),

  // --- 매칭 -------------------------------------------------------------------------
  waitingPlayers: () => {
    const s = get()
    return s.order.map((id) => s.players[id]).filter((p) => p && p.status === 'waiting')
  },

  /** 빈 코트를 자동 매칭으로 채운다 */
  autoFill: (silent = false) => {
    const s = get()
    let waiting = s.waitingPlayers()
    const courts = [...s.courts]
    const players = { ...s.players }
    let filled = 0

    for (let i = 0; i < courts.length; i++) {
      if (courts[i].status !== 'empty' && courts[i].status !== 'filling') continue
      if (courts[i].players.some(Boolean)) continue
      if (waiting.length < 4) break
      const res = pickBestCombo(waiting, { history: s.history, sensitivity: s.sensitivity })
      if (!res) break
      const ids = res.players.map((p) => p.id)
      courts[i] = { ...courts[i], players: ids, status: 'filling', score: [0, 0], winner: null, reason: res.reason, result: null }
      ids.forEach((pid, slot) => {
        players[pid] = { ...players[pid], status: 'walking', courtId: i, slot }
      })
      waiting = waiting.filter((p) => !ids.includes(p.id))
      filled++
    }
    if (filled) {
      set({ courts, players })
      if (!silent) get().toast(`${filled}개 코트에 선수들이 이동합니다 🏃`, 'good')
    } else if (!silent) {
      get().toast(get().waitingPlayers().length < 4 ? '대기 인원이 4명 미만이에요.' : '지금은 좋은 조합이 없어요. 민감도를 낮춰보세요.', 'warn')
    }
  },

  /** 특정 선수를 특정 코트 자리에 직접 배치 */
  assign: (playerId, courtId, slot) => {
    set((s) => {
      const p = s.players[playerId]
      const court = s.courts[courtId]
      if (!p || !court || court.status === 'playing') return s
      const players = { ...s.players }
      const courts = s.courts.map((c) => ({ ...c, players: [...c.players] }))
      // 기존 자리에서 제거
      courts.forEach((c) => {
        c.players = c.players.map((x) => (x === playerId ? null : x))
      })
      const prev = courts[courtId].players[slot]
      if (prev) players[prev] = { ...players[prev], status: 'waiting', courtId: null, slot: null, waitSince: Date.now() }
      courts[courtId].players[slot] = playerId
      players[playerId] = { ...players[playerId], status: 'walking', courtId, slot }
      courts.forEach((c, i) => {
        if (c.status !== 'playing') c.status = c.players.some(Boolean) ? 'filling' : 'empty'
      })
      return { players, courts, selectedPlayer: null }
    })
  },

  clearCourt: (courtId) => {
    set((s) => {
      const court = s.courts[courtId]
      if (!court) return s
      const players = { ...s.players }
      court.players.forEach((pid) => {
        if (pid && players[pid]) players[pid] = { ...players[pid], status: 'waiting', courtId: null, slot: null, waitSince: Date.now() }
      })
      const courts = s.courts.map((c, i) => (i === courtId ? emptyCourt(i) : c))
      return { players, courts }
    })
  },

  /** 캐릭터가 자기 자리에 도착했다고 알림 → 4명 모이면 경기 시작 */
  arrive: (playerId) => {
    const s = get()
    const p = s.players[playerId]
    if (!p || p.status !== 'walking') return
    const players = { ...s.players, [playerId]: { ...p, status: 'oncourt' } }
    const courts = [...s.courts]
    const c = courts[p.courtId]
    let started = false
    if (c && c.players.filter(Boolean).length === 4) {
      const allHere = c.players.every((id) => id && (players[id].status === 'oncourt'))
      if (allHere && c.status !== 'playing') {
        courts[p.courtId] = { ...c, status: 'playing', score: [0, 0], startedAt: Date.now() }
        started = true
      }
    }
    set({ players, courts })
    if (started) {
      const names = c.players.map((id) => players[id].name)
      get().toast(`🏸 ${p.courtId + 1}번 코트 경기 시작! ${names[0]}·${names[1]} vs ${names[2]}·${names[3]}`, 'good')
    }
  },

  // --- 경기 진행 --------------------------------------------------------------------
  // 승패는 기록하지 않는다.
  // 실제 클럽에서는 관리자가 매 경기 결과를 일일이 물어보고 눌러야 하는데,
  // 그건 현실적으로 불가능하다. 그래서 이 게임의 성장은 「이겼는가」가 아니라
  // 「얼마나 뛰었고, 누구와 뛰었는가」로만 굴러간다.
  finishMatch: (courtId) => {
    const s = get()
    const c = s.courts[courtId]
    if (!c || c.status !== 'playing') return

    const ids = c.players.filter(Boolean)
    const teamA = [c.players[0], c.players[1]]
    const teamB = [c.players[2], c.players[3]]
    const players = { ...s.players }
    const duration = c.startedAt ? Date.now() - c.startedAt : 0

    ids.forEach((id) => {
      const p = players[id]
      if (!p) return
      players[id] = {
        ...p,
        status: 'waiting',
        courtId: null,
        slot: null,
        waitSince: Date.now(),
        todayGames: p.todayGames + 1,
      }
    })

    // --- 보상 : 참여한 만큼 ---
    const meInMatch = ids.includes('me')
    let coins = 0
    let exp = 0
    const career = { ...s.career }
    const today = { ...s.today }
    const metPartners = { ...s.metPartners }
    const newFaces = []
    today.matches += 1
    career.matchesHosted += 1

    if (meInMatch) {
      coins += 110
      exp += 70
      // 오래 뛴 경기일수록 조금 더 (10분 넘으면 최대 +60)
      const longBonus = Math.min(60, Math.floor(duration / 60000) * 8)
      coins += longBonus
      career.games += 1
      today.games += 1

      const myTeam = teamA.includes('me') ? teamA : teamB
      // 오늘의 추천 파트너와 한 팀으로 뛰면 코인 2배
      const partner = pickDailyPartner(s.players, s.order)
      if (partner && myTeam.includes(partner.id)) {
        coins *= PARTNER_BONUS
        today.partnerPlayed = true
        setTimeout(() => get().toast(`💞 오늘의 파트너 ${partner.name}와 함께! 코인 2배`, 'good'), 400)
      }

      ids.filter((id) => id !== 'me').forEach((id) => {
        const p = players[id]
        if (!p) return
        const isPartner = myTeam.includes(id)
        players[id] = { ...p, affinity: Math.min(100, p.affinity + (isPartner ? 9 : 5)) }
        const prev = metPartners[id]
        if (!prev) {
          // 도감에 새로 오르는 사람
          metPartners[id] = { at: Date.now(), games: 1 }
          career.partners += 1
          today.newPartners += 1
          newFaces.push(p.name)
        } else {
          metPartners[id] = { at: prev.at || Date.now(), games: (prev.games || 0) + 1 }
        }
      })
    } else {
      // 내가 안 뛴 경기도 「마을에서 열린 경기」로 조금 쳐준다
      coins += 35
      exp += 15
    }

    career.earned += coins

    // 레벨업
    let me = { ...s.me, exp: s.me.exp + exp }
    let leveled = 0
    while (me.exp >= expToNext(me.lv)) {
      me.exp -= expToNext(me.lv)
      me.lv += 1
      me.statPoints += 3
      leveled++
    }

    const record = {
      id: uid(),
      at: Date.now(),
      courtId,
      teamA,
      teamB,
      names: c.players.map((id) => s.players[id]?.name || '?'),
      duration,
    }

    const courts = [...s.courts]
    courts[courtId] = { ...emptyCourt(courtId), status: 'done', result: { ...record, reason: c.reason } }

    set({
      players, courts, coins: s.coins + coins, me, career, today, metPartners,
      history: [record, ...s.history].slice(0, 120),
    })

    const mins = Math.max(1, Math.round(duration / 60000))
    get().toast(
      `${courtId + 1}번 코트 경기 종료 (${mins}분) +${coins}🪙`,
      meInMatch ? 'good' : 'info'
    )
    newFaces.forEach((n, i) =>
      setTimeout(() => get().toast(`📖 도감 등록 — ${n} 님과 처음 만났다!`, 'good'), 900 + i * 900)
    )
    if (leveled) get().toast(`🎉 레벨 업! Lv.${me.lv} — 스탯 포인트 ${leveled * 3} 획득`, 'good')

    // 새로운 장(章)이 열렸으면 소식지가 온다
    const beforeCh = chapterOf(s.career.games).n
    const afterCh = chapterOf(career.games).n
    if (afterCh > beforeCh) {
      const ch = chapterOf(career.games)
      set({ mail: [chapterLetter(ch), ...get().mail].slice(0, 40) })
      setTimeout(() => get().toast(`📘 ${ch.n}장 「${ch.label}」 — 마을이 달라졌어!`, 'good'), 1400)
    }

    get().checkTrophies()

    // 잠시 결과를 보여준 뒤 코트를 비운다
    setTimeout(() => {
      const cur = get().courts[courtId]
      if (cur && cur.status === 'done') {
        const next = [...get().courts]
        next[courtId] = emptyCourt(courtId)
        set({ courts: next })
        if (get().autoMatch) get().autoFill(true)
      }
    }, 4200)

    saveState(get())
  },

  // --- 육성 / 상점 ------------------------------------------------------------------
  addStat: (key) => {
    set((s) => {
      if (s.me.statPoints <= 0) return s
      return {
        me: {
          ...s.me,
          statPoints: s.me.statPoints - 1,
          stats: { ...s.me.stats, [key]: s.me.stats[key] + 1 },
        },
      }
    })
    saveState(get())
  },

  buy: (item) => {
    const s = get()
    if (s.owned[item.id]) return get().toast('이미 가지고 있어요.', 'warn')
    if (s.coins < item.price) return get().toast('코인이 부족해요 🪙', 'warn')
    set({ coins: s.coins - item.price, owned: { ...s.owned, [item.id]: true } })
    get().toast(`${item.label} 구입 완료!`, 'good')
    get().checkTrophies()
    saveState(get())
  },

  claimQuest: (q) => {
    const s = get()
    if (s.quests[q.id]?.claimed) return
    const prog = s.today[q.track] || 0
    if (prog < q.target) return get().toast('아직 조건을 못 채웠어요.', 'warn')
    let me = { ...s.me, exp: s.me.exp + q.exp }
    let leveled = 0
    while (me.exp >= expToNext(me.lv)) {
      me.exp -= expToNext(me.lv)
      me.lv += 1
      me.statPoints += 3
      leveled++
    }
    set({
      coins: s.coins + q.coin,
      me,
      quests: { ...s.quests, [q.id]: { claimed: true } },
      career: { ...s.career, earned: s.career.earned + q.coin },
    })
    get().toast(`퀘스트 완료! +${q.coin}🪙 +${q.exp}EXP`, 'good')
    if (leveled) get().toast(`🎉 레벨 업! Lv.${me.lv}`, 'good')
    saveState(get())
  },

  earnedTitles: () => {
    const s = get()
    return TITLES.filter((t) => t.cond(s))
  },

  advanceTime: (h) => set((s) => ({ timeOfDay: (s.timeOfDay + h + 24) % 24 })),

  toast: (text, kind = 'info') => {
    const id = uid()
    set((s) => ({ toasts: [...s.toasts, { id, text, kind }] }))
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 3600)
  },

  // --- 우편함 ---------------------------------------------------------------------
  readMail: (id) => {
    set((s) => ({ mail: s.mail.map((m) => (m.id === id ? { ...m, read: true } : m)) }))
    saveState(get())
  },

  claimMail: (id) => {
    const s = get()
    const m = s.mail.find((x) => x.id === id)
    if (!m || m.claimed) return
    set({
      mail: s.mail.map((x) => (x.id === id ? { ...x, claimed: true, read: true } : x)),
      coins: s.coins + m.coins,
      career: { ...s.career, earned: s.career.earned + m.coins },
    })
    get().toast(`💌 선물 +${m.coins}🪙`, 'good')
    saveState(get())
  },

  // --- 트로피 ---------------------------------------------------------------------
  /** 조건을 새로 달성한 트로피가 있으면 진열 + 축하 편지 발송 */
  checkTrophies: () => {
    const s = get()
    const earned = newTrophies(s)
    if (!earned.length) return
    const achievements = { ...s.achievements }
    let mail = [...s.mail]
    earned.forEach((t) => {
      achievements[t.id] = Date.now()
      mail = [trophyLetter(t), ...mail]
    })
    set({ achievements, mail: mail.slice(0, 40) })
    earned.forEach((t, i) =>
      setTimeout(() => get().toast(`🏆 트로피 획득 — ${t.label}!`, 'good'), 600 + i * 1000)
    )
    saveState(get())
  },

  // --- 미니게임 (셔틀 리프팅) — 하루 300코인까지 -------------------------------------
  addMiniReward: (score) => {
    const s = get()
    const CAP = 300
    const remain = Math.max(0, CAP - (s.today.miniCoins || 0))
    const reward = Math.min(remain, score * 6)
    set({
      coins: s.coins + reward,
      bestLift: Math.max(s.bestLift || 0, score),
      today: { ...s.today, miniCoins: (s.today.miniCoins || 0) + reward },
      career: { ...s.career, earned: s.career.earned + reward },
    })
    if (reward > 0) get().toast(`🪶 리프팅 ${score}개! +${reward}🪙`, 'good')
    else get().toast(`🪶 리프팅 ${score}개! (오늘 미니게임 보상 한도 도달)`, 'warn')
    get().checkTrophies()
    saveState(get())
    return reward
  },

  /** 출석 체크 — 연속 출석일수록 보상이 커진다 (매일 들어오게 만드는 장치) */
  checkIn: () => {
    const s = get()
    const tk = todayKey()
    if (s.streak.lastDate === tk) return { coins: 0, count: s.streak.count }
    const y = new Date()
    y.setDate(y.getDate() - 1)
    const consecutive = s.streak.lastDate === y.toDateString()
    const count = consecutive ? s.streak.count + 1 : 1
    const day = ((count - 1) % 7) + 1
    const reward = [120, 150, 180, 220, 260, 320, 700][day - 1]
    let me = { ...s.me, exp: s.me.exp + 40 }
    while (me.exp >= expToNext(me.lv)) {
      me.exp -= expToNext(me.lv)
      me.lv += 1
      me.statPoints += 3
    }
    set({
      streak: { lastDate: tk, count },
      coins: s.coins + reward,
      me,
      showCheckIn: false,
      career: { ...s.career, earned: s.career.earned + reward },
    })
    get().checkTrophies()
    saveState(get())
    return { coins: reward, count, day }
  },

  closeCheckIn: () => set({ showCheckIn: false }),

  /** 셔틀콕 뽑기 — 못 가진 아이템이 랜덤으로 나온다 */
  pullGacha: () => {
    const s = get()
    const COST = 300
    if (s.coins < COST) {
      get().toast('코인이 부족해요! (300🪙 필요)', 'warn')
      return null
    }
    const pool = [...HAIR_STYLES, ...EYE_STYLES, ...OUTFIT_STYLES, ...ACCESSORIES, ...RACKET_MODELS, ...DECORS, ...COURT_SKINS,
      ...BOTTOM_STYLES, ...SHOE_STYLES, ...GRIP_WRAPS]
      // 초레어템은 뽑기로 안 나온다 — 오직 9,999코인을 모아야 한다
      .filter((i) => (i.price ?? 0) > 0 && !i.ultra && !s.owned[i.id])
    if (!pool.length) {
      set({ coins: s.coins - COST + 500 })
      get().toast('모든 아이템을 다 모았어! 대신 500🪙 돌려줄게 ✨', 'good')
      saveState(get())
      return { label: '코인 500', rare: false }
    }
    const item = pool[Math.floor(Math.random() * pool.length)]
    const rare = item.price >= 900
    set({
      coins: s.coins - COST,
      owned: { ...s.owned, [item.id]: true },
      gachaPulls: s.gachaPulls + 1,
    })
    get().toast(`${rare ? '✨ 레어! ' : '🎁 '}${item.label} 획득!`, 'good')
    get().checkTrophies()
    saveState(get())
    return { label: item.label, rare }
  },

  setGraphics: (g) => {
    set({ graphics: g })
    saveState(get())
  },

  /** 모두 대기석으로 (콕스타의 '모두 대기로 이동') */
  systemReset: () => {
    set((s) => {
      const players = { ...s.players }
      Object.values(players).forEach((p) => {
        if (p.status !== 'resting') players[p.id] = { ...p, status: 'waiting', courtId: null, slot: null, waitSince: Date.now() }
      })
      return { players, courts: s.courts.map((_, i) => emptyCourt(i)) }
    })
    get().toast('모두 대기석으로 모였어!', 'good')
    saveState(get())
  },

  /** 오늘 기록만 지우기 (콕스타의 '선수 히스토리 삭제') */
  clearHistory: () => {
    set((s) => {
      const players = { ...s.players }
      Object.values(players).forEach((p) => {
        players[p.id] = { ...p, todayGames: 0 }
      })
      return { players, history: [], today: { date: todayKey(), games: 0, matches: 0, newPartners: 0, talks: 0 } }
    })
    get().toast('오늘 기록을 정리했어.', 'good')
    saveState(get())
  },

  /** 선수 게임 수 수동 조정 (콕스타 관리자 기능) */
  adjustGames: (id, delta) => {
    set((s) => {
      const p = s.players[id]
      if (!p) return s
      return { players: { ...s.players, [id]: { ...p, todayGames: Math.max(0, p.todayGames + delta) } } }
    })
    saveState(get())
  },

  resetAll: () => {
    localStorage.removeItem(SAVE_KEY)
    window.location.reload()
  },
}))

// -----------------------------------------------------------------------------------
// 게임 루프 — 시계와 자동 매칭만 돌린다.
// 경기 점수는 저절로 올라가지 않는다: [경기 종료]를 누를 때까지 시간이 흐르고,
// 종료 순간 finishMatch 가 실력 기반으로 최종 점수를 정한다.
// -----------------------------------------------------------------------------------
let clockAcc = 0

export function gameTick(dt) {
  const s = useGame.getState()
  if (!s.booted) return
  // 콕스타 경기방에 들어가 있으면 경기 진행은 콕스타(방 관리자)가 정한다.
  if (s.online?.status === 'room') return

  // 시간 흐름 (게임 내 1시간 ≈ 실제 12초)
  clockAcc += dt
  if (clockAcc > 2) {
    clockAcc = 0
    useGame.setState((st) => ({ timeOfDay: (st.timeOfDay + 1 / 6) % 24 }))
  }

  // 자동 매칭
  if (s.autoMatch) {
    const hasEmpty = s.courts.some((c) => c.status === 'empty')
    if (hasEmpty && s.waitingPlayers().length >= 4) {
      autoAcc += dt
      if (autoAcc > 1.5) {
        autoAcc = 0
        s.autoFill(true)
      }
    }
  }
}
let autoAcc = 0

// 개발 모드에서만 콘솔 디버깅용으로 스토어를 노출한다
if (import.meta.env.DEV) globalThis.__svStore = useGame
