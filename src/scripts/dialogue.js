/**
 * @typedef {Object} DialoguePage
 * @property {BlitsyPage} glyphs
 * @property {Partial<DialogueOptions>} options
 */

/**
 * @typedef {Object} DialogueOptions
 * @property {*} font
 * @property {number} anchorX
 * @property {number} anchorY
 * @property {number} lines
 * @property {number} lineGap
 * @property {number} padding
 * @property {number} glyphRevealDelay
 * @property {string} backgroundColor
 * @property {string} panelColor
 * @property {string} textColor
 */

const DIALOGUE_DEFAULTS = {
    anchorX: 0.5,
    anchorY: 0.5,

    lines: 2,
    lineGap: 4,
    padding: 8,

    glyphRevealDelay: .05,

    backgroundColor: undefined,
    panelColor: "#000000",
    textColor: "#FFFFFF",
};

const CONT_ICON_DATA = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAGCAYAAAD68A/GAAAAAXNSR0IArs4c6QAAADNJREFUCJmNzrENACAMA0E/++/8NAhRBEg6yyc5SePUoNqwDICnWP04ww1tWOHfUqqf1UwGcw4T9WFhtgAAAABJRU5ErkJggg==";
const STOP_ICON_DATA = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAGCAYAAAD68A/GAAAAAXNSR0IArs4c6QAAACJJREFUCJljZICC/////2fAAhgZGRn////PwIRNEhsYCgoBIkQHCf7H+yAAAAAASUVORK5CYII="

class DialoguePlayback extends EventTarget {
    constructor(width, height) {
        super();
        this.dialogueRendering = createRendering2D(width, height);

        /** @type {DialoguePage[]} */
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
        this.contIcon = imageToRendering2D(await loadImage(CONT_ICON_DATA));
        this.stopIcon = imageToRendering2D(await loadImage(STOP_ICON_DATA));
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
            this.dispatchEvent(new CustomEvent("empty"));
        }
    }

    /**
     * @param {string} script 
     * @param {Partial<DialogueOptions>} options 
     * @returns {Promise}
     */
    async queue(script, options={}) {
        const { font, lines, lineGap } = this.getOptions(options);
        const lineWidth = 192;

        script = parseFakedown(script);
        const glyphPages = scriptToPages(script, { font, lineWidth, lineCount: lines, lineGap });
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
    update(dt) {
        if (this.empty) return;

        this.pageTime += dt;
        this.showGlyphElapsed += dt;

        this.applyStyle();

        const options = this.getOptions(this.currentPage.options);

        while (this.showGlyphElapsed > options.glyphRevealDelay && this.showGlyphCount < this.pageGlyphCount) {
            this.showGlyphElapsed -= options.glyphRevealDelay;
            this.revealNextChar();
            this.applyStyle();
        }
    }

    render() {
        const options = this.getOptions(this.currentPage.options);
        const height = options.padding * 2 
                     + (options.font.lineHeight + options.lineGap) * options.lines;
        const width = 208;

        fillRendering2D(this.dialogueRendering);
        fillRendering2D(this.dialogueRendering, options.backgroundColor || "transparent");
        
        const { width: displayWidth, height: displayHeight } = this.dialogueRendering.canvas;
        const spaceX = displayWidth - width;
        const spaceY = displayHeight - height;
        const margin = options.noMargin ? 0 : Math.ceil(Math.min(spaceX, spaceY) / 2);

        const minX = margin;
        const maxX = displayWidth - margin;

        const minY = margin;
        const maxY = displayHeight - margin;

        const x = Math.floor(minX + (maxX - minX - width ) * options.anchorX);
        const y = Math.floor(minY + (maxY - minY - height) * options.anchorY);

        this.dialogueRendering.fillStyle = options.panelColor;
        this.dialogueRendering.fillRect(x, y, width, height);
        
        this.applyStyle();
        const render = renderPage(
            this.currentPage.glyphs, 
            width, height, 
            options.padding, options.padding,
        );
        this.dialogueRendering.drawImage(render.canvas, x, y);

        if (this.showGlyphCount === this.pageGlyphCount) {
            const prompt = this.queuedPages.length > 0 
                         ? this.contIcon 
                         : this.stopIcon;
            this.dialogueRendering.drawImage(
                recolorMask(prompt, options.textColor).canvas, 
                x+width-options.padding-prompt.canvas.width, 
                y+height-options.lineGap-prompt.canvas.height,
            );
        }
    }

    getOptions(options) {
        return Object.assign({}, DIALOGUE_DEFAULTS, this.options, options);
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
                glyph.offset = { x: getRandomInt(-1, 2), y: getRandomInt(-1, 2) };
            if (glyph.styles.has("wvy"))
                glyph.offset.y = (Math.sin(i + this.pageTime * 5) * 3) | 0;
            if (glyph.styles.has("rbw")) {
                const h = Math.abs(Math.sin(performance.now() / 600 - i / 8));
                glyph.fillStyle = rgbToHex(HSVToRGB({ h, s: 1, v: 1 }));
            }
        });
    }
}

/**
 * @param {EventTarget} target 
 * @param {string} event 
 * @returns 
 */
 async function wait(target, event) {
    return new Promise((resolve) => {
        target.addEventListener(event, resolve, { once: true });
    });
}

/**
 * Return a random integer at least min and below max. Why is that the normal
 * way to do random ints? I have no idea.
 * @param {number} min 
 * @param {number} max 
 * @returns {number}
 */
 function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min)) + min;
}

function getRandomFloat(min, max) {
    return Math.random() * (max - min) + min;
}

