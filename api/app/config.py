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
    tinyfish_agent_mca: bool = False  # the MCA portal rarely gets past its captcha; off by default to keep the 2-run queue free
    tinyfish_agent_timeout_s: float = 150
    tinyfish_search_timeout_s: float = 8
    tinyfish_fetch_timeout_s: float = 20
    anthropic_timeout_s: float = 15
    public_web_url: str = "https://vouch.spacesdrive.cc"
    final_deadline_s: float = 180
    final_deadline_listing_s: float = 420  # job-board links get longer for the registry/careers agents
    rate_limit_checks: int = 10
    rate_limit_window_s: int = 600
    # v2: Research / Browser / Monitor / Highlights
    tinyfish_enable_research: bool = True
    tinyfish_research_mode: str = "deep"
    tinyfish_research_timeout_s: float = 480
    tinyfish_enable_browser: bool = True
    tinyfish_browser_budget_s: float = 60
    tinyfish_browser_api: str = "https://api.browser.tinyfish.ai"
    tinyfish_enable_monitor: bool = True
    tinyfish_monitor_cron: str = "0 3 * * *"
    tinyfish_monitor_webhook_url: str = ""  # Monitor API supports webhooks only (no email)
    tinyfish_highlights_enabled: bool = False
    screenshot_dir: str = "./screenshots"
    # v3: company watches
    public_api_url: str = ""  # e.g. https://api.vouch.example; Monitor webhooks are only created when set
    watch_webhook_secret: str = ""  # defaults to a value derived from SECRET_KEY
    watch_scheduler_interval_s: float = 600
    watch_agent_timeout_s: float = 240

    @property
    def cors_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()  # fails fast if required keys are missing
