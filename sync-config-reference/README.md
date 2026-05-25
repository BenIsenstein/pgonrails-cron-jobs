# pgonrails-cron-sync-config-reference

This is a small Bun script to keep `CONFIG.md` in [PG On Rails](https://github.com/BenIsenstein/pgonrails) in sync with the official Supabase config reference at `docker/CONFIG.md`.

When the files differ, this job clones `BenIsenstein/pgonrails`, replaces `CONFIG.md` with the upstream Supabase content, commits the change, and pushes directly to `main`.

Required environment variables:
- `GH_TOKEN`
