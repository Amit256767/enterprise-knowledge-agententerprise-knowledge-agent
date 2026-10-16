import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.main import app


def test_localhost_origin_is_allowed_and_credentials_are_disabled() -> None:
    response = TestClient(app).options(
        "/chat",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type,authorization",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"
    assert "access-control-allow-credentials" not in response.headers
    assert "POST" in response.headers["access-control-allow-methods"]
    assert "GET" in response.headers["access-control-allow-methods"]
    assert "DELETE" in response.headers["access-control-allow-methods"]
    assert "OPTIONS" in response.headers["access-control-allow-methods"]
    assert "content-type" in response.headers["access-control-allow-headers"].lower()
    assert "authorization" in response.headers["access-control-allow-headers"].lower()


def test_production_netlify_origin_is_allowed() -> None:
    response = TestClient(app).options(
        "/chat",
        headers={
            "Origin": "https://enterprise-knowledge-agententerprise.netlify.app",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "authorization,content-type",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == (
        "https://enterprise-knowledge-agententerprise.netlify.app"
    )
    assert "authorization" in response.headers["access-control-allow-headers"].lower()


def test_loopback_origin_is_allowed_by_default() -> None:
    response = TestClient(app).options(
        "/chat",
        headers={
            "Origin": "http://127.0.0.1:5173",
            "Access-Control-Request-Method": "POST",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://127.0.0.1:5173"


def test_unlisted_origin_is_not_allowed() -> None:
    response = TestClient(app).get(
        "/health/live",
        headers={"Origin": "https://unlisted.example"},
    )

    assert response.status_code == 200
    assert "access-control-allow-origin" not in response.headers


def test_cors_allowlist_requires_exact_origins(monkeypatch) -> None:
    settings = Settings(cors_allowed_origins="https://docs.example.netlify.app")
    production_settings = Settings(
        cors_allowed_origins="https://enterprise-knowledge-agententerprise.netlify.app"
    )

    assert settings.cors_origin_list == [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "https://enterprise-knowledge-agententerprise.netlify.app",
        "https://docs.example.netlify.app",
    ]
    assert production_settings.cors_origin_list == [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "https://enterprise-knowledge-agententerprise.netlify.app",
    ]
    monkeypatch.setenv("CORS_ORIGINS", "https://docs.example.netlify.app")
    env_named_settings = Settings(_env_file=None)
    assert env_named_settings.cors_origin_list[-1] == "https://docs.example.netlify.app"
    monkeypatch.delenv("CORS_ORIGINS")
    monkeypatch.setenv("CORS_ALLOWED_ORIGINS", "https://legacy.example.netlify.app")
    legacy_env_settings = Settings(_env_file=None)
    assert legacy_env_settings.cors_origin_list[-1] == "https://legacy.example.netlify.app"
    with pytest.raises(ValueError):
        Settings(cors_allowed_origins="*")
    with pytest.raises(ValueError):
        Settings(cors_allowed_origins="https://*")
    with pytest.raises(ValueError):
        Settings(cors_allowed_origins="https://docs.example.netlify.app/admin")
