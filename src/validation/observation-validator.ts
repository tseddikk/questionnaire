/**
 * Observation Validator
 * 
 * Validates observation logs for file citations.
 * Every observation must reference at least one file.
 */

import type { ObservationLog } from '../types/domain.js';
import { MissingFileCitationError } from '../state/errors.js';

// ============================================================================
// Validation Types
// ============================================================================

export interface ObservationValidationError {
  type: string;
  index: number;
  message: string;
}

export interface ObservationValidationResult {
  valid: boolean;
  errors: ObservationValidationError[];
}

// ============================================================================
// Validation Logic
// ============================================================================

/**
 * Validate that an array of observations each have file paths
 */
function validateObservationArray<T extends { file_path: string }>(
  items: T[],
  type: string
): ObservationValidationError[] {
  const errors: ObservationValidationError[] = [];
  
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item.file_path || item.file_path.length === 0) {
      errors.push({
        type,
        index: i,
        message: `${type}[${i}] is missing file_path`,
      });
    }
  }
  
  return errors;
}

/**
 * Validate data flows have at least one file path
 */
function validateDataFlows(
  dataFlows: { file_paths: string[] }[]
): ObservationValidationError[] {
  const errors: ObservationValidationError[] = [];
  
  for (let i = 0; i < dataFlows.length; i++) {
    const flow = dataFlows[i];
    if (!flow.file_paths || flow.file_paths.length === 0) {
      errors.push({
        type: 'data_flows',
        index: i,
        message: `data_flows[${i}] must have at least one file_path in file_paths array`,
      });
    }
  }
  
  return errors;
}

/**
 * Validate a complete observation log
 */
export function validateObservations(
  observations: ObservationLog
): ObservationValidationResult {
  const errors: ObservationValidationError[] = [];
  
  // Validate tech_stack
  errors.push(...validateObservationArray(observations.tech_stack, 'tech_stack'));
  
  // Validate entry_points
  errors.push(...validateObservationArray(observations.entry_points, 'entry_points'));
  
  // Validate data_flows (special handling for file_paths array)
  errors.push(...validateDataFlows(observations.data_flows));
  
  // Validate auth_mechanisms
  errors.push(...validateObservationArray(observations.auth_mechanisms, 'auth_mechanisms'));
  
  // Validate error_patterns
  errors.push(...validateObservationArray(observations.error_patterns, 'error_patterns'));
  
  // Validate test_coverage
  errors.push(...validateObservationArray(observations.test_coverage, 'test_coverage'));
  
  // Validate config_secrets
  errors.push(...validateObservationArray(observations.config_secrets, 'config_secrets'));
  
  // Validate deployment
  errors.push(...validateObservationArray(observations.deployment, 'deployment'));
  
  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Throw if observations are invalid
 */
export function assertObservationsValid(
  result: ObservationValidationResult
): asserts result is { valid: true; errors: [] } {
  if (!result.valid) {
    const firstError = result.errors[0];
    throw new MissingFileCitationError('submit_observations', firstError.type, firstError.index);
  }
}

/**
 * Get a human-readable error message for validation failures
 */
export function getObservationValidationMessage(
  result: ObservationValidationResult
): string {
  if (result.valid) {
    return 'All observations are valid.';
  }
  
  const errorMessages = result.errors.map(
    e => `- ${e.type}[${e.index}]: ${e.message}`
  );
  
  return `Observation validation failed:\n${errorMessages.join('\n')}`;
}
