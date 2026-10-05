import pandas as pd
import numpy as np
from sqlalchemy import create_engine
from sklearn.preprocessing import OneHotEncoder
import joblib

# Paths (adjust if workspace moved)
DB_PATH = r"c:/Users/sirip/OneDrive/Desktop/Forexa/data/forexa.db"
ENCODER_PATH = r"c:/Users/sirip/OneDrive/Desktop/Forexa/models/encoder.joblib"

def get_engine():
    """Create a SQLAlchemy engine for the SQLite DB."""
    return create_engine(f"sqlite:///{DB_PATH}")

def load_dataframe():
    """Load the full forecasts table into a pandas DataFrame."""
    engine = get_engine()
    with engine.connect() as conn:
        df = pd.read_sql("SELECT * FROM forecasts", conn)
    return df

def preprocess(df: pd.DataFrame, fit_encoder: bool = False):
    """Return feature matrix X and label vector y.
    - Categorical columns are one‑hot encoded using a shared encoder.
    - If ``fit_encoder`` is True, a new encoder is trained and saved to ``ENCODER_PATH``.
    - Missing ``monsoon_phase`` values are filled with "none".
    """
    df = df.copy()
    df["monsoon_phase"] = df["monsoon_phase"].fillna("none")
    y = df["bust_label"].values
    # Drop unused columns
    X_df = df.drop(columns=["id", "forecast_date", "bust_label", "created_at", "tier1_bust", "tier2_bust"])
    categorical = ["region", "season", "monsoon_phase", "atmospheric_regime"]
    numeric = [c for c in X_df.columns if c not in categorical]
    if fit_encoder:
        encoder = OneHotEncoder(handle_unknown="ignore", sparse_output=False)
        X_cat = encoder.fit_transform(X_df[categorical])
        joblib.dump(encoder, ENCODER_PATH)
    else:
        encoder = joblib.load(ENCODER_PATH)
        X_cat = encoder.transform(X_df[categorical])
    X_num = X_df[numeric].values
    X = np.hstack([X_num, X_cat])
    return X, y, encoder

def chronological_split(df: pd.DataFrame, train_frac: float = 0.7):
    """Chronologically split ``df`` into train / test based on ``forecast_date``.
    Returns tuple (train_df, test_df).
    """
    df_sorted = df.sort_values("forecast_date").reset_index(drop=True)
    split_idx = int(len(df_sorted) * train_frac)
    train_df = df_sorted.iloc[:split_idx]
    test_df = df_sorted.iloc[split_idx:]
    return train_df, test_df
