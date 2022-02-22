const TEMP_TILESET0 = createRendering2D(1, 1);

function makeBlankRoom(id) {
    return {
        id,
        palette: 0,
        tilemap: ZEROES(16).map(() => REPEAT(16, 0)),
        backmap: ZEROES(16).map(() => REPEAT(16, 0)),
        foremap: ZEROES(16).map(() => REPEAT(16, 1)),
        wallmap: ZEROES(16).map(() => REPEAT(16, 0)),
        events: [],
    }
}

function makeBlankPalette(id) {
    return {
        id,
        colors: ["#000000", ...ZEROES(7).map(() => rgbToHex({ r: getRandomInt(0, 256), g: getRandomInt(0, 256), b: getRandomInt(0, 256) }))],
    }
}

function generateGrid(width, height, gap) {
    const rendering = createRendering2D(width, height);

    for (let y = 0; y <= (height / gap); ++y) {
        rendering.fillRect(0, y * gap - 1, width, 2);
    }
    for (let x = 0; x <= (width / gap); ++x) {
        rendering.fillRect(x * gap - 1, 0, 2, height);
    }

    return rendering;
}

const TILE_GRID = generateGrid(160, 160, 20);
const ROOM_GRID = generateGrid(256, 256, 16);

/** 
 * Update the given bipsi project data so that it's valid for this current
 * version of bipsi.
 * @param {BipsiDataProject} project 
 */
function updateProject(project) {
    const locationFields = 
        allEvents(project)
        .flatMap((event) => event.fields)
        .filter((field) => field.type === "location");
    
    const repairLocations = !locationFields.every((location) => getRoomById(project, location.data.room));

    project.rooms.forEach((room) => {
        room.backmap = room.backmap ?? ZEROES(16).map(() => REPEAT(16, 0));
        room.foremap = room.foremap ?? ZEROES(16).map(() => REPEAT(16, 1));
        
        if (room.highmap) {
            for (let y = 0; y < 16; ++y) {
                for (let x = 0; x < 16; ++x) {
                    const high = room.highmap[y][x];

                    if (high > 0) {
                        room.tilemap[y][x] = high;
                        room.foremap[y][x] = 2;           
                    }
                }
            }
            room.highmap = undefined;
        }

        room.id = room.id ?? nextRoomId(project);
    });

    const fixPalettes = project.palettes[0].id === undefined && project.palettes[0].length === 3;

    project.palettes.forEach((palette, i) => {
        if (fixPalettes) {
            project.palettes[i] = { id: i, colors: palette };
            palette = project.palettes[i];

            palette.colors.splice(0, 0, "#000000");
            for (let i = 4; i < 8; ++i) {
                palette.colors.push(rgbToHex({ 
                    r: getRandomInt(0, 256), 
                    g: getRandomInt(0, 256), 
                    b: getRandomInt(0, 256),
                }));
            }
        }
    });

    if (fixPalettes) {
        project.rooms.forEach((room) => {
            for (let y = 0; y < 16; ++y) {
                for (let x = 0; x < 16; ++x) {
                    room.backmap[y][x] += 1;
                    room.foremap[y][x] += 1;
                }
            }
        });
    }

    if (repairLocations) {
        locationFields.forEach((field) => {
            field.data.room = project.rooms[field.data.room]?.id ?? project.rooms[0].id;
        });
    }

    project.rooms.forEach((room) => room.events.forEach((event) => {
        event.id = event.id ?? nextEventId(project);
        event.fields = event.fields ?? [];
        event.fields = event.fields.filter((field) => field !== null);
    }));
}

function generateColorWheel(width, height) {
    const rendering = createRendering2D(width, height);
    withPixels(rendering, (pixels) => {
        const radius = width * .5;

        for (let y = 0; y < height; ++y) {
            for (let x = 0; x < width; ++x) {
                const [dx, dy] = [x - radius, y - radius];
                const h = (Math.atan2(dy, dx) / (Math.PI * 2) + 1) % 1;
                const s = Math.sqrt(dx*dx + dy*dy) / radius;

                const color = s > 1 ? 0 : RGBToUint32(HSVToRGB({ h, s, v: 1 }));
                pixels[y * width + x] = color;
            }
        }
    });
    return rendering;
}

class PaletteEditor {
    /**
     * @param {BipsiEditor} editor 
     */
    constructor(editor) {
        this.editor = editor;

        this.temporary = { h: 0, s: 0, v: 0, hex: "#000000" };
        this.temporary = undefined;

        /** @type {HTMLCanvasElement} */
        this.colorHueSat = ONE("#color-huesat");
        this.colorHueSatRendering = this.colorHueSat.getContext("2d");

        this.colorWheelGraphic = generateColorWheel(
            this.colorHueSat.width,
            this.colorHueSat.height,
        ).canvas;

        const margin = constants.colorwheelMargin;
        //this.colorHueSat.style.setProperty("margin", `-${margin}px`);
        this.colorHueSat.width += margin * 2;
        this.colorHueSat.height += margin * 2;

        this.colorIndex = ui.radio("color-index");
        this.colorValue = ui.slider("color-value");
        this.colorHex = ui.text("color-hex");

        this.colorIndex.selectedIndex = 1;

        this.colorIndex.addEventListener("change", () => {
            this.updateTemporaryFromData();
            this.refreshDisplay();
        });

        this.colorValue.addEventListener("input", () => {
            const { color } = this.getSelections();

            color.v = this.colorValue.valueAsNumber;
            this.updateTemporaryFromHSV();
            this.refreshDisplay();
        });

        this.colorValue.addEventListener("change", () => {
            this.commitSelectedColorFromTemporary();
        });

        this.colorHex.addEventListener("change", () => {
            this.temporary.hex = this.colorHex.value;
            this.updateTemporaryFromHex();
            this.commitSelectedColorFromTemporary();
        });

        this.colorHex.addEventListener("paste", () => {
            setTimeout(() => {
                this.temporary.hex = this.colorHex.value;
                this.updateTemporaryFromHex();
                this.refreshDisplay();
            }, 0);
        });

        this.colorHueSat.addEventListener("pointerdown", (event) => {
            const drag = ui.drag(event);

            /** @param {PointerEvent} event */
            const update = (event) => {
                const { x, y } = mouseEventToCanvasPixelCoords(this.colorHueSat, event);
                
                const center = this.colorHueSat.width / 2;
                const [dx, dy] = [x - center, y - center];
                this.temporary.h = (Math.atan2(dy, dx) / (Math.PI * 2) + 1) % 1;
                this.temporary.s = Math.min(Math.sqrt(dx*dx + dy*dy) / (center-margin), 1);
                this.updateTemporaryFromHSV();
                this.refreshDisplay();
            };

            update(event);

            drag.addEventListener("move", (event) => {
                update(event.detail);
            });
            drag.addEventListener("up", (event) => {
                update(event.detail);
                this.commitSelectedColorFromTemporary();
            });
        });
    }

    async init() {
    }

    /**
     * @param {BipsiDataProject} data 
     * @returns 
     */
    getSelections(data = undefined) {
        data = data ?? this.editor.stateManager.present;
        const colorIndex = this.colorIndex.value;
        const { paletteIndex } = this.editor.getSelections();
        const palette = data.palettes[paletteIndex];
        const dataHex = palette.colors[colorIndex];

        return { data, palette, colorIndex, color: this.temporary, dataHex };
    }

    /**
     * @returns {BipsiDataPalette}
     */
    getPreviewPalette() {
        const { color, palette, colorIndex } = this.getSelections();
        const previewPalette = { ...palette, colors: [ ...palette.colors ] };
        previewPalette.colors[colorIndex] = color.hex;
        return previewPalette;
    }

    refreshDisplay() {
        if (this.temporary === undefined) this.updateTemporaryFromData();

        const { data, color, palette } = this.getSelections();

        // recolor the color select buttons to the corresponding color
        ALL("#color-index-select label").forEach((label, i) => {
            label.style.background = palette.colors[i+1];
        });

        // color wheel:
        const margin = constants.colorwheelMargin;
        // 1. clear
        fillRendering2D(this.colorHueSatRendering);
        // 2. base wheel at full value
        this.colorHueSatRendering.globalCompositeOperation = "source-over";
        this.colorHueSatRendering.drawImage(this.colorWheelGraphic, margin, margin);
        // 3. multiply with target value
        this.colorHueSatRendering.globalCompositeOperation = "multiply";
        const valueHex = rgbToHex({ r: color.v * 255, g: color.v * 255, b: color.v * 255 });
        fillRendering2D(this.colorHueSatRendering, valueHex);
        // 4. cut off fill edges with wheel shape
        this.colorHueSatRendering.globalCompositeOperation = "destination-in";
        this.colorHueSatRendering.drawImage(this.colorWheelGraphic, margin, margin);

        const center = this.colorHueSat.width / 2;
        const width = this.colorHueSat.width - margin * 2;
        const angle = color.h * Math.PI * 2;
        const radius = color.s * width * .5;
        this.colorHueSatRendering.globalCompositeOperation = "source-over";
        this.colorHueSatRendering.beginPath();
        this.colorHueSatRendering.arc(
            center + radius * Math.cos(angle), 
            center + radius * Math.sin(angle), 
            8, 0, 2 * Math.PI,
        );
        this.colorHueSatRendering.strokeStyle = "black";
        this.colorHueSatRendering.lineWidth = 3;
        this.colorHueSatRendering.fillStyle = color.hex;
        this.colorHueSatRendering.fill();
        this.colorHueSatRendering.stroke();

        this.colorValue.valueAsNumber = color.v;
        this.colorHex.value = color.hex;
        this.colorIndex.selectedInput.parentElement.style.setProperty("background", color.hex);

        this.editor.requestRedraw();
    }

    updateTemporaryFromData() {
        const { dataHex } = this.getSelections();
        this.temporary = { hex: dataHex };
        this.updateTemporaryFromHex();
    }

    updateTemporaryFromHex() {
        this.temporary = { 
            hex: this.temporary.hex, 
            ...RGBToHSV(hexToRGB(this.temporary.hex)),
        };
    }

    updateTemporaryFromHSV() {
        this.temporary.hex = rgbToHex(HSVToRGB(this.temporary));
    }

    commitSelectedColorFromTemporary() {
        this.editor.stateManager.makeChange(async (data) => {
            const { palette, colorIndex, color } = this.getSelections(data);
            palette.colors[colorIndex] = color.hex;
        });

        this.refreshDisplay();
    }
}

const FIELD_DEFAULTS = {
    tag: true,
    tile: 0,
    colors: { fg: 3, bg: 1 },
    dialogue: "",
    location: { room: 0, position: [0, 0] },
    javascript: "",
    json: "",
    text: "",
};

class EventFieldEditor extends EventTarget {
    /**
     * @param {EventEditor} eventEditor 
     * @param {HTMLElement} fieldElement
     */
    constructor(eventEditor, fieldElement) {
        super();

        this.eventEditor = eventEditor;
        this.fieldElement = fieldElement;

        this.nameInput = ONE('input[name="field-name"]', fieldElement);
        this.typeSelect = ONE('select[name="field-type"]', fieldElement);

        this.nameInput.onchange = () => this.changed();
        this.typeSelect.onchange = () => this.changed();
    }

    changed() {
        this.dispatchEvent(new CustomEvent("change"));
    }

    setActive(value) {
        this.fieldElement.classList.toggle("active", value);
    }

    getData() {
        return { 
            key: this.nameInput.value,
            type: this.typeSelect.value 
        };
    }

    pushData(field) {
        this.nameInput.value = field.key;
        this.typeSelect.value = field.type;
    }

    pullData(field) {
        const { key, type } = this.getData();
        field.key = key;
        if (field.type !== type) {
            field.data = FIELD_DEFAULTS[type];
        }
        field.type = type;
    }
}

const EVENT_TEMPLATES = {
    empty: [],
    tag: [
        { key: "tagname", type: "tag", data: true},
    ],
    exit: [
        { key: "exit", type: "location", data: { room: 0, position: [0, 0] } },
    ],
    message: [
        { key: "say", type: "dialogue", data: "hello" },
        { key: "one-time", type: "tag", data: true },
    ],
    character: [
        { key: "graphic", type: "tile", data: 0 },
        { key: "colors", type: "colors", data: { bg: 1, fg: 3 } },
        { key: "solid", type: "tag", data: true },
        { key: "say", type: "dialogue", data: "hello" },
    ],
    ending: [
        { key: "ending", type: "dialogue", data: "goodbye"},
    ],
    player: [
        { key: "is-player", type: "tag", data: true },
        { key: "graphic", type: "tile", data: 0 },
        { key: "colors", type: "colors", data: { bg: 1, fg: 3 } },
        { key: "title", type: "dialogue", data: "your game title" },
        { key: "page-color", type: "text", data: "black" },
    ],
    code: [
        { key: "touch", type: "javascript", data: "await DO_STANDARD();" },
    ],
    setup: [
        { key: "is-setup", type: "tag", data: true },
        { key: "add-behavior", type: "javascript", data: 
`let test = FIELD(EVENT, "test-field", "dialogue");
if (test) {
    await SAY(test);
}`}
    ],
    library: [
        { key: "is-library", type: "tag", data: true },
    ],
    plugin: [
        { key: "is-plugin", type: "tag", data: true },
        { key: "plugin-order", type: "json", data: 0 },
        { key: "dummy-plugin", type: "javascript", data: 
`wrap.before(BipsiPlayback.prototype, "start", function() {
this.say(FIELD(CONFIG, "dummy-config"));
});` },
        { key: "dummy-config", type: "text", data: "hello from dummy-plugin" }
    ],
};

function prepareTemplate(element) {
    const clone = element.cloneNode(true);
    clone.removeAttribute("id");
    clone.hidden = false;

    return {
        parent: element.parentElement,
        element: clone,
    }
}

class EventEditor {
    /**
     * @param {BipsiEditor} editor 
     */
    constructor(editor) {
        this.editor = editor;

        const { parent, element } = prepareTemplate(ONE("#event-field-template"));
        this.fieldContainer = parent;
        this.fieldTemplate = element; 

        this.fieldEditors = [];

        this.selectedIndex = 0;

        ui.action("field-file-select", async () => {
            const [file] = await maker.pickFiles();
            if (file) {
                await this.editor.stateManager.makeChange(async (data) => {
                    const { field } = this.getSelections(data);
                    field.data = this.editor.stateManager.resources.add(file, "file-datauri");
                });
            }
        });
        this.fileInfo = ONE("#field-file-info");

        const createUniqueEvent = (tag, template) => {
            const event = allEvents(this.editor.stateManager.present).find((event) => eventIsTagged(event, tag));
            this.editor.createEvent(event?.fields ?? template);
            
            if (event) {
                this.editor.stateManager.makeChange(async (data) => {
                    const room = roomFromEvent(data, event);
                    arrayDiscard(room.events, event);
                });
            }
        }

        ui.action("create-event-empty", () => this.editor.createEvent(EVENT_TEMPLATES.empty));
        ui.action("create-event-tag", () => this.editor.createEvent(EVENT_TEMPLATES.tag));
        ui.action("create-event-code", () => this.editor.createEvent(EVENT_TEMPLATES.code));
        ui.action("create-event-exit", () => this.editor.createEvent(EVENT_TEMPLATES.exit));
        ui.action("create-event-message", () => this.editor.createEvent(EVENT_TEMPLATES.message));
        ui.action("create-event-character", () => this.editor.createEvent(EVENT_TEMPLATES.character));
        ui.action("create-event-ending", () => this.editor.createEvent(EVENT_TEMPLATES.ending));
        ui.action("create-event-player", () => createUniqueEvent("is-player", EVENT_TEMPLATES.player));
        ui.action("create-event-setup", () => createUniqueEvent("is-setup", EVENT_TEMPLATES.setup));
        ui.action("create-event-library", () => createUniqueEvent("is-library", EVENT_TEMPLATES.library));
        ui.action("create-event-plugin", () => this.editor.createEvent(EVENT_TEMPLATES.plugin));
        
        ui.action("create-event-plugin-file", async () => {
            const [file] = await maker.pickFiles("application/javascript");
            if (!file) return;

            const js = await maker.textFromFile(file);
            const fields = [
                { key: "is-plugin", type: "tag", data: true },
                { key: "plugin-order", type: "json", data: 0 },
                { key: "plugin", type: "javascript", data: js },
                ...fieldsFromPluginCode(js),
            ];

            this.editor.createEvent(fields);
        });

        function parseOrNull(json) {
            try {
                return JSON.parse(json);
            } catch {
                return null;
            }
        }

        function fieldsFromPluginCode(code) {
            const regex = /\/\/!CONFIG\s+([\w-]+)\s+\(([\w-]+)\)\s*(.*)/g;
            const fields = Array.from(code.matchAll(regex)).map(([, key, type, json]) => ({ key, type, data: parseOrNull(json)}));
            return fields;
        }

        this.actions = {
            add: ui.action("add-event-field", () => this.addField()),
            duplicate: ui.action("duplicate-event-field", () => this.duplicateField()),
            shiftUp: ui.action("shift-up-event-field", () => this.shiftField(-1)),
            shiftDown: ui.action("shift-down-event-field", () => this.shiftField(1)),
            delete: ui.action("remove-event-field", () => this.removeField()),
        }

        ui.action("upload-field-javascript", async () => {
            const [file] = await maker.pickFiles("text/*");
            const text = await file.text();
            this.valueEditors.javascript.value = text;
            const event = new Event('change');
            this.valueEditors.javascript.dispatchEvent(event);
        });

        this.eventEmptyElement = ONE("#event-empty");
        this.eventPropertiesElement = ONE("#event-properties");
        this.valueEditors = {
            json: ONE("#field-json-editor textarea"),
            dialogue: ONE("#field-dialogue-editor textarea"),
            javascript: ONE("#field-javascript-editor textarea"),

            fgIndex: ui.radio("field-foreground-index"),
            bgIndex: ui.radio("field-background-index"),
        };

        this.positionSelect = ONE("#field-position-select");
        this.positionSelectRendering = this.positionSelect.getContext("2d");

        this.dialoguePreviewToggle = ui.toggle("show-dialogue-preview");
        this.dialoguePreviewToggle.addEventListener("change", () => {
            this.resetDialoguePreview();
        });

        this.valueEditors.json.addEventListener("change", () => {
            this.editor.stateManager.makeChange(async (data) => {
                const { field } = this.getSelections(data);

                if (field.type === "json") {
                    field.data = JSON.parse(this.valueEditors.json.value);
                } else {
                    field.data = this.valueEditors.json.value;
                }
            });
        });

        

        this.valueEditors.javascript.addEventListener("change", () => {
            this.editor.stateManager.makeChange(async (data) => {
                const { field, event } = this.getSelections(data);
                field.data = this.valueEditors.javascript.value;
            });
        });

        this.valueEditors.dialogue.addEventListener("change", () => {
            this.editor.stateManager.makeChange(async (data) => {
                const { field } = this.getSelections(data);
                field.data = this.valueEditors.dialogue.value;
            });
        });

        this.valueEditors.dialogue.addEventListener("input", () => {
            this.resetDialoguePreview();
            this.editor.dialoguePreviewPlayer.skip();
        });

        this.editor.eventTileBrowser.select.addEventListener("change", () => {
            this.editor.stateManager.makeChange(async (data) => {
                const { field } = this.getSelections(data);
                field.data = data.tiles[this.editor.eventTileBrowser.selectedTileIndex].id;
            });
        });

        this.editor.fieldRoomSelect.select.addEventListener("change", () => {
            const id = this.editor.fieldRoomSelect.select.valueAsNumber;
            const index = this.editor.stateManager.present.rooms.findIndex((room) => room.id === id);

            const { field } = this.getSelections();
            const position = field.data.room === id ? field.data.position : undefined;

            this.refreshPositionSelect(index, position);
        });

        this.positionSelect.addEventListener("click", (event) => {
            const { x, y } = mouseEventToCanvasPixelCoords(this.positionSelect, event);
            const tx = Math.floor(x / 8);
            const ty = Math.floor(y / 8);
            this.editor.stateManager.makeChange(async (data) => {
                const { field } = this.getSelections(data);
                field.data.room = this.editor.fieldRoomSelect.select.valueAsNumber;
                field.data.position = [tx, ty];
            });
        });

        this.valueEditors.bgIndex.addEventListener("change", (event) => {
            this.editor.stateManager.makeChange(async (data) => {
                const { field } = this.getSelections(data);
                field.data.bg = this.valueEditors.bgIndex.selectedIndex;
            });
        });
        this.valueEditors.fgIndex.addEventListener("change", (event) => {
            this.editor.stateManager.makeChange(async (data) => {
                const { field } = this.getSelections(data);
                field.data.fg = this.valueEditors.fgIndex.selectedIndex;
            });
        });
    }

    get showDialoguePreview() {
        const { field } = this.getSelections();

        return this.editor.modeSelect.value === "draw-room"
            && this.editor.roomPaintTool.value === "events"
            && field?.type === "dialogue"
            && this.dialoguePreviewToggle.checked;
    }

    resetDialoguePreview() {
        const { field, event } = this.getSelections();

        const page = !this.editor.dialoguePreviewPlayer.empty ? this.editor.dialoguePreviewPlayer.pagesSeen : 0;
        const style = event ? oneField(event, "say-style", "json")?.data : undefined;

        this.editor.dialoguePreviewPlayer.clear();
        if (field && field.type === "dialogue") {
            this.editor.dialoguePreviewPlayer.queue(this.valueEditors.dialogue.value, style);
            for (let i = 0; i < page-1; ++i) {
                this.editor.dialoguePreviewPlayer.moveToNextPage();
            }
        }
        this.editor.requestRedraw();
    }

    /**
     * @param {BipsiDataProject} data 
     */
    getSelections(data = undefined) {
        data = data ?? this.editor.stateManager.present;
        const { event } = this.editor.getSelections(data);
        const fieldIndex = this.selectedIndex;
        const field = event?.fields[fieldIndex];

        return { event, field, fieldIndex };
    }

    refresh() {
        const { event, field, fieldIndex } = this.getSelections();
        const data = this.editor.stateManager.present;

        if (event) {
            this.updateFieldCount(event.fields.length);
            this.fieldEditors.forEach((editor, index) => {
                editor.setActive(index === fieldIndex);
                editor.pushData(event.fields[index]);
            });
            this.eventEmptyElement.hidden = true;
            this.eventPropertiesElement.hidden = false;

            ONE("#field-json-editor").hidden = true;
            ONE("#field-javascript-editor").hidden = true;
            ONE("#field-dialogue-editor").hidden = true;
            ONE("#field-tile-editor").hidden = true;
            ONE("#field-location-editor").hidden = true;
            ONE("#field-file-editor").hidden = true;
            ONE("#field-colors-editor").hidden = true;

            if (field) {
                if (field.type === "tag") {
                } else if (field.type === "file") {
                    ONE("#field-file-editor").hidden = false;

                    if (field.data) {
                        const file = this.editor.stateManager.resources.get(field.data);
                        this.fileInfo.value = `${file.name} (${file.type})`;
                    } else {
                        this.fileInfo.value = "[ NO FILE ]";
                    }
                } else if (field.type === "dialogue") {
                    this.valueEditors.dialogue.value = field.data;
                    ONE("#field-dialogue-editor").hidden = false;
                } else if (field.type === "tile") {
                    ONE("#field-tile-editor").hidden = false;
                    const index = this.editor.stateManager.present.tiles.findIndex((tile) => tile.id === field.data);
                    this.editor.eventTileBrowser.selectedTileIndex = index;
                } else if (field.type === "colors") {
                    ONE("#field-colors-editor").hidden = false;
                    this.valueEditors.bgIndex.selectedIndex = field.data.bg;
                    this.valueEditors.fgIndex.selectedIndex = field.data.fg;
                } else if (field.type === "location") {
                    ONE("#field-location-editor").hidden = false;
                    let index = data.rooms.findIndex((room) => room.id == field.data.room);

                    if (index === -1) {
                        console.log("BAD LOCATION ROOM")
                        return;
                    }

                    this.editor.fieldRoomSelect.select.selectedIndex = index;
                    this.refreshPositionSelect(index, field.data.position);
                } else if (field.type === "json") {
                    this.valueEditors.json.value = JSON.stringify(field.data);
                    ONE("#field-json-editor").hidden = false;
                } else if (field.type === "javascript") {
                    this.valueEditors.javascript.value = field.data;
                    ONE("#field-javascript-editor").hidden = false;
                } else {
                    this.valueEditors.json.value = field.data;
                    ONE("#field-json-editor").hidden = false;
                }
            }
        } else {
            this.updateFieldCount(0);
            this.eventEmptyElement.hidden = false;
            this.eventPropertiesElement.hidden = true;
        }

        this.resetDialoguePreview();
    }

    refreshPositionSelect(index, position = undefined) {
        this.positionSelectRendering.globalCompositeOperation = "source-over";
        this.editor.drawRoom(this.positionSelectRendering, index);

        if (position) {
            const [x, y] = position; 
            this.positionSelectRendering.globalCompositeOperation = "difference"
            this.positionSelectRendering.fillStyle = "white";
            this.positionSelectRendering.fillRect(0, y * 8+2, 128, 4);
            this.positionSelectRendering.fillRect(x * 8+2, 0, 4, 128);
        }
    }

    setSelectedIndex(index) {
        this.selectedIndex = index;
        this.refresh();
    }

    updateFieldCount(count) {
        const missing = count - this.fieldEditors.length;

        if (missing < 0) {
            const excess = this.fieldEditors.splice(missing, -missing);
            excess.forEach((editor) => editor.fieldElement.remove());
        } else if (missing > 0) {
            const extras = ZEROES(missing).map((_, i) => {
                const index = this.fieldEditors.length + i;
                const fieldElement = this.fieldTemplate.cloneNode(true);
                const fieldEditor = new EventFieldEditor(this, fieldElement);

                // has to be click so that refresh doesn't overwrite input
                // before change..
                fieldElement.onclick = () => this.setSelectedIndex(index);

                fieldEditor.addEventListener("change", () => {
                    this.editor.stateManager.makeChange(async (data) => {
                        const { field } = this.getSelections(data);
                        fieldEditor.pullData(field);
                        // TODO: convert data on type change..
                    });
                });

                return fieldEditor;
            });

            this.fieldContainer.append(...extras.map((field) => field.fieldElement));
            this.fieldEditors.push(...extras);
        }

        this.selectedIndex = Math.min(this.selectedIndex, count - 1);

        if (this.selectedIndex === -1) {
            this.selectedIndex = 0;
        }
    }

    async addField() {
        this.editor.stateManager.makeChange(async (data) => {
            const { event } = this.getSelections(data);
            event.fields.push({ key: "new field", type: "text", data: "" });
            this.setSelectedIndex(event.fields.length - 1);
        });
    }

    async duplicateField() {
        this.editor.stateManager.makeChange(async (data) => {
            const { event, fieldIndex } = this.getSelections(data);
            const copy = COPY(event.fields[fieldIndex]);
            event.fields.splice(fieldIndex, 0, copy);
            this.setSelectedIndex(fieldIndex+1);
        });
    }

    async shiftField(di) {
        this.editor.stateManager.makeChange(async (data) => {
            const { event, fieldIndex } = this.getSelections(data);
            const prev = fieldIndex;
            const next = Math.max(0, Math.min(fieldIndex + di, event.fields.length));
            
            if (event.fields[prev] === undefined || event.fields[next] === undefined) {
                return;
            }

            const temp = event.fields[prev];
            event.fields[prev] = event.fields[next];
            event.fields[next] = temp;

            this.setSelectedIndex(next);
        });
    }

    async removeField() {
        this.editor.stateManager.makeChange(async (data) => {
            const { event, fieldIndex } = this.getSelections(data);
            event.fields.splice(fieldIndex, 1);
        });
    }
}

class TileEditor {
    /**
     * @param {BipsiEditor} editor 
     */
    constructor(editor) {
        this.editor = editor;

        const tile0 = this.editor.renderings.tilePaint0;
        const tile1 = this.editor.renderings.tilePaint1;

        tile0.canvas.addEventListener("pointerdown", (event) => this.startDrag(event, 0));
        tile1.canvas.addEventListener("pointerdown", (event) => this.startDrag(event, 1));

        this.animateToggle = ui.toggle("tile-animated");
        this.animateToggle.addEventListener("change", () => {
            this.editor.toggleTileAnimated();
        });
    }

    async startDrag(event, frameIndex) {
        const rendering = [
            this.editor.renderings.tilePaint0,
            this.editor.renderings.tilePaint1,
        ][frameIndex];

        const { tile } = this.editor.getSelections();
 
        this.editor.stateManager.makeCheckpoint();
        const tileset = await this.editor.forkTileset();

        const index = tile.frames[frameIndex] ?? tile.frames[0];
        const temp = copyTile(tileset, index);

        const redraw = () => {
            drawTile(tileset, index, temp);
            this.editor.requestRedraw();
            //this.editor.redrawFromTileChange();
        };

        const drag = ui.drag(event);
        const positions = trackCanvasStroke(rendering.canvas, drag);

        const round = (position) => {
            return {
                x: Math.floor(position.x / 20),
                y: Math.floor(position.y / 20),
            };
        };

        // "brush" is a single pixel which is either transparent or white,
        // whichever the existing pixel isn't
        const { x, y } = round(positions[0]);
        const brush = temp.getImageData(x, y, 1, 1);
        const value = brush.data[3] === 0 ? 255 : 0;
        brush.data[0] = value;
        brush.data[1] = value;
        brush.data[2] = value;
        brush.data[3] = value;

        const plot = (x, y) => temp.putImageData(brush, x, y);

        plot(x, y);
        redraw();

        drag.addEventListener("move", () => {
            const { x: x0, y: y0 } = round(positions[positions.length - 2]);
            const { x: x1, y: y1 } = round(positions[positions.length - 1]);
            lineplot(x0, y0, x1, y1, plot);
            redraw();
        });

        drag.addEventListener("up", () => {
            const { x, y } = round(positions[positions.length - 1]);
            plot(x, y);
            redraw();
            this.editor.stateManager.changed();
        });
    }

    redraw() {
        const { data, tileset, room, tile, bg, fg } = this.editor.getSelections();
        if (!tile) return;

        this.editor.tileEditor.animateToggle.setCheckedSilent(tile.frames.length > 1);
        this.editor.actions.swapTileFrames.disabled = tile.frames.length === 1;
        this.editor.renderings.tilePaint1.canvas.style.opacity = tile.frames.length === 1 ? "0%" : null;

        const tilesetC = recolorMask(tileset, fg);

        [this.editor.renderings.tilePaint0, this.editor.renderings.tilePaint1].forEach((rendering, i) => {
            fillRendering2D(rendering, bg === "#000000" ? undefined : bg);

            const frameIndex = tile.frames[i] ?? tile.frames[0];
            const { x, y, size } = getTileCoords(tileset.canvas, frameIndex);
            rendering.globalCompositeOperation = fg === "#000000" ? "destination-out" : "source-over"; 
            rendering.drawImage(
                tilesetC.canvas,
                x, y, size, size,
                0, 0, size * 20, size * 20,
            );
            rendering.globalCompositeOperation = "source-over";

            rendering.globalAlpha = .25;
            rendering.drawImage(TILE_GRID.canvas, 0, 0);
            rendering.globalAlpha = 1;
        });
    }
}

class BipsiEditor extends EventTarget {
    /**
     * Setup most of the stuff for the bipsi editor (the rest is in init
     * because constructors can't be async). This includes finding the existing
     * HTML UI so it doesn't really make sense to construct this more than once
     * but a class is easy syntax for wrapping functions and state together 🤷‍♀️
     */
    constructor(font) {
        super();

        // are there changes to warn about losing?
        this.unsavedChanges = false;

        // is there a fully loaded project?
        this.ready = false;

        // to determine which resources are still in use for the project we
        // combine everything the bipsi needs plus anything this editor
        // needs
        const getEditorManifest = (data) => [...getManifest(data), ...this.getManifest()];

        /** @type {maker.StateManager<BipsiDataProject>} */
        this.stateManager = new maker.StateManager(getEditorManifest);

        /** @type {Object.<string, CanvasRenderingContext2D>} */
        this.renderings = {
            tilePaint0: ONE("#tile-paint-0").getContext("2d"),
            tilePaint1: ONE("#tile-paint-1").getContext("2d"),

            tileMapPaint: ONE("#tile-map-paint").getContext("2d"),
            paletteRoom: ONE("#palette-room").getContext("2d"),
        };

        this.tilesetDataURIs = [];

        this.playtestIframe = /** @type {HTMLIFrameElement} */ (ONE("#playtest"));

        function autoCloseToggledWindow(windowElement, toggle, toggleName) {
            window.addEventListener("click", (event) => {
                const ignore = windowElement.hidden
                            || !event.isTrusted
                            || windowElement.contains(event.target)
                            || event.target.name === toggleName
                if (ignore) return;
                toggle.checked = false;
            });
        }

        this.paintBackground = ui.toggle("room-paint-background");
        this.paintForeground = ui.toggle("room-paint-foreground")
        this.paintBackground.checked = true;
        this.paintForeground.checked = true;

        this.frameAdjustWindow = ONE("#frame-adjust-window");
        this.showFrameAdjust = ui.toggle("show-frame-adjust");
        this.showFrameAdjust.addEventListener("change", () => {
            this.frameAdjustWindow.hidden = !this.showFrameAdjust.checked;
        });
        autoCloseToggledWindow(this.frameAdjustWindow, this.showFrameAdjust, "show-frame-adjust");

        this.colorSelectWindow = ONE("#color-select-window");
        this.showColorSelect = ui.toggle("show-color-window");
        this.showColorSelect.addEventListener("change", () => {
            this.colorSelectWindow.hidden = !this.showColorSelect.checked;
        });
        autoCloseToggledWindow(this.colorSelectWindow, this.showColorSelect, "show-color-window");
        this.colorSelectPreview = ONE(`[name="show-color-window"] + div canvas`);

        this.logWindow = ONE("#log-window");
        this.showLog = ui.toggle("show-log");
        this.showLog.addEventListener("change", () => {
            this.logWindow.hidden = !this.showLog.checked;
        });
        autoCloseToggledWindow(this.logWindow, this.showLog, "show-log");
        this.logTextElement = ONE("#log-text");

        this.variablesWindow = ONE("#variables-window");
        this.showVariables = ui.toggle("show-variables");
        this.showVariables.addEventListener("change", () => {
            this.variablesWindow.hidden = !this.showVariables.checked;
            refreshVariables();
        });
        autoCloseToggledWindow(this.variablesWindow, this.showVariables, "show-variables");
        this.variablesTextElement = ONE("#variables-text");

        this.fieldRoomSelect = new RoomSelect("field-room-select", ONE("#field-room-select-template"));
        this.roomSelectWindow = new RoomSelect("events-room-select", ONE("#room-select-window-template"));
        this.paletteSelectWindow = new PaletteSelect("palette-select", ONE("#palette-select-window-template"));

        this.colorSelect = new ColorSelect("color-select", ONE("#color-select-template"));

        this.moveToRoomSelect = new RoomSelect("move-to-window-room-select", ONE("#move-to-window-room-template"));
        this.moveToPositionSelect = ONE("#move-to-window-position");
        this.moveToPositionRendering = this.moveToPositionSelect.getContext("2d");
        
        this.moveToWindow = ONE("#move-to-window");
        this.showMoveTo = ui.toggle("show-move-to-debug");
        autoCloseToggledWindow(this.moveToWindow, this.showMoveTo, "show-move-to-debug");

        this.roomListing = undefined;

        this.showMoveTo.addEventListener("change", () => {
            this.moveToWindow.hidden = !this.showMoveTo.checked;
            if (this.showMoveTo.checked) {
                this.playtestIframe.contentWindow.postMessage({ type: "get-room-listing" });
            }
        });

        const refreshMoveToPosition = () => {
            const room = this.roomListing.rooms[this.moveToRoomSelect.select.selectedIndex];
            this.moveToPositionRendering.globalCompositeOperation = "source-over";
            this.moveToPositionRendering.drawImage(room.preview, 0, 0);
            
            if (this.roomListing.current.room === this.moveToRoomSelect.select.valueAsNumber) {
                const [x, y] = this.roomListing.current.position;
                this.moveToPositionRendering.globalCompositeOperation = "difference";
                this.moveToPositionRendering.fillStyle = "white";
                this.moveToPositionRendering.fillRect(0, y * 8+2, 128, 4);
                this.moveToPositionRendering.fillRect(x * 8+2, 0, 4, 128);
            }
        }

        this.moveToRoomSelect.select.addEventListener("change", () => {
            refreshMoveToPosition();
        });

        this.moveToPositionSelect.addEventListener("click", (event) => {
            const { x, y } = mouseEventToCanvasPixelCoords(this.moveToPositionSelect, event);
            const tx = Math.floor(x / 8);
            const ty = Math.floor(y / 8);

            this.playtestIframe.contentWindow.postMessage({ type: "move-to", destination: { room: this.moveToRoomSelect.select.valueAsNumber, position: [tx, ty] } });
            this.showMoveTo.checked = false;
            this.playtestIframe.focus();
        });

        this.roomSelectWindowElement = ONE("#room-select-window");
        this.showRoomSelect = ui.toggle("show-room-window");
        autoCloseToggledWindow(this.roomSelectWindowElement, this.showRoomSelect, "show-room-window");

        this.showRoomSelect.addEventListener("change", () => {
            this.roomSelectWindowElement.hidden = !this.showRoomSelect.checked;
        });

        this.paletteSelectWindowElement = ONE("#palette-select-window");
        this.showPaletteSelect = ui.toggle("show-palette-window");
        autoCloseToggledWindow(this.paletteSelectWindowElement, this.showPaletteSelect, "show-palette-window");

        this.showPaletteSelect.addEventListener("change", () => {
            this.paletteSelectWindowElement.hidden = !this.showPaletteSelect.checked;
        });

        Object.values(this.renderings).forEach((rendering) => rendering.imageSmoothingEnabled = false);

        this.tileBrowser = new TileBrowser(this, "tile-select", ONE("#tile-select-template"));
        this.eventTileBrowser = new EventTileBrowser(this, "field-tile-select", ONE("#field-tile-select-template"));
        // this.roomTileBrowser = new EventTileBrowser(this, "draw-room-tile-select", ONE("#draw-room-tile-template"));

        this.tileEditor = new TileEditor(this);
        this.paletteEditor = new PaletteEditor(this);
        this.eventEditor = new EventEditor(this);

        //this.palettePicker = new PalettePicker();

        this.font = font;
        this.dialoguePreviewPlayer = new DialoguePlayback(256, 256);
        this.dialoguePreviewPlayer.options.font = font;

        this.time = 0;
        let prev;
        const timer = (next) => {
            window.requestAnimationFrame(timer);
            if (!this.ready) return;

            prev = prev ?? Date.now();
            next = next ?? Date.now();
            const dt = Math.max(0, (next - prev) / 1000.);
            prev = next;
            
            this.update(dt);
        }
        timer();

        // find all the ui already defined in the html
        this.tilePaintFrameSelect = ui.radio("tile-paint-frame");
        this.modeSelect = ui.radio("mode-select");
        this.roomPaintTool = ui.radio("room-paint-tool");
        this.roomColorMode = ui.radio("room-color-mode");
        this.roomColorMode.selectedIndex = 0;

        this.fgIndex = ui.radio("foreground-index");
        this.bgIndex = ui.radio("background-index");
        this.fgIndex.selectedIndex = 2;
        this.bgIndex.selectedIndex = 1;

        this.fgIndex.addEventListener("change", () => { this.requestRedraw(); this.redrawTileBrowser(); });
        this.bgIndex.addEventListener("change", () => { this.requestRedraw(); this.redrawTileBrowser(); });

        this.modeSelect.tab(ONE("#info-tab-body"), "info");
        this.modeSelect.tab(ONE("#info-tab-viewport"), "info");
        this.modeSelect.tab(ONE("#draw-room-tab-controls"), "draw-room");

        this.modeSelect.tab(ONE("#tile-map-tab"), "draw-room");

        this.modeSelect.tab(ONE("#play-tab-body"), "playtest");
        this.modeSelect.tab(ONE("#play-tab-view"), "playtest");

        this.roomPaintTool.tab(ONE("#draw-room-events-controls"), "events");
        this.roomPaintTool.tab(ONE("#room-events-toolbar"), "events");
        this.roomPaintTool.tab(ONE("#draw-room-palette-controls"), "color");
        this.roomPaintTool.tab(ONE("#draw-room-color-mode"), "color");
        
        this.roomPaintTool.tab(ONE("#color-select-window-toggle"), "tile");

        this.roomPaintTool.tab(ONE("#draw-room-tile-controls"), "tile", "high", "pick");
        this.roomPaintTool.tab(ONE("#picker-toggle"), "tile", "high", "pick");

        this.roomGrid = ui.toggle("room-grid");
        this.roomGrid.addEventListener("change", () => this.requestRedraw());

        this.tileGrid = ui.toggle("tile-grid");
        this.tileGrid.addEventListener("change", () => this.requestRedraw());

        this.highlight = ui.toggle("highlight");
        this.picker = ui.toggle("tile-picker");

        // initial selections
        this.modeSelect.selectedIndex = 0;
        this.roomPaintTool.selectedIndex = 0; 
        this.tilePaintFrameSelect.selectedIndex = 0;

        this.selectedEventCell = { x: 0, y: 0 };
        this.selectedEventId = undefined;

        this.tilePaintFrameSelect.addEventListener("change", () => {
            const { tile } = this.getSelections();
            if (this.tilePaintFrameSelect.selectedIndex === 1 && tile.frames.length === 1) {
                this.toggleTileAnimated();
            }
        });

        // editor actions controlled by html buttons
        this.actions = {
            // editor toolbar
            undo: ui.action("undo", () => this.stateManager.undo()),
            redo: ui.action("redo", () => this.stateManager.redo()),

            // editor menu
            save: ui.action("save", () => this.save()),
            export_: ui.action("export", () => this.exportProject()),
            exportGamedata: ui.action("export-gamedata", () => this.exportGamedata()),
            import_: ui.action("import_html", () => this.importProject()),
            import_json: ui.action("import_bipsi", () => this.importBundle()),
            import_story: ui.action("import_story", () => this.importStory()),
            exportTileset: ui.action("export-tileset", () => this.exportTileset()),
            reset: ui.action("reset", () => this.resetProject()),
            update: ui.action("update", () => this.updateEditor()),

            restartPlaytest: ui.action("restart-playtest", () => this.playtest()),
            captureGif: ui.action("capture-gif", () => this.playtestIframe.contentWindow.postMessage({ type: "capture-gif" })),

            shiftTileUp: ui.action("shift-tile-up", () =>
                this.processSelectedTile((tile) => cycleRendering2D(tile,  0, -1))),
            shiftTileDown: ui.action("shift-tile-down", () =>
                this.processSelectedTile((tile) => cycleRendering2D(tile,  0,  1))),
            shiftTileLeft: ui.action("shift-tile-left", () =>
                this.processSelectedTile((tile) => cycleRendering2D(tile, -1,  0))),
            shiftTileRight: ui.action("shift-tile-right", () =>
                this.processSelectedTile((tile) => cycleRendering2D(tile,  1,  0))),

            rotateTileClockwise: ui.action("rotate-tile-clockwise", () => 
                this.processSelectedTile((tile) => turnRendering2D(tile, 1))),
            rotateTileAnticlockwise: ui.action("rotate-tile-anticlockwise", () => 
                this.processSelectedTile((tile) => turnRendering2D(tile, -1))),

            flipTile: ui.action("flip-tile",     () => this.processSelectedTile(flipRendering2D)),
            mirrorTile: ui.action("mirror-tile", () => this.processSelectedTile(mirrorRendering2D)),
            invertTile: ui.action("invert-tile", () => this.processSelectedTile(invertMask)),
 
            copyTileFrame: ui.action("copy-tile-frame", () => this.copySelectedTileFrame()),
            pasteTileFrame: ui.action("paste-tile-frame", () => this.pasteSelectedTileFrame()),
            clearTileFrame: ui.action("clear-tile-frame", () => this.clearSelectedTileFrame()),

            newTile: ui.action("add-new-tile", () => this.newTile()),
            duplicateTile: ui.action("duplicate-tile", () => this.duplicateTile()),
            reorderTileBefore: ui.action("reorder-tile-before", () => this.reorderTileBefore()),
            reorderTileAfter: ui.action("reorder-tile-after", () => this.reorderTileAfter()),
            deleteTile: ui.action("delete-tile", () => this.deleteTile()),

            newRoom: ui.action("add-new-room", () => this.newRoom()),
            duplicateRoom: ui.action("duplicate-room", () => this.duplicateRoom()),
            reorderRoomBefore: ui.action("reorder-room-before", () => this.reorderRoomBefore()),
            reorderRoomAfter: ui.action("reorder-room-after", () => this.reorderRoomAfter()),
            deleteRoom: ui.action("delete-room", () => this.deleteRoom()),

            newPalette: ui.action("add-new-palette", () => this.newPalette()),
            duplicatePalette: ui.action("duplicate-palette", () => this.duplicatePalette()),
            reorderPaletteBefore: ui.action("reorder-palette-before", () => this.reorderPaletteBefore()),
            reorderPaletteAfter: ui.action("reorder-palette-after", () => this.reorderPaletteAfter()),
            deletePalette: ui.action("delete-palette", () => this.deletePalette()),

            swapTileFrames: ui.action("swap-tile-frames", () => this.swapSelectedTileFrames()),

            copyEvent: ui.action("copy-event", () => this.copySelectedEvent()),
            pasteEvent: ui.action("paste-event", () => this.pasteSelectedEvent()),
            deleteEvent: ui.action("delete-event", () => this.deleteSelectedEvent()),

            randomiseColor: ui.action("randomise-color", () => this.randomiseSelectedColor()),
        };

        // can't undo/redo/paste yet
        this.actions.undo.disabled = true;
        this.actions.redo.disabled = true;
        this.actions.pasteTileFrame.disabled = true;
        this.actions.pasteEvent.disabled = true;
        this.actions.save.disabled = !storage.available;

        /**
         * @param {HTMLElement} element 
         */
        function isElementTextInput(element) {
            const tag = element.tagName.toLowerCase();
            return tag === "textarea" || (tag === "input" && element.type === "text");
        }

        // hotkeys
        document.addEventListener("keydown", (event) => {
            if (event.repeat) return;
            
            const textedit = isElementTextInput(event.target);

            if (event.ctrlKey) {
                if (event.key === "z" && !textedit) this.actions.undo.invoke();
                if (event.key === "y" && !textedit) this.actions.redo.invoke();
                if (event.key === "s") {
                    // make sure current text editing changes are registered
                    // before saving
                    if (textedit) {
                        event.target.dispatchEvent(new Event("change"));
                    }

                    event.preventDefault();
                    this.actions.save.invoke();
                }
            } else if (!textedit) {
                const topkeys = ["KeyQ", "KeyW", "KeyE", "KeyR", "KeyT"]; 
                topkeys.forEach((code, i) => {
                    if (event.code === code) {
                        this.roomPaintTool.selectedIndex = i;
                        event.preventDefault();
                    }
                });
            }

            // if (event.altKey && this.heldColorPick === undefined) {
            //     this.heldColorPick = this.roomPaintTool.selectedIndex;
            //     this.roomPaintTool.selectedIndex = 1;
            //     event.preventDefault();
            // }
            if (event.altKey && this.modeSelect.value === "draw-room" && this.roomPaintTool.value === "tile") {
                this.picker.checked = true;
                event.preventDefault();
            }
        });

        // stop temporarily color picking if the alt key is released
        document.addEventListener("keyup", (event) => {
            // if (!event.altKey && this.heldColorPick !== undefined) {
            //     this.roomPaintTool.selectedIndex = this.heldColorPick;
            //     this.heldColorPick = undefined;
            //     event.preventDefault();
            // }

            if (!event.altKey) {
                this.picker.checked = false;
            }
        });

        // changes in mode select bar
        this.modeSelect.addEventListener("change", async () => {
            this.redrawTileBrowser();

            if (this.modeSelect.value === "playtest") {
                this.playtest();
            } else {
                this.playtestIframe.src = "";
            }
        });

        this.roomSelectWindow.select.addEventListener("change", () => {
            const { data, room } = this.getSelections();
            this.paletteSelectWindow.select.selectedIndex = data.palettes.indexOf(getPaletteById(data, room.palette));
            
            this.selectedEventId = undefined;
            this.requestRedraw();
            this.eventEditor.refresh();
        });

        this.paletteSelectWindow.select.addEventListener("change", () => {
            this.stateManager.makeChange(async (data) => {
                const { room, palette } = this.getSelections(data);
                room.palette = palette.id;
            });

            this.requestRedraw();
            this.eventEditor.refresh();
        });

        this.colorSelect.select.addEventListener("change", () => {
            const { data } = this.getSelections();
            const [id, color] = this.colorSelect.select.value.split(",").map((i) => parseInt(i, 10));
            const palette = getPaletteById(data, id);
            const index = data.palettes.indexOf(palette);
            this.paletteSelectWindow.select.selectedIndex = index;
            this.paletteEditor.colorIndex.selectedIndex = color-1;

            this.requestRedraw();
            this.eventEditor.refresh();
            this.refreshPaletteSelect();
        });

        this.highlight.addEventListener("change", () => {
            this.requestRedraw();
            this.redrawTileBrowser();
        })
        this.roomPaintTool.addEventListener("change", () => {
            this.requestRedraw();
            this.redrawTileBrowser();

            const cursors = {
                "tile": "crosshair",
                "high": "crosshair",
                "pick": "crosshair",
                "wall": "crosshair",
                "events": "pointer",
                "shift": "move"
            }

            this.renderings.tileMapPaint.canvas.style.cursor = cursors[this.roomPaintTool.value];
        });

        const setSelectedTile = (index) => {
            this.tilePaintFrameSelect.selectedIndex = 0;

            this.tileBrowser.select.setSelectedIndexSilent(index);
            // this.roomTileBrowser.select.setSelectedIndexSilent(index);
            this.tileEditor.redraw();
        }

        const setSelectedColors = (bgIndex, fgIndex) => {
            this.bgIndex.selectedIndex = bgIndex;
            this.fgIndex.selectedIndex = fgIndex;
        }

        this.tileBrowser.select.addEventListener("change", () => {
            if (this.roomPaintTool.selectedIndex > 1) {
                this.roomPaintTool.selectedIndex = 0;
            }

            this.tilePaintFrameSelect.selectedIndex = 0;

            setSelectedTile(this.tileBrowser.select.selectedIndex);
        })

        // this.roomTileBrowser.select.addEventListener("change", () => {
        //     setSelectedTile(this.roomTileBrowser.select.selectedIndex);
        // });

        // whenever the project data is changed
        this.stateManager.addEventListener("change", () => {
            this.unsavedChanges = true;
            this.ready = true;
    
            this.refreshPaletteSelect();
            this.refreshRoomSelect();

            this.paletteEditor.updateTemporaryFromData();
            this.paletteEditor.refreshDisplay();

            // enable/disable undo/redo buttons
            this.actions.undo.disabled = !this.stateManager.canUndo;
            this.actions.redo.disabled = !this.stateManager.canRedo;

            const { data, room } = this.getSelections();
            this.paletteSelectWindow.select.selectedIndex = data.palettes.indexOf(getPaletteById(data, room.palette));

            this.redrawTileBrowser();

            // render room
            this.requestRedraw();
            this.tileBrowser.redraw();
            // this.roomTileBrowser.redraw();

            // events
            this.eventEditor.refresh();
        });

        const onEventsPointer = async (event, canvas) => {
            // hack bc race condition rn
            const drag = ui.drag(event);
            await sleep(1);

            if (this.eventEditor.showDialoguePreview) {
                this.dialoguePreviewPlayer.skip();
                if (this.dialoguePreviewPlayer.empty) this.eventEditor.resetDialoguePreview();
                this.requestRedraw();
                return;
            }

            const { room } = this.getSelections();
            const scale = this.renderings.tileMapPaint.canvas.width / (8 * 16);

            const round = (position) => {
                return {
                    x: Math.floor(position.x / (8 * scale)),
                    y: Math.floor(position.y / (8 * scale)),
                };
            };

            const redraw = () => {
                this.requestRedraw();
            };

            const positions = trackCanvasStroke(canvas, drag);
            let started = false;

            const { x, y } = round(positions[0]);

            if (event.altKey) {
                this.tileBrowser.selectedTileIndex = room.tilemap[y][x];
                return;
            }

            this.selectedEventCell = { x, y };
            redraw();

            const events_ = getEventsAt(room.events, x, y);
            const event_ = events_[events_.length - 1];
            this.selectedEventId = event_?.id;
            
            this.eventEditor.refresh();

            drag.addEventListener("move", (event) => {
                const { x: x0, y: y0 } = round(positions[positions.length - 2]);
                const { x: x1, y: y1 } = round(positions[positions.length - 1]);
                const dx = x1 - x0;
                const dy = y1 - y0;

                const move = (dx !== 0 || dy !== 0);

                if (!started && move) {
                    started = true;
                    this.stateManager.makeCheckpoint();
                }

                const x = Math.max(0, Math.min(x1, 15));
                const y = Math.max(0, Math.min(y1, 15));
                const existing = getEventsAt(room.events, x, y)[0];

                if (event_ && !existing) {
                    event_.position = [x, y];
                    this.selectedEventCell = { x, y };

                    if (move) {
                        this.selectedEventId = getEventsAt(room.events, x, y)[0]?.id;
                        this.stateManager.changed();
                    }
                }
            });
        };

        const onRoomPointer = async (event, canvas, forcePick=false) => {
            if (this.roomPaintTool.value === "events" && !forcePick) {
                onEventsPointer(event, canvas);
                return;
            }

            const { tile, room, data, bgIndex, fgIndex, colorIndex } = this.getSelections();

            const scale = canvas.width / (8 * 16);

            const round = (position) => {
                return {
                    x: Math.floor(position.x / (8 * scale)),
                    y: Math.floor(position.y / (8 * scale)),
                };
            };

            const redraw = () => this.requestRedraw();

            const drag = ui.drag(event);
            const positions = trackCanvasStroke(canvas, drag);

            const { x, y } = round(positions[0]);

            const tool = this.roomPaintTool.value;

            const prevTile = room.tilemap[y][x];

            const same = room.tilemap[y][x] === tile.id 
                      && room.backmap[y][x] === bgIndex
                      && room.foremap[y][x] === fgIndex;

            const nextTile = same ? 0 : tile.id;
            const nextWall = 1 - room.wallmap[y][x];

            if (tool === "pick" || forcePick || this.picker.checked) {
                if (prevTile !== 0) {
                    const index = Math.max(0, data.tiles.findIndex((tile) => tile.id === prevTile));

                    setSelectedTile(index);
                    setSelectedColors(room.backmap[y][x], room.foremap[y][x]);
                }
            } else if (tool === "wall" || tool === "tile" || tool === "high" || tool === "color") {    
                this.stateManager.makeCheckpoint();

                const setIfWithin = (map, x, y, value) => {
                    if (x >= 0 && x < 16 && y >= 0 && y < 16) map[y][x] = value ?? 0;
                } 

                const plots = {
                    tile: (x, y) => { 
                        setIfWithin(room.tilemap, x, y, nextTile); 
                        if (this.paintBackground.checked) setIfWithin(room.backmap, x, y, bgIndex); 
                        if (this.paintForeground.checked) setIfWithin(room.foremap, x, y, fgIndex); 
                    },
                    wall: (x, y) => setIfWithin(room.wallmap, x, y, nextWall),
                    color: (x, y) => setIfWithin(this.roomColorMode.value === "bg" ? room.backmap : room.foremap, x, y, colorIndex+1),
                }

                const plot = plots[tool];
                plot(x, y);
                redraw();

                drag.addEventListener("move", (event) => {
                    const { x: x0, y: y0 } = round(positions[positions.length - 2]);
                    const { x: x1, y: y1 } = round(positions[positions.length - 1]);
                    lineplot(x0, y0, x1, y1, plot);
                    redraw();
                });

                drag.addEventListener("up", (event) => {
                    const { x, y } = round(positions[positions.length - 1]);
                    plot(x, y);
                    redraw();
                    this.stateManager.changed();
                });

                if (tool === "wall") {
                    drag.addEventListener("click", (event) => {
                        if (event.detail.shiftKey) {
                            room.tilemap.forEach((row, y) => {
                                row.forEach((tileIndex, x) => {
                                    if (tileIndex === prevTile) {
                                        room.wallmap[y][x] = nextWall;
                                    }
                                });
                            });
                        }
                        redraw();
                    });
                }
            } else if (tool === "shift") {    
                this.stateManager.makeCheckpoint();

                drag.addEventListener("move", (event) => {
                    const { x: x0, y: y0 } = round(positions[positions.length - 2]);
                    const { x: x1, y: y1 } = round(positions[positions.length - 1]);
                    const dx = x0 - x1;
                    const dy = y0 - y1;
                    cycleMap(room.tilemap, dx, dy);
                    cycleMap(room.wallmap, dx, dy);
                    cycleMap(room.backmap, dx, dy);
                    cycleMap(room.foremap, dx, dy);
                    cycleEvents(room.events, -dx, -dy);
                    redraw();
                });
            } 
        };

        this.renderings.tileMapPaint.canvas.addEventListener("pointerdown", (event) => onRoomPointer(event, this.renderings.tileMapPaint.canvas));

        this.frame = 0;

        this.savedVariables = new Map();
        const refreshVariables = () => {
            if (this.variablesWindow.hidden) return;
            const entries = Array.from(this.savedVariables);
            this.variablesTextElement.innerText = "VARIABLES:\n" + entries.map(([key, value]) => `${key} = ${JSON.stringify(value)}`).join("\n");
        }

        window.addEventListener("message", async (event) => {
            if (event.data?.type === "log") {
                const text = event.data?.data.toString() + "\n";
                this.logTextElement.append(text);
            } else if (event.data?.type === "variables") {
                this.savedVariables = event.data.data;
                refreshVariables();
            } else if (event.data.type === "room-listing") {
                const rooms = [];
                for (let room of event.data.rooms) {
                    const thumb = imageToRendering2D(await loadImage(room.thumb)).canvas;
                    const preview = imageToRendering2D(await loadImage(room.preview)).canvas;
                    rooms.push({ id: room.id, thumb, preview });
                }

                this.roomListing = { rooms, current: event.data.current };
                this.moveToRoomSelect.updateRooms(rooms);
                this.moveToRoomSelect.select.setValueSilent(event.data.current.room);
                refreshMoveToPosition();
            }
        });
    }

    async init() {
        await this.paletteEditor.init();
        await this.dialoguePreviewPlayer.load();

        this.EVENT_TILE = await loadImage(constants.eventTile);
        this.WALL_TILE = await loadImage(constants.wallTile);
        this.PLUGIN_TILE = await loadImage(constants.pluginTile);
    }

    /**
     * @param {BipsiDataProject} data 
     */
    getSelections(data = undefined) {
        data = data || this.stateManager.present;
        
        const tileset = this.stateManager.resources.get(data.tileset);
        const tileSize = constants.tileSize;
        const roomIndex = this.roomSelectWindow.select.selectedIndex;
        const tileIndex = this.tileBrowser.selectedTileIndex;
        const frameIndex = this.tilePaintFrameSelect.selectedIndex;
        const paletteIndex = this.paletteSelectWindow.select.selectedIndex;
        const colorIndex = this.paletteEditor.colorIndex.selectedIndex;

        const tile = data.tiles[tileIndex];
        const room = data.rooms[roomIndex];
        const palette = data.palettes[paletteIndex];

        const bgIndex = this.bgIndex.selectedIndex;
        const fgIndex = this.fgIndex.selectedIndex;
        const bg = palette?.colors[bgIndex];
        const fg = palette?.colors[fgIndex];

        const tileFrame = tile?.frames[frameIndex] ?? tile?.frames[0];

        const event = getEventById(data, this.selectedEventId);

        return { 
            data, 
            tileset, 
            roomIndex, room, 
            paletteIndex, palette, colorIndex,
            tileIndex, tile, frameIndex, tileSize, 
            event, tileFrame,
            fgIndex, bgIndex, fg, bg,
        }
    }

    /**
     * @returns {Promise<CanvasRenderingContext2D>}
     */
    async forkTileset() {
        const tilesetId = this.stateManager.present.tileset;
        // create a new copy of the image resource
        const { id, instance } = await this.stateManager.resources.fork(tilesetId);
        // replace the tileset image with the new copy
        this.stateManager.present.tileset = id;
        // return the instance of the image for editing
        return instance;
    }

    /**
     * @param {CanvasRenderingContext2D} rendering 
     * @param {number} roomIndex 
     */
    drawRoom(rendering, roomIndex, { palette = undefined } = {}) {
        const { data, tileset } = this.getSelections();
        const room = data.rooms[roomIndex];
        palette = palette ?? data.palettes[room.palette];

        // find current animation frame for each tile
        const tileToFrame = makeTileToFrameMap(data.tiles, this.frame);

        drawTilemapLayer(rendering, tileset, tileToFrame, palette, room);
        drawEventLayer(rendering, tileset, tileToFrame, palette, room.events);
    }

    redrawFromTileChange() {
        this.tileEditor.redraw();
    }

    requestRedraw() {
        this.requestedRedraw = true;
    }

    update(dt) {
        if (!this.ready) return;

        // tile animation
        this.time += dt;
        while (this.time >= constants.frameInterval * .001) {
            this.frame = 1 - this.frame;
            this.time -= constants.frameInterval * .001;
            this.requestRedraw();
            this.tileBrowser.setFrame(this.frame);
        }
        
        this.dialoguePreviewPlayer.update(dt);
        this.redrawDialoguePreview();

        if (this.requestedRedraw) {
            this.requestedRedraw = false;
            this.redraw();
        }
    }

    redraw() {
        this.tileEditor.redraw();

        const { data, room, tileSize, roomIndex, tileset, fgIndex, bgIndex } = this.getSelections();
        const palette = this.roomPaintTool.value === "color" 
                      ? this.paletteEditor.getPreviewPalette()  
                      : getPaletteById(data, room.palette);

        const tileToFrame = makeTileToFrameMap(data.tiles, this.frame);

        fillRendering2D(TEMP_128);
        drawTilemapLayer(TEMP_128, tileset, tileToFrame, palette, room);
        fillRendering2D(this.renderings.tileMapPaint);
        this.renderings.tileMapPaint.drawImage(TEMP_128.canvas, 0, 0, 256, 256);
        
        fillRendering2D(TEMP_128);
        drawEventLayer(TEMP_128, tileset, tileToFrame, palette, room.events);
        this.renderings.tileMapPaint.globalAlpha = .75;
        this.renderings.tileMapPaint.drawImage(TEMP_128.canvas, 0, 0, 256, 256);
        this.renderings.tileMapPaint.globalAlpha = 1;

        if (this.roomGrid.checked) {
            const rendering = this.renderings.tileMapPaint;
            rendering.globalAlpha = .25;
            rendering.drawImage(ROOM_GRID.canvas, 0, 0);
            rendering.globalAlpha = 1;
        }

        if (this.roomPaintTool.value === "wall") {
            const rendering = this.renderings.tileMapPaint;
            rendering.globalAlpha = .75;
            room.wallmap.forEach((row, y) => {
                row.forEach((wall, x) => {
                    if (wall > 0) {
                        rendering.drawImage(
                            this.WALL_TILE, 
                            x * tileSize * 2, y * tileSize * 2,
                        );
                    }
                });
            });
            rendering.globalAlpha = 1;
        } 

        this.refreshRoomSelect();
        this.refreshPaletteSelect();

        palette.colors.forEach((color, i) => {
            if (i === 0) return;
            this.fgIndex.inputs[i].style.backgroundColor = color;
            this.bgIndex.inputs[i].style.backgroundColor = color;
  
            this.eventEditor.valueEditors.fgIndex.inputs[i].style.backgroundColor = color;
            this.eventEditor.valueEditors.bgIndex.inputs[i].style.backgroundColor = color;
        });

        this.drawRoom(TEMP_128, roomIndex, { palette });
        this.renderings.paletteRoom.drawImage(TEMP_128.canvas, 0, 0);

        if (!this.eventEditor.showDialoguePreview) {
            this.eventEditor.dialoguePreviewToggle.checked = false;

            fillRendering2D(TEMP_256);
    
            room.events.forEach((event) => {
                const [x, y] = event.position;
                const plugin = IS_TAGGED(event, "is-plugin");

                TEMP_256.drawImage(plugin ? this.PLUGIN_TILE : this.EVENT_TILE, x * tileSize * 2, y * tileSize * 2);
            });

            if (this.selectedEventCell && this.roomPaintTool.value === "events") {
                const { x, y } = this.selectedEventCell;
                TEMP_256.fillStyle = "white";
                TEMP_256.fillRect(0, y * 16 + 6, 256, 4);
                TEMP_256.fillRect(x * 16 + 6, 0, 4, 256);
            }

            if (this.roomPaintTool.value === "events" || this.roomPaintTool.value === "shift") {
                this.renderings.tileMapPaint.globalAlpha = .5;
                this.renderings.tileMapPaint.drawImage(TEMP_256.canvas, 0, 0);
                this.renderings.tileMapPaint.globalAlpha = 1;
            }
        }

        this.actions.copyEvent.disabled = this.selectedEventId === undefined;
        this.actions.deleteEvent.disabled = this.selectedEventId === undefined;

        this.actions.reorderRoomBefore.disabled = this.roomSelectWindow.select.selectedIndex <= 0;
        this.actions.reorderRoomAfter.disabled = this.roomSelectWindow.select.selectedIndex >= this.stateManager.present.rooms.length - 1;

        this.actions.reorderPaletteBefore.disabled = this.paletteSelectWindow.select.selectedIndex <= 0;
        this.actions.reorderPaletteAfter.disabled = this.paletteSelectWindow.select.selectedIndex >= this.stateManager.present.palettes.length - 1;

        const fg = fgIndex === 0 ? "transparent" : palette.colors[fgIndex];
        const bg = bgIndex === 0 ? "transparent" : palette.colors[bgIndex];
        this.colorSelectPreview.style.background = `linear-gradient(135deg, ${fg} 0%, ${fg} 50%, ${bg} 50%, ${bg} 100%)`

        this.redrawDialoguePreview();
    } 

    refreshRoomSelect() {
        const { data } = this.getSelections();

        const thumbs = data.rooms.map((room) => {
            const thumb = createRendering2D(16, 16);
            drawRoomThumbnail(thumb, getPaletteById(data, room.palette), room);
            return { id: room.id, thumb: thumb.canvas };
        });

        this.roomSelectWindow.updateRooms(thumbs);
        this.fieldRoomSelect.updateRooms(thumbs);

        this.roomSelectWindow.select.selectedIndex = Math.max(this.roomSelectWindow.select.selectedIndex, 0);

        const thumb = thumbs[this.roomSelectWindow.select.selectedIndex].thumb;
        const canvases = ALL(`[name="show-room-window"] + canvas`);
        canvases.forEach((canvas) => {
            const rendering = canvas.getContext("2d");
            rendering.imageSmoothingEnabled = false;
            rendering.drawImage(thumb, 0, 0, 16, 16);
        });
    }

    refreshPaletteSelect() {
        const { data, paletteIndex, colorIndex } = this.getSelections();

        const thumbs = data.palettes.map((palette) => {
            const thumb = createRendering2D(4, 2);
            drawPaletteThumbnail(thumb, palette);
            return { id: palette.id, thumb: thumb.canvas };
        });

        this.paletteSelectWindow.updatePalettes(thumbs);
        
        if (paletteIndex >= 0) {
            this.colorSelect.updatePalettes(data.palettes);
            this.colorSelect.select.setSelectedIndexSilent(paletteIndex * 7 + colorIndex);
        }

        this.paletteSelectWindow.select.setSelectedIndexSilent(Math.max(this.paletteSelectWindow.select.selectedIndex, 0));

        const thumb = thumbs[this.paletteSelectWindow.select.selectedIndex].thumb;
        const canvases = ALL(`[name="show-palette-window"] + canvas`);
        canvases.forEach((canvas) => {
            const rendering = canvas.getContext("2d");
            rendering.imageSmoothingEnabled = false;
            rendering.drawImage(thumb, 0, 0, 16, 16);
        });
    }

    redrawDialoguePreview() {
        if (this.eventEditor.showDialoguePreview && !this.dialoguePreviewPlayer.empty) {
            const top = this.selectedEventCell.y >= 8;

            this.dialoguePreviewPlayer.options.anchorY = top ? 0 : 1;
            this.dialoguePreviewPlayer.render();
            this.renderings.tileMapPaint.drawImage(this.dialoguePreviewPlayer.dialogueRendering.canvas, 0, 0);
        }
    }

    async redrawTileBrowser() {
        const { data, room, tileset, bg, fg } = this.getSelections();

        const hi = this.roomPaintTool.value === "events";
        const tilesetC = recolorMask(tileset, fg, TEMP_TILESET0);

        // draw tileset frame
        const cols = 16;
        const rows = Math.ceil(data.tiles.length / cols);
        const width = cols * constants.tileSize;
        const height = rows * constants.tileSize;

        const frame0 = createRendering2D(width, height);
        const frame1 = createRendering2D(width, height);

        function renderTileset(destination, frame) {
            data.tiles.forEach(({ frames }, i) => {
                const index = frames[frame] ?? frames[0];
    
                const tx = i % 16;
                const ty = Math.floor(i / 16);

                const { x, y, size } = getTileCoords(tilesetC.canvas, index);
                destination.drawImage(
                    tilesetC.canvas,
                    x, y, size, size, 
                    tx * size, ty * size, size, size,
                );
            });
        }

        fillRendering2D(frame0);
        fillRendering2D(frame1);

        drawRecolorLayerDynamic(frame0, (back, color, tiles) => {
            fillRendering2D(back, bg === "#000000" ? undefined : bg);
            fillRendering2D(color, fg === "#000000" ? undefined : fg);
            renderTileset(tiles, 0);
        });

        drawRecolorLayerDynamic(frame1, (back, color, tiles) => {
            fillRendering2D(back, bg === "#000000" ? undefined : bg);
            fillRendering2D(color, fg === "#000000" ? undefined : fg);
            renderTileset(tiles, 1);
        });

        // regenerate tileset uris
        const canvases = [frame0.canvas, frame1.canvas];
        const prev = [...this.tilesetDataURIs];
        const blobs = await Promise.all(canvases.map(canvasToBlob));
        const uris = blobs.map(URL.createObjectURL);
        await Promise.all(uris.map(loadImage)).then(() => {
            this.tilesetDataURIs = uris;

            this.tileBrowser.setURIs(uris, canvases);
            this.eventTileBrowser.setURIs(uris, canvases);
            // this.roomTileBrowser.setURIs(uris, canvases);

            prev.map(URL.revokeObjectURL);
        });


        if (this.tileBrowser.select.selectedIndex === -1) {
            this.tileBrowser.select.selectedIndex = 0;
        }
    }

    async copySelectedRoom() {
        const { room } = this.getSelections();
        this.copiedRoom = COPY(room);
        this.actions.pasteRoom.disabled = false;
    }

    async pasteSelectedRoom() {
        return this.stateManager.makeChange(async (data) => {
            const { roomIndex } = this.getSelections(data);
            const copy = COPY(this.copiedRoom);
            copy.id = nextRoomId(data);
            const eventId = nextEventId(data);
            copy.events.forEach((event, i) => event.id = eventId + i);
            data.rooms[roomIndex] = copy;
        });
    }
    
    async clearSelectedRoom() {
        return this.stateManager.makeChange(async (data) => {
            const { roomIndex } = this.getSelections(data);
            data.rooms[roomIndex] = makeBlankRoom();
        });
    }

    /**
     * @param {(CanvasRenderingContext2D) => void} process 
     */
    async processSelectedTile(process) {
        return this.stateManager.makeChange(async (data) => {
            const { tileFrame } = this.getSelections(data);
            const tileset = await this.forkTileset();

            const frame = copyTile(tileset, tileFrame);
            process(frame);
            drawTile(tileset, tileFrame, frame);
        });
    }

    async copySelectedTileFrame() {
        const { tileset, tileFrame } = this.getSelections();
        this.copiedTileFrame = copyTile(tileset, tileFrame);
        this.actions.pasteTileFrame.disabled = false;
    }

    async pasteSelectedTileFrame() {
        return this.stateManager.makeChange(async (data) => {
            const { tileFrame } = this.getSelections(data);
            const tileset = await this.forkTileset();

            drawTile(tileset, tileFrame, this.copiedTileFrame);
        });
    }
    
    async clearSelectedTileFrame() {
        return this.stateManager.makeChange(async (data) => {
            const { tileFrame } = this.getSelections(data);
            const tileset = await this.forkTileset();

            const { x, y, size } = getTileCoords(tileset.canvas, tileFrame);
            tileset.clearRect(x, y, size, size);
        });
    }

    async swapSelectedTileFrames() {
        const { tile } = this.getSelections();
        if (tile.frames.length === 1) return;

        return this.stateManager.makeChange(async (data) => {
            const { tile } = this.getSelections(data);
            [tile.frames[1], tile.frames[0]] = [tile.frames[0], tile.frames[1]];
        });
    }

    async newTile() {
        await this.stateManager.makeChange(async (data) => {
            const { tileIndex, tileset } = this.getSelections(data);
            const id = nextTileId(data);
            const frames = [findFreeFrame(data.tiles)];
            data.tiles.splice(tileIndex+1, 0, { id, frames });
            resizeTileset(tileset, data.tiles);
            
            const { x, y, size } = getTileCoords(tileset.canvas, frames[0]);
            tileset.clearRect(x, y, size, size);
        });
        this.tileBrowser.selectedTileIndex += 1;
    }

    async duplicateTile() {
        await this.stateManager.makeChange(async (data) => {
            const { tileIndex, tile, tileset } = this.getSelections(data);
            const id = nextTileId(data);
            const frames = [];

            data.tiles.splice(tileIndex+1, 0, { id, frames });
            tile.frames.forEach((_, i) => {
                frames.push(findFreeFrame(data.tiles));
                resizeTileset(tileset, data.tiles);
                const frame = copyTile(tileset, tile.frames[i]);
                drawTile(tileset, frames[i], frame);
            });
        });
        this.tileBrowser.selectedTileIndex += 1;
    }

    async toggleTileAnimated() {
        return this.stateManager.makeChange(async (data) => {
            const { tile, tileset } = this.getSelections(data);
            
            if (tile.frames.length === 1) {
                tile.frames.push(findFreeFrame(data.tiles));
                resizeTileset(tileset, data.tiles);
                const frame = copyTile(tileset, tile.frames[0]);
                drawTile(tileset, tile.frames[1], frame);
            } else {
                tile.frames = [tile.frames[0]];
                this.tilePaintFrameSelect.selectedIndex = 0;
            }
        });
    }

    async reorderTileBefore() {
        return this.stateManager.makeChange(async (data) => {
            const { tileIndex } = this.getSelections(data);
            const nextIndex = tileIndex - 1;
            [data.tiles[nextIndex], data.tiles[tileIndex]] = [data.tiles[tileIndex], data.tiles[nextIndex]];
            this.tileBrowser.selectedTileIndex -= 1;
        });
    }

    async reorderTileAfter() {
        return this.stateManager.makeChange(async (data) => {
            const { tileIndex } = this.getSelections(data);
            const nextIndex = tileIndex + 1;
            [data.tiles[nextIndex], data.tiles[tileIndex]] = [data.tiles[tileIndex], data.tiles[nextIndex]];
            this.tileBrowser.selectedTileIndex += 1;
        });
    }

    async deleteTile() {
        return this.stateManager.makeChange(async (data) => {
            const { tile } = this.getSelections(data);
            arrayDiscard(data.tiles, tile);
            data.rooms.forEach((room) => {
                room.tilemap.forEach((row, y) => {
                    row.forEach((id, x) => {
                        if (id === tile.id) row[x] = 0;
                    });
                });
            });
        });
    }

    async newRoom() {
        await this.stateManager.makeChange(async (data) => {
            const { roomIndex } = this.getSelections(data);
            const room = makeBlankRoom(nextRoomId(data));
            data.rooms.splice(roomIndex+1, 0, room);
        });
        this.roomSelectWindow.select.selectedIndex += 1;
    }

    async duplicateRoom() {
        await this.stateManager.makeChange(async (data) => {
            const { roomIndex, room } = this.getSelections(data);
            const copy = COPY(room);
            copy.id = nextRoomId(data);
            data.rooms.splice(roomIndex+1, 0, copy);

            const nextId = nextEventId(data);
            copy.events.forEach((event, i) => event.id = nextId+i);
        });
        this.roomSelectWindow.select.selectedIndex += 1;
    }

    async reorderRoomBefore() {
        return this.stateManager.makeChange(async (data) => {
            const { roomIndex } = this.getSelections(data);
            const nextIndex = roomIndex - 1;
            [data.rooms[nextIndex], data.rooms[roomIndex]] = [data.rooms[roomIndex], data.rooms[nextIndex]];
            this.roomSelectWindow.select.selectedIndex -= 1;
        });
    }

    async reorderRoomAfter() {
        return this.stateManager.makeChange(async (data) => {
            const { roomIndex } = this.getSelections(data);
            const nextIndex = roomIndex + 1;
            [data.rooms[nextIndex], data.rooms[roomIndex]] = [data.rooms[roomIndex], data.rooms[nextIndex]];
            this.roomSelectWindow.select.selectedIndex += 1;
        });
    }

    async deleteRoom() {
        return this.stateManager.makeChange(async (data) => {
            const { room } = this.getSelections(data);
            arrayDiscard(data.rooms, room);
        });
    }

    async newPalette() {
        await this.stateManager.makeChange(async (data) => {
            const { paletteIndex } = this.getSelections(data);
            const palette = makeBlankPalette(nextPaletteId(data));
            data.palettes.splice(paletteIndex+1, 0, palette);
        });
        this.paletteSelectWindow.select.selectedIndex += 1;
    }

    async duplicatePalette() {
        await this.stateManager.makeChange(async (data) => {
            const { paletteIndex, palette } = this.getSelections(data);
            const copy = COPY(palette);
            copy.id = nextPaletteId(data);
            data.palettes.splice(paletteIndex+1, 0, copy);
        });
        this.paletteSelectWindow.select.selectedIndex += 1;
    }

    async reorderPaletteBefore() {
        return this.stateManager.makeChange(async (data) => {
            const { paletteIndex } = this.getSelections(data);
            const nextIndex = paletteIndex - 1;
            [data.palettes[nextIndex], data.palettes[paletteIndex]] = [data.palettes[paletteIndex], data.palettes[nextIndex]];
            this.paletteSelectWindow.select.selectedIndex -= 1;
        });
    }

    async reorderPaletteAfter() {
        return this.stateManager.makeChange(async (data) => {
            const { paletteIndex } = this.getSelections(data);
            const nextIndex = paletteIndex + 1;
            [data.palettes[nextIndex], data.palettes[paletteIndex]] = [data.palettes[paletteIndex], data.palettes[nextIndex]];
            this.paletteSelectWindow.select.selectedIndex += 1;
        });
    }

    async deletePalette() {
        return this.stateManager.makeChange(async (data) => {
            const { palette, paletteIndex } = this.getSelections(data);
            arrayDiscard(data.palettes, palette);
            const next = Math.max(paletteIndex - 1, 0);
            data.rooms.forEach((room) => {
                if (room.palette === palette.id) room.palette = data.palettes[next].id;
            });
        });
    }

    createEvent(fieldsTemplate = undefined) {
        this.stateManager.makeChange(async (data) => {
            const { room } = this.getSelections(data);
            const { x, y } = this.selectedEventCell;
            const event = { 
                id: nextEventId(data),
                position: [x, y],
                fields: COPY(fieldsTemplate ?? []),
            }
            room.events.push(event);
            this.selectedEventId = event.id;
        });
    }

    copySelectedEvent() {
        const { data } = this.getSelections();
        const event = getEventById(data, this.selectedEventId);
        this.copiedEvent = COPY(event);
        this.actions.pasteEvent.disabled = false;
    }

    pasteSelectedEvent() {
        this.stateManager.makeChange(async (data) => {
            const { room } = this.getSelections(data);
            const { x, y } = this.selectedEventCell;
            const event = COPY(this.copiedEvent);
            event.id = nextEventId(data);
            event.position = [x, y];
            room.events.push(event);

            arrayDiscard(room.events, getEventById(data, this.selectedEventId));
            this.selectedEventId = event.id;
        });
    }

    deleteSelectedEvent() {
        this.stateManager.makeChange(async (data) => {
            const { room } = this.getSelections(data);
            const event = getEventById(data, this.selectedEventId);
            arrayDiscard(room.events, event);
            this.selectedEventId = undefined;
        });
    }

    randomiseSelectedColor() {
        this.stateManager.makeChange(async (data) => {
            const { colorIndex, palette } = this.getSelections(data);
            const h = Math.random();
            const s = Math.random();
            const v = Math.random();
            palette.colors[colorIndex+1] = rgbToHex(HSVToRGB({ h, s, v }));
        });
    }

    /**
     * Replace the current bipsi data with the given bundle.
     * @param {maker.ProjectBundle<BipsiDataProject>} bundle
     */
    async loadBundle(bundle) {
        this.ready = false;

        // account for changes between bipsi versions
        updateProject(bundle.project);

        await this.stateManager.loadBundle(bundle);
        this.unsavedChanges = false;

        this.modeSelect.dispatchEvent(new Event("change"));
    }

    async loadStory(story) {
        ONE("#story-embed").innerHTML = JSON.stringify(story);
        await this.playtest()
    }

    /** @returns {string[]} */
    getManifest() {
        return [];
    }

    async playtest() {
        const html = await this.makeExportHTML(true);
        this.playtestIframe.src = URL.createObjectURL(new Blob([html], { type: "text/html" }));
        this.playtestIframe.hidden = false;

        this.logTextElement.replaceChildren("> RESTARTING PLAYTEST\n");
    }

    gatherPluginsJavascript() {
        const { data } = this.getSelections();

        const event = findEventByTag(data, "is-plugins");
        const events = findEventsByTag(data, "is-plugin");
        if (event) events.push(event);

        function getPluginPriority(event) {
            return parseInt((FIELD(event, "plugin-order") ?? "0").toString(), 10);
        }

        events.sort((a, b) => getPluginPriority(a) - getPluginPriority(b));

        const sections = events.map((event) => {
            const configFields = event.fields.filter((field) => field.key !== "plugin");
            const configsJS = `const CONFIG = { fields: ${JSON.stringify(configFields)} };`;
            const pluginsJS = `// PLUGIN CODE"\n${FIELD(event, "plugin", "javascript")}\n`;
            return `(function () {\n// PLUGINS CONFIG\n${configsJS}\n${pluginsJS}\n})();\n`;
        });

        return sections.join("\n");
    }

    async makeExportHTML(debug=false) {
        // make a standalone bundle of the current project state and the 
        // resources it depends upon
        const bundle = await this.stateManager.makeBundle();

        // make a copy of this web page
        const clone = /** @type {HTMLElement} */ (document.documentElement.cloneNode(true));
        // remove some unwanted elements from the page copy
        ALL("[data-empty]", clone).forEach((element) => element.replaceChildren());
        ALL("[data-editor-only]", clone).forEach((element) => element.remove());
        // insert the project bundle data into the page copy 
        ONE("#bundle-embed", clone).innerHTML = JSON.stringify(bundle);

        ONE("#player", clone).hidden = false;

        // insert plugins
        ONE("#plugins", clone).innerHTML = this.gatherPluginsJavascript();

        // track how many remixes this is (remixes have soft-limits to encourage finding updates)
        const generation = parseInt(clone.getAttribute("data-remix-generation"));
        clone.setAttribute("data-remix-generation", `${generation + 1}`);

        // default to player mode
        clone.setAttribute("data-app-mode", "player");

        if (debug) {
            clone.setAttribute("data-debug", "true");
        }

        return clone.outerHTML;
    }
        
    async exportProject() {
        // prompt the browser to download the page
        const name = "binksi.html";
        const blob = maker.textToBlob(await this.makeExportHTML(), "text/html");
        maker.saveAs(blob, name);
    }

    async exportGamedata() {
        const bundle = await this.stateManager.makeBundle();
        const name = "bipsi.json";
        const formatted = perfectJson(bundle,{singleLine: ({ key, path, depth }) => {
            if (key == "position") return true;
            if (key == "frames") return true;
            if (depth >= 5){
               return ["tilemap", "highmap", "backmap", "foremap", "wallmap"].includes(path[3]);
            }
            if (depth >= 3){
                return ["palettes", "tiles"].includes(path[1]);
            }
            return false;
          }});
        const blob = maker.textToBlob(formatted, "application/json");
        maker.saveAs(blob, name);
    }

    async exportTileset() {
        return new Promise((resolve, reject) => {
            const rendering = this.stateManager.resources.get(this.stateManager.present.tileset);
            const name = "bipsi-tileset.png";
            rendering.canvas.toBlob((blob) => {
                maker.saveAs(blob, name);
                resolve();
            });
        });
    }

    async importProject() {
        // ask the browser to provide a file
        const [file] = await maker.pickFiles("text/html");
        // read the file and turn it into an html page
        const text = await maker.textFromFile(file);
        const html = await maker.htmlFromText(text);
        // extract the bundle from the imported page
        const bundle = maker.bundleFromHTML(html);
        // load the contents of the bundle into the editor
        await this.loadBundle(bundle);

        const story = maker.bundleFromHTML(html, "#story-embed");
        await this.loadStory(story);

    } 

    async importBundle() {
        // ask the browser to provide a file
        const [file] = await maker.pickFiles("application/json");
        // read the file and turn it into an html page
        const json = await maker.textFromFile(file);
        const bundle = JSON.parse(json);
        await this.loadBundle(bundle);
    } 

    async importStory() {
        // ask the browser to provide a file
        const [file] = await maker.pickFiles("application/json");
        // read the file and turn it into an html page
        const json = await maker.textFromFile(file);
        const story = JSON.parse(json.charCodeAt(0) == 123 ? json : json.substring(1))
        await this.loadStory(story);
    } 

    async resetProject() {
        // open the default project in the editor
        await this.loadBundle(maker.bundleFromHTML(document, "#editor-embed"));
    }
    
    /**
     * Open a new tab with the original editor and send the current project to it.
     */
    async updateEditor() {
        // original editor url is stored in the html (may be different for 
        // custom editor mods)
        const liveURL = document.documentElement.getAttribute("data-editor-live");
        
        const bundle = await this.stateManager.makeBundle();
        
        // the original editor will check to see if it was opened by another
        // tab and then send us a message--if we receive it then we send the
        // bundle back 
        window.addEventListener("message", (event) => {
            event.data.port.postMessage({ bundle });
        });
        window.open(liveURL);
    }

    async save() {
        // visual feedback that saving is occuring
        this.actions.save.disabled = true;
        const timer = sleep(250);

        // make bundle and save it
        const bundle = await this.stateManager.makeBundle();
        await storage.save(bundle, "slot0");
        
        // successful save, no unsaved changes
        this.unsavedChanges = false;

        // allow saving again when enough time has passed to see visual feedback
        await timer;
        this.actions.save.disabled = false;
    }
}
