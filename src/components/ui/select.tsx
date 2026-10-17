"use client";
import { Select as Primitive } from "radix-ui";
import { Icon } from "./icon";
export function Select({ value, onValueChange, options, label, className = "", name, required, disabled }: {
  value: string; onValueChange: (value: string) => void;
  options: { value: string; label: string }[]; label: string; className?: string;
  name?: string; required?: boolean; disabled?: boolean;
}) {
  return <Primitive.Root value={value} onValueChange={onValueChange} name={name} required={required} disabled={disabled}>
    <Primitive.Trigger aria-label={label} className={["inline-flex min-h-10 min-w-36 items-center justify-between gap-3 rounded-md border border-slate-300 bg-white px-3 py-2 text-left font-sans text-sm text-slate-700 outline-none transition-colors hover:border-slate-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-500 data-[disabled]:opacity-50", className].filter(Boolean).join(" ")}><Primitive.Value /><Primitive.Icon><Icon name="chevronDown" className="text-slate-500" /></Primitive.Icon></Primitive.Trigger>
    <Primitive.Portal><Primitive.Content position="popper" sideOffset={5} collisionPadding={10} className="z-[180] min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-lg border border-slate-200 bg-white p-1 font-sans text-sm text-slate-700 shadow-lg outline-none"><Primitive.ScrollUpButton className="flex justify-center py-1 text-slate-500"><Icon name="chevronUp" /></Primitive.ScrollUpButton><Primitive.Viewport className="max-h-72">{options.map(option => <Primitive.Item key={option.value} value={option.value} className="relative flex cursor-default select-none items-center rounded-md py-2 pl-8 pr-4 outline-none data-[highlighted]:bg-slate-100 data-[highlighted]:text-slate-950"><Primitive.ItemIndicator className="absolute left-2"><Icon name="check" /></Primitive.ItemIndicator><Primitive.ItemText>{option.label}</Primitive.ItemText></Primitive.Item>)}</Primitive.Viewport><Primitive.ScrollDownButton className="flex justify-center py-1 text-slate-500"><Icon name="chevronDown" /></Primitive.ScrollDownButton></Primitive.Content></Primitive.Portal>
  </Primitive.Root>;
}
