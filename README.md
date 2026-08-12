# 姿勢人偶 PoseMan

網頁版 3D 擺姿勢人偶參考工具，以 Three.js 程序化建構擬人化人體模型，可供繪圖、動畫前期參考使用。

## 功能

- **掃描感寫實人偶**：程序化頭顱平面（下顎／顴骨／眼窩／眼瞼／鼻翼鼻孔／嘴唇／耳廓）、虹膜／瞳孔／透明角膜、連續肩頸胸廓腰胯、肌肉轉折、膝肘、手指拇指與自然足型；關節球僅作受控遮接與點選，保留男／女關節人偶的操作讀性
- **人物外觀**：目前人物可調整膚色、膚質（自然／柔滑）、眼睛顏色、服裝配色、體態（均衡／修長／健壯）、髮型（短髮／鮑伯／長髮）與髮色；每人物使用獨立 PBR 材質與 deterministic 微表面變化，設定會跟人物一起自動保存並包含在場景 JSON
- **拖曳擺姿勢**：點選人偶關節後直接拖曳旋轉，或用右側面板 X/Y/Z 滑桿微調
- **姿勢範本**：站立、行走、跑步、坐下、揮手、思考
- **多人物**：人物管理區可切換目前人物、新增男性／女性、移除目前人物（至少保留 1 人）；切換性別會保留目前姿勢與位置
- **授權 GLB 人體匯入**：人物管理接受 `.glb` only，匯入前必須填資產名稱、選自有／CC0／CC BY 4.0／其他授權，並勾選「我有權使用並已核對授權」。CC BY／其他需要作者與 https 來源或授權說明。GLB 會檢查 magic/version、JSON、大小、外部 URI、節點／網格／骨骼／頂點上限，並以 Mixamo、Blender、VRM 常見命名映射 17 個 PoseMan 關節。
- **移動模式**：直接拖曳人物／物品在三維空間自由移動（X/Y/Z，可停放空中任意高度），或以 TransformControls gizmo 沿任一軸／平面精確移動；地面顯示軸色十字基準（X紅/Z藍/Y綠）＋垂直高度線與即時座標標籤（人與 AI/vision agent 皆可直讀）
- **物品元件庫**：椅子、桌子、長凳、木箱、球、台座、落地燈、沙發；先選品項再按「新增物品」，可切換目前物品、調整 Y 旋轉與 0.25–3 倍等比縮放、移除物品
- **預覽模式**：隱藏所有 UI 與選取框，得到乾淨畫面
- **匯出參考圖**：將目前畫面輸出為 PNG（檔名含時間戳）
- **存檔／讀檔**：場景（人物、姿勢、位置、外觀、物品、格線）匯出為 `.json` 檔案、讀檔還原；舊版缺少外觀欄位時套用預設
- **自動儲存**：場景 v5 只把安全的 GLB SHA-256 asset ref、骨架映射、姿勢、位置與授權摘要寫入 `localStorage`；GLB ArrayBuffer 存在本機 IndexedDB，不會把大型 base64 塞進場景 JSON。若另一瀏覽器沒有 asset，畫面會顯示可見警告並保留其他人物。
- **AI 對話控制**：設定 OpenAI 相容 API（Base URL／模型／金鑰）後，以自然語言調整姿勢或放置物品
- **鍵盤快捷鍵**：M 移動模式、P 預覽、G 格線、Delete 刪除選取物品、Esc 取消選取／離開移動、1/2/3 選骨盆／胸腔／頭部、Ctrl+Z／Ctrl+Y 復原／重做（輸入框焦點時不觸發）
- **自訂姿勢庫**：目前姿勢存為具名 preset（localStorage）、套用／刪除、匯出／匯入姿勢 JSON
- **鏡像姿勢**：全身／手臂／腿部鏡像、左→右／右→左複製（y/z 角度正確反號）
- **多角度匯出**：正面／側面／背面／俯視／目前視角、1x/2x/4x、透明背景、四視拼圖 contact sheet
- **選取狀態**：面板顯示「目前選取」；人物柔和靛色 bounding box、物品藍色 bounding box，不再顯示橘色參考球
- **可摺疊控制面板**：右側控制項分為人物管理、姿勢與關節、人物外觀、姿勢工具、匯出參考圖、物品管理、場景檔案；常用的前三區預設展開，其他區塊可用鍵盤或滑鼠展開
- **視角控制**：空白處拖曳旋轉視角、滾輪／雙指縮放，可一鍵重設視角

## 操作說明

| 動作 | 效果 |
| --- | --- |
| 點選人偶關節 | 選取關節並拖曳擺姿勢（不覆蓋關節點） |
| 關節上拖曳 | 旋轉該關節 |
| 移動模式＋拖曳人物/物品 | 三維空間自由移動（含高度）；gizmo 可沿任一軸/平面精確移動 |
| 空白處拖曳 | 旋轉視角 |
| 滾輪／雙指 | 縮放 |
| AI 面板 | 對話控制，如「把左手舉高」「放一張椅子」 |
| M / P / G | 移動模式／預覽／格線切換 |
| 1 / 2 / 3 | 選取骨盆／胸腔／頭部 |
| Ctrl+Z / Ctrl+Y | 復原／重做 |
| 預覽模式 → 匯出參考圖 | 輸出乾淨的 PNG 參考圖 |

右側面板的每個區塊都有可操作的標題列與展開箭頭。選取物品時會自動展開「物品管理」；切換人物時會展開「人物管理」與「人物外觀」。展開狀態只屬於目前 UI，不會寫入場景 JSON。

### GLB 授權與骨架責任

GLB 匯入是使用者主動提供的本機檔案；PoseMan 不替使用者判定第三方授權是否合法。使用者必須自行核對資產來源與授權條件並負責其用途。支援的常見骨架命名包含 Mixamo（`mixamorig:Hips`、`LeftArm`、`LeftForeArm` 等）、Blender（`upper_arm.L`、`forearm.L` 等）、VRM/通用 `hips`、`spine`、`chest`、`neck`、`head`、左右上臂／前臂／手、大腿／小腿／腳。缺少核心關節、SkinnedMesh 或使用外部 URI 的 GLB 會被拒絕，不會清空現場。匯入人物不播放動畫，姿勢控制是相對於原始 rest rotation 的 delta。每個 accessor、sparse payload 與圖片 encoded bytes 都受上限保護；圖片只接受可辨識的 PNG/JPEG/WebP header，未知格式（含 AVIF）會 fail closed。圖片 bufferView 僅接受 GLB BIN 或 `data:` buffer 的宣告來源，並限制所有圖片合計解碼像素（33,554,432）與估算解碼記憶體（128 MiB），避免多張各自合規的 image bomb。取消中的 async 匯入不刪除可能共用的 IndexedDB SHA-256 record。

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
npm test         # Node 內建外觀／場景 schema 回歸測試
node scripts/generate_fixture.mjs # 產生本專案自有 CC0 mini-humanoid GLB fixture
```

Node.js 需求：`^20.19.0 || >=22.12.0`（目前開發環境 Node 24.15）。圖片驗證會在 GLTFLoader 前拒絕未知格式，PNG/JPEG/WebP 單邊不得超過 8192、總像素不得超過 33,554,432，且會限制 encoded image bytes；壓縮圖片實際解碼後的記憶體仍由瀏覽器解碼器管理。

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

- [Three.js](https://threejs.org/)（r166）與官方 `GLTFLoader`／`SkeletonUtils` 相容匯入路徑
- [Vite](https://vite.dev/) 8
- 無後端、無其他執行期依賴；人偶與物品以程序化幾何體建構，幾何可共享快取；人偶外觀材質與微表面 DataTexture 則按人物獨立建立，離場時只 dispose 自有材質／紋理，不處置共享幾何

## 檔案結構

```
src/
  main.js       # 場景、控制器、UI 事件、AI 整合、持久化、匯出
  mannequin.js  # 程序化擬人化人偶、外觀 schema（關節階層）
  props.js      # 物品元件庫（程序化道具）
  glbImporter.js # GLB header/JSON/URI/limits、授權 validator、骨架 alias 與 rest-relative figure adapter
  assetStore.js  # SHA-256 IndexedDB asset store（不寫入大型 localStorage）
  sceneSchema.js # 場景 v5、人物/物品/asset ref sanitize（相容 v1-v4）
  parts.js      # 共享幾何/材質快取
  poses.js      # 姿勢範本（歐拉角，單位：度）
  ai.js         # AI API 設定、system prompt、請求與 JSON 解析
  style.css     # UI 樣式
```
