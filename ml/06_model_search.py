from __future__ import annotations

try:
    from .model_search import main
except ImportError:
    from model_search import main


if __name__ == "__main__":
    main()
