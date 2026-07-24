import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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
        products: [{
          name: "康綠寶",
          productName: "康綠寶",
          plan: "國際計畫",
          reviewStatus: "approved",
          approvedPublicFacts: ["食品；官方資料"],
          specifications: ["500g/瓶"],
          ingredients: "核准成分",
          usage: "依標示使用",
        }],
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
  assert.equal(result.products[0].productSeries, "國際計畫");
  assert.deepEqual(result.products[0].specifications, ["500g/瓶"]);
});

test("adapter preserves clarification response without recommending products", async () => {
  const provider = { fetch: async () => Response.json({
    status: "success",
    blocked: false,
    needsClarification: true,
    clarificationQuestion: "請補充商品系列或用途",
    products: [],
    actions: [],
  }) };
  const result = await askMlmProductAdvisor(provider, { query: "我想了解商品" });
  assert.equal(result.needsClarification, true);
  assert.equal(result.clarificationQuestion, "請補充商品系列或用途");
  assert.deepEqual(result.products, []);
});

test("pending review product hides unapproved fields in the adapter", async () => {
  const provider = { fetch: async () => Response.json({
    status: "success",
    blocked: false,
    products: [{
      name: "待審商品",
      reviewStatus: "pending_review",
      size: "未核准規格",
      specifications: ["未核准規格"],
      ingredients: "未核准成分",
      usage: "未核准用法",
      approvedPublicFacts: ["已核准公開事實"],
    }],
    actions: [],
  }) };
  const result = await askMlmProductAdvisor(provider, { query: "待審商品" });
  assert.equal(result.products[0].reviewStatus, "pending_review");
  assert.deepEqual(result.products[0].specifications, []);
  assert.equal(result.products[0].size, "");
  assert.equal(result.products[0].ingredients, "");
  assert.equal(result.products[0].usage, "");
  assert.deepEqual(result.products[0].approvedPublicFacts, ["已核准公開事實"]);
});

test("medical interception response remains blocked and has no products", async () => {
  const provider = { fetch: async () => Response.json({
    status: "success",
    blocked: true,
    blockReason: "medical_query",
    answer: "此問題涉及健康或醫療內容",
    products: [],
    actions: [],
  }) };
  const result = await askMlmProductAdvisor(provider, { query: "可以治療疾病嗎" });
  assert.equal(result.blocked, true);
  assert.equal(result.blockReason, "medical_query");
  assert.deepEqual(result.products, []);
});

test("consumer renderer uses natural copy and hides internal metadata", async () => {
  const source = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
  const start = source.indexOf("const productCards = products.map");
  const end = source.indexOf("$(\"#smartProductResults\").innerHTML", start);
  const renderer = source.slice(start, end);
  assert.match(renderer, /幫你快速整理/);
  assert.match(renderer, /看看成分/);
  assert.match(renderer, /怎麼使用/);
  assert.match(renderer, /問問推薦人/);
  assert.match(renderer, /查看官方介紹/);
  assert.doesNotMatch(renderer, /審核狀態|quadrantLabel|國際計畫/);
});
