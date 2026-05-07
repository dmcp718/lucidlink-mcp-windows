# LucidLink Python SDK — File Locking

**Version:** 0.8.10

## Overview

The SDK provides two levels of file locking, both coordinated through the LucidHub for cross-client mutual exclusion:

1. **On-open locking** (`lock_type` parameter on `Filesystem.open()`) — simple, recommended for most use cases.
2. **Byte-range locking** (`Filesystem.lock_byte_range` / `unlock_byte_range` / `unlock_all_byte_ranges`) — fine-grained, for advanced distributed coordination.

All locks are enforced across every connected client and daemon accessing the filespace.

---

## On-Open Locking (Recommended)

Pass `lock_type` to `filespace.fs.open()`. The lock is held for the lifetime of the file handle and released automatically on close.

Full signature (from introspection):

```text
Filesystem.open(
    path: str,
    mode: str = 'rb',
    buffering: int = -1,
    encoding: str | None = None,
    errors: str | None = None,
    newline: str | None = None,
    lock_type: str = '',
) -> LucidFileStream | BufferedReader | BufferedWriter | TextIOWrapper
```

Stream-level helpers `lucidlink.open_buffered(fs_wrapper, path, mode='rb', buffer_size=131072, lock_type='')` and `lucidlink.open_text(fs_wrapper, path, mode='r', encoding='utf-8', errors='strict', newline=None, lock_type='')` accept the same `lock_type` kwarg.

### Shared Lock (Concurrent Readers)

Multiple clients can hold a shared lock simultaneously. Use for read-only access when you want to prevent writers from modifying the file.

```python
with filespace.fs.open("/data.csv", "rb", lock_type="shared") as f:
    data = f.read()
# Lock released automatically
```

### Exclusive Lock (Single Writer)

Only one client can hold an exclusive lock. Blocks all other readers and writers. Use for write operations that must be atomic.

```python
with filespace.fs.open("/db.sqlite", "r+b", lock_type="exclusive") as f:
    content = f.read()
    f.seek(0)
    f.write(updated_content)
    f.truncate()
# Lock released automatically
```

### Lock Types

| `lock_type` | Behavior |
|-------------|----------|
| `""` (default) | No lock — file can be read/written by anyone concurrently |
| `"shared"` | Shared read lock — multiple readers, no writers |
| `"exclusive"` | Exclusive lock — single holder, no other readers or writers |

### Text Mode with Locking

```python
with filespace.fs.open("/config.json", "rt", lock_type="shared", encoding="utf-8") as f:
    config = json.load(f)

with filespace.fs.open("/config.json", "wt", lock_type="exclusive", encoding="utf-8") as f:
    json.dump(updated_config, f)
```

---

## Byte-Range Locking (Advanced)

For fine-grained locking on specific regions of an already-open file. Requires a low-level integer handle ID obtained from `Filesystem.create()` (or the native-layer open; see below).

### `Filesystem.lock_byte_range(handle_id, offset, length, lock_type='exclusive', blocking=True) -> bool`

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `handle_id` | `int` | — | File handle ID returned by `Filesystem.create()` |
| `offset` | `int` | — | Start offset of the byte range (0 for whole file) |
| `length` | `int` | — | Length of the byte range in bytes |
| `lock_type` | `str` | `'exclusive'` | `'shared'` or `'exclusive'` |
| `blocking` | `bool` | `True` | If `True`, wait for the lock; if `False`, return immediately. |

**Returns:** `True` if the lock was acquired, `False` if non-blocking and the lock is held elsewhere.

### `Filesystem.unlock_byte_range(handle_id, offset, length) -> None`

Release a previously acquired lock on the specified byte range. Raises `RuntimeError` on invalid handle.

### `Filesystem.unlock_all_byte_ranges(handle_id) -> None`

Release every byte-range lock currently held by this handle.

### Example — read-modify-write on a region

Prefer the high-level `Filesystem.open()` API with `lock_type="exclusive"` for whole-file coordination. Reach for byte-range locking only when you need to coordinate distinct regions concurrently. To hold the lock across reads and writes, pair it with a `Filesystem.open()` handle so you can issue reads/writes through the Python file object while the lock is held:

```python
# Low-level byte-range locking via an explicit handle id
handle_id = filespace.fs.create("/shared/ledger.bin")
try:
    # Lock first 4 KiB exclusively, blocking until acquired
    got = filespace.fs.lock_byte_range(
        handle_id, offset=0, length=4096,
        lock_type="exclusive", blocking=True,
    )
    if got:
        # ... coordinate with other clients while we hold bytes 0–4095 ...
        filespace.fs.unlock_byte_range(handle_id, offset=0, length=4096)
finally:
    # handle_id is cleaned up when the owning daemon tears the filespace down
    filespace.fs.unlock_all_byte_ranges(handle_id)
```

### Non-Blocking Lock Attempt

```python
handle_id = filespace.fs.create("/shared/resource.dat")
acquired = filespace.fs.lock_byte_range(
    handle_id, offset=0, length=1,
    lock_type="exclusive", blocking=False,
)
if acquired:
    # Got the lock — do exclusive work
    filespace.fs.unlock_byte_range(handle_id, 0, 1)
else:
    # Lock held by another client — skip or retry later
    print("Resource busy, trying again later")
```

---

## When to Use Which Locking Approach

| Scenario | Approach |
|----------|----------|
| Prevent writes during read | `lock_type="shared"` on `open()` |
| Atomic read-modify-write | `lock_type="exclusive"` on `open()` |
| Lock specific file regions | Byte-range locking API |
| Non-blocking lock check | `lock_byte_range(..., blocking=False)` |
