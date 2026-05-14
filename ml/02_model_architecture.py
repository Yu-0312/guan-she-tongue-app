from __future__ import annotations

try:
    from .model_architecture import main
except ImportError:
    from model_architecture import main


if __name__ == "__main__":
    main()
