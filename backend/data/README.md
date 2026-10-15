# Runtime data

The engine writes here at runtime and deletes it again when jobs expire:

```
uploads/            takes sent to /api/{analyze,upload,render,polish}
renders/            finished WAVs, streamed from /api/render/{id}/audio
voxshift.sqlite3    job metadata, saved voices, projects, activity log
```

Nothing in this folder is source: it is safe to delete between runs (or point
`VOXSHIFT_DATA_DIR` somewhere else entirely). Clean it up on demand with
`POST /api/maintenance/purge`, or let the background sweep handle expiry
(`VOXSHIFT_TTL_MINUTES`, default 360).
