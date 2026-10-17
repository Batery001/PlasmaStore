export const PASSWORD_MIN_LENGTH = 8;

export type PasswordRuleId = "length" | "number" | "special" | "upper";

export type PasswordRule = {
  id: PasswordRuleId;
  label: string;
  ok: boolean;
};

export function getPasswordRules(password: string): PasswordRule[] {
  const value = String(password || "");
  return [
    {
      id: "length",
      label: `Al menos ${PASSWORD_MIN_LENGTH} caracteres`,
      ok: value.length >= PASSWORD_MIN_LENGTH,
    },
    {
      id: "upper",
      label: "Al menos una letra mayúscula",
      ok: /[A-ZÁÉÍÓÚÑÜ]/.test(value),
    },
    {
      id: "number",
      label: "Al menos un número",
      ok: /\d/.test(value),
    },
    {
      id: "special",
      label: "Al menos un carácter especial (!@#$%…)",
      ok: /[^A-Za-zÁÉÍÓÚÑÜáéíóúñü0-9\s]/.test(value),
    },
  ];
}

export function isPasswordStrong(password: string): boolean {
  return getPasswordRules(password).every((r) => r.ok);
}

export function passwordValidationError(password: string): string | null {
  const failed = getPasswordRules(password).find((r) => !r.ok);
  if (!failed) return null;
  return `La contraseña no cumple: ${failed.label.toLowerCase()}.`;
}
