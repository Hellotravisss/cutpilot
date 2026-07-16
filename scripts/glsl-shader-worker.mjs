import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import puppeteer from "puppeteer-core";

const job = JSON.parse(readFileSync(process.argv[2], "utf8"));
const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true, args: ["--disable-gpu-sandbox", "--enable-webgl", "--ignore-gpu-blocklist"] });
try {
  const page = await browser.newPage(); await page.setViewport({ width: job.width, height: job.height, deviceScaleFactor: 1 });
  await page.setContent(`<canvas id="c" width="${job.width}" height="${job.height}"></canvas>`);
  const source = job.fragmentSource;
  const setup = await page.evaluate(({ source, uniforms }) => {
    const gl = document.querySelector('#c').getContext('webgl', { preserveDrawingBuffer: true, alpha: false }); if (!gl) return { error: 'WebGL unavailable' };
    const compile=(type,code)=>{const s=gl.createShader(type);gl.shaderSource(s,code);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));return s};
    try{const program=gl.createProgram();gl.attachShader(program,compile(gl.VERTEX_SHADER,'attribute vec2 a_position;varying vec2 v_texCoord;void main(){v_texCoord=vec2((a_position.x+1.0)/2.0,1.0-(a_position.y+1.0)/2.0);gl_Position=vec4(a_position,0.0,1.0);}'));gl.attachShader(program,compile(gl.FRAGMENT_SHADER,source));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program));gl.useProgram(program);const b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);const p=gl.getAttribLocation(program,'a_position');gl.enableVertexAttribArray(p);gl.vertexAttribPointer(p,2,gl.FLOAT,false,0,0);const tex=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,tex);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);window.runtime={gl,program,tex,uniforms};return {ok:true}}catch(e){return {error:e.message}}
  }, { source, uniforms: job.uniforms });
  if (setup.error) throw new Error(`GLSL compile/link failed: ${setup.error}`);
  const frames = readdirSync(job.inputFrames).filter((name) => name.endsWith('.png')).sort();
  for (let index = 0; index < frames.length; index++) {
    const bytes = readFileSync(join(job.inputFrames, frames[index])).toString('base64');
    const result = await page.evaluate(async ({ bytes, index, total, fps, width, height }) => {
      const {gl,program,tex,uniforms}=window.runtime,img=new Image();img.src='data:image/png;base64,'+bytes;await img.decode();gl.bindTexture(gl.TEXTURE_2D,tex);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,img);const sampler=gl.getUniformLocation(program,'u_texture');if(sampler!==null)gl.uniform1i(sampler,0);const set=(name,value)=>{const loc=gl.getUniformLocation(program,name);if(loc===null)return;if(Array.isArray(value)){if(value.length===2)gl.uniform2fv(loc,value);else if(value.length===3)gl.uniform3fv(loc,value);else if(value.length===4)gl.uniform4fv(loc,value)}else gl.uniform1f(loc,Number(value))};set('u_time',index/fps);set('u_progress',total>1?index/(total-1):0);set('u_resolution',[width,height]);Object.entries(uniforms).forEach(([k,v])=>set(k,v));gl.viewport(0,0,width,height);gl.drawArrays(gl.TRIANGLES,0,6);const err=gl.getError();return err?{error:'WebGL error '+err}:{ok:true};
    }, { bytes, index, total: frames.length, fps: job.fps, width: job.width, height: job.height });
    if (result.error) throw new Error(result.error);
    await page.screenshot({ path: join(job.outputFrames, frames[index]), clip: { x: 0, y: 0, width: job.width, height: job.height } });
  }
} finally { await browser.close(); }
