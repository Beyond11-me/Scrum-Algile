"""JWT gate for protected API endpoints.

Route dependencies still load the user and enforce permissions.  This
middleware performs the inexpensive, shared first check so a protected API
route can never be reached without a valid ``Authorization: Bearer`` header.
"""

from collections.abc import Awaitable, Callable

from fastapi import Request
from fastapi.responses import JSONResponse, Response
from starlette.middleware.base import BaseHTTPMiddleware

from app.core.security import decode_access_token


# These endpoints create a session or account, so requiring an access token
# there would make login impossible.  Every other endpoint below /api is
# protected by default.
PUBLIC_API_PATHS = frozenset(
    {
        "/api/auth/token",
        "/api/auth/login",
        "/api/auth/register",
        "/api/auth/register-lecturer",
        "/api/auth/demo",
    }
)


def unauthorized(detail: str) -> JSONResponse:
    return JSONResponse(
        status_code=401,
        content={"detail": detail},
        headers={"WWW-Authenticate": "Bearer"},
    )


class JWTAuthenticationMiddleware(BaseHTTPMiddleware):
    """Require a valid JWT for every protected API request.

    The decoded claims are attached to ``request.state`` so the current-user
    dependency does not need to decode the same token again.
    """

    async def dispatch(
        self,
        request: Request,
        call_next: Callable[[Request], Awaitable[Response]],
    ) -> Response:
        path = request.url.path
        normalized_path = path.rstrip("/") or "/"
        if (
            request.method == "OPTIONS"
            or not path.startswith("/api/")
            or normalized_path in PUBLIC_API_PATHS
        ):
            return await call_next(request)

        authorization = request.headers.get("Authorization", "")
        scheme, _, token = authorization.partition(" ")
        if scheme.lower() != "bearer" or not token.strip():
            return unauthorized("Bearer token is required")

        payload = decode_access_token(token.strip())
        if not payload:
            return unauthorized("Invalid or expired token")
        if not payload.get("sub"):
            return unauthorized("Invalid token payload")

        request.state.jwt_payload = payload
        return await call_next(request)
