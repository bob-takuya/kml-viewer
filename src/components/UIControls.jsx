import { useState } from 'react'
import { loadMapData } from '../utils/kmlParser'
import './UIControls.css'

/**
 * UIコントロールコンポーネント
 * ファイルアップロード、モード切替、基準点設定などを提供
 */
export function UIControls({
  mode,
  onModeChange,
  onPointsLoaded,
  origin,
  onOriginChange,
  points
}) {
  const [showSettings, setShowSettings] = useState(false)
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    setLoading(true)
    setError(null)

    try {
      const loadedPoints = await loadMapData(file)
      onPointsLoaded(loadedPoints)
    } catch (err) {
      setError(err.message)
      console.error('ファイル読み込みエラー:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleLoadSample = async () => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/造形第五F班.kmz')
      if (!response.ok) {
        throw new Error('サンプルファイルの読み込みに失敗しました')
      }
      const blob = await response.blob()
      const file = new File([blob], '造形第五F班.kmz', { type: 'application/vnd.google-earth.kmz' })
      const loadedPoints = await loadMapData(file)
      onPointsLoaded(loadedPoints)
    } catch (err) {
      setError(err.message)
      console.error('サンプルファイル読み込みエラー:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleOriginChange = (field, value) => {
    onOriginChange({
      ...origin,
      [field]: parseFloat(value) || 0
    })
  }

  return (
    <>
      {/* メインコントロールパネル */}
      <div className="ui-controls">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h3 className="ui-title" style={{ margin: 0 }}>3D Map Viewer</h3>
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'white',
              fontSize: '18px',
              cursor: 'pointer',
              padding: '4px 8px',
              opacity: 0.7,
              transition: 'opacity 0.2s'
            }}
            onMouseEnter={(e) => e.target.style.opacity = '1'}
            onMouseLeave={(e) => e.target.style.opacity = '0.7'}
          >
            {isCollapsed ? '☰' : '✕'}
          </button>
        </div>

        {!isCollapsed && (
          <>

        {/* ファイルアップロード */}
        <div className="control-section">
          <label className="file-upload-label">
            <input
              type="file"
              accept=".kmz,.kml"
              onChange={handleFileUpload}
              disabled={loading}
              className="file-input"
            />
            <span className="file-upload-button">
              {loading ? '読み込み中...' : 'KMZ/KMLファイルを開く'}
            </span>
          </label>
          {error && <div className="error-message">{error}</div>}

          {/* サンプルファイル読み込みボタン */}
          <button
            className="sample-button"
            onClick={handleLoadSample}
            disabled={loading}
          >
            サンプルKMZを読み込む（造形第五F班）
          </button>

          {points && points.length > 0 && (
            <div className="info-message">
              {points.length}個のポイントを読み込み済み
              {points[0]?.id?.startsWith('test-') && (
                <div style={{ marginTop: '4px', fontSize: '11px', opacity: 0.8 }}>
                  ※ テスト用のダミーデータを表示中
                </div>
              )}
            </div>
          )}
        </div>

        {/* モード切替 */}
        <div className="control-section">
          <label className="control-label">表示モード</label>
          <div className="mode-buttons">
            <button
              className={`mode-button ${mode === 'bird' ? 'active' : ''}`}
              onClick={() => onModeChange('bird')}
            >
              鳥瞰
            </button>
            <button
              className={`mode-button ${mode === 'walk' ? 'active' : ''}`}
              onClick={() => onModeChange('walk')}
            >
              ウォークスルー
            </button>
          </div>
        </div>

        {/* 設定パネル切り替え */}
        <button
          className="settings-toggle"
          onClick={() => setShowSettings(!showSettings)}
        >
          {showSettings ? '設定を閉じる' : '座標設定を開く'}
        </button>
          </>
        )}
      </div>

      {/* 設定パネル */}
      {!isCollapsed && showSettings && (
        <div className="settings-panel">
          <h4 className="settings-title">基準点設定</h4>

          <div className="settings-grid">
            <div className="setting-item">
              <label>緯度</label>
              <input
                type="number"
                step="0.0001"
                value={origin.lat}
                onChange={(e) => handleOriginChange('lat', e.target.value)}
              />
            </div>

            <div className="setting-item">
              <label>経度</label>
              <input
                type="number"
                step="0.0001"
                value={origin.lng}
                onChange={(e) => handleOriginChange('lng', e.target.value)}
              />
            </div>

            <div className="setting-item">
              <label>X座標</label>
              <input
                type="number"
                step="0.1"
                value={origin.x}
                onChange={(e) => handleOriginChange('x', e.target.value)}
              />
            </div>

            <div className="setting-item">
              <label>Z座標</label>
              <input
                type="number"
                step="0.1"
                value={origin.z}
                onChange={(e) => handleOriginChange('z', e.target.value)}
              />
            </div>

            <div className="setting-item">
              <label>スケール</label>
              <input
                type="range"
                min="0.001"
                max="1"
                step="0.001"
                value={origin.scale}
                onChange={(e) => handleOriginChange('scale', e.target.value)}
              />
              <span className="setting-value">{origin.scale.toFixed(3)}</span>
            </div>

            <div className="setting-item">
              <label>回転（度）</label>
              <input
                type="range"
                min="0"
                max="360"
                step="1"
                value={origin.rotation}
                onChange={(e) => handleOriginChange('rotation', e.target.value)}
              />
              <span className="setting-value">{origin.rotation}°</span>
            </div>
          </div>

          <div className="settings-hint">
            ヒント: スケールと回転を調整して、3Dモデルと地図データを合わせてください
          </div>
        </div>
      )}

      {/* 操作ガイド */}
      {!isCollapsed && (
      <div className="help-panel">
        <h4>操作方法</h4>
        {mode === 'bird' ? (
          <>
            <p>🖱️ 左クリック + ドラッグ: 回転</p>
            <p>🖱️ 右クリック + ドラッグ: 移動</p>
            <p>🖱️ スクロール: 拡大/縮小</p>
          </>
        ) : (
          <>
            <p>⌨️ WASD: 移動</p>
            <p>🖱️ マウス移動: 視点変更</p>
            <p>🖱️ スクロール: 移動速度調整</p>
          </>
        )}
      </div>
      )}
    </>
  )
}
