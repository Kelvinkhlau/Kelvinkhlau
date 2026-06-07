"""Forex reconciliation models — multi-group, multi-wallet 設計。"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    JSON,
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class AccountGroup(Base):
    """一組朋友幫手管嘅戶口（公司組 / 私人組 / ...）。"""

    __tablename__ = "forex_account_groups"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    code: Mapped[str] = mapped_column(String(50), nullable=False, unique=True, index=True)
    owner_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    # 分潤夥伴（e.g. Jackson）+ 佢分得嘅 % — 季度結算用
    partner_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    partner_split_pct: Mapped[float | None] = mapped_column(Numeric(5, 2), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )

    wallets: Mapped[list[AccountGroupWallet]] = relationship(
        back_populates="group", cascade="all, delete-orphan"
    )
    brokers: Mapped[list[BrokerAccount]] = relationship(
        back_populates="group", cascade="all, delete-orphan"
    )


class AccountGroupWallet(Base):
    """一個 group 可能有多個 TRON wallet（e.g. B 組三個人各自一個）。"""

    __tablename__ = "forex_account_group_wallets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    group_id: Mapped[int] = mapped_column(
        ForeignKey("forex_account_groups.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    address: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    label: Mapped[str] = mapped_column(String(100), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )

    group: Mapped[AccountGroup] = relationship(back_populates="wallets")


class BrokerAccount(Base):
    """一個 broker 嘅戶口（e.g. Binance / IB / FXPRO）。"""

    __tablename__ = "forex_broker_accounts"
    __table_args__ = (
        # owner included so e.g. B 組 ICM-Celia 同 ICM-CANDY 可以共存
        UniqueConstraint("group_id", "name", "owner", name="uq_forex_brokers_group_name_owner"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    group_id: Mapped[int] = mapped_column(
        ForeignKey("forex_account_groups.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    owner: Mapped[str | None] = mapped_column(String(100), nullable=True)
    email: Mapped[str | None] = mapped_column(String(200), nullable=True)
    account_number: Mapped[str | None] = mapped_column(String(100), nullable=True)
    # 登入資料（敏感，只經 step-up gated endpoint 讀寫）
    login_url: Mapped[str | None] = mapped_column(String(300), nullable=True)
    password: Mapped[str | None] = mapped_column(String(300), nullable=True)
    twofa: Mapped[str | None] = mapped_column(String(300), nullable=True)  # 確認方式
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )

    group: Mapped[AccountGroup] = relationship(back_populates="brokers")


class MonthlyBalance(Base):
    """每月某 broker 嘅 opening / closing / reported P&L（由朋友 Excel 入）。"""

    __tablename__ = "forex_monthly_balances"
    __table_args__ = (
        UniqueConstraint(
            "broker_account_id", "month", name="uq_forex_monthly_broker_month"
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    broker_account_id: Mapped[int] = mapped_column(
        ForeignKey("forex_broker_accounts.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    month: Mapped[str] = mapped_column(String(7), nullable=False, index=True)  # "YYYY-MM"
    opening_balance: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    closing_balance: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    # 私人組手動入嘅 broker 側出入金（公司/A 組用 wallet tx 推算，呢兩欄留 0）
    deposit_amount: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    withdrawal_amount: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    reported_pnl: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    expected_pnl: Mapped[float | None] = mapped_column(Numeric(14, 2), nullable=True)
    variance: Mapped[float | None] = mapped_column(Numeric(14, 2), nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now(), nullable=False
    )


class WalletTransaction(Base):
    """一條 TRON USDT in/out 交易。"""

    __tablename__ = "forex_wallet_transactions"
    __table_args__ = (
        UniqueConstraint("wallet_id", "tx_hash", name="uq_forex_tx_wallet_hash"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    group_id: Mapped[int] = mapped_column(
        ForeignKey("forex_account_groups.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    wallet_id: Mapped[int] = mapped_column(
        ForeignKey("forex_account_group_wallets.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    tx_hash: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    block_timestamp: Mapped[datetime] = mapped_column(DateTime, nullable=False, index=True)
    direction: Mapped[str] = mapped_column(String(4), nullable=False)  # "in" / "out"
    amount_usdt: Mapped[float] = mapped_column(Numeric(20, 6), nullable=False)
    # 手續費（提款費 / 兌換差額）— 通常事後先知，可留空，之後人手補
    fee_usdt: Mapped[float | None] = mapped_column(Numeric(20, 6), nullable=True)
    # Free-text 備註（例如「Angel 月尾報數」）
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    counterparty_address: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    broker_account_id: Mapped[int | None] = mapped_column(
        ForeignKey("forex_broker_accounts.id", ondelete="SET NULL"),
        index=True,
        nullable=True,
    )
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="pending_tag", index=True
    )
    raw_data: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )


class AddressBookEntry(Base):
    """記住某 counterparty address 對應邊個 broker（auto-tag 用）。"""

    __tablename__ = "forex_address_book"
    __table_args__ = (
        UniqueConstraint("group_id", "address", name="uq_forex_addrbook_group_addr"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    group_id: Mapped[int] = mapped_column(
        ForeignKey("forex_account_groups.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    address: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    broker_account_id: Mapped[int] = mapped_column(
        ForeignKey("forex_broker_accounts.id", ondelete="CASCADE"),
        nullable=False,
    )
    label: Mapped[str | None] = mapped_column(String(200), nullable=True)
    first_seen_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)


class DepositIntent(Base):
    """準備出去 broker 嘅 deposit — 用嚟之後同 wallet_transactions match。"""

    __tablename__ = "forex_deposit_intents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    group_id: Mapped[int] = mapped_column(
        ForeignKey("forex_account_groups.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    broker_account_id: Mapped[int] = mapped_column(
        ForeignKey("forex_broker_accounts.id", ondelete="CASCADE"),
        nullable=False,
    )
    amount_usdt: Mapped[float] = mapped_column(Numeric(20, 6), nullable=False)
    intended_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, index=True)
    matched_tx_hash: Mapped[str | None] = mapped_column(String(80), nullable=True)
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="pending", index=True
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )


class ManualTransfer(Base):
    """人手出入金（銀行匯款 / 其他非鏈上方式）。月度出金/入金 = Σ呢啲 + Σ tagged wallet tx。"""

    __tablename__ = "forex_manual_transfers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    group_id: Mapped[int] = mapped_column(
        ForeignKey("forex_account_groups.id", ondelete="CASCADE"), index=True, nullable=False
    )
    broker_account_id: Mapped[int] = mapped_column(
        ForeignKey("forex_broker_accounts.id", ondelete="CASCADE"), index=True, nullable=False
    )
    flow: Mapped[str] = mapped_column(String(12), nullable=False)  # withdrawal / deposit
    method: Mapped[str] = mapped_column(String(30), nullable=False, default="bank")
    amount_usdt: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)
    transfer_date: Mapped[Date] = mapped_column(Date, nullable=False, index=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )


class QuarterlySettlement(Base):
    """一季同夥伴（e.g. Jackson）50/50 分潤結算 + carry-forward。"""

    __tablename__ = "forex_quarterly_settlements"
    __table_args__ = (
        UniqueConstraint("group_id", "quarter", name="uq_forex_settle_group_quarter"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    group_id: Mapped[int] = mapped_column(
        ForeignKey("forex_account_groups.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    quarter: Mapped[str] = mapped_column(String(7), nullable=False, index=True)  # "2026-Q2"
    gross_pnl: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    total_fees: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    net_pnl: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    carry_in: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    distributable: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    partner_split_pct: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False, default=50)
    partner_share: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    paid_amount: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    paid_tx_hash: Mapped[str | None] = mapped_column(String(80), nullable=True)
    paid_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    carry_out: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="draft")
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now(), nullable=False
    )


class ReconciliationRun(Base):
    """一次月結對賬執行記錄。"""

    __tablename__ = "forex_reconciliation_runs"
    __table_args__ = (
        UniqueConstraint(
            "group_id", "month", "run_at", name="uq_forex_recon_group_month_run"
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    group_id: Mapped[int] = mapped_column(
        ForeignKey("forex_account_groups.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    month: Mapped[str] = mapped_column(String(7), nullable=False, index=True)
    run_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )
    total_accounts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    matched_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    flagged_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    summary: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
