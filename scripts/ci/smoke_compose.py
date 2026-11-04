"""Exercise the local Compose stack through the same reverse proxy as the UI."""
import json
import os
import urllib.error
import urllib.request

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

# Unknown credentials force a real user lookup, so a 400 proves proxy, auth and SQL Server all work.
try:
    request("/api/auth/login", {"email": "ci-smoke@example.test", "password": "LocalTest123"})
    raise AssertionError("Login with unknown credentials must fail")
except urllib.error.HTTPError as error:
    assert error.code == 400, error.code
    assert json.load(error)["detail"] == "Incorrect email or password"
print("Compose smoke test passed: SPA fallback, proxy, auth and SQL Server.")
