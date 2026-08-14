# 为拾页 Shiye 做贡献

感谢你愿意改进 Shiye。项目目前以 Windows、Microsoft Edge 和本地优先工作流为主要边界。

## 开发环境

- Windows 10 或 Windows 11
- Node.js 20.9 或更高版本
- Microsoft Edge

```powershell
npm ci
npm run build
```

## 提交问题

请尽量提供：

- Shiye 版本、Windows版本和 Edge 版本；
- 使用的命令或控制台设置；
- 能公开访问的最小复现网址；
- `results.json` 中已去除私人网址、路径和凭据的相关字段；
- 是否可以稳定复现。

不要公开上传浏览器档案、Cookie、登录凭据、付费内容或含个人信息的截图。

## 提交代码

1. 从最新默认分支创建功能分支；
2. 保持改动聚焦，不夹带无关格式化；
3. 为行为变化补充测试；
4. 本地执行完整验证；
5. 在 Pull Request 中说明目的、影响和验证结果。

```powershell
npm run check
npm test
npm run build
npm run test:e2e
```

## 项目原则

- 不绕过验证码、付费墙或访问控制；
- 不读取用户日常浏览器档案；
- 默认保持本地优先，不暗中上传网址、截图或登录数据；
- CLI 的机器可读输出和退出码应保持向后兼容；
- 对超长页面、失败和截断情况给出明确结果，不静默伪装成功。
