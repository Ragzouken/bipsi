const CONT_ICON_DATA = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAGCAYAAAD68A/GAAAAAXNSR0IArs4c6QAAADNJREFUCJmNzrENACAMA0E/++/8NAhRBEg6yyc5SePUoNqwDICnWP04ww1tWOHfUqqf1UwGcw4T9WFhtgAAAABJRU5ErkJggg==";
const STOP_ICON_DATA = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAGCAYAAAD68A/GAAAAAXNSR0IArs4c6QAAACJJREFUCJljZICC/////2fAAhgZGRn////PwIRNEhsYCgoBIkQHCf7H+yAAAAAASUVORK5CYII="

// async equivalent of Function constructor
const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor

/**
 * @param {BipsiDataEvent} event 
 * @param {string} key 
 */
function eventIsTagged(event, key) {
    return oneField(event, key, "tag") !== undefined;
}

/**
 * @param {BipsiDataRoom} room
 * @param {number} x 
 * @param {number} y 
 */
function cellIsSolid(room, x, y) {
    const wall = room.wallmap[y][x] > 0;
    const solid = getEventsAt(room.events, x, y).some((event) => eventIsTagged(event, "solid"));
    return solid || wall;
}

/**
 * 
 * @param {BipsiDataEvent} event 
 * @param {string} name 
 * @param {string} type 
 */
function allFields(event, name, type=undefined) {
    return event.fields.filter((field) => field.key === name && field.type === (type ?? field.type));
}

/**
 * 
 * @param {BipsiDataEvent} event 
 * @param {string} name 
 * @param {string} type 
 */
 function oneField(event, name, type=undefined) {
    return event.fields.find((field) => field.key === name && field.type === (type ?? field.type));
}

/**
 * @param {BipsiDataProject} data 
 */
function allEvents(data) {
    return data.rooms.flatMap((room) => room.events);
}

/**
 * @param {BipsiDataProject} data 
 * @param {BipsiDataEvent} event 
 */
function roomFromEvent(data, event) {
    return data.rooms.find((room) => room.events.includes(event));
}

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
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

bipsi.Player = class extends EventTarget {
    constructor(font) {
        super();
        // home for data of the project we're playing
        this.stateManager = new maker.StateManager(bipsi.getManifest);
        this.stateBackup = new maker.StateManager(bipsi.getManifest);
        // final composite of any graphics
        this.rendering = createRendering2D(256, 256);

        this.font = font;
        this.dialoguePlayer = new DialoguePlayer(256, 256);
        this.dialoguePlayer.options.font = font;

        this.time = 0;
        this.frameCount = 0;
        
        this.ready = false;
        this.busy = false;
        this.error = false;

        // an awaitable that generates a new promise that resolves once no dialogue is active
        /** @type {PromiseLike<void>} */
        this.dialogueWaiter = {
            then: (resolve, reject) => {
                if (this.dialoguePlayer.empty) {
                    resolve();
                } else {
                    return wait(this.dialoguePlayer, "empty").then(resolve, reject);
                }
            },
        };
    }

    async init() {
        await this.dialoguePlayer.load();
    }

    /** @type {BipsiDataProject} */
    get data() {
        return this.stateManager.present;
    }

    async backup() {
        this.stateBackup.copyFrom(this.stateManager);
    }

    /**
     * @param {maker.StateManager<BipsiDataProject>} stateManager 
     */
    async copyFrom(stateManager) {
        this.clear();
        await this.stateManager.copyFrom(stateManager);
        await this.backup();
        this.start();
    }

    /**
     * @param {maker.ProjectBundle<BipsiDataProject>} bundle
     */
    async loadBundle(bundle) {
        this.clear();
        await this.stateManager.loadBundle(bundle);
        await this.backup();
        this.start();
    }

    async restart() {
        this.clear();
        await this.stateManager.copyFrom(this.stateBackup);
        this.start();
    }

    async start() {
        // player avatar is event tagged "is-player" at the beginning of the game
        const avatar = allEvents(this.data).find((event) => eventIsTagged(event, "is-player"));
        if (avatar === undefined) {
            this.showError("NO EVENT WITH is-player TAG FOUND");
            return;
        }

        // move avatar to last event (render on top)
        const room = roomFromEvent(this.data, avatar);
        arrayDiscard(room.events, avatar);
        room.events.push(avatar);

        this.avatarId = avatar.id;
        this.ready = true;

        // game starts by running the touch behaviour of the player avatar
        await this.touch(avatar);
    }

    clear() {
        this.ready = false;
        this.error = false;
        this.dialoguePlayer.clear();
    }

    update(dt) {
        if (!this.ready) return;

        // tile animation
        this.time += dt;
        while (this.time >= .400) {
            this.frameCount += 1;
            this.time -= .4;
        }

        // dialogue animation
        this.dialoguePlayer.update(dt);
        
        // rerender
        this.render();
    }

    render() {
        // find avatar, current room, current palette
        const avatar = getEventById(this.data, this.avatarId);
        const room = roomFromEvent(this.data, avatar);
        const [background, foreground, highlight] = this.getActivePalette();

        // recolor tileset according to palette
        const tileset = this.stateManager.resources.get(this.data.tileset);
        const tilesetFG = recolorMask(tileset, foreground, TEMP_TILESET0);
        const tilesetHI = recolorMask(tileset, highlight, TEMP_TILESET1);

        // clear to background color
        fillRendering2D(TEMP_128, background);

        // find current animation frame for each tile
        const frame = this.frameCount % 2;
        const tileToFrame = makeTileToFrameMap(this.data.tiles, frame);

        // draw current animation frame for each tile in each layer of tilemaps
        drawTilemap(TEMP_128, tilesetFG, tileToFrame, room.tilemap, background);
        drawTilemap(TEMP_128, tilesetHI, tileToFrame, room.highmap, background);
        drawEvents(TEMP_128, tilesetHI, tileToFrame, room.events, background);

        // upscale tilemaps to display area
        this.rendering.drawImage(TEMP_128.canvas, 0, 0, 256, 256);

        // render dialogue box if necessary
        if (!this.dialoguePlayer.empty) {
            // change default dialogue position based on avatar position
            const top = avatar.position[1] >= 8;
            this.dialoguePlayer.options.anchorY = top ? 0 : 1;

            // redraw dialogue and copy to display area
            this.dialoguePlayer.render();
            this.rendering.drawImage(this.dialoguePlayer.dialogueRendering.canvas, 0, 0);
        }

        // signal, to anyone listening, that rendering happened
        this.dispatchEvent(new CustomEvent("render"));
    }

    async proceed() {
        if (!this.ready) return;

        this.dialoguePlayer.skip();
    }

    async say(script, options) {
        await this.dialoguePlayer.queue(script, options);
    }

    async move(dx, dy) {
        if (!this.ready || !this.dialoguePlayer.empty || this.busy) return;

        this.busy = true;

        const avatar = getEventById(this.data, this.avatarId);
        const room = roomFromEvent(this.data, avatar);

        // determine move destination
        const [px, py] = avatar.position;
        const [tx, ty] = [px+dx, py+dy];

        // is the movement stopped by the room edge or solid cells?
        const confined = tx < 0 || tx >= 16 || ty < 0 || ty >= 16;
        const blocked = confined ? false : cellIsSolid(room, tx, ty);

        // if not, then update avatar position
        if (!blocked && !confined) avatar.position = [tx, ty];

        // find if there's an event that should be touched. prefer an event at
        // the cell the avatar tried to move into but settle for the cell 
        // they're already standing on otherwise
        const [fx, fy] = avatar.position;
        const [event0] = getEventsAt(room.events, tx, ty, avatar);
        const [event1] = getEventsAt(room.events, fx, fy, avatar);
        const event = event0 ?? event1;

        // if there was such an event, touch it
        if (event) await this.touch(event);

        this.busy = false;
    }

    async touch(event) {
        const touch = oneField(event, "touch", "javascript")?.data;

        if (touch !== undefined) {
            const defines = generateScriptingDefines(this, event);
            const names = Object.keys(defines).join(", ");
            const preamble = `const { ${names} } = COMMANDS;\n`;

            try {
                const script = new AsyncFunction("COMMANDS", preamble + touch);
                await script(defines);
            } catch (e) {
                const error = `SCRIPT ERROR:\n${e}`;
                this.showError(error);
            }
        } else {
            return standardEventTouch(this, event);
        }
    }

    showError(text) {
        const options = {
            glyphRevealDelay: 0,
            panelColor: "#FF0000",
            textColor: "#FFFFFF",
        }

        this.error = true;
        this.dialoguePlayer.clear();
        this.dialoguePlayer.queue(text, options);
        this.dialoguePlayer.skip();
        this.dialoguePlayer.render();
        this.rendering.drawImage(this.dialoguePlayer.dialogueRendering.canvas, 0, 0);
        this.dispatchEvent(new CustomEvent("render"));
    }

    getActivePalette() {
        const avatar = getEventById(this.data, this.avatarId);
        const room = roomFromEvent(this.data, avatar);
        const palette = this.data.palettes[room.palette];
        return palette;
    }
}

/**
 * @param {bipsi.Player} player 
 * @param {BipsiDataEvent} event 
 * @returns {Promise}
 */
async function standardEventTouch(player, event) {
    const background = oneField(event, "page-color", "text")?.data;
    if (background !== undefined) {
        ONE(":root").style.setProperty("--page-color", background);
    }

    await runEventDialogue(player, event);
    await runEventExit(player, event);
    await runEventRemove(player, event);
    await runEventEnding(player, event);
    await runEventMisc(player, event);
}

/**
 * @param {bipsi.Player} player 
 * @param {BipsiDataEvent} event 
 * @returns {Promise}
 */
async function runEventDialogue(player, event) {
    // show title first, if any
    const title = oneField(event, "title", "dialogue")?.data;
    
    if (title !== undefined) {
        const [background] = player.getActivePalette();
        await player.say(title, { anchorY: .5, backgroundColor: background });
    }

    const says = allFields(event, "say", "dialogue");
    const sayMode = oneField(event, "say-mode", "text")?.data;
    const sayStyle = oneField(event, "say-style", "json")?.data;

    // if we haven't already, decide in advance which order to show say dialogue
    if (event.says === undefined) {
        event.says = says.map((say) => say.data);
        event.sayProgress = 0;
        if (sayMode === "shuffle") shuffleArray(event.says);
    }

    // if there are any say dialogues
    if (event.says.length > 0) {
        // show the next say dialogue and advance
        const say = event.says[event.sayProgress];
        player.say(say, sayStyle);
        event.sayProgress += 1;

        // if we've now used all the dialogues, reset the progress according to
        // the say mode
        if (event.sayProgress >= event.says.length) {
            if (sayMode === "shuffle" || sayMode === "cycle") {
                event.says = undefined;
            } else {
                event.sayProgress = event.says.length - 1;
            }
        }
    }

    return player.dialogueWaiter;
}

/**
 * @param {bipsi.Player} player 
 * @param {BipsiDataEvent} event 
 * @returns {Promise}
 */
async function runEventExit(player, event) {
    const avatar = getEventById(player.data, player.avatarId);
    const room = roomFromEvent(player.data, avatar);
    const exit = oneField(event, "exit", "location")?.data;

    if (exit !== undefined) {
        const nextRoom = player.data.rooms[exit.room];
        arrayDiscard(room.events, avatar);
        nextRoom.events.push(avatar);
        avatar.position = [...exit.position];
    }
}

/**
 * @param {bipsi.Player} player 
 * @param {BipsiDataEvent} event 
 * @returns {Promise}
 */
async function runEventRemove(player, event) {
    if (eventIsTagged(event, "one-time")) {
        arrayDiscard(roomFromEvent(player.data, event).events, event);
    }
}

/**
 * @param {bipsi.Player} player 
 * @param {BipsiDataEvent} event 
 * @returns {Promise}
 */
 async function runEventEnding(player, event) {
    const ending = oneField(event, "ending", "dialogue")?.data;

    if (ending !== undefined) {
        const [background] = player.getActivePalette();
        await player.say(ending, { anchorY: .5, backgroundColor: background });
        player.restart();
    }
}

/**
 * @param {bipsi.Player} player 
 * @param {BipsiDataEvent} event 
 * @returns {Promise}
 */
 async function runEventMisc(player, event) {
    const setAvatar = oneField(event, "set-avatar", "tile")?.data;
    const avatar = getEventById(player.data, player.avatarId);

    if (setAvatar !== undefined) {
        replaceFields(avatar, "graphic", "tile", setAvatar);
    }
}

function fakedownToTag(text, fd, tag) {
    const pattern = new RegExp(`${fd}([^${fd}]+)${fd}`, 'g');
    return text.replace(pattern, `{+${tag}}$1{-${tag}}`);
}

function parseFakedown(text) {
    text = fakedownToTag(text, '##', 'shk');
    text = fakedownToTag(text, '~~', 'wvy');
    text = fakedownToTag(text, '==', 'rbw');
    text = fakedownToTag(text, '__', 'r');
    return text;
}

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

class DialoguePlayer extends EventTarget {
    constructor(width, height) {
        super();
        this.dialogueRendering = createRendering2D(width, height);

        /** @type {DialoguePage[]} */
        this.queuedPages = [];
        this.pagesSeen = 0;
        
        this.options = {};

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
        const { font, lines } = this.getOptions(options);
        const lineWidth = 192;

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

        fillRendering2D(this.dialogueRendering, options.backgroundColor);
        
        const { width: displayWidth, height: displayHeight } = this.dialogueRendering.canvas;
        const spaceX = displayWidth - width;
        const spaceY = displayHeight - height;
        const margin = Math.ceil(Math.min(spaceX, spaceY) / 2);

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
 * @param {BipsiDataEvent} event 
 * @param {string} name 
 * @param {string?} type 
 */
function clearFields(event, name, type=undefined) {
    const fields = allFields(event, name, type);
    fields.forEach((field) => arrayDiscard(event.fields, field));
}

/**
 * @param {BipsiDataEvent} event 
 * @param {string} name 
 * @param {string} type 
 * @param {any[]} values
 */
function replaceFields(event, name, type, ...values) {
    clearFields(event, name, type);
    values.forEach((value) => {
        event.fields.push({
            key: name,
            type,
            data: value,
        });
    });
}

/**
 * @param {bipsi.Player} player 
 * @param {BipsiDataEvent} event 
 */
function generateScriptingDefines(player, event) {
    // edit here to add new scripting functions
    const defines = {};
    
    defines.PLAYER = player;
    defines.AVATAR = getEventById(player.data, player.avatarId);
    defines.EVENT = event;

    defines.SET_FIELDS = (event, name, type, ...values) => replaceFields(event, name, type, ...values);

    defines.FIELD = (event, name, type=undefined) => oneField(event, name, type)?.data;
    defines.FIELDS = (event, name, type=undefined) => allFields(event, name, type).map((field) => field.data);

    defines.LOG = (text) => console.log(text);
    defines.SAY = async (dialogue) => player.say(dialogue);
    defines.TITLE = async (dialogue) => player.say(dialogue, true);
    defines.DELAY = async (seconds) => sleep(seconds * 1000);
    defines.DIALOGUE = player.dialogueWaiter;
    defines.DIALOG = defines.DIALOGUE;

    return defines;
}
