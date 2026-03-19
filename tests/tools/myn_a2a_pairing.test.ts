/**
 * Tests for myn_a2a_pairing tool — BP5: invite code and agent name validation
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { myn_a2a_pairing } from '../../src/tools/myn_a2a_pairing.js';

describe('myn_a2a_pairing — input validation (BP5)', () => {
  beforeEach(() => {
    // Replace global fetch with a mock
    globalThis.fetch = vi.fn();
  });

  describe('redeem_invite action — inviteCode format', () => {
    it('should return error if inviteCode and agentName are both missing', async () => {
      const result = await myn_a2a_pairing({
        action: 'redeem_invite',
        baseUrl: 'https://api.mindyournow.com'
      });

      expect((result as { success: boolean }).success).toBe(false);
      expect(JSON.stringify(result)).toContain('inviteCode');
    });

    it('should reject an inviteCode not matching ABC-12345 format', async () => {
      const result = await myn_a2a_pairing({
        action: 'redeem_invite',
        baseUrl: 'https://api.mindyournow.com',
        inviteCode: 'bad-code',
        agentName: 'openclaw'
      });

      expect((result as { success: boolean }).success).toBe(false);
      expect(JSON.stringify(result)).toContain('inviteCode');
    });

    it('should reject an inviteCode with lowercase letters', async () => {
      const result = await myn_a2a_pairing({
        action: 'redeem_invite',
        baseUrl: 'https://api.mindyournow.com',
        inviteCode: 'abc-12345',
        agentName: 'openclaw'
      });

      expect((result as { success: boolean }).success).toBe(false);
    });

    it('should reject an inviteCode with wrong digit count', async () => {
      const result = await myn_a2a_pairing({
        action: 'redeem_invite',
        baseUrl: 'https://api.mindyournow.com',
        inviteCode: 'ABC-1234',
        agentName: 'openclaw'
      });

      expect((result as { success: boolean }).success).toBe(false);
    });
  });

  describe('redeem_invite action — agentName format', () => {
    it('should reject an agentName with uppercase letters', async () => {
      const result = await myn_a2a_pairing({
        action: 'redeem_invite',
        baseUrl: 'https://api.mindyournow.com',
        inviteCode: 'ABC-12345',
        agentName: 'OpenClaw'
      });

      expect((result as { success: boolean }).success).toBe(false);
      expect(JSON.stringify(result)).toContain('agentName');
    });

    it('should reject an agentName with spaces', async () => {
      const result = await myn_a2a_pairing({
        action: 'redeem_invite',
        baseUrl: 'https://api.mindyournow.com',
        inviteCode: 'ABC-12345',
        agentName: 'open claw'
      });

      expect((result as { success: boolean }).success).toBe(false);
    });

    it('should accept a valid inviteCode and agentName and call the API', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ agentKey: 'ak_test123', status: 'paired' })
      });

      const result = await myn_a2a_pairing({
        action: 'redeem_invite',
        baseUrl: 'https://api.mindyournow.com',
        inviteCode: 'ABC-12345',
        agentName: 'openclaw'
      });

      expect((result as { success: boolean }).success).toBe(true);
    });
  });
});
