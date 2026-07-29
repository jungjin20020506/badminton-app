import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'

/**
 * 개발 중 화면 확인용 — 브라우저 캔버스를 파일로 저장하는 엔드포인트.
 * 개발 서버에서만 동작하고 배포 빌드에는 포함되지 않는다.
 *   fetch('/__save', { method:'POST', body: JSON.stringify({ name, dataUrl }) })
 */
function devSnapshot() {
  return {
    name: 'dev-snapshot',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__save', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          return res.end('POST only')
        }
        let body = ''
        req.on('data', (c) => (body += c))
        req.on('end', () => {
          try {
            const { name = 'snapshot.png', dataUrl } = JSON.parse(body)
            const b64 = String(dataUrl).split(',')[1]
            const dir = path.resolve(server.config.root, '.snapshots')
            fs.mkdirSync(dir, { recursive: true })
            const file = path.join(dir, path.basename(name))
            fs.writeFileSync(file, Buffer.from(b64, 'base64'))
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify({ ok: true, file }))
          } catch (e) {
            res.statusCode = 500
            res.end(String(e))
          }
        })
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), devSnapshot()],
  // 포트가 이미 쓰이고 있으면(다른 세션의 개발 서버 등) PORT 로 넘겨받아 띄운다
  server: { port: Number(process.env.PORT) || 5180, open: true },
})
