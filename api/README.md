# API

FastAPI service over the AHPI estimator and the matter pipeline. Fit a ranking, predict a matchup, or run the document-to-decision-pack workflow.

Everything is in-process: fits and matters live in dictionaries on the running app, not a database. Restarting drops them.

## Running

The service imports `ahpi` and `legal-pipeline` from this repo, so install all three from the root:

```bash
pip install -e packages/ahpi -e packages/pipeline -e api
uvicorn app.main:app --app-dir api --port 8001
```

Interactive docs at `/docs`, ReDoc at `/redoc`, schema at `/openapi.json`.

Docker builds from the repository root, since the image needs the two local packages:

```bash
docker build -f api/Dockerfile -t legal-api .
docker run -p 8000:8000 legal-api
```

Tests:

```bash
pytest api/tests
```

## Endpoints

Everything is under `/api`.

### Ranking

| Method | Path | |
|--------|------|--|
| `POST` | `/fit` | Fit on JSON interactions |
| `POST` | `/fit/csv` | Fit on an uploaded CSV |
| `GET` | `/fit/{fit_id}/rankings` | Rankings from a fit |
| `GET` | `/fit/{fit_id}/params` | Per-case-type valence and privilege |

### Prediction

| Method | Path | |
|--------|------|--|
| `POST` | `/predict` | Outcome for a plaintiff/defendant pair |
| `POST` | `/predict/counterfactual` | Same pair, perturbed parameters |
| `GET` | `/predict/compare` | Two firms head to head |

### Matters

| Method | Path | |
|--------|------|--|
| `POST` | `/matters/parse-document` | Text or PDF to a structured brief |
| `POST` | `/matters/intake` | Parse and create in one call, returns a job (202) |
| `POST` `GET` | `/matters` | Create, list |
| `GET` `PATCH` `DELETE` | `/matters/{id}` | Read, update, delete |
| `POST` | `/matters/{id}/candidates:recommend` | Rank candidate firms |
| `GET` `PUT` | `/matters/{id}/candidates` | Read, overwrite the shortlist |
| `GET` | `/matters/{id}/evidence` | Comparable cases behind a candidate |
| `POST` `GET` | `/matters/{id}/packs` | Build a decision pack (202), list packs |
| `GET` | `/matters/{id}/packs/{pack_id}` | One pack |
| `GET` | `/matters/{id}/packs/{pack_id}/export.html` | Standalone HTML |
| `GET` | `/matters/{id}/audit` | Audit trail for the matter |

### Jobs and health

| Method | Path | |
|--------|------|--|
| `GET` | `/jobs/{job_id}` | Poll a 202-accepted job |
| `GET` | `/health` | Liveness, AHPI version, active fit count |

## Examples

```bash
curl -X POST http://localhost:8001/api/fit \
  -H "Content-Type: application/json" \
  -d '{
    "interactions": [
      {"plaintiff_firm": "FirmA", "defendant_firm": "FirmB", "outcome": 0, "case_type": "contract"},
      {"plaintiff_firm": "FirmB", "defendant_firm": "FirmC", "outcome": 1, "case_type": "contract"}
    ],
    "mode": "demo",
    "top_n": 50
  }'
```

```bash
curl -X POST http://localhost:8001/api/fit/csv \
  -F "file=@interactions.csv" -F "mode=demo"
```

```bash
curl -X POST http://localhost:8001/api/predict \
  -H "Content-Type: application/json" \
  -d '{"fit_id": "fit_abc123", "plaintiff_firm": "FirmA", "defendant_firm": "FirmB", "case_type": "contract"}'
```

## Environment

| Variable | Default | |
|----------|---------|--|
| `HOST` | `0.0.0.0` | Bind address, used by the `legal-api` entry point |
| `PORT` | `8000` | Port for the same |
| `RELOAD` | `true` | Auto-reload |
| `CORS_ORIGINS` | `*` | Comma-separated allowed origins |

`CORS_ORIGINS` defaults to `*` with credentials allowed. Set it before putting this anywhere public.
