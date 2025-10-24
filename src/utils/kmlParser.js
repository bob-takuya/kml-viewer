import JSZip from 'jszip'
import { perfLogger } from './perfLogger'

/**
 * KMZファイルを解凍してKMLテキストを取得
 * Google My Mapのネットワークリンク形式に対応
 */
export async function loadKMZ(file) {
  perfLogger.start('KMZ解凍')
  try {
    const zip = await JSZip.loadAsync(file)

    // まずdoc.kmlを探す（Google My Mapの標準構造）
    let docKml = zip.file('doc.kml')

    // doc.kmlがない場合は最初の.kmlファイルを使用
    if (!docKml) {
      const kmlFileName = Object.keys(zip.files).find(name =>
        name.toLowerCase().endsWith('.kml')
      )

      if (!kmlFileName) {
        throw new Error('KMZファイル内にKMLファイルが見つかりません')
      }

      docKml = zip.files[kmlFileName]
    }

    const docKmlText = await docKml.async('string')
    perfLogger.end('KMZ解凍')

    // ネットワークリンクをチェック
    perfLogger.start('KML XML解析')
    const parser = new DOMParser()
    const xml = parser.parseFromString(docKmlText, 'text/xml')
    perfLogger.end('KML XML解析')

    // パースエラーをチェック
    const parserError = xml.querySelector('parsererror')
    if (parserError) {
      throw new Error('KMLのパースに失敗しました: ' + parserError.textContent)
    }

    // NetworkLinkを探す
    const networkLink = xml.querySelector('NetworkLink Link href, NetworkLink > Link > href')

    if (networkLink) {
      // ネットワークリンクが見つかった場合、URLからKMLデータをフェッチ
      const kmlUrl = networkLink.textContent.trim()

      // 開発環境: Viteプロキシを使用
      // 本番環境（GitHub Pages）: 外部CORSプロキシを使用
      const isDevelopment = import.meta.env.DEV

      console.log('🔗 ネットワークリンクURL:', kmlUrl)

      const corsProxies = isDevelopment
        ? [
            { name: 'Vite Proxy', url: `/api/kml?url=${encodeURIComponent(kmlUrl)}` },
            { name: 'CORS.SH', url: `https://proxy.cors.sh/${kmlUrl}` },
            { name: 'CORSProxy.io', url: `https://corsproxy.io/?${encodeURIComponent(kmlUrl)}` },
            { name: 'AllOrigins', url: `https://api.allorigins.win/raw?url=${encodeURIComponent(kmlUrl)}` }
          ]
        : [
            { name: 'CORS.SH', url: `https://proxy.cors.sh/${kmlUrl}` },
            { name: 'CORSProxy.io', url: `https://corsproxy.io/?${encodeURIComponent(kmlUrl)}` },
            { name: 'AllOrigins', url: `https://api.allorigins.win/raw?url=${encodeURIComponent(kmlUrl)}` },
            { name: 'ThingProxy', url: `https://thingproxy.freeboard.io/fetch/${kmlUrl}` }
          ]

      let lastError = null

      // 各プロキシを順番に試す
      for (let i = 0; i < corsProxies.length; i++) {
        const proxy = corsProxies[i]

        try {
          console.log(`🔄 試行 ${i + 1}/${corsProxies.length} [${proxy.name}]: ${proxy.url.substring(0, 100)}...`)

          perfLogger.start('ネットワークリンクフェッチ')
          const response = await fetch(proxy.url, {
            mode: 'cors',
            credentials: 'omit',
            headers: {
              'Accept': 'application/vnd.google-earth.kml+xml, application/xml, text/xml, */*'
            }
          })

          console.log(`📡 ${proxy.name} レスポンス:`, response.status, response.statusText)

          if (!response.ok) {
            perfLogger.end('ネットワークリンクフェッチ', `失敗: ${response.status}`)
            throw new Error(`HTTPエラー: ${response.status} ${response.statusText}`)
          }

          const kmlText = await response.text()
          console.log(`📄 取得データサイズ: ${kmlText.length} 文字`)

          perfLogger.end('ネットワークリンクフェッチ', '成功')
          console.log(`✅ KML取得成功 [${proxy.name}]`)
          return parseKML(kmlText)
        } catch (fetchError) {
          console.error(`❌ 試行 ${i + 1} [${proxy.name}] 失敗:`, fetchError.message)
          lastError = fetchError
          // 次のプロキシを試す
          continue
        }
      }

      // すべてのプロキシが失敗した場合
      console.error('すべてのプロキシで取得に失敗:', lastError)

      // 代替手段を提示
      throw new Error(
        'ネットワークリンクからデータを取得できませんでした。\n' +
        'CORSエラーの可能性があります。\n\n' +
        '代替手段:\n' +
        '1. Google My Mapで「KMLにエクスポート」を選択\n' +
        '2. ダウンロードしたKMZを解凍\n' +
        '3. 中の実際のKMLファイル（通常はdoc.kmlではない別のファイル）をアップロード\n\n' +
        `または、このURLから直接KMLをダウンロードしてアップロードしてください:\n${kmlUrl}`
      )
    } else {
      // ネットワークリンクがない場合は、doc.kmlを直接パース
      return parseKML(docKmlText)
    }
  } catch (error) {
    console.error('KMZ読み込みエラー:', error)
    throw error
  }
}

/**
 * KMLテキストを直接読み込む
 */
export async function loadKML(file) {
  perfLogger.start('KMLファイル読み込み')
  try {
    const kmlText = await file.text()
    perfLogger.end('KMLファイル読み込み')
    return parseKML(kmlText)
  } catch (error) {
    perfLogger.end('KMLファイル読み込み', 'エラー')
    console.error('KML読み込みエラー:', error)
    throw error
  }
}

/**
 * KMLテキストをパースしてポイント情報を抽出
 */
function parseKML(kmlText) {
  perfLogger.start('KMLパース')

  const parser = new DOMParser()
  const xml = parser.parseFromString(kmlText, 'text/xml')

  // パースエラーをチェック
  const parserError = xml.querySelector('parsererror')
  if (parserError) {
    perfLogger.end('KMLパース', 'エラー')
    throw new Error('KMLのパースに失敗しました: ' + parserError.textContent)
  }

  const placemarks = xml.getElementsByTagName('Placemark')
  const points = []

  perfLogger.start('Placemark処理')
  for (let i = 0; i < placemarks.length; i++) {
    const placemark = placemarks[i]

    // 座標を取得（Point geometryのみ）
    const coordinatesElement = placemark.querySelector('Point coordinates')
    if (!coordinatesElement) continue

    const coordsText = coordinatesElement.textContent.trim()
    const coords = coordsText.split(',').map(s => s.trim())

    if (coords.length < 2) continue

    // 名前を取得
    const nameElement = placemark.querySelector('name')
    const name = nameElement ? nameElement.textContent.trim() : `ポイント ${i + 1}`

    // 説明を取得（HTMLが含まれる可能性がある）
    const descElement = placemark.querySelector('description')
    let description = ''
    let descriptionHtml = ''
    let imageUrl = null

    if (descElement) {
      const descText = descElement.textContent.trim()
      descriptionHtml = descText

      // 正規表現で画像URLを抽出（DOMを使うとブラウザが自動プリロードする）
      const imgMatch = descText.match(/<img[^>]+src=["']([^"']+)["'][^>]*>/i)
      if (imgMatch && imgMatch[1]) {
        let originalUrl = imgMatch[1]

        console.log('[KML] Original image URL:', originalUrl)

        // Google My MapsのURLからCORSを妨げるパラメータを削除
        if (originalUrl.includes('usercontent') || originalUrl.includes('ggpht.com')) {
          // /u/0, /u/1 などのユーザーパスを削除
          originalUrl = originalUrl.replace(/\/u\/\d+\//, '/')

          // クエリパラメータを適切に処理
          try {
            const urlObj = new URL(originalUrl)

            // 問題のあるパラメータを削除
            urlObj.searchParams.delete('authuser')
            urlObj.searchParams.delete('authkey')
            urlObj.searchParams.delete('fife')  // Google固有のパラメータも削除

            originalUrl = urlObj.toString()
          } catch (e) {
            // URL解析に失敗した場合は正規表現でフォールバック
            originalUrl = originalUrl.replace(/[?&]authuser=\d+(&|$)/g, '$1')
            originalUrl = originalUrl.replace(/[?&]authkey=[^&]*(&|$)/g, '$1')
            originalUrl = originalUrl.replace(/[?&]fife=[^&]*(&|$)/g, '$1')
            originalUrl = originalUrl.replace(/[?&]$/, '')
            originalUrl = originalUrl.replace(/\?&/, '?')
          }

          console.log('[KML] Cleaned image URL:', originalUrl)
        }

        // Google DriveのURLを直接ダウンロードリンクに変換
        if (originalUrl && originalUrl.includes('drive.google.com')) {
          const fileIdMatch = originalUrl.match(/\/file\/d\/([^/]+)/)
          if (fileIdMatch) {
            imageUrl = `https://drive.google.com/uc?export=view&id=${fileIdMatch[1]}`
          } else {
            imageUrl = originalUrl
          }
        } else {
          imageUrl = originalUrl
        }

        // 元のURLを保存（プロキシURLへの変換はimageCache.jsで行う）
      }

      // HTMLタグを除去してテキストのみ取得（DOMを使わずに正規表現で）
      description = descText.replace(/<[^>]*>/g, '').trim()
    }

    // スタイル情報を取得（オプション）
    const styleUrl = placemark.querySelector('styleUrl')?.textContent

    points.push({
      id: `point-${i}`,
      name,
      description,
      descriptionHtml,
      imageUrl,
      lng: parseFloat(coords[0]),
      lat: parseFloat(coords[1]),
      alt: coords.length > 2 ? parseFloat(coords[2]) : 0,
      styleUrl
    })
  }
  perfLogger.end('Placemark処理', `${points.length}個`)

  console.log(`KMLから${points.length}個のポイントを読み込みました`)

  if (points.length === 0) {
    perfLogger.end('KMLパース', 'エラー: ポイントなし')
    throw new Error('KMLファイル内にポイント（Placemark）が見つかりませんでした')
  }

  perfLogger.end('KMLパース', `${points.length}個のポイント`)
  return points
}

/**
 * ファイルの拡張子から適切なローダーを選択
 */
export async function loadMapData(file) {
  perfLogger.start('マップデータ読み込み')
  const fileName = file.name.toLowerCase()

  try {
    let result
    if (fileName.endsWith('.kmz')) {
      result = await loadKMZ(file)
    } else if (fileName.endsWith('.kml')) {
      result = await loadKML(file)
    } else {
      throw new Error('サポートされていないファイル形式です。.kmz または .kml ファイルを選択してください。')
    }
    perfLogger.end('マップデータ読み込み', `${result.length}個のポイント`)
    return result
  } catch (error) {
    perfLogger.end('マップデータ読み込み', 'エラー')
    throw error
  }
}
