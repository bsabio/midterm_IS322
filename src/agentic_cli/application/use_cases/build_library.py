import uuid

from ...domain.entities.resource import Resource
from ...domain.repositories.resource_repository import ResourceRepository
from ...infrastructure.search.local_indexer import LocalIndexer


class BuildLibraryUseCase:
    """Coordinates ingest and retrieval for the local resource library."""

    def __init__(self, repository: ResourceRepository, indexer: LocalIndexer) -> None:
        self._repository = repository
        self._indexer = indexer

    def add_resource(self, title: str, source: str, content: str, tags: list[str]) -> Resource:
        resource = Resource(
            id=str(uuid.uuid4()),
            title=title.strip(),
            source=source.strip(),
            content=content.strip(),
            tags=[t.strip().lower() for t in tags if t.strip()],
            created_at=Resource.now_iso(),
        )
        self._repository.add(resource)
        return resource

    def list_resources(self) -> list[Resource]:
        return self._repository.list_all()

    def search(self, query: str, max_results: int) -> list[Resource]:
        resources = self._repository.list_all()
        ranked = self._indexer.search(query=query, resources=resources, max_results=max_results)
        return [entry["resource"] for entry in ranked]
