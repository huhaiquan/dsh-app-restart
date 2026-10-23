# 自动重启（dsh-app-restart）

[English](README.md) | 简体中文

给 DeepSeek Harness 桌面应用的一键重启按钮。窗口标题栏里、原生最小化 / 最大化 / 关闭
按钮的左侧有一个圆形箭头图标；点一下，应用就退出并自动重新启动，窗口自己回来。

## 安装

```sh
# 从本仓库安装
dsh plugin --profile <profile> add github:huhaiquan/dsh-app-restart
```

或从本地目录走官方安装路径：

```sh
plugin_manager install_bundle target=<absolute path to this directory>
```

## 使用

1. 按钮在窗口标题栏里，尺寸和悬停高亮都与原生窗口按钮一致。在浏览器标签页或
   `dsh web` 中，它会出现在会话标题栏右侧。
2. 点一下并确认。
3. 窗口关闭后几秒内自动重新打开，对话仍在会话列表里。

## 注意

- 仅支持桌面应用。浏览器里的 `dsh web` 中按钮为禁用状态。
- 应用每次启动会绑定新端口，所以指向旧 `http://127.0.0.1:<port>` 的浏览器标签页无法
  跟过去，但重新打开的应用窗口可以。
- 正在生成的回合会被中断；应用停止前会 flush 打开中的会话。

## 卸载

在插件页卸载，或执行：

```sh
dsh plugin --profile <profile> remove @local/dsh-app-restart
```

仓库：<https://github.com/huhaiquan/dsh-app-restart>
