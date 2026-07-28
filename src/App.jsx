import { useEffect } from 'react'
import Scene from './three/Scene.jsx'
import Hud from './ui/Hud.jsx'
import Panels from './ui/Panels.jsx'
import CharacterCreator from './ui/CharacterCreator.jsx'
import InstallPrompt from './ui/InstallPrompt.jsx'
import MiniGame from './ui/MiniGame.jsx'
import ShareCard from './ui/ShareCard.jsx'
import Login from './ui/Login.jsx'
import { useGame } from './game/store.js'
import { cockstar } from './net/cockstar.js'

export default function App() {
  const booted = useGame((s) => s.booted)
  const hydrate = useGame((s) => s.hydrate)
  const panel = useGame((s) => s.panel)
  const setPanel = useGame((s) => s.setPanel)

  const auth = useGame((s) => s.auth)

  useEffect(() => {
    hydrate()
    // 콕스타 로그인 상태 감시 (로그인해 두면 다음 접속부터 자동 입장)
    cockstar.initAuth().catch(() => {})
  }, [hydrate])

  return (
    <div className="app">
      <div className="canvas-wrap">
        <Scene />
      </div>
      {booted && (
        <>
          <Hud />
          <Panels />
          {panel === 'closet' && <CharacterCreator mode="edit" onClose={() => setPanel('closet')} />}
          {panel === 'minigame' && <MiniGame onClose={() => setPanel('minigame')} />}
          {panel === 'share' && <ShareCard onClose={() => setPanel('share')} />}
          {(panel === 'login' || auth?.needsProfile) && <Login onClose={() => setPanel('login')} />}
          <InstallPrompt />
        </>
      )}
      {!booted && <CharacterCreator mode="create" />}
    </div>
  )
}
