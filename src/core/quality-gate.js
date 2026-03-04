/**
 * StratAds Quality Gate
 * Validates module outputs against the data contract schema,
 * checks completeness, coherence and deduplication.
 */

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

// Lazy-load contract schema
let _schema = null;
function getSchema() {
  if (!_schema) {
    _schema = require('./data-contract.json');
  }
  return _schema;
}

// ── Minimal JSON Schema validator (no external deps) ─────────────────────────

function validateJsonSchema(obj, schema) {
  const errors = [];

  if (!obj || typeof obj !== 'object') {
    errors.push('Output must be a non-null object');
    return errors;
  }

  const required = schema.required || [];
  for (const field of required) {
    if (obj[field] === undefined || obj[field] === null) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  const props = schema.properties || {};
  for (const [key, def] of Object.entries(props)) {
    const val = obj[key];
    if (val === undefined) continue;

    if (def.type === 'string' && typeof val !== 'string') {
      errors.push(`Field "${key}" must be a string`);
    } else if (def.type === 'array' && !Array.isArray(val)) {
      errors.push(`Field "${key}" must be an array`);
    } else if (def.type === 'object' && (typeof val !== 'object' || Array.isArray(val))) {
      errors.push(`Field "${key}" must be a plain object`);
    } else if (def.type === 'number' && typeof val !== 'number') {
      errors.push(`Field "${key}" must be a number`);
    } else if (def.type === 'boolean' && typeof val !== 'boolean') {
      errors.push(`Field "${key}" must be a boolean`);
    }

    if (def.type === 'string' && typeof val === 'string') {
      if (def.minLength !== undefined && val.length < def.minLength) {
        errors.push(`Field "${key}" too short (min ${def.minLength})`);
      }
      if (def.pattern && !new RegExp(def.pattern).test(val)) {
        errors.push(`Field "${key}" does not match pattern ${def.pattern}`);
      }
      if (def.enum && !def.enum.includes(val)) {
        errors.push(`Field "${key}" must be one of: ${def.enum.join(', ')}`);
      }
    }

    if (def.type === 'number' && typeof val === 'number') {
      if (def.minimum !== undefined && val < def.minimum) {
        errors.push(`Field "${key}" below minimum ${def.minimum}`);
      }
      if (def.maximum !== undefined && val > def.maximum) {
        errors.push(`Field "${key}" above maximum ${def.maximum}`);
      }
    }

    if (def.type === 'array' && Array.isArray(val) && def.items) {
      for (let i = 0; i < val.length; i++) {
        const itemErrors = validateJsonSchema(val[i], def.items);
        for (const e of itemErrors) {
          errors.push(`${key}[${i}]: ${e}`);
        }
      }
    }
  }

  return errors;
}

// ── Completeness check ────────────────────────────────────────────────────────

function checkCompleteness(output) {
  const warnings = [];

  if (!output.observations || output.observations.length === 0) {
    warnings.push('No observations provided — module may lack evidence');
  }
  if (!output.issues || output.issues.length === 0) {
    warnings.push('No issues found — verify module ran correctly');
  }
  if (!output.recommendations || output.recommendations.length === 0) {
    warnings.push('No recommendations provided');
  }
  if (typeof output.score_contrib?.score !== 'number') {
    warnings.push('score_contrib.score missing');
  }

  return warnings;
}

// ── Coherence check ───────────────────────────────────────────────────────────

function checkCoherence(output) {
  const errors = [];

  const sc = output.score_contrib || {};
  if (!sc.skipped && typeof sc.score === 'number') {
    if (sc.score < 0 || sc.score > 100) {
      errors.push(`score_contrib.score out of range: ${sc.score}`);
    }
  }
  if (typeof sc.weight === 'number' && (sc.weight < 0 || sc.weight > 1)) {
    errors.push(`score_contrib.weight out of range: ${sc.weight}`);
  }

  if (Array.isArray(output.issues)) {
    for (const issue of output.issues) {
      if (issue.confidence !== undefined && (issue.confidence < 0 || issue.confidence > 1)) {
        errors.push(`Issue "${issue.id}": confidence ${issue.confidence} out of [0,1]`);
      }
    }
  }

  return errors;
}

// ── Deduplication check ───────────────────────────────────────────────────────

function checkDeduplication(output) {
  const warnings = [];

  if (Array.isArray(output.issues)) {
    const ids = output.issues.map(i => i.id);
    const seen = new Set();
    for (const id of ids) {
      if (seen.has(id)) {
        warnings.push(`Duplicate issue id: "${id}"`);
      }
      seen.add(id);
    }
  }

  if (Array.isArray(output.recommendations)) {
    const ids = output.recommendations.map(r => r.id);
    const seen = new Set();
    for (const id of ids) {
      if (seen.has(id)) {
        warnings.push(`Duplicate recommendation id: "${id}"`);
      }
      seen.add(id);
    }
  }

  return warnings;
}

// ── Private data guard ────────────────────────────────────────────────────────

const PRIVATE_PATTERNS = [
  /-----BEGIN (RSA )?PRIVATE KEY-----/,
  /"private_key"\s*:\s*"-----BEGIN/,
  /client_secret/i,
  /\bsk-[A-Za-z0-9]{20,}\b/,
];

function checkPrivacySafety(output) {
  const errors = [];
  const str = JSON.stringify(output);
  for (const re of PRIVATE_PATTERNS) {
    if (re.test(str)) {
      errors.push(`Potential secret detected matching pattern: ${re.source}`);
    }
  }
  return errors;
}

// ── Main validate function ────────────────────────────────────────────────────

/**
 * Validate a module output against the data contract.
 *
 * @param {object} output - Module output object
 * @returns {{ valid: boolean, errors: string[], warnings: string[] }}
 */
export function validateModuleOutput(output) {
  // validateJsonSchema already handles null/invalid objects, but coherence and privacy
  // checks need a non-null object to function safely.
  const schema = getSchema();
  const schemaErrors = validateJsonSchema(output, schema);

  if (!output || typeof output !== 'object') {
    return { valid: false, errors: schemaErrors, warnings: [] };
  }

  const coherenceErrors = checkCoherence(output);
  const privacyErrors = checkPrivacySafety(output);

  const errors = [...schemaErrors, ...coherenceErrors, ...privacyErrors];
  const warnings = [
    ...checkCompleteness(output),
    ...checkDeduplication(output),
  ];

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Check if private mode is allowed given the provided inputs.
 * Returns { allowed: boolean, missing: string[] }
 *
 * @param {object} params - Audit params from the orchestrator
 * @param {'private_only'|'public_private'} mode
 */
export function checkPrivatePreconditions(params, mode) {
  const missing = [];

  if (mode === 'private_only' || mode === 'public_private') {
    const needsGoogle = params?.reportModules?.privateGoogle;
    const needsAds = params?.reportModules?.privateAds;

    if (needsGoogle) {
      if (!params?.serviceAccountJsonPath) {
        missing.push('serviceAccountJsonPath (Google service account JSON required for private Google access)');
      }
      if (!params?.ga4PropertyId && !params?.gscSiteUrl) {
        missing.push('ga4PropertyId or gscSiteUrl (at least one Google property required)');
      }
    }

    if (needsAds) {
      const hasAds = Array.isArray(params?.adsExportPaths) && params.adsExportPaths.length > 0;
      const hasMeta = Array.isArray(params?.metaAdsExportPaths) && params.metaAdsExportPaths.length > 0;
      if (!hasAds && !hasMeta) {
        missing.push('adsExportPaths or metaAdsExportPaths (at least one Ads export file required)');
      }
    }
  }

  return { allowed: missing.length === 0, missing };
}

/**
 * Validate all module outputs in an audit result object.
 *
 * @param {object} auditResults - Full audit results object with .modules
 * @returns {{ valid: boolean, moduleResults: object }}
 */
export function validateAllModules(auditResults) {
  const modules = auditResults?.modules || {};
  const moduleResults = {};
  let allValid = true;

  for (const [key, output] of Object.entries(modules)) {
    if (!output || output.skipped) {
      moduleResults[key] = { valid: true, skipped: true, errors: [], warnings: [] };
      continue;
    }
    // Only validate outputs that follow the data contract (have module_id)
    if (!output.module_id) {
      moduleResults[key] = { valid: true, legacy: true, errors: [], warnings: [] };
      continue;
    }
    const result = validateModuleOutput(output);
    moduleResults[key] = result;
    if (!result.valid) allValid = false;
  }

  return { valid: allValid, moduleResults };
}
