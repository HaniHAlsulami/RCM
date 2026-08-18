# -*- coding: utf-8 -*-
"""
build_corpus.py — بناء فهرس مراجع مجلس الضمان الصحي (CHI) لمساعد «سديد»
Sadeed · Makkah Health Cluster · Revenue Development Performance

يقرأ ملفات PDF (لوائح وأنظمة وسياسات CHI) ويُخرج:
  chatbot/data/corpus.js   نصوص المقاطع + فهرس بحث معكوس (BM25)
  chatbot/pages/*.jpg      صورة لكل صفحة — تُعرض كدليل بصري مع كل إجابة
  chatbot/titles.json      عناوين المستندات (يُولَّد أول مرة، ثم حرِّره يدوياً)

الملفات الممسوحة ضوئياً (بلا طبقة نصّية) تُمرَّر على tesseract بالعربية.

    python3 chatbot/build_corpus.py --src <مجلد ملفات PDF>

المتطلّبات: pymupdf · pillow · pytesseract + tesseract-ocr-ara
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import math
import os
import re
import sys
import time
import unicodedata
from collections import Counter, defaultdict

import pymupdf
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "data")
PAGES = os.path.join(HERE, "pages")
TITLES = os.path.join(HERE, "titles.json")

IMG_WIDTH = 1100          # عرض صورة الصفحة بالبكسل
IMG_QUALITY = 72
OCR_DPI = 190
MIN_CHARS_PER_PAGE = 40   # أقل من ذلك → الصفحة تُعامل كممسوحة

# ──────────────────────────────────────────────────────────────────────
# 1. تطبيع النص العربي للبحث
# ──────────────────────────────────────────────────────────────────────
_AR_NUM = str.maketrans("٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹", "01234567890123456789")
_DIAC = re.compile(r"[ؐ-ًؚ-ٰٟۖ-ۭ]")
_TATWEEL = re.compile(r"ـ+")
# حروف وأرقام فقط: نستبعد علامات الترقيم العربية (؟ ، ؛ ٪) كي لا تلتصق
# بالكلمات فتصنع رموزاً وهمية في الفهرس. النطاق مطابق لنظيره في rcm-chat.js.
_NONWORD = re.compile(r"[^0-9A-Za-z_\u0621-\u063A\u0641-\u064A\u0660-\u0669\u066E-\u06D3\u06F0-\u06F9]+")

def normalize(text: str) -> str:
    """
    تطبيع يوحّد الصور المختلفة للحرف نفسه، فيلتقي نصّ الاستعلام بنصّ الوثيقة
    حتى لو اختلف رسمهما. يعالج أيضاً أثر استخراج PDF للهمزات ولام-ألف.
    """
    if not text:
        return ""
    s = unicodedata.normalize("NFKC", text)
    s = _DIAC.sub("", s)
    s = _TATWEEL.sub("", s)
    s = re.sub("[أإآٱٲٳٵ]", "ا", s)
    s = s.replace("ى", "ي").replace("ئ", "ي").replace("ؤ", "و")
    s = s.replace("ة", "ه").replace("ﻻ", "لا")
    s = s.translate(_AR_NUM)                 # ٦٠ و 60 رمز واحد
    s = _NONWORD.sub(" ", s)
    return re.sub(r"\s+", " ", s).strip().lower()


# كلمات وظيفية تُستبعد من الفهرس: عالية التكرار وعديمة التمييز
STOP = set(normalize(w) for w in """
من في على عن الى إلى مع هذا هذه ذلك التي الذي التى او أو ثم قد كل بعض غير بين
كما حيث اذا إذا لم لن لا ما هو هي هم انه أنه وقد وان وإن يكون تكون كان كانت
عند لدى نحو دون سوى حتى منذ خلال بعد قبل امام أمام تحت فوق ضمن وفق وفقا طبقا
the of and or to in for on with a an is are be by as at from that this shall
""".split())


# سوابق ولواحق عربية شائعة — تجذير خفيف يرفع الاسترجاع دون إفراط.
# مثال: «للحمل» و«الحمل» و«حمل» تلتقي كلها عند جذر واحد.
_PREF = ("وال", "فال", "بال", "كال", "لل", "ال", "و", "ف", "ب", "ك", "ل")
_SUFF = ("هما", "كما", "هم", "هن", "كم", "ها", "ات", "ون", "ين", "ية", "يه", "ه", "ي", "ا")


def stem(tok: str) -> str:
    """يقتطع سابقة ولاحقة واحدة على الأكثر، وبشرط بقاء ثلاثة أحرف فأكثر."""
    for p in _PREF:
        if tok.startswith(p) and len(tok) - len(p) >= 3:
            tok = tok[len(p):]
            break
    for s in _SUFF:
        if tok.endswith(s) and len(tok) - len(s) >= 3:
            tok = tok[:-len(s)]
            break
    return tok


def tokenize(text: str) -> list:
    return [stem(t) for t in normalize(text).split()
            if len(t) > 1 and t not in STOP]


# ──────────────────────────────────────────────────────────────────────
# 2. استخراج النص من الصفحات
# ──────────────────────────────────────────────────────────────────────
_PRESFORM = re.compile(r"[\uFB50-\uFDFF\uFE70-\uFEFF]")

# أثر انعكاس روابط اللام: يُخرج بعض ملفات PDF الرباعيات (لا، لأ، لإ، لم)
# بترتيبها البصريّ لا المنطقيّ، فتصير «الموافقة» → «املوافقة» و«حالات» → «حاالت».
# هذه التتابعات مستحيلة في العربية السليمة، فنسبتها مقياس صادق على تلف النصّ.
_ARTIFACT = re.compile(r"[اأإآ]{2}|اإل|األ|الئ|امل")

# إصلاح ما يمكن إصلاحه يقيناً: تتابعات لا وجود لها في الإملاء الصحيح،
# فانعكاسها هو التفسير الوحيد الممكن. ما عداها يُترك للمسح الضوئي.
_FIX = [
    (re.compile(r"اال"), "الا"),
    (re.compile(r"األ"), "الأ"),
    (re.compile(r"اإل"), "الإ"),
    (re.compile(r"اآل"), "الآ"),
    (re.compile(r"الئ"), "لائ"),
]


def repair_ligatures(t: str) -> str:
    for rx, rep in _FIX:
        t = rx.sub(rep, t)
    return t


def artifact_rate(t: str) -> float:
    """عدد التتابعات المستحيلة لكل ألف حرف."""
    if not t:
        return 0.0
    return 1000.0 * len(_ARTIFACT.findall(t)) / len(t)


def _ocr(page) -> str:
    import pytesseract
    img = Image.open(io.BytesIO(page.get_pixmap(dpi=OCR_DPI).tobytes("png")))
    return unicodedata.normalize("NFKC", pytesseract.image_to_string(img, lang="ara+eng").strip())


def page_text(page, use_ocr: bool):
    """
    نصّ الصفحة. حين تكون طبقة النصّ قصيرة أو تالفة نُشغّل المسح الضوئي،
    ثم نُفاضل بين المخرجين بمعيار واحد: أيّهما أقلّ تتابعات مستحيلة —
    فالمسح الضوئي ليس أفضل دائماً، وإنما حين يكون النصّ الأصلي معطوباً.
    """
    raw = page.get_text().strip()
    # فحص أشكال العرض قبل NFKC: التطبيع يمحوها فيُخفي تلف الصفحة
    presform = len(_PRESFORM.findall(raw)) / max(len(raw), 1)
    t = unicodedata.normalize("NFKC", raw)
    suspect = (len(t) < MIN_CHARS_PER_PAGE
               or presform > 0.08
               or artifact_rate(t) > 3.0)
    if not suspect or not use_ocr:
        return repair_ligatures(t), False

    try:
        o = _ocr(page)
    except Exception as e:                                   # noqa: BLE001
        print(f"    ⚠ تعذّر OCR: {e}")
        return repair_ligatures(t), False

    if len(t) >= MIN_CHARS_PER_PAGE and presform <= 0.08:
        if len(o) < len(t) * 0.55 or artifact_rate(o) >= artifact_rate(t):
            return repair_ligatures(t), False                # النصّ الأصلي أسلم
    return repair_ligatures(o), True


HEAD_RE = re.compile(
    r"^\s*(?:الماده|المادة|البند|الفصل|الملحق|الباب|القسم)\s*[\(\)\d٠-٩/:\-\.]*.{0,70}",
)

def split_passages(text: str, max_chars: int = 700, min_chars: int = 90):
    """
    تقسيم نصّ الصفحة إلى مقاطع قابلة للاستشهاد.
    يُفضَّل القطع عند حدود المواد والبنود، فذلك أقرب لبنية اللوائح.
    """
    lines = [l.strip() for l in text.split("\n")]
    lines = [l for l in lines if l]
    chunks, cur, cur_head = [], [], ""
    for ln in lines:
        is_head = bool(HEAD_RE.match(ln)) and len(ln) < 120
        if is_head and cur and sum(len(x) for x in cur) >= min_chars:
            chunks.append((cur_head, " ".join(cur)))
            cur, cur_head = [], ln
        if is_head and not cur:
            cur_head = ln
        cur.append(ln)
        if sum(len(x) for x in cur) >= max_chars:
            chunks.append((cur_head, " ".join(cur)))
            cur = []
    if cur:
        chunks.append((cur_head, " ".join(cur)))
    out = []
    for h, c in chunks:
        c = re.sub(r"\s+", " ", c).strip()
        if len(c) >= min_chars:
            out.append((h.strip()[:110], c))
    return out


# ──────────────────────────────────────────────────────────────────────
# 3. البناء
# ──────────────────────────────────────────────────────────────────────
def guess_title(doc, fallback: str) -> str:
    """أكبر خطّ في أول صفحتين — تخمين أولي يُصحَّح يدوياً في titles.json."""
    spans = []
    for pno in range(min(2, len(doc))):
        try:
            for b in doc[pno].get_text("dict")["blocks"]:
                for l in b.get("lines", []):
                    for s in l.get("spans", []):
                        t = s["text"].strip()
                        if len(t) > 8:
                            spans.append((round(s["size"], 1), t))
        except Exception:                                    # noqa: BLE001
            pass
    if not spans:
        return fallback
    spans.sort(key=lambda x: -x[0])
    return spans[0][1][:90]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", required=True, help="مجلد ملفات PDF")
    ap.add_argument("--no-images", action="store_true", help="تخطّي توليد صور الصفحات")
    args = ap.parse_args()

    os.makedirs(DATA, exist_ok=True)
    os.makedirs(PAGES, exist_ok=True)

    titles = {}
    if os.path.exists(TITLES):
        with open(TITLES, encoding="utf-8") as f:
            titles = json.load(f)

    files = sorted(
        f for f in os.listdir(args.src) if f.lower().endswith(".pdf")
    )
    if not files:
        raise SystemExit("لا توجد ملفات PDF في المجلد المحدَّد.")

    # نفس الوثيقة قد تُرفع مرّتين باسمين مختلفين — نستبعدها ببصمة المحتوى
    # حتى لا يتكرّر المرجع نفسه مرّتين في نتائج البحث.
    seen_hash: dict[str, str] = {}
    unique = []
    for fn in files:
        with open(os.path.join(args.src, fn), "rb") as fh:
            h = hashlib.md5(fh.read()).hexdigest()
        if h in seen_hash:
            print(f"  ⊘ تخطّي {fn[:46]} — نسخة مطابقة من {seen_hash[h][:46]}")
            continue
        seen_hash[h] = fn
        unique.append(fn)
    files = unique

    docs, passages = [], []
    t0 = time.time()

    for di, fn in enumerate(files):
        path = os.path.join(args.src, fn)
        doc = pymupdf.open(path)
        key = re.sub(r"^[0-9a-f]{6,}-", "", fn)              # إزالة بادئة الرفع
        title = titles.get(key) or guess_title(doc, key)
        n_ocr = 0

        for pno in range(len(doc)):
            page = doc[pno]
            txt, ocr = page_text(page, use_ocr=True)
            n_ocr += int(ocr)

            if not args.no_images:
                pix = page.get_pixmap(dpi=150)
                img = Image.open(io.BytesIO(pix.tobytes("png"))).convert("RGB")
                if img.width > IMG_WIDTH:
                    img = img.resize(
                        (IMG_WIDTH, round(img.height * IMG_WIDTH / img.width)),
                        Image.LANCZOS)
                img.save(os.path.join(PAGES, f"d{di}-p{pno+1}.jpg"),
                         "JPEG", quality=IMG_QUALITY, optimize=True)

            for head, body in split_passages(txt):
                passages.append({"d": di, "p": pno + 1, "h": head, "t": body})

        docs.append({"id": di, "key": key, "title": title,
                     "pages": len(doc), "ocr_pages": n_ocr})
        titles.setdefault(key, title)
        print(f"  [{di+1}/{len(files)}] {key[:38]:40s} {len(doc):3d} صفحة"
              f"{f' · OCR {n_ocr}' if n_ocr else ''}")
        doc.close()

    # ── فهرس معكوس + معطيات BM25 ──
    print("\nبناء الفهرس…")
    idx = defaultdict(list)
    lengths = []
    for pi, ps in enumerate(passages):
        toks = tokenize(ps["h"] + " " + ps["t"])
        lengths.append(len(toks) or 1)
        for tok, tf in Counter(toks).items():
            idx[tok].append([pi, tf])

    # إسقاط الرموز شديدة الندرة أو شديدة الشيوع
    N = len(passages)
    idx = {k: v for k, v in idx.items() if 1 <= len(v) <= N * 0.55}

    corpus = {
        "generated_at": time.strftime("%Y-%m-%d %H:%M"),
        "docs": docs,
        "passages": [{"d": p["d"], "p": p["p"], "h": p["h"], "t": p["t"]} for p in passages],
        "len": lengths,
        "avgdl": sum(lengths) / max(len(lengths), 1),
        "N": N,
        "idx": idx,
    }

    out_js = os.path.join(DATA, "corpus.js")
    payload = json.dumps(corpus, ensure_ascii=False, separators=(",", ":"))
    with open(out_js, "w", encoding="utf-8") as f:
        f.write("/* فهرس مراجع CHI — مولَّد آلياً بواسطة chatbot/build_corpus.py */\n")
        f.write("window.CHI_CORPUS=" + payload + ";\n")

    with open(TITLES, "w", encoding="utf-8") as f:
        json.dump(titles, f, ensure_ascii=False, indent=2)

    imgs = len(os.listdir(PAGES))
    size = os.path.getsize(out_js) / 1e6
    img_mb = sum(os.path.getsize(os.path.join(PAGES, x))
                 for x in os.listdir(PAGES)) / 1e6
    print(f"\n✔ {len(docs)} مستنداً · {sum(d['pages'] for d in docs)} صفحة "
          f"· {N} مقطعاً · {len(idx):,} رمزاً في الفهرس")
    print(f"  corpus.js {size:.2f} م · {imgs} صورة صفحة ({img_mb:.1f} م) "
          f"· {time.time()-t0:.0f} ثانية")
    print(f"  حرِّر العناوين في {TITLES} ثم أعد التشغيل لتثبيتها.")


if __name__ == "__main__":
    main()
