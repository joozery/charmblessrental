import { bankByCode } from "@/lib/banks";

// The bank's white mark on its brand colour; PromptPay has no logo file, so it gets its initials.
export default function BankBadge({ code, size = 28 }: { code: string; size?: number }) {
  const bank = bankByCode(code);
  return <span className="bank-badge" style={{ display: "inline-grid", flex: "none", placeItems: "center", width: size, height: size, borderRadius: 999, overflow: "hidden", color: "#fff", background: bank?.color || "#98a2b3", verticalAlign: "middle" }} aria-hidden="true">{bank?.logo ? <img src={bank.logo} alt="" style={{ width: "72%", height: "72%", objectFit: "contain" }} /> : <b style={{ fontSize: size * 0.36, fontWeight: 800 }}>{bank?.code === "promptpay" ? "PP" : "฿"}</b>}</span>;
}
