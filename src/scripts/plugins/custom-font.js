//!CONFIG note      (text) "custom font plugin by candle. use https://kool.tools/bipsi/tools/bipsi-font to convert"
//!CONFIG bipsifont (json)

wrap.before(BipsiPlayback.prototype, "start", async function() {
    const font = await loadBipsiFont(FIELD(CONFIG, "bipsifont", "json"));

    this.font = font;
    this.dialoguePlayback.options.font = font;
});
