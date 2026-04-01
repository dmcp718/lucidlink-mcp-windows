# LucidLink Python SDK — Connect (External Files & Data Stores)

## Overview

LucidLink Connect allows linking external S3 objects as read-only files within a filespace. This enables referencing large datasets stored in S3 without copying them into the filespace.

Access via `filespace.connect` (lazy-initialized `ConnectManager`).

---

## ConnectManager

**Module:** `lucidlink.connect`

### Data Store Management

#### `add_data_store(name: str, config: S3DataStoreConfig) -> None`
Register an S3 bucket as a named data store.

```python
from lucidlink import S3DataStoreConfig

config = S3DataStoreConfig(
    access_key="AKIA...",
    secret_key="secret...",
    bucket_name="my-dataset-bucket",
    region="us-east-1"
)
filespace.connect.add_data_store("my-store", config)
```

#### `remove_data_store(name: str) -> None`
Remove a data store. Must unlink all files first.

#### `list_data_stores() -> List[DataStoreInfo]`
List all registered data stores.

```python
for store in filespace.connect.list_data_stores():
    print(f"{store.bucket_name} ({store.region})")
```

#### `get_data_store(name: str) -> Optional[DataStoreInfo]`
Get a specific data store by name. Returns None if not found.

#### `rekey_data_store(name: str, new_access_key: str, new_secret_key: str) -> None`
Rotate S3 credentials for a data store.

```python
filespace.connect.rekey_data_store("my-store", "AKIA_NEW...", "new_secret...")
```

### External File Operations

#### `link_file(file_path: str, data_store_name: str, object_id: str, size: Optional[int] = None, checksum: str = "") -> None`
Link an S3 object as a read-only file in the filespace.

| Parameter | Type | Description |
|-----------|------|-------------|
| `file_path` | str | Path in filespace where file appears |
| `data_store_name` | str | Name of registered data store |
| `object_id` | str | S3 object key |
| `size` | Optional[int] | File size (auto-detected if omitted) |
| `checksum` | str | Optional checksum for verification |

```python
filespace.connect.link_file(
    file_path="/datasets/train.csv",
    data_store_name="my-store",
    object_id="datasets/v2/train.csv",
    size=1048576
)
```

#### `unlink_file(file_path: str) -> None`
Remove an external file link from the filespace.

```python
filespace.connect.unlink_file("/datasets/train.csv")
```

#### `list_external_files(data_store_name: str, limit: int = 100, cursor: str = "") -> LinkedFilesResult`
Paginated listing of linked files for a data store.

```python
result = filespace.connect.list_external_files("my-store", limit=50)
for path, file_id in zip(result.file_paths, result.file_ids):
    print(f"{path} (id: {file_id})")

# Pagination
while result.has_more:
    result = filespace.connect.list_external_files("my-store", limit=50, cursor=result.cursor)
    for path in result.file_paths:
        print(path)
```

#### `count_external_files(data_store_name: str) -> int`
Fast count of linked files (no path resolution overhead).

```python
count = filespace.connect.count_external_files("my-store")
print(f"Linked files: {count}")
```

#### `is_enabled() -> bool`
Check if Connect is available for this filespace.

---

## S3DataStoreConfig

**Module:** `lucidlink.connect_models`

```python
@dataclass
class S3DataStoreConfig:
    access_key: str                    # AWS access key ID
    secret_key: str                    # AWS secret access key
    bucket_name: str                   # S3 bucket name
    region: str                        # AWS region (e.g., "us-east-1")
    endpoint_override: str = ""        # Custom S3 endpoint (MinIO, etc.)
    use_https: bool = True             # Use HTTPS for S3 connections
    use_virtual_addressing: bool = True  # Virtual vs path-style addressing
    url_expiration_minutes: int = 10080  # Presigned URL lifetime (default: 7 days)
```

### Custom S3-Compatible Endpoint (MinIO, etc.)

```python
config = S3DataStoreConfig(
    access_key="minioadmin",
    secret_key="minioadmin",
    bucket_name="my-bucket",
    region="us-east-1",
    endpoint_override="http://localhost:9000",
    use_https=False,
    use_virtual_addressing=False  # Path-style for MinIO
)
```

---

## DataStoreInfo

**Module:** `lucidlink.connect_models`

Returned by `list_data_stores()` and `get_data_store()`. Contains encrypted S3 credentials and configuration.

### Properties

| Property | Type | Description |
|----------|------|-------------|
| `bucket_name` | str | S3 bucket |
| `region` | str | AWS region |
| `access_key` | str | AWS access key |
| `secret_key` | str | AWS secret key |
| `endpoint_override` | str | Custom endpoint |
| `use_https` | bool | HTTPS enabled |
| `use_virtual_addressing` | bool | Addressing style |
| `url_expiration_minutes` | int | Presigned URL lifetime |

---

## LinkedFilesResult

**Module:** `lucidlink.connect_models`

```python
@dataclass
class LinkedFilesResult:
    file_paths: List[str]     # Paginated file paths
    file_ids: List[int]       # File IDs (parallel to paths)
    has_more: bool            # More results available
    cursor: str               # Pagination token for next page
```

---

## Full Connect Workflow Example

```python
import lucidlink

daemon = lucidlink.create_daemon(sandboxed=True)
daemon.start()

try:
    creds = lucidlink.ServiceAccountCredentials(token="sa_live:...")
    workspace = daemon.authenticate(creds)
    filespace = workspace.link_filespace(name="ml-data")

    # Check Connect availability
    if filespace.connect.is_enabled():
        # Register S3 data store
        config = lucidlink.S3DataStoreConfig(
            access_key="AKIA...",
            secret_key="secret...",
            bucket_name="ml-datasets",
            region="us-east-1"
        )
        filespace.connect.add_data_store("datasets", config)

        # Link S3 objects as files
        filespace.connect.link_file("/train/data.parquet", "datasets", "v3/train.parquet")
        filespace.connect.link_file("/test/data.parquet", "datasets", "v3/test.parquet")

        # Read linked file (streamed via presigned URL)
        with filespace.open("/train/data.parquet", "rb") as f:
            import pandas as pd
            df = pd.read_parquet(f)

        # Cleanup
        filespace.connect.unlink_file("/train/data.parquet")
        filespace.connect.unlink_file("/test/data.parquet")
        filespace.connect.remove_data_store("datasets")
finally:
    daemon.stop()
```
