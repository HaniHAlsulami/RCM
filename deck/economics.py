import json
m=json.load(open('../model/artifacts/metrics.json'))
b=json.load(open('../model/artifacts/model_bundle.json'))
d=m['dataset']; dep=m['selected']['deployment']; cm=dep['confusion_matrix']
rec=b['recovery']

TN,FP=cm[0]; FN,TP=cm[1]; N=TN+FP+FN+TP
act_nfa=FN+TP; act_app=TN+FP
recall=TP/act_nfa; prec=TP/(TP+FP); flagged=TP+FP
top3=m['reason_model']['top3_accuracy']
rA,rN=rec['Approved'],rec['NotFullyApproved']; gap=rA-rN

print(f"test n={N}  NFA={act_nfa} ({act_nfa/N:.4f})  flagged={flagged} ({flagged/N:.4f})")
print(f"recall={recall:.4f} prec={prec:.4f} top3={top3:.4f}")
print(f"recovery A={rA} N={rN} gap={gap:.4f}")

# per 1000 claims submitted
p=act_nfa/N
n_nfa=1000*p; n_flag=n_nfa*recall; n_diag=n_flag*top3
print(f"\nper 1000: nfa={n_nfa:.0f} flagged={n_flag:.0f} diagnosed={n_diag:.0f}")
print(f"reviews/1000 = {1000*flagged/N:.0f}")

# leakage per 1M SAR (uniform claim value)
coll=(1000*(1-p)*rA + 1000*p*rN)/1000
print(f"\ncollection rate today = {coll:.4f} -> leak {1-coll:.4f} = {(1-coll)*1e6:,.0f} SAR per 1M")

# recovery rate on submitted value per unit fix-rate
unit = p*recall*top3*gap
print(f"recovery = {unit:.5f} x fix_rate  of submitted value")
for f in (.2,.3,.4,.5):
    r=unit*f
    print(f"  f={f:.0%}: {r:.4%} of submitted = {r*1e6:,.0f} SAR/1M | {r/(1-coll):.1%} of leakage | claims fixed/1000 = {n_diag*f:.0f}")

# annual volume
days=198; ann=d['rows_total']/days*365
print(f"\nannual claims screened = {ann:,.0f}")
print("\nannual SAR recovered (millions):")
print(f"{'avg claim':>10} | " + " | ".join(f"f={f:.0%}" for f in (.2,.3,.4,.5)))
for V in (1000,2000,3000,5000,8000):
    sub=ann*V
    row=" | ".join(f"{unit*f*sub/1e6:6.1f}" for f in (.2,.3,.4,.5))
    print(f"{V:>10,} | {row}   (submitted {sub/1e6:,.0f}M)")

# return per review hour
for V in (1000,3000):
    for f in (.2,):
        val=unit*f*1e6*(V/1000)   # per 1M-claim-count... careful
        pass
rev_per_1000=1000*flagged/N
hours=rev_per_1000*3/60
for V in (1000,3000,5000):
    for f in (.2,.4):
        sar=unit*f*1000*V
        print(f"V={V} f={f:.0%}: {sar:,.0f} SAR per 1000 claims / {hours:.1f} review-hours = {sar/hours:,.0f} SAR per review hour")
