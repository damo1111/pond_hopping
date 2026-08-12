#!/usr/bin/env python3
"""Apple's client secret, without installing anything.

Same job as apple-secret.mjs, same flags, for a machine with no Node on it.
Everything here ships with macOS: openssl signs, and the standard library
does the rest. Nothing is fetched, nothing is installed, and the .p8 is read
once and never printed.

    python3 scripts/apple-secret.py \
      --p8 ~/Downloads/AuthKey_ABC123XYZ.p8 \
      --team 1A2B3C4D5E \
      --key ABC123XYZ \
      --services app.eend.pond.web

── Why this is more than base64 and a signature ─────────────────────────────

Apple is the only provider that makes you mint your own client secret: it is
a JWT you sign with the .p8, and it expires — six months at the outside — so
this gets run again every half year, forever. That is exactly the kind of
thing that should have no dependencies.

The one real trap is the signature format. ES256 wants the raw 64 bytes of
r‖s. openssl hands back ASN.1 DER — a SEQUENCE of two INTEGERs, which is 70
or 71 bytes depending on whether the high bit of either number happens to be
set, and which is a perfectly valid signature that Apple will not accept.
Sent as-is you get `invalid_client`, which is the same error you get for a
wrong Team ID, a wrong key, or the App ID in place of the Services ID. So it
looks like a configuration mistake and it is not one.

der_to_p1363 below is that conversion, and it is the only interesting code in
this file.
"""

import argparse
import base64
import json
import subprocess
import sys
import time
from datetime import datetime, timezone

# Apple's ceiling is six months. Sitting a fortnight under it means a secret
# minted on the last day of a long month cannot land on a date that does not
# exist, and leaves room to be a few days late without an outage.
LIFETIME = 180 * 24 * 3600

AUDIENCE = 'https://appleid.apple.com'


def b64(raw: bytes) -> str:
    """base64url, unpadded — what JWT means by base64."""
    return base64.urlsafe_b64encode(raw).rstrip(b'=').decode('ascii')


def der_to_p1363(der: bytes, size: int = 32) -> bytes:
    """ASN.1 DER ECDSA signature → the raw r‖s that ES256 actually wants.

    DER stores r and s as INTEGERs, which means two things this has to undo:
    a leading zero byte is prepended whenever the top bit is set (so the
    number is not read as negative), and leading zeros are otherwise dropped.
    Either way the result is not 32 bytes. Strip, then left-pad to exactly
    the curve's field size.
    """
    if not der or der[0] != 0x30:
        raise ValueError('not a DER SEQUENCE — openssl did not return a signature')

    i = 1
    if der[i] & 0x80:  # long-form length; P-256 never needs it, but be exact
        i += 1 + (der[i] & 0x7F)
    else:
        i += 1

    def read_int(at: int):
        if der[at] != 0x02:
            raise ValueError('expected an INTEGER in the signature')
        length = der[at + 1]
        value = der[at + 2 : at + 2 + length].lstrip(b'\x00')
        if len(value) > size:
            raise ValueError('signature component is too large for P-256')
        return value.rjust(size, b'\x00'), at + 2 + length

    r, i = read_int(i)
    s, _ = read_int(i)
    return r + s


def sign(p8_path: str, message: bytes) -> bytes:
    """Hand the signing to openssl, which reads the .p8 as-is.

    Apple's key arrives as PKCS#8 PEM, which is what `dgst -sign` expects, so
    there is no conversion step and no temporary copy of the key anywhere.
    """
    done = subprocess.run(
        ['openssl', 'dgst', '-sha256', '-sign', p8_path],
        input=message,
        capture_output=True,
    )
    if done.returncode != 0:
        # openssl's own words are more useful than anything paraphrased —
        # "No such file", "unable to load key", "PEM routines" all say
        # something different about what went wrong.
        sys.exit(f'openssl could not sign with that key:\n{done.stderr.decode().strip()}')
    return done.stdout


def main() -> None:
    ap = argparse.ArgumentParser(description="Mint Apple's client secret JWT.")
    ap.add_argument('--p8', required=True, help='path to AuthKey_XXXXXXXXXX.p8')
    ap.add_argument('--team', required=True, help='Team ID — developer.apple.com/account, Membership details')
    ap.add_argument('--key', required=True, help='Key ID — the XXXXXXXXXX in the .p8 filename')
    ap.add_argument('--services', required=True, help='Services ID, e.g. app.eend.pond.web — NOT the App ID')
    args = ap.parse_args()

    now = int(time.time())
    header = {'alg': 'ES256', 'kid': args.key, 'typ': 'JWT'}
    claims = {
        'iss': args.team,
        'iat': now,
        'exp': now + LIFETIME,
        'aud': AUDIENCE,
        # The Services ID, and this is the line that most often carries the
        # App ID by mistake. Apple's answer to that is `invalid_client`.
        'sub': args.services,
    }

    def part(obj):
        # Separators matter: json.dumps' default puts a space after every
        # comma and colon. Harmless in a JWT, but the compact form is what
        # every other implementation produces and it is what gets diffed
        # against when something does not work.
        return b64(json.dumps(obj, separators=(',', ':')).encode())

    signing_input = f'{part(header)}.{part(claims)}'.encode('ascii')
    token = f'{signing_input.decode()}.{b64(der_to_p1363(sign(args.p8, signing_input)))}'

    # The token on stdout by itself, so it can be piped or copied without
    # picking up anything else. Everything a human needs goes to stderr.
    expires = datetime.fromtimestamp(now + LIFETIME, timezone.utc)
    print(f'Expires {expires:%d %B %Y} — diary it, Apple will not warn you.', file=sys.stderr)
    print(token)


if __name__ == '__main__':
    main()
