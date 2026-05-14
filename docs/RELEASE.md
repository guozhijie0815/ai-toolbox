# 发布说明

## 自动发布

项目通过 GitHub Actions 自动构建安装包。推送 `v*` 格式的 tag 后，会触发 `.github/workflows/release.yml`，并创建草稿 Release。

```bash
git tag v0.2.1
git push origin v0.2.1
```

也可以在 GitHub Actions 页面手动运行 `Publish Release`。

构建完成后，进入 GitHub Releases 检查安装包，确认无误后发布草稿。

## 构建安装包

```bash
npm run tauri:build
```

macOS 安装包输出目录：

```text
src-tauri/target/release/bundle/dmg/
```

## 手动发布到 GitHub Releases

1. 确认版本号一致：

```text
package.json
src-tauri/tauri.conf.json
src-tauri/Cargo.toml
```

2. 重新构建安装包。
3. 在 GitHub Releases 创建对应版本，例如 `v0.2.1`。
4. 上传安装包，例如：

```text
AI Toolbox_0.2.1_aarch64.dmg
```

5. 发布后检查 README 中的下载说明是否仍然准确。
