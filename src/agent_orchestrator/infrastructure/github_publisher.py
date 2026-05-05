import base64
import json
from urllib.error import HTTPError
from urllib.request import Request, urlopen


class GitHubContentPublisher:
    """Pushes files through GitHub Contents API without local git CLI."""

    def __init__(self, token: str, owner: str, repo: str, branch: str) -> None:
        self._token = token
        self._owner = owner
        self._repo = repo
        self._branch = branch

    def publish(self, remote_path: str, content: str, sha: str | None = None) -> dict:
        if not self._token or not self._owner or not self._repo:
            raise RuntimeError("Missing GitHub publisher configuration.")

        path = remote_path.lstrip("/")
        encoded_segments = "/".join(segment for segment in path.split("/") if segment)
        url = f"https://api.github.com/repos/{self._owner}/{self._repo}/contents/{encoded_segments}"

        body = {
            "message": f"chore(content): publish {path}",
            "content": base64.b64encode(content.encode("utf-8")).decode("utf-8"),
            "branch": self._branch,
        }
        if sha:
            body["sha"] = sha

        request = Request(
            url,
            data=json.dumps(body).encode("utf-8"),
            headers={
                "Accept": "application/vnd.github+json",
                "Authorization": f"Bearer {self._token}",
                "X-GitHub-Api-Version": "2022-11-28",
                "Content-Type": "application/json",
            },
            method="PUT",
        )

        try:
            with urlopen(request, timeout=90) as response:
                return json.loads(response.read().decode("utf-8"))
        except HTTPError as error:
            details = error.read().decode("utf-8")
            raise RuntimeError(f"GitHub publish failed ({error.code}): {details}") from error
