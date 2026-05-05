/**
 * Card — neumorphic surface container。
 *
 * 新 props：
 *   variant: "raised" | "flat" | "inset" | "floating"
 *     - raised（預設）: 凸起 card —— 有 outer shadow + highlight
 *     - flat: 微微 raised
 *     - inset: 凹入（例如 input group）
 *     - floating: 最 elevated（modal / popover）
 *
 * Backward-compat:
 *   - elevated → variant="floating"
 *   - interactive → hover + pressed state
 *   - border 依然支援但預設 none（neumorphism 靠 shadow）
 */

import { forwardRef, type HTMLAttributes, type ReactNode } from "react";

type CardVariant = "raised" | "flat" | "inset" | "floating";

type CardProps = HTMLAttributes<HTMLDivElement> & {
  variant?: CardVariant;
  /** @deprecated use variant="floating" */
  elevated?: boolean;
  /** Hover + pressed states */
  interactive?: boolean;
  padding?: "none" | "sm" | "md" | "lg";
  radius?: "sm" | "md" | "lg" | "xl";
  /** 預設 none —— neumorphism 唔用 border */
  border?: "none" | "subtle" | "DEFAULT" | "strong";
  children?: ReactNode;
};

const paddingMap = {
  none: "",
  sm: "p-3",
  md: "p-5",
  lg: "p-7",
} as const;

const radiusMap = {
  sm: "rounded-sm",
  md: "rounded-md",
  lg: "rounded-lg",
  xl: "rounded-xl",
} as const;

const borderMap = {
  none: "",
  subtle: "border border-border-subtle",
  DEFAULT: "border border-border",
  strong: "border border-border-strong",
} as const;

const variantMap: Record<CardVariant, string> = {
  raised: "bg-surface shadow-raised-sm",
  flat: "bg-surface shadow-flat",
  inset: "bg-background shadow-inset",
  floating: "bg-surface-elevated shadow-floating",
};

const CardBase = forwardRef<HTMLDivElement, CardProps>(function Card(
  {
    variant,
    elevated = false,
    interactive = false,
    padding = "md",
    radius = "lg",
    border = "none",
    className = "",
    children,
    ...rest
  },
  ref,
) {
  const resolvedVariant: CardVariant =
    variant ?? (elevated ? "floating" : "raised");
  const surface = variantMap[resolvedVariant];

  const interact = interactive
    ? "cursor-pointer transition-shadow duration-200 hover:shadow-raised active:shadow-pressed"
    : "";

  return (
    <div
      ref={ref}
      className={`${surface} ${borderMap[border]} ${radiusMap[radius]} ${paddingMap[padding]} ${interact} ${className}`.trim()}
      {...rest}
    >
      {children}
    </div>
  );
});

function CardHeader({
  className = "",
  children,
  ...rest
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`flex items-start justify-between gap-3 mb-3 ${className}`.trim()}
      {...rest}
    >
      {children}
    </div>
  );
}

function CardBody({
  className = "",
  children,
  ...rest
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={className} {...rest}>
      {children}
    </div>
  );
}

function CardFooter({
  className = "",
  children,
  ...rest
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`flex items-center justify-between gap-3 mt-3 pt-3 border-t border-border-subtle ${className}`.trim()}
      {...rest}
    >
      {children}
    </div>
  );
}

export const Card = Object.assign(CardBase, {
  Header: CardHeader,
  Body: CardBody,
  Footer: CardFooter,
});
