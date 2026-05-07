# LucidLink Python SDK — Configuration & Sync Best Practices

**Version:** 0.8.10

## The sync_all() Rule

```{warning}
**You MUST call `filespace.sync_all()` before `filespace.unlink()`** to ensure all write
operations (create, modify, delete) are committed. Without this call, **changes will be lost**
— they will not be propagated to the LucidHub and will not be visible to other clients.

Exception: when the filespace was linked with the default `sync_mode=SyncMode.SYNC_ALL`,
`Filespace.unlink()` (and the context-manager `__exit__`) automatically call `sync_all()`
first. Calling it explicitly is still safe and idiomatic.
```

### Correct Pattern

```python
# CORRECT — sync before unlink
with filespace.fs.open("/data.txt", "wb") as f:
    f.write(b"important data")
filespace.sync_all()   # Required! Ensures changes are committed
filespace.unlink()
```

### Wrong Pattern

```python
# WRONG — changes may be lost!
with filespace.fs.open("/data.txt", "wb") as f:
    f.write(b"important data")
filespace.unlink()     # Missing sync_all() — data may never reach the hub
```

### When sync_all() Is NOT Needed

- **`LucidLinkFileSystem` (fsspec)** handles syncing automatically when `sync_mode=SyncMode.SYNC_ALL` (the default).
- **`Filespace.unlink()`** auto-syncs when the filespace was linked with `sync_mode=SyncMode.SYNC_ALL` (the default).
- **Read-only operations** don't need syncing — if you only used `read_file()`, `read_dir()`, `get_entry()`, etc., no sync is required.

### When to Call sync_all()

| Scenario | When to Sync |
|----------|-------------|
| Batch writes | Once after all writes complete |
| Single file write | After the write, before unlink |
| Mixed read/write | After last write, before unlink |
| Context manager exit | Before exiting the `with` block |
| Before reading back written data | After writes, before reads (if another daemon needs to see them) |

### Batch Writes — Sync Once

```python
# Write all files, sync once at the end (not per-file)
for path, data in items:
    filespace.fs.write_file(path, data)
filespace.sync_all()   # Single sync for entire batch — more efficient
```

---

## Storage Modes

`lucidlink.StorageMode` is an enum with exactly two members: `SANDBOXED` (`'sandboxed'`) and `PHYSICAL` (`'physical'`).

### Sandboxed Mode (Default)

Uses a temporary directory that's automatically cleaned up when the daemon stops. Best for ephemeral workloads, scripts, and CI/CD.

```python
daemon = lucidlink.create_daemon()
# Equivalent to:
# daemon = lucidlink.create_daemon(sandboxed=True)
```

- Temp directory is unique per daemon instance
- Always cleaned up on `daemon.stop()` — no persistent state
- Safe for concurrent test runs

### Physical Mode

Uses a `.lucid/` folder. Choose this when you need cache persistence across daemon restarts.

```python
# Physical mode, cleanup on exit (default behavior)
daemon = lucidlink.create_daemon(sandboxed=False)

# Physical mode, keep files after exit
daemon = lucidlink.create_daemon(sandboxed=False, persist_files=True)

# Physical mode, custom root path
daemon = lucidlink.create_daemon(
    sandboxed=False,
    persist_files=True,
    root_path="/data/lucid"
)
```

### When to Use Which Mode

| Mode | Use Case |
|------|----------|
| Sandboxed (default) | Scripts, CI/CD, serverless, tests |
| Physical, no persist | Long-running services with warm cache during runtime |
| Physical, persist | Repeated runs on same data (cache survives restarts) |
| Physical, custom path | Dedicated fast storage (NVMe, ramdisk) for cache |

### StorageConfig (Advanced)

For fine-grained control, construct a `StorageConfig` and pass it to `Daemon(storage=...)`. (`create_daemon()` does not take a `storage=` kwarg — it always builds its own `StorageConfig` from `sandboxed`, `persist_files`, and `root_path`. Use `Daemon()` directly when you need to pass a pre-built `StorageConfig`.)

```python
from pathlib import Path
import lucidlink
from lucidlink.storage import StorageConfig, StorageMode

config = StorageConfig(
    mode=StorageMode.PHYSICAL,
    persist_on_exit=True,
    root_path=Path("/mnt/nvme/lucidlink"),
)
daemon = lucidlink.Daemon(config={"fs.cache.size": "2048"}, storage=config)
```

`StorageConfig` exposes:

- `get_root_path() -> pathlib.Path` — resolved root path for daemon files
- `should_cleanup() -> bool` — whether `stop()` will clean up on exit

---

## Daemon Configuration

Both `lucidlink.create_daemon()` and `lucidlink.Daemon()` accept an optional
`config: Dict[str, str] | None` parameter (per the upstream API reference).
Specific configuration keys are not enumerated in the upstream docs —
consult the SDK source or your LucidLink support contact for the keys
applicable to your use case.

---

## Context Manager Pattern

The recommended way to manage daemon lifecycle — ensures `stop()` is always called:

```python
import lucidlink

with lucidlink.create_daemon() as daemon:
    credentials = lucidlink.ServiceAccountCredentials(token="sa_live:...")
    workspace = daemon.authenticate(credentials)
    filespace = workspace.link_filespace(name="my-filespace")

    # Work with files
    filespace.fs.write_file("/output.txt", b"data")

    # Always sync and unlink before exiting
    filespace.sync_all()
    filespace.unlink()
# daemon.stop() called automatically
```

### Full Error-Handling Pattern

```python
import lucidlink

daemon = lucidlink.create_daemon()
daemon.start()

try:
    creds = lucidlink.ServiceAccountCredentials(token="sa_live:...")
    workspace = daemon.authenticate(creds)
    filespace = workspace.link_filespace(name="data")

    with filespace.fs.open("/file.csv", "rb") as f:
        data = f.read()

    filespace.sync_all()
    filespace.unlink()

except lucidlink.AuthenticationError:
    print("Check your service account token")
except lucidlink.ConfigurationError as e:
    print(f"Configuration issue: {e}")
except FileNotFoundError:
    print("File does not exist in filespace")
except lucidlink.LucidLinkError as e:
    print(f"SDK error: {e}")
finally:
    daemon.stop()
```

---

## SyncMode on link_filespace()

`Workspace.link_filespace()` accepts a `sync_mode` kwarg that controls the same auto-sync behavior on the low-level `Filespace` API:

```python
from lucidlink import SyncMode

# Opt out of automatic sync-on-unlink for long-running batch writes
with workspace.link_filespace(name="my-fs", sync_mode=SyncMode.SYNC_NONE) as filespace:
    for path, data in items:
        filespace.fs.write_file(path, data)
    filespace.sync_all()  # must sync manually before context exits
```

`SyncMode` values:

| Member | String value | Behavior |
|--------|--------------|----------|
| `SyncMode.SYNC_ALL` | `'all'` | (default) `Filespace.unlink()` / `__exit__` auto-call `sync_all()` |
| `SyncMode.SYNC_NONE` | `'none'` | No auto-sync — caller must call `sync_all()` explicitly |

---

## fsspec Sync Behavior

The fsspec integration (`LucidLinkFileSystem`) manages syncing automatically via the `sync_mode` parameter, which maps to the same `SyncMode` enum:

| SyncMode | Behavior |
|----------|----------|
| `SyncMode.SYNC_ALL` (default) | Auto-sync on every file close |
| `SyncMode.SYNC_NONE` | No auto-sync — call `fs.sync_all()` manually |

```python
import pandas as pd

# Default: auto-sync on close — no manual sync needed
df = pd.read_csv("lucidlink://ws/fs/data.csv", storage_options={"token": "sa_live:..."})
df.to_parquet("lucidlink://ws/fs/output.parquet", storage_options={"token": "sa_live:..."})
# Changes automatically synced

# Opt out for batch operations (sync manually for efficiency)
from lucidlink.fsspec import LucidLinkFileSystem, SyncMode

fs = LucidLinkFileSystem(token="sa_live:...", sync_mode=SyncMode.SYNC_NONE)
for path in paths:
    with fs.open(f"lucidlink://ws/fs/{path}", "wb") as f:
        f.write(data)
fs.sync_all()   # Single sync at the end
fs.close()
```

---

## One Daemon Per Process

Per the upstream `lucidlink.daemon` documentation: *"Only one daemon can be active per process due to C++ global state. Attempting to start a second daemon while one is already running will raise DaemonError."*
