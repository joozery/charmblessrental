import { Suspense } from "react";
import { pageAdmin } from "@/lib/admin-auth";
import { database } from "@/lib/mongodb";
import { getStoreSettings } from "@/lib/store-settings";
import RentalPricingSettings from "./rental-pricing-settings";
import "./rental-pricing.css";

export const metadata = { title: "ราคาเช่า | Charm Bless", robots: { index: false, follow: false } };

async function Content() {
  await pageAdmin("products");
  const db = await database();
  const [settings, history, custom] = await Promise.all([
    getStoreSettings(),
    // What customers actually paid per piece in the old sheet, as a reference when setting the table.
    db.collection("rentalItems").aggregate<{ _id: number; count: number; average: number }>([
      { $match: { agreedPrice: { $gt: 0 } } },
      { $lookup: { from: "rentals", localField: "rentalId", foreignField: "legacyId", as: "rental" } },
      { $unwind: "$rental" }, { $match: { "rental.days": { $gt: 0 } } },
      { $group: { _id: "$rental.days", count: { $sum: 1 }, average: { $avg: "$agreedPrice" } } },
      { $match: { count: { $gte: 20 } } }, { $sort: { _id: 1 } },
    ]).toArray(),
    db.collection("products").countDocuments({ "customPricing.tiers.0": { $exists: true } }),
  ]);
  const categories = (await db.collection("products").distinct("category", { active: { $ne: false } })).filter((value): value is string => typeof value === "string" && !!value).sort();
  return <RentalPricingSettings initial={settings.rentalPricing} history={history.map(row => ({ days: row._id, count: row.count, average: Math.round(row.average) }))} customCount={custom} rates={settings.extraDayRates} categories={categories} />;
}

export default function Page() {
  return <Suspense fallback={<main className="admin-loading" role="status">กำลังโหลดราคาเช่า…</main>}><Content /></Suspense>;
}
