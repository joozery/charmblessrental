"use client";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
export default function LoginForm({ configured }: { configured: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [refreshing, startTransition] = useTransition();
  const pending = busy || refreshing;
  async function login(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const response = await fetch("/api/admin/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setPassword("");
      startTransition(() => { router.replace("/admin"); router.refresh(); });
    } catch (e) { setError(e instanceof Error ? e.message : "เชื่อมต่อไม่สำเร็จ"); }
    finally { setBusy(false); }
  }
  return <main className="admin-login"><div className="admin-login-card"><div className="admin-monogram">CB</div><p className="admin-eyebrow">CHARM BLESS · ADMIN</p><h1>ยินดีต้อนรับกลับ</h1><p>เข้าสู่ระบบเพื่อจัดการสินค้าให้เช่าของร้าน</p><form onSubmit={login}><label>อีเมล<Input type="text" inputMode="email" autoComplete="username" autoCapitalize="none" spellCheck={false} placeholder="name@example.com" required value={email} onChange={e => setEmail(e.target.value)} /></label><label style={{ marginTop: 16 }}>รหัสผ่านแอดมิน<Input type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} /></label><small className="admin-login-hint">บัญชีเดิมที่ยังไม่ได้เพิ่มอีเมล ใช้ชื่อผู้ใช้เดิมได้ชั่วคราว</small>{!configured && <p className="admin-error">ตั้งค่า MONGODB_URI และ ADMIN_SESSION_SECRET ใน .env.local ก่อนใช้งาน</p>}{error && <p className="admin-error" role="alert">{error}</p>}<Button type="submit" className="mt-5 w-full" variant="primary" disabled={pending || !configured}>{pending ? "กำลังเข้าสู่ระบบ…" : <>เข้าสู่ระบบ<Icon name="arrowRight" /></>}</Button></form><Link href="/"><Icon name="arrowLeft" />กลับหน้าร้าน</Link></div></main>;
}
