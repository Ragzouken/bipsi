const DIALOGUE_DEFAULTS_2 = {
    anchorX: 0.5,
    anchorY: 0.5,

    lines: 2,

    glyphRevealDelay: .05,

    backgroundColor: undefined,
    panelColor: "#000000",
    textColor: "#FFFFFF",
};

wrap.before(BipsiPlayback.prototype, "init", function() {
    const chars = html("div", {});
    Object.assign(chars.style, {
        "padding": "6px 8px 12px 8px",
    });

    const nextPrompt = html("div", {}, "➥");
    Object.assign(nextPrompt.style, {
        "position": "absolute",
        "bottom": "0", "right": "8px",
    });

    const donePrompt = html("div", {}, "■");
    Object.assign(donePrompt.style, {
        "position": "absolute",
        "bottom": "1px", "right": "10px",
    });

    const panel = html("div", {}, chars, nextPrompt, donePrompt);
    Object.assign(panel.style, {
        "display": "flex",

        "position": "relative",
        "width": "208px",
        "min-height": "40px",

        "background": "black",
    });

    const root = html("div", {}, panel);
    Object.assign(root.style, {
        "font-family": "monospace",
        "font-size": "8px",
        "line-height": "12px",
        "white-space": "pre-wrap",

        "position": "absolute",
        "left": "0", "top": "0",
        "width": "100%", "height": "100%",
        "padding": "24px",
    });

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
        const { font, lines } = this.getOptions(options);
        const lineWidth = 192 * 100;

        script = parseFakedown(script);

        const glyphPages = scriptToPages(script, { font, lineWidth, lineCount: lines });
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
        
        const style = {
            left: `${options.anchorX * 100}%`,
            top: `${options.anchorY * 100}%`,
            transform: `translate(${options.anchorX * -100}%, ${options.anchorY * -100}%)`,
        }

        Object.assign(this.elements.panel.style, { background: "black" });
        Object.assign(this.elements.panel.style, style, options);

        this.elements.root.style.backgroundColor = options.backgroundColor ?? null;
        this.elements.panel.style.background = options.panelColor ?? null;

        await sleep(1);
        this.elements.root.style.visibility = "unset";
    }

    render() {
        if (this.empty) return;

        this.currentPage.glyphs.forEach((glyph, i) => {
            const span = this.elements.chars.children[i];
            span.style.visibility = glyph.hidden ? "hidden" : null;
            Object.assign(span.style, {
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