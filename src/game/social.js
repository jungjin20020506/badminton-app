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
    title: `${name} 님, 셔틀빌리지에 온 걸 환영해!`,
    body: `이 마을은 배드민턴을 사랑하는 사람들이 모여 사는 곳이야.\n경기를 뛰면 코인이 모이고, 코인으로 나와 마당을 꾸밀 수 있어.\n\n작은 선물을 넣어뒀어. 자주 놀러 와! 💛`,
    coins: 200,
  })
}

export function daySummaryLetter(day, today, coinsEarned) {
  const line =
    today.games === 0
      ? '어제는 경기를 안 뛰었네? 오늘은 한 판 어때!'
      : `어제 ${today.games}경기 ${today.wins}승! ${today.wins >= 2 ? '정말 멋졌어 🔥' : '오늘도 화이팅!'}`
  return makeLetter({
    from: '마을 소식지',
    icon: '📰',
    title: `${day}일차 마을 소식`,
    body: `${line}\n마을에서 총 ${today.matches}판의 경기가 열렸어.\n오늘의 추천 파트너를 확인해봐 — 같이 뛰면 코인이 2배야!`,
    coins: today.games >= 3 ? 150 : 60,
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
  { lv: 5, need: 210, label: '전설의 셔틀빌리지', unlock: '밤하늘 불꽃놀이!' },
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
  { id: 't_first_win', label: '첫 승리', icon: '🥇', desc: '마을에서 처음으로 경기를 이겼다!', coins: 100, cond: (s) => s.career.wins >= 1 },
  { id: 't_win10', label: '10승 달성', icon: '🏆', desc: '통산 10승을 달성했다.', coins: 250, cond: (s) => s.career.wins >= 10 },
  { id: 't_win30', label: '30승 달성', icon: '👑', desc: '통산 30승! 마을의 강자.', coins: 500, cond: (s) => s.career.wins >= 30 },
  { id: 't_streak3', label: '3연승', icon: '🔥', desc: '한 번도 지지 않고 3연승!', coins: 200, cond: (s) => s.bestWinStreak >= 3 },
  { id: 't_streak5', label: '5연승 신화', icon: '⚡', desc: '무시무시한 5연승 달성.', coins: 400, cond: (s) => s.bestWinStreak >= 5 },
  { id: 't_games30', label: '30경기 개근', icon: '🏸', desc: '마을에서 30경기가 열렸다.', coins: 200, cond: (s) => s.career.matchesHosted >= 30 },
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
