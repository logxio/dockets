const DEFAULT_API_BASE_URL = "/api";

function normalizeBaseUrl(baseUrl) {
  const s = String(baseUrl ?? "").trim();
  if (!s) return "";
  return s.replace(/\/+$/, "");
}

export function getApiBaseUrl() {
  const fromEnv = normalizeBaseUrl(import.meta?.env?.VITE_API_BASE_URL);
  return fromEnv || DEFAULT_API_BASE_URL;
}

function joinUrl(baseUrl, path) {
  const base = normalizeBaseUrl(baseUrl);
  const p = String(path ?? "").trim().replace(/^\/+/, "");
  if (!base) return `/${p}`;
  return `${base}/${p}`;
}

async function readResponseBody(res) {
  const ct = String(res.headers.get("content-type") ?? "");
  if (ct.includes("application/json")) {
    return await res.json();
  }
  return await res.text();
}

async function apiFetchWithBase(baseUrl, path, init = {}) {
  const url = joinUrl(baseUrl, path);
  const res = await fetch(url, init);
  const data = await readResponseBody(res);
  if (!res.ok) {
    const msg =
      (data && typeof data === "object" && "detail" in data && String(data.detail)) ||
      (typeof data === "string" ? data : "") ||
      `HTTP ${res.status}`;
    const hint =
      res.status >= 500 && msg === `HTTP ${res.status}`
        ? " (API unavailable or crashed — check that the backend is running and `/api/health` returns OK)"
        : "";
    const err = new Error(`${msg}${hint}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

function shouldDevFallback(err, baseUrl) {
  const isDev = !!import.meta?.env?.DEV;
  if (!isDev) return false;
  const b = String(baseUrl ?? "");
  if (!(b === "/api" || b.endsWith("/api"))) return false;
  const status = err?.status;
  return typeof status !== "number" || status >= 500;
}

export async function apiFetch(path, init = {}) {
  const baseUrl = getApiBaseUrl();
  try {
    return await apiFetchWithBase(baseUrl, path, init);
  } catch (err) {
    if (!shouldDevFallback(err, baseUrl)) throw err;

    const fallbacks = ["http://127.0.0.1:8000/api", "http://127.0.0.1:8001/api"];
    let lastErr = err;
    for (const fb of fallbacks) {
      try {
        return await apiFetchWithBase(fb, path, init);
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr;
  }
}

export function health({ signal } = {}) {
  return apiFetch("health", { method: "GET", signal });
}

// ============================================================
// Matter API (Phase 1)
// ============================================================

/**
 * Create a new Matter
 * POST /api/matters
 */
export function createMatter(data, { signal } = {}) {
  return apiFetch("matters", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
    signal,
  });
}

/**
 * List Matters with pagination
 * GET /api/matters?limit=50&cursor=...
 */
export function listMatters({ limit = 50, cursor, signal } = {}) {
  const params = new URLSearchParams();
  if (limit) params.set("limit", String(limit));
  if (cursor) params.set("cursor", cursor);
  const qs = params.toString();
  return apiFetch(`matters${qs ? `?${qs}` : ""}`, { method: "GET", signal });
}

/**
 * Get a single Matter by ID
 * GET /api/matters/{matterId}
 */
export function getMatter(matterId, { signal } = {}) {
  return apiFetch(`matters/${encodeURIComponent(matterId)}`, { method: "GET", signal });
}

/**
 * Update a Matter (partial)
 * PATCH /api/matters/{matterId}
 */
export function updateMatter(matterId, data, { signal } = {}) {
  return apiFetch(`matters/${encodeURIComponent(matterId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
    signal,
  });
}

/**
 * Parse an uploaded document / pasted text into a suggested Matter Brief
 * POST /api/matters/parse-document (multipart form)
 */
export function parseMatterDocument({ file, text } = {}, { signal } = {}) {
  const form = new FormData();
  if (file) form.append("file", file);
  if (text) form.append("text", text);
  return apiFetch("matters/parse-document", { method: "POST", body: form, signal });
}

/**
 * Parse a document with upload progress (uses XHR so we can report progress)
 * POST /api/matters/parse-document (multipart form)
 */
export function parseMatterDocumentWithProgress({ file, text } = {}, { signal, onProgress } = {}) {
  const url = joinUrl(getApiBaseUrl(), "matters/parse-document");
  const form = new FormData();
  if (file) form.append("file", file);
  if (text) form.append("text", text);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url, true);
    xhr.responseType = "json";

    const cleanupSignal = () => {
      if (!signal) return;
      try {
        signal.removeEventListener("abort", onAbort);
      } catch {
        // ignore
      }
    };

    const onAbort = () => {
      try {
        xhr.abort();
      } catch {
        // ignore
      } finally {
        cleanupSignal();
      }
    };

    if (signal) {
      if (signal.aborted) return onAbort();
      try {
        signal.addEventListener("abort", onAbort, { once: true });
      } catch {
        // ignore
      }
    }

    xhr.upload.onprogress = (evt) => {
      if (!onProgress) return;
      if (!evt.lengthComputable) return onProgress({ loaded: evt.loaded, total: undefined, percent: undefined });
      const percent = evt.total ? Math.round((evt.loaded / evt.total) * 100) : undefined;
      onProgress({ loaded: evt.loaded, total: evt.total, percent });
    };

    xhr.onerror = () => {
      cleanupSignal();
      reject(new Error("Network error"));
    };

    xhr.onabort = () => {
      cleanupSignal();
      reject(new Error("Aborted"));
    };

    xhr.onload = () => {
      cleanupSignal();
      const ok = xhr.status >= 200 && xhr.status < 300;
      const data = xhr.response ?? null;
      if (ok) return resolve(data);

      const detail =
        data && typeof data === "object" && "detail" in data && typeof data.detail === "string" ? data.detail : "";
      reject(new Error(detail || `HTTP ${xhr.status}`));
    };

    xhr.send(form);
  });
}

/**
 * Start a black-box matter intake pipeline (PDF/text -> Matter + candidates + pack)
 * POST /api/matters/intake (multipart form)
 *
 * Returns `{ jobId, statusUrl }`, then poll `/api/jobs/{jobId}`.
 */
export function startMatterIntakeWithProgress({ file, text } = {}, { signal, onProgress } = {}) {
  const url = joinUrl(getApiBaseUrl(), "matters/intake");
  const form = new FormData();
  if (file) form.append("file", file);
  if (text) form.append("text", text);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url, true);
    xhr.responseType = "json";

    const cleanupSignal = () => {
      if (!signal) return;
      try {
        signal.removeEventListener("abort", onAbort);
      } catch {
        // ignore
      }
    };

    const onAbort = () => {
      try {
        xhr.abort();
      } catch {
        // ignore
      } finally {
        cleanupSignal();
      }
    };

    if (signal) {
      if (signal.aborted) return onAbort();
      try {
        signal.addEventListener("abort", onAbort, { once: true });
      } catch {
        // ignore
      }
    }

    xhr.upload.onprogress = (evt) => {
      if (!onProgress) return;
      if (!evt.lengthComputable) return onProgress({ loaded: evt.loaded, total: undefined, percent: undefined });
      const percent = evt.total ? Math.round((evt.loaded / evt.total) * 100) : undefined;
      onProgress({ loaded: evt.loaded, total: evt.total, percent });
    };

    xhr.onerror = () => {
      cleanupSignal();
      reject(new Error("Network error"));
    };

    xhr.onabort = () => {
      cleanupSignal();
      reject(new Error("Aborted"));
    };

    xhr.onload = () => {
      cleanupSignal();
      const ok = xhr.status >= 200 && xhr.status < 300;
      const data = xhr.response ?? null;
      if (ok) return resolve(data);

      const detail =
        data && typeof data === "object" && "detail" in data && typeof data.detail === "string" ? data.detail : "";
      reject(new Error(detail || `HTTP ${xhr.status}`));
    };

    xhr.send(form);
  });
}

/**
 * Delete a Matter
 * DELETE /api/matters/{matterId}
 */
export function deleteMatter(matterId, { signal } = {}) {
  return apiFetch(`matters/${encodeURIComponent(matterId)}`, { method: "DELETE", signal });
}

// ============================================================
// Candidates API (Matter-scoped)
// ============================================================

/**
 * Get recommended candidates for a Matter
 * POST /api/matters/{matterId}/candidates:recommend
 */
export function recommendCandidates(matterId, { limit = 20, signal } = {}) {
  return apiFetch(`matters/${encodeURIComponent(matterId)}/candidates:recommend`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ limit }),
    signal,
  });
}

/**
 * Set candidates for a Matter (client overrides)
 * PUT /api/matters/{matterId}/candidates
 */
export function setCandidates(matterId, items, { signal } = {}) {
  return apiFetch(`matters/${encodeURIComponent(matterId)}/candidates`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items }),
    signal,
  });
}

/**
 * Get candidates for a Matter
 * GET /api/matters/{matterId}/candidates
 */
export function getCandidates(matterId, { signal } = {}) {
  return apiFetch(`matters/${encodeURIComponent(matterId)}/candidates`, { method: "GET", signal });
}

// ============================================================
// Evidence API
// ============================================================

/**
 * List evidence items for a Matter
 * GET /api/matters/{matterId}/evidence?limit=50
 */
export function listEvidence(matterId, { limit = 50, caseId, signal } = {}) {
  const params = new URLSearchParams();
  if (limit) params.set("limit", String(limit));
  if (caseId != null) params.set("caseId", String(caseId));
  const qs = params.toString();
  return apiFetch(`matters/${encodeURIComponent(matterId)}/evidence${qs ? `?${qs}` : ""}`, {
    method: "GET",
    signal,
  });
}

// ============================================================
// Decision Pack API
// ============================================================

/**
 * Generate a Decision Pack (async)
 * POST /api/matters/{matterId}/packs
 * Returns { jobId, statusUrl }
 */
export function generatePack(matterId, { format = "html", signal } = {}) {
  return apiFetch(`matters/${encodeURIComponent(matterId)}/packs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ format }),
    signal,
  });
}

/**
 * Get a specific Decision Pack
 * GET /api/matters/{matterId}/packs/{packId}
 */
export function getPack(matterId, packId, { signal } = {}) {
  return apiFetch(`matters/${encodeURIComponent(matterId)}/packs/${encodeURIComponent(packId)}`, {
    method: "GET",
    signal,
  });
}

/**
 * List Decision Packs for a Matter
 * GET /api/matters/{matterId}/packs?limit=20
 */
export function listPacks(matterId, { limit = 20, signal } = {}) {
  const params = new URLSearchParams();
  if (limit) params.set("limit", String(limit));
  const qs = params.toString();
  return apiFetch(`matters/${encodeURIComponent(matterId)}/packs${qs ? `?${qs}` : ""}`, {
    method: "GET",
    signal,
  });
}

/**
 * Get the export HTML URL for a Pack
 */
export function getPackExportHtmlUrl(matterId, packId) {
  return `${getApiBaseUrl()}/matters/${encodeURIComponent(matterId)}/packs/${encodeURIComponent(packId)}/export.html`;
}

/**
 * Get the export PDF URL for a Pack (Phase 2)
 */
export function getPackExportPdfUrl(matterId, packId) {
  return `${getApiBaseUrl()}/matters/${encodeURIComponent(matterId)}/packs/${encodeURIComponent(packId)}/export.pdf`;
}

// ============================================================
// Jobs API (async task polling)
// ============================================================

/**
 * Get job status
 * GET /api/jobs/{jobId}
 */
export function getJob(jobId, { signal } = {}) {
  return apiFetch(`jobs/${encodeURIComponent(jobId)}`, { method: "GET", signal });
}

/**
 * Poll a job until completion
 * Returns the final job result or throws on failure
 */
export async function pollJob(jobId, { interval = 1000, timeout = 60000, signal, onProgress } = {}) {
  const startTime = Date.now();
  while (true) {
    if (signal?.aborted) {
      throw new Error("Aborted");
    }
    const job = await getJob(jobId, { signal });
    if (onProgress && typeof job.progress === "number") {
      onProgress(job.progress);
    }
    if (job.status === "succeeded") {
      return job;
    }
    if (job.status === "failed") {
      const msg =
        (job.error && typeof job.error === "object" && typeof job.error.message === "string" && job.error.message) ||
        (typeof job.error === "string" && job.error) ||
        "Job failed";
      const err = new Error(msg);
      err.job = job;
      throw err;
    }
    if (Date.now() - startTime > timeout) {
      throw new Error("Job polling timeout");
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
}

// ============================================================
// Audit API
// ============================================================

/**
 * List audit events for a Matter
 * GET /api/matters/{matterId}/audit?limit=100
 */
export function listAudit(matterId, { limit = 100, signal } = {}) {
  const params = new URLSearchParams();
  if (limit) params.set("limit", String(limit));
  const qs = params.toString();
  return apiFetch(`matters/${encodeURIComponent(matterId)}/audit${qs ? `?${qs}` : ""}`, {
    method: "GET",
    signal,
  });
}

// ============================================================
// Legacy API (existing)
// ============================================================

export function fitCsv(file, { signal, onProgress } = {}) {
  const url = joinUrl(getApiBaseUrl(), "fit");
  const form = new FormData();
  form.append("file", file);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url, true);
    xhr.responseType = "json";

    const cleanupSignal = () => {
      if (!signal) return;
      try {
        signal.removeEventListener("abort", onAbort);
      } catch {
        // ignore
      }
    };

    const onAbort = () => {
      try {
        xhr.abort();
      } catch {
        // ignore
      } finally {
        cleanupSignal();
      }
    };

    if (signal) {
      if (signal.aborted) return onAbort();
      try {
        signal.addEventListener("abort", onAbort, { once: true });
      } catch {
        // ignore
      }
    }

    xhr.upload.onprogress = (evt) => {
      if (!onProgress) return;
      if (!evt.lengthComputable) return onProgress({ loaded: evt.loaded, total: undefined, percent: undefined });
      const percent = evt.total ? Math.round((evt.loaded / evt.total) * 100) : undefined;
      onProgress({ loaded: evt.loaded, total: evt.total, percent });
    };

    xhr.onerror = () => {
      cleanupSignal();
      reject(new Error("Network error"));
    };

    xhr.onabort = () => {
      cleanupSignal();
      reject(new Error("Aborted"));
    };

    xhr.onload = () => {
      cleanupSignal();
      const ok = xhr.status >= 200 && xhr.status < 300;
      const data = xhr.response ?? null;
      if (ok) return resolve(data);

      const detail =
        data && typeof data === "object" && "detail" in data && typeof data.detail === "string" ? data.detail : "";
      reject(new Error(detail || `HTTP ${xhr.status}`));
    };

    xhr.send(form);
  });
}
