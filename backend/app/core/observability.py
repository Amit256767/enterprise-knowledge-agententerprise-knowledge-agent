import json
import logging
import time
from uuid import uuid4

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

logger = logging.getLogger("knowledge_agent.http")


class StructuredRequestLoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        request_id = str(uuid4())
        request.state.request_id = request_id
        started = time.perf_counter()
        status_code = 500
        try:
            response = await call_next(request)
            status_code = response.status_code
            response.headers["X-Request-ID"] = request_id
            return response
        finally:
            logger.info(
                json.dumps(
                    {
                        "event": "http.request",
                        "request_id": request_id,
                        "method": request.method,
                        "path": request.url.path,
                        "status_code": status_code,
                        "latency_ms": round((time.perf_counter() - started) * 1000),
                        "failed": status_code >= 500,
                    },
                    separators=(",", ":"),
                )
            )
