"""Gmail API client wrapper — MVP Week 1 stub。

下星期會實作：
- OAuth2 flow（google-auth-oauthlib）
- list_messages / get_message
- History API（incremental sync）
"""

from __future__ import annotations


class GmailClient:
    """Gmail API wrapper。"""

    def __init__(self, refresh_token: str):
        self.refresh_token = refresh_token
        # TODO: 用 google.oauth2.credentials.Credentials build service

    def list_recent_messages(self, max_results: int = 50) -> list[dict]:
        """攞最近 N 封郵件嘅 metadata。"""
        raise NotImplementedError("MVP Week 1")

    def get_message(self, message_id: str) -> dict:
        """攞單封郵件全部內容。"""
        raise NotImplementedError("MVP Week 1")

    def get_history_since(self, history_id: str) -> list[dict]:
        """Incremental sync — 攞由某 history_id 之後嘅變化。"""
        raise NotImplementedError("MVP Week 2")
