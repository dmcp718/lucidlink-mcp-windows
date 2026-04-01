# LucidLink Python SDK — Workspace & Filespace

## Workspace

**Module:** `lucidlink.workspace`

Represents an authenticated workspace. Obtained from `daemon.authenticate()`.

### Properties

| Property | Type | Description |
|----------|------|-------------|
| `id` | str | Workspace unique identifier (read-only) |
| `name` | str | Human-readable workspace name (read-only) |

### Methods

#### `list_filespaces() -> List[Dict]`

List all filespaces in the workspace.

Returns list of dicts with keys: `id`, `name`, `created`, `size`

```python
workspace = daemon.authenticate(creds)
for fs in workspace.list_filespaces():
    print(f"{fs['name']} - {fs['size']} bytes")
```

#### `link_filespace(name=None, id=None, root_path="/") -> Filespace`

Link to a filespace. Must provide either `name` OR `id` (not both).

| Parameter | Type | Description |
|-----------|------|-------------|
| `name` | Optional[str] | Filespace name (short name, without workspace) |
| `id` | Optional[str] | Filespace unique identifier |
| `root_path` | str | Custom mount point (default: "/") |

```python
# By name
filespace = workspace.link_filespace(name="production-data")

# By ID
filespace = workspace.link_filespace(id="fs-abc123")

# With custom root
filespace = workspace.link_filespace(name="data", root_path="/projects/ml")
```

---

## Filespace

**Module:** `lucidlink.filespace`

The main interface for file and directory operations. Obtained from `workspace.link_filespace()`.

### Properties

| Property | Type | Description |
|----------|------|-------------|
| `workspace` | Workspace | Parent workspace (read-only) |
| `id` | str | Filespace unique identifier (read-only) |
| `name` | str | Short name — first segment before dot (read-only) |
| `full_name` | str | Full filespace name (read-only) |
| `connect` | ConnectManager | Connect interface for external files (lazy-initialized) |

### Directory Operations

#### `read_dir(path: str) -> List[Dict]`
List directory contents. Returns list of dicts with file entry metadata.

```python
entries = filespace.read_dir("/data")
for entry in entries:
    print(f"{entry['name']} - {'dir' if entry['is_directory'] else 'file'}")
```

#### `create_dir(path: str) -> None`
Create directory. Creates parent directories if needed.

```python
filespace.create_dir("/data/output/results")
```

#### `delete_dir(path: str, recursive: bool = False) -> None`
Delete directory. Set `recursive=True` to delete non-empty directories.

```python
filespace.delete_dir("/data/temp", recursive=True)
```

#### `dir_exists(path: str) -> bool`
Check if a directory exists.

### File Operations

#### `open(path, mode="rb", buffering=-1, encoding=None, errors=None, newline=None, lock_type="") -> Union[LucidFileStream, BufferedReader, BufferedWriter, TextIOWrapper]`

Open a file with standard Python io semantics. Returns appropriate wrapper based on mode and buffering.

| Parameter | Type | Description |
|-----------|------|-------------|
| `path` | str | File path in filespace |
| `mode` | str | Open mode (see table below) |
| `buffering` | int | -1=default 8KB, 0=unbuffered, 1=line buffered, >1=custom size |
| `encoding` | str | Text encoding (default: utf-8 for text modes) |
| `errors` | str | Encoding error handling |
| `newline` | str | Newline handling |
| `lock_type` | str | "" (none), "shared" (read), "exclusive" (write) |

**Supported Modes:**

| Mode | Description |
|------|-------------|
| `"rb"` | Read binary |
| `"wb"` | Write binary (create/truncate) |
| `"ab"` | Append binary |
| `"r+b"` | Read/write binary |
| `"rt"` | Read text |
| `"wt"` | Write text |
| `"r+t"` | Read/write text |

**Returns:** Standard Python io objects (context manager compatible)

```python
# Binary read
with filespace.open("/data.bin", "rb") as f:
    data = f.read()

# Text write with encoding
with filespace.open("/output.txt", "wt", encoding="utf-8") as f:
    f.write("Hello, World!")

# Buffered read with custom buffer size
with filespace.open("/large.bin", "rb", buffering=65536) as f:
    while chunk := f.read(8192):
        process(chunk)

# With file locking
with filespace.open("/shared.dat", "r+b", lock_type="exclusive") as f:
    data = f.read()
    f.seek(0)
    f.write(modified_data)
```

#### `read_file(path: str) -> bytes`
Read entire file contents into memory.

#### `write_file(path: str, data: bytes) -> None`
Write entire file (create or truncate).

#### `delete(path: str) -> None`
Delete a file.

#### `file_exists(path: str) -> bool`
Check if a file exists.

#### `get_entry(path: str) -> Dict`
Get file metadata (name, path, size, is_directory, modified_time, etc.).

#### `get_size(path: str) -> int`
Get file size in bytes.

#### `get_filespace_size() -> FilespaceSize`
Get total, used, and available space.

```python
size = filespace.get_filespace_size()
print(f"Used: {size.used_bytes}/{size.total_bytes} ({size.used_percentage:.1f}%)")
```

#### `get_filespace_statistics() -> FilespaceStatistics`
Get file and directory counts.

```python
stats = filespace.get_filespace_statistics()
print(f"Files: {stats.file_count}, Dirs: {stats.directory_count}, Total: {stats.total_size}")
```

#### `move(src: str, dst: str) -> None`
Move or rename a file. This is a native operation (not copy + delete).

```python
filespace.move("/data/old_name.csv", "/data/new_name.csv")
filespace.move("/staging/report.pdf", "/archive/report.pdf")
```

#### `truncate(path: str, size: int) -> None`
Truncate a file to the specified size in bytes.

```python
filespace.truncate("/data/logfile.txt", 0)       # Empty the file
filespace.truncate("/data/output.bin", 1048576)   # Truncate to 1 MiB
```

#### `sync_all() -> None`
Synchronize all pending changes to the LucidLink hub. **Must call after write operations** for changes to be visible to other clients and daemons.

```python
for path, data in items:
    fs.write_file(path, data)
fs.sync_all()  # Flush entire batch to hub
```

### Byte Range Locking

For fine-grained distributed locking on file regions:

#### `lock_byte_range(handle_id: int, offset: int, length: int, exclusive: bool = True) -> None`
Lock a byte range within an open file.

#### `unlock_byte_range(handle_id: int, offset: int, length: int) -> None`
Unlock a specific byte range.

#### `unlock_all_byte_ranges(handle_id: int) -> None`
Release all byte range locks held by this handle.

```python
# Low-level byte range locking (requires open file handle)
handle = fs._native.open("/shared/data.bin", "r+")
try:
    fs.lock_byte_range(handle, offset=0, length=4096, exclusive=True)
    # ... modify bytes 0-4095 ...
    fs.unlock_byte_range(handle, offset=0, length=4096)
finally:
    fs._native.close(handle)
```

> **Note:** For most use cases, prefer the `lock_type` parameter on `open()` instead of byte range locking. Byte range locking is for advanced distributed coordination scenarios.
