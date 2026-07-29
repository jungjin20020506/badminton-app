// ===================================================================================
// 소셜·재접속 요소 — 오늘의 추천 파트너 / 우편함 편지 / 마을 발전도 / 트로피
// ===================================================================================
import { DECORS, COURT_SKINS } from './constants.js'

// -----------------------------------------------------------------------------------
// 오늘의 추천 파트너 — 날짜를 씨앗으로 매일 다른 주민이 뽑힌다 (모두 같은 결과)
// -----------------------------------------------------------------------------------
export function dayNumber(d = new Date()) {
  return d.getFullYear() * 372 + (d.getMonth() + 1) * 31 + d.getDate()
}

export function pickDailyPartner(players, order) {
  const candidates = order
    .map((id) => players[id])
    .filter((p) => p && !p.isMe)
  if (!candidates.length) return null
  // 이름 기준 정렬 후 날짜 해시로 선택 → 인원 추가 순서와 무관하게 하루 종일 동일
  const sorted = [...candidates].sort((a, b) => a.name.localeCompare(b.name, 'ko'))
  return sorted[dayNumber() % sorted.length]
}

export const PARTNER_BONUS = 2 // 추천 파트너와 한 팀으로 뛰면 코인 x2

// -----------------------------------------------------------------------------------
// 도감 · 라이벌
// -----------------------------------------------------------------------------------
/** metPartners 값을 옛 형식(true)까지 받아 { at, games } 로 통일 */
export const dexEntry = (v) => (v === true ? { at: 0, games: 0 } : v || null)

/**
 * 도감 목록 — 마을 명단 전체를 「만난 사람 / 아직 못 만난 사람」으로 나눠 돌려준다.
 * 승패가 아니라 「몇 번 같은 코트에 섰는지」가 이 게임의 기록이다.
 */
export function dexList(players, order, metPartners = {}) {
  return order
    .map((id) => players[id])
    .filter((p) => p && !p.isMe)
    .map((p) => {
      const e = dexEntry(metPartners[p.id])
      return { player: p, met: !!e, games: e?.games || 0, at: e?.at || 0 }
    })
}

/**
 * 라이벌 — 가장 자주 같은 코트에 선 사람.
 * (승패를 안 세므로 「전적」이 아니라 「함께한 횟수」로 정한다)
 */
export function pickRival(players, metPartners = {}) {
  let best = null
  Object.entries(metPartners).forEach(([id, v]) => {
    const p = players[id]
    const e = dexEntry(v)
    if (!p || !e) return
    const score = (e.games || 0) * 10 + (p.affinity || 0)
    if (!best || score > best.score) best = { player: p, games: e.games || 0, score }
  })
  return best && best.games >= 2 ? best : null
}

// -----------------------------------------------------------------------------------
// 우편함
// -----------------------------------------------------------------------------------
let mailSeq = 0
export function makeLetter({ from = '마을 안내원 코코', icon = '🐥', title, body, coins = 0 }) {
  return {
    id: `m_${Date.now()}_${mailSeq++}`,
    at: Date.now(),
    from,
    icon,
    title,
    body,
    coins,
    read: false,
    claimed: coins === 0,
  }
}

export function welcomeLetter(name) {
  return makeLetter({
    title: `${name} 트레이너, 셔틀타운에 온 걸 환영해!`,
    body: `여긴 배드민턴을 사랑하는 트레이너들이 모여 사는 마을이야.\n경기를 뛰면 코인이 모이고, 셔틀마트에서 라켓과 옷을 살 수 있어.\n북쪽 체육관의 관장님이 널 기다리고 있을 거야.\n\n작은 선물을 넣어뒀어. 자주 놀러 와! 💛`,
    coins: 200,
  })
}

export function daySummaryLetter(day, today) {
  const line =
    today.games === 0
      ? '어제는 코트에 안 섰네? 오늘은 한 판 어때!'
      : `어제 ${today.games}경기를 뛰었어. ${today.games >= 3 ? '체력이 대단한걸 🔥' : '오늘도 화이팅!'}`
  const face = today.newPartners > 0
    ? `\n새로 만난 사람이 ${today.newPartners}명! 도감이 그만큼 채워졌어 📖`
    : ''
  return makeLetter({
    from: '마을 소식지',
    icon: '📰',
    title: `${day}일차 마을 소식`,
    body: `${line}${face}\n마을에서 총 ${today.matches}판의 경기가 열렸어.\n오늘의 추천 파트너를 확인해봐 — 같이 뛰면 코인이 2배야!`,
    coins: today.games >= 3 ? 150 : 60,
  })
}

/** 새로운 장(章)이 열렸을 때 */
export function chapterLetter(ch) {
  return makeLetter({
    from: '마을 소식지',
    icon: '📘',
    title: `${ch.n}장 — ${ch.label}`,
    body: `${ch.desc}\n\n마을이 조금씩 달라지고 있어. 밖에 나가 보면 알 거야!`,
    coins: 200 + ch.n * 100,
  })
}

/**
 * 오늘의 기록판 — 승패가 없으니 「누가 제일 많이 뛰었나」로 뽑는다.
 * 체육관 전광판과 랭킹 화면이 같은 값을 쓴다.
 */
export function todayBoard(players, bestLift = 0) {
  const list = Object.values(players || {})
  const byGames = [...list].filter((p) => p.todayGames > 0).sort((a, b) => b.todayGames - a.todayGames)
  const byAffinity = [...list].filter((p) => !p.isMe && p.affinity > 0).sort((a, b) => b.affinity - a.affinity)
  return {
    mvp: byGames[0] || null,          // 오늘 가장 많이 뛴 사람
    runners: byGames.slice(1, 3),
    closest: byAffinity[0] || null,   // 가장 친해진 사람
    totalGames: list.reduce((a, p) => a + (p.todayGames || 0), 0),
    bestLift,
  }
}

/** 도감에 처음 오른 사람 — 축하 편지 */
export function dexLetter(name, count) {
  return makeLetter({
    from: '도감 연구소',
    icon: '📖',
    title: `도감 등록 — ${name}`,
    body: `${name} 님이 도감에 새로 올랐어!\n지금까지 ${count}명과 코트에 함께 섰네.\n\n같이 뛴 사람이 늘수록 마을이 넓어져. 계속 만나 봐!`,
    coins: 80,
  })
}

export function trophyLetter(trophy) {
  return makeLetter({
    from: '명예의 전당',
    icon: '🏆',
    title: `트로피 획득 — ${trophy.label}`,
    body: `${trophy.desc}\n클럽하우스 앞에 트로피가 진열됐어. 축하해! 🎉`,
    coins: trophy.coins,
  })
}

// -----------------------------------------------------------------------------------
// 마을 발전도 — 꾸민 만큼, 경기를 연 만큼 마을이 자란다
// -----------------------------------------------------------------------------------
export function villageScore(s) {
  const decorOwned = DECORS.filter((d) => s.owned[d.id]).length
  const skinOwned = COURT_SKINS.filter((c) => s.owned[c.id] && c.price > 0).length
  return decorOwned * 12 + skinOwned * 8 + Math.min(120, (s.career?.matchesHosted || 0)) + Math.min(60, (s.streak?.count || 0) * 4)
}

export const VILLAGE_LEVELS = [
  { lv: 1, need: 0, label: '조용한 공터', unlock: '기본 마을' },
  { lv: 2, need: 30, label: '아담한 쉼터', unlock: '축제 깃발이 걸려' },
  { lv: 3, need: 70, label: '북적이는 클럽', unlock: '벚나무 길이 생겨' },
  { lv: 4, need: 130, label: '소문난 배드민턴 마을', unlock: '열기구가 떠올라' },
  { lv: 5, need: 210, label: '전설의 셔틀타운', unlock: '밤하늘 불꽃놀이!' },
]

export function villageLevel(s) {
  const score = villageScore(s)
  let cur = VILLAGE_LEVELS[0]
  for (const l of VILLAGE_LEVELS) if (score >= l.need) cur = l
  const next = VILLAGE_LEVELS.find((l) => l.lv === cur.lv + 1) || null
  return { ...cur, score, next }
}

// -----------------------------------------------------------------------------------
// 트로피 — 달성 순간 클럽하우스 앞에 진열 + 축하 편지
// -----------------------------------------------------------------------------------
export const TROPHIES = [
  { id: 't_first_game', label: '첫 경기', icon: '🥇', desc: '마을에서 처음으로 코트에 섰다!', coins: 100, cond: (s) => s.career.games >= 1 },
  { id: 't_games10', label: '10경기 출전', icon: '🏆', desc: '통산 10경기를 뛰었다.', coins: 250, cond: (s) => s.career.games >= 10 },
  { id: 't_games30', label: '30경기 출전', icon: '👑', desc: '통산 30경기! 마을의 단골.', coins: 500, cond: (s) => s.career.games >= 30 },
  { id: 't_dex10', label: '도감 10명', icon: '📖', desc: '10명과 코트에 함께 섰다.', coins: 200, cond: (s) => s.career.partners >= 10 },
  { id: 't_dex25', label: '도감 25명', icon: '📚', desc: '25명과 함께 뛰었다. 이제 모르는 얼굴이 없다.', coins: 400, cond: (s) => s.career.partners >= 25 },
  { id: 't_hosted30', label: '30경기 개근', icon: '🏸', desc: '마을에서 30경기가 열렸다.', coins: 200, cond: (s) => s.career.matchesHosted >= 30 },
  { id: 't_games100', label: '100경기의 마을', icon: '🎪', desc: '무려 100경기! 진짜 클럽이 됐다.', coins: 600, cond: (s) => s.career.matchesHosted >= 100 },
  { id: 't_friend5', label: '마당발', icon: '💛', desc: '5명과 함께 경기를 뛰었다.', coins: 150, cond: (s) => s.career.partners >= 5 },
  { id: 't_streak7', label: '7일 개근', icon: '📅', desc: '7일 연속 마을에 출석했다.', coins: 350, cond: (s) => (s.streak?.count || 0) >= 7 },
  { id: 't_rich', label: '코인 재벌', icon: '💰', desc: '누적 5,000코인을 모았다.', coins: 300, cond: (s) => s.career.earned >= 5000 },
  { id: 't_gacha10', label: '뽑기 중독', icon: '🎁', desc: '셔틀콕 뽑기를 10번 돌렸다.', coins: 200, cond: (s) => (s.gachaPulls || 0) >= 10 },
  { id: 't_village3', label: '마을 가꾸기', icon: '🌸', desc: '마을 발전도 3단계 달성.', coins: 300, cond: (s) => villageLevel(s).lv >= 3 },
  { id: 't_lift20', label: '리프팅 장인', icon: '🪶', desc: '셔틀 리프팅 20개 달성.', coins: 250, cond: (s) => (s.bestLift || 0) >= 20 },
]

/** 새로 달성한 트로피 목록을 돌려준다 */
export function newTrophies(s) {
  return TROPHIES.filter((t) => !s.achievements[t.id] && t.cond(s))
}
