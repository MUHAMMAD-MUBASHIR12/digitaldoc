try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

import time
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from routes import student_routes, admin_routes, verification_routes


class RateLimitMiddleware(BaseHTTPMiddleware):
    # (max_requests, window_seconds) keyed by route prefix.
    # Counts are per-IP per route group using a fixed sliding window.
    _LIMITS: dict[str, tuple[int, int]] = {
        "/api/student": (30, 60),
        "/api/admin":   (60, 60),
        "/api/verify":  (20, 60),
    }
    _DEFAULT = (60, 60)

    def __init__(self, app):
        super().__init__(app)
        # key -> (window_start_timestamp, request_count)
        self._windows: dict[str, tuple[float, int]] = {}

    async def dispatch(self, request: Request, call_next):
        ip = request.client.host if request.client else "0.0.0.0"
        path = request.url.path

        max_calls, window = self._DEFAULT
        prefix_key = "default"
        for prefix, limit in self._LIMITS.items():
            if path.startswith(prefix):
                max_calls, window = limit
                prefix_key = prefix
                break

        key = f"{ip}:{prefix_key}"
        now = time.time()
        window_start, count = self._windows.get(key, (now, 0))

        if now - window_start >= window:
            window_start, count = now, 0

        if count >= max_calls:
            retry_after = int(window - (now - window_start))
            return JSONResponse(
                status_code=429,
                headers={"Retry-After": str(retry_after)},
                content={"detail": "Too many requests. Please slow down."},
            )

        self._windows[key] = (window_start, count + 1)
        return await call_next(request)


app = FastAPI(
    title="Digital Doc - University Document Automation API",
    description="Backend for secure university document issuance and verification.",
    version="2.0.0",
)

# Middleware order: last added = outermost (first to handle incoming requests).
# CORS must be outermost so preflight OPTIONS requests are answered before
# they can be counted against rate limits.
app.add_middleware(RateLimitMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"http://localhost:\d+",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(student_routes.router, prefix="/api/student", tags=["Student Portal"])
app.include_router(admin_routes.router,   prefix="/api/admin",   tags=["Admin Console"])
app.include_router(verification_routes.router, prefix="/api/verify", tags=["Public Verification"])


@app.get("/")
async def root():
    return {
        "message": "Welcome to Digital Doc API",
        "status": "Operational",
        "documentation": "/docs",
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
