from dataclasses import dataclass


@dataclass(frozen=True)
class AgentInstruction:
    text: str


@dataclass(frozen=True)
class FormattedContent:
    markdown: str
