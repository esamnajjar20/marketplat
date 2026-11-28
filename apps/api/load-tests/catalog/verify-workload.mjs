#!/usr/bin/env node
/** Static validation for the generated route inventory and editable workload config. */
import routeInventory from './route-inventory.js';
import workload from '../config/workload.config.js';

const errors = [];
const validMethods = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
const byId = new Map();
for (const route of routeInventory) {
  if (!validMethods.has(route.method)) errors.push(`${route.id}: unsupported HTTP method`);
  if (!route.path.startsWith('/')) errors.push(`${route.id}: route path must start with /`);
  if (byId.has(route.id)) errors.push(`${route.id}: duplicate route id`);
  byId.set(route.id, route);
}

for (const [id, config] of Object.entries(workload.operations || {})) {
  const route = byId.get(id);
  if (!route) {
    errors.push(`${id}: operation override does not match an Express route`);
    continue;
  }
  if (config.enabled !== undefined && typeof config.enabled !== 'boolean') {
    errors.push(`${id}: enabled must be a boolean`);
  }
  const configuredParams = new Set(Object.keys(config.params || {}));
  for (const name of route.pathParams || []) {
    if (!configuredParams.has(name) && !Object.hasOwn(workload.globalParams || {}, name)) {
      // Path parameters without values are allowed; the runner reports them as skipped.
      continue;
    }
  }
  if (config.expectedStatuses && (!Array.isArray(config.expectedStatuses) || config.expectedStatuses.some(status => !Number.isInteger(status) || status < 100 || status > 599))) {
    errors.push(`${id}: expectedStatuses must be HTTP status codes`);
  }
  if (config.bodyType === 'multipart') {
    for (const file of config.body?.files || []) {
      if (!file.path) errors.push(`${id}: multipart file is missing its path`);
    }
  }
}

if (workload.globalHeaders !== undefined && (typeof workload.globalHeaders !== 'object' || Array.isArray(workload.globalHeaders) || workload.globalHeaders === null)) {
  errors.push('globalHeaders must be an object of HTTP header names and values');
}

for (const [group, config] of Object.entries(workload.groups || {})) {
  if (!routeInventory.some(route => route.group === group)) errors.push(`groups.${group}: no matching route inventory group`);
  if (config.weight !== undefined && (!Number.isFinite(Number(config.weight)) || Number(config.weight) <= 0)) {
    errors.push(`groups.${group}.weight must be a positive number`);
  }
}

for (const key of ['p95Ms', 'p99Ms']) {
  if (!Number.isFinite(Number(workload.thresholds?.[key])) || Number(workload.thresholds[key]) <= 0) {
    errors.push(`thresholds.${key} must be a positive number`);
  }
}
if (!(Number(workload.thresholds?.errorRate) > 0 && Number(workload.thresholds.errorRate) <= 1)) {
  errors.push('thresholds.errorRate must be between 0 and 1');
}
if (!(Number(workload.thresholds?.checksRate) > 0 && Number(workload.thresholds.checksRate) <= 1)) {
  errors.push('thresholds.checksRate must be between 0 and 1');
}

if (errors.length) {
  console.error(`Load-test workload validation failed (${errors.length} issue(s)):`);
  for (const error of errors) console.error(` - ${error}`);
  process.exitCode = 1;
} else {
  const counts = {};
  for (const route of routeInventory) counts[route.group] = (counts[route.group] || 0) + 1;
  console.log(`Load-test workload valid: ${routeInventory.length} API operations in ${Object.keys(counts).length} domains.`);
  console.log(`Configured operation overrides: ${Object.keys(workload.operations || {}).length}.`);
  console.log(`Inventory by domain: ${Object.entries(counts).map(([group, count]) => `${group}=${count}`).join(', ')}`);
}
