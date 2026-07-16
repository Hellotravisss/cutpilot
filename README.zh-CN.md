# CutPilot 10

[English](README.md) | [简体中文](README.zh-CN.md)

CutPilot 是一个本地优先的 AI 视频剪辑引擎，可以由 Codex、Claude 或任何兼容 MCP 的 AI 主机控制。AI 能够理解本地素材、生成可审核的剪辑方案、修改真实的多轨项目、打开内置时间线，并在本机完成渲染；源素材和每一次剪辑决定始终由用户掌控。

访问产品网站：[cutpilot.lowbattery.studio](https://cutpilot.lowbattery.studio)

## CutPilot 是什么

CutPilot 把 AI 助手、视频处理引擎和可视化编辑界面连接在一起。你可以直接告诉 AI：

> 分析这个文件夹里的素材，剪成一条 60 秒的生活 Vlog。按旁白内容匹配画面，写代码时使用电脑镜头，说到婚礼时切到婚礼素材，避免重复镜头，并先让我确认剪辑方案。

AI 会分析素材、规划镜头、同步旁白和字幕，并把确认后的方案写入可继续编辑的时间线。你也可以随时进入 CutPilot 界面，像传统剪辑软件一样手动调整时间线、字幕、音频、效果和 MG 动画。

CutPilot 不是要替代所有传统剪辑操作，而是让 AI 真正参与素材理解、剪辑决策和重复工作，同时保留人工精修能力。

## 核心能力

- 219 个 MCP 工具（包含 4 个高级工作流入口）和 9 种项目启动模板。
- 可直接配置 OpenAI、Anthropic 或兼容接口使用独立 AI 模式；任何时间线写入仍需人工确认。
- 工程原子写入、跨进程锁、自动备份恢复、格式迁移、工程修复、撤销/重做和快照。
- 多轨视频与音频时间线，支持音画链接、裁切、分割、波纹操作、吸附、标记、关键帧、效果、转场、字幕、撤销/重做和后台导出。
- 本地转录、文字稿编辑、静音检测、场景检测、节拍分析、重复镜头检查、代理媒体和智能重构画面。
- 使用 FFmpeg 证据和 macOS Apple Vision 语义标签自动理解素材；不会推断人物身份。
- 先规划、后确认的自然语言修改，覆盖速度、音量、字幕、静音、删除、淡入淡出、溶解、缩放、曝光、饱和度和轨道锁定等操作。
- Vlog、口播、播客、婚礼、产品宣传、知识讲解和 MG 动画导演工作流。
- SVG、JSX/React MG 动画、WebGL Shader、并行 Shader 任务和真实的 Remotion 4 工程渲染。
- 支持导出 FCPXML、Premiere XML、EDL、SRT/VTT/ASS，以及安全的剪映/CapCut 继续编辑交接包。
- 支持本地程序化素材和 macOS 系统旁白，也可配置 OpenAI、Seedance、Kling、Mureka、音效服务及通用 HTTP 生成接口。
- 项目级语义素材索引、跨类别 Director Agent，以及支持取消、重试和重启恢复的后台任务中心。

## 典型工作流程

1. 创建项目并选择片型，例如 Vlog、婚礼或产品宣传。
2. 导入本地素材，建立代理文件、转录和语义索引。
3. 用自然语言描述目标，由 AI 生成剪辑方案；涉及改动的操作先审核再执行。
4. 在内置界面继续手动调整，最后本地渲染或导出到其他剪辑软件。

## 运行要求

- macOS
- Node.js 18 或更高版本
- FFmpeg 和 FFprobe
- Google Chrome
- ImageMagick（用于本地图片生成）
- Xcode Command Line Tools（用于 Apple Vision 分类）

使用 Homebrew 安装主要依赖：

```bash
brew install ffmpeg imagemagick
xcode-select --install
```

在已下载的仓库中一键完成安装和依赖检查：

```bash
./install-macos.sh --install-deps
```

无需 Codex 或 Claude，直接启动并导入素材文件夹：

```bash
~/.local/bin/cutpilot --project ~/Movies/my-video.cutpilot.json --media ~/Movies/clips
```

进入编辑器的 **AI** 标签即可配置 OpenAI、Anthropic 或兼容接口。API Key 使用仅当前用户可读的权限保存在 `~/.cutpilot/settings.json`，不会写入项目工程。

## 从源码运行

```bash
git clone https://github.com/Hellotravisss/cutpilot.git
cd cutpilot
npm install
npm run validate
node scripts/server.mjs
```

服务启动后，可通过兼容 MCP 的 AI 主机连接 CutPilot。基础配置示例：

```json
{
  "mcpServers": {
    "cutpilot": {
      "command": "node",
      "args": ["/你的绝对路径/cutpilot/scripts/server.mjs"]
    }
  }
}
```

仓库内已经包含 Codex、Claude Code 和 Claude Desktop 的配置示例与安装脚本。Claude 相关说明见 [claude/README.md](claude/README.md)。

## 本地优先与安全

- 原始素材默认保留在本机；只有用户明确选择远程生成或转录服务时，相关内容才会发往对应服务商。
- 自然语言修改会先生成计划，并要求明确批准后才执行。
- 破坏性操作会在计划中标记。
- 外部 Remotion 项目的依赖安装需要批准，且默认禁用生命周期脚本。
- Apple Vision 可以识别场景并统计检测到的人体或人脸，但 CutPilot 不识别具体人物。
- 付费生成模型需要用户自己的账号、接口、授权和计费配置。

可以通过 MCP 工具 `audit_runtime_readiness` 检查当前电脑上哪些能力已经就绪。

## 导出与继续编辑

CutPilot 可以输出常见的交换格式，包括 FCPXML、Premiere XML、EDL 和多种字幕格式。对于剪映/CapCut，CutPilot 提供素材、字幕和时间码组成的安全交接包。

现代剪映工程采用专有加密格式，目前没有公开、稳定的写入协议，因此 CutPilot 不会声称可以可靠解密或直接改写所有新版剪映草稿。

## 当前边界

- 目前主要面向 macOS。
- 开放式创意指令需要配置 CutPilot 内置 AI，或连接 Codex、Claude 等兼容 MCP 的 AI 主机。
- 商业视频、图片、音乐和语音生成服务只有在配置相应凭证与接口后才能使用。
- 直接写入现代专有加密剪映草稿仍属于实验能力。

## 验证

```bash
npm run test:core
npm run test:browser
```

测试覆盖真实 FFmpeg 媒体、Apple Vision、自然语言计划、内置浏览器界面、Remotion 渲染、生成任务、CapCut 交接、WebGL 批量渲染和 MCP 启动。

## 许可证

目前尚未授予开源许可证。源代码可以公开查看，但在后续添加许可证前，复用和再分发权利仍然保留。
