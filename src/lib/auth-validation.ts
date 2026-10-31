import {
  ALLOWED_EMAIL_ERROR_MESSAGE,
  isAllowedRegistrationEmail,
} from "./email";

export const MIN_PASSWORD_LENGTH = 8;

/** Each validator returns the first user-facing error, or null when valid. */
export function validateLogin(input: {
  username: string;
  password: string;
}): string | null {
  if (!input.username.trim() || !input.password.trim()) {
    return "Username and password are required";
  }
  return null;
}

export function validateRegistration(input: {
  username: string;
  normalizedEmail: string;
  password: string;
  confirmPassword: string;
  invitationCode: string;
  requireInvitationCode: boolean;
}): string | null {
  if (
    !input.username.trim() ||
    !input.normalizedEmail ||
    !input.password.trim()
  ) {
    return "Username, Aptiv email, and password are required";
  }
  if (!isAllowedRegistrationEmail(input.normalizedEmail)) {
    return ALLOWED_EMAIL_ERROR_MESSAGE;
  }
  if (input.password !== input.confirmPassword) {
    return "Passwords do not match";
  }
  if (input.password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  }
  if (input.requireInvitationCode && !input.invitationCode.trim()) {
    return "An invitation code is required to register";
  }
  return null;
}

export function validateVerificationCode(code: string): string | null {
  return /^\d{6}$/.test(code.trim())
    ? null
    : "Enter the 6-digit code from your email";
}
