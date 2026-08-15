# 拾页 Shiye

> 把一串网址交给它，得到一组完整、清晰、可追踪的网页长图。
>
> Turn a URL list into complete, high-resolution page archives — locally.

[![Release](https://img.shields.io/github/v/release/xuziqiu/shiye-clipper?display_name=tag)](https://github.com/xuziqiu/shiye-clipper/releases/latest)
[![CI](https://github.com/xuziqiu/shiye-clipper/actions/workflows/ci.yml/badge.svg)](https://github.com/xuziqiu/shiye-clipper/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-2f5d50.svg)](LICENSE)
[![Windows](https://img.shields.io/badge/platform-Windows-2864c7.svg)](#项目状态)

**[下载最新版本](https://github.com/xuziqiu/shiye-clipper/releases/latest) · [三分钟开始使用](#三分钟开始使用) · [交给 AI Agent](#ai-和自动化调用)**

收藏一个网页很容易。真正麻烦的是：一次保存几十篇新闻、报告或资料页，还要逐页滚动、等待懒加载、检查失败项，并把文件整理成可追踪的结果。

**拾页 Shiye** 把这套重复劳动变成一个本地批处理任务：粘贴网址列表，它会调用电脑上的 Edge 或 Chrome，逐屏滚动并等待页面内容加载，然后保存完整长图和一份 `results.json` 任务清单。

它既可以像普通应用一样使用网页控制台，也可以被脚本、Codex 或其他 AI Agent 稳定调用。Shiye 本身不接入大模型；网址、截图和浏览器档案默认都留在你的电脑上。

## 为什么是拾页

| 你真正需要的 | Shiye 提供的方式 |
| --- | --- |
| 一次保存一批网页 | 粘贴多个网址，或导入 TXT、CSV、TSV、JSON 列表 |
| 保存视口之外的完整内容 | 自动滚动、等待懒加载，并尝试展开含义明确的“阅读全文” |
| 图片既清晰又方便整理 | 标准 1×、高清 1.5×、超清 2×，支持标题或稳定数字序号命名 |
| 知道哪些成功、哪些需要处理 | 自动重试、失败现场、逐项状态和持久化 `results.json` |
| 既能手动使用，也能自动化 | 本地网页控制台＋结构化 CLI＋机器可读 JSON |
| 不想把资料交给云端服务 | 本地运行，默认使用隔离浏览器环境，不读取日常浏览器档案 |

## 适合这些场景

- **新闻、研究与舆情资料归档**：把文章列表一次保存成可长期查看的视觉快照；
- **品牌、公关与市场观察**：批量留存报道、竞品页面和活动页面，减少机械操作；
- **内容与知识管理**：为选题、事实核查和项目资料建立带任务记录的截图素材库；
- **脚本与 AI Agent 工作流**：通过稳定的退出码、stdout JSON 和 `results.json` 接入自动化流程。

## 一次任务怎么完成

1. 粘贴网址或交给 Shiye 一个列表文件；
2. Shiye 在本机浏览器中逐页打开、滚动、等待并截图；
3. 你得到完整长图、成功/失败统计和可继续重试的任务清单。

## 和普通单页截图流程有什么不同

如果只是偶尔保存当前页面，浏览器截图插件通常更直接。Shiye 更适合“已经有一批网址，希望一次处理完并知道结果”的任务。

| | 常见单页截图流程 | Shiye |
| --- | --- | --- |
| 输入方式 | 打开当前页面后逐个操作 | 网址列表、文件或标准输入 |
| 执行方式 | 人工重复点击 | 批量执行，可设置并发与重试 |
| 输出管理 | 单张图片 | 图片＋稳定命名＋`results.json` |
| 异常处理 | 逐页人工检查 | 记录失败原因，可见模式接管后重试 |
| 自动化 | 以人工操作为主 | CLI、JSON、脚本和 AI Agent 可调用 |

## 项目状态

当前版本为 `0.4.0`，定位是 Windows 本地应用的公开测试版。

- 支持 Windows 10/11；
- 需要 Node.js 20.9 或更高版本；
- 需要本机安装 Microsoft Edge 或 Google Chrome（二者有一个即可）；
- 当前不提供云端托管服务或免安装桌面程序。

## 先选你要怎么用

| 你的目的 | 最简单的入口 |
| --- | --- |
| 不想碰命令行，只想粘贴网址截图 | 安装一次后，双击 `启动拾页控制台.cmd` |
| 自己批量运行或写脚本 | 使用 `shiye.cmd capture` |
| 让 Codex、Claude Code 等 AI 执行 | 把下面的“可复制提示词”发给 AI |

Shiye 里的“AI 驱动”是指 AI 可以调用它的 CLI，不是把大模型接进截图工具。网址、图片和登录档案仍然保存在本机。

## 三分钟开始使用

1. 从 [Releases](https://github.com/xuziqiu/shiye-clipper/releases/latest) 下载 Source code (zip)，解压到一个固定目录。
2. 确认电脑已经安装 [Node.js 20.9+](https://nodejs.org/)，以及 Microsoft Edge 或 Google Chrome。
3. 双击 `安装拾页.cmd`，等待窗口显示“安装完成”。这一步只需要做一次。
4. 以后双击 `启动拾页控制台.cmd`，粘贴网址并点击“开始完整截图”。

如果你习惯 PowerShell，也可以手动安装：

```powershell
npm ci
npm run build
```

安装完成后，普通用户可以双击：

```text
启动拾页控制台.cmd
```

也可以在 PowerShell 中运行：

```powershell
.\shiye.cmd ui
```

控制台默认打开 `http://127.0.0.1:4310`。运行期间请保留启动它的命令窗口；关闭窗口会停止本地服务，已经生成的图片不会被删除。

## 图形控制台

在控制台中可以：

- 粘贴多个网址，或导入 TXT、CSV、TSV、JSON 列表；
- 选择保存目录、并发数、重试次数、格式和超时时间；
- 选择标准 1×、高清 1.5× 或超清 2×；
- 选择“网页标题＋尾码”或 `0001`、`0002` 数字序号命名；
- 自动选择 Edge/Chrome，或明确指定其中一个；
- 后台静默运行，或显示浏览器处理登录和验证码；
- 暂停、继续、取消或重试任务；
- 查看完整长图、失败现场和任务结果；
- 使用 Shiye 专用浏览器档案保存网站登录状态。

1440 像素宽视口下，1×、1.5×、2× 分别输出约 1440、2160、2880 像素宽的图片。

## 命令行使用

准备一个网址列表，例如 [examples/urls.txt](examples/urls.txt)：

```text
https://example.com/
https://www.iana.org/help/example-domains
```

执行批量截图：

```powershell
.\shiye.cmd capture .\examples\urls.txt --output "D:\网页剪报"
```

原来的 `clipper.cmd` 继续保留为兼容别名，现有脚本不需要立即修改。

### 常用选项

```text
-o, --output <目录>       输出目录
-c, --concurrency <数量>  并发数，1-8；默认 1
-r, --retry <次数>        失败重试次数，0-5；默认 1
-t, --timeout <秒>        单页打开超时；默认 60
    --format png|jpeg     输出格式；默认 PNG
    --browser <浏览器>    auto、edge 或 chrome；默认 auto（优先 Edge）
    --browser-path <路径> 指定 Chromium 浏览器程序路径
    --quality <档位>      standard、high 或 ultra；对应 1×、1.5×、2×
    --filename <方式>     title 或 sequence；默认 title
    --viewport <宽x高>    浏览器视口；默认 1440x900
    --visible             显示浏览器窗口
    --headless            后台静默运行；默认
    --profile <目录>      使用专用浏览器登录档案
    --cookie <策略>       reject、accept 或 none
    --max-height <像素>   最长截取高度
    --max-scrolls <次数>  最大滚动次数
    --no-expand           不自动点击“阅读全文”
    --json                机器可读输出
```

直接传入网址：

```powershell
.\shiye.cmd capture "https://example.com" "https://www.iana.org/domains/reserved"
```

超清 PNG＋数字序号命名：

```powershell
.\shiye.cmd capture .\examples\urls.txt --quality ultra --filename sequence --output "D:\网页剪报"
```

明确使用 Chrome：

```powershell
.\shiye.cmd capture .\examples\urls.txt --browser chrome --output "D:\网页剪报"
```

通过管道输入：

```powershell
Get-Content .\examples\urls.txt | .\shiye.cmd capture --output "D:\网页剪报"
```

查看任务状态：

```powershell
.\shiye.cmd status "D:\网页剪报\results.json"
.\shiye.cmd status "D:\网页剪报\results.json" --json
```

重试失败项目：

```powershell
.\shiye.cmd retry "D:\网页剪报\results.json"
```

## AI 和自动化调用

### 可直接复制给 AI 的提示词

把下面这段连同网址列表一起发给能够操作本机终端的 AI Agent：

```text
请在 Shiye 项目目录中按照 AGENTS.md 执行批量网页截图。
如果尚未安装，先运行：.\安装拾页.cmd --no-pause
将我提供的网址保存为列表文件，然后运行：
.\shiye.cmd capture <列表文件> --output "D:\网页剪报" --quality ultra --filename sequence --retry 1 --json
只把 stdout 当作最终 JSON；stderr 是进度信息。完成后告诉我成功数、失败数、图片目录和 results.json 路径。
不要使用我的日常 Edge/Chrome 档案，不要上传网址、Cookie、截图或 results.json。遇到登录、验证码或付费墙时停止并告诉我。
```

把 `D:\网页剪报` 改成你想保存图片的位置即可。AI 必须能够在你的 Windows 电脑上执行命令；普通网页聊天机器人如果没有本机终端权限，就不能直接调用 Shiye。

### CLI 契约

AI Agent 应始终使用 `--json`。最终结果只写入 stdout，执行进度写入 stderr：

```powershell
.\shiye.cmd capture .\examples\urls.txt --output "D:\网页剪报" --retry 1 --json
```

退出码约定：

- `0`：全部成功；
- `2`：任务执行完成，但存在最终失败项目；
- `1`：命令、输入或配置错误。

JSON 包含 `ok`、`status`、`total`、`completed`、`failed`、实际使用的 `browser`、`outputDirectory`、`manifestPath` 和逐项结果。完整的 Agent 工作流、重试方式和安全边界见 [AI Agent 调用指南](docs/AI_AGENT_GUIDE.md)。仓库根目录的 [AGENTS.md](AGENTS.md) 可供支持该约定的编程 Agent 自动读取。

## 输出

标题命名：

```text
D:\网页剪报\
  新闻标题-12ab34.png
  另一篇新闻-56cd78.png
  results.json
```

序号命名则生成 `0001.png`、`0002.png`……。任务重试不会改变原序号。标题命名保留短尾码，避免相同标题互相覆盖。

`results.json` 是任务的真实状态来源，包含：

- 原始网址和最终跳转网址；
- 排队、运行、成功、失败、暂停或取消状态；
- 尝试次数和失败原因；
- 网页标题、站点、发布时间和描述；
- 图片路径、网页尺寸、实际输出像素和文件大小；
- 整页或分段拼接模式、实际截取高度和上限警告；
- 能够生成时的失败现场截图路径。

## 隐私与安全边界

- 默认使用隔离的临时浏览器环境，不读取用户日常 Edge/Chrome 档案；
- 只有启用“保存网站登录状态”后，才使用本地 `data/browser-profile-edge` 或 `data/browser-profile-chrome` 专用档案；
- 控制台只监听 `127.0.0.1`，并拒绝非本机 Host 与跨站写入请求；
- 控制台 API 禁止缓存任务数据，并设置同源、禁止嵌入等浏览器安全响应头；
- `data/`、`captures/`、构建产物和测试产物均被 Git 忽略；
- 验证码不会被自动绕过，可见模式会等待用户在所选浏览器中处理；
- 付费内容只保存当前账号合法可见的部分；
- Cookie 和“阅读全文”规则只点击含义明确的白名单文本；
- 无限滚动默认最多执行 300 次，页面默认最多截取 60,000 CSS 像素；
- 1.5× 总像素约为 1× 的 2.25 倍，2× 约为 4 倍，会增加时间、文件体积和内存使用；
- 网页截图是视觉存档，不是可交互的离线网页副本。

专用浏览器档案可能包含登录 Cookie。不要上传、分享或提交 `data/browser-profile-*`。

## 合法使用

请只截取你有权访问和保存的网页，并遵守目标网站的使用条款、版权规则和适用法律。Shiye 不提供绕过登录、验证码、付费墙或访问控制的能力。

项目与 Microsoft、Google、Microsoft Edge、Google Chrome、GoFullPage 及目标网站没有隶属或背书关系。相关名称和商标归各自权利人所有。

## 开发与验证

```powershell
npm ci
npm run check
npm test
npm run build
npm run test:e2e
```

端到端测试会启动本地测试网页，并使用后台 Edge 和 Chrome 验证浏览器选择、懒加载、长图拼接、超清输出、命名模式、登录档案和控制台任务控制。

## 项目结构

```text
public/          本地网页控制台
src/             CLI、任务调度、浏览器截图和本地服务
tests/unit/      输入与工具函数测试
tests/e2e/       Edge、Chrome 与控制台端到端测试
examples/        可公开的输入示例
```

## 参与贡献

如果 Shiye 帮你省下了逐页截图和整理文件的时间，欢迎给项目一个 Star，让更多需要批量网页归档的人看到它。功能建议和可公开复现的问题可以提交到 [Issues](https://github.com/xuziqiu/shiye-clipper/issues)。

提交问题或代码前请阅读 [CONTRIBUTING.md](CONTRIBUTING.md)。安全问题请遵循 [SECURITY.md](SECURITY.md)，不要在公开 Issue 中披露凭据、Cookie 或可利用细节。

## 许可证

本项目使用 [MIT License](LICENSE)。
