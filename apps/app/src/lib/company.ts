/**
 * Read from a NEXT_PUBLIC_ variable so the same name reaches the sender header
 * on the server and the editable email preview on the client.
 */
export const COMPANY_NAME =
  process.env.NEXT_PUBLIC_COMPANY_NAME?.trim() || "Docket";
