"""Hex input validation and explicit normalization.

Normalization rules (and nothing else):
  1. Strip leading/trailing ASCII whitespace.
  2. Strip one leading "0x" / "0X".
  3. Lower-case hex digits.
Interior whitespace, odd length, non-hex characters, empty input are rejected.
"""
from __future__ import annotations

import hashlib
from dataclasses import dataclass

DEFAULT_MAX_BYTES = 24_576  # EIP-170 runtime code limit


class ValidationError(ValueError):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


@dataclass(frozen=True)
class NormalizedBytecode:
    data: bytes
    hex: str  # lower-case, no 0x prefix

    @property
    def sha256(self) -> str:
        return hashlib.sha256(self.data).hexdigest()

    @property
    def size(self) -> int:
        return len(self.data)


def normalize_bytecode(raw: str, max_bytes: int = DEFAULT_MAX_BYTES) -> NormalizedBytecode:
    if not isinstance(raw, str):
        raise ValidationError("not_a_string", "Bytecode must be a string.")
    s = raw.strip()
    if s[:2] in ("0x", "0X"):
        s = s[2:]
    if not s:
        raise ValidationError("empty", "Bytecode is empty.")
    if len(s) % 2:
        raise ValidationError("odd_length", "Hex string has odd length.")
    if len(s) // 2 > max_bytes:
        raise ValidationError("too_large", f"Bytecode exceeds the maximum of {max_bytes} bytes.")
    allowed = set("0123456789abcdefABCDEF")
    for i, ch in enumerate(s):
        if ch not in allowed:
            raise ValidationError("invalid_hex", f"Invalid hexadecimal character {ch!r} at position {i}.")
    s = s.lower()
    return NormalizedBytecode(bytes.fromhex(s), s)
