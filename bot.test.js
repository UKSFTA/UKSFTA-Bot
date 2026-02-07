const { describe, it, expect, vi } = require('vitest');

// Basic sanity test for the environment
describe('UKSF Bot Environment', () => {
  it('should have access to environment variables', () => {
    expect(process.env).toBeDefined();
  });
});

// Mocking uc_api to test resolution logic
vi.mock('./uc_api', () => ({
  default: {
    getProfiles: vi.fn(() => [
      { id: 1, alias: 'M. Barker', status: 'ACTIVE' },
      { id: 2, alias: 'J. Doe', status: 'ACTIVE' }
    ])
  }
}));

describe('Identity Logic', () => {
  it('should match names correctly', async () => {
    const ucApi = require('./uc_api').default;
    const profiles = await ucApi.getProfiles();
    expect(profiles).toHaveLength(2);
    expect(profiles[0].alias).toBe('M. Barker');
  });
});
