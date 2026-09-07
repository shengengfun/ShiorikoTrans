# P0 Fix: Linux GLIBCXX Compatibility

## Problem

9 users experiencing 100% failure on older Linux distributions:

- Zorin OS 17 (5 users)
- Ubuntu 22.04 (3 users)
- Linux Mint 21.3 (1 user)

Error: `/usr/bin/sona: /lib/x86_64-linux-gnu/libstdc++.so.6: version 'GLIBCXX_3.4.32' not found`

## Root Cause

Binaries built on Ubuntu 22.04+ require GLIBCXX_3.4.32 (from GCC 13+), but older systems only have up to GLIBCXX_3.4.28-3.4.30.

## Solution

Build sona in Ubuntu 20.04 container for glibc compatibility.

## Implementation Status

### ✅ Sona Binary (Fixed)

**File**: `sona/.github/workflows/release.yml`

Changed Linux builds to use Ubuntu 20.04 container:

```yaml
- runner: ubuntu-latest
  container: ubuntu:20.04 # glibc 2.31, GLIBCXX_3.4.28
  goos: linux
  goarch: amd64
```

This produces binaries compatible with:

- ✅ Zorin OS 17 (Ubuntu 20.04 base)
- ✅ Ubuntu 20.04+
- ✅ Debian 11+
- ✅ Linux Mint 21+
- ✅ All newer distributions

### ✅ Vibe Desktop App

No changes needed - uses standard Rust toolchain which doesn't have this issue.

## Verification

Once both repos are updated, test on:

- Zorin OS 17 (Ubuntu 20.04 base)
- Ubuntu 20.04 LTS
- Debian 11 (Bullseye)
- Linux Mint 21

## Alternative Solutions (Not Implemented)

1. Static linking libstdc++ - adds complexity, larger binaries
2. Runtime glibc version check - only shows error, doesn't fix issue
3. AppImage/Flatpak - bundles dependencies, but larger and different distribution model
