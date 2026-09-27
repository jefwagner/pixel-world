#!/bin/bash
# GIT_ASKPASS helper for lab-bot authentication.
# Git calls this script for credential prompts over HTTPS:
#   - "Username for ..."  -> the bot account name
#   - "Password for ..."  -> the mounted fine-grained PAT
# The token is read from a file at ask-time and never stored in .git/config.

case "$1" in
  Username*) echo "jefwagner-bot" ;;
  *) cat "${LAB_BOT_PAT_FILE:-/home/vscode/.lab-bot-pat}" ;;
esac
