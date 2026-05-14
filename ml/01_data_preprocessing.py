from __future__ import annotations

try:
    from .data_preprocessing import main
except ImportError:
    from data_preprocessing import main


if __name__ == "__main__":
    main()
