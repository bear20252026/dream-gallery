#!/usr/bin/env bash
# deploy-host.sh — 部署目标主机的唯一解析入口(2026-11-11 全面审计 P3-1)
# 背景:源站 IP 与默认 root 用户曾硬编码在公开仓库的三个部署脚本里,任何人可据此
# 绕过 Cloudflare 直连源站。现收敛为「环境变量 → 本地私密配置」两级,fail-closed:
#   ① HOST 环境变量(最高优先,CI/临时覆盖用)
#   ② .deploy-host.env(仓库根,已 gitignore,内容形如 HOST=1.2.3.4,可含 SSH_USER=deploy)
# 两者都没有 ⇒ 调用方必须报错退出,绝不回退到任何写死的地址。
# ⚠️ 本文件被 source,不单独执行;只定义函数,不产生副作用。
# ⚠️ 历史提交里的旧地址无法靠本次修改收回;源站防火墙应只放行 Cloudflare IP 段(运维动作)。
resolve_deploy_host() {
  local root="$1"
  if [ -z "${HOST:-}" ] && [ -f "$root/.deploy-host.env" ]; then
    # 只取 HOST= 与 SSH_USER= 两行,避免把无关变量带进部署环境
    local v
    v="$(grep -E '^(HOST|SSH_USER)=' "$root/.deploy-host.env" 2>/dev/null || true)"
    if [ -n "$v" ]; then eval "$v"; fi
  fi
  if [ -z "${HOST:-}" ]; then
    echo "❌ 未配置部署目标主机:请设 HOST 环境变量,或在仓库根创建 .deploy-host.env(内容 HOST=<源站地址>,已 gitignore)。" >&2
    echo "   源站地址不再写进公开仓库(2026-11-11 审计 P3-1);地址见主人私密交接记录。" >&2
    return 1
  fi
  SSH_USER="${SSH_USER:-root}"
  return 0
}