#!/bin/bash
# 梦幻画廊服务器一键部署脚本（在 Ubuntu 服务器上以 root 执行）
set -e

echo "==> 安装 Node.js 22..."
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
node -v

echo "==> 解压项目到 /opt/gallery..."
mkdir -p /opt/gallery
cd /opt/gallery
tar xzf deploy.tar.gz
rm deploy.tar.gz

echo "==> 安装 pm2 并启动..."
npm install -g pm2 --silent
pm2 delete gallery 2>/dev/null || true
TOKEN="${TOKEN:?请先用 export TOKEN=你的后台密码 设置后再运行}" pm2 start server.js --name gallery
pm2 save
pm2 startup systemd -u root --hp /root | tail -n 1 | bash || true

echo "==> 防火墙(ufw 若启用)放行 3000..."
ufw allow 3000/tcp 2>/dev/null || true

echo "==> 完成！访问 http://$(curl -s ifconfig.me 2>/dev/null || echo '<服务器IP>'):3000/"
pm2 status
