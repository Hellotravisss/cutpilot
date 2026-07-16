import { readFileSync, writeFileSync } from "node:fs";
import { renderGlslVideo } from "./glsl-shader-engine.mjs";
const spec=JSON.parse(readFileSync(process.argv[2],"utf8"));try{const result=renderGlslVideo(spec);writeFileSync(process.argv[3],JSON.stringify({ok:true,result}))}catch(error){writeFileSync(process.argv[3],JSON.stringify({ok:false,error:error.message}));process.exitCode=1}
