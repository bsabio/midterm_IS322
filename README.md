# Agentic CLI Toolkit (Clean Architecture)

CPU-friendly local CLI toolkit for AI agents, designed with strict separation of concerns using Robert C. Martin's Clean Architecture principles.

## Goals

1. Modular Agentic Search Tool to build a local library of resources.
2. Autonomous Help System so other AI agents can onboard themselves.
3. Strict separation between CLI interface and agent logic.

## Directory Structure

```text
.
├── .gitignore
├── README.md
├── src
│   └── agentic_cli
│       ├── __init__.py
│       ├── application
│       │   ├── __init__.py
│       │   └── use_cases
│       │       ├── __init__.py
│       │       ├── autonomous_onboarding.py
│       │       └── build_library.py
│       ├── config
│       │   ├── __init__.py
│       │   └── settings.py
│       ├── domain
│       │   ├── __init__.py
│       │   ├── entities
│       │   │   ├── __init__.py
│       │   │   └── resource.py
│       │   └── repositories
│       │       ├── __init__.py
│       │       └── resource_repository.py
│       ├── infrastructure
│       │   ├── __init__.py
│       │   ├── search
│       │   │   ├── __init__.py
│       │   │   └── local_indexer.py
│       │   └── storage
│       │       ├── __init__.py
│       │       └── local_json_repository.py
│       └── interfaces
│           ├── __init__.py
│           └── cli
│               ├── __init__.py
│               └── main.py
└── tests
	└── test_onboarding.py
```

## Quick Start

```bash
python -m venv .venv
source .venv/bin/activate
# create and populate .env manually
python -m src.agentic_cli.interfaces.cli.main init-help
python -m src.agentic_cli.interfaces.cli.main add --title "Clean Architecture" --source "https://blog.cleancoder.com"
python -m src.agentic_cli.interfaces.cli.main list
python -m src.agentic_cli.interfaces.cli.main search "architecture"
```

## Clean Architecture Mapping

- Domain: Enterprise rules (`entities`, repository contracts)
- Application: Use cases and orchestration (`use_cases`)
- Infrastructure: Data persistence and indexing details
- Interfaces: CLI adapters only (no business logic)

## Performance Notes (Dell Latitude 7410)

- JSON storage with append/update pattern (low overhead).
- Token-based in-memory search index rebuilt on demand.
- No heavy ML frameworks or GPU assumptions.
- Configurable result limits and token cutoffs via `.env`.

## Autonomous Orchestrator Toolkit

This repository now includes a Clean Architecture CLI orchestration framework that uses local Ollama as the primary reasoning engine.

Location:

- `src/agent_orchestrator/`

Architecture boundaries:

- Core Logic: `src/agent_orchestrator/core/content_formatter.py`
- Infrastructure (external I/O):
	- `src/agent_orchestrator/infrastructure/ollama_reasoner.py`
	- `src/agent_orchestrator/infrastructure/github_publisher.py`
- Local context docs: `research/`
- Self-onboarding help use case: `src/agent_orchestrator/application/use_cases/onboarding_help.py`

Run examples:

```bash
python -m src.agent_orchestrator.interfaces.cli.main help-agent
python -m src.agent_orchestrator.interfaces.cli.main research-add --title "design note" --content "glassmorphism and bauhaus constraints"
python -m src.agent_orchestrator.interfaces.cli.main run --instruction "Draft a post about local AI workflows"
```