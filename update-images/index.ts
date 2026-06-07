import { $ } from "bun";
import { promises as fs } from "fs";
import * as yaml from "js-yaml";

// Include custom docker compose yaml tag in the parser schema so it doesn't break
const ResetSeq = new yaml.Type('!reset', { kind: 'sequence', construct: (d) => d || [] });
const ResetMap = new yaml.Type('!reset', { kind: 'mapping', construct: (d) => d || {} });
const ResetScalar = new yaml.Type('!reset', { kind: 'scalar', construct: () => null });
const OverrideSeq = new yaml.Type('!override', { kind: 'sequence', construct: (d) => d || [] });
const OverrideMap = new yaml.Type('!override', { kind: 'mapping', construct: (d) => d || {} });
const OverrideScalar = new yaml.Type('!override', { kind: 'scalar', construct: () => null });
const schema = yaml.DEFAULT_SCHEMA.extend([ResetSeq, ResetMap, ResetScalar, OverrideSeq, OverrideMap, OverrideScalar]);

type SupabaseYAML = {
    services: {
        [service: string]: {
            image: string
        }
    }
}

const GH_TOKEN = process.env.GH_TOKEN;
const SUPABASE_DOCKER_COMPOSE_URL = "https://raw.githubusercontent.com/supabase/supabase/refs/heads/master/docker/docker-compose.yml";
const DOCKER_COMPOSE_URLS = [
    "https://raw.githubusercontent.com/supabase/supabase/refs/heads/master/docker/docker-compose.yml",
    "https://raw.githubusercontent.com/supabase/supabase/refs/heads/master/docker/docker-compose.caddy.yml",
    "https://raw.githubusercontent.com/supabase/supabase/refs/heads/master/docker/docker-compose.envoy.yml",
    "https://raw.githubusercontent.com/supabase/supabase/refs/heads/master/docker/docker-compose.logs.yml"
]

async function main() {
    const images: { [key: string]: string } = {};

    for (const url of DOCKER_COMPOSE_URLS) {
        // Fetch the raw content of the yaml files
        // Read the service image names into a map
        const yamlContent = await fetch(url).then((res) => res.text());
        const yamlObject: SupabaseYAML = yaml.load(yamlContent, { schema });
        
        for (const key in yamlObject.services) {
            if (yamlObject.services[key]!.image) {
                images[key] = yamlObject.services[key]!.image;

                if (key === "api-gw") {
                    images.envoy = yamlObject.services[key]!.image;
                }
            }
        }
    }

    // Configure git local identity
    await $`git config --global user.name "Ben Isenstein"`;
    await $`git config --global user.email "ben.isenstein@gmail.com"`;

    // Clone the pgonrails repo
    await $`rm -rf pgonrails`;
    await $`git clone "https://BenIsenstein:${GH_TOKEN}@github.com/BenIsenstein/pgonrails.git"`;
    process.chdir("pgonrails");

    console.log("Checking whether a branch for image updates has already been published...")

    let automationBranchExists = false
    let shouldFetchBranchesPage = true
    let branchesUrl = "https://api.github.com/repos/BenIsenstein/pgonrails/branches"
    let HEAD = ""

    while (!automationBranchExists && shouldFetchBranchesPage) {
        const branchesResponse = await fetch(
            branchesUrl,
            {
                method: "GET",
                headers: {
                    Accept: "application/vnd.github+json",
                    Authorization: `Bearer ${GH_TOKEN}`,
                    "X-GitHub-Api-Version": "2022-11-28"
                }
            }
        );

        if (!branchesResponse.ok) {
            throw new Error(
                `List Branches: GitHub API returned ${branchesResponse.status}: ${branchesResponse.statusText}`
            );
        }

        const branches = await branchesResponse.json() as { name: string }[];

        for (const branch of branches) {
            if (branch.name.startsWith("automation/update-image-versions-")) {
                automationBranchExists = true
                HEAD = branch.name
                break
            }
        }

        const linkHeader = branchesResponse.headers.get("link")

        if (!linkHeader) {
            shouldFetchBranchesPage = false
            break
        }

        const next = linkHeader.split(", ").find(link => link.endsWith("rel=\"next\""))
        
        if (next) {
            branchesUrl = next.slice(1, -13) // slice off "<" at the start, and ">; rel=\"next\"" at the end
        } else {
            shouldFetchBranchesPage = false
        }
    }

    if (automationBranchExists) {
        await $`git checkout ${HEAD}`;
    }

    // Replace the first line of each Dockerfile
    const DIRECTORIES = [
        "auth",
        "db",
        "functions",
        "imgproxy",
        "kong",
        "meta",
        "realtime",
        "rest",
        "storage",
        "studio",
        "analytics",
        "vector",
        "caddy",
        "envoy"
    ];

    for (const dir of DIRECTORIES) {
        if (!images[dir]) {
            continue
        }

        await overwriteFirstLine(`./${dir}/Dockerfile`, `FROM ${images[dir]}`);
    }

    // Check if any images have changed
    console.log("Checking if image versions have changed...");

    const gitStatus = await $`git status --porcelain`.text();

    if (gitStatus.length === 0) {
        console.log("No images have changed. PG On Rails is up-to-date!");
        return
    }

    if (automationBranchExists) {
        console.log(`Committing to existing branch "${HEAD}"...`)

        await $`git add .`;
        await $`git commit -m "chore: update image versions"`;
        await $`git push`;

        console.log("Update complete!");
        return
    }

    const today = new Date();
    HEAD = `automation/update-image-versions-${today.getUTCFullYear()}-${
    today.getUTCMonth() + 1
    }-${today.getUTCDate()}`;

    console.log(`Publishing new branch "${HEAD}"...`)
    
    await $`git add .`;
    await $`git checkout -b ${HEAD}`;
    await $`git commit -m "chore: update image versions"`;
    await $`git push -u origin HEAD`;

    console.log("Creating pull request...")

    const prResponse = await fetch(
        "https://api.github.com/repos/BenIsenstein/pgonrails/pulls",
        {
            method: "POST",
            headers: {
                Accept: "application/vnd.github+json",
                Authorization: `Bearer ${GH_TOKEN}`,
                "X-GitHub-Api-Version": "2022-11-28",
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                title: `Update image versions | ${today.toDateString()}`,
                body: `Syncing Docker image versions with Supabase's self-hosting example.\n\nhttps://github.com/supabase/supabase/tree/master/docker.`,
                head: HEAD,
                base: "main",
            }),
        }
    );

    if (!prResponse.ok) {
        throw new Error(
            `Create Pull Request: GitHub API returned ${prResponse.status}: ${prResponse.statusText}`
        );
    }

    const pr = await prResponse.json();
    console.log("Pull request:", pr);
    console.log("Update complete!");
}

async function overwriteFirstLine(filePath: string, replacement: string) {
  // read entire file into memory
  const raw = await fs.readFile(filePath, { encoding: "utf8" });
  // split on first newline (handles \r\n and \n)
  const newlineIndex = raw.search(/\r\n|\n/);
  let remainder = "";

  if (newlineIndex >= 0) {
    // keep the remainder
    remainder = raw.slice(newlineIndex);
  }

  // write back
  await fs.writeFile(filePath, replacement + remainder, { encoding: "utf8" });
}

main()