"""ORM models。Import all models here so Alembic can detect them."""

from app.models.audit_log import AuditLog
from app.models.brokerage_cash_balance import BrokerageCashBalance
from app.models.calendar_event import CalendarEvent
from app.models.daily_focus import DailyFocus
from app.models.email import Email, EmailClassification
from app.models.email_attachment import EmailAttachment
from app.models.expense import Expense
from app.models.family_member import ExpenseSplit, FamilyMember
from app.models.idea import Idea
from app.models.ledger import Ledger
from app.models.loan import Loan, LoanRepayment
from app.models.note import Note
from app.models.note_attachment import NoteAttachment
from app.models.notebook import Notebook, NotebookPage
from app.models.passkey_credential import PasskeyCredential
from app.models.project import Project
from app.models.push_subscription import PushSubscription
from app.models.relation import Relation
from app.models.todo import Todo
from app.models.transfer import Transfer
from app.models.user import User
from app.models.muted_sender import MutedSender
from app.models.smart_label import SmartLabel
from app.models.vault import VaultCategory, VaultFile, VaultFileTag, VaultTag
from app.models.vip import VipSender

__all__ = [
    "User",
    "Email",
    "EmailClassification",
    "EmailAttachment",
    "Todo",
    "Project",
    "Idea",
    "CalendarEvent",
    "VipSender",
    "MutedSender",
    "Expense",
    "ExpenseSplit",
    "FamilyMember",
    "Ledger",
    "Loan",
    "LoanRepayment",
    "Transfer",
    "Note",
    "NoteAttachment",
    "Notebook",
    "NotebookPage",
    "AuditLog",
    "BrokerageCashBalance",
    "SmartLabel",
    "PasskeyCredential",
    "PushSubscription",
    "Relation",
    "DailyFocus",
    "VaultCategory",
    "VaultTag",
    "VaultFile",
    "VaultFileTag",
]
