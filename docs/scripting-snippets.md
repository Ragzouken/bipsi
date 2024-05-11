# scripting snippets for bipsi

## change an event's colors

set an event's colors by palette index:

```javascript
let colors = { bg: 1, fg: 3 };
SET_FIELDS(EVENT, "colors", "colors", colors);
```

set an event's colors from another field:

```javascript
let colors = FIELD(EVENT, "alt-colors", "colors");
SET_FIELDS(EVENT, "colors", "colors", colors);
```

## exit behavior that touches destination

add a new type of exit `exit-touch` that touches the destination cell after
moving there

| field name | field type
|--|--
| add-behavior | javascript

```javascript
let destination = FIELD(EVENT, "exit-touch", "location");
if (destination) {
    MOVE(AVATAR, destination);
    let events = destination ? EVENTS_AT(destination) : [];
    for (const event of events) {
        if (event === AVATAR) continue;
        await TOUCH(event);
    }
}
```

## exit behavior with palette fade

add a new type of exit `exit-blend` that fades from the previous room's palette
to the next room's palette after moving there

| field name | field type
|--|--
| add-behavior | javascript

```javascript
function hexlerp(prev, next, u) {
  prev_rgb = hexToRGB(prev);
  next_rgb = hexToRGB(next);
  let curr_rgb = {
    r: prev_rgb.r * (1-u) + next_rgb.r * u,
    g: prev_rgb.g * (1-u) + next_rgb.g * u,
    b: prev_rgb.b * (1-u) + next_rgb.b * u,
  };
  return rgbToHex(curr_rgb);
}

function pal_lerp(curr, prev, next, u) {
  for (let i = 1; i < curr.colors.length; ++i) {
    curr.colors[i] = hexlerp(prev.colors[i], next.colors[i], u);
  }
}

const steps = 10;
const duration = 1;

let destination = FIELD(EVENT, "exit-blend", "location");
if (destination) {
    let prev_pal = PALETTE;
    MOVE(AVATAR, destination);
    let curr_pal = PLAYBACK.getActivePalette();
    let next_pal = COPY(curr_pal);
    for (let i = 0; i < steps; ++i) {
        pal_lerp(curr_pal, prev_pal, next_pal, i/steps);
        await DELAY(duration / steps);
    }
    curr_pal.colors.splice(0, Infinity, ...next_pal.colors);
}
```
