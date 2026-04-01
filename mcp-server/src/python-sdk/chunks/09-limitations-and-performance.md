# LucidLink Python SDK — Known Limitations & Performance

## Concurrency Constraints

### One Daemon Per Process

The C++ daemon is a **global singleton** — only one `Daemon` instance can exist per Python process. Attempting to create a second raises `DaemonError`.

**Workaround:** Use `multiprocessing` for true parallelism. Each child process gets its own daemon instance.

```python
import multiprocessing

def worker(token, filespace_name):
    import lucidlink
    daemon = lucidlink.Daemon()
    daemon.start()
    creds = lucidlink.ServiceAccountCredentials(token=token)
    ws = daemon.authenticate(creds)
    fs = ws.link_filespace(name=filespace_name)
    # ... do work ...
    daemon.stop()

# Each process has its own daemon
p1 = multiprocessing.Process(target=worker, args=(token, "myfs"))
p2 = multiprocessing.Process(target=worker, args=(token, "myfs"))
p1.start(); p2.start()
```

### No Concurrent Writes (max_concurrent_writes=1)

The C++ `FileSystemActor` **crashes** under concurrent write operations. Even within a single process, do not write from multiple threads simultaneously.

```python
# WRONG — will crash the C++ daemon
from concurrent.futures import ThreadPoolExecutor
with ThreadPoolExecutor(4) as pool:
    pool.map(lambda p: fs.write_file(p, data), paths)  # CRASH

# CORRECT — sequential writes only
for path in paths:
    fs.write_file(path, data)
```

### Hub-Level File Locking

The SDK enforces **strong consistency via hub-level file locking**. `write_file()` calls `CreateFileStrongConsistency`, which acquires a lock at the hub level.

This means:
- **Even separate daemon processes** writing different files to the same filespace can get `LockingException`
- Multi-process writes are **not** a reliable workaround for write parallelism
- The `RuntimeError` message references `FileSystemActor.cpp` and `LockingException`

```python
# This WILL raise LockingException intermittently:
# Process A: fs.write_file("/dir/file_001.dat", data)
# Process B: fs.write_file("/dir/file_002.dat", data)  # LockingException!
```

### Thread Safety of read_file()

`read_file()` is **partially thread-safe** — it works with moderate concurrency (2-4 threads) but can fail at higher concurrency (8+ threads) with `RuntimeError: Invalid file handle ID`.

The issue: the C++ daemon's file handle pool has race conditions under heavy concurrent access. Handles can be invalidated or reused across threads.

**Recommendation:** Use 4 or fewer concurrent read threads per daemon, and implement retry logic:

```python
import concurrent.futures
import time

def read_with_retry(fs, path, max_retries=3):
    for attempt in range(max_retries):
        try:
            return fs.read_file(path)
        except RuntimeError:
            if attempt == max_retries - 1:
                raise
            time.sleep(0.01 * (attempt + 1))

with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
    results = list(pool.map(lambda p: read_with_retry(fs, p), paths))
```

---

## sync_all() Timing

### When to Call

`sync_all()` flushes all pending writes to the LucidLink hub. Without it, written data may not be visible to other clients or daemons.

```python
# Write multiple files, then sync once
for path in paths:
    fs.write_file(path, data)
fs.sync_all()  # Flush all writes to hub
```

### S3 Gateway Timing

When using the SDK behind an S3 gateway (e.g., VersityGW), **do not call `sync_all()` before responding to the S3 client**. S3 clients (AWS CLI, boto3) have aggressive timeouts (typically 60s). If `sync_all()` takes too long, the client will time out and retry, causing duplicate operations.

```python
# S3 gateway pattern — respond first, sync later
def handle_put_object(path, data):
    fs.write_file(path, data)
    return {"status": 200}  # Respond to client immediately

# Sync in background or on a timer
fs.sync_all()
```

---

## Performance Characteristics

### SDK vs Desktop Client

Based on benchmarking with `sdkbench` (500 x 1 MiB files):

| Operation | SDK (sequential) | Gap vs Desktop | Notes |
|-----------|-----------------|----------------|-------|
| Write | ~8 MiB/s | ~25x slower | Hub locking overhead |
| Read (cold) | ~200 MiB/s | ~1.4x slower | First read, no cache |
| Read (warm) | ~300 MiB/s | ~1.6x slower | SDK cache hit |
| Read (random) | ~180 MiB/s | ~1.8x slower | Cache less effective |
| List dir | ~3 ops/s | ~5x slower | Per-call overhead |
| Metadata | ~50 ops/s | ~40x slower | file_exists + get_entry |

### Optimization Strategies

**Reads — use concurrent threads:**
```python
# 4 threads brings reads to near desktop parity
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
    data = list(pool.map(fs.read_file, paths))
```

**Metadata — use concurrent threads + skip redundant calls:**
```python
# get_entry() alone checks existence — no need for file_exists() first
try:
    entry = fs.get_entry(path)
    # File exists, entry has metadata
except FileNotFoundError:
    # File does not exist
    pass
```

**Cache size — set appropriately for workload:**
```python
# Large cache for repeated reads of the same files
daemon = lucidlink.Daemon(config={"fs.cache.size": "2048"})  # 2 GB cache
```

**Writes — batch then sync:**
```python
# Write all files, sync once at the end (not per-file)
for path, data in items:
    fs.write_file(path, data)
fs.sync_all()  # Single sync for entire batch
```

---

## Error Handling for Concurrency

```python
from lucidlink import LucidLinkError, FilespaceError

# Robust concurrent read pattern
def safe_read(fs, path):
    try:
        return fs.read_file(path)
    except RuntimeError as e:
        if "Invalid file handle" in str(e):
            time.sleep(0.01)
            return fs.read_file(path)  # Retry once
        raise
    except FilespaceError as e:
        if "Locking" in str(e):
            time.sleep(0.1)
            return fs.read_file(path)  # Retry on lock contention
        raise
```
