from datetime import datetime
from pathlib import Path


class LocalResearchStore:
    """Filesystem-backed research context folder managed by the agent."""

    def __init__(self, research_dir: str) -> None:
        self._base = Path(research_dir)
        self._base.mkdir(parents=True, exist_ok=True)

    def add_document(self, title: str, content: str) -> str:
        safe_title = "".join(ch.lower() if ch.isalnum() else "-" for ch in title).strip("-")
        safe_title = safe_title or "note"
        stamp = datetime.utcnow().strftime("%Y%m%d-%H%M%S")
        path = self._base / f"{stamp}-{safe_title}.md"
        path.write_text(content.strip() + "\n", encoding="utf-8")
        return str(path)

    def list_documents(self) -> list[str]:
        return [str(p) for p in sorted(self._base.glob("*.md"))]

    def compile_context(self, max_chars: int = 8000) -> str:
        chunks: list[str] = []
        used = 0
        for doc in sorted(self._base.glob("*.md"), reverse=True):
            body = doc.read_text(encoding="utf-8")
            block = f"\n---\n# Source: {doc.name}\n{body.strip()}\n"
            if used + len(block) > max_chars:
                break
            chunks.append(block)
            used += len(block)
        return "\n".join(chunks).strip()
