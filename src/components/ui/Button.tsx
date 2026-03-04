import { ElementType, forwardRef, ReactNode } from "react";

type ButtonProps = {
  variant?: "solid" | "outline" | "ghost";
  size?: "sm" | "md";
  children: ReactNode;
  className?: string;
  as?: ElementType;
} & Omit<JSX.IntrinsicElements["button"], "className">;

const variantStyles: Record<NonNullable<ButtonProps["variant"]>, string> = {
  solid:
    "bg-[#2563EB] text-white shadow-[0_4px_12px_rgba(37,99,235,0.25)] border border-transparent hover:bg-[#1d4ed8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#93C5FD] transition",
  outline:
    "bg-white text-[#0B1220] border border-[#E6EBF2] hover:border-[#9FA8B8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#93C5FD] transition",
  ghost:
    "bg-transparent text-[#0B1220] border border-transparent hover:bg-[#F1F5F9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#93C5FD] transition",
};

const sizeStyles: Record<NonNullable<ButtonProps["size"]>, string> = {
  sm: "px-3 py-1.5 text-xs rounded-[14px]",
  md: "px-4 py-2 text-sm rounded-[16px]",
};

const Button = forwardRef<ElementType, ButtonProps>(
  ({ variant = "solid", size = "md", as: Component = "button", className = "", ...props }, ref) => (
    <Component
      ref={ref}
      className={`inline-flex items-center justify-center font-medium tracking-tight ${variantStyles[variant]} ${sizeStyles[size]} ${className}`.trim()}
      {...props}
    />
  ),
);

Button.displayName = "Button";

export default Button;
