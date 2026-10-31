import {
  ALLOWED_EMAIL_ERROR_MESSAGE,
  isAllowedRegistrationEmail,
} from "./email";

export const MIN_PASSWORD_LENGTH = 8;

export type AuthFieldName =
  | "username"
  | "email"
  | "password"
  | "confirmPassword"
  | "invitationCode"
  | "verificationCode";

/** The first failing rule, tied to the field the user should fix. */
export interface AuthFieldError {
  field: AuthFieldName;
  message: string;
}

export function validateLogin(input: {
  username: string;
  password: string;
}): AuthFieldError | null {
  if (!input.username.trim()) {
    return { field: "username", message: "Enter your username." };
  }
  if (!input.password.trim()) {
    return { field: "password", message: "Enter your password." };
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
}): AuthFieldError | null {
  if (!input.username.trim()) {
    return { field: "username", message: "Choose a username." };
  }
  if (!input.normalizedEmail) {
    return { field: "email", message: "Enter your Aptiv email address." };
  }
  if (!isAllowedRegistrationEmail(input.normalizedEmail)) {
    return { field: "email", message: ALLOWED_EMAIL_ERROR_MESSAGE };
  }
  if (input.password.length < MIN_PASSWORD_LENGTH) {
    return {
      field: "password",
      message: `Use at least ${MIN_PASSWORD_LENGTH} characters.`,
    };
  }
  if (input.password !== input.confirmPassword) {
    return {
      field: "confirmPassword",
      message: "Passwords don’t match. Re-enter the same password.",
    };
  }
  if (input.requireInvitationCode && !input.invitationCode.trim()) {
    return {
      field: "invitationCode",
      message: "Enter the invitation code from your administrator.",
    };
  }
  return null;
}

export function validateVerificationCode(code: string): AuthFieldError | null {
  return /^\d{6}$/.test(code.trim())
    ? null
    : {
        field: "verificationCode",
        message: "Enter the 6-digit code from your email.",
      };
}
