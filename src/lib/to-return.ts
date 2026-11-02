// Open rentals that have left the shop but have not been recorded as received back.
export const toReturnFilter = {
  status: { $ne: "cancelled" },
  shipment: { $exists: true },
  returned: { $exists: false },
};
