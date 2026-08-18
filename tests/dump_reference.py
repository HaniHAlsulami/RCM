# -*- coding: utf-8 -*-
"""
dump_reference.py — توليد مرجع التحقّق من محرّك المتصفح
Makkah Health Cluster · RCM & Data Analytics

يُخرج عيّنة صفوف مع مخرجات LightGBM ومكتبة shap في بايثون، ليقارنها
tests/verify_engine.js بمخرجات محرّك JavaScript.

    python3 tests/dump_reference.py --data data/ALL_GUARANTORS_FINAL.xlsx
    node tests/verify_engine.js
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import warnings

warnings.filterwarnings("ignore")

import numpy as np
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "model"))

import rcm_pipeline as P      # noqa: E402
import score_batch as SB      # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", required=True)
    ap.add_argument("--n", type=int, default=60, help="عدد صفوف العيّنة")
    ap.add_argument("--out", default=os.path.join(HERE, "reference.json"))
    args = ap.parse_args()

    import shap

    model, reason_model, reason_labels, vocab, snap = SB.load_artifacts()

    raw = P.load_raw(args.data)
    df = raw[P.decided_mask(raw)].copy()
    df = df.sample(min(args.n, len(df)), random_state=7)

    Xc = SB.build_matrix(df, vocab, snap)

    proba = model.predict(Xc)
    margin = model.predict(Xc, raw_score=True)
    rmargin = reason_model.predict(Xc, raw_score=True)

    expl = shap.TreeExplainer(model)
    sv = np.array(expl.shap_values(Xc))
    if sv.ndim == 3 and sv.shape[0] != len(P.CLASSES):
        sv = np.transpose(sv, (2, 0, 1))

    def clean(v):
        return None if (isinstance(v, float) and np.isnan(v)) else float(v)

    ref = dict(
        features=list(Xc.columns),
        X=[[clean(z) for z in row] for row in Xc.to_numpy(dtype=float)],
        margin=margin.tolist(),
        proba=proba.tolist(),
        shap=sv.tolist(),
        expected=np.array(expl.expected_value).tolist(),
        reason_margin=rmargin.tolist(),
    )
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(ref, f)
    print(f"✔ كُتب مرجع من {len(df)} صفاً إلى {args.out}")


if __name__ == "__main__":
    main()
