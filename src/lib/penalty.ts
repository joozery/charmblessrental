export type BookingPenalty = {
  id: string;
  amount: number;
  reason: string;
  createdAt: Date | string;
  createdByName: string;
};
