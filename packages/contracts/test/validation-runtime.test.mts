import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const validation = require('../dist/index.js');

test('the shared password policy behaves identically for every consumer', () => {
  assert.equal(validation.getPasswordPolicyError('Correct-Horse-73!'), null);
  assert.notEqual(validation.getPasswordPolicyError('12345678'), null);
  assert.equal(validation.getPasswordPolicyError('  Correct-Horse-73!  '), null);
  assert.equal(validation.passwordSchema.safeParse('Correct-Horse-73!').success, true);
  assert.equal(validation.passwordSchema.safeParse('password123').success, false);
});

test('shared email and registration contracts normalize input consistently', () => {
  assert.equal(validation.emailSchema.parse(' seller@example.com '), 'seller@example.com');
  assert.equal(validation.emailSchema.safeParse('invalid-email').success, false);
  assert.equal(validation.registerBodySchema.safeParse({
    name: ' Seller ',
    email: ' seller@example.com ',
    password: 'Correct-Horse-73!',
    phone: '+970599123456',
    city: 'Nuseirat',
  }).success, true);
  assert.equal(validation.registerFormSchema.safeParse({
    name: 'Seller', email: 'seller@example.com', password: 'Correct-Horse-73!',
    confirmPassword: 'Different-Password-73!', phone: '', city: '',
  }).success, false);
  assert.equal(validation.registerBodySchema.safeParse({
    name: 'S',
    email: 'seller@example.com',
    password: 'Correct-Horse-73!',
  }).success, false);
});

test('pagination rejects malformed or out-of-range query values', () => {
  assert.deepEqual(validation.paginationQuerySchema.parse({}), {});
  assert.deepEqual(validation.paginationQuerySchema.parse({ page: '2', limit: '50' }), { page: 2, limit: 50 });
  assert.equal(validation.paginationQuerySchema.safeParse({ page: '1.5' }).success, false);
  assert.equal(validation.paginationQuerySchema.safeParse({ page: '1001' }).success, false);
  assert.equal(validation.paginationQuerySchema.safeParse({ limit: '101' }).success, false);
});

test('request form schema and first-invalid-field helper share field limits', () => {
  assert.equal(validation.getFirstInvalidRequestField({ categoryId: '', title: '', description: '' }), 'req-cat');
  assert.equal(validation.getFirstInvalidRequestField({ categoryId: 'cat', title: 'short', description: '' }), 'req-desc');
  assert.equal(validation.getFirstInvalidRequestField({ categoryId: 'cat', title: 'Valid request title', description: 'Enough detail for a request' }), null);
  assert.equal(validation.createRequestFormSchema.safeParse({
    categoryId: 'cat', title: 'T'.repeat(151), description: 'Enough detail for a request',
  }).success, false);
});

test('money and multipart boolean helpers reject unsafe coercions', () => {
  assert.equal(validation.positiveMoneySchema.safeParse('12.50').success, true);
  assert.equal(validation.positiveMoneySchema.safeParse('12.501').success, false);
  assert.equal(validation.positiveMoneySchema.safeParse('-1').success, false);
  assert.equal(validation.parseFormBoolean('false'), false);
  assert.equal(validation.parseFormBoolean('true'), true);
  assert.equal(validation.parseFormBoolean('yes'), 'yes');
  assert.equal(validation.optionalQueryBooleanSchema.parse('true'), true);
  assert.equal(validation.optionalQueryBooleanSchema.parse('false'), false);
  assert.equal(validation.optionalQueryBooleanSchema.safeParse('yes').success, false);
  assert.equal(validation.optionalQueryBooleanSchema.parse(undefined), undefined);
});


test('shared coordinate and identity primitives enforce common bounds', () => {
  assert.equal(validation.latitudeSchema.safeParse('90').success, true);
  assert.equal(validation.latitudeSchema.safeParse('90.1').success, false);
  assert.equal(validation.longitudeSchema.safeParse('-180').success, true);
  assert.equal(validation.longitudeSchema.safeParse('181').success, false);
  assert.equal(validation.displayNameSchema.safeParse('A').success, false);
  assert.equal(validation.phoneE164Schema.safeParse('+970599123456').success, true);
});


test('query boolean parsing accepts explicit encodings and rejects ambiguous values', () => {
  assert.equal(validation.optionalQueryBooleanSchema.parse('true'), true);
  assert.equal(validation.optionalQueryBooleanSchema.parse('false'), false);
  assert.equal(validation.optionalQueryBooleanSchema.parse('1'), true);
  assert.equal(validation.optionalQueryBooleanSchema.parse('0'), false);
  assert.equal(validation.optionalQueryBooleanSchema.safeParse('yes').success, false);
  assert.equal(validation.queryBooleanSchema.safeParse(undefined).success, false);
});

test('optional nullable contact email preserves customer API semantics', () => {
  assert.equal(validation.optionalNullableEmailSchema.parse(undefined), undefined);
  assert.equal(validation.optionalNullableEmailSchema.parse(null), null);
  assert.equal(validation.optionalNullableEmailSchema.safeParse('not-an-email').success, false);
  assert.equal(validation.optionalNullableEmailSchema.safeParse('seller@example.com').success, true);
});

test('ad composer contract centralizes required content fields', () => {
  assert.equal(validation.adComposerFieldsSchema.safeParse({ title: '', description: '', city: '' }).success, false);
  assert.equal(validation.adComposerFieldsSchema.safeParse({
    title: 'Valid ad title', description: 'A sufficiently long description for this ad', city: 'Nuseirat',
  }).success, true);
});

test('product composer contract validates numeric price and related-price constraints', () => {
  const base = {
    categoryId: 'category-1', name: 'Valid Product', description: 'A sufficiently long product description',
    price: '100', discountPrice: '', wholesalePrice: '', wholesaleMinQty: '',
  };
  assert.equal(validation.productComposerFieldsSchema.safeParse(base).success, true);
  assert.equal(validation.productComposerFieldsSchema.safeParse({ ...base, price: '100xyz' }).success, false);
  assert.equal(validation.productComposerFieldsSchema.safeParse({ ...base, discountPrice: '100' }).success, false);
  assert.equal(validation.productComposerFieldsSchema.safeParse({ ...base, wholesalePrice: '80' }).success, false);
});

test('service listing contract requires price only for priced services', () => {
  const base = {
    serviceTypeId: 'type-1', categoryId: 'category-1', title: 'Repair service',
    description: 'A sufficiently long service description', pricingType: 'NEGOTIABLE', price: '',
  };
  assert.equal(validation.serviceListingComposerFieldsSchema.safeParse(base).success, true);
  assert.equal(validation.serviceListingComposerFieldsSchema.safeParse({ ...base, pricingType: 'FIXED' }).success, false);
  assert.equal(validation.serviceListingComposerFieldsSchema.safeParse({ ...base, pricingType: 'FIXED', price: '50' }).success, true);
});
