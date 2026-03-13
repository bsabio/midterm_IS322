import argparse
import os

from ...application.use_cases.autonomous_onboarding import AutonomousOnboardingUseCase
from ...application.use_cases.build_library import BuildLibraryUseCase
from ...config.settings import load_settings
from ...infrastructure.search.local_indexer import LocalIndexer
from ...infrastructure.storage.local_json_repository import LocalJsonResourceRepository


def _parse_dotenv(path: str = ".env") -> None:
    if not os.path.exists(path):
        return
    with open(path, "r", encoding="utf-8") as handle:
        for line in handle:
            stripped = line.strip()
            if not stripped or stripped.startswith("#") or "=" not in stripped:
                continue
            key, value = stripped.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip())


def _build_use_case() -> tuple[BuildLibraryUseCase, AutonomousOnboardingUseCase]:
    _parse_dotenv()
    settings = load_settings()
    repository = LocalJsonResourceRepository(settings.resource_db_path)
    indexer = LocalIndexer(
        min_token_length=settings.search_min_token_length,
        max_tokens_per_resource=settings.search_max_tokens_per_resource,
    )
    library_use_case = BuildLibraryUseCase(repository=repository, indexer=indexer)
    onboarding_use_case = AutonomousOnboardingUseCase(app_name=settings.app_name)
    return library_use_case, onboarding_use_case


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="agentic-cli", description="Agentic local knowledge toolkit")
    sub = parser.add_subparsers(dest="command", required=True)

    init_help = sub.add_parser("init-help", help="Generate autonomous onboarding guide")
    init_help.add_argument("--save", action="store_true", help="Save guide to file path in .env")

    add = sub.add_parser("add", help="Add resource to local library")
    add.add_argument("--title", required=True)
    add.add_argument("--source", required=True)
    add.add_argument("--content", required=True)
    add.add_argument("--tags", default="")

    sub.add_parser("list", help="List all resources")

    search = sub.add_parser("search", help="Search resources")
    search.add_argument("query")
    search.add_argument("--limit", type=int, default=None)

    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()
    library_use_case, onboarding_use_case = _build_use_case()
    settings = load_settings()

    if args.command == "init-help":
        guide = onboarding_use_case.generate_help_document()
        if args.save:
            with open(settings.onboarding_guide_path, "w", encoding="utf-8") as handle:
                handle.write(guide + "\n")
            print(f"Onboarding guide saved to {settings.onboarding_guide_path}")
            return
        print(guide)
        return

    if args.command == "add":
        tags = [part for part in args.tags.split(",") if part.strip()]
        resource = library_use_case.add_resource(
            title=args.title,
            source=args.source,
            content=args.content,
            tags=tags,
        )
        print(f"Added resource: {resource.id} | {resource.title}")
        return

    if args.command == "list":
        resources = library_use_case.list_resources()
        if not resources:
            print("No resources found.")
            return
        for resource in resources:
            print(f"{resource.id} | {resource.title} | {resource.source} | tags={','.join(resource.tags)}")
        return

    if args.command == "search":
        limit = args.limit if args.limit is not None else settings.search_max_results
        results = library_use_case.search(args.query, max_results=limit)
        if not results:
            print("No matching resources.")
            return
        for resource in results:
            print(f"{resource.id} | {resource.title} | {resource.source}")
        return


if __name__ == "__main__":
    main()
