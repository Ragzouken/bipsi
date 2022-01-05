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
        }

        room.id = room.id ?? nextRoomId(project);
    });

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

/**
 * @param {CanvasRenderingContext2D} rendering 
 * @param {string[]} palette 
 * @param {BipsiDataRoom} room 
 */
 function drawRoomThumbnail(rendering, palette, room) {
    const [background, foreground, highlight] = palette;
    for (let y = 0; y < 16; ++y) {
        for (let x = 0; x < 16; ++x) {
            const color = room.wallmap[y][x] === 1 ? foreground : background;
            rendering.fillStyle = color;
            rendering.fillRect(x, y, 1, 1);
        }
    }

    rendering.fillStyle = highlight;
    room.events.forEach((event) => {
        const [x, y] = event.position;
        rendering.fillRect(x, y, 1, 1);
    });
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
        this.colorHueSat.style.setProperty("margin", `-${margin}px`);
        this.colorHueSat.width += margin * 2;
        this.colorHueSat.height += margin * 2;

        this.colorSelect = ui.radio("color-select");
        this.colorValue = ui.slider("color-value");
        this.colorHex = ui.text("color-hex");

        this.colorSelect.selectedIndex = 0;

        this.colorSelect.addEventListener("change", () => {
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
        const [paletteIndex, colorIndex] = this.colorSelect.value.split(",").map((v) => parseInt(v, 10));
        const palette = this.editor.stateManager.present.palettes[paletteIndex];
        const dataHex = palette[colorIndex];

        return { data, palette, colorIndex, color: this.temporary, dataHex };
    }

    getPreviewPalette() {
        const { color, palette, colorIndex } = this.getSelections();
        const previewPalette = [ ...palette ];
        previewPalette[colorIndex] = color.hex;
        return previewPalette;
    }

    refreshDisplay() {
        if (this.temporary === undefined) this.updateTemporaryFromData();

        const { data, color, palette } = this.getSelections();

        // recolor the color select buttons to the corresponding color
        ALL("#color-select .horizontal-capsule").forEach((capsule, y) => {
            ALL("label", capsule).forEach((label, x) => {
                label.style.background = data.palettes[y][x];
            });
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
        this.colorSelect.selectedInput.style.setProperty("background", color.hex);

        this.editor.redraw();
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
    
            // TODO undoability
            palette[colorIndex] = color.hex;
        });

        this.refreshDisplay();
    }
}

const FIELD_DEFAULTS = {
    tag: true,
    tile: 0,
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
    exit: [
        { key: "exit", type: "location", data: { room: 0, position: [0, 0] } },
    ],
    message: [
        { key: "say", type: "dialogue", data: "hello" },
        { key: "one-time", type: "tag", data: true },
    ],
    character: [
        { key: "graphic", type: "tile", data: 0 },
        { key: "solid", type: "tag", data: true },
        { key: "say", type: "dialogue", data: "hello" },
    ],
    ending: [
        { key: "ending", type: "dialogue", data: "goodbye"},
    ],
    player: [
        { key: "is-player", type: "tag", data: true },
        { key: "graphic", type: "tile", data: 0 },
        { key: "title", type: "dialogue", data: "your game title" },
        { key: "page-color", type: "text", data: "black" },
    ],
    code: [
        { key: "touch", type: "javascript", data: "await DO_STANDARD();" },
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

        ui.action("create-event-empty", () => this.editor.createEvent(EVENT_TEMPLATES.empty));
        ui.action("create-event-code", () => this.editor.createEvent(EVENT_TEMPLATES.code));
        ui.action("create-event-exit", () => this.editor.createEvent(EVENT_TEMPLATES.exit));
        ui.action("create-event-message", () => this.editor.createEvent(EVENT_TEMPLATES.message));
        ui.action("create-event-character", () => this.editor.createEvent(EVENT_TEMPLATES.character));
        ui.action("create-event-ending", () => this.editor.createEvent(EVENT_TEMPLATES.ending));
        ui.action("create-event-player", () => {
            const avatar = allEvents(this.editor.stateManager.present).find((event) => eventIsTagged(event, "is-player"));

            this.editor.createEvent(avatar?.fields ?? EVENT_TEMPLATES.player);
            
            if (avatar) {
                this.editor.stateManager.makeChange(async (data) => {
                    const room = roomFromEvent(data, avatar);
                    arrayDiscard(room.events, avatar);
                });
            }
        });

        this.actions = {
            add: ui.action("add-event-field", () => this.addField()),
            duplicate: ui.action("duplicate-event-field", () => this.duplicateField()),
            shiftUp: ui.action("shift-up-event-field", () => this.shiftField(-1)),
            shiftDown: ui.action("shift-down-event-field", () => this.shiftField(1)),
            delete: ui.action("remove-event-field", () => this.removeField()),
        }

        this.eventEmptyElement = ONE("#event-empty");
        this.eventPropertiesElement = ONE("#event-properties");
        this.valueEditors = {
            json: ONE("#field-json-editor textarea"),
            dialogue: ONE("#field-dialogue-editor textarea"),
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
    }

    get showDialoguePreview() {
        const { field } = this.getSelections();

        return this.editor.modeSelect.value === "events"
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
        this.editor.redraw();
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
            ONE("#field-dialogue-editor").hidden = true;
            ONE("#field-tile-editor").hidden = true;
            ONE("#field-location-editor").hidden = true;
            ONE("#field-file-editor").hidden = true;

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
            this.redraw();
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
        const { data, tileset, room, tile } = this.editor.getSelections();
        if (!tile) return;

        this.editor.tileEditor.animateToggle.setCheckedSilent(tile.frames.length > 1);

        const [bg, fg, hi] = data.palettes[room.palette];

        const color = this.editor.roomPaintTool.selectedIndex === 1 ? hi : fg;
        const tilesetC = recolorMask(tileset, color);

        const grid = this.editor.tileGrid.checked;

        [this.editor.renderings.tilePaint0, this.editor.renderings.tilePaint1].forEach((rendering, i) => {
            fillRendering2D(rendering, bg);
            const frameIndex = tile.frames[i] ?? tile.frames[0];
            const { x, y, size } = getTileCoords(tileset.canvas, frameIndex);
            rendering.drawImage(
                tilesetC.canvas,
                x, y, size, size,
                0, 0, size * 20, size * 20,
            );

            if (grid) {
                rendering.globalAlpha = .25;
                rendering.drawImage(TILE_GRID.canvas, 0, 0);
                rendering.globalAlpha = 1;
            }
        });

        this.editor.renderings.tilePaintA.drawImage(
            [this.editor.renderings.tilePaint0, this.editor.renderings.tilePaint1][this.editor.frame].canvas,
            0, 0, 8, 8,
        );
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
            tilePaintA: ONE("#tile-paint-a").getContext("2d"),

            tileMapPaint: ONE("#tile-map-paint").getContext("2d"),
            tilePaintRoom: ONE("#tile-paint-room").getContext("2d"),
            paletteRoom: ONE("#palette-room").getContext("2d"),
            eventsRoom: ONE("#events-room").getContext("2d"),

            playtest: ONE("#playtest-rendering").getContext("2d"),
        };

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

        this.roomSelect = new RoomSelect("room-select", ONE("#room-select-template"));
        this.fieldRoomSelect = new RoomSelect("field-room-select", ONE("#field-room-select-template"));
        this.eventsRoomSelect = new RoomSelect("events-room-select", ONE("#room-select-window-template"));

        this.roomSelectWindow = ONE("#room-select-window");
        this.showRoomSelect = ui.toggle("show-room-window");
        autoCloseToggledWindow(this.roomSelectWindow, this.showRoomSelect, "show-room-window");

        this.showRoomSelect.addEventListener("change", () => {
            this.roomSelectWindow.hidden = !this.showRoomSelect.checked;
        });

        this.eventsRoomSelect.select.addEventListener("change", () => {
            this.roomSelect.select.selectedIndex = this.eventsRoomSelect.select.selectedIndex;
            //this.eventsRoomSelectToggle.checked = false;
        });

        Object.values(this.renderings).forEach((rendering) => rendering.imageSmoothingEnabled = false);

        this.tileBrowser = new TileBrowser(this, "tile-select", ONE("#tile-select-template"));
        this.eventTileBrowser = new EventTileBrowser(this, "field-tile-select", ONE("#field-tile-select-template"));

        this.tileEditor = new TileEditor(this);
        this.paletteEditor = new PaletteEditor(this);
        this.eventEditor = new EventEditor(this);

        //this.palettePicker = new PalettePicker();

        this.font = font;
        this.dialoguePreviewPlayer = new DialoguePlayback(256, 256);
        this.dialoguePreviewPlayer.options.font = font;

        let prev;
        const timer = (next) => {
            window.requestAnimationFrame(timer);
            if (!this.ready) return;

            prev = prev ?? Date.now();
            next = next ?? Date.now();
            const dt = Math.max(0, (next - prev) / 1000.);
            prev = next;
            this.dialoguePreviewPlayer.update(dt);
            this.redrawDialoguePreview();
        }
        timer();

        // find all the ui already defined in the html
        this.modeSelect = ui.radio("mode-select");
        //this.roomSelect = ui.radio("room-select");
        this.roomPaintTool = ui.radio("room-paint-tool");
        this.roomPaletteSelect = ui.select("room-palette");
        this.tilePaintFrameSelect = ui.radio("tile-paint-frame");

        this.modeSelect.tab(ONE("#event-edit"), "events");
        this.modeSelect.tab(ONE("#room-events-tab"), "events");

        this.modeSelect.tab(ONE("#palette-edit"), "palettes");
        
        this.modeSelect.tab(ONE("#room-select-tab"), "draw-room");
        this.modeSelect.tab(ONE("#tile-select-tab"), "draw-room", "draw-tiles");

        this.modeSelect.tab(ONE("#tile-buttons"), "draw-tiles")
        this.modeSelect.tab(ONE("#tile-paint-tab"), "draw-tiles");
        this.modeSelect.tab(ONE("#tile-map-tab"), "draw-room");
        this.modeSelect.tab(ONE("#palette-tab"), "palettes");

        this.modeSelect.tab(ONE("#play-tab-body"), "playtest");
        this.modeSelect.tab(ONE("#play-tab-view"), "playtest");

        this.roomGrid = ui.toggle("room-grid");
        this.roomGrid.addEventListener("change", () => this.redraw());

        this.tileGrid = ui.toggle("tile-grid");
        this.tileGrid.addEventListener("change", () => this.redraw());

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
            import_: ui.action("import", () => this.importProject()),
            reset: ui.action("reset", () => this.resetProject()),
            update: ui.action("update", () => this.updateEditor()),

            restartPlaytest: ui.action("restart-playtest", () => this.playtest()),

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

            swapTileFrames: ui.action("swap-tile-frames", () => this.swapSelectedTileFrames()),

            copyEvent: ui.action("copy-event", () => this.copySelectedEvent()),
            pasteEvent: ui.action("paste-event", () => this.pasteSelectedEvent()),
            deleteEvent: ui.action("delete-event", () => this.deleteSelectedEvent()),
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
            const textedit = isElementTextInput(event.target);

            if (event.ctrlKey) {
                if (event.key === "z" && !textedit) this.actions.undo.invoke();
                if (event.key === "y" && !textedit) this.actions.redo.invoke();
                if (event.key === "s") {
                    event.preventDefault();
                    this.actions.save.invoke();
                }
            } else if (!textedit) {
                const topkeys = ["KeyQ", "KeyW", "KeyE", "KeyR", "KeyT"]; 
                topkeys.forEach((code, i) => {
                    if (event.code === code) {
                        this.modeSelect.selectedIndex = i;
                        event.preventDefault();
                    }
                });
            }

            if (event.altKey && this.heldColorPick === undefined) {
                this.heldColorPick = this.roomPaintTool.selectedIndex;
                this.roomPaintTool.selectedIndex = 2;
                event.preventDefault();
            }
        });

        // stop temporarily color picking if the alt key is released
        document.addEventListener("keyup", (event) => {
            if (!event.altKey && this.heldColorPick !== undefined) {
                this.roomPaintTool.selectedIndex = this.heldColorPick;
                this.heldColorPick = undefined;
                event.preventDefault();
            }
        });

        // changes in mode select bar
        this.modeSelect.addEventListener("change", async () => {
            this.redrawTileBrowser();

            ONE("#playtest").hidden = true;
            ONE("#playtest").srcdoc = "";
        });

        ONE("#playtest-rendering").addEventListener("click", () => this.actions.restartPlaytest.invoke());

        this.roomSelect.select.addEventListener("change", () => {
            const { room } = this.getSelections();
            this.roomPaletteSelect.selectedIndex = room.palette;
            
            this.selectedEventId = undefined;
            this.redraw();
            this.eventEditor.refresh();
        });

        this.roomPaintTool.addEventListener("change", () => {
            this.redraw();
            this.redrawTileBrowser();
        });

        this.tileBrowser.select.addEventListener("change", () => {
            if (this.roomPaintTool.selectedIndex > 1) {
                this.roomPaintTool.selectedIndex = 0;
            }

            this.tilePaintFrameSelect.selectedIndex = 0;
        })

        this.roomPaletteSelect.addEventListener("change", () => {
            this.stateManager.makeChange(async (data) => {
                const { room } = this.getSelections(data);
                room.palette = this.roomPaletteSelect.selectedIndex;
            });
        });

        // whenever the project data is changed
        this.stateManager.addEventListener("change", () => {
            this.unsavedChanges = true;
            this.ready = true;
    
            this.refreshRoomSelect();

            this.paletteEditor.updateTemporaryFromData();
            this.paletteEditor.refreshDisplay();

            // enable/disable undo/redo buttons
            this.actions.undo.disabled = !this.stateManager.canUndo;
            this.actions.redo.disabled = !this.stateManager.canRedo;

            const { room } = this.getSelections();
            this.roomPaletteSelect.selectedIndex = room.palette;

            this.redrawTileBrowser();

            // render room
            this.redraw();
            this.tileBrowser.redraw();
            this.eventTileBrowser.redraw();

            // events
            this.eventEditor.refresh();
        });

        const onRoomPointer = async (event, canvas, forcePick=false) => {
            const { tile, room, data } = this.getSelections();

            const scale = canvas.width / (8 * 16);

            const round = (position) => {
                return {
                    x: Math.floor(position.x / (8 * scale)),
                    y: Math.floor(position.y / (8 * scale)),
                };
            };

            const redraw = () => this.redraw();

            const drag = ui.drag(event);
            const positions = trackCanvasStroke(canvas, drag);

            const { x, y } = round(positions[0]);

            const tool = this.roomPaintTool.value;

            const prevTile = room.tilemap[y][x];

            const pal = tool === "high" ? 2 : 1;
            const same = room.tilemap[y][x] === tile.id 
                      && room.backmap[y][x] === 0
                      && room.foremap[y][x] === pal;

            const nextTile = same ? 0 : tile.id;
            const nextWall = 1 - room.wallmap[y][x];

            if (tool === "pick" || forcePick) {
                if (prevTile !== 0) {
                    this.tileBrowser.selectedTileIndex = Math.max(0, data.tiles.findIndex((tile) => tile.id === prevTile));
                    this.tileBrowser.redraw();
                }
            } else if (tool === "wall" || tool === "tile" || tool === "high") {    
                this.stateManager.makeCheckpoint();

                const setIfWithin = (map, x, y, value) => {
                    if (x >= 0 && x < 16 && y >= 0 && y < 16) map[y][x] = value ?? 0;
                } 

                const plots = {
                    tile: (x, y) => { 
                        setIfWithin(room.tilemap, x, y, nextTile); 
                        setIfWithin(room.backmap, x, y, 0); 
                        setIfWithin(room.foremap, x, y, pal); 
                    },
                    wall: (x, y) => setIfWithin(room.wallmap, x, y, nextWall),
                }
                plots.high = plots.tile;

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
                    redraw();
                });
            }
        };

        this.renderings.tileMapPaint.canvas.addEventListener("pointerdown", (event) => onRoomPointer(event, this.renderings.tileMapPaint.canvas));
        this.renderings.tilePaintRoom.canvas.addEventListener("pointerdown", (event) => onRoomPointer(event, this.renderings.tilePaintRoom.canvas, true));

        this.renderings.eventsRoom.canvas.addEventListener("pointerdown", async (event) => {
            // hack bc race condition rn
            const drag = ui.drag(event);
            await sleep(1);

            if (this.eventEditor.showDialoguePreview) {
                this.dialoguePreviewPlayer.skip();
                if (this.dialoguePreviewPlayer.empty) this.eventEditor.resetDialoguePreview();
                this.redraw();
                return;
            }

            const { room } = this.getSelections();
            const scale = this.renderings.eventsRoom.canvas.width / (8 * 16);

            const round = (position) => {
                return {
                    x: Math.floor(position.x / (8 * scale)),
                    y: Math.floor(position.y / (8 * scale)),
                };
            };

            const redraw = () => {
                this.redraw();
            };

            const positions = trackCanvasStroke(this.renderings.eventsRoom.canvas, drag);
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
            const events = event_ === undefined ? room.events : [event_];
            
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

                cycleEvents(events, dx, dy);
                this.selectedEventCell = { x: (x1 + 16) % 16, y: (y1 + 16) % 16 };

                if (move) {
                    this.stateManager.changed();
                }
            });
        });

        this.frame = 0;

        window.setInterval(() => {
            if (!this.ready) return;

            this.frame = 1 - this.frame;
            this.redraw();
        }, constants.frameInterval);

        this.savedVariables = new Map();
        const refreshVariables = () => {
            if (this.variablesWindow.hidden) return;
            const entries = Array.from(this.savedVariables);
            this.variablesTextElement.innerText = "VARIABLES:\n" + entries.map(([key, value]) => `${key} = ${JSON.stringify(value)}`).join("\n");
        }

        window.addEventListener("message", (event) => {
            if (event.data?.type === "log") {
                const text = event.data?.data.toString() + "\n";
                this.logTextElement.append(text);
            } else if (event.data?.type === "variables") {
                this.savedVariables = event.data.data;
                refreshVariables();
            }
        });
    }

    async init() {
        await this.paletteEditor.init();
        await this.dialoguePreviewPlayer.load();

        this.EVENT_TILE = await loadImage(constants.eventTile);
        this.WALL_TILE = await loadImage(constants.wallTile);

        this.dialoguePreviewPlayer.clear();
        this.dialoguePreviewPlayer.queue("click here to playtest", { panelColor: "#ffd800", textColor: "#000000" });
        this.dialoguePreviewPlayer.skip();
        this.dialoguePreviewPlayer.render();
        this.playtestSplash = copyRendering2D(this.dialoguePreviewPlayer.dialogueRendering);
    }

    /**
     * @param {BipsiDataProject} data 
     */
    getSelections(data = undefined) {
        data = data || this.stateManager.present;
        
        const tileset = this.stateManager.resources.get(data.tileset);
        const tileSize = constants.tileSize;
        const roomIndex = this.roomSelect.select.selectedIndex;
        const tileIndex = this.tileBrowser.selectedTileIndex;
        const frameIndex = this.tilePaintFrameSelect.selectedIndex;

        const tile = data.tiles[tileIndex];
        const room = data.rooms[roomIndex];

        const tileFrame = tile?.frames[frameIndex] ?? tile?.frames[0];

        const event = getEventById(data, this.selectedEventId);

        return { data, tileset, room, roomIndex, frameIndex, tileIndex, tileSize, event, tile, tileFrame };
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
    drawRoom(rendering, roomIndex, { palette = undefined, events = true } = {}) {
        const { data, tileset } = this.getSelections();
        const room = data.rooms[roomIndex];
        palette = palette ?? data.palettes[room.palette];
        const [background] = palette;

        // find current animation frame for each tile
        const tileToFrame = makeTileToFrameMap(data.tiles, this.frame);

        fillRendering2D(rendering, background);
        drawTilemapLayer(rendering, tileset, tileToFrame, palette, room);
        if (events) drawEventLayer(rendering, tileset, tileToFrame, palette, room.events);
    }

    redraw() {
        this.tileEditor.redraw();

        const { data, room, tileSize, roomIndex, tileset } = this.getSelections();
        const palette = this.modeSelect.value === "palettes" 
                      ? this.paletteEditor.getPreviewPalette()  
                      : data.palettes[room.palette];
        const [background] = palette;

        const tileToFrame = makeTileToFrameMap(data.tiles, this.frame);

        fillRendering2D(TEMP_128, background);
        drawTilemapLayer(TEMP_128, tileset, tileToFrame, palette, room);
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

        this.drawRoom(TEMP_128, roomIndex, { palette });
        this.renderings.paletteRoom.drawImage(TEMP_128.canvas, 0, 0);
        this.renderings.tilePaintRoom.drawImage(TEMP_128.canvas, 0, 0);
        this.renderings.eventsRoom.drawImage(TEMP_128.canvas, 0, 0, 256, 256);

        if (!this.eventEditor.showDialoguePreview) {
            fillRendering2D(TEMP_256);
    
            room.events.forEach((event) => {
                const [x, y] = event.position;
                TEMP_256.drawImage(this.EVENT_TILE, x * tileSize * 2, y * tileSize * 2);
            });

            if (this.selectedEventCell) {
                const { x, y } = this.selectedEventCell;
                TEMP_256.fillStyle = "white";
                TEMP_256.fillRect(0, y * 16 + 6, 256, 4);
                TEMP_256.fillRect(x * 16 + 6, 0, 4, 256);
            }

            this.renderings.eventsRoom.globalAlpha = .5;
            this.renderings.eventsRoom.drawImage(TEMP_256.canvas, 0, 0);
            this.renderings.eventsRoom.globalAlpha = 1;
        }

        this.actions.copyEvent.disabled = this.selectedEventId === undefined;
        this.actions.deleteEvent.disabled = this.selectedEventId === undefined;

        this.actions.reorderRoomBefore.disabled = this.roomSelect.select.selectedIndex <= 0;
        this.actions.reorderRoomAfter.disabled = this.roomSelect.select.selectedIndex >= this.stateManager.present.rooms.length - 1;

        this.redrawDialoguePreview();

        fillRendering2D(this.renderings.playtest);
        this.renderings.playtest.drawImage(this.playtestSplash.canvas, 0, 0);
    } 

    refreshRoomSelect() {
        const { data } = this.getSelections();

        const thumbs = data.rooms.map((room) => {
            const thumb = createRendering2D(16, 16);
            drawRoomThumbnail(thumb, data.palettes[room.palette], room);
            return { id: room.id, thumb: thumb.canvas };
        });

        this.roomSelect.updateRooms(thumbs);
        this.fieldRoomSelect.updateRooms(thumbs);
        this.eventsRoomSelect.updateRooms(thumbs);

        this.roomSelect.select.selectedIndex = Math.max(this.roomSelect.select.selectedIndex, 0);
        this.eventsRoomSelect.select.selectedIndex = this.roomSelect.select.selectedIndex;
    }

    redrawDialoguePreview() {
        if (this.eventEditor.showDialoguePreview && !this.dialoguePreviewPlayer.empty) {
            const top = this.selectedEventCell.y >= 8;

            this.dialoguePreviewPlayer.options.anchorY = top ? 0 : 1;
            this.dialoguePreviewPlayer.render();
            this.renderings.eventsRoom.drawImage(this.dialoguePreviewPlayer.dialogueRendering.canvas, 0, 0);
        }
    }

    async redrawTileBrowser() {
        const { data, room, tileset } = this.getSelections();
        const [, foreground, highlight] = data.palettes[room.palette];

        const hi = this.roomPaintTool.value === "high" || this.modeSelect.value === "events";
        const color = hi ? highlight : foreground;
        const tilesetC = recolorMask(tileset, color, TEMP_TILESET0);

        // draw tileset frame
        const cols = 16;
        const rows = Math.ceil(data.tiles.length / cols);
        const frame0 = createRendering2D(cols * 8, rows * 8);
        const frame1 = createRendering2D(cols * 8, rows * 8);

        data.tiles.forEach(({ frames }, i) => {
            const index0 = frames[0];
            const index1 = frames[1] ?? index0;

            const tx = i % 16;
            const ty = Math.floor(i / 16);

            {
                const { x, y, size } = getTileCoords(tilesetC.canvas, index0);
                frame0.drawImage(
                    tilesetC.canvas,
                    x, y, size, size, 
                    tx * size, ty * size, size, size,
                );
            }
            {
                const { x, y, size } = getTileCoords(tilesetC.canvas, index1);
                frame1.drawImage(
                    tilesetC.canvas,
                    x, y, size, size, 
                    tx * size, ty * size, size, size,
                );
            }
        });

        await this.tileBrowser.setFrames([frame0.canvas, frame1.canvas]);
        await this.eventTileBrowser.setFrames([frame0.canvas, frame1.canvas]);
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
        this.roomSelect.select.selectedIndex += 1;
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
        this.roomSelect.select.selectedIndex += 1;
    }

    async reorderRoomBefore() {
        return this.stateManager.makeChange(async (data) => {
            const { roomIndex } = this.getSelections(data);
            const nextIndex = roomIndex - 1;
            [data.rooms[nextIndex], data.rooms[roomIndex]] = [data.rooms[roomIndex], data.rooms[nextIndex]];
            this.roomSelect.select.selectedIndex -= 1;
        });
    }

    async reorderRoomAfter() {
        return this.stateManager.makeChange(async (data) => {
            const { roomIndex } = this.getSelections(data);
            const nextIndex = roomIndex + 1;
            [data.rooms[nextIndex], data.rooms[roomIndex]] = [data.rooms[roomIndex], data.rooms[nextIndex]];
            this.roomSelect.select.selectedIndex += 1;
        });
    }

    async deleteRoom() {
        return this.stateManager.makeChange(async (data) => {
            const { room } = this.getSelections(data);
            arrayDiscard(data.rooms, room);
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
    }

    /** @returns {string[]} */
    getManifest() {
        return [];
    }

    async playtest() {
        const iframe = ONE("#playtest");
        const html = await this.makeExportHTML();
        iframe.srcdoc = html;
        iframe.hidden = false;

        this.logTextElement.replaceChildren("> RESTARTING PLAYTEST\n");
    }

    async makeExportHTML() {
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

        // track how many remixes this is (remixes have soft-limits to encourage finding updates)
        const generation = parseInt(clone.getAttribute("data-remix-generation"));
        clone.setAttribute("data-remix-generation", `${generation + 1}`);

        // default to player mode
        clone.setAttribute("data-app-mode", "player");

        return clone.outerHTML;
    }
        
    async exportProject() {
        // prompt the browser to download the page
        const name = "bipsi.html";
        const blob = maker.textToBlob(await this.makeExportHTML(), "text/html");
        maker.saveAs(blob, name);
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
