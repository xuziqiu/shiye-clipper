# 拾页 Shiye

> Batch full-page web capture for humans and AI agents.

[![CI](https://github.com/xuziqiu/shiye-clipper/actions/workflows/ci.yml/badge.svg)](https://github.com/xuziqiu/shiye-clipper/actions/workflows/ci.yml)

拾页 Shiye 是一个本地优先的 Windows 批量网页截图工具。它使用本机 Microsoft Edge 逐屏滚动网页、等待懒加载内容，并将页面保存为完整长图。

它同时提供：

- 面向普通用户的本地网页控制台；
- 面向脚本、Codex 和其他 AI Agent 的结构化 CLI；
- 标准、高清和超清输出；
- 标题或稳定数字序号命名；
- 失败重试、人工处理和任务状态清单。

Shiye 本身不接入大模型，也不会把截图、网址或浏览器档案上传到外部服务。

## 项目状态

当前版本为 `0.3.1`，定位是 Windows 本地应用的公开测试版。

- 支持 Windows 10/11；
- 需要 Node.js 20.9 或更高版本；
- 需要本机安装 Microsoft Edge；
- 当前不提供云端托管服务或免安装桌面程序。

## 先选你要怎么用

| 你的目的 | 最简单的入口 |
| --- | --- |
| 不想碰命令行，只想粘贴网址截图 | 安装一次后，双击 `启动拾页控制台.cmd` |
| 自己批量运行或写脚本 | 使用 `shiye.cmd capture` |
| 让 Codex、Claude Code 等 AI 执行 | 把下面的“可复制提示词”发给 AI |

Shiye 里的“AI 驱动”是指 AI 可以调用它的 CLI，不是把大模型接进截图工具。网址、图片和登录档案仍然保存在本机。

## 普通用户：第一次安装

1. 从 [Releases](https://github.com/xuziqiu/shiye-clipper/releases/latest) 下载 Source code (zip)，解压到一个固定目录。
2. 确认电脑已经安装 [Node.js 20.9+](https://nodejs.org/) 和 Microsoft Edge。
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
- 后台静默运行，或显示 Edge 处理登录和验证码；
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
    --quality <档位>      standard、high 或 ultra；对应 1×、1.5×、2×
    --filename <方式>     title 或 sequence；默认 title
    --viewport <宽x高>    浏览器视口；默认 1440x900
    --visible             显示 Edge 窗口
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
不要使用我的日常 Edge 档案，不要上传网址、Cookie、截图或 results.json。遇到登录、验证码或付费墙时停止并告诉我。
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

JSON 包含 `ok`、`status`、`total`、`completed`、`failed`、`outputDirectory`、`manifestPath` 和逐项结果。完整的 Agent 工作流、重试方式和安全边界见 [AI Agent 调用指南](docs/AI_AGENT_GUIDE.md)。仓库根目录的 [AGENTS.md](AGENTS.md) 可供支持该约定的编程 Agent 自动读取。

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

- 默认使用隔离的临时浏览器环境，不读取用户日常 Edge 档案；
- 只有启用“保存网站登录状态”后，才使用本地 `data/browser-profile` 专用档案；
- 控制台只监听 `127.0.0.1`，并拒绝非本机 Host 与跨站写入请求；
- 控制台 API 禁止缓存任务数据，并设置同源、禁止嵌入等浏览器安全响应头；
- `data/`、`captures/`、构建产物和测试产物均被 Git 忽略；
- 验证码不会被自动绕过，可见模式会等待用户在 Edge 中处理；
- 付费内容只保存当前账号合法可见的部分；
- Cookie 和“阅读全文”规则只点击含义明确的白名单文本；
- 无限滚动默认最多执行 300 次，页面默认最多截取 60,000 CSS 像素；
- 1.5× 总像素约为 1× 的 2.25 倍，2× 约为 4 倍，会增加时间、文件体积和内存使用；
- 网页截图是视觉存档，不是可交互的离线网页副本。

专用浏览器档案可能包含登录 Cookie。不要上传、分享或提交 `data/browser-profile`。

## 合法使用

请只截取你有权访问和保存的网页，并遵守目标网站的使用条款、版权规则和适用法律。Shiye 不提供绕过登录、验证码、付费墙或访问控制的能力。

项目与 Microsoft、Microsoft Edge、GoFullPage 及目标网站没有隶属或背书关系。Microsoft Edge 是其权利人的商标。

## 开发与验证

```powershell
npm ci
npm run check
npm test
npm run build
npm run test:e2e
```

端到端测试会启动本地测试网页，并使用后台 Edge 验证懒加载、长图拼接、超清输出、命名模式、登录档案和控制台任务控制。

## 项目结构

```text
public/          本地网页控制台
src/             CLI、任务调度、Edge截图和本地服务
tests/unit/      输入与工具函数测试
tests/e2e/       Edge与控制台端到端测试
examples/        可公开的输入示例
```

## 参与贡献

提交问题或代码前请阅读 [CONTRIBUTING.md](CONTRIBUTING.md)。安全问题请遵循 [SECURITY.md](SECURITY.md)，不要在公开 Issue 中披露凭据、Cookie 或可利用细节。

## 许可证

本项目使用 [MIT License](LICENSE)。
