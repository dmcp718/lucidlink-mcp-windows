# LucidLink Python SDK — Connect (External Files & Data Stores)

**Version:** 0.8.10

## Overview

LucidLink Connect attaches external S3 objects as read-only files inside a
filespace. The filespace hands presigned URLs to the daemon, so large datasets
are referenced in place rather than copied into the filespace.

Access the feature via `filespace.connect`, which returns a lazily-initialized
`ConnectManager`. A call to `filespace.sync_all()` is required after every
add / link / unlink / remove before other clients see the change.

Top-level symbols (all importable directly from `lucidlink`):
`ConnectManager`, `S3DataStoreConfig`, `DataStoreInfo`, `LinkedFilesResult`,
`DataStoreKind`, `DataStoreRekeyState`, `S3Credentials`, `DataStoreCredentials`.

---

## ConnectManager

**Module:** `lucidlink.connect` (also re-exported as `lucidlink.ConnectManager`).

Construction is internal — always access via `filespace.connect`.

### Availability check

```python
ConnectManager.are_data_stores_available(self) -> bool
```

Returns `True` only when the filespace's format version supports Connect
(filespace version V9+). Gate Connect workflows on this call:

```python
if not filespace.connect.are_data_stores_available():
    raise RuntimeError("Filespace does not support Connect — requires V9+")
```

### Data store management

#### `add_data_store(name: str, config: S3DataStoreConfig) -> DataStoreInfo`

Register an S3 bucket as a named data store. Returns the stored
`DataStoreInfo` (with a server-assigned `key_id`).

```python
from lucidlink import S3DataStoreConfig

config = S3DataStoreConfig(
    access_key="AKIA...",
    secret_key="secret...",
    bucket_name="my-dataset-bucket",
    region="us-east-1",
)
info = filespace.connect.add_data_store("my-store", config)
print(info.name, info.key_id)
filespace.sync_all()
```

#### `remove_data_store(name: str) -> None`

Remove a data store by name. All linked files must be unlinked first; call
`count_external_files(name)` to verify.

#### `list_data_stores() -> List[DataStoreInfo]`

List every registered data store. `secret_key` is blanked on each entry —
call `get_data_store(name)` to fetch a decrypted copy for a specific store.

```python
for store in filespace.connect.list_data_stores():
    print(f"{store.name}: {store.bucket_name} ({store.region}) kind={store.kind}")
```

#### `get_data_store(name: str) -> DataStoreInfo | None`

Fetch a single data store (with the decrypted `secret_key`). Returns `None`
if no store with that name exists.

#### `rekey_data_store(name, credentials=None, *, new_access_key=None, new_secret_key=None) -> None`

Rotate S3 credentials for a data store. Accepts either a typed
`S3Credentials` instance as the positional `credentials` argument or the
keyword-only `new_access_key` / `new_secret_key` pair (but not both).

```python
from lucidlink import S3Credentials

# Typed form
filespace.connect.rekey_data_store(
    "my-store",
    S3Credentials(access_key="AKIA_NEW...", secret_key="secret_new..."),
)

# Keyword form
filespace.connect.rekey_data_store(
    "my-store",
    new_access_key="AKIA_NEW...",
    new_secret_key="secret_new...",
)
```

Inspect `DataStoreInfo.rekey_state` (`DataStoreRekeyState.IN_PROGRESS` vs
`NO_REKEY`) to poll rotation progress.

### External file operations

#### `link_file(file_path, data_store_name, object_id, size=None, checksum='') -> None`

Link an S3 object as a read-only file inside the filespace.

| Parameter | Type | Description |
|-----------|------|-------------|
| `file_path` | `str` | Path in filespace where the linked file appears |
| `data_store_name` | `str` | Name of a registered data store |
| `object_id` | `str` | S3 object key (NOT the filespace path) |
| `size` | `int | None` | Optional size in bytes — skips a `HeadObject` round-trip when supplied |
| `checksum` | `str` | Optional checksum stored alongside the link |

```python
# Basic link (size auto-detected)
filespace.connect.link_file(
    file_path="/datasets/train.csv",
    data_store_name="my-store",
    object_id="datasets/v2/train.csv",
)

# Bulk link with pre-computed size + checksum — skips HeadObject
filespace.connect.link_file(
    "/data/large.bin", "my-store", "obj/key",
    size=1048576, checksum="abc123",
)
```

#### `unlink_file(file_path: str) -> None`

Remove one external-file link. The underlying S3 object is untouched.

```python
filespace.connect.unlink_file("/datasets/train.csv")
```

#### `list_external_files(data_store_name, limit=100, cursor='') -> LinkedFilesResult`

Paginated listing of linked files for a data store. Returns `LinkedFilesResult`
with parallel `file_paths` / `file_ids` lists and a `cursor` for continuation.

```python
result = filespace.connect.list_external_files("my-store", limit=50)
for path, file_id in zip(result.file_paths, result.file_ids):
    print(f"{path} (id: {file_id})")

# Pagination
while result.has_more:
    result = filespace.connect.list_external_files(
        "my-store", limit=50, cursor=result.cursor,
    )
    for path in result.file_paths:
        print(path)
```

#### `count_external_files(data_store_name: str) -> int`

Fast count of linked files — cheaper than iterating
`list_external_files()` when you only need the total.

```python
count = filespace.connect.count_external_files("my-store")
print(f"Linked files: {count}")
```

---

## S3DataStoreConfig

**Module:** `lucidlink.connect_models` (also re-exported as
`lucidlink.S3DataStoreConfig`).

```python
from lucidlink import S3DataStoreConfig

S3DataStoreConfig(
    access_key: str,
    secret_key: str,
    bucket_name: str,
    region: str,
    endpoint: str = "",            # Full URL, must start with http:// or https://
    url_expiration_minutes: int = 10080,   # 7 days
    use_virtual_addressing: bool = False,
)
```

- `endpoint=""` (the default) uses AWS S3 over HTTPS.
- To target a non-AWS S3-compatible endpoint, pass the full URL (must start with `http://` or `https://`).
- `use_virtual_addressing` toggles virtual-hosted-style addressing.

---

## S3Credentials / DataStoreCredentials

**Module:** `lucidlink.connect_models` (re-exported as top-level
`lucidlink.S3Credentials` and `lucidlink.DataStoreCredentials`).

`S3Credentials` is the typed credentials object accepted by
`ConnectManager.rekey_data_store`. `DataStoreCredentials` is an alias for
`S3Credentials` — the two names are interchangeable in 0.8.10.

```python
from lucidlink import S3Credentials, DataStoreKind

creds = S3Credentials(
    access_key="AKIA...",
    secret_key="secret...",
    kind=DataStoreKind.S3,   # default; only value in 0.8.10
)
```

---

## DataStoreKind

**Module:** `lucidlink.connect_models` (re-exported at top level).

A `str`-based `Enum`. The only member defined in upstream:

| Member | Value | Description |
|--------|-------|-------------|
| `DataStoreKind.S3` | `"S3DataStore"` | Amazon S3 or S3-compatible storage |

---

## DataStoreRekeyState

**Module:** `lucidlink.connect_models` (re-exported at top level).

A `str`-based `Enum` describing rotation state for `DataStoreInfo.rekey_state`:

| Member | Value |
|--------|-------|
| `DataStoreRekeyState.NO_REKEY` | `"no_rekey"` |
| `DataStoreRekeyState.IN_PROGRESS` | `"in_progress"` |

---

## DataStoreInfo

**Module:** `lucidlink.connect_models`

Returned by `list_data_stores()`, `get_data_store()`, and
`add_data_store()`. All fields default to empty/zero so
`DataStoreInfo.from_dict(store: dict)` can be used for round-trip
deserialization.

| Property | Type | Description |
|----------|------|-------------|
| `name` | `str` | Data-store name |
| `access_key` | `str` | S3 access key |
| `secret_key` | `str` | S3 secret key (empty from `list_data_stores`; decrypted in `get_data_store`) |
| `bucket_name` | `str` | S3 bucket |
| `region` | `str` | AWS region |
| `endpoint` | `str` | Full endpoint URL (empty for AWS S3) |
| `url_expiration_minutes` | `int` | Presigned URL lifetime |
| `use_virtual_addressing` | `bool` | Addressing style |
| `kind` | `DataStoreKind` | `DataStoreKind.S3` in 0.8.10 |
| `key_id` | `str` | Server-assigned key identifier |
| `rekey_state` | `DataStoreRekeyState` | `NO_REKEY` or `IN_PROGRESS` |

---

## LinkedFilesResult

**Module:** `lucidlink.connect_models`

```python
@dataclass
class LinkedFilesResult:
    file_paths: List[str]     # Paginated file paths
    file_ids: List[int]       # File IDs (parallel to paths)
    has_more: bool            # True if more pages remain
    cursor: str               # Opaque pagination token
```

---

## Full Connect workflow

```python
import lucidlink

daemon = lucidlink.create_daemon()
daemon.start()

try:
    creds = lucidlink.ServiceAccountCredentials(token="sa_live:...")
    workspace = daemon.authenticate(creds)
    filespace = workspace.link_filespace(name="ml-data")

    if not filespace.connect.are_data_stores_available():
        raise RuntimeError("Connect requires filespace version V9+")

    # Register an S3 data store
    config = lucidlink.S3DataStoreConfig(
        access_key="AKIA...",
        secret_key="secret...",
        bucket_name="ml-datasets",
        region="us-east-1",
    )
    filespace.connect.add_data_store("datasets", config)
    filespace.sync_all()

    # Link S3 objects as files
    filespace.connect.link_file(
        "/train/data.parquet", "datasets", "v3/train.parquet",
    )
    filespace.connect.link_file(
        "/test/data.parquet", "datasets", "v3/test.parquet",
    )

    # Sync so the new paths appear in listings
    filespace.sync_all()

    # Read a linked file (streamed via presigned URL)
    with filespace.fs.open("/train/data.parquet", "rb") as f:
        import pandas as pd
        df = pd.read_parquet(f)

    # Cleanup
    filespace.connect.unlink_file("/train/data.parquet")
    filespace.connect.unlink_file("/test/data.parquet")
    filespace.sync_all()
    filespace.connect.remove_data_store("datasets")
    filespace.sync_all()

    filespace.unlink()
finally:
    daemon.stop()
```
