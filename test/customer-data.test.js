import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cleanCustomer,
  mapImportRow,
  normalizeCustomerEmail,
  normalizeCustomerPhone,
} from '../src/customer-data.js';

test('customer normalization supports Taiwan phone and email matching', () => {
  assert.equal(normalizeCustomerPhone('+886 0912-345-678'), '0912345678');
  assert.equal(normalizeCustomerEmail(' TONY@EXAMPLE.COM '), 'tony@example.com');
});

test('spreadsheet fields are mapped into a private customer candidate', () => {
  assert.deepEqual(mapImportRow({ 姓名:'王小明', 手機:'0912-345-678', 公司:'範例公司', 標籤:'潛在客戶,北區' }, {
    姓名:'name', 手機:'phone', 公司:'companyName', 標籤:'tags',
  }), {
    name:'王小明', phone:'0912-345-678', email:'', lineName:'', companyName:'範例公司',
    jobTitle:'', address:'', birthday:'', category:'', relationshipStatus:'active', externalId:'',
    lastContactDate:'', nextFollowUpDate:'', notes:'', tags:['潛在客戶','北區'],
    normalizedPhone:'0912345678', normalizedEmail:'',
  });
});

test('customer import rejects missing names and invalid email', () => {
  assert.throws(() => cleanCustomer({ phone:'0912345678' }), /客戶姓名/);
  assert.throws(() => cleanCustomer({ name:'王小明', email:'wrong' }), /Email 格式/);
});

test('date and tag normalization are bounded', () => {
  const result = cleanCustomer({ name:'王小明', birthday:'2026/02/28', tags:'A，B、A' });
  assert.equal(result.birthday, '2026-02-28');
  assert.deepEqual(result.tags, ['A','B']);
});

