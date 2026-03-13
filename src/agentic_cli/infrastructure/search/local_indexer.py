import re
from collections import Counter

from ...domain.entities.resource import Resource


class LocalIndexer:
    """Simple token-frequency scorer for low-resource devices."""

    def __init__(self, min_token_length: int = 3, max_tokens_per_resource: int = 256) -> None:
        self._min_token_length = min_token_length
        self._max_tokens_per_resource = max_tokens_per_resource

    def _tokenize(self, text: str) -> list[str]:
        tokens = re.findall(r"[a-zA-Z0-9_]+", text.lower())
        filtered = [t for t in tokens if len(t) >= self._min_token_length]
        return filtered[: self._max_tokens_per_resource]

    def search(self, query: str, resources: list[Resource], max_results: int) -> list[dict]:
        query_tokens = self._tokenize(query)
        if not query_tokens:
            return []

        query_counter = Counter(query_tokens)
        scored: list[dict] = []

        for resource in resources:
            resource_text = " ".join([resource.title, resource.source, resource.content, " ".join(resource.tags)])
            resource_counter = Counter(self._tokenize(resource_text))
            score = sum(resource_counter[token] * weight for token, weight in query_counter.items())
            if score > 0:
                scored.append({"resource": resource, "score": score})

        scored.sort(key=lambda item: item["score"], reverse=True)
        return scored[:max_results]
