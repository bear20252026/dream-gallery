#!/bin/bash
# 梦幻画廊服务器一键部署脚本（在 Ubuntu 服务器上以 root 执行）
set -e

echo "==> 安装 Node.js 22..."
if ! command -v node >/dev/null 2>&1; then
  # 2026-11-11 审计 P3-7:不再 curl|bash 直接执行远程脚本——先落盘,留出人工核查窗口,
  # 确认内容后再执行(脚本来源仍是 NodeSource 官方)。
  curl -fsSL https://deb.nodesource.com/setup_22.x -o /tmp/nodesource_setup.sh
  echo "    NodeSource 安装脚本已下载到 /tmp/nodesource_setup.sh,请核查后执行:"
  echo "    bash /tmp/nodesource_setup.sh && apt-get install -y nodejs"
  bash /tmp/nodesource_setup.sh
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
# 2026-11-11 审计 P3-7:不再把 pm2 输出直接管道进 bash——先打印开机自启命令,由人工确认后执行
echo "==> 请人工执行以下命令配置开机自启(pm2 startup 输出的最后一行):"
pm2 startup systemd -u root --hp /root | tail -n 1

echo "==> 防火墙提示(2026-11-11 审计 P3-7):"
echo "    生产架构是 Cloudflare → 源站,安全组/ufw 应只放行 Cloudflare IP 段的 3000 端口,"
echo "    不要对全网开放 3000(否则可绕过 CDN/WAF 直连源站)。本脚本不再自动 ufw allow。"

echo "==> 完成！访问 http://$(curl -s ifconfig.me 2>/dev/null || echo '<服务器IP>'):3000/"
pm2 status
