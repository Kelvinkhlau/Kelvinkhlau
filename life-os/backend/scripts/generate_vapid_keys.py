"""Generate a VAPID key pair for Web Push notifications.

Usage:
    cd backend
    uv run python scripts/generate_vapid_keys.py

將 output 嘅 VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY 加入 backend/.env。
"""

import base64

from cryptography.hazmat.primitives import serialization
from py_vapid import Vapid


def main() -> None:
    vapid = Vapid()
    vapid.generate_keys()

    # Public key — uncompressed EC point (65 bytes) → base64url
    pub_bytes = vapid.public_key.public_bytes(
        encoding=serialization.Encoding.X962,
        format=serialization.PublicFormat.UncompressedPoint,
    )
    public_b64 = base64.urlsafe_b64encode(pub_bytes).rstrip(b"=").decode("utf-8")

    # Private key — DER (PKCS8) → base64url (pywebpush accepts呢個 form)
    priv_der = vapid.private_key.private_bytes(
        encoding=serialization.Encoding.DER,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )
    private_b64 = base64.urlsafe_b64encode(priv_der).rstrip(b"=").decode("utf-8")

    print("# ── Copy to backend/.env ──")
    print()
    print(f"VAPID_PUBLIC_KEY={public_b64}")
    print(f"VAPID_PRIVATE_KEY={private_b64}")
    print("VAPID_EMAIL=mailto:you@example.com")
    print()
    print("# Restart backend after updating .env.")


if __name__ == "__main__":
    main()
