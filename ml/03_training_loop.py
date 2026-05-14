from __future__ import annotations

try:
    from .training_loop import main
except ImportError:
    from training_loop import main


if __name__ == "__main__":
    main()
