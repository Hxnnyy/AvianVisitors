# Journal and original-media recovery

A database-only backup does not recover photographs or recordings. Keep a dated snapshot containing both, on an encrypted disk outside this machine; keep secrets separately in the password manager. Snapshots contain private family media. Do not commit them.

## Portable snapshot tooling

scripts/birthday/recovery.py uses Python's standard library. It copies a SQLite database using SQLite's online backup API, copies a complete exported media directory preserving object-key subdirectories, records SHA-256 for every file, then checks database integrity and foreign keys. Restore refuses an existing destination and verifies every checksum before copying.

```powershell
python scripts/birthday/recovery.py backup --database work/export/journal.sqlite --media work/export/media --destination work/backups/2026-10-26
python scripts/birthday/recovery.py verify work/backups/2026-10-26
python scripts/birthday/recovery.py restore work/backups/2026-10-26 --destination work/restored-2026-10-26
python -m unittest discover -s scripts/birthday -p test_recovery.py
```

Stop uploads, processing, confirmations and deletes during the export/copy window so database rows and objects represent the same instant. SQLite's backup protects the database copy, but does not make the media directory transactional. The verifier reconciles every capture ID to media/originals/{id}; a snapshot missing a referenced original is rejected. Metadata such as object HTTP headers is represented by the capture media_type in D1; restore bucket headers accordingly. Include frame images too when copying the full bucket; these may be regenerated but originals cannot.

## Hosted export and fresh-resource restore

The personal Cloudflare account has been selected; its OAuth consent and paid-plan activation remain user actions. scripts/birthday/cloud-recovery.py implements the export/import path now. It uses the explicitly named personal profile and account, strips inherited API-token/key/email environment credentials, and passes --profile to every cf/Wrangler command. Wrangler's inspected CLI supports that profile directly. No S3 credentials or public bucket are needed.

The default invocation prints a plan and makes no API requests:

```powershell
python scripts/birthday/cloud-recovery.py backup --account-id PERSONAL_ACCOUNT --database-id SOURCE_D1_ID --bucket SOURCE_PRIVATE_BUCKET --profile avian-personal --snapshot .wrangler/backups/dated-snapshot
python scripts/birthday/cloud-recovery.py restore --account-id PERSONAL_ACCOUNT --database-id NEW_EMPTY_D1_ID --bucket NEW_EMPTY_PRIVATE_BUCKET --profile avian-personal --snapshot .wrangler/backups/dated-snapshot
```

After personal access is authorised, stop application mutations and add --execute --writes-stopped to run. Backups use the repository's pinned Wrangler d1 export --remote, rebuild a local SQLite database, derive exact original object keys/media types and current frame PNG from D1, download those referenced objects using cf r2 objects get, and seal an inventory/checksummed snapshot. Existing destinations are refused. The SQLite export and all original objects must succeed before accepting the snapshot.

Restore verifies the snapshot before contacting Cloudflare, rejects the original database or bucket as targets, and checks that the new D1 has no application tables and the new bucket has no objects. It uploads and downloads each referenced object to compare bytes, imports the SQL using Wrangler d1 execute --remote --file, then checks capture IDs/media types and species/capture/sighting/frame row counts. It never switches Worker bindings, creates a public bucket, or alters the original resources. A partial failure leaves isolated target resources for inspection; do not reuse them without explicitly emptying/recreating them.

The underlying cf schemas and command help were inspected: d1 query POST /accounts/{account}/d1/database/{id}/query; r2 objects get/put GET/PUT /accounts/{account}/r2/buckets/{bucket}/objects/{key}; r2 objects list with --per-page 1. The executable mock checks assert exact arguments/profile/account binding and removal of inherited work tokens. Four offline tests cover these commands plus real SQLite schema/sighting/original recovery and refusal of original or nonempty targets.

Two authenticated compatibility checks remain before claiming cloud recovery: verify the current cf JSON envelopes and binary object stdout, and prove its handling of slash-containing keys. The current CLI dry-run percent-encodes originals/id as originals%2Fid although its help says slashes must remain literal. This concrete discrepancy is untested against the live API. Do not treat mocked command success as Cloudflare restore evidence. Once authorised, exercise a new temporary D1/private R2 pair, read restored sightings and original evidence through an isolated Worker, and only then consider switching live bindings.

The portable tool cannot read Miniflare's internal R2 SQLite/blob format directly; do not aim it at .wrangler wholesale. Exported snapshots contain private originals and require encrypted storage.

## Routine and incident procedure

Back up before each release/schema change and weekly while in use. Keep at least the latest three good dated snapshots plus one off-machine copy. Verify immediately after copying, and periodically restore to an isolated directory. The proposed weekly schedule means up to one week's new sightings/media could be lost; increase frequency if that is unacceptable.

On failure, retain the live state and logs, stop writes, verify the newest snapshot, restore into isolated resources and validate row counts, evidence playback, collection and frame. Only then switch bindings. Rotate device/service credentials if exposed. A forgotten phone sign-in can be recovered through Access email PIN; do not relax the two-user allowlist. If the Pi loses network, its last good image remains; see the device setup guide for its restart and acknowledgement behaviour.


