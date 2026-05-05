"""Transcribe B-group March-2026 broker balances (photo source) into an xlsx.

Photo columns: row#, name, company, account, last BALANCE, withdrawl, update balance, P/L
Output mirrors A-group format: Owner, Broker, Account, [opening], [closing], 出金, 入金, P&L
"""

from __future__ import annotations

from pathlib import Path

from openpyxl import Workbook

ROWS: list[tuple[str, str, str | None, float, float | None, float, float]] = [
    # (Owner, Broker, Account, opening, withdrawl, closing, P/L)
    ("Celia",  "ICM",          "320059913",  17702.95, 4000, 16416.32, 2713.37),
    ("CANDY",  "XM",           "68362490",    3879.56, None,  5049.00, 1169.44),
    ("Celia",  "FPG",          "8818748",     5000.00, None,  5000.00,    0.00),
    ("Celia",  "TITAN",        "8312744",     6534.12, None,  6745.38,  211.26),
    ("CANDY",  "ICM",          "310060151",   2252.16, None,  5807.75, 3555.59),
    ("Simon",  "XM",           None,          2875.14, None,  2875.14,    0.00),
    ("Simon",  "AXI",          "6404867",     5958.14, None,  5958.14,    0.00),
    ("CANDY",  "VANTAGE",      None,          9045.33, None,  9277.17,  231.84),
    ("Simon",  "FXPRO",        "88443402",   18703.24, None, 19728.54, 1025.30),
    ("CANDY",  "EX",           "237402035",   5629.43, None,  7709.10, 2079.67),
    ("Celia",  "SKilling",     "3035364",     1463.28, None,  1633.50,  170.22),
    ("Celia",  "WB",           "8183996",     6984.76, None,  7998.70, 1013.94),
    ("Simon",  "Hyperliquid",  None,          7045.33, None,  6825.45, -219.88),
    ("CANDY",  "IntentX",      None,          7589.64, None,  6913.42, -676.22),
    ("Simon",  "DYDX",         None,          7788.36, None,  6057.39, -1730.97),
    ("Celia",  "Gtrede",       None,          7303.41, None,  4722.36, -2581.05),
    ("Celia",  "alpril",       None,          5000.00, None,  4141.39,  -858.61),
    ("Celia",  "Blazemarkets", None,          5000.00, None,  5000.00,    0.00),
    ("Celia",  "tradersway",   None,          4996.00, None,  4996.00,    0.00),
]


def main() -> None:
    wb = Workbook()
    ws = wb.active
    assert ws is not None
    ws.title = "Sheet1"

    # Mirror A-group format
    ws.append([
        "Owner", "Broker", "Account", "PW", "2FA",
        "1/3/2026Balance", "1/4/2026Balance", "出金", "入金", "P&L",
    ])
    for owner, broker, account, opening, withdraw, closing, pnl in ROWS:
        ws.append([
            owner, broker, account, None, None,
            opening, closing, withdraw, None, pnl,
        ])

    # Totals row
    total_open = sum(r[3] for r in ROWS)
    total_close = sum(r[5] for r in ROWS)
    total_with = sum((r[4] or 0) for r in ROWS)
    total_pnl = sum(r[6] for r in ROWS)
    ws.append([
        None, "total", None, None, None,
        round(total_open, 2), round(total_close, 2),
        round(total_with, 2), 0, round(total_pnl, 2),
    ])

    out = Path(__file__).resolve().parents[2] / "docs" / "forex" / "2026-03 B-group accounts (transcribed from photo).xlsx"
    out.parent.mkdir(parents=True, exist_ok=True)
    wb.save(out)
    print(f"Wrote {out}")
    print(f"Rows: {len(ROWS)}  opening total: {total_open:.2f}  closing total: {total_close:.2f}  P/L total: {total_pnl:.2f}")


if __name__ == "__main__":
    main()
