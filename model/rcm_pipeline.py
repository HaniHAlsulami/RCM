# -*- coding: utf-8 -*-
"""
rcm_pipeline.py
تنظيف البيانات + هندسة الخصائص + تصنيف أسباب الرفض
Makkah Health Cluster · RCM & Data Analytics

يُستخدم من train_model.py و score_batch.py و powerbi_python_script.py
لضمان أن نفس المنطق يُطبّق أثناء التدريب وأثناء التنبؤ.
"""
from __future__ import annotations

import re
import unicodedata

import numpy as np
import pandas as pd

# ──────────────────────────────────────────────────────────────────────
# 0. أعمدة المصدر
# ──────────────────────────────────────────────────────────────────────
COL_TARGET = "Approval Status"
COL_REASON = "Approval Reject Reason"

# أعمدة ممنوعة تماماً من التدريب (تسريب — تُعرف فقط بعد صدور القرار)
LEAKAGE_COLS = [
    "Total Covg",            # المبلغ المغطى = نتيجة القرار نفسه
    "Net Cash",              # المتبقي على المريض = نتيجة القرار
    "Approval Reject Reason",
    "Reject Reason",
    "Reference Approval No",  # رقم الموافقة يصدر بعد القبول
    "Resp Outcome",
    "Discharge Date",
]

# الفئات الثلاث المستهدفة
CLASSES = ["Approved", "Partially Approved", "Rejected"]
CLASS_AR = {
    "Approved": "مقبولة",
    "Partially Approved": "موافقة جزئية",
    "Rejected": "مرفوضة",
}

# ──────────────────────────────────────────────────────────────────────
# 1. أدوات تطبيع النصوص
# ──────────────────────────────────────────────────────────────────────
_WS = re.compile(r"\s+")


def norm_text(x) -> str:
    """تطبيع نص: أحرف صغيرة، مسافات موحّدة، إزالة التشكيل والمحارف الغريبة."""
    if x is None or (isinstance(x, float) and np.isnan(x)):
        return ""
    s = unicodedata.normalize("NFKC", str(x)).strip().lower()
    s = s.replace("‏", "").replace("‎", "")
    s = _WS.sub(" ", s)
    return s


def _top_n_map(series: pd.Series, n: int, other: str = "OTHER") -> dict:
    """يبني خريطة: أعلى n فئة تبقى كما هي، وما دونها يُجمع في OTHER."""
    keep = series.value_counts().head(n).index
    return {v: (v if v in keep else other) for v in series.unique()}


# ──────────────────────────────────────────────────────────────────────
# 2. تطبيع الحقول الفئوية
# ──────────────────────────────────────────────────────────────────────
def norm_nphies(x) -> str:
    """توحيد نتيجة فحص الأهلية في نفيس إلى 6 حالات."""
    s = norm_text(x)
    if not s:
        return "unknown"
    if "not-covered" in s or "not covered" in s:
        return "not_covered"
    if "not-active" in s or "not active" in s:
        return "not_active"
    if "out-network" in s or "out network" in s:
        return "out_network"
    if "not-direct" in s:
        return "not_direct_billing"
    if "error" in s:
        return "error"
    if "eligible" in s:
        return "eligible"
    if s in {"complete", "nc"}:
        return "other"
    return "other"


def norm_patient_class(x) -> str:
    """توحيد تصنيف المريض (60 قيمة خام) إلى 7 فئات تشغيلية."""
    s = norm_text(x)
    if not s:
        return "unknown"
    if "hajj from outside" in s or "حجاج الخارج" in s:
        return "hajj_outside"
    if "haj" in s or "حاج" in s:
        return "hajj"
    if "tamer" in s or "umrah" in s or "moatamer" in s or "معتمر" in s:
        return "umrah"
    if "citizen" in s or s == "saudi" in s or "مواطن" in s or s == "saudi":
        return "saudi"
    if "resident" in s or "مقيم" in s:
        return "resident"
    if "employee" in s or "موظف" in s:
        return "employee"
    if "normal" in s or "eligible for treatment" in s:
        return "normal"
    return "other"


def norm_triage(x) -> float:
    """CTAS 1 (أحرج) → 1 ... CTAS 5 (غير عاجل) → 5 ؛ المفقود → NaN."""
    s = norm_text(x)
    m = re.search(r"([1-5])", s)
    return float(m.group(1)) if m else np.nan


def norm_gender(x) -> str:
    s = norm_text(x)
    if s.startswith("m"):
        return "Male"
    if s.startswith("f"):
        return "Female"
    return "Unknown"


def icd_chapter(x) -> str:
    """الحرف الأول من ترميز ICD-10 = فصل التشخيص."""
    s = norm_text(x).upper()
    m = re.match(r"([A-Z])", s)
    return m.group(1) if m else "UNK"


def icd_block(x) -> str:
    """أول 3 محارف (مثال M62.89 → M62) = كتلة التشخيص."""
    s = norm_text(x).upper().replace(" ", "")
    m = re.match(r"([A-Z][0-9]{2})", s)
    return m.group(1) if m else "UNK"


def norm_contract(x) -> str:
    """تطبيع اسم العقد/الضامن: إزالة الفروع والسنوات للتجميع الصحيح."""
    s = norm_text(x)
    if not s:
        return "unknown"
    s = re.sub(r"\b(19|20)\d{2}\b", "", s)
    s = re.sub(r"\b(branch|فرع|co|ltd|company|corporation|group|شركة)\b", " ", s)
    s = _WS.sub(" ", s).strip()
    return s or "unknown"


# ──────────────────────────────────────────────────────────────────────
# 3. تصنيف أسباب الرفض — Taxonomy
#    مرتّبة من الأكثر تحديداً إلى الأعم؛ أول نمط يطابق هو الفائز.
# ──────────────────────────────────────────────────────────────────────
REASON_TAXONOMY = [
    ("DUPLICATE", "مطالبة مكررة / تمت الموافقة عليها مسبقاً", [
        r"duplicate", r"already been approved", r"already approved",
    ]),
    ("ELIGIBILITY", "عدم أهلية المؤمَّن عليه أو بطاقة غير سارية", [
        r"insured not found", r"invalid membership", r"member is not exist",
        r"not exists", r"membership number", r"not-active", r"not active",
        r"policy (is )?(not active|expired)", r"insured is not authorized",
        r"beneficiary not", r"غير مؤهل", r"member number not found",
        r"member did\s?n.t have", r"effective information", r"no benefit",
    ]),
    ("NETWORK", "مقدّم الخدمة خارج شبكة التغطية", [
        r"not part of the coverage network", r"not\s+appointed for this member",
        r"out-?network", r"provider is not active", r"not a ncci provider",
        r"this is not a ncci", r"provider (cannot be|can not be) found",
        r"provider is not mapped", r"not mapped with nphies",
    ]),
    ("LATE_SUBMISSION", "تأخر التقديم أو الإشعار خارج المهلة النظامية", [
        r"late submission", r"late notification", r"not within validity",
        r"time limit", r"exceeded the submission",
    ]),
    ("PRICING_CODING", "خطأ في التسعير أو الترميز أو بيانات المطالبة", [
        r"price not specif", r"not mapped with provider price",
        r"item not correct", r"validation error", r"payer id",
        r"license number must", r"cannot exceed maximum", r"sequence \d",
        r"invalid code", r"coding error", r"error occured", r"error details",
        r"invalid quantity", r"technical issue", r"could not process the claim",
        r"try again later",
    ]),
    ("REFERRAL_REQUIRED", "يلزم إحالة من الرعاية الأولية أو منشأة معتمدة", [
        r"obtain a referral", r"obtain referral", r"referral first",
        r"refer the patient to any appointed", r"referral from primary",
    ]),
    ("DOCUMENTATION", "نقص في المستندات أو التقارير الطبية المطلوبة", [
        r"please provide", r"please update", r"attach", r"missing medical",
        r"provide us", r"full hx", r"er note", r"medical report",
        r"supporting investigations", r"circumstances of trauma",
        r"subject to final medical report", r"additional information still required",
        r"under review", r"additional services could be granted",
    ]),
    ("URGENCY", "الحالة لا تنطبق عليها معايير الطوارئ / غير عاجلة", [
        r"urgency criteria", r"criteria of urgency", r"not classified as an emergency",
        r"does not meet emergency", r"non-?\s?emergency", r"not emergency",
        r"emergency criteria", r"ctas \d level",
    ]),
    ("OPD_NOT_COVERED", "خدمات أو أدوية العيادات الخارجية غير مغطاة بالوثيقة", [
        r"opd (medication|med|services|service|not)", r"op medication",
        r"outpatient services not covered", r"opd meds",
    ]),
    ("DIAGNOSIS_NOT_COVERED", "التشخيص غير مشمول في التغطية", [
        r"diagnos\w* (is )?not covered", r"primary diagnos\w* not covered",
        r"not declared", r"pre-?existing", r"chronic condition",
    ]),
    ("MEDICAL_NECESSITY", "عدم كفاية المبرر الطبي للخدمة المطلوبة", [
        r"not clinically justified", r"not justifying", r"not justified",
        r"not clinically indicated", r"clinical practice guideline",
        r"stage of disease", r"not indicated",
    ]),
    ("LIMIT_EXCEEDED", "تجاوز حدود أو سقف التغطية / موافقة جزئية بحدود", [
        r"exceed(s|ed)? (the )?limit", r"limits, exclusions",
        r"maximum limit", r"ceiling", r"^partial$", r"partially approved",
        r"annual limit", r"sublimit", r"pre-?approval limit", r"below the pre-?approval",
        r"approved only", r"as listed",
    ]),
    ("POLICY_EXCLUSION", "الحالة ضمن استثناءات وثيقة التأمين", [
        r"policy exclusion", r"not covered (as|under|per) policy",
        r"not covered under policy scope", r"policy scope",
        r"out of policy", r"exclusion", r"not covered",
        r"policy conditions", r"terms and conditions",
    ]),
    ("NO_PRIOR_AUTH_REQUIRED", "لا تتطلب موافقة مسبقة (تنبيه إجرائي)", [
        r"do not require prior approval", r"does not require prior approval",
        r"no prior approval",
    ]),
    ("APPROVED_WITH_TERMS", "موافقة مشروطة بشروط الوثيقة والأسعار المتعاقد عليها", [
        r"all listed services are approved", r"^approved", r"subject to policy",
        r"agreed prices",
    ]),
]

REASON_AR = {code: ar for code, ar, _ in REASON_TAXONOMY}
REASON_AR["OTHER"] = "سبب آخر غير مصنّف"
REASON_AR["NONE"] = "لا يوجد سبب مسجّل"
REASON_CODES = [c for c, _, _ in REASON_TAXONOMY] + ["OTHER"]

# إجراء تصحيحي مقترح لكل سبب — يُعرض في الواجهة
REASON_ACTION = {
    "DUPLICATE": "تحقّق من عدم وجود مطالبة سابقة بنفس رمز الخدمة والتاريخ قبل الإرسال.",
    "ELIGIBILITY": "أعد فحص الأهلية في نفيس وتأكد من سريان البوليصة ورقم العضوية.",
    "NETWORK": "تأكد من أن المنشأة ضمن شبكة الضامن، أو احصل على موافقة استثنائية مسبقة.",
    "LATE_SUBMISSION": "أرسل المطالبة خلال المهلة النظامية (30 يوماً) ووثّق تاريخ الإشعار.",
    "PRICING_CODING": "راجع التسعير ومطابقة رموز الخدمات مع قائمة أسعار الضامن قبل الإرسال.",
    "REFERRAL_REQUIRED": "احصل على إحالة من مركز الرعاية الأولية أو وجّه المريض لمنشأة ضمن الشبكة.",
    "DOCUMENTATION": "أرفق تقرير الطوارئ والتاريخ المرضي والفحص السريري ونتائج التحاليل.",
    "URGENCY": "وثّق مؤشرات الحالة الحرجة (العلامات الحيوية وتصنيف CTAS) لإثبات صفة الطوارئ.",
    "OPD_NOT_COVERED": "راجع نطاق تغطية العيادات الخارجية في العقد قبل تقديم الخدمة أو الدواء.",
    "DIAGNOSIS_NOT_COVERED": "تحقق من شمول التشخيص في العقد، وأضف تشخيصاً داعماً إن وُجد.",
    "MEDICAL_NECESSITY": "أرفق مبرراً طبياً مفصّلاً يربط الخدمة المطلوبة بحالة المريض ودلائل الممارسة.",
    "LIMIT_EXCEEDED": "راجع الحد المتبقي في وثيقة المريض، وجزّئ الخدمات إن لزم.",
    "POLICY_EXCLUSION": "راجع بنود الاستثناءات في العقد قبل الإرسال، وأبلغ المريض بالتحمّل.",
    "NO_PRIOR_AUTH_REQUIRED": "قدّم الخدمة مباشرة — لا حاجة لموافقة مسبقة لهذا المبلغ.",
    "APPROVED_WITH_TERMS": "التزم بالأسعار المتعاقد عليها وحدود الوثيقة عند الفوترة.",
    "OTHER": "راجع نص رد الضامن يدوياً وصنّفه ضمن أسباب الرفض المعتمدة.",
}

_COMPILED = [(code, [re.compile(p) for p in pats]) for code, _, pats in REASON_TAXONOMY]


def classify_reason(text) -> str:
    """يحوّل نص رد الضامن الحر إلى رمز سبب معياري واحد."""
    s = norm_text(text)
    if not s:
        return "NONE"
    for code, pats in _COMPILED:
        for p in pats:
            if p.search(s):
                return code
    return "OTHER"


def classify_reasons_multi(text) -> list:
    """نفس الشيء لكن يعيد كل الأسباب المطابقة (رد الضامن قد يحمل أكثر من سبب)."""
    s = norm_text(text)
    if not s:
        return []
    out = []
    for code, pats in _COMPILED:
        if any(p.search(s) for p in pats):
            out.append(code)
    return out or ["OTHER"]


# ──────────────────────────────────────────────────────────────────────
# 4. هندسة الخصائص
# ──────────────────────────────────────────────────────────────────────
NUM_FEATURES = [
    "total", "log_total", "triage", "visit_hour", "visit_dow",
    "visit_month", "is_night", "is_weekend", "prior_claims", "prior_reject_rate",
]
CAT_FEATURES = [
    "visit_type", "hospital", "clinic", "bill_status", "nationality",
    "contract", "nphies_elig", "gender", "icd_chapter", "icd_block",
    "patient_class",
]
FEATURES = NUM_FEATURES + CAT_FEATURES

FEATURE_AR = {
    "total": "إجمالي الفاتورة",
    "log_total": "إجمالي الفاتورة (لوغاريتمي)",
    "triage": "درجة الطوارئ CTAS",
    "visit_hour": "ساعة الزيارة",
    "visit_dow": "يوم الأسبوع",
    "visit_month": "الشهر",
    "is_night": "زيارة ليلية",
    "is_weekend": "نهاية الأسبوع",
    "prior_claims": "عدد مطالبات المريض السابقة",
    "prior_reject_rate": "نسبة رفض المريض التاريخية",
    "visit_type": "نوع الزيارة",
    "hospital": "المستشفى",
    "clinic": "القسم / العيادة",
    "bill_status": "حالة الفاتورة",
    "nationality": "الجنسية",
    "contract": "عقد التأمين (الضامن)",
    "nphies_elig": "فحص الأهلية — نفيس",
    "gender": "الجنس",
    "icd_chapter": "فصل التشخيص ICD-10",
    "icd_block": "كتلة التشخيص ICD-10",
    "patient_class": "تصنيف المريض",
}

RARE_LIMITS = {"clinic": 60, "nationality": 40, "contract": 80, "icd_block": 120}


def build_features(df: pd.DataFrame, vocab: dict | None = None) -> tuple[pd.DataFrame, dict]:
    """
    يبني مصفوفة الخصائص من البيانات الخام.
    vocab=None  → وضع التدريب: يُشتق القاموس من البيانات ويُعاد.
    vocab=dict  → وضع التنبؤ: يُطبَّق نفس القاموس المحفوظ.
    """
    out = pd.DataFrame(index=df.index)
    training = vocab is None
    vocab = {} if training else dict(vocab)

    # ── رقمية ──
    total = pd.to_numeric(df.get("Total"), errors="coerce")
    out["total"] = total.clip(lower=0, upper=200_000)
    out["log_total"] = np.log1p(out["total"].fillna(0))
    out["triage"] = df.get("Triage Category", pd.Series(index=df.index)).map(norm_triage)

    vd = pd.to_datetime(df.get("Visit Date"), errors="coerce")
    out["visit_hour"] = vd.dt.hour
    out["visit_dow"] = vd.dt.dayofweek
    out["visit_month"] = vd.dt.month
    out["is_night"] = ((vd.dt.hour < 7) | (vd.dt.hour >= 22)).astype(float)
    out["is_weekend"] = vd.dt.dayofweek.isin([4, 5]).astype(float)  # الجمعة/السبت

    # ── فئوية ──
    out["visit_type"] = df.get("Visit Type").map(norm_text).replace("", "unknown")
    out["hospital"] = df.get("Hospital Name").map(norm_text).replace("", "unknown")
    out["clinic"] = df.get("Clinic Name").map(norm_text).replace("", "unknown")
    out["bill_status"] = df.get("Bill Status").map(norm_text).replace("", "unknown")
    out["nationality"] = df.get("Nationality").map(norm_text).replace("", "unknown")
    out["contract"] = df.get("Contract Name").map(norm_contract)
    out["nphies_elig"] = df.get("Nphies Eligibility Check").map(norm_nphies)
    out["gender"] = df.get("Gender").map(norm_gender)
    out["icd_chapter"] = df.get("Icd 10").map(icd_chapter)
    out["icd_block"] = df.get("Icd 10").map(icd_block)
    out["patient_class"] = df.get("Patient Classification").map(norm_patient_class)

    # تجميع الفئات النادرة
    for col, n in RARE_LIMITS.items():
        key = f"rare_{col}"
        if training:
            vocab[key] = sorted(out[col].value_counts().head(n).index.tolist())
        keep = set(vocab.get(key, []))
        out[col] = out[col].where(out[col].isin(keep), "OTHER")

    # تاريخ المريض (زمنياً آمن — يحسب من الماضي فقط)
    out["prior_claims"], out["prior_reject_rate"] = _patient_history(df)

    # قواميس الفئات (ترميز صحيح ثابت بين التدريب والتنبؤ)
    for col in CAT_FEATURES:
        key = f"cats_{col}"
        if training:
            vocab[key] = sorted(out[col].astype(str).unique().tolist())
        levels = vocab[key]
        idx = {v: i for i, v in enumerate(levels)}
        out[col] = out[col].astype(str).map(idx).fillna(-1).astype(np.int32)

    return out[FEATURES], vocab


def _patient_history(df: pd.DataFrame):
    """عدد المطالبات السابقة ونسبة الرفض التاريخية للمريض — بدون تسريب."""
    n = len(df)
    if "Mrn" not in df.columns or "Visit Date" not in df.columns:
        return pd.Series(0.0, index=df.index), pd.Series(np.nan, index=df.index)

    tmp = pd.DataFrame({
        "mrn": df["Mrn"].astype(str),
        "vd": pd.to_datetime(df["Visit Date"], errors="coerce"),
    }, index=df.index)

    if COL_TARGET in df.columns:
        tmp["rej"] = (df[COL_TARGET].astype(str).str.strip() == "Rejected").astype(float)
        tmp["decided"] = df[COL_TARGET].isin(CLASSES).astype(float)
    else:
        tmp["rej"] = 0.0
        tmp["decided"] = 0.0

    tmp = tmp.sort_values(["mrn", "vd"], kind="mergesort")
    g = tmp.groupby("mrn", sort=False)
    prior_n = g.cumcount().astype(float)
    prior_dec = g["decided"].cumsum() - tmp["decided"]
    prior_rej = g["rej"].cumsum() - tmp["rej"]
    # تنعيم بايزي نحو المعدل العام (k=5) لتجنّب ضجيج العيّنات الصغيرة
    k, prior_mean = 5.0, 0.44
    rate = (prior_rej + k * prior_mean) / (prior_dec + k)
    rate = rate.where(prior_dec > 0, np.nan)

    return prior_n.reindex(df.index), rate.reindex(df.index)


def load_raw(path: str) -> pd.DataFrame:
    """قراءة ملف البيانات (xlsx أو csv)."""
    if str(path).lower().endswith((".xlsx", ".xlsm", ".xls")):
        return pd.read_excel(path, sheet_name=0)
    return pd.read_csv(path)


def decided_mask(df: pd.DataFrame) -> pd.Series:
    """المطالبات التي صدر فيها قرار نهائي فقط (تُستخدم للتدريب والتقييم)."""
    return df[COL_TARGET].astype(str).str.strip().isin(CLASSES)

# ──────────────────────────────────────────────────────────────────────
# 5. خصائص السجل التاريخي للجهات (عقد / مستشفى / عيادة)
#    أقوى مجموعة خصائص في النموذج (+3 نقاط دقة).
#    أثناء التدريب: تُحسب بنافذة متوسّعة (الماضي فقط) — بلا تسريب.
#    أثناء التنبؤ: تُقرأ من جداول لقطة (snapshot) مرفقة مع النموذج.
# ──────────────────────────────────────────────────────────────────────
ENTITY_COLS = {"contract": "Contract Name", "hosp": "Hospital Name", "clinic": "Clinic Name"}
ENTITY_FEATURES = [f"{n}_{s}" for n in ENTITY_COLS for s in ("hist_rej", "hist_appr", "vol")]
ENTITY_K = 25.0          # قوة التنعيم البايزي
PRIOR_REJ, PRIOR_APPR = 0.44, 0.43

FEATURE_AR.update({
    "contract_hist_rej": "معدل الرفض التاريخي للضامن",
    "contract_hist_appr": "معدل القبول التاريخي للضامن",
    "contract_vol": "حجم مطالبات الضامن",
    "hosp_hist_rej": "معدل الرفض التاريخي للمستشفى",
    "hosp_hist_appr": "معدل القبول التاريخي للمستشفى",
    "hosp_vol": "حجم مطالبات المستشفى",
    "clinic_hist_rej": "معدل الرفض التاريخي للعيادة",
    "clinic_hist_appr": "معدل القبول التاريخي للعيادة",
    "clinic_vol": "حجم مطالبات العيادة",
})

ALL_FEATURES = FEATURES + ENTITY_FEATURES


def build_entity_history(df: pd.DataFrame) -> pd.DataFrame:
    """نافذة متوسّعة زمنياً — تُستخدم في التدريب فقط. يفترض df مُرتّباً بتاريخ الزيارة."""
    st = df[COL_TARGET].astype(str).str.strip()
    rej = (st == "Rejected").astype(float)
    appr = (st == "Approved").astype(float)
    out = pd.DataFrame(index=df.index)
    for name, col in ENTITY_COLS.items():
        key = df[col].astype(str).map(norm_text)
        for suf, val, prior in (("hist_rej", rej, PRIOR_REJ), ("hist_appr", appr, PRIOR_APPR)):
            g = val.groupby(key)
            cum = g.cumsum() - val
            cnt = g.cumcount()
            out[f"{name}_{suf}"] = ((cum + ENTITY_K * prior) / (cnt + ENTITY_K)).values
        out[f"{name}_vol"] = np.log1p(key.groupby(key).cumcount().astype(float)).values
    return out


def build_entity_snapshot(df: pd.DataFrame) -> dict:
    """جداول اللقطة النهائية التي تُشحن مع النموذج وتُستخدم وقت التنبؤ."""
    d = df[decided_mask(df)]
    st = d[COL_TARGET].astype(str).str.strip()
    rej = (st == "Rejected").astype(float)
    appr = (st == "Approved").astype(float)
    snap = {}
    for name, col in ENTITY_COLS.items():
        key = d[col].astype(str).map(norm_text)
        g_r = rej.groupby(key).agg(["sum", "size"])
        g_a = appr.groupby(key).agg(["sum", "size"])
        tbl = {}
        for k in g_r.index:
            n = float(g_r.loc[k, "size"])
            tbl[k] = [
                round(float((g_r.loc[k, "sum"] + ENTITY_K * PRIOR_REJ) / (n + ENTITY_K)), 5),
                round(float((g_a.loc[k, "sum"] + ENTITY_K * PRIOR_APPR) / (n + ENTITY_K)), 5),
                round(float(np.log1p(n)), 4),
            ]
        snap[name] = {
            "table": tbl,
            "default": [PRIOR_REJ, PRIOR_APPR, 0.0],   # جهة غير معروفة → المعدل العام
        }
    return snap


def apply_entity_snapshot(df: pd.DataFrame, snap: dict) -> pd.DataFrame:
    """تطبيق جداول اللقطة على بيانات جديدة (وضع التنبؤ)."""
    out = pd.DataFrame(index=df.index)
    for name, col in ENTITY_COLS.items():
        key = df[col].astype(str).map(norm_text)
        tbl, dflt = snap[name]["table"], snap[name]["default"]
        vals = key.map(lambda k: tbl.get(k, dflt))
        for i, suf in enumerate(("hist_rej", "hist_appr", "vol")):
            out[f"{name}_{suf}"] = [v[i] for v in vals]
    return out


def load_raw(path: str) -> pd.DataFrame:  # noqa: F811 (يُعاد تعريفه أدناه عمداً)
    if str(path).lower().endswith((".xlsx", ".xlsm", ".xls")):
        return pd.read_excel(path, sheet_name=0)
    return pd.read_csv(path)


def to_categorical(X: pd.DataFrame, vocab: dict) -> pd.DataFrame:
    """
    يحوّل الأعمدة الفئوية إلى dtype فئوي بمدى **ثابت وكامل** (0..n-1).

    مهم: لو تُرك الأمر لـ ``astype("category")`` لاشتقّت الفئات من القيم
    الحاضرة في هذا الإطار فقط، فتُعاد فهرسة الرموز داخلياً في LightGBM
    ويختلف الترميز بين نموذج وآخر (مثلاً نموذج الأسباب المُدرَّب على مجموعة
    جزئية). تثبيت المدى يضمن أن الرمز المُصدَّر إلى المتصفح = الرمز الذي
    تعلّمه النموذج.
    """
    out = X.copy()
    for col in CAT_FEATURES:
        if col not in out.columns:
            continue
        n = len(vocab[f"cats_{col}"])
        out[col] = pd.Categorical(out[col], categories=list(range(n)))
    return out
