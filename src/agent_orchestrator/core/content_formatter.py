from .models import FormattedContent


class ContentFormatter:
    """Pure core logic that transforms model output into stable markdown structure."""

    def format_markdown_blog(self, raw_text: str) -> FormattedContent:
        cleaned = raw_text.strip()
        if not cleaned:
            cleaned = "No content generated."

        if cleaned.startswith("# "):
            return FormattedContent(markdown=cleaned)

        markdown = (
            "# Autonomous Agent Output\n\n"
            "## Summary\n"
            f"{cleaned}\n\n"
            "## Action Items\n"
            "- Review generated content\n"
            "- Publish when approved\n"
        )
        return FormattedContent(markdown=markdown)
