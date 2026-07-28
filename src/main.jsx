import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './styles.css'
import './styles-game.css'

ReactDOM.createRoot(document.getElementById('root')).render(<App />)

// 홈 화면에 추가했을 때 앱처럼 빠르게 켜지도록 서비스워커 등록
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}
