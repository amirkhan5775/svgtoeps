import { NextRequest, NextResponse } from "next/server";
import { Canvg, presets } from "canvg";
import { JSDOM } from "jsdom";
import { EPSContext } from "@/lib/eps-context";

/**
 * Padds a string to a minimum size in bytes by adding PostScript comments.
 */
function padEPS(content: string, minSizeBytes: number): string {
  try {
    const currentSize = Buffer.byteLength(content, 'utf8');
    if (currentSize >= minSizeBytes) return content;

    let needed = minSizeBytes - currentSize;
    // Account for the comment overhead
    needed -= 100; 

    if (needed <= 0) return content;

    // Create large padding string
    let padding = "\n% PADDING TO MEET MINIMUM SIZE REQUIREMENT\n";
    
    // We'll use a more efficient way to generate large padding
    const line = "% " + ".".repeat(75) + "\n";
    const lineSize = Buffer.byteLength(line, 'utf8');
    const numLines = Math.floor(needed / lineSize);
    
    padding += line.repeat(Math.max(0, numLines));
    
    return content.replace('%%EOF', padding + '%%EOF');
  } catch (e) {
    console.error("Padding error:", e);
    return content;
  }
}

export async function POST(req: NextRequest) {
  try {
    console.log("Conversion request received");
    
    let formData;
    try {
      formData = await req.formData();
    } catch (err) {
      console.error("FormData parse error:", err);
      return NextResponse.json({ error: "Failed to parse form data. The file might be too large." }, { status: 413 });
    }

    const files = formData.getAll("files") as File[];

    if (!files || files.length === 0) {
      return NextResponse.json({ error: "No files uploaded" }, { status: 400 });
    }

    const results = [];

    for (const file of files) {
      try {
        const svgText = await file.text();
        
        if (!svgText.includes("<svg")) {
          results.push({ name: file.name, error: "Invalid SVG file content" });
          continue;
        }

        // Use JSDOM for better SVG parsing
        const dom = new JSDOM(svgText, { contentType: "image/svg+xml" });
        const doc = dom.window.document;
        const svgEl = doc.documentElement;
        
        if (!svgEl || svgEl.tagName.toLowerCase() !== "svg") {
          results.push({ name: file.name, error: "Invalid or malformed SVG structure" });
          continue;
        }
        
        let width = parseInt(svgEl.getAttribute("width") || "");
        let height = parseInt(svgEl.getAttribute("height") || "");
        
        // Fallback to viewBox
        const viewBox = svgEl.getAttribute("viewBox");
        if (viewBox && (isNaN(width) || isNaN(height))) {
          const parts = viewBox.split(/[ ,]/).filter(Boolean);
          if (parts.length === 4) {
            width = parseFloat(parts[2]);
            height = parseFloat(parts[3]);
          }
        }

        if (isNaN(width) || width <= 0) width = 800;
        if (isNaN(height) || height <= 0) height = 600;

        const ctx = new EPSContext(width, height);
        
        const canvasMock = {
          width,
          height,
          style: { width: `${width}px`, height: `${height}px` },
          getContext: () => ctx,
        } as any;

        ctx.canvas = canvasMock;

        // canvg v4 requires some specific presets for Node
        const v = Canvg.fromString(ctx as any, svgText, presets.node({
          DOMParser: dom.window.DOMParser,
          canvas: canvasMock,
          fetch: () => Promise.reject("Fetch disabled"),
          ignoreAnimation: true,
          ignoreMouse: true
        } as any));

        await v.render();

        let epsContent = ctx.getEPS();

        const MIN_SIZE = 1 * 1024 * 1024; // 1MB
        epsContent = padEPS(epsContent, MIN_SIZE);

        const finalSize = Buffer.byteLength(epsContent, 'utf8');
        const MAX_SIZE = 100 * 1024 * 1024; // 100MB

        if (finalSize > MAX_SIZE) {
          results.push({ 
            name: file.name, 
            error: `EPS too large (${(finalSize / 1024 / 1024).toFixed(1)}MB). Max 100MB.` 
          });
          continue;
        }

        results.push({
          name: file.name.replace(/\.svg$/i, ".eps"),
          content: Buffer.from(epsContent).toString("base64"),
          size: finalSize,
        });
      } catch (fileError: any) {
        console.error(`Error processing file ${file.name}:`, fileError);
        results.push({ name: file.name, error: fileError.message || "File processing error" });
      }
    }

    return NextResponse.json({ results });
  } catch (globalError: any) {
    console.error("Global conversion error:", globalError);
    return NextResponse.json({ 
      error: globalError.message || "Internal server error during conversion",
      stack: process.env.NODE_ENV === 'development' ? globalError.stack : undefined
    }, { status: 500 });
  }
}
