#!/usr/bin/env python3
"""Copy only the existing public development configuration into the iOS bundle."""
from pathlib import Path
import plistlib

root = Path(__file__).resolve().parent.parent
source = root / '.env.development.local'
values = {}
for line in source.read_text().splitlines():
    if '=' in line and not line.lstrip().startswith('#'):
        name, value = line.split('=', 1)
        values[name.strip()] = value.strip().strip('"').strip("'")
url = values.get('NEXT_PUBLIC_SUPABASE_URL', '')
key = values.get('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', '')
if url != 'https://mwjwfumpxdlllikcdvkh.supabase.co' or not key:
    raise SystemExit('Expected here-dev public Supabase configuration; no file written.')
destination = root / 'ios/Here/Config.plist'
destination.write_bytes(plistlib.dumps({'SUPABASE_URL': url, 'SUPABASE_PUBLISHABLE_KEY': key}))
print('iOS development configuration saved. No server secrets copied.')
