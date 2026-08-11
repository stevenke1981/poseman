# 姿勢人偶 PoseMan

網頁版 3D 擺姿勢人偶參考工具，以 Three.js 程序化建構擬人化人體模型，可供繪圖、動畫前期參考使用。

## 功能

- **擬人化人偶**：臉部（眼／鼻／耳／下巴）、頭髮、手部與拇指、四肢錐度與小腿曲線、暖色膚色，男／女體型
- **拖曳擺姿勢**：點選人偶關節後直接拖曳旋轉，或用右側面板 X/Y/Z 滑桿微調
- **姿勢範本**：站立、行走、跑步、坐下、揮手、思考
- **多人物**：加入／移除多個角色、切換性別（保留目前姿勢與位置）
- **移動模式**：點選人物／物品後以 TransformControls gizmo 移動（X 軸、Z 軸箭頭與 XZ 自由平面），雙向、任意方向皆穩定
- **物品元件庫**：椅子、桌子、長凳、木箱、球、台座；可旋轉／刪除
- **預覽模式**：隱藏所有 UI 與關節指示球，得到乾淨畫面
- **匯出參考圖**：將目前畫面輸出為 PNG（檔名含時間戳）
- **存檔／讀檔**：場景（人物、姿勢、位置、物品、格線）匯出為 `.json` 檔案、讀檔還原
- **自動儲存**：場景自動存入 `localStorage`，重新整理不丟失
- **AI 對話控制**：設定 OpenAI 相容 API（Base URL／模型／金鑰）後，以自然語言調整姿勢或放置物品
- **視角控制**：空白處拖曳旋轉視角、滾輪／雙指縮放，可一鍵重設視角

## 操作說明

| 動作 | 效果 |
| --- | --- |
| 點選人偶關節 | 選取關節（橘色線框球標示） |
| 關節上拖曳 | 旋轉該關節 |
| 移動模式＋點選人物/物品 | 顯示 gizmo，拖曳箭頭/平面移動 |
| 空白處拖曳 | 旋轉視角 |
| 滾輪／雙指 | 縮放 |
| AI 面板 | 對話控制，如「把左手舉高」「放一張椅子」 |
| 預覽模式 → 匯出參考圖 | 輸出乾淨的 PNG 參考圖 |

## AI 設定

點底欄「AI」開啟對話視窗，點「⚙」填入：

- **Base URL**：任何 OpenAI 相容端點，如 `https://api.openai.com/v1`、`https://api.deepseek.com`、Ollama `http://localhost:11434/v1`
- **模型**：如 `gpt-4o-mini`、`deepseek-chat`、`llama3.1`
- **API Key**：需要金鑰的服務必填；金鑰僅存於本機瀏覽器 localStorage

助手會收到目前場景快照與動作 schema，回傳 JSON 動作序列（調整關節、套範本、加/移物品與人物等）並自動執行。

## 開發

```bash
npm install
npm run dev      # http://localhost:5173
```

## 建置

```bash
npm run build    # 輸出至 dist/
npm run preview  # 本機預覽建置結果
```

## 參考專案

- [ftsuda/web-poser](https://github.com/ftsuda/web-poser)（MIT）— 3D 人偶擺姿勢參考工具；移動模式 gizmo（TransformControls）與場景編排做法參考自此專案
- [FranRival/Drawing-pose-reference-3d](https://github.com/FranRival/Drawing-pose-reference-3d) — 繪畫用 3D 姿勢參考（多體型、sheet 匯出）
- [cahalanej/3d-mannequin](https://github.com/cahalanej/3d-mannequin) — three.js 可擺姿勢人偶早期實作

## 技術

- [Three.js](https://threejs.org/)（r166）
- [Vite](https://vitejs.dev/) 5
- 無後端、無其他執行期依賴；人偶與物品以程序化幾何體建構，幾何與材質跨物件共享快取

## 檔案結構

```
src/
  main.js       # 場景、控制器、UI 事件、AI 整合、持久化、匯出
  mannequin.js  # 程序化擬人化人偶（關節階層）
  props.js      # 物品元件庫（程序化道具）
  parts.js      # 共享幾何/材質快取
  poses.js      # 姿勢範本（歐拉角，單位：度）
  ai.js         # AI API 設定、system prompt、請求與 JSON 解析
  style.css     # UI 樣式
```
