from __future__ import annotations

try:
    from .inference_api import app
except ImportError:
    from inference_api import app


if __name__ == "__main__":
    import os
    from pathlib import Path

    import uvicorn

    uvicorn.run(
        "inference_api:app",
        app_dir=str(Path(__file__).parent),
        host=os.getenv("API_HOST", "0.0.0.0"),
        port=int(os.getenv("API_PORT", "8000")),
        reload=True,
    )
