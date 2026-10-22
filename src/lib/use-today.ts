"use client";
import { useSyncExternalStore } from "react";

const bangkokDay = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const subscribe = () => () => {};
// Today's date (Bangkok), read only in the browser: "" while prerendering, so storefront pages can be static HTML.
export const useToday = () => useSyncExternalStore(subscribe, bangkokDay, () => "");
