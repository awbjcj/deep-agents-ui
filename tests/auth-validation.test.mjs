import assert from "node:assert/strict";
import test from "node:test";
import {
  MIN_PASSWORD_LENGTH,
  validateLogin,
  validateRegistration,
  validateVerificationCode,
} from "../src/lib/auth-validation.ts";
import { ALLOWED_EMAIL_ERROR_MESSAGE } from "../src/lib/email.ts";

const registration = (overrides = {}) => ({
  username: "first.last",
  normalizedEmail: "first.last@aptiv.com",
  password: "correct-horse",
  confirmPassword: "correct-horse",
  invitationCode: "",
  requireInvitationCode: false,
  ...overrides,
});

test("login requires a username and a non-blank password", () => {
  assert.equal(validateLogin({ username: "a", password: "b" }), null);
  assert.equal(
    validateLogin({ username: "  ", password: "b" }),
    "Username and password are required"
  );
  assert.equal(
    validateLogin({ username: "a", password: "   " }),
    "Username and password are required"
  );
});

test("registration reports the first failing rule in order", () => {
  assert.equal(validateRegistration(registration()), null);
  assert.equal(
    validateRegistration(registration({ normalizedEmail: "" })),
    "Username, Aptiv email, and password are required"
  );
  assert.equal(
    validateRegistration(registration({ normalizedEmail: "x@gmail.com" })),
    ALLOWED_EMAIL_ERROR_MESSAGE
  );
  assert.equal(
    validateRegistration(registration({ confirmPassword: "different" })),
    "Passwords do not match"
  );
  const short = "a".repeat(MIN_PASSWORD_LENGTH - 1);
  assert.equal(
    validateRegistration(
      registration({ password: short, confirmPassword: short })
    ),
    `Password must be at least ${MIN_PASSWORD_LENGTH} characters`
  );
});

test("registration requires an invitation code only when policy demands it", () => {
  assert.equal(
    validateRegistration(registration({ requireInvitationCode: true })),
    "An invitation code is required to register"
  );
  assert.equal(
    validateRegistration(
      registration({ requireInvitationCode: true, invitationCode: " INV-1 " })
    ),
    null
  );
});

test("verification codes must be exactly six digits", () => {
  assert.equal(validateVerificationCode("123456"), null);
  assert.equal(validateVerificationCode(" 123456 "), null);
  for (const bad of ["", "12345", "1234567", "12a456"]) {
    assert.equal(
      validateVerificationCode(bad),
      "Enter the 6-digit code from your email"
    );
  }
});
