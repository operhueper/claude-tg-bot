/**
 * user-db/consent.ts — thin re-export of consent helpers from metering.ts.
 * Consent data lives in metering.sqlite (consents table).
 */

export {
  hasConsented,
  recordConsent,
  revokeConsent,
  getConsentInfo,
} from "./metering.ts";
