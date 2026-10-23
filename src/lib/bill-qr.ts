import type { RentalDocumentDefaults } from "./store-settings";
import { thaiQrWithAmount } from "./thai-qr";

// The QR text for paying this amount into the account a bill shows, when the shop has read that account's QR.
// The bill keeps the account it was quoted with, so the account is found by its QR image or account number.
export function billQrPayload(document: RentalDocumentDefaults, quote: { qrImage?: string; accountNumber?: string } | undefined, amount: number) {
  const digits = (value?: string) => (value || "").replace(/\D/g, "");
  const account = (document.accounts || []).find(item => item.qrPayload && ((quote?.qrImage && item.qrImage === quote.qrImage) || (digits(quote?.accountNumber) && digits(item.accountNumber) === digits(quote?.accountNumber))));
  return account?.qrPayload ? thaiQrWithAmount(account.qrPayload, amount) : null;
}
