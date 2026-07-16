import { openReviewSession } from "../scripts/review-server-engine.mjs";

const [projectPath, previewPath] = process.argv.slice(2);
if (!projectPath) throw new Error("Usage: node tests/review-live.mjs PROJECT [PREVIEW]");
const session = await openReviewSession({ projectPath, previewPath });
console.log(JSON.stringify(session));
setInterval(() => {}, 60_000);
