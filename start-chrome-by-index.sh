#!/bin/bash
INDEX=$1
LOCAL_PORT=$2
SSH_PORT=$3
USER_DATA_DIR=$4

# 关闭该序号的 Chrome
pkill -f "remote-debugging-port=$LOCAL_PORT"

# 等待
sleep 2

# 启动 Chrome
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=$LOCAL_PORT \
  --user-data-dir="/tmp/chrome_profiles/$USER_DATA_DIR" \
  --window-name="$USER_DATA_DIR" &

# 等待
sleep 3

# 关闭该序号的 SSH
pkill -f "ssh.*$SSH_PORT"

# 建立 SSH 隧道
ssh -R $SSH_PORT:localhost:$LOCAL_PORT root@101.43.54.252 -N &

echo "Chrome $INDEX started on local:$LOCAL_PORT ssh:$SSH_PORT"
