from typing import Protocol

from ..entities.resource import Resource


class ResourceRepository(Protocol):
    """Abstraction for resource persistence."""

    def add(self, resource: Resource) -> None:
        ...

    def list_all(self) -> list[Resource]:
        ...
