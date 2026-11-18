"use client";

import { useState } from "react";
import type { RentalStage } from "@/lib/rental-stage";

type Stage = { key: RentalStage; label: string };

export default function StageTimeline({ stages, current, photos }: { stages: Stage[]; current: RentalStage; photos: Partial<Record<RentalStage, string[]>> }) {
  const [selected, setSelected] = useState<RentalStage>(current);
  const selectedPhotos = photos[selected] || [];
  const currentIndex = stages.findIndex(stage => stage.key === current);
  const selectedLabel = stages.find(stage => stage.key === selected)?.label || "สถานะการเช่า";
  return <>
    <ol className="bill-steps" aria-label="สถานะการเช่า">
      {stages.map((stage, index) => {
        const hasPhotos = (photos[stage.key] || []).length > 0;
        return <li key={stage.key} className={`${currentIndex >= index ? "is-done" : ""}${current === stage.key ? " is-current" : ""}${selected === stage.key ? " is-selected" : ""}`}>
          <button type="button" onClick={() => setSelected(stage.key)} aria-label={`ดูสถานะ ${stage.label}${hasPhotos ? " มีรูปแนบ" : ""}`} aria-pressed={selected === stage.key}>
            <span>{index + 1}</span>
            <b>{stage.label}</b>
            {hasPhotos && <small aria-label="มีรูปแนบ">📷</small>}
          </button>
        </li>;
      })}
    </ol>
    <div className="bill-stage-photos" aria-live="polite">
      <strong>{selectedLabel}</strong>
      {selectedPhotos.length > 0 ? <div>{selectedPhotos.map((url, index) => <a key={`${url}-${index}`} href={url} target="_blank" rel="noreferrer"><img src={url} alt={`${selectedLabel} รูปที่ ${index + 1}`} /></a>)}</div> : <p>ขั้นตอนนี้ยังไม่มีรูปแนบ</p>}
    </div>
  </>;
}
