from functools import lru_cache
from urllib.parse import urlsplit

from pydantic import AliasChoices, Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_env: str = "development"
    log_level: str = "INFO"
    cors_allowed_origins: str = Field(
        default="https://enterprise-knowledge-agententerprise.netlify.app",
        validation_alias=AliasChoices("CORS_ORIGINS", "CORS_ALLOWED_ORIGINS"),
    )
    database_url: str = (
        "postgresql+psycopg://knowledge_agent:change_me_locally@localhost:5432/knowledge_agent"
    )
    max_upload_bytes: int = Field(default=20 * 1024 * 1024, gt=0)
    chunk_size_chars: int = Field(default=1200, gt=0)
    chunk_overlap_chars: int = Field(default=200, ge=0)
    embedding_api_base_url: str = ""
    embedding_api_key: SecretStr | None = None
    embedding_model: str = ""
    embedding_dimensions: int = Field(default=1536, gt=0)
    embedding_batch_size: int = Field(default=64, gt=0, le=256)
    llm_api_base_url: str = ""
    llm_api_key: SecretStr | None = None
    llm_model: str = ""
    retrieval_top_k: int = Field(default=5, gt=0, le=20)
    retrieval_min_similarity: float = Field(default=0.2, ge=-1, le=1)
    agent_max_additional_searches: int = Field(default=2, ge=0, le=2)
    agent_context_chunks: int = Field(default=12, gt=0, le=24)
    llm_input_cost_per_million: float | None = Field(default=None, ge=0)
    llm_output_cost_per_million: float | None = Field(default=None, ge=0)

    @field_validator("cors_allowed_origins")
    @classmethod
    def validate_cors_allowed_origins(cls, value: str) -> str:
        origins = [origin.strip() for origin in value.split(",") if origin.strip()]
        for origin in origins:
            parsed = urlsplit(origin)
            if (
                parsed.scheme not in {"http", "https"}
                or not parsed.netloc
                or parsed.hostname is None
                or "*" in parsed.hostname
                or parsed.port == 0
                or parsed.username is not None
                or parsed.password is not None
                or parsed.path != ""
                or parsed.query
                or parsed.fragment
                or origin == "*"
            ):
                raise ValueError(
                    "cors_allowed_origins must contain exact HTTP(S) origins, without paths or wildcards"
                )
        return ",".join(origins)

    @property
    def cors_origin_list(self) -> list[str]:
        configured_origins = filter(None, self.cors_allowed_origins.split(","))
        return list(dict.fromkeys([
            "http://localhost:5173",
            "http://127.0.0.1:5173",
            "https://enterprise-knowledge-agententerprise.netlify.app",
            *configured_origins,
        ]))

    @model_validator(mode="after")
    def validate_chunk_overlap(self) -> "Settings":
        if self.chunk_overlap_chars >= self.chunk_size_chars:
            raise ValueError("chunk_overlap_chars must be smaller than chunk_size_chars")
        return self

    model_config = SettingsConfigDict(env_file="../.env", extra="ignore", populate_by_name=True)


@lru_cache
def get_settings() -> Settings:
    return Settings()

