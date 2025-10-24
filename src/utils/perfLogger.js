/**
 * パフォーマンス測定ユーティリティ（無効化）
 */

class PerfLogger {
  constructor() {
    // 無効化: 何もしない
  }

  /**
   * タイマー開始（無効化）
   */
  start(label) {
    // 無効化: 何もしない
  }

  /**
   * タイマー終了とログ出力（無効化）
   */
  end(label, details = '') {
    // 無効化: 何もしない
  }

  /**
   * 非同期関数のパフォーマンス測定（無効化）
   */
  async measure(label, fn) {
    // 無効化: 関数だけ実行してログは出さない
    return await fn()
  }

  /**
   * サマリーを出力（無効化）
   */
  printSummary() {
    // 無効化: 何もしない
  }

  /**
   * 結果をクリア（無効化）
   */
  clear() {
    // 無効化: 何もしない
  }
}

// シングルトンインスタンス
export const perfLogger = new PerfLogger()

// グローバルに公開（デバッグ用）
if (typeof window !== 'undefined') {
  window.perfLogger = perfLogger
}
