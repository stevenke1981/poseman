# ADR-005：授權 GLB 資產儲存與可攜場景策略

## 狀態

Accepted and browser-verified for CHANGE-005.

## 決策

1. GLB binary 以 SHA-256 asset id 存在瀏覽器 IndexedDB `poseman-assets-v1` object store。
2. 場景 JSON v5 只保存 `assetRef.assetId`、安全骨架 mapping、姿勢、位置與授權摘要；不保存大型 base64。
3. 授權欄位是使用者責任：匯入前必須確認自有／CC0／CC BY 4.0／其他，並對 CC BY／其他提供作者與 https 來源或授權說明。
4. 讀取場景時先建立保序 placeholder，再非同步從 IndexedDB 驗證與重建外部人物。資產不存在或載入失敗時保留其他人物（必要時保留 placeholder），並發出可見繁中警告。
5. GLB 必須是自包含資料：僅允許無 URI、bufferView 或 bounded `data:` URI；拒絕 `http(s)`、`blob:` 與其他外部 URI。
6. GLTFLoader 前先限制 accessor count/stride/sparse decoded bytes、圖片數量與 encoded bytes，並解析 PNG/JPEG/WebP header（單邊 8192、單圖像素 33,554,432）；未知或 AVIF 等格式 fail closed。image bufferView 必須由 buffer 0 的 GLB BIN 或 `data:` buffer 提供，禁止以 BIN 假裝其他 buffer。所有圖片合計像素上限 33,554,432、估算 RGBA 解碼記憶體上限 128 MiB；壓縮圖片解碼器的實際記憶體仍屬瀏覽器邊界。

## 取捨與回復

- IndexedDB 不可用時，匯入仍可在目前頁面使用，但重新整理後會顯示缺資產警告；不把二進位退回 localStorage。
- 已取消的 async 匯入只 dispose 尚未掛載的 GPU figure，不刪除 content-addressed IndexedDB record，避免誤刪其他場景共用的相同 SHA-256 資產；未引用資產由未來 GC 處理。
- 若未來需要跨裝置攜帶，另設明確的 asset bundle/export 格式，不暗中改變現有場景 JSON。
- v1–v4 場景繼續以程序化人物與既有預設值載入；v5 asset ref 欄位缺失或不安全時會被忽略。
