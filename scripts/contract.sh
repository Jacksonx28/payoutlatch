#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
if [ -d .tooling/cargo ]; then
  export CARGO_HOME="$PWD/.tooling/cargo"
  export RUSTUP_HOME="$PWD/.tooling/rustup"
  export PATH="$CARGO_HOME/bin:$PATH"
fi
case "${1:-test}" in
  test) cargo test --manifest-path contract/Cargo.toml --locked ;;
  build) node_modules/.bin/cargo-near near build non-reproducible-wasm --manifest-path contract/Cargo.toml --no-abi --locked --out-dir artifacts ;;
  *) echo 'Usage: sh scripts/contract.sh test|build' >&2; exit 1 ;;
esac
