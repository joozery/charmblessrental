// Paid bookings the shop still has to send (or hand over at the shop): the "รายการที่ต้องส่ง" page and its menu badge.
export const toShipFilter = { status: { $ne: "cancelled" }, payment: "paid" as const, shipment: { $exists: false }, returned: { $exists: false } };
