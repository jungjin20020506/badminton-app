import { useEffect } from 'react'
import Overworld from './ui/Overworld.jsx'
import Hud from './ui/Hud.jsx'
import Panels from './ui/Panels.jsx'
import CharacterCreator from './ui/CharacterCreator.jsx'
import InstallPrompt from './ui/InstallPrompt.jsx'
import MiniGame from './ui/MiniGame.jsx'
import ShareCard from './ui/ShareCard.jsx'
import Login from './ui/Login.jsx'
import WorldMap from './ui/WorldMap.jsx'
import { useGame } from './game/store.js'
import { cockstar } from './net/cockstar.js'
import { applyThemeToDom } from './pixel/palette.js'

export default function App() {
  const booted = useGame((s) => s.booted)
  const hydrate = useGame((s) => s.hydrate)
  const panel = useGame((s) => s.panel)
  const setPanel = useGame((s) => s.setPanel)
  const auth = useGame((s) => s.auth)
  const screen = useGame((s) => s.screen)

  useEffect(() => {
    applyThemeToDom('town')
    hydrate()
    cockstar.initAuth().catch(() => {})
  }, [hydrate])

  // 트레이너를 아직 안 만들었으면 먼저 만든다
  if (!booted) {
    return (
      <div className="app">
        <CharacterCreator mode="create" />
      </div>
    )
  }

  return (
    <div className="app">
      {screen === 'village' ? (
        <>
          <Overworld />
          <Hud />
        </>
      ) : (
        <WorldMap />
      )}

      <Panels />
      {panel === 'closet' && <CharacterCreator mode="edit" onClose={() => setPanel('closet')} />}
      {panel === 'minigame' && <MiniGame onClose={() => setPanel('minigame')} />}
      {panel === 'share' && <ShareCard onClose={() => setPanel('share')} />}
      {(panel === 'login' || auth?.needsProfile) && <Login onClose={() => setPanel('login')} />}
      <InstallPrompt />
    </div>
  )
}
