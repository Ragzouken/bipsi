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
 */
 function allTags(event) {
    return event.fields.filter((field) => field.type === "tag").map((field) => field.key);
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
    const room = data.rooms.find((room) => room.id === location.room);
    
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
    return { room: room.id, position: [...event.position] };
}

/**
 * @param {BipsiDataProject} data 
 * @param {BipsiDataEvent} event 
 * @param {BipsiDataLocation} location
 */
function moveEvent(data, event, location) {
    const room = data.rooms.find((room) => room.id === location.room);
    
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

const BEHAVIOUR_PAGE_COLOR = `
let color = FIELD(EVENT, "page-color", "text");
if (color) {
    SET_CSS("--page-color", color);
}
`;

const BEHAVIOUR_IMAGES = `
let background = FIELD_OR_LIBRARY("background");
if (background) {
    SHOW_IMAGE("BACKGROUND", background, 1, 0, 0);
} else if (IS_TAGGED(EVENT, "clear-background")) {
    HIDE_IMAGE("BACKGROUND");
}

let foreground = FIELD_OR_LIBRARY("foreground");
if (foreground) {
    SHOW_IMAGE("FOREGROUND", foreground, 2, 0, 0);
} else if (IS_TAGGED(EVENT, "clear-foreground")) {
    HIDE_IMAGE("FOREGROUND");
}

let overlay = FIELD_OR_LIBRARY("overlay");
if (overlay) {
    SHOW_IMAGE("OVERLAY", overlay, 3, 0, 0);
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
    await TITLE(title);
}
`;

const BEHAVIOUR_DIALOGUE = `
let id = FIELD(EVENT, "say-shared-id", "text") ?? "SAY-ITERATORS/" + EVENT_ID(EVENT);
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

const BEHAVIOUR_TOUCH_LOCATION = `
let location = FIELD(EVENT, "touch-location", "location");
let event = location ? EVENT_AT(location) : undefined;
if (event) {
    TOUCH(event);
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

const BACKG_PAGE = createRendering2D(128, 128); 
const COLOR_PAGE = createRendering2D(128, 128);
const TILES_PAGE = createRendering2D(128, 128);

function drawRecolorLayer(destination, render) {
    fillRendering2D(BACKG_PAGE);
    fillRendering2D(COLOR_PAGE);
    fillRendering2D(TILES_PAGE);

    render(BACKG_PAGE, COLOR_PAGE, TILES_PAGE);

    COLOR_PAGE.globalCompositeOperation = "destination-in";
    COLOR_PAGE.drawImage(TILES_PAGE.canvas, 0, 0);
    COLOR_PAGE.globalCompositeOperation = "source-over";
    destination.drawImage(BACKG_PAGE.canvas, 0, 0);
    destination.drawImage(COLOR_PAGE.canvas, 0, 0);
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
        
        this.ready = false;
        this.busy = false;
        this.error = false;

        this.objectURLs = new Map();
        this.imageElements = new Map();

        this.music = document.createElement("audio");
        this.music.loop = true;
        this.autoplay = false;

        this.variables = new Map();
        this.images = new Map();

        this.extra_behaviours = [];
        
        this.preventMoving = false;
        this.story = undefined
    }

    async init() {
        await this.dialoguePlayback.load();
    }

    async initWithStory(story){
        await this.init()
        this.story = story;
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
        //await this.touch(avatar);
        await this.continueStory();
    }

    async spawnAt(target, event){
        let targetEvent = findEventByTag(this.data, target);
        if(targetEvent){
            let targetLocation = getLocationOfEvent(this.data, targetEvent);
            let spawnedEvent = findEventByTag(this.data, event);
            if(targetLocation && spawnedEvent){
                await moveEvent(this.data, spawnedEvent, targetLocation);
            }
        }
    }

    async continueStory(){
        const story = this.story;
        while(story.canContinue) {
            // Get ink to generate the next paragraph
            var paragraphText = this.story.Continue().trim();
            var tags = story.currentTags;

            if(paragraphText.length > 0){
                const matchSpawn = paragraphText.trim().match(/SPAWN_AT\(([^),\s]*)([\s]*,[\s]*([^)]*)*)*\)/)
                console.log(matchSpawn)
                if( matchSpawn ){
                    const target = matchSpawn[1];
                    const event = matchSpawn[3] || "is-player";
                    await this.spawnAt(target.trim(), event.trim());
                }else if(tags.includes("TITLE")){
                    await this.title(paragraphText);
                }else{
                    await this.say(paragraphText);
                }
            }
        }

        const choices = this.story.currentChoices;

        const autoChoice = choices.find( (choice) => choice.text.startsWith("auto:"))
        if(autoChoice !== undefined){
            story.ChooseChoiceIndex(autoChoice.index)
            return await this.continueStory();
        }

        const dialogChoices = choices.filter( (choice) => {
            if(choice.text.startsWith("auto:")) return false;
            if(choice.text.startsWith("tag:")) return false;
            return true;
        })

        const continueStory = this.continueStory.bind(this)

        if(dialogChoices.length > 0){
            const choiceListContainer = ONE("#player-choices-list");
            this.preventMoving = true;
            dialogChoices.forEach(function(choice) {

                // Create paragraph with anchor element
                var choiceParagraphElement = document.createElement('li');
                choiceParagraphElement.classList.add("choice");
                choiceParagraphElement.innerHTML = `<a href='#'>${choice.text}</a>`
                choiceListContainer.appendChild(choiceParagraphElement);
    
                // Click on choice
                var choiceAnchorEl = choiceParagraphElement.querySelectorAll("a")[0];
                choiceAnchorEl.addEventListener("click", function(event) {
    
                    // Don't follow <a> link
                    event.preventDefault();
    
                    // Remove all existing choices
                    choiceListContainer.innerHTML = "";
    
                    // Tell the story where to go next
                    story.ChooseChoiceIndex(choice.index);
    
                    // Aaand loop
                    continueStory();
                });
            });
        }else{
            this.preventMoving = false
        }
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
        const palette = this.getActivePalette();
        const [background] = palette;
        const tileset = this.stateManager.resources.get(this.data.tileset);

        // find current animation frame for each tile
        const frame = this.frameCount % 2;
        const tileToFrame = makeTileToFrameMap(this.data.tiles, frame);

        // sort images
        const images = Array.from(this.images.values());
        images.sort((a, b) => a.layer - b.layer);
        const images_below_all    = images.filter((image) => image.layer < 1);
        const images_below_events = images.filter((image) => image.layer >= 1 && image.layer < 2);
        const images_above_events = images.filter((image) => image.layer >= 2 && image.layer < 3);
        const images_above_all    = images.filter((image) => image.layer >= 3);

        fillRendering2D(this.rendering);
        fillRendering2D(TEMP_128, background);
        images_below_all.forEach(({ image, x, y }) => TEMP_128.drawImage(image, x, y));
        drawTilemapLayer(TEMP_128, tileset, tileToFrame, palette, room);
        images_below_events.forEach(({ image, x, y }) => TEMP_128.drawImage(image, x, y));
        drawEventLayer(TEMP_128, tileset, tileToFrame, palette, room.events);
        images_above_events.forEach(({ image, x, y }) => TEMP_128.drawImage(image, x, y));

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
        
        fillRendering2D(TEMP_128);
        images_above_all.forEach(({ image, x, y }) => TEMP_128.drawImage(image, x, y));
        this.rendering.drawImage(TEMP_128.canvas, 0, 0, 256, 256);

        if (this.ended) {
            fillRendering2D(this.rendering);
        }

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
        try {
            window.parent.postMessage({ type: "variables", data: this.variables });
        } catch (e) {
            this.log("> CAN'T TRACK VARIABLES (COMPLEX VALUE)");
        }
    }

    async proceed() {
        if (!this.ready) return;

        if (this.ended) {
            this.restart();
        }

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
        this.log(`> SAYING "${script}"`);
        script = replaceVariables(script, this.variables);
        await this.dialoguePlayback.queue(script, options);
    }

    async move(dx, dy) {
        if (this.ended) this.proceed();
        if (!this.ready || !this.dialoguePlayback.empty || this.busy || this.ended) return;

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

        const tags = allTags(event);

        // do we have a choice that can be triggered by this event ?
        const choices = this.story.currentChoices
        const taggedChoice = choices.find(choice => {
            if(choice.text.substr(0,4) == "tag:"){
                const tagvalue = choice.text.substr(4).trim();
                if(tags.includes(tagvalue)) return true
                return false;
            }
            return false;
        })

        if (touch !== undefined) {
            await this.runJS(event, touch);
        }else if(taggedChoice !== undefined){
            this.story.ChooseChoiceIndex(taggedChoice.index)
            await this.continueStory();
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
            const long = `> SCRIPT ERROR "${e}"\n---\n${js}\n---`;
            this.log(long);

            const error = `SCRIPT ERROR:\n${e}`;
            this.showError(error);
        }
    }

    playMusic(src) {
        const playing = !this.music.paused;
        this.music.src = src;
        this.autoplay = true;
        if (playing) this.music.play();
    }

    stopMusic() {
        this.music.pause();
        this.autoplay = false;
    }

    setBackground(image) {
        this.background = image;
    }
    
    async showImage(imageID, fileID, layer, x, y) {
        const image = this.getFileImageElement(fileID);
        this.images.set(imageID, { image, layer, x, y });
    }

    hideImage(imageID) {
        this.images.delete(imageID);
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

    for (let script of playback.extra_behaviours) {
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

/**
 * @param {BipsiPlayback} playback 
 * @param {BipsiDataEvent} event 
 */
function generateScriptingDefines(playback, event) {
    // edit here to add new scripting functions
    const defines = {};
    
    defines.PLAYBACK = playback;
    defines.AVATAR = getEventById(playback.data, playback.avatarId);
    defines.LIBRARY = getEventById(playback.data, playback.libraryId);
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
    defines.FIND_EVENTS = (tag) => findEventsByTag(playback.data, tag); 
    defines.FIND_EVENT = (tag) => findEventByTag(playback.data, tag); 

    defines.GET = (key, fallback=undefined) => playback.variables.get(key) ?? fallback;
    defines.SET = (key, value) => playback.setVariable(key, value);

    defines.EVENT_ID = (event) => event.id;

    defines.TEXT_REPLACE = (text, ...values) => replace(text, ...values);

    defines.SAY = async (dialogue, options) => playback.say(dialogue, options);
    defines.SAY_FIELD = async (name, options) => {
        let text = oneField(event, name, "dialogue")?.data ?? `[FIELD MISSING: ${name}]`;
        await playback.say(text, options);
    }

    defines.TITLE = async (dialogue, options) => playback.title(dialogue, options);
    defines.DIALOGUE = playback.dialoguePlayback.waiter;
    defines.DIALOG = defines.DIALOGUE;

    defines.LOG = (...data) => playback.log(...data);
    defines.DELAY = async (seconds) => sleep(seconds * 1000);

    defines.RESTART = () => playback.end();

    defines.SAMPLE = (id, type, ...values) => sample(playback, id, type, ...values);
    defines.SET_CSS = (name, value) => ONE(":root").style.setProperty(name, value);

    defines.RUN_JS = (script, event=defines.EVENT) => playback.runJS(event, script);
    defines.ADD_BEHAVIOURS = (...scripts) => playback.extra_behaviours.push(...scripts);
    
    defines.PLAY_MUSIC = (file) => playback.playMusic(playback.getFileObjectURL(file));
    defines.STOP_MUSIC = () => playback.stopMusic();

    defines.SHOW_IMAGE = (id, file, layer, x, y) => playback.showImage(id, file, layer, x, y);
    defines.HIDE_IMAGE = (id) => playback.hideImage(id);

    defines.FILE_TEXT = (file) => playback.stateManager.resources.get(file).text();

    defines.FIELD_OR_LIBRARY = (field, event=defines.EVENT) => {
        let file = oneField(event, field, "file")?.data;
        let name = oneField(event, field, "text")?.data;

        if (!file && name && defines.LIBRARY) {
            file = oneField(defines.LIBRARY, name, "file")?.data;
        } else if (!file && defines.LIBRARY) {
            file = oneField(defines.LIBRARY, field, "file")?.data;
        }

        return file;
    };

    defines.POST = (message, origin="*") => postMessageParent(message, origin);

    //binksi
    defines.STORY = playback.story;
    defines.SET_INK_VAR = (field, value) => playback.story.variablesState.$(field, value);
    defines.GET_INK_VAR = (field) => playback.story.variablesState.$(field);
    defines.DIVERT_TO = (knot_name) => {
        playback.story.ChoosePathString(knot_name);
        return playback.continueStory();
    }

    return defines;
}
