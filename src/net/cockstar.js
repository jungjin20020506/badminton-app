// ===================================================================================
// 콕스타(COCKSTAR) 연동 — 로그인 계정과 경기방을 그대로 함께 쓴다.
//
// 같은 Firebase 프로젝트(noerror-14ce3)의 같은 컬렉션을 읽고 쓴다.
// 콕스타 계정으로 로그인하고, 콕스타 경기방에 그대로 입장한다.
// 콕스타에서 선수를 코트에 넣으면 셔틀빌리지 3D 마을에서 그 선수가 코트로 걸어간다.
//
//   users/{uid}                   : 회원 프로필 (콕스타와 공유)
//   rooms/{roomId}                : 경기방 — 코트/예정매치 상태가 이 문서 안에 들어있다
//   rooms/{roomId}/players/{uid}  : 그 방에 입장한 선수
//
// 셔틀빌리지 전용 데이터(캐릭터 외모)는 svLook 필드로만 덧붙인다.
// 콕스타는 이 필드를 읽지 않으므로 서로 영향이 없다.
// ===================================================================================
import { useGame, randomLook } from '../game/store.js'

// 콕스타 배포본과 동일한 웹 설정
// (Firebase 웹 클라이언트 설정은 모든 방문자에게 전달되는 공개값이며, 보안은 Firestore 규칙이 담당한다)
const firebaseConfig = {
  apiKey: 'AIzaSyC-eeHazZ3kVj7aQicdtlnhEmLbbTJHgGE',
  authDomain: 'noerror-14ce3.firebaseapp.com',
  projectId: 'noerror-14ce3',
  storageBucket: 'noerror-14ce3.firebasestorage.app',
  messagingSenderId: '279065154821',
  appId: '1:279065154821:web:812570dde2bdde560a936c',
  measurementId: 'G-PFGZGHT9T4',
}

let mods = null
let auth = null
let db = null

async function ensure() {
  if (mods) return mods
  const { initializeApp, getApps } = await import('firebase/app')
  const a = await import('firebase/auth')
  const f = await import('firebase/firestore')
  const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig)
  auth = a.getAuth(app)
  db = f.getFirestore(app)
  mods = { a, f }
  return mods
}

/** 콕스타와 동일한 아이디 → 이메일 변환 규칙 */
export const convertToEmail = (input) => {
  const clean = (input || '').trim()
  if (clean === 'domain') return 'domain@special.user'
  if (clean.includes('@')) return clean
  return `${clean}@cockstar.app`
}

/** 콕스타와 동일한 최고관리자 판별 */
export const isSuperAdmin = (user) =>
  !!user && (user.email?.startsWith('domain') || user.email === 'domain@special.user')

/** 콕스타와 동일한 방 관리자 판별 (방장 / 슈퍼관리자 / admins 배열) */
export function isRoomAdmin(user, room) {
  if (!user || !room) return false
  if (isSuperAdmin(user)) return true
  if (user.uid === room.adminUid) return true
  const admins = room.admins || []
  return (
    admins.includes(user.email) ||
    admins.includes(user.uid) ||
    (user.email ? admins.includes(user.email.split('@')[0]) : false)
  )
}

// -----------------------------------------------------------------------------------
// 인증
// -----------------------------------------------------------------------------------
let unsubAuth = null
let unsubProfile = null

/** 앱 시작 시 1회 — 로그인 상태 감시 + 프로필 실시간 반영 */
export async function initAuth() {
  const { a, f } = await ensure()
  if (unsubAuth) return
  unsubAuth = a.onAuthStateChanged(auth, (user) => {
    unsubProfile?.(); unsubProfile = null
    if (!user) {
      useGame.setState({ auth: null })
      return
    }
    unsubProfile = f.onSnapshot(
      f.doc(db, 'users', user.uid),
      (snap) => {
        const profile = snap.exists() ? snap.data() : null
        useGame.setState({
          auth: {
            uid: user.uid,
            email: user.email || '',
            phone: user.phoneNumber || '',
            profile,
            needsProfile: !profile,
            superAdmin: isSuperAdmin(user),
          },
        })
        if (profile) syncMeFromProfile(profile)
      },
      () => useGame.setState({ auth: { uid: user.uid, email: user.email || '', profile: null, needsProfile: true } })
    )
  })
}

/** 콕스타 프로필 → 셔틀빌리지 내 캐릭터 */
function syncMeFromProfile(profile) {
  const s = useGame.getState()
  if (!s.players.me) {
    s.createMe({
      name: profile.name || '선수',
      gender: profile.gender || '남',
      level: profile.level || 'N조',
      look: profile.svLook || randomLook(profile.name || '선수', profile.gender || '남'),
    })
    return
  }
  const patch = {}
  if (profile.name) patch.name = profile.name
  if (profile.level) patch.level = profile.level
  if (profile.gender) patch.gender = profile.gender
  s.setPlayerInfo('me', patch)
  if (profile.svLook) s.setLook('me', profile.svLook)
}

/** 카카오 로그인 (콕스타와 동일한 OIDC 공급자) */
export async function signInKakao() {
  const { a } = await ensure()
  const provider = new a.OAuthProvider('oidc.kakao')
  await a.signInWithPopup(auth, provider)
}

/** 휴대폰 인증번호 발송 — 'recaptcha-container' div 가 화면에 있어야 한다 */
let confirmationResult = null
let recaptcha = null
export async function sendPhoneCode(phone) {
  const { a } = await ensure()
  const number = phone.startsWith('+') ? phone : `+82${phone.replace(/^0/, '')}`
  try { recaptcha?.clear() } catch { /* 이전 인스턴스 정리 */ }
  recaptcha = new a.RecaptchaVerifier(auth, 'recaptcha-container', { size: 'invisible' })
  confirmationResult = await a.signInWithPhoneNumber(auth, number, recaptcha)
}

export async function verifyPhoneCode(code) {
  if (!confirmationResult) throw new Error('인증번호를 먼저 요청해주세요.')
  await confirmationResult.confirm(code)
  confirmationResult = null
}

/** 관리자 전용 아이디/비밀번호 로그인 (콕스타의 숨김 로그인과 동일) */
export async function signInAdmin(id, password) {
  const { a } = await ensure()
  await a.signInWithEmailAndPassword(auth, convertToEmail(id), password)
}

export async function logout() {
  const { a } = await ensure()
  await leaveRoom()
  await a.signOut(auth)
  useGame.setState({ auth: null })
}

/**
 * 프로필 저장 — 콕스타 InitialProfileModal 과 완전히 동일한 필드 구성.
 * (필드가 다르면 콕스타 쪽에서 프로필 입력 창이 다시 뜬다)
 */
export async function saveProfile({ name, level, gender, birthYear, region, svLook }) {
  const { a, f } = await ensure()
  const user = auth.currentUser
  if (!user) throw new Error('로그인이 필요합니다.')
  const now = new Date()
  if (now.getHours() < 2) now.setDate(now.getDate() - 1)
  const dateStr = now.toISOString().split('T')[0]
  const ref = f.doc(db, 'users', user.uid)
  const exists = (await f.getDoc(ref)).exists()
  const base = { name, level, gender, birthYear, region }
  if (exists) {
    await f.updateDoc(ref, { ...base, ...(svLook ? { svLook } : {}) })
  } else {
    await f.setDoc(ref, {
      ...base,
      email: user.email,
      ...(svLook ? { svLook } : {}),
      todayGames: 0,
      lastResetDate: dateStr,
      createdAt: f.serverTimestamp(),
    })
  }
  try { await a.updateProfile(user, { displayName: name }) } catch { /* 선택 사항 */ }
}

/** 캐릭터 외모만 저장 (콕스타는 이 필드를 쓰지 않는다) */
export async function saveLook(look) {
  const { f } = await ensure()
  const user = auth?.currentUser
  if (!user) return
  try {
    await f.updateDoc(f.doc(db, 'users', user.uid), { svLook: look })
    const s = useGame.getState()
    if (s.online?.status === 'room') {
      await f.updateDoc(f.doc(db, 'rooms', s.online.roomId, 'players', user.uid), { svLook: look })
    }
  } catch { /* 프로필이 아직 없으면 무시 */ }
}

// -----------------------------------------------------------------------------------
// 경기방 목록
// -----------------------------------------------------------------------------------
let unsubRooms = null

export async function subscribeRooms(cb) {
  const { f } = await ensure()
  unsubRooms?.()
  unsubRooms = f.onSnapshot(
    f.collection(db, 'rooms'),
    (snap) => {
      const rooms = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      rooms.sort((x, y) => (y.createdAt?.toDate?.()?.getTime() || 0) - (x.createdAt?.toDate?.()?.getTime() || 0))
      cb(rooms, null)
    },
    (e) => cb([], e?.message || '경기방을 불러오지 못했어요.')
  )
  return () => { unsubRooms?.(); unsubRooms = null }
}

/**
 * 새 경기방 만들기 — 콕스타와 동일한 필드.
 * 주소 검색(카카오 지도)은 셔틀빌리지에 없으므로 coords 는 null 로 둔다.
 * 콕맵은 coords 가 있는 방만 지도에 찍으므로(안전 가드 확인됨) 지도에만 안 뜬다.
 */
export async function createRoom({ name, location, description, levelLimit = 'N조', maxPlayers = 20, password = '' }) {
  const { f } = await ensure()
  const user = auth.currentUser
  const s = useGame.getState()
  if (!user) throw new Error('로그인이 필요합니다.')
  const ref = await f.addDoc(f.collection(db, 'rooms'), {
    name,
    location: location || '미지정',
    address: location || '',
    coords: null,
    description: description || '모임 소개가 없습니다.',
    levelLimit,
    maxPlayers: parseInt(maxPlayers, 10) || 20,
    password: password || '',
    adminUid: user.uid,
    adminName: s.auth?.profile?.name || '방장',
    createdAt: f.serverTimestamp(),
    playerCount: 0,
    numScheduledMatches: 4,
    numInProgressCourts: 2,
    scheduledMatches: {},
    inProgressCourts: [],
  })
  return ref.id
}

// -----------------------------------------------------------------------------------
// 경기방 입장 / 실시간 동기화
// -----------------------------------------------------------------------------------
let unsubRoomDoc = null
let unsubRoomPlayers = null
let roomCache = { room: null, players: [] }
const lookCache = new Map()

export async function enterRoom(room, passwordInput) {
  const { f } = await ensure()
  const user = auth.currentUser
  const s = useGame.getState()
  if (!user) throw new Error('로그인이 필요합니다.')

  const admin = isRoomAdmin(user, room)
  if (room.password && !admin && passwordInput !== room.password) {
    throw new Error('비밀번호가 올바르지 않습니다.')
  }

  const profile = s.auth?.profile
  if (!profile) throw new Error('선수 프로필을 먼저 완성해주세요.')

  const playerRef = f.doc(db, 'rooms', room.id, 'players', user.uid)

  // 콕스타 syncJoin 과 동일 — 이미 있으면 이름·급수만 갱신 (기록 보존)
  await f.runTransaction(db, async (t) => {
    const snap = await t.get(playerRef)
    if (!snap.exists()) {
      t.set(playerRef, {
        name: profile.name || '선수',
        level: profile.level || 'N조',
        gender: profile.gender || '남',
        birthYear: profile.birthYear || '',
        region: profile.region || '미설정',
        entryTime: f.serverTimestamp(),
        todayGames: profile.todayGames || 0,
        isResting: false,
        role: 'player',
      })
    } else {
      t.update(playerRef, { name: profile.name || '선수', level: profile.level || 'N조' })
    }
  })

  // 내 3D 외모를 방에 공유 — 다른 사람 화면에서도 내 캐릭터 그대로 보이게
  const myLook = s.players.me?.look
  if (myLook) f.updateDoc(playerRef, { svLook: myLook }).catch(() => {})

  subscribeRoom(room.id, room.name, admin)
  return true
}

function subscribeRoom(roomId, roomName, isAdmin) {
  const { f } = mods
  unsubRoomDoc?.(); unsubRoomPlayers?.()
  roomCache = { room: null, players: [] }

  useGame.setState({ online: { status: 'room', roomId, roomName, isAdmin, code: roomName } })

  unsubRoomDoc = f.onSnapshot(f.doc(db, 'rooms', roomId), (snap) => {
    if (!snap.exists()) {
      useGame.getState().toast('경기방이 삭제되었어요.', 'warn')
      leaveRoom()
      return
    }
    roomCache.room = { id: snap.id, ...snap.data() }
    // 방 정보가 바뀌면 관리자 여부도 다시 판정 (admins 배열 변경 대응)
    const cur = useGame.getState().online
    const nowAdmin = isRoomAdmin(auth.currentUser, roomCache.room)
    if (cur.isAdmin !== nowAdmin) useGame.setState({ online: { ...cur, isAdmin: nowAdmin } })
    applyRoom()
  })

  unsubRoomPlayers = f.onSnapshot(f.collection(db, 'rooms', roomId, 'players'), (snap) => {
    roomCache.players = snap.docs.map((d) => ({ uid: d.id, ...d.data() }))
    applyRoom()
  })
}

/** 콕스타 방 상태 → 셔틀빌리지 3D 마을 상태 */
function applyRoom() {
  const { room, players } = roomCache
  if (!room) return
  const st = useGame.getState()
  const myUid = auth?.currentUser?.uid

  const courtsRaw = Array.isArray(room.inProgressCourts) ? room.inProgressCourts : []
  const courtCount = Math.max(1, Math.min(6, room.numInProgressCourts || courtsRaw.length || 2))

  // 코트에 배정된 선수의 자리 계산
  const posOf = {}
  courtsRaw.slice(0, courtCount).forEach((c, ci) => {
    if (!c || !Array.isArray(c.players)) return
    c.players.forEach((uid, slot) => {
      if (uid) posOf[uid] = { courtId: ci, slot }
    })
  })

  const nextPlayers = {}
  const order = []
  players.forEach((p) => {
    const isMe = p.uid === myUid
    const at = posOf[p.uid]
    const prev = st.players[p.uid]
    if (!lookCache.has(p.uid)) {
      lookCache.set(p.uid, p.svLook || randomLook(p.name || p.uid, p.gender || '남'))
    }
    const look = isMe
      ? st.players.me?.look || p.svLook || lookCache.get(p.uid)
      : p.svLook || lookCache.get(p.uid)

    nextPlayers[p.uid] = {
      id: p.uid,
      name: p.name || '선수',
      gender: p.gender || '남',
      level: p.level || 'N조',
      isMe,
      isBot: !!p.isBot,
      look,
      // 코트에 배정되면 걸어가고, 도착하면(arrive) oncourt 로 바뀐다
      status: at
        ? prev?.status === 'oncourt' && prev?.courtId === at.courtId ? 'oncourt' : 'walking'
        : p.isResting ? 'resting' : 'waiting',
      courtId: at ? at.courtId : null,
      slot: at ? at.slot : null,
      waitSince: prev?.waitSince || (p.entryTime?.toDate?.()?.getTime?.() ?? Date.now()),
      todayGames: p.todayGames || 0,
      todayWins: prev?.todayWins || 0,
      matchHistory: p.matchHistory || [],
      affinity: prev?.affinity ?? 0,
      mood: 0,
      joinedAt: Date.now(),
    }
    order.push(p.uid)
  })

  const courts = Array.from({ length: courtCount }, (_, i) => {
    const c = courtsRaw[i]
    const prev = st.courts[i]
    const ids = c && Array.isArray(c.players) ? c.players.map((x) => x || null) : [null, null, null, null]
    const filled = ids.filter(Boolean).length
    let status = 'empty'
    if (filled > 0) {
      const allHere = ids.every((id) => !id || nextPlayers[id]?.status === 'oncourt')
      status = allHere ? 'playing' : 'filling'
    }
    return {
      id: i,
      players: ids,
      status,
      score: prev?.score || [0, 0],
      winner: null,
      reason: '',
      result: null,
      startTime: c?.startTime || null,
      remote: true, // 점수 대신 경과 시간을 보여준다
    }
  })

  useGame.setState({
    players: nextPlayers,
    order,
    courts,
    courtCount,
    // 경기 예정은 콕스타와 같은 필드를 쓰므로 양쪽 앱에서 똑같이 보인다.
    // 자동 매칭 큐는 콕스타에 없는 개념이라 svAutoMatches 로 따로 둔다(콕스타는 무시).
    scheduledMatches: room.scheduledMatches || {},
    autoMatches: Array.isArray(room.svAutoMatches) ? room.svAutoMatches : [],
    numScheduled: room.numScheduledMatches || 4,
    roomInfo: {
      name: room.name,
      location: room.location,
      description: room.description,
      levelLimit: room.levelLimit,
      maxPlayers: room.maxPlayers,
      adminName: room.adminName,
      numScheduledMatches: room.numScheduledMatches || 4,
    },
  })
}

/** 방에서 나가기 — 콕스타와 동일하게 선수 문서는 남긴다(관리자가 정리) */
export async function leaveRoom() {
  unsubRoomDoc?.(); unsubRoomDoc = null
  unsubRoomPlayers?.(); unsubRoomPlayers = null
  roomCache = { room: null, players: [] }
  const s = useGame.getState()
  if (s.online?.status === 'room') {
    useGame.setState({
      online: { status: 'off', roomId: null, roomName: '', isAdmin: false, code: '' },
      scheduled: [],
      roomInfo: null,
    })
    s.hydrate()
    s.toast('경기방에서 나왔어요.', 'info')
  }
}

// -----------------------------------------------------------------------------------
// 방 안에서의 조작 — 콕스타와 같은 문서를 고쳐서 양쪽 앱이 함께 움직인다
// -----------------------------------------------------------------------------------

/** 휴식 토글 */
export async function setResting(uid, resting) {
  const { f } = await ensure()
  const s = useGame.getState()
  if (s.online?.status !== 'room') return
  await f.updateDoc(f.doc(db, 'rooms', s.online.roomId, 'players', uid), { isResting: resting })
}

/** 코트에 4명 배치 (관리자만) — 콕스타 processStartMatch 와 같은 형식 */
export async function startCourt(courtIndex, uids) {
  const { f } = await ensure()
  const s = useGame.getState()
  if (s.online?.status !== 'room' || !s.online.isAdmin) throw new Error('방 관리자만 할 수 있어요.')
  const roomRef = f.doc(db, 'rooms', s.online.roomId)
  await f.runTransaction(db, async (t) => {
    const snap = await t.get(roomRef)
    if (!snap.exists()) throw new Error('경기방이 없습니다.')
    const data = snap.data()
    const courts = [...(data.inProgressCourts || [])]
    while (courts.length <= courtIndex) courts.push(null)
    if (courts[courtIndex]) throw new Error('이미 사용 중인 코트입니다.')
    const busy = new Set()
    courts.forEach((c) => c?.players?.forEach((p) => p && busy.add(p)))
    if (uids.some((u) => busy.has(u))) throw new Error('이미 경기 중인 선수가 있습니다.')
    courts[courtIndex] = { players: uids, startTime: new Date().toISOString() }
    t.update(roomRef, { inProgressCourts: courts })
  })
}

/** 경기 종료 (관리자만) — 콕스타 handleEndMatch 와 동일하게 기록까지 남긴다 */
export async function endCourt(courtIndex) {
  const { f } = await ensure()
  const s = useGame.getState()
  if (s.online?.status !== 'room' || !s.online.isAdmin) throw new Error('방 관리자만 할 수 있어요.')
  const roomId = s.online.roomId
  const roomRef = f.doc(db, 'rooms', roomId)

  const snap = await f.getDoc(roomRef)
  if (!snap.exists()) return
  const courts = [...(snap.data().inProgressCourts || [])]
  const court = courts[courtIndex]
  if (!court || !court.players) return

  // "A홍길동, B김철수, ..." — 콕스타와 동일한 기록 문자열
  const membersString = court.players
    .map((pid) => {
      const p = s.players[pid]
      if (!p) return '퇴장한 선수'
      const mark = p.level && p.level !== '미설정' ? p.level[0] : ''
      return `${mark}${p.isBot ? `[Bot]${p.name}` : p.name}`
    })
    .join(', ')

  const batch = f.writeBatch(db)
  court.players.forEach((pid) => {
    const p = s.players[pid]
    if (!pid || !p) return
    const hist = Array.isArray(p.matchHistory) ? p.matchHistory : []
    batch.update(f.doc(db, 'rooms', roomId, 'players', pid), {
      todayGames: (p.todayGames || 0) + 1,
      matchHistory: [membersString, ...hist].slice(0, 10),
    })
  })
  await batch.commit()

  courts[courtIndex] = null
  await f.updateDoc(roomRef, { inProgressCourts: courts })
}

/** 코트 수 변경 (관리자만) */
export async function setCourtCountRemote(n) {
  const { f } = await ensure()
  const s = useGame.getState()
  if (s.online?.status !== 'room' || !s.online.isAdmin) return
  const roomRef = f.doc(db, 'rooms', s.online.roomId)
  const snap = await f.getDoc(roomRef)
  const cur = [...((snap.data() || {}).inProgressCourts || [])]
  while (cur.length < n) cur.push(null)
  await f.updateDoc(roomRef, { numInProgressCourts: n, inProgressCourts: cur.slice(0, n) })
}

/**
 * 경기 예정 / 자동 매칭 큐를 방 문서에 저장.
 * scheduledMatches 는 콕스타와 공유하는 필드라 콕스타 화면에도 그대로 뜬다.
 */
export async function saveQueues({ scheduledMatches, autoMatches }) {
  const { f } = await ensure()
  const s = useGame.getState()
  if (s.online?.status !== 'room' || !s.online.isAdmin) return
  const patch = {}
  if (scheduledMatches !== undefined) {
    // undefined/빈 배열은 걸러서 콕스타가 읽을 때 깨지지 않게 한다
    const clean = {}
    Object.keys(scheduledMatches).forEach((k) => {
      const arr = scheduledMatches[k]
      if (Array.isArray(arr) && arr.some(Boolean)) clean[k] = arr.map((x) => x || null)
    })
    patch.scheduledMatches = clean
  }
  if (autoMatches !== undefined) patch.svAutoMatches = autoMatches
  if (!Object.keys(patch).length) return
  await f.updateDoc(f.doc(db, 'rooms', s.online.roomId), patch)
}

/** 모든 코트 비우기 (관리자만) */
export async function resetCourts() {
  const { f } = await ensure()
  const s = useGame.getState()
  if (s.online?.status !== 'room' || !s.online.isAdmin) return
  await f.updateDoc(f.doc(db, 'rooms', s.online.roomId), { scheduledMatches: {}, inProgressCourts: [] })
}

export const cockstar = {
  initAuth, signInKakao, sendPhoneCode, verifyPhoneCode, signInAdmin, logout,
  saveProfile, saveLook, subscribeRooms, createRoom, enterRoom, leaveRoom,
  setResting, startCourt, endCourt, setCourtCountRemote, resetCourts, saveQueues,
  convertToEmail, isSuperAdmin, isRoomAdmin,
}

// 스토어가 순환 참조 없이 방에 저장할 수 있도록 다리를 놓아 둔다
let queueTimer = null
globalThis.__svSaveQueues = (patch) => {
  clearTimeout(queueTimer)
  queueTimer = setTimeout(() => saveQueues(patch).catch(() => {}), 250)
}

// 외모 변경을 콕스타 계정에도 저장 (store 가 순환 참조 없이 호출할 수 있도록 전역 다리)
let lookTimer = null
globalThis.__svSaveLook = (look) => {
  clearTimeout(lookTimer)
  lookTimer = setTimeout(() => saveLook(look), 900) // 색을 연속으로 바꿔도 한 번만 저장
}

// 스토어에서 "온라인 방에서는 직접 고치지 말고 서버로 보내라"고 판단할 때 쓰는 다리
globalThis.__svNet = {
  isGuest: () => useGame.getState().online?.status === 'room',
  sendRest: (id) => {
    const s = useGame.getState()
    const p = s.players[id]
    if (p) setResting(id, p.status !== 'resting').catch((e) => s.toast(e.message, 'warn'))
  },
}
