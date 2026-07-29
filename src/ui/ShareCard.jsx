// ===================================================================================
// 인스타그램 스토리 공유 — 도트 화면 그대로 9:16 카드로
// 필드 화면(캔버스)을 그대로 떠서 확대하기 때문에 픽셀이 각지게 살아난다.
// ===================================================================================
import { useState } from 'react'
import { useGame } from '../game/store.js'

const APP = '셔틀몬스터'
const FONT = '"Galmuri14", "Galmuri11", "Malgun Gothic", sans-serif'

/** 지금 보고 있는 필드 화면을 그대로 떠 온다 */
function grabField() {
  const cv = document.querySelector('canvas.ow-canvas')
  if (!cv || !cv.width) return null
  try {
    return cv.toDataURL('image/png')
  } catch {
    return null
  }
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
  const url = grabField()
  if (!url) return null
  await document.fonts.ready.catch(() => {})

  const img = new Image()
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url })

  const W = 1080, H = 1920
  const c = document.createElement('canvas')
  c.width = W; c.height = H
  const g = c.getContext('2d')
  g.imageSmoothingEnabled = false

  // 도트 화면을 9:16 에 꽉 채우기 (cover)
  const sc = Math.max(W / img.width, H / img.height)
  const dw = Math.round(img.width * sc), dh = Math.round(img.height * sc)
  g.drawImage(img, Math.round((W - dw) / 2), Math.round((H - dh) / 2), dw, dh)
  g.imageSmoothingEnabled = true

  // 아래쪽 글자 가독용 그라데이션
  const grad = g.createLinearGradient(0, H - 470, 0, H)
  grad.addColorStop(0, 'rgba(10,14,28,0)')
  grad.addColorStop(1, 'rgba(10,14,28,0.72)')
  g.fillStyle = grad
  g.fillRect(0, H - 470, W, 470)

  const s = useGame.getState()
  const me = Object.values(s.players).find((p) => p.isMe)
  const name = me?.name || '트레이너'

  // 로고 칩
  g.font = `600 40px ${FONT}`
  const chipText = `🏸 ${APP}`
  const tw = g.measureText(chipText).width
  g.fillStyle = 'rgba(248,248,240,0.94)'
  rr(g, 44, 64, tw + 56, 84, 10)
  g.fill()
  g.strokeStyle = '#20283c'
  g.lineWidth = 6
  g.stroke()
  g.fillStyle = '#20283c'
  g.textBaseline = 'middle'
  g.fillText(chipText, 44 + 28, 64 + 44)

  const club = s.online.status !== 'off' ? s.online.code : (s.seasonName || '')
  const date = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' })

  g.textBaseline = 'alphabetic'
  g.shadowColor = 'rgba(0,0,0,0.5)'
  g.shadowBlur = 12
  g.shadowOffsetY = 4

  g.fillStyle = '#ffffff'
  g.font = `600 66px ${FONT}`
  g.fillText(`${name} · Lv.${s.me.lv} ${me?.level || ''}`, 56, H - 250)

  g.font = `400 44px ${FONT}`
  g.fillStyle = 'rgba(255,255,255,0.92)'
  g.fillText([club, date].filter(Boolean).join(' · '), 56, H - 178)

  if (s.today.games > 0) {
    g.font = `400 42px ${FONT}`
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
      else toast('사진을 찍지 못했어요. 필드 화면에서 다시 시도해 주세요.', 'warn')
    } finally {
      setBusy(false)
    }
  }

  const share = async () => {
    if (!img) return
    try {
      const blob = await (await fetch(img)).blob()
      const file = new File([blob], `${APP}_${Date.now()}.png`, { type: 'image/png' })
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: APP })
        return
      }
    } catch (e) {
      if (e?.name === 'AbortError') return
    }
    const a = document.createElement('a')
    a.href = img
    a.download = `${APP}_스토리.png`
    a.click()
    toast('이미지를 저장했어요! 인스타그램 스토리에 올려 보세요 📸', 'good')
  }

  // ── 1단계: 위치를 잡고 찰칵 ──
  if (!img) {
    return (
      <div className="shot-bar">
        <div className="pk-win">
          <span className="muted">보고 있는 화면 그대로 찍혀요</span>
          <button className="pk-btn sm primary" disabled={busy} onClick={shoot}>📸 찰칵!</button>
          <button className="pk-btn sm" onClick={onClose}>✕</button>
        </div>
      </div>
    )
  }

  // ── 2단계: 미리보기 + 공유 ──
  return (
    <div className="overlay" style={{ zIndex: 65 }}>
      <div className="pk-win" style={{ width: 'min(380px, 92vw)', padding: 14, margin: 'auto', textAlign: 'center' }}>
        <img
          src={img}
          alt="스토리 미리보기"
          style={{ width: '100%', aspectRatio: '9/16', objectFit: 'cover', imageRendering: 'pixelated', border: '3px solid var(--pk-frame)' }}
        />
        <div className="row" style={{ marginTop: 10 }}>
          <button className="pk-btn primary" style={{ flex: 1.4 }} onClick={share}>📤 스토리에 공유</button>
          <button className="pk-btn sm" onClick={() => setImg(null)}>다시 찍기</button>
          <button className="pk-btn sm danger" onClick={onClose}>닫기</button>
        </div>
        <div className="muted" style={{ marginTop: 8 }}>
          공유 버튼을 누르고 <b>Instagram → 스토리</b>를 선택하면 바로 올라가요!
        </div>
      </div>
    </div>
  )
}
