import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    app_name: str
    resource_db_path: str
    search_max_results: int
    search_max_tokens_per_resource: int
    search_min_token_length: int
    onboarding_guide_path: str


def load_settings() -> Settings:
    return Settings(
        app_name=os.getenv("APP_NAME", "agentic-cli-toolkit"),
        resource_db_path=os.getenv("RESOURCE_DB_PATH", "resources.json"),
        search_max_results=int(os.getenv("SEARCH_MAX_RESULTS", "10")),
        search_max_tokens_per_resource=int(os.getenv("SEARCH_MAX_TOKENS_PER_RESOURCE", "256")),
        search_min_token_length=int(os.getenv("SEARCH_MIN_TOKEN_LENGTH", "3")),
        onboarding_guide_path=os.getenv("ONBOARDING_GUIDE_PATH", "AGENT_ONBOARDING.md"),
    )
