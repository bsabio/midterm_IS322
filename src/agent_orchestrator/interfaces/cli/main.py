import argparse
import os

from ...application.use_cases.onboarding_help import OnboardingHelpUseCase
from ...application.use_cases.orchestrate_instruction import OrchestrateInstructionUseCase
from ...config import load_orchestrator_settings
from ...core.content_formatter import ContentFormatter
from ...infrastructure.github_publisher import GitHubContentPublisher
from ...infrastructure.local_research_store import LocalResearchStore
from ...infrastructure.ollama_reasoner import OllamaReasoner


def _load_dotenv(path: str = ".env") -> None:
    if not os.path.exists(path):
        return
    with open(path, "r", encoding="utf-8") as handle:
        for line in handle:
            value = line.strip()
            if not value or value.startswith("#") or "=" not in value:
                continue
            key, val = value.split("=", 1)
            os.environ.setdefault(key.strip(), val.strip())


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="agent-orchestrator",
        description="Clean Architecture CLI toolkit with local Ollama reasoning",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    help_cmd = sub.add_parser("help-agent", help="Print autonomous onboarding help")
    help_cmd.add_argument("--save", action="store_true", help="Save onboarding guide to configured docs path")

    add_doc = sub.add_parser("research-add", help="Add research context markdown")
    add_doc.add_argument("--title", required=True)
    add_doc.add_argument("--content", required=True)

    sub.add_parser("research-list", help="List local research markdown documents")

    run = sub.add_parser("run", help="Run full autonomous reasoning + formatting flow")
    run.add_argument("--instruction", required=True)
    run.add_argument(
        "--system-prompt",
        default="You are an autonomous content agent. Return concise, high-quality markdown blog output.",
    )
    run.add_argument("--publish-path", default=None)
    run.add_argument("--sha", default=None)

    return parser


def main() -> None:
    _load_dotenv()
    parser = _build_parser()
    args = parser.parse_args()

    settings = load_orchestrator_settings()
    research_store = LocalResearchStore(settings.research_dir)
    reasoner = OllamaReasoner(settings.ollama_url, settings.ollama_model)
    formatter = ContentFormatter()
    publisher = None

    if settings.github_token and settings.github_owner and settings.github_repo:
        publisher = GitHubContentPublisher(
            token=settings.github_token,
            owner=settings.github_owner,
            repo=settings.github_repo,
            branch=settings.github_branch,
        )

    if args.command == "help-agent":
        guide = OnboardingHelpUseCase(
            ollama_url=settings.ollama_url,
            model=settings.ollama_model,
        ).build_guide()
        if args.save:
            with open(settings.onboarding_doc_path, "w", encoding="utf-8") as handle:
                handle.write(guide + "\n")
            print(f"Saved onboarding guide to {settings.onboarding_doc_path}")
            return
        print(guide)
        return

    if args.command == "research-add":
        path = research_store.add_document(args.title, args.content)
        print(f"Added research document: {path}")
        return

    if args.command == "research-list":
        docs = research_store.list_documents()
        if not docs:
            print("No research documents found.")
            return
        for doc in docs:
            print(doc)
        return

    if args.command == "run":
        use_case = OrchestrateInstructionUseCase(
            reasoner=reasoner,
            formatter=formatter,
            research_store=research_store,
            publisher=publisher,
        )
        result = use_case.run(
            instruction=args.instruction,
            system_prompt=args.system_prompt,
            publish_path=args.publish_path,
            sha=args.sha,
        )
        print(result["formatted_markdown"])
        if result.get("published"):
            print("\nPublished via GitHub Contents API.")
        return


if __name__ == "__main__":
    main()
