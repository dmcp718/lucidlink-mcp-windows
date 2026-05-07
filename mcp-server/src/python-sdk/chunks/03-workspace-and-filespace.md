# LucidLink Python SDK — Workspace, Filespace & Filesystem

**Version:** 0.8.10

## Workspace

**Module:** `lucidlink.workspace` (also re-exported as `lucidlink.Workspace`)

Represents an authenticated workspace. Obtained from `daemon.authenticate()`. Do not construct directly — the constructor takes internal native handles.

### Properties

| Property | Type | Description |
|----------|------|-------------|
| `id` | str | Workspace unique identifier (read-only) |
| `name` | str | Human-readable workspace name (read-only) |

### Methods

#### `list_filespaces() -> List[FilespaceInfo]`

List all filespaces in the workspace. Returns a list of `FilespaceInfo` dataclass instances (`id`, `name`, `created`).

```python
workspace = daemon.authenticate(creds)
for fs in workspace.list_filespaces():
    print(f"{fs.name} (id={fs.id}, created={fs.created})")
```

#### `link_filespace(name=None, id=None, root_path='/', sync_mode=SyncMode.SYNC_ALL) -> Filespace`

Link to a filespace. Must provide either `name` OR `id` (not both).

```python
Workspace.link_filespace(
    self,
    name: str | None = None,
    id: str | None = None,
    root_path: str = '/',
    sync_mode: lucidlink.filespace_models.SyncMode = SyncMode.SYNC_ALL,
)
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `name` | Optional[str] | Filespace name (either `name` or `id` is required) |
| `id` | Optional[str] | Filespace unique identifier |
| `root_path` | str | Mount point path (default: `"/"`) |
| `sync_mode` | SyncMode | `SYNC_ALL` (default) calls `sync_all()` on context-manager exit / `unlink()`. `SYNC_NONE` requires explicit `sync_all()`. |

```python
# By name
filespace = workspace.link_filespace(name="production-data")

# By ID
filespace = workspace.link_filespace(id="fs-abc123")

# With custom root_path and explicit SyncMode
from lucidlink import SyncMode
filespace = workspace.link_filespace(
    name="data", root_path="/projects/ml", sync_mode=SyncMode.SYNC_NONE
)
```

#### `stop() -> None`

Unlink the active filespace (if any) and tear down workspace state. If `sync_mode` is `SYNC_ALL`, calls `sync_all()` before unlinking. Safe to call multiple times.

---

## Filespace

**Module:** `lucidlink.filespace` (also re-exported as `lucidlink.Filespace`)

Filespace context after a successful link. Provides identity, filesystem access via the `.fs` property, and external file management via the `.connect` property. Do not construct directly.

```python
Filespace(
    workspace_id: str,
    workspace_name: str,
    id: str,
    full_name: str,
    sync_mode: SyncMode = SyncMode.SYNC_ALL,
)
```

### Properties

| Property | Type | Description |
|----------|------|-------------|
| `workspace_id` | str | Workspace identifier (read-only) |
| `workspace_name` | str | Workspace name (read-only) |
| `id` | str | Filespace unique identifier (read-only) |
| `name` | str | Short name — first segment before dot (read-only) |
| `full_name` | str | Full filespace name — `name.workspace` (read-only) |
| `fs` | Filesystem | Filesystem operations interface (read-only) |
| `connect` | ConnectManager | Connect interface for external files (read-only) |

### Methods

#### `sync_all() -> None`
Synchronize all pending changes to the LucidLink hub. Flushes pending metadata and data changes across filesystem and Connect subsystems so they become visible to other clients.

```python
filespace.fs.write_file("/test.txt", b"data")
filespace.sync_all()  # Ensure write is committed to the hub
```

#### `unlink() -> None`
Unlink from this filespace. If `sync_mode=SyncMode.SYNC_ALL` (the default), calls `sync_all()` first. After `unlink()` the filespace object is invalid — do not reuse it. Safe to call multiple times.

### Context manager

`Filespace` supports `with`:

```python
with workspace.link_filespace(name="production-data") as filespace:
    filespace.fs.write_file("/hello.txt", b"hi")
# On exit, sync_all() + unlink() run automatically (SYNC_ALL default)
```

---

## Filesystem

**Module:** `lucidlink.filesystem` (also re-exported as `lucidlink.Filesystem`)

Filesystem operations on a linked LucidLink filespace. Accessed via `filespace.fs`. Do not construct directly — the constructor takes an internal native handle.

```python
filespace = workspace.link_filespace(name="production-data")
entries = filespace.fs.read_dir("/")
filespace.fs.create_dir("/new-folder")
with filespace.fs.open("/file.txt", "wb") as f:
    f.write(b"data")
```

### Directory operations

#### `read_dir(path: str) -> List[DirEntry]`
List directory contents as `DirEntry` objects (see chunk 07). Raises `NotADirectoryError`, `FileNotFoundError`, or `PermissionError`.

```python
for entry in filespace.fs.read_dir("/data"):
    print(f"{entry.name} ({'dir' if entry.is_dir() else 'file'}, {entry.size} bytes)")
```

#### `list_dir(path: str) -> List[str]`
List directory contents and return just the names (no metadata).

```python
print(filespace.fs.list_dir("/projects"))   # ["2024", "2025"]
```

#### `create_dir(path: str) -> None`
Create a directory, including parents (`mkdir -p`).

```python
filespace.fs.create_dir("/data/output/results")
```

#### `delete_dir(path: str, recursive: bool = False) -> None`
Delete a directory. `recursive=True` deletes non-empty directories.

```python
filespace.fs.delete_dir("/data/temp", recursive=True)
```

#### `dir_exists(path: str) -> bool`
Check if a directory exists.

### File operations

#### `open(path, mode='rb', buffering=-1, encoding=None, errors=None, newline=None, lock_type='') -> LucidFileStream | BufferedReader | BufferedWriter | TextIOWrapper`

Open a file. Returns an `io.RawIOBase`-compatible stream (raw if `buffering=0`, otherwise wrapped in a `BufferedReader`/`BufferedWriter`/`TextIOWrapper`). See chunk 04 for details.

| Parameter | Type | Description |
|-----------|------|-------------|
| `path` | str | File path in the filespace |
| `mode` | str | Open mode (see table below). Default `'rb'`. |
| `buffering` | int | -1=default buffer, 0=unbuffered (binary only), 1=line-buffered (text only), >1=custom buffer size |
| `encoding` | Optional[str] | Text encoding (default utf-8 for text modes) |
| `errors` | Optional[str] | Text error handling (`'strict'`, `'ignore'`, `'replace'`) |
| `newline` | Optional[str] | Newline translation (text mode) |
| `lock_type` | str | On-open hub-coordinated lock. Valid values: `''` (none), `'shared'`, `'exclusive'`. |

**Supported modes** (per `lucidlink.stream` documentation):

| Mode | Description |
|------|-------------|
| `"r"` | Read text |
| `"rb"` | Read binary |
| `"w"` | Write text |
| `"wb"` | Write binary |
| `"a"` | Append text |
| `"ab"` | Append binary |
| `"r+"` | Read/write text |
| `"r+b"` | Read/write binary |

```python
# Binary read
with filespace.fs.open("/data.bin", "rb") as f:
    data = f.read()

# Text write with encoding
with filespace.fs.open("/output.txt", "wt", encoding="utf-8") as f:
    f.write("Hello, World!")

# On-open exclusive lock for read-modify-write
with filespace.fs.open("/shared.dat", "r+b", lock_type="exclusive") as f:
    data = f.read()
    f.seek(0)
    f.write(modified_data)
    f.truncate()
```

#### `open_legacy(path: str, mode: str = 'r') -> FileHandle`
Open a file using the legacy `FileHandle` API. Preserved for backward compatibility — new code should use `open()`.

#### `read_file(path: str) -> bytes`
Read entire file contents. Convenience method; use `open()` for large files.

#### `write_file(path: str, data: bytes) -> None`
Write bytes to a file, creating or truncating it.

#### `create(path: str) -> int`
Low-level: create a new file and return a native handle ID. Use `open()` in most cases. Raises `FileExistsError` if the file already exists.

#### `delete(path: str) -> None`
Delete a file. Raises `FileNotFoundError`, `IsADirectoryError`, or `PermissionError`.

#### `file_exists(path: str) -> bool`
Check if a file exists.

#### `get_entry(path: str) -> DirEntry`
Get metadata for a file or directory as a `DirEntry` (name, size, type, file_id, ctime, mtime — see chunk 07). Raises `FileNotFoundError` if the path does not exist.

#### `get_size() -> FilespaceSize`
Return a `FilespaceSize` dataclass (`entries`, `data`, `storage`, `external_files_size`, `external_files_count`).

```python
size = filespace.fs.get_size()
print(f"Data: {size.data} bytes, storage: {size.storage} bytes, "
      f"external files: {size.external_files_count}")
```

#### `get_statistics() -> FilespaceStatistics`
Return a `FilespaceStatistics` dataclass (`file_count`, `directory_count`, `symlink_count`, `entries_size`, `data_size`, `storage_size`, `external_files_size`, `external_files_count`).

```python
stats = filespace.fs.get_statistics()
print(f"Files: {stats.file_count}, Dirs: {stats.directory_count}")
```

#### `move(src: str, dst: str) -> None`
Move or rename a file or directory natively (not copy + delete). Raises `FileNotFoundError` / `FileExistsError` / `PermissionError`.

```python
filespace.fs.move("/data/old_name.csv", "/data/new_name.csv")
```

#### `truncate(path: str, size: int) -> None`
Truncate or extend a file to the specified size in bytes.

```python
filespace.fs.truncate("/data/logfile.txt", 0)          # empty the file
filespace.fs.truncate("/data/output.bin", 1048576)     # truncate/extend to 1 MiB
```

### Byte-range locking

For fine-grained distributed locking on regions of an open file (hub-coordinated across all clients of the filespace).

#### `lock_byte_range(handle_id: int, offset: int, length: int, lock_type: str = 'exclusive', blocking: bool = True) -> bool`
Lock a byte range on a file opened via the low-level `create()` or the native `FileSystem.open()`. Returns `True` when the lock is acquired.

- Valid `lock_type` values: `''`, `'shared'`, `'exclusive'` (the same tuple as for `Filesystem.open(..., lock_type=...)`).
- `blocking=False` returns immediately if the lock is unavailable.

#### `unlock_byte_range(handle_id: int, offset: int, length: int) -> None`
Release a previously-acquired range lock.

#### `unlock_all_byte_ranges(handle_id: int) -> None`
Release every range lock held by `handle_id`.

> **Note:** For most use cases, prefer the `lock_type=` parameter on `open()` instead. Byte-range locking is for advanced distributed-coordination scenarios. See chunk 10.
