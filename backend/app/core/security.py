import hashlib
import os
import secrets

def hash_password(password: str) -> str:
    """Hash password or PIN securely using PBKDF2 HMAC SHA-256 with random salt."""
    salt = os.urandom(16).hex()
    key = hashlib.pbkdf2_hmac(
        'sha256',
        password.encode('utf-8'),
        bytes.fromhex(salt),
        100000
    )
    return f"{salt}:{key.hex()}"

def verify_password(stored_hash: str, provided_password: str) -> bool:
    """Verify a plain password against the stored salt:hash string."""
    try:
        if not stored_hash or ":" not in stored_hash:
            return False
        salt, key_hex = stored_hash.split(":", 1)
        key_check = hashlib.pbkdf2_hmac(
            'sha256',
            provided_password.encode('utf-8'),
            bytes.fromhex(salt),
            100000
        )
        return secrets.compare_digest(key_check.hex(), key_hex)
    except Exception:
        return False
