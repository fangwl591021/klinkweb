PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS customer_records (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'program_main',
  owner_user_id TEXT NOT NULL REFERENCES platform_users(id),
  name TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  normalized_phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  normalized_email TEXT NOT NULL DEFAULT '',
  line_name TEXT NOT NULL DEFAULT '',
  company_name TEXT NOT NULL DEFAULT '',
  job_title TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  birthday TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  tags_json TEXT NOT NULL DEFAULT '[]',
  relationship_status TEXT NOT NULL DEFAULT 'active',
  source_type TEXT NOT NULL DEFAULT 'manual',
  source_batch_id TEXT,
  external_id TEXT NOT NULL DEFAULT '',
  last_contact_date TEXT NOT NULL DEFAULT '',
  next_follow_up_date TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  linked_contact_card_id TEXT REFERENCES contact_cards(id),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_customer_records_owner_status
  ON customer_records(tenant_id, owner_user_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_customer_records_owner_phone
  ON customer_records(tenant_id, owner_user_id, normalized_phone, status);
CREATE INDEX IF NOT EXISTS idx_customer_records_owner_email
  ON customer_records(tenant_id, owner_user_id, normalized_email, status);
CREATE INDEX IF NOT EXISTS idx_customer_records_owner_external
  ON customer_records(tenant_id, owner_user_id, external_id, status);

CREATE TABLE IF NOT EXISTS customer_import_batches (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'program_main',
  owner_user_id TEXT NOT NULL REFERENCES platform_users(id),
  source_type TEXT NOT NULL CHECK (source_type IN ('xlsx', 'xls', 'csv', 'google_sheet')),
  source_name TEXT NOT NULL DEFAULT '',
  mapping_json TEXT NOT NULL DEFAULT '{}',
  state TEXT NOT NULL DEFAULT 'validating' CHECK (state IN ('validating', 'ready', 'importing', 'completed', 'partial_failed', 'failed', 'rolled_back')),
  total_rows INTEGER NOT NULL DEFAULT 0,
  create_count INTEGER NOT NULL DEFAULT 0,
  update_count INTEGER NOT NULL DEFAULT 0,
  skip_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  confirmed_at TEXT,
  completed_at TEXT,
  rolled_back_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_customer_import_batches_owner
  ON customer_import_batches(tenant_id, owner_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS customer_import_rows (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL REFERENCES customer_import_batches(id),
  source_row_number INTEGER NOT NULL,
  normalized_json TEXT NOT NULL DEFAULT '{}',
  action TEXT NOT NULL CHECK (action IN ('create', 'update', 'skip', 'error')),
  target_customer_id TEXT,
  error_code TEXT NOT NULL DEFAULT '',
  error_message TEXT NOT NULL DEFAULT '',
  result_customer_id TEXT,
  before_json TEXT NOT NULL DEFAULT '',
  applied_at TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'applied', 'skipped', 'failed', 'rolled_back')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(batch_id, source_row_number)
);

CREATE INDEX IF NOT EXISTS idx_customer_import_rows_batch
  ON customer_import_rows(batch_id, source_row_number);

