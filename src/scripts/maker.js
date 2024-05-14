"strict"
const maker = {};
const ui = {};

/**
 * @template TProject
 * @typedef {(project: TProject) => string[]} maker.ManifestFunction
 */

/**
 * @typedef {Object} ResourceData
 * @property {string} type
 * @property {any} data
 */

/**
 * @typedef {Object.<string, ResourceData>} maker.ResourceBundle
 */

/**
 * @template TProject
 * @typedef {Object} maker.ProjectBundle
 * @property {TProject} project
 * @property {maker.ResourceBundle} resources
 */

/**
 * @template TData
 * @template TInstance
 * @typedef {Object} maker.ResourceHandler
 * @property {(data: TData) => Promise<TInstance>} load
 * @property {(instance: TInstance) => Promise<TInstance>} copy
 * @property {(instance: TInstance) => Promise<TData>} save
 */

/** @type {Map<string, maker.ResourceHandler<any, any>>} */
maker.resourceHandlers = new Map();

// add a resource type called "canvas-datauri" that describes how to load a
// canvas rendering context from a datauri, how to copy one, and how to convert
// one back into a datauri
maker.resourceHandlers.set("canvas-datauri", {
    load: async (data) => imageToRendering2D(await loadImage(data)),
    copy: async (instance) => copyRendering2D(instance),
    save: async (instance) => instance.canvas.toDataURL("image/png", 1),
});

maker.resourceHandlers.set("file-datauri", {
    load: async (data) => new File([await fetch(data.uri).then((r) => r.blob())], data.name, { type: data.type }),
    copy: async (instance) => new File([await instance.arrayBuffer()], instance.name, { type: instance.type }),
    save: async (instance) => ({ 
        name: instance.name, 
        uri: await maker.dataURIFromFile(instance), 
        type: instance.type,
    }),
});

maker.ResourceManager = class {
    constructor() {
        this.lastId = 0;
        /** @type {Map<string, { type: string, instance: any }>} */
        this.resources = new Map();
    }

    /**
     * Generate a new unique id for a resource.
     * @returns {string}
     */
    generateId() {
        this.lastId += 1;
        // just next lowest unused number
        while (this.resources.has(this.lastId.toString())) {
            this.lastId += 1;
        }

        return this.lastId.toString();
    }
    
    /**
     * Clear all resources.
     */
    clear() {
        this.resources.clear();
    }

    /**
     * Get the resource instance with the given id.
     * @param {string} id 
     * @returns {any}
     */
    get(id) {
        return this.resources.get(id)?.instance;
    }

    /**
     * Add a resource instance at a specific id.
     * @param {string} id 
     * @param {any} instance 
     * @param {string} type 
     */
    set(id, instance, type) {
        this.resources.set(id, { type, instance });
    }

    /**
     * Add an instance as a new resource and return its new id.
     * @param {any} instance 
     * @param {string} type 
     * @returns {string}
     */
    add(instance, type) {
        const id = this.generateId();
        this.set(id, instance, type);
        return id;
    }

    /**
     * Copy the existing resource with the given id and add it as a new resource.
     * @param {string} id 
     * @returns 
     */
    async fork(id) {
        const source = this.resources.get(id);
        const forkId = this.generateId();
        const instance = await maker.resourceHandlers.get(source.type).copy(source.instance); 
        this.set(forkId, instance, source.type);
        return { id: forkId, instance };
    }

    /**
     * Discard all resources except those at the ids given.
     * @param {Iterable<string>} keepIds 
     */
    prune(keepIds) {
        const ids = new Set(keepIds);

        this.resources.forEach((_, id) => {
            if (!ids.has(id)) this.resources.delete(id);
        });
    }

    /**
     * Copy all resources from another resource manager.
     * @param {maker.ResourceManager} other 
     */
    async copyFrom(other) {
        const tasks = [];
        Array.from(other.resources).forEach(([id, { type, instance }]) => {
            const task = maker.resourceHandlers.get(type)
                         .copy(instance)
                         .then((copy) => this.set(id, copy, type));
            tasks.push(task);
        });

        return Promise.all(tasks);
    }

    /**
     * Save all resources in an object mapping id to type and save data.
     * @param {Iterable<string>} ids 
     * @returns {Promise<maker.ResourceBundle>}
     */
    async save(ids) {
        /** @type {maker.ResourceBundle} */
        const bundle = {};

        const resourceIds = new Set(ids);
        const relevant = Array.from(this.resources)
                         .filter(([id]) => resourceIds.has(id));

        const tasks = [];
        Array.from(relevant).forEach(([id, { type, instance }]) => {
            const task = maker.resourceHandlers.get(type)
                         .save(instance)
                         .then((data) => bundle[id] = { type, data });
            tasks.push(task);
        });

        await Promise.all(tasks);
        return bundle;
    }

    /**
     * Load all resources from the given bundle.
     * @param {maker.ResourceBundle} bundle 
     */
    async load(bundle) {
        const tasks = [];
        Object.entries(bundle).forEach(([id, { type, data }]) => {
            const task = maker.resourceHandlers.get(type)
                         .load(data)
                         .then((instance) => this.set(id, instance, type));
            tasks.push(task);
        });
        return Promise.all(tasks);
    }
}

/**
 * 
 * @template TState
 */
maker.StateManager = class extends EventTarget {
    /**
     * Create a state manager, optionally providing a function that describes
     * how to determine resource dependencies of a given state. 
     * @param {maker.ManifestFunction<TState>} getManifest 
     */
    constructor(getManifest = undefined) {
        super();

        /** @type {maker.ManifestFunction<TState>} */
        this.getManifest = getManifest || (() => []);
        this.resources = new maker.ResourceManager();

        /** @type {TState[]} */
        this.history = [];
        this.index = -1;
        this.historyLimit = 20;
    }

    /**
     * The present state in history.
     */
    get present() {
        return this.history[this.index];
    }

    /**
     * Is there any edit history to undo to?
     */
    get canUndo() {
        return this.index > 0;
    }

    /**
     * Are there any undone edits to redo?
     */
    get canRedo() {
        return this.index < this.history.length - 1;
    }

    /**
     * Replace all state with the project and resources in the given project
     * bundle.
     * @param {maker.ProjectBundle<TState>} bundle
     */
    async loadBundle(bundle) {
        this.history.length = 0;
        this.history.push(bundle.project);
        this.index = 0;
        this.resources.clear();
        await this.resources.load(bundle.resources);

        this.changed();
    }

    /**
     * Replace all state by copying from another state manager.
     * @param {maker.StateManager<TState>} other 
     */
    async copyFrom(other) {
        this.history = COPY(other.history);
        this.index = other.index;
        
        this.resources.clear();
        await this.resources.copyFrom(other.resources);
        
        this.changed();
    }
    
    /**
     * Replace all state by copying just the present and dependent resources
     * from another state manager.
     * @param {maker.StateManager<TState>} other 
     */
    async copyPresentFrom(other) {
        this.history = [COPY(other.present)];
        this.index = 0;
        this.resources.clear();

        // TODO: only copy what's not going to be pruned..
        await this.resources.copyFrom(other.resources);
        this.pruneResources();
        
        this.changed();
    }

    /**
     * Copy the present state and dependent resources into a project bundle.
     * @returns {Promise<maker.ProjectBundle<TState>>}
     */
    async makeBundle() {
        const project = COPY(this.present);
        const resources = await this.resources.save(this.getManifest(this.present));

        return { project, resources };
    }

    /**
     * Save the current state as a checkpoint in history that can be returned to
     * with undo/redo.
     */
    makeCheckpoint() {
        this.history.length = this.index + 1;
        
        const currentData = this.present;

        this.history[this.index] = COPY(currentData);
        this.history.push(currentData);
        
        if (this.index < this.historyLimit) {
            this.index += 1;
        } else {
            // delete earliest history
            this.history.splice(0, 1);
            this.pruneResources();
        }
    }

    /**
     * Dispatch the change event signalling that the present state has been
     * updated.
     */
    changed() {
        this.dispatchEvent(new CustomEvent("change"));
    }

    /**
     * Discard all resources that are no longer required accord to the manifest
     * function.
     */
    pruneResources() {
        this.resources.prune(this.history.flatMap(this.getManifest));
    }

    /**
     * Make a history checkpoint, replace the current state with a forked
     * version via callback, and then dispatch the change event.
     * @param {(data: TState) => Promise} action 
     */
    async makeChange(action) {
        this.makeCheckpoint();
        await action(this.present);
        this.changed();
    }

    /**
     * Revert the state to the previous checkpoint in history.
     */
    undo() {
        if (!this.canUndo) return;
        this.index -= 1;
        this.changed();
    }

    /**
     * Return the state to the most recently undone checkpoint in history.
     */
    redo() {
        if (!this.canRedo) return;
        this.index += 1;
        this.changed();
    }
};

/**
 * Ask the browser to download the given blob as a file with the given name.
 * @param {Blob} blob 
 * @param {string} name
 */
maker.saveAs = function(blob, name) {
    const element = document.createElement("a");
    const url = window.URL.createObjectURL(blob);
    element.href = url;
    element.download = name;
    element.click();
    window.URL.revokeObjectURL(url);
};

/**
 * Open the browser file picker, optionally restricted to files of a given file
 * type pattern and optionally accepting multiple files. 
 * @param {string} accept 
 * @param {boolean} multiple 
 * @returns {Promise<File[]>}
 */
 maker.pickFiles = async function(accept = "*", multiple = false) {
    return new Promise((resolve) => {
        const fileInput = html("input", { type: "file", accept, multiple, style: "visibility: collapse" });
        
        document.body.append(fileInput);
        function done(files) {
            fileInput.remove();
            resolve(files);
        } 

        fileInput.addEventListener("change", () => done(Array.from(fileInput.files)));
        fileInput.addEventListener("cancel", () => done([]));
        fileInput.click();
    });
}

/**
 * Read plain text from a file.
 * @param {File} file 
 * @return {Promise<string>}
 */
maker.textFromFile = async function(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = reject;
        reader.onload = () => resolve(/** @type {string} */ (reader.result));
        reader.readAsText(file); 
    });
}

/**
 * Read image from a file.
 * @param {File} file 
 * @return {Promise<string>}
 */
maker.dataURIFromFile = async function(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = reject;
        reader.onload = () => resolve(/** @type {string} */ (reader.result));
        reader.readAsDataURL(file); 
    });
}

/**
 * Create a DOM for an html page from html source code
 * @param {string} source
 * @returns 
 */
maker.htmlFromText = function(source) {
    const template = document.createElement('template');
    template.innerHTML = source;
    return template.content;
}

/**
 * @param {string} text 
 */
maker.textToBlob = function(text, type = "text/plain") {
    return new Blob([text], { type });
}

/**
 * 
 * @param {ParentNode} html 
 */
maker.bundleFromHTML = function(html, query="#bundle-embed") {
    const json = ONE(query, html)?.textContent;
    const bundle = json ? JSON.parse(json) : undefined;
    return bundle;
}

class RadioGroupWrapper extends EventTarget {
    /** @param {HTMLInputElement[]} inputs */
    constructor(inputs) {
        super();

        const group = this;
        this.onRadioChange = function() {
            if (!this.checked) return;
            group.dispatchEvent(new CustomEvent("change"));
        }

        this.inputs = [];
        this.replaceInputs(inputs);
    }

    get selectedIndex() {
        return this.inputs.findIndex((button) => button.checked); 
    }

    set selectedIndex(value) {
        this.inputs[value].click();
    }

    get selectedInput() {
        return this.inputs[this.selectedIndex];
    }

    get value() {
        return this.selectedInput?.value;
    }
    
    get valueAsNumber() {
        return parseInt(this.selectedInput?.value ?? "-1", 10);
    }

    setSelectedIndexSilent(value) {
        this.inputs.forEach((input, index) => input.checked = index === value);
    }

    setValueSilent(value) {
        value = value.toString();
        this.inputs.forEach((input) => input.checked = input.value === value);
    }

    /**
     * @param {HTMLElement} element 
     * @param  {...string} values 
     */
    tab(element, ...values) {
        this.addEventListener("change", () => element.hidden = !values.includes(this.value));
    }

    /**
     * @param {HTMLInputElement} radioElement 
     */
    add(radioElement) {
        this.inputs.push(radioElement);
        radioElement.addEventListener("change", this.onRadioChange);
    }

    /**
     * @param {HTMLInputElement} radioElement 
     */
    remove(radioElement) {
        arrayDiscard(this.inputs, radioElement);
        radioElement.removeEventListener("change", this.onRadioChange);
    }

    removeAll() {
        this.inputs.forEach((element) => element.removeEventListener("change", this.onRadioChange));
        this.inputs.length = 0;
    }

    replaceInputs(inputs) {
        this.removeAll();
        inputs.forEach((input) => this.add(input));
    }
}

class CheckboxWrapper extends EventTarget {
    /** @param {HTMLInputElement[]} inputs */
    constructor(inputs) {
        super();
        this.inputs = inputs;

        inputs.forEach((input) => {
            input.addEventListener("change", () => {
                this.setCheckedSilent(input.checked);
                this.dispatchEvent(new CustomEvent("change"));
            });
        });
    }

    get checked() {
        return this.inputs[0].checked; 
    }

    set checked(value) {
        if (this.checked !== value) this.inputs[0].click();
    }

    setCheckedSilent(value) {
        this.inputs.forEach((input) => input.checked = value);
    }
}

class ButtonAction extends EventTarget {
    /** @param {HTMLButtonElement[]} buttons */
    constructor(buttons) {
        super();
        this.buttons = buttons;
        this.disabled = false;
        this.clickListener = () => this.invoke();
        this.buttons.forEach((button) => {
            button.addEventListener("click", this.clickListener);
        });
    }

    get disabled() {
        return this._disabled;
    }

    set disabled(value) {
        this._disabled = value;
        this.buttons.forEach((button) => button.disabled = value);
    }

    invoke(force = false) {
        if (!force && this.disabled) return;
        this.dispatchEvent(new CustomEvent("invoke"));
    }

    detach() {
        this.buttons.forEach((button) => {
            button.removeEventListener("click", this.clickListener);
        });
        this.disabled = false;
        this.buttons = [];
    }
}

/**
 * Get a wrapper for the radio input elements sharing the given name.
 * @param {string} name
 * @returns {RadioGroupWrapper}
 */
ui.radio = (name) => new RadioGroupWrapper(ALL(`input[type="radio"][name="${name}"]`));

ui.toggle = (name) => new CheckboxWrapper(ALL(`input[type="checkbox"][name="${name}"]`));

/**
 * @param {string} name 
 * @returns {HTMLInputElement}
 */
ui.slider = (name) => ONE(`input[type="range"][name=${name}]`);

/**
 * @param {string} name 
 * @returns {HTMLInputElement | HTMLTextAreaElement}
 */
ui.text = (name) => ONE(`[name=${name}]`);

/** @type {Map<string, ButtonAction>} */
ui.actions = new Map();
/**
 * Get an action linked to all button elements sharing the given name. 
 * Optionally provide a default listener for the action.
 * @param {string} name
 * @param {() => void} listener
 * @returns {ButtonAction}
 */
ui.action = function (name, listener=undefined) {
    const action = new ButtonAction(ALL(`button[name="${name}"]`));
    ui.actions.set(name, action);
    if (listener) action.addEventListener("invoke", listener);
    return action;
}

/**
 * Get the html select element with the given name.
 * @param {string} name
 * @returns {HTMLSelectElement}
 */
ui.select = (name) => ONE(`select[name="${name}"]`);

/**
 * Get a child element matching CSS selector.
 * @param {string} query 
 * @param {ParentNode} element 
 * @returns {HTMLElement}
 */
const ONE = (query, element = undefined) => (element || document).querySelector(query);

/**
 * Get all children elements matching CSS selector.
 * @param {string} query 
 * @param {HTMLElement | Document} element 
 * @returns {HTMLElement[]}
 */
const ALL = (query, element = undefined) => Array.from((element || document).querySelectorAll(query));

/**
 * @template {any} T
 * @param {T[]} array 
 * @param {T} value
 * @returns {boolean}
 */
 function arrayDiscard(array, value) {
    const index = array.indexOf(value);
    if (index >= 0) array.splice(index, 1);
    return index >= 0;
}

ui.PointerDrag = class extends EventTarget {
    /** 
     * @param {MouseEvent} event
     */
    constructor(event, { clickMovementLimit = 5 } = {}) {
        super();
        this.pointerId = event["pointerId"];
        this.clickMovementLimit = 5;
        this.totalMovement = 0;

        this.downEvent = event;
        this.lastEvent = event;

        this.listeners = {
            "pointerup": (event) => {
                if (event.pointerId !== this.pointerId) return;

                this.lastEvent = event;
                this.unlisten();
                this.dispatchEvent(new CustomEvent("up", { detail: event }));
                if (this.totalMovement <= clickMovementLimit) {
                    this.dispatchEvent(new CustomEvent("click", { detail: event }));
                }
            },

            "pointermove": (event) => {
                if (event.pointerId !== this.pointerId) return;

                this.lastEvent = event;
                this.totalMovement += Math.abs(event.movementX);
                this.totalMovement += Math.abs(event.movementY);
                this.dispatchEvent(new CustomEvent("move", { detail: event }));
            }
        }

        document.addEventListener("pointerup", this.listeners.pointerup);
        document.addEventListener("pointermove", this.listeners.pointermove);
    }

    unlisten() {
        document.removeEventListener("pointerup", this.listeners.pointerup);
        document.removeEventListener("pointermove", this.listeners.pointermove);
    }
}

/**
 * Wrap a pointer down event and track its subsequent movement until release.
 * @param {PointerEvent} event 
 * @returns {ui.PointerDrag}
 */
ui.drag = (event) => new ui.PointerDrag(event);

/**
 * @param {HTMLCanvasElement} canvas 
 * @param {MouseEvent} event 
 */
 function mouseEventToCanvasPixelCoords(canvas, event) {
    const bounds = canvas.getBoundingClientRect();
    const [mx, my] = [event.clientX - bounds.x, event.clientY - bounds.y];
    const scale = canvas.width / canvas.clientWidth; 
    const [px, py] = [Math.floor(mx * scale), Math.floor(my * scale)];
    return { x: px, y: py };
}

/**
 * @param {HTMLCanvasElement} canvas 
 * @param {ui.PointerDrag} drag 
 */
function trackCanvasStroke(canvas, drag) {
    const positions = [mouseEventToCanvasPixelCoords(canvas, drag.downEvent)];
    const update = (event) => positions.push(mouseEventToCanvasPixelCoords(canvas, event.detail));
    drag.addEventListener("up", update);
    drag.addEventListener("move", update);
    return positions;
}

// from https://github.com/ai/nanoid/blob/master/non-secure/index.js
const urlAlphabet = 'ModuleSymbhasOwnPr-0123456789ABCDEFGHNRVfgctiUvz_KqYTJkLxpZXIjQW';
function nanoid(size = 21) {
    let id = '';
    let i = size;
    while (i--) id += urlAlphabet[(Math.random() * 64) | 0];
    return id
}

/**
 * Deep copy an object by serializing it to json and parsing it again.
 * @template T
 * @param {T} object
 * @returns {T}
 */
const COPY = (object) => JSON.parse(JSON.stringify(object));

/**
 * Create an array of zeroes to the given length.
 * @param {number} length 
 * @returns {number[]}
 */
const ZEROES = (length) => Array(length).fill(0);

/**
 * Create an array of a value repeated to the given length.
 * @template T
 * @param {number} length 
 * @param {T} value
 * @returns {T[]}
 */
 const REPEAT = (length, value) => Array(length).fill(value);

/**
 * Create an html element with the given attributes and children.
 * @template {keyof HTMLElementTagNameMap} K
 * @param {K} tagName 
 * @param {*} attributes 
 * @param  {...(Node | string)} children 
 * @returns {HTMLElementTagNameMap[K]}
 */
 function html(tagName, attributes = {}, ...children) {
    const element = /** @type {HTMLElementTagNameMap[K]} */ (document.createElement(tagName)); 
    Object.entries(attributes).forEach(([name, value]) => element.setAttribute(name, value));
    children.forEach((child) => element.append(child));
    return element;
}

/** @param {number} milliseconds */
function sleep(milliseconds) {
    return new Promise(resolve => setTimeout(resolve, milliseconds));
}

/** 
 * @template T
 * @param {IDBRequest<T>} request 
 * @returns {Promise<T>}
 */
 function promisfyRequest(request) {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

/** 
 * @param {IDBTransaction} transaction 
 * @returns {Promise}
 */
 function promisfyTransaction(transaction) {
    return new Promise((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onabort = () => reject(transaction.error);
        transaction.onerror = () => reject(transaction.error);
    });
}

maker.ProjectStorage = class {
    constructor(appID, generateMeta=undefined) {
        this.appID = appID;
        this.generateMeta = generateMeta;
        this.error = undefined;

        this.openDatabase().then(
            (request) => request.close(),
            (reason) => this.error = reason,
        );
    }

    get available() {
        return this.error === undefined;
    }

    async openDatabase() {
        const request = indexedDB.open(this.appID);
        request.addEventListener("upgradeneeded", () => {
            request.result.createObjectStore("projects");
            request.result.createObjectStore("projects-meta");
        });
        return promisfyRequest(request);
    }

    async stores(mode) {
        const db = await this.openDatabase();
        const transaction = db.transaction(["projects", "projects-meta"], mode);
        const projects = transaction.objectStore("projects");
        const meta = transaction.objectStore("projects-meta");
        return { transaction, projects, meta };
    }

    /**
     * @returns {Promise<any[]>}
     */
    async list() {
        const stores = await this.stores("readonly");
        return promisfyRequest(stores.meta.getAll());
    }

    /**
     * @param {any} projectData 
     * @returns {Promise}
     */
    async save(projectData, key) {
        const meta = { date: (new Date()).toISOString() };
        if (this.generateMeta) Object.assign(meta, this.generateMeta(projectData)); 
    
        const stores = await this.stores("readwrite");
        stores.projects.put(projectData, key);
        stores.meta.put(meta, key);
        return promisfyTransaction(stores.transaction);
    }

    /**
     * @param {string} key
     * @returns {Promise<any>}
     */
    async load(key) {
        const stores = await this.stores("readonly");
        return promisfyRequest(stores.projects.get(key));
    }

    /**
     * @param {string} key
     */
    async delete(key) {
        const stores = await this.stores("readwrite");
        stores.projects.delete(key);
        stores.meta.delete(key);
        return promisfyTransaction(stores.transaction);
    }
}
