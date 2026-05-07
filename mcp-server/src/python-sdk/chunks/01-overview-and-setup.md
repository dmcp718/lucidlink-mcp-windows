# LucidLink Python SDK — Overview & Setup

## What is the LucidLink Python SDK?

The LucidLink Python SDK is a Python binding to the LucidLink Core C++ daemon library. It provides programmatic access to LucidLink filespaces from Python, enabling:

- Streaming file I/O with standard Python `io` interfaces (works with Pandas, PyTorch, LangChain, etc.)
- Exhaustive filesystem operations (directory listing, metadata, move/rename, truncate, byte-range locks)
- Management of external S3-backed data stores via LucidLink Connect
- fsspec filesystem integration (`lucidlink://` URL scheme) for ecosystem compatibility

**Version:** 0.8.10
**Platforms:** macOS (universal2), Linux (manylinux_2_28 x86_64)
**Python:** 3.10–3.14

**Upstream sources distilled into this server:**
- Official docs: https://lucidlink.github.io/lucidlink-python-sdk-examples/
- Examples repo: https://github.com/LucidLink/lucidlink-python-sdk-examples
- PyPI: https://pypi.org/project/lucidlink/

## Installation

```bash
pip install lucidlink
```

Optional extra used in the upstream examples:

```bash
pip install lucidlink[fsspec]   # adds fsspec (for LucidLinkFileSystem / lucidlink:// URLs)
```

### Prerequisites

- Python 3.10 or later
- A LucidLink filespace and a [service account token](https://support.lucidlink.com/hc/en-us/articles/40222074543757-Getting-Started-with-Service-Accounts-API-Authentication) (format: `sa_live:your_key`)

## Basic Usage Pattern

```python
import lucidlink

# 1. Create and start daemon
daemon = lucidlink.create_daemon()
daemon.start()

# 2. Authenticate with service account
credentials = lucidlink.ServiceAccountCredentials(token="sa_live:your_key")
workspace = daemon.authenticate(credentials)

# 3. Link to a filespace (by name or id)
filespace = workspace.link_filespace(name="production-data")

# 4. List root directory — read_dir returns DirEntry objects
for entry in filespace.fs.read_dir("/"):
    kind = "dir" if entry.is_dir() else "file"
    print(f"{entry.name} ({kind}, {entry.size} bytes)")

# 5. Write a file
with filespace.fs.open("/example.txt", "wb") as f:
    f.write(b"Hello from LucidLink!")

# 6. Read a file
with filespace.fs.open("/example.txt", "rb") as f:
    print(f.read())

# 7. Cleanup — unlink flushes pending changes (SYNC_ALL is the default sync_mode)
filespace.unlink()
daemon.stop()
```

## Context Manager Pattern

Both `Daemon` and `Filespace` are context managers. `Filespace.__exit__` calls `sync_all()` then `unlink()` automatically when `sync_mode=SyncMode.SYNC_ALL` (the default).

```python
import lucidlink

with lucidlink.create_daemon() as daemon:
    credentials = lucidlink.ServiceAccountCredentials(token="sa_live:your_key")
    workspace = daemon.authenticate(credentials)

    with workspace.link_filespace(name="my-filespace") as filespace:
        filespace.fs.write_file("/output.txt", b"data")
        # Changes are flushed to the hub on __exit__ (SYNC_ALL).
    # filespace is unlinked here
# daemon.stop() is called automatically on exit
```

## Two Ways to Build a Daemon

The SDK exposes **both** a direct constructor and a convenience factory. They coexist — either is valid.

### `lucidlink.create_daemon(...)` — recommended factory

```python
FN lucidlink.create_daemon(
    config: Dict[str, str] | None = None,
    sandboxed: bool = True,
    persist_files: bool = False,
    root_path: str | pathlib.Path | None = None,
) -> lucidlink.daemon.Daemon
```

Exposed directly on the top-level `lucidlink` package (no submodule import needed). Builds a `StorageConfig` internally from the boolean flags.

```python
# Sandboxed mode (default) — temp directory, auto-cleanup on stop()
daemon = lucidlink.create_daemon()

# Physical mode — cleaned up on stop() unless persist_files=True
daemon = lucidlink.create_daemon(sandboxed=False)

# Physical, persist files after stop()
daemon = lucidlink.create_daemon(sandboxed=False, persist_files=True)

# Physical, custom root path
daemon = lucidlink.create_daemon(
    sandboxed=False,
    persist_files=True,
    root_path="/data/lucid",
)
```

### `lucidlink.Daemon(...)` — direct constructor

```python
class Daemon:
    def __init__(
        self,
        config: Dict[str, str] | None = None,
        storage: lucidlink.storage.StorageConfig | None = None,
    )
```

Use this when you want to pass an explicit `StorageConfig` (e.g. when `mode`, `persist_on_exit`, and `root_path` come from a config file you are already building).

```python
from lucidlink import Daemon, StorageConfig, StorageMode

daemon = Daemon(
    storage=StorageConfig(
        mode=StorageMode.PHYSICAL,
        persist_on_exit=True,
        root_path="/data/lucid",
    )
)
```

## Public API Surface

Documented in the upstream API reference, organized by module:

- **`lucidlink.daemon`:** `Daemon`, `create_daemon`
- **`lucidlink.credentials`:** `ServiceAccountCredentials`
- **`lucidlink.workspace`:** `Workspace`
- **`lucidlink.filespace`:** `Filespace`
- **`lucidlink.filesystem`:** `Filesystem`
- **`lucidlink.stream`:** `LucidFileStream`, `open_buffered`, `open_text`
- **`lucidlink.storage`:** `StorageConfig`, `StorageMode`
- **`lucidlink.connect`:** `ConnectManager`
- **`lucidlink.connect_models`:** `S3DataStoreConfig`, `S3Credentials`, `DataStoreCredentials`, `DataStoreInfo`, `DataStoreKind`, `DataStoreRekeyState`, `LinkedFilesResult`
- **`lucidlink.filespace_models`:** `FilespaceInfo`, `SyncMode`, `DaemonStatus`
- **`lucidlink.filesystem_models`:** `DirEntry`, `FilespaceSize`, `FilespaceStatistics`
- **`lucidlink.fsspec`:** `LucidLinkFileSystem`
- **`lucidlink.exceptions`:** `LucidLinkError`, `DaemonError`, `FilespaceError`, `AuthenticationError`, `ConfigurationError`
