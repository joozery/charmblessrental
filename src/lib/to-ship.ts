// Paid bookings the shop still has to send (or hand over at the shop): the "รายการที่ต้องส่ง" page and its menu badge.
export const toShipFilter = { status: { $ne: "cancelled" }, payment: "paid" as const, shipment: { $exists: false }, returned: { $exists: false } };
// Rentals from the old sheet that still go out from the to-ship page (see legacyShipFrom).
export const legacyToShipFilter = (shipFrom: string) => ({ legacyStatus: "รอจัดส่ง", shipDate: { $gte: new Date(`${shipFrom}T00:00:00.000Z`) } });
