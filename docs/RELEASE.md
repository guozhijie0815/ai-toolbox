# 发布说明

## 构建安装包

```bash
npm run tauri:build
```

macOS 安装包输出目录：

```text
src-tauri/target/release/bundle/dmg/
```

## 发布到 GitHub Releases

1. 确认版本号一致：

```text
package.json
src-tauri/tauri.conf.json
src-tauri/Cargo.toml
```

2. 重新构建安装包。
3. 在 GitHub Releases 创建对应版本，例如 `v0.2.0`。
4. 上传安装包，例如：

```text
AI Toolbox_0.2.0_aarch64.dmg
```

5. 发布后检查 README 中的下载说明是否仍然准确。
