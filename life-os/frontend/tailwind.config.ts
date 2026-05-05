import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // ─── Surfaces ────────────────────────────────────────────────
        background: "hsl(var(--background))",
        surface: {
          DEFAULT: "hsl(var(--surface))",
          elevated: "hsl(var(--surface-elevated))",
        },
        overlay: "hsl(var(--overlay))",

        // ─── Text hierarchy ──────────────────────────────────────────
        foreground: {
          DEFAULT: "hsl(var(--foreground))",
          muted: "hsl(var(--foreground-muted))",
          subtle: "hsl(var(--foreground-subtle))",
        },

        // ─── Borders ─────────────────────────────────────────────────
        border: {
          DEFAULT: "hsl(var(--border))",
          subtle: "hsl(var(--border-subtle))",
          strong: "hsl(var(--border-strong))",
        },

        // ─── Backward-compat: muted / primary (原有代碼用緊) ────────
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },

        // ─── Semantic: Accent (brand / link / active) ────────────────
        accent: {
          DEFAULT: "hsl(var(--accent))",
          soft: "hsl(var(--accent-soft))",
          strong: "hsl(var(--accent-strong))",
          foreground: "hsl(var(--accent-foreground))",
        },

        // ─── Semantic: Success ───────────────────────────────────────
        success: {
          DEFAULT: "hsl(var(--success))",
          soft: "hsl(var(--success-soft))",
          strong: "hsl(var(--success-strong))",
          foreground: "hsl(var(--success-foreground))",
        },

        // ─── Semantic: Warning ───────────────────────────────────────
        warning: {
          DEFAULT: "hsl(var(--warning))",
          soft: "hsl(var(--warning-soft))",
          strong: "hsl(var(--warning-strong))",
          foreground: "hsl(var(--warning-foreground))",
        },

        // ─── Semantic: Danger ────────────────────────────────────────
        danger: {
          DEFAULT: "hsl(var(--danger))",
          soft: "hsl(var(--danger-soft))",
          strong: "hsl(var(--danger-strong))",
          foreground: "hsl(var(--danger-foreground))",
        },

        // ─── Semantic: Info ──────────────────────────────────────────
        info: {
          DEFAULT: "hsl(var(--info))",
          soft: "hsl(var(--info-soft))",
          strong: "hsl(var(--info-strong))",
          foreground: "hsl(var(--info-foreground))",
        },

        // ─── Depth tones: deepblue / khaki / ice ─────────────────────
        deepblue: {
          DEFAULT: "hsl(var(--deepblue))",
          soft: "hsl(var(--deepblue-soft))",
          strong: "hsl(var(--deepblue-strong))",
          foreground: "hsl(var(--deepblue-foreground))",
        },
        khaki: {
          DEFAULT: "hsl(var(--khaki))",
          soft: "hsl(var(--khaki-soft))",
          strong: "hsl(var(--khaki-strong))",
          foreground: "hsl(var(--khaki-foreground))",
        },
        ice: {
          DEFAULT: "hsl(var(--ice))",
          soft: "hsl(var(--ice-soft))",
          strong: "hsl(var(--ice-strong))",
          foreground: "hsl(var(--ice-foreground))",
        },
      },

      // ─── Radii scale (統一 4 級) ───────────────────────────────────
      borderRadius: {
        sm: "var(--radius-sm)",
        DEFAULT: "var(--radius-md)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
        xl: "var(--radius-xl)",
      },

      // ─── Neumorphic shadows ─────────────────────────────────────
      boxShadow: {
        sm: "var(--shadow-sm)",
        DEFAULT: "var(--shadow-md)",
        md: "var(--shadow-md)",
        lg: "var(--shadow-lg)",
        xl: "var(--shadow-xl)",
        // Neumorphic variants
        flat: "var(--shadow-flat)",
        raised: "var(--shadow-raised)",
        "raised-sm": "var(--shadow-raised-sm)",
        inset: "var(--shadow-inset)",
        pressed: "var(--shadow-pressed)",
        floating: "var(--shadow-floating)",
      },

      // ─── Font stack ────────────────────────────────────────────────
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          "Inter",
          "Segoe UI",
          "PingFang TC",
          "Microsoft JhengHei",
          "sans-serif",
        ],
        mono: [
          "ui-monospace",
          "SF Mono",
          "Menlo",
          "Monaco",
          "Consolas",
          "monospace",
        ],
      },
    },
  },
  plugins: [require("@tailwindcss/typography")],
};

export default config;
