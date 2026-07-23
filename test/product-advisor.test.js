import test from "node:test";
import assert from "node:assert/strict";
import { askMlmProductAdvisor, communicationQuadrant } from "../src/product-advisor.js";

test("communication style uses existing profile signals and safely defaults", () => {
  assert.equal(communicationQuadrant("偏好數據、細節與謹慎規劃"), "Q2");
  assert.equal(communicationQuadrant(""), "Q4");
});

test("product advisor uses MLM service binding and forwards member LINE URL", async () => {
  let requestBody;
  const provider = {
    async fetch(_url, options) {
      requestBody = JSON.parse(options.body);
      return Response.json({
        status: "success",
        blocked: false,
        quadrant: requestBody.quadrant,
        answer: "商品資料",
        products: [{ name: "康綠寶" }],
        actions: [{ label: "聯絡會員", url: requestBody.memberLineUrl }],
      });
    },
  };
  const result = await askMlmProductAdvisor(provider, {
    query: "康綠寶如何沖泡",
    profileContext: "重視數據與細節",
    memberLineUrl: "https://lin.ee/example",
  });
  assert.equal(requestBody.quadrant, "Q2");
  assert.equal(requestBody.memberLineUrl, "https://lin.ee/example");
  assert.equal(result.products[0].name, "康綠寶");
});
