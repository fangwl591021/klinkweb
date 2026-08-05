CREATE TABLE IF NOT EXISTS card_collection_rewards (
  user_id TEXT NOT NULL,
  contact_card_id TEXT NOT NULL,
  points INTEGER NOT NULL DEFAULT 10,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(user_id, contact_card_id)
);

DROP TRIGGER IF EXISTS trg_card_collection_reward_disabled_update;
CREATE TRIGGER trg_card_collection_reward_disabled_update
AFTER UPDATE OF status ON point_rules
WHEN NEW.program_id = 'program_main'
  AND NEW.event_type = 'card_collection_reward'
  AND NEW.status != 'active'
BEGIN
  UPDATE card_collection_rewards
  SET status = 'cancelled',
      last_error = '業主已關閉收藏贈點',
      updated_at = CURRENT_TIMESTAMP
  WHERE status IN ('pending', 'processing');
END;

DROP TRIGGER IF EXISTS trg_card_collection_reward_disabled_insert;
CREATE TRIGGER trg_card_collection_reward_disabled_insert
AFTER INSERT ON point_rules
WHEN NEW.program_id = 'program_main'
  AND NEW.event_type = 'card_collection_reward'
  AND NEW.status != 'active'
BEGIN
  UPDATE card_collection_rewards
  SET status = 'cancelled',
      last_error = '業主已關閉收藏贈點',
      updated_at = CURRENT_TIMESTAMP
  WHERE status IN ('pending', 'processing');
END;
