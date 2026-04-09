"""Centralized logging configuration."""

import logging
import sys

_configured = False


def configure_logging(level: int = logging.INFO) -> None:
    """Configure root logger. Idempotent — safe to call multiple times."""
    global _configured
    if _configured:
        return

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(
        logging.Formatter(
            "%(asctime)s [%(levelname)s] %(name)s: %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
        )
    )

    root = logging.getLogger()
    root.setLevel(level)
    root.handlers = [handler]

    _configured = True


def get_logger(name: str) -> logging.Logger:
    """Get a named logger, ensuring root is configured first."""
    configure_logging()
    return logging.getLogger(name)
