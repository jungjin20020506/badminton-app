// ===================================================================================
// 홈 화면에 추가 안내 — 안드로이드는 원클릭 설치, 아이폰은 방법 안내
// ===================================================================================
import { useEffect, useState } from 'react'

const KEY = 'sv-install-dismissed'

export default function InstallPrompt() {
  const [deferred, setDeferred] = useState(null)
  const [show, setShow] = useState(false)
  const [ios, setIos] = useState(false)

  useEffect(() => {
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true
    if (standalone) return
    if (localStorage.getItem(KEY) === new Date().toDateString()) return

    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent)
    const isSafari = /safari/i.test(navigator.userAgent) && !/crios|fxios|edgios/i.test(navigator.userAgent)

    const onPrompt = (e) => {
      e.preventDefault()
      setDeferred(e)
      setTimeout(() => setShow(true), 12000) // 잠깐 게임을 해 본 뒤에 권한다
    }
    window.addEventListener('beforeinstallprompt', onPrompt)

    if (isIos && isSafari) {
      setIos(true)
      const t = setTimeout(() => setShow(true), 15000)
      return () => {
        clearTimeout(t)
        window.removeEventListener('beforeinstallprompt', onPrompt)
      }
    }
    return () => window.removeEventListener('beforeinstallprompt', onPrompt)
  }, [])

  const close = () => {
    localStorage.setItem(KEY, new Date().toDateString())
    setShow(false)
  }

  const install = async () => {
    if (!deferred) return
    deferred.prompt()
    await deferred.userChoice
    setDeferred(null)
    close()
  }

  if (!show) return null

  return (
    <div className="ac-panel dialogue" style={{ zIndex: 55 }}>
      <div style={{ fontSize: 30 }}>📲</div>
      <div style={{ flex: 1 }}>
        <div className="who">마을 안내원 코코</div>
        {ios ? (
          <div className="msg">
            아이폰이면 아래 <b>공유 버튼 <span style={{ fontSize: 17 }}>􀈂</span>(⬆️)</b> → <b>“홈 화면에 추가”</b>를
            누르면 앱처럼 쓸 수 있어! 다음부턴 아이콘만 누르면 바로 마을로 와.
          </div>
        ) : (
          <div className="msg">앱처럼 쓰고 싶어? 홈 화면에 추가하면 아이콘 하나로 바로 들어올 수 있어!</div>
        )}
        <div className="row" style={{ marginTop: 9 }}>
          {!ios && <button className="ac-btn sm green" onClick={install}>홈 화면에 추가</button>}
          <button className="ac-btn sm" onClick={close}>나중에</button>
        </div>
      </div>
    </div>
  )
}
