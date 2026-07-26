import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');

test('collection match states use clear customer-facing labels', () => {
  assert.match(source, /match\.status==="failed" \? "暫無結果"/);
  assert.match(source, /includes\(match\.status\) \? "配對中" : "待配對"/);
});

test('collection polling refreshes rows without rebuilding the whole page', () => {
  assert.match(source, /cardCollection\(search,industry,true\)/);
  assert.match(source, /if\(!quiet\)\{\s*layout\(/);
});
