# LucidLink Python SDK — Examples & Integrations

## Basic Streaming (basic_streaming.py)

### Binary Read/Write

```python
import lucidlink

daemon = lucidlink.create_daemon(sandboxed=True)
daemon.start()
creds = lucidlink.ServiceAccountCredentials(token="sa_live:...")
workspace = daemon.authenticate(creds)
filespace = workspace.link_filespace(name="data")

# Write binary
with filespace.open("/test.bin", "wb") as f:
    f.write(b"Hello, binary world!")

# Read binary
with filespace.open("/test.bin", "rb") as f:
    data = f.read()
    print(data)  # b"Hello, binary world!"

filespace.sync_all()
daemon.stop()
```

### Text Mode

```python
# Write text
with filespace.open("/notes.txt", "wt", encoding="utf-8") as f:
    f.write("Line 1\n")
    f.write("Line 2\n")

# Read text
with filespace.open("/notes.txt", "rt", encoding="utf-8") as f:
    for line in f:
        print(line.strip())
```

### Chunked Reading (Large Files)

```python
with filespace.open("/large_file.bin", "rb") as f:
    while True:
        chunk = f.read(1024 * 1024)  # 1MB chunks
        if not chunk:
            break
        process(chunk)
```

### Seek & Random Access

```python
with filespace.open("/data.bin", "rb") as f:
    f.seek(100)             # Jump to byte 100
    header = f.read(50)     # Read 50 bytes
    pos = f.tell()          # pos = 150
    f.seek(-10, 2)          # 10 bytes before end
    tail = f.read()         # Read to end
```

### Append Mode

```python
with filespace.open("/log.txt", "ab") as f:
    f.write(b"2025-01-15 10:30:00 Event occurred\n")
```

---

## Pandas Integration (streaming_with_pandas.py)

### CSV

```python
import pandas as pd

# Read CSV via streaming
with filespace.open("/data.csv", "rb") as f:
    df = pd.read_csv(f)

# Write CSV
with filespace.open("/output.csv", "wb") as f:
    df.to_csv(f, index=False)
```

### Parquet

```python
# Read Parquet
with filespace.open("/data.parquet", "rb") as f:
    df = pd.read_parquet(f)

# Write Parquet
with filespace.open("/output.parquet", "wb") as f:
    df.to_parquet(f, index=False)
```

### Excel

```python
# Read Excel
with filespace.open("/report.xlsx", "rb") as f:
    df = pd.read_excel(f)
```

### Chunked Processing

```python
# Process large CSV in chunks
with filespace.open("/big_data.csv", "rb") as f:
    for chunk_df in pd.read_csv(f, chunksize=10000):
        result = chunk_df.groupby("category").sum()
        # Process each chunk
```

### JSON Lines

```python
# Read JSON Lines
with filespace.open("/events.jsonl", "rb") as f:
    df = pd.read_json(f, lines=True)

# Write JSON Lines
with filespace.open("/output.jsonl", "wb") as f:
    df.to_json(f, orient="records", lines=True)
```

---

## Pandas via fsspec (URL-based)

```python
import pandas as pd

storage_options = {"token": "sa_live:..."}

# Direct URL-based access — no manual open() needed
df = pd.read_csv("lucidlink://workspace/filespace/data.csv",
                  storage_options=storage_options)

df.to_parquet("lucidlink://workspace/filespace/output.parquet",
              storage_options=storage_options)
```

---

## AI/ML Integration (streaming_with_ai_ml.py)

### PyTorch Custom Dataset

```python
import torch
from torch.utils.data import Dataset, DataLoader

class LucidLinkDataset(Dataset):
    def __init__(self, filespace, data_dir):
        self.filespace = filespace
        entries = filespace.read_dir(data_dir)
        self.files = [e['path'] for e in entries if not e['is_directory']]

    def __len__(self):
        return len(self.files)

    def __getitem__(self, idx):
        with self.filespace.open(self.files[idx], "rb") as f:
            data = torch.load(f)
        return data

# Usage
dataset = LucidLinkDataset(filespace, "/training_data")
loader = DataLoader(dataset, batch_size=32, num_workers=0)
for batch in loader:
    train_step(batch)
```

### Model Checkpoint Save/Load

```python
import torch

# Save model
with filespace.open("/models/checkpoint.pt", "wb") as f:
    torch.save({
        'epoch': epoch,
        'model_state_dict': model.state_dict(),
        'optimizer_state_dict': optimizer.state_dict(),
        'loss': loss,
    }, f)

# Load model
with filespace.open("/models/checkpoint.pt", "rb") as f:
    checkpoint = torch.load(f)
    model.load_state_dict(checkpoint['model_state_dict'])
```

### NumPy Arrays

```python
import numpy as np
import io

# Save array
with filespace.open("/arrays/data.npy", "wb") as f:
    np.save(f, my_array)

# Load array
with filespace.open("/arrays/data.npy", "rb") as f:
    array = np.load(f)
```

### LangChain Document Loading

```python
from langchain.schema import Document

# Load documents for RAG
with filespace.open("/docs/knowledge.txt", "rt", encoding="utf-8") as f:
    content = f.read()
    doc = Document(page_content=content, metadata={"source": "knowledge.txt"})
```

### Hugging Face Tokenizer

```python
from transformers import AutoTokenizer

tokenizer = AutoTokenizer.from_pretrained("bert-base-uncased")

with filespace.open("/text/corpus.txt", "rt", encoding="utf-8") as f:
    text = f.read()
    tokens = tokenizer(text, return_tensors="pt")
```

---

## LLConnect CLI

Command-line tool built on top of the SDK for managing external data stores and linked files.

### Store Management

```bash
# Create S3 data store
llconnect create-store --token sa_live:... --filespace fs.ws \
    --bucket my-bucket --region us-east-1 \
    --access-key AKIA... --secret-key ...

# List stores
llconnect list-stores --token sa_live:... --filespace fs.ws

# Remove store
llconnect remove-store --token sa_live:... --filespace fs.ws --name my-store

# Rotate credentials
llconnect rekey-store --token sa_live:... --filespace fs.ws --name my-store \
    --access-key AKIA_NEW... --secret-key ...

# Cleanup empty/stale stores
llconnect cleanup-stores --token sa_live:... --filespace fs.ws
```

### File Operations

```bash
# Link single S3 object
llconnect link --token sa_live:... --path lucidlink://ws/fs/data.csv \
    --object-key path/to/data.csv

# Unlink file
llconnect unlink --token sa_live:... --path lucidlink://ws/fs/data.csv

# Mirror entire S3 prefix
llconnect mirror --token sa_live:... --path lucidlink://ws/fs/ \
    --prefix "dataset/"
```
