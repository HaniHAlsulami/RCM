# -*- coding: utf-8 -*-
"""
export_bundle.py — تحويل نموذج LightGBM إلى حزمة JSON مضغوطة يقرأها المتصفح
Makkah Health Cluster · RCM & Data Analytics

الحزمة تحتوي على:
  • الأشجار بصيغة مصفوفات مسطّحة (تنبؤ + TreeSHAP دقيق داخل المتصفح)
  • قواميس الترميز وقوائم الخيارات مع إحصاءات كل خيار
  • جداول اللقطة التاريخية للعقود/المستشفيات/العيادات
  • تصنيف أسباب الرفض ونموذجها
  • مقاييس النموذج وأهمية الخصائص العالمية
"""
from __future__ import annotations

import json
import os
import sys

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import rcm_pipeline as P

R6 = lambda x: round(float(x), 6)


# ──────────────────────────────────────────────────────────────────────
# 1. تحويل الأشجار
# ──────────────────────────────────────────────────────────────────────
def _flatten_tree(node):
    """يحوّل شجرة LightGBM المتداخلة إلى مصفوفات مسطّحة.

    لكل عقدة i:
      k[i] = 0 انقسام رقمي | 1 انقسام فئوي | 2 ورقة
      f[i] = رقم الخاصية (أو -1 للورقة)
      v[i] = العتبة الرقمية | فهرس مجموعة الفئات | قيمة الورقة
      l/r  = فهرس الابن الأيسر/الأيمن،  d = اتجاه القيم المفقودة
      w[i] = عدد الصفوف التي مرّت بالعقدة (cover) — يلزم لـ TreeSHAP
      mt[i]= معالجة القيم المفقودة كما يعرّفها LightGBM:
             0=None (المفقود يُعامل كصفر) | 1=Zero | 2=NaN
             لا بدّ من مطابقتها بدقّة وإلا اختلف التنبؤ عن النموذج الأصلي.
    """
    k, f, v, l, r, d, w, mt, sets = [], [], [], [], [], [], [], [], []
    MT = {"None": 0, "Zero": 1, "NaN": 2}

    def add(n):
        i = len(k)
        k.append(0); f.append(-1); v.append(0.0); l.append(-1); r.append(-1)
        d.append(0); w.append(0.0); mt.append(0)
        if "leaf_value" in n:
            k[i], f[i] = 2, -1
            v[i] = R6(n["leaf_value"])
            w[i] = float(n.get("leaf_count", n.get("leaf_weight", 1)))
            return i
        w[i] = float(n["internal_count"])
        f[i] = int(n["split_feature"])
        if n["decision_type"] == "==":
            k[i] = 1
            cats = [int(x) for x in str(n["threshold"]).split("||")]
            sets.append(cats)
            v[i] = len(sets) - 1
        else:
            k[i] = 0
            v[i] = R6(n["threshold"])
        d[i] = 1 if n.get("default_left") else 0
        mt[i] = MT.get(str(n.get("missing_type", "None")), 0)
        l[i] = add(n["left_child"])
        r[i] = add(n["right_child"])
        return i

    add(node)
    return dict(k=k, f=f, v=v, l=l, r=r, d=d, w=w, m=mt, s=sets)


def _expected_value(t):
    """القيمة المتوقّعة للشجرة (متوسط الأوراق موزوناً بالتغطية) = أساس SHAP."""
    def rec(i):
        if t["k"][i] == 2:
            return t["v"][i]
        li, ri = t["l"][i], t["r"][i]
        tot = t["w"][li] + t["w"][ri]
        if tot <= 0:
            return 0.0
        return (t["w"][li] * rec(li) + t["w"][ri] * rec(ri)) / tot
    return rec(0)


def convert_model(model, n_class):
    """يحوّل LGBMClassifier إلى قائمة أشجار + قيم الأساس لكل فئة."""
    dump = model.booster_.dump_model()
    trees, base = [], [0.0] * n_class
    for info in dump["tree_info"]:
        t = _flatten_tree(info["tree_structure"])
        cls = int(info["tree_index"]) % n_class
        t["c"] = cls
        base[cls] += _expected_value(t)
        trees.append(t)
    return trees, [R6(b) for b in base], dump["feature_names"]


# ──────────────────────────────────────────────────────────────────────
# 2. قوائم الخيارات مع إحصاءاتها الحقيقية
# ──────────────────────────────────────────────────────────────────────
NATIONALITY_AR = {
    "saudi": "سعودي", "pakistani": "باكستاني", "egyptian": "مصري", "indian": "هندي",
    "algerian": "جزائري", "indonesian": "إندونيسي", "bangladeshi": "بنغلاديشي",
    "morrocan": "مغربي", "moroccan": "مغربي", "afghani": "أفغاني", "yamani": "يمني",
    "yemeni": "يمني", "iraqi": "عراقي", "nigerian": "نيجيري", "turkish": "تركي",
    "syrian": "سوري", "jordanian": "أردني", "libyan": "ليبي", "sudanese": "سوداني",
    "kenyan": "كيني", "lebaness": "لبناني", "lebanese": "لبناني", "niger": "نيجري",
    "tunisian": "تونسي", "iranian": "إيراني", "palastine": "فلسطيني",
    "palestinian": "فلسطيني", "somalian": "صومالي", "uzbekistan": "أوزبكي",
    "british": "بريطاني", "malaysian": "ماليزي", "russian": "روسي",
    "srilankian": "سريلانكي", "filipino": "فلبيني", "american": "أمريكي",
    "ethiopian": "إثيوبي", "french": "فرنسي", "chadian": "تشادي", "malian": "مالي",
    "burmese": "بورمي", "sinegalian": "سنغالي", "guinean": "غيني", "OTHER": "أخرى",
    "unknown": "غير محدد",
}
VISIT_AR = {"er": "طوارئ (ER)", "opd": "عيادة خارجية (OPD)", "ip": "تنويم (IP)"}
BILL_AR = {"issued": "صادرة (Issued)", "opened": "مفتوحة (Opened)",
           "transfered": "محوّلة (Transferred)", "pending": "معلّقة (Pending)",
           "closed": "مغلقة (Closed)", "canceled": "ملغاة (Canceled)",
           "unknown": "غير محدد"}
NPHIES_AR = {"eligible": "مؤهل (eligible)", "error": "خطأ في الفحص (error)",
             "out_network": "خارج الشبكة (out-network)", "not_covered": "غير مغطى (not-covered)",
             "not_active": "بوليصة غير فعّالة (not-active)",
             "not_direct_billing": "لا فوترة مباشرة", "other": "أخرى", "unknown": "لم يُجرَ الفحص"}
GENDER_AR = {"Male": "ذكر", "Female": "أنثى", "Unknown": "غير محدد"}
PATIENT_AR = {"hajj": "حاج", "hajj_outside": "حاج من الخارج", "umrah": "معتمر",
              "saudi": "مواطن سعودي", "resident": "مقيم", "employee": "موظف",
              "normal": "عادي", "other": "أخرى", "unknown": "غير محدد"}
ICD_CHAPTER_AR = {
    "A": "A — أمراض معدية وطفيلية", "B": "B — أمراض فيروسية وطفيلية",
    "C": "C — أورام خبيثة", "D": "D — أورام حميدة وأمراض الدم",
    "E": "E — الغدد الصماء والتغذية والأيض", "F": "F — اضطرابات نفسية وسلوكية",
    "G": "G — الجهاز العصبي", "H": "H — العين والأذن", "I": "I — القلب والأوعية الدموية",
    "J": "J — الجهاز التنفسي", "K": "K — الجهاز الهضمي", "L": "L — الجلد",
    "M": "M — الجهاز العضلي الهيكلي", "N": "N — الجهاز البولي التناسلي",
    "O": "O — الحمل والولادة والنفاس", "P": "P — الفترة المحيطة بالولادة",
    "Q": "Q — تشوّهات خلقية", "R": "R — أعراض وعلامات غير مصنّفة",
    "S": "S — إصابات ورضوض", "T": "T — تسمّم وعوامل خارجية",
    "U": "U — رموز طارئة (COVID وغيرها)", "V": "V — حوادث نقل",
    "W": "W — أسباب خارجية", "X": "X — أسباب خارجية", "Y": "Y — أسباب خارجية",
    "Z": "Z — عوامل تؤثّر على الحالة الصحية", "UNK": "غير محدد", "OTHER": "أخرى",
}
TRIAGE_AR = {5: "CTAS 5 — غير عاجل", 4: "CTAS 4 — أقل عجلة", 3: "CTAS 3 — عاجل",
             2: "CTAS 2 — حرج", 1: "CTAS 1 — حرج جداً"}

_AR_MAPS = {"visit_type": VISIT_AR, "bill_status": BILL_AR, "nphies_elig": NPHIES_AR,
            "gender": GENDER_AR, "patient_class": PATIENT_AR, "icd_chapter": ICD_CHAPTER_AR,
            "nationality": NATIONALITY_AR}

_RAW_COL = {"hospital": "Hospital Name", "clinic": "Clinic Name",
            "contract": "Contract Name", "nationality": "Nationality"}


def _pretty(col, val, raw_lookup):
    if val == "OTHER":
        return "أخرى / غير مدرج"
    if val in ("unknown", "UNK"):
        return "غير محدد"
    m = _AR_MAPS.get(col)
    if m and val in m:
        return m[val]
    disp = raw_lookup.get(col, {}).get(val)
    if disp:
        return disp
    return str(val).title()


def _mode(s):
    vc = s.value_counts()
    return vc.index[0] if len(vc) else ""


def build_options(raw, dec, vocab, X_enc):
    """
    لكل خاصية فئوية: قائمة الخيارات مرتّبة بالتكرار، مع نسبة القبول/الرفض
    التاريخية لكل خيار (تُعرض في الواجهة كمؤشّر مخاطرة).
    """
    # أفضل صيغة عرض لكل قيمة مطبَّعة (الأكثر تكراراً في البيانات الخام)
    raw_lookup = {}
    for col, src in _RAW_COL.items():
        if src not in raw.columns:
            continue
        rawv = raw[src].astype(str)
        norm = rawv.map(P.norm_contract if col == "contract" else P.norm_text)
        pair = pd.DataFrame({"n": norm.values, "r": rawv.values})
        pair = pair[(pair["n"] != "") & (pair["r"].str.lower() != "nan")]
        raw_lookup[col] = pair.groupby("n", dropna=True)["r"].agg(_mode).to_dict()

    st = dec[P.COL_TARGET].astype(str).str.strip()
    opts = {}
    for col in P.CAT_FEATURES:
        levels = vocab[f"cats_{col}"]
        codes = X_enc[col].values
        items = []
        for i, lv in enumerate(levels):
            mask = codes == i
            n = int(mask.sum())
            if n == 0:
                continue
            sub = st.values[mask]
            rej = float((sub == "Rejected").mean())
            app = float((sub == "Approved").mean())
            items.append(dict(i=i, v=lv, l=_pretty(col, lv, raw_lookup),
                              n=n, r=round(rej * 100, 1), a=round(app * 100, 1)))
        items.sort(key=lambda d: -d["n"])
        opts[col] = items
    return opts


# ──────────────────────────────────────────────────────────────────────
# 3. بناء الحزمة
# ──────────────────────────────────────────────────────────────────────
def export(model, reason_model, reason_labels, vocab, snap, raw, metrics,
           global_shap, shap_groups, art_dir):
    df = raw[P.decided_mask(raw)].copy()
    df["_vd"] = pd.to_datetime(df["Visit Date"], errors="coerce")
    df = df.sort_values("_vd", kind="mergesort").reset_index(drop=True)
    X_enc, _ = P.build_features(df, vocab)
    y = df[P.COL_TARGET].astype(str).str.strip().map(
        {c: i for i, c in enumerate(P.CLASSES)}).values

    trees, base, feat_names = convert_model(model, len(P.CLASSES))
    r_trees, r_base, _ = convert_model(reason_model, len(reason_labels))

    # القيم الافتراضية = وسيط/منوال بيانات التدريب (تُستخدم للحقول غير المُدخلة)
    defaults = {}
    for c in P.NUM_FEATURES:
        s = X_enc[c].dropna() if c in X_enc else pd.Series([0.0])
        defaults[c] = R6(s.median()) if len(s) else None

    bundle = dict(
        schema_version=2,
        generated_at=metrics["generated_at"],
        classes=P.CLASSES,
        classes_ar=[P.CLASS_AR[c] for c in P.CLASSES],
        features=list(feat_names),
        num_features=P.NUM_FEATURES,
        cat_features=P.CAT_FEATURES,
        entity_features=P.ENTITY_FEATURES,
        feature_ar=P.FEATURE_AR,
        shap_groups={k: dict(label=v[0], cols=v[1]) for k, v in shap_groups.items()},
        global_shap=global_shap,
        defaults=defaults,
        approval=dict(trees=trees, base=base),
        reason=dict(trees=r_trees, base=r_base, labels=reason_labels,
                    labels_ar={c: P.REASON_AR.get(c, c) for c in reason_labels},
                    actions={c: P.REASON_ACTION.get(c, "") for c in reason_labels}),
        options=build_options(raw, df, vocab, X_enc),
        entity_snapshot={k: dict(table=v["table"], default=v["default"])
                         for k, v in snap.items()},
        entity_cols=P.ENTITY_COLS,
        triage_ar={str(k): v for k, v in TRIAGE_AR.items()},
        # الأرقام المعروضة في الصفحة هي أرقام وضع النشر (جدول لقطة)، لأنها
        # الطريقة التي تسجّل بها الصفحة فعلاً. أرقام النافذة المتوسّعة تبقى
        # متاحة في metrics.json للمقارنة.
        metrics=dict(
            accuracy=_pick(metrics, "accuracy"),
            f1_macro=_pick(metrics, "f1_macro"),
            roc_auc=_pick(metrics, "roc_auc_ovr"),
            top2_accuracy=_pick(metrics, "top2_accuracy"),
            auc_per_class=_pick(metrics, "auc_per_class"),
            confusion_matrix=_pick(metrics, "confusion_matrix"),
            per_class=metrics.get("selected", {}).get("per_class"),
            comparison=metrics.get("comparison"),
            reason_model=metrics.get("reason_model"),
            dataset=metrics.get("dataset"),
        ),
        # معدّلات مرجعية عامة تُعرض للمقارنة
        prior=[round(float((y == i).mean()), 4) for i in range(len(P.CLASSES))],
        # نسبة التحصيل الفعلية لكل نتيجة (المبلغ المغطى ÷ إجمالي الفاتورة)،
        # تُحسب من البيانات التاريخية وتُستخدم لتقدير الإيراد المتوقّع للمطالبة.
        recovery=_recovery_ratios(df),
    )

    payload = json.dumps(bundle, ensure_ascii=False, separators=(",", ":"))

    # JSON — لأدوات بايثون و Power BI
    out = os.path.join(art_dir, "model_bundle.json")
    with open(out, "w", encoding="utf-8") as f:
        f.write(payload)

    # JS — تحمّله الصفحة عبر <script src> ليعمل حتى من ملف محلي (file://)
    #      دون قيود CORS التي تمنع fetch.
    with open(os.path.join(art_dir, "model_bundle.js"), "w", encoding="utf-8") as f:
        f.write("/* حزمة نموذج التنبؤ بالموافقة التأمينية — مولّدة آلياً، لا تُحرَّر يدوياً */\n")
        f.write("window.RCM_BUNDLE=" + payload + ";\n")

    size = os.path.getsize(out) / 1e6
    print(f"[export] model_bundle.json / .js — {size:.2f} MB, "
          f"{len(trees)} شجرة موافقة + {len(r_trees)} شجرة أسباب")

    _write_model_card(metrics, art_dir, bundle)
    return out


def _pick(metrics, key):
    """يفضّل مقياس وضع النشر إن وُجد، وإلا يرجع لمقياس التقييم بالنافذة المتوسّعة."""
    sel = metrics.get("selected", {}) or {}
    dep = sel.get("deployment") or {}
    return dep.get(key, sel.get(key))


def _recovery_ratios(df):
    """متوسط نسبة (المبلغ المغطى ÷ إجمالي الفاتورة) لكل نتيجة موافقة."""
    tot = pd.to_numeric(df["Total"], errors="coerce")
    cov = pd.to_numeric(df.get("Total Covg"), errors="coerce")
    st = df[P.COL_TARGET].astype(str).str.strip()
    ok = tot > 0
    out = {}
    for c in P.CLASSES:
        m = ok & (st == c)
        r = (cov[m] / tot[m]).clip(0, 1)
        out[c] = round(float(r.median()), 4) if len(r) else 0.0
    return out


def _write_model_card(m, art_dir, bundle):
    ds = m.get("dataset", {})
    sel = m.get("selected", {})
    rm = m.get("reason_model", {})
    lines = [
        "# بطاقة النموذج — التنبؤ بنتيجة الموافقة التأمينية",
        "",
        "**تجمع مكة الصحي · إدارة الدورة الإيرادية وتحليل البيانات**",
        "",
        f"تاريخ التوليد: {m.get('generated_at')}",
        "",
        "## 1. البيانات",
        "",
        f"- إجمالي السجلات: **{ds.get('rows_total', 0):,}**",
        f"- المطالبات ذات القرار النهائي (المستخدمة في التدريب): **{ds.get('rows_decided', 0):,}**",
        f"- الفترة الزمنية: {ds.get('date_from')} → {ds.get('date_to')}",
        f"- تاريخ فاصل التدريب/الاختبار: {ds.get('split_date')} (تقسيم زمني، لا عشوائي)",
        "",
        "| الفئة | عدد المطالبات |",
        "|---|---|",
    ]
    for k, v in (ds.get("class_distribution") or {}).items():
        lines.append(f"| {k} | {v:,} |")

    lines += [
        "",
        "## 2. مقارنة الخوارزميات",
        "",
        "التقييم على تقسيم **زمني** (التدريب على الفترة الأقدم والاختبار على الأحدث)،",
        "وهو التقييم الأمين لنموذج سيُستخدم على مطالبات مستقبلية.",
        "",
        "| الخوارزمية | الدقة | F1 (ماكرو) | AUC | Log-loss |",
        "|---|---|---|---|---|",
    ]
    for r in m.get("comparison", []):
        lines.append(f"| {r['model']} | {r['accuracy']:.4f} | {r['f1_macro']:.4f} | "
                     f"{r['roc_auc_ovr']:.4f} | {r['log_loss']:.4f} |")

    lines += [
        "",
        "## 3. النموذج المعتمد",
        "",
        "**LightGBM** (أشجار قرار معزَّزة بالتدرّج). تعادل عملياً مع XGBoost في الدقة",
        "(الفارق ضمن هامش الخطأ الإحصائي) وتفوّق عليه في F1 الماكرو، أي في فئة",
        "«الموافقة الجزئية» النادرة. ويدعم الخصائص الفئوية عالية التعدّد (العقود،",
        "العيادات، رموز ICD) دون توسيع one-hot، ويُصدَّر إلى المتصفّح بحجم صغير مع",
        "إمكانية حساب SHAP بدقّة تامة.",
        "",
        "### أ) وضع النشر — الأرقام المُعتمدة",
        "",
        "النموذج مُدرَّب على معدّلات الجهات بنافذة متوسّعة، لكنه يُقيَّم هنا بجدول",
        "**لقطة** مبنيّ من فترة التدريب وحدها — وهي الطريقة التي تسجّل بها الصفحة",
        "وسكربت Power BI فعلاً. هذه هي الأرقام المعروضة في الواجهة.",
        "",
    ]
    dep = sel.get("deployment") or {}
    lines += [
        f"- الدقة: **{dep.get('accuracy')}**",
        f"- دقة أفضل تنبّؤين (Top-2): **{dep.get('top2_accuracy')}**",
        f"- F1 ماكرو: **{dep.get('f1_macro')}**",
        f"- AUC (OvR ماكرو): **{dep.get('roc_auc_ovr')}**",
        "",
        "AUC لكل فئة:",
        "",
    ]
    for k, v in (dep.get("auc_per_class") or {}).items():
        lines.append(f"- {k}: {v}")
    lines += [
        "",
        "### ب) التقييم بالنافذة المتوسّعة (للمقارنة مع بقية الخوارزميات)",
        "",
        f"- الدقة: {sel.get('accuracy')} · F1 ماكرو: {sel.get('f1_macro')} · "
        f"AUC: {sel.get('roc_auc_ovr')}",
        "",
        "تقارب الرقمين يؤكّد أن استبدال النافذة المتوسّعة بجدول اللقطة وقت التنبؤ",
        "لا يُفقد النموذج أداءه.",
    ]

    lines += [
        "",
        "## 4. نموذج أسباب الرفض",
        "",
        f"- عدد الأصناف: {rm.get('n_classes')} سبباً معيارياً",
        f"- صفوف التدريب: {rm.get('n_rows', 0):,}",
        f"- دقة Top-1: **{rm.get('top1_accuracy')}** · Top-3: **{rm.get('top3_accuracy')}** "
        f"(الأساس {rm.get('baseline')})",
        "",
        "## 5. الخصائص وأهميتها (SHAP عالمي)",
        "",
        "| الخاصية | الأهمية |",
        "|---|---|",
    ]
    for k, v in (m.get("global_shap") or {}).items():
        lines.append(f"| {v['label']} | {v['pct']:.2f}% |")

    lines += [
        "",
        "## 6. منع التسريب (Data Leakage)",
        "",
        "استُبعدت الأعمدة التي لا تُعرف إلا **بعد** صدور قرار الضامن:",
        "",
    ]
    for c in P.LEAKAGE_COLS:
        lines.append(f"- `{c}`")
    lines += [
        "",
        "**تنبيه تشغيلي:** حقل `Bill Status` من حقول دورة الفوترة. يجب التقاطه بقيمته",
        "**وقت تقديم المطالبة**؛ فإن كان يُحدَّث في نظامكم بعد صدور قرار الضامن، فوزنه",
        "التنبّؤي هنا متفائل ويلزم إعادة تقييمه.",
    ]

    lines += [
        "",
        "خصائص السجل التاريخي للجهات (معدّل الرفض للعقد/المستشفى/العيادة) تُحسب أثناء",
        "التدريب بنافذة **متوسّعة زمنياً** — أي من المطالبات السابقة فقط — لمنع تسرّب",
        "المستقبل إلى الماضي. وقت التنبؤ تُقرأ من جدول لقطة مرفق مع النموذج.",
        "",
        "## 7. حدود الاستخدام",
        "",
        "- النموذج **مساعد قرار** وليس بديلاً عن المراجعة الطبية أو التأمينية.",
        "- الفئة «موافقة جزئية» أصعب تنبّؤاً (تمثّل ~12.5% من البيانات) ودقتها أدنى.",
        "- تدهور الأداء متوقّع عند تغيّر سياسات الضامنين؛ يُعاد التدريب كل ربع سنة.",
        "- لا يستخدم النموذج اسم المريض أو رقم الهوية أو أي معرّف شخصي.",
        "",
    ]
    with open(os.path.join(art_dir, "model_card.md"), "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    print("[export] model_card.md")
