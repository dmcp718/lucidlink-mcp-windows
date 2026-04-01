# LucidLink Python SDK — Overview & Setup

## What is the LucidLink Python SDK?

The LucidLink Python SDK is a comprehensive Python binding to the LucidLink Core C++ daemon library. It provides programmatic access to LucidLink filespaces from Python, enabling:

- Streaming file I/O with standard Python `io` interfaces
- Data science integrations (Pandas, PyTorch, TensorFlow, Dask)
- Management of external S3-based data stores (Connect)
- fsspec filesystem integration for ecosystem compatibility

**Version:** 0.1.0
**License:** Proprietary (Copyright © 2025 LucidLink)
**Platforms:** macOS (universal2), Linux (manylinux_2_28 x86_64)
**Python:** 3.10–3.14

## Installation

Pre-built wheels are available:

```bash
# macOS
pip install macOS/dist/lucidlink-0.1.0-cp312-cp312-macosx_12_0_universal2.whl

# Linux (Debian/Ubuntu)
pip install linux_debian/dist/lucidlink-0.1.0-cp312-cp312-manylinux_2_28_x86_64.whl
```

## Basic Usage Pattern

```python
import lucidlink

# 1. Create and start daemon
daemon = lucidlink.create_daemon(sandboxed=True)
daemon.start()

try:
    # 2. Authenticate with service account
    credentials = lucidlink.ServiceAccountCredentials(token="sa_live:token:secret")
    workspace = daemon.authenticate(credentials)

    # 3. Link to a filespace
    filespace = workspace.link_filespace(name="my-filespace")

    # 4. Use streaming file operations
    with filespace.open("/data/file.csv", "rb") as f:
        data = f.read()

    # 5. Sync changes
    filespace.sync_all()

finally:
    daemon.stop()
```

## Context Manager Pattern

```python
import lucidlink

with lucidlink.Daemon() as daemon:
    daemon.start()
    creds = lucidlink.ServiceAccountCredentials(token="sa_live:...")
    workspace = daemon.authenticate(creds)
    filespace = workspace.link_filespace(name="production-data")

    with filespace.open("/report.txt", "wt", encoding="utf-8") as f:
        f.write("Hello from Python SDK!")
    filespace.sync_all()
# daemon.stop() called automatically
```

## Factory Function

```python
lucidlink.create_daemon(
    config=None,          # Optional dict of config keys
    sandboxed=True,       # Use temp directory (True) or .lucid/ folder (False)
    persist_files=False,  # Keep files after stop (physical mode only)
    root_path=None        # Custom root path (physical mode only)
) -> Daemon
```

## Public API Exports

From `lucidlink` package:

- **Core:** `Daemon`, `Workspace`, `Filespace`, `FileSystem`, `FileHandle`
- **Auth:** `ServiceAccountCredentials`
- **Streaming:** `LucidFileStream`, `open_buffered()`, `open_text()`
- **Storage:** `StorageConfig`, `StorageMode`
- **Connect:** `ConnectManager`, `S3DataStoreConfig`, `DataStoreInfo`, `LinkedFilesResult`
- **fsspec:** `LucidLinkFileSystem`, `SyncMode`
- **Exceptions:** `LucidLinkError`, `DaemonError`, `FilespaceError`, `AuthenticationError`, `ConfigurationError`
- **Models:** `FileEntry`, `FilespaceSize`, `FilespaceStatistics`
- **Factory:** `create_daemon()`
