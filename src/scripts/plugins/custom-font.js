//!CONFIG note        (text) "custom font plugin by candle"
//!CONFIG char-width  (text) "0"
//!CONFIG char-height (text) "0"
//!CONFIG runs        (text) "0"
//!CONFIG glyphs      (file)

/** 
 * @param {number} charWidth
 * @param {number} charHeight
 * @param {string} runs
 * @param {HTMLImageElement} atlas
 */
async function loadBasicFontRaw(charWidth, charHeight, runs, atlas) {
    const indexes = parseRuns(runs);

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

        font.characters.set(codepoint, { codepoint, image: atlas, spacing: charWidth, rect });
    });

    return font;
}

wrap.before(BipsiPlayback.prototype, "start", async function() {
    const charWidth = parseInt(FIELD(CONFIG, "char-width", "text"), 10);
    const charHeight = parseInt(FIELD(CONFIG, "char-height", "text"), 10);

    const runs = FIELD(CONFIG, "runs", "text");
    const glyphs = this.getFileImageElement(FIELD(CONFIG, "glyphs", "file"));
    await new Promise((resolve) => glyphs.addEventListener("load", () => resolve(glyphs)));
    const font = await loadBasicFontRaw(charWidth, charHeight, runs, glyphs);

    this.font = font;
    this.dialoguePlayback.options.font = font;
});
