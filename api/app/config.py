from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    tinyfish_api_key: str = Field(min_length=1)
    anthropic_api_key: str = Field(min_length=1)
    secret_key: str = Field(min_length=16)
    anthropic_model: str = "claude-haiku-5-5"
    google_client_id: str = ""
    database_url: str = "sqlite+aiosqlite:///./vouch.db"
    cors_origins: str = "http://localhost:5173"
    tinyfish_enable_agent: bool = True
    tinyfish_agent_timeout_s: float = 90
    tinyfish_search_timeout_s: float = 8
    tinyfish_fetch_timeout_s: float = 20
    anthropic_timeout_s: float = 15
    public_web_url: str = "https://vouch.spacesdrive.cc"
    final_deadline_s: float = 75
    rate_limit_checks: int = 10
    rate_limit_window_s: int = 600

    @property
    def cors_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()  # fails fast if required keys are missing
