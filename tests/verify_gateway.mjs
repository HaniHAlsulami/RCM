/*!
 * verify_gateway.mjs — تحقّق من منطق بوّابة gateway/worker.js
 *
 * يستدعي المُعالجين مباشرةً (Request/Response متوفران في Node 22)
 * ويصطنع نداء Google — فيُختبر على كلا الصيغتين (Cloudflare/Deno وVercel):
 * قفل المصدر، وحصر المسارات والنماذج، وحقن المفتاح خادمياً، وتمرير البثّ،
 * وسقف الحجم.
 *
 *     node tests/verify_gateway.mjs
 */
import worker, { SETTINGS as WORKER_SETTINGS } from "../gateway/worker.js";
import vercelHandler, { SETTINGS as VERCEL_SETTINGS } from "../api/gemini/[...path].js";

let pass = 0, fail = 0;
const ok = (name, cond, detail) => {
  if (cond) { pass++; return; }
  fail++; console.log(`  ✗ ${name}${detail ? "\n      " + detail : ""}`);
};

const ENV = { GEMINI_API_KEY: "secret-key-on-server" };
const ORIGIN = "https://hanihalsulami.github.io";

// المُعالجان بواجهة موحّدة: (path, opts, envOverride) ⇒ Response
const TARGETS = [
  {
    name: "Cloudflare/Deno worker",
    base: "https://gw.example.workers.dev",
    prefix: "",
    call: (request, env) => worker.fetch(request, env),
    settings: WORKER_SETTINGS,
  },
  {
    name: "Vercel edge function",
    base: "https://sadeed.vercel.app",
    prefix: "/api/gemini",
    call: (request, env) => {
      const saved = process.env.GEMINI_API_KEY;
      const savedO = process.env.ALLOWED_ORIGINS;
      if (env.GEMINI_API_KEY) process.env.GEMINI_API_KEY = env.GEMINI_API_KEY;
      else delete process.env.GEMINI_API_KEY;
      delete process.env.ALLOWED_ORIGINS;
      const done = (r) => {
        if (saved !== undefined) process.env.GEMINI_API_KEY = saved;
        if (savedO !== undefined) process.env.ALLOWED_ORIGINS = savedO;
        return r;
      };
      return vercelHandler(request).then(done);
    },
    settings: VERCEL_SETTINGS,
  },
];

let upstreamCall = null;
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  upstreamCall = { url: String(url), headers: init.headers, method: init.method };
  return new Response('data: {"ok":true}\n\n', {
    status: 200, headers: { "content-type": "text/event-stream" },
  });
};

for (const T of TARGETS) {
  console.log(`— ${T.name}`);
  const PATH = T.prefix +
    "/v1beta/models/gemini-flash-latest:streamGenerateContent?alt=sse";
  const req = (path, { origin = ORIGIN, method = "POST", headers = {}, body } = {}) =>
    new Request(T.base + path, {
      method,
      headers: { "content-type": "application/json", Origin: origin, ...headers },
      body: method === "POST" ? (body || "{}") : undefined,
    });
  upstreamCall = null;

// ١. الطلب التمهيدي CORS
let r = await T.call(req(PATH, { method: "OPTIONS" }), ENV);
ok("OPTIONS ⇒ 204", r.status === 204);
ok("CORS يعكس المصدر المسموح",
   r.headers.get("Access-Control-Allow-Origin") === ORIGIN);

// ٢. قفل المصدر
r = await T.call(req(PATH, { origin: "https://evil.example" }), ENV);
ok("مصدر غريب ⇒ 403", r.status === 403);
ok("لا نداء لـ Google عند الرفض", upstreamCall === null);

// ٣. حصر المسار والنموذج
r = await T.call(req(T.prefix + "/v1beta/models/gemini-flash-latest:countTokens"), ENV);
ok("نداء غير مدعوم ⇒ 404", r.status === 404);
r = await T.call(req(T.prefix + "/v1beta/models/gemini-9-secret:generateContent"), ENV);
ok("نموذج غير مسموح ⇒ 403", r.status === 403);
r = await T.call(req(T.prefix + "/v1beta/files:upload"), ENV);
ok("مسار عشوائي ⇒ 404", r.status === 404);

// ٤. سقف حجم الطلب
r = await T.call(req(PATH, { headers: { "content-length": "9999999" } }), ENV);
ok("طلب ضخم ⇒ 413", r.status === 413);

// ٥. غياب السرّ ⇒ خطأ صريح لا نداء
r = await T.call(req(PATH), {});
ok("بلا سرّ ⇒ 500", r.status === 500);
ok("لا نداء لـ Google بلا سرّ", upstreamCall === null);

// ٦. المسار السليم: حقن المفتاح خادمياً وتمرير البثّ
r = await T.call(req(PATH, { body: '{"contents":[]}' }), ENV);
ok("نجاح ⇒ 200", r.status === 200);
ok("النداء وصل لـ Google", !!upstreamCall &&
   upstreamCall.url.startsWith("https://generativelanguage.googleapis.com/v1beta/models/"));
ok("alt=sse مُرّر", upstreamCall.url.includes("alt=sse"));
ok("المفتاح حُقن خادمياً",
   upstreamCall.headers["x-goog-api-key"] === "secret-key-on-server");
ok("نوع المحتوى بثّ", r.headers.get("content-type") === "text/event-stream");
ok("CORS على الردّ", r.headers.get("Access-Control-Allow-Origin") === ORIGIN);
const body = await r.text();
ok("جسد البثّ مُرّر كما هو", body === 'data: {"ok":true}\n\n');
ok("المسار الأصلي وصل لـ Google بلا بادئة الدالة",
   upstreamCall.url ===
   "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:streamGenerateContent?alt=sse");

// ٧. المفتاح المكتوب داخل الملف: يعمل بلا متغيرات بيئة، والبيئة تغلبه إن وُجدت
T.settings.EMBEDDED_GEMINI_KEY = "written-in-backend";
r = await T.call(req(PATH, { body: '{"contents":[]}' }), {});
ok("المفتاح المكتوب داخل الملف يكفي وحده", r.status === 200);
ok("وهو الذي حُقن لـ Google",
   upstreamCall.headers["x-goog-api-key"] === "written-in-backend");
r = await T.call(req(PATH, { body: '{"contents":[]}' }), ENV);
ok("متغيّر البيئة مقدَّم على المكتوب",
   upstreamCall.headers["x-goog-api-key"] === "secret-key-on-server");
T.settings.EMBEDDED_GEMINI_KEY = "";
}

globalThis.fetch = realFetch;
console.log(`${fail === 0 ? "✔" : "✗"} بوّابة: ${pass} ناجحاً · ${fail} فاشلاً`);
process.exit(fail === 0 ? 0 : 1);
