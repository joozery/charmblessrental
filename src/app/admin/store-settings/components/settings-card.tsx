import type { ReactNode } from "react";

export function SettingsCard({ id, step, title, description, children }: { id: string; step: number; title: string; description: ReactNode; children: ReactNode }) {
  return <section className="store-settings-card" id={id} aria-labelledby={`${id}-title`}>
    <div className="store-settings-card-head"><span className="store-settings-step">{step}</span><div><h2 id={`${id}-title`}>{title}</h2><p>{description}</p></div></div>
    {children}
  </section>;
}

export function SettingsGroup({ title, children }: { title: string; children: ReactNode }) {
  return <div className="store-settings-group"><h3>{title}</h3><div className="store-settings-group-body">{children}</div></div>;
}
