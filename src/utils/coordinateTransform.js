/**
 * 緯度経度からローカル3D座標系への変換
 * メルカトル図法ベースの簡易的な平面近似を使用
 */

const EARTH_RADIUS = 6378137 // 地球の半径（メートル）

/**
 * 緯度経度をローカル座標に変換
 * @param {number} lat - 緯度
 * @param {number} lng - 経度
 * @param {Object} origin - 基準点の設定
 * @param {number} origin.lat - 基準点の緯度
 * @param {number} origin.lng - 基準点の経度
 * @param {number} origin.x - 基準点の3D空間X座標
 * @param {number} origin.z - 基準点の3D空間Z座標
 * @param {number} origin.scale - スケール係数
 * @param {number} origin.rotation - 回転角度（度）
 * @returns {Object} {x, z} - 3D空間の座標
 */
export function latLngToLocal(lat, lng, origin) {
  // 緯度をラジアンに変換
  const latRad = (origin.lat * Math.PI) / 180
  const rotationRad = (origin.rotation * Math.PI) / 180

  // メルカトル図法による平面近似
  // 経度方向の距離（メートル）
  const dx = ((lng - origin.lng) * Math.PI / 180) * EARTH_RADIUS * Math.cos(latRad)

  // 緯度方向の距離（メートル）
  const dz = -((lat - origin.lat) * Math.PI / 180) * EARTH_RADIUS

  // 回転を適用
  const rotatedX = dx * Math.cos(rotationRad) - dz * Math.sin(rotationRad)
  const rotatedZ = dx * Math.sin(rotationRad) + dz * Math.cos(rotationRad)

  // スケールを適用して3D座標系に変換
  return {
    x: origin.x + rotatedX * origin.scale,
    z: origin.z + rotatedZ * origin.scale
  }
}

/**
 * ローカル座標から緯度経度に逆変換
 * @param {number} x - 3D空間のX座標
 * @param {number} z - 3D空間のZ座標
 * @param {Object} origin - 基準点の設定
 * @returns {Object} {lat, lng} - 緯度経度
 */
export function localToLatLng(x, z, origin) {
  const rotationRad = (origin.rotation * Math.PI) / 180

  // スケールを逆適用
  const scaledX = (x - origin.x) / origin.scale
  const scaledZ = (z - origin.z) / origin.scale

  // 回転を逆適用
  const dx = scaledX * Math.cos(-rotationRad) - scaledZ * Math.sin(-rotationRad)
  const dz = scaledX * Math.sin(-rotationRad) + scaledZ * Math.cos(-rotationRad)

  // メートルから緯度経度に変換
  const latRad = (origin.lat * Math.PI) / 180
  const lng = origin.lng + (dx / (EARTH_RADIUS * Math.cos(latRad))) * (180 / Math.PI)
  const lat = origin.lat - (dz / EARTH_RADIUS) * (180 / Math.PI)

  return { lat, lng }
}

/**
 * デフォルトの基準点設定を作成
 * @returns {Object} デフォルトの基準点設定
 */
export function createDefaultOrigin() {
  return {
    lat: 35.6812, // 東京駅の緯度（例）
    lng: 139.7671, // 東京駅の経度（例）
    x: 0, // 3D空間の中心
    z: 0,
    scale: 1.0, // 1メートル = 1単位
    rotation: 0 // 回転なし
  }
}

/**
 * ポイント配列全体のバウンディングボックスを計算
 * @param {Array} points - ポイント配列
 * @returns {Object} {minLat, maxLat, minLng, maxLng, centerLat, centerLng}
 */
export function calculateBounds(points) {
  if (!points || points.length === 0) {
    return null
  }

  let minLat = Infinity
  let maxLat = -Infinity
  let minLng = Infinity
  let maxLng = -Infinity

  points.forEach(point => {
    minLat = Math.min(minLat, point.lat)
    maxLat = Math.max(maxLat, point.lat)
    minLng = Math.min(minLng, point.lng)
    maxLng = Math.max(maxLng, point.lng)
  })

  return {
    minLat,
    maxLat,
    minLng,
    maxLng,
    centerLat: (minLat + maxLat) / 2,
    centerLng: (minLng + maxLng) / 2
  }
}

/**
 * ポイント配列に基づいて自動的に基準点を設定
 * @param {Array} points - ポイント配列
 * @returns {Object} 自動設定された基準点
 */
export function autoConfigureOrigin(points) {
  const bounds = calculateBounds(points)

  if (!bounds) {
    return createDefaultOrigin()
  }

  return {
    lat: bounds.centerLat,
    lng: bounds.centerLng,
    x: 0,
    z: 0,
    scale: 0.01, // デフォルトのスケール（調整可能）
    rotation: 0
  }
}
