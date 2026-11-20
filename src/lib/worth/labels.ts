import type { TranslationKey } from "../i18n/dictionary";
import { type ASSET_KINDS } from "../validation/debts";

type AssetKind = (typeof ASSET_KINDS)[number];

/**
 * Etiqueta de cada tipo de activo. Vive aparte del service para que la pueda
 * importar tanto el cliente como el servidor sin arrastrar prisma.
 */
export const ASSET_KIND_LABEL: Record<AssetKind, TranslationKey> = {
  BANK_ACCOUNT: "worth.kindBank",
  CASH: "worth.kindCash",
  FIXED_INCOME: "worth.kindFixedIncome",
  STOCKS: "worth.kindStocks",
  CRYPTO: "worth.kindCrypto",
  REAL_ESTATE: "worth.kindRealEstate",
  VEHICLE: "worth.kindVehicle",
  OTHER: "worth.kindOther",
};
