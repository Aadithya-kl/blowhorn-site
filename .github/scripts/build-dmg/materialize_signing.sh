#!/usr/bin/env bash
# Write environment signing secrets into RUNNER_TEMP files. Never prints a
# secret. Exits 2 when the environment is not configured yet (expected until
# the #2759 rotation stores new values here).
set +x
set -euo pipefail
# Disable GitHub Actions command echoing for this step if the runner honors it.
echo "::add-mask::${DEVELOPER_ID_P12_PASSPHRASE:-}"
echo "::add-mask::${APPLE_API_KEY_ID:-}"
echo "::add-mask::${APPLE_TEAM_ID:-}"
echo "::add-mask::${APPLE_API_ISSUER:-}"

die_unconfigured() {
  echo "macos-dmg-signing secrets are not configured yet. New values land here after the #2759 rotation; this job does not load the keys that are in the private repository."
  exit 2
}

: "${RUNNER_TEMP:?}"
for name in DEVELOPER_ID_P12 DEVELOPER_ID_P12_PASSPHRASE APPLE_API_KEY APPLE_TEAM_ID APPLE_API_KEY_ID APPLE_API_ISSUER; do
  eval "value=\${$name-}"
  if [[ -z "$value" ]]; then
    die_unconfigured
  fi
done

dir="$RUNNER_TEMP/blowhorn-signing"
mkdir -p -m 700 "$dir"
# p12 is stored base64-encoded. Decode without printing.
python3 - <<'PY'
import base64, os, sys
raw = os.environ["DEVELOPER_ID_P12"].encode("ascii")
try:
    data = base64.b64decode(raw, validate=True)
except Exception:
    sys.stderr.write("macos-dmg-signing: DEVELOPER_ID_P12 is not valid base64\n")
    sys.exit(1)
if not data:
    sys.stderr.write("macos-dmg-signing secrets are not configured yet.\n")
    sys.exit(2)
path = os.path.join(os.environ["RUNNER_TEMP"], "blowhorn-signing", "developer-id.p12")
with open(path, "wb") as handle:
    handle.write(data)
os.chmod(path, 0o600)
PY

printf '%s' "$DEVELOPER_ID_P12_PASSPHRASE" >"$dir/p12-passphrase"
chmod 600 "$dir/p12-passphrase"
printf '%s' "$APPLE_API_KEY" >"$dir/api-key.p8"
chmod 600 "$dir/api-key.p8"

env_sh="$dir/env.sh"
github_vars="$dir/github.env"
cat >"$github_vars" <<ENV
SIGNING_DIR=$dir
SIGNING_P12=$dir/developer-id.p12
SIGNING_PASSPHRASE_FILE=$dir/p12-passphrase
SIGNING_P8=$dir/api-key.p8
SIGNING_KEYCHAIN=$dir/ci-signing.keychain-db
SIGNING_KEYCHAIN_PASSWORD_FILE=$dir/keychain.pass
APPLE_API_KEY=$dir/api-key.p8
ENV
chmod 600 "$github_vars"
sed 's/^/export /' "$github_vars" >"$env_sh"
chmod 600 "$env_sh"
# GITHUB_ENV applies to later steps; the current step sources env.sh.
if [[ -n "${GITHUB_ENV:-}" ]]; then
  cat "$github_vars" >>"$GITHUB_ENV"
fi
echo "signing material: written to a temporary directory"
