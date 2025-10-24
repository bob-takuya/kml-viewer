/**
 * IndexedDBを使った画像キャッシュシステム
 * 一度読み込んだ画像を永続的に保存し、再読み込み時に即座に表示
 */

import { perfLogger } from './perfLogger'

const DB_NAME = 'fbx-viewer-cache'
const STORE_NAME = 'images'
const DB_VERSION = 1
const MAX_CACHE_SIZE = 100 // 最大キャッシュ数
const CACHE_EXPIRY = 7 * 24 * 60 * 60 * 1000 // 7日間
const MAX_CONCURRENT_DOWNLOADS = 3 // 同時ダウンロード数の制限

let dbPromise = null

// ダウンロードキュー管理
const downloadQueue = []
let activeDownloads = 0

/**
 * IndexedDBを初期化
 */
function getDB() {
  if (dbPromise) return dbPromise

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)

    request.onupgradeneeded = (event) => {
      const db = event.target.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'url' })
        store.createIndex('timestamp', 'timestamp', { unique: false })
      }
    }
  })

  return dbPromise
}

/**
 * キャッシュから画像を取得
 */
export async function getCachedImage(url) {
  try {
    const db = await getDB()
    const tx = db.transaction(STORE_NAME, 'readonly')
    const store = tx.objectStore(STORE_NAME)

    return new Promise((resolve, reject) => {
      const request = store.get(url)
      request.onsuccess = () => {
        const result = request.result

        // キャッシュが存在し、期限内であれば返す
        if (result && Date.now() - result.timestamp < CACHE_EXPIRY) {
          resolve(result.dataUrl)
        } else if (result) {
          // 期限切れのキャッシュは削除
          deleteCachedImage(url)
          resolve(null)
        } else {
          resolve(null)
        }
      }
      request.onerror = () => reject(request.error)
    })
  } catch (error) {
    console.warn('Cache read error:', error)
    return null
  }
}

/**
 * 画像をキャッシュに保存
 */
export async function setCachedImage(url, dataUrl) {
  try {
    const db = await getDB()

    // キャッシュサイズをチェック
    await limitCacheSize(db)

    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)

    return new Promise((resolve, reject) => {
      const request = store.put({
        url,
        dataUrl,
        timestamp: Date.now()
      })
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  } catch (error) {
    console.warn('Cache write error:', error)
  }
}

/**
 * キャッシュから画像を削除
 */
async function deleteCachedImage(url) {
  try {
    const db = await getDB()
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    store.delete(url)
  } catch (error) {
    console.warn('Cache delete error:', error)
  }
}

/**
 * キャッシュサイズを制限（古いものから削除）
 */
async function limitCacheSize(db) {
  try {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const store = tx.objectStore(STORE_NAME)

    const countRequest = store.count()
    const count = await new Promise((resolve) => {
      countRequest.onsuccess = () => resolve(countRequest.result)
    })

    if (count >= MAX_CACHE_SIZE) {
      // timestampでソートして古いものを削除
      const index = store.index('timestamp')
      const cursorRequest = index.openCursor()

      const deleteTx = db.transaction(STORE_NAME, 'readwrite')
      const deleteStore = deleteTx.objectStore(STORE_NAME)

      let deleteCount = Math.max(1, Math.floor(MAX_CACHE_SIZE * 0.2)) // 20%削除

      cursorRequest.onsuccess = (event) => {
        const cursor = event.target.result
        if (cursor && deleteCount > 0) {
          deleteStore.delete(cursor.primaryKey)
          deleteCount--
          cursor.continue()
        }
      }
    }
  } catch (error) {
    console.warn('Cache limit error:', error)
  }
}

/**
 * 画像をリサイズしてWebPに変換
 */
async function convertToWebP(blob, maxWidth = 800, maxHeight = 800, quality = 0.85) {
  const startTime = performance.now()
  const originalSize = (blob.size / 1024).toFixed(1) // KB

  return new Promise((resolve, reject) => {
    const img = new Image()
    const objectUrl = URL.createObjectURL(blob)

    img.onload = () => {
      // アスペクト比を保ったままリサイズ
      let width = img.width
      let height = img.height
      const originalDimensions = `${width}x${height}`

      if (width > maxWidth || height > maxHeight) {
        const aspectRatio = width / height

        if (width > height) {
          width = maxWidth
          height = width / aspectRatio
        } else {
          height = maxHeight
          width = height * aspectRatio
        }
      }

      // Canvasで描画
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0, width, height)

      // WebPに変換
      canvas.toBlob(
        (webpBlob) => {
          URL.revokeObjectURL(objectUrl)
          if (webpBlob) {
            const duration = performance.now() - startTime
            const newSize = (webpBlob.size / 1024).toFixed(1) // KB
            const compression = ((1 - webpBlob.size / blob.size) * 100).toFixed(1)
            console.log(
              `%c[⏱️ ${duration.toFixed(2)}ms] WebP変換 ${originalDimensions}→${width}x${height}, ${originalSize}KB→${newSize}KB (-${compression}%)`,
              `color: ${duration > 500 ? '#ff9900' : '#00aa00'}; font-weight: bold`
            )
            resolve(webpBlob)
          } else {
            reject(new Error('WebP conversion failed'))
          }
        },
        'image/webp',
        quality
      )
    }

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('Image load failed'))
    }

    img.src = objectUrl
  })
}

/**
 * キュー管理でダウンロードを実行
 */
async function queuedDownload(downloadFn) {
  return new Promise((resolve, reject) => {
    const task = async () => {
      try {
        activeDownloads++
        const result = await downloadFn()
        resolve(result)
      } catch (error) {
        reject(error)
      } finally {
        activeDownloads--
        processQueue()
      }
    }

    if (activeDownloads < MAX_CONCURRENT_DOWNLOADS) {
      task()
    } else {
      downloadQueue.push(task)
    }
  })
}

/**
 * キューを処理
 */
function processQueue() {
  while (downloadQueue.length > 0 && activeDownloads < MAX_CONCURRENT_DOWNLOADS) {
    const task = downloadQueue.shift()
    task()
  }
}

/**
 * 画像URLをプロキシ経由でフェッチしてキャッシュに保存（データURL形式）
 * WebP形式に変換して解像度を下げる
 */
export async function fetchAndCacheImage(url) {
  // まずキャッシュを確認
  perfLogger.start(`キャッシュ確認`)
  const cached = await getCachedImage(url)
  perfLogger.end(`キャッシュ確認`, cached ? 'ヒット' : 'ミス')

  if (cached) {
    return cached
  }

  // キュー管理でダウンロード
  return queuedDownload(async () => {
    const fullStartTime = performance.now()
    try {
      // 既にプロキシURLの場合はそのまま使用
      const proxyUrl = url.startsWith('/api/image') ? url : `/api/image?url=${encodeURIComponent(url)}`

      console.log(`[ImageCache] Fetching (${activeDownloads}/${MAX_CONCURRENT_DOWNLOADS}):`, url.substring(0, 80))

      perfLogger.start('画像フェッチ')
      const response = await fetch(proxyUrl, {
        mode: 'cors',
        credentials: 'omit'
      })

      if (!response.ok) {
        perfLogger.end('画像フェッチ', `失敗: ${response.status}`)
        throw new Error(`HTTP ${response.status}`)
      }

      const blob = await response.blob()
      perfLogger.end('画像フェッチ', `${(blob.size / 1024).toFixed(1)}KB`)

      // WebPに変換してリサイズ
      const webpBlob = await convertToWebP(blob, 800, 800, 0.85)

      // Blob を Data URL に変換
      perfLogger.start('DataURL変換')
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onloadend = () => resolve(reader.result)
        reader.onerror = reject
        reader.readAsDataURL(webpBlob)
      })
      perfLogger.end('DataURL変換')

      // キャッシュに保存（元のURLをキーとして使用）
      perfLogger.start('キャッシュ保存')
      await setCachedImage(url, dataUrl)
      perfLogger.end('キャッシュ保存')

      const fullDuration = performance.now() - fullStartTime
      console.log(
        `%c[ImageCache] ✓ 完了 ${fullDuration.toFixed(0)}ms: ${url.substring(0, 60)}...`,
        'color: #00cc00; font-weight: bold'
      )

      return dataUrl
    } catch (error) {
      const fullDuration = performance.now() - fullStartTime
      console.error(
        `[ImageCache] ✗ エラー ${fullDuration.toFixed(0)}ms:`,
        url.substring(0, 60),
        error.message
      )
      return null
    }
  })
}

/**
 * 複数の画像を並列でプリフェッチ
 */
export async function prefetchImages(urls) {
  const promises = urls.map(url => fetchAndCacheImage(url))
  const results = await Promise.allSettled(promises)

  const successful = results.filter(r => r.status === 'fulfilled' && r.value).length
  console.log(`Prefetched ${successful}/${urls.length} images`)

  return results.map(r => r.status === 'fulfilled' ? r.value : null)
}

/**
 * キャッシュ全体をクリア
 */
export async function clearImageCache() {
  try {
    const db = await getDB()
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    store.clear()
    console.log('Image cache cleared')
  } catch (error) {
    console.warn('Cache clear error:', error)
  }
}
