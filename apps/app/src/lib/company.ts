/**
 * Read from a NEXT_PUBLIC_ variable so the same name reaches the sender header
 * on the server and the editable email preview on the client.
 */
export const COMPANY_NAME =
  process.env.NEXT_PUBLIC_COMPANY_NAME?.trim() || "Docket";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/, "") ?? "";

/** Emails need an absolute, publicly reachable image URL; SVG is not reliably rendered. */
export const COMPANY_LOGO_URL =
  process.env.NEXT_PUBLIC_COMPANY_LOGO_URL?.trim() || (APP_URL ? `${APP_URL}/brand/mark.png` : "");

export const CAREERS_URL = APP_URL ? `${APP_URL}/careers` : "";

export const EMAIL_BRAND = {
  companyName: COMPANY_NAME,
  logoUrl: COMPANY_LOGO_URL,
  careersUrl: CAREERS_URL,
};
