from dataclasses import dataclass
from datetime import datetime, timezone
from typing import List


@dataclass(frozen=True)
class Resource:
    """Immutable knowledge resource stored in the local library."""

    id: str
    title: str
    source: str
    content: str
    tags: List[str]
    created_at: str

    @staticmethod
    def now_iso() -> str:
        return datetime.now(timezone.utc).isoformat()
