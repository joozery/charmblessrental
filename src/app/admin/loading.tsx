// Shown at once while an admin page loads, so a click on the menu never looks frozen.
export default function Loading() {
  return <main className="admin-main admin-loading" role="status" aria-live="polite">กำลังโหลด…</main>;
}
