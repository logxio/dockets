# Legal Intelligence API

FastAPI backend for law firm ranking and litigation outcome prediction using the AHPI algorithm.

## Quick Start

### Installation

```bash
# Install dependencies
pip install -e .

# Or with development dependencies
pip install -e ".[dev]"

# Also install the AHPI package
pip install -e ../packages/ahpi
```

### Running the Server

```bash
# Development mode (with auto-reload)
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Or using the entry point
legal-api

# Production mode
uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4
```

### Docker

```bash
# Build
docker build -t legal-api .

# Run
docker run -p 8000:8000 legal-api
```

## API Endpoints

### Fitting

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/fit` | Fit model on JSON interaction data |
| POST | `/api/fit/csv` | Fit model from uploaded CSV file |
| GET | `/api/fit/{fit_id}/rankings` | Get rankings from a fit |
| GET | `/api/fit/{fit_id}/params` | Get case type parameters |

### Prediction

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/predict` | Predict case outcome |
| POST | `/api/predict/counterfactual` | What-if analysis |
| GET | `/api/predict/compare` | Compare two firms |

### Health

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check |

## Example Usage

### Fit a Model

```bash
curl -X POST "http://localhost:8000/api/fit" \
  -H "Content-Type: application/json" \
  -d '{
    "interactions": [
      {"plaintiff_firm": "FirmA", "defendant_firm": "FirmB", "outcome": 0, "case_type": "civil"},
      {"plaintiff_firm": "FirmB", "defendant_firm": "FirmC", "outcome": 1, "case_type": "civil"}
    ],
    "mode": "demo",
    "top_n": 50
  }'
```

### Predict Outcome

```bash
curl -X POST "http://localhost:8000/api/predict" \
  -H "Content-Type: application/json" \
  -d '{
    "fit_id": "fit_abc123",
    "plaintiff_firm": "FirmA",
    "defendant_firm": "FirmB",
    "case_type": "civil"
  }'
```

### Upload CSV

```bash
curl -X POST "http://localhost:8000/api/fit/csv" \
  -F "file=@data/interactions.csv" \
  -F "mode=demo"
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `HOST` | `0.0.0.0` | Server host |
| `PORT` | `8000` | Server port |
| `RELOAD` | `true` | Enable auto-reload |
| `CORS_ORIGINS` | `*` | Allowed CORS origins |

## API Documentation

- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc
- OpenAPI JSON: http://localhost:8000/openapi.json

## Testing

```bash
# Run tests
pytest

# With coverage
pytest --cov=app

# Verbose output
pytest -v
```

## License

MIT License
