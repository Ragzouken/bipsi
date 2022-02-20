async function startEditor(font) {
    const editor = new BipsiEditor(font);
    await editor.init();

    // used to show/hide elements in css
    document.documentElement.setAttribute("data-app-mode", "editor");

    // no embedded project, start editor with save or editor embed
    const save = await storage.load("slot0").catch(() => undefined);
    const bundle = save || maker.bundleFromHTML(document, "#editor-embed");
    
    // load bundle and enter editor mode
    await editor.loadBundle(bundle);

    // unsaved changes warning
    window.addEventListener("beforeunload", (event) => {
        if (!editor.unsavedChanges) return;
        event.preventDefault();
        return event.returnValue = "Are you sure you want to exit?";
    });

    return editor;
}

async function makePlayback(font, bundle, story) {
    const playback = new BipsiPlayback(font);
    await playback.initWithStory(story);

    const playCanvas = /** @type {HTMLCanvasElement} */ (ONE("#player-canvas"));
    const playRendering = /** @type {CanvasRenderingContext2D} */ (playCanvas.getContext("2d"));

    // update the canvas size every render just in case..
    playback.addEventListener("render", () => {
        fillRendering2D(playRendering);
        playRendering.drawImage(playback.rendering.canvas, 0, 0);
        
        scaleElementToParent(playCanvas.parentElement);

        document.documentElement.style.setProperty('--vh', `${window.innerHeight / 100}px`);
    });

    // update the canvas size whenever the browser window resizes
    window.addEventListener("resize", () => scaleElementToParent(playCanvas.parentElement));
    
    // update the canvas size initially
    scaleElementToParent(playCanvas.parentElement);

    let moveCooldown = 0;
    const heldKeys = new Set();
    const keys = new Map();
    keys.set("ArrowLeft",  () => playback.move(-1,  0));
    keys.set("ArrowRight", () => playback.move( 1,  0));
    keys.set("ArrowUp",    () => playback.move( 0, -1));
    keys.set("ArrowDown",  () => playback.move( 0,  1));

    const keyToCode = new Map();
    keyToCode.set("ArrowUp", "KeyW");
    keyToCode.set("ArrowLeft", "KeyA");
    keyToCode.set("ArrowDown", "KeyS");
    keyToCode.set("ArrowRight", "KeyD");

    function doMove(key) {
        const move = keys.get(key);
        if (move) {
            move();
            moveCooldown = .2;
        }
    }

    function doChoice(key){
        const choiceEvent = new CustomEvent('choice', { detail: key});
        playback.dispatchEvent(choiceEvent);
    }

    let prev;
    const timer = (next) => {
        prev = prev ?? Date.now();
        next = next ?? Date.now();
        const dt = Math.max(0, (next - prev) / 1000.);
        moveCooldown = Math.max(moveCooldown - dt, 0);
        prev = next;
        window.requestAnimationFrame(timer);

        if (moveCooldown === 0) {
            const key = Array.from(keys.keys()).find((key) => heldKeys.has(key) || heldKeys.has(keyToCode.get(key)));
            if (key) doMove(key);
        }

        playback.update(dt);
    }
    timer();

    function down(key, code) {
        if (!playback.dialoguePlayback.empty) {
            if(playback.choiceExpected){
                return doChoice(key);
            };
            playback.proceed();
        } else {
            heldKeys.add(key);
            heldKeys.add(code);
            doMove(key);
        }
    }

    function up(key, code) {
        heldKeys.delete(key);
        heldKeys.delete(code);
    }

    const turnToKey = ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"];
    let ignoreMouse = false;

    window.onblur = () => setTimeout(() => ignoreMouse = true, 0);
    window.onfocus = () => setTimeout(() => ignoreMouse = false, 0);

    document.addEventListener("keydown", (event) => {
        if (!event.repeat) down(event.key, event.code);
        if (event.key !== "Tab") {
            event.stopPropagation();
            event.preventDefault();
        }
    }, { capture: true });
    document.addEventListener("keyup", (event) => up(event.key, event.code));

    document.addEventListener("pointerdown", (event) => {
        if (ignoreMouse) return;

        const threshold = playCanvas.getBoundingClientRect().width / 16 * 2;

        const drag = ui.drag(event);
        let [x0, y0] = [drag.downEvent.clientX, drag.downEvent.clientY];

        if(!playback.choiceExpected){
            playback.proceed();
        };
        

        drag.addEventListener("move", () => {
            const [x1, y1] = [drag.lastEvent.clientX, drag.lastEvent.clientY];
            const [dx, dy] = [x1 - x0, y1 - y0];

            const dist = Math.max(Math.abs(dx), Math.abs(dy));
            const angle = Math.atan2(dy, dx) + Math.PI * 2;
            const turns = Math.round(angle / (Math.PI * .5)) % 4;
            const nextKey = turnToKey[turns];

            if (dist >= threshold) {
                if(playback.choiceExpected){
                    return doChoice(nextKey);
                }else{
                    doMove(nextKey);
                    x0 = x1;
                    y0 = y1;
                }
                
            } 
        });
    });

    function captureGif() {
        const frames = recordFrames(playback);
        const giffer = window.open(
            "https://kool.tools/tools/gif/",
            "gif maker",
            "left=10,top=10,width=512,height=512,resizable=no,location=no",
        );
        sleep(500).then(() => giffer.postMessage({ name: "bipsi", frames }, "https://kool.tools"));
    }

    function getRoomListing() {
        const current = getLocationOfEvent(playback.data, getEventById(playback.data, playback.avatarId));
        const rooms = [];
        const thumb = createRendering2D(16, 16);
        const preview = createRendering2D(128, 128);
        playback.data.rooms.forEach((room) => {
            drawRoomPreviewPlayback(preview, playback, room.id);
            drawRoomThumbPlayback(thumb, playback, room.id);
            rooms.push({ id: room.id, thumb: thumb.canvas.toDataURL(), preview: preview.canvas.toDataURL() });
        });
        postMessageParent({ type: "room-listing", rooms, current }, "*");
    }

    /** @type {Map<string, (any) => void>} */
    const debugHandlers = new Map();

    debugHandlers.set("move-to", (message) => moveEventById(playback.data, playback.avatarId, message.destination));
    debugHandlers.set("key-down", (message) => down(message.key, message.code));
    debugHandlers.set("key-up", (message) => up(message.key, message.code));
    debugHandlers.set("capture-gif", (message) => captureGif());
    debugHandlers.set("get-room-listing", (message) => getRoomListing());

    // only allow these when playtesting from editor
    if (document.documentElement.getAttribute("data-debug")) {
        debugHandlers.set("touch-location", (message) => playback.touch(getEventAtLocation(playback.data, message.location)));

        // if the game runs javascript from variables then this would be a 
        // vector to run arbitrary javascript on the game's origin giving
        // read/write access to storage for that origin and the power to e.g
        // erase all game saves etc
        debugHandlers.set("set-variable", (message) => playback.setVariable(message.key, message.value));
    }

    window.addEventListener("message", (event) => {
        debugHandlers.get(event.data.type)?.call(this, event.data);
    });

    document.documentElement.setAttribute("data-app-mode", "player");
    await playback.loadBundle(bundle);
    playback.start();

    return playback;
}

let PLAYBACK;
let EDITOR;

async function start() {
    const font = await loadBasicFont(ONE("#font-embed"));

    // determine if there is a project bundle embedded in this page
    const bundle = maker.bundleFromHTML(document);

    const storyContent = maker.bundleFromHTML(document, "#story-embed");
    const story = new inkjs.Story(storyContent);

    if (bundle) {
        PLAYBACK = await makePlayback(font, bundle, story);
    } else {
        EDITOR = await startEditor(font);
    }
}
