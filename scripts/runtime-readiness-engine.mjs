import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { inspectGenerationProviders } from "./generation-job-engine.mjs";
import { readAiSettings } from "./ai-provider-engine.mjs";

const command=(name)=>spawnSync("/usr/bin/which",[name],{encoding:"utf8"}).status===0;
function baseAuditRuntimeReadiness(){const checks=[
  {id:"ffmpeg",required:true,pass:command("ffmpeg"),detail:"media decode, analysis and render"},
  {id:"ffprobe",required:true,pass:command("ffprobe"),detail:"media verification"},
  {id:"imagemagick",required:false,pass:command("magick")||command("convert"),detail:"local procedural image generation"},
  {id:"chrome",required:true,pass:existsSync("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"),detail:"review, JSX and WebGL rendering"},
  {id:"apple-vision",required:false,pass:process.platform==="darwin"&&command("xcrun"),detail:"semantic frame labels and non-identity people/face counts"},
  {id:"macos-voice",required:false,pass:process.platform==="darwin"&&command("say"),detail:"local TTS"},
];const generation=inspectGenerationProviders(),blocking=checks.filter(x=>x.required&&!x.pass),warnings=[...checks.filter(x=>!x.required&&!x.pass).map(x=>`${x.id} unavailable`),...(generation.ready.length<2?["Only limited generation providers are ready"]:[])];return{type:"cutpilot-runtime-readiness",ready:blocking.length===0,platform:process.platform,checks,generation,knownExternalBoundaries:[{id:"jianying-direct-draft",status:"experimental",reason:"Modern proprietary encrypted drafts have no public write protocol"},{id:"subjective-natural-language",status:"host-ai-required",reason:"Open-ended creative instructions require Codex or another connected model to decompose them into exact tools"},{id:"paid-generation",status:"credentials-required",reason:"Commercial model calls require provider endpoints, accounts and billing"}],blocking,warnings,auditedAt:new Date().toISOString()}}

export function auditRuntimeReadiness(){const audit=baseAuditRuntimeReadiness(),independentAi=readAiSettings();audit.independentAi=independentAi;audit.knownExternalBoundaries=audit.knownExternalBoundaries.map(entry=>entry.id!=="subjective-natural-language"?entry:{...entry,status:independentAi.hasApiKey?"configured":"provider-or-host-required",reason:"Open-ended creative instructions require either CutPilot's configured AI provider or a connected MCP AI host"});if(!independentAi.hasApiKey)audit.warnings.push("Independent AI is not configured; MCP hosts can still control CutPilot");return audit}
