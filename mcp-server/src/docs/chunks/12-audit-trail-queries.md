# Audit Trail Analytics — OpenSearch Query Patterns

## Using MCP tools

The audit trail MCP server provides one parametric query tool that handles the OpenSearch DSL for you:

- `query_audit_events` with a `mode` parameter:
  - `mode: 'search'` — filtered search with user, action, file_path, time range
  - `mode: 'aggregate'` — counts grouped by user, action, path, or time (set `group_by`)
  - `mode: 'user_activity'` — timeline of a specific user's operations (set `user`)
  - `mode: 'file_history'` — all operations on a specific file/directory (set `file_path`)
- `run_opensearch_query` — raw OpenSearch query DSL for advanced use

## Common query patterns

### Recent file deletions
```json
{
  "query": {
    "bool": {
      "must": [
        {"term": {"operation.action.keyword": "FileDelete"}},
        {"range": {"@timestamp": {"gte": "now-24h"}}}
      ]
    }
  },
  "sort": [{"@timestamp": {"order": "desc"}}]
}
```

### Activity by specific user
```json
{
  "query": {
    "bool": {
      "must": [
        {"term": {"user.name.keyword": "alice.smith"}},
        {"range": {"@timestamp": {"gte": "now-7d"}}}
      ]
    }
  },
  "sort": [{"@timestamp": {"order": "desc"}}]
}
```

### Operations on a path (prefix match)
```json
{
  "query": {
    "prefix": {"operation.entryPath.keyword": "/Projects/video/"}
  }
}
```

### Count events by action type
```json
{
  "size": 0,
  "aggs": {
    "by_action": {
      "terms": {"field": "operation.action.keyword"}
    }
  }
}
```

### Activity over time (date histogram)
```json
{
  "size": 0,
  "query": {"range": {"@timestamp": {"gte": "now-7d"}}},
  "aggs": {
    "over_time": {
      "date_histogram": {
        "field": "@timestamp",
        "fixed_interval": "1h"
      }
    }
  }
}
```

### Top users by event count
```json
{
  "size": 0,
  "aggs": {
    "top_users": {
      "terms": {"field": "user.name.keyword", "size": 20}
    }
  }
}
```

### Full-text search across paths
```json
{
  "query": {
    "multi_match": {
      "query": "quarterly report",
      "fields": ["operation.entryPath", "operation.file"]
    }
  }
}
```

### Combined: deletions by user in path
```json
{
  "query": {
    "bool": {
      "must": [
        {"term": {"operation.action.keyword": "FileDelete"}},
        {"term": {"user.name.keyword": "bob.jones"}},
        {"prefix": {"operation.entryPath.keyword": "/Shared/"}}
      ]
    }
  }
}
```

## Time range shortcuts

| Range | Description |
|-------|-------------|
| `now-1h` | Last hour |
| `now-24h` | Last 24 hours |
| `now-7d` | Last 7 days |
| `now-30d` | Last 30 days |
| `now/d` | Start of today |
| `2026-01-01/2026-01-31` | Specific date range |

## Query tips

- Always use `.keyword` fields for `term`, `terms`, and `prefix` queries
- Use `match` or `multi_match` for full-text search (analyzes the query)
- Set `size: 0` when you only need aggregation results
- Use `sort` with `@timestamp` for chronological ordering
- Combine `must`, `should`, `must_not`, and `filter` in `bool` queries
