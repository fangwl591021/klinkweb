const CARD_COLLECTION_REWARD_POINTS = 10;

async function configuredCardCollectionRewardPoints(db) {
  await db.prepare(`INSERT OR IGNORE INTO point_rules
    (id,program_id,event_type,points,daily_limit,award_frequency,status,rule_version)
    VALUES ('pointrule_card_collection','program_main','card_collection_reward',10,NULL,'per_completion','active','v1')`).run();
  const rule=await db.prepare(`SELECT points FROM point_rules
    WHERE program_id='program_main' AND event_type='card_collection_reward' AND status='active'
    ORDER BY updated_at DESC LIMIT 1`).first();
  const points=Number(rule?.points);
  return Number.isInteger(points) && points > 0 ? points : 0;
}

async function ensureCardCollectionRewardTable(db) {
  await db.prepare(`
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
    )
  `).run();
}

async function rewardLineSubject(db, userId) {
  const row = await db.prepare(`
    SELECT provider_subject FROM external_identities
    WHERE platform_user_id=? AND provider='line_login' AND verification_status='verified'
    LIMIT 1
  `).bind(userId).first();
  return String(row?.provider_subject || '').trim();
}

export async function queueCardCollectionReward(db, userId, cardId) {
  await ensureCardCollectionRewardTable(db);
  const points=await configuredCardCollectionRewardPoints(db);
  if(points<=0)return {queued:false,points:0};
  await db.prepare(`
    INSERT INTO card_collection_rewards (user_id, contact_card_id, points)
    VALUES (?, ?, ?)
    ON CONFLICT(user_id, contact_card_id) DO NOTHING
  `).bind(userId, cardId, points).run();
  return {queued:true,points};
}

export async function fulfillCardCollectionReward(env, userId, cardId) {
  await ensureCardCollectionRewardTable(env.DB);
  const reward = await env.DB.prepare('SELECT * FROM card_collection_rewards WHERE user_id=? AND contact_card_id=? LIMIT 1').bind(userId, cardId).first();
  if (!reward) return { status:'not_queued', points:0 };
  if (reward.status === 'completed') return { status:'completed', points:Number(reward.points || CARD_COLLECTION_REWARD_POINTS), duplicate:true };
  const card = await env.DB.prepare("SELECT id FROM contact_cards WHERE id=? AND scanner_user_id=? AND status='active' LIMIT 1").bind(cardId, userId).first();
  if (!card) {
    await env.DB.prepare("UPDATE card_collection_rewards SET status='cancelled',last_error='名片不存在',updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND contact_card_id=?").bind(userId, cardId).run();
    return { status:'cancelled', points:0 };
  }
  if (!env.MLM_WORKER || typeof env.MLM_WORKER.fetch !== 'function') throw new Error('MLM 點數服務尚未連線');
  const lineUserId = await rewardLineSubject(env.DB, userId);
  if (!lineUserId) throw new Error('找不到 LINE 會員身份');
  const claim = await env.DB.prepare(`
    UPDATE card_collection_rewards SET status='processing',attempts=attempts+1,updated_at=CURRENT_TIMESTAMP
    WHERE user_id=? AND contact_card_id=?
      AND (status!='processing' OR updated_at <= datetime('now','-2 minutes'))
  `).bind(userId, cardId).run();
  if (Number(claim?.meta?.changes || 0) === 0) return { status:'processing', points:Number(reward.points || CARD_COLLECTION_REWARD_POINTS) };
  try {
    const response = await env.MLM_WORKER.fetch('https://mlm.internal/api/internal/klink/card-collection-reward', {
      method:'POST',
      headers:{'content-type':'application/json',accept:'application/json'},
      body:JSON.stringify({ lineUserId, userId, cardId, points:Number(reward.points || CARD_COLLECTION_REWARD_POINTS) }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.status !== 'success') throw new Error(result.message || result.error || '名片贈點失敗');
    await env.DB.prepare("UPDATE card_collection_rewards SET status='completed',last_error='',updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND contact_card_id=?").bind(userId, cardId).run();
    return { status:'completed', points:Number(result.points || CARD_COLLECTION_REWARD_POINTS), duplicate:Boolean(result.duplicate), balance:result.balance };
  } catch (error) {
    await env.DB.prepare("UPDATE card_collection_rewards SET status='pending',last_error=?,updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND contact_card_id=?")
      .bind(String(error?.message || error).slice(0, 300), userId, cardId).run().catch(() => null);
    throw error;
  }
}

export async function queueAndFulfillCardCollectionReward(env, userId, cardId) {
  const queued=await queueCardCollectionReward(env.DB, userId, cardId);
  if(!queued.queued)return {status:'disabled',points:0};
  try { return await fulfillCardCollectionReward(env, userId, cardId); }
  catch (error) { console.warn('Card collection reward queued for retry', error); return { status:'pending', points:queued.points }; }
}

export async function reconcileMemberCardCollectionRewards(env, userId, limit = 5) {
  await ensureCardCollectionRewardTable(env.DB);
  // 只補送已通過新版圖片指紋防重、且 OCR 已完成的名片；不追溯舊資料。
  const rows=await env.DB.prepare(`SELECT cc.id contact_card_id
    FROM contact_cards cc
    JOIN card_import_events cie ON cie.id=cc.source_event_id
    JOIN card_import_fingerprints cif ON cif.event_id=cie.id AND cif.user_id=cc.scanner_user_id
    LEFT JOIN card_collection_rewards reward
      ON reward.user_id=cc.scanner_user_id AND reward.contact_card_id=cc.id
    WHERE cc.scanner_user_id=? AND cc.status='active' AND cie.status='created'
      AND cif.status='completed' AND reward.contact_card_id IS NULL
    ORDER BY cc.created_at DESC LIMIT ?`).bind(userId,Math.max(1,Math.min(Number(limit)||5,10))).all();
  let completed=0;
  for(const row of rows.results || []){
    const result=await queueAndFulfillCardCollectionReward(env,userId,row.contact_card_id);
    if(result.status==='completed')completed+=1;
  }
  return {scanned:(rows.results || []).length,completed};
}

export async function retryPendingCardCollectionRewards(env, limit = 10) {
  await ensureCardCollectionRewardTable(env.DB);
  const rows = await env.DB.prepare(`
    SELECT user_id, contact_card_id FROM card_collection_rewards
    WHERE status='pending' AND attempts < 20
    ORDER BY updated_at ASC LIMIT ?
  `).bind(Math.max(1, Math.min(Number(limit) || 10, 30))).all();
  let completed = 0;
  for (const row of rows.results || []) {
    try { const result = await fulfillCardCollectionReward(env, row.user_id, row.contact_card_id); if (result.status === 'completed') completed += 1; }
    catch (error) { console.warn('Pending card collection reward retry failed', row.contact_card_id, error); }
  }
  return { scanned:(rows.results || []).length, completed };
}
