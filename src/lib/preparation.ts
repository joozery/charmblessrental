import type { UnitStatus } from "./products";

// Client-safe: which way a piece being prepared may move next. Unwashed pieces never jump straight to ready,
// except from inspection when the admin confirms the item needs no washing (bags, shoes, cameras).
export const prepMoves: Partial<Record<UnitStatus, { to: UnitStatus; label: string; primary?: boolean }[]>> = {
  inspection: [{ to: "washing", label: "ตรวจแล้ว ส่งซัก", primary: true }, { to: "repair", label: "พบชำรุด ส่งซ่อม" }, { to: "available", label: "ไม่ต้องซัก · ยืนยันพร้อมให้เช่า" }],
  washing: [{ to: "available", label: "ซักเสร็จ · ยืนยันพร้อมให้เช่า", primary: true }, { to: "repair", label: "พบชำรุด ส่งซ่อม" }],
  repair: [{ to: "washing", label: "ซ่อมเสร็จ ส่งซัก", primary: true }, { to: "available", label: "ซ่อมเสร็จ · ยืนยันพร้อมให้เช่า" }, { to: "retired", label: "ซ่อมไม่ได้ · เลิกใช้" }],
};
export const canMove = (from: UnitStatus, to: UnitStatus) => !!prepMoves[from]?.some(move => move.to === to);
