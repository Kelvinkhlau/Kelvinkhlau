"use client";

import { useState } from "react";

/**
 * BankLogo — 顯示銀行 / 支付方式真實 Logo
 *
 * 順序：
 *   1. 本地 PNG（/public/logos/banks/{slug}.png，由 Google s2 favicon 預先下載）
 *   2. 內嵌 SVG fallback（手畫簡化版）
 *   3. 彩色圓形 + 首字（最終 fallback）
 *
 * 全部 logo 已 bundle 喺 frontend/public/logos/banks/，runtime 完全 local。
 */

type LogoProps = {
  bank: string;
  color?: string;
  size?: number;
  className?: string;
};

/* ── bank name → 本地 PNG slug map ───────── */
const BANK_SLUGS: Record<string, string> = {
  // 傳統銀行
  HSBC: "hsbc",
  恒生: "hangseng",
  中銀: "boc",
  渣打: "sc",
  DBS: "dbs",
  東亞: "bea",
  Citibank: "citi",
  大新: "dahsing",
  工銀亞洲: "icbc",
  // 虛擬銀行
  Mox: "mox",
  WeLab: "welab",
  livi: "livi",
  天星: "airstar",
  富融: "fusion",
  PAO: "pao",
  // 電子錢包
  PayMe: "payme",
  八達通: "octopus",
  支付寶: "alipay",
  "WeChat Pay": "wechatpay",
  "Apple Pay": "applepay",
  "Google Pay": "googlepay",
  "BoC Pay": "boc", // 同 BoC 共用
  // 證券
  富途: "futu",
  老虎: "tiger",
  IBKR: "ibkr",
  耀才: "bsgroup",
};

export function BankLogo({ bank, color, size = 32, className = "" }: LogoProps) {
  const s = size;
  const [imgFailed, setImgFailed] = useState(false);
  const slug = BANK_SLUGS[bank];

  // 1. 真實 logo（本地 PNG）
  if (slug && !imgFailed) {
    return (
      <span
        className={`inline-flex items-center justify-center shrink-0 rounded-lg overflow-hidden bg-white dark:bg-white ring-1 ring-black/5 ${className}`}
        style={{ width: s, height: s }}
      >
        <img
          src={`/logos/banks/${slug}.png`}
          alt={bank}
          width={s}
          height={s}
          className="w-full h-full object-contain p-0.5"
          loading="lazy"
          onError={() => setImgFailed(true)}
        />
      </span>
    );
  }

  // 2. 內嵌 SVG fallback
  const logo = BANK_LOGOS[bank];
  if (logo) {
    return (
      <span
        className={`inline-flex items-center justify-center shrink-0 rounded-lg overflow-hidden ${className}`}
        style={{ width: s, height: s }}
      >
        {logo(s)}
      </span>
    );
  }

  // 3. 彩色圓形 + 首字（最終 fallback）
  const bgColor = color || "#6B7280";
  const initial = bank.charAt(0);
  return (
    <span
      className={`inline-flex items-center justify-center shrink-0 rounded-lg font-bold text-white ${className}`}
      style={{ width: s, height: s, backgroundColor: bgColor, fontSize: s * 0.4 }}
    >
      {initial}
    </span>
  );
}

/* ── SVG Logo 定義 ──────────────────────── */

const BANK_LOGOS: Record<string, (s: number) => React.ReactNode> = {
  // HSBC — 紅白六角形
  HSBC: (s) => (
    <svg viewBox="0 0 40 40" width={s} height={s}>
      <rect width="40" height="40" fill="#DB0011" />
      <path d="M20 6L8 13v14l12 7 12-7V13L20 6z" fill="#fff" />
      <path d="M20 6L8 13l12 7 12-7L20 6z" fill="#DB0011" />
      <path d="M20 20l12-7v14l-12 7V20z" fill="#DB0011" opacity="0.7" />
    </svg>
  ),

  // 恒生 Hang Seng — 綠色 coin 形
  "恒生": (s) => (
    <svg viewBox="0 0 40 40" width={s} height={s}>
      <rect width="40" height="40" fill="#00A651" rx="4" />
      <circle cx="20" cy="20" r="12" fill="none" stroke="#fff" strokeWidth="2.5" />
      <text x="20" y="25" textAnchor="middle" fill="#fff" fontSize="12" fontWeight="bold">恒</text>
    </svg>
  ),

  // 中銀 BOC — 紅色 + 古幣形
  "中銀": (s) => (
    <svg viewBox="0 0 40 40" width={s} height={s}>
      <rect width="40" height="40" fill="#C8102E" rx="4" />
      <circle cx="20" cy="20" r="11" fill="none" stroke="#fff" strokeWidth="2" />
      <rect x="16" y="16" width="8" height="8" fill="#C8102E" stroke="#fff" strokeWidth="1.5" />
      <text x="20" y="38" textAnchor="middle" fill="#fff" fontSize="6">BOC</text>
    </svg>
  ),

  // 渣打 Standard Chartered — 藍綠色
  "渣打": (s) => (
    <svg viewBox="0 0 40 40" width={s} height={s}>
      <rect width="40" height="40" fill="#0072AA" rx="4" />
      <text x="20" y="18" textAnchor="middle" fill="#fff" fontSize="9" fontWeight="bold">SC</text>
      <rect x="8" y="22" width="24" height="2" fill="#86BC25" />
      <text x="20" y="34" textAnchor="middle" fill="#fff" fontSize="6">渣打</text>
    </svg>
  ),

  // DBS 星展
  DBS: (s) => (
    <svg viewBox="0 0 40 40" width={s} height={s}>
      <rect width="40" height="40" fill="#E31937" rx="4" />
      <text x="20" y="26" textAnchor="middle" fill="#fff" fontSize="14" fontWeight="bold">DBS</text>
    </svg>
  ),

  // 東亞 BEA
  "東亞": (s) => (
    <svg viewBox="0 0 40 40" width={s} height={s}>
      <rect width="40" height="40" fill="#002B5C" rx="4" />
      <text x="20" y="25" textAnchor="middle" fill="#FFD700" fontSize="11" fontWeight="bold">BEA</text>
    </svg>
  ),

  // 花旗 Citibank
  Citibank: (s) => (
    <svg viewBox="0 0 40 40" width={s} height={s}>
      <rect width="40" height="40" fill="#003B70" rx="4" />
      <path d="M8 18h24" stroke="#fff" strokeWidth="1" />
      <path d="M20 10c-4 0-7 3-7 7s3 7 7 7" stroke="#E31937" strokeWidth="2.5" fill="none" />
      <text x="20" y="35" textAnchor="middle" fill="#fff" fontSize="7">citi</text>
    </svg>
  ),

  // 中信 CITIC
  "中信": (s) => (
    <svg viewBox="0 0 40 40" width={s} height={s}>
      <rect width="40" height="40" fill="#E60012" rx="4" />
      <text x="20" y="25" textAnchor="middle" fill="#fff" fontSize="9" fontWeight="bold">CITIC</text>
    </svg>
  ),

  // 大新 Dah Sing
  "大新": (s) => (
    <svg viewBox="0 0 40 40" width={s} height={s}>
      <rect width="40" height="40" fill="#009CDE" rx="4" />
      <text x="20" y="18" textAnchor="middle" fill="#fff" fontSize="10" fontWeight="bold">大新</text>
      <text x="20" y="32" textAnchor="middle" fill="#fff" fontSize="7">Dah Sing</text>
    </svg>
  ),

  // 交通銀行
  "交通": (s) => (
    <svg viewBox="0 0 40 40" width={s} height={s}>
      <rect width="40" height="40" fill="#00247D" rx="4" />
      <circle cx="20" cy="18" r="8" fill="none" stroke="#fff" strokeWidth="1.5" />
      <text x="20" y="22" textAnchor="middle" fill="#fff" fontSize="8" fontWeight="bold">交</text>
      <text x="20" y="35" textAnchor="middle" fill="#fff" fontSize="6">BOCOM</text>
    </svg>
  ),

  // 工銀亞洲
  "工銀亞洲": (s) => (
    <svg viewBox="0 0 40 40" width={s} height={s}>
      <rect width="40" height="40" fill="#C8102E" rx="4" />
      <text x="20" y="22" textAnchor="middle" fill="#fff" fontSize="9" fontWeight="bold">ICBC</text>
      <text x="20" y="34" textAnchor="middle" fill="#fff" fontSize="6">工銀</text>
    </svg>
  ),

  // 招商永隆
  "招商永隆": (s) => (
    <svg viewBox="0 0 40 40" width={s} height={s}>
      <rect width="40" height="40" fill="#C8102E" rx="4" />
      <text x="20" y="22" textAnchor="middle" fill="#fff" fontSize="9" fontWeight="bold">CMB</text>
      <text x="20" y="34" textAnchor="middle" fill="#fff" fontSize="6">永隆</text>
    </svg>
  ),

  // ── 虛擬銀行 ──

  // ZA Bank
  "ZA Bank": (s) => (
    <svg viewBox="0 0 40 40" width={s} height={s}>
      <rect width="40" height="40" fill="#6C3EF5" rx="4" />
      <text x="20" y="27" textAnchor="middle" fill="#fff" fontSize="16" fontWeight="bold">ZA</text>
    </svg>
  ),

  // Mox Bank
  Mox: (s) => (
    <svg viewBox="0 0 40 40" width={s} height={s}>
      <rect width="40" height="40" fill="#FF6B35" rx="4" />
      <text x="20" y="26" textAnchor="middle" fill="#fff" fontSize="13" fontWeight="bold">mox</text>
    </svg>
  ),

  // WeLab Bank
  WeLab: (s) => (
    <svg viewBox="0 0 40 40" width={s} height={s}>
      <rect width="40" height="40" fill="#00C48C" rx="4" />
      <text x="20" y="22" textAnchor="middle" fill="#fff" fontSize="8" fontWeight="bold">WeLab</text>
      <text x="20" y="33" textAnchor="middle" fill="#fff" fontSize="7">Bank</text>
    </svg>
  ),

  // livi Bank
  livi: (s) => (
    <svg viewBox="0 0 40 40" width={s} height={s}>
      <rect width="40" height="40" fill="#0066FF" rx="4" />
      <text x="20" y="26" textAnchor="middle" fill="#fff" fontSize="14" fontWeight="bold" fontStyle="italic">livi</text>
    </svg>
  ),

  // 天星 Airstar
  "天星": (s) => (
    <svg viewBox="0 0 40 40" width={s} height={s}>
      <rect width="40" height="40" fill="#1A1A2E" rx="4" />
      <polygon points="20,8 23,17 32,17 25,22 27,31 20,26 13,31 15,22 8,17 17,17" fill="#FFB800" />
    </svg>
  ),

  // 富融 Fusion
  "富融": (s) => (
    <svg viewBox="0 0 40 40" width={s} height={s}>
      <rect width="40" height="40" fill="#F5A623" rx="4" />
      <text x="20" y="26" textAnchor="middle" fill="#fff" fontSize="10" fontWeight="bold">富融</text>
    </svg>
  ),

  // PAO Bank
  PAO: (s) => (
    <svg viewBox="0 0 40 40" width={s} height={s}>
      <rect width="40" height="40" fill="#FA541C" rx="4" />
      <text x="20" y="26" textAnchor="middle" fill="#fff" fontSize="13" fontWeight="bold">PAO</text>
    </svg>
  ),

  // 螞蟻銀行
  "螞蟻": (s) => (
    <svg viewBox="0 0 40 40" width={s} height={s}>
      <rect width="40" height="40" fill="#1677FF" rx="4" />
      <text x="20" y="26" textAnchor="middle" fill="#fff" fontSize="14">🐜</text>
    </svg>
  ),

  // ── 電子錢包 ──

  // PayMe
  PayMe: (s) => (
    <svg viewBox="0 0 40 40" width={s} height={s}>
      <rect width="40" height="40" fill="#DB0011" rx="4" />
      <text x="20" y="18" textAnchor="middle" fill="#fff" fontSize="8" fontWeight="bold">Pay</text>
      <text x="20" y="30" textAnchor="middle" fill="#fff" fontSize="10" fontWeight="bold">Me</text>
    </svg>
  ),

  // 八達通
  "八達通": (s) => (
    <svg viewBox="0 0 40 40" width={s} height={s}>
      <rect width="40" height="40" fill="#F5A623" rx="4" />
      <circle cx="20" cy="18" r="7" fill="#fff" />
      <text x="20" y="22" textAnchor="middle" fill="#F5A623" fontSize="10" fontWeight="bold">O</text>
      <text x="20" y="35" textAnchor="middle" fill="#fff" fontSize="7">八達通</text>
    </svg>
  ),

  // 支付寶
  "支付寶": (s) => (
    <svg viewBox="0 0 40 40" width={s} height={s}>
      <rect width="40" height="40" fill="#1677FF" rx="4" />
      <text x="20" y="22" textAnchor="middle" fill="#fff" fontSize="10" fontWeight="bold">支付</text>
      <text x="20" y="34" textAnchor="middle" fill="#fff" fontSize="8">寶 HK</text>
    </svg>
  ),

  // WeChat Pay
  "WeChat Pay": (s) => (
    <svg viewBox="0 0 40 40" width={s} height={s}>
      <rect width="40" height="40" fill="#07C160" rx="4" />
      <circle cx="16" cy="18" r="5" fill="#fff" opacity="0.9" />
      <circle cx="26" cy="22" r="5" fill="#fff" opacity="0.7" />
      <text x="20" y="36" textAnchor="middle" fill="#fff" fontSize="6">WeChat Pay</text>
    </svg>
  ),

  // Tap & Go
  "Tap & Go": (s) => (
    <svg viewBox="0 0 40 40" width={s} height={s}>
      <rect width="40" height="40" fill="#FF6B00" rx="4" />
      <text x="20" y="20" textAnchor="middle" fill="#fff" fontSize="7" fontWeight="bold">Tap&amp;</text>
      <text x="20" y="32" textAnchor="middle" fill="#fff" fontSize="9" fontWeight="bold">Go</text>
    </svg>
  ),

  // BoC Pay
  "BoC Pay": (s) => (
    <svg viewBox="0 0 40 40" width={s} height={s}>
      <rect width="40" height="40" fill="#C8102E" rx="4" />
      <text x="20" y="20" textAnchor="middle" fill="#fff" fontSize="8" fontWeight="bold">BoC</text>
      <text x="20" y="32" textAnchor="middle" fill="#fff" fontSize="9" fontWeight="bold">Pay</text>
    </svg>
  ),

  // Apple Pay
  "Apple Pay": (s) => (
    <svg viewBox="0 0 40 40" width={s} height={s}>
      <rect width="40" height="40" fill="#333" rx="4" />
      <text x="20" y="24" textAnchor="middle" fill="#fff" fontSize="16"></text>
      <text x="20" y="36" textAnchor="middle" fill="#fff" fontSize="7">Pay</text>
    </svg>
  ),

  // Google Pay
  "Google Pay": (s) => (
    <svg viewBox="0 0 40 40" width={s} height={s}>
      <rect width="40" height="40" fill="#fff" rx="4" stroke="#e5e7eb" strokeWidth="1" />
      <text x="12" y="24" fill="#4285F4" fontSize="11" fontWeight="bold">G</text>
      <text x="22" y="24" fill="#34A853" fontSize="8" fontWeight="bold">Pay</text>
    </svg>
  ),

  // 現金
  "現金": (s) => (
    <svg viewBox="0 0 40 40" width={s} height={s}>
      <rect width="40" height="40" fill="#22C55E" rx="4" />
      <text x="20" y="26" textAnchor="middle" fill="#fff" fontSize="16">💵</text>
    </svg>
  ),
};

export default BankLogo;
