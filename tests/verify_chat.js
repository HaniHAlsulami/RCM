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

console.log(`\n${fail === 0 ? "✔" : "✗"} ${pass} ناجحاً · ${fail} فاشلاً`);
process.exit(fail === 0 ? 0 : 1);
