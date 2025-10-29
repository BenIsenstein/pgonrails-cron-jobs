#!/bin/bash
set -eu

if [ -f "./.env" ]; then
    source "./.env"
fi

if [ -z "$WORKDIR" ]; then
    echo "No WORKIR found in environment. Operation cancelled."
    exit 1
fi

if [ -z "$SMTP_USER" ]; then
    echo "No SMTP_USER found in environment. Operation cancelled."
    exit 1
fi

if [ -z "$SMTP_PASS" ]; then
    echo "No SMTP_PASS found in environment. Operation cancelled."
    exit 1
fi

if [ ! -d "$WORKDIR" ]; then
    mkdir -p "$WORKDIR"
fi

cd "$WORKDIR"

if [ ! -f "./previoushead.txt" ]; then
    touch "./previoushead.txt"
fi

previous_head=$(< "previoushead.txt")
current_head=$(git ls-remote https://github.com/supabase/supabase.git refs/heads/master | cut -f1)

if [ -z "$previous_head" ]; then
    echo "Saving current HEAD for the first time..."
    printf %s "$current_head" > "previoushead.txt"
    echo "Success!"
    exit 0
fi

if [ "$current_head" = "$previous_head" ]; then
    echo "Nothing has changed!"
    exit 0
fi

echo "Supabase remote HEAD has updated! Checking for relevant changes locally..." 

if [ -d "supabase" ]; then
    cd supabase
    git pull
else
    git clone https://github.com/supabase/supabase
    cd supabase
fi

if [ -z "$(git diff --name-only "$previous_head" HEAD -- docker)" ]; then
    echo "Nothing has changed in /docker!"
else
    echo "New changes in /docker! Notifying via email..."

    curl --url 'smtps://smtp.gmail.com:465' \
        --mail-rcpt 'ben.isenstein@gmail.com' \
        --mail-from "$SMTP_USER" \
        --user "$SMTP_USER:$SMTP_PASS" \
        -T <(echo -e "From: \"PG On Rails\" <$SMTP_USER>\nSubject: New changes in \"/supabase/docker\"\n\nhttps://github.com/supabase/supabase/tree/master/docker\n\nSent securely via curl.")
fi

echo "Saving new HEAD \"$current_head\"..."
cd ..
printf %s "$current_head" > "previoushead.txt"
echo "Success!"
exit 0