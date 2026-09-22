/**
 * Read from a NEXT_PUBLIC_ variable so the same name reaches the sender header
 * on the server and the editable email preview on the client.
 */
export const COMPANY_NAME =
  process.env.NEXT_PUBLIC_COMPANY_NAME?.trim() || "Docket";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/, "") ?? "";

export const CAREERS_URL = APP_URL ? `${APP_URL}/careers` : "";

export const EMAIL_BRAND = {
  careersUrl: CAREERS_URL,
};
