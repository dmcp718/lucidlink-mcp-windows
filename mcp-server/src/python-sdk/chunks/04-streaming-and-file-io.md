# LucidLink Python SDK — Streaming & File I/O

## LucidFileStream

**Module:** `lucidlink.stream`

Low-level streaming file interface. Inherits from `io.RawIOBase` for full Python compatibility.

**Note:** You typically get this via `filespace.open()` with `buffering=0`, or wrapped inside BufferedReader/BufferedWriter/TextIOWrapper for higher-level access.

### Methods

| Method | Description |
|--------|-------------|
| `read(n=-1) -> bytes` | Read up to n bytes (-1 = read all) |
| `write(b: bytes) -> int` | Write bytes, return count written |
| `seek(offset, whence=0) -> int` | Seek to position. whence: 0=start, 1=current, 2=end |
| `tell() -> int` | Current file position |
| `truncate(size=None) -> int` | Truncate file at current position or given size |
| `close() -> None` | Close file and release resources |
| `readable() -> bool` | True if opened for reading |
| `writable() -> bool` | True if opened for writing |
| `seekable() -> bool` | Always True |

### Context Manager

```python
with filespace.open("/data.bin", "rb", buffering=0) as raw:
    # raw is LucidFileStream (io.RawIOBase)
    chunk = raw.read(4096)
```

## Buffering Options

```python
# Unbuffered (binary only) — returns LucidFileStream directly
filespace.open("/file.bin", "rb", buffering=0)

# Default buffering (8192 bytes) — returns BufferedReader/BufferedWriter
filespace.open("/file.bin", "rb", buffering=-1)

# Custom buffer size (16KB)
filespace.open("/file.bin", "rb", buffering=16384)

# Line buffered (text mode only)
filespace.open("/file.txt", "rt", buffering=1)
```

## Helper Functions

### `open_buffered(native_fs, path, mode, buffering)`
Returns `BufferedReader`, `BufferedWriter`, or `BufferedRandom` depending on mode.

### `open_text(native_fs, path, mode, encoding, errors, newline)`
Returns `TextIOWrapper` wrapping a buffered stream.

## Text Encoding

```python
# UTF-8 (default for text modes)
with filespace.open("/file.txt", "rt", encoding="utf-8") as f:
    text = f.read()

# Latin-1
with filespace.open("/file.txt", "rt", encoding="latin-1") as f:
    text = f.read()

# With error handling
with filespace.open("/file.txt", "rt", encoding="utf-8", errors="ignore") as f:
    text = f.read()

# Write text
with filespace.open("/output.txt", "wt", encoding="utf-8") as f:
    f.write("Hello, World!\n")
```

## File Locking

```python
# Shared lock (for concurrent reads)
with filespace.open("/data.csv", "rb", lock_type="shared") as f:
    data = f.read()

# Exclusive lock (for writes)
with filespace.open("/data.csv", "r+b", lock_type="exclusive") as f:
    content = f.read()
    f.seek(0)
    f.write(new_content)
    f.truncate()
```

## Large File Streaming

```python
# Chunked reading — memory efficient
with filespace.open("/large_file.bin", "rb") as f:
    while True:
        chunk = f.read(1024 * 1024)  # 1MB chunks
        if not chunk:
            break
        process(chunk)

# Random access
with filespace.open("/large_file.bin", "rb") as f:
    f.seek(1000)           # Seek to byte 1000
    data = f.read(500)     # Read 500 bytes
    pos = f.tell()         # Get current position (1500)
    f.seek(-100, 2)        # Seek to 100 bytes before end
    tail = f.read()        # Read to end

# Append mode
with filespace.open("/log.txt", "ab") as f:
    f.write(b"New log entry\n")
```

## Performance Tips

1. **Use buffering for small reads**: Default 8KB buffer improves performance for many small reads
2. **Disable buffering for large sequential reads**: `buffering=0` reduces overhead for large block reads
3. **Process large files in chunks**: Use `while chunk := f.read(chunk_size)` pattern
4. **Use context managers**: Ensures proper resource cleanup
5. **Binary mode for data files**: Avoid text encoding overhead when not needed
6. **Call `sync_all()` after writes**: Ensures data reaches the hub
