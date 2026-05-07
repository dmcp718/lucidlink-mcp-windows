# LucidLink Python SDK — Examples & Integrations

**Version:** 0.8.10

The canonical example repository is
[`LucidLink/lucidlink-python-sdk-examples`](https://github.com/LucidLink/lucidlink-python-sdk-examples).
It ships six runnable scripts under `examples/` plus an `llconnect` reference
tool under `tools/llconnect/`. Every snippet in this chunk mirrors a script
in that repository.

## Environment

All examples read service-account credentials from environment variables:

```bash
export LUCIDLINK_SA_TOKEN="sa_live:your_key"
export LUCIDLINK_FILESPACE="my-filespace"
export LUCIDLINK_WORKSPACE="my-workspace"   # fsspec-based examples only
```

Install the SDK (add the `fsspec` extra for the URL-based examples):

```bash
pip install lucidlink fsspec pandas pyarrow
# or
pip install "lucidlink[fsspec]" pandas pyarrow
```

---

## 01 — Quickstart (`01_quickstart.py`)

Minimum viable program: create a daemon, authenticate, link a filespace,
read/write one file, unlink and stop.

```python
import os
import lucidlink

token = os.environ["LUCIDLINK_SA_TOKEN"]
filespace_name = os.environ["LUCIDLINK_FILESPACE"]

daemon = lucidlink.create_daemon()
daemon.start()
try:
    creds = lucidlink.ServiceAccountCredentials(token=token)
    workspace = daemon.authenticate(creds)
    print(f"workspace: {workspace.name}")

    for fs_info in workspace.list_filespaces():
        print(f"  - {fs_info.name}")

    filespace = workspace.link_filespace(name=filespace_name)
    try:
        with filespace.fs.open("/quickstart.txt", "w") as f:
            f.write("hello from 0.8.10\n")

        with filespace.fs.open("/quickstart.txt", "r") as f:
            print(f.read())

        for entry in filespace.fs.read_dir("/"):
            tag = "dir" if entry.is_dir() else "file"
            print(f"  {entry.name} [{tag}] {entry.size} bytes")

        filespace.fs.delete("/quickstart.txt")
    finally:
        filespace.unlink()
finally:
    daemon.stop()
```

---

## 02 — File operations (`02_file_operations.py`)

Exhaustive tour of every `filespace.fs` method — `create_dir`, `dir_exists`,
`file_exists`, `read_dir`, `list_dir`, `delete_dir`, `write_file`,
`read_file`, `open`, `get_entry`, `get_size`, `get_statistics`, `move`,
`truncate`, `delete`.

```python
import lucidlink

DEMO = "/examples_demo"

daemon = lucidlink.create_daemon()
daemon.start()
try:
    creds = lucidlink.ServiceAccountCredentials(token=token)
    workspace = daemon.authenticate(creds)
    with workspace.link_filespace(name=filespace_name) as filespace:
        fs = filespace.fs

        fs.create_dir(DEMO)
        fs.write_file(f"{DEMO}/hello.txt", b"hello")
        assert fs.file_exists(f"{DEMO}/hello.txt")
        assert fs.read_file(f"{DEMO}/hello.txt") == b"hello"

        entry = fs.get_entry(f"{DEMO}/hello.txt")
        print(f"{entry.name} / size={entry.size} / type={entry.type}")

        # Stream I/O
        with fs.open(f"{DEMO}/stream.bin", "wb") as f:
            f.write(b"x" * 1024)
        with fs.open(f"{DEMO}/stream.bin", "rb") as f:
            f.seek(512)
            half = f.read(256)

        fs.move(f"{DEMO}/stream.bin", f"{DEMO}/stream_renamed.bin")
        fs.truncate(f"{DEMO}/stream_renamed.bin", 128)

        size = fs.get_size()
        stats = fs.get_statistics()
        print(f"entries={size.entries}  files={stats.file_count}")

        fs.delete_dir(DEMO, recursive=True)
finally:
    daemon.stop()
```

`with workspace.link_filespace(...) as filespace` relies on the native
`Filespace.__enter__` / `__exit__` — the filespace is automatically
unlinked (and `sync_all()` runs first if `sync_mode=SyncMode.SYNC_ALL`).

---

## 03 — File locking (`03_file_locking.py`)

Locks live on the open file handle. Pass `lock_type="shared"` or
`lock_type="exclusive"` to `filespace.fs.open()`; the lock is released
when the handle is closed.

```python
# Shared (reader) lock — multiple readers allowed
with filespace.fs.open("/locking_demo/data.bin", "rb", lock_type="shared") as f:
    data = f.read()

# Exclusive (writer) lock — blocks everybody else until close
with filespace.fs.open("/locking_demo/data.bin", "wb", lock_type="exclusive") as f:
    f.write(b"updated")

# Read-modify-write under an exclusive lock
with filespace.fs.open("/locking_demo/data.bin", "r+b", lock_type="exclusive") as f:
    existing = f.read()
    f.seek(0)
    f.write(existing.upper())
    f.truncate()
```

The underlying `Filesystem` also exposes a low-level byte-range locking API
(`lock_byte_range` / `unlock_byte_range` / `unlock_all_byte_ranges` keyed on
a handle ID) for cross-daemon coordination; see chunk 10.

---

## 04 — Connect (S3 external files) (`04_connect_s3.py`)

Attach S3 objects as read-only files via `filespace.connect`. Requires a
filespace of version V9+ — call
`filespace.connect.are_data_stores_available()` to gate the workflow.

```python
import os
import lucidlink

endpoint = os.environ.get("S3_ENDPOINT", "")
bucket   = os.environ["S3_BUCKET"]
access   = os.environ["S3_ACCESS_KEY"]
secret   = os.environ["S3_SECRET_KEY"]
region   = os.environ.get("S3_REGION", "us-east-1")

daemon = lucidlink.create_daemon()
daemon.start()
try:
    creds = lucidlink.ServiceAccountCredentials(token=token)
    workspace = daemon.authenticate(creds)
    filespace = workspace.link_filespace(name=filespace_name)
    try:
        if not filespace.connect.are_data_stores_available():
            raise RuntimeError("Connect requires filespace version V9+")

        config = lucidlink.S3DataStoreConfig(
            access_key=access,
            secret_key=secret,
            bucket_name=bucket,
            region=region,
            endpoint=endpoint,                # full URL, or "" for AWS S3
            use_virtual_addressing=False,
        )
        filespace.connect.add_data_store("my-store", config)
        filespace.sync_all()

        # Link an object
        filespace.connect.link_file(
            file_path="/datasets/train.csv",
            data_store_name="my-store",
            object_id="datasets/v2/train.csv",
        )
        filespace.sync_all()

        # Inspect
        result = filespace.connect.list_external_files("my-store", limit=50)
        print(f"{len(result.file_paths)} linked files, has_more={result.has_more}")

        # Cleanup
        filespace.connect.unlink_file("/datasets/train.csv")
        filespace.sync_all()
        filespace.connect.remove_data_store("my-store")
        filespace.sync_all()
    finally:
        filespace.unlink()
finally:
    daemon.stop()
```

See chunk 05 for full Connect reference.

---

## 05 — fsspec operations (`05_fsspec_operations.py`)

Use the SDK as a normal fsspec filesystem. No explicit daemon code —
everything is driven by `storage_options`.

```python
import os
import fsspec

token     = os.environ["LUCIDLINK_SA_TOKEN"]
workspace = os.environ["LUCIDLINK_WORKSPACE"]
filespace = os.environ["LUCIDLINK_FILESPACE"]

fs = fsspec.filesystem("lucidlink", token=token)

base = f"lucidlink://{workspace}/{filespace}"
fs.makedirs(f"{base}/fsspec_demo", exist_ok=True)

with fs.open(f"{base}/fsspec_demo/hello.txt", "wb") as f:
    f.write(b"hello from fsspec")

info = fs.info(f"{base}/fsspec_demo/hello.txt")
print(info["size"], info["type"])

print(fs.exists(f"{base}/fsspec_demo/hello.txt"))
print(fs.isfile(f"{base}/fsspec_demo/hello.txt"))

for entry in fs.ls(f"{base}/fsspec_demo", detail=True):
    print(entry["name"], entry["size"], entry["type"])

fs.mv(
    f"{base}/fsspec_demo/hello.txt",
    f"{base}/fsspec_demo/hello_renamed.txt",
)

fs.rm(f"{base}/fsspec_demo", recursive=True)
fs.close()

# URL form with fsspec.open()
with fsspec.open(
    f"{base}/quick.txt", "wb", token=token,
) as f:
    f.write(b"quick write via fsspec.open()")
```

---

## 06 — fsspec + pandas (`06_fsspec_integration.py`)

Two equivalent approaches to reading/writing Parquet/CSV/JSON Lines.

### Approach 1 — direct SDK, pass the file handle to pandas

```python
import lucidlink
import pandas as pd

DEMO = "/pandas_demo"

daemon = lucidlink.create_daemon()
daemon.start()
try:
    creds = lucidlink.ServiceAccountCredentials(token=token)
    workspace = daemon.authenticate(creds)
    with workspace.link_filespace(name=filespace_name) as filespace:
        filespace.fs.create_dir(DEMO)

        df = pd.DataFrame({"a": range(5), "b": list("abcde")})

        # CSV
        with filespace.fs.open(f"{DEMO}/data.csv", "w") as f:
            df.to_csv(f, index=False)
        with filespace.fs.open(f"{DEMO}/data.csv", "r") as f:
            loaded = pd.read_csv(f)

        # Parquet — binary mode is required
        with filespace.fs.open(f"{DEMO}/data.parquet", "wb") as f:
            df.to_parquet(f, engine="pyarrow", compression="snappy")
        with filespace.fs.open(f"{DEMO}/data.parquet", "rb") as f:
            loaded = pd.read_parquet(f, engine="pyarrow")

        # JSON Lines
        with filespace.fs.open(f"{DEMO}/data.jsonl", "w") as f:
            df.to_json(f, orient="records", lines=True)
        with filespace.fs.open(f"{DEMO}/data.jsonl", "r") as f:
            loaded = pd.read_json(f, orient="records", lines=True)

        # Chunked CSV
        with filespace.fs.open(f"{DEMO}/data.csv", "r") as f:
            for chunk in pd.read_csv(f, chunksize=2):
                print(chunk.shape)

        filespace.fs.delete_dir(DEMO, recursive=True)
finally:
    daemon.stop()
```

### Approach 2 — URL-based, no daemon code

```python
import fsspec
import pandas as pd

storage_opts = {"token": token}
base = f"lucidlink://{workspace}/{filespace}/pandas_url_demo"

df = pd.DataFrame({"a": range(5), "b": list("abcde")})

df.to_csv(f"{base}/data.csv", index=False, storage_options=storage_opts)
pd.read_csv(f"{base}/data.csv", storage_options=storage_opts)

df.to_parquet(f"{base}/data.parquet", index=False, storage_options=storage_opts)
pd.read_parquet(f"{base}/data.parquet", storage_options=storage_opts)

df.to_json(f"{base}/data.jsonl", orient="records", lines=True,
           storage_options=storage_opts)
pd.read_json(f"{base}/data.jsonl", orient="records", lines=True,
             storage_options=storage_opts)

# Cleanup
fsspec.filesystem("lucidlink", **storage_opts).rm(base, recursive=True)
```

---

## `llconnect` reference tool

The upstream examples repository includes `tools/llconnect/` (with
`tools/llconnect.py`) — a reference command-line wrapper around the Connect
APIs documented in chunk 05. See the upstream repository for current usage.
