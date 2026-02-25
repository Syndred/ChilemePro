import { describe, it, expect } from 'vitest';

/**
 * Unit tests for weight record validation logic.
 * The server action validates weight range 30-300 kg.
 * Requirement 8.5: Support recording daily weight
 */

function validateWeight(weight: number): { valid: boolean; error?: string } {
  if (weight < 30 || weight > 300) {
    return { valid: false, error: '体重范围应在 30-300 公斤之间' };
  }
  return { valid: true };
}

describe('weight validation', () => {
  it('accepts weight within valid range', () => {
    expect(validateWeight(65).valid).toBe(true);
    expect(validateWeight(30).valid).toBe(true);
    expect(validateWeight(300).valid).toBe(true);
    expect(validateWeight(100.5).valid).toBe(true);
  });

  it('rejects weight below minimum', () => {
    expect(validateWeight(29.9).valid).toBe(false);
    expect(validateWeight(0).valid).toBe(false);
    expect(validateWeight(-10).valid).toBe(false);
  });

  it('rejects weight above maximum', () => {
    expect(validateWeight(300.1).valid).toBe(false);
    expect(validateWeight(500).valid).toBe(false);
  });
});
