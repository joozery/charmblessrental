"use client";
import { createContext, useContext, useState, type Dispatch, type SetStateAction, type ReactNode } from "react";
type CartItem = { id: number };
const CartContext = createContext<{ cart: CartItem[]; setCart: Dispatch<SetStateAction<CartItem[]>> } | null>(null);
export function CartProvider({children}: {children: ReactNode}) {
  const [cart,setCart] = useState<CartItem[]>([]);
  return <CartContext.Provider value={{cart,setCart}}>{children}</CartContext.Provider>;
}
export function useCart() {
  const value=useContext(CartContext);
  if(!value) throw new Error("CartProvider is required");
  return value;
}
