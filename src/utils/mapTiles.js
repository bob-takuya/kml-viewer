/**
 * 地図タイル取得ユーティリティ
 * OpenStreetMapを使用
 */

/**
 * 緯度経度からタイル座標を計算
 * @param {number} lat - 緯度
 * @param {number} lng - 経度
 * @param {number} zoom - ズームレベル
 * @returns {Object} {x, y} - タイル座標
 */
export function latLngToTile(lat, lng, zoom) {
  const n = Math.pow(2, zoom)
  const x = Math.floor(((lng + 180) / 360) * n)
  const latRad = (lat * Math.PI) / 180
  const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n)
  return { x, y }
}

/**
 * タイル座標から緯度経度を計算
 * @param {number} x - タイルX座標
 * @param {number} y - タイルY座標
 * @param {number} zoom - ズームレベル
 * @returns {Object} {lat, lng} - 緯度経度
 */
export function tileToLatLng(x, y, zoom) {
  const n = Math.pow(2, zoom)
  const lng = (x / n) * 360 - 180
  const latRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n)))
  const lat = (latRad * 180) / Math.PI
  return { lat, lng }
}

/**
 * 範囲に適したズームレベルを計算
 * @param {Object} bounds - {minLat, maxLat, minLng, maxLng}
 * @param {number} maxTiles - 最大タイル数
 * @returns {number} - 適切なズームレベル
 */
export function calculateZoomLevel(bounds, maxTiles = 4) {
  for (let zoom = 18; zoom >= 1; zoom--) {
    const topLeft = latLngToTile(bounds.maxLat, bounds.minLng, zoom)
    const bottomRight = latLngToTile(bounds.minLat, bounds.maxLng, zoom)

    const tilesX = Math.abs(bottomRight.x - topLeft.x) + 1
    const tilesY = Math.abs(bottomRight.y - topLeft.y) + 1

    if (tilesX * tilesY <= maxTiles) {
      return zoom
    }
  }
  return 1
}

/**
 * OpenStreetMapタイルのURLを生成
 * @param {number} x - タイルX座標
 * @param {number} y - タイルY座標
 * @param {number} zoom - ズームレベル
 * @returns {string} - タイルURL
 */
export function getTileUrl(x, y, zoom) {
  // OpenStreetMapのタイルサーバー（複数あるのでランダム選択）
  const subdomains = ['a', 'b', 'c']
  const subdomain = subdomains[Math.floor(Math.random() * subdomains.length)]
  return `https://${subdomain}.tile.openstreetmap.org/${zoom}/${x}/${y}.png`
}

/**
 * 地図タイルを取得して1枚の画像に合成
 * @param {Object} bounds - {minLat, maxLat, minLng, maxLng}
 * @param {number} zoom - ズームレベル
 * @returns {Promise<Object>} - {canvas, bounds, tileInfo}
 */
export async function fetchMapTiles(bounds, zoom) {
  const topLeft = latLngToTile(bounds.maxLat, bounds.minLng, zoom)
  const bottomRight = latLngToTile(bounds.minLat, bounds.maxLng, zoom)

  const minX = Math.min(topLeft.x, bottomRight.x)
  const maxX = Math.max(topLeft.x, bottomRight.x)
  const minY = Math.min(topLeft.y, bottomRight.y)
  const maxY = Math.max(topLeft.y, bottomRight.y)

  const tilesX = maxX - minX + 1
  const tilesY = maxY - minY + 1

  // タイルサイズは256x256ピクセル
  const tileSize = 256
  const canvas = document.createElement('canvas')
  canvas.width = tilesX * tileSize
  canvas.height = tilesY * tileSize
  const ctx = canvas.getContext('2d')

  // 全タイルを取得して描画
  const promises = []

  for (let x = minX; x <= maxX; x++) {
    for (let y = minY; y <= maxY; y++) {
      const promise = new Promise((resolve, reject) => {
        const img = new Image()
        img.crossOrigin = 'anonymous'
        img.onload = () => {
          const canvasX = (x - minX) * tileSize
          const canvasY = (y - minY) * tileSize
          ctx.drawImage(img, canvasX, canvasY, tileSize, tileSize)
          resolve()
        }
        img.onerror = () => {
          console.error(`タイル取得エラー: ${x}, ${y}`)
          resolve() // エラーでも続行
        }
        img.src = getTileUrl(x, y, zoom)
      })
      promises.push(promise)
    }
  }

  await Promise.all(promises)

  // 実際の地理範囲を計算
  const actualTopLeft = tileToLatLng(minX, minY, zoom)
  const actualBottomRight = tileToLatLng(maxX + 1, maxY + 1, zoom)

  return {
    canvas,
    bounds: {
      minLat: actualBottomRight.lat,
      maxLat: actualTopLeft.lat,
      minLng: actualTopLeft.lng,
      maxLng: actualBottomRight.lng
    },
    tileInfo: {
      zoom,
      tilesX,
      tilesY,
      minX,
      minY,
      maxX,
      maxY
    }
  }
}
