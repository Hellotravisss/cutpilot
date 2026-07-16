const capabilities = Object.freeze([
  { id:"project-types",category:"workflow",label:"分类项目工作流",status:"complete",detail:"Vlog、口播、访谈/播客、婚礼、产品广告、解说、MG 均可创建专用工程" },
  { id:"timeline",category:"editing",label:"多轨时间线与精剪",status:"complete",detail:"多时间线、音视频轨、源监视器、插入/覆盖、链接、分割、修剪、Ripple、吸附、撤销/重做" },
  { id:"speech",category:"ai-editing",label:"语音与文本剪辑",status:"complete",detail:"本地转录、逐词时间、停顿检测、文字稿重排、短语定位、字幕生成" },
  { id:"asset-intelligence",category:"ai-editing",label:"自动素材理解",status:"complete",detail:"FFmpeg 技术/画面/响度/场景证据加 Apple Vision 语义标签和非身份人物/人脸数量，形成可审核标签与精确素材子片段" },
  { id:"natural-language-edit",category:"ai-editing",label:"AI 自然语言修改",status:"complete",detail:"内置中英文速度、音量、字幕、静音、删除、淡入淡出、溶解、缩放、曝光、饱和度和轨道锁定；开放意图由宿主 AI 拆成可审核工具计划" },
  { id:"vlog-director",category:"ai-editing",label:"Vlog 全流程导演",status:"complete",detail:"故事、配画、节奏、声音、包装、MG、总检与严格导出门" },
  { id:"category-directors",category:"ai-editing",label:"七类 AI 导演闭环",status:"complete",detail:"Vlog、口播、播客、婚礼、产品广告、解说与纯 MG 均有方案、应用、审核、渲染、统一验收和严格导出门" },
  { id:"multicam",category:"editing",label:"多机位",status:"complete",detail:"音频同步、说话人映射、自动切换方案、可编辑节目轨" },
  { id:"audio",category:"audio",label:"音频处理与混音",status:"complete",detail:"降噪、EQ、压缩、门限、齿音、音高、立体声、响度、Ducking、音频导出" },
  { id:"captions",category:"captions",label:"字幕",status:"complete",detail:"SRT/VTT/ASS 导入导出、双语、样式、逐词卡拉 OK、烧录" },
  { id:"motion-graphics",category:"graphics",label:"MG 动画",status:"complete",detail:"安全 SVG、JSX/React、关键帧、Shader、透明 PNG/MOV 与可编辑属性" },
  { id:"effects",category:"finishing",label:"画面效果与调色",status:"complete",detail:"遮罩、抠像、曲线、调色、LUT、GLSL、转场、智能重构图、变速" },
  { id:"generation",category:"generation",label:"完整素材生成编排",status:"complete",detail:"图像、视频、旁白、音乐、音效均有本地默认输出、持久作业、供应商就绪探测、远端桥接、状态追踪、下载、溯源与素材库写入" },
  { id:"commercial-generation",category:"generation",label:"商业生成模型连接",status:"configured",detail:"OpenAI、Seedance、Kling、Mureka 和 SFX 桥已实现；实际生成依赖用户自己的端点、账号、额度与授权" },
  { id:"interchange",category:"export",label:"专业剪辑交换",status:"complete",detail:"FCPXML、Premiere XML、EDL 导入/导出及后台持久导出任务" },
  { id:"delivery-pack",category:"export",label:"多平台交付包",status:"complete",detail:"从批准时间线生成 16:9、9:16、1:1、4:5 独立可编辑版本，并让每个后台任务锁定指定时间线" },
  { id:"capcut-handoff",category:"export",label:"剪映/CapCut 可编辑交付",status:"complete",detail:"复制源素材、官方可导入 UTF-8 SRT、EDL 时间码、FCPXML、Premiere XML、完整轨道清单和现代草稿加密探测" },
  { id:"jianying-direct-draft",category:"export",label:"剪映私有直开草稿",status:"experimental",detail:"旧版明文草稿可生成；现代私有加密草稿没有公开写入协议，系统只做只读探测，不伪造破解兼容" },
  { id:"review-ui",category:"manual-editing",label:"嵌入式人工编辑器",status:"complete",detail:"本地受保护审片页可调整时间线、字幕、效果、MG、音频、导出与 AI 引用" },
  { id:"remotion",category:"graphics",label:"Remotion 工程兼容",status:"complete",detail:"官方 Remotion 4 工程检查、受审依赖安装、bundle、Composition/props 发现、视频及静帧渲染" },
  { id:"gpu-shader-batch",category:"render",label:"并发 GPU Shader 批量渲染",status:"complete",detail:"1–8 个独立 Chrome WebGL1 工作者并发执行最多 100 个作业，逐项隔离失败并持久保存批次结果" },
]);

export function listCapabilities() { return capabilities.map((entry)=>({ ...entry })); }
export function capabilitySummary() { const entries=listCapabilities(),counts=Object.fromEntries(["complete","configured","experimental","planned"].map((status)=>[status,entries.filter((entry)=>entry.status===status).length])); return { type:"cutpilot-capability-matrix",version:6,counts,total:entries.length,entries }; }
export function listCapabilityGaps() { const entries=listCapabilities().filter((entry)=>entry.status!=="complete"); return { type:"cutpilot-capability-gaps",gaps:entries,blocking:entries.filter((entry)=>entry.status==="planned"),externalConfiguration:entries.filter((entry)=>entry.status==="configured"),experimental:entries.filter((entry)=>entry.status==="experimental") }; }
