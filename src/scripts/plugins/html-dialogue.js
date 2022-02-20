//!CONFIG note                (text) "html dialogue plugin by candle"
//!CONFIG load-google-font    (text) "Major Mono Display"
//!CONFIG default-font-family (text) "Major Mono Display"

function addGoogleFont(name) {
    const value = name.replaceAll(" ", "+");
    const href = `https://fonts.googleapis.com/css?family=${value}&amp;display=swap`;
    ONE("head").append(html("link", { href, rel: "stylesheet" }));
}

const googleFonts = FIELDS(CONFIG, "load-google-font", "text");
googleFonts.forEach(addGoogleFont);
const font = FIELD(CONFIG, "default-font-family", "text") ?? googleFonts[0] ?? "monospace";

const DIALOGUE_DEFAULTS_2 = {
    anchorX: 0.5,
    anchorY: 0.5,

    glyphRevealDelay: .05,

    backgroundColor: undefined,
    panelColor: "#000000",
    textColor: "#FFFFFF",
};

const ROOT_CSS = {
    fontFamily: font + ", monospace",
    fontSize: "8px",
    lineHeight: "12px",
    whiteSpace: "pre-wrap",

    position: "absolute",
    left: "0", "top": "0",
    width: "100%", "height": "100%",
    padding: "24px",

    background: "none",
};

const PANEL_CSS = {
    display: "flex",

    position: "relative",
    width: "208px",
    minHeight: "42px",

    color: "white",
    background: "black",
}

wrap.before(BipsiPlayback.prototype, "init", function() {
    const chars = html("div", {});
    Object.assign(chars.style, {
        padding: "6px 8px 12px 8px",
    });

    const nextPrompt = html("div", {}, "➥");
    Object.assign(nextPrompt.style, {
        position: "absolute",
        bottom: "0", "right": "8px",
    });

    const donePrompt = html("div", {}, "■");
    Object.assign(donePrompt.style, {
        position: "absolute",
        bottom: "1px", "right": "10px",
    });

    const panel = html("div", {}, chars, nextPrompt, donePrompt);
    Object.assign(panel.style, PANEL_CSS);

    const root = html("div", {}, panel);
    Object.assign(root.style, ROOT_CSS);

    ONE("#player").append(root);

    this.dialoguePlayback = new DialoguePlaybackDOM({ root, panel, chars, nextPrompt, donePrompt });
    this.dialoguePlayback.options.font = this.font;
});

class DialoguePlaybackDOM extends EventTarget {
    constructor(elements) {
        super();
        this.dialogueRendering = createRendering2D(1, 1);

        this.elements = elements;

        this.queuedPages = [];
        this.pagesSeen = 0;
        
        this.options = {};

        // an awaitable that generates a new promise that resolves once no dialogue is active
        /** @type {PromiseLike<void>} */
        this.waiter = {
            then: (resolve, reject) => {
                if (this.empty) {
                    resolve();
                } else {
                    return wait(this, "empty").then(resolve, reject);
                }
            },
        }

        this.clear();
    }

    get empty() {
        return this.currentPage === undefined;
    }

    async load() {
    }

    clear() {
        this.queuedPages = [];
        this.pagesSeen = 0;

        this.setPage(undefined);
    }

    /** @param {DialoguePage} page */
    setPage(page) {
        const prev = this.currentPage;
        this.currentPage = page;
        this.pageTime = 0;
        this.showGlyphCount = 0;
        this.showGlyphElapsed = 0;
        this.pageGlyphCount = page ? page.glyphs.length : 0;

        this.dispatchEvent(new CustomEvent("next-page", { detail: { prev, next: page } }));

        if (page === undefined) {
            this.elements.root.style.visibility = "hidden";
            this.dispatchEvent(new CustomEvent("empty"));
        } else {
            const elements = page.glyphs.map((glyph) => html("span", {}, glyph.char));
            this.elements.chars.replaceChildren(...elements);
        }
    }

    /**
     * @param {string} script 
     * @param {Partial<DialogueOptions>} options 
     * @returns {Promise}
     */
    async queue(script, options={}) {
        const lineWidth = 192 * 100;

        script = parseFakedown(script);

        const glyphPages = scriptToPages_html(script);
        const pages = glyphPages.map((glyphs) => ({ glyphs, options }));
        this.queuedPages.push(...pages);
        
        if (this.empty) this.moveToNextPage();
    
        const last = pages[pages.length - 1];
        return new Promise((resolve) => {
            const onNextPage = (event) => {
                const { prev, next } = event.detail;
                if (prev === last) {
                    this.removeEventListener("next-page", onNextPage);
                    resolve();
                }
            };

            this.addEventListener("next-page", onNextPage);
        });
    }

    /** @param {number} dt */
    async update(dt) {
        if (this.empty) {
            this.elements.root.style.visibility = "hidden";
            return;
        }

        this.pageTime += dt;
        this.showGlyphElapsed += dt;

        this.applyStyle();

        const options = this.getOptions(this.currentPage.options);

        while (this.showGlyphElapsed > options.glyphRevealDelay && this.showGlyphCount < this.pageGlyphCount) {
            this.showGlyphElapsed -= options.glyphRevealDelay;
            this.revealNextChar();
            this.applyStyle();
        }

        this.elements.chars.dir = options.rtl ? "rtl" : null;
        
        const rootStyle = {
            background: options.backgroundColor ?? ROOT_CSS.background,
        }

        const panelStyle = {
            background: options.panelColor ?? PANEL_CSS.background,
            color: options.textColor ?? PANEL_CSS.color,

            left: `${options.anchorX * 100}%`,
            top: `${options.anchorY * 100}%`,
            transform: `translate(${options.anchorX * -100}%, ${options.anchorY * -100}%)`,
        }

        this.elements.root.style = "";
        this.elements.panel.style = "";

        Object.assign(this.elements.root.style, ROOT_CSS, rootStyle, options.panelCSS);
        Object.assign(this.elements.panel.style, PANEL_CSS, panelStyle, options.panelCSS);

        await sleep(1);
        this.elements.root.style.visibility = "unset";
    }

    render() {
        if (this.empty) return;

        this.currentPage.glyphs.forEach((glyph, i) => {
            const span = this.elements.chars.children[i];
            span.style.visibility = glyph.hidden ? "hidden" : null;
            Object.assign(span.style, {
                position: "relative",
                left: `${glyph.offset.x}px`, 
                top: `${glyph.offset.y}px`,
                color: glyph.fillStyle,
            });
        });

        const pageDone = this.showGlyphCount === this.pageGlyphCount;
        const showNext = pageDone && this.queuedPages.length > 0;
        const showDone = pageDone && !showNext;

        this.elements.nextPrompt.hidden = !showNext;
        this.elements.donePrompt.hidden = !showDone;
    }

    getOptions(options) {
        return Object.assign({}, DIALOGUE_DEFAULTS_2, this.options, options);
    }

    revealNextChar() {
        if (this.empty) return;

        this.showGlyphCount = Math.min(this.showGlyphCount + 1, this.pageGlyphCount);
        this.currentPage.glyphs.forEach((glyph, i) => {
            if (i < this.showGlyphCount) glyph.hidden = false;
        });
    }

    revealAll() {
        if (this.empty) return;

        this.showGlyphCount = this.currentPage.glyphs.length;
        this.revealNextChar();
    }

    cancel() {
        this.queuedPages.length = 0;
        this.currentPage = undefined;
    }

    skip() {
        if (this.empty) return;
        
        if (this.showGlyphCount === this.pageGlyphCount) {
            this.moveToNextPage();
        } else {
            this.showGlyphCount = this.pageGlyphCount;
            this.currentPage.glyphs.forEach((glyph) => glyph.hidden = false);
        }
    }

    moveToNextPage() {
        const nextPage = this.queuedPages.shift();
        this.pagesSeen += 1;
        this.setPage(nextPage);
    }

    applyStyle() {
        if (this.empty) return;

        const currentGlyph = this.currentPage.glyphs[this.showGlyphCount];
        const options = this.getOptions(this.currentPage.options);

        if (currentGlyph) {
            if (currentGlyph.styles.has("delay")) {
                this.showCharTime = parseFloat(currentGlyph.styles.get("delay"));
            } else {
                this.showCharTime = this.currentPage.options.glyphRevealDelay;
            }
        }

        this.currentPage.glyphs.forEach((glyph, i) => {
            glyph.fillStyle = glyph.styles.get("clr") ?? options.textColor;

            if (glyph.styles.has("r"))
                glyph.hidden = false;
            if (glyph.styles.has("shk")) 
                glyph.offset = { x: getRandomFloat(-1, 1), y: getRandomFloat(-1, 1) };
            if (glyph.styles.has("wvy"))
                glyph.offset.y = (Math.sin(i + this.pageTime * 5) * 3);
            if (glyph.styles.has("rbw")) {
                const h = Math.abs(Math.sin(performance.now() / 600 - i / 8));
                glyph.fillStyle = rgbToHex(HSVToRGB({ h, s: 1, v: 1 }));
            }
        });
    }
}

/**
 * @param {string} script 
 * @param {*} styleHandler 
 * @returns {BlitsyPage[]}
 */
 function scriptToPages_html(script, styleHandler = defaultStyleHandler) {
    const tokens = tokeniseScript_html(script);
    const commands = tokensToCommands_html(tokens);
    return commandsToPages_html(commands, styleHandler);
}

function tokeniseScript_html(script) {
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
        tokens.push(["markup", "el"]);
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

function textBufferToCommands_html(buffer) {
    const chars = Array.from(buffer);
    return chars.map((char) => ({ type: "glyph", char, breakable: char === " " }));
}

function markupBufferToCommands_html(buffer) {
    if (buffer === "pg") return [{ type: "break", target: "page" }];
    if (buffer === "br") return [{ type: "break", target: "line" }];
    else                 return [{ type: "style", style: buffer }];
}

/** @param {any[]} tokens */
function tokensToCommands_html(tokens) {
    const handlers = {
        "text": textBufferToCommands_html,
        "markup": markupBufferToCommands_html,
    };

    const tokenToCommands = ([type, buffer]) => handlers[type](buffer); 
    return tokens.flatMap(tokenToCommands);
}

/**
 * @param {*} commands 
 * @param {*} styleHandler 
 */
function commandsToPages_html(commands, styleHandler) {
    const styles = new Map();
    const pages = [];
    let page = [];

    function newPage() {
        pages.push(page);
        page = [];
    }

    function endPage() { 
        newPage();
    }

    function endLine() {
        if (page.length > 0) page[page.length - 1].char += "\n";
        //else addGlyph("\n");
    }

    function doBreak(target) {
             if (target === "line") endLine();
        else if (target === "page") endPage(); 
    }

    function findNextBreakIndex() {
        for (let i = 0; i < commands.length; ++i) {
            const command = commands[i];
            if (command.type === "break") return i;
            if (command.type === "style") continue;
        };
    }

    function addGlyph(char) {
        const glyph = { 
            char,
            position: { x: 0, y: 0 },
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
                offset += addGlyph(command.char);
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
