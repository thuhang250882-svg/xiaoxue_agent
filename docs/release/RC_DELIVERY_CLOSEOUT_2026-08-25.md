# RC Delivery Closeout — 2026-08-25

## Frozen release state

```text
FINAL_RC_SOURCE_SHA = 41a2f1ef6e27d0583fe23c8e9376c8d4d2014822

RC:
  expected = 11
  packaged = 11
  runtime = 11
  missing = []
  unexpected = []

Installer:
  built = PASS
  signed = NO
  path = E:\software programming\opencode-dev-mainline-rc\packages\desktop\dist\xiaoxue-output\录井小雪-0.8.0-rc.7-win-x64.exe
  size = 560253551 bytes

Signature:
  status = NotSigned
  signer = none
  issuer = none
  certificate_expiry = none

Hashes:
  unsigned_sha256 = C9EBD3A2F2AD6541245CE5514BE5330DDCDE0E5561A620D09EFF97AE760CA3FF
  signed_sha256 = NOT_AVAILABLE

Validated before freeze:
  clean_install = PASS
  first_launch = PASS
  core_smoke = PASS (11/11)
  upgrade = PASS
  rollback = PASS
  uninstall = PASS

TECHNICAL_RC_READY = YES
INTERNAL_RC_READY = YES
PUBLIC_CUSTOMER_RC_READY = NO
RC_DELIVERY_READY = NO

BLOCKER = FORMAL_CODE_SIGNING_CERTIFICATE_REQUIRED
```

The unsigned installer is frozen for internal RC use only. It is not approved
for public or customer delivery. No self-signed certificate may be used to
close the formal signing gate.

## Engineering freeze

The RC product source is frozen at `FINAL_RC_SOURCE_SHA`. Do not modify business
code, Skills, migrations, routing or agents; do not resume Phase 4.3, archive or
consolidation work; and do not redesign the release pipeline for this RC.

This closeout document is post-freeze release evidence. It does not redefine or
advance `FINAL_RC_SOURCE_SHA`.

## Formal signing continuation

After a legitimate Windows code-signing credential becomes available, perform
only the following closeout actions:

1. Authenticode-sign the frozen installer, or rebuild and sign through the
   existing pipeline from the same `FINAL_RC_SOURCE_SHA`.
2. Run `Get-AuthenticodeSignature` and require `Status = Valid`.
3. Recalculate SHA-256 after signing and record it as `signed_sha256`; never
   reuse the unsigned hash as the signed release hash.
4. Run the minimum post-sign validation: install, first launch, 11/11 RC Skill
   discovery, normal chat smoke, geolog/core smoke, and uninstall.
5. Only when the signature is valid and every minimum smoke check passes, set:

```text
PUBLIC_CUSTOMER_RC_READY = YES
RC_DELIVERY_READY = YES
```

No other product work is authorized by this continuation.

