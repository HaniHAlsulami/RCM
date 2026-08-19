/*!
 * rcm-llm.js — طبقة التوليد اللغوي في مساعد «سَنَد»
 * منصّة سديد · تجمع مكة المكرمة الصحي · إدارة أداء تنمية الإيرادات
 *
 * طبقة اختيارية فوق الاسترجاع المحلّي. تُدير حواراً متعدّد الأدوار مع
 * Claude عبر Messages API، وتمنحه أداةً واحدة: البحث في فهرس لوائح CHI
 * المحمَّل في هذه الصفحة. فلا يجيب من ذاكرته، بل من نصّ اللائحة المسترجَع.
 *
 * ثلاثة قيود مبنيّة في التصميم:
 *   ١. لا نصّ نظاميّ إلا من الأداة — والنموذج ملزَم بذكر رقم المرجع [n].
 *   ٢. المفتاح يبقى على جهاز المستخدم (localStorage) ولا يُرسَل إلا لمزوّده.
 *   ٣. الطبقة مُطفأة افتراضياً؛ الأداة كاملة الوظيفة بدونها.
 *
 * وضعان للاتصال:
 *   • مباشر  — المتصفّح ← api.anthropic.com بمفتاح المستخدم.
 *   • وسيط   — المتصفّح ← بوّابة المنشأة، فلا يوجد مفتاح في المتصفّح أصلاً.
 *              وهو الوضع الموصى به عند التعميم على أكثر من مستخدم.
 */
(function (root) {
  "use strict";

  var CFG_KEY = "sadeed.llm.v1";
  var DEFAULT_ENDPOINT = "https://api.anthropic.com/v1/messages";
  var API_VERSION = "2023-06-01";
  var FALLBACK_BETA = "server-side-fallback-2026-07-01";

  var MODELS = [
    { id: "claude-opus-5", label: "Claude Opus 5 — الأدقّ" },
    { id: "claude-sonnet-5", label: "Claude Sonnet 5 — أسرع وأقلّ كلفة" },
    { id: "claude-haiku-4-5", label: "Claude Haiku 4.5 — الأسرع" },
  ];

  var DEFAULTS = {
    enabled: false,
    mode: "direct",                 // direct | proxy
    endpoint: DEFAULT_ENDPOINT,
    apiKey: "",
    model: "claude-opus-5",
    effort: "high",
  };

  function loadCfg() {
    var c = {};
    try { c = JSON.parse(localStorage.getItem(CFG_KEY) || "{}"); } catch (e) { c = {}; }
    var out = {};
    Object.keys(DEFAULTS).forEach(function (k) {
      out[k] = c[k] === undefined ? DEFAULTS[k] : c[k];
    });
    return out;
  }

  function saveCfg(c) {
    try { localStorage.setItem(CFG_KEY, JSON.stringify(c)); } catch (e) { /* محظور */ }
  }

  function clearCfg() {
    try { localStorage.removeItem(CFG_KEY); } catch (e) { /* محظور */ }
  }

  function ready(c) {
    c = c || loadCfg();
    if (!c.enabled) return false;
    return c.mode === "proxy" ? !!c.endpoint : !!c.apiKey;
  }

  // ────────────────────────────────────────────────────────────────
  // 1. التعليمات — حدود صارمة على ما يجوز للنموذج قوله
  // ────────────────────────────────────────────────────────────────
  var SYSTEM = [
    "أنت «سَنَد»، المساعد المرجعي في منصّة «سديد» بتجمع مكة المكرمة الصحي —",
    "إدارة أداء تنمية الإيرادات. مجالك: لوائح وأنظمة وسياسات مجلس الضمان الصحي",
    "السعودي (CHI)، وتطبيقها العملي على طلبات الموافقة المسبقة (Pre-Authorization).",
    "",
    "قواعد ملزِمة:",
    "١. لا تذكر حكماً نظامياً إلا بعد استرجاعه بأداة search_regulations. إن لم تجده،",
    "   قل صراحةً: «لم أجد نصّاً في المراجع المفهرسة يغطّي هذا» — ولا تُكمل من معرفتك",
    "   العامة. النقص المُعلن أنفع من إجابة لا سند لها.",
    "٢. اذكر رقم المرجع [n] بعد كل جملة مبنيّة على نصّ مسترجَع، بالأرقام التي",
    "   تُعيدها الأداة. ولا تخترع أرقاماً لم ترد.",
    "٣. ميّز دائماً بين ما ورد في النصّ وما استنتجتَه أنت. استعمل «النصّ يوجب…»",
    "   للأوّل و«يترتّب على ذلك…» للثاني.",
    "٤. المدد والنسب والمبالغ تُنقل كما وردت حرفياً. لا تُقرّب ولا تُحوّل الوحدات.",
    "٥. أجب بالعربية الفصحى، بإيجاز تشغيليّ: خلاصة أولاً، ثم التفصيل.",
    "٦. لستَ رأياً قانونياً. عند التعارض، النصّ الرسمي المنشور من المجلس هو المعتمد.",
    "",
    "أسلوب العمل مع المستخدم:",
    "• حين تُرفَق حالة من نموذج سديد، اقرأ أسباب عدم اكتمال الموافقة المتوقَّعة،",
    "  وابحث عن النصّ النظامي المنطبق على كل سبب، ثم اعرض خطة عملية مرتّبة",
    "  بالأولوية: ما ينبغي إرفاقه أو تصحيحه أو التحقّق منه قبل الإرسال.",
    "• اسأل سؤالاً واحداً محدّداً في كل مرّة حين ينقصك معطى يغيّر الإجابة",
    "  (تاريخ الخدمة، نوع الوثيقة، هل الحالة طارئة…). ولا تُغرق المستخدم بأسئلة.",
    "• حين يكون الجواب قائمة تحقّق، اكتبها قائمةً مرقّمة قابلة للتنفيذ مباشرةً.",
    "• لا تَعِد بنتيجة. النموذج يقدّر احتمالاً، والقرار النهائي لشركة التأمين.",
  ].join("\n");

  var TOOLS = [{
    name: "search_regulations",
    description:
      "يبحث في فهرس لوائح وأنظمة وسياسات مجلس الضمان الصحي (CHI) المحمَّلة محلياً " +
      "ويُعيد المقاطع الأوثق صلة، مرقّمةً، مع اسم المستند ورقم الصفحة. " +
      "استعمله قبل كل إجابة تتضمّن حكماً نظامياً، وكرّره بصياغات مختلفة إن لم تجد بغيتك. " +
      "اكتب الاستعلام بمصطلحات اللائحة (مثل «الموافقة المسبقة»، «الحالات الطارئة»، " +
      "«مبلغ التحمل»، «الحد الأدنى للبيانات») لا بلغة الحديث اليومي.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "عبارة البحث بالعربية بمصطلحات اللائحة" },
        limit: { type: "integer", description: "عدد المقاطع المطلوبة (١–٦، والافتراضي ٤)" },
      },
      required: ["query"],
      additionalProperties: false,
    },
    strict: true,
  }];

  // ────────────────────────────────────────────────────────────────
  // 2. تنفيذ الأداة محلياً — لا شبكة، الفهرس في الصفحة
  // ────────────────────────────────────────────────────────────────
  /**
   * ينفّذ البحث ويُعيد نصّاً مرقّماً للنموذج. الترقيم تراكمي عبر الجلسة
   * (sources) كي يشير [3] إلى المقطع نفسه في كل مواضع الحوار.
   */
  function runSearch(ctx, input) {
    var q = String((input && input.query) || "").trim();
    if (!q) return "استعلام فارغ.";
    var limit = Math.max(1, Math.min(6, (input && input.limit) || 4));
    // عتبة صلة: تسليم مقاطع ضعيفة المطابقة للنموذج يدفعه إلى بناء حكم على
    // نصّ لا يخصّ السؤال. الصمت هنا أصدق من نتيجة شكلية.
    var hits = ctx.search(q, limit).filter(function (h) {
      return h.coverage >= 0.5 || h.score >= 8;
    });
    if (!hits.length) {
      return "لا توجد مقاطع مطابقة لـ«" + q + "» في الفهرس. " +
             "جرّب مصطلحاً نظامياً آخر، أو أخبر المستخدم أن الموضوع خارج الوثائق المحمَّلة.";
    }
    return hits.map(function (h) {
      var n = ctx.addSource(h);
      return "[" + n + "] " + h.doc.title + " — صفحة " + h.page +
             (h.heading ? "\n" + h.heading : "") + "\n" + h.text;
    }).join("\n\n");
  }

  // ────────────────────────────────────────────────────────────────
  // 3. نقل الرسائل — بثّ SSE مع حلقة استعمال الأداة
  // ────────────────────────────────────────────────────────────────
  function headers(cfg) {
    var h = { "content-type": "application/json" };
    if (cfg.mode === "direct") {
      h["x-api-key"] = cfg.apiKey;
      h["anthropic-version"] = API_VERSION;
      // إقرار صريح بأن الطلب من متصفّح؛ بدونه يمنعه CORS
      h["anthropic-dangerous-direct-browser-access"] = "true";
    }
    return h;
  }

  function body(cfg, messages, withFallbacks) {
    var b = {
      model: cfg.model,
      max_tokens: 8000,
      stream: true,
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      tools: TOOLS,
      messages: messages,
      output_config: { effort: cfg.effort || "high" },
      thinking: { type: "adaptive" },
    };
    // إعادة التشغيل على نموذج بديل إن رفض المصنّف الطلب — نطلبها افتراضياً
    if (withFallbacks) b.fallbacks = "default";
    return b;
  }

  function betaHeader(cfg, withFallbacks) {
    var h = headers(cfg);
    if (withFallbacks && cfg.mode === "direct") h["anthropic-beta"] = FALLBACK_BETA;
    return h;
  }

  /** يقرأ بثّ SSE ويُنادي onEvent لكل حدث */
  function readStream(res, onEvent) {
    var reader = res.body.getReader();
    var dec = new TextDecoder();
    var buf = "";

    function pump() {
      return reader.read().then(function (r) {
        if (r.done) return;
        buf += dec.decode(r.value, { stream: true });
        var parts = buf.split("\n\n");
        buf = parts.pop();
        parts.forEach(function (chunk) {
          chunk.split("\n").forEach(function (line) {
            if (line.indexOf("data:") !== 0) return;
            var raw = line.slice(5).trim();
            if (!raw || raw === "[DONE]") return;
            try { onEvent(JSON.parse(raw)); } catch (e) { /* جزء غير مكتمل */ }
          });
        });
        return pump();
      });
    }
    return pump();
  }

  /**
   * دور واحد: يُرسل الرسائل ويُجمّع كتل الرد.
   * يُعيد {content, stopReason, stopDetails}.
   */
  function turn(cfg, messages, hooks, withFallbacks) {
    return fetch(cfg.endpoint || DEFAULT_ENDPOINT, {
      method: "POST",
      headers: betaHeader(cfg, withFallbacks),
      body: JSON.stringify(body(cfg, messages, withFallbacks)),
    }).then(function (res) {
      if (!res.ok) {
        return res.text().then(function (t) {
          var err = new Error(t || ("HTTP " + res.status));
          err.status = res.status;
          err.bodyText = t;
          throw err;
        });
      }

      var blocks = [], stopReason = null, stopDetails = null;

      return readStream(res, function (ev) {
        if (ev.type === "content_block_start") {
          var cb = ev.content_block;
          blocks[ev.index] = cb.type === "tool_use"
            ? { type: "tool_use", id: cb.id, name: cb.name, _json: "", input: {} }
            : { type: cb.type, text: cb.text || "", thinking: cb.thinking || "" };

        } else if (ev.type === "content_block_delta") {
          var b = blocks[ev.index]; if (!b) return;
          var d = ev.delta;
          if (d.type === "text_delta") {
            b.text = (b.text || "") + d.text;
            hooks.onText && hooks.onText(d.text);
          } else if (d.type === "thinking_delta") {
            b.thinking = (b.thinking || "") + (d.thinking || "");
          } else if (d.type === "input_json_delta") {
            b._json += d.partial_json || "";
          } else if (d.type === "signature_delta") {
            b.signature = d.signature;
          }

        } else if (ev.type === "content_block_stop") {
          var bb = blocks[ev.index];
          if (bb && bb.type === "tool_use") {
            // المدخلات قد تصل بترميز مختلف؛ التحليل بـ JSON لا بمطابقة نصّية
            try { bb.input = JSON.parse(bb._json || "{}"); } catch (e) { bb.input = {}; }
            delete bb._json;
          }

        } else if (ev.type === "message_delta") {
          if (ev.delta) {
            if (ev.delta.stop_reason) stopReason = ev.delta.stop_reason;
            if (ev.delta.stop_details) stopDetails = ev.delta.stop_details;
          }

        } else if (ev.type === "error") {
          var e = new Error((ev.error && ev.error.message) || "خطأ في البثّ");
          throw e;
        }
      }).then(function () {
        return {
          content: blocks.filter(Boolean),
          stopReason: stopReason,
          stopDetails: stopDetails,
        };
      });
    });
  }

  /**
   * حلقة الحوار: تُكرّر الأدوار ما دام النموذج يطلب أداةً، وتنفّذها محلياً.
   * hooks: {onText, onTool, onStatus}
   */
  function ask(cfg, history, ctx, hooks) {
    hooks = hooks || {};
    var messages = history.slice();
    var useFallbacks = cfg.mode === "direct";
    var rounds = 0;

    function step() {
      if (++rounds > 6) {
        return Promise.resolve({ messages: messages, text: "", truncated: true });
      }
      return turn(cfg, messages, hooks, useFallbacks).catch(function (e) {
        // بيئات لا تُفعِّل تجربة الاحتياط: نُعيد المحاولة مرّةً بدونها
        if (useFallbacks && e.status === 400 &&
            /fallback|beta/i.test(e.bodyText || "")) {
          useFallbacks = false;
          return turn(cfg, messages, hooks, false);
        }
        throw e;
      }).then(function (r) {
        if (r.stopReason === "refusal") {
          var cat = (r.stopDetails && r.stopDetails.category) || "";
          return {
            messages: messages, refused: true,
            text: "اعتذر النموذج عن معالجة هذا الطلب" + (cat ? " (" + cat + ")" : "") + ".",
          };
        }

        messages.push({ role: "assistant", content: r.content });

        if (r.stopReason !== "tool_use") {
          var txt = r.content.filter(function (b) { return b.type === "text"; })
                             .map(function (b) { return b.text; }).join("");
          return { messages: messages, text: txt };
        }

        // كل نتائج الأدوات في رسالة مستخدم واحدة — تفريقها يُثبّط الاستدعاء المتوازي
        var results = r.content.filter(function (b) { return b.type === "tool_use"; })
          .map(function (b) {
            hooks.onTool && hooks.onTool(b.input && b.input.query);
            var out, isErr = false;
            try {
              out = b.name === "search_regulations" ? runSearch(ctx, b.input)
                                                    : "أداة غير معروفة: " + b.name;
            } catch (e) { out = "تعذّر تنفيذ البحث: " + e.message; isErr = true; }
            return { type: "tool_result", tool_use_id: b.id, content: out, is_error: isErr };
          });
        messages.push({ role: "user", content: results });
        return step();
      });
    }

    return step();
  }

  /** رسالة خطأ مفهومة بدل نصّ JSON خام */
  function explain(e) {
    var t = e.bodyText || e.message || "";
    if (e.status === 401) return "المفتاح غير صالح أو منتهٍ. راجعه في الإعدادات.";
    if (e.status === 403) return "المفتاح لا يملك صلاحية على هذا النموذج.";
    if (e.status === 404) return "النموذج المحدَّد غير متاح لهذا الحساب.";
    if (e.status === 429) return "تجاوزتَ حدّ الطلبات. انتظر قليلاً ثم أعد المحاولة.";
    if (e.status >= 500) return "عطل مؤقّت لدى المزوّد. أعد المحاولة بعد لحظات.";
    if (!e.status && /Failed to fetch|NetworkError|CORS/i.test(t + e.message)) {
      return "تعذّر الوصول إلى الخدمة. إن كنت خلف شبكة تحجب api.anthropic.com، " +
             "فاستعمل وضع «بوّابة المنشأة» في الإعدادات.";
    }
    try {
      var j = JSON.parse(t);
      if (j.error && j.error.message) return j.error.message;
    } catch (x) { /* ليست JSON */ }
    return t.slice(0, 300) || "خطأ غير معروف.";
  }

  root.RCMLlm = {
    MODELS: MODELS, DEFAULTS: DEFAULTS, SYSTEM: SYSTEM, TOOLS: TOOLS,
    loadCfg: loadCfg, saveCfg: saveCfg, clearCfg: clearCfg, ready: ready,
    ask: ask, explain: explain, runSearch: runSearch,
  };
})(typeof window !== "undefined" ? window : globalThis);

if (typeof module !== "undefined" && module.exports) module.exports = globalThis.RCMLlm;
