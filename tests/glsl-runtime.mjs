import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { renderGlslVideo, validateGlslSource } from "../scripts/glsl-shader-engine.mjs";
import { applyTimelineEdit, newProject } from "../scripts/project-store.mjs";
import { renderProject } from "../scripts/media-engine.mjs";

const root=resolve(process.argv[2]||"/tmp/mycut-glsl-test");rmSync(root,{recursive:true,force:true});mkdirSync(root,{recursive:true});
const run=(c,a)=>{const r=spawnSync(c,a,{encoding:"utf8"});if(r.status)throw new Error(r.stderr)};
const source=`precision mediump float;uniform sampler2D u_texture;uniform float u_time;uniform float u_progress;uniform vec2 u_resolution;uniform float intensity;varying vec2 v_texCoord;void main(){vec4 c=texture2D(u_texture,v_texCoord);float pulse=0.5+0.5*sin(u_time*8.0);vec3 inverted=vec3(1.0)-c.rgb;gl_FragColor=vec4(mix(c.rgb,inverted,intensity*pulse),c.a);}`;
assert.equal(validateGlslSource(source).valid,true);assert.equal(validateGlslSource("void main(){while(true){}}").valid,false);
const input=`${root}/input.mp4`,direct=`${root}/direct.mp4`,timeline=`${root}/timeline.mp4`;
run("ffmpeg",["-y","-hide_banner","-loglevel","error","-f","lavfi","-i","color=c=0x2040c0:s=160x90:r=10:d=0.6","-c:v","libx264","-pix_fmt","yuv420p",input]);
const result=renderGlslVideo({inputPath:input,outputPath:direct,fragmentSource:source,uniforms:{intensity:1},width:160,height:90,fps:10,duration:0.6});assert.equal(result.backend,"chrome-webgl1");
const project=newProject({name:"GLSL",width:160,height:90,fps:10});project.assets.push({id:"clip",path:input,name:"clip",type:"video",duration:.6});applyTimelineEdit(project,{trackName:"V1",adds:[{assetId:"clip",start:0,sourceStart:0,duration:.6,effects:[{type:"glsl",name:"Pulse invert",source,uniforms:{intensity:1}}]}]});renderProject(project,timeline,{crf:20});
const frames=[.1,.5].map((t,i)=>{const p=`${root}/frame-${i}.png`;run("ffmpeg",["-y","-hide_banner","-loglevel","error","-ss",String(t),"-i",timeline,"-frames:v","1",p]);return p});const hashes=frames.map(p=>createHash("sha256").update(readFileSync(p)).digest("hex"));assert.notEqual(hashes[0],hashes[1]);
console.log(JSON.stringify({sourceValidated:true,unsafeRejected:true,direct,timeline,frames,hashes,backend:result.backend},null,2));
