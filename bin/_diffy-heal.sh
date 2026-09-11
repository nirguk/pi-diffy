#!/bin/sh
# _diffy-heal.sh — shared self-heal for diffy's vendored dependencies.
#
# Sourced (not executed directly) by the diffy renderers when they detect a
# missing dependency. Auto-heals unless the caller opts out with HEAL=0 (or
# DIFFY_HEAL=0). Prints exactly what it does to stderr; returns zero on
# success or when the dependency is already satisfied, non-zero otherwise.
#
# Functions:
#   _diffy_need_delta    -> ensure .pi/scripts/diffbin/delta exists, download if not
#   _diffy_need_deps     -> ensure .pi/scripts/diffdeps/node_modules is populated
#
# Both respect $SCRIPT_DIR (set by the sourcing script) to locate the tree.

# Whether auto-heal is enabled. Opt out with HEAL=0 or DIFFY_HEAL=0.
_diffy_heal_enabled() {
    [ "${DIFFY_HEAL:-1}" = "0" ] && return 1
    [ "${HEAL:-1}" = "0" ] && return 1
    return 0
}

_diffy_delta_version="0.19.2"
_diffy_delta_sha256="8e695c5f586a8c53d6c3b01be0b4a422ed218bfed2a56191caebe373a1c18ab2"

# Ensure the vendored delta binary exists and is executable.
# Returns 0 if present/installed, 1 if unusable.
diffy_need_delta() {
    VENDORED="$SCRIPT_DIR/diffbin/delta"
    if [ -x "$VENDORED" ]; then
        return 0
    fi

    if ! _diffy_heal_enabled; then
        echo "error: git-delta is missing at $VENDORED (auto-heal disabled)" >&2
        echo "      run: diffy --heal (or set DIFFY_HEAL=1) to install it" >&2
        return 1
    fi

    echo "healing: git-delta missing — downloading delta $_diffy_delta_version..." >&2
    TMP="$(mktemp -d)"
    URL="https://github.com/dandavison/delta/releases/download/$_diffy_delta_version/delta-$_diffy_delta_version-x86_64-unknown-linux-gnu.tar.gz"
    TARBALL="$TMP/delta.tar.gz"

    if ! command -v curl >/dev/null 2>&1 && ! command -v wget >/dev/null 2>&1; then
        echo "error: need curl or wget to download git-delta" >&2
        rm -rf "$TMP"
        return 1
    fi

    if command -v curl >/dev/null 2>&1; then
        curl -fSL --silent --show-error -o "$TARBALL" "$URL" || { echo "error: download failed" >&2; rm -rf "$TMP"; return 1; }
    else
        wget -O "$TARBALL" "$URL" || { echo "error: download failed" >&2; rm -rf "$TMP"; return 1; }
    fi

    # verify sha256
    if command -v sha256sum >/dev/null 2>&1; then
        actual=$(sha256sum "$TARBALL" | awk '{print $1}')
        if [ "$actual" != "$_diffy_delta_sha256" ]; then
            echo "error: delta checksum mismatch (got $actual, want $_diffy_delta_sha256)" >&2
            rm -rf "$TMP"
            return 1
        fi
    fi

    # extract delta binary from tarball (top-level dir delta-*x/delta)
    mkdir -p "$SCRIPT_DIR/diffbin"
    if ! tar -xzf "$TARBALL" -C "$TMP" ; then
        echo "error: could not extract git-delta tarball" >&2
        rm -rf "$TMP"
        return 1
    fi
    # find the delta binary inside (portable: any regular file literally named delta)
    FOUND="$(find "$TMP" -type f -name delta 2>/dev/null | head -1)"
    if [ -z "$FOUND" ]; then
        echo "error: delta binary not found inside tarball" >&2
        rm -rf "$TMP"
        return 1
    fi
    cp "$FOUND" "$VENDORED"
    chmod +x "$VENDORED"
    rm -rf "$TMP"
    echo "healed: delta $_diffy_delta_version -> $VENDORED" >&2
    return 0
}

# Ensure node deps (diffdeps/node_modules) are present.
diffy_need_deps() {
    DEPS_DIR="$SCRIPT_DIR/diffdeps"
    if [ -d "$DEPS_DIR/node_modules" ]; then
        return 0
    fi

    if ! _diffy_heal_enabled; then
        echo "error: html dependencies missing at $DEPS_DIR/node_modules (auto-heal disabled)" >&2
        echo "      run: (cd $DEPS_DIR && npm install)" >&2
        return 1
    fi

    if ! command -v npm >/dev/null 2>&1; then
        echo "error: npm not found; cannot install html deps" >&2
        return 1
    fi

    echo "healing html dependencies via npm install..." >&2
    ( cd "$DEPS_DIR" && npm install --no-audit --no-fund ) || {
        echo "error: npm install failed" >&2
        return 1
    }
    echo "healed: $DEPS_DIR/node_modules" >&2
    return 0
}
# --- Direct-invocation mode: `bash _diffy-heal.sh --ensure` ---
# Used by the package postinstall so the repo stays lean (deps gitignored)
# but a fresh install populates them. Exits 0 if all present, 1 if any fail.
if [ "${1:-}" = "--ensure" ]; then
    set -e
    # Determine SCRIPT_DIR when run directly (not sourced).
    SCRIPT_DIR="${SCRIPT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)}"
    echo "pi-diffy: ensuring runtime dependencies..."
    diffy_need_delta
    diffy_need_deps
    echo "pi-diffy: dependencies ready."
    exit 0
fi
