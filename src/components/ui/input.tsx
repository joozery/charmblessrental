import type { ComponentProps } from "react";
export function Input({ className = "", ...props }: ComponentProps<"input">) {
  if (props.type === "checkbox") return <input className={["size-4 shrink-0 accent-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-500", className].filter(Boolean).join(" ")} {...props} />;
  return <input className={["min-h-10 w-full min-w-0 rounded-md border border-slate-300 bg-white px-3 py-2 font-sans text-sm text-slate-800 placeholder:text-slate-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-500 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500 read-only:bg-slate-50", className].filter(Boolean).join(" ")} {...props} />;
}
export function Textarea({ className = "", ...props }: ComponentProps<"textarea">) {
  return <textarea className={["w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-sans text-sm leading-relaxed text-slate-800 placeholder:text-slate-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-500", className].filter(Boolean).join(" ")} {...props} />;
}
