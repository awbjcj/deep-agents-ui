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

const fieldOf = (result) => result?.field ?? null;

test("login points at the first empty field", () => {
  assert.equal(validateLogin({ username: "a", password: "b" }), null);
  assert.equal(
    fieldOf(validateLogin({ username: "  ", password: "" })),
    "username"
  );
  assert.equal(
    fieldOf(validateLogin({ username: "a", password: "   " })),
    "password"
  );
});

test("registration reports the first failing field in visual order", () => {
  assert.equal(validateRegistration(registration()), null);
  assert.equal(
    fieldOf(validateRegistration(registration({ username: " " }))),
    "username"
  );
  assert.equal(
    fieldOf(validateRegistration(registration({ normalizedEmail: "" }))),
    "email"
  );
  assert.deepEqual(
    validateRegistration(registration({ normalizedEmail: "x@gmail.com" })),
    { field: "email", message: ALLOWED_EMAIL_ERROR_MESSAGE }
  );
  const short = "a".repeat(MIN_PASSWORD_LENGTH - 1);
  assert.equal(
    fieldOf(
      validateRegistration(
        registration({ password: short, confirmPassword: short })
      )
    ),
    "password"
  );
  assert.equal(
    fieldOf(
      validateRegistration(registration({ confirmPassword: "different" }))
    ),
    "confirmPassword"
  );
});

test("registration requires an invitation code only when policy demands it", () => {
  assert.equal(
    fieldOf(
      validateRegistration(registration({ requireInvitationCode: true }))
    ),
    "invitationCode"
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
    assert.equal(fieldOf(validateVerificationCode(bad)), "verificationCode");
  }
});
