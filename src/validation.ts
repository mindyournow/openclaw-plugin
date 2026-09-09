/**
 * Shared validation utilities for the MYN OpenClaw plugin.
 * Provides UUID format validation, email validation, and other input helpers.
 */

/** UUID-like pattern — accepts any hyphenated hex string, not just strict v4.
 *  MYN has legacy task IDs with non-standard lengths and version nibbles. */
const UUID_REGEX = /^[0-9a-f]+-[0-9a-f]+-[0-9a-f]+-[0-9a-f]+-[0-9a-f]+$/i;

/** Basic email format check */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Returns true if value is a valid UUID v4.
 */
export function isValidUuid(value: string): boolean {
  return UUID_REGEX.test(value);
}

/**
 * Returns true if value is a valid email address.
 */
export function isValidEmail(value: string): boolean {
  return EMAIL_REGEX.test(value);
}

/**
 * Validate that a UUID field is valid. Returns an error string, or null if valid.
 */
export function validateUuid(value: string | undefined, fieldName: string): string | null {
  if (value === undefined || value === null) return null; // missing is checked separately
  if (value === '') return `Invalid ${fieldName}: must not be empty`;
  if (!isValidUuid(value)) {
    return `Invalid ${fieldName}: must be a valid UUID (e.g. "550e8400-e29b-41d4-a716-446655440000")`;
  }
  return null;
}

/**
 * Escapes special markdown characters in a user-supplied string.
 * Used to prevent markdown injection in generated documents.
 */
export function escapeMarkdown(text: string): string {
  // Escape backslash first, then special markdown characters
  return text
    .replace(/\\/g, '\\\\')
    .replace(/[*_~`[\]()#+\-!|]/g, '\\$&');
}
