// ===================================================================================
// 인스타그램 스토리 공유 — 사진 모드
// ① 카메라를 자유롭게 움직여 각도를 잡고 → ② 찰칵 → ③ 스토리용(9:16) 카드 완성
// 과하지 않게: 사진 위에 작은 로고칩 + 이름/모임/날짜 한 줄만 얹는다.
// ===================================================================================
import { useState } from 'react'
import { useGame } from '../game/store.js'
import { cameraApi } from '../three/Scene.jsx'
import { courtLayout, slotPosition, waitPosition } from '../game/layout.js'

/** 내 캐릭터 위치로 카메라 이동 */
function focusMe() {
  const s = useGame.getState()
  const me = Object.values(s.players).find((p) => p.isMe)
  if (!me) return
  let pos
  if (me.courtId != null && me.slot != null) {
    const l = courtLayout(s.courtCount)[me.courtId]
    if (l) pos = slotPosition(l, me.slot)
  }
  if (!pos) {
    const waiting = s.order.map((id) => s.players[id]).filter((p) => p && p.status === 'waiting')
    const idx = waiting.findIndex((p) => p.isMe)
    pos = waitPosition(Math.max(0, idx))
  }
  cameraApi.moveTo(pos[0], pos[1] + 0.6, 5.4)
}

const rr = (g, x, y, w, h, r) => {
  g.beginPath()
  g.moveTo(x + r, y)
  g.arcTo(x + w, y, x + w, y + h, r)
  g.arcTo(x + w, y + h, x, y + h, r)
  g.arcTo(x, y + h, x, y, r)
  g.arcTo(x, y, x + w, y, r)
  g.closePath()
}

/** 스냅샷 → 1080x1920 스토리 카드 합성 */
async function composeStory() {
  const url = cameraApi.snapshot()
  if (!url) return null
  await document.fonts.ready.catch(() => {})

  const img = new Image()
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url })

  const W = 1080, H = 1920
  const c = document.createElement('canvas')
  c.width = W; c.height = H
  const g = c.getContext('2d')

  // 사진을 9:16으로 꽉 채우기 (cover)
  const sc = Math.max(W / img.width, H / img.height)
  const dw = img.width * sc, dh = img.height * sc
  g.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh)

  // 아래쪽 글자 가독용 아주 옅은 그라데이션
  const grad = g.createLinearGradient(0, H - 460, 0, H)
  grad.addColorStop(0, 'rgba(0,0,0,0)')
  grad.addColorStop(1, 'rgba(0,0,0,0.42)')
  g.fillStyle = grad
  g.fillRect(0, H - 460, W, 460)

  const s = useGame.getState()
  const me = Object.values(s.players).find((p) => p.isMe)
  const name = me?.name || '나'

  // 작은 로고 칩 (좌측 상단)
  g.font = '600 40px Jua, "Malgun Gothic", sans-serif'
  const chipText = '🏸 셔틀빌리지'
  const tw = g.measureText(chipText).width
  g.fillStyle = 'rgba(253,243,220,0.88)'
  rr(g, 44, 64, tw + 56, 84, 42)
  g.fill()
  g.fillStyle = '#6b533b'
  g.textBaseline = 'middle'
  g.fillText(chipText, 44 + 28, 64 + 44)

  // 하단 정보 — 이름 / 모임·날짜 / 오늘 기록
  const club = s.online.status !== 'off' ? s.online.code : (s.seasonName || '')
  const date = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' })

  g.textBaseline = 'alphabetic'
  g.shadowColor = 'rgba(0,0,0,0.35)'
  g.shadowBlur = 10
  g.shadowOffsetY = 3

  g.fillStyle = '#ffffff'
  g.font = '600 66px Jua, "Malgun Gothic", sans-serif'
  g.fillText(`${name} · Lv.${s.me.lv} ${me?.level || ''}`, 56, H - 250)

  g.font = '400 44px Jua, "Malgun Gothic", sans-serif'
  g.fillStyle = 'rgba(255,255,255,0.92)'
  g.fillText([club, date].filter(Boolean).join(' · '), 56, H - 178)

  if (s.today.games > 0) {
    g.font = '400 42px Jua, "Malgun Gothic", sans-serif'
    g.fillStyle = 'rgba(255,255,255,0.85)'
    g.fillText(`오늘 ${s.today.games}경기 ${s.today.wins}승${s.winStreak >= 2 ? ` · ${s.winStreak}연승 🔥` : ''}`, 56, H - 108)
  }
  g.shadowBlur = 0

  return c.toDataURL('image/png')
}

export default function ShareCard({ onClose }) {
  const [img, setImg] = useState(null)
  const [busy, setBusy] = useState(false)
  const toast = useGame((s) => s.toast)

  const shoot = async () => {
    setBusy(true)
    try {
      const url = await composeStory()
      if (url) setImg(url)
      else toast('사진을 찍지 못했어요.', 'warn')
    } finally {
      setBusy(false)
    }
  }

  const share = async () => {
    if (!img) return
    try {
      const blob = await (await fetch(img)).blob()
      const file = new File([blob], `셔틀빌리지_${Date.now()}.png`, { type: 'image/png' })
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: '셔틀빌리지' })
        return
      }
    } catch (e) {
      if (e?.name === 'AbortError') return
    }
    // 공유 미지원(PC 등) → 저장 후 안내
    const a = document.createElement('a')
    a.href = img
    a.download = `셔틀빌리지_스토리.png`
    a.click()
    toast('이미지를 저장했어요! 인스타그램 스토리에 올려보세요 📸', 'good')
  }

  // ── 1단계: 각도 잡기 (화면은 그대로 만질 수 있게 작은 바만 띄운다) ──
  if (!img) {
    return (
      <div
        style={{
          position: 'absolute', left: '50%', transform: 'translateX(-50%)',
          bottom: 'calc(var(--nav-h) + var(--safe-b) + 14px)', zIndex: 40,
          display: 'flex', gap: 8, alignItems: 'center',
        }}
      >
        <div className="ac-panel" style={{ display: 'flex', gap: 8, padding: '10px 12px', borderRadius: 999 }}>
          <button className="ac-btn sm sky" onClick={focusMe}>🎯 내 캐릭터</button>
          <button className="ac-btn sm yellow" disabled={busy} onClick={shoot}>📸 찰칵!</button>
          <button className="ac-btn sm" onClick={onClose}>✕</button>
        </div>
      </div>
    )
  }

  // ── 2단계: 미리보기 + 공유 ──
  return (
    <div className="overlay" style={{ zIndex: 65 }}>
      <div className="ac-panel" style={{ width: 'min(380px, 92vw)', padding: 14, margin: 'auto', textAlign: 'center' }}>
        <img
          src={img}
          alt="스토리 미리보기"
          style={{ width: '100%', aspectRatio: '9/16', objectFit: 'cover', borderRadius: 14, border: '3px solid var(--line)' }}
        />
        <div className="row" style={{ marginTop: 10 }}>
          <button className="ac-btn green" style={{ flex: 1.4 }} onClick={share}>📤 스토리에 공유</button>
          <button className="ac-btn sm" onClick={() => setImg(null)}>다시 찍기</button>
          <button className="ac-btn sm rose" onClick={onClose}>닫기</button>
        </div>
        <div className="muted" style={{ marginTop: 8 }}>
          공유 버튼을 누르고 <b>Instagram → 스토리</b>를 선택하면 바로 올라가요!
        </div>
      </div>
    </div>
  )
}
