# LucidLink Python SDK — Models & Exceptions

**Version:** 0.8.10

The `lucidlink` package re-exports every model and exception at the top
level. The authoritative home modules for the dataclasses and enums
documented below are:

- `lucidlink.filespace_models` — `FilespaceInfo`, `DaemonStatus`, `SyncMode`
- `lucidlink.filesystem_models` — `DirEntry`, `FilespaceSize`, `FilespaceStatistics`
- `lucidlink.connect_models` — `S3DataStoreConfig`, `S3Credentials`, `DataStoreCredentials`, `DataStoreInfo`, `DataStoreKind`, `DataStoreRekeyState`, `LinkedFilesResult`
- `lucidlink.storage` — `StorageConfig`, `StorageMode`
- `lucidlink.exceptions` — all exception types

(Connect-specific models are covered in chunk 05; the Connect classes are
listed here only to confirm their import paths.)

---

## Filesystem models

### DirEntry

**Module:** `lucidlink.filesystem_models` (re-exported as `lucidlink.DirEntry`)

Returned by `Filesystem.read_dir()` and `Filesystem.get_entry()`. The 0.8.10
SDK uses `DirEntry` throughout — there is no `FileEntry` class.

```python
DirEntry(
    name: str,
    size: int,
    type: str,              # "file" | "dir" | "link" | "unknown"
    file_id: str,
    file_id_external: int,  # non-zero for Connect-linked files
    ctime: int,             # Unix timestamp
    mtime: int,             # Unix timestamp
)
```

**Predicate methods:**

| Method | Description |
|--------|-------------|
| `is_file() -> bool` | True when `type == "file"` |
| `is_dir() -> bool` | True when `type == "dir"` |
| `is_link() -> bool` | True when `type == "link"` |

Usage:

```python
for entry in filespace.fs.read_dir("/"):
    kind = "dir" if entry.is_dir() else "file"
    external = " (external)" if entry.file_id_external else ""
    print(f"{entry.name} [{kind}] {entry.size} bytes{external}")
```

### FilespaceSize

**Module:** `lucidlink.filesystem_models` (re-exported as
`lucidlink.FilespaceSize`).

Returned by `Filesystem.get_size()`.

```python
FilespaceSize(
    entries: int,              # Metadata entry bytes
    data: int,                 # File data bytes
    storage: int,              # Total storage bytes used
    external_files_size: int,  # Connect-linked data bytes
    external_files_count: int, # Number of Connect-linked files
)
```

```python
size = filespace.fs.get_size()
print(f"Entries: {size.entries}  Data: {size.data}  Storage: {size.storage}")
print(f"External: {size.external_files_count} files / {size.external_files_size} bytes")
```

### FilespaceStatistics

**Module:** `lucidlink.filesystem_models` (re-exported as
`lucidlink.FilespaceStatistics`).

Returned by `Filesystem.get_statistics()`.

```python
FilespaceStatistics(
    file_count: int,
    directory_count: int,
    symlink_count: int,
    entries_size: int,
    data_size: int,
    storage_size: int,
    external_files_size: int,
    external_files_count: int,
)
```

```python
stats = filespace.fs.get_statistics()
print(f"Files: {stats.file_count}, Dirs: {stats.directory_count}, Links: {stats.symlink_count}")
print(f"Data: {stats.data_size} bytes, Storage: {stats.storage_size} bytes")
```

---

## Filespace / daemon models

### FilespaceInfo

**Module:** `lucidlink.filespace_models` (re-exported as
`lucidlink.FilespaceInfo`).

Returned by `Workspace.list_filespaces()`.

```python
FilespaceInfo(
    id: str,       # Unique filespace identifier
    name: str,     # Human-readable name
    created: str,  # ISO-8601 timestamp
)
```

### DaemonStatus

**Module:** `lucidlink.filespace_models` (re-exported as
`lucidlink.DaemonStatus`).

Dataclass representing daemon operational state.

```python
DaemonStatus(
    is_running: bool,
    is_authenticated: bool,
    is_linked: bool,
    root_path: str,
)
```

### SyncMode

**Module:** `lucidlink.filespace_models` (re-exported as
`lucidlink.SyncMode`). A `str`-based `Enum` that controls automatic
syncing when a filespace is unlinked.

| Member | Value | Meaning |
|--------|-------|---------|
| `SyncMode.SYNC_ALL` | `"all"` | Default — call `sync_all()` before `unlink()` |
| `SyncMode.SYNC_NONE` | `"none"` | Caller must call `sync_all()` explicitly |

Pass via `Workspace.link_filespace(..., sync_mode=...)` or as a
`storage_options` key for the fsspec filesystem.

---

## Storage models

### StorageMode

**Module:** `lucidlink.storage` (re-exported as `lucidlink.StorageMode`).
A standard `Enum`.

| Member | Value |
|--------|-------|
| `StorageMode.SANDBOXED` | `"sandboxed"` |
| `StorageMode.PHYSICAL` | `"physical"` |

### StorageConfig

**Module:** `lucidlink.storage` (re-exported as `lucidlink.StorageConfig`).

```python
StorageConfig(
    mode: StorageMode = StorageMode.SANDBOXED,
    persist_on_exit: bool = False,
    root_path: pathlib.Path | None = None,
)
```

**Methods:**

| Method | Description |
|--------|-------------|
| `get_root_path() -> pathlib.Path` | Root directory where daemon writes per-filespace subdirectories |
| `should_cleanup() -> bool` | True when files are removed on daemon stop |

Most users should call `lucidlink.create_daemon(...)` instead of building
`StorageConfig` by hand. See chunk 01 for daemon lifecycle details.

---

## Connect models

The Connect-related classes live in `lucidlink.connect_models` and are
re-exported at the top level:

| Class | Re-exported? | Chunk |
|-------|--------------|-------|
| `S3DataStoreConfig` | yes | 05 |
| `S3Credentials` | yes | 05 |
| `DataStoreCredentials` | yes | 05 (alias of `S3Credentials`) |
| `DataStoreInfo` | yes | 05 |
| `DataStoreKind` | yes | 05 |
| `DataStoreRekeyState` | yes | 05 |
| `LinkedFilesResult` | yes | 05 |

See chunk 05 for field-level documentation and usage examples.

---

## Exception hierarchy

**Module:** `lucidlink.exceptions`

All exceptions are re-exported at the top level and can be caught as
`lucidlink.LucidLinkError` (the common base).

```
LucidLinkError (base — extends Exception)
├── DaemonError           — Raised when daemon operations fail
│                          (e.g. daemon already running, daemon not started,
│                          daemon initialization failed)
├── FilespaceError        — Raised when filespace operations fail
│                          (e.g. filespace not linked, filespace connection failed,
│                          invalid filespace ID)
├── AuthenticationError   — Raised when authentication fails. Most authentication
│                          errors are mapped to Python's PermissionError.
└── ConfigurationError    — Raised when configuration is invalid.
                           Inherits from both LucidLinkError and ValueError
                           for compatibility.
```

### Examples

```python
import lucidlink

# Catch-all
try:
    filespace.fs.read_file("/missing")
except lucidlink.LucidLinkError as exc:
    print(f"SDK error: {exc}")

# Daemon lifecycle
try:
    daemon.start()
except lucidlink.DaemonError as exc:
    print(f"Daemon failed to start: {exc}")

# Authentication
try:
    workspace = daemon.authenticate(creds)
except lucidlink.AuthenticationError as exc:
    print(f"Invalid or expired token: {exc}")

# Configuration — catchable as ValueError too
try:
    daemon = lucidlink.create_daemon(root_path="/bogus/path")
    daemon.start()
except lucidlink.ConfigurationError as exc:
    print(f"Config issue: {exc}")
except ValueError as exc:
    # ConfigurationError also subclasses ValueError
    print(f"Bad value: {exc}")
```

### Mapped Python built-in exceptions

Per the upstream documentation, filesystem operations raise standard Python
exceptions like `FileNotFoundError`, `PermissionError`, etc. — rather than
custom variants. Most authentication errors in particular are mapped to
Python's `PermissionError`.

### Recommended catch pattern

```python
import lucidlink

try:
    daemon = lucidlink.create_daemon()
    daemon.start()
    creds = lucidlink.ServiceAccountCredentials(token="sa_live:...")
    workspace = daemon.authenticate(creds)
    filespace = workspace.link_filespace(name="data")

    with filespace.fs.open("/file.csv", "rb") as f:
        data = f.read()

except lucidlink.AuthenticationError:
    print("Check your service account token")
except lucidlink.ConfigurationError as exc:
    print(f"Configuration issue: {exc}")
except FileNotFoundError:
    print("File does not exist in filespace")
except lucidlink.LucidLinkError as exc:
    print(f"SDK error: {exc}")
finally:
    daemon.stop()
```

