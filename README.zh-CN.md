# 自动重启（dsh-app-restart）

[English](README.md) | 简体中文

一个极小的 DSH bundle，只做一件事：在窗口标题栏放一个紧凑的重启按钮，位置紧贴原生
最小化 / 最大化 / 关闭按钮的左侧。点击后 DeepSeek Harness 桌面应用会退出并自动重新
启动，应用窗口自己回来，不用手动关闭再打开。

## 它新增了什么

| 半边 | 文件 | 作用 |
|---|---|---|
| 宿主 | `index.js` | 在 Web GUI 源上提供 `GET /.dsh-app-restart/status` 与 `POST /.dsh-app-restart/restart`。 |
| 宿主 | `restart-helper.mjs` | 脱离式 Node 模式助手：先停外壳，让宿主自己完成关闭，再重新拉起打包好的可执行文件。 |
| 客户端 | `client.js` | 把标题栏控件注册进 `shell.overlay`，并在 `conversation.session.header.utilities` 注册回退控件；两者调用同一条路由。 |
| 元数据 | `locale/*.json`、`icon.svg` | 插件管理与设置页使用的标题、描述与图标。 |

## 按钮在哪

Windows Electron 外壳拥有标题栏区域：它的 preload 会给窗口打上
`data-windows-titlebar` 标记，并预留 `--dsh-windows-titlebar-height`（40px），而原生窗口
按钮仍由 Electron 的 `titleBarOverlay` 绘制。插槽清单在那条区域里没有座位，因此控件
通过帧级 `shell.overlay` 渲染，并用 Window Controls Overlay 的安全区定位：
`env(titlebar-area-x) + env(titlebar-area-width)` 即可拖拽区域的右边界，也就是原生按钮
开始的位置。`env()` 声明之前先写了普通的 `top` / `left` 兜底，所以拿不到该几何信息时，
控件仍会落在原生按钮左侧（三个 46px 按钮 + 间隙），而不会压在它们上面。

当外壳没有标题栏时（浏览器标签页、`dsh web`、macOS），同一组件改为注册到会话标题栏
右侧的工具区，标题栏座位不渲染任何内容。任一时刻只显示一个控件。

标题栏控件刻意做成与一个原生标题栏按钮同尺寸——外壳 40px 的标题栏高度 × 原生 46px
宽度——因此它的悬停高亮和最小化按钮一样是通高矩形，无圆角、紧贴原生按钮组，而不是
28px 的圆角图标按钮。

## 重启是怎么完成的

宿主以 Node 模式作为 Electron 外壳的子进程运行，所以无法调用 Electron 的
`app.relaunch()`。收到重启请求时，宿主先返回响应，再以脱离方式启动
`restart-helper.mjs`。助手会：

1. 等待约 0.7 秒，让响应先到达页面；
2. 先停**外壳**——`taskkill /F` 且**不带** `/T`，只结束外壳，助手（宿主的子进程）不会
   被一并扫掉。必须先停外壳，因为外壳会把任何宿主退出都当成崩溃，否则会写崩溃报告并
   弹出恢复对话框；
3. 让**宿主**自行停止：外壳被杀后 IPC 通道关闭，宿主的 `disconnect` 处理器执行正常
   关闭（与正常退出相同的会话 flush）。只有超过短促的宽限期仍存活才会被强杀；
4. 等两个进程都消失后，去掉环境变量 `ELECTRON_RUN_AS_NODE`，重新拉起打包好的可执行
   文件。

重启后的应用与正常启动完全一样，窗口会重新出现，之前的对话仍保存在会话日志里。

## 限制

- 自动重启仅限桌面应用。在浏览器里运行的 `dsh web` 中，状态路由会返回
  `supported: false`，控件保持禁用；否则"重启外壳"没有意义。
- 桌面宿主每次启动都会绑定系统分配的随机端口。通过 Electron 窗口（`dsh-app://app/`）
  打开的页面会随新窗口一起回来，但指向旧 `http://127.0.0.1:<port>` 的浏览器标签页无法
  跟到新端口。
- 正在生成的回合会被中断。进程停止前会尽力 flush 打开中的会话，但被中断的回合不会恢复。

## 数据与位置

发布仓库：<https://github.com/huhaiquan/dsh-app-restart>

作者本机的安装副本是一个本地包，而不是 registry 安装：源码位于 profile 目录中、与其他
插件并列，路径为 `$DSH_PROFILE_DIR/local-plugins/dsh-app-restart`。

`plugin_manager install_bundle` 以 `link:` 依赖记录它，因此 profile 的
`node_modules/@local/dsh-app-restart` 是指向该目录的软链——与其他已安装插件的目录形态
一致——而 `package.json` 的 `dsh.profile.bundles` 里的 bundle 条目让它被加载。修改其中
的文件会在下次页面刷新 / 重启后生效，无需重新安装。

## 变更记录

- **1.0.1** — 标题栏放置，尺寸与原生窗口按钮一致；修复重启顺序（先停外壳、宿主自行
  关闭），外壳不再误报崩溃对话框。
- **1.0.0** — 初始的重启控件。

## 安装

```sh
# 从 GitHub（git 通道）：直接从本仓库安装该 bundle
dsh plugin --profile <profile> add github:huhaiquan/dsh-app-restart

# 或从本地检出，走官方安装路径
plugin_manager install_bundle target=<absolute path to this directory>
```
