# 论文分析小助手

粘贴或拖入一篇论文，用你自己的大模型 API，生成一份**锚定原文**的分析报告。

纯前端应用：没有服务端、没有数据库、不保存任何内容。关掉页面，一切归零。

## 特点

- **意见有落点**：每条问题都要求引用具体原文或章节位置，不允许"论证有待加强"这类空话
- **长文不漏读**：按章节自动切块并行分析，再汇总成一份完整报告
- **不评分、不分级**：只给判断和修改方向，不给分数
- **数据不出浏览器**：论文只在内存中处理，密钥只存在本地 localStorage
- **零成本部署**：纯静态站点，托管在 GitHub Pages

## 使用

打开 https://tiandou250.github.io/thesis-agent/

1. 点右上角齿轮，填入接口地址、API Key、模型名称，点「测试连接」
2. 把论文拖进来，或直接粘贴文本
3. 点「开始分析」
4. 报告流式生成后可下载 `.md`

支持的输入格式：`.docx` / `.pdf` / `.txt` / `.md` / 直接粘贴。

## 模型支持

本项目只支持 **OpenAI 兼容格式**（请求打到 `{Base URL}/chat/completions`）。

因为完全在浏览器里运行，所以依赖服务端允许跨域（CORS）：

| 服务 | Base URL | 网页直连 |
| --- | --- | --- |
| DeepSeek | `https://api.deepseek.com/v1` | 支持 |
| Kimi / Moonshot | `https://api.moonshot.cn/v1` | 支持 |
| 硅基流动 | `https://api.siliconflow.cn/v1` | 支持 |
| 智谱 GLM | `https://open.bigmodel.cn/api/paas/v4` | 不支持（无 CORS 头） |
| OpenAI 官方 | `https://api.openai.com/v1` | 不支持 |

遇到跨域被拦，界面会明确提示。

## 本地预览

纯静态站点，任何静态服务器都能跑：

```bash
python -m http.server 8088
```

然后打开 `http://127.0.0.1:8088/`。

## 结构

```
index.html              入口
css/memphis.css         孟菲斯风格样式
src/
  main.js               挂载
  api/client.js         直连模型 API（含流式解析、错误映射）
  components/           Vue 组件（用 template 字符串，无构建）
  modules/
    llmConfig.js        配置存取 + token 估算 + 窗口预检
    chunker.js          按标题切块
    parser.js           docx / pdf / 文本解析
    prompts.js          三套 prompt 模板
    report.js           渲染、下载、复制
vendor/                 本地依赖（Vue / markdown-it / DOMPurify / mammoth / pdf.js）
.github/workflows/      自动部署到 GitHub Pages
PRD.md                  产品需求文档
```

技术选型说明：项目**不使用构建工具**。EdgeOne/GitHub Pages 都是静态直出，Vue 走 ESM + importmap 直接加载，依赖全部落在 `vendor/`，零 `node_modules`、零打包步骤。

## 免责声明

本报告由 AI 生成，仅作为写作自检参考，不能替代导师或评审专家的专业意见。
