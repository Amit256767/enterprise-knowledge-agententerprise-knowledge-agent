from fastapi.testclient import TestClient

from app.main import app


def test_liveness_is_available_without_database() -> None:
    response = TestClient(app).get("/health/live")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
    assert response.headers.get("x-request-id")

