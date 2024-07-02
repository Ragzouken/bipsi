/**
 * Use inline style to resize canvas to fit its parent, preserving the aspect
 * ratio of its internal dimensions.
 * @param {HTMLCanvasElement} canvas 
 */
 function fitCanvasToParent(canvas) {
    const [tw, th] = [canvas.parentElement.clientWidth, canvas.parentElement.clientHeight];
    const [sw, sh] = [tw / canvas.width, th / canvas.height];
    let scale = Math.min(sw, sh);
    if (canvas.width * scale > 512) scale = Math.floor(scale); 

    canvas.style.setProperty("width", `${canvas.width * scale}px`);
    canvas.style.setProperty("height", `${canvas.height * scale}px`);
}

/**
 * @param {HTMLElement} element 
 */
 function scaleElementToParent(element, margin=0) {
    const parent = element.parentElement;

    const [tw, th] = [parent.clientWidth-margin*2, parent.clientHeight-margin*2];
    const [sw, sh] = [tw / element.clientWidth, th / element.clientHeight];
    let scale = Math.min(sw, sh);
    if (scale > 1) scale = Math.floor(scale); 

    element.style.setProperty("transform", `translate(-50%, -50%) scale(${scale})`);

    return scale;
}

// async equivalent of Function constructor
const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor

/**
 * @param {any} message 
 * @param {string} origin 
 */
function postMessageParent(message, origin) {
    const target = window.parent ?? window.opener;
    target?.postMessage(message, origin);
}

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
    const room = findRoomById(data, location.room);
    
    const [x, y] = location.position;
    const [event] = getEventsAt(room.events, x, y);
    return event;
} 

/**
 * @param {BipsiDataProject} data
 * @param {BipsiDataLocation} location
 * @returns {BipsiDataEvent[]}
 */
function getEventsAtLocation(data, location) {
    const room = findRoomById(data, location.room);

    const [x, y] = location.position;
    const events = getEventsAt(room.events, x, y);
    return events;
}

/**
 * @param {BipsiDataProject} data 
 * @param {BipsiDataEvent} event 
 * @returns {BipsiDataLocation}
 */
function getLocationOfEvent(data, event) {
    const room = roomFromEvent(data, event);
    return { room: room.id, position: [...event.position] };
}

/**
 * @param {BipsiDataProject} data 
 * @param {BipsiDataEvent} event 
 * @param {BipsiDataLocation} location
 */
function moveEvent(data, event, location) {
    const room = findRoomById(data, location.room);
    
    if (!room) throw Error("NO ROOM WITH ID " + location.room);
    
    removeEvent(data, event);
    room.events.push(event);
    event.position = [...location.position];
}

/**
 * @param {BipsiDataProject} data 
 * @param {number} eventId 
 * @param {BipsiDataLocation} location
 */
function moveEventById(data, eventId, location) {
    const event = findEventById(data, eventId);
    moveEvent(data, event, location);
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

/**
 * @param {BipsiDataProject} data
 * @param {number} roomId
 */
function findRoomById(data, roomId) {
    return data.rooms.find((room) => room.id === roomId);
}

/**
 * @param {BipsiDataProject} data
 * @param {number} eventId
 */
function findEventById(data, eventId) {
    return allEvents(data).filter((event) => event.id === eventId)[0];
}

function findEventsByTag(data, tag) {
    return allEvents(data).filter((event) => eventIsTagged(event, tag));
}

function findEventByTag(data, tag) {
    return allEvents(data).filter((event) => eventIsTagged(event, tag))[0];
}

/**
 * @param {BipsiDataEvent} event 
 */
function allEventTags(event) {
    return event.fields.filter((field) => field.type === "tag").map((field) => field.key);
}

const ERROR_STYLE = {
    glyphRevealDelay: 0,
    lines: 8,
    panelColor: "#FF0000",
    textColor: "#FFFFFF",

    anchorX: .5, anchorY: .5,
}

const BEHAVIOUR_BEFORE = `
let script = $FIELD("before", "javascript");
if (script) {
    await RUN_JS(script);
}
`;

const BEHAVIOUR_AFTER = `
let script = $FIELD("after", "javascript");
if (script) {
    await RUN_JS(script);
}
`;

const BEHAVIOUR_PAGE_COLOR = `
let color = FIELD(EVENT, "page-color", "text");
if (color) {
    SET_CSS("--page-color", color);
}
`;

const BEHAVIOUR_IMAGES = `
let backgrounds = FIELDS_OR_LIBRARY("background");
if (backgrounds.length > 0) {
    SHOW_IMAGE("BACKGROUND", backgrounds, 0, 0, 0);
} else if (IS_TAGGED(EVENT, "clear-background")) {
    HIDE_IMAGE("BACKGROUND");
}

let midgrounds = FIELDS_OR_LIBRARY("midground");
if (midgrounds.length > 0) {
    SHOW_IMAGE("MIDGROUND", midgrounds, 1, 0, 0);
} else if (IS_TAGGED(EVENT, "clear-midground")) {
    HIDE_IMAGE("MIDGROUND");
}

let foregrounds = FIELDS_OR_LIBRARY("foreground");
if (foregrounds.length > 0) {
    SHOW_IMAGE("FOREGROUND", foregrounds, 2, 0, 0);
} else if (IS_TAGGED(EVENT, "clear-foreground")) {
    HIDE_IMAGE("FOREGROUND");
}

let overlays = FIELDS_OR_LIBRARY("overlay");
if (overlays.length > 0) {
    SHOW_IMAGE("OVERLAY", overlays, 3, 0, 0);
} else if (IS_TAGGED(EVENT, "clear-overlay")) {
    HIDE_IMAGE("OVERLAY");
}
`;

const BEHAVIOUR_MUSIC = `
let music = FIELD_OR_LIBRARY("music");

if (music) {
    PLAY_MUSIC(music);
} else if (IS_TAGGED(EVENT, "stop-music")) {
    STOP_MUSIC();
}
`;

const BEHAVIOUR_TITLE = `
let title = FIELD(EVENT, "title", "dialogue");
if (title) {
    await TITLE(title, FIELD(EVENT, "say-style", "json"));
}
`;

const BEHAVIOUR_DIALOGUE = `
let id = FIELD(EVENT, "say-shared-id", "text") ?? "SAY-ITERATORS/" + EVENT_ID(EVENT);
let mode = FIELD(EVENT, "say-mode", "text") ?? "cycle";
let say = SAMPLE(id, mode, FIELDS(EVENT, "say", "dialogue"));
if (say) {
    await SAY(say, FIELD(EVENT, "say-style", "json"));
} else if (say === undefined) {
    let nosays = FIELD(EVENT, "no-says", "javascript");
    if (nosays) {
        await RUN_JS(nosays);
    }
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
        await TITLE(ending, FIELD(EVENT, "say-style", "json"));
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

const BEHAVIOUR_TOUCH_LOCATION = `
let location = FIELD(EVENT, "touch-location", "location");
let events = location ? EVENTS_AT(location) : [];
for (const event of events) {
    await TOUCH(event);
}
`;

const BEHAVIOUR_ADD_BEHAVIOUR = `
ADD_BEHAVIOURS(...FIELDS(EVENT, "add-behaviour", "javascript"));
ADD_BEHAVIOURS(...FIELDS(EVENT, "add-behavior", "javascript"));
`;

const STANDARD_SCRIPTS = [
    BEHAVIOUR_PAGE_COLOR,
    BEHAVIOUR_IMAGES,
    BEHAVIOUR_MUSIC,
    BEHAVIOUR_TITLE,
    BEHAVIOUR_DIALOGUE,
    BEHAVIOUR_EXIT,
    BEHAVIOUR_REMOVE,
    BEHAVIOUR_ENDING, 
    BEHAVIOUR_SET_AVATAR,
    BEHAVIOUR_TOUCH_LOCATION,
    BEHAVIOUR_ADD_BEHAVIOUR,
];

const BACKG_PAGE = createRendering2D(ROOM_PX, ROOM_PX); 
const COLOR_PAGE = createRendering2D(ROOM_PX, ROOM_PX);
const TILES_PAGE = createRendering2D(ROOM_PX, ROOM_PX);

function drawRecolorLayer(destination, render) {
    fillRendering2D(BACKG_PAGE);
    fillRendering2D(COLOR_PAGE);
    fillRendering2D(TILES_PAGE);

    render(BACKG_PAGE, COLOR_PAGE, TILES_PAGE);

    BACKG_PAGE.globalCompositeOperation = "destination-out";
    BACKG_PAGE.drawImage(TILES_PAGE.canvas, 0, 0);
    BACKG_PAGE.globalCompositeOperation = "source-over";

    COLOR_PAGE.globalCompositeOperation = "destination-in";
    COLOR_PAGE.drawImage(TILES_PAGE.canvas, 0, 0);
    COLOR_PAGE.globalCompositeOperation = "source-over";

    destination.drawImage(BACKG_PAGE.canvas, 0, 0);
    destination.drawImage(COLOR_PAGE.canvas, 0, 0);
}

const BACKG_PAGE_D = createRendering2D(555, 555); 
const COLOR_PAGE_D = createRendering2D(555, 555);
const TILES_PAGE_D = createRendering2D(555, 555);

function drawRecolorLayerDynamic(destination, render) {
    const { width, height } = destination.canvas;
    resizeRendering2D(BACKG_PAGE_D, width, height);
    resizeRendering2D(COLOR_PAGE_D, width, height);
    resizeRendering2D(TILES_PAGE_D, width, height);

    fillRendering2D(BACKG_PAGE_D);
    fillRendering2D(COLOR_PAGE_D);
    fillRendering2D(TILES_PAGE_D);

    render(BACKG_PAGE_D, COLOR_PAGE_D, TILES_PAGE_D);

    BACKG_PAGE_D.globalCompositeOperation = "destination-out";
    BACKG_PAGE_D.drawImage(TILES_PAGE_D.canvas, 0, 0);
    BACKG_PAGE_D.globalCompositeOperation = "source-over";

    COLOR_PAGE_D.globalCompositeOperation = "destination-in";
    COLOR_PAGE_D.drawImage(TILES_PAGE_D.canvas, 0, 0);
    COLOR_PAGE_D.globalCompositeOperation = "source-over";

    destination.drawImage(BACKG_PAGE_D.canvas, 0, 0);
    destination.drawImage(COLOR_PAGE_D.canvas, 0, 0);
}

class BipsiPlayback extends EventTarget {
    constructor(font) {
        super();
        // home for data of the project we're playing
        this.stateManager = new maker.StateManager(getManifest);
        this.stateBackup = new maker.StateManager(getManifest);
        // final composite of any graphics
        this.rendering = createRendering2D(256, 256);

        this.font = font;
        this.dialoguePlayback = new DialoguePlayback(256, 256);
        this.dialoguePlayback.options.font = font;

        this.time = 0;
        this.frameCount = 0;
        this.frameDelay = .400;
        
        this.ready = false;
        this.busy = false;
        this.error = false;

        this.objectURLs = new Map();
        this.imageElements = new Map();
        this.visibleImagesLoadedWaiter = { then: (resolve, reject) => this.visibleImagesLoaded().then(resolve, reject) };
        this.proceedWaiter = { then: (resolve) => this.addEventListener("proceed", resolve, { once: true }) };

        this.music = document.createElement("audio");
        this.music.loop = true;
        this.autoplay = false;

        this.variables = new Map();
        this.images = new Map();
        this.extra_behaviours = [];
    }

    async init() {
        await this.dialoguePlayback.load();
    }

    /** @type {BipsiDataProject} */
    get data() {
        return this.stateManager.present;
    }

    async backup() {
        await this.stateBackup.copyFrom(this.stateManager);
    }

    /**
     * @param {maker.StateManager<BipsiDataProject>} stateManager 
     */
    async copyFrom(stateManager) {
        this.clear();
        await this.stateManager.copyFrom(stateManager);
        await this.backup();
    }

    /**
     * @param {maker.ProjectBundle<BipsiDataProject>} bundle
     */
    async loadBundle(bundle) {
        this.clear();
        await this.stateManager.loadBundle(bundle);
        await this.backup();
    }

    clear() {
        this.time = 0;
        this.frameCount = 0;
        this.frameDelay = .400;

        this.ready = false;
        this.error = false;
        this.ended = false;
        this.dialoguePlayback.clear();
        this.variables.clear();

        this.music.removeAttribute("src");
        this.music.pause();
        this.images.clear();
        this.extra_behaviours.length = 0;
        this.imageElements.clear();
        this.objectURLs.forEach((url) => URL.revokeObjectURL(url));
        this.objectURLs.clear();
    }

    getFileObjectURL(id) {
        const url = this.objectURLs.get(id) 
                 ?? URL.createObjectURL(this.stateManager.resources.get(id));
        this.objectURLs.set(id, url);
        return url;
    } 

    getFileImageElement(id) {
        const image = this.imageElements.get(id) ?? loadImageLazy(this.getFileObjectURL(id));
        this.imageElements.set(id, image);
        return image;
    }

    async restart() {
        this.clear();
        await this.stateManager.copyFrom(this.stateBackup);
        this.start();
    }

    async start() {
        // player avatar is event tagged "is-player" at the beginning of the game
        const avatar = findEventByTag(this.data, "is-player");
        if (avatar === undefined) {
            this.showError("NO EVENT WITH is-player TAG FOUND");
            return;
        }

        // move avatar to last event (render on top)
        const room = roomFromEvent(this.data, avatar);
        moveEvent(this.data, avatar, { room: room.id, position: [...avatar.position] });

        this.avatarId = avatar.id;
        this.libraryId = findEventByTag(this.data, "is-library")?.id;
        this.ready = true;

        const setup = findEventByTag(this.data, "is-setup");
        if (setup) await this.touch(setup);

        // game starts by running the touch behaviour of the player avatar
        await this.touch(avatar);
    }

    update(dt) {
        if (!this.ready) return;

        // tile animation
        this.time += dt;
        while (this.time >= this.frameDelay) {
            this.frameCount += 1;
            this.time -= this.frameDelay;
        }

        // dialogue animation
        this.dialoguePlayback.update(dt);
        
        // rerender
        this.render();
    }

    addRoomToScene(scene, dest, frame) {
        // find avatar, current room, current palette
        const avatar = getEventById(this.data, this.avatarId);
        const room = roomFromEvent(this.data, avatar);
        const palette = this.getActivePalette();
        const tileset = this.stateManager.resources.get(this.data.tileset);

        // find current animation frame for each tile
        const tileToFrame = makeTileToFrameMap(this.data.tiles, frame);

        function upscaler(func) {
            return () => {
                fillRendering2D(TEMP_ROOM);
                func();
                dest.drawImage(TEMP_ROOM.canvas, 0, 0, 256, 256);
            };
        }

        scene.push({ layer: 1, func: upscaler(() => drawTilemapLayer(TEMP_ROOM, tileset, tileToFrame, palette, room)) });
        scene.push({ layer: 2, func: upscaler(() => drawEventLayer(TEMP_ROOM, tileset, tileToFrame, palette, room.events)) });
    }

    /**
     * 
     * @param {*} scene 
     * @param {CanvasRenderingContext2D} dest 
     * @param {number} frame 
     */
    addImagesToScene(scene, dest, frame) {
        // 2x scale for images for non-hd
        const scale = BIPSI_HD ? 1 : 2;

        function drawImage({ image, x, y }) {
            const source = image[frame % image.length]
            dest.drawImage(source, x, y, source.width * scale, source.height * scale);
        }

        const images = [...this.images.values()];
        const draws = images.map((image) => ({ layer: image.layer, func: () => drawImage(image) }));

        scene.push(...draws);
    }

    addDialogueToScene(scene, dest, frame) {
        if (this.dialoguePlayback.empty)
            return;

        // change default dialogue position based on avatar position
        const avatar = getEventById(this.data, this.avatarId);
        const top = avatar.position[1] >= 8;
        this.dialoguePlayback.options.anchorY = top ? 0 : 1;

        // redraw dialogue and copy to display area
        this.dialoguePlayback.render();
        scene.push({ layer: 3, func: () => dest.drawImage(this.dialoguePlayback.dialogueRendering.canvas, 0, 0) });
    }

    addLayersToScene(scene, dest, frame) {
        if (!this.ended) {
            this.addRoomToScene(scene, dest, frame);
            this.addDialogueToScene(scene, dest, frame);
            this.addImagesToScene(scene, dest, frame);
        }
    }

    render(frame=undefined) {
        frame = frame ?? this.frameCount;

        const scene = [];
        
        // add visual layers to scene
        this.addLayersToScene(scene, this.rendering, frame);

        // sort visual layers
        scene.sort((a, b) => a.layer - b.layer);

        // clear and draw layers
        fillRendering2D(this.rendering);
        scene.forEach(({ func }) => func());

        // signal, to anyone listening, that rendering happened
        this.dispatchEvent(new CustomEvent("render"));
    }

    end() {
        this.ended = true;
    }

    log(...data) {
        this.dispatchEvent(new CustomEvent("log", { detail: data }));
        window.parent.postMessage({ type: "log", data });
    }

    setVariable(key, value) {
        this.variables.set(key, value);
        this.sendVariables();
    }

    sendVariables() {
        const variables = new Map();

        this.variables.forEach((value, key) => {
            try {
                variables.set(key, JSON.parse(JSON.stringify(value)));
            } catch (e) {
                variables.set(key, "[COMPLEX VALUE]");
            }
        });

        window.parent.postMessage({ type: "variables", data: variables });
    }

    get canMove() {
        return this.ready
            && this.dialoguePlayback.empty
            && !this.busy
            && !this.ended;
    }

    async proceed() {
        if (!this.ready) return;

        if (this.ended) {
            this.restart();
        }

        this.dispatchEvent(new CustomEvent("proceed"));        
        this.dialoguePlayback.skip();

        if (this.autoplay) {
            this.music.play();
            this.autoplay = false;
        }
    }

    async say(script, options={}) {
        this.log(`> SAYING "${script}"`);
        script = replaceVariables(script, this.variables);
        await this.dialoguePlayback.queue(script, options);
    }

    async move(dx, dy) {
        if (this.ended) this.proceed();
        if (!this.canMove) return;

        this.busy = true;

        const avatar = getEventById(this.data, this.avatarId);
        const room = roomFromEvent(this.data, avatar);

        // determine move destination
        const [px, py] = avatar.position;
        const [tx, ty] = [px+dx, py+dy];

        // is the movement stopped by the room edge or solid cells?
        const bounded = tx < 0 || tx >= ROOM_SIZE || ty < 0 || ty >= ROOM_SIZE;
        const blocked = bounded ? false : cellIsSolid(room, tx, ty);

        // if not, then update avatar position
        if (!blocked && !bounded) avatar.position = [tx, ty];

        // find if there are events that should be touched. prefer events at
        // the cell the avatar tried to move into but settle for events at
        // the cell they're already standing on otherwise
        const [fx, fy] = avatar.position;
        const events0 = getEventsAt(room.events, tx, ty, avatar);
        const events1 = getEventsAt(room.events, fx, fy, avatar);
        const events = events0.length ? events0 : events1;

        // if there were such events, touch them
        for (const event of events) {
            await this.touch(event);
        }

        this.busy = false;
    }


    eventDebugInfo(event) {
        const tags = allEventTags(event).join(", ");
        const info = tags.length > 0 ? `(tags: ${tags}) ` : "";
        return `${info}@ ${event.position}`;
    }

    /**
     * @param {BipsiDataEvent} event 
     */
    async touch(event) {
        this.log(`> TOUCHING EVENT ${this.eventDebugInfo(event)}`);
    
        const touch = oneField(event, "touch", "javascript")?.data;

        if (touch !== undefined) {
            await this.runJS(event, touch);
        } else {
            await this.runJS(event, BEHAVIOUR_BEFORE);
            await standardEventTouch(this, event);
            await this.runJS(event, BEHAVIOUR_AFTER);
        }
    }

    async runJS(event, js) {
        const defines = this.makeScriptingDefines(event);
        const names = Object.keys(defines).join(", ");
        const preamble = `const { ${names} } = this;\n`;

        try {
            const script = new AsyncFunction("", preamble + js);
            return await script.call(defines);
        } catch (e) {
            const long = `> SCRIPT ERROR "${e}"\n---\n${js}\n---`;
            this.log(long);

            const error = `SCRIPT ERROR:\n${e}`;
            this.showError(error);
        }
        return undefined;
    }

    makeScriptingDefines(event) {
        const defines = bindScriptingDefines(SCRIPTING_FUNCTIONS);
        addScriptingConstants(defines, this, event);
        return defines;
    }

    playMusic(src) {
        this.music.src = src;
        this.autoplay = true;
        this.music.play();
    }

    stopMusic() {
        this.music.pause();
        this.music.removeAttribute("src");
        this.autoplay = false;
    }

    setBackground(image) {
        this.background = image;
    }
    
    async showImage(imageID, fileIDs, layer, x, y) {
        if (typeof fileIDs === "string") {
            fileIDs = [fileIDs];
        }

        if (fileIDs.length === 0) {
            this.hideImage(imageID);
        } else {
            const images = fileIDs.map((fileID) => this.getFileImageElement(fileID));
            this.images.set(imageID, { image: images, layer, x, y });
            return Promise.all(images.map(imageLoadWaiter));
        }
    }

    hideImage(imageID) {
        this.images.delete(imageID);
    }

    async visibleImagesLoaded() {
        for (const { image } of this.images.values())
            for (const frame of image)
                await imageLoadWaiter(frame);
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
        const palette = getPaletteById(this.data, room.palette);
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

    for (let script of playback.extra_behaviours) {
        await playback.runJS(event, script);
    }
}

function sample(playback, id, type, values) {
    let iterator = playback.variables.get(id);

    if (!iterator?.next) {
        iterator = ITERATOR_FUNCS[type](values);
        playback.variables.set(id, iterator);
    }

    return iterator.next()?.value;
}

const ITERATOR_FUNCS = {
    "shuffle": makeShuffleIterator,
    "cycle": makeCycleIterator,
    "sequence": makeSequenceIterator,
    "sequence-once": makeSequenceOnceIterator,
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

function* makeSequenceOnceIterator(values) {
    values = [...values];
    for (let value of values) {
        yield value;
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

function replaceVariables(text, variables) {
    return text.replace(/\[\[([^\]]+)\]\]/g, (match, key) => variables.get(key) ?? match);
}

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

function bindScriptingDefines(defines) {
    const bound = {};

    for (const [name, func] of Object.entries(defines)) {
        bound[name] = func.bind(bound);
    }

    return bound;
}

const FIELD = (event, name, type=undefined) => oneField(event, name, type)?.data;
const FIELDS = (event, name, type=undefined) => allFields(event, name, type).map((field) => field.data);
const IS_TAGGED = (event, name) => eventIsTagged(event, name);

const SCRIPTING_FUNCTIONS = {
    SAY(dialogue, options) {
        return this.PLAYBACK.say(dialogue, options);
    },

    SAY_FIELD(name, options=undefined, event=this.EVENT) {
        const text = this.FIELD(event, name, "dialogue") ?? `[FIELD MISSING: ${name}]`;
        return this.SAY(text, options);
    },

    TITLE(dialogue, options) {
        const [, background] = this.PALETTE.colors;
        options = { anchorY: .5, backgroundColor: background, ...options };
        return this.PLAYBACK.say(dialogue, options);
    },

    TOUCH(event) {
        return this.PLAYBACK.touch(event);
    },

    EVENT_AT(location) {
        return getEventAtLocation(this.PLAYBACK.data, location);
    },

    EVENTS_AT(location) {
        return getEventsAtLocation(this.PLAYBACK.data, location);
    },

    LOCATION_OF(event) {
        return getLocationOfEvent(this.PLAYBACK.data, event);
    },

    FIND_EVENTS(tag) {
        return findEventsByTag(this.PLAYBACK.data, tag);
    },

    FIND_EVENT(tag) {
        return findEventByTag(this.PLAYBACK.data, tag); 
    },

    PLAY_MUSIC(file) {
        this.PLAYBACK.playMusic(this.PLAYBACK.getFileObjectURL(file));
    },
    STOP_MUSIC() {
        this.PLAYBACK.stopMusic();
    },

    SHOW_IMAGE(id, files, layer, x, y) {
        return this.PLAYBACK.showImage(id, files, layer, x, y);
    },
    HIDE_IMAGE(id) {
        this.PLAYBACK.hideImage(id);
    },

    FILE_TEXT(file) { 
        return this.PLAYBACK.stateManager.resources.get(file).text();
    },

    FIELD_OR_LIBRARY(field, event=this.EVENT) {
        let file = FIELD(event, field, "file");
        let name = FIELD(event, field, "text");

        if (!file && name && this.LIBRARY) {
            file = FIELD(this.LIBRARY, name, "file");
        } else if (!file && this.LIBRARY) {
            file = FIELD(this.LIBRARY, field, "file");
        }

        return file;
    },

    FIELDS_OR_LIBRARY(field, event=this.EVENT) {
        let files = FIELDS(event, field, "file");
        let names = FIELDS(event, field, "text");

        if (files.length === 0 && names.length > 0 && this.LIBRARY) {
            files = names.map((name) => FIELD(this.LIBRARY, name, "file"));
        } else if (files.length === 0 && this.LIBRARY) {
            files = FIELDS(this.LIBRARY, field, "file");
        }

        return files;
    },

    DO_STANDARD() { 
        return standardEventTouch(this.PLAYBACK, this.EVENT); 
    },

    MOVE(event, location) {
        moveEvent(this.PLAYBACK.data, event, location); 
    },

    FIELD,
    FIELDS,
    SET_FIELDS(event, name, type, ...values) {
        replaceFields(event, name, type, ...values);
    },

    $FIELD(name, type=undefined, event=this.EVENT) {
        return this.FIELD(event, name, type);
    },
    $FIELDS(name, type=undefined, event=this.EVENT) {
        return this.FIELDS(event, name, type);
    },
    $SET_FIELDS(name, type=undefined, ...values) {
        return this.SET_FIELDS(this.EVENT, name, type, ...values);
    },
    
    IS_TAGGED,
    TAG(event, name) {
        replaceFields(event, name, "tag", true);
    },
    UNTAG(event, name) {
        clearFields(event, name, "tag");
    },

    $IS_TAGGED(name, event=this.EVENT) {
        return this.IS_TAGGED(event, name);
    },
    $TAG(name, event=this.EVENT) {
        this.TAG(event, name);
    },
    $UNTAG(name, event=this.EVENT) {
        this.UNTAG(event, name);
    },

    REMOVE(event=this.EVENT) {
        removeEvent(this.PLAYBACK.data, event);
    },
    $REMOVE(event=this.EVENT) {
        this.REMOVE(event);
    },

    SET_GRAPHIC(event, tile) {
        replaceFields(event, "graphic", "tile", tile);
    },
    $SET_GRAPHIC(tile, event=this.EVENT) {
        this.SET_GRAPHIC(event, tile);
    },

    async WALK(event, sequence, delay=.4, wait=.4) {
        const dirs = Array.from(sequence);
        for (const dir of dirs) {
            if (dir === ".") {
                await sleep(wait * 1000);
            } else {
                let [x, y] = event.position;
                const [dx, dy] = WALK_DIRECTIONS[dir];
                x = Math.max(0, Math.min(ROOM_SIZE - 1, x + dx));
                y = Math.max(0, Math.min(ROOM_SIZE - 1, y + dy));
                event.position = [x, y];
                await sleep(delay * 1000);
            }
        }
    },
    async $WALK(sequence, delay=.4, wait=.4, event=this.EVENT) {
        return this.WALK(event, sequence, delay, wait);
    },

    GET(key, fallback=undefined, target=undefined) {
        key = target ? `${this.EVENT_ID(target)}/${key}` : key;
        return this.PLAYBACK.variables.get(key) ?? fallback;
    },
    SET(key, value, target=undefined) {
        key = target ? `${this.EVENT_ID(target)}/${key}` : key;
        this.PLAYBACK.setVariable(key, value);
    },
    $GET(key, fallback=undefined, target=this.EVENT) {
        return this.GET(key, fallback, target);
    },
    $SET(key, value, target=this.EVENT) {
        this.SET(key, value, target);
    },

    EVENT_ID(event) { 
        return event.id; 
    },
    TEXT_REPLACE(text, ...values) {
        return replace(text, ...values);
    },

    LOG(...data) {
        this.PLAYBACK.log(...data);
    },
    DELAY(seconds) {
        return sleep(seconds * 1000);
    },

    RESTART() {
        this.PLAYBACK.end();
    },

    SAMPLE(id, type, ...values) {
        return sample(this.PLAYBACK, id, type, ...values);
    },
    SET_CSS(name, value) {
        ONE(":root").style.setProperty(name, value);
    },

    RUN_JS(script, event=this.EVENT) {
        return this.PLAYBACK.runJS(event, script);
    },

    ADD_BEHAVIOURS(...scripts) {
        this.PLAYBACK.extra_behaviours.push(...scripts);
    },
    POST(message, origin="*") {
        postMessageParent(message, origin);
    },
}

/**
 * @param {BipsiPlayback} playback 
 * @param {BipsiDataEvent} event 
 */
function addScriptingConstants(defines, playback, event) {
    // edit here to add new scripting functions
    defines.PLAYBACK = playback;
    defines.AVATAR = getEventById(playback.data, playback.avatarId);
    defines.LIBRARY = getEventById(playback.data, playback.libraryId);
    defines.EVENT = event;
    defines.PALETTE = playback.getActivePalette();

    defines.DIALOGUE = playback.dialoguePlayback.waiter;
    defines.DIALOG = defines.DIALOGUE;
    defines.INPUT = playback.proceedWaiter;
    defines.VISIBLE_IMAGES_LOADED = playback.visibleImagesLoadedWaiter;

    // don't use these. retained for backwards compatibility
    defines.WAIT_INPUT = () => defines.INPUT;
}
