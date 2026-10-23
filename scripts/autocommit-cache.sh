#!/usr/bin/env bash
# Every hour: if the cache robots changed anything, commit just the cache files and
# push (each push deploys). Run from the repo root:  bash scripts/autocommit-cache.sh
set -u
cd "$(dirname "$0")/.."
LINES=(
	"Fresh cities out of the oven"
	"The robots clocked another hour"
	"More metros, more parks, more dry land"
	"Cache top-up, no Big Macs were harmed"
	"Another batch of cities checks in"
)
while true; do
	if [ -n "$(git status --porcelain -- static/cities src/lib/data/city-index.json)" ]; then
		n=$(git status --porcelain -- static/cities | wc -l)
		msg="${LINES[$RANDOM % ${#LINES[@]}]} ($n city files)"
		git add static/cities src/lib/data/city-index.json
		git commit -q -m "$msg" -m "Automatic hourly cache snapshot." -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
		if git -c credential.helper= -c credential.helper='!gh auth git-credential' push -q https://github.com/camilou/compare-cities.git main; then
			echo "$(date -u +%H:%M) pushed: $msg"
		else
			echo "$(date -u +%H:%M) push failed, will retry next hour"
		fi
	else
		echo "$(date -u +%H:%M) nothing new"
	fi
	sleep 3600
done
