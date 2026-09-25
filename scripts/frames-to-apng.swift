// Writes an animated PNG from still frames with macOS's own ImageIO, so the
// README recordings need nothing installed.
//
//   swift scripts/frames-to-apng.swift <manifest> <output.png>
//
// Each manifest line is `<frame path>\t<seconds on screen>`. ImageIO encodes
// the pixels; the APNG chunks are written here, because ImageIO's own APNG
// writer stores every frame whole. Here a frame stores only the rectangle that
// changed since the one before: typing a word costs a few lines, not a screen.
import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

func fail(_ message: String) -> Never {
    FileHandle.standardError.write("frames-to-apng: \(message)\n".data(using: .utf8)!)
    exit(1)
}

let arguments = CommandLine.arguments
guard arguments.count == 3 else { fail("usage: frames-to-apng.swift <manifest> <output.png>") }

let frames: [(path: String, delay: Double)] = try String(contentsOfFile: arguments[1], encoding: .utf8)
    .split(separator: "\n")
    .map { line in
        let fields = line.split(separator: "\t")
        guard fields.count == 2, let delay = Double(fields[1]) else { fail("bad manifest line: \(line)") }
        return (String(fields[0]), delay)
    }
guard !frames.isEmpty else { fail("no frames") }

/// A frame's pixels as 8-bit RGBX, so every frame compares and encodes alike.
struct Pixels {
    let width: Int
    let height: Int
    let bytes: [UInt8]

    init(path: String) {
        guard let source = CGImageSourceCreateWithURL(URL(fileURLWithPath: path) as CFURL, nil),
            let image = CGImageSourceCreateImageAtIndex(source, 0, nil)
        else { fail("cannot read \(path)") }
        let (w, h) = (image.width, image.height)
        var bytes = [UInt8](repeating: 0, count: w * h * 4)
        bytes.withUnsafeMutableBytes { buffer in
            let context = CGContext(
                data: buffer.baseAddress, width: w, height: h, bitsPerComponent: 8,
                bytesPerRow: w * 4, space: CGColorSpace(name: CGColorSpace.sRGB)!,
                bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)!
            context.draw(image, in: CGRect(x: 0, y: 0, width: w, height: h))
        }
        (width, height, self.bytes) = (w, h, bytes)
    }

    /// The smallest rectangle holding every pixel that differs from `other`, or nil when none do.
    func changed(since other: Pixels) -> (x: Int, y: Int, width: Int, height: Int)? {
        var top = height, bottom = -1, left = width, right = -1
        for y in 0..<height {
            let row = y * width * 4
            for x in 0..<width {
                let i = row + x * 4
                if bytes[i] != other.bytes[i] || bytes[i + 1] != other.bytes[i + 1] || bytes[i + 2] != other.bytes[i + 2] {
                    top = min(top, y)
                    bottom = max(bottom, y)
                    left = min(left, x)
                    right = max(right, x)
                }
            }
        }
        return bottom < 0 ? nil : (left, top, right - left + 1, bottom - top + 1)
    }

    /// The PNG chunks ImageIO writes for the given rectangle of this frame.
    func png(x: Int, y: Int, width w: Int, height h: Int) -> [(type: String, data: Data)] {
        var crop = [UInt8](repeating: 0, count: w * h * 4)
        for row in 0..<h {
            let from = ((y + row) * width + x) * 4
            crop.replaceSubrange(row * w * 4..<(row + 1) * w * 4, with: bytes[from..<from + w * 4])
        }
        let provider = CGDataProvider(data: Data(crop) as CFData)!
        let image = CGImage(
            width: w, height: h, bitsPerComponent: 8, bitsPerPixel: 32, bytesPerRow: w * 4,
            space: CGColorSpace(name: CGColorSpace.sRGB)!,
            bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.noneSkipLast.rawValue),
            provider: provider, decode: nil, shouldInterpolate: false, intent: .defaultIntent)!
        let encoded = NSMutableData()
        let destination = CGImageDestinationCreateWithData(encoded, UTType.png.identifier as CFString, 1, nil)!
        CGImageDestinationAddImage(destination, image, nil)
        guard CGImageDestinationFinalize(destination) else { fail("cannot encode a frame") }
        return chunks(of: encoded as Data)
    }
}

func chunks(of png: Data) -> [(type: String, data: Data)] {
    var result: [(String, Data)] = []
    var offset = 8
    while offset + 8 <= png.count {
        let length = Int(png[offset..<offset + 4].reduce(0) { $0 << 8 | UInt32($1) })
        let type = String(decoding: png[offset + 4..<offset + 8], as: UTF8.self)
        result.append((type, png.subdata(in: offset + 8..<offset + 8 + length)))
        offset += 12 + length
    }
    return result
}

let crcTable: [UInt32] = (0..<256).map { n in
    (0..<8).reduce(UInt32(n)) { c, _ in c & 1 == 1 ? 0xEDB8_8320 ^ (c >> 1) : c >> 1 }
}

func crc(_ bytes: Data) -> UInt32 {
    ~bytes.reduce(~UInt32(0)) { crcTable[Int(($0 ^ UInt32($1)) & 0xFF)] ^ ($0 >> 8) }
}

func be32(_ value: Int) -> Data { withUnsafeBytes(of: UInt32(value).bigEndian) { Data($0) } }
func be16(_ value: Int) -> Data { withUnsafeBytes(of: UInt16(value).bigEndian) { Data($0) } }

var out = Data([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])
func write(_ type: String, _ data: Data) {
    let body = Data(type.utf8) + data
    out += be32(data.count) + body + be32(Int(crc(body)))
}

var sequence = 0
func frameControl(x: Int, y: Int, width: Int, height: Int, delay: Double) {
    let milliseconds = max(1, Int((delay * 1000).rounded()))
    // dispose 0 (leave it), blend 0 (replace): each frame paints over the last.
    write(
        "fcTL",
        be32(sequence) + be32(width) + be32(height) + be32(x) + be32(y)
            + be16(milliseconds) + be16(1000) + Data([0, 0]))
    sequence += 1
}

// A frame identical to the one before only lengthens that one.
var kept: [(pixels: Pixels, delay: Double)] = []
for frame in frames {
    let pixels = Pixels(path: frame.path)
    if let last = kept.last, pixels.changed(since: last.pixels) == nil {
        kept[kept.count - 1].delay += frame.delay
    } else {
        kept.append((pixels, frame.delay))
    }
}

let first = kept[0].pixels
let firstChunks = first.png(x: 0, y: 0, width: first.width, height: first.height)
write("IHDR", firstChunks.first { $0.type == "IHDR" }!.data)
write("acTL", be32(kept.count) + be32(0))  // 0 plays forever
for (type, data) in firstChunks where !["IHDR", "IDAT", "IEND"].contains(type) { write(type, data) }

for (index, frame) in kept.enumerated() {
    let area =
        index == 0
        ? (x: 0, y: 0, width: first.width, height: first.height)
        : frame.pixels.changed(since: kept[index - 1].pixels)!
    frameControl(x: area.x, y: area.y, width: area.width, height: area.height, delay: frame.delay)
    let data = index == 0 ? firstChunks : frame.pixels.png(x: area.x, y: area.y, width: area.width, height: area.height)
    for (type, bytes) in data where type == "IDAT" {
        if index == 0 {
            write("IDAT", bytes)
        } else {
            write("fdAT", be32(sequence) + bytes)
            sequence += 1
        }
    }
}
write("IEND", Data())

do {
    try out.write(to: URL(fileURLWithPath: arguments[2]))
} catch {
    fail("cannot write \(arguments[2]): \(error)")
}
