# event touch behaviors in bipsi

## built-in behaviors

### event properties

| name | type | meaning
|--|--|--
| graphic | tile | show a tile graphic for this event
| colors | colors | use these colors for the event graphic if present
| solid | tag | mark this event as impassable, like a wall
| one-time | tag | mark this event to be removed after touching

### scripting

| name | type | meaning
|--|--|--
| before | javascript | run javascript before all other behaviors
| after | javascript | run javascript after all other behaviors
| touch | javascript | run javascript instead of all other behaviors
| add-behavior | javascript | define a new behavior type for all events

### setup

| name | type | meaning
|--|--|--
| is-player | tag | mark this event as the single user controlled event
| is-setup | tag | mark this event as the single setup event (touched on startup before avatar)
| is-library | tag | mark this event as the single library event (where named files are kept)

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
| ending | dialogue | end the game with a ending dialogue
| say | dialogue | show a normal dialogue
| say-style | json | style the dialogue box ([more info](./styling-dialogue.md))
| say-mode | text | how to choose which `say` field to use each touch ([see below](#say-modes))
| say-shared-id | text | events with the same id will share dialogue progress
| no-says | javascript | run javascript when sequence-once dialogue has run out

#### say modes
| name | meaning
|--|--
| sequence-once | use the `say` fields in order, then run `no-says` instead
| sequence | use the `say` fields in order, then repeat the last
| cycle | use the `say` fields in order, looping
| shuffle | use the `say` fields in a random order, then reshuffle and repeat

### audio

| name | type | meaning
|--|--|--
| music | text | play named music
| stop-music | tag | stop playing music

### images

| image layer | meaning
|--|--
| background | below the room, events, and dialogue
| midground | above the room, but below the events and dialogue
| foreground | above the room and events, but below the dialogue
| overlay | above the room, events, and dialogue

| name | type | meaning
|--|--|--
| background | text | show named image on background layer
| midground | text | show named image on midground layer
| foreground | text | show named image on foreground layer
| overlay | text | show named image on overlay layer
| clear-background | tag | clear image on background layer
| clear-midground | tag | clear image on midground layer
| clear-foreground | tag | clear image on foreground layer
| clear-overlay | tag | clear image on overlay layer

### plugins

| name | type | meaning
|--|--|--
| is-plugin | tag | mark this event as a plugin
| plugin-order | json | number for determining the order to run plugins at startup
| plugin | javascript | code run when the event is loaded as a plugin
