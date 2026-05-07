# LucidLink Python SDK — fsspec Integration

**Version:** 0.8.10

## Overview

The SDK ships an `fsspec.AbstractFileSystem` implementation so Pandas, Dask,
PyArrow, and any other fsspec-aware library can talk to a filespace by URL.
The fsspec protocol registered by the SDK is **`lucidlink`**.

**URL format:** `lucidlink://{workspace}/{filespace}/{path}`

**Note:** `LucidLinkFileSystem` (fsspec) is distinct from `Filesystem`
(the per-filespace `filespace.fs` object documented in chunk 03). They
expose different APIs — only `LucidLinkFileSystem` participates in fsspec
URL resolution and `storage_options`.

Install with the fsspec extra to pull in `fsspec` itself:

```bash
pip install lucidlink fsspec
# or
pip install "lucidlink[fsspec]"
```

Two equivalent top-level imports are supported:

```python
from lucidlink import LucidLinkFileSystem       # re-export
from lucidlink.fsspec import LucidLinkFileSystem  # actual module
```

---

## LucidLinkFileSystem

**Module:** `lucidlink.fsspec`

Inherits from `fsspec.AbstractFileSystem`. Protocol class attribute:

```python
LucidLinkFileSystem.protocol = "lucidlink"
```

### Constructor

```python
LucidLinkFileSystem(
    token: str | None = None,
    sandboxed: bool = True,
    persist_files: bool = False,
    root_path: str | Path | None = None,
    sync_mode: SyncMode = SyncMode.SYNC_ALL,
    **kwargs,
)
```

### Constructor options (via `storage_options`)

```python
storage_options = {
    "token": "sa_live:...",         # Service account token (required)
    "sandboxed": True,              # Use temp directory
    "persist_files": False,         # Keep files after daemon stops
    "root_path": None,              # Custom storage root (physical mode only)
    "sync_mode": SyncMode.SYNC_ALL, # Auto-sync on close (default)
}
```

### Properties

| Property | Type | Description |
|----------|------|-------------|
| `protocol` | `str` | Class attribute; always `"lucidlink"` |
| `options` | `LucidLinkOptions` | Read-only view of the resolved options |

### SyncMode

The SDK re-exports `SyncMode` at the top level. Members (from
`lucidlink.filespace_models.SyncMode`):

| Member | String value |
|--------|--------------|
| `SyncMode.SYNC_ALL` | `"all"` |
| `SyncMode.SYNC_NONE` | `"none"` |

```python
from lucidlink import SyncMode

fs = LucidLinkFileSystem(token="sa_live:...", sync_mode=SyncMode.SYNC_NONE)
```

---

## Direct usage

```python
from lucidlink import LucidLinkFileSystem

fs = LucidLinkFileSystem(token="sa_live:...")

# List directory (detail=True returns info dicts, detail=False returns paths)
files = fs.ls("lucidlink://workspace/filespace/data/", detail=True)

# Read/write via inherited AbstractFileSystem.open()
with fs.open("lucidlink://workspace/filespace/data.csv", "rb") as f:
    content = f.read()

with fs.open("lucidlink://workspace/filespace/output.txt", "wb") as f:
    f.write(b"Hello!")

# File info
info = fs.info("lucidlink://workspace/filespace/data.csv")
print(f"Size: {info['size']}, Type: {info['type']}")

# Byte-range read
chunk = fs.cat("lucidlink://workspace/filespace/data.csv", start=0, end=1024)

# Download / upload
fs.get("lucidlink://workspace/filespace/file.txt", "local_file.txt")
fs.put("local_file.txt", "lucidlink://workspace/filespace/uploaded.txt")

# Move / rename (native rename — faster than copy+delete)
fs.mv("lucidlink://workspace/filespace/old.txt",
      "lucidlink://workspace/filespace/new.txt")
fs.rename("lucidlink://workspace/filespace/a.txt",
          "lucidlink://workspace/filespace/b.txt")

# Directory operations
fs.mkdir("lucidlink://workspace/filespace/new_dir")
fs.makedirs("lucidlink://workspace/filespace/deep/nested/dir", exist_ok=True)
fs.rmdir("lucidlink://workspace/filespace/empty_dir")
fs.rm("lucidlink://workspace/filespace/old_dir", recursive=True)

# Flush pending writes and tear down the daemon
fs.sync_all()
fs.close()
```

The `LucidLinkFileSystem` also works as a context manager (`__enter__` /
`__exit__`) — `close()` is called on exit.

---

## Pandas integration

```python
import pandas as pd

storage_options = {"token": "sa_live:..."}

# Read CSV
df = pd.read_csv(
    "lucidlink://workspace/filespace/data.csv",
    storage_options=storage_options,
)

# Read Parquet
df = pd.read_parquet(
    "lucidlink://workspace/filespace/data.parquet",
    storage_options=storage_options,
)

# Write CSV
df.to_csv(
    "lucidlink://workspace/filespace/output.csv",
    storage_options=storage_options,
    index=False,
)

# Write Parquet
df.to_parquet(
    "lucidlink://workspace/filespace/output.parquet",
    storage_options=storage_options,
)

# JSON Lines
df.to_json(
    "lucidlink://workspace/filespace/events.jsonl",
    orient="records", lines=True,
    storage_options=storage_options,
)
df = pd.read_json(
    "lucidlink://workspace/filespace/events.jsonl",
    orient="records", lines=True,
    storage_options=storage_options,
)
```

---

## Dask integration

```python
import dask.dataframe as dd

storage_options = {"token": "sa_live:..."}

# Glob over multiple Parquet files
df = dd.read_parquet(
    "lucidlink://workspace/filespace/data/*.parquet",
    storage_options=storage_options,
)

result = df.groupby("category").sum().compute()
```

---

## URL-based access with `fsspec.open()`

```python
import fsspec

token = "sa_live:..."

# Write
with fsspec.open(
    "lucidlink://workspace/filespace/hello.txt", "wb", token=token,
) as f:
    f.write(b"hello")

# Read
with fsspec.open(
    "lucidlink://workspace/filespace/hello.txt", "rb", token=token,
) as f:
    print(f.read())
```

---

## Method reference

### File operations

| Method | Description |
|--------|-------------|
| `open(path, mode="rb", **kw)` | Open for read/write (inherited from `AbstractFileSystem`) |
| `cat(path, start=None, end=None)` | Read full bytes or a byte range |
| `cat_file(path, start=None, end=None)` | Alias for `cat()` |
| `get(rpath, lpath, recursive=False)` | Download remote file to local |
| `put(lpath, rpath, recursive=False)` | Upload local file to remote |
| `rm(path, recursive=False, maxdepth=None)` | Remove file or tree |
| `mv(path1, path2, recursive=False)` | Native rename (faster than copy+delete) |
| `rename(path1, path2)` | Alias for `mv()` |

### Directory operations

| Method | Description |
|--------|-------------|
| `ls(path, detail=True)` | List directory (paths or info dicts) |
| `mkdir(path, create_parents=True)` | Create a single directory |
| `makedirs(path, exist_ok=False)` | Create a directory tree |
| `rmdir(path)` | Remove empty directory |

### Query operations

| Method | Description |
|--------|-------------|
| `info(path)` | Metadata dict (`size`, `type`, …) |
| `exists(path)` | Check if path exists |
| `isdir(path)` | Check if path is a directory |
| `isfile(path)` | Check if path is a file |

Additional generic helpers (`glob`, `find`, `du`, `touch`, `walk`, …) are
inherited from `fsspec.AbstractFileSystem` and work against the LucidLink
implementation without any special-casing.

### Lifecycle

| Method | Description |
|--------|-------------|
| `sync_all()` | Flush pending writes to the LucidLink hub |
| `close()` | Close connections and stop the underlying daemon |
| `__enter__` / `__exit__` | Context-manager support (calls `close()`) |

`info()` returns `Dict[str, Any]` per the upstream API reference; consult the runtime dict for the available keys.
