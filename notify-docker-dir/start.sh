#!/bin/sh
set -eu

if [ -f "./.env" ]; then
    . "./.env"
fi

if [ -z "${WORKDIR:-}" ]; then
    echo "No WORKDIR found in environment. Operation cancelled."
    exit 1
fi

if [ -z "${SMTP_USER:-}" ]; then
    echo "No SMTP_USER found in environment. Operation cancelled."
    exit 1
fi

if [ -z "${SMTP_PASS:-}" ]; then
    echo "No SMTP_PASS found in environment. Operation cancelled."
    exit 1
fi

if [ ! -d "$WORKDIR" ]; then
    mkdir -p "$WORKDIR"
fi

if [ ! -f "$WORKDIR/previoushead.txt" ]; then
    touch "$WORKDIR/previoushead.txt"
fi

previous_head=$(cat "$WORKDIR/previoushead.txt")
current_head=$(git ls-remote https://github.com/supabase/supabase.git refs/heads/master | cut -f1)

if [ -z "$previous_head" ]; then
    echo "Saving current HEAD for the first time..."
    printf %s "$current_head" > "$WORKDIR/previoushead.txt"
    echo "Success!"
    exit 0
fi

if [ "$current_head" = "$previous_head" ]; then
    echo "Nothing has changed!"
    exit 0
fi

echo "Supabase remote HEAD has updated! Checking for relevant changes locally..."

if [ -d "$WORKDIR/supabase/.git" ]; then
    echo "Found legacy full working-tree clone, removing in favor of a bare blobless mirror..."
    rm -rf "$WORKDIR/supabase"
fi

if [ -d "$WORKDIR/supabase" ]; then
    git --git-dir="$WORKDIR/supabase" fetch --filter=blob:none origin +master:master
else
    git clone --bare --filter=blob:none --single-branch --branch master https://github.com/supabase/supabase "$WORKDIR/supabase"
fi

if [ -z "$(git --git-dir="$WORKDIR/supabase" diff --name-only "$previous_head" master -- docker)" ]; then
    echo "Nothing has changed in /docker!"
else
    echo "New changes in /docker! Notifying via email..."
    printf "From: \"PG On Rails\" <%s>\nSubject: New changes in \"/supabase/docker\"\n\nhttps://github.com/supabase/supabase/tree/master/docker\n\nSent securely via curl." "$SMTP_USER" | \
    curl --url 'smtps://smtp.gmail.com:465' \
        --mail-rcpt 'ben.isenstein@gmail.com' \
        --mail-from "$SMTP_USER" \
        --user "$SMTP_USER:$SMTP_PASS" \
        -T -
fi

echo "Saving new HEAD \"$current_head\"..."
printf %s "$current_head" > "$WORKDIR/previoushead.txt"
echo "Success!"
exit 0