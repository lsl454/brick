# Brick Fall Mobile

这是已经重构好的手机竖屏版砖块消消落游戏，包含触控操作、滑动操作、PWA 离线缓存、Capacitor Android 配置和 GitHub Actions 自动构建 APK。

## 手机操作

- 长按左移、右移、软降按钮：连续操作
- 点击左转、右转、暂存、硬降按钮：立即操作
- 点击棋盘：顺时针旋转
- 左右滑动棋盘：移动方块
- 向下滑动：软降
- 快速向下滑动：硬降

## 上传 GitHub 自动生成 APK

1. 将本项目所有文件上传到 GitHub 仓库根目录。
2. 打开仓库的 `Actions` 页面。
3. 选择 `Build Android APK`。
4. 点击 `Run workflow`。
5. 构建完成后，在该次运行页面底部下载 `brick-fall-debug-apk`。
6. 解压后得到 `app-debug.apk`，可安装到 Android 手机测试。

每次推送到 `main` 或 `master` 分支，也会自动构建一次 APK。

## 本地浏览器测试

需要 Node.js 22 或以上：

```bash
npm install
npm run serve
```

浏览器打开：`http://localhost:8080`

## 本地构建 Android APK

Windows 可双击：

```text
build-apk.bat
```

需要本机已经安装 Android Studio 和 Android SDK。构建结果：

```text
android/app/build/outputs/apk/debug/app-debug.apk
```
