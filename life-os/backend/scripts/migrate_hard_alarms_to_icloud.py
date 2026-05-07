"""一次性 migration script — 創 11 個 life-os hard alarm events 入 iCloud「私人」calendar。

執行：
    cd backend && uv run python scripts/migrate_hard_alarms_to_icloud.py

成功會 print 11 個 event ID。重跑會建立重複（每次 UID 都唔同），所以淨係跑一次。
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from app.services.icloud_calendar_client import ICloudCalendarClient


HKT_OFFSET = timedelta(hours=8)


def hkt_to_utc(year: int, month: int, day: int, hour: int, minute: int) -> datetime:
    """HKT wall time → UTC datetime（naive UTC）。"""
    return datetime(year, month, day, hour, minute, tzinfo=UTC) - HKT_OFFSET


def main() -> None:
    client = ICloudCalendarClient()
    cals = client.list_calendars()
    target = next((c for c in cals if c.name == "私人"), None)
    if target is None:
        raise SystemExit(f"揾唔到「私人」calendar。現有：{[c.name for c in cals]}")
    print(f"Target calendar: {target.name} ({target.url})\n")

    events = [
        # 1. 早餐 + 補充劑 (08:30 daily)
        dict(
            title="⭐ 早餐 + 補充劑",
            start=hkt_to_utc(2026, 5, 8, 8, 30),
            end=hkt_to_utc(2026, 5, 8, 9, 0),
            description=(
                "每日 hard alarm #1：早餐 + 全部 08:30 補充劑\n"
                "(Acetyl-L-carnitine、Boron、Maca、CoQ10、D3、Silymarin、冬蟲夏草)\n\n"
                "詳細：plan/02-meals.md + plan/04-supplements.md"
            ),
            rrule="FREQ=DAILY",
        ),
        # 2. 飲 Whey + 香蕉 (14:55 Mon-Sat)
        dict(
            title="⭐ 飲 Whey + 香蕉（30 分鐘窗口）",
            start=hkt_to_utc(2026, 5, 8, 14, 55),
            end=hkt_to_utc(2026, 5, 8, 15, 5),
            description=(
                "每日 hard alarm #2：訓練後黃金餐。Whey 1 大 scoop + 1-2 條香蕉 + Creatine 5g。\n\n"
                "⚠️ 增肌 #1 規則 — 30 分鐘內必飲。\n\n詳細：plan/02-meals.md（餐 4）"
            ),
            rrule="FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR,SA",
        ),
        # 3. 美股 hard stop (22:45 daily)
        dict(
            title="⭐ 美股 hard stop",
            start=hkt_to_utc(2026, 5, 7, 22, 45),
            end=hkt_to_utc(2026, 5, 7, 22, 50),
            description="每日 hard alarm #3：美股監控收手。準備瞓覺。\n\n22:45 hard stop → 22:55 Entecavir → 23:00 熄燈。",
            rrule="FREQ=DAILY",
        ),
        # 4. 熄燈 (23:00 daily)
        dict(
            title="⭐ 熄燈瞓覺（睡眠不可妥協）",
            start=hkt_to_utc(2026, 5, 7, 23, 0),
            end=hkt_to_utc(2026, 5, 7, 23, 5),
            description="每日 hard alarm #4：23:00 熄燈，目標 9 小時睡眠至 08:00。\n\n3 件堅持事第 3 件——睡眠係 6 個月計劃嘅根基。",
            rrule="FREQ=DAILY",
        ),
        # 5. 週日填 weekly log (Sunday 21:00)
        dict(
            title="📝 填 weekly log（life-os）",
            start=hkt_to_utc(2026, 5, 10, 21, 0),
            end=hkt_to_utc(2026, 5, 10, 21, 30),
            description="每週日 21:00：copy log/weekly/_template.md 做 2026-Wxx.md，填數據（體重、訓練次數、力量 PR、主觀感覺），git commit + push。",
            rrule="FREQ=WEEKLY;BYDAY=SU",
        ),
        # 6. 月度體重 + 鏡前相片 (1st of month, 08:00)
        dict(
            title="📊 月度體重 + 鏡前相片",
            start=hkt_to_utc(2026, 6, 1, 8, 0),
            end=hkt_to_utc(2026, 6, 1, 8, 30),
            description="每月 1 號早上空腹：1) 量體重 2) 影 3 張鏡前相 3) 寫 log/monthly/2026-MM.md 4) 對比上月。",
            rrule="FREQ=MONTHLY;BYMONTHDAY=1",
        ),
        # 7. iHerb (1st of month, 09:00)
        dict(
            title="🛒 iHerb 補充劑訂購",
            start=hkt_to_utc(2026, 6, 1, 9, 0),
            end=hkt_to_utc(2026, 6, 1, 9, 15),
            description="每月 1 號訂貨：Whey ON 5lbs / Casein ON 4lbs（每 2 個月）/ Creatine（每 3 個月）。\n\n⚠️ 加拿大期間（6/1-8/1）：地址改 Toronto。",
            rrule="FREQ=MONTHLY;BYMONTHDAY=1",
        ),
        # 8. 飛多倫多 6/1 (all-day)
        dict(
            title="✈️ 飛多倫多",
            start=datetime(2026, 6, 1),
            end=datetime(2026, 6, 2),
            all_day=True,
            description="出發加拿大 2 個月。詳細 plan/09-canada-mode.md。",
        ),
        # 9. 返港 8/1 (all-day)
        dict(
            title="🛬 返港 + 訂驗血",
            start=datetime(2026, 8, 1),
            end=datetime(2026, 8, 2),
            all_day=True,
            description="返港 + 訂 8 月尾驗血 appointment。詳細 plan/09-canada-mode.md。",
        ),
        # 10. 8月驗血 (8/25 09:00 HKT)
        dict(
            title="🩸 完整驗血（post-Canada）",
            start=hkt_to_utc(2026, 8, 25, 9, 0),
            end=hkt_to_utc(2026, 8, 25, 10, 0),
            description="完整 panel：GGT/ALT/AST、空腹血糖、HbA1c、完整荷爾蒙板（含總 T）、血脂。\n\nbaseline：HbA1c 5.8% → 5.5%、總 T 263 → 350+ ng/dL。",
        ),
        # 11. 11月體檢 (11/7 09:00 HKT)
        dict(
            title="🎯 Month 6 — 全套體檢 + 結算",
            start=hkt_to_utc(2026, 11, 7, 9, 0),
            end=hkt_to_utc(2026, 11, 7, 10, 0),
            description="6 個月計劃終點。目標 check：體重 65→68 kg、HbA1c 5.8→5.5%、T 263→350+ ng/dL。",
        ),
    ]

    print(f"Creating {len(events)} events...\n")
    for i, e in enumerate(events, 1):
        try:
            parsed = client.create_event(
                calendar_url=target.url,
                title=e["title"],
                start_at=e["start"],
                end_at=e["end"],
                all_day=e.get("all_day", False),
                description=e.get("description"),
                rrule=e.get("rrule"),
            )
            print(f"  [{i:2d}/11] ✓ {e['title']} (UID={parsed.icloud_uid[:8]}...)")
        except Exception as exc:
            print(f"  [{i:2d}/11] ✗ {e['title']}: {exc}")

    print("\nDone.")


if __name__ == "__main__":
    main()
