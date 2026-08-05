import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const rewardSource = await readFile(new URL('../src/card-collection-reward.js', import.meta.url), 'utf8');
const migrationSource = await readFile(new URL('../migrations/0037_card_collection_reward_switch.sql', import.meta.url), 'utf8');

test('card collection rewards require an active positive rule', () => {
  assert.match(rewardSource, /rule\?\.status==='active'/);
  assert.match(rewardSource, /if\(!setting\.enabled\)return \{queued:false,points:0,status:'disabled'\}/);
});

test('disabled switch cancels pending and processing rewards', () => {
  assert.match(rewardSource, /status IN \('pending','processing'\)/);
  assert.match(rewardSource, /業主已關閉收藏贈點/);
  assert.match(migrationSource, /AFTER UPDATE OF status ON point_rules/);
  assert.match(migrationSource, /WHERE status IN \('pending', 'processing'\)/);
});

test('completed historical rewards remain untouched', () => {
  assert.match(rewardSource, /if \(reward\.status === 'completed'\) return/);
  assert.doesNotMatch(migrationSource, /WHERE status IN \([^)]*completed/);
});

test('reconciliation is disabled while the owner switch is off', () => {
  assert.match(rewardSource, /if\(!setting\.enabled\)return \{scanned:0,completed:0,status:'disabled'\}/);
});
