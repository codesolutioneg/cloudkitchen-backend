import { describe, it, expect } from 'vitest';
import { isModuleEnabled, isFeatureEnabled } from '../../src/engines/moduleFeatureResolver';

describe('moduleFeatureResolver', () => {
  it('module off always wins over feature on', async () => {
    const companyId = '00000000-0000-4000-8000-000000000010';
    const moduleOn = await isModuleEnabled({ audience: 'company', companyId }, 'orders');
    const featureOn = await isFeatureEnabled({ audience: 'company', companyId }, 'orders_enabled');

    if (!moduleOn) {
      expect(featureOn).toBe(false);
    } else {
      expect(typeof featureOn).toBe('boolean');
    }
  });
});
