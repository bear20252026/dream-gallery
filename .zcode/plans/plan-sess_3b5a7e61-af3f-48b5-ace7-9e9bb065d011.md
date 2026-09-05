提交并部署独立世界切换功能

## 当前状态
代码已写好并本地探针验证全绿:
- main → b612 ✓
- b612 → king325 ✓
- king325 → b612 ✓
- b612 → main ✓
- 零 JS 错误

## 需要执行的步骤
1. `git add -A && git commit` 提交所有改动
2. `git push origin main` 推送到 GitHub
3. `bash scripts/deploy.sh` 构建+部署前端到生产
4. `scp` 上传 GLB 模型和音频到服务器
5. `pm2 restart gallery` 重启服务
6. 线上生产验证(闸门→电影→世界切换)

## 不做的事
- 不改任何代码(已完成)
- 不回滚
- 不做额外优化(等用户验收后再继续)