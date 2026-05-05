"""Bank account smoke tests — focus on brokerage 多幣種 cash + 子帳戶 (parent_account_id)。"""

from fastapi.testclient import TestClient


def _mk_account(client: TestClient, headers: dict, **overrides) -> dict:
    payload = {
        "name": "Test Account",
        "bank": "HSBC",
        "account_type": "savings",
        "currency": "HKD",
        "balance": 0,
        **overrides,
    }
    res = client.post("/api/bank-accounts", headers=headers, json=payload)
    assert res.status_code == 201, res.text
    return res.json()


# ─── presets ────────────────────────────────────────────────


def test_presets_include_ib_and_futu(client: TestClient, auth_headers: dict[str, str]) -> None:
    res = client.get("/api/bank-accounts/presets", headers=auth_headers)
    assert res.status_code == 200
    presets = res.json()
    banks = {p["bank"] for p in presets if p["account_type"] == "brokerage"}
    assert "IBKR" in banks
    assert "富途" in banks
    assert "moomoo" in banks
    assert "華盛" in banks


# ─── parent / child ─────────────────────────────────────────


def test_create_brokerage_with_parent(client: TestClient, auth_headers: dict[str, str]) -> None:
    parent = _mk_account(
        client, auth_headers, name="IBKR 主帳戶", bank="IBKR", account_type="brokerage"
    )
    child = _mk_account(
        client,
        auth_headers,
        name="IB U1234567",
        bank="IBKR",
        account_type="brokerage",
        parent_account_id=parent["id"],
    )
    assert child["parent_account_id"] == parent["id"]


def test_parent_must_be_brokerage(client: TestClient, auth_headers: dict[str, str]) -> None:
    parent = _mk_account(client, auth_headers, name="HSBC 儲蓄", account_type="savings")
    res = client.post(
        "/api/bank-accounts",
        headers=auth_headers,
        json={
            "name": "Bad child",
            "bank": "IBKR",
            "account_type": "brokerage",
            "parent_account_id": parent["id"],
        },
    )
    assert res.status_code == 400
    assert "證券" in res.json()["detail"]


def test_no_grandchildren(client: TestClient, auth_headers: dict[str, str]) -> None:
    parent = _mk_account(
        client, auth_headers, name="IBKR", bank="IBKR", account_type="brokerage"
    )
    child = _mk_account(
        client,
        auth_headers,
        name="IB Sub1",
        bank="IBKR",
        account_type="brokerage",
        parent_account_id=parent["id"],
    )
    res = client.post(
        "/api/bank-accounts",
        headers=auth_headers,
        json={
            "name": "Grandchild",
            "bank": "IBKR",
            "account_type": "brokerage",
            "parent_account_id": child["id"],
        },
    )
    assert res.status_code == 400
    assert "grandchild" in res.json()["detail"].lower() or "多層" in res.json()["detail"]


def test_parent_cant_be_self_on_update(client: TestClient, auth_headers: dict[str, str]) -> None:
    acc = _mk_account(
        client, auth_headers, name="IBKR", bank="IBKR", account_type="brokerage"
    )
    res = client.patch(
        f"/api/bank-accounts/{acc['id']}",
        headers=auth_headers,
        json={"parent_account_id": acc["id"]},
    )
    assert res.status_code == 400


# ─── multi-currency cash ────────────────────────────────────


def test_cash_only_for_brokerage(client: TestClient, auth_headers: dict[str, str]) -> None:
    savings = _mk_account(client, auth_headers, account_type="savings")
    res = client.put(
        f"/api/bank-accounts/{savings['id']}/cash",
        headers=auth_headers,
        json={"currency": "USD", "amount": 100},
    )
    assert res.status_code == 400


def test_cash_upsert_and_list(client: TestClient, auth_headers: dict[str, str]) -> None:
    futu = _mk_account(
        client, auth_headers, name="富途", bank="富途", account_type="brokerage"
    )

    # Empty initially
    res = client.get(f"/api/bank-accounts/{futu['id']}/cash", headers=auth_headers)
    assert res.status_code == 200
    assert res.json() == []

    # Add USD
    res = client.put(
        f"/api/bank-accounts/{futu['id']}/cash",
        headers=auth_headers,
        json={"currency": "USD", "amount": 5000},
    )
    assert res.status_code == 200
    assert res.json() == {"currency": "USD", "amount": 5000.0}

    # Add HKD
    client.put(
        f"/api/bank-accounts/{futu['id']}/cash",
        headers=auth_headers,
        json={"currency": "HKD", "amount": 12000},
    )

    # Update USD (upsert)
    client.put(
        f"/api/bank-accounts/{futu['id']}/cash",
        headers=auth_headers,
        json={"currency": "USD", "amount": 7500},
    )

    rows = client.get(
        f"/api/bank-accounts/{futu['id']}/cash", headers=auth_headers
    ).json()
    by_ccy = {r["currency"]: r["amount"] for r in rows}
    assert by_ccy == {"USD": 7500.0, "HKD": 12000.0}


def test_cash_lowercase_currency_normalized(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    acc = _mk_account(
        client, auth_headers, name="富途", bank="富途", account_type="brokerage"
    )
    res = client.put(
        f"/api/bank-accounts/{acc['id']}/cash",
        headers=auth_headers,
        json={"currency": "cad", "amount": 200},
    )
    assert res.status_code == 200
    assert res.json()["currency"] == "CAD"


def test_delete_cash_balance(client: TestClient, auth_headers: dict[str, str]) -> None:
    acc = _mk_account(
        client, auth_headers, name="富途", bank="富途", account_type="brokerage"
    )
    client.put(
        f"/api/bank-accounts/{acc['id']}/cash",
        headers=auth_headers,
        json={"currency": "USD", "amount": 100},
    )
    res = client.delete(
        f"/api/bank-accounts/{acc['id']}/cash/USD", headers=auth_headers
    )
    assert res.status_code == 204

    rows = client.get(
        f"/api/bank-accounts/{acc['id']}/cash", headers=auth_headers
    ).json()
    assert rows == []


def test_cash_appears_in_list_response(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    """List endpoint 嘅 brokerage row 應該帶 cash_balances + holdings_by_currency。"""
    acc = _mk_account(
        client, auth_headers, name="富途", bank="富途", account_type="brokerage"
    )
    client.put(
        f"/api/bank-accounts/{acc['id']}/cash",
        headers=auth_headers,
        json={"currency": "USD", "amount": 1000},
    )
    client.put(
        f"/api/bank-accounts/{acc['id']}/cash",
        headers=auth_headers,
        json={"currency": "HKD", "amount": 2000},
    )

    accounts = client.get("/api/bank-accounts", headers=auth_headers).json()
    futu_row = next(a for a in accounts if a["id"] == acc["id"])
    assert "cash_balances" in futu_row
    assert "holdings_by_currency" in futu_row
    by_ccy = {r["currency"]: r["amount"] for r in futu_row["cash_balances"]}
    assert by_ccy == {"USD": 1000.0, "HKD": 2000.0}


def test_non_brokerage_has_empty_breakdown(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    _mk_account(client, auth_headers, account_type="savings")
    accounts = client.get("/api/bank-accounts", headers=auth_headers).json()
    savings = next(a for a in accounts if a["account_type"] == "savings")
    assert savings["cash_balances"] == []
    assert savings["holdings_by_currency"] == []
