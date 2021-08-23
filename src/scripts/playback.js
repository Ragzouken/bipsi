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

/**
 * @param {BipsiDataProject} data 
 * @param {BipsiDataLocation} location 
 * @returns {BipsiDataEvent?}
 */
function getEventAtLocation(data, location) {
    const room = data.rooms[location.room];
    const [x, y] = location.position;
    const [event] = getEventsAt(room.events, x, y);
    return event;
} 

/**
 * @param {BipsiDataProject} data 
 * @param {BipsiDataEvent} event 
 * @returns {BipsiDataLocation}
 */
function getLocationOfEvent(data, event) {
    const room = roomFromEvent(data, event);
    const index = data.rooms.indexOf(room);
    return { room: index, position: [...event.position] };
}

/**
 * @param {BipsiDataProject} data 
 * @param {BipsiDataEvent} event 
 * @param {BipsiDataLocation} location
 */
function moveEvent(data, event, location) {
    removeEvent(data, event);
    const room = data.rooms[location.room];
    room.events.push(event);
    event.position = [...location.position];
}

/**
 * @param {BipsiDataProject} data 
 * @param {BipsiDataEvent} event
 */
function removeEvent(data, event) {
    const prevRoom = roomFromEvent(data, event);
    arrayDiscard(prevRoom.events, event);
}

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

const ERROR_STYLE = {
    glyphRevealDelay: 0,
    panelColor: "#FF0000",
    textColor: "#FFFFFF",
}

const BEHAVIOUR_PAGE_COLOR = `
let color = FIELD(EVENT, "page-color", "text");
if (color) {
    SET_CSS("--page-color", color);
}
`;

const BEHAVIOUR_TITLE = `
let title = FIELD(EVENT, "title", "dialogue");
if (title) {
    await TITLE(title);
}
`;

const BEHAVIOUR_DIALOGUE = `
let id = FIELD(EVENT, "say-shared-id", "text") ?? "SAY-ITERATORS/" + EVENT.id;
let mode = FIELD(EVENT, "say-mode", "text") ?? "cycle";
let say = SAMPLE(id, mode, FIELDS(EVENT, "say", "dialogue"));
if (say) {
    await SAY(say, FIELD(EVENT, "say-style", "json"));
}
`;

const BEHAVIOUR_EXIT = `
let destination = FIELD(EVENT, "exit", "location");
if (destination) {
    MOVE(AVATAR, destination);
}
`;

const BEHAVIOUR_REMOVE = `
if (IS_TAGGED(EVENT, "one-time")) {
    REMOVE(EVENT);
}
`;

const BEHAVIOUR_ENDING = `
let ending = FIELD(EVENT, "ending", "dialogue");
if (ending !== undefined) {
    if (ending.length > 0) {
        await TITLE(ending);
    }
    RESTART();
}
`;

const BEHAVIOUR_SET_AVATAR = `
let graphic = FIELD(EVENT, "set-avatar", "tile");
if (graphic) {
    SET_GRAPHIC(AVATAR, graphic);
}
`;

const STANDARD_SCRIPTS = [
    BEHAVIOUR_PAGE_COLOR,
    BEHAVIOUR_TITLE,
    BEHAVIOUR_DIALOGUE,
    BEHAVIOUR_EXIT, 
    BEHAVIOUR_REMOVE, 
    BEHAVIOUR_ENDING, 
    BEHAVIOUR_SET_AVATAR,
];

class BipsiPlayback extends EventTarget {
    constructor(font) {
        super();
        // home for data of the project we're playing
        this.stateManager = new maker.StateManager(bipsi.getManifest);
        this.stateBackup = new maker.StateManager(bipsi.getManifest);
        // final composite of any graphics
        this.rendering = createRendering2D(256, 256);

        this.font = font;
        this.dialoguePlayback = new DialoguePlayback(256, 256);
        this.dialoguePlayback.options.font = font;

        this.time = 0;
        this.frameCount = 0;
        
        this.ready = false;
        this.busy = false;
        this.error = false;

        this.variables = new Map();

        this.music = document.createElement("audio");
        this.autoplay = false;
    }

    async init() {
        await this.dialoguePlayback.load();
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

    clear() {
        this.ready = false;
        this.error = false;
        this.dialoguePlayback.clear();
        this.variables.clear();
        this.music.pause();
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

        const music = oneField(avatar, "music", "file");
        if (music) {
            const file = this.stateManager.resources.get(music.data);
            this.music.src = URL.createObjectURL(file);
            this.autoplay = true;
        }

        // move avatar to last event (render on top)
        const room = roomFromEvent(this.data, avatar);
        const index = this.data.rooms.indexOf(room);
        moveEvent(this.data, avatar, { room: index, position: [...avatar.position] });

        this.avatarId = avatar.id;
        this.ready = true;

        // game starts by running the touch behaviour of the player avatar
        await this.touch(avatar);
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
        this.dialoguePlayback.update(dt);
        
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
        if (!this.dialoguePlayback.empty) {
            // change default dialogue position based on avatar position
            const top = avatar.position[1] >= 8;
            this.dialoguePlayback.options.anchorY = top ? 0 : 1;

            // redraw dialogue and copy to display area
            this.dialoguePlayback.render();
            this.rendering.drawImage(this.dialoguePlayback.dialogueRendering.canvas, 0, 0);
        }

        // signal, to anyone listening, that rendering happened
        this.dispatchEvent(new CustomEvent("render"));
    }

    async proceed() {
        if (!this.ready) return;

        this.dialoguePlayback.skip();

        if (this.autoplay) {
            this.music.play();
            this.autoplay = false;
        }
    }

    async title(script, options={}) {
        const [background] = this.getActivePalette();
        options = { anchorY: .5, backgroundColor: background, ...options };
        return this.say(script, options);
    }

    async say(script, options={}) {
        await this.dialoguePlayback.queue(script, options);
    }

    async move(dx, dy) {
        if (!this.ready || !this.dialoguePlayback.empty || this.busy) return;

        this.busy = true;

        const avatar = getEventById(this.data, this.avatarId);
        const room = roomFromEvent(this.data, avatar);

        // determine move destination
        const [px, py] = avatar.position;
        const [tx, ty] = [px+dx, py+dy];

        // is the movement stopped by the room edge or solid cells?
        const bounded = tx < 0 || tx >= 16 || ty < 0 || ty >= 16;
        const blocked = bounded ? false : cellIsSolid(room, tx, ty);

        // if not, then update avatar position
        if (!blocked && !bounded) avatar.position = [tx, ty];

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
            await this.runJS(event, touch);
        } else {
            await standardEventTouch(this, event);
        }
    }

    async runJS(event, js) {
        const defines = generateScriptingDefines(this, event);
        const names = Object.keys(defines).join(", ");
        const preamble = `const { ${names} } = COMMANDS;\n`;

        try {
            const script = new AsyncFunction("COMMANDS", preamble + js);
            await script(defines);
        } catch (e) {
            const error = `SCRIPT ERROR:\n${e}`;
            this.showError(error);
        }
    }

    showError(text) {
        this.error = true;
        this.dialoguePlayback.clear();
        this.dialoguePlayback.queue(text, ERROR_STYLE);
        this.dialoguePlayback.skip();
        this.dialoguePlayback.render();
        this.rendering.drawImage(this.dialoguePlayback.dialogueRendering.canvas, 0, 0);
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
 * @param {BipsiPlayback} playback 
 * @param {BipsiDataEvent} event 
 * @returns {Promise}
 */
async function standardEventTouch(playback, event) {
    for (let script of STANDARD_SCRIPTS) {
        await playback.runJS(event, script);
    }
}

function sample(playback, id, type, values) {
    let iterator = playback.variables.get(id);

    if (iterator === undefined) {
        iterator = ITERATOR_FUNCS[type](values);
        playback.variables.set(id, iterator);
    }

    return iterator.next()?.value;
}

const ITERATOR_FUNCS = {
    "shuffle": makeShuffleIterator,
    "cycle": makeCycleIterator,
    "sequence": makeSequenceIterator,
}

function* makeShuffleIterator(values) {
    values = [...values];
    while (values.length > 0) {
        shuffleArray(values);
        for (let value of values) {
            yield value;
        }
    }
}

function* makeCycleIterator(values) {
    values = [...values];
    while (values.length > 0) {
        for (let value of values) {
            yield value;
        }
    }
}

function* makeSequenceIterator(values) {
    values = [...values];
    for (let value of values) {
        yield value;
    }
    while (values.length > 0) {
        yield values[values.length - 1];
    }
}

/**
 * @param {BipsiPlayback} playback 
 * @param {BipsiDataEvent} event 
 * @returns {Promise}
 */
async function runEventRemove(playback, event) {
    if (eventIsTagged(event, "one-time")) {
        removeEvent(playback.data, event);
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

function replace(format) {
    const values = Array.prototype.slice.call(arguments, 1);
    return format.replace(/\[\s*(\d+)\s*\]/g, (match, index) => values[index] ?? match);
};

const WALK_DIRECTIONS = {
    "L": [-1,  0],
    "R": [ 1,  0],
    "U": [ 0, -1],
    "D": [ 0,  1],
    "<": [-1,  0],
    ">": [ 1,  0],
    "^": [ 0, -1],
    "v": [ 0,  1],
}

/**
 * @param {BipsiPlayback} playback 
 * @param {BipsiDataEvent} event 
 */
function generateScriptingDefines(playback, event) {
    // edit here to add new scripting functions
    const defines = {};
    
    defines.PLAYBACK = playback;
    defines.AVATAR = getEventById(playback.data, playback.avatarId);
    defines.EVENT = event;
    defines.PALETTE = playback.getActivePalette();

    defines.DO_STANDARD = () => standardEventTouch(playback, event);

    defines.SET_FIELDS = (event, name, type, ...values) => replaceFields(event, name, type, ...values);
    defines.FIELD = (event, name, type=undefined) => oneField(event, name, type)?.data;
    defines.FIELDS = (event, name, type=undefined) => allFields(event, name, type).map((field) => field.data);
    
    defines.IS_TAGGED = (event, name) => eventIsTagged(event, name);
    defines.TAG = (event, name) => replaceFields(event, name, "tag", true);
    defines.UNTAG = (event, name) => clearFields(event, name, "tag");

    defines.SET_GRAPHIC = (event, tile) => replaceFields(event, "graphic", "tile", tile);

    defines.WALK = async (event, sequence, delay=.4, wait=.4) => {
        const dirs = Array.from(sequence);
        for (const dir of dirs) {
            if (dir === ".") {
                await sleep(wait * 1000);
            } else {
                let [x, y] = event.position;
                const [dx, dy] = WALK_DIRECTIONS[dir];
                x = Math.max(0, Math.min(15, x + dx));
                y = Math.max(0, Math.min(15, y + dy));
                event.position = [x, y];
                await sleep(delay * 1000);
            }
        }
    };
    defines.MOVE = (event, location) => moveEvent(playback.data, event, location);
    defines.REMOVE = (event) => removeEvent(playback.data, event);

    defines.TOUCH = (event) => playback.touch(event);
    defines.EVENT_AT = (location) => getEventAtLocation(playback.data, location);
    defines.LOCATION_OF = (event) => getLocationOfEvent(playback.data, event);
    defines.FIND_EVENTS = (tag) => allEvents(playback.data).filter((event) => eventIsTagged(event, tag)); 
    defines.FIND_EVENT = (tag) => defines.FIND_EVENTS(tag)[0];

    defines.GET = (key, fallback=undefined) => playback.variables.get(key) ?? fallback;
    defines.SET = (key, value) => playback.variables.set(key, value);

    defines.TEXT_REPLACE = (text, ...values) => replace(text, ...values);

    defines.SAY = async (dialogue, options) => playback.say(dialogue, options);
    defines.SAY_FIELD = async (name, options) => {
        let text = oneField(event, name, "dialogue")?.data ?? `[FIELD MISSING: ${name}]`;
        await playback.say(text, options);
    }

    defines.TITLE = async (dialogue, options) => playback.title(dialogue, options);
    defines.DIALOGUE = playback.dialoguePlayback.waiter;
    defines.DIALOG = defines.DIALOGUE;

    defines.LOG = (text) => console.log(text);
    defines.DELAY = async (seconds) => sleep(seconds * 1000);

    defines.RESTART = () => playback.restart();

    defines.SAMPLE = (...args) => sample(playback, ...args);
    defines.SET_CSS = (name, value) => ONE(":root").style.setProperty(name, value);

    defines.RUN_JS = (script, event=defines.EVENT) => playback.runJS(event, script);

    return defines;
}
