import json
import os
from dataclasses import asdict

from ...domain.entities.resource import Resource


class LocalJsonResourceRepository:
    """JSON-file persistence for local resource storage."""

    def __init__(self, db_path: str) -> None:
        self._db_path = db_path
        if not os.path.exists(self._db_path):
            self._write([])

    def _read(self) -> list[dict]:
        with open(self._db_path, "r", encoding="utf-8") as handle:
            data = json.load(handle)
            if isinstance(data, list):
                return data
            return []

    def _write(self, rows: list[dict]) -> None:
        with open(self._db_path, "w", encoding="utf-8") as handle:
            json.dump(rows, handle, ensure_ascii=True, indent=2)

    def add(self, resource: Resource) -> None:
        rows = self._read()
        rows.append(asdict(resource))
        self._write(rows)

    def list_all(self) -> list[Resource]:
        return [Resource(**row) for row in self._read()]
