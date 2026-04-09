"""背景 Email sync — MVP Week 2 實作。"""

from __future__ import annotations


def sync_gmail_inbox() -> None:
    """每 5 分鐘 call 一次：攞 Gmail 新郵件，存入本地 SQLite，跟住 trigger AI 分類。

    流程：
    1. 攞 user.gmail_history_id
    2. call GmailClient.get_history_since() 攞新 message IDs
    3. 對每個 ID call GmailClient.get_message() 攞內容
    4. 寫入 Email table
    5. 對每封新郵件 call ai_classifier.classify() 寫 EmailClassification
    6. WebSocket push 通知前端
    7. update user.gmail_history_id
    """
    raise NotImplementedError("MVP Week 2")
