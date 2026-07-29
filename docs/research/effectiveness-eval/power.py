"""Power arithmetic for the trial-design memo. Pure Python, no deps.

Two-sample (independent groups) comparison of means, two-sided alpha.
1) Normal approximation:  n_per_group = 2 * (z_{1-a/2} + z_{1-b})^2 / d^2
2) Exact: noncentral t, power = 1 - F_T'(t_crit; df=2n-2, ncp=d*sqrt(n/2))
   (upper tail only; lower-tail contribution is negligible at these ncp)
"""
import math

# ---------- basic distribution machinery ----------

def norm_cdf(x):
    return 0.5 * (1.0 + math.erf(x / math.sqrt(2.0)))

def norm_ppf(p):
    """Acklam's rational approximation, |err| < 1.15e-9."""
    a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02,
         1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00]
    b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02,
         6.680131188771972e+01, -1.328068155288572e+01]
    c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00,
         -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00]
    d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00,
         3.754408661907416e+00]
    plow, phigh = 0.02425, 1 - 0.02425
    if p < plow:
        q = math.sqrt(-2 * math.log(p))
        return (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / \
               ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1)
    if p > phigh:
        q = math.sqrt(-2 * math.log(1 - p))
        return -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / \
                ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1)
    q = p - 0.5
    r = q * q
    return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q / \
           (((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1)

def _lgamma(x):
    return math.lgamma(x)

def chi2_logpdf(u, df):
    k = df / 2.0
    return (k - 1) * math.log(u) - u / 2.0 - k * math.log(2.0) - _lgamma(k)

def t_ppf(p, df):
    """Invert the central t CDF by bisection (CDF via incomplete beta)."""
    lo, hi = -100.0, 100.0
    for _ in range(200):
        mid = (lo + hi) / 2.0
        if t_cdf(mid, df) < p:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2.0

def _betacf(a, b, x):
    MAXIT, EPS, FPMIN = 300, 3e-16, 1e-300
    qab, qap, qam = a + b, a + 1.0, a - 1.0
    c = 1.0
    d = 1.0 - qab * x / qap
    if abs(d) < FPMIN:
        d = FPMIN
    d = 1.0 / d
    h = d
    for m in range(1, MAXIT + 1):
        m2 = 2 * m
        aa = m * (b - m) * x / ((qam + m2) * (a + m2))
        d = 1.0 + aa * d
        if abs(d) < FPMIN:
            d = FPMIN
        c = 1.0 + aa / c
        if abs(c) < FPMIN:
            c = FPMIN
        d = 1.0 / d
        h *= d * c
        aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2))
        d = 1.0 + aa * d
        if abs(d) < FPMIN:
            d = FPMIN
        c = 1.0 + aa / c
        if abs(c) < FPMIN:
            c = FPMIN
        d = 1.0 / d
        de = d * c
        h *= de
        if abs(de - 1.0) < EPS:
            break
    return h

def betainc(a, b, x):
    if x <= 0.0:
        return 0.0
    if x >= 1.0:
        return 1.0
    lbeta = _lgamma(a + b) - _lgamma(a) - _lgamma(b) + a * math.log(x) + b * math.log(1.0 - x)
    if x < (a + 1.0) / (a + b + 2.0):
        return math.exp(lbeta) * _betacf(a, b, x) / a
    return 1.0 - math.exp(lbeta) * _betacf(b, a, 1.0 - x) / b

def t_cdf(t, df):
    x = df / (df + t * t)
    p = 0.5 * betainc(df / 2.0, 0.5, x)
    return p if t <= 0 else 1.0 - p

def nct_sf(t, df, ncp, n_nodes=4000):
    """P(T' > t) for noncentral t, by integrating over the chi-square scale factor."""
    lo = max(1e-10, df - 12.0 * math.sqrt(2.0 * df))
    hi = df + 14.0 * math.sqrt(2.0 * df) + 40.0
    h = (hi - lo) / n_nodes
    total = 0.0
    for i in range(n_nodes + 1):
        u = lo + i * h
        if u <= 0:
            continue
        w = 1.0 if i in (0, n_nodes) else (4.0 if i % 2 == 1 else 2.0)
        # P(Z > t*sqrt(u/df) - ncp)
        total += w * math.exp(chi2_logpdf(u, df)) * (1.0 - norm_cdf(t * math.sqrt(u / df) - ncp))
    return total * h / 3.0

# ---------- power / sample size ----------

def n_normal_approx(d, alpha=0.05, power=0.80):
    z_a = norm_ppf(1 - alpha / 2.0)
    z_b = norm_ppf(power)
    return 2.0 * (z_a + z_b) ** 2 / d ** 2

def power_exact(n, d, alpha=0.05):
    df = 2 * n - 2
    ncp = d * math.sqrt(n / 2.0)
    tcrit = t_ppf(1 - alpha / 2.0, df)
    return nct_sf(tcrit, df, ncp)

def n_exact(d, alpha=0.05, target=0.80):
    n = 2
    while power_exact(n, d, alpha) < target:
        n += 1
        if n > 200000:
            break
    return n

# ---------- report ----------

print("=" * 78)
print("STEP 1  Analysed N per arm, two-sided alpha=.05, power=.80, two-sample t")
print("=" * 78)
z_a = norm_ppf(0.975)
z_b = norm_ppf(0.80)
print(f"  z_(1-alpha/2) = {z_a:.6f}   z_(1-beta) = {z_b:.6f}")
print(f"  2*(z_a+z_b)^2 = {2*(z_a+z_b)**2:.4f}   -> n = {2*(z_a+z_b)**2:.4f} / d^2\n")
print(f"  {'d':>5} {'normal approx':>14} {'ceil':>6} {'exact nct':>10} {'power@exact':>12}")
rows = {}
for d in (0.10, 0.15, 0.20, 0.30, 0.40, 0.50, 0.80):
    na = n_normal_approx(d)
    ne = n_exact(d)
    rows[d] = ne
    print(f"  {d:>5.2f} {na:>14.2f} {math.ceil(na):>6d} {ne:>10d} {power_exact(ne, d):>12.4f}")

print()
print("=" * 78)
print("STEP 2  ANCOVA with a pretest covariate: n_adj = n * (1 - r^2)")
print("        (Borm/Fedorov design factor; r = pretest-posttest correlation)")
print("=" * 78)
print(f"  {'d':>5} " + " ".join(f"{('r=%.1f' % r):>9}" for r in (0.0, 0.5, 0.6, 0.7, 0.8)))
ancova = {}
for d in (0.10, 0.15, 0.20, 0.30, 0.40, 0.50, 0.80):
    cells = []
    for r in (0.0, 0.5, 0.6, 0.7, 0.8):
        v = math.ceil(rows[d] * (1 - r * r))
        cells.append(v)
    ancova[d] = dict(zip((0.0, 0.5, 0.6, 0.7, 0.8), cells))
    print(f"  {d:>5.2f} " + " ".join(f"{c:>9d}" for c in cells))

print()
print("=" * 78)
print("STEP 3  Inflate for attrition: n_enrol = n_analysed / (1 - a)")
print("=" * 78)
print(f"  {'d':>5} {'n_analysed':>11} " + " ".join(f"{('a=%d%%' % int(a*100)):>9}" for a in (0.20, 0.40, 0.60, 0.75)))
for d in (0.10, 0.15, 0.20, 0.30, 0.40, 0.50, 0.80):
    base = ancova[d][0.7]           # ANCOVA with r=.70 as the working assumption
    cells = [math.ceil(base / (1 - a)) for a in (0.20, 0.40, 0.60, 0.75)]
    print(f"  {d:>5.2f} {base:>11d} " + " ".join(f"{c:>9d}" for c in cells))

print()
print("  (n_analysed column = ANCOVA-adjusted, r=.70)")
print()
print("=" * 78)
print("STEP 4  Recruitment funnel: invitations needed at Duolingo-observed yield")
print("        Jiang et al. 2021 FLA, Spanish arm: 2175 emails -> 135 participants")
print("=" * 78)
yield_rate = 135 / 2175
print(f"  observed yield = 135/2175 = {yield_rate:.4f}  ({yield_rate*100:.2f}%)")
for d in (0.10, 0.15, 0.20, 0.30, 0.50):
    base = ancova[d][0.7]
    for a in (0.40, 0.60):
        enrol_per_arm = math.ceil(base / (1 - a))
        total_enrol = 2 * enrol_per_arm
        invites = math.ceil(total_enrol / yield_rate)
        print(f"  d={d:.2f}, attrition={int(a*100)}%: enrol {total_enrol:,} total "
              f"-> {invites:,} invitations")

print()
print("=" * 78)
print("STEP 5  Cluster / design effect:  DE = 1 + (m-1)*ICC")
print("=" * 78)
for icc in (0.01, 0.05, 0.10, 0.20):
    for m in (10, 25):
        print(f"  ICC={icc:.2f}, m={m:>2} per cluster: DE = {1+(m-1)*icc:.2f}"
              f"   -> n inflates {1+(m-1)*icc:.2f}x")

print()
print("=" * 78)
print("STEP 6  Minimum detectable effect for fixed budgets (analysed n per arm)")
print("=" * 78)

def mde(n, alpha=0.05, target=0.80):
    lo, hi = 0.001, 5.0
    for _ in range(80):
        mid = (lo + hi) / 2.0
        if power_exact(n, mid, alpha) < target:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2.0

for n in (25, 50, 75, 100, 150, 200, 400):
    m_raw = mde(n)
    print(f"  n={n:>4}/arm  MDE(unadjusted) = {m_raw:.3f} SD"
          f"   MDE(ANCOVA r=.70) = {m_raw*math.sqrt(1-0.49):.3f} SD")

print()
print("=" * 78)
print("STEP 6b  REALITY CHECK against the Duolingo Video Call RCT (DRR-25-06, 2025)")
print("=" * 78)
# Reported: Control n=304 post mean 24.32 (SD 10.60); VideoCall n=263 post 25.26 (SD 10.94)
c_n, c_m, c_sd = 304, 24.32, 10.60
v_n, v_m, v_sd = 263, 25.26, 10.94
sd_pool = math.sqrt(((c_n - 1) * c_sd**2 + (v_n - 1) * v_sd**2) / (c_n + v_n - 2))
d_obs = (v_m - c_m) / sd_pool
print(f"  pooled SD = {sd_pool:.3f}")
print(f"  raw posttest d = ({v_m} - {c_m}) / {sd_pool:.3f} = {d_obs:.4f}")
n_unadj = 15.6978 / d_obs**2
print(f"  n/arm for d={d_obs:.3f} with NO covariate = 15.6978/{d_obs:.4f}^2 = {n_unadj:,.0f}")
for r in (0.80, 0.85, 0.90, 0.92):
    print(f"    with pretest r={r:.2f}: n/arm = {n_unadj:,.0f} x (1-{r:.2f}^2) = "
          f"{n_unadj*(1-r*r):,.0f}   [they analysed ~284/arm]")
print(f"  recruitment yield: 658 randomised / 57,254 emails = {658/57254*100:.2f}%")
print(f"                     567 analysed  / 57,254 emails = {567/57254*100:.2f}%")
print(f"  post-randomisation loss: 1 - 567/658 = {(1-567/658)*100:.1f}%")
print(f"  their planning assumption was 42% attrition (from a prior in-house study)")

print()
print("=" * 78)
print("STEP 7  One-week lab study on paid panel: cost at Prolific floor/recommended")
print("=" * 78)
for n_per_arm in (50, 100, 150):
    for rate in (8.0, 12.0):
        # 2 arms; session 1 = 1.5h (learn), session 2 = 0.5h (delayed test)
        hours = 2.0
        pay = 2 * n_per_arm * hours * rate
        fee = pay * 0.33          # Prolific platform fee is a percentage; 33% used illustratively
        print(f"  {2*n_per_arm:>3} participants @ ${rate:.0f}/h x {hours:.1f}h = "
              f"${pay:,.0f} participants + ~${fee:,.0f} fees = ${pay+fee:,.0f}")
