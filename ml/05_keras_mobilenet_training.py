from __future__ import annotations

try:
    from .keras_mobilenet_training import main
except ImportError:
    from keras_mobilenet_training import main


if __name__ == "__main__":
    main()
