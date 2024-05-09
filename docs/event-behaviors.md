# event touch behaviors in bipsi

## built-in behaviors

### scripting

| name | type | meaning
|--|--|--
| before | javascript | run javascript before all other behaviors
| after | javascript | run javascript after all other behaviors
| touch | javascript | run javascript instead of all other behaviors
| add-behavior | javascript | define a new behavior type for all events

### tags

| name | type | meaning
|--|--|--
| is-avatar | tag | mark this event to be the user controlled event
| solid | tag | mark this event as impassable, like a wall
| one-time | tag | mark this event to be removed after touching

### general

| name | type | meaning
|--|--|--
| page-color | text | set web page background to this css color
| exit | location | move the avatar to a new location
| set-avatar | tile | change the avatar graphic to another tile
| touch-location | location | touch the events at another location

### dialogue

| name | type | meaning
|--|--|--
| title | dialogue | show a title dialogue
| say | dialogue | show a normal dialogue
| ending | dialogue | end the game with a ending dialogue
| say-style | json | style the dialogue box ([more info](./styling-dialogue.md))

### audio

| name | type | meaning
|--|--|--
| music | text | play named music
| stop-music | tag | stop playing music

### images

| image layer | meaning
|--|--
| background | below the room, events, and dialogue
| foreground | above the room and events, but below the dialogue
| overlay | above the room, events, and dialogue

| name | type | meaning
|--|--|--
| background | text | show named image on background layer
| foreground | text | show named image on foreground layer
| overlay | text | show named image on overlay layer
| clear-background | tag | clear image on background layer
| clear-foreground | tag | clear image on foreground layer
| clear-overlay | tag | clear image on overlay layer
