# Brick Fall Mobile Fullscreen

手机竖屏全屏版“砖块消消落”。棋盘优先占据屏幕，分数、预览、统计、声音和重新开始等功能收纳在右上角菜单中。

## GitHub 自动生成 APK

把本项目中的全部文件上传到 GitHub 仓库根目录，必须包含：

```text
.github/workflows/build-apk.yml
.gitignore
www/
package.json
capacitor.config.json
scripts/
resources/
```

上传后进入：

```text
GitHub → Actions → Build Android APK
```

等待绿色勾号，打开最新构建，在页面底部下载：

```text
brick-fall-debug-apk
```

解压后得到：

```text
app-debug.apk
```

## 手机操作

- 点击棋盘：旋转
- 左右滑动：移动
- 向下滑动：软降
- 快速下滑：硬降
- 下方按钮：暂存、旋转、移动、下降、暂停
- 右上角 `☰`：查看下一个砖块、暂存砖块、统计、音效和设置

Android 构建固定为竖屏模式。
