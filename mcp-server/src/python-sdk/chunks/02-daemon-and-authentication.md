# LucidLink Python SDK — Daemon & Authentication

**Version:** 0.8.10

## ServiceAccountCredentials

**Module:** `lucidlink.credentials` (also re-exported as `lucidlink.ServiceAccountCredentials`)

```python
class ServiceAccountCredentials:
    def __init__(self, token: str)
```

### Constructor

- `token` (str): Service account token string.
- **Documented format:** `sa_live:your_key`.

Service account tokens are generated from WebClient or BackOffice and provide programmatic access to LucidLink workspaces and filespaces.

### Example

```python
import lucidlink
creds = lucidlink.ServiceAccountCredentials(token="sa_live:your_key")
workspace = daemon.authenticate(creds)
```

---

## Daemon

**Module:** `lucidlink.daemon` (also re-exported as `lucidlink.Daemon`)

```python
class Daemon:
    def __init__(
        self,
        config: Dict[str, str] | None = None,
        storage: lucidlink.storage.StorageConfig | None = None,
    )
```

For most use cases prefer the convenience factory `lucidlink.create_daemon(...)` covered in chunk 01 — it builds a `StorageConfig` for you from boolean flags.

### Important Constraints

- **Only one daemon per process** — this is a C++ global-state limitation. Attempting to start a second daemon while one is already running raises `DaemonError`.
- Automatic cleanup on `stop()` is driven by the `StorageConfig`.

### Methods

#### `start() -> None`
Start the daemon services. Must be called before `authenticate()` or any filespace linking. Safe to call multiple times — subsequent calls are no-ops.

#### `stop() -> None`
Stop the daemon and cleanup resources. Automatically unlinks any linked filespaces first. Cleanup behavior depends on the `StorageConfig`:

- `StorageMode.SANDBOXED`: always cleans up the temp directory
- `StorageMode.PHYSICAL` with `persist_on_exit=False`: removes the `.lucid/` tree
- `StorageMode.PHYSICAL` with `persist_on_exit=True`: keeps the `.lucid/` tree on disk

Safe to call multiple times.

#### `is_running() -> bool`
Return `True` if the daemon is currently running.

#### `authenticate(credentials: ServiceAccountCredentials) -> Workspace`
Authenticate to LucidLink with a service account token and return a `Workspace` object. Must call `start()` first.

```python
daemon = lucidlink.create_daemon()
daemon.start()
creds = lucidlink.ServiceAccountCredentials(token="sa_live:your_key")
workspace = daemon.authenticate(creds)
# workspace.id, workspace.name are available
```

### Context manager

`Daemon` implements `__enter__` (calls `start()`) and `__exit__` (calls `stop()`):

```python
with lucidlink.create_daemon() as daemon:
    credentials = lucidlink.ServiceAccountCredentials(token="sa_live:your_key")
    workspace = daemon.authenticate(credentials)
    filespace = workspace.link_filespace(name="my-filespace")
    try:
        filespace.fs.write_file("/greeting.txt", b"hello")
    finally:
        filespace.unlink()   # filespace.unlink() calls sync_all() first (SYNC_ALL default)
# daemon.stop() called automatically on exit
```

---

## DaemonStatus

**Module:** `lucidlink.filespace_models`

A dataclass representing daemon operational state.

| Field | Type | Description |
|-------|------|-------------|
| `is_running` | bool | Whether the daemon is currently running |
| `is_authenticated` | bool | Whether the daemon has authenticated to a workspace |
| `is_linked` | bool | Whether the daemon is linked to a filespace |
| `root_path` | str | Root path for daemon operational files |

---

## StorageConfig

**Module:** `lucidlink.storage` (also re-exported as `lucidlink.StorageConfig`)

```python
class StorageConfig:
    def __init__(
        self,
        mode: lucidlink.storage.StorageMode = StorageMode.SANDBOXED,
        persist_on_exit: bool = False,
        root_path: pathlib.Path | None = None,
    )
```

| Parameter | Default | Description |
|-----------|---------|-------------|
| `mode` | `StorageMode.SANDBOXED` | Storage mode (see enum below) |
| `persist_on_exit` | `False` | If `False`, clean up files when daemon stops. Only applies to `PHYSICAL` — `SANDBOXED` always cleans up. |
| `root_path` | `None` | Override root path for the `.lucid/` directory. Only used in `PHYSICAL` mode. `None` uses the current working directory. |

### Methods

- `get_root_path() -> pathlib.Path` — Return the `.lucid` directory path under which the daemon creates per-filespace UUID subdirectories.
- `should_cleanup() -> bool` — Whether cleanup runs on `Daemon.stop()`.

## StorageMode

**Module:** `lucidlink.storage` (also re-exported as `lucidlink.StorageMode`)

```python
class StorageMode(Enum):
    PHYSICAL  = "physical"
    SANDBOXED = "sandboxed"
```

| Value | Description |
|-------|-------------|
| `StorageMode.SANDBOXED` | Temp directory, always cleaned up on stop |
| `StorageMode.PHYSICAL` | `.lucid/` folder under `root_path`, optionally persistent |

### Storage mode examples

```python
# Equivalent ways to get sandboxed + physical daemons:

# 1. Sandboxed via factory
daemon = lucidlink.create_daemon()                         # sandboxed=True

# 2. Physical via factory
daemon = lucidlink.create_daemon(sandboxed=False)          # cleanup on stop

# 3. Physical + persist via factory
daemon = lucidlink.create_daemon(sandboxed=False, persist_files=True)

# 4. Physical + persist + explicit root_path via factory
daemon = lucidlink.create_daemon(
    sandboxed=False, persist_files=True, root_path="/data/lucid"
)

# 5. Explicit StorageConfig via Daemon() directly
from lucidlink import Daemon, StorageConfig, StorageMode
daemon = Daemon(
    storage=StorageConfig(
        mode=StorageMode.PHYSICAL,
        persist_on_exit=True,
        root_path="/data/lucid",
    )
)
```
