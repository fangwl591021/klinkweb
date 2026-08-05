import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const appSource = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const uiSource = readFileSync(new URL('../public/customer-data-ui.js', import.meta.url), 'utf8');
const workerSource = readFileSync(new URL('../src/index.js', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../migrations/0037_customer_data_import.sql', import.meta.url), 'utf8');

test('business cards and owned customers remain separate surfaces', () => {
  assert.match(appSource, /customerDataUi\.tabs\("cards"\)/);
  assert.match(uiSource, /名片收藏/);
  assert.match(uiSource, /我的客戶/);
  assert.match(uiSource, /不會混入名片收藏與配對排名/);
});

test('spreadsheet import requires mapping, authority and preview before commit', () => {
  assert.match(uiSource, /customerImportAuthority/);
  assert.match(uiSource, /data-customer-map/);
  assert.match(uiSource, /\/v1\/customer-imports\/preview/);
  assert.match(uiSource, /\/confirm/);
});

test('customer APIs always derive ownership from authenticated member', () => {
  assert.match(workerSource, /listCustomers\(\s*env\.DB,\s*member\.userId/);
  assert.match(workerSource, /createCustomer\(env\.DB, member\.userId/);
  assert.match(workerSource, /previewCustomerImport\(env\.DB, member\.userId/);
  assert.doesNotMatch(workerSource, /ownerUserId:\s*body\./);
});

test('customer storage carries tenant and owner scope on every major table', () => {
  assert.equal((migration.match(/tenant_id TEXT NOT NULL/g) || []).length, 2);
  assert.equal((migration.match(/owner_user_id TEXT NOT NULL/g) || []).length, 2);
  assert.match(migration, /customer_import_rows/);
});

