# LucidLink Python SDK — Quick Reference

**Version:** 0.8.10

## Lifecycle

```python
import lucidlink

daemon = lucidlink.create_daemon()                             # Create daemon
daemon.start()                                                 # Start services
workspace = daemon.authenticate(                               # Authenticate
    lucidlink.ServiceAccountCredentials(token="sa_live:your_token_here"))
filespace = workspace.link_filespace(name="my-fs")             # Link filespace
# ... use filespace.fs for file operations, filespace.connect for S3 linking ...
filespace.sync_all()                                           # Flush pending writes
filespace.unlink()                                             # Disconnect
daemon.stop()                                                  # Shutdown
```

---

## lucidlink (top-level public API)

Modules and key public symbols documented in the upstream API reference:

```
lucidlink.daemon            create_daemon, Daemon
lucidlink.credentials       ServiceAccountCredentials
lucidlink.workspace         Workspace
lucidlink.filespace         Filespace
lucidlink.filesystem        Filesystem
lucidlink.stream            LucidFileStream, open_buffered, open_text
lucidlink.storage           StorageConfig, StorageMode
lucidlink.connect           ConnectManager
lucidlink.connect_models    S3DataStoreConfig, S3Credentials, DataStoreCredentials,
                            DataStoreInfo, DataStoreKind, DataStoreRekeyState,
                            LinkedFilesResult
lucidlink.filespace_models  FilespaceInfo, SyncMode, DaemonStatus
lucidlink.filesystem_models DirEntry, FilespaceSize, FilespaceStatistics
lucidlink.fsspec            LucidLinkFileSystem
lucidlink.exceptions        LucidLinkError, DaemonError, FilespaceError,
                            AuthenticationError, ConfigurationError
```

### Top-level helpers

| Function | Signature | Description |
|----------|-----------|-------------|
| `create_daemon` | `(config: Dict[str, str] \| None = None, sandboxed: bool = True, persist_files: bool = False, root_path: str \| Path \| None = None) -> Daemon` | Build a `Daemon` with simplified storage config |
| `open_buffered` | `(fs_wrapper: Any, path: str, mode: str = 'rb', buffer_size: int = 131072, lock_type: str = '') -> io.BufferedIOBase` | Buffered stream over a filesystem handle |
| `open_text` | `(fs_wrapper: Any, path: str, mode: str = 'r', encoding: str = 'utf-8', errors: str = 'strict', newline: str \| None = None, lock_type: str = '') -> io.TextIOWrapper` | Text stream over a filesystem handle |

## lucidlink.credentials

| Class | Signature | Description |
|-------|-----------|-------------|
| `ServiceAccountCredentials` | `(token: str)` | Auth credentials; token format `sa_live:your_key` |

## lucidlink.daemon — Daemon

Constructor: `Daemon(config: Dict[str, str] | None = None, storage: StorageConfig | None = None)` — also callable as a context manager (`__enter__`/`__exit__` drive `start`/`stop`).

| Method | Signature | Description |
|--------|-----------|-------------|
| `start` | `() -> None` | Start daemon services (idempotent; only one per process) |
| `stop` | `() -> None` | Stop daemon and clean up per storage config |
| `is_running` | `() -> bool` | Is the daemon currently started? |
| `authenticate` | `(credentials: ServiceAccountCredentials) -> Workspace` | Authenticate and return a Workspace |

## lucidlink.workspace — Workspace

| Member | Signature | Description |
|--------|-----------|-------------|
| `id` | `str` (property) | Workspace ID |
| `name` | `str` (property) | Workspace name |
| `list_filespaces` | `() -> List[FilespaceInfo]` | List available filespaces |
| `link_filespace` | `(name: str \| None = None, id: str \| None = None, root_path: str = '/', sync_mode: SyncMode = SyncMode.SYNC_ALL) -> Filespace` | Link to a filespace (context-manager-capable) |
| `stop` | `() -> None` | Unlink active filespace (auto-syncs if `sync_mode == SYNC_ALL`) |

## lucidlink.filespace — Filespace

Constructed internally by `Workspace.link_filespace()`. Supports `with` statement: `__exit__` calls `sync_all()` (when `sync_mode == SYNC_ALL`) then `unlink()`.

| Member | Signature | Description |
|--------|-----------|-------------|
| `workspace_id` | `str` (property) | Parent workspace ID |
| `workspace_name` | `str` (property) | Parent workspace name |
| `id` | `str` (property) | Filespace ID |
| `name` | `str` (property) | Short filespace name |
| `full_name` | `str` (property) | Fully-qualified filespace name |
| `fs` | `Filesystem` (property) | Filesystem operations interface |
| `connect` | `ConnectManager` (property) | External-file (S3) operations interface |
| `sync_all` | `() -> None` | **Flush all pending changes to the hub** |
| `unlink` | `() -> None` | Disconnect from filespace (auto-syncs if `sync_mode == SYNC_ALL`) |

## lucidlink.filesystem — Filesystem (via `filespace.fs`)

### File Operations

| Method | Signature | Description |
|--------|-----------|-------------|
| `open` | `(path, mode='rb', buffering=-1, encoding=None, errors=None, newline=None, lock_type='') -> LucidFileStream \| BufferedReader \| BufferedWriter \| TextIOWrapper` | Open a file as a Python stream |
| `open_legacy` | `(path: str, mode: str = 'r') -> FileHandle` | Legacy positional read/write handle API (deprecated; prefer `open`) |
| `read_file` | `(path: str) -> bytes` | Read entire file |
| `write_file` | `(path: str, data: bytes) -> None` | Write entire file |
| `create` | `(path: str) -> int` | Create file, return low-level handle ID |
| `delete` | `(path: str) -> None` | Delete file |
| `move` | `(src: str, dst: str) -> None` | Move or rename file or directory |
| `truncate` | `(path: str, size: int) -> None` | Truncate or extend file to `size` bytes |
| `file_exists` | `(path: str) -> bool` | Check file existence |
| `get_entry` | `(path: str) -> DirEntry` | Get file/dir metadata (raises `FileNotFoundError`) |

### Directory Operations

| Method | Signature | Description |
|--------|-----------|-------------|
| `read_dir` | `(path: str) -> List[DirEntry]` | List directory (full metadata) |
| `list_dir` | `(path: str) -> List[str]` | List directory names |
| `create_dir` | `(path: str) -> None` | Create directory (`mkdir -p`) |
| `delete_dir` | `(path: str, recursive: bool = False) -> None` | Delete directory |
| `dir_exists` | `(path: str) -> bool` | Check directory existence |

### Filespace Info

| Method | Signature | Description |
|--------|-----------|-------------|
| `get_size` | `() -> FilespaceSize` | `entries`, `data`, `storage`, `external_files_size`, `external_files_count` |
| `get_statistics` | `() -> FilespaceStatistics` | `file_count`, `directory_count`, `symlink_count`, sizes |

### Byte-Range Locking

| Method | Signature | Description |
|--------|-----------|-------------|
| `lock_byte_range` | `(handle_id: int, offset: int, length: int, lock_type: str = 'exclusive', blocking: bool = True) -> bool` | Lock a byte range |
| `unlock_byte_range` | `(handle_id: int, offset: int, length: int) -> None` | Unlock a byte range |
| `unlock_all_byte_ranges` | `(handle_id: int) -> None` | Release every range lock held by this handle |

## lucidlink.stream — LucidFileStream (io.RawIOBase)

Returned by `Filesystem.open()` for binary modes, and wrapped by `open_buffered` / `open_text`.

| Method | Signature | Description |
|--------|-----------|-------------|
| `read` | `(size: int = -1) -> bytes` | Read bytes |
| `readinto` | `(b: bytearray) -> int \| None` | Read into buffer |
| `write` | `(b: bytes) -> int` | Write bytes |
| `seek` | `(offset: int, whence: int = 0) -> int` | Seek position |
| `tell` | `() -> int` | Current position |
| `truncate` | `(size: int \| None = None) -> int` | Resize stream |
| `readable` / `writable` / `seekable` | `() -> bool` | Mode predicates (`seekable` is always `True`) |
| `fileno` | `() -> int` | Raises `io.UnsupportedOperation` |
| `isatty` | `() -> bool` | Always `False` |
| `close` | `() -> None` | Close stream |
| `name` / `mode` / `closed` | property | Stream metadata |

## lucidlink.connect — ConnectManager (via `filespace.connect`)

| Method | Signature | Description |
|--------|-----------|-------------|
| `are_data_stores_available` | `() -> bool` | Filespace supports external files (V9+) and feature enabled |
| `add_data_store` | `(name: str, config: S3DataStoreConfig) -> DataStoreInfo` | Register an S3 data store |
| `remove_data_store` | `(name: str) -> None` | Remove a data store |
| `get_data_store` | `(name: str) -> DataStoreInfo \| None` | Get a data store by name (includes secret_key) |
| `list_data_stores` | `() -> List[DataStoreInfo]` | List all registered stores (secret_key empty) |
| `rekey_data_store` | `(name: str, credentials: S3Credentials \| None = None, *, new_access_key: str \| None = None, new_secret_key: str \| None = None) -> None` | Rotate credentials |
| `link_file` | `(file_path: str, data_store_name: str, object_id: str, size: int \| None = None, checksum: str = '') -> None` | Link an S3 object as an external file |
| `unlink_file` | `(file_path: str) -> None` | Remove an external file link |
| `list_external_files` | `(data_store_name: str, limit: int = 100, cursor: str = '') -> LinkedFilesResult` | List linked files (paginated) |
| `count_external_files` | `(data_store_name: str) -> int` | Count linked files (faster than listing) |

## lucidlink.fsspec — LucidLinkFileSystem

| Method | Signature | Description |
|--------|-----------|-------------|
| `__init__` | `(token: str \| None = None, sandboxed: bool = True, persist_files: bool = False, root_path: str \| Path \| None = None, sync_mode: SyncMode = SyncMode.SYNC_ALL, **kwargs)` | Create the fsspec filesystem |
| `open` | Inherited from `AbstractFileSystem` | Open a `lucidlink://` URL |
| `ls` | `(path: str, detail: bool = True, **kwargs) -> List[str] \| List[Dict[str, Any]]` | List directory |
| `info` | `(path: str, **kwargs) -> Dict[str, Any]` | File/dir metadata |
| `exists` | `(path: str, **kwargs) -> bool` | Check existence |
| `isfile` | `(path: str) -> bool` | Path is a regular file |
| `isdir` | `(path: str) -> bool` | Path is a directory |
| `cat` | `(path: str, start: int \| None = None, end: int \| None = None, **kwargs) -> bytes` | Read file or byte range |
| `cat_file` | `(path, start=None, end=None, **kwargs) -> bytes` | Alias for `cat` |
| `put` | `(lpath: str, rpath: str, recursive: bool = False, **kwargs) -> None` | Upload local → remote |
| `get` | `(rpath: str, lpath: str, recursive: bool = False, **kwargs) -> None` | Download remote → local |
| `mv` | `(path1: str, path2: str, recursive: bool = False, maxdepth: int \| None = None, **kwargs) -> None` | Move or rename |
| `rename` | `(path1: str, path2: str, **kwargs) -> None` | Alias for `mv` |
| `rm` | `(path: str, recursive: bool = False, maxdepth: int \| None = None) -> None` | Delete |
| `mkdir` | `(path: str, create_parents: bool = True, **kwargs) -> None` | Create directory |
| `makedirs` | `(path: str, exist_ok: bool = False) -> None` | Create directory recursively |
| `rmdir` | `(path: str) -> None` | Remove empty directory |
| `sync_all` | `() -> None` | Flush all connected filespaces |
| `close` | `() -> None` | Close connections, stop daemon |
| `protocol` | `'lucidlink'` (class attr) | fsspec protocol name |
| `options` | property | fsspec options bag |

**URL format:** `lucidlink://workspace/filespace/path/to/file`
**Pandas:** `pd.read_csv("lucidlink://ws/fs/data.csv", storage_options={"token": "sa_live:..."})`

## lucidlink.filespace_models

| Class | Fields | Description |
|-------|--------|-------------|
| `DaemonStatus` | `is_running: bool, is_authenticated: bool, is_linked: bool, root_path: str` | Daemon operational state dataclass |
| `FilespaceInfo` | `id: str, name: str, created: str` | Returned by `Workspace.list_filespaces()` |
| `SyncMode` | enum: `SYNC_ALL = 'all'`, `SYNC_NONE = 'none'` | Auto-sync policy for `Filespace` teardown |

## lucidlink.filesystem_models

| Class | Fields | Description |
|-------|--------|-------------|
| `DirEntry` | `name, size, type, file_id, file_id_external, ctime, mtime` + predicates `is_file()`, `is_dir()`, `is_link()` | Returned by `read_dir` / `get_entry` |
| `FilespaceSize` | `entries, data, storage, external_files_size, external_files_count` | Returned by `get_size` |
| `FilespaceStatistics` | `file_count, directory_count, symlink_count, entries_size, data_size, storage_size, external_files_size, external_files_count` | Returned by `get_statistics` |

## lucidlink.connect_models

| Class / Enum | Fields / Values | Description |
|--------------|-----------------|-------------|
| `S3DataStoreConfig` | `access_key, secret_key, bucket_name, region, endpoint='', url_expiration_minutes=10080, use_virtual_addressing=False` | Config for registering an S3 store |
| `DataStoreInfo` | `name, access_key='', secret_key='', bucket_name='', region='', endpoint='', url_expiration_minutes=0, use_virtual_addressing=False, kind=DataStoreKind.S3, key_id='', rekey_state=DataStoreRekeyState.NO_REKEY` + classmethod `from_dict` | Read-only store info |
| `S3Credentials` | `access_key, secret_key, kind=DataStoreKind.S3` | Credential pair for rekey |
| `DataStoreCredentials` | (alias for `S3Credentials`) | Base credential class |
| `LinkedFilesResult` | `file_paths: List[str], file_ids: List[int], has_more: bool = False, cursor: str = ''` | Paginated listing result |
| `DataStoreKind` | enum: `S3 = 'S3DataStore'` | Data store type |
| `DataStoreRekeyState` | enum: `NO_REKEY = 'no_rekey'`, `IN_PROGRESS = 'in_progress'` | Credential rotation state |

## lucidlink.storage

| Class / Enum | Signature / Values | Description |
|--------------|--------------------|-------------|
| `StorageMode` | enum: `SANDBOXED = 'sandboxed'`, `PHYSICAL = 'physical'` | Daemon storage mode |
| `StorageConfig` | `(mode: StorageMode = StorageMode.SANDBOXED, persist_on_exit: bool = False, root_path: Path \| None = None)` + `get_root_path() -> Path`, `should_cleanup() -> bool` | Storage configuration for `Daemon(storage=...)` |

## lucidlink.exceptions

```
LucidLinkError          ← base for all SDK errors
├── DaemonError         ← start/stop/init/already-running failures
├── FilespaceError      ← file/dir operation failures (SDK-wrapped)
├── AuthenticationError ← invalid/expired credentials (also PermissionError paths)
└── ConfigurationError  ← invalid params (also inherits from ValueError)
```

Per the upstream documentation, filesystem operations raise standard Python exceptions like `FileNotFoundError`, `PermissionError`, etc. Most authentication errors are mapped to Python's `PermissionError`.
