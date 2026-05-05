"""Transfer smoke tests — CRUD + balance 對賬 + 邊界條件。"""

from fastapi.testclient import TestClient


def _mk_account(client: TestClient, headers: dict, **overrides) -> dict:
    payload = {
        "name": "HSBC 儲蓄",
        "bank": "HSBC",
        "account_type": "savings",
        "currency": "HKD",
        "balance": 10000.0,
        **overrides,
    }
    res = client.post("/api/bank-accounts", headers=headers, json=payload)
    assert res.status_code == 201, res.text
    return res.json()


def _mk_transfer(client: TestClient, headers: dict, from_id: int, to_id: int, amount: float, **overrides) -> dict:
    payload = {
        "from_account_id": from_id,
        "to_account_id": to_id,
        "amount": amount,
        "currency": "HKD",
        "transferred_at": "2026-04-15",
        **overrides,
    }
    res = client.post("/api/transfers", headers=headers, json=payload)
    assert res.status_code == 201, res.text
    return res.json()


def _get_account(client: TestClient, headers: dict, account_id: int) -> dict:
    res = client.get("/api/bank-accounts", headers=headers)
    assert res.status_code == 200
    for a in res.json():
        if a["id"] == account_id:
            return a
    raise AssertionError(f"account {account_id} not found")


def test_list_transfers_empty(client: TestClient, auth_headers: dict[str, str]) -> None:
    res = client.get("/api/transfers", headers=auth_headers)
    assert res.status_code == 200
    assert res.json() == []


def test_create_transfer_updates_balances(client: TestClient, auth_headers: dict[str, str]) -> None:
    savings = _mk_account(client, auth_headers, name="HSBC 儲蓄", balance=10000.0)
    payme = _mk_account(client, auth_headers, name="PayMe", account_type="ewallet", balance=500.0)

    body = _mk_transfer(client, auth_headers, savings["id"], payme["id"], 1000.0)

    assert body["from_account_id"] == savings["id"]
    assert body["to_account_id"] == payme["id"]
    assert body["amount"] == 1000.0
    # Denormalized 戶口 metadata
    assert body["from_account_name"] == "HSBC 儲蓄"
    assert body["to_account_name"] == "PayMe"
    assert body["to_account_type"] == "ewallet"

    # Balance 已經調整
    assert _get_account(client, auth_headers, savings["id"])["balance"] == 9000.0
    assert _get_account(client, auth_headers, payme["id"])["balance"] == 1500.0


def test_credit_card_payment_reduces_owed_amount(client: TestClient, auth_headers: dict[str, str]) -> None:
    """還卡數 — credit balance 正數 = 欠款，還 $500 之後 owed 減少。"""
    bank = _mk_account(client, auth_headers, name="HSBC 儲蓄", balance=5000.0)
    card = _mk_account(client, auth_headers, name="HSBC Platinum", account_type="credit", balance=-2000.0)

    _mk_transfer(client, auth_headers, bank["id"], card["id"], 500.0)

    assert _get_account(client, auth_headers, bank["id"])["balance"] == 4500.0
    # -2000 + 500 = -1500（欠款由 2000 減少至 1500）
    assert _get_account(client, auth_headers, card["id"])["balance"] == -1500.0


def test_delete_transfer_rolls_back_balances(client: TestClient, auth_headers: dict[str, str]) -> None:
    a = _mk_account(client, auth_headers, name="A", balance=1000.0)
    b = _mk_account(client, auth_headers, name="B", balance=1000.0)

    transfer = _mk_transfer(client, auth_headers, a["id"], b["id"], 300.0)
    assert _get_account(client, auth_headers, a["id"])["balance"] == 700.0
    assert _get_account(client, auth_headers, b["id"])["balance"] == 1300.0

    res = client.delete(f"/api/transfers/{transfer['id']}", headers=auth_headers)
    assert res.status_code == 204

    # 回復原狀
    assert _get_account(client, auth_headers, a["id"])["balance"] == 1000.0
    assert _get_account(client, auth_headers, b["id"])["balance"] == 1000.0

    # 列表已經清
    assert client.get("/api/transfers", headers=auth_headers).json() == []


def test_reject_same_account(client: TestClient, auth_headers: dict[str, str]) -> None:
    a = _mk_account(client, auth_headers, name="Solo")
    res = client.post(
        "/api/transfers",
        headers=auth_headers,
        json={
            "from_account_id": a["id"],
            "to_account_id": a["id"],
            "amount": 100.0,
            "currency": "HKD",
            "transferred_at": "2026-04-15",
        },
    )
    assert res.status_code == 400
    assert "相同" in res.json()["detail"]


def test_reject_cross_currency(client: TestClient, auth_headers: dict[str, str]) -> None:
    hkd = _mk_account(client, auth_headers, name="HKD 戶口", currency="HKD")
    usd = _mk_account(client, auth_headers, name="USD 戶口", currency="USD")
    res = client.post(
        "/api/transfers",
        headers=auth_headers,
        json={
            "from_account_id": hkd["id"],
            "to_account_id": usd["id"],
            "amount": 100.0,
            "currency": "HKD",
            "transferred_at": "2026-04-15",
        },
    )
    assert res.status_code == 400
    assert "跨貨幣" in res.json()["detail"]


def test_reject_nonexistent_account(client: TestClient, auth_headers: dict[str, str]) -> None:
    a = _mk_account(client, auth_headers, name="A")
    res = client.post(
        "/api/transfers",
        headers=auth_headers,
        json={
            "from_account_id": a["id"],
            "to_account_id": 9999,
            "amount": 50.0,
            "currency": "HKD",
            "transferred_at": "2026-04-15",
        },
    )
    assert res.status_code == 404


def test_transfers_do_not_affect_expense_stats(client: TestClient, auth_headers: dict[str, str]) -> None:
    """關鍵 invariant — 轉賬唔應該計入 expense stats。"""
    a = _mk_account(client, auth_headers, name="A")
    b = _mk_account(client, auth_headers, name="B")

    # 先建一筆真正嘅消費
    client.post(
        "/api/expenses",
        headers=auth_headers,
        json={"amount": 88.0, "category": "飲食", "spent_at": "2026-04-15"},
    )

    # 再做 3 筆轉賬
    _mk_transfer(client, auth_headers, a["id"], b["id"], 1000.0)
    _mk_transfer(client, auth_headers, a["id"], b["id"], 2000.0)
    _mk_transfer(client, auth_headers, b["id"], a["id"], 500.0)

    stats = client.get("/api/expenses/stats", headers=auth_headers).json()
    assert stats["count"] == 1  # 只得嗰筆 expense
    assert stats["total"] == 88.0
