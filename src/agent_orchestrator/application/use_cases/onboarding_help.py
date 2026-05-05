from textwrap import dedent


class OnboardingHelpUseCase:
    """Provides a self-serve operating guide for newly spawned agents."""

    def __init__(self, ollama_url: str, model: str) -> None:
        self._ollama_url = ollama_url
        self._model = model

    def build_guide(self) -> str:
        return dedent(
            f"""
            # Autonomous Agent Onboarding Guide

            ## Mission
            - Process user instructions using local Ollama as the primary reasoning engine.
            - Keep long-lived context in the local research folder.
            - Keep core formatting logic independent from external publishing infrastructure.

            ## Local Ollama Contract
            - Endpoint: `{self._ollama_url}`
            - Model: `{self._model}`
            - Request shape: JSON with `model`, `prompt`, `stream=false`

            ## CLI Commands
            - `help-agent [--save]`: print or persist this onboarding guide.
            - `research-add --title --content`: store new context notes under `/research`.
            - `research-list`: list local context files.
            - `run --instruction --system-prompt [--publish-path] [--sha]`: run full orchestration.

            ## Clean Architecture Boundaries
            - Core: `content_formatter.py` only formats content.
            - Infrastructure: `ollama_reasoner.py` and `github_publisher.py` handle I/O.
            - Application use cases coordinate ports and produce outcomes.

            ## Autonomous Loop Pattern
            1. Load context from latest research docs.
            2. Reason with local Ollama.
            3. Format output through core formatter.
            4. Optionally publish to GitHub via infrastructure adapter.
            """
        ).strip()
