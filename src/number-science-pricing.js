export const NUMBER_SCIENCE_PRICE_RULES = Object.freeze([
  { requestType:1, ruleId:"pointrule_number_science_full", eventType:"number_science_full_report", pricingKey:"fullReport", defaultPoints:50 },
  { requestType:2, ruleId:"pointrule_number_science_daily", eventType:"number_science_daily_report", pricingKey:"dailyReport", defaultPoints:10 },
  { requestType:4, ruleId:"pointrule_number_science_matching", eventType:"number_science_matching_report", pricingKey:"matchingReport", defaultPoints:10 },
  { requestType:5, ruleId:"pointrule_number_science_workplace", eventType:"number_science_workplace_report", pricingKey:"workplaceReport", defaultPoints:10 },
  { requestType:6, ruleId:"pointrule_number_science_love", eventType:"number_science_love_report", pricingKey:"loveReport", defaultPoints:10 },
]);

export const LEGACY_NUMBER_SCIENCE_OTHER_EVENT = "number_science_other_report";

export function numberSciencePointCost(pricing = {}, requestType) {
  const rule = NUMBER_SCIENCE_PRICE_RULES.find((item) => item.requestType === Number(requestType));
  if (!rule) return null;
  const configured = Number(pricing[rule.pricingKey]);
  return Number.isInteger(configured) && configured > 0 ? configured : rule.defaultPoints;
}
