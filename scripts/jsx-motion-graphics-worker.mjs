import { readFileSync } from "node:fs";
import { join } from "node:path";
import puppeteer from "puppeteer-core";

const job=JSON.parse(readFileSync(process.argv[2],"utf8")),bundle=readFileSync(job.bundle,"utf8");
const browser=await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:true,args:["--disable-gpu-sandbox","--ignore-gpu-blocklist"]});
try{const page=await browser.newPage();await page.setViewport({width:job.width,height:job.height,deviceScaleFactor:1});await page.setRequestInterception(true);page.on('request',r=>r.url().startsWith('data:')?r.continue():r.abort());await page.setContent(`<style>html,body,#root{margin:0;width:100%;height:100%;overflow:hidden;background:transparent}*{box-sizing:border-box}</style><div id="root"></div><script>${bundle.replace(/<\/script/gi,'<\\/script')}</script>`);await page.setOfflineMode(true);for(let frame=0;frame<job.totalFrames;frame++){await page.evaluate(async payload=>{await window.__render(payload)}, {...job.props,frame,fps:job.fps,durationInFrames:job.totalFrames,width:job.width,height:job.height,progress:job.totalFrames>1?frame/(job.totalFrames-1):0});await page.screenshot({path:join(job.frames,String(frame+1).padStart(6,'0')+'.png'),omitBackground:true,clip:{x:0,y:0,width:job.width,height:job.height}})}}finally{await browser.close()}
