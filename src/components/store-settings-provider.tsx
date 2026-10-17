"use client";

import { createContext, useContext } from "react";
import { defaultStoreSettings } from "@/lib/store-settings-defaults";
import type { StoreSettings } from "@/lib/store-settings";

const StoreSettingsContext = createContext<StoreSettings>(defaultStoreSettings);
export function StoreSettingsProvider({ settings, children }: { settings: StoreSettings; children: React.ReactNode }) {
  return <StoreSettingsContext.Provider value={settings}>{children}</StoreSettingsContext.Provider>;
}
export const useStoreSettings = () => useContext(StoreSettingsContext);
