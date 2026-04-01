# LucidLink Python SDK — Daemon & Authentication

## ServiceAccountCredentials

**Module:** `lucidlink.credentials`

```python
class ServiceAccountCredentials:
    def __init__(self, token: str)
```

### Constructor

- `token` (str): Service account token string
- **Valid prefixes:** `lucid_sa:`, `sa_live:`, `sa_dev:`, `sa_staging:`, `sa_local:`
- Raises `ConfigurationError` if token format is invalid

### Properties

- `token` (str): The validated token string

### Example

```python
creds = lucidlink.ServiceAccountCredentials(token="sa_live:mytoken:mysecret")
```

### Getting a Token

1. Log in to LucidLink WebClient
2. Navigate to Settings → API Access
3. Create a new service account
4. Copy the token (format: `sa_live:token:secret`)

---

## Daemon

**Module:** `lucidlink.daemon`

```python
class Daemon:
    def __init__(self, config: Optional[Dict[str, str]] = None,
                 storage: Optional[StorageConfig] = None)
```

### Important Constraints

- **Only one daemon per process** — C++ global state limitation
- Thread-safe singleton tracking with automatic enforcement via locks
- Automatic cleanup on stop based on storage configuration

### Configuration Keys

| Key | Description | Default |
|-----|-------------|---------|
| `fs.cache.location` | Cache directory path | Auto |
| `fs.cache.size` | Cache size in MB (string) | Auto |
| `webservice.url` | WebService URL | `https://api.lucidlink.com/api/v2` |
| `network.timeout` | Network timeout | Default |

**Environment Variable:** `LUCIDLINK_WEBSERVICE_URL` overrides `webservice.url`

### Methods

#### `start() -> None`
Start the daemon. Safe to call multiple times (idempotent).

#### `stop() -> None`
Stop the daemon and cleanup resources. Cleanup behavior depends on storage config:
- SANDBOXED: Always removes temp directory
- PHYSICAL + persist=False: Removes .lucid/ directory
- PHYSICAL + persist=True: Keeps .lucid/ directory

#### `is_running() -> bool`
Check if the daemon is currently running.

#### `get_status() -> Dict`
Get daemon runtime status information (connection state, cache usage, etc.).

```python
status = daemon.get_status()
print(status)
```

#### `authenticate(credentials: ServiceAccountCredentials) -> Workspace`
Authenticate with LucidLink service and return a Workspace object.

```python
daemon = lucidlink.create_daemon(sandboxed=True)
daemon.start()
creds = lucidlink.ServiceAccountCredentials(token="sa_live:...")
workspace = daemon.authenticate(creds)
# workspace.name, workspace.id available
```

### Context Manager

```python
with Daemon(config={"fs.cache.size": "1024"}) as daemon:
    daemon.start()
    workspace = daemon.authenticate(creds)
    # ...
# daemon.stop() called automatically on exit
```

---

## StorageConfig

**Module:** `lucidlink.storage`

```python
class StorageConfig:
    mode: StorageMode
    persist_on_exit: bool
    root_path: Optional[Path]
```

### StorageMode Enum

| Value | Description |
|-------|-------------|
| `StorageMode.SANDBOXED` | Temp directory, always cleaned up on stop |
| `StorageMode.PHYSICAL` | `.lucid/` folder, optionally persistent |

### Methods

- `get_root_path() -> Path` — Get the .lucid directory path
- `should_cleanup() -> bool` — Whether cleanup happens on stop

### Storage Mode Examples

```python
# Sandboxed (default) — temp directory, auto-cleanup
daemon = lucidlink.create_daemon(sandboxed=True)

# Physical, cleanup on exit
daemon = lucidlink.create_daemon(sandboxed=False)

# Physical, persist files after exit
daemon = lucidlink.create_daemon(sandboxed=False, persist_files=True)

# Physical, custom root path
daemon = lucidlink.create_daemon(sandboxed=False, root_path="/data/lucid")
```
