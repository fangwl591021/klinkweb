const clean = (value, max = 1200) => String(value || "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);

const QUADRANT_SIGNALS = {
  Q1: ["結論", "果斷", "效率", "目標", "決策", "領導", "主導", "直接", "成果"],
  Q2: ["分析", "謹慎", "規劃", "數據", "細節", "邏輯", "穩健", "證據", "精準"],
  Q3: ["熱情", "體驗", "快速", "創意", "冒險", "外向", "嘗試", "行動派", "挑戰"],
  Q4: ["信任", "關係", "傾聽", "和諧", "穩定", "感受", "同理", "安心", "陪伴"],
};

export function communicationQuadrant(profileContext = "") {
  const context = clean(profileContext, 6000);
  const scores = Object.entries(QUADRANT_SIGNALS).map(([quadrant, signals]) => ({
    quadrant,
    score: signals.reduce((sum, signal) => sum + (context.includes(signal) ? 1 : 0), 0),
  })).sort((a, b) => b.score - a.score);
  return scores[0]?.score > 0 ? scores[0].quadrant : "Q4";
}

export async function askMlmProductAdvisor(provider, {
  query = "",
  profileContext = "",
  memberLineUrl = "",
} = {}) {
  const request = clean(query, 600);
  if (request.length < 2) throw new Error("請輸入至少 2 個字的商品需求");
  if (!provider || typeof provider.fetch !== "function") throw new Error("MLM 商品知識服務尚未連線");
  const quadrant = communicationQuadrant(profileContext);
  const response = await provider.fetch("https://mlm.internal/api/internal/klinkweb/product-advisor", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ query: request, quadrant, memberLineUrl: clean(memberLineUrl, 500) }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.status !== "success") {
    throw new Error(String(result.message || result.error || "康立商品知識服務暫時無法使用"));
  }
  return {
    blocked: Boolean(result.blocked),
    blockReason: clean(result.blockReason, 60),
    quadrant: clean(result.quadrant, 20) || quadrant,
    quadrantLabel: clean(result.quadrantLabel, 40),
    answer: clean(result.answer, 1800),
    disclaimer: clean(result.disclaimer, 800),
    products: Array.isArray(result.products) ? result.products.slice(0, 3) : [],
    actions: Array.isArray(result.actions) ? result.actions.slice(0, 3) : [],
  };
}
