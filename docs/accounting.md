# Accounting & Usage Stats

## Monthly Ad/Project Counts

**Endpoint:** `GET /api/admin/stats`

Returns the count of ads (V3) and projects (V2) created in a given month. Useful for costing breakdowns.

### Usage

```
/api/admin/stats?m=YYYYMM
```

| Parameter | Format | Example | Description |
|-----------|--------|---------|-------------|
| `m` | `YYYYMM` | `202511` | Month to query (optional, defaults to current month) |

### Examples

```bash
# November 2025
curl http://localhost:3000/api/admin/stats?m=202511

# October 2025
curl http://localhost:3000/api/admin/stats?m=202510

# Current month
curl http://localhost:3000/api/admin/stats
```

### Response

```json
{
  "month": "2025-11",
  "v3": { "total": 150, "inMonth": 42 },
  "v2": { "total": 890, "inMonth": 67 },
  "combined": { "inMonth": 109 }
}
```

| Field | Description |
|-------|-------------|
| `month` | The queried month (YYYY-MM format) |
| `v3.total` | Total ads in V3 Redis (all time) |
| `v3.inMonth` | Ads created in the queried month |
| `v2.total` | Total projects in V2 Redis (all time) |
| `v2.inMonth` | Projects created in the queried month |
| `combined.inMonth` | Sum of V3 + V2 for the month |

### Notes

- V3 uses `createdAt` timestamp from `ad:{id}:meta`
- V2 uses `timestamp` field from `project_meta:{id}`
- All timestamps are compared in UTC
