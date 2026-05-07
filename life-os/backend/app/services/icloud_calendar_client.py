"""iCloud Calendar (CalDAV) client — 純 HTTP + XML 實作，唔用 `caldav` lib。

設定（同 iCloud Mail 共用 backend/.env）：
- ICLOUD_EMAIL: iCloud 電郵地址
- ICLOUD_APP_PASSWORD: App-Specific Password（appleid.apple.com 生成）

點解唔用 `caldav` lib：lib + niquests/requests 撞到 Apple iCloud 嘅 redirect 流程
（caldav.icloud.com → pXX-caldav.icloud.com）會 hang 喺 read timeout。我哋自己
3 步 PROPFIND 就攞到 calendar list，乾淨且穩定。

支援：
- list_calendars(): 列出所有 VEVENT sub-calendar（私人 / 家庭 / 朋友 / Work / 訂閱 etc.）
- list_upcoming_events(days_ahead): 拉未來 N 日嘅 events（跨所有 calendar 或指定）
- create_event(): 喺指定 calendar 建 event
- delete_event(): 删 event
"""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass
from datetime import UTC, date as date_t, datetime, timedelta
from xml.etree import ElementTree as ET

import requests
from icalendar import Calendar as ICalendar
from icalendar import Event as ICalEvent

from app.config import get_settings

logger = logging.getLogger(__name__)

ICLOUD_CALDAV_URL = "https://caldav.icloud.com/"
NS = {"d": "DAV:", "c": "urn:ietf:params:xml:ns:caldav"}
DEFAULT_TIMEOUT = 20  # seconds


@dataclass
class ICloudCalendar:
    name: str
    url: str  # full https URL to this calendar collection


@dataclass
class ParsedICloudEvent:
    icloud_uid: str
    calendar_url: str
    calendar_name: str
    title: str
    description: str | None
    location: str | None
    start_at: datetime  # naive UTC
    end_at: datetime  # naive UTC
    all_day: bool
    status: str


def _to_utc_naive(dt: datetime) -> datetime:
    if dt.tzinfo is not None:
        dt = dt.astimezone(UTC).replace(tzinfo=None)
    return dt


class ICloudCalendarClient:
    def __init__(self, email: str | None = None, app_password: str | None = None):
        s = get_settings()
        self.email = email or s.icloud_email
        self.app_password = app_password or s.icloud_app_password
        if not self.email or not self.app_password:
            raise RuntimeError(
                "iCloud 未設定：要喺 .env 加 ICLOUD_EMAIL 同 ICLOUD_APP_PASSWORD"
            )
        self._auth = (self.email, self.app_password)
        self._calendar_home_url: str | None = None

    # ── HTTP helpers ────────────────────────────────────────────────────────
    # 注意：每個 call 用 fresh requests.request()，唔用 Session。Apple 對 keep-alive
    # connection 嘅 PROPFIND/REPORT 會 hang，session 重用會撞 read timeout。

    def _propfind(self, url: str, body: str, depth: str = "0") -> ET.Element:
        resp = requests.request(
            "PROPFIND",
            url,
            auth=self._auth,
            headers={
                "Depth": depth,
                "Content-Type": "application/xml; charset=utf-8",
                "Connection": "close",
            },
            data=body,
            timeout=DEFAULT_TIMEOUT,
        )
        if resp.status_code != 207:
            raise RuntimeError(
                f"CalDAV PROPFIND 失敗 {url}：HTTP {resp.status_code} {resp.text[:200]}"
            )
        return ET.fromstring(resp.text)

    def _report(self, url: str, body: str, depth: str = "1") -> ET.Element:
        resp = requests.request(
            "REPORT",
            url,
            auth=self._auth,
            headers={
                "Depth": depth,
                "Content-Type": "application/xml; charset=utf-8",
                "Connection": "close",
            },
            data=body,
            timeout=DEFAULT_TIMEOUT,
        )
        if resp.status_code != 207:
            raise RuntimeError(
                f"CalDAV REPORT 失敗 {url}：HTTP {resp.status_code} {resp.text[:200]}"
            )
        return ET.fromstring(resp.text)

    # ── Discovery ───────────────────────────────────────────────────────────

    def _discover_calendar_home(self) -> str:
        if self._calendar_home_url:
            return self._calendar_home_url

        # Step 1: principal URL
        root = self._propfind(
            ICLOUD_CALDAV_URL,
            '<?xml version="1.0"?>'
            '<d:propfind xmlns:d="DAV:">'
            "<d:prop><d:current-user-principal/></d:prop>"
            "</d:propfind>",
            depth="0",
        )
        href_el = root.find(".//d:current-user-principal/d:href", NS)
        if href_el is None or not href_el.text:
            raise RuntimeError("iCloud 攞唔到 current-user-principal")
        principal_url = ICLOUD_CALDAV_URL.rstrip("/") + href_el.text

        # Step 2: calendar-home-set
        root = self._propfind(
            principal_url,
            '<?xml version="1.0"?>'
            '<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">'
            "<d:prop><c:calendar-home-set/></d:prop>"
            "</d:propfind>",
            depth="0",
        )
        home_el = root.find(".//c:calendar-home-set/d:href", NS)
        if home_el is None or not home_el.text:
            raise RuntimeError("iCloud 攞唔到 calendar-home-set")
        self._calendar_home_url = home_el.text.rstrip("/") + "/"
        return self._calendar_home_url

    # ── Public API ──────────────────────────────────────────────────────────

    def list_calendars(self, include_vtodo: bool = False) -> list[ICloudCalendar]:
        """列出所有 VEVENT calendar（include_vtodo=True 連 Reminders 都返）。"""
        home = self._discover_calendar_home()
        root = self._propfind(
            home,
            '<?xml version="1.0"?>'
            '<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">'
            "<d:prop>"
            "<d:displayname/>"
            "<d:resourcetype/>"
            "<c:supported-calendar-component-set/>"
            "</d:prop>"
            "</d:propfind>",
            depth="1",
        )
        result: list[ICloudCalendar] = []
        for resp in root.findall("d:response", NS):
            href_el = resp.find("d:href", NS)
            if href_el is None or not href_el.text:
                continue
            href = href_el.text
            # 必須係 calendar resourcetype
            is_cal = resp.find(".//c:calendar", NS) is not None
            if not is_cal:
                continue
            # 揀 VEVENT-only（除非 caller 要 VTODO）
            comps = [
                c.attrib.get("name")
                for c in resp.findall(
                    ".//c:supported-calendar-component-set/c:comp", NS
                )
            ]
            if not include_vtodo and "VEVENT" not in comps:
                continue
            name_el = resp.find(".//d:displayname", NS)
            name = (name_el.text if name_el is not None and name_el.text else "").strip()
            if not name:
                name = href.rstrip("/").rsplit("/", 1)[-1]
            full_url = self._absolute_url(href)
            result.append(ICloudCalendar(name=name, url=full_url))
        return result

    def list_upcoming_events(
        self,
        days_ahead: int = 60,
        calendar_url: str | None = None,
    ) -> list[ParsedICloudEvent]:
        cals = self.list_calendars()
        if calendar_url:
            cals = [c for c in cals if c.url == calendar_url]

        now = datetime.now(tz=UTC).replace(microsecond=0)
        end = now + timedelta(days=days_ahead)
        start_z = now.strftime("%Y%m%dT%H%M%SZ")
        end_z = end.strftime("%Y%m%dT%H%M%SZ")
        # `<c:expand>` 叫 Apple 喺 server side 將 RRULE 展開成每次 occurrence。
        # 否則 RRULE 嘅 master event 淨係喺第一日 show 一次。
        body = (
            '<?xml version="1.0"?>'
            '<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">'
            "<d:prop>"
            "<d:getetag/>"
            "<c:calendar-data>"
            f'<c:expand start="{start_z}" end="{end_z}"/>'
            "</c:calendar-data>"
            "</d:prop>"
            "<c:filter>"
            '<c:comp-filter name="VCALENDAR">'
            '<c:comp-filter name="VEVENT">'
            f'<c:time-range start="{start_z}" end="{end_z}"/>'
            "</c:comp-filter>"
            "</c:comp-filter>"
            "</c:filter>"
            "</c:calendar-query>"
        )

        events: list[ParsedICloudEvent] = []
        for cal in cals:
            try:
                root = self._report(cal.url, body, depth="1")
            except Exception as e:
                logger.warning("iCloud cal '%s' REPORT failed: %s", cal.name, e)
                continue
            for resp in root.findall("d:response", NS):
                cal_data = resp.find(".//c:calendar-data", NS)
                if cal_data is None or not cal_data.text:
                    continue
                for ev in _parse_ics(cal_data.text, cal.url, cal.name):
                    events.append(ev)
        return events

    def create_event(
        self,
        calendar_url: str,
        *,
        title: str,
        start_at: datetime,
        end_at: datetime,
        all_day: bool = False,
        description: str | None = None,
        location: str | None = None,
        rrule: str | None = None,
    ) -> ParsedICloudEvent:
        ical = ICalendar()
        ical.add("prodid", "-//life-os//iCloud Calendar Client//EN")
        ical.add("version", "2.0")

        ev = ICalEvent()
        new_uid = str(uuid.uuid4()).upper()
        ev.add("uid", new_uid)
        ev.add("summary", title)
        ev.add("dtstamp", datetime.now(tz=UTC))
        if description:
            ev.add("description", description)
        if location:
            ev.add("location", location)

        if all_day:
            ev.add("dtstart", start_at.date() if isinstance(start_at, datetime) else start_at)
            ev.add("dtend", end_at.date() if isinstance(end_at, datetime) else end_at)
        else:
            s = start_at if start_at.tzinfo else start_at.replace(tzinfo=UTC)
            e = end_at if end_at.tzinfo else end_at.replace(tzinfo=UTC)
            ev.add("dtstart", s.astimezone(UTC))
            ev.add("dtend", e.astimezone(UTC))
        if rrule:
            # 接受 "FREQ=DAILY;BYDAY=..." 格式字串
            from icalendar.prop import vRecur

            ev.add("rrule", vRecur.from_ical(rrule))

        ev.add("status", "CONFIRMED")
        ical.add_component(ev)

        ics_text = ical.to_ical().decode("utf-8")
        event_url = calendar_url.rstrip("/") + f"/{new_uid}.ics"
        resp = requests.put(
            event_url,
            auth=self._auth,
            data=ics_text.encode("utf-8"),
            headers={
                "Content-Type": "text/calendar; charset=utf-8",
                "If-None-Match": "*",
                "Connection": "close",
            },
            timeout=DEFAULT_TIMEOUT,
        )
        if resp.status_code not in (201, 204):
            raise RuntimeError(
                f"iCloud create event 失敗 HTTP {resp.status_code}: {resp.text[:200]}"
            )

        cal_name = ""
        try:
            cal_name = next(
                (c.name for c in self.list_calendars() if c.url == calendar_url), ""
            )
        except Exception:
            pass

        return ParsedICloudEvent(
            icloud_uid=new_uid,
            calendar_url=calendar_url,
            calendar_name=cal_name,
            title=title,
            description=description,
            location=location,
            start_at=_to_utc_naive(start_at) if isinstance(start_at, datetime) else datetime(start_at.year, start_at.month, start_at.day),
            end_at=_to_utc_naive(end_at) if isinstance(end_at, datetime) else datetime(end_at.year, end_at.month, end_at.day),
            all_day=all_day,
            status="confirmed",
        )

    def delete_event(self, calendar_url: str, icloud_uid: str) -> None:
        # Composite UID format `{base}__{startTime}` — delete operates on the master
        # event (which removes all occurrences). 取 base UID。
        base_uid = icloud_uid.split("__", 1)[0]
        event_url = calendar_url.rstrip("/") + f"/{base_uid}.ics"
        resp = requests.delete(
            event_url,
            auth=self._auth,
            headers={"Connection": "close"},
            timeout=DEFAULT_TIMEOUT,
        )
        if resp.status_code not in (200, 204, 404):
            raise RuntimeError(
                f"iCloud delete 失敗 HTTP {resp.status_code}: {resp.text[:200]}"
            )

    # ── Internal ────────────────────────────────────────────────────────────

    def _absolute_url(self, href: str) -> str:
        """將 calendar-home 嘅 relative href 變成 absolute URL（用 home base）。"""
        if href.startswith("http"):
            return href
        if self._calendar_home_url is None:
            self._discover_calendar_home()
        # home URL: https://pXX-caldav.icloud.com:443/{uid}/calendars/
        # extract scheme://host:port
        from urllib.parse import urlparse

        parsed = urlparse(self._calendar_home_url or ICLOUD_CALDAV_URL)
        return f"{parsed.scheme}://{parsed.netloc}{href}"


def _parse_ics(
    ics_text: str, calendar_url: str, calendar_name: str
) -> list[ParsedICloudEvent]:
    """Parse 一個 .ics 文本（可能含一個或多個 VEVENT）。"""
    try:
        cal = ICalendar.from_ical(ics_text)
    except Exception as e:
        logger.warning("parse ics 失敗: %s", e)
        return []
    out: list[ParsedICloudEvent] = []
    for component in cal.walk("vevent"):
        parsed = _parse_vevent(component, calendar_url, calendar_name)
        if parsed:
            out.append(parsed)
    return out


def _parse_vevent(
    component: ICalEvent, calendar_url: str, calendar_name: str
) -> ParsedICloudEvent | None:
    uid_raw = component.get("uid")
    base_uid = str(uid_raw).strip() if uid_raw else ""
    if not base_uid:
        return None

    summary = str(component.get("summary", "")).strip() or "(無標題)"
    description = component.get("description")
    description = str(description).strip() if description else None
    location = component.get("location")
    location = str(location).strip() if location else None

    dtstart = component.get("dtstart")
    dtend = component.get("dtend")
    if dtstart is None:
        return None

    raw_start = dtstart.dt
    raw_end = dtend.dt if dtend is not None else raw_start

    all_day = not isinstance(raw_start, datetime)
    if all_day:
        start_at = datetime(raw_start.year, raw_start.month, raw_start.day, tzinfo=UTC)
        if isinstance(raw_end, datetime):
            end_at = raw_end
        else:
            end_at = datetime(raw_end.year, raw_end.month, raw_end.day, tzinfo=UTC)
    else:
        start_at = raw_start
        end_at = raw_end if isinstance(raw_end, datetime) else raw_start

    start_at = _to_utc_naive(start_at)
    end_at = _to_utc_naive(end_at)

    status_raw = component.get("status")
    status = str(status_raw).lower() if status_raw else "confirmed"
    if status not in ("confirmed", "tentative", "cancelled"):
        status = "confirmed"

    # 對 expand 過嘅 recurring events，每個 occurrence 共用 base UID 但有自己嘅
    # DTSTART。為咗 DB 唯一性，將 start time 加入 external_id（穩定 — 同一 occurrence
    # 每次 sync 都會 generate 同一個 composite ID，updates 而唔係新增）。
    composite_uid = f"{base_uid}__{start_at.strftime('%Y%m%dT%H%M%S')}"

    return ParsedICloudEvent(
        icloud_uid=composite_uid,
        calendar_url=calendar_url,
        calendar_name=calendar_name,
        title=summary,
        description=description,
        location=location,
        start_at=start_at,
        end_at=end_at,
        all_day=all_day,
        status=status,
    )
