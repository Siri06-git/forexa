\# Forexa



\## AI-Based Forecast Bust Detection for Medium-Range Weather Forecasts



Forexa is a prototype diagnostic reliability layer designed to identify situations where medium-range weather forecasts may have elevated bust risk.



It provides:

\- Region-wise forecast confidence for Days 1–10

\- Forecast bust probability

\- Error-prone region and lead-time detection

\- Explainable meteorological risk factors

\- Model verification against baseline approaches



\## Prototype Status



This repository contains a working prototype demonstrated using a \*\*synthetic dataset\*\*.



The prototype is not an operational weather forecasting system and its reported ML metrics are not operational weather-forecast performance.



\## Architecture



\- Python

\- FastAPI

\- LightGBM

\- scikit-learn

\- React + Vite

\- Leaflet

\- Recharts

\- SQLite



\## Running Locally



\### Backend



```powershell

python -m uvicorn src.api:app --host 0.0.0.0 --port 8000

