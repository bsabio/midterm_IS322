import os
from dataclasses import dataclass


@dataclass(frozen=True)
class OrchestratorSettings:
    ollama_url: str
    ollama_model: str
    research_dir: str
    onboarding_doc_path: str
    github_token: str
    github_owner: str
    github_repo: str
    github_branch: str


def load_orchestrator_settings() -> OrchestratorSettings:
    return OrchestratorSettings(
        ollama_url=os.getenv("ORCH_OLLAMA_URL", "http://localhost:11434/api/generate"),
        ollama_model=os.getenv("ORCH_OLLAMA_MODEL", "llama3.2:3b"),
        research_dir=os.getenv("ORCH_RESEARCH_DIR", "research"),
        onboarding_doc_path=os.getenv("ORCH_ONBOARDING_DOC", "research/AGENT_ONBOARDING.md"),
        github_token=os.getenv("ORCH_GITHUB_TOKEN", ""),
        github_owner=os.getenv("ORCH_GITHUB_OWNER", ""),
        github_repo=os.getenv("ORCH_GITHUB_REPO", ""),
        github_branch=os.getenv("ORCH_GITHUB_BRANCH", "main"),
    )
