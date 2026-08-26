param([string]$TargetDir = "apps/desktop/resources")
$ErrorActionPreference = "Stop"
$manifest = "vendor/codex/codex-rs/Cargo.toml"
if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) {
  throw "cargo is required to build the pinned Codex App Server sidecar. Install Rust in the build environment, not on end-user machines."
}
New-Item -ItemType Directory -Force $TargetDir | Out-Null
cargo build --manifest-path $manifest --bin codex --release
$binary = if ($env:OS -eq "Windows_NT") { "vendor/codex/codex-rs/target/release/codex.exe" } else { "vendor/codex/codex-rs/target/release/codex" }
Copy-Item -LiteralPath $binary -Destination (Join-Path $TargetDir (Split-Path $binary -Leaf)) -Force
Write-Host "Built pinned App Server sidecar from upstream commit 25a6e31"
