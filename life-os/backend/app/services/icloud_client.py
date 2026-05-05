"""iCloud Mail IMAP client — 用 App-Specific Password 連接 iCloud 信箱。

設定：
- ICLOUD_EMAIL: iCloud 電郵地址
- ICLOUD_APP_PASSWORD: App-Specific Password（喺 appleid.apple.com 生成）

支援：
- fetch_recent(): 拉最近 N 封 email
- idle_wait(): IMAP IDLE 長連接，等新郵件通知
"""

from __future__ import annotations

import email
import imaplib
import logging
import select as io_select
import smtplib
import threading
from dataclasses import dataclass
from datetime import datetime, timezone
from email import encoders
from email.mime.base import MIMEBase
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.utils import formataddr, parseaddr, parsedate_to_datetime, make_msgid

from app.config import get_settings

logger = logging.getLogger(__name__)

ICLOUD_IMAP_HOST = "imap.mail.me.com"
ICLOUD_IMAP_PORT = 993

ICLOUD_SMTP_HOST = "smtp.mail.me.com"
ICLOUD_SMTP_PORT = 587  # STARTTLS


def _attach_files_to(msg: MIMEMultipart, attachments: list[tuple[str, bytes, str]]) -> None:
    """Attach files to a multipart message — shared with Gmail path。"""
    for filename, content, content_type in attachments:
        maintype, subtype = (
            content_type.split("/", 1) if "/" in content_type else ("application", "octet-stream")
        )
        part = MIMEBase(maintype, subtype)
        part.set_payload(content)
        encoders.encode_base64(part)
        part.add_header("Content-Disposition", "attachment", filename=filename)
        msg.attach(part)


def build_icloud_mime(
    from_email: str,
    from_name: str,
    to: str,
    subject: str,
    body: str,
    *,
    in_reply_to: str | None = None,
    references: str | None = None,
    attachments: list[tuple[str, bytes, str]] | None = None,
) -> MIMEBase:
    """建立 iCloud SMTP 用嘅 MIME message object。"""
    if attachments:
        msg = MIMEMultipart()
        msg.attach(MIMEText(body, "plain", "utf-8"))
        _attach_files_to(msg, attachments)
    else:
        msg = MIMEText(body, "plain", "utf-8")
    msg["From"] = formataddr((from_name, from_email))
    msg["To"] = to
    msg["Subject"] = subject
    msg["Message-ID"] = make_msgid(domain=from_email.split("@")[-1] if "@" in from_email else "icloud.com")
    if in_reply_to:
        msg["In-Reply-To"] = in_reply_to
    if references:
        msg["References"] = references
    return msg


def send_via_icloud_smtp(
    msg: MIMEBase,
    *,
    email_addr: str | None = None,
    app_password: str | None = None,
) -> None:
    """經 iCloud SMTP 寄出一個 MIME message。失敗會 raise。"""
    settings = get_settings()
    email_addr = email_addr or settings.icloud_email
    app_password = app_password or settings.icloud_app_password
    if not email_addr or not app_password:
        raise RuntimeError("iCloud Mail 未設定 — 需要 ICLOUD_EMAIL 同 ICLOUD_APP_PASSWORD")

    with smtplib.SMTP(ICLOUD_SMTP_HOST, ICLOUD_SMTP_PORT, timeout=30) as smtp:
        smtp.ehlo()
        smtp.starttls()
        smtp.ehlo()
        smtp.login(email_addr, app_password)
        smtp.send_message(msg)


def _quote_folder(folder: str) -> str:
    """IMAP folder name 有空格就要 double-quote（imaplib 唔會自動做）。"""
    if not folder:
        return folder
    if folder.startswith('"') and folder.endswith('"'):
        return folder
    if " " in folder or "\t" in folder:
        return f'"{folder}"'
    return folder

# IMAP IDLE 最長等待 28 分鐘（RFC 2177 建議上限 29 分鐘，留 1 分鐘 buffer）
IDLE_TIMEOUT_SECS = 28 * 60


@dataclass
class ParsedEmail:
    message_id: str
    subject: str
    sender: str
    sender_email: str
    recipients: str
    snippet: str
    body_text: str
    body_html: str | None
    received_at: datetime
    has_attachment: bool


def _decode_payload(part) -> str:
    """Decode email part payload。"""
    payload = part.get_payload(decode=True)
    if payload is None:
        return ""
    charset = part.get_content_charset() or "utf-8"
    try:
        return payload.decode(charset, errors="replace")
    except (LookupError, UnicodeDecodeError):
        return payload.decode("utf-8", errors="replace")


def _parse_message(raw_bytes: bytes) -> ParsedEmail:
    """Parse raw email bytes into ParsedEmail。"""
    msg = email.message_from_bytes(raw_bytes)

    subject = msg.get("Subject", "")
    if subject:
        from email.header import decode_header
        parts = decode_header(subject)
        subject = "".join(
            p.decode(enc or "utf-8", errors="replace") if isinstance(p, bytes) else p
            for p, enc in parts
        )

    sender_name, sender_email_addr = parseaddr(msg.get("From", ""))
    recipients = msg.get("To", "")
    message_id = msg.get("Message-ID", "")

    date_str = msg.get("Date", "")
    try:
        received_at = parsedate_to_datetime(date_str)
        if received_at.tzinfo is None:
            received_at = received_at.replace(tzinfo=timezone.utc)
    except Exception:
        received_at = datetime.now(timezone.utc)

    body_text = ""
    body_html = None
    has_attachment = False

    if msg.is_multipart():
        for part in msg.walk():
            ct = part.get_content_type()
            disp = str(part.get("Content-Disposition", ""))
            if "attachment" in disp:
                has_attachment = True
                continue
            if ct == "text/plain" and not body_text:
                body_text = _decode_payload(part)
            elif ct == "text/html" and body_html is None:
                body_html = _decode_payload(part)
    else:
        ct = msg.get_content_type()
        if ct == "text/html":
            body_html = _decode_payload(msg)
        else:
            body_text = _decode_payload(msg)

    snippet = (body_text or "")[:300].replace("\n", " ").strip()

    return ParsedEmail(
        message_id=message_id,
        subject=subject,
        sender=sender_name or sender_email_addr,
        sender_email=sender_email_addr,
        recipients=recipients,
        snippet=snippet,
        body_text=body_text,
        body_html=body_html,
        received_at=received_at,
        has_attachment=has_attachment,
    )


class ICloudClient:
    """iCloud Mail IMAP wrapper。"""

    def __init__(self, email_addr: str | None = None, app_password: str | None = None):
        settings = get_settings()
        self.email_addr = email_addr or settings.icloud_email
        self.app_password = app_password or settings.icloud_app_password
        if not self.email_addr or not self.app_password:
            raise RuntimeError(
                "iCloud Mail 未設定 — 需要 ICLOUD_EMAIL 同 ICLOUD_APP_PASSWORD"
            )
        self._conn: imaplib.IMAP4_SSL | None = None

    def connect(self) -> None:
        self._conn = imaplib.IMAP4_SSL(ICLOUD_IMAP_HOST, ICLOUD_IMAP_PORT)
        self._conn.login(self.email_addr, self.app_password)

    def disconnect(self) -> None:
        if self._conn:
            try:
                self._conn.logout()
            except Exception as e:
                logger.debug("iCloud logout failed (non-fatal): %s", e)
            self._conn = None

    def get_mailbox_count(self, folder: str = "INBOX") -> int:
        """返回 mailbox 入面嘅 email 數量。"""
        if not self._conn:
            self.connect()
        assert self._conn is not None
        status, data = self._conn.select(_quote_folder(folder), readonly=True)
        if status == "OK" and data[0]:
            return int(data[0])
        return 0

    def idle_wait(self, folder: str = "INBOX", timeout: int = IDLE_TIMEOUT_SECS) -> bool:
        """用 IMAP IDLE 等新郵件。返回 True = 有新郵件，False = timeout / 錯誤。

        呢個方法會 block 直到有新郵件或 timeout。
        """
        if not self._conn:
            self.connect()
        assert self._conn is not None

        self._conn.select(_quote_folder(folder))
        # Send IDLE command
        tag = self._conn._new_tag().decode()  # type: ignore[attr-defined]
        self._conn.send(f"{tag} IDLE\r\n".encode())

        # Read continuation response (+ idling)
        resp = self._conn.readline()
        if not resp.startswith(b"+"):
            logger.warning("IDLE not accepted: %s", resp)
            return False

        try:
            # Wait for data on the socket
            sock = self._conn.socket()
            readable, _, _ = io_select.select([sock], [], [], timeout)
            if readable:
                # Read server notification (e.g., "* 1234 EXISTS")
                data = b""
                while True:
                    ready, _, _ = io_select.select([sock], [], [], 0.5)
                    if not ready:
                        break
                    chunk = sock.recv(4096)
                    if not chunk:
                        break
                    data += chunk
                has_new = b"EXISTS" in data
                return has_new
            return False  # timeout
        finally:
            # Send DONE to end IDLE（cleanup errors 唔應該遮蓋 outer exception）
            try:
                self._conn.send(b"DONE\r\n")
                self._conn.readline()  # Read tagged response
            except Exception as e:
                logger.debug("IDLE DONE cleanup failed (non-fatal): %s", e)

    def mark_seen(self, message_id: str, folder: str = "INBOX", seen: bool = True) -> bool:
        """將 iCloud 伺服器上面嘅 email 標做 已讀 / 未讀。

        用 Message-Id header 搵 UID，然後 `UID STORE <uid> +FLAGS (\\Seen)`。
        返回 True = 成功；False = 搵唔到或失敗。

        Args:
            message_id: RFC822 Message-Id header（包住 <>）
            folder: IMAP folder，default INBOX
            seen: True → 加 \\Seen flag；False → 去除（標返未讀）
        """
        if not message_id:
            return False
        if not self._conn:
            self.connect()
        assert self._conn is not None

        # 需要 read-write mode 先可以 STORE flag
        status, _ = self._conn.select(_quote_folder(folder), readonly=False)
        if status != "OK":
            logger.warning("mark_seen: SELECT %s failed", folder)
            return False

        # iCloud 嘅 Message-Id 儲存通常連 <> 都有。IMAP SEARCH header 查詢要 quote。
        # imaplib 會自動 encode string 參數。
        try:
            status, data = self._conn.uid(
                "SEARCH", None, "HEADER", "Message-ID", message_id
            )
        except Exception as e:
            logger.warning("mark_seen UID SEARCH failed for %r: %s", message_id, e)
            return False

        if status != "OK" or not data or not data[0]:
            logger.info("mark_seen: message-id %r 喺 iCloud folder %s 搵唔到", message_id, folder)
            return False

        uids = data[0].split()
        if not uids:
            return False
        uid = uids[0].decode() if isinstance(uids[0], bytes) else str(uids[0])

        op = "+FLAGS" if seen else "-FLAGS"
        try:
            status, _ = self._conn.uid("STORE", uid, op, "(\\Seen)")
        except Exception as e:
            logger.warning("mark_seen UID STORE failed uid=%s: %s", uid, e)
            return False

        if status != "OK":
            logger.warning("mark_seen UID STORE non-OK uid=%s: %s", uid, status)
            return False

        logger.info("iCloud mark_seen uid=%s seen=%s OK", uid, seen)
        return True

    def fetch_recent(self, limit: int = 50, folder: str = "INBOX") -> list[ParsedEmail]:
        """拉最近嘅 email（IMAP FETCH）。"""
        if not self._conn:
            self.connect()
        assert self._conn is not None

        self._conn.select(_quote_folder(folder), readonly=True)
        # Search for recent messages
        status, data = self._conn.search(None, "ALL")
        if status != "OK" or not data[0]:
            return []

        msg_ids = data[0].split()
        # Take the most recent `limit` messages
        recent_ids = msg_ids[-limit:]

        results: list[ParsedEmail] = []
        for msg_id in reversed(recent_ids):
            try:
                # iCloud IMAP 需要 BODY[] 而唔係 RFC822
                status, msg_data = self._conn.fetch(msg_id, "(BODY[])")
                if status != "OK" or not msg_data:
                    continue
                # Response 格式：[(b'id (BODY[] {size}', raw_bytes), b')']
                raw: bytes | None = None
                for part in msg_data:
                    if isinstance(part, tuple) and len(part) >= 2:
                        raw = part[1]
                        break
                if raw and isinstance(raw, bytes):
                    parsed = _parse_message(raw)
                    results.append(parsed)
            except Exception as e:
                logger.warning("Failed to parse iCloud message %s: %s", msg_id, e)

        return results
