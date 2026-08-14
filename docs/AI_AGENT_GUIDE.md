# 用 AI Agent 调用拾页 Shiye

Shiye 不在应用内部接入大模型。它提供稳定的命令行接口，让能够操作本机终端的 Codex、Claude Code 或其他 AI Agent 代替用户执行批量截图。

## 使用条件

- AI Agent 能够在你的 Windows 电脑上运行 PowerShell 命令；
- Shiye 仓库已经下载到本机；
- 电脑已经安装 Node.js 20.9+，以及 Microsoft Edge 或 Google Chrome（二者有一个即可）。

普通网页聊天机器人如果不能访问本机终端，就只能帮你生成命令，不能直接执行截图。

## 第一次使用

让 AI 在 Shiye 项目目录运行：

```powershell
.\安装拾页.cmd --no-pause
```

它会按照 `package-lock.json` 安装固定版本的依赖并构建 CLI。以后不需要每次重新安装。

## 推荐提示词

```text
请按照当前仓库的 AGENTS.md 调用 Shiye，把我提供的网址批量保存为完整长图。
输出目录使用 D:\网页剪报，清晰度使用 ultra，文件按 sequence 命名，失败重试 1 次。
始终使用 --json，只解析 stdout 的最终 JSON，并向我汇报 completed、failed、outputDirectory 和 manifestPath。
不要上传任何网址、截图、Cookie、浏览器档案或 results.json。需要登录或验证码时停止并告诉我。

网址如下：
https://example.com/
https://www.iana.org/help/example-domains
```

## 标准执行流程

1. 将用户提供的网址保存为 UTF-8 的 TXT 文件，每行一个网址；
2. 执行批量截图；
3. 根据退出码和 stdout JSON 判断结果；
4. 向用户返回成功数、失败数、图片目录和任务清单路径；
5. 如果有失败项目，先说明原因，再由用户决定是否重试或打开可见浏览器。

标准命令：

```powershell
.\shiye.cmd capture .\urls.txt --output "D:\网页剪报" --quality ultra --filename sequence --retry 1 --json
```

## JSON 结果

stdout 最终只包含一个 JSON 对象，主要字段如下：

```json
{
  "ok": true,
  "jobId": "job_xxx",
  "status": "completed",
  "total": 2,
  "completed": 2,
  "failed": 0,
  "browser": "edge",
  "outputDirectory": "D:\\网页剪报\\2026-08-14_18-30-00",
  "manifestPath": "D:\\网页剪报\\2026-08-14_18-30-00\\results.json",
  "items": []
}
```

进度文字写入 stderr，不能与 stdout JSON 混在一起解析。

退出码：

- `0`：全部成功；
- `2`：任务结束，但有网页最终失败；
- `1`：输入、参数或运行配置错误。

## 查询和重试

```powershell
.\shiye.cmd status "D:\网页剪报\任务目录\results.json" --json
.\shiye.cmd retry "D:\网页剪报\任务目录\results.json" --json
```

`results.json` 是任务的真实状态来源。不要仅凭终端最后一行猜测任务是否完成。

## 登录和验证码

默认使用后台临时浏览器，不读取日常 Edge/Chrome 档案。`--browser auto` 会优先选择 Edge，未安装 Edge 时自动使用 Chrome；也可以明确传入 `--browser edge` 或 `--browser chrome`。

只有用户明确要求保留登录状态时，才使用与所选浏览器对应的 Shiye 专用档案，例如 Chrome：

```powershell
.\shiye.cmd capture .\urls.txt --browser chrome --visible --profile .\data\browser-profile-chrome --json
```

AI 不得替用户绕过验证码、付费墙或访问控制。出现这些情况时，应停止并让用户在可见浏览器窗口中处理。

## 隐私要求

- 不上传网址列表、截图、失败现场或 `results.json`；
- 不读取或公开 `data/browser-profile-*`；
- 不把本地绝对路径、Cookie、Token 或登录信息写入公开 Issue；
- 只有用户明确指定目标并授权时，才可以向外部服务传输文件。
