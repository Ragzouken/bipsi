class IndexedItemPool {
    constructor({ create, dispose }) {
        this.create = create;
        this.dispose = dispose;
        this.items = [];
    }

    setCount(count) {
        const missing = count - this.items.length;

        if (missing < 0) {
            const excess = this.items.splice(missing, -missing);
            excess.forEach((item) => this.dispose(item));
        } else if (missing > 0) {
            for (let i = 0; i < missing; ++i) {
                const item = this.create();
                this.items.push(item);
            }
        }
    }

    map(data, callback) {
        this.setCount(data.length);
        for (let i = 0; i < data.length; ++i) {
            callback(data[i], this.items[i], i);
        }
    }
}
