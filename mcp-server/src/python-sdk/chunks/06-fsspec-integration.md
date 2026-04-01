# LucidLink Python SDK — fsspec Integration

## Overview

The SDK provides a full `fsspec` (filesystem spec) implementation, enabling seamless integration with Pandas, Dask, PyArrow, and any other library that supports the fsspec protocol.

**URL Format:** `lucidlink://workspace/filespace/path/to/file`

---

## LucidLinkFileSystem

**Module:** `lucidlink.fsspec`

Inherits from `fsspec.AbstractFileSystem`.

### Constructor Options (via `storage_options`)

```python
options = {
    "token": "sa_live:...",        # Service account token (required)
    "sandboxed": True,             # Use temp directory
    "persist_files": False,        # Keep files after exit
    "root_path": None,             # Custom root path
    "sync_mode": "all"             # "all" (default) or "none"
}
```

### SyncMode Enum

| Value | Description |
|-------|-------------|
| `SyncMode.SYNC_NONE` / `"none"` | No automatic sync after close |
| `SyncMode.SYNC_ALL` / `"all"` | Auto-sync on file close (default) |

---

## Direct Usage

```python
from lucidlink import LucidLinkFileSystem

fs = LucidLinkFileSystem(token="sa_live:...")

# List directory
files = fs.ls("lucidlink://workspace/filespace/data/")

# Read file
with fs.open("lucidlink://workspace/filespace/data.csv", "r") as f:
    content = f.read()

# Write file
with fs.open("lucidlink://workspace/filespace/output.txt", "w") as f:
    f.write("Hello!")

# File info
info = fs.info("lucidlink://workspace/filespace/data.csv")
print(f"Size: {info['size']}, Type: {info['type']}")
```

---

## Pandas Integration

```python
import pandas as pd

storage_options = {"token": "sa_live:..."}

# Read CSV
df = pd.read_csv(
    "lucidlink://workspace/filespace/data.csv",
    storage_options=storage_options
)

# Read Parquet
df = pd.read_parquet(
    "lucidlink://workspace/filespace/data.parquet",
    storage_options=storage_options
)

# Write CSV
df.to_csv(
    "lucidlink://workspace/filespace/output.csv",
    storage_options=storage_options,
    index=False
)

# Write Parquet
df.to_parquet(
    "lucidlink://workspace/filespace/output.parquet",
    storage_options=storage_options
)

# Read Excel
df = pd.read_excel(
    "lucidlink://workspace/filespace/report.xlsx",
    storage_options=storage_options
)
```

---

## Dask Integration

```python
import dask.dataframe as dd

storage_options = {"token": "sa_live:..."}

# Read multiple Parquet files
df = dd.read_parquet(
    "lucidlink://workspace/filespace/data/*.parquet",
    storage_options=storage_options
)

# Compute
result = df.groupby("category").sum().compute()
```

---

## All fsspec Methods

### File Operations

| Method | Description |
|--------|-------------|
| `open(path, mode="rb")` | Open file for reading/writing |
| `cat(path, start=None, end=None)` | Read bytes |
| `cat_file(path, start=None, end=None)` | Read file bytes |
| `pipe(path, data)` | Write bytes to file |
| `touch(path, truncate=False)` | Create empty file |
| `rm(path, recursive=False)` | Delete file/directory |
| `cp(path1, path2, recursive=False)` | Copy file |
| `mv(path1, path2)` | Move/rename (native operation) |

### Directory Operations

| Method | Description |
|--------|-------------|
| `ls(path, detail=True)` | List directory contents |
| `mkdir(path, create_parents=False)` | Create directory |
| `makedirs(path, exist_ok=False)` | Create directory tree |
| `rmdir(path)` | Remove directory |

### Query Operations

| Method | Description |
|--------|-------------|
| `info(path)` | Get file metadata dict |
| `exists(path)` | Check if path exists |
| `isdir(path)` | Check if path is directory |
| `isfile(path)` | Check if path is file |
| `glob(path, recursive=False)` | Pattern matching |
| `find(path, maxdepth=None, withdirs=False)` | Recursive file listing |
| `du(path, total=True)` | Calculate size |

### Info Dict Keys

```python
{
    "name": "lucidlink://ws/fs/path",
    "size": 1234,
    "type": "file",  # or "directory"
    "created": 1700000000,
    "mtime": 1700000000,
}
```

---

## LucidLinkOptions

```python
@dataclass
class LucidLinkOptions:
    token: Optional[str] = None
    sandboxed: bool = True
    persist_files: bool = False
    root_path: Optional[str] = None
    sync_mode: SyncMode = SyncMode.SYNC_ALL
```
