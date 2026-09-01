/*!
 * rcm-audit.js — تتبّع السلوك والاستجابة (Audit Trail) + لوحة القيادة (Admin)
 * منصّة مُتَنَبِّئ نماء · تجمع مكة المكرمة الصحي · إدارة أداء تنمية الإيرادات
 *
 * وحدة مشتركة لصفحتي الموافقات والمطالبات:
 *   • تسجّل جلسات التنبؤ عالية الخطر واستجابة المستخدم (تطبيق الإجراء / تجاهل)
 *     في Google Sheets عبر تطبيق ويب Google Apps Script (audit/Code.gs).
 *   • تضيف تبويب «🛡 لوحة القيادة» محمياً برقم سري يعرض المقاييس التراكمية
 *     من جميع الأجهزة.
 *
 * ▸ أين أضع رابط Web App؟ في assets/site-config.js:
 *     window.NAMAA_AUDIT = { url: "https://script.google.com/macros/s/XXXX/exec" };
 *   ما دام الرابط فارغاً تبقى الميزة صامتة تماماً (لا أزرار ولا إرسال).
 *
 * الخصوصية: لا يُرسَل أي معرّف شخصي — فقط أرقام الخطر وقيمة الفاتورة ونوع
 * الاستجابة ومعرّف جهاز عشوائي. والرقم السري للوحة حاجز تنظيمي لا حماية
 * حقيقية: كل ما في موقع ثابت قابل للقراءة، فلا تضع في الشيت ما هو سرّي فعلاً.
 */
(function () {
  "use strict";

  var CFG = window.NAMAA_AUDIT || {};
  var URL_ = (CFG.url || "").trim();
  var TOKEN = CFG.token || "";
  // SHA-256 للرقم السري (الافتراضي: Admin2026). لتغييره: نفّذ في Console
  //   RCMAudit.hash("رقمك الجديد").then(console.log)
  // وضع الناتج في site-config.js: window.NAMAA_AUDIT = { ..., pinHash: "..." }
  var PIN_HASH = CFG.pinHash || "059a50ce956b7ec61527c7ecc0c55b5a009dc54ab4acddce8852b46baa2aba30";

  var $ = function (id) { return document.getElementById(id); };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g,
    function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function fmt(n, d) { d = d == null ? 0 : d;
    return (isFinite(n) ? n : 0).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }); }

  // ══════════════════════════════════════════════════════════════
  // 1. الجلسة والجهاز
  // ══════════════════════════════════════════════════════════════
  function deviceId() {
    try {
      var id = localStorage.getItem("namaa.device");
      if (!id) {
        id = "D-" + Math.random().toString(36).slice(2, 10).toUpperCase();
        localStorage.setItem("namaa.device", id);
      }
      return id;
    } catch (e) { return "D-UNKNOWN"; }
  }

  // جلسة واحدة = حالة يعمل عليها المستخدم: تبدأ بأول تنبؤ وتنتهي بالاستجابة.
  var SESSION = null;

  function newRef() {
    return "NA-" + Date.now().toString(36).toUpperCase() +
           Math.random().toString(36).slice(2, 5).toUpperCase();
  }

  // ══════════════════════════════════════════════════════════════
  // 2. الإرسال — fetch إلى Web App URL بترويسة text/plain
  //    (طلب «بسيط» بلا CORS preflight، وهو ما تتطلبه تطبيقات Apps Script)
  //    الفشل لا يُفقد الحدث: يُصفّ في localStorage ويُعاد إرساله لاحقاً.
  // ══════════════════════════════════════════════════════════════
  var QKEY = "namaa.audit.queue";

  function post(payload) {
    if (!URL_) return Promise.resolve(false);
    payload.token = TOKEN || undefined;
    return fetch(URL_, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload),
      redirect: "follow",
    }).then(function (r) { return r.ok; })
      .catch(function () { enqueue(payload); return false; });
  }

  function enqueue(payload) {
    try {
      var q = JSON.parse(localStorage.getItem(QKEY) || "[]");
      q.push(payload);
      localStorage.setItem(QKEY, JSON.stringify(q.slice(-50)));
    } catch (e) { /* التخزين ممتلئ — يُتجاوز */ }
  }

  function flushQueue() {
    if (!URL_) return;
    var q;
    try { q = JSON.parse(localStorage.getItem(QKEY) || "[]"); } catch (e) { return; }
    if (!q.length) return;
    try { localStorage.removeItem(QKEY); } catch (e) { /* */ }
    q.forEach(function (p) { post(p); });
  }

  function eventPayload(response) {
    return {
      ref: SESSION.ref,
      stage: SESSION.stage,
      initialRisk: Math.round(SESSION.initialRisk * 1000) / 10,   // نسبة مئوية
      finalRisk: Math.round(SESSION.finalRisk * 1000) / 10,
      amount: isFinite(SESSION.amount) ? Math.round(SESSION.amount * 100) / 100 : "",
      response: response,
      device: deviceId(),
    };
  }

  // ══════════════════════════════════════════════════════════════
  // 3. منطق التتبّع — تستدعيه صفحتا التنبؤ بعد كل تنبّؤ يدوي
  // ══════════════════════════════════════════════════════════════
  /**
   * onPredict(stage, risk, amount, threshold)
   *   stage: "approvals" | "claims" · risk: احتمال عدم الاكتمال 0..1
   * أول تنبؤ يفتح جلسة ويُسجَّل صفاً بنوع "prediction"؛ التنبؤات التالية
   * تحدّث الخطر النهائي فقط (المستخدم يحسّن مدخلاته قبل أن يستجيب).
   */
  function onPredict(stage, risk, amount, threshold) {
    if (!URL_) return;
    if (!SESSION || SESSION.stage !== stage || SESSION.responded) {
      SESSION = { ref: newRef(), stage: stage, initialRisk: risk,
                  finalRisk: risk, amount: amount, threshold: threshold, responded: false };
      post(eventPayload("prediction"));
    } else {
      SESSION.finalRisk = risk;
      if (isFinite(amount)) SESSION.amount = amount;
    }
    renderButtons(risk, threshold);
  }

  function respond(type) {
    if (!SESSION || SESSION.responded) return;
    SESSION.responded = true;
    post(eventPayload(type));
    var box = $("auditBox");
    if (box) box.innerHTML = '<div class="tip ok" style="margin-top:10px"><strong>' +
      (type === "applied" ? "✅ سُجِّل تطبيق الإجراء" : "✖ سُجِّل التجاهل") +
      "</strong> — شكراً، استجابتك تُحسِّن قياس أثر المنصّة.</div>";
  }

  /** أزرار الاستجابة تحت بطاقة النتيجة — تظهر فقط حين يتجاوز الخطر العتبة */
  function renderButtons(risk, threshold) {
    var card = $("result");
    if (!card) return;
    var box = $("auditBox");
    if (!box) {
      box = document.createElement("div");
      box.id = "auditBox";
      card.appendChild(box);
    }
    if (risk < (threshold || 0.5) || SESSION.responded) { box.innerHTML = ""; return; }
    box.innerHTML =
      '<div style="margin-top:12px;padding-top:12px;border-top:1px dashed var(--border)">' +
      '<div style="font-size:12px;color:var(--muted2);margin-bottom:8px">📋 <b>تتبّع الاستجابة:</b> ' +
      "ما قرارك حيال هذا الإنذار؟ (يُسجَّل مجهولاً لقياس أثر المنصّة)</div>" +
      '<div class="btn-row" style="margin-top:0">' +
      '<button class="btn ghost" id="auditApply" style="border-color:var(--green);color:var(--green)">✅ سأطبّق الإجراء المقترح</button>' +
      '<button class="btn ghost" id="auditIgnore">✖ تجاهُل والمتابعة كما هو</button>' +
      "</div></div>";
    $("auditApply").onclick = function () { respond("applied"); };
    $("auditIgnore").onclick = function () { respond("ignored"); };
  }

  // ══════════════════════════════════════════════════════════════
  // 4. تبويب «لوحة القيادة» المحمي برقم سري
  // ══════════════════════════════════════════════════════════════
  function sha256(text) {
    return crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))
      .then(function (buf) {
        return Array.prototype.map.call(new Uint8Array(buf), function (b) {
          return b.toString(16).padStart(2, "0");
        }).join("");
      });
  }

  function addTab() {
    var tabs = $("tabs");
    if (!tabs) return;
    var btn = document.createElement("button");
    btn.className = "tab";
    btn.dataset.p = "admin";
    btn.textContent = "🛡 لوحة القيادة";
    tabs.appendChild(btn);

    var panel = document.createElement("div");
    panel.className = "panel";
    panel.id = "p-admin";
    panel.innerHTML = '<div id="adminBody"></div>';
    var app = $("app");
    if (app) app.appendChild(panel);

    btn.onclick = function () {
      document.querySelectorAll(".tab").forEach(function (x) { x.classList.remove("active"); });
      document.querySelectorAll(".panel").forEach(function (x) { x.classList.remove("active"); });
      btn.classList.add("active");
      panel.classList.add("active");
      renderAdmin();
    };
  }

  var AUTHED = false;
  try { AUTHED = sessionStorage.getItem("namaa.admin") === "1"; } catch (e) { /* */ }

  function renderAdmin() {
    var host = $("adminBody");
    if (!URL_) {
      host.innerHTML = '<div class="card"><div class="sec-label">🛡 لوحة القيادة</div>' +
        '<div class="note"><b>لم يُضبط رابط سجلّ التتبّع بعد.</b> انشر الواجهة الخلفية ' +
        "(<code>audit/Code.gs</code>) تطبيقَ ويب على Google Apps Script كما في " +
        "<code>audit/README.md</code>، ثم ضع الرابط في <code>assets/site-config.js</code>:<br><br>" +
        "<code>window.NAMAA_AUDIT = { url: \"https://script.google.com/macros/s/…/exec\" };</code></div></div>";
      return;
    }
    if (!AUTHED) { renderPin(host); return; }
    renderDashboard(host);
  }

  function renderPin(host) {
    host.innerHTML =
      '<div class="card" style="max-width:420px;margin:30px auto;text-align:center">' +
      '<div style="font-size:38px;margin-bottom:8px">🛡</div>' +
      '<div style="font-weight:700;font-size:15px;margin-bottom:4px">لوحة القيادة — الإدارة</div>' +
      '<div style="font-size:12px;color:var(--muted2);margin-bottom:14px">أدخل الرقم السري للاطّلاع على المقاييس التراكمية</div>' +
      '<input type="password" id="adminPin" placeholder="الرقم السري" autocomplete="off" ' +
        'style="width:100%;padding:11px;border:1px solid var(--border);border-radius:9px;background:var(--surface);' +
        'color:var(--text);font-family:inherit;font-size:14px;text-align:center;letter-spacing:2px">' +
      '<div id="pinErr" style="color:var(--red);font-size:12px;min-height:20px;margin-top:6px"></div>' +
      '<button class="btn" id="pinGo" style="margin-top:4px">دخول</button></div>';
    function tryPin() {
      var v = $("adminPin").value || "";
      sha256(v).then(function (h) {
        if (h === PIN_HASH) {
          AUTHED = true;
          try { sessionStorage.setItem("namaa.admin", "1"); } catch (e) { /* */ }
          renderDashboard($("adminBody"));
        } else {
          $("pinErr").textContent = "رقم سري غير صحيح";
          $("adminPin").value = "";
        }
      });
    }
    $("pinGo").onclick = tryPin;
    $("adminPin").addEventListener("keydown", function (e) { if (e.key === "Enter") tryPin(); });
    $("adminPin").focus();
  }

  // ── جلب البيانات وحساب المقاييس ──
  function fetchRows() {
    var u = URL_ + (TOKEN ? (URL_.indexOf("?") < 0 ? "?" : "&") + "token=" + encodeURIComponent(TOKEN) : "");
    return fetch(u, { redirect: "follow" })
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(function (j) {
        if (!j.ok) throw new Error(j.error || "استجابة غير متوقعة");
        return j.rows || [];
      });
  }

  function kpis(rows) {
    var predictions = 0, applied = 0, ignored = 0, salvaged = 0, atRiskIgnored = 0;
    var devices = {};
    rows.forEach(function (r) {
      devices[r.device] = 1;
      if (r.response === "prediction") predictions++;
      else if (r.response === "applied") {
        applied++;
        // الإيراد المستنقذ: انخفاض الخطر بين أول تنبؤ والاستجابة × قيمة الفاتورة
        var drop = Math.max(0, (r.initialRisk - r.finalRisk) / 100);
        salvaged += drop * (r.amount || 0);
      } else if (r.response === "ignored") {
        ignored++;
        atRiskIgnored += (r.finalRisk / 100) * (r.amount || 0);
      }
    });
    var respTotal = applied + ignored;
    return {
      predictions: predictions, applied: applied, ignored: ignored,
      salvaged: salvaged, atRiskIgnored: atRiskIgnored,
      compliance: respTotal ? applied / respTotal : null,
      devices: Object.keys(devices).length,
    };
  }

  function kpiCard(k, v, s, color) {
    return '<div class="box"><div class="k">' + esc(k) + '</div>' +
      '<div class="v" style="' + (color ? "color:" + color : "") + '">' + v + "</div>" +
      '<div class="s">' + esc(s || "") + "</div></div>";
  }

  var RESP_AR = { prediction: "تنبؤ", applied: "تطبيق الإجراء", ignored: "تجاهل" };
  var STAGE_AR = { approvals: "موافقات", claims: "مطالبات" };

  function renderDashboard(host) {
    host.innerHTML = '<div class="card"><div class="loading" style="padding:30px">' +
      '<div class="spin"></div>جارٍ جلب البيانات التراكمية من جميع الأجهزة…</div></div>';
    fetchRows().then(function (rows) {
      var K = kpis(rows);
      var h = '<div class="card"><div class="sec-label">🛡 لوحة القيادة — المقاييس التراكمية عبر جميع الأجهزة</div>';
      h += '<div class="kv">';
      h += kpiCard("إجمالي التنبؤات المنفَّذة", fmt(K.predictions),
                   "جلسة تنبؤ عبر " + fmt(K.devices) + " جهازاً");
      h += kpiCard("الإيرادات المستنقَذة", fmt(K.salvaged) + " ﷼",
                   "انخفاض الخطر × قيمة الفاتورة للإجراءات المطبَّقة", "var(--green)");
      h += kpiCard("معدل الاستجابة العام", K.compliance == null ? "—" : fmt(K.compliance * 100, 1) + "%",
                   "تطبيق الإجراء ÷ (تطبيق + تجاهل)", "var(--accent)");
      h += kpiCard("الطلبات المتجاهَلة", fmt(K.ignored),
                   "قيمتها المعرّضة للخطر " + fmt(K.atRiskIgnored) + " ﷼", "var(--red)");
      h += "</div>";
      h += '<div class="btn-row" style="justify-content:flex-start">' +
        '<button class="btn ghost" id="adminRefresh">🔄 تحديث</button>' +
        '<button class="btn ghost" id="adminLogout">🚪 خروج</button></div>';
      h += "</div>";

      // أحدث الأحداث
      h += '<div class="card"><div class="sec-label">🕓 أحدث الأحداث (' + fmt(rows.length) + " حدثاً مسجَّلاً)</div>";
      if (!rows.length) {
        h += '<div class="note">لا أحداث بعد — ستظهر هنا فور أول تنبؤ أو استجابة من أي جهاز.</div>';
      } else {
        h += '<div class="tbl-wrap"><table><tr><th>الوقت</th><th>المرجع</th><th>المرحلة</th>' +
          "<th>الخطر الأولي</th><th>النهائي</th><th>الفاتورة</th><th>الاستجابة</th></tr>";
        rows.slice(-15).reverse().forEach(function (r) {
          var col = r.response === "applied" ? "var(--green)" : r.response === "ignored" ? "var(--red)" : "var(--muted2)";
          h += "<tr><td>" + esc(String(r.ts).replace("T", " ").slice(0, 16)) + "</td>" +
            "<td>" + esc(r.ref) + "</td><td>" + esc(STAGE_AR[r.stage] || r.stage) + "</td>" +
            "<td>" + fmt(r.initialRisk, 1) + "%</td><td>" + fmt(r.finalRisk, 1) + "%</td>" +
            "<td>" + fmt(r.amount) + "</td>" +
            '<td style="color:' + col + ';font-weight:700">' + esc(RESP_AR[r.response] || r.response) + "</td></tr>";
        });
        h += "</table></div>";
      }
      h += '<div class="note">المصدر: Google Sheets عبر Apps Script — البيانات مجهولة ' +
        "(لا أسماء ولا هويات)، والرقم السري حاجز تنظيمي لا حماية تقنية لبيانات حساسة.</div></div>";

      host.innerHTML = h;
      $("adminRefresh").onclick = function () { renderDashboard(host); };
      $("adminLogout").onclick = function () {
        AUTHED = false;
        try { sessionStorage.removeItem("namaa.admin"); } catch (e) { /* */ }
        renderAdmin();
      };
    }).catch(function (e) {
      host.innerHTML = '<div class="card"><div class="err"><b>تعذّر جلب البيانات:</b> ' + esc(e.message) +
        "<br><br>تحقّق من أن تطبيق الويب منشور بوصول <b>Anyone</b> وأن الرابط في " +
        "<code>assets/site-config.js</code> ينتهي بـ<code>/exec</code>.</div>" +
        '<div class="btn-row"><button class="btn ghost" id="adminRetry">🔄 إعادة المحاولة</button></div></div>';
      $("adminRetry").onclick = function () { renderDashboard(host); };
    });
  }

  // ══════════════════════════════════════════════════════════════
  // 5. الإقلاع
  // ══════════════════════════════════════════════════════════════
  function boot() {
    addTab();
    flushQueue();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();

  window.RCMAudit = { onPredict: onPredict, respond: respond, hash: sha256,
                      enabled: function () { return !!URL_; } };
})();
