# PoseMan GLB 關節契約

PoseMan 控制器固定 17 個關節，匯入器會要求它們全部來自同一個實際 `SkinnedMesh.skeleton`，映射值不可重複，也不接受跨 rig 骨骼。Pose 角度是原始 rest rotation 的相對 delta；GLB 中的動畫不會自動播放。

```text
hips spine chest neck head
shoulderL elbowL wristL shoulderR elbowR wristR
hipL kneeL ankleL hipR kneeR ankleR
```

預設 Mesh2Motion UE-style rig 的安全自動映射如下：

| PoseMan | Mesh2Motion | 說明 |
| --- | --- | --- |
| `hips` | `pelvis` | 骨盆根 |
| `spine` | `spine_01` | 腰椎 |
| `chest` | `spine_03` | 胸腔；不能任意退回 `spine_02` |
| `neck` / `head` | `neck_01` / `head` | 頸、頭 |
| `shoulderL` / `elbowL` / `wristL` | `upperarm_l` / `lowerarm_l` / `hand_l` | 左臂 |
| `shoulderR` / `elbowR` / `wristR` | `upperarm_r` / `lowerarm_r` / `hand_r` | 右臂 |
| `hipL` / `kneeL` / `ankleL` | `thigh_l` / `calf_l` / `foot_l` | 左腿 |
| `hipR` / `kneeR` / `ankleR` | `thigh_r` / `calf_r` / `foot_r` | 右腿 |

保留骨架階層、有效 `JOINTS_0`／`WEIGHTS_0`（每頂點權重有限且合計為 1）、公尺單位、`+Y` up 與 `-Z` forward，可在 Blender 編輯後再匯入。不要把手指 leaf bones 重新命名成核心 17 關節、加入外部 URI，或把一個人物拆成跨 skeleton 映射；安全檢查與診斷會拒絕或要求手動修正。任何重新匯出／混合第三方材質都必須重新核對授權。
