import pandas as pd
import numpy as np
import joblib
from pathlib import Path
from sklearn.metrics import average_precision_score, roc_auc_score, brier_score_loss, precision_recall_curve
import matplotlib.pyplot as plt
import seaborn as sns

# Paths
ARTIFACT_DIR = Path(r"c:/Users/sirip/OneDrive/Desktop/Forexa/artifacts")
ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)

def compute_metrics(y_true, y_prob):
    """Return dict with PR‑AUC, ROC‑AUC, Brier score."""
    pr_auc = average_precision_score(y_true, y_prob)
    roc_auc = roc_auc_score(y_true, y_prob)
    brier = brier_score_loss(y_true, y_prob)
    return {"pr_auc": pr_auc, "roc_auc": roc_auc, "brier": brier}

def reliability_diagram(y_true, y_prob, n_bins=10, title="Reliability Diagram", filename="reliability_diagram.png"):
    """Plot reliability diagram (expected vs observed frequency)."""
    bins = np.linspace(0.0, 1.0, n_bins + 1)
    binids = np.digitize(y_prob, bins) - 1
    bin_centers = (bins[:-1] + bins[1:]) / 2.0
    prob_true = []
    for i in range(n_bins):
        mask = binids == i
        if mask.any():
            prob_true.append(y_true[mask].mean())
        else:
            prob_true.append(np.nan)
    plt.figure(figsize=(6, 6))
    plt.plot([0, 1], [0, 1], "k--", label="Perfect calibration")
    plt.plot(bin_centers, prob_true, "s-")
    plt.xlabel("Predicted probability")
    plt.ylabel("Observed frequency")
    plt.title(title)
    plt.grid(True)
    plt.legend()
    out_path = ARTIFACT_DIR / filename
    plt.savefig(out_path, bbox_inches="tight")
    plt.close()
    return out_path

def precision_recall_curve_data(y_true, y_prob, title="Precision‑Recall Curve", filename="pr_curve.png"):
    """Plot PR curve and save. Returns path and raw curve data as DataFrame."""
    precision, recall, thresholds = precision_recall_curve(y_true, y_prob)
    # Plot
    plt.figure(figsize=(6, 4))
    plt.plot(recall, precision, label="PR curve")
    plt.xlabel("Recall")
    plt.ylabel("Precision")
    plt.title(title)
    plt.grid(True)
    plt.legend()
    out_path = ARTIFACT_DIR / filename
    plt.savefig(out_path, bbox_inches="tight")
    plt.close()
    # Create DataFrame for raw data
    df_curve = pd.DataFrame({"threshold": np.append(thresholds, 1.0), "precision": precision, "recall": recall})
    df_curve_path = ARTIFACT_DIR / "pr_curve_data.csv"
    df_curve.to_csv(df_curve_path, index=False)
    return out_path, df_curve_path
