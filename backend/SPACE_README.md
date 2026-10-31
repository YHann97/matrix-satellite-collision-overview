---
title: Final-event tier forecast
sdk: docker
app_port: 7860
---

CPU FastAPI service for the frozen final-event tier classifier. This Space source contains no model weights or data. Configure private-model access as server-side Space secrets/variables: HF_TOKEN (secret), HF_MODEL_ID, and HF_MODEL_REVISION (exact commit SHA). Optional FORECAST_API_KEY is also a server secret.

Use the Dockerfile and backend source; do not copy model_bundle, local .env files or upload staging directories. No Space is created by the preparation/upload scripts.
