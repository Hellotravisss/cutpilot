import assert from "node:assert/strict";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fcpxmlToProject, importFcpxml, importPremiereXml, premiereXmlToProject, projectToPremiereXml } from "../scripts/interchange-engine.mjs";
import { activeTimeline, validateProject } from "../scripts/project-store.mjs";
import { probeOutput, renderProject } from "../scripts/media-engine.mjs";

const root = resolve(process.argv[2] || "/tmp/mycut-interchange-imports");
rmSync(root, { recursive: true, force: true }); mkdirSync(root, { recursive: true });
const run = (command, args) => { const result = spawnSync(command, args, { encoding: "utf8" }); if (result.status !== 0) throw new Error(result.stderr); };
const red = `${root}/red.mp4`, blue = `${root}/blue.mp4`, audio = `${root}/tone.wav`;
run("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=red:s=320x180:r=25:d=4", "-c:v", "libx264", "-pix_fmt", "yuv420p", red]);
run("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=blue:s=320x180:r=25:d=4", "-c:v", "libx264", "-pix_fmt", "yuv420p", blue]);
run("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=4", "-c:a", "pcm_s16le", audio]);
const redUrl = pathToFileURL(red).href, blueUrl = pathToFileURL(blue).href, audioUrl = pathToFileURL(audio).href;

const fcpxml = `<?xml version="1.0" encoding="UTF-8"?><fcpxml version="1.10"><resources>
  <format id="r1" frameDuration="1/25s" width="320" height="180"/>
  <asset id="red" name="Red" src="${redUrl}" duration="4s" hasVideo="1" hasAudio="0"/>
  <asset id="blue" name="Blue" src="${blueUrl}" duration="4s" hasVideo="1" hasAudio="0"/>
  <asset id="tone" name="Tone" src="${audioUrl}" duration="4s" hasVideo="0" hasAudio="1"/>
  <media id="nested" name="Nested"><sequence format="r1" duration="1s"><spine><asset-clip ref="blue" offset="0s" start="1s" duration="1s"/></spine></sequence></media>
</resources><library><event name="Event"><project name="Complex FCPXML"><sequence format="r1" duration="3s"><marker start="2s" value="Sequence marker"/><spine>
  <asset-clip ref="red" offset="0s" start="0s" duration="1s"><marker start="1/2s" value="Clip marker"/></asset-clip>
  <gap offset="1s" duration="1/2s"><asset-clip ref="blue" lane="1" offset="0s" start="0s" duration="1/2s"/></gap>
  <ref-clip ref="nested" offset="3/2s" start="0s" duration="1s"><title lane="1" offset="0s" duration="1s"><text><text-style>Nested title</text-style></text></title></ref-clip>
  <asset-clip ref="tone" lane="-1" offset="0s" start="0s" duration="5/2s" audioRole="dialogue"><adjust-volume amount="-6dB"/></asset-clip>
</spine></sequence></project></event></library></fcpxml>`;
const fcpPath = `${root}/complex.fcpxml`; writeFileSync(fcpPath, fcpxml);
const fcp = importFcpxml(fcpPath, `${root}/complex-fcp.mycut.json`).project, fcpTimeline = activeTimeline(fcp), fcpItems = fcpTimeline.tracks.flatMap((track) => track.items);
assert.equal(fcpTimeline.fps, 25); assert.equal(fcpTimeline.width, 320); assert.equal(fcpItems.length, 4);
assert.deepEqual(fcpItems.filter((item) => item.label === "Blue").map((item) => item.start).sort(), [1, 1.5]);
assert.equal(fcpTimeline.markers.length, 2); assert.equal(fcpTimeline.captions.cues[0].text, "Nested title");
assert.equal(fcpItems.find((item) => item.label === "Tone").volumeDb, -6); assert.equal(validateProject(fcp).valid, true);
const fcpRender = renderProject(fcp, `${root}/complex-fcp.mp4`, { burnCaptions: true }); assert.equal(probeOutput(fcpRender.outputPath).streams.find((stream) => stream.codec_type === "video").width, 320);

const rate = `<rate><timebase>25</timebase><ntsc>FALSE</ntsc></rate>`;
const premiere = `<?xml version="1.0"?><xmeml version="5"><sequence><name>Complex Premiere</name>${rate}<marker><name>Cut here</name><comment>Beat</comment><in>25</in><out>30</out></marker><media><video><format><samplecharacteristics>${rate}<width>320</width><height>180</height></samplecharacteristics></format>
<track><clipitem><name>Red first</name><start>0</start><end>25</end><in>25</in><out>50</out><file id="f1"><name>Red</name><pathurl>${redUrl}</pathurl>${rate}<duration>100</duration><media><video/></media></file></clipitem><clipitem><name>Red reused</name><start>25</start><end>50</end><in>0</in><out>25</out><file id="f1"/></clipitem></track>
<track><clipitem><name>Blue overlap</name><start>10</start><end>35</end><in>0</in><out>25</out><file id="f2"><name>Blue</name><pathurl>${blueUrl}</pathurl>${rate}<duration>100</duration><media><video/></media></file></clipitem></track></video>
<audio><track><clipitem><name>Tone</name><start>0</start><end>50</end><in>0</in><out>50</out><file id="a1"><name>Tone</name><pathurl>${audioUrl}</pathurl>${rate}<duration>100</duration><media><audio/></media></file><filter><effect><parameter><parameterid>level</parameterid><value>0.501187</value></parameter></effect></filter></clipitem></track></audio>
</media></sequence></xmeml>`;
const premierePath = `${root}/complex-premiere.xml`; writeFileSync(premierePath, premiere);
const imported = importPremiereXml(premierePath, `${root}/complex-premiere.mycut.json`).project, importedTimeline = activeTimeline(imported), importedItems = importedTimeline.tracks.flatMap((track) => track.items);
assert.equal(imported.assets.length, 3); assert.equal(importedItems.length, 4); assert.equal(importedTimeline.markers[0].time, 1); assert.equal(importedItems.find((item) => item.label === "Red first").sourceStart, 1);
assert.ok(Math.abs(importedItems.find((item) => item.label === "Tone").volumeDb + 6) < 0.01); assert.equal(validateProject(imported).valid, true);
const roundtrip = premiereXmlToProject(projectToPremiereXml(imported)); assert.equal(activeTimeline(roundtrip).tracks.flatMap((track) => track.items).length, 4);
const premiereRender = renderProject(imported, `${root}/complex-premiere.mp4`); assert.equal(probeOutput(premiereRender.outputPath).streams.find((stream) => stream.codec_type === "video").height, 180);

assert.throws(() => fcpxmlToProject(fcpxml.replace(redUrl, "https://example.com/red.mp4")), /Only local file assets/);
assert.throws(() => premiereXmlToProject(`<!DOCTYPE xmeml [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><xmeml/>`), /entities and stylesheets/);
console.log(JSON.stringify({ ok: true, fcpItems: fcpItems.length, premiereItems: importedItems.length, fcpRender: fcpRender.outputPath, premiereRender: premiereRender.outputPath }, null, 2));
