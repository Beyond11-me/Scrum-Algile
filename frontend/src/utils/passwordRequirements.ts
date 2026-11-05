export type PasswordRequirement = { key: string; label: string; met: boolean };

/** Keep these checks aligned with the account policies enforced by the API. */
export function passwordRequirements(password: string, policy: "self" | "admin"): PasswordRequirement[] {
  const length = Array.from(password).length;
  const requirements = [{ key: "length", label: "8–64 characters", met: length >= 8 && length <= 64 }];
  if (policy === "self") {
    requirements.push(
      { key: "uppercase", label: "At least one uppercase letter", met: /[A-Z]/.test(password) },
      { key: "lowercase", label: "At least one lowercase letter", met: /[a-z]/.test(password) },
      { key: "digit", label: "At least one digit", met: /\p{Decimal_Number}/u.test(password) },
      { key: "symbol", label: "At least one symbol", met: /[^A-Za-z0-9]/.test(password) },
    );
  }
  return requirements;
}
