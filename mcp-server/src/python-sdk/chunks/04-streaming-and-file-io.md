# LucidLink Python SDK — Streaming & File I/O

**Version:** 0.8.10

## LucidFileStream

**Module:** `lucidlink.stream` (also re-exported as `lucidlink.LucidFileStream`)

Low-level streaming file interface. Inherits from `io.RawIOBase` for full Python compatibility (Pandas, LangChain, PyTorch, etc. accept it as a file-like).

```python
class LucidFileStream(io.RawIOBase):
    def __init__(
        self,
        fs_wrapper: Any,     # PythonFileSystemWrapper from lucidlink.lucidlink_native
        path: str,
        mode: str = 'rb',
        lock_type: str = '',
    )
```

You typically obtain a `LucidFileStream` via `filespace.fs.open(path, mode, buffering=0)` or the `lucidlink.open_buffered` / `lucidlink.open_text` helpers (which wrap it). Direct construction is unusual.

### Properties

| Property | Type | Description |
|----------|------|-------------|
| `name` | str | File path within the filespace |
| `mode` | str | Open mode |
| `closed` | bool | Whether the stream is closed |

### Methods

| Method | Description |
|--------|-------------|
| `read(size: int = -1) -> bytes` | Read up to `size` bytes (-1 = read all). |
| `readinto(b: bytearray) -> int \| None` | Read bytes into a pre-allocated buffer. Returns bytes read, or `None` at EOF. |
| `write(b: bytes) -> int` | Write bytes, return count written. |
| `seek(offset: int, whence: int = 0) -> int` | Seek. whence: 0=start, 1=current, 2=end. |
| `tell() -> int` | Current position in bytes. |
| `truncate(size: int \| None = None) -> int` | Resize the stream. |
| `close() -> None` | Close stream and release resources. |
| `readable() -> bool` | True if opened for reading. |
| `writable() -> bool` | True if opened for writing. |
| `seekable() -> bool` | Always returns `True`. |
| `fileno() -> int` | Raises `io.UnsupportedOperation`. |
| `isatty() -> bool` | Always returns `False`. |

Standard `io.RawIOBase` line-iteration methods (`readline`, `readlines`, `writelines`, iteration via `for line in stream:`) are inherited from the base class.

### Context manager

```python
with filespace.fs.open("/data.bin", "rb", buffering=0) as raw:
    # raw is a LucidFileStream (io.RawIOBase) because buffering=0
    chunk = raw.read(4096)
```

---

## Helper factory functions

Both are re-exported from the top-level `lucidlink` package (not just `lucidlink.stream`).

### `lucidlink.open_buffered(...)`

```python
FN lucidlink.open_buffered(
    fs_wrapper: Any,
    path: str,
    mode: str = 'rb',
    buffer_size: int = 131072,
    lock_type: str = '',
) -> io.BufferedIOBase
```

Opens a file wrapped in a `BufferedReader`, `BufferedWriter`, or `BufferedRandom` depending on the mode. Default buffer is 131072 bytes (128 KiB).

```python
# Idiomatic path — use Filesystem.open() with a large buffering value:
with filespace.fs.open("/big.bin", "rb", buffering=1 << 20) as f:
    data = f.read(65536)

# Direct helper — callers that already hold the low-level
# PythonFileSystemWrapper (from the lucidlink_native module) can call
# open_buffered(fs_wrapper, path, mode, buffer_size=...) themselves.
```

### `lucidlink.open_text(...)`

```python
FN lucidlink.open_text(
    fs_wrapper: Any,
    path: str,
    mode: str = 'r',
    encoding: str = 'utf-8',
    errors: str = 'strict',
    newline: str | None = None,
    lock_type: str = '',
) -> _io.TextIOWrapper
```

Returns a `TextIOWrapper` over a buffered `LucidFileStream`. Convenience wrapper for text-mode reads/writes.

```python
# Idiomatic text read/write: use Filesystem.open() with a text mode.
with filespace.fs.open("/greeting.txt", "w", encoding="utf-8") as f:
    f.write("hello from 0.8.10")
```

> **Tip:** `filespace.fs.open(path, "r", encoding=...)` is the idiomatic way to get a `TextIOWrapper` — the free-standing `open_text` / `open_buffered` helpers exist for callers that already hold the low-level `PythonFileSystemWrapper` from the `lucidlink_native` module.

---

## Buffering options

```python
# Unbuffered (binary only) — returns LucidFileStream directly
filespace.fs.open("/file.bin", "rb", buffering=0)

# Default buffering — returns BufferedReader/BufferedWriter
filespace.fs.open("/file.bin", "rb", buffering=-1)

# Custom buffer size (e.g. 16 KiB)
filespace.fs.open("/file.bin", "rb", buffering=16384)

# Line buffering (text mode only)
filespace.fs.open("/file.txt", "rt", buffering=1)
```

---

## Text encoding

```python
# UTF-8 (default for text modes)
with filespace.fs.open("/file.txt", "rt", encoding="utf-8") as f:
    text = f.read()

# Latin-1
with filespace.fs.open("/file.txt", "rt", encoding="latin-1") as f:
    text = f.read()

# With error handling
with filespace.fs.open("/file.txt", "rt", encoding="utf-8", errors="ignore") as f:
    text = f.read()

# Write text
with filespace.fs.open("/output.txt", "wt", encoding="utf-8") as f:
    f.write("Hello, World!\n")
```

---

## File locking on open

The `lock_type` kwarg on `Filesystem.open()` (and on `open_buffered`, `open_text`, `LucidFileStream`) acquires a hub-coordinated lock for the lifetime of the file handle. Valid values, per the `LucidFileStream` constructor documentation:

- `""` — no lock
- `"shared"` — read lock
- `"exclusive"` — write lock

```python
# Shared lock (for concurrent reads)
with filespace.fs.open("/data.csv", "rb", lock_type="shared") as f:
    data = f.read()

# Exclusive lock (for read-modify-write)
with filespace.fs.open("/data.csv", "r+b", lock_type="exclusive") as f:
    content = f.read()
    f.seek(0)
    f.write(new_content)
    f.truncate()
```

See chunk 10 for the byte-range locking API (`Filesystem.lock_byte_range`) — fine-grained locks on regions of an already-open file.

---

## Large file streaming

```python
# Chunked reading — memory efficient
with filespace.fs.open("/large_file.bin", "rb") as f:
    while True:
        chunk = f.read(1024 * 1024)   # 1 MiB chunks
        if not chunk:
            break
        process(chunk)

# Random access
with filespace.fs.open("/large_file.bin", "rb") as f:
    f.seek(1000)           # Seek to byte 1000
    data = f.read(500)     # Read 500 bytes
    pos = f.tell()         # 1500
    f.seek(-100, 2)        # 100 bytes before end
    tail = f.read()        # Read to end

# Append mode
with filespace.fs.open("/log.txt", "ab") as f:
    f.write(b"New log entry\n")
```

---

## Performance tips

1. **Use the default buffering for typical I/O** — `buffering=-1` gives you a `BufferedReader` / `BufferedWriter` with the SDK default (128 KiB for `open_buffered`).
2. **Raise the buffer for streaming large files** — pass `buffering=1 << 20` (or use `open_buffered(..., buffer_size=1 << 20)`) for multi-MiB-per-read workloads.
3. **Prefer `buffering=0` only when you are already managing your own block size** — it returns a raw `LucidFileStream` with no Python-side buffer.
4. **Use context managers** — ensures handles (and any `lock_type` lock) are released promptly.
5. **Binary mode for data files** — avoid text encoding overhead for binary blobs (Parquet, pickle, arrow).
6. **Call `filespace.sync_all()` after writes you need visible to other clients** — writes queue locally until synced to the hub (chunk 12 covers `SyncMode`).
