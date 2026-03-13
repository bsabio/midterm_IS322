from ...core.content_formatter import ContentFormatter
from ...ports.protocols import Publisher, ReasoningEngine, ResearchStore


class OrchestrateInstructionUseCase:
    """Coordinates local reasoning, formatting, and optional remote publishing."""

    def __init__(
        self,
        reasoner: ReasoningEngine,
        formatter: ContentFormatter,
        research_store: ResearchStore,
        publisher: Publisher | None,
    ) -> None:
        self._reasoner = reasoner
        self._formatter = formatter
        self._research_store = research_store
        self._publisher = publisher

    def run(
        self,
        instruction: str,
        system_prompt: str,
        publish_path: str | None = None,
        sha: str | None = None,
    ) -> dict:
        context = self._research_store.compile_context()
        raw_output = self._reasoner.generate(
            instruction=instruction,
            context=context,
            system_prompt=system_prompt,
        )
        formatted = self._formatter.format_markdown_blog(raw_output)

        result: dict = {
            "raw": raw_output,
            "formatted_markdown": formatted.markdown,
            "published": False,
        }

        if publish_path and self._publisher is not None:
            publish_response = self._publisher.publish(
                remote_path=publish_path,
                content=formatted.markdown,
                sha=sha,
            )
            result["published"] = True
            result["publish_response"] = publish_response

        return result
