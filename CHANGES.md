# CHANGE LOG

## 2026-08-22 适配 DSH 0.1.1-rc.2

### 为什么
DSH 从 0.1.0-rc.8 升级到 0.1.1-rc.2，需要重新构建适配。

### 改了什么
- package.json 版本号改为 `0.1.1-rc.2`（跟随 DSH 适配版本）
- 所有 `@deepseek-ai/*` 依赖从 `0.1.0-rc.8` 升到 `0.1.1-rc.2`
- 客户端 `getPluginVersion()` 加了硬编码 fallback `0.1.1-rc.2`，remote RPC 不通时显示版本号

### 踩过的坑
- npm 版本号不能用 `0821-rc.8`（非合法 semver），必须 `0.1.1-rc.2`
- `npm install` 会把 profile 里以 symlink 安装的插件删掉，必须重新复制完整目录（含 node_modules）
- node 从插件源码路径解析 `@deepseek-ai/*`，symlink 到 profile 的 node_modules 时 Node 解析不到，必须把插件整个目录复制过去

### 部署
```bash
# 构建
cd /vol1/1000/DeepSeek/dsh-looklook && npm run build
cd /vol1/1000/DeepSeek/dsh-makemake && npm run build

# 部署（完整复制含 node_modules）
cd /vol1/1000/DeepSeek/dsh-looklook && npm install --legacy-peer-deps
cd /vol1/1000/DeepSeek/dsh-makemake && npm install --legacy-peer-deps
rm -rf /root/.dsh/profiles/web/node_modules/dsh-looklook /root/.dsh/profiles/web/node_modules/dsh-makemake
cp -r /vol1/1000/DeepSeek/dsh-looklook /root/.dsh/profiles/web/node_modules/dsh-looklook
cp -r /vol1/1000/DeepSeek/dsh-makemake /root/.dsh/profiles/web/node_modules/dsh-makemake

# 重启
kill $(ss -tlnp | grep 3080 | grep -oP 'pid=\K[0-9]+')
cd /root/.dsh/profiles/web && npx dsh --profile web --port 3080 --no-open
```