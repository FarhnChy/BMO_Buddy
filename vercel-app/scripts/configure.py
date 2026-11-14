"""Create ignored local Vercel configuration without printing secrets."""
import getpass
import hashlib
import os
from pathlib import Path
import secrets

path = Path(__file__).resolve().parents[1] / '.env.local'
if path.exists():
    raise SystemExit('.env.local already exists; keep it and edit through your private configuration controls.')
password = getpass.getpass('Choose an owner password (at least 12 characters): ')
if len(password) < 12 or password != getpass.getpass('Confirm owner password: '):
    raise SystemExit('Use a matching password of at least 12 characters.')
salt = secrets.token_hex(16)
digest = hashlib.scrypt(password.encode(), salt=salt.encode(), n=16384, r=8, p=1, dklen=64).hex()
content = f'DATABASE_URL=\nBMO_OWNER_PASSWORD_HASH={salt}:{digest}\nBMO_SESSION_SECRET={secrets.token_hex(32)}\nBMO_DEVICE_TOKEN={secrets.token_hex(32)}\n'
with path.open('x', encoding='utf-8') as file:
    file.write(content)
os.chmod(path, 0o600)
print('Created ignored .env.local. Set DATABASE_URL privately before migration.')
