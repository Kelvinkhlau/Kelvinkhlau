"""Vault API schemas — categories / tags / files。"""

from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field


# ─── Category ────────────────────────────────────────────────────────────────


class VaultCategoryCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    icon: str | None = Field(None, max_length=20)
    sort_order: int = 0


class VaultCategoryUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=100)
    icon: str | None = Field(None, max_length=20)
    sort_order: int | None = None


class VaultCategoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    icon: str
    sort_order: int
    file_count: int = 0


# ─── Tag ─────────────────────────────────────────────────────────────────────


class VaultTagCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=80)
    color: str | None = Field(None, max_length=20)


class VaultTagOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    color: str
    file_count: int = 0


# ─── File ────────────────────────────────────────────────────────────────────


class VaultTextEntryCreate(BaseModel):
    """純文字記錄 — 例：API key、密碼提示、序號。內部存成 .txt 檔。"""

    title: str = Field(..., min_length=1, max_length=300, description="主題（必填）")
    content: str = Field(..., min_length=1, max_length=100_000, description="文字內容")
    category_id: int | None = None
    notes: str = ""
    expiry_date: date | None = None
    reminder_days_before: int | None = Field(None, ge=0, le=365)
    tag_ids: list[int] = []


class VaultFileUpdate(BaseModel):
    title: str | None = Field(None, max_length=300)
    filename: str | None = Field(None, min_length=1, max_length=500)
    category_id: int | None = None
    notes: str | None = None
    expiry_date: date | None = None
    reminder_days_before: int | None = Field(None, ge=0, le=365)
    tag_ids: list[int] | None = None  # 如果提供，會 replace 所有 tags
    clear_expiry: bool = False  # True = 清除 expiry_date（因為 None 歧義）
    clear_reminder: bool = False  # True = 重設 reminder_days_before 為 default
    clear_title: bool = False  # True = 清除 title（回退顯示 filename）


class VaultFileOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str | None
    filename: str
    original_filename: str
    mime_type: str
    size_bytes: int
    sha256: str
    category_id: int | None
    category_name: str | None
    category_icon: str | None
    notes: str
    expiry_date: date | None
    reminder_days_before: int | None
    days_until_expiry: int | None
    tag_ids: list[int] = []
    tag_names: list[str] = []
    uploaded_at: datetime
    updated_at: datetime
    deleted_at: datetime | None


class VaultSummary(BaseModel):
    total_files: int
    total_size_bytes: int
    categories: list[VaultCategoryOut]
    expiring_soon: int  # 30 日內到期
    trashed: int


# ─── Share link ──────────────────────────────────────────────────────────────


class VaultShareCreate(BaseModel):
    label: str | None = Field(None, max_length=200)
    expires_in_hours: int | None = Field(
        None, ge=1, le=24 * 365, description="幾多個鐘之後過期；null = 永不過期"
    )
    max_downloads: int | None = Field(None, ge=1, le=10000)
    allow_download: bool = True


class VaultShareOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    file_id: int
    token: str
    label: str | None
    expires_at: datetime | None
    max_downloads: int | None
    download_count: int
    allow_download: bool
    created_at: datetime
    revoked_at: datetime | None
    # 完整 URL — handler 會填入 settings.public_base_url
    url: str
