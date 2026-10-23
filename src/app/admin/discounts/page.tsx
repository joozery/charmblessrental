import { Suspense } from "react";
import { pageAdmin } from "@/lib/admin-auth";
import DiscountsManager from "./discounts-manager";
import { discountCoupons } from "@/lib/discounts";
import { database } from "@/lib/mongodb";
import "./discounts.css";

async function Content() { await pageAdmin("pricing"); const rows = await discountCoupons(await database()).find({}).sort({ createdAt: -1 }).toArray(); return <DiscountsManager initial={rows.map(row => ({ ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() }))} />; }
export default function Page() { return <Suspense fallback={<main className="admin-loading">กำลังโหลดส่วนลด…</main>}><Content /></Suspense>; }
