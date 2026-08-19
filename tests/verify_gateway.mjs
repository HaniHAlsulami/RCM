/*!
 * verify_gateway.mjs — تحقّق من منطق بوّابة gateway/worker.js
 *
 * يستدعي مُعالج الـ Worker مباشرةً (Request/Response متوفران في Node 22)
 * ويصطنع نداء Google — فيُختبر: قفل المصدر، وحصر المسارات والنماذج،
 * وحقن المفتاح خادمياً، وتمرير البثّ، وسقف الحجم.
 *
 *     node tests/verify_gateway.mjs
 */
import worker from "../gateway/worker.js";

let pass = 0, fail = 0;
const ok = (name, cond, detail) => {
  if (cond) { pass++; return; }
  fail++; console.log(`  ✗ ${name}${detail ? "\n      " + detail : ""}`);
};

const ENV = { GEMINI_API_KEY: "secret-key-on-server" };
const ORIGIN = "https://hanihalsulami.github.io";
const BASE = "https://gw.example.workers.dev";
const PATH = "/v1beta/models/gemini-flash-latest:streamGenerateContent?alt=sse";

const req = (path, { origin = ORIGIN, method = "POST", headers = {}, body } = {}) =>
  new Request(BASE + path, {
    method,
    headers: { "content-type": "application/json", Origin: origin, ...headers },
    body: method === "POST" ? (body || "{}") : undefined,
  });

let upstreamCall = null;
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  upstreamCall = { url: String(url), headers: init.headers, method: init.method };
  return new Response('data: {"ok":true}\n\n', {
    status: 200, headers: { "content-type": "text/event-stream" },
  });
};

// ١. الطلب التمهيدي CORS
let r = await worker.fetch(req(PATH, { method: "OPTIONS" }), ENV);
ok("OPTIONS ⇒ 204", r.status === 204);
ok("CORS يعكس المصدر المسموح",
   r.headers.get("Access-Control-Allow-Origin") === ORIGIN);

// ٢. قفل المصدر
r = await worker.fetch(req(PATH, { origin: "https://evil.example" }), ENV);
ok("مصدر غريب ⇒ 403", r.status === 403);
ok("لا نداء لـ Google عند الرفض", upstreamCall === null);

// ٣. حصر المسار والنموذج
r = await worker.fetch(req("/v1beta/models/gemini-flash-latest:countTokens"), ENV);
ok("نداء غير مدعوم ⇒ 404", r.status === 404);
r = await worker.fetch(req("/v1beta/models/gemini-9-secret:generateContent"), ENV);
ok("نموذج غير مسموح ⇒ 403", r.status === 403);
r = await worker.fetch(req("/v1beta/files:upload"), ENV);
ok("مسار عشوائي ⇒ 404", r.status === 404);

// ٤. سقف حجم الطلب
r = await worker.fetch(req(PATH, { headers: { "content-length": "9999999" } }), ENV);
ok("طلب ضخم ⇒ 413", r.status === 413);

// ٥. غياب السرّ ⇒ خطأ صريح لا نداء
r = await worker.fetch(req(PATH), {});
ok("بلا سرّ ⇒ 500", r.status === 500);
ok("لا نداء لـ Google بلا سرّ", upstreamCall === null);

// ٦. المسار السليم: حقن المفتاح خادمياً وتمرير البثّ
r = await worker.fetch(req(PATH, { body: '{"contents":[]}' }), ENV);
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

globalThis.fetch = realFetch;
console.log(`${fail === 0 ? "✔" : "✗"} بوّابة: ${pass} ناجحاً · ${fail} فاشلاً`);
process.exit(fail === 0 ? 0 : 1);
