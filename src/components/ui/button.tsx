"use client";
import { Slot } from "radix-ui";
import type { ComponentProps } from "react";
const variants = {
  primary: "border border-slate-900 bg-slate-900 text-white hover:bg-slate-800",
  outline: "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
  ghost: "border border-transparent bg-transparent text-slate-600 hover:bg-slate-100",
  danger: "border border-rose-200 bg-white text-rose-700 hover:bg-rose-50",
};
const sizes = { md: "min-h-10 px-4 py-2 text-sm", sm: "min-h-8 px-3 py-1.5 text-xs", icon: "size-9 p-2" };
export function Button({ asChild = false, variant = "primary", size = "md", className = "", type = "button", ...props }: ComponentProps<"button"> & { asChild?: boolean; variant?: keyof typeof variants; size?: keyof typeof sizes }) {
  const Component = asChild ? Slot.Root : "button";
  return <Component data-ui="button" type={asChild ? undefined : type} className={["inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md font-sans font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-600 disabled:pointer-events-none disabled:opacity-50", variants[variant], sizes[size], className].filter(Boolean).join(" ")} {...props} />;
}
