import { $ } from "bun";
import { promises as fs } from "fs";

const GH_TOKEN = process.env.GH_TOKEN;
const SUPABASE_CONFIG_REFERENCE_URL = "https://raw.githubusercontent.com/supabase/supabase/refs/heads/master/docker/CONFIG.md";
const PGONRAILS_CONFIG_REFERENCE_URL = "https://raw.githubusercontent.com/BenIsenstein/pgonrails/refs/heads/main/CONFIG.md";
const COMMIT_MESSAGE = "chore: sync config reference";

async function main() {
    if (!GH_TOKEN) {
        throw new Error("GH_TOKEN is required.");
    }

    console.log("Fetching upstream and downstream config references...");

    const [supabaseConfigReference, pgonrailsConfigReference] = await Promise.all([
        fetchText(SUPABASE_CONFIG_REFERENCE_URL),
        fetchText(PGONRAILS_CONFIG_REFERENCE_URL),
    ]);

    if (supabaseConfigReference === pgonrailsConfigReference) {
        console.log("CONFIG.md is already in sync.");
        return;
    }

    console.log("Config reference changed. Syncing directly to main...");

    await $`rm -rf pgonrails`;
    await $`git clone ${`https://BenIsenstein:${GH_TOKEN}@github.com/BenIsenstein/pgonrails.git`}`;

    process.chdir("pgonrails");

    await $`git checkout main`;
    await $`git pull origin main`;
    await $`git config user.name "Ben Isenstein"`;
    await $`git config user.email "ben.isenstein@gmail.com"`;

    await fs.writeFile("CONFIG.md", supabaseConfigReference, { encoding: "utf8" });

    const gitStatus = await $`git status --porcelain`.text();

    if (gitStatus.length === 0) {
        console.log("No local changes detected after writing CONFIG.md.");
        return;
    }

    await $`git add CONFIG.md`;
    await $`git commit -m ${COMMIT_MESSAGE}`;
    await $`git push origin main`;

    console.log("CONFIG.md sync complete.");
}

async function fetchText(url: string) {
    const response = await fetch(url);

    if (!response.ok) {
        throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
    }

    return response.text();
}

main();
