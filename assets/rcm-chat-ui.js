/*!
 * rcm-chat-ui.js — واجهة المساعد المرجعي
 * منصّة سديد · تجمع مكة المكرمة الصحي · إدارة أداء تنمية الإيرادات
 */
(function () {
  "use strict";

  var C = window.CHI_CORPUS, S = window.RCMChat, R = window.RCMReason;
  var $ = function (id) { return document.getElementById(id); };

  var SUGGESTIONS = [
    "كم مدة الرد على طلب الموافقة المسبقة؟",
    "ماذا يجب عمله في الحالات الطارئة؟",
    "ما نسبة التحمل التي يدفعها المستفيد؟",
    "هل تشمل التغطية الحمل والولادة؟",
    "ما مدة سداد مستحقات مقدم الخدمة؟",
    "ما التزامات مقدم الخدمة في الطب الاتصالي؟",
  ];

  var MOD_CLASS = {
    obligation: "ob", prohibition: "pr", exception: "ex",
    condition: "cn", permission: "pm", coverage: "cv", definition: "df",
  };

  var ANS = 0;                       // ترقيم الإجابات كي تبقى معرّفات المراجع فريدة

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

  function hitHtml(r, i, query, aid) {
    var img = S.pageImage(r);
    var art = r.heading && r.heading.length > 3
      ? '<span class="art">' + esc(r.heading) + "</span>" : "";
    return '<div class="hit" id="' + aid + "-src" + (i + 1) + '">' +
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

  /** شارات المعطيات الرقمية المستخلصة — أسرع ما يبحث عنه القارئ */
  function factsHtml(facts, aid) {
    if (!facts.length) return "";
    var ICON = { duration: "⏱", pct: "٪", money: "﷼" };
    return '<div class="facts">' + facts.slice(0, 6).map(function (f) {
      return '<span class="fact ' + f.kind + '">' + (ICON[f.kind] || "•") + " " +
        esc(f.display) + '<i>[' + f.ref + "]</i></span>";
    }).join("") + "</div>";
  }

  function refChips(refs, aid) {
    if (!refs || !refs.length) return "";
    return refs.map(function (n) {
      return '<a class="refchip" href="#' + aid + "-src" + n + '">[' + n + "]</a>";
    }).join("");
  }

  /**
   * لوحة التحليل: صياغة مبسّطة واستنتاج، مفصولة بصرياً عن النصّ الرسمي
   * ومربوطة به برقم المرجع — فلا تختلط قراءةُ المحرّر بنصّ النظام.
   */
  function analysisHtml(a, aid) {
    var h = '<div class="analysis">' +
      '<div class="ahead"><span class="tag">🧠 قراءة مبسّطة واستنتاج</span>' +
      '<span class="intent">' + esc(a.intent.label) + "</span></div>";

    h += factsHtml(a.facts, aid);

    if (a.statements.length) {
      h += '<ul class="stmts">';
      a.statements.forEach(function (st) {
        h += '<li class="' + (MOD_CLASS[st.modality] || "nu") + '">' +
          (st.modalityLabel ? '<span class="mod">' + esc(st.modalityLabel) + "</span>" : "") +
          '<span class="stx">' + esc(st.text) + "</span>" +
          '<a class="refchip" href="#' + aid + "-src" + st.ref + '">[' + st.ref + "]</a></li>";
      });
      h += "</ul>";
    }

    if (a.inferences.length) {
      h += '<div class="infer"><div class="ititle">ما يُستنتج من مجموع النصوص</div><ul>';
      a.inferences.forEach(function (it) {
        h += "<li>" + esc(it.text) + " " + refChips(it.refs, aid) + "</li>";
      });
      h += "</ul></div>";
    }

    if (a.gaps.length) {
      h += '<div class="gaps">' + a.gaps.map(function (g) {
        return "<div>⚠ " + esc(g) + "</div>";
      }).join("") + "</div>";
    }

    h += '<div class="disc">الصياغة أعلاه من إعداد المساعد بناءً على النصوص المرقّمة أدناه، ' +
      "وهي للتقريب لا للاستشهاد. <b>النصّ الرسمي المنقول حرفياً هو المرجع عند أي تعارض.</b></div>";
    return h + "</div>";
  }

  function render(query) {
    var aid = "a" + (++ANS);
    var res = S.search(C, query, 6);
    var chat = $("chat");

    var q = document.createElement("div");
    q.className = "msg q";
    q.innerHTML = '<div class="bubble">' + esc(query) + "</div>";
    chat.appendChild(q);

    var a = document.createElement("div");
    a.className = "msg";

    // توسيع بالمرادفات حين يعجز اللفظ المستخدَم عن ملاقاة لفظ اللائحة
    if (!res.length || (res[0] && res[0].coverage < 0.5)) {
      var alt = R.expansions(query);
      for (var e = 0; e < alt.length && (!res.length || res[0].coverage < 0.5); e++) {
        var more = S.search(C, query + " " + alt[e], 5);
        if (more.length && (!res.length || more[0].score > res[0].score)) res = more;
      }
    }

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
    // عمق التحليل = عدد المراجع المعروضة، وإلا أشار [4] إلى نصّ غير معروض
    var DEPTH = 4;
    var analysis = R.analyze(query, res, { depth: DEPTH });
    var main = res.slice(0, DEPTH), rest = res.slice(DEPTH);

    var h = '<div class="ans">' +
      '<div class="lead"><span>عُثر على <b>' + res.length +
        "</b> مقطعاً في <b>" + new Set(res.map(function (r) { return r.doc.id; })).size +
        " مستنداً</b></span>" +
      '<span class="conf ' + conf.k + '">' + conf.t + "</span></div>";

    h += analysisHtml(analysis, aid);
    h += '<div class="srchead">النصّ الرسمي — منقول حرفياً من المصدر</div>';
    main.forEach(function (r, i) { h += hitHtml(r, i, query, aid); });

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
      '<div class="empty">اطرح سؤالك عن اللوائح والأنظمة — يقرأ المساعد النصوص المنطبقة،' +
      " يصوغ خلاصتها، ويستنتج منها، ثم يعرض النصّ الرسمي وصورة صفحته للتحقّق." +
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
