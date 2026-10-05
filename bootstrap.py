"""
bootstrap.py  –  One-shot setup for Forexa Phases 1–3 artifacts.
Creates:
  data/forexa.db          – synthetic forecast cases (SQLite)
  models/encoder.joblib   – OneHotEncoder fitted on training data
  models/forexa_lgbm.pkl  – trained LightGBM bust-detection model
  models/calibration.pkl  – isotonic regression calibrator
  artifacts/high_risk_cases.csv / low_risk_cases.csv
  artifacts/feature_importance.csv

All data is SYNTHETIC demonstration data.
Run once from the Forexa project root:  python bootstrap.py
"""

import sys, os
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent
sys.path.insert(0, str(PROJECT_ROOT))

import numpy as np
import pandas as pd
import joblib
from sqlalchemy import create_engine, text

# ── Paths ──────────────────────────────────────────────────────────────────────
DATA_DIR    = PROJECT_ROOT / "data"
MODEL_DIR   = PROJECT_ROOT / "models"
ARTIFACT_DIR = PROJECT_ROOT / "artifacts"

for d in (DATA_DIR, MODEL_DIR, ARTIFACT_DIR):
    d.mkdir(parents=True, exist_ok=True)

DB_PATH     = DATA_DIR / "forexa.db"
ENCODER_PATH = MODEL_DIR / "encoder.joblib"
MODEL_PATH  = MODEL_DIR / "forexa_lgbm.pkl"
CALIB_PATH  = MODEL_DIR / "calibration.pkl"

# ── 1. Synthetic data generation ───────────────────────────────────────────────
print("Generating synthetic data …")

rng = np.random.default_rng(42)

REGIONS = [
    "Odisha", "Maharashtra", "Rajasthan", "Kerala", "Uttar Pradesh",
    "Karnataka", "Tamil Nadu", "Gujarat", "West Bengal", "Madhya Pradesh",
    "Bihar", "Andhra Pradesh", "Telangana", "Jharkhand", "Chhattisgarh",
    "Himachal Pradesh", "Uttarakhand", "Haryana", "Punjab", "Assam",
]
SEASONS = ["pre-monsoon", "monsoon", "post-monsoon", "winter"]
MONSOON_PHASES = ["onset", "peak", "retreat", "none"]
ATM_REGIMES = ["ridge", "trough", "cyclonic", "anticyclonic"]

N = 2000  # total cases

def make_dataset(n, rng):
    region   = rng.choice(REGIONS, n)
    lead_time = rng.integers(1, 11, n)
    season   = rng.choice(SEASONS, n)
    monsoon  = rng.choice(MONSOON_PHASES, n)
    atm      = rng.choice(ATM_REGIMES, n)

    # Numeric features with weather-like correlations
    ensemble_spread_pct  = rng.uniform(0, 100, n)
    regime_similarity    = rng.uniform(0, 100, n)
    model_disagreement   = rng.uniform(0, 100, n)
    z500_acc             = rng.uniform(0.1, 1.0, n)
    forecast_error       = rng.uniform(0.5, 15.0, n)
    historical_error_p95 = rng.uniform(8.0, 14.0, n)
    mjo_phase            = rng.integers(1, 9, n).astype(float)
    sst_anomaly          = rng.uniform(-2.0, 2.0, n)
    blocking_index       = rng.uniform(0.0, 1.0, n)
    jet_stream_shift     = rng.uniform(-5.0, 5.0, n)

    # Bust label: logistic function of risk factors
    log_odds = (
        -2.5
        + 0.025 * ensemble_spread_pct
        + 0.020 * regime_similarity
        + 0.015 * model_disagreement
        + 0.12  * lead_time
        - 3.0   * z500_acc
        + 0.18  * forecast_error
        - 0.12  * historical_error_p95
        + 0.3   * (monsoon == "peak").astype(float)
        + 0.3   * (monsoon == "retreat").astype(float)
        + 0.5   * (atm == "cyclonic").astype(float)
        + rng.normal(0, 0.5, n)          # noise
    )
    prob_bust = 1 / (1 + np.exp(-log_odds))
    bust_label = (rng.uniform(size=n) < prob_bust).astype(int)

    tier1_bust = (z500_acc < 0.40).astype(int)
    tier2_bust = (forecast_error > historical_error_p95).astype(int)

    # Forecast dates spanning 2020–2024
    base_date = pd.Timestamp("2020-01-01")
    dates = [base_date + pd.Timedelta(days=int(d)) for d in rng.integers(0, 4*365, n)]
    dates_str = [d.strftime("%Y-%m-%d") for d in dates]

    df = pd.DataFrame({
        "id": range(1, n+1),
        "region": region,
        "forecast_date": dates_str,
        "lead_time": lead_time,
        "season": season,
        "monsoon_phase": monsoon,
        "atmospheric_regime": atm,
        "ensemble_spread_percentile": ensemble_spread_pct.round(2),
        "regime_similarity": regime_similarity.round(2),
        "model_disagreement": model_disagreement.round(2),
        "z500_acc": z500_acc.round(4),
        "forecast_error": forecast_error.round(4),
        "historical_error_p95": historical_error_p95.round(4),
        "mjo_phase": mjo_phase,
        "sst_anomaly": sst_anomaly.round(4),
        "blocking_index": blocking_index.round(4),
        "jet_stream_shift": jet_stream_shift.round(4),
        "bust_label": bust_label,
        "tier1_bust": tier1_bust,
        "tier2_bust": tier2_bust,
        "created_at": pd.Timestamp.now().isoformat(),
    })
    return df

df = make_dataset(N, rng)

# Write to SQLite
engine = create_engine(f"sqlite:///{DB_PATH}")
df.to_sql("forecasts", engine, if_exists="replace", index=False)
print(f"  Wrote {len(df)} rows to {DB_PATH}")

# ── 2. Train/test split ────────────────────────────────────────────────────────
df_sorted = df.sort_values("forecast_date").reset_index(drop=True)
split_idx = int(len(df_sorted) * 0.7)
train_df = df_sorted.iloc[:split_idx].copy()
test_df  = df_sorted.iloc[split_idx:].copy()

# ── 3. Preprocessing ───────────────────────────────────────────────────────────
from sklearn.preprocessing import OneHotEncoder
import numpy as np

CAT_COLS = ["region", "season", "monsoon_phase", "atmospheric_regime"]
DROP_COLS = ["id", "forecast_date", "bust_label", "created_at", "tier1_bust", "tier2_bust"]
NUM_COLS = [c for c in train_df.columns if c not in CAT_COLS + DROP_COLS]

def build_X(df, encoder, fit=False):
    df = df.copy()
    df["monsoon_phase"] = df["monsoon_phase"].fillna("none")
    X_num = df[NUM_COLS].values
    if fit:
        encoder.fit(df[CAT_COLS])
    X_cat = encoder.transform(df[CAT_COLS])
    return np.hstack([X_num, X_cat])

encoder = OneHotEncoder(handle_unknown="ignore", sparse_output=False)
X_train = build_X(train_df, encoder, fit=True)
y_train = train_df["bust_label"].values
X_test  = build_X(test_df, encoder, fit=False)
y_test  = test_df["bust_label"].values

joblib.dump(encoder, ENCODER_PATH)
print(f"  Encoder saved -> {ENCODER_PATH}")

# ── 4. Train LightGBM ──────────────────────────────────────────────────────────
print("Training LightGBM …")
import lightgbm as lgb

model = lgb.LGBMClassifier(
    n_estimators=300,
    learning_rate=0.05,
    num_leaves=31,
    class_weight="balanced",
    random_state=42,
    verbose=-1,
)
model.fit(X_train, y_train)
raw_prob_train = model.predict_proba(X_train)[:, 1]
raw_prob_test  = model.predict_proba(X_test)[:, 1]
joblib.dump(model, MODEL_PATH)
print(f"  Model saved -> {MODEL_PATH}")

# ── 5. Isotonic calibration ────────────────────────────────────────────────────
print("Fitting isotonic calibration …")
from sklearn.isotonic import IsotonicRegression

calibrator = IsotonicRegression(out_of_bounds="clip")
calibrator.fit(raw_prob_train, y_train)
cal_prob_test = calibrator.transform(raw_prob_test)
joblib.dump(calibrator, CALIB_PATH)
print(f"  Calibrator saved -> {CALIB_PATH}")

# ── 6. Metrics ─────────────────────────────────────────────────────────────────
from sklearn.metrics import average_precision_score, roc_auc_score, brier_score_loss

pr_auc  = average_precision_score(y_test, cal_prob_test)
roc_auc = roc_auc_score(y_test, cal_prob_test)
brier   = brier_score_loss(y_test, cal_prob_test)
print(f"  PR-AUC={pr_auc:.3f}  ROC-AUC={roc_auc:.3f}  Brier={brier:.3f}")

# ── 7. Feature importance CSV ──────────────────────────────────────────────────
cat_names = encoder.get_feature_names_out(CAT_COLS).tolist()
feat_names = NUM_COLS + cat_names
imp_df = pd.DataFrame({"feature": feat_names, "importance": model.feature_importances_})
imp_df = imp_df.sort_values("importance", ascending=False)
imp_df.to_csv(ARTIFACT_DIR / "feature_importance.csv", index=False)

# ── 8. Demo CSVs ───────────────────────────────────────────────────────────────
from src.explanation import generate_explanation

high_idx = np.argsort(-cal_prob_test)[:10]
low_idx  = np.argsort(cal_prob_test)[:10]

high_df = test_df.iloc[high_idx].copy()
low_df  = test_df.iloc[low_idx].copy()
high_df["calibrated_prob"] = cal_prob_test[high_idx]
low_df["calibrated_prob"]  = cal_prob_test[low_idx]
high_df["explanations"] = high_df.apply(generate_explanation, axis=1).astype(str)
low_df["explanations"]  = low_df.apply(generate_explanation, axis=1).astype(str)
high_df.to_csv(ARTIFACT_DIR / "high_risk_cases.csv", index=False)
low_df.to_csv(ARTIFACT_DIR / "low_risk_cases.csv", index=False)

print("Bootstrap complete. All artifacts ready.")
print(f"  DB:          {DB_PATH}")
print(f"  Model:       {MODEL_PATH}")
print(f"  Calibrator:  {CALIB_PATH}")
print(f"  Artifacts:   {ARTIFACT_DIR}")
