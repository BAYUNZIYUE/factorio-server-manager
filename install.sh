#!/bin/bash
# FSM native installer / updater (Linux, no Docker)
REPO="joey00797-cell/factorio-server-manager"
set -u

ask() { # ask "question [Y/n]" default(y/n)
    local a=""
    if [ "${FSM_YES:-0}" = "1" ] || ! { true < /dev/tty; } 2>/dev/null; then
        [ "$2" = "y" ]; return
    fi
    read -r -p "$1 " a < /dev/tty
    case "$a" in y|Y) return 0;; n|N) return 1;; "") [ "$2" = "y" ];; *) return 1;; esac
}

for c in curl; do
    command -v "$c" >/dev/null 2>&1 || { echo "Missing: $c"; exit 1; }
done
command -v unzip >/dev/null 2>&1 || command -v python3 >/dev/null 2>&1 || { echo "Need unzip or python3"; exit 1; }

echo "Checking the latest release..."
INFO=$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest") || { echo "Cannot reach GitHub"; exit 1; }
TAG=$(echo "$INFO" | sed -n 's/.*"tag_name": *"\([^"]*\)".*/\1/p' | head -1)
URL=$(echo "$INFO" | sed -n 's/.*"browser_download_url": *"\([^"]*linux[^"]*\.zip\)".*/\1/p' | head -1)
[ -n "$TAG" ] && [ -n "$URL" ] || { echo "No Linux archive in the latest release ($TAG)."; exit 1; }

DEF="/opt/fsm"; [ "$(id -u)" != "0" ] && DEF="$HOME/fsm"
DIR="${FSM_DIR:-$DEF}"
if [ -z "${FSM_DIR:-}" ] && [ "${FSM_YES:-0}" != "1" ] && { true < /dev/tty; } 2>/dev/null; then
    read -r -p "Install directory [$DIR]: " a < /dev/tty
    DIR="${a:-$DIR}"
fi

CUR=""; [ -f "$DIR/.fsm-version" ] && CUR=$(cat "$DIR/.fsm-version")
UPDATE=0
if [ -f "$DIR/factorio-server-manager" ]; then
    if [ "$CUR" = "$TAG" ]; then
        echo "FSM $TAG is already installed in $DIR."; exit 0
    fi
    echo "Installed: ${CUR:-unknown}, available: $TAG"
    ask "Update now? [Y/n]" y || { echo "Cancelled."; exit 0; }
    UPDATE=1
else
    echo "Latest: $TAG, will install into $DIR"
    ask "Continue? [Y/n]" y || { echo "Cancelled."; exit 0; }
fi

# a running binary cannot be replaced
if [ "$UPDATE" = "1" ]; then
    for p in /proc/[0-9]*; do
        if [ "$(readlink "$p/exe" 2>/dev/null)" = "$DIR/factorio-server-manager" ]; then
            echo "FSM is running from $DIR (pid ${p#/proc/}). Stop it and run this again."; exit 1
        fi
    done
fi

TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
echo "Downloading $URL"
curl -fL --progress-bar -o "$TMP/fsm.zip" "$URL" || { echo "Download failed"; exit 1; }
mkdir -p "$TMP/x"
if command -v unzip >/dev/null 2>&1; then
    unzip -q "$TMP/fsm.zip" -d "$TMP/x" || exit 1
else
    python3 -c "import zipfile,sys; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])" "$TMP/fsm.zip" "$TMP/x" || exit 1
fi
SRC="$TMP/x/factorio-server-manager"
[ -f "$SRC/factorio-server-manager" ] || { echo "Unexpected archive layout"; exit 1; }

mkdir -p "$DIR" || exit 1
if [ "$UPDATE" = "1" ]; then
    cp -a "$DIR/factorio-server-manager" "$DIR/factorio-server-manager.bak"
    rm -rf "$DIR/app"
    cp -a "$SRC/app" "$DIR/app"
    cp -a "$SRC/factorio-server-manager" "$SRC/start.sh" "$DIR/"
else
    cp -a "$SRC/." "$DIR/"
fi
chmod +x "$DIR/factorio-server-manager" "$DIR/start.sh"
echo "$TAG" > "$DIR/.fsm-version"

echo ""
echo "FSM $TAG is ready in $DIR"
echo "Start:  cd $DIR && ./start.sh"
