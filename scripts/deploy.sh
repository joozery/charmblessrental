#!/usr/bin/env bash
# Deploys the committed HEAD to the Hostinger VPS: npm run deploy
# Builds on this machine (the VPS has 1 CPU and no swap, shared with other sites), uploads a new
# release, switches /var/www/charmblessrental to it and restarts PM2. If the new release does not
# answer, it switches back to the previous one.
# Server-side env lives in /var/www/charmblessrental-shared/.env.production.local, not in the repo.
set -euo pipefail

HOST="${DEPLOY_HOST:-root@187.127.125.120}"
APP=/var/www/charmblessrental
RELEASES=/var/www/charmblessrental-releases
SHARED=/var/www/charmblessrental-shared
PORT=3010
KEEP=3

cd "$(dirname "$0")/.."
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo "มีไฟล์ที่แก้แต่ยังไม่ commit — deploy ใช้เฉพาะโค้ดที่ commit แล้ว (HEAD)" >&2
  read -r -p "deploy ต่อเลยไหม? [y/N] " answer
  [ "$answer" = "y" ] || exit 1
fi
[ -f .env.local ] || { echo "ไม่พบ .env.local (ใช้ตอน build)" >&2; exit 1; }

SHA=$(git rev-parse --short HEAD)
RELEASE="$(date -u +%Y%m%d%H%M%S)-$SHA"
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

echo "▸ build $SHA ($(git log -1 --format=%s))"
mkdir "$WORK/app"
git archive HEAD | tar -x -C "$WORK/app"
cp .env.local "$WORK/app/.env.local"
(cd "$WORK/app" && npm ci --no-audit --no-fund --loglevel=error && npx next build) > "$WORK/build.log" 2>&1 || { tail -40 "$WORK/build.log"; echo "build ไม่ผ่าน" >&2; exit 1; }
rm "$WORK/app/.env.local"

echo "▸ upload $RELEASE"
# Only the top-level node_modules is left out: .next/node_modules holds links the server needs,
# and macOS tar's --exclude would drop it too, so move the folders aside instead.
mv "$WORK/app/node_modules" "$WORK/app/.next/cache" "$WORK/"
COPYFILE_DISABLE=1 tar -C "$WORK/app" -czf "$WORK/release.tgz" .
scp -q "$WORK/release.tgz" "$HOST:/tmp/$RELEASE.tgz"

echo "▸ install & switch"
ssh "$HOST" bash -s -- "$APP" "$RELEASES" "$SHARED" "$RELEASE" "$PORT" "$KEEP" <<'REMOTE'
set -euo pipefail
APP=$1 RELEASES=$2 SHARED=$3 RELEASE=$4 PORT=$5 KEEP=$6
mkdir -p "$RELEASES" "$SHARED"

# First run: the app was a plain folder; keep it as the first release.
if [ -d "$APP" ] && [ ! -L "$APP" ]; then
  [ -f "$SHARED/.env.production.local" ] || cp "$APP/.env.production.local" "$SHARED/.env.production.local"
  mv "$APP" "$RELEASES/initial"
  ln -sfn "$SHARED/.env.production.local" "$RELEASES/initial/.env.production.local"
  ln -sfn "$RELEASES/initial" "$APP"
fi

DIR="$RELEASES/$RELEASE"
mkdir "$DIR"
tar --warning=no-unknown-keyword --no-same-owner -xzf "/tmp/$RELEASE.tgz" -C "$DIR"
rm "/tmp/$RELEASE.tgz"
ln -sfn "$SHARED/.env.production.local" "$DIR/.env.production.local"
(cd "$DIR" && npm ci --no-audit --no-fund --loglevel=error)

PREVIOUS=$(readlink "$APP" || true)
switch() { ln -sfn "$1" "$APP.next" && mv -T "$APP.next" "$APP"; }
switch "$DIR"
if pm2 describe charmblessrental >/dev/null 2>&1; then pm2 restart charmblessrental --update-env >/dev/null
else (cd "$APP" && pm2 start npm --name charmblessrental -- start -- -p "$PORT" -H 127.0.0.1 >/dev/null); fi

ok=""
for _ in $(seq 1 20); do
  sleep 2
  [ "$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/")" = "200" ] && { ok=1; break; }
done
if [ -z "$ok" ]; then
  echo "เวอร์ชันใหม่ไม่ตอบ — ย้อนกลับไป $(basename "$PREVIOUS")" >&2
  pm2 logs charmblessrental --lines 30 --nostream >&2 || true
  [ -n "$PREVIOUS" ] && switch "$PREVIOUS" && pm2 restart charmblessrental >/dev/null
  exit 1
fi
pm2 save >/dev/null

# Keep the newest few releases for rollback.
ls -1dt "$RELEASES"/*/ | tail -n +$((KEEP + 1)) | while read -r old; do
  [ "${old%/}" = "$(readlink "$APP")" ] || rm -rf "$old"
done
REMOTE

echo "▸ check https://charmblessrental.com"
code=$(curl -s -o /dev/null -m 30 -w '%{http_code}' https://charmblessrental.com/)
[ "$code" = "200" ] && echo "✓ deploy $SHA เรียบร้อย" || { echo "หน้าเว็บตอบ $code" >&2; exit 1; }
