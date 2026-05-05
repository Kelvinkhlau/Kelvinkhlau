/**
 * Button — neumorphic button with raised / flat / ghost / solid variants.
 *
 * 用法：
 *   <Button>主要動作</Button>
 *   <Button variant="solid" tone="accent">Submit</Button>
 *   <Button variant="ghost" size="sm">Cancel</Button>
 *   <Button leadingIcon={<Plus />}>新增</Button>
 *
 * 狀態：
 *   - Raised: outer shadow + highlight（預設）
 *   - Solid: 實色填充（primary action）
 *   - Ghost: 冇 shadow，hover 先有 surface
 *   - :active → shadow-pressed + translateY(0)
 */

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

type Variant = "raised" | "solid" | "ghost" | "inset";
type Tone = "neutral" | "accent" | "success" | "warning" | "danger";
type Size = "sm" | "md" | "lg";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  tone?: Tone;
  size?: Size;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  loading?: boolean;
  fullWidth?: boolean;
  children?: ReactNode;
};

const sizeMap: Record<Size, string> = {
  sm: "h-8 px-3 text-xs gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
  lg: "h-12 px-5 text-base gap-2",
};

const radiusBySize: Record<Size, string> = {
  sm: "rounded-md",
  md: "rounded-md",
  lg: "rounded-lg",
};

/** Solid fills — 實色 accent / danger etc */
const solidTone: Record<Tone, string> = {
  neutral: "bg-foreground text-background",
  accent: "bg-accent text-accent-foreground",
  success: "bg-success text-success-foreground",
  warning: "bg-warning text-warning-foreground",
  danger: "bg-danger text-danger-foreground",
};

/** Raised tone — cream surface + text colour */
const raisedTone: Record<Tone, string> = {
  neutral: "bg-surface text-foreground",
  accent: "bg-surface text-accent-strong",
  success: "bg-surface text-success-strong",
  warning: "bg-surface text-warning-strong",
  danger: "bg-surface text-danger-strong",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "raised",
    tone = "neutral",
    size = "md",
    leadingIcon,
    trailingIcon,
    loading = false,
    fullWidth = false,
    disabled,
    className = "",
    children,
    ...rest
  },
  ref,
) {
  const base =
    "inline-flex items-center justify-center font-medium transition-all duration-150 select-none focus-visible:outline-none disabled:opacity-50 disabled:cursor-not-allowed";

  let variantCls = "";
  if (variant === "solid") {
    variantCls = `${solidTone[tone]} shadow-raised-sm hover:shadow-raised active:shadow-pressed`;
  } else if (variant === "ghost") {
    variantCls = `bg-transparent ${raisedTone[tone].replace("bg-surface ", "")} hover:bg-muted active:shadow-pressed`;
  } else if (variant === "inset") {
    variantCls = `${raisedTone[tone]} shadow-inset hover:shadow-flat`;
  } else {
    // raised
    variantCls = `${raisedTone[tone]} shadow-raised-sm hover:shadow-raised active:shadow-pressed`;
  }

  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={[
        base,
        sizeMap[size],
        radiusBySize[size],
        variantCls,
        fullWidth ? "w-full" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...rest}
    >
      {loading ? (
        <span className="inline-block w-3.5 h-3.5 border-2 border-current border-r-transparent rounded-full animate-spin" />
      ) : (
        leadingIcon
      )}
      {children}
      {trailingIcon}
    </button>
  );
});
