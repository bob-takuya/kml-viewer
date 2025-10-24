export default function corsProxyPlugin() {
  return {
    name: 'cors-proxy',
    configureServer(server) {
      // KML用プロキシ
      server.middlewares.use('/api/kml', async (req, res) => {
        const url = new URL(req.url, `http://${req.headers.host}`)
        const targetUrl = url.searchParams.get('url')

        if (!targetUrl) {
          res.statusCode = 400
          res.end('Missing url parameter')
          return
        }

        try {
          const response = await fetch(targetUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0'
            }
          })

          if (!response.ok) {
            res.statusCode = response.status
            res.end(`Failed to fetch: ${response.statusText}`)
            return
          }

          const data = await response.text()

          res.setHeader('Content-Type', 'application/vnd.google-earth.kml+xml')
          res.setHeader('Access-Control-Allow-Origin', '*')
          res.statusCode = 200
          res.end(data)
        } catch (error) {
          console.error('KML proxy error:', error)
          res.statusCode = 500
          res.end(`Proxy error: ${error.message}`)
        }
      })

      // 画像用プロキシ（キャッシュ強化版）
      const imageCache = new Map()

      server.middlewares.use('/api/image', async (req, res) => {
        const url = new URL(req.url, `http://${req.headers.host}`)
        const targetUrl = url.searchParams.get('url')

        if (!targetUrl) {
          res.statusCode = 400
          res.end('Missing url parameter')
          return
        }

        // メモリキャッシュをチェック
        if (imageCache.has(targetUrl)) {
          const cached = imageCache.get(targetUrl)
          res.setHeader('Content-Type', cached.contentType)
          res.setHeader('Access-Control-Allow-Origin', '*')
          res.setHeader('Cache-Control', 'public, max-age=86400')
          res.setHeader('X-Cache', 'HIT')
          res.statusCode = 200
          res.end(cached.buffer)
          return
        }

        // リトライロジック
        const maxRetries = 2
        let lastError

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
          try {
            const response = await fetch(targetUrl, {
              headers: {
                'User-Agent': 'Mozilla/5.0',
                'Referer': 'https://www.google.com/'
              },
              signal: AbortSignal.timeout(30000) // 30秒タイムアウト
            })

            if (!response.ok) {
              if (attempt === maxRetries) {
                console.error(`Image fetch failed after ${maxRetries + 1} attempts: ${targetUrl.substring(0, 100)} - ${response.status}`)
                res.statusCode = response.status
                res.end(`Failed to fetch image: ${response.statusText}`)
                return
              }
              lastError = new Error(`HTTP ${response.status}`)
              await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1))) // 指数バックオフ
              continue
            }

            const buffer = await response.arrayBuffer()
            const contentType = response.headers.get('content-type') || 'image/jpeg'

            // メモリキャッシュに保存（最大50枚）
            if (imageCache.size >= 50) {
              const firstKey = imageCache.keys().next().value
              imageCache.delete(firstKey)
            }
            imageCache.set(targetUrl, { buffer: Buffer.from(buffer), contentType })

            res.setHeader('Content-Type', contentType)
            res.setHeader('Access-Control-Allow-Origin', '*')
            res.setHeader('Cache-Control', 'public, max-age=86400')
            res.setHeader('X-Cache', 'MISS')
            res.statusCode = 200
            res.end(Buffer.from(buffer))
            return
          } catch (error) {
            lastError = error
            if (attempt < maxRetries) {
              console.warn(`Image fetch attempt ${attempt + 1} failed: ${targetUrl.substring(0, 80)}... - ${error.message}, retrying...`)
              await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1))) // 指数バックオフ
            }
          }
        }

        // すべてのリトライが失敗
        console.error('Image proxy error (all retries failed):', targetUrl.substring(0, 100), lastError.message)
        res.statusCode = 500
        res.end(`Proxy error after ${maxRetries + 1} attempts: ${lastError.message}`)
      })
    }
  }
}
