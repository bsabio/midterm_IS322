from textwrap import dedent


class AutonomousOnboardingUseCase:
    """Generates self-serve onboarding instructions consumable by AI agents."""

    def __init__(self, app_name: str) -> None:
        self._app_name = app_name

    def generate_help_document(self) -> str:
        return dedent(
            f"""
            # {self._app_name} Autonomous Help

            This guide is designed for AI agents to onboard without human support.

            ## Mission
            - Build and query a local resource library.
            - Keep CLI concerns isolated from business logic.

            ## Commands
            - `init-help`: Print this onboarding guide.
            - `add --title --source --content [--tags]`: Add a resource.
            - `list`: Show all local resources.
            - `search <query>`: Search indexed resources.

            ## Architecture Rules
            - Domain has no infrastructure or CLI imports.
            - Application orchestrates use cases only.
            - Infrastructure handles files/indexing.
            - Interfaces call use cases and format output.

            ## Performance Rules
            - Avoid loading huge files into memory unnecessarily.
            - Keep tokenization simple and deterministic.
            - Prefer bounded result sets and short token lists.
            """
        ).strip()
