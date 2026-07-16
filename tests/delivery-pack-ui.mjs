import assert from "node:assert/strict";
import { mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import puppeteer from "puppeteer-core";
import { newProject, saveProject } from "../scripts/project-store.mjs";
import { closeReviewSession, openReviewSession } from "../scripts/review-server-engine.mjs";
import { selectVideoType } from "../scripts/video-type-engine.mjs";

const root=resolve(process.argv[2]||"/tmp/cutpilot-delivery-ui"),proof=process.argv[3]&&resolve(process.argv[3]);rmSync(root,{recursive:true,force:true});mkdirSync(root,{recursive:true});
const projectPath=`${root}/delivery-ui.cutpilot.json`,project=newProject({name:"Delivery UI",width:1920,height:1080,fps:30});selectVideoType(project,"vlog",{format:"landscape",objective:"Delivery pack UI acceptance"});saveProject(projectPath,project);
const review=await openReviewSession({projectPath}),browser=await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:true,args:["--no-sandbox"]}),page=await browser.newPage(),errors=[];page.on("pageerror",error=>errors.push(error.message));
await page.setViewport({width:1440,height:1000});await page.goto(review.url,{waitUntil:"networkidle0"});await page.click('[data-tab="export"]');await new Promise(done=>setTimeout(done,500));let panel=await page.$eval('#panel',element=>element.textContent);assert.match(panel,/多平台交付包/,`panel=${panel}; errors=${errors.join('; ')}`);await page.click('#createDeliveryVariants');await page.waitForFunction(()=>document.querySelector('#panel')?.textContent.includes('Feed 4:5'),{timeout:10000});panel=await page.$eval('#panel',element=>element.textContent);assert.match(panel,/YouTube 16:9/);assert.match(panel,/Shorts \/ Reels 9:16/);assert.match(panel,/Square 1:1/);assert.match(panel,/Feed 4:5/);assert.equal(errors.length,0,errors.join('; '));if(proof)await page.screenshot({path:proof,fullPage:true});await browser.close();closeReviewSession(review.token);console.log(JSON.stringify({ok:true,variants:4,pageErrors:errors.length},null,2));
