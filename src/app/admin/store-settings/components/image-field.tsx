import { Input } from "@/components/ui/input";
import type { ImageKey } from "./types";

type Props = { label: string; value: string; required?: boolean; disabled: boolean; imageKey: ImageKey; onChange: (value: string) => void; onUpload: (key: ImageKey, file?: File) => void };

export function ImageField({ label, value, required = false, disabled, imageKey, onChange, onUpload }: Props) {
  return <div className="store-image-field">
    <label>{label}<Input value={value} onChange={e => onChange(e.target.value)} required={required} /></label>
    <label className="store-image-upload">อัปโหลดไฟล์จากเครื่อง<Input type="file" accept="image/png,image/jpeg,image/webp" disabled={disabled} onChange={e => { onUpload(imageKey, e.target.files?.[0]); e.currentTarget.value = ""; }} /><small>PNG, JPG หรือ WebP · ไม่เกิน 5 MB</small></label>
  </div>;
}
