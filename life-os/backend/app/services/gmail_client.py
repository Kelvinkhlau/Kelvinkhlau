"""Gmail API client wrapper。

封裝：
- OAuth2 flow（authorization URL + token exchange）
- Messages list / get
- History API（incremental sync）
"""

from __future__ import annotations

import base64
from dataclasses import dataclass
from datetime import UTC, datetime
from email.utils import parseaddr, parsedate_to_datetime
from typing import Any

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

from app.config import get_settings
from app.utils.retry import retry_call


def _gmail_is_transient(exc: BaseException) -> bool:
    """Gmail API 5xx / 429 / 網絡錯誤要 retry，4xx（auth / not found）唔 retry。"""
    if isinstance(exc, HttpError):
        status = getattr(exc.resp, "status", 0) or 0
        return status == 429 or status >= 500
    # 網絡 / SSL / timeout —— retry
    return True

# Google API scopes — Gmail 只讀 + Calendar 只讀
SCOPES = [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/calendar.readonly",
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
]


@dataclass
class ParsedMessage:
    """由 Gmail API raw response 解析出嚟嘅 email。"""

    gmail_message_id: str
    gmail_thread_id: str
    subject: str
    sender: str          # "Name <email@domain>"
    sender_email: str    # "email@domain"
    recipients: str      # 逗號 join
    snippet: str
    body_text: str
    body_html: str | None
    received_at: datetime
    has_attachment: bool


def _build_flow(state: str | None = None) -> Flow:
    """建立 google_auth_oauthlib Flow。"""
    settings = get_settings()
    if not settings.google_client_id or not settings.google_client_secret:
        raise RuntimeError("GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not set in .env")

    client_config = {
        "web": {
            "client_id": settings.google_client_id,
            "client_secret": settings.google_client_secret,
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "redirect_uris": [settings.google_redirect_uri],
        }
    }
    return Flow.from_client_config(
        client_config,
        scopes=SCOPES,
        redirect_uri=settings.google_redirect_uri,
        state=state,
    )


def build_authorization_url() -> tuple[str, str]:
    """返回 (authorization_url, state)。"""
    flow = _build_flow()
    url, state = flow.authorization_url(
        access_type="offline",      # 拎 refresh_token
        include_granted_scopes="true",
        prompt="consent",           # 確保每次都 issue refresh_token
    )
    return url, state


def exchange_code_for_tokens(code: str, state: str | None = None) -> dict[str, Any]:
    """用 authorization code 換 access + refresh token。"""
    flow = _build_flow(state=state)
    flow.fetch_token(code=code)
    creds = flow.credentials

    # 順便攞 profile 拎 email / name
    service = build("oauth2", "v2", credentials=creds)
    userinfo = service.userinfo().get().execute()

    return {
        "refresh_token": creds.refresh_token,
        "access_token": creds.token,
        "email": userinfo.get("email", ""),
        "name": userinfo.get("name", ""),
    }


def _credentials_from_refresh_token(refresh_token: str) -> Credentials:
    """由 refresh token 重建 Credentials（會自動 refresh access token）。"""
    settings = get_settings()
    creds = Credentials(
        token=None,
        refresh_token=refresh_token,
        token_uri="https://oauth2.googleapis.com/token",
        client_id=settings.google_client_id,
        client_secret=settings.google_client_secret,
        scopes=SCOPES,
    )
    creds.refresh(Request())
    return creds


class GmailClient:
    """Gmail API wrapper — 用 user 嘅 refresh_token 初始化。"""

    def __init__(self, refresh_token: str):
        self.creds = _credentials_from_refresh_token(refresh_token)
        self.service = build("gmail", "v1", credentials=self.creds, cache_discovery=False)

    def list_recent_message_ids(self, max_results: int = 50) -> list[str]:
        """攞最近 N 封 inbox 郵件嘅 message IDs。"""
        resp = retry_call(
            lambda: self.service.users()
            .messages()
            .list(userId="me", maxResults=max_results, labelIds=["INBOX"])
            .execute(),
            should_retry=_gmail_is_transient,
            label="gmail.messages.list",
        )
        return [m["id"] for m in resp.get("messages", [])]

    def get_profile_history_id(self) -> str:
        """攞 account 當前 historyId（用嚟 incremental sync）。"""
        profile = retry_call(
            lambda: self.service.users().getProfile(userId="me").execute(),
            should_retry=_gmail_is_transient,
            label="gmail.getProfile",
        )
        return str(profile.get("historyId", ""))

    def get_history_since(self, history_id: str) -> list[str]:
        """Incremental sync — 攞由 history_id 之後新增嘅 message IDs。

        history_id 過期（404 / 410）會 fallback 去拉最近 50 封。
        """
        try:
            resp = retry_call(
                lambda: self.service.users()
                .history()
                .list(
                    userId="me",
                    startHistoryId=history_id,
                    historyTypes=["messageAdded"],
                    labelId="INBOX",
                )
                .execute(),
                should_retry=_gmail_is_transient,
                label="gmail.history.list",
            )
        except HttpError as e:
            status = getattr(e.resp, "status", 0) or 0
            if status in (404, 410):
                return self.list_recent_message_ids(max_results=50)
            raise

        new_ids: list[str] = []
        for entry in resp.get("history", []):
            for added in entry.get("messagesAdded", []):
                msg = added.get("message", {})
                if msg.get("id"):
                    new_ids.append(msg["id"])
        return new_ids

    def get_message(self, message_id: str) -> ParsedMessage:
        """攞單封郵件全部內容，parse 成 ParsedMessage。"""
        msg = retry_call(
            lambda: self.service.users()
            .messages()
            .get(userId="me", id=message_id, format="full")
            .execute(),
            should_retry=_gmail_is_transient,
            label=f"gmail.messages.get({message_id})",
        )
        return _parse_message(msg)


def _parse_message(msg: dict[str, Any]) -> ParsedMessage:
    """將 Gmail API 嘅 raw message 解析成 ParsedMessage。"""
    payload = msg.get("payload", {})
    headers = {h["name"].lower(): h["value"] for h in payload.get("headers", [])}

    subject = headers.get("subject", "")
    sender = headers.get("from", "")
    _, sender_email = parseaddr(sender)
    recipients = headers.get("to", "")

    # Received time — 用 internalDate（epoch ms）或者 Date header
    internal_date = msg.get("internalDate")
    if internal_date:
        received_at = datetime.fromtimestamp(int(internal_date) / 1000, tz=UTC)
    else:
        date_header = headers.get("date", "")
        try:
            received_at = parsedate_to_datetime(date_header)
        except (TypeError, ValueError):
            received_at = datetime.now(tz=UTC)

    # Extract body
    body_text, body_html = _extract_body(payload)
    has_attachment = _has_attachment(payload)

    return ParsedMessage(
        gmail_message_id=msg["id"],
        gmail_thread_id=msg.get("threadId", ""),
        subject=subject,
        sender=sender,
        sender_email=sender_email,
        recipients=recipients,
        snippet=msg.get("snippet", ""),
        body_text=body_text,
        body_html=body_html,
        received_at=received_at,
        has_attachment=has_attachment,
    )


def _extract_body(payload: dict[str, Any]) -> tuple[str, str | None]:
    """Depth-first 搜索 payload parts，返回 (text, html)。"""
    text: str = ""
    html: str | None = None

    def walk(part: dict[str, Any]) -> None:
        nonlocal text, html
        mime_type = part.get("mimeType", "")
        body_data = part.get("body", {}).get("data")

        if body_data:
            try:
                decoded = base64.urlsafe_b64decode(body_data).decode("utf-8", errors="replace")
            except Exception:
                decoded = ""
            if mime_type == "text/plain" and not text:
                text = decoded
            elif mime_type == "text/html" and html is None:
                html = decoded

        for sub in part.get("parts", []) or []:
            walk(sub)

    walk(payload)
    # 如果冇 text/plain 但有 html，至少返回 snippet-ish
    if not text and html:
        text = ""
    return text, html


def _has_attachment(payload: dict[str, Any]) -> bool:
    """檢查有冇 attachment。"""

    def walk(part: dict[str, Any]) -> bool:
        if part.get("filename"):
            return True
        return any(walk(sub) for sub in part.get("parts", []) or [])

    return walk(payload)
