/**
 * Single source of truth for all UI icons.
 *
 * 原則：
 *   1. 淨係 re-export 要用嘅 icon，避免 bundle bloat（tree-shakeable）
 *   2. 用戶 content 嘅 emoji（note/idea/calendar 入面）照用，唔會嚟呢度
 *   3. `iconSize` / `iconStroke` 統一風格
 *
 * 加新 icon：去 https://lucide.dev 搵，再 add to export list 下面。
 */

export type { LucideIcon } from "lucide-react";

export {
  // ─── Navigation ──────────────────────────────────────────────────
  Home,
  NotebookPen,
  Inbox,
  CheckSquare,
  FolderKanban,
  Lightbulb,
  Calendar,
  FileText,
  Wallet,
  TrendingUp,
  Bot,
  Shield,
  Settings,
  BarChart3,
  CreditCard,
  RefreshCw,
  Building2,
  Tags,
  Star,
  FileBarChart,

  // ─── Actions ─────────────────────────────────────────────────────
  Search,
  Plus,
  X,
  MoreHorizontal,
  Trash2,
  Pin,
  PinOff,
  Archive,
  ArchiveRestore,
  Edit3,
  Paperclip,
  Save,
  Copy,
  Share2,
  Download,
  Upload,
  Filter,
  SortAsc,

  // ─── Toggles / State ─────────────────────────────────────────────
  Check,
  CheckCircle2,
  Circle,
  AlertCircle,
  AlertTriangle,
  Info,
  XCircle,

  // ─── Flow ────────────────────────────────────────────────────────
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  ArrowLeft,
  ExternalLink,

  // ─── Email specific ──────────────────────────────────────────────
  Mail,
  MailOpen,
  Send,
  Reply,
  ReplyAll,
  Forward,

  // ─── Content / Misc ──────────────────────────────────────────────
  Tag,
  Sparkles,
  Clock,
  CalendarClock,
  Loader2,
  Link2,
  Zap,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Menu,
  LogOut,
  Sun,
  Moon,
  Monitor,
  Mic,
  MicOff,
  Image,
  Folder,
  FolderOpen,
  Hash,
  Heart,
  Flame,
  Bell,
  BellOff,
  User,
  Users,
  Smile,
  HelpCircle,

  // ─── Finance extras (P2/P3) ──────────────────────────────────────
  LineChart,
  BookOpen,
  HandCoins,
} from "lucide-react";

// ─── Default style props ─────────────────────────────────────────────
// 用例：<Home {...iconProps} /> 確保全系統 icon 一致
export const iconProps = {
  size: 18,
  strokeWidth: 1.75,
  absoluteStrokeWidth: false,
} as const;

// ─── Size variants ───────────────────────────────────────────────────
export const iconSize = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 18,
  xl: 20,
  "2xl": 24,
  "3xl": 32,
} as const;
