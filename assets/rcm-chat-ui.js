/*!
 * rcm-chat-ui.js — واجهة المساعد المرجعي
 * منصّة سديد · تجمع مكة المكرمة الصحي · إدارة أداء تنمية الإيرادات
 */
(function () {
  "use strict";

  var C = window.CHI_CORPUS, S = window.RCMChat;
  var $ = function (id) { return document.getElementById(id); };

  var SUGGESTIONS = [
    "الحالات الطارئة",
    "مدة الرد على طلب الموافقة المسبقة",
    "حقوق المستفيد من التأمين الصحي",
    "التغطية التأمينية للحمل والولادة",
    "مدة سداد مستحقات مقدم الخدمة",
    "التحديدات والاستثناءات",
  ];

  function esc(s) { return S.escapeHtml(s); }

  // ────────────────────────────────────────────────────────────────
  // مؤشّر الثقة: مبنيّ على تغطية كلمات السؤال وفارق الصدارة عن التالي.
  // يُصارح المستخدم حين تكون المطابقة ضعيفة بدل أن يقدّم نتيجة واثقة زوراً.
  // ────────────────────────────────────────────────────────────────
  function confidence(res) {
    if (!res.length) return { k: "lo", t: "لا مطابقة" };
    var top = res[0];
    var gap = res.length > 1 ? top.score / Math.max(res[1].score, 0.01) : 2;
    if (top.coverage >= 0.75 && top.score > 9) return { k: "hi", t: "مطابقة قوية" };
    if (top.coverage >= 0.5 || gap > 1.6) return { k: "md", t: "مطابقة جزئية" };
    return { k: "lo", t: "مطابقة ضعيفة" };
  }

  function hitHtml(r, i, query) {
    var img = S.pageImage(r);
    var art = r.heading && r.heading.length > 3
      ? '<span class="art">' + esc(r.heading) + "</span>" : "";
    return '<div class="hit">' +
      '<div class="src"><span class="rank">' + (i + 1) + "</span>" +
        '<span class="meta"><span class="doct">' + esc(r.doc.title) + "</span>" +
        '<span class="pageno">صفحة ' + r.page + " من " + r.doc.pages +
          (r.doc.ocr_pages ? " · نصّ مقروء ضوئياً" : "") + "</span></span></div>" +
      art +
      '<div class="quote">' + S.highlight(r.text, query) + "</div>" +
      '<a class="shot" href="' + img + '" data-cap="' + esc(r.doc.title) + " — صفحة " + r.page + '">' +
        '<img loading="lazy" src="' + img + '" alt="صورة صفحة ' + r.page + '">' +
        '<span class="cap">📄 صورة المصدر — صفحة ' + r.page + " · اضغط للتكبير</span></a>" +
      "</div>";
  }

  function render(query) {
    var res = S.search(C, query, 5);
    var chat = $("chat");

    var q = document.createElement("div");
    q.className = "msg q";
    q.innerHTML = '<div class="bubble">' + esc(query) + "</div>";
    chat.appendChild(q);

    var a = document.createElement("div");
    a.className = "msg";

    if (!res.length) {
      a.innerHTML = '<div class="ans"><div class="hit">' +
        '<div class="quote">لم أجد نصّاً مطابقاً في المراجع المفهرسة. ' +
        "جرّب صياغة أقرب لمصطلحات اللائحة — مثل «الموافقة المسبقة» أو «الحالات الطارئة» " +
        "أو «التحديدات والاستثناءات» — أو ابحث برقم المادة.</div></div></div>";
      chat.appendChild(a);
      scrollTo(a);
      return;
    }

    var conf = confidence(res);
    var main = res.slice(0, 2), rest = res.slice(2);

    var h = '<div class="ans">' +
      '<div class="lead"><span>عُثر على <b>' + res.length +
        "</b> مقطعاً في <b>" + new Set(res.map(function (r) { return r.doc.id; })).size +
        ' مستنداً</b> — النصّ منقول حرفياً من المرجع</span>' +
      '<span class="conf ' + conf.k + '">' + conf.t + "</span></div>";

    main.forEach(function (r, i) { h += hitHtml(r, i, query); });

    if (rest.length) {
      h += '<details class="more"><summary>مراجع إضافية (' + rest.length + ")</summary><ol>";
      rest.forEach(function (r) {
        h += "<li><b>" + esc(r.doc.title) + "</b> — صفحة " + r.page +
          '<br><a href="' + S.pageImage(r) + '" class="shotlink" ' +
          'data-cap="' + esc(r.doc.title) + " — صفحة " + r.page + '">عرض صورة الصفحة</a>' +
          " · " + esc(r.text.slice(0, 130)) + "…</li>";
      });
      h += "</ol></details>";
    }
    h += "</div>";
    a.innerHTML = h;
    chat.appendChild(a);
    scrollTo(a);
  }

  function scrollTo(el) {
    setTimeout(function () {
      el.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 40);
  }

  // ── معاينة صورة الصفحة ──
  function initLightbox() {
    var lb = $("lb"), img = lb.querySelector("img"), cap = lb.querySelector(".lbcap");
    document.addEventListener("click", function (e) {
      var a = e.target.closest(".shot, .shotlink");
      if (a) {
        e.preventDefault();
        img.src = a.getAttribute("href");
        cap.textContent = a.getAttribute("data-cap") || "";
        lb.classList.add("on");
        return;
      }
      if (e.target.closest("#lb")) lb.classList.remove("on");
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") lb.classList.remove("on");
    });
  }

  function initRefs() {
    $("refsSub").textContent =
      C.docs.length + " مستنداً · " +
      C.docs.reduce(function (a, d) { return a + d.pages; }, 0) + " صفحة · " +
      C.N + " مقطعاً مفهرساً · حُدِّث في " + C.generated_at;
    $("refsList").innerHTML = C.docs.map(function (d) {
      return "<li>" + esc(d.title) +
        '<span class="n">' + d.pages + " صفحة" +
        (d.ocr_pages ? " · " + d.ocr_pages + " مقروءة ضوئياً" : "") + "</span></li>";
    }).join("");
  }

  function initEmpty() {
    $("chat").innerHTML =
      '<div class="empty">اطرح سؤالك عن اللوائح والأنظمة، وسيعرض المساعد النصّ' +
      " من مصدره مع صورة الصفحة." +
      '<div class="sugg">' + SUGGESTIONS.map(function (s) {
        return "<button>" + esc(s) + "</button>";
      }).join("") + "</div></div>";
    $("chat").querySelectorAll(".sugg button").forEach(function (b) {
      b.onclick = function () { ask(b.textContent); };
    });
  }

  function ask(text) {
    text = (text || $("q").value || "").trim();
    if (!text) return;
    var empty = $("chat").querySelector(".empty");
    if (empty) empty.remove();
    $("q").value = "";
    render(text);
  }

  function boot() {
    if (!C || !C.passages || !C.passages.length) {
      $("boot").innerHTML = '<div class="note warn"><b>تعذّر تحميل المراجع.</b><br><br>' +
        "الملف المطلوب: <code>chatbot/data/corpus.js</code><br>لتوليده:<br>" +
        "<code>python3 chatbot/build_corpus.py --src &lt;مجلد ملفات PDF&gt;</code></div>";
      return;
    }
    initRefs();
    initEmpty();
    initLightbox();
    $("send").onclick = function () { ask(); };
    $("q").addEventListener("keydown", function (e) {
      if (e.key === "Enter") ask();
    });
    $("boot").style.display = "none";
    $("app").style.display = "block";

    var pre = new URLSearchParams(location.search).get("q");
    if (pre) { $("q").value = pre; ask(pre); }
    window.RCMCHAT = { search: function (q) { return S.search(C, q, 8); }, corpus: C };
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
