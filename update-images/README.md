# pgonrails-cron-update-images

This is a small Bun script to keep the docker images in [PG On Rails](https://github.com/BenIsenstein/pgonrails) up-to-date with the official Supabase self-hosting example. It takes advantage of Railway [PR environments](https://docs.railway.com/guides/environments#enable-pr-environments) to improve the speed at which I can maintain parity between PG On Rails and the complete self-hosting feature set.

When this script opens a PR in the official `/BenIsenstein/pgonrails` repo, a PR environemnt is automatically deployed by Railway, which I test manually before merging into `main`.

This project was created using `bun init` in bun v1.2.21. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.
