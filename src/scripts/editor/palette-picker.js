class PalettePicker {
    constructor() {
        this.select = ui.radio("palette-picker-select");
        this.optionTemplate = ONE("#palette-picker-template");

        ONE('[name="room-palette"]').addEventListener("click", (event) => { 
            event.stopImmediatePropagation();
            this.pick([["red", "blue", "green"], ["cyan", "magenta", "yellow"]], 1);
        });
    }

    /**
     * @param {string[][]} palettes 
     * @param {number} selectedIndex
     */
    async pick(palettes, selectedIndex=undefined) {
        const session = new Session();

        const parent = ONE("#palette-picker");

        function select(index) {
            parent.hidden = true;
            session.cancel();
        }

        function click(event) {
            if (parent.contains(event.target)) return;
            select(undefined);
        }

        parent.hidden = false;
        session.listen(window, "pointerdown", click.bind(this));

        return new Promise((resolve, reject) => { 
            this.select.removeAll();
            const options = palettes.map((palette, index) => {
                const gradient = makePaletteGradient(palette);
                const option = this.optionTemplate.cloneNode(true);
                option.setAttribute("style", `background: ${gradient};`);
                option.hidden = false;

                this.select.add(option.querySelector("input"));

                

                return option;
            });

            this.optionTemplate.parentElement.replaceChildren(this.optionTemplate, ...options);
            this.select.selectedIndex = selectedIndex;
        });
    }
}

/**
 * @param {string[]} palette 
 * @returns {string}
 */
function makePaletteGradient(palette) {
    const [bg, fg, hi] = palette;

    return `linear-gradient(to right, ${bg} 0, ${bg} 33%, ${fg} 33%, ${fg} 66%, ${hi} 66%, ${hi} 100%)`;
}

class Session {
    constructor() {
        this.controller = new AbortController();
    }

    cancel() {
        this.controller.abort();
    }

    /**
     * @param {EventTarget} target 
     * @param {string} type 
     * @param {EventListener} listener 
     */
    listen(target, type, listener) {
        target.addEventListener(type, listener, { signal: this.controller.signal });
    }
}
