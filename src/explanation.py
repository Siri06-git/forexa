import pandas as pd

def generate_explanation(row: pd.Series) -> list:
    """Generate a list of explanation strings for a single forecast case.
    The rules follow the specification (Section 12). Only statements whose
    conditions are true for the given row are included.
    """
    explanations = []
    # 1. Ensemble spread high (>= 90th percentile for region/season)
    if row.get('ensemble_spread_percentile', 0) >= 90:
        explanations.append(
            "Ensemble spread exceeds the 90th percentile for this region/season."
        )
    # 2. Regime similarity high (>= 75%)
    if row.get('regime_similarity', 0) >= 75:
        explanations.append(
            "Current atmospheric regime resembles historical low-skill cases."
        )
    # 3. Model disagreement high (>= 80%) – threshold chosen heuristically
    if row.get('model_disagreement', 0) >= 80:
        explanations.append(
            "Forecast-model disagreement is elevated."
        )
    # 4. Lead time >= 5 days
    if row.get('lead_time', 0) >= 5:
        explanations.append(
            "Historical forecast error increases at longer lead times."
        )
    # 5. Monsoon phase transitional (peak or retreat)
    if row.get('monsoon_phase') in ["peak", "retreat"]:
        explanations.append(
            "Current monsoon phase is associated with elevated forecast uncertainty."
        )
    # 6. Tier 1 bust triggered
    if row.get('tier1_bust'):
        explanations.append(
            "Z500 skill indicator is below the prototype bust threshold."
        )
    # 7. Tier 2 bust triggered
    if row.get('tier2_bust'):
        explanations.append(
            "Forecast error exceeds the historical 95th percentile."
        )
    return explanations
