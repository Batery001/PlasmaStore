export const PASSWORD_MIN_LENGTH = 8;

/**
 * @param {string} password
 */
export function getPasswordRules(password) {
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

/**
 * @param {string} password
 */
export function isPasswordStrong(password) {
  return getPasswordRules(password).every((r) => r.ok);
}

/**
 * @param {string} password
 */
export function passwordValidationError(password) {
  const failed = getPasswordRules(password).find((r) => !r.ok);
  if (!failed) return null;
  return `La contraseña no cumple: ${failed.label.toLowerCase()}.`;
}
