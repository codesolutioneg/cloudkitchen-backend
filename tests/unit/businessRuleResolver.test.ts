import { describe, it, expect } from 'vitest';
import { businessRuleResolver } from '../../src/engines/businessRuleResolver';

describe('businessRuleResolver', () => {
  it('returns null for unknown rule type', async () => {
    const value = await businessRuleResolver.resolve({
      ruleTypeCode: `nonexistent_rule_${Date.now()}`,
      companyId: '00000000-0000-4000-8000-000000000099',
    });
    expect(value).toBeNull();
  });
});
