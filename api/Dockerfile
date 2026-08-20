# Build context is the repository root: the API imports the two local
# workspace packages, so they have to be installed from source alongside it.
FROM python:3.11-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

COPY packages/ahpi /app/packages/ahpi
COPY packages/pipeline /app/packages/pipeline
COPY api /app/api

RUN pip install --no-cache-dir --upgrade pip \
 && pip install --no-cache-dir ./packages/ahpi ./packages/pipeline ./api

WORKDIR /app/api

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
