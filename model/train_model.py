# -*- coding: utf-8 -*-
"""
train_model.py — تدريب واختيار أفضل نموذج للتنبؤ بنتيجة الموافقة التأمينية
Makkah Health Cluster · RCM & Data Analytics

المخرجات (في model/artifacts/):
  model_bundle.json   حزمة النموذج المضغوطة (أشجار + قواميس + جداول اللقطة) للمتصفح
  metrics.json        نتائج مقارنة كل الخوارزميات + مقاييس النموذج النهائي
  model_card.md       بطاقة النموذج (توثيق)
  approval_model.txt  نموذج الموافقة بصيغة LightGBM النصّية (للتسجيل الدفعي)
  reason_model.txt    نموذج أسباب الرفض
  vocab.json          قواميس الترميز + جداول اللقطة + أصناف الأسباب

صيغة LightGBM النصّية و JSON مقصودتان بدل pickle: فهما مستقرّتان عبر إصدارات
المكتبات وقابلتان للقراءة والمراجعة.

التشغيل:
  python3 model/train_model.py --data path/to/ALL_GUARANTORS_FINAL.xlsx
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
import warnings

warnings.filterwarnings("ignore")

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import rcm_pipeline as P  # noqa: E402

from sklearn.dummy import DummyClassifier  # noqa: E402
from sklearn.ensemble import (  # noqa: E402
    ExtraTreesClassifier, HistGradientBoostingClassifier, RandomForestClassifier,
)
from sklearn.linear_model import LogisticRegression  # noqa: E402
from sklearn.metrics import (  # noqa: E402
    accuracy_score, classification_report, confusion_matrix, f1_score,
    log_loss, roc_auc_score,
)

import lightgbm as lgb  # noqa: E402
import xgboost as xgb  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
ART = os.path.join(HERE, "artifacts")
os.makedirs(ART, exist_ok=True)

# معاملات النموذج النهائي — مختارة من مفاضلة الحجم/الدقة في السجل أدناه
FINAL_PARAMS = dict(
    objective="multiclass", num_class=3, n_estimators=150, learning_rate=0.13,
    num_leaves=31, min_child_samples=30, subsample=0.85, subsample_freq=1,
    colsample_bytree=0.85, reg_lambda=2.0, max_cat_to_onehot=8, cat_smooth=25,
    min_data_per_group=50, n_jobs=-1, random_state=42, verbose=-1,
)
REASON_PARAMS = dict(
    objective="multiclass", n_estimators=50, learning_rate=0.25, num_leaves=16,
    min_child_samples=40, subsample=0.85, subsample_freq=1, colsample_bytree=0.85,
    reg_lambda=3.0, max_cat_to_onehot=8, cat_smooth=25, min_data_per_group=40,
    n_jobs=-1, random_state=42, verbose=-1,
)

# تجميع الخصائص التقنية تحت مفاهيم تشغيلية يفهمها فريق الدورة الإيرادية
SHAP_GROUPS = {
    "total":         ("إجمالي الفاتورة",            ["total", "log_total"]),
    "contract":      ("عقد التأمين (الضامن)",       ["contract", "contract_hist_rej", "contract_hist_appr", "contract_vol"]),
    "hospital":      ("المستشفى",                   ["hospital", "hosp_hist_rej", "hosp_hist_appr", "hosp_vol"]),
    "clinic":        ("القسم / العيادة",            ["clinic", "clinic_hist_rej", "clinic_hist_appr", "clinic_vol"]),
    "icd":           ("التشخيص ICD-10",             ["icd_chapter", "icd_block"]),
    "nphies_elig":   ("فحص الأهلية — نفيس",         ["nphies_elig"]),
    "visit_type":    ("نوع الزيارة",                ["visit_type"]),
    "triage":        ("درجة الطوارئ CTAS",          ["triage"]),
    "bill_status":   ("حالة الفاتورة",              ["bill_status"]),
    "patient_class": ("تصنيف المريض",               ["patient_class"]),
    "nationality":   ("الجنسية",                    ["nationality"]),
    "gender":        ("الجنس",                      ["gender"]),
    "visit_time":    ("توقيت الزيارة",              ["visit_hour", "visit_dow", "visit_month", "is_night", "is_weekend"]),
    "history":       ("سجل المريض السابق",          ["prior_claims", "prior_reject_rate"]),
}


def log(msg):
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)


# ──────────────────────────────────────────────────────────────────────
def prepare(path):
    log(f"قراءة البيانات: {path}")
    raw = P.load_raw(path)
    log(f"إجمالي الصفوف: {len(raw):,}")

    df = raw[P.decided_mask(raw)].copy()
    df["_vd"] = pd.to_datetime(df["Visit Date"], errors="coerce")
    df = df.sort_values("_vd", kind="mergesort").reset_index(drop=True)
    log(f"المطالبات ذات القرار النهائي: {len(df):,}")

    X, vocab = P.build_features(df)
    X = pd.concat([X, P.build_entity_history(df)], axis=1)[P.ALL_FEATURES]
    y = df[P.COL_TARGET].astype(str).str.strip().map({c: i for i, c in enumerate(P.CLASSES)}).values
    return raw, df, X, y, vocab


VOCAB = {}


def as_cat(d):
    """dtype فئوي بمدى ثابت — انظر rcm_pipeline.to_categorical."""
    return P.to_categorical(d, VOCAB)


# ──────────────────────────────────────────────────────────────────────
def bakeoff(X, y, cut):  # noqa: C901
    """مقارنة الخوارزميات على تقسيم زمني (تدريب على الماضي، اختبار على المستقبل)."""
    log("── مفاضلة الخوارزميات (تقسيم زمني 80/20) ──")
    Xtr, Xte, ytr, yte = X.iloc[:cut], X.iloc[cut:], y[:cut], y[cut:]
    Xtrf, Xtef = Xtr.fillna(-999), Xte.fillna(-999)
    Xtrc, Xtec = as_cat(Xtr), as_cat(Xte)
    cat_idx = [X.columns.get_loc(c) for c in P.CAT_FEATURES]
    rows = []

    def ev(name, proba, note=""):
        pred = proba.argmax(1)
        r = dict(
            model=name,
            accuracy=round(float(accuracy_score(yte, pred)), 4),
            f1_macro=round(float(f1_score(yte, pred, average="macro")), 4),
            f1_weighted=round(float(f1_score(yte, pred, average="weighted")), 4),
            roc_auc_ovr=round(float(roc_auc_score(yte, proba, multi_class="ovr", average="macro")), 4),
            log_loss=round(float(log_loss(yte, proba, labels=[0, 1, 2])), 4),
            note=note,
        )
        rows.append(r)
        log(f"  {name:26s} acc={r['accuracy']:.4f}  f1M={r['f1_macro']:.4f}  "
            f"AUC={r['roc_auc_ovr']:.4f}  logloss={r['log_loss']:.4f}")
        return r

    ev("Baseline (نسبة أساسية)", DummyClassifier(strategy="prior").fit(Xtr, ytr).predict_proba(Xte),
       "توقّع الفئة الأكثر شيوعاً")

    mu, sd = Xtrf.mean(), Xtrf.std() + 1e-9
    ev("Logistic Regression",
       LogisticRegression(max_iter=2000).fit((Xtrf - mu) / sd, ytr).predict_proba((Xtef - mu) / sd),
       "نموذج خطي مرجعي")
    ev("Random Forest",
       RandomForestClassifier(n_estimators=500, min_samples_leaf=3, n_jobs=-1,
                              random_state=42).fit(Xtrf, ytr).predict_proba(Xtef),
       "النموذج المستخدم سابقاً")
    ev("Extra Trees",
       ExtraTreesClassifier(n_estimators=500, min_samples_leaf=3, n_jobs=-1,
                            random_state=42).fit(Xtrf, ytr).predict_proba(Xtef))
    ev("HistGradientBoosting",
       HistGradientBoostingClassifier(max_iter=500, learning_rate=0.05, max_leaf_nodes=31,
                                      l2_regularization=2.0, min_samples_leaf=40,
                                      categorical_features=cat_idx, random_state=42,
                                      early_stopping=False).fit(Xtr, ytr).predict_proba(Xte))
    ev("XGBoost",
       xgb.XGBClassifier(n_estimators=800, learning_rate=0.04, max_depth=6, subsample=0.85,
                         colsample_bytree=0.8, reg_lambda=3.0, min_child_weight=10,
                         objective="multi:softprob", num_class=3, tree_method="hist",
                         n_jobs=-1, random_state=42).fit(Xtrf, ytr).predict_proba(Xtef))

    final = lgb.LGBMClassifier(**FINAL_PARAMS).fit(Xtrc, ytr)
    best = ev("LightGBM (المُعتمد)", final.predict_proba(Xtec), "أشجار معزَّزة + دعم أصلي للفئات")
    best["_model"] = final

    # مقاييس تفصيلية للنموذج المعتمد
    proba = final.predict_proba(Xtec)
    pred = proba.argmax(1)
    best["confusion_matrix"] = confusion_matrix(yte, pred).tolist()
    best["per_class"] = classification_report(
        yte, pred, target_names=[P.CLASS_AR[c] for c in P.CLASSES],
        output_dict=True, zero_division=0)
    best["auc_per_class"] = {
        P.CLASS_AR[c]: round(float(roc_auc_score((yte == i).astype(int), proba[:, i])), 4)
        for i, c in enumerate(P.CLASSES)}
    best["top2_accuracy"] = round(float(np.mean([
        yt in np.argsort(-p)[:2] for yt, p in zip(yte, proba)])), 4)
    return rows, best


# ──────────────────────────────────────────────────────────────────────
def train_reason_model(raw, vocab, snap):
    """نموذج التنبؤ بسبب الرفض المتوقّع — يُدرَّب على المطالبات غير المقبولة كلياً."""
    log("── نموذج أسباب الرفض ──")
    st = raw[P.COL_TARGET].astype(str).str.strip()
    d = raw[st.isin(["Rejected", "Partially Approved"])].copy()
    d["_code"] = d[P.COL_REASON].map(P.classify_reason)
    d = d[~d["_code"].isin(["NONE"])]

    counts = d["_code"].value_counts()
    keep = counts[counts >= 150].index.tolist()
    d = d[d["_code"].isin(keep)]
    labels = sorted(keep)
    log(f"  صفوف: {len(d):,}   أصناف الأسباب: {len(labels)}")

    Xr, _ = P.build_features(d, vocab)
    Xr = pd.concat([Xr, P.apply_entity_snapshot(d, snap)], axis=1)[P.ALL_FEATURES]
    yr = d["_code"].map({c: i for i, c in enumerate(labels)}).values

    n = len(d)
    cut = int(n * 0.8)
    order = np.argsort(pd.to_datetime(d["Visit Date"], errors="coerce").values)
    Xr, yr = Xr.iloc[order], yr[order]

    params = dict(REASON_PARAMS, num_class=len(labels))
    m = lgb.LGBMClassifier(**params).fit(as_cat(Xr.iloc[:cut]), yr[:cut])
    pr = m.predict_proba(as_cat(Xr.iloc[cut:]))
    yt = yr[cut:]
    top1 = float(accuracy_score(yt, pr.argmax(1)))
    top3 = float(np.mean([t in np.argsort(-p)[:3] for t, p in zip(yt, pr)]))
    base = float(pd.Series(yt).value_counts(normalize=True).iloc[0])
    log(f"  Top-1={top1:.4f}  Top-3={top3:.4f}  (الأساس={base:.4f})")

    final = lgb.LGBMClassifier(**params).fit(as_cat(Xr), yr)
    metrics = dict(top1_accuracy=round(top1, 4), top3_accuracy=round(top3, 4),
                   baseline=round(base, 4), n_rows=int(len(d)), n_classes=len(labels),
                   class_distribution={k: int(v) for k, v in counts[keep].items()})
    return final, labels, metrics


# ──────────────────────────────────────────────────────────────────────
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", required=True, help="مسار ملف البيانات (xlsx/csv)")
    ap.add_argument("--skip-bakeoff", action="store_true")
    args = ap.parse_args()

    raw, df, X, y, vocab = prepare(args.data)
    VOCAB.update(vocab)
    cut = int(len(df) * 0.80)
    split_date = str(df["_vd"].iloc[cut])[:10]

    rows, best = ([], {}) if args.skip_bakeoff else bakeoff(X, y, cut)

    # ── تقييم بوضع النشر الحقيقي ──
    # أثناء التدريب تُحسب معدّلات الجهات بنافذة متوسّعة، لكن الصفحة وقت التنبؤ
    # تقرأها من جدول لقطة ثابت. هذا الاختبار يقيس الأداء بالطريقة التي ستعمل بها
    # فعلاً: نموذج مُدرَّب على النافذة المتوسّعة، ومُقيَّم بلقطة مبنيّة من فترة
    # التدريب وحدها. هذا هو الرقم المُعتمد والمعروض في الصفحة.
    if not args.skip_bakeoff:
        log("── التقييم بوضع النشر (جدول لقطة) ──")
        snap_tr = P.build_entity_snapshot(df.iloc[:cut])
        Xs = pd.concat([X[P.FEATURES], P.apply_entity_snapshot(df, snap_tr)], axis=1)[P.ALL_FEATURES]
        ps = best["_model"].predict_proba(as_cat(Xs.iloc[cut:]))
        yte = y[cut:]
        pred_s = ps.argmax(1)
        best["deployment"] = dict(
            accuracy=round(float(accuracy_score(yte, pred_s)), 4),
            f1_macro=round(float(f1_score(yte, pred_s, average="macro")), 4),
            roc_auc_ovr=round(float(roc_auc_score(yte, ps, multi_class="ovr", average="macro")), 4),
            log_loss=round(float(log_loss(yte, ps, labels=[0, 1, 2])), 4),
            top2_accuracy=round(float(np.mean([t in np.argsort(-p)[:2] for t, p in zip(yte, ps)])), 4),
            confusion_matrix=confusion_matrix(yte, pred_s).tolist(),
            auc_per_class={P.CLASS_AR[c]: round(float(roc_auc_score((yte == i).astype(int), ps[:, i])), 4)
                           for i, c in enumerate(P.CLASSES)},
        )
        d = best["deployment"]
        log(f"  الدقّة={d['accuracy']:.4f}  أعلى تنبّؤين={d['top2_accuracy']:.4f}  "
            f"F1={d['f1_macro']:.4f}  AUC={d['roc_auc_ovr']:.4f}")
        best.pop("_model", None)

    # ── النموذج النهائي: يُعاد تدريبه على كامل البيانات ذات القرار ──
    log("── تدريب النموذج النهائي على كامل البيانات ──")
    model = lgb.LGBMClassifier(**FINAL_PARAMS).fit(as_cat(X), y)

    snap = P.build_entity_snapshot(raw)
    reason_model, reason_labels, reason_metrics = train_reason_model(raw, vocab, snap)

    # ── أهمية الخصائص عالمياً (SHAP) ──
    log("── حساب قيم SHAP العالمية ──")
    import shap
    expl = shap.TreeExplainer(model)
    sample = as_cat(X.sample(min(4000, len(X)), random_state=42))
    sv = expl.shap_values(sample)
    sv = np.array(sv)
    if sv.ndim == 3 and sv.shape[0] != len(P.CLASSES):   # (n, f, c) → (c, n, f)
        sv = np.transpose(sv, (2, 0, 1))
    mean_abs = np.abs(sv).mean(axis=1)                    # (classes, features)
    glob = {}
    for gi, (gk, (gar, cols)) in enumerate(SHAP_GROUPS.items()):
        idx = [X.columns.get_loc(c) for c in cols if c in X.columns]
        glob[gk] = dict(label=gar,
                        value=round(float(mean_abs[:, idx].sum(axis=1).mean()), 5))
    tot = sum(v["value"] for v in glob.values()) or 1.0
    for v in glob.values():
        v["pct"] = round(100 * v["value"] / tot, 2)
    glob = dict(sorted(glob.items(), key=lambda kv: -kv[1]["value"]))
    for k, v in glob.items():
        log(f"  {v['label']:28s} {v['pct']:5.2f}%")

    # ── حفظ ──
    model.booster_.save_model(os.path.join(ART, "approval_model.txt"))
    reason_model.booster_.save_model(os.path.join(ART, "reason_model.txt"))
    with open(os.path.join(ART, "vocab.json"), "w", encoding="utf-8") as f:
        json.dump({"vocab": vocab, "snapshot": snap, "reason_labels": reason_labels},
                  f, ensure_ascii=False)

    metrics = dict(
        generated_at=time.strftime("%Y-%m-%d %H:%M"),
        dataset=dict(rows_total=int(len(raw)), rows_decided=int(len(df)),
                     date_from=str(df["_vd"].min())[:10], date_to=str(df["_vd"].max())[:10],
                     split_date=split_date,
                     class_distribution={P.CLASS_AR[c]: int((y == i).sum())
                                         for i, c in enumerate(P.CLASSES)}),
        comparison=rows, selected=best, reason_model=reason_metrics,
        global_shap=glob, features=P.ALL_FEATURES,
    )
    with open(os.path.join(ART, "metrics.json"), "w", encoding="utf-8") as f:
        json.dump(metrics, f, ensure_ascii=False, indent=2)
    log(f"✔ metrics.json")

    # ── تصدير حزمة المتصفح ──
    import export_bundle
    export_bundle.export(model, reason_model, reason_labels, vocab, snap, raw,
                         metrics, glob, SHAP_GROUPS, ART)
    log("✔ تم")


if __name__ == "__main__":
    main()
