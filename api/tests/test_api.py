"""
API tests for Legal Intelligence Platform.
"""

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services import ahpi_service


@pytest.fixture
def client():
    """Create test client."""
    return TestClient(app)


@pytest.fixture
def sample_interactions():
    """Sample interaction data for testing."""
    return [
        {"plaintiff_firm": "FirmA", "defendant_firm": "FirmB", "outcome": 0, "case_type": "civil"},
        {"plaintiff_firm": "FirmB", "defendant_firm": "FirmC", "outcome": 1, "case_type": "civil"},
        {"plaintiff_firm": "FirmA", "defendant_firm": "FirmC", "outcome": 0, "case_type": "civil"},
        {"plaintiff_firm": "FirmC", "defendant_firm": "FirmA", "outcome": 1, "case_type": "criminal"},
        {"plaintiff_firm": "FirmB", "defendant_firm": "FirmA", "outcome": 0, "case_type": "criminal"},
        {"plaintiff_firm": "FirmC", "defendant_firm": "FirmB", "outcome": 1, "case_type": "civil"},
        {"plaintiff_firm": "FirmA", "defendant_firm": "FirmB", "outcome": 0, "case_type": "criminal"},
        {"plaintiff_firm": "FirmB", "defendant_firm": "FirmC", "outcome": 0, "case_type": "criminal"},
        {"plaintiff_firm": "FirmC", "defendant_firm": "FirmA", "outcome": 0, "case_type": "civil"},
        {"plaintiff_firm": "FirmA", "defendant_firm": "FirmC", "outcome": 1, "case_type": "criminal"},
    ]


class TestHealth:
    """Health endpoint tests."""

    def test_health_check(self, client):
        """Test health endpoint returns ok status."""
        response = client.get("/api/health")
        assert response.status_code == 200

        data = response.json()
        assert data["status"] == "ok"
        assert "version" in data
        assert "ahpi_version" in data

    def test_root_redirect(self, client):
        """Test root redirects to docs."""
        response = client.get("/", follow_redirects=False)
        assert response.status_code == 307
        assert response.headers["location"] == "/docs"


class TestFit:
    """Fit endpoint tests."""

    def test_fit_success(self, client, sample_interactions):
        """Test successful model fitting."""
        response = client.post(
            "/api/fit",
            json={
                "interactions": sample_interactions,
                "mode": "quick",
                "top_n": 10,
            },
        )

        assert response.status_code == 200
        data = response.json()

        assert data["success"] is True
        assert "fit_id" in data
        assert len(data["rankings"]) > 0
        assert "statistics" in data

    def test_fit_too_few_interactions(self, client):
        """Test that fitting fails with too few interactions."""
        response = client.post(
            "/api/fit",
            json={
                "interactions": [
                    {"plaintiff_firm": "A", "defendant_firm": "B", "outcome": 0}
                ],
                "mode": "quick",
            },
        )

        assert response.status_code == 422  # Validation error

    def test_get_rankings(self, client, sample_interactions):
        """Test getting rankings from a fit."""
        # First, fit a model
        fit_response = client.post(
            "/api/fit",
            json={"interactions": sample_interactions, "mode": "quick"},
        )
        fit_id = fit_response.json()["fit_id"]

        # Then get rankings
        response = client.get(f"/api/fit/{fit_id}/rankings?top_n=3")

        assert response.status_code == 200
        data = response.json()

        assert data["fit_id"] == fit_id
        assert len(data["rankings"]) <= 3

    def test_get_rankings_csv(self, client, sample_interactions):
        """Test getting rankings as CSV."""
        # First, fit a model
        fit_response = client.post(
            "/api/fit",
            json={"interactions": sample_interactions, "mode": "quick"},
        )
        fit_id = fit_response.json()["fit_id"]

        # Get as CSV
        response = client.get(f"/api/fit/{fit_id}/rankings?format=csv")

        assert response.status_code == 200
        assert "text/csv" in response.headers["content-type"]

    def test_get_case_params(self, client, sample_interactions):
        """Test getting case type parameters."""
        fit_response = client.post(
            "/api/fit",
            json={"interactions": sample_interactions, "mode": "quick"},
        )
        fit_id = fit_response.json()["fit_id"]

        response = client.get(f"/api/fit/{fit_id}/params")

        assert response.status_code == 200
        data = response.json()

        assert "case_type_params" in data
        assert len(data["case_type_params"]) > 0


class TestPredict:
    """Prediction endpoint tests."""

    @pytest.fixture
    def fitted_model(self, client, sample_interactions):
        """Fit a model for prediction tests."""
        response = client.post(
            "/api/fit",
            json={"interactions": sample_interactions, "mode": "quick"},
        )
        return response.json()["fit_id"]

    def test_predict_success(self, client, fitted_model):
        """Test successful prediction."""
        response = client.post(
            "/api/predict",
            json={
                "fit_id": fitted_model,
                "plaintiff_firm": "FirmA",
                "defendant_firm": "FirmB",
                "case_type": "civil",
            },
        )

        assert response.status_code == 200
        data = response.json()

        assert data["success"] is True
        assert "defendant_win_probability" in data
        assert "plaintiff_win_probability" in data
        assert 0 <= data["defendant_win_probability"] <= 1
        assert 0 <= data["plaintiff_win_probability"] <= 1

    def test_predict_invalid_fit_id(self, client):
        """Test prediction with invalid fit ID."""
        response = client.post(
            "/api/predict",
            json={
                "fit_id": "invalid_fit_id",
                "plaintiff_firm": "FirmA",
                "defendant_firm": "FirmB",
            },
        )

        assert response.status_code == 404

    def test_counterfactual(self, client, fitted_model):
        """Test counterfactual analysis."""
        response = client.post(
            "/api/predict/counterfactual",
            json={
                "fit_id": fitted_model,
                "original_plaintiff": "FirmA",
                "original_defendant": "FirmB",
                "alternative_plaintiff": "FirmC",
                "case_type": "civil",
            },
        )

        assert response.status_code == 200
        data = response.json()

        assert data["success"] is True
        assert "original" in data
        assert "alternative" in data
        assert "probability_change" in data

    def test_compare_firms(self, client, fitted_model):
        """Test firm comparison."""
        response = client.get(f"/api/predict/compare?fit_id={fitted_model}&firm_a=FirmA&firm_b=FirmB")

        assert response.status_code == 200
        data = response.json()

        assert "scenarios" in data
        assert "a_plaintiff_b_defendant" in data["scenarios"]
        assert "b_plaintiff_a_defendant" in data["scenarios"]


class TestMatterWorkspace:
    def test_matter_crud_and_pack_flow(self, client):
        # Parse document (text fallback)
        res = client.post(
            "/api/matters/parse-document",
            data={"text": "UNITED STATES DISTRICT COURT\\nNORTHERN DISTRICT OF CALIFORNIA\\nACME, INC. v. BETA LLC\\nCOMPLAINT FOR BREACH OF CONTRACT\\n"},
        )
        assert res.status_code == 200
        parsed = res.json()
        assert "brief" in parsed
        assert parsed["brief"]["jurisdiction"] == "US"

        # Create
        res = client.post(
            "/api/matters",
            json={"name": "Acme v Beta", "brief": {"jurisdiction": "US", "court": "N.D. Cal.", "case_type": "contract", "role": "defendant"}},
        )
        assert res.status_code == 201
        matter = res.json()
        mid = matter["id"]

        # List
        res = client.get("/api/matters?limit=10")
        assert res.status_code == 200
        assert any(x["id"] == mid for x in res.json()["items"])

        # Patch
        res = client.patch(f"/api/matters/{mid}", json={"name": "Acme v Beta (updated)"})
        assert res.status_code == 200
        assert res.json()["name"] == "Acme v Beta (updated)"

        # Recommend candidates (not persisted)
        res = client.post(f"/api/matters/{mid}/candidates:recommend", json={"limit": 5})
        assert res.status_code == 200
        recs = res.json()["items"]
        assert isinstance(recs, list)

        # Candidates (initially empty)
        res = client.get(f"/api/matters/{mid}/candidates")
        assert res.status_code == 200
        assert isinstance(res.json().get("items"), list)

        # Persist candidates
        if recs:
            recs[0]["tier"] = "recommended"
        res = client.put(f"/api/matters/{mid}/candidates", json={"items": recs})
        assert res.status_code == 200

        # Candidates (after persist)
        res = client.get(f"/api/matters/{mid}/candidates")
        assert res.status_code == 200
        assert isinstance(res.json().get("items"), list)

        # Evidence
        res = client.get(f"/api/matters/{mid}/evidence?limit=5")
        assert res.status_code == 200
        assert "items" in res.json()

        # Create pack (async job)
        res = client.post(f"/api/matters/{mid}/packs", json={"format": "html"})
        assert res.status_code == 202

    def test_matter_intake_black_box_job(self, client):
        # Start black-box intake (text fallback)
        res = client.post(
            "/api/matters/intake",
            data={"text": "UNITED STATES DISTRICT COURT\nNORTHERN DISTRICT OF CALIFORNIA\nACME, INC. v. BETA LLC\nClient role: Defendant\n"},
        )
        assert res.status_code == 202
        accepted = res.json()
        assert "jobId" in accepted

        jid = accepted["jobId"]
        job = client.get(f"/api/jobs/{jid}").json()
        assert job["status"] == "succeeded"
        assert job["result"]["matterId"]
        assert job["result"]["packId"]

        mid = job["result"]["matterId"]
        # Matter exists and has at least one pack
        matter = client.get(f"/api/matters/{mid}").json()
        assert matter["id"] == mid
        packs = client.get(f"/api/matters/{mid}/packs?limit=5").json()
        assert isinstance(packs.get("items"), list)
        assert len(packs["items"]) >= 1
        job_id = res.json()["jobId"]

        # Poll job
        pack_id = None
        for _ in range(10):
            jr = client.get(f"/api/jobs/{job_id}")
            assert jr.status_code == 200
            j = jr.json()
            if j["status"] == "succeeded":
                pack_id = (j.get("result") or {}).get("packId")
                break
        assert pack_id

        # Get pack
        res = client.get(f"/api/matters/{mid}/packs/{pack_id}")
        assert res.status_code == 200
        pack = res.json()
        assert pack["id"] == pack_id
        assert pack["export"]["htmlUrl"].endswith("/export.html")

        # Export html
        res = client.get(pack["export"]["htmlUrl"])
        assert res.status_code == 200
        assert "text/html" in res.headers["content-type"]

        # Audit
        res = client.get(f"/api/matters/{mid}/audit?limit=50")
        assert res.status_code == 200
        assert len(res.json()["items"]) >= 1


class TestCSVUpload:
    """CSV upload tests."""

    def test_fit_csv_upload(self, client, tmp_path):
        """Test fitting from CSV upload."""
        # Create a temporary CSV file
        csv_content = """PlaintiffFirm,DefendantFirm,Outcome,CaseType
FirmA,FirmB,0,civil
FirmB,FirmC,1,civil
FirmA,FirmC,0,civil
FirmC,FirmA,1,criminal
FirmB,FirmA,0,criminal
FirmC,FirmB,1,civil
FirmA,FirmB,0,criminal
FirmB,FirmC,0,criminal
FirmC,FirmA,0,civil
FirmA,FirmC,1,criminal
"""
        csv_file = tmp_path / "test.csv"
        csv_file.write_text(csv_content)

        with open(csv_file, "rb") as f:
            response = client.post(
                "/api/fit/csv",
                files={"file": ("test.csv", f, "text/csv")},
                params={"mode": "quick"},
            )

        assert response.status_code == 200
        data = response.json()

        assert data["success"] is True
        assert "fit_id" in data
        assert len(data["rankings"]) > 0


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
