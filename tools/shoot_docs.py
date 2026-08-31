# -*- coding: utf-8 -*-
"""
shoot_docs.py — توليد لقطات دليل الاستخدام آلياً

الدليل يشرح واجهةً تتغيّر، فاللقطات المرسومة يدوياً تتقادم بصمت وتُظهر
تسميات لم تعد موجودة. هذا السكربت يعيد توليدها كلها من الصفحة الحيّة
بمثال ثابت، فتبقى الصور مطابقة لما يراه المستخدم فعلاً.

    python3 -m http.server 8765 &
    python3 tools/shoot_docs.py [--base http://localhost:8765]

المتطلّبات: playwright + متصفّح Chromium
"""
from __future__ import annotations

import argparse
import asyncio
import os

from playwright.async_api import async_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "docs", "img")

# مثال ثابت: تاريخ مثبّت وقيم محدّدة، كي تتكرّر اللقطة نفسها عند كل توليد
CASE = ("?embed=0&total=1450&visitType=Outpatient&triage=3"
        "&icd=J06&visitDate=2025-03-11T10:30")


async def shot(page, selector: str, name: str, full_page: bool = False):
    if full_page:
        await page.screenshot(path=os.path.join(OUT, name), full_page=True)
    else:
        el = await page.query_selector(selector)
        if el is None:
            print(f"  ⚠ لم يُعثر على {selector} — تُتخطّى {name}")
            return
        await el.screenshot(path=os.path.join(OUT, name))
    print(f"  ✔ {name}")


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://localhost:8765")
    args = ap.parse_args()

    async with async_playwright() as p:
        browser = await p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
        ctx = await browser.new_context(viewport={"width": 1000, "height": 1400},
                                        device_scale_factor=2)
        page = await ctx.new_page()
        errs: list[str] = []
        page.on("pageerror", lambda e: errs.append(str(e)))
        page.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)

        # ── صفحة التنبؤ ──
        await page.goto(f"{args.base}/predict.html{CASE}", wait_until="networkidle")
        await page.wait_for_timeout(1200)
        await shot(page, "#headChips", "chips.png")
        await shot(page, ".tabs", "tabs.png")
        await shot(page, "#p-predict .card:first-child", "form.png")

        await page.click("#btnPredict")
        await page.wait_for_timeout(1200)
        await shot(page, "#result", "result.png")
        await shot(page, "#quickShap", "quickshap.png")
        await page.click('[data-p="reasons"]')
        await page.wait_for_timeout(900)
        await shot(page, "#p-reasons .reason", "reason1.png")

        await page.click('[data-p="shap"]')
        await page.wait_for_timeout(900)
        await shot(page, "#shapBody > .card:first-child", "waterfall.png")
        cards = await page.query_selector_all("#shapBody > .card")
        if len(cards) > 1:
            await cards[1].screenshot(path=os.path.join(OUT, "force.png"))
            print("  ✔ force.png")

        await page.click('[data-p="model"]')
        await page.wait_for_timeout(900)
        await shot(page, "#p-model .card:first-child", "metrics.png")

        # ── وضع التضمين ──
        await page.set_viewport_size({"width": 430, "height": 900})
        await page.goto(f"{args.base}/predict.html{CASE}&embed=1&auto=1",
                        wait_until="networkidle")
        await page.wait_for_timeout(1500)
        await shot(page, "body", "embed.png", full_page=True)

        # ── المساعد المرجعي «مساند نماء الذكي» ──
        # بطاقة الحالة تُقرأ من تخزين المتصفّح، فنشغّل تنبّؤاً أولاً في السياق نفسه
        await page.set_viewport_size({"width": 1000, "height": 1400})
        await page.goto(f"{args.base}/predict.html{CASE}", wait_until="networkidle")
        await page.wait_for_timeout(1000)
        await page.click("#btnPredict")
        await page.wait_for_timeout(1000)

        await page.goto(f"{args.base}/chatbot.html?case=1", wait_until="networkidle")
        await page.wait_for_timeout(1500)
        await shot(page, ".casecard", "case-card.png")

        await page.fill("#q", "كم مدة الرد على طلب الموافقة المسبقة؟")
        await page.click("#send")
        await page.wait_for_timeout(1500)
        await shot(page, ".analysis", "chat-analysis.png")

        print("أخطاء الصفحة:", errs or "لا شيء")
        print("ملاحظة: docs/img/llm-answer.png و llm-settings.png تُلتقطان يدوياً — "
              "الأولى تحتاج طبقة توليد مفعّلة.")
        await browser.close()


asyncio.run(main())
