from typing import Protocol


class ReasoningEngine(Protocol):
    def generate(self, instruction: str, context: str, system_prompt: str) -> str:
        ...


class Publisher(Protocol):
    def publish(self, remote_path: str, content: str, sha: str | None = None) -> dict:
        ...


class ResearchStore(Protocol):
    def add_document(self, title: str, content: str) -> str:
        ...

    def list_documents(self) -> list[str]:
        ...

    def compile_context(self, max_chars: int = 8000) -> str:
        ...
