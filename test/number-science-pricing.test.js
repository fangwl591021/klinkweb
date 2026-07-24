import test from "node:test";
import assert from "node:assert/strict";
import {
  NUMBER_SCIENCE_PRICE_RULES,
  numberSciencePointCost,
} from "../src/number-science-pricing.js";

test("every number science product has its own configurable point rule", () => {
  assert.deepEqual(
    NUMBER_SCIENCE_PRICE_RULES.map((rule) => rule.requestType),
    [1, 2, 4, 5, 6],
  );
  assert.equal(new Set(NUMBER_SCIENCE_PRICE_RULES.map((rule) => rule.eventType)).size, 5);
  assert.equal(new Set(NUMBER_SCIENCE_PRICE_RULES.map((rule) => rule.pricingKey)).size, 5);
  assert.equal(new Set(NUMBER_SCIENCE_PRICE_RULES.map((rule) => rule.ruleId)).size, 5);
});

test("number science report cost follows its specific rule", () => {
  const pricing = {
    fullReport: 55,
    dailyReport: 6,
    matchingReport: 12,
    workplaceReport: 18,
    loveReport: 9,
  };
  assert.equal(numberSciencePointCost(pricing, 1), 55);
  assert.equal(numberSciencePointCost(pricing, 2), 6);
  assert.equal(numberSciencePointCost(pricing, 4), 12);
  assert.equal(numberSciencePointCost(pricing, 5), 18);
  assert.equal(numberSciencePointCost(pricing, 6), 9);
  assert.equal(numberSciencePointCost(pricing, 3), null);
});
