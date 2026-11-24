// Génère le fond du .dmg : uni, avec une seule phrase en bas au centre.
// Usage : swift installer/make_dmg_background.swift <sortie_1x.png> <sortie_2x.png>
// Les deux images (72 et 144 ppp) sont ensuite réunies en un TIFF Retina par make_dmg.sh.
import AppKit

let width = 660.0, height = 400.0
let text = "Glissez PicTone dans Applications"

func render(scale: Int, to path: String) {
    let rep = NSBitmapImageRep(
        bitmapDataPlanes: nil, pixelsWide: Int(width) * scale, pixelsHigh: Int(height) * scale,
        bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
        colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
    rep.size = NSSize(width: width, height: height)  // 72 ppp à l'échelle 1, 144 ppp à l'échelle 2
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
    NSColor.white.setFill()
    NSRect(x: 0, y: 0, width: width, height: height).fill()
    let attributes: [NSAttributedString.Key: Any] = [
        .font: NSFont.systemFont(ofSize: 12),
        .foregroundColor: NSColor(calibratedWhite: 0.45, alpha: 1),
    ]
    let size = (text as NSString).size(withAttributes: attributes)
    (text as NSString).draw(at: NSPoint(x: (width - size.width) / 2, y: 64), withAttributes: attributes)
    NSGraphicsContext.restoreGraphicsState()
    try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: path))
}

render(scale: 1, to: CommandLine.arguments[1])
render(scale: 2, to: CommandLine.arguments[2])
