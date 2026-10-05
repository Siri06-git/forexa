import sys
import os
from pathlib import Path

# Ensure project root is on PYTHONPATH for package imports
PROJECT_ROOT = Path(__file__).parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

import joblib
import pandas as pd
import uvicorn
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from src.utils import get_engine, load_dataframe, preprocess, chronological_split
from src.explanation import generate_explanation

# --------------------------- Paths ---------------------------
BASE_DIR = Path(__file__).resolve().parent.parent
DB_PATH = BASE_DIR / "data" / "forexa.db"
MODEL_PATH = BASE_DIR / "models" / "forexa_lgbm.pkl"
CALIB_PATH = BASE_DIR / "models" / "calibration.pkl"

# --------------------------- Load artifacts ---------------------------
engine = get_engine()
df_full = load_dataframe()
train_df, test_df = chronological_split(df_full, train_frac=0.7)

# Preprocess once for training shapes; encoder is saved in utils
X_train, y_train, encoder = preprocess(train_df, fit_encoder=True)

model = joblib.load(MODEL_PATH)
calibrator = joblib.load(CALIB_PATH)

# --------------------------- FastAPI app ---------------------------
app = FastAPI(
    title="Forexa API",
    description="Backend for the FOREXA bust‑detection prototype (synthetic data).",
    version="0.1.0",
)

# CORS – allow all origins for local development (restrict later if needed)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve static artifacts (charts, demo CSVs) under /static
app.mount("/static", StaticFiles(directory=str(BASE_DIR / "artifacts")), name="static")

# --------------------------- Pydantic models ---------------------------
class AnalyzeRequest(BaseModel):
    region: str = Field(..., description="Region name (e.g., Odisha)")
    forecast_date: str = Field(..., description="ISO‑format date (YYYY‑MM‑DD)")
    lead_time: int = Field(..., ge=1, le=10, description="Lead time in days")

class AnalyzeResponse(BaseModel):
    case_id: int
    calibrated_bust_probability: float
    forecast_confidence: float
    risk_level: str
    tier1_bust: bool
    tier2_bust: bool
    explanations: list[str]

# --------------------------- Helper functions ---------------------------
def case_by_id(case_id: int) -> pd.Series:
    row = df_full.loc[df_full["id"] == case_id]
    if row.empty:
        raise HTTPException(status_code=404, detail="Case not found")
    return row.squeeze()

def case_by_params(region: str, date: str, lead: int) -> pd.Series:
    row = df_full[(df_full["region"] == region) & (df_full["forecast_date"] == date) & (df_full["lead_time"] == lead)]
    if row.empty:
        raise HTTPException(status_code=404, detail="No matching case")
    return row.squeeze()

def build_feature_vector(row: pd.Series):
    df_one = pd.DataFrame([row])
    X, _, _ = preprocess(df_one, fit_encoder=False)
    return X

def tier1(row: pd.Series) -> bool:
    return float(row["z500_acc"]) < 0.40

def tier2(row: pd.Series) -> bool:
    return float(row["forecast_error"]) > float(row["historical_error_p95"])

def risk_label(prob: float) -> str:
    if prob >= 0.75:
        return "high"
    if prob >= 0.40:
        return "moderate"
    return "low"

# --------------------------- Endpoints ---------------------------
@app.get("/api/regions", response_model=list[str])
def get_regions():
    return sorted(df_full["region"].unique().tolist())

@app.get("/api/cases", response_model=list[int])
def get_cases(region: str | None = Query(None), lead_time: int | None = Query(None)):
    query = df_full
    if region:
        query = query[query["region"] == region]
    if lead_time:
        query = query[query["lead_time"] == lead_time]
    return query["id"].tolist()

@app.get("/api/cases/{case_id}")
def get_case(case_id: int):
    row = case_by_id(case_id)
    return row.to_dict()

@app.get("/api/overview")
def overview(lead_time: int = Query(..., ge=1, le=10)):
    subset = df_full[df_full["lead_time"] == lead_time]
    X, _, _ = preprocess(subset, fit_encoder=False)
    raw = model.predict_proba(X)[:, 1]
    calibrated = calibrator.transform(raw)
    confidence = 1 - calibrated
    return {
        "lead_time": lead_time,
        "mean_confidence": float(confidence.mean()),
        "mean_bust_probability": float(calibrated.mean()),
    }

@app.post("/api/analyze", response_model=AnalyzeResponse)
def analyze(request: AnalyzeRequest):
    row = case_by_params(request.region, request.forecast_date, request.lead_time)
    X = build_feature_vector(row)
    raw_prob = model.predict_proba(X)[0, 1]
    calibrated_prob = float(calibrator.transform([raw_prob])[0])
    confidence = round(100.0 * (1.0 - calibrated_prob), 2)
    risk = risk_label(calibrated_prob)
    tier1_flag = tier1(row)
    tier2_flag = tier2(row)
    explanations = generate_explanation(row)
    return AnalyzeResponse(
        case_id=int(row["id"]),
        calibrated_bust_probability=round(calibrated_prob, 4),
        forecast_confidence=confidence,
        risk_level=risk,
        tier1_bust=tier1_flag,
        tier2_bust=tier2_flag,
        explanations=explanations,
    )

@app.get("/api/features/{case_id}")
def get_features(case_id: int):
    row = case_by_id(case_id)
    X = build_feature_vector(row)
    return {"features": X.squeeze().tolist()}

@app.get("/api/verification")
def get_verification():
    from sklearn.metrics import average_precision_score, roc_auc_score, brier_score_loss
    import numpy as np

    X_test, y_test, _ = preprocess(test_df, fit_encoder=False)
    raw = model.predict_proba(X_test)[:, 1]
    calibrated = calibrator.transform(raw)

    forexa_pr = float(average_precision_score(y_test, calibrated))
    forexa_roc = float(roc_auc_score(y_test, calibrated))
    forexa_brier = float(brier_score_loss(y_test, calibrated))

    # 1. Persistence baseline
    majority_class = float(y_train.mean() >= 0.5)
    persist_prob = np.full_like(y_test, fill_value=majority_class, dtype=float)
    persist_pr = float(average_precision_score(y_test, persist_prob))
    persist_roc = 0.5
    persist_brier = float(brier_score_loss(y_test, persist_prob))

    # 2. Ensemble spread baseline
    ensemble_spread = test_df["ensemble_spread_percentile"].values / 100.0
    ensemble_prob = np.clip(ensemble_spread, 0, 1)
    ens_pr = float(average_precision_score(y_test, ensemble_prob))
    ens_roc = float(roc_auc_score(y_test, ensemble_prob))
    ens_brier = float(brier_score_loss(y_test, ensemble_prob))

    # 3. Climatology baseline
    climatology = train_df.groupby(["region", "season"])["bust_label"].mean()
    climatology_prob = test_df.apply(lambda row: climatology.get((row["region"], row["season"]), y_train.mean()), axis=1).values
    clim_pr = float(average_precision_score(y_test, climatology_prob))
    clim_roc = float(roc_auc_score(y_test, climatology_prob))
    clim_brier = float(brier_score_loss(y_test, climatology_prob))

    # Real reliability diagram binning
    n_bins = 10
    bins = np.linspace(0.0, 1.0, n_bins + 1)
    binids = np.digitize(calibrated, bins) - 1
    reliability_bins = []
    for i in range(n_bins):
        mask = binids == i
        pred_center = float((bins[i] + bins[i+1]) / 2.0)
        if mask.any():
            obs_freq = float(y_test[mask].mean())
            cnt = int(mask.sum())
        else:
            obs_freq = pred_center
            cnt = 0
        reliability_bins.append({
            "predicted": round(pred_center, 2),
            "perfect": round(pred_center, 2),
            "observed": round(obs_freq, 4),
            "count": cnt,
        })

    return {
        "pr_auc": forexa_pr,
        "roc_auc": forexa_roc,
        "brier_score": forexa_brier,
        "calibration": "Isotonic Regression",
        "baselines": [
            {"method": "Forexa (calibrated)", "pr_auc": round(forexa_pr, 3), "roc_auc": round(forexa_roc, 3), "brier": round(forexa_brier, 3)},
            {"method": "Persistence", "pr_auc": round(persist_pr, 3), "roc_auc": round(persist_roc, 3), "brier": round(persist_brier, 3)},
            {"method": "Ensemble Spread", "pr_auc": round(ens_pr, 3), "roc_auc": round(ens_roc, 3), "brier": round(ens_brier, 3)},
            {"method": "Climatology", "pr_auc": round(clim_pr, 3), "roc_auc": round(clim_roc, 3), "brier": round(clim_brier, 3)},
        ],
        "reliability_curve": reliability_bins
    }

@app.get("/api/demo/high-risk")
def demo_high_risk():
    path = BASE_DIR / "artifacts" / "high_risk_cases.csv"
    return pd.read_csv(path).to_dict(orient="records")

@app.get("/api/demo/low-risk")
def demo_low_risk():
    path = BASE_DIR / "artifacts" / "low_risk_cases.csv"
    return pd.read_csv(path).to_dict(orient="records")

@app.get("/api/geojson")
def geojson():
    import json, requests
    url = "https://raw.githubusercontent.com/geohacker/india/master/state/india_states.geojson"
    resp = requests.get(url)
    resp.raise_for_status()
    return json.loads(resp.text)

# --------------------------- Entry point ---------------------------
if __name__ == "__main__":
    uvicorn.run("src.api:app", host="0.0.0.0", port=8000, reload=True)
