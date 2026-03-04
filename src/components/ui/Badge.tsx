import { ReactNode } from "react";

type BadgeProps = {
  children: ReactNode;
  variant?: "default" | "accent";
  className?: string;
};

const variantStyles: Record<NonNullable<BadgeProps["variant"]>, string> = {
  default: "bg-white text-[#5B667A] border border-[#E6EBF2]",
  accent: "bg-[#2563EB] text-white border-transparent",
};

const Badge = ({ children, variant = "default", className = "" }: BadgeProps) => (
  <span
    className={`inline-flex items-center gap-1 rounded-[14px] px-3 py-1 text-xs font-semibold ${variantStyles[variant]} shadow-[0_2px_6px_rgba(15,23,42,0.08)] ${className}`.trim()}
  >
    {children}
  </span>
);

export default Badge;
