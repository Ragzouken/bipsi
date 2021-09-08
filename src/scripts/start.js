async function startPlayback(font, bundle) {
    const playback = new BipsiPlayback(font);
    await playback.init();
    await playback.loadBundle(bundle);
    playback.start();
}

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
}

async function makePlayback(font, bundle) {
    const playback = new BipsiPlayback(font);
    await playback.init();

    const playCanvas = /** @type {HTMLCanvasElement} */ (ONE("#player-canvas"));
    const playRendering = /** @type {CanvasRenderingContext2D} */ (playCanvas.getContext("2d"));

    // update the canvas size every render just in case..
    playback.addEventListener("render", () => {
        fillRendering2D(playRendering);
        playRendering.drawImage(playback.rendering.canvas, 0, 0);
        fitCanvasToParent(playCanvas);
        document.documentElement.style.setProperty('--vh', `${window.innerHeight / 100}px`);
    });

    // update the canvas size whenever the browser window resizes
    window.addEventListener("resize", () => fitCanvasToParent(playCanvas));
    
    // update the canvas size initially
    fitCanvasToParent(playCanvas);

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
    const threshold = 512 / 16 * 4;
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

        const drag = ui.drag(event);
        let [x0, y0] = [drag.downEvent.clientX, drag.downEvent.clientY];

        playback.proceed();

        drag.addEventListener("move", () => {
            const [x1, y1] = [drag.lastEvent.clientX, drag.lastEvent.clientY];
            const [dx, dy] = [x1 - x0, y1 - y0];

            const dist = Math.max(Math.abs(dx), Math.abs(dy));
            const angle = Math.atan2(dy, dx) + Math.PI * 2;
            const turns = Math.round(angle / (Math.PI * .5)) % 4;
            const nextKey = turnToKey[turns];

            if (dist >= threshold) {
                doMove(nextKey);
                x0 = x1;
                y0 = y1;
            } 
        });
    });

    document.documentElement.setAttribute("data-app-mode", "player");
    await playback.loadBundle(bundle);
    playback.start();

    return playback;
}

async function start() {
    const font = await loadBasicFont(ONE("#font-embed"));

    // determine if there is a project bundle embedded in this page
    const bundle = maker.bundleFromHTML(document);

    if (bundle) {
        await makePlayback(font, bundle);
    } else {
        await startEditor(font);
    }
}
