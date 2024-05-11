/**
 * @typedef {Object} Vector2
 * @property {number} x
 * @property {number} y
 */

/**
 * @typedef {Object} Rect
 * @property {number} x
 * @property {number} y
 * @property {number} width
 * @property {number} height
 */

/**
 * @param {number} min 
 * @param {number} max 
 */
 function range(min, max) {
    return Array.from(new Array(max-min+1), (x, i) => i + min);
}

/**
 * @typedef {Object} BlitsyFontCharacter
 * @property {number} codepoint
 * @property {CanvasImageSource} image
 * @property {Rect} rect
 * @property {number} spacing
 * @property {Vector2?} offset
 */

/**
 * @typedef {Object} BipsiDataFont
 * @property {string} name
 * @property {number} charWidth
 * @property {number} charHeight
 * @property {number[][]} runs
 * @property {Object.<number, { spacing: number, offset: Vector2, size: Vector2 }>} special
 * @property {string} atlas
 */

/**
 * @typedef {Object} BlitsyFont
 * @property {string} name
 * @property {number} lineHeight
 * @property {Map<number, BlitsyFontCharacter>} characters
 */

/**
 * @typedef {Object} BlitsyGlyph
 * @property {HTMLCanvasElement} image
 * @property {Rect} rect
 * @property {Vector2} position
 * @property {Vector2} offset
 * @property {boolean} hidden
 * @property {string} fillStyle
 * @property {Map<string, any>} styles
 */

/**
 * @typedef {Object} BlitsyTextRenderOptions
 * @property {BlitsyFont} font
 * @property {number} lineCount
 * @property {number} lineWidth
 * @property {number} lineGap
 */

/** @typedef {BlitsyGlyph[]} BlitsyPage */

/**
 * @param {BipsiDataFont} data
 */
async function loadBipsiFont(data) {
    const font = {
        name: data.name,
        lineHeight: data.charHeight,
        characters: new Map(),
    }

    const atlas = await loadImage(data.atlas);
    const cols = atlas.naturalWidth / data.charWidth;

    const indexes = data.runs.flatMap(([start, end]) => range(start, end ?? start));

    indexes.forEach((codepoint, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        
        const special = data.special?.[codepoint];
        const size = special?.size;

        const rect = { 
            x: col * data.charWidth, 
            y: row * data.charHeight, 
            width: size?.x ?? data.charWidth, 
            height: size?.y ?? data.charHeight,
        };

        const spacing = special?.spacing ?? rect.width;
        const offset = special?.offset;

        font.characters.set(codepoint, { codepoint, image: atlas, rect, spacing, offset });
    });

    return font;
}

/** @param {HTMLScriptElement} script */
async function loadBasicFont(script) {
    const atlasdata = script.innerHTML;
    const charWidth = parseInt(script.getAttribute("data-char-width"), 10);
    const charHeight = parseInt(script.getAttribute("data-char-height"), 10);
    const indexes = parseRuns(script.getAttribute("data-runs"));

    const atlas = await loadImage(atlasdata);
    const cols = atlas.naturalWidth / charWidth;

    const font = {
        name: "font",
        lineHeight: charHeight,
        characters: new Map(),
    };

    indexes.forEach((codepoint, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);

        const rect = { 
            x: col * charWidth, 
            y: row * charHeight, 
            width: charWidth, 
            height: charHeight,
        };

        font.characters.set(codepoint, { codepoint, image: atlas, rect, spacing: charWidth, offset: { x: 0, y: 0 } });
    });

    return font;
}

/** @param {string} data */
function parseRuns(data) {
    const runs = data.split(",").map((run) => {
        const [start, end] = run.split("-").map((index) => parseInt(index, 10));
        return [ start, end ?? start ];
    });
    const indexes = [];
    runs.forEach(([min, max]) => indexes.push(...range(min, max)));
    return indexes;
}

/**
 * @param {BlitsyFont} font 
 * @param {string} char 
 */
function getFontChar(font, char) {
    const codepoint = char.codePointAt(0);
    return font.characters.get(codepoint);
}

/** 
 * @param {BlitsyPage} page 
 * @param {number} width
 * @param {number} height
 * @param {number} ox
 * @param {number} oy
 */
function renderPage(page, width, height, ox = 0, oy = 0)
{
    const result = createRendering2D(width, height);
    const buffer = createRendering2D(width, height);

    for (const glyph of page)
    {
        if (glyph.hidden) continue;

        // padding + position + offset
        const x = ox + glyph.position.x + glyph.offset.x;
        const y = oy + glyph.position.y + glyph.offset.y;
        
        const {
            x: glyphX,
            y: glyphY,
            width: glyphWidth,
            height: glyphHeight,
        } = glyph.rect;

        // draw tint layer
        result.fillStyle = glyph.fillStyle;
        result.fillRect(x, y, glyphWidth, glyphHeight);
        
        // draw text layer
        buffer.drawImage(glyph.image, glyphX, glyphY, glyphWidth, glyphHeight, x, y, glyphWidth, glyphHeight);
    }

    // draw text layer in tint color
    result.globalCompositeOperation = 'destination-in';
    result.drawImage(buffer.canvas, 0, 0);

    return result;
}

const defaultStyleHandler = (styles, style) => {
    if (style.substr(0, 1) === "+") {
        styles.set(style.substring(1), true);
    } else if (style.substr(0, 1) === "-") {
        styles.delete(style.substring(1));
    } else if (style.includes("=")) {
        const [key, val] = style.split(/\s*=\s*/);
        styles.set(key, val);
    }
}

/**
 * @param {string} script 
 * @param {BlitsyTextRenderOptions} options 
 * @param {*} styleHandler 
 * @returns {BlitsyPage[]}
 */
function scriptToPages(script, options, styleHandler = defaultStyleHandler) {
    const tokens = tokeniseScript(script);
    const commands = tokensToCommands(tokens);
    return commandsToPages(commands, options, styleHandler);
}

function tokeniseScript(script) {
    const tokens = [];
    let buffer = "";
    let braceDepth = 0;

    function openBrace() {
        if (braceDepth === 0) flushBuffer();
        braceDepth += 1;
    }

    function closeBrace() {
        if (braceDepth === 1) flushBuffer();
        braceDepth -= 1;
    }

    function newLine() {
        flushBuffer();
        tokens.push(["markup", "br"]);
    }

    function flushBuffer() {
        if (buffer.length === 0) return;
        const type = braceDepth > 0 ? "markup" : "text";
        tokens.push([type, buffer]);
        buffer = "";
    }

    const actions = {
        "{": openBrace,
        "}": closeBrace,
        "\n": newLine,
    }

    for (const char of script) {
        if (char in actions)
            actions[char]();
        else
            buffer += char;
    }

    flushBuffer();

    return tokens;
}

function textBufferToCommands(buffer) {
    const chars = Array.from(buffer);
    return chars.map((char) => ({ type: "glyph", char, breakable: char === " " }));
}

function markupBufferToCommands(buffer) {
    if (buffer === "pg") return [{ type: "break", target: "page" }];
    if (buffer === "br") return [{ type: "break", target: "line" }];
    else                 return [{ type: "style", style: buffer }];
}

/** @param {any[]} tokens */
function tokensToCommands(tokens) {
    const handlers = {
        "text": textBufferToCommands,
        "markup": markupBufferToCommands,
    };

    const tokenToCommands = ([type, buffer]) => handlers[type](buffer); 
    return tokens.flatMap(tokenToCommands);
}

/**
 * @param {*} commands 
 * @param {BlitsyTextRenderOptions} options 
 * @param {*} styleHandler 
 */
function commandsToPages(commands, options, styleHandler) {
    commandsBreakLongSpans(commands, options);

    const styles = new Map();
    const pages = [];
    let page = [];
    let currLine = 0;

    function newPage() {
        pages.push(page);
        page = [];
        currLine = 0;
    }

    function endPage() { 
        do { endLine(); } while (currLine % options.lineCount !== 0)
    }

    function endLine() {
        currLine += 1;
        if (currLine === options.lineCount) newPage();
    }

    function doBreak(target) {
             if (target === "line") endLine();
        else if (target === "page") endPage(); 
    }

    function findNextBreakIndex() {
        let width = 0;

        for (let i = 0; i < commands.length; ++i) {
            const command = commands[i];
            if (command.type === "break") return i;
            if (command.type === "style") continue;

            width += computeLineWidth(options.font, command.char);
            // if we overshot, look backward for last possible breakable glyph
            if (width > options.lineWidth) {
                const result = find(commands, i, -1, command => command.type === "glyph" && command.breakable);
                if (result) return result[1];
            }
        };
    }

    function addGlyph(command, offset) {
        const char = getFontChar(options.font, command.char) ?? getFontChar(options.font, "?");

        const x = offset + (char.offset?.x ?? 0);
        const y = currLine * (options.font.lineHeight + options.lineGap) + (char.offset?.y ?? 0);

        const glyph = { 
            char: command.char,
            image: char.image,
            rect: char.rect,
            position: { x, y },
            offset: { x: 0, y: 0 },
            hidden: true,
            fillStyle: "white",
            styles: new Map(styles.entries()),
        };

        page.push(glyph);
        return char.spacing;
    }

    function generateGlyphLine(commands) {
        let offset = 0;
        for (const command of commands) {
            if (command.type === "glyph") {
                offset += addGlyph(command, offset);
            } else if (command.type === "style") {
                styleHandler(styles, command.style);
            }
        }
    }

    let index;
    
    while ((index = findNextBreakIndex()) !== undefined) {
        generateGlyphLine(commands.slice(0, index));
        commands = commands.slice(index);

        const command = commands[0];
        if (command.type === "break") {
            doBreak(command.target);
            commands.shift();
        } else {
            if (command.type === "glyph" && command.char === " ") {
                commands.shift();
            }
            endLine();
        }
    }

    generateGlyphLine(commands);
    endPage();

    return pages;
}

/**
 * Find spans of unbreakable commands that are too long to fit within a page 
 * width and amend those spans so that breaking permitted in all positions. 
 * @param {*} commands
 * @param {BlitsyTextRenderOptions} options
 */
function commandsBreakLongSpans(commands, options) {
    const canBreak = (command) => command.type === "break" 
                               || (command.type === "glyph" && command.breakable); 

    const spans = filterToSpans(commands, canBreak);

    for (const span of spans) {
        const glyphs = span.filter(command => command.type === "glyph");
        const charWidths = glyphs.map(command => computeLineWidth(options.font, command.char));
        const spanWidth = charWidths.reduce((x, y) => x + y, 0);

        if (spanWidth > options.lineWidth) {
            for (const command of glyphs) command.breakable = true;
        }
    }
}

/**
 * @param {BlitsyFont} font 
 * @param {string} line 
 */
function computeLineWidth(font, line) {
    const chars = Array.from(line).map((char) => getFontChar(font, char));
    const widths = chars.map((char) => char ? char.spacing : 0);
    return widths.reduce((a, b) => a + b);
}

/**
 * Segment the given array into contiguous runs of elements that are not 
 * considered breakable.
 */
function filterToSpans(array, breakable) {
    const spans = [];
    let buffer = [];

    array.forEach((element, index) => {
        if (!breakable(element, index)) {
            buffer.push(element);
        } else if (buffer.length > 0) {
            spans.push(buffer);
            buffer = [];
        }
    });

    if (buffer.length > 0) {
        spans.push(buffer);
    }

    return spans;
}

function find(array, start, step, predicate) {
    for (let i = start; 0 <= i && i < array.length; i += step) {
        if (predicate(array[i], i)) return [array[i], i];
    }
}
