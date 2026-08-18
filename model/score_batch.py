# -*- coding: utf-8 -*-
"""
score_batch.py — تسجيل دفعي لملف مطالبات كامل
Makkah Health Cluster · RCM & Data Analytics

يقرأ ملف مطالبات (xlsx/csv) ويُخرج ملفاً مسجَّلاً جاهزاً للاستيراد في Power BI،
يحتوي لكل مطالبة على: التنبؤ، احتمالات الفئات الثلاث، شريحة الخطر، الإيراد
المتوقّع، المبلغ المعرّض للخطر، أعلى ٣ عوامل SHAP، وأعلى ٣ أسباب رفض متوقّعة.

    python3 model/score_batch.py --data claims.xlsx --out scored.csv
    python3 model/score_batch.py --data claims.xlsx --out scored.xlsx --shap 5
"""
from __future__ import annotations

import argparse
import json
import os
import sys

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import rcm_pipeline as P  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
ART = os.path.join(HERE, "artifacts")

RISK_BANDS = [(0.60, "خطر مرتفع"), (0.35, "خطر متوسّط"), (0.0, "خطر منخفض")]

# تجميع الخصائص التقنية تحت مفاهيم تشغيلية (نفس تجميع الصفحة)
GROUPS = {
    "إجمالي الفاتورة": ["total", "log_total"],
    "عقد التأمين (الضامن)": ["contract", "contract_hist_rej", "contract_hist_appr", "contract_vol"],
    "المستشفى": ["hospital", "hosp_hist_rej", "hosp_hist_appr", "hosp_vol"],
    "القسم / العيادة": ["clinic", "clinic_hist_rej", "clinic_hist_appr", "clinic_vol"],
    "التشخيص ICD-10": ["icd_chapter", "icd_block"],
    "فحص الأهلية — نفيس": ["nphies_elig"],
    "نوع الزيارة": ["visit_type"],
    "درجة الطوارئ CTAS": ["triage"],
    "حالة الفاتورة": ["bill_status"],
    "تصنيف المريض": ["patient_class"],
    "الجنسية": ["nationality"],
    "الجنس": ["gender"],
    "توقيت الزيارة": ["visit_hour", "visit_dow", "visit_month", "is_night", "is_weekend"],
    "سجل المريض السابق": ["prior_claims", "prior_reject_rate"],
}


def load_artifacts():
    """يحمّل النماذج من صيغة LightGBM النصّية والقواميس من JSON (لا pickle)."""
    import lightgbm as lgb

    need = ["approval_model.txt", "reason_model.txt", "vocab.json"]
    missing = [n for n in need if not os.path.exists(os.path.join(ART, n))]
    if missing:
        raise SystemExit(
            "لم يُعثر على ملفات النموذج: " + ", ".join(missing) +
            "\nشغّل أولاً:  python3 model/train_model.py --data <ملف البيانات>")
    model = lgb.Booster(model_file=os.path.join(ART, "approval_model.txt"))
    reason_model = lgb.Booster(model_file=os.path.join(ART, "reason_model.txt"))
    with open(os.path.join(ART, "vocab.json"), encoding="utf-8") as f:
        v = json.load(f)
    return model, reason_model, v["reason_labels"], v["vocab"], v["snapshot"]


def build_matrix(df, vocab, snap):
    X, _ = P.build_features(df, vocab)
    X = pd.concat([X, P.apply_entity_snapshot(df, snap)], axis=1)[P.ALL_FEATURES]
    return P.to_categorical(X, vocab)


def score(df, model, reason_model, reason_labels, vocab, snap,
          n_shap=3, n_reasons=3, recovery=None):
    """يُرجع إطاراً بالأعمدة المسجَّلة، بنفس فهرس df."""
    import shap

    Xc = build_matrix(df, vocab, snap)
    proba = model.predict(Xc)            # Booster.predict يُخرج الاحتمالات مباشرةً
    pred = proba.argmax(1)

    out = pd.DataFrame(index=df.index)
    out["pred_label"] = [P.CLASSES[i] for i in pred]
    out["pred_label_ar"] = [P.CLASS_AR[P.CLASSES[i]] for i in pred]
    out["confidence"] = proba.max(1).round(4)
    out["p_approved"] = proba[:, 0].round(4)
    out["p_partial"] = proba[:, 1].round(4)
    out["p_rejected"] = proba[:, 2].round(4)
    out["p_not_fully_approved"] = (proba[:, 1] + proba[:, 2]).round(4)
    out["risk_band"] = [next(lbl for thr, lbl in RISK_BANDS if r >= thr) for r in proba[:, 2]]

    # الأثر المالي المتوقّع
    rec = recovery or {"Approved": 0.93, "Partially Approved": 0.50, "Rejected": 0.0}
    total = pd.to_numeric(df.get("Total"), errors="coerce").fillna(0).clip(lower=0)
    ratio = (proba[:, 0] * rec[P.CLASSES[0]] + proba[:, 1] * rec[P.CLASSES[1]]
             + proba[:, 2] * rec[P.CLASSES[2]])
    out["billed_amount"] = total.round(2)
    out["expected_revenue"] = (total * ratio).round(2)
    out["amount_at_risk"] = (total * (1 - ratio)).round(2)

    # أعلى عوامل SHAP للفئة المتنبَّأ بها
    if n_shap:
        sv = np.array(shap.TreeExplainer(model).shap_values(Xc))
        if sv.ndim == 3 and sv.shape[0] != len(P.CLASSES):
            sv = np.transpose(sv, (2, 0, 1))
        cols = list(Xc.columns)
        gidx = {g: [cols.index(c) for c in cs if c in cols] for g, cs in GROUPS.items()}
        gnames = list(gidx.keys())
        gmat = np.stack([sv[:, :, gidx[g]].sum(axis=2) for g in gnames], axis=2)  # (cls,n,grp)
        chosen = gmat[pred, np.arange(len(df)), :]                                # (n,grp)
        order = np.argsort(-np.abs(chosen), axis=1)
        for k in range(n_shap):
            j = order[:, k]
            out[f"shap_top{k + 1}"] = [gnames[t] for t in j]
            out[f"shap_top{k + 1}_value"] = chosen[np.arange(len(df)), j].round(4)
            out[f"shap_top{k + 1}_dir"] = np.where(
                chosen[np.arange(len(df)), j] >= 0, "يرفع", "يخفض")

    # أسباب الرفض المتوقّعة
    if n_reasons:
        rp = reason_model.predict(Xc)
        ro = np.argsort(-rp, axis=1)
        for k in range(n_reasons):
            j = ro[:, k]
            codes = [reason_labels[t] for t in j]
            out[f"reason_top{k + 1}"] = [P.REASON_AR.get(c, c) for c in codes]
            out[f"reason_top{k + 1}_code"] = codes
            out[f"reason_top{k + 1}_p"] = rp[np.arange(len(df)), j].round(4)
        out["reason_top1_action"] = [P.REASON_ACTION.get(c, "")
                                     for c in out["reason_top1_code"]]
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", required=True, help="ملف المطالبات المراد تسجيله")
    ap.add_argument("--out", default="scored_claims.csv", help="ملف الإخراج (csv أو xlsx)")
    ap.add_argument("--shap", type=int, default=3, help="عدد عوامل SHAP المُخرجة (0 لتعطيلها)")
    ap.add_argument("--reasons", type=int, default=3, help="عدد أسباب الرفض المُخرجة")
    ap.add_argument("--keep", default="", help="أعمدة أصلية إضافية تُرحَّل، مفصولة بفاصلة")
    args = ap.parse_args()

    model, rmodel, rlabels, vocab, snap = load_artifacts()

    recovery = None
    mb = os.path.join(ART, "model_bundle.json")
    if os.path.exists(mb):
        with open(mb, encoding="utf-8") as f:
            recovery = json.load(f).get("recovery")

    df = P.load_raw(args.data)
    print(f"قراءة {len(df):,} مطالبة من {args.data}")

    scored = score(df, model, rmodel, rlabels, vocab, snap,
                   args.shap, args.reasons, recovery)

    keep = [c.strip() for c in args.keep.split(",") if c.strip()]
    base_cols = [c for c in ["Mrn", "Episode No", "Visit Date", "Hospital Name",
                             "Clinic Name", "Contract Name", "Visit Type", "Total",
                             P.COL_TARGET] if c in df.columns]
    for c in keep:
        if c in df.columns and c not in base_cols:
            base_cols.append(c)
    result = pd.concat([df[base_cols], scored], axis=1)

    if args.out.lower().endswith((".xlsx", ".xlsm")):
        result.to_excel(args.out, index=False)
    else:
        result.to_csv(args.out, index=False, encoding="utf-8-sig")
    print(f"✔ كُتب {len(result):,} صفاً إلى {args.out}")

    print("\nتوزيع التنبؤات:")
    for k, v in result["pred_label_ar"].value_counts().items():
        print(f"  {k:16s} {v:7,}  ({100 * v / len(result):.1f}%)")
    print(f"\nإجمالي المبلغ المعرّض للخطر: {result['amount_at_risk'].sum():,.0f} ﷼")

    if P.COL_TARGET in df.columns:
        m = P.decided_mask(df)
        if m.any():
            acc = (result.loc[m, "pred_label"] == df.loc[m, P.COL_TARGET].str.strip()).mean()
            print(f"\nالتطابق مع القرارات المسجَّلة في هذا الملف: {acc:.4f}  (n={int(m.sum()):,})")
            print("  ⚠ هذا رقم داخل العيّنة إن كان الملف هو نفسه ملف التدريب — ليس دقّة النموذج.")
            print("  الدقّة المُعتمدة (على بيانات لم يرها النموذج) في model/artifacts/metrics.json")


if __name__ == "__main__":
    main()
