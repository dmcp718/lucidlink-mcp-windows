# LucidLink Python SDK — Models & Exceptions

## Data Models

**Module:** `lucidlink.models`

### FileEntry

```python
@dataclass
class FileEntry:
    name: str                          # File/directory name
    path: str                          # Full path
    size: int                          # Size in bytes
    is_directory: bool                 # True if directory
    is_link: bool                      # True if symbolic link
    modified_time: int                 # Unix timestamp
    file_id: Optional[str] = None     # Unique identifier
    created_time: Optional[int] = None # Unix timestamp
```

### FilespaceSize

```python
@dataclass
class FilespaceSize:
    total_bytes: int                   # Total capacity
    used_bytes: int                    # Used space
    available_bytes: int               # Available space

    @property
    def used_percentage(self) -> float:
        """Percentage of space used (0-100)."""
```

Usage:
```python
size = filespace.get_filespace_size()
print(f"Total: {size.total_bytes}")
print(f"Used: {size.used_bytes} ({size.used_percentage:.1f}%)")
print(f"Available: {size.available_bytes}")
```

### FilespaceStatistics

```python
@dataclass
class FilespaceStatistics:
    file_count: int                    # Total number of files
    directory_count: int               # Total number of directories
    total_size: int                    # Total size in bytes
```

Usage:
```python
stats = filespace.get_filespace_statistics()
print(f"Files: {stats.file_count}, Dirs: {stats.directory_count}")
print(f"Total size: {stats.total_size} bytes")
```

---

## Exception Hierarchy

**Module:** `lucidlink.exceptions`

### Custom LucidLink Exceptions

```
LucidLinkError (base)
├── DaemonError          — Daemon operation failures (start, stop, config)
├── FilespaceError       — Filespace operation failures (link, read, write)
├── AuthenticationError  — Authentication failures (invalid token, expired)
└── ConfigurationError   — Configuration errors (inherits from ValueError)
```

### Exception Details

#### `LucidLinkError`
Base exception for all LucidLink SDK errors. Catch this for broad error handling.

```python
try:
    filespace.read_file("/nonexistent")
except lucidlink.LucidLinkError as e:
    print(f"SDK error: {e}")
```

#### `DaemonError`
Raised for daemon lifecycle issues — failed start, stop, or configuration.

```python
try:
    daemon.start()
except lucidlink.DaemonError as e:
    print(f"Daemon failed: {e}")
```

#### `FilespaceError`
Raised for filespace operations — file not found, permission denied, link failures.

#### `AuthenticationError`
Raised when authentication fails — invalid token, expired credentials, network issues.

```python
try:
    workspace = daemon.authenticate(creds)
except lucidlink.AuthenticationError as e:
    print(f"Auth failed: {e}")
```

#### `ConfigurationError`
Raised for invalid configuration. Inherits from both `LucidLinkError` and `ValueError`.

### Mapped Python Built-in Exceptions

The C++ exception translator maps native errors to standard Python exceptions:

| Category | Exceptions |
|----------|-----------|
| File operations | `FileExistsError`, `FileNotFoundError`, `NotADirectoryError`, `IsADirectoryError`, `PermissionError`, `ValueError` |
| Authentication | `PermissionError` |
| Network/IO | `TimeoutError`, `IOError`, `ConnectionError` |
| Generic | `NotImplementedError`, `OSError`, `RuntimeError` |

### Error Handling Best Practices

```python
import lucidlink

try:
    daemon = lucidlink.create_daemon(sandboxed=True)
    daemon.start()
    creds = lucidlink.ServiceAccountCredentials(token="sa_live:...")
    workspace = daemon.authenticate(creds)
    filespace = workspace.link_filespace(name="data")

    with filespace.open("/file.csv", "rb") as f:
        data = f.read()

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

## URL Parser

**Module:** `lucidlink.url_parser`

### ParsedUrl

```python
@dataclass
class ParsedUrl:
    workspace: str     # Workspace name
    filespace: str     # Filespace name
    path: str          # File path within filespace
```

### UrlParser

Parses `lucidlink://workspace/filespace/path/to/file` URLs.

```python
from lucidlink.url_parser import UrlParser

parsed = UrlParser.parse("lucidlink://myworkspace/myfilespace/data/file.csv")
# parsed.workspace = "myworkspace"
# parsed.filespace = "myfilespace"
# parsed.path = "/data/file.csv"
```

---

## File Modes Utilities

**Module:** `lucidlink.file_modes`

| Function | Description |
|----------|-------------|
| `parse_mode(mode: str)` | Parse open mode into components |
| `is_text_mode(mode: str)` | Check if mode is text mode |
| `ensure_binary_mode(mode: str)` | Convert to binary equivalent |
| `get_buffered_wrapper_type(mode: str)` | Get wrapper type: "reader", "writer", or "random" |
