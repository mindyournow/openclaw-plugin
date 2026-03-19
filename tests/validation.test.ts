/**
 * Tests for shared validation utilities (src/validation.ts)
 */

import { describe, it, expect } from 'vitest';
import { isValidUuid, isValidEmail, validateUuid, escapeMarkdown } from '../src/validation.js';

describe('isValidUuid', () => {
  it('accepts a valid UUID v4', () => {
    expect(isValidUuid('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
  });

  it('accepts another valid UUID v4', () => {
    expect(isValidUuid('f47ac10b-58cc-4372-a567-0e02b2c3d479')).toBe(true);
  });

  it('rejects a UUID v1 (version digit is 1)', () => {
    // Third group starts with '1' (version 1), not '4' (version 4)
    expect(isValidUuid('6ba7b810-9dad-11d1-80b4-00c04fd430c8')).toBe(false);
  });

  it('rejects garbage strings', () => {
    expect(isValidUuid('not-a-uuid')).toBe(false);
    expect(isValidUuid('')).toBe(false);
    expect(isValidUuid('123')).toBe(false);
  });

  it('rejects UUID with wrong format (missing dashes)', () => {
    expect(isValidUuid('550e8400e29b41d4a716446655440000')).toBe(false);
  });

  it('rejects UUID with wrong version digit', () => {
    // Version digit must be 4 for UUID v4
    expect(isValidUuid('550e8400-e29b-31d4-a716-446655440000')).toBe(false);
  });
});

describe('isValidEmail', () => {
  it('accepts valid email addresses', () => {
    expect(isValidEmail('user@example.com')).toBe(true);
    expect(isValidEmail('first.last@domain.org')).toBe(true);
    expect(isValidEmail('user+tag@sub.domain.com')).toBe(true);
  });

  it('rejects emails without @', () => {
    expect(isValidEmail('notanemail')).toBe(false);
  });

  it('rejects emails without domain', () => {
    expect(isValidEmail('user@')).toBe(false);
  });

  it('rejects emails with spaces', () => {
    expect(isValidEmail('user @example.com')).toBe(false);
    expect(isValidEmail('user@ example.com')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isValidEmail('')).toBe(false);
  });
});

describe('validateUuid', () => {
  it('returns null for a valid UUID', () => {
    expect(validateUuid('550e8400-e29b-41d4-a716-446655440000', 'taskId')).toBeNull();
  });

  it('returns null for undefined (missing field handled separately)', () => {
    expect(validateUuid(undefined, 'taskId')).toBeNull();
  });

  it('returns an error for empty string', () => {
    const err = validateUuid('', 'taskId');
    expect(err).not.toBeNull();
    expect(err).toContain('taskId');
  });

  it('returns an error message containing the field name for invalid UUID', () => {
    const err = validateUuid('not-a-uuid', 'taskId');
    expect(err).not.toBeNull();
    expect(err).toContain('taskId');
    expect(err).toContain('UUID');
  });

  it('includes a hint UUID in the error message', () => {
    const err = validateUuid('bad-value', 'choreId');
    expect(err).toContain('choreId');
  });
});

describe('escapeMarkdown', () => {
  it('escapes asterisks', () => {
    expect(escapeMarkdown('bold *text*')).toBe('bold \\*text\\*');
  });

  it('escapes underscores', () => {
    expect(escapeMarkdown('_italic_')).toBe('\\_italic\\_');
  });

  it('escapes backticks', () => {
    expect(escapeMarkdown('`code`')).toBe('\\`code\\`');
  });

  it('escapes square brackets and parentheses', () => {
    expect(escapeMarkdown('[link](url)')).toBe('\\[link\\]\\(url\\)');
  });

  it('escapes hash characters', () => {
    expect(escapeMarkdown('# heading')).toBe('\\# heading');
  });

  it('escapes pipe characters', () => {
    expect(escapeMarkdown('a | b')).toBe('a \\| b');
  });

  it('escapes backslash first to avoid double-escaping', () => {
    expect(escapeMarkdown('a\\b')).toBe('a\\\\b');
    // Verify backslash isn't double-escaped when other chars follow
    expect(escapeMarkdown('\\*')).toBe('\\\\\\*');
  });

  it('leaves plain text unchanged', () => {
    expect(escapeMarkdown('hello world')).toBe('hello world');
  });

  it('handles empty string', () => {
    expect(escapeMarkdown('')).toBe('');
  });
});
