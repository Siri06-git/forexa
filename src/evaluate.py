import sys, os
# Ensure project root is on PYTHONPATH for package imports
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

import os
import joblib
import numpy as np
import pandas as pd
from pathlib import Path
from sklearn.metrics import average_precision_score, roc_auc_score, brier_score_loss

from src.utils import load_dataframe, chronological_split, preprocess
from src.verification import compute_metrics, reliability_diagram, precision_recall_curve_data
from src.explanation import generate_explanation

# ---------- Paths ----------
BASE_DIR = Path(r"c:/Users/sirip/OneDrive/Desktop/Forexa")
MODEL_PATH = BASE_DIR / "models" / "forexa_lgbm.pkl"
CALIB_PATH = BASE_DIR / "models" / "calibration.pkl"
REPORT_PATH = BASE_DIR / "artifacts" / "evaluation_report.md"

# ---------- Load data ----------
df = load_dataframe()
train_df, test_df = chronological_split(df, train_frac=0.7)

# ---------- Preprocess ----------
X_train, y_train, encoder = preprocess(train_df, fit_encoder=True)
X_test, y_test, _ = preprocess(test_df, fit_encoder=False)

# ---------- Load model & calibrator ----------
model = joblib.load(MODEL_PATH)
calibrator = joblib.load(CALIB_PATH)

# ---------- Predictions ----------
# LightGBM raw probabilities
raw_prob = model.predict_proba(X_test)[:, 1]
# Calibrated probabilities
cal_prob = calibrator.transform(raw_prob.reshape(-1, 1)).ravel()

# ---------- Baselines ----------
# 1. Persistence (majority class from training)
majority_class = int(y_train.mean() >= 0.5)
persist_prob = np.full_like(y_test, fill_value=majority_class, dtype=float)

# 2. Ensemble spread baseline (normalize percentile)
ensemble_spread = test_df["ensemble_spread_percentile"].values / 100.0
ensemble_prob = np.clip(ensemble_spread, 0, 1)

# 3. Climatology baseline: bust prevalence per region‑season in training set
climatology = train_df.groupby(["region", "season"]).apply(lambda g: g["bust_label"].mean())
# Map to test rows
climatology_prob = test_df.apply(lambda row: climatology.get((row["region"], row["season"]), y_train.mean()), axis=1).values

# ---------- Compute metrics ----------
methods = {
    "Forexa (calibrated)": cal_prob,
    "Forexa (raw)": raw_prob,
    "Persistence": persist_prob,
    "Ensemble‑spread": ensemble_prob,
    "Climatology": climatology_prob,
}
metrics = {}
for name, probs in methods.items():
    metrics[name] = compute_metrics(y_test, probs)

# ---------- Reliability diagram & PR curve for calibrated Forexa ----------
rel_path = reliability_diagram(y_test, cal_prob, filename="reliability_diagram.png")
pr_curve_path, pr_curve_data_path = precision_recall_curve_data(y_test, cal_prob, filename="pr_curve.png")

# ---------- Feature importance (LightGBM) ----------
if hasattr(model, "feature_importances_"):
    importances = model.feature_importances_
    # Retrieve feature names from encoder + numeric columns
    numeric_cols = [c for c in test_df.columns if c not in ["id", "forecast_date", "bust_label", "created_at", "tier1_bust", "tier2_bust", "region", "season", "monsoon_phase", "atmospheric_regime"]]
    cat_feature_names = encoder.get_feature_names_out(["region", "season", "monsoon_phase", "atmospheric_regime"]).tolist()
    feature_names = numeric_cols + cat_feature_names
    importance_df = pd.DataFrame({"feature": feature_names, "importance": importances})
    importance_df = importance_df.sort_values("importance", ascending=False)
    importance_path = BASE_DIR / "artifacts" / "feature_importance.csv"
    importance_df.to_csv(importance_path, index=False)
else:
    importance_path = None

# ---------- Demo case selection ----------
# High‑risk: top 5 calibrated probabilities
high_idx = np.argsort(-cal_prob)[:5]
low_idx = np.argsort(cal_prob)[:5]
high_cases = test_df.iloc[high_idx].copy()
low_cases = test_df.iloc[low_idx].copy()
high_cases["calibrated_prob"] = cal_prob[high_idx]
low_cases["calibrated_prob"] = cal_prob[low_idx]
# Add explanations
high_cases["explanations"] = high_cases.apply(lambda row: generate_explanation(row), axis=1)
low_cases["explanations"] = low_cases.apply(lambda row: generate_explanation(row), axis=1)
# Save to CSV for inspection
high_path = BASE_DIR / "artifacts" / "high_risk_cases.csv"
low_path = BASE_DIR / "artifacts" / "low_risk_cases.csv"
high_cases.to_csv(high_path, index=False)
low_cases.to_csv(low_path, index=False)

# ---------- Evaluation report ----------
with open(REPORT_PATH, "w", encoding="utf-8") as f:
    f.write("# FOREXA Phase 2 Evaluation Report\n\n")
    f.write(f"**Total cases**: {len(df)}\n\n")
    f.write(f"**Training cases**: {len(train_df)}\n\n")
    f.write(f"**Test cases**: {len(test_df)}\n\n")
    bust_prevalence = y_test.mean()
    f.write(f"**Bust prevalence in test set**: {bust_prevalence:.3f}\n\n")
    f.write("## Metric Summary (higher is better for PR‑AUC & ROC‑AUC, lower is better for Brier)\n\n")
    f.write("| Method | PR‑AUC | ROC‑AUC | Brier |\n")
    f.write("|---|---|---|---|\n")
    for name, m in metrics.items():
        f.write(f"| {name} | {m['pr_auc']:.3f} | {m['roc_auc']:.3f} | {m['brier']:.3f} |\n")
    f.write("\n")
    f.write(f"**Calibration method**: Isotonic Regression (trained on training set)\n\n")
    # Determine if Forexa outperforms each baseline on PR‑AUC
    forexa_pr = metrics["Forexa (calibrated)"]["pr_auc"]
    f.write("## Model vs Baselines (PR‑AUC)\n\n")
    for baseline in ["Persistence", "Ensemble‑spread", "Climatology"]:
        better = forexa_pr > metrics[baseline]["pr_auc"]
        f.write(f"- Forexa {'outperforms' if better else 'does NOT outperform'} {baseline} (Forexa: {forexa_pr:.3f}, {baseline}: {metrics[baseline]['pr_auc']:.3f})\n")
    f.write("\n")
    f.write("## Visual Artifacts\n\n")
    f.write(f"- Reliability diagram: [reliability_diagram.png]({rel_path.as_uri()})\n")
    f.write(f"- Precision‑Recall curve: [pr_curve.png]({pr_curve_path.as_uri()})\n")
    if importance_path:
        f.write(f"- Feature importance (CSV): [feature_importance.csv]({importance_path.as_uri()})\n")
    f.write("\n")
    f.write("## High‑Risk Demo Cases (top 5)\n\n")
    f.write(f"- CSV: [high_risk_cases.csv]({high_path.as_uri()})\n\n")
    f.write("## Low‑Risk Demo Cases (bottom 5)\n\n")
    f.write(f"- CSV: [low_risk_cases.csv]({low_path.as_uri()})\n\n")
    f.write("## Known Limitations\n\n")
    f.write(
        "> [!WARNING]\n"
        "> This prototype uses synthetic data and simple baselines. Real‑world performance may differ.\n"
        "> The calibration is trained on the same synthetic distribution and may not generalise to operational forecasts.\n"
    )

print("Phase 2 evaluation complete. Report written to", REPORT_PATH)
