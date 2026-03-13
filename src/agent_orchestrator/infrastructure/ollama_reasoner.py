import json
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


class OllamaReasoner:
    """Primary local reasoning engine backed by Ollama."""

    def __init__(self, ollama_url: str, model: str) -> None:
        self._ollama_url = ollama_url
        self._model = model

    def generate(self, instruction: str, context: str, system_prompt: str) -> str:
        prompt = (
            f"SYSTEM:\n{system_prompt}\n\n"
            f"LOCAL CONTEXT:\n{context}\n\n"
            f"USER INSTRUCTION:\n{instruction}\n"
        )
        payload = {
            "model": self._model,
            "prompt": prompt,
            "stream": False,
        }
        data = json.dumps(payload).encode("utf-8")
        request = Request(
            self._ollama_url,
            data=data,
            headers={"Content-Type": "application/json"},
            method="POST",
        )

        try:
            with urlopen(request, timeout=90) as response:
                decoded = json.loads(response.read().decode("utf-8"))
                return str(decoded.get("response", "")).strip()
        except HTTPError as error:
            raise RuntimeError(f"Ollama request failed with HTTP {error.code}") from error
        except URLError as error:
            raise RuntimeError(
                "Could not reach local Ollama service. Start Ollama and verify it is listening on localhost:11434."
            ) from error
