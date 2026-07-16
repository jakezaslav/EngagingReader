"""Logging bootstrap and HEIF opener registration."""
import logging

import pillow_heif


def configure_logging():
    logging.basicConfig(level=logging.INFO)


def register_heif_opener():
    pillow_heif.register_heif_opener()


def get_logger(name):
    return logging.getLogger(name)
