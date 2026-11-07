import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SCENARIOS, validateScenario } from '../src/scenarios.mjs';

test('built-in scenarios validate and have unique ids', () => {
  const ids = new Set();
  for (const scenario of DEFAULT_SCENARIOS) {
    const valid = validateScenario(scenario);
    assert.equal(valid.id, scenario.id);
    assert.equal(ids.has(valid.id), false);
    ids.add(valid.id);
  }
});

test('scenario rejects external goto paths', () => {
  assert.throws(() => validateScenario({
    id: 'bad-route', name: 'Bad', steps: [{ type: 'goto', value: 'https://evil.example' }]
  }));
});

test('scenario rejects unknown executable step types', () => {
  assert.throws(() => validateScenario({
    id: 'bad-step', name: 'Bad', steps: [{ type: 'evaluate', code: 'process.exit(1)' }]
  }));
});

test('scenario rejects destructive-risk typo', () => {
  assert.throws(() => validateScenario({
    id: 'bad-risk', name: 'Bad', steps: [{ type: 'click', selector: '#remove', risk: 'danger' }]
  }));
});


test('accessible-role actions validate required role and accessible name', () => {
  assert.doesNotThrow(() => validateScenario({
    id: 'semantic-search', name: 'Semantic search', writes: false,
    steps: [{ type: 'fillRole', role: 'searchbox', name: 'بحث', value: 'سيارة' }]
  }));
  assert.throws(() => validateScenario({
    id: 'missing-role', name: 'Missing role', steps: [{ type: 'clickRole', name: 'حفظ' }]
  }), /accessible role/);
});

test('upload steps are restricted to fixture filenames and write-enabled scenarios', () => {
  assert.throws(() => validateScenario({
    id: 'unsafe-upload', name: 'Unsafe upload', writes: true,
    steps: [{ type: 'upload', selector: '#image', file: '../secret.png' }]
  }), /fixture filename/);
  assert.throws(() => validateScenario({
    id: 'read-only-upload', name: 'Read-only upload', writes: false,
    steps: [{ type: 'upload', selector: '#image', file: 'sample.png' }]
  }), /writes=true/);
});


test('built-in discovery scenario performs a real accessible search interaction', () => {
  const scenario = DEFAULT_SCENARIOS.find(item => item.id === 'search-and-discovery');
  assert.ok(scenario);
  assert.ok(scenario.steps.some(step => step.type === 'fillRole' && step.role === 'searchbox'));
  assert.ok(scenario.steps.some(step => step.type === 'pressRole' && step.value === 'Enter'));
});


test('dialog role clicks, optional actions, and QA ad publish journey validate', () => {
  const savedSearch = DEFAULT_SCENARIOS.find(item => item.id === 'create-test-saved-search');
  assert.ok(savedSearch?.steps.some(step => step.type === 'clickDialogRole'));
  const sellerAd = DEFAULT_SCENARIOS.find(item => item.id === 'create-test-ad');
  assert.equal(sellerAd?.accountRole, 'seller');
  assert.equal(sellerAd?.writes, true);
  assert.ok(sellerAd?.steps.some(step => step.type === 'selectFirstOption'));
  const optional = DEFAULT_SCENARIOS.find(item => item.id === 'favorite-test-ad');
  assert.ok(optional?.steps.some(step => step.type === 'clickRole' && step.optional === true));
  assert.throws(() => validateScenario({
    id: 'invalid-role', name: 'Invalid role', accountRole: 'admin',
    steps: [{ type: 'goto', value: '/' }]
  }), /accountRole/);
});
