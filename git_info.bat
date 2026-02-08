@echo off
cd /d C:\Development\workspace\chitrakala_arts
git log -1 --oneline > git_last_commit.txt
git status > git_status.txt
git log --oneline -5 > git_last_5_commits.txt
echo Done - check git_last_commit.txt, git_status.txt, and git_last_5_commits.txt
