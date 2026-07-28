// ===================================================================================
// 콕스타 경기방 목록 — 콕스타에서 만든 방이 그대로 보이고, 그대로 입장한다.
// ===================================================================================
import { useEffect, useState } from 'react'
import { useGame } from '../game/store.js'
import { cockstar } from '../net/cockstar.js'
import { LEVEL_COLOR } from '../game/constants.js'

export default function RoomList({ onClose }) {
  const auth = useGame((s) => s.auth)
  const online = useGame((s) => s.online)
  const toast = useGame((s) => s.toast)

  const [rooms, setRooms] = useState(null)
  const [err, setErr] = useState(null)
  const [q, setQ] = useState('')
  const [pwFor, setPwFor] = useState(null) // 비밀번호 입력 중인 방
  const [pw, setPw] = useState('')
  const [busy, setBusy] = useState(false)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ name: '', location: '', description: '', maxPlayers: 20, password: '' })

  useEffect(() => {
    let stop = null
    cockstar.subscribeRooms((list, error) => {
      setRooms(list)
      setErr(error)
    }).then((fn) => { stop = fn })
    return () => stop?.()
  }, [])

  const enter = async (room, password) => {
    setBusy(true)
    try {
      await cockstar.enterRoom(room, password)
      toast(`🏸 「${room.name}」 경기방에 입장했어!`, 'good')
      setPwFor(null)
      setPw('')
      onClose()
    } catch (e) {
      toast(e.message || '입장하지 못했어요.', 'warn')
    } finally {
      setBusy(false)
    }
  }

  const create = async () => {
    if (!form.name.trim()) return toast('경기방 이름을 적어줘!', 'warn')
    setBusy(true)
    try {
      const id = await cockstar.createRoom(form)
      const room = { id, ...form, adminUid: auth.uid, password: form.password }
      await cockstar.enterRoom(room, form.password)
      toast('경기방을 만들었어! 🎉', 'good')
      onClose()
    } catch (e) {
      toast(e.message || '만들지 못했어요.', 'warn')
    } finally {
      setBusy(false)
    }
  }

  const filtered = (rooms || []).filter(
    (r) => (r.name || '').includes(q) || (r.location || '').includes(q)
  )

  if (!auth) {
    return (
      <div className="muted">
        경기방을 쓰려면 먼저 콕스타 계정으로 로그인해야 해.
      </div>
    )
  }

  if (online.status === 'room') {
    return (
      <>
        <div className="court-mini live" style={{ padding: 12 }}>
          <div className="spread">
            <b>🏸 {online.roomName}</b>
            <span className="ac-chip">{online.isAdmin ? '👑 방 관리자' : '🙋 참가 중'}</span>
          </div>
          <div className="muted" style={{ marginTop: 6 }}>
            콕스타에서 선수를 코트에 넣으면 여기 3D 마을에서 바로 움직여!
            {online.isAdmin && ' 관리자니까 여기서도 경기를 시작·종료할 수 있어.'}
          </div>
        </div>
        <button className="ac-btn rose wide" style={{ marginTop: 12 }} onClick={() => cockstar.leaveRoom()}>
          🚪 경기방 나가기
        </button>
      </>
    )
  }

  if (creating) {
    return (
      <>
        <div className="sect">새 경기방 만들기</div>
        <input className="ac-input" placeholder="경기방 이름" value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input className="ac-input" style={{ marginTop: 8 }} placeholder="장소 (예: 성남 탄천체육관)"
          value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
        <input className="ac-input" style={{ marginTop: 8 }} placeholder="소개 (선택)"
          value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        <div className="row" style={{ marginTop: 8 }}>
          <input className="ac-input" type="number" min="4" placeholder="정원" value={form.maxPlayers}
            onChange={(e) => setForm({ ...form, maxPlayers: e.target.value })} />
          <input className="ac-input" placeholder="비밀번호 (선택)" value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </div>
        <div className="muted" style={{ marginTop: 8 }}>
          여기서 만든 방은 콕스타 목록에도 바로 보여. 다만 지도(콕맵)에 표시하려면
          콕스타에서 주소를 한 번 검색해 저장해줘.
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <button className="ac-btn green" style={{ flex: 1 }} disabled={busy} onClick={create}>만들고 입장</button>
          <button className="ac-btn" onClick={() => setCreating(false)}>취소</button>
        </div>
      </>
    )
  }

  return (
    <>
      <div className="row">
        <input className="ac-input" placeholder="경기방·장소 검색" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <button className="ac-btn yellow wide" style={{ marginTop: 8 }} onClick={() => setCreating(true)}>
        ➕ 새 경기방 만들기
      </button>

      {err && <div className="muted" style={{ marginTop: 10, color: 'var(--rose-dark)' }}>{err}</div>}
      {rooms === null && <div className="muted" style={{ marginTop: 12 }}>경기방을 불러오는 중…</div>}

      <div className="plist" style={{ marginTop: 12 }}>
        {filtered.map((r) => {
          const locked = !!r.password
          const mine = r.adminUid === auth.uid
          return (
            <div key={r.id} className={`pcard ${mine ? 'me' : ''}`}>
              <div className="nm">
                <b>{locked && '🔒 '}{r.name}</b>
                <div className="sub">
                  📍 {r.location || '장소 미정'} · 정원 {r.maxPlayers || '-'}명
                  {r.levelLimit && r.levelLimit !== 'N조' && ` · ${r.levelLimit} 이상`}
                  {mine && ' · 👑 내가 만든 방'}
                </div>
                <div className="sub">방장 {r.adminName || '-'}</div>
              </div>
              <button className="ac-btn sm green" disabled={busy}
                onClick={() => (locked && !mine ? setPwFor(r) : enter(r, ''))}>
                입장
              </button>
              {pwFor?.id === r.id && (
                <div style={{ flexBasis: '100%', marginTop: 8 }}>
                  <div className="row">
                    <input className="ac-input" type="password" placeholder="방 비밀번호"
                      value={pw} onChange={(e) => setPw(e.target.value)} />
                    <button className="ac-btn sm green" disabled={busy} onClick={() => enter(r, pw)}>확인</button>
                    <button className="ac-btn sm" onClick={() => { setPwFor(null); setPw('') }}>취소</button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
        {rooms && !filtered.length && <div className="muted">보이는 경기방이 없어. 새로 만들어볼까?</div>}
      </div>
    </>
  )
}
