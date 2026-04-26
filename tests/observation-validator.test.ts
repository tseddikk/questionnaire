/**
 * Observation Validator Tests
 */

import { describe, it, expect } from 'vitest';
import { validateObservations } from '../src/validation/observation-validator.js';
import type { ObservationLog } from '../src/types/domain.js';

describe('Observation Validator', () => {
  it('should accept valid observations', () => {
    const observations: ObservationLog = {
      purpose: 'Test application',
      tech_stack: [{ name: 'React', version: '18.0.0', file_path: '/package.json' }],
      entry_points: [{ type: 'Component', location: 'App.tsx', file_path: '/src/App.tsx' }],
      data_flows: [{ 
        source: 'API', 
        destination: 'Store', 
        transformation: 'JSON parsing', 
        file_paths: ['/src/api.ts'] 
      }],
      auth_mechanisms: [{ mechanism: 'JWT', location: 'AuthProvider', file_path: '/src/auth.tsx' }],
      error_patterns: [{ pattern: 'Console.error', handling: 'Logged', file_path: '/src/utils.ts' }],
      test_coverage: [{ component: 'Button', coverage: '80%', file_path: '/src/Button.test.tsx' }],
      config_secrets: [{ key: 'API_KEY', location: '.env', file_path: '/.env.example' }],
      deployment: [{ aspect: 'Docker', detail: 'Containerized', file_path: '/Dockerfile' }],
    };

    const result = validateObservations(observations);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should reject observations with missing file citations', () => {
    const observations: ObservationLog = {
      purpose: 'Test application',
      tech_stack: [{ name: 'React', version: '18.0.0', file_path: '' }],
      entry_points: [],
      data_flows: [],
      auth_mechanisms: [],
      error_patterns: [],
      test_coverage: [],
      config_secrets: [],
      deployment: [],
    };

    const result = validateObservations(observations);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].type).toBe('tech_stack');
  });

  it('should reject data flows without file_paths', () => {
    const observations: ObservationLog = {
      purpose: 'Test application',
      tech_stack: [],
      entry_points: [],
      data_flows: [{ 
        source: 'API', 
        destination: 'Store', 
        transformation: 'JSON parsing', 
        file_paths: [] 
      }],
      auth_mechanisms: [],
      error_patterns: [],
      test_coverage: [],
      config_secrets: [],
      deployment: [],
    };

    const result = validateObservations(observations);
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].type).toBe('data_flows');
  });

  it('should validate all observation types', () => {
    const observations: ObservationLog = {
      purpose: 'Test application',
      tech_stack: [{ name: 'React', version: '18.0.0', file_path: '/package.json' }],
      entry_points: [{ type: 'Component', location: 'App.tsx', file_path: '/src/App.tsx' }],
      data_flows: [{ 
        source: 'API', 
        destination: 'Store', 
        transformation: 'JSON parsing', 
        file_paths: ['/src/api.ts'] 
      }],
      auth_mechanisms: [{ mechanism: 'JWT', location: 'AuthProvider', file_path: '/src/auth.tsx' }],
      error_patterns: [{ pattern: 'Console.error', handling: 'Logged', file_path: '/src/utils.ts' }],
      test_coverage: [{ component: 'Button', coverage: '80%', file_path: '/src/Button.test.tsx' }],
      config_secrets: [{ key: 'API_KEY', location: '.env', file_path: '/.env.example' }],
      deployment: [{ aspect: 'Docker', detail: 'Containerized', file_path: '/Dockerfile' }],
    };

    const result = validateObservations(observations);
    expect(result.valid).toBe(true);
  });
});
