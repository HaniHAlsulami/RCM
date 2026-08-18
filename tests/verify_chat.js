/*!
 * verify_chat.js — تحقّق من المساعد المرجعي
 *
 * (١) تطابق المعالجة العربية بين بايثون (الفهرسة) وجافاسكربت (الاستعلام).
 *     أي انحراف يعني رمزاً في الفهرس لا تصل إليه كلمة المستخدم.
 * (٢) سلامة طبقة الاستنتاج: نيّة السؤال، استخلاص المعطيات، تصنيف الحكم.
 * (٣) قواعد لا يجوز خرقها: كل جملة مستنتَجة تحمل مرجعاً موجوداً.
 *
 *     node tests/verify_chat.js
 */
"use strict";
const fs = require("fs");
const path = require("path");

global.window = global;
const S = require(path.join(__dirname, "..", "assets", "rcm-chat.js"));
const R = require(path.join(__dirname, "..", "assets", "rcm-reason.js"));

let pass = 0, fail = 0;
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function check(name, got, want) {
  if (eq(got, want)) { pass++; return; }
  fail++;
  console.log(`  ✗ ${name}\n      المتوقَّع: ${JSON.stringify(want)}\n      الناتج  : ${JSON.stringify(got)}`);
}
function ok(name, cond, detail) {
  if (cond) { pass++; return; }
  fail++;
  console.log(`  ✗ ${name}${detail ? "\n      " + detail : ""}`);
}

// ── (١) التطابق مع بايثون ────────────────────────────────────────────
console.log("\n١. تطابق المعالجة العربية بين بايثون وجافاسكربت");
const ref = JSON.parse(fs.readFileSync(path.join(__dirname, "chat_reference.json"), "utf8"));
Object.entries(ref.normalize).forEach(([k, v]) => check(`normalize(${k.slice(0, 26)})`, S.normalize(k), v));
Object.entries(ref.tokenize).forEach(([k, v]) => check(`tokenize(${k.slice(0, 26)})`, S.tokenize(k), v));
Object.entries(ref.stem).forEach(([k, v]) => check(`stem(${k})`, S.stem(S.normalize(k)), v));

// ── (٢) طبقة الاستنتاج ───────────────────────────────────────────────
console.log("\n٢. طبقة الاستنتاج");
[["كم مدة الرد على طلب الموافقة المسبقة؟", "duration"],
 ["ما نسبة التحمل التي يدفعها المستفيد؟", "amount"],
 ["هل تشمل التغطية الحمل والولادة؟", "coverage"],
 ["ما هو تعريف الحالة الطارئة؟", "definition"],
 ["كيف يتم رفع طلب الموافقة؟", "procedure"],
 ["ما عقوبة الاحتيال؟", "penalty"],
].forEach(([q, k]) => check(`نيّة «${q.slice(0, 24)}»`, R.detectIntent(q).k, k));

check("مدة: خلال 60 دقيقة",
  R.extractFacts("تلتزم شركات التأمين بالإجابة خلال 60 دقيقة كحد أقصى").map(f => f.display),
  ["60 دقيقة"]);
check("مدة بالأرقام العربية",
  R.extractFacts("يتم الإبلاغ خلال ٢٤ ساعة من استقبال الحالة").map(f => f.display),
  ["24 ساعة"]);
check("نسبة ومبلغ معاً",
  R.extractFacts("نسبة تحمل 20% بحد أقصى 100 ريال").map(f => f.display),
  ["20٪", "100 ريال"]);
check("رفض المدد المستحيلة (تشويش استخراج)",
  R.extractFacts("خلال ٠5٠١ دقيقة كحد أقصى").map(f => f.display), []);
check("رفض الرقم ذي الصفر البادئ",
  R.extractFacts("خلال 01 دقيقة").map(f => f.display), []);
check("مطابقة العدد لمعدوده (جمع)",
  R.extractFacts("خلال 3 أيام عمل").map(f => f.display), ["3 أيام"]);
check("مطابقة العدد لمعدوده (مثنّى)",
  R.extractFacts("مدة 2 شهر").map(f => f.display), ["شهران"]);

check("حكم: حظر", R.modality("لا يجوز لشركة التأمين رفض الطلب").k, "prohibition");
check("حكم: إلزام", R.modality("يجب على مقدم الخدمة تقديم العلاج").k, "obligation");
check("حكم: استثناء", R.modality("يستثنى من ذلك الحالات الطارئة").k, "exception");
check("حكم: شرط", R.modality("يشترط إرفاق التقارير الطبية").k, "condition");
check("الفاعل", R.actor("تلتزم شركات التأمين بالرد"), "شركة التأمين");
check("الفاعل: مقدم الخدمة", R.actor("يجب على المرفق الصحي إشعار الشركة"), "مقدم الخدمة");

const rp = R.rephrase("يجب على مقدم الخدمة إبلاغ شركة التأمين خلال 24 ساعة من استقبال الحالة");
ok("إعادة الصياغة تُصدِّر بالفاعل", /^على مقدم الخدمة: /.test(rp.text), rp.text);
ok("إعادة الصياغة تحتفظ بالمعطى", rp.facts.some(f => f.display === "24 ساعة"));

check("توسيع المرادفات", R.expansions("الطوارئ").length > 0, true);

// ── (٣) القاعدة الصارمة: لا استنتاج بلا مرجع ─────────────────────────
console.log("\n٣. إسناد كل جملة إلى مرجع قائم");
const corpusPath = path.join(__dirname, "..", "chatbot", "data", "corpus.js");
if (!fs.existsSync(corpusPath)) {
  console.log("  ⚠ لا يوجد corpus.js — تُتخطّى فحوص الفهرس الحيّ");
} else {
  require(corpusPath);
  const C = global.window.CHI_CORPUS;
  const QUERIES = [
    "كم مدة الرد على طلب الموافقة المسبقة؟",
    "ماذا يجب عمله في الحالات الطارئة؟",
    "ما نسبة التحمل التي يدفعها المستفيد؟",
    "هل تشمل التغطية الحمل والولادة؟",
    "ما مدة سداد مستحقات مقدم الخدمة؟",
    "ما التزامات مقدم الخدمة في الطب الاتصالي؟",
  ];
  QUERIES.forEach((q) => {
    const res = S.search(C, q, 6);
    ok(`استرجاع «${q.slice(0, 26)}»`, res.length > 0);
    const a = R.analyze(q, res);
    const maxRef = Math.min(res.length, 4);
    a.statements.forEach((st) =>
      ok(`مرجع جملة ضمن النطاق [${st.ref}]`, st.ref >= 1 && st.ref <= maxRef));
    a.facts.forEach((f) =>
      ok(`مرجع معطى ضمن النطاق [${f.ref}]`, f.ref >= 1 && f.ref <= maxRef));
    a.inferences.forEach((inf) =>
      inf.refs.forEach((n) => ok(`مرجع استنتاج ضمن النطاق [${n}]`, n >= 1 && n <= maxRef)));
    // كل جملة مُعاد صياغتها يجب أن تكون مشتقّة من نصّ المقطع لا مؤلَّفة
    a.statements.forEach((st) => {
      const src = S.normalize(res[st.ref - 1].heading + " " + res[st.ref - 1].text);
      const core = S.normalize(st.text).split(" ").filter((w) => w.length > 3).slice(-6);
      const hits = core.filter((w) => src.indexOf(w) >= 0).length;
      ok(`جملة [${st.ref}] مشتقّة من مقطعها`, core.length === 0 || hits >= core.length * 0.6,
         st.text.slice(0, 70));
    });
  });
  ok("لا مقاطع مكرّرة حرفياً في الفهرس",
     new Set(C.passages.map((p) => p.d + "|" + p.p + "|" + p.t)).size === C.passages.length);
  const art = C.passages.reduce((a, p) => a + (p.t.match(/[اأإآ]{2}|اإل|األ|الئ|امل/g) || []).length, 0);
  const chars = C.passages.reduce((a, p) => a + p.t.length, 0);
  const rate = 1000 * art / chars;
  ok(`جودة النصّ المستخرَج (${rate.toFixed(2)} تتابع مستحيل/١٠٠٠ حرف ≤ 2)`, rate <= 2);
}

// ── (٤) جسر الحالة وطبقة التوليد ──────────────────────────────────────
console.log("\n٤. جسر الحالة من منصّة سديد");
const CASE = require(path.join(__dirname, "..", "assets", "rcm-case.js"));

{
  // كل سبب يتنبّأ به النموذج يجب أن يقابله استعلام نظاميّ — وإلا صمَت الجسر
  const bundlePath = path.join(__dirname, "..", "model", "artifacts", "model_bundle.js");
  if (fs.existsSync(bundlePath)) {
    require(bundlePath);
    const B = global.window.RCM_BUNDLE;
    const codes = (B.reason && B.reason.labels) || [];
    codes.filter((c) => c !== "OTHER" && c !== "NONE").forEach((c) =>
      ok(`سبب «${c}» له استعلام نظاميّ`, !!CASE.REASON_MAP[c]));
  } else {
    console.log("  ⚠ لا توجد حزمة النموذج — يُتخطّى فحص تغطية الأسباب");
  }

  const fakeCase = {
    savedAt: "2026-01-01T00:00:00Z",
    payload: {
      prediction_ar: "موافقة غير كاملة", threshold: 0.45,
      probabilities: { approved: 0.09, notFullyApproved: 0.91 },
      topReasons: [
        { code: "DOCUMENTATION", label: "نقص في المستندات", probability: 0.4, action: "أرفق التقرير" },
        { code: "LATE_SUBMISSION", label: "تأخر التقديم", probability: 0.2, action: "أرسل خلال المهلة" },
      ],
      shap: [{ feature: "guarantor", label: "الضامن", value: 0.42 }],
      input: { guarantor: "X", total: "1200", visitDate: "2025-03-01" },
    },
  };
  const sum = CASE.summarize(fakeCase);
  ok("الملخّص يذكر النتيجة", /موافقة غير كاملة/.test(sum), sum.slice(0, 80));
  ok("الملخّص يذكر الاحتمال", /91\.0٪/.test(sum));
  ok("الملخّص يذكر الأسباب والإجراء", /نقص في المستندات/.test(sum) && /أرفق التقرير/.test(sum));
  ok("الملخّص يذكر عوامل SHAP", /الضامن/.test(sum));

  if (fs.existsSync(corpusPath)) {
    const C2 = global.window.CHI_CORPUS;
    const plan = CASE.plan(fakeCase, C2, S, R);
    check("خطة لكل سبب", plan.length, 2);
    plan.forEach((it) => {
      ok(`«${it.label}» يسترجع نصّاً نظامياً`, it.hits.length > 0);
      ok(`«${it.label}» يطرح سؤال تحقّق`, !!it.check && it.check.length > 12);
    });
  }
}

console.log("\n٥. الطبقة التوليدية");
const LLM = require(path.join(__dirname, "..", "assets", "rcm-llm.js"));

check("مُطفأة افتراضياً", LLM.DEFAULTS.enabled, false);
check("النموذج الافتراضي", LLM.DEFAULTS.model, "claude-opus-5");
ok("جاهزية: مُطفأة ⇒ لا", !LLM.ready({ enabled: false, mode: "direct", apiKey: "k" }));
ok("جاهزية: مباشر بلا مفتاح ⇒ لا", !LLM.ready({ enabled: true, mode: "direct", apiKey: "" }));
ok("جاهزية: مباشر بمفتاح ⇒ نعم", LLM.ready({ enabled: true, mode: "direct", apiKey: "k" }));
ok("جاهزية: وسيط بعنوان ⇒ نعم", LLM.ready({ enabled: true, mode: "proxy", endpoint: "https://x/y" }));
ok("جاهزية: وسيط بلا عنوان ⇒ لا", !LLM.ready({ enabled: true, mode: "proxy", endpoint: "" }));

ok("التعليمات تُلزم بالاسترجاع قبل الحكم", /search_regulations/.test(LLM.SYSTEM));
ok("التعليمات تُلزم بذكر المرجع", /\[n\]/.test(LLM.SYSTEM));
ok("التعليمات تمنع الإكمال من المعرفة العامة", /لم أجد نصّاً/.test(LLM.SYSTEM));
check("أداة واحدة فقط", LLM.TOOLS.length, 1);
check("اسم الأداة", LLM.TOOLS[0].name, "search_regulations");
ok("مخطّط الأداة صارم",
   LLM.TOOLS[0].strict === true &&
   LLM.TOOLS[0].input_schema.additionalProperties === false &&
   LLM.TOOLS[0].input_schema.required.indexOf("query") >= 0);

if (fs.existsSync(corpusPath)) {
  const C3 = global.window.CHI_CORPUS;
  const sources = [];
  const ctx = {
    search: (q, n) => S.search(C3, q, n),
    addSource: (h) => {
      for (let i = 0; i < sources.length; i++) if (sources[i].pi === h.pi) return i + 1;
      sources.push(h); return sources.length;
    },
  };
  const out1 = LLM.runSearch(ctx, { query: "مدة الرد على طلب الموافقة المسبقة", limit: 3 });
  ok("الأداة تُعيد مقاطع مرقّمة", /^\[1\]/.test(out1), out1.slice(0, 60));
  ok("الأداة تذكر المستند والصفحة", /صفحة \d+/.test(out1));
  const before = sources.length;
  LLM.runSearch(ctx, { query: "مدة الرد على طلب الموافقة المسبقة", limit: 3 });
  check("الترقيم لا يتكرّر للمقطع نفسه", sources.length, before);
  ok("استعلام فارغ لا يكسر الأداة", /فارغ/.test(LLM.runSearch(ctx, { query: "  " })));
  ok("لا مطابقة ⇒ رسالة صريحة لا نتائج مختلقة",
     /لا توجد مقاطع مطابقة/.test(LLM.runSearch(ctx, { query: "زغردة برتقالية سيبرانية" })));
}

check("خطأ 401 مفهوم", /المفتاح غير صالح/.test(LLM.explain({ status: 401 })), true);
check("خطأ 429 مفهوم", /حدّ الطلبات/.test(LLM.explain({ status: 429 })), true);
ok("تعذّر الشبكة يقترح البوّابة",
   /بوّابة المنشأة/.test(LLM.explain({ message: "Failed to fetch" })));

// ── (٦) شكل الطلب على الشبكة وحلقة الأداة ────────────────────────────
console.log("\n٦. شكل الطلب وحلقة الأداة");
{
  // بثّ SSE مُصطنَع: دور أوّل يطلب الأداة، ودور ثانٍ يُجيب — بلا شبكة ولا مفتاح
  const sse = (events) => events
    .map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join("");

  const toolTurn = sse([
    { type: "content_block_start", index: 0,
      content_block: { type: "tool_use", id: "toolu_1", name: "search_regulations", input: {} } },
    { type: "content_block_delta", index: 0,
      delta: { type: "input_json_delta", partial_json: '{"query": "الحالات' } },
    { type: "content_block_delta", index: 0,
      delta: { type: "input_json_delta", partial_json: ' الطارئة"}' } },
    { type: "content_block_stop", index: 0 },
    { type: "message_delta", delta: { stop_reason: "tool_use" } },
    { type: "message_stop" },
  ]);
  const textTurn = sse([
    { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
    { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "يجب الإبلاغ " } },
    { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "خلال ٢٤ ساعة [1]." } },
    { type: "content_block_stop", index: 0 },
    { type: "message_delta", delta: { stop_reason: "end_turn" } },
    { type: "message_stop" },
  ]);

  const calls = [];
  const bodyOf = (text) => ({
    ok: true,
    body: {
      getReader() {
        let done = false;
        return { read() {
          if (done) return Promise.resolve({ done: true });
          done = true;
          return Promise.resolve({ done: false, value: new TextEncoder().encode(text) });
        } };
      },
    },
  });
  global.fetch = (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    return Promise.resolve(bodyOf(calls.length === 1 ? toolTurn : textTurn));
  };

  const C4 = fs.existsSync(corpusPath) ? global.window.CHI_CORPUS : null;
  const srcs = [];
  const ctx = {
    search: (q, n) => (C4 ? S.search(C4, q, n) : []),
    addSource: (h) => { srcs.push(h); return srcs.length; },
  };
  const streamed = [];
  const cfg = { enabled: true, mode: "direct", endpoint: "https://api.anthropic.com/v1/messages",
                apiKey: "sk-test", model: "claude-opus-5", effort: "high" };

  return LLM.ask(cfg, [{ role: "user", content: "ماذا أفعل في الحالة الطارئة؟" }], ctx,
                 { onText: (t) => streamed.push(t) })
    .then((res) => {
      check("دورتان: أداة ثم إجابة", calls.length, 2);
      const b0 = calls[0].body, h0 = calls[0].init.headers;
      check("النموذج", b0.model, "claude-opus-5");
      check("البثّ مفعّل", b0.stream, true);
      check("التفكير المتكيّف", b0.thinking.type, "adaptive");
      check("عمق التفكير", b0.output_config.effort, "high");
      ok("لا budget_tokens (مرفوض على Opus 5)", b0.thinking.budget_tokens === undefined);
      check("أداة واحدة معرَّفة", b0.tools.length, 1);
      ok("التعليمات مُخزَّنة مؤقتاً", b0.system[0].cache_control.type === "ephemeral");
      check("إصدار الواجهة", h0["anthropic-version"], "2023-06-01");
      check("المفتاح في الترويسة", h0["x-api-key"], "sk-test");
      ok("إقرار الاستدعاء من متصفّح",
         h0["anthropic-dangerous-direct-browser-access"] === "true");
      ok("طلب الاحتياط عند الرفض", calls[0].body.fallbacks === "default");
      ok("ترويسة بيتا الاحتياط مطابقة للصيغة",
         h0["anthropic-beta"] === "server-side-fallback-2026-07-01");

      const b1 = calls[1].body;
      const last = b1.messages[b1.messages.length - 1];
      check("نتيجة الأداة تعود في رسالة مستخدم", last.role, "user");
      check("كتلة النتيجة", last.content[0].type, "tool_result");
      check("معرّف الاستدعاء مربوط", last.content[0].tool_use_id, "toolu_1");
      ok("مدخلات الأداة حُلِّلت بـ JSON لا بمطابقة نصّية",
         /الحالات الطارئة/.test(String(last.content[0].content).slice(0, 400)) ||
         !C4);
      check("النصّ وصل مبثوثاً", streamed.join(""), "يجب الإبلاغ خلال ٢٤ ساعة [1].");
      check("النصّ النهائي", res.text, "يجب الإبلاغ خلال ٢٤ ساعة [1].");
      ok("التاريخ يحمل الأدوار كلّها", res.messages.length === 4, String(res.messages.length));
      delete global.fetch;

      console.log(`\n${fail === 0 ? "✔" : "✗"} ${pass} ناجحاً · ${fail} فاشلاً`);
      process.exit(fail === 0 ? 0 : 1);
    });
}
