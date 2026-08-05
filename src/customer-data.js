import { newId } from './member-repository.js';

const TENANT_ID = 'program_main';
const MAX_IMPORT_ROWS = 5000;
const IMPORT_CHUNK_SIZE = 200;
const FIELD_LIMITS = {
  name: 120,
  phone: 40,
  email: 320,
  lineName: 120,
  companyName: 180,
  jobTitle: 120,
  address: 300,
  birthday: 20,
  category: 80,
  relationshipStatus: 40,
  externalId: 120,
  lastContactDate: 20,
  nextFollowUpDate: 20,
  notes: 2000,
};

export const CUSTOMER_IMPORT_FIELDS = Object.freeze(Object.keys(FIELD_LIMITS).concat('tags'));
const text = (value, max = 1000) => String(value ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max);
export const normalizeCustomerPhone = (value) => text(value, 60).replace(/[^0-9+]/g, '').replace(/^\+8860?/, '0');
export const normalizeCustomerEmail = (value) => text(value, 320).toLowerCase();

function normalizeDate(value) {
  const source = text(value, 30);
  if (!source) return '';
  const match = source.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (!match) return '';
  const normalized = `${match[1]}-${String(Number(match[2])).padStart(2, '0')}-${String(Number(match[3])).padStart(2, '0')}`;
  const parsed = new Date(`${normalized}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== normalized ? '' : normalized;
}

function normalizeTags(value) {
  const source = Array.isArray(value) ? value : String(value ?? '').split(/[,，、;；\n]/);
  return [...new Set(source.map((item) => text(item, 40)).filter(Boolean))].slice(0, 12);
}

export function cleanCustomer(input = {}, { requireName = true } = {}) {
  const customer = {};
  for (const [field, limit] of Object.entries(FIELD_LIMITS)) customer[field] = text(input[field], limit);
  customer.tags = normalizeTags(input.tags);
  customer.birthday = normalizeDate(customer.birthday);
  customer.lastContactDate = normalizeDate(customer.lastContactDate);
  customer.nextFollowUpDate = normalizeDate(customer.nextFollowUpDate);
  customer.normalizedPhone = normalizeCustomerPhone(customer.phone);
  customer.normalizedEmail = normalizeCustomerEmail(customer.email);
  customer.relationshipStatus = customer.relationshipStatus || 'active';
  if (requireName && !customer.name) throw new Error('請填寫客戶姓名');
  if (customer.email && !/^\S+@\S+\.\S+$/.test(customer.email)) throw new Error('Email 格式不正確');
  return customer;
}

export function mapImportRow(row = {}, mapping = {}) {
  const candidate = {};
  for (const [sourceField, targetField] of Object.entries(mapping || {})) {
    if (!CUSTOMER_IMPORT_FIELDS.includes(targetField)) continue;
    candidate[targetField] = row[sourceField];
  }
  return cleanCustomer(candidate);
}

function rowToCustomer(row) {
  if (!row) return null;
  let tags = [];
  try { tags = JSON.parse(row.tags_json || '[]'); } catch { tags = []; }
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    email: row.email,
    lineName: row.line_name,
    companyName: row.company_name,
    jobTitle: row.job_title,
    address: row.address,
    birthday: row.birthday,
    category: row.category,
    tags,
    relationshipStatus: row.relationship_status,
    sourceType: row.source_type,
    externalId: row.external_id,
    lastContactDate: row.last_contact_date,
    nextFollowUpDate: row.next_follow_up_date,
    notes: row.notes,
    linkedContactCardId: row.linked_contact_card_id || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const customerColumns = `id,tenant_id,owner_user_id,name,phone,normalized_phone,email,normalized_email,line_name,company_name,job_title,address,birthday,category,tags_json,relationship_status,source_type,source_batch_id,external_id,last_contact_date,next_follow_up_date,notes,linked_contact_card_id,status,created_at,updated_at`;

async function findStrongDuplicate(db, ownerUserId, customer, excludedId = '') {
  const checks = [];
  const bindings = [TENANT_ID, ownerUserId];
  if (customer.externalId) { checks.push('external_id = ?'); bindings.push(customer.externalId); }
  if (customer.normalizedPhone) { checks.push('normalized_phone = ?'); bindings.push(customer.normalizedPhone); }
  if (customer.normalizedEmail) { checks.push('normalized_email = ?'); bindings.push(customer.normalizedEmail); }
  if (!checks.length) return null;
  let sql = `SELECT ${customerColumns} FROM customer_records WHERE tenant_id=? AND owner_user_id=? AND status='active' AND (${checks.join(' OR ')})`;
  if (excludedId) { sql += ' AND id != ?'; bindings.push(excludedId); }
  return db.prepare(`${sql} ORDER BY updated_at DESC LIMIT 1`).bind(...bindings).first();
}

export async function listCustomers(db, ownerUserId, search = '', relationshipStatus = '') {
  const query = text(search, 120);
  const status = text(relationshipStatus, 40);
  const bindings = [TENANT_ID, ownerUserId];
  let where = "tenant_id=? AND owner_user_id=? AND status='active'";
  if (status) { where += ' AND relationship_status=?'; bindings.push(status); }
  if (query) {
    where += ' AND (name LIKE ? OR company_name LIKE ? OR phone LIKE ? OR email LIKE ? OR category LIKE ?)';
    const pattern = `%${query.replace(/[%_]/g, '\\$&')}%`;
    bindings.push(pattern, pattern, pattern, pattern, pattern);
  }
  const result = await db.prepare(`SELECT ${customerColumns} FROM customer_records WHERE ${where} ORDER BY COALESCE(next_follow_up_date,'') ASC, updated_at DESC LIMIT 500`).bind(...bindings).all();
  return (result.results || []).map(rowToCustomer);
}

function customerBindings(id, ownerUserId, customer, sourceType = 'manual', sourceBatchId = '') {
  return [
    id, TENANT_ID, ownerUserId, customer.name, customer.phone, customer.normalizedPhone,
    customer.email, customer.normalizedEmail, customer.lineName, customer.companyName,
    customer.jobTitle, customer.address, customer.birthday, customer.category,
    JSON.stringify(customer.tags), customer.relationshipStatus, sourceType, sourceBatchId,
    customer.externalId, customer.lastContactDate, customer.nextFollowUpDate, customer.notes,
  ];
}

export async function createCustomer(db, ownerUserId, input = {}) {
  const customer = cleanCustomer(input);
  const duplicate = await findStrongDuplicate(db, ownerUserId, customer);
  if (duplicate) {
    const error = new Error(`已存在相同手機、Email 或外部編號的客戶：${duplicate.name}`);
    error.code = 'duplicate_customer';
    error.customer = rowToCustomer(duplicate);
    throw error;
  }
  const id = newId('customer');
  await db.prepare(`INSERT INTO customer_records
    (id,tenant_id,owner_user_id,name,phone,normalized_phone,email,normalized_email,line_name,company_name,job_title,address,birthday,category,tags_json,relationship_status,source_type,source_batch_id,external_id,last_contact_date,next_follow_up_date,notes)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(...customerBindings(id, ownerUserId, customer)).run();
  return rowToCustomer(await db.prepare(`SELECT ${customerColumns} FROM customer_records WHERE id=? AND tenant_id=? AND owner_user_id=?`).bind(id, TENANT_ID, ownerUserId).first());
}

export async function updateCustomer(db, ownerUserId, customerId, input = {}) {
  const existing = await db.prepare(`SELECT ${customerColumns} FROM customer_records WHERE id=? AND tenant_id=? AND owner_user_id=? AND status='active'`).bind(customerId, TENANT_ID, ownerUserId).first();
  if (!existing) throw new Error('找不到客戶資料');
  const previous = rowToCustomer(existing);
  const customer = cleanCustomer({ ...previous, ...input });
  const duplicate = await findStrongDuplicate(db, ownerUserId, customer, customerId);
  if (duplicate) throw new Error(`已存在相同手機、Email 或外部編號的客戶：${duplicate.name}`);
  await db.prepare(`UPDATE customer_records SET
    name=?,phone=?,normalized_phone=?,email=?,normalized_email=?,line_name=?,company_name=?,job_title=?,address=?,birthday=?,category=?,tags_json=?,relationship_status=?,external_id=?,last_contact_date=?,next_follow_up_date=?,notes=?,updated_at=CURRENT_TIMESTAMP
    WHERE id=? AND tenant_id=? AND owner_user_id=? AND status='active'`).bind(
    customer.name, customer.phone, customer.normalizedPhone, customer.email, customer.normalizedEmail,
    customer.lineName, customer.companyName, customer.jobTitle, customer.address, customer.birthday,
    customer.category, JSON.stringify(customer.tags), customer.relationshipStatus, customer.externalId,
    customer.lastContactDate, customer.nextFollowUpDate, customer.notes, customerId, TENANT_ID, ownerUserId,
  ).run();
  return rowToCustomer(await db.prepare(`SELECT ${customerColumns} FROM customer_records WHERE id=? AND tenant_id=? AND owner_user_id=?`).bind(customerId, TENANT_ID, ownerUserId).first());
}

export async function archiveCustomer(db, ownerUserId, customerId) {
  const result = await db.prepare("UPDATE customer_records SET status='archived',updated_at=CURRENT_TIMESTAMP WHERE id=? AND tenant_id=? AND owner_user_id=? AND status='active'").bind(customerId, TENANT_ID, ownerUserId).run();
  if (!result.meta?.changes) throw new Error('找不到客戶資料');
  return { archived: true };
}

function fillBlankPatch(existing, customer) {
  const source = rowToCustomer(existing);
  const patch = {};
  for (const field of CUSTOMER_IMPORT_FIELDS) {
    const incoming = customer[field];
    if (field === 'tags') {
      if (!source.tags.length && incoming.length) patch.tags = incoming;
    } else if (!source[field] && incoming) patch[field] = incoming;
  }
  return patch;
}

function batchSummary(batch) {
  return batch && {
    id: batch.id,
    sourceType: batch.source_type,
    sourceName: batch.source_name,
    state: batch.state,
    totalRows: Number(batch.total_rows) || 0,
    createCount: Number(batch.create_count) || 0,
    updateCount: Number(batch.update_count) || 0,
    skipCount: Number(batch.skip_count) || 0,
    errorCount: Number(batch.error_count) || 0,
    createdAt: batch.created_at,
    completedAt: batch.completed_at || '',
  };
}

export async function previewCustomerImport(db, ownerUserId, input = {}) {
  const sourceType = ['xlsx', 'xls', 'csv'].includes(input.sourceType) ? input.sourceType : '';
  if (!sourceType) throw new Error('不支援的匯入格式');
  if (!Array.isArray(input.rows) || !input.rows.length) throw new Error('檔案沒有可匯入的資料');
  if (input.rows.length > MAX_IMPORT_ROWS) throw new Error(`每次最多匯入 ${MAX_IMPORT_ROWS} 筆`);
  const mapping = input.mapping && typeof input.mapping === 'object' ? input.mapping : {};
  if (!Object.values(mapping).includes('name')) throw new Error('請指定客戶姓名欄位');
  const batchId = newId('customer_import');
  const prepared = [];
  const counts = { create: 0, update: 0, skip: 0, error: 0 };
  for (let index = 0; index < input.rows.length; index += 1) {
    try {
      const customer = mapImportRow(input.rows[index], mapping);
      const duplicate = await findStrongDuplicate(db, ownerUserId, customer);
      const patch = duplicate ? fillBlankPatch(duplicate, customer) : {};
      const action = duplicate ? (Object.keys(patch).length ? 'update' : 'skip') : 'create';
      counts[action] += 1;
      prepared.push({ id: newId('customer_import_row'), rowNumber: index + 2, customer, action, targetId: duplicate?.id || '', errorCode: '', errorMessage: '' });
    } catch (error) {
      counts.error += 1;
      prepared.push({ id: newId('customer_import_row'), rowNumber: index + 2, customer: {}, action: 'error', targetId: '', errorCode: 'invalid_row', errorMessage: text(error.message || '資料格式錯誤', 240) });
    }
  }
  await db.prepare(`INSERT INTO customer_import_batches
    (id,tenant_id,owner_user_id,source_type,source_name,mapping_json,state,total_rows,create_count,update_count,skip_count,error_count)
    VALUES (?,?,?,?,?,?,'validating',?,?,?,?,?)`).bind(batchId, TENANT_ID, ownerUserId, sourceType, text(input.sourceName, 240), JSON.stringify(mapping), prepared.length, counts.create, counts.update, counts.skip, counts.error).run();
  for (let offset = 0; offset < prepared.length; offset += IMPORT_CHUNK_SIZE) {
    await db.batch(prepared.slice(offset, offset + IMPORT_CHUNK_SIZE).map((row) => db.prepare(`INSERT INTO customer_import_rows
      (id,batch_id,source_row_number,normalized_json,action,target_customer_id,error_code,error_message,status)
      VALUES (?,?,?,?,?,?,?,?,'pending')`).bind(row.id, batchId, row.rowNumber, JSON.stringify(row.customer), row.action, row.targetId, row.errorCode, row.errorMessage)));
  }
  await db.prepare("UPDATE customer_import_batches SET state='ready' WHERE id=? AND tenant_id=? AND owner_user_id=?").bind(batchId, TENANT_ID, ownerUserId).run();
  return {
    batch: batchSummary(await db.prepare('SELECT * FROM customer_import_batches WHERE id=?').bind(batchId).first()),
    rows: prepared.slice(0, 100).map((row) => ({ rowNumber: row.rowNumber, name: row.customer.name || '', companyName: row.customer.companyName || '', phone: row.customer.phone || '', action: row.action, error: row.errorMessage })),
    previewTruncated: prepared.length > 100,
  };
}

export async function getCustomerImport(db, ownerUserId, batchId) {
  const batch = await db.prepare('SELECT * FROM customer_import_batches WHERE id=? AND tenant_id=? AND owner_user_id=?').bind(batchId, TENANT_ID, ownerUserId).first();
  if (!batch) throw new Error('找不到匯入批次');
  const rows = await db.prepare('SELECT source_row_number,normalized_json,action,error_message,status,result_customer_id FROM customer_import_rows WHERE batch_id=? ORDER BY source_row_number LIMIT 500').bind(batchId).all();
  return {
    batch: batchSummary(batch),
    rows: (rows.results || []).map((row) => {
      let customer = {}; try { customer = JSON.parse(row.normalized_json || '{}'); } catch { customer = {}; }
      return { rowNumber: row.source_row_number, name: customer.name || '', companyName: customer.companyName || '', phone: customer.phone || '', action: row.action, error: row.error_message, status: row.status, customerId: row.result_customer_id || '' };
    }),
  };
}

export async function commitCustomerImport(db, ownerUserId, batchId) {
  const batch = await db.prepare('SELECT * FROM customer_import_batches WHERE id=? AND tenant_id=? AND owner_user_id=?').bind(batchId, TENANT_ID, ownerUserId).first();
  if (!batch) throw new Error('找不到匯入批次');
  if (['completed', 'partial_failed'].includes(batch.state)) return getCustomerImport(db, ownerUserId, batchId);
  if (batch.state !== 'ready') throw new Error('匯入批次目前無法確認');
  const appliedAt = new Date().toISOString();
  await db.prepare("UPDATE customer_import_batches SET state='importing',confirmed_at=? WHERE id=? AND tenant_id=? AND owner_user_id=? AND state='ready'").bind(appliedAt, batchId, TENANT_ID, ownerUserId).run();
  const result = await db.prepare("SELECT * FROM customer_import_rows WHERE batch_id=? AND status='pending' ORDER BY source_row_number").bind(batchId).all();
  let failures = 0;
  for (const row of result.results || []) {
    if (row.action === 'skip' || row.action === 'error') {
      await db.prepare("UPDATE customer_import_rows SET status='skipped' WHERE id=? AND batch_id=?").bind(row.id, batchId).run();
      continue;
    }
    try {
      const customer = cleanCustomer(JSON.parse(row.normalized_json || '{}'));
      if (row.action === 'create') {
        const id = newId('customer');
        await db.prepare(`INSERT INTO customer_records
          (id,tenant_id,owner_user_id,name,phone,normalized_phone,email,normalized_email,line_name,company_name,job_title,address,birthday,category,tags_json,relationship_status,source_type,source_batch_id,external_id,last_contact_date,next_follow_up_date,notes,created_at,updated_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(...customerBindings(id, ownerUserId, customer, batch.source_type, batchId), appliedAt, appliedAt).run();
        await db.prepare("UPDATE customer_import_rows SET status='applied',result_customer_id=?,applied_at=? WHERE id=? AND batch_id=?").bind(id, appliedAt, row.id, batchId).run();
      } else {
        const existing = await db.prepare(`SELECT ${customerColumns} FROM customer_records WHERE id=? AND tenant_id=? AND owner_user_id=? AND status='active'`).bind(row.target_customer_id, TENANT_ID, ownerUserId).first();
        if (!existing) throw new Error('原客戶資料不存在');
        const previous = rowToCustomer(existing);
        const merged = cleanCustomer({ ...customer, ...Object.fromEntries(Object.entries(previous).filter(([, value]) => Array.isArray(value) ? value.length : Boolean(value))) });
        await db.prepare(`UPDATE customer_records SET
          name=?,phone=?,normalized_phone=?,email=?,normalized_email=?,line_name=?,company_name=?,job_title=?,address=?,birthday=?,category=?,tags_json=?,relationship_status=?,external_id=?,last_contact_date=?,next_follow_up_date=?,notes=?,source_batch_id=?,updated_at=?
          WHERE id=? AND tenant_id=? AND owner_user_id=? AND status='active'`).bind(
          merged.name, merged.phone, merged.normalizedPhone, merged.email, merged.normalizedEmail,
          merged.lineName, merged.companyName, merged.jobTitle, merged.address, merged.birthday,
          merged.category, JSON.stringify(merged.tags), merged.relationshipStatus, merged.externalId,
          merged.lastContactDate, merged.nextFollowUpDate, merged.notes, batchId, appliedAt,
          existing.id, TENANT_ID, ownerUserId,
        ).run();
        await db.prepare("UPDATE customer_import_rows SET status='applied',result_customer_id=?,before_json=?,applied_at=? WHERE id=? AND batch_id=?").bind(existing.id, JSON.stringify(previous), appliedAt, row.id, batchId).run();
      }
    } catch (error) {
      failures += 1;
      await db.prepare("UPDATE customer_import_rows SET status='failed',error_code='commit_failed',error_message=? WHERE id=? AND batch_id=?").bind(text(error.message || '匯入失敗', 240), row.id, batchId).run();
    }
  }
  await db.prepare("UPDATE customer_import_batches SET state=?,error_count=error_count+?,completed_at=? WHERE id=? AND tenant_id=? AND owner_user_id=?").bind(failures ? 'partial_failed' : 'completed', failures, new Date().toISOString(), batchId, TENANT_ID, ownerUserId).run();
  return getCustomerImport(db, ownerUserId, batchId);
}

export async function rollbackCustomerImport(db, ownerUserId, batchId) {
  const batch = await db.prepare('SELECT * FROM customer_import_batches WHERE id=? AND tenant_id=? AND owner_user_id=?').bind(batchId, TENANT_ID, ownerUserId).first();
  if (!batch || !['completed', 'partial_failed'].includes(batch.state)) throw new Error('這個批次目前無法回滾');
  const result = await db.prepare("SELECT * FROM customer_import_rows WHERE batch_id=? AND status='applied' ORDER BY source_row_number DESC").bind(batchId).all();
  let skipped = 0;
  for (const row of result.results || []) {
    const current = await db.prepare(`SELECT ${customerColumns} FROM customer_records WHERE id=? AND tenant_id=? AND owner_user_id=?`).bind(row.result_customer_id, TENANT_ID, ownerUserId).first();
    if (!current || current.updated_at !== row.applied_at) { skipped += 1; continue; }
    if (row.action === 'create') {
      await db.prepare("UPDATE customer_records SET status='archived',updated_at=CURRENT_TIMESTAMP WHERE id=? AND tenant_id=? AND owner_user_id=?").bind(current.id, TENANT_ID, ownerUserId).run();
    } else {
      const before = cleanCustomer(JSON.parse(row.before_json || '{}'));
      await db.prepare(`UPDATE customer_records SET name=?,phone=?,normalized_phone=?,email=?,normalized_email=?,line_name=?,company_name=?,job_title=?,address=?,birthday=?,category=?,tags_json=?,relationship_status=?,external_id=?,last_contact_date=?,next_follow_up_date=?,notes=?,source_batch_id='',updated_at=CURRENT_TIMESTAMP WHERE id=? AND tenant_id=? AND owner_user_id=?`).bind(
        before.name, before.phone, before.normalizedPhone, before.email, before.normalizedEmail, before.lineName,
        before.companyName, before.jobTitle, before.address, before.birthday, before.category,
        JSON.stringify(before.tags), before.relationshipStatus, before.externalId, before.lastContactDate,
        before.nextFollowUpDate, before.notes, current.id, TENANT_ID, ownerUserId,
      ).run();
    }
    await db.prepare("UPDATE customer_import_rows SET status='rolled_back' WHERE id=? AND batch_id=?").bind(row.id, batchId).run();
  }
  if (skipped) throw new Error(`有 ${skipped} 筆資料已在匯入後被修改，為保護人工內容未自動回滾`);
  await db.prepare("UPDATE customer_import_batches SET state='rolled_back',rolled_back_at=CURRENT_TIMESTAMP WHERE id=? AND tenant_id=? AND owner_user_id=?").bind(batchId, TENANT_ID, ownerUserId).run();
  return { rolledBack: true };
}
