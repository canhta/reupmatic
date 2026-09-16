"""Stable public error codes; never expose paths, source text or library tracebacks."""


class WorkerError(Exception):
    def __init__(self, code: str, message: str = ""):
        super().__init__(message or code)
        self.code = code
