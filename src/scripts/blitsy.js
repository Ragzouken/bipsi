/**
 * @param {number} width
 * @param {number} height
 * @returns {CanvasRenderingContext2D}
 */
function createRendering2D(width, height) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    context.imageSmoothingEnabled = false;
    return context;
}

/**
 * @param {CanvasRenderingContext2D} rendering 
 * @param {string | CanvasGradient | CanvasPattern | undefined} fillStyle
 */
function fillRendering2D(rendering, fillStyle = undefined) {
    if (fillStyle !== undefined) {
        const prevStyle = rendering.fillStyle;
        rendering.fillStyle = fillStyle;
        rendering.fillRect(0, 0, rendering.canvas.width, rendering.canvas.height);
        rendering.fillStyle = prevStyle;
    } else {
        rendering.clearRect(0, 0, rendering.canvas.width, rendering.canvas.height);
    }
}

/**
 * @param {CanvasRenderingContext2D} source
 * @param {CanvasRenderingContext2D} destination
 * @param {{ x: number, y: number, w: number, h: number }} rect
 */
function copyRendering2D(
    source, 
    destination = undefined,
    rect = undefined,
) {
    rect = rect ?? { x: 0, y: 0, w: source.canvas.width, h: source.canvas.height };
    destination = destination || createRendering2D(rect.w, rect.h);
    destination.canvas.width = rect.w;
    destination.canvas.height = rect.h;

    destination.drawImage(
        source.canvas, 
        rect.x, rect.y, rect.w, rect.h,
        0, 0, rect.w, rect.h,
    );

    return destination;
}

/**
 * @param {CanvasRenderingContext2D} rendering 
 * @param {number} width 
 * @param {number} height 
 */
function resizeRendering2D(rendering, width, height) {
    const copy = copyRendering2D(rendering);
    rendering.canvas.width = width;
    rendering.canvas.height = height;
    rendering.drawImage(copy.canvas, 0, 0);
}

/**
 * @param {CanvasRenderingContext2D} rendering 
 */
function invertMask(rendering) {
    withPixels(rendering, (pixels) => {
        for (let i = 0; i < pixels.length; ++i) {
            pixels[i] = 0xFFFFFFFF - pixels[i];
        }
    });
}

/**
 * @param {CanvasRenderingContext2D} rendering 
 * @param {number} dx
 * @param {number} dy
 */
function cycleRendering2D(rendering, dx, dy) {
    const { width, height } = rendering.canvas;
    const sx = -Math.sign(dx);
    const sy = -Math.sign(dy);

    const temp = copyRendering2D(rendering);

    fillRendering2D(rendering);
    rendering.drawImage(temp.canvas, dx,            dy            );
    rendering.drawImage(temp.canvas, dx + width*sx, dy            ); 
    rendering.drawImage(temp.canvas, dx + width*sx, dy + height*sy); 
    rendering.drawImage(temp.canvas, dx,            dy + height*sy); 
}

/**
 * @param {CanvasRenderingContext2D} rendering 
 */
function mirrorRendering2D(rendering) {
    const prevComposite = rendering.globalCompositeOperation;
    rendering.globalCompositeOperation = "copy";
    rendering.scale(-1, 1);
    rendering.drawImage(rendering.canvas, -rendering.canvas.width, 0);
    rendering.globalCompositeOperation = prevComposite;
}

/**
 * @param {CanvasRenderingContext2D} rendering 
 */
 function flipRendering2D(rendering) {
    const prevComposite = rendering.globalCompositeOperation;
    rendering.globalCompositeOperation = "copy";
    rendering.scale(1, -1);
    rendering.drawImage(rendering.canvas, 0, -rendering.canvas.height);
    rendering.globalCompositeOperation = prevComposite;
}

/**
 * @param {CanvasRenderingContext2D} rendering 
 * @param {number} turns
 */
 function turnRendering2D(rendering, turns=1) {
    const { width, height } = rendering.canvas;
    const prevComposite = rendering.globalCompositeOperation;

    rendering.globalCompositeOperation = "copy";
    rendering.setTransform(1, 0, 0, 1, width/2, height/2);
    rendering.rotate(turns * Math.PI / 2);
    rendering.drawImage(rendering.canvas, -width/2, -height/2);
    rendering.globalCompositeOperation = prevComposite;
}

/**
 * @callback pixelsAction
 * @param {Uint32Array} pixels
 */

/**
 * @param {CanvasRenderingContext2D} rendering 
 * @param {pixelsAction} action 
 */
function withPixels(rendering, action) {
    const imageData = rendering.getImageData(0, 0, rendering.canvas.width, rendering.canvas.height);
    action(new Uint32Array(imageData.data.buffer));
    rendering.putImageData(imageData, 0, 0);
}

/**
 * @param {CanvasRenderingContext2D} mask 
 * @param {string} style 
 * @param {CanvasRenderingContext2D} destination 
 */
function recolorMask(mask, style, destination = undefined) {
    const recolored = copyRendering2D(mask, destination);
    recolored.globalCompositeOperation = "source-in";
    fillRendering2D(recolored, style);
    return recolored;
}

/**
 * @param {number} x0 
 * @param {number} y0 
 * @param {number} x1 
 * @param {number} y1 
 * @param {(x: number, y: number) => void} plot 
 */
// adapted from https://stackoverflow.com/a/34267311
function lineplot(x0, y0, x1, y1, plot) {
    x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0;

    const steep = Math.abs(y1 - y0) > Math.abs(x1 - x0);
    if (steep) [x0, y0, x1, y1] = [y0, x0, y1, x1];

    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const ystep = Math.sign(y1 - y0);
    const xstep = Math.sign(x1 - x0);

    let err = Math.floor(dx / 2);
    let y = y0;

    if (dx === 0 && dy === 0) {
        plot(x0, y0);
    }

    for (let x = x0; x != (x1 + xstep); x += xstep) {
        plot(steep ? y : x, steep ? x : y);
        err -= dy;
        if (err < 0) {
            y += ystep;
            err += dx;
        }
    }
}

/**
 * @param {CanvasRenderingContext2D} rendering 
 * @param {number} x 
 * @param {number} y 
 * @param {number} color
 */
function floodfill(rendering, x, y, color, tolerance = 5) {
    const [width, height] = [rendering.canvas.width, rendering.canvas.height];
    withPixels(rendering, pixels => {
        const queue = [[x, y]];
        const done = new Array(width * height);
        const initial = pixels[y * width + x];

        const ir = initial >>>  0 & 0xFF;
        const ig = initial >>>  8 & 0xFF;
        const ib = initial >>> 16 & 0xFF;

        function enqueue(x, y) {
            const within = x >= 0 && y >= 0 && x < width && y < height;

            if (within && !done[y * width + x]) {
                const pixel = pixels[y * width + x];

                const pr = pixel >>>  0 & 0xFF;
                const pg = pixel >>>  8 & 0xFF;
                const pb = pixel >>> 16 & 0xFF;
                const dist = Math.abs(pr - ir) + Math.abs(pg - ig) + Math.abs(pb - ib);
                
                if (dist <= tolerance) queue.push([x, y]);
            }
        }

        while (queue.length > 0) {
            const [x, y] = queue.pop();
            pixels[y * width + x] = color;
            done[y * width + x] = true;

            enqueue(x - 1, y);
            enqueue(x + 1, y);
            enqueue(x, y - 1);
            enqueue(x, y + 1);
        }
    });
};

/**
 * @param {CanvasRenderingContext2D} rendering 
 * @param {number} x 
 * @param {number} y 
 * @param {number} color
 * @returns {CanvasRenderingContext2D}
 */
 function floodfillOutput(rendering, x, y, color) {
    const [width, height] = [rendering.canvas.width, rendering.canvas.height];
    const output = createRendering2D(width, height);
    withPixels(rendering, srcPixels =>
    withPixels(output, dstPixels => {
        const queue = [[x, y]];
        const done = new Array(width * height);
        const initial = srcPixels[y * width + x];

        function enqueue(x, y) {
            const within = x >= 0 && y >= 0 && x < width && y < height;

            if (within && srcPixels[y * width + x] === initial && !done[y * width + x]) {
                queue.push([x, y]);
            }
        }

        while (queue.length > 0) {
            const [x, y] = queue.pop();
            dstPixels[y * width + x] = color;
            done[y * width + x] = true;

            enqueue(x - 1, y);
            enqueue(x + 1, y);
            enqueue(x, y - 1);
            enqueue(x, y + 1);
        }
    }));
    return output;
};

/**
 * @param {{r:number,g:number,b:number}} rgb 
 */
function rgbToHex(rgb) {
    const packed = (0xFF000000 + (rgb.r << 16) + (rgb.g << 8) + (rgb.b << 0));
    return "#" + packed.toString(16).substr(-6);
}

/**
 * @param {string} hex 
 * @param {number} alpha
 */
function hexToUint32(hex, alpha = undefined) {
    if (hex.charAt(0) === '#') hex = hex.substring(1);
    if (alpha === undefined && hex.length === 8) alpha = parseInt(hex.substr(6, 2), 16);
    if (alpha === undefined) alpha = 255;
    hex = hex.substr(4, 2) + hex.substr(2, 2) + hex.substr(0, 2);
    return (parseInt(hex, 16) | (alpha << 24)) >>> 0;
}

/**
 * @param {number} number
 * @param {string} prefix 
 */
function numberToHex(number, prefix = '#') {
    number = (number | 0xff000000) >>> 0;
    let hex = number.toString(16).substring(2, 8);
    hex = hex.substr(4, 2) + hex.substr(2, 2) + hex.substr(0, 2);
    return prefix + hex;
}

const MASK_PALETTE = {
    '_': hexToUint32('#000000', 0),
    default: hexToUint32('#FFFFFF', 255),
};

/**
 * @param {string} text 
 * @param {Record<string, number>} palette 
 * @returns {CanvasRenderingContext2D}
 */
function textToRendering2D(text, palette = MASK_PALETTE) {
    text = text.trim();
    const lines = text.split('\n').map((line) => [...line.trim()]);

    const width = lines[0].length;
    const height = lines.length;

    const rendering = createRendering2D(width, height);
    withPixels(rendering, (pixels) => {
        lines.forEach((line, y) => line.forEach((char, x) => {
            const color = palette[char];
            pixels[y * width + x] = color !== undefined ? color : palette.default;
        }));
    });

    return rendering;
}

/**
 * @param {{ h: number, s: number, v: number }} hsv
 */
function HSVToRGB(hsv) {
    const { h, s, v } = hsv;
    let r, g, b;
    const i = Math.floor(h * 6);
    const f = h * 6 - i;
    const p = (1 - s);
    const q = (1 - f * s);
    const t = (1 - (1 - f) * s);
    switch (i % 6) {
        case 0: r = 1, g = t, b = p; break;
        case 1: r = q, g = 1, b = p; break;
        case 2: r = p, g = 1, b = t; break;
        case 3: r = p, g = q, b = 1; break;
        case 4: r = t, g = p, b = 1; break;
        case 5: r = 1, g = p, b = q; break;
    }

    r *= v * 255;
    g *= v * 255;
    b *= v * 255;

    return { r, g, b };
}

/**
 * @param {{ r: number, g: number, b: number }} rgb
 */
function RGBToHSV(rgb) {
    const { r, g, b } = rgb;
    var max = Math.max(r, g, b), min = Math.min(r, g, b),
        d = max - min,
        h,
        s = (max === 0 ? 0 : d / max),
        v = max / 255;

    switch (max) {
        case min: h = 0; break;
        case r: h = (g - b) + d * (g < b ? 6: 0); h /= 6 * d; break;
        case g: h = (b - r) + d * 2; h /= 6 * d; break;
        case b: h = (r - g) + d * 4; h /= 6 * d; break;
    }

    return { h, s, v };
}

function HSVToCone(hsv) {
    const a = Math.PI * hsv.h;
    const r = hsv.s * .5 * hsv.v;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    return { x, y, z: hsv.v };
}


function uint32ToRGB(uint32) {
    return {
        r: uint32 >>>  0 & 0xFF,
        g: uint32 >>>  8 & 0xFF,
        b: uint32 >>> 16 & 0xFF,
        uint32,
    };
}

function hexToRGB(hex) {
    if (hex.charAt(0) === '#') hex = hex.substring(1);
    return {
        b: parseInt(hex.substr(4, 2), 16),
        g: parseInt(hex.substr(2, 2), 16),
        r: parseInt(hex.substr(0, 2), 16),
        uint32: hexToUint32(hex),
    };
}

function RGBToUint32(rgb) {
    return rgb.r | rgb.g << 8 | rgb.b << 16 | 0xFF << 24;
}

/**
 * @param {CanvasRenderingContext2D} rendering 
 * @param {string[]} palette 
 */
function recolorToPalette(rendering, palette) {
    const paletteConverted = palette.map((hex) => { 
        const cone = HSVToCone(RGBToHSV(hexToRGB(hex)));
        const uint32 = hexToUint32(hex);
        return { ...cone, uint32 };
    });
    const mapping = new Map();

    function chooseColor(uint32) {
        const alpha = (uint32 >>> 24) < 16;
        if (alpha) return 0;

        const existing = mapping.get(uint32);
        if (existing) return existing;

        const actual = HSVToCone(RGBToHSV(uint32ToRGB(uint32)));
        let bestSqrDistance = Infinity;
        let best = paletteConverted[0];

        for (let candidate of paletteConverted) {
            const dx = Math.abs(actual.x - candidate.x);
            const dy = Math.abs(actual.y - candidate.y);
            const dz = Math.abs(actual.z - candidate.z);
            const sqrDistance = dx*dx + dy*dy + dz*dz;
            
            if (sqrDistance < bestSqrDistance) {
                bestSqrDistance = sqrDistance;
                best = candidate;
            }
        }

        mapping.set(uint32, best.uint32);
        return best.uint32;
    }

    withPixels(rendering, (pixels) => {
        for (let i = 0; i < pixels.length; ++i) {
            pixels[i] = chooseColor(pixels[i]);
        }
    });
}

/** 
 * Copy image contents to a new canvas rendering context.
 * @param {HTMLImageElement} image 
 */
function imageToRendering2D(image) {
    const rendering = createRendering2D(image.naturalWidth, image.naturalHeight);
    rendering.drawImage(image, 0, 0);
    return rendering;
}

/**
 * Create an html image from a given src (probably a datauri).
 * @param {string} src
 * @returns {Promise<HTMLImageElement>}
 */
async function loadImage(src) {
    return imageLoadWaiter(loadImageLazy(src));
}

/**
 * Create an html image from a given src (probably a datauri).
 * @param {string} src
 * @returns {HTMLImageElement}
 */
function loadImageLazy(src) {
    const image = document.createElement("img");
    image.src = src;
    return image;
}

/**
 * Await any pending loading of an html image.
 * @param {HTMLImageElement} image
 * @returns {Promise<HTMLImageElement>}
 */
async function imageLoadWaiter(image) {
    if (image.complete) {
        return Promise.resolve(image);
    } else {
        return new Promise((resolve, reject) => {
            image.addEventListener("load", () => resolve(image));
            image.addEventListener("error", reject);
        });
    }
}

/**
 * In the given rendering, replace every instance of a color in the prev palette
 * with the corresponding color in the next palette, ignoring colors that don't
 * appear. This is broken in firefox because colors are not stored exactly. 
 * @param {CanvasRenderingContext2D} rendering 
 * @param {string[]} prev 
 * @param {string[]} next 
 */
 function swapPalette(rendering, prev, next) {
    const mapping = new Map();
    prev.forEach((pixel, index) => mapping.set(prev[index], next[index]));

    withPixels(rendering, (pixels) => {
        for (let i = 0; i < pixels.length; ++i) {
            pixels[i] = mapping.get(pixels[i]) || pixels[i];
        }
    });
}

/**
 * Replace every color in the given rendering. Each existing color is matched
 * to the closest color in the prev palette and replaced with the corresponding
 * color in the next palette. 
 * @param {CanvasRenderingContext2D} rendering 
 * @param {number[]} prev 
 * @param {number[]} next 
 */
function swapPaletteSafe(rendering, prev, next) {
    const mapping = new Map();
    for (let i = 0; i < prev.length; ++i) {
        mapping.set(prev[i], next[i % next.length]);
    }

    function addMissing(prevPixel) {
        let bestDistance = Infinity;
        let bestNextPixel = next[0];

        const pr = prevPixel >>>  0 & 0xFF;
        const pg = prevPixel >>>  8 & 0xFF;
        const pb = prevPixel >>> 16 & 0xFF;

        for (let i = 0; i < prev.length; ++i) {
            const target = prev[i];
            const tr = target >>>  0 & 0xFF;
            const tg = target >>>  8 & 0xFF;
            const tb = target >>> 16 & 0xFF;

            const dist = Math.abs(pr - tr) 
                       + Math.abs(pg - tg) 
                       + Math.abs(pb - tb);

            if (dist < bestDistance) {
                bestDistance = dist;
                bestNextPixel = next[i];
            }
        }

        mapping.set(prevPixel, bestNextPixel);
        return bestNextPixel;
    }

    withPixels(rendering, (pixels) => {
        for (let i = 0; i < pixels.length; ++i) {
            const prev = pixels[i];
            pixels[i] = mapping.get(prev) ?? addMissing(prev);
        }
    });
}

/**
 * @param {HTMLCanvasElement} canvas 
 */
async function canvasToBlob(canvas) {
    return new Promise((resolve) => canvas.toBlob(resolve));
}
