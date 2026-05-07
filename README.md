# Life-OS — 啟衡完整生活計劃

6 個月個人管理系統。Source of truth 喺呢度，每日執行喺 iOS Reminders + Google Calendar。

> **目標**：65kg → 68kg 純肌肉、HbA1c 5.8% → 5.5%、總T 263 → 350+ ng/dL
> **核心原則**：唔犧牲家庭、唔犧牲事業、唔犧牲健康
> **真正堅持嘅 3 件事**：
> 1. 訓練後 30 分鐘內飲 Whey + 香蕉
> 2. 早餐加 2 隻蛋 + 4 個補餐（蛋白質達 130g+）
> 3. 22:45 美股 hard stop、23:00 必瞓

## 結構

```
life-os/
├── plan/                    ← 靜態 SOP，唔變嘅 reference
│   ├── 00-overview.md       目標、3 個 hard rule、6 個月路線圖
│   ├── 01-daily-schedule.md 每日 17 個時間點
│   ├── 02-meals.md          7 餐詳細 + 替代 + 全日總結
│   ├── 03-training.md       PPL × 2 + 週期化 + AVM 安全紀律
│   ├── 04-supplements.md    9 個時間點補充劑
│   ├── 05-tea-rotation.md   每週茶飲輪流
│   ├── 06-shopping.md       每週超市 + 每月 iHerb
│   ├── 07-rest-day.md       星期日主動恢復
│   ├── 08-warning-signs.md  即時就醫警示信號
│   ├── 09-canada-mode.md    6/1-8/1 加拿大簡化版
│   └── 10-reminders-setup.md iOS Reminders 一次過 setup 步驟
├── log/
│   ├── weekly/              每週日填，git push 永久保存
│   ├── monthly/             月度體重 + 相片對比
│   └── bloodwork/           驗血報告
└── tracking/
    └── metrics.csv          結構化數據（體重、力量、主觀指標）
```

## 配套系統

| 工具 | 角色 |
|---|---|
| Repo（呢度） | 計劃 source of truth、每週/月記錄 |
| Google Calendar | 3 個 hard alarm、週日記錄提醒、月度 milestone |
| iOS Reminders | 每日 5 項 checklist（lock screen widget） |

詳細 setup 睇 [plan/10-reminders-setup.md](plan/10-reminders-setup.md)。
