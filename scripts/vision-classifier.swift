import Foundation
import Vision
import ImageIO

guard CommandLine.arguments.count > 1 else { fatalError("image path required") }
let url = URL(fileURLWithPath: CommandLine.arguments[1]) as CFURL
guard let source = CGImageSourceCreateWithURL(url, nil), let image = CGImageSourceCreateImageAtIndex(source, 0, nil) else { fatalError("cannot read image") }
let classify = VNClassifyImageRequest()
let faces = VNDetectFaceRectanglesRequest()
let humans = VNDetectHumanRectanglesRequest()
let handler = VNImageRequestHandler(cgImage: image, options: [:])
try handler.perform([classify, faces, humans])
let labels = (classify.results ?? []).prefix(12).map { ["label": $0.identifier, "confidence": $0.confidence] as [String : Any] }
let result: [String: Any] = ["labels": labels, "faces": faces.results?.count ?? 0, "humans": humans.results?.count ?? 0]
let data = try JSONSerialization.data(withJSONObject: result)
print(String(data: data, encoding: .utf8)!)
