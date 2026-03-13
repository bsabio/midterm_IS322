from src.agentic_cli.application.use_cases.autonomous_onboarding import AutonomousOnboardingUseCase


def test_help_document_contains_core_sections() -> None:
    use_case = AutonomousOnboardingUseCase(app_name="agentic-cli-toolkit")
    guide = use_case.generate_help_document()
    assert "Autonomous Help" in guide
    assert "Architecture Rules" in guide
