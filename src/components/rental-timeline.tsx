import { planDays, type RentalPlan } from "@/lib/schedule";

const short = (day: string) => new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${day}T00:00:00Z`));
const weekday = (day: string) => ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"][new Date(`${day}T00:00:00Z`).getUTCDay()];

// The shop's "นับวันเช่าและการเว้น Gap" chart for one rental: ship → in transit → use → return → gap → free again.
export default function RentalTimeline({ plan, pickup = false, compact = false }: { plan: RentalPlan; pickup?: boolean; compact?: boolean }) {
  const days = planDays(plan);
  const column = (day: string) => days.indexOf(day) + 1;
  const span = (from: string, to: string) => ({ gridColumn: `${column(from)} / ${column(to) + 1}` });
  const transit = days.filter(day => day > plan.ship && day < plan.start), gap = days.filter(day => day > plan.returnDate && day < plan.ready);
  return <figure className={`rental-timeline${compact ? " is-compact" : ""}`}>
    <figcaption>{pickup ? "รับชุดที่ร้าน" : "ร้านส่ง"} {short(plan.ship)} · ใช้งาน {short(plan.start)} – {short(plan.end)} ({plan.days} วัน) · ส่งคืน {short(plan.returnDate)} · Gap {plan.gap} วัน · รับคิวใหม่ได้ {short(plan.ready)}</figcaption>
    <div className="rental-timeline-scroll"><div className="rental-timeline-grid" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(${compact ? 40 : 52}px, 1fr))` }}>
      {days.map(day => <span key={day} className={`rental-timeline-date${day >= plan.start && day <= plan.end ? " is-use" : day === plan.ready ? " is-ready" : day > plan.returnDate ? " is-gap" : day === plan.returnDate ? " is-return" : ""}`}>{short(day)}<small>({weekday(day)})</small></span>)}
      <span className="rental-timeline-cell is-ship" style={span(plan.ship, plan.ship)}><b aria-hidden="true">{pickup ? "🛍️" : "🚚"}</b>{pickup ? "รับชุด" : "จัดส่ง"}</span>
      {transit.map(day => <span key={day} className="rental-timeline-cell is-transit" style={span(day, day)}>–</span>)}
      <span className="rental-timeline-cell is-use" style={span(plan.start, plan.end)}><b aria-hidden="true">👗</b><strong>ลูกค้าใช้งานชุด</strong><small>{short(plan.start)} – {short(plan.end)} = {plan.days} วัน</small></span>
      <span className="rental-timeline-cell is-return" style={span(plan.returnDate, plan.returnDate)}><b aria-hidden="true">📦</b>ส่งคืน</span>
      {gap.map((day, index) => <span key={day} className="rental-timeline-cell is-gap" style={span(day, day)}><strong>Gap</strong>{index + 1}</span>)}
      <span className="rental-timeline-cell is-ready" style={span(plan.ready, plan.ready)}><b aria-hidden="true">✅</b>รับคิวใหม่</span>
    </div></div>
  </figure>;
}
