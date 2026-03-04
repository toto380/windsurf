/**
 * Tests for src/core/data-contract.json schema structure
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const schema = require('../src/core/data-contract.json');

test('data-contract.json is valid JSON with correct type', () => {
  assert.equal(schema.type, 'object');
});

test('data-contract.json has required fields array', () => {
  assert.ok(Array.isArray(schema.required), 'required must be an array');
  assert.ok(schema.required.includes('module_id'), 'module_id required');
  assert.ok(schema.required.includes('version'), 'version required');
  assert.ok(schema.required.includes('inputs'), 'inputs required');
  assert.ok(schema.required.includes('observations'), 'observations required');
  assert.ok(schema.required.includes('issues'), 'issues required');
  assert.ok(schema.required.includes('metrics'), 'metrics required');
  assert.ok(schema.required.includes('score_contrib'), 'score_contrib required');
  assert.ok(schema.required.includes('recommendations'), 'recommendations required');
});

test('data-contract.json defines module_id as string', () => {
  assert.equal(schema.properties.module_id.type, 'string');
  assert.ok(schema.properties.module_id.minLength > 0, 'must have minLength');
});

test('data-contract.json defines version with semver pattern', () => {
  assert.equal(schema.properties.version.type, 'string');
  assert.ok(schema.properties.version.pattern, 'must have pattern');
  // Verify the pattern accepts semver
  const re = new RegExp(schema.properties.version.pattern);
  assert.ok(re.test('1.0.0'), '1.0.0 should match');
  assert.ok(!re.test('1.0'), '1.0 should not match');
});

test('data-contract.json defines issues as array with items schema', () => {
  assert.equal(schema.properties.issues.type, 'array');
  assert.ok(schema.properties.issues.items, 'items must exist');
  assert.ok(Array.isArray(schema.properties.issues.items.required), 'items.required must be array');
  assert.ok(schema.properties.issues.items.required.includes('id'), 'id required');
  assert.ok(schema.properties.issues.items.required.includes('title'), 'title required');
  assert.ok(schema.properties.issues.items.required.includes('severity'), 'severity required');
});

test('data-contract.json severity enum contains expected values', () => {
  const severityEnum = schema.properties.issues.items.properties.severity.enum;
  assert.ok(severityEnum.includes('critical'), 'critical');
  assert.ok(severityEnum.includes('high'), 'high');
  assert.ok(severityEnum.includes('medium'), 'medium');
  assert.ok(severityEnum.includes('low'), 'low');
  assert.ok(severityEnum.includes('info'), 'info');
});

test('data-contract.json score_contrib has weight and score', () => {
  const sc = schema.properties.score_contrib;
  assert.equal(sc.type, 'object');
  assert.ok(Array.isArray(sc.required), 'required must be array');
  assert.ok(sc.required.includes('weight'), 'weight required');
  assert.ok(sc.required.includes('score'), 'score required');
});

test('data-contract.json recommendations items have required fields', () => {
  const recs = schema.properties.recommendations;
  assert.equal(recs.type, 'array');
  const reqFields = recs.items.required;
  assert.ok(reqFields.includes('id'), 'id required');
  assert.ok(reqFields.includes('title'), 'title required');
  assert.ok(reqFields.includes('priority'), 'priority required');
});

test('data-contract.json priority enum contains now/next/later', () => {
  const priorityEnum = schema.properties.recommendations.items.properties.priority.enum;
  assert.ok(priorityEnum.includes('now'), 'now');
  assert.ok(priorityEnum.includes('next'), 'next');
  assert.ok(priorityEnum.includes('later'), 'later');
});

test('data-contract.json has scoring_criteria definition', () => {
  assert.ok(schema.definitions, 'definitions must exist');
  assert.ok(schema.definitions.scoring_criteria, 'scoring_criteria must exist');
  const props = schema.definitions.scoring_criteria.properties;
  assert.ok(props.infrastructure, 'infrastructure');
  assert.ok(props.ga4, 'ga4');
  assert.ok(props.ecommerce, 'ecommerce');
  assert.ok(props.gtm, 'gtm');
  assert.ok(props.server_side, 'server_side');
  assert.ok(props.ads, 'ads');
  assert.ok(props.data_quality, 'data_quality');
  assert.ok(props.business_reliability, 'business_reliability');
});
