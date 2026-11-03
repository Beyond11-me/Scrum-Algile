"""Exercise the local Compose stack through the same reverse proxy as the UI."""
import json
import os
import urllib.request
import uuid

BASE = os.getenv("SMOKE_BASE_URL", "http://127.0.0.1:" + os.getenv("FRONTEND_PORT", "8080"))
API = os.getenv("SMOKE_API_URL", "http://127.0.0.1:" + os.getenv("BACKEND_PORT", "8000"))


def request(path, data=None, token=None):
    headers = {}
    if data is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(data).encode()
    if token:
        headers["Authorization"] = "Bearer " + token
    req = urllib.request.Request(BASE + path, data=data, headers=headers)
    with urllib.request.urlopen(req, timeout=30) as response:
        return json.load(response)


with urllib.request.urlopen(BASE + "/assignments", timeout=10) as response:
    assert response.status == 200 and b"<html" in response.read().lower()

with urllib.request.urlopen(API + "/healthz", timeout=10) as response:
    health = json.load(response)
    assert health == {"status": "ok", "revision": os.getenv("IMAGE_REVISION", "local")}, health

email = f"ci-{uuid.uuid4().hex}@example.test"
session = request("/api/auth/register", {"name": "CI Student", "email": email, "password": "LocalTest123"})
token = session["access_token"]
profile = request("/api/auth/me", token=token)
assert profile["email"] == email and profile["role"] == "student", profile
print("Compose smoke test passed: SPA fallback, proxy, registration, auth and SQL Server.")
