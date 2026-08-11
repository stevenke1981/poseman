# PoseMan 改進建議與 Roadmap

> 本文件供其他 agents 認領與修改使用。
> 每一項都標註：優先度、範圍（scope）、涉及檔案、完成標準（acceptance）。
> 修改前請先讀 `AGENTS.md`（若有）、`README.md` 與相關原始碼，不要擴大 scope。

## 專案現況快照

- 前端：Three.js r166 + Vite 5，無後端、無其他執行期依賴
- 幾何/材質以程序化建構並跨物件共享快取（刪除時**不可**隨意 dispose 共享資源）
- 主要檔案：
  - `src/main.js`（約 800 行，過大：場景/互動/UI/AI/持久化/匯出全部集中）
  - `src/mannequin.js`（程序化人偶，關節階層）
  - `src/props.js`（道具庫）
  - `src/parts.js`（共享幾何/材質快取）
  - `src/poses.js`（姿勢範本，單位：度）
  - `src/ai.js`（OpenAI 相容 API、system prompt、JSON 解析）
  - `src/style.css`（UI 樣式）
- 現有測試/lint：**無**。`package.json` 只有 `dev` / `build` / `preview`

---

## 認領規則（給 agents）

1. 一次只認領一個項目，改動保持可回滾。
2. 不要動到未列在該項目 scope 內的檔案。
3. 不得更動公開 API、schema、密鑰處理，除非該項目明確允許。
4. 完成後需在 PR/commit 說明中附：變更摘要、驗證方式、風險。
5. 至少要能通過 `npm run build`（若已加入 `npm run check` 則用它）。
6. 涉及共享幾何/材質時，禁止對 `parts.js` 快取的資源呼叫 `dispose()`。

---

## 第一階段：穩定性與可維護性（最高優先）

### T1-1. 加入 `npm run check`（最先做）
- 優先度：高
- Scope：只改 `package.json`
- 內容：新增 `"check": "vite build"`（之後 lint/test 就緒可擴充）
- 涉及檔案：`package.json`
- 完成標準：`npm run check` 可執行並成功建置

### T1-2. 拆分 `src/main.js`
- 優先度：高
- Scope：純結構重構，不改變任何行為
- 建議拆分：
  ```
  src/
    scene.js          # renderer / camera / lights / ground / grid
    figures.js        # add/remove figure、activeFigure、pose 擷取
    propsManager.js   # add/remove/rotate props
    interaction.js    # picking、joint drag、move drag、TransformControls
    persistence.js    # serializeScene / applyScene / autosave
    aiActions.js      # sceneSnapshot / applyActions
    ui.js             # DOM refs 與事件綁定
  ```
- 涉及檔案：`src/main.js` → 拆出上列新檔；`index.html` 若有 script 引用需同步
- 完成標準：功能與拆分前完全一致（人偶、拖曳、移動、AI、存讀檔、匯出、自動存檔皆正常）；`npm run build` 通過
- 風險：事件綁定順序（picking 必須在 OrbitControls 之前）需保留，見 `main.js` 註解

### T1-3. 場景匯入驗證（防壞檔/惡意 JSON）
- 優先度：高
- Scope：`applyScene()` 與讀檔流程
- 內容：
  - `figures` / `props` 必須為陣列
  - 位置需為有限數字（`Number.isFinite`）
  - pose 只接受存在於 `JOINT_NAMES` 的關節
  - prop `type` 必須存在於 `PROP_TYPES`
  - 加入 `version` migration 骨架
- 涉及檔案：`src/main.js`（或重構後的 `persistence.js`）、可用到 `mannequin.js`、`props.js` 的匯出
- 完成標準：載入缺欄位/壞欄位的 JSON 不會崩潰，未知關節/道具被安全忽略並不影響其他資料

### T1-4. AI 動作驗證與錯誤回饋
- 優先度：高
- Scope：`applyActions()` 與 chat 回饋
- 內容：
  - clamp `setJoint` / `addJoint` 角度到合法範圍
  - 驗證 `figure` / `prop` 為有效整數且存在
  - 驗證 `joint ∈ JOINT_NAMES`、`type ∈ PROP_TYPES`
  - 對被略過的 action 回報原因（例如「找不到人物 99」）
- 涉及檔案：`src/main.js`（或 `aiActions.js`）
- 完成標準：無效 action 不再靜默跳過，chat 顯示可理解的略過原因；有效 action 正常執行

### T1-5. Undo / Redo
- 優先度：高
- Scope：新增歷史堆疊
- 內容：
  - 以 `serializeScene()` snapshot 作為 history 單位（實作簡單可靠）
  - 觸發點：調整關節、套範本、移動人物/道具、加/刪人物、加/刪道具、AI 執行動作
  - 上限約 50 步，避免記憶體膨脹
  - 提供 UI 按鈕與快捷鍵（Ctrl+Z / Ctrl+Y）
- 涉及檔案：`src/main.js`（或 `persistence.js` + `ui.js`）、`index.html`（按鈕）、`style.css`
- 完成標準：上述操作皆可復原/重做，且與自動存檔不衝突

---

## 第二階段：使用者效率

### T2-1. 鍵盤快捷鍵
- 優先度：中
- Scope：新增全域鍵盤處理
- 建議：
  ```
  M       切換移動模式
  P       切換預覽模式
  G       顯示/隱藏格線
  Ctrl+Z  Undo（需 T1-5）
  Ctrl+Y  Redo（需 T1-5）
  Delete  刪除選取道具
  Esc     取消選取 / 離開移動模式
  1/2/3   選取骨盆/胸腔/頭部
  ```
- 涉及檔案：`src/main.js`（或 `ui.js`）
- 完成標準：快捷鍵不與輸入框（chat/API 設定）衝突；焦點在 input 時不觸發

### T2-2. 自訂姿勢庫
- 優先度：中
- Scope：儲存/命名/套用/匯出入自訂姿勢
- 內容：
  - 儲存目前人物姿勢為具名 preset（存 localStorage）
  - 套用到任一人物
  - 匯出/匯入姿勢 JSON
- 涉及檔案：`src/poses.js`（格式）、`src/main.js`（UI/邏輯）、`index.html`、`style.css`
- 完成標準：自訂姿勢可存、可套、可匯出再匯入還原一致

### T2-3. 鏡像姿勢 / 左右肢體複製
- 優先度：中
- Scope：新增鏡像工具函式與 UI
- 內容：全身左右鏡像、只鏡像手臂、只鏡像腿部、單側複製到另一側
  - 對映：`shoulderL↔R`、`elbowL↔R`、`wristL↔R`、`hipL↔R`、`kneeL↔R`、`ankleL↔R`
  - 鏡像時 y/z 軸角度需正確反號（依 `ai.js` 內的方向約定）
- 涉及檔案：`src/mannequin.js`（可加 helper）、`src/main.js`、`index.html`
- 完成標準：鏡像後左右對稱姿勢視覺正確，可搭配 Undo

### T2-4. 多角度 / 高解析度匯出
- 優先度：中
- Scope：擴充 PNG 匯出
- 內容：正面/側面/背面/俯視/目前視角、透明背景、1x/2x/4x、contact sheet 拼圖
- 涉及檔案：`src/main.js`（匯出邏輯）、`index.html`、`style.css`
- 完成標準：各視角輸出正確；透明背景可選；解析度倍率生效
- 注意：目前匯出前會 `renderer.render` 再 `toDataURL`，改動需保留此順序

### T2-5. 更清楚的選取狀態
- 優先度：中
- Scope：UI 顯示與選取高亮
- 內容：面板顯示「目前選取：左肩 / 椅子 / 人物 1」；道具顯示 bounding box；人物點身體時整體高亮
- 涉及檔案：`src/main.js`、`index.html`、`style.css`
- 完成標準：任何選取狀態都有明確視覺與文字提示

---

## 第三階段：專業姿勢工具

### T3-1. 關節旋轉限制（含自由模式）
- 優先度：中
- Scope：per-joint 限制表 + clamp
- 內容：
  ```js
  const JOINT_LIMITS = {
    elbowL: { x: [-150, 0], y: [-20, 20], z: [-20, 20] },
    kneeL:  { x: [-150, 0], y: [-10, 10], z: [-10, 10] },
    neck:   { x: [-45, 45], y: [-70, 70], z: [-35, 35] },
    // ...其餘關節
  };
  ```
  - 套用於滑桿、拖曳、AI action
  - 提供「自由模式」開關可突破限制
- 涉及檔案：`src/mannequin.js`（限制表）、`src/main.js`
- 完成標準：預設姿勢更自然；自由模式可解除限制

### T3-2. 簡化 IK / 固定腳掌
- 優先度：低（大功能）
- Scope：新增 IK 模組
- 內容：釘住左/右腳、移動骨盆時膝蓋自動彎、手腕拖曳時手臂跟隨
- 涉及檔案：新增 `src/ik.js`、`src/main.js`、`src/mannequin.js`
- 完成標準：釘腳後移動骨盆腳掌不穿地；基本可用不需完美

### T3-3. 相機預設與構圖輔助
- 優先度：低
- Scope：相機工具
- 內容：三分線、頭身比例線、透視格線、地平線、焦距 slider、正交/透視切換、視角 preset
- 涉及檔案：`src/main.js`、`index.html`、`style.css`
- 完成標準：輔助線可開關；相機 preset 可存取

### T3-4. 人體比例/體型擴充
- 優先度：低
- Scope：`mannequin.js` 參數化
- 內容：身高/體型 slider、兒童/壯碩/瘦高、更明確的手肘膝蓋方向、腳掌方向
- 涉及檔案：`src/mannequin.js`、`src/main.js`
- 完成標準：切換體型時保留姿勢與位置（參考現有換性別邏輯）

---

## 安全與品質

### Q-1. API Key 儲存選項
- 優先度：中
- Scope：AI 設定 UI
- 內容：新增「記住 API Key」勾選；未勾選時僅存記憶體、不寫 localStorage；UI 加風險提示
- 涉及檔案：`src/ai.js`、`src/main.js`、`index.html`
- 完成標準：未勾選時重整分頁 key 不保留；勾選時行為同現在

### Q-2. 測試骨架
- 優先度：中
- Scope：加入 Vitest（純邏輯優先）
- 建議測試對象：
  - `parseAIJSON()`（`ai.js`）
  - scene serialize / apply round-trip
  - AI action 驗證
  - preset pose 格式
  - prop type 驗證
- 涉及檔案：`package.json`（devDeps + scripts）、新增 `tests/`、可能需小幅重構讓純函式可被 import
- 完成標準：`npm run test` 可跑並通過；核心純邏輯有覆蓋

### Q-3. 統一角度轉換 helper
- 優先度：低
- Scope：抽出 deg/rad 轉換
- 內容：`degToRadVec` / `radToDegVec` / `clampDeg`，取代散落的轉換
- 涉及檔案：新增 `src/angles.js` 或放 `mannequin.js`，並更新引用處
- 完成標準：行為不變；轉換邏輯集中

### Q-4. 逐步型別化（JSDoc）
- 優先度：低
- Scope：加 JSDoc typedef，不改行為
- 內容：`PropEntry`、`SceneData`、AI action、pose data 型別
- 涉及檔案：相關原始碼
- 完成標準：IDE 型別提示可用；`npm run build` 通過

---

## UI/UX

### U-1. 工具分頁化面板
- 優先度：低
- Scope：UI 重組
- 內容：分為「姿勢 / 人物 / 物品 / 場景 / AI / 匯出」分頁
- 涉及檔案：`index.html`、`style.css`、`src/main.js`
- 完成標準：功能不減，畫面壓迫感降低

### U-2. AI 面板範例 prompt
- 優先度：低
- Scope：AI 面板小改
- 內容：提供可點擊填入的範例指令
- 涉及檔案：`index.html`、`src/main.js`、`style.css`
- 完成標準：點擊範例即帶入輸入框

---

## 建議開發順序

1. T1-1 `npm run check`
2. T1-2 拆分 `main.js`
3. T1-3 場景匯入驗證
4. T1-4 AI 動作驗證
5. T1-5 Undo / Redo
6. 之後依第二/第三階段與品質項目排入

## 最優先三項（若時間有限）

1. **T1-5 Undo / Redo** — 擺姿勢工具沒有復原會讓人不敢嘗試
2. **T1-2 拆分 `main.js`** — 功能已多，續塞單檔會拖慢開發
3. **T1-4 AI 動作驗證** — AI 控制是本專案特色，錯誤需安全可理解可修正

---

## 完成紀錄

- 2026-08-11（第一階段全數完成）：
  - **T1-1**：`package.json` 新增 `"check": "vite build"`。
  - **T1-2**：`main.js` 拆為 `dom.js` / `state.js` / `scene.js` / `figures.js` / `propsManager.js` / `interaction.js` / `persistence.js` / `aiActions.js` / `history.js` / `ui.js`；行為不變（事件順序以註解保留：picking 於 OrbitControls 之後但拖曳期間停用 controls，效果等同舊順序）。
  - **T1-3**：`applyScene()` 驗證 figures/props 陣列、有限數字位置、關節名 ∈ `JOINT_NAMES`、prop type ∈ `PROP_TYPES`；含 version migration 骨架；壞欄位安全忽略。
  - **T1-4**：`applyActions()` 驗證索引/關節/範本/類型、角度 clamp ±180；被略過動作回傳原因，chat 以系統訊息顯示。
  - **T1-5**：snapshot 歷史堆疊（上限 50）；觸發點含關節拖曳、滑桿、範本、重設、性別、加/刪人物、加/刪/旋轉道具、移動拖曳、gizmo、AI 動作；面板「復原／重做」按鈕＋Ctrl+Z / Ctrl+Y（輸入框焦點時不觸發）；與自動存檔不衝突。
  - 驗證：`npm run check` 通過；headless Chrome 截圖渲染正常、無 console 錯誤。
  - 風險：模組間有 ESM 循環引用（figures↔interaction、interaction↔persistence↔history），皆僅於執行期存取函式宣告，頂層無 TDZ 風險；若再拆分請維持此不變量。
- 2026-08-11（第二階段全數完成）：
  - **T2-1**：鍵盤快捷鍵 M/P/G/Delete/Esc/1/2/3，輸入框焦點不觸發（`ui.js`）。
  - **T2-2**：自訂姿勢庫（`poses.js` 存取 helper＋`ui.js` UI）：存/套/刪/匯出/匯入，匯入經 `sanitizePose` 驗證。
  - **T2-3**：`figures.js` 新增 `mirroredPose` / `copiedSidePose`（y/z 反號、L/R 互換），UI 五鍵。
  - **T2-4**：新增 `exporter.js`：視角 preset（front/side/back/top/current）、1x/2x/4x、透明背景、四視拼圖；保留「先 render 再 toDataURL」順序。
  - **T2-5**：面板 `#selInfo` 選取文字；人物/物品 BoxHelper 高亮（預覽隱藏）。
  - 驗證：`npm run check` 通過；headless Chrome 截圖確認新 UI 與 bounding box 正常。
