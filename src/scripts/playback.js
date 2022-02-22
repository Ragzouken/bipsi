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
    const sayStyle = FIELD(EVENT, "say-style", "json");
    await SAY(say, sayStyle);
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

    BACKG_PAGE.globalCompositeOperation = "destination-out";
    BACKG_PAGE.drawImage(TILES_PAGE.canvas, 0, 0);
    BACKG_PAGE.globalCompositeOperation = "source-over";

    COLOR_PAGE.globalCompositeOperation = "destination-in";
    COLOR_PAGE.drawImage(TILES_PAGE.canvas, 0, 0);
    COLOR_PAGE.globalCompositeOperation = "source-over";

    destination.drawImage(BACKG_PAGE.canvas, 0, 0);
    destination.drawImage(COLOR_PAGE.canvas, 0, 0);
}

const BACKG_PAGE_D = createRendering2D(128, 128); 
const COLOR_PAGE_D = createRendering2D(128, 128);
const TILES_PAGE_D = createRendering2D(128, 128);

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
        
        this.choiceExpected = false;
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
        await this.continueStory(avatar);
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

    async sayWithPortrait(text, character, sentiment, options){
        const characterEvent = findEventByTag(this.data, character);
        let portraitShown = false;
        if(characterEvent){
            const sentimentImageId =  oneField(characterEvent, sentiment, "file")?.data
                                   || oneField(characterEvent, "neutral", "file")?.data
            if(sentimentImageId){
                await this.showImage("portrait", sentimentImageId, 3, 104, 102);
                portraitShown = true;
            }
        }
        await this.say(text, options);
        if(portraitShown){
            await this.hideImage("portrait");
        }
    }

    async continueStory(EVENT){
        const story = this.story;
        const AVATAR = findEventByTag(this.data, "is-player");
        const sayStyle = oneField(EVENT, "say-style", "json")?.data 
                        || oneField(AVATAR, "say-style", "json")?.data 
                        || {};

        while(story.canContinue) {
            // Get ink to generate the next paragraph
            var paragraphText = this.story.Continue().trim();
            var tags = story.currentTags;

            if(paragraphText.length > 0){
                const matchSpawn = paragraphText.trim().match(/SPAWN_AT\(([^),\s]*)([\s]*,[\s]*([^)]*)*)*\)/)
                if( matchSpawn ){
                    const target = matchSpawn[1];
                    const event = matchSpawn[3] || "is-player";
                    await this.spawnAt(target.trim(), event.trim());
                }else if(tags.includes("TITLE")){
                    await this.title(paragraphText);
                }else{
                    
                    const portrait = tags.find(t => t.match(/[a-zA-Z0-9]*-[a-zA-Z0-9]*/))
                    if(portrait){
                        const matchPortrait = portrait.match(/([a-zA-Z0-9]*)-([a-zA-Z0-9]*)/);
                        const character = matchPortrait[1];
                        const sentiment = matchPortrait[2];
                        await this.sayWithPortrait(paragraphText, character, sentiment, sayStyle)
                    }else{
                        await this.say(paragraphText, sayStyle);
                    }
                    
                }
            }
        }

        const choices = this.story.currentChoices;

        const autoChoice = choices.find( (choice) => choice.text.startsWith("auto:"))
        if(autoChoice !== undefined){
            story.ChooseChoiceIndex(autoChoice.index)
            return await this.continueStory(EVENT);
        }

        const dialogChoices = choices.filter( (choice) => {
            if(choice.text.startsWith("auto:")) return false;
            if(choice.text.startsWith("tag:")) return false;
            return true;
        })

        const continueStory = this.continueStory.bind(this)

        if(dialogChoices.length > 0){
            const availableArrows = [
                ["ArrowUp", "↑"],
                ["ArrowDown", "↓"],
                ["ArrowLeft", "←"],
                ["ArrowRight", "→"]
            ];
            this.choiceExpected = true;
            const dialogChoicesTexts = [];
            const playback = this;

            const choiceEvents = new Map();
            
            dialogChoices.forEach(function(choice) {
                const [arrowEvent, glyph] = availableArrows.shift();
                if(arrowEvent){
                    dialogChoicesTexts.push(`${glyph} ${choice.text}`);
                    choiceEvents.set(arrowEvent,  () => {
                        console.log(`Making choice ${choice.index}`)
                        story.ChooseChoiceIndex(choice.index);
                    });
                }
            });
            //always display choices at the bottom
            this.say(dialogChoicesTexts.join("\n"), {
                ...sayStyle, 
                ...{"noMargin": true,
                    "anchorX": 0, "anchorY": 1, lineWidth: 40*6,
                    "lines": dialogChoicesTexts.length,
                    }
                })
            const listenToChoice = (event) =>{
                const choiceAction = choiceEvents.get(event.detail)
                if(choiceAction){
                    choiceAction();
                    playback.proceed();
                    playback.removeEventListener('choice', listenToChoice);
                    playback.choiceExpected = false;
                    continueStory(EVENT);
                }
            }
            console.log(`We have ${choiceEvents.size} events to listen to`)
            this.addEventListener("choice", listenToChoice);
        }else{
            this.choiceExpected = false
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
        const [, background] = palette.colors;
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
        const [, background] = this.getActivePalette().colors;
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
            await this.continueStory(event);
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
            await script.call(defines);
        } catch (e) {
            const long = `> SCRIPT ERROR "${e}"\n---\n${js}\n---`;
            this.log(long);

            const error = `SCRIPT ERROR:\n${e}`;
            this.showError(error);
        }
    }

    makeScriptingDefines(event) {
        const defines = bindScriptingDefines(SCRIPTING_FUNCTIONS);
        addScriptingConstants(defines, this, event);
        return defines;
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
        return this.PLAYBACK.title(dialogue, options);
    },

    TOUCH(event) {
        return this.PLAYBACK.touch(event);
    },

    EVENT_AT(location) {
        return getEventAtLocation(this.PLAYBACK.data, location);
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

    SHOW_IMAGE(id, file, layer, x, y) {
        this.PLAYBACK.showImage(id, file, layer, x, y);
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
                x = Math.max(0, Math.min(15, x + dx));
                y = Math.max(0, Math.min(15, y + dy));
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
        this.PLAYBACK.runJS(event, script);
    },

    ADD_BEHAVIOURS(...scripts) {
        this.PLAYBACK.extra_behaviours.push(...scripts);
    },
    POST(message, origin="*") {
        postMessageParent(message, origin);
    },
    //binksi
    SET_INK_VAR(field, value) {
        this.STORY.variablesState.$(field, value);
    },
    GET_INK_VAR(field) {
        this.STORY.variablesState.$(field);
    },
    DIVERT_TO(knot_name) {
        this.STORY.ChoosePathString(knot_name);
        return this.PLAYBACK.continueStory();
    }
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
    defines.STORY = playback.story;
}
