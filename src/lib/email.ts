// Keep in sync with `_ALLOWED_EMAIL_DOMAINS` in vsda-deep-agent/src/backends/schemas.py
const ALLOWED_EMAIL_DOMAINS = ["aptiv.com", "vsda.top", "m.vsda.top"];

const ALLOWED_EMAIL_RE = new RegExp(
  `^[a-zA-Z0-9._%+-]+@(${ALLOWED_EMAIL_DOMAINS.map((d) =>
    d.replace(/\./g, "\\."),
  ).join("|")})$`,
  "i",
);

export function isAllowedRegistrationEmail(email: string): boolean {
  return ALLOWED_EMAIL_RE.test(email);
}

export const ALLOWED_EMAIL_DOMAINS_LABEL = ALLOWED_EMAIL_DOMAINS.map(
  (d) => `@${d}`,
).join(", ");

export const ALLOWED_EMAIL_ERROR_MESSAGE = `Email must be a valid ${ALLOWED_EMAIL_DOMAINS_LABEL} address`;
