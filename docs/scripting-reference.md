# scripting reference for bipsi

## built-in variables

| code | meaning
|--|--
| `PALETTE` | the current palette
| `EVENT` | the event being touched
| `AVATAR` | the event controlled by the player
| `LIBRARY` | the event used to lookup files by name
| `PLAYBACK` | the playback context for bipsi
| `await DIALOGUE` | await this to wait until dialogue has finished
| `await VISIBLE_IMAGES_LOADED` | await this to wait until visible images are loaded and ready to display

## built-in functions

### dialogue

| code | meaning
|--|--
| `SAY("hello")` | show dialogue from text
| `SAY_FIELD("fieldname")` | show dialogue from dialogue field on this event
| `TITLE("game title")` | show title from text

### events

| code | meaning
|--|--
| `await TOUCH(event)` | touch another event
| `EVENT_AT(location)` | get the first event at a location
| `EVENTS_AT(location)` | get all events at a location
| `LOCATION_OF(event)` | get the location of an event
| `FIND_EVENT(name)` | get the first event with a given tag
| `FIND_EVENTS(name)` | get all events with a given tag
| `MOVE(event, location)` | move an event to a location
| `FIELD(event, name, type)` | get the first field of matching name and type from an event
| `FIELDS(event, name, type)` | get all fields of matching name and type from an event
| `SET_FIELDS(event, name, type, ...values)` | replace all fields (if any) of matching name and type with fields with the given values 
| `IS_TAGGED(event, name)` | check if an event has a tag
| `TAG(event, name)` | add a tag to an event
| `UNTAG(event, name)` | remove a tag from an event
| `REMOVE(event)` | remove an event from the game
| `GET(name)` | get the value of a variable
| `SET(name, value)` | set the value of a variable

### other

| code | meaning
|--|--
| `await DELAY(seconds)` | wait before continuing
| `RESTART()` | restart the game

### files

| code | meaning
|--|--
| `FILE_TEXT(file)` |
| `FIELD_OR_LIBRARY(fieldname)` | get the first file field by this name if it exists. otherwise use the text field by this name if it exists or the given field name and look for the first file field on the library event by that name
| `FIELDS_OR_LIBRARY(fieldname)` | get the file fields by this name if they exists. otherwise use the text fields by this name if it exists or the given field name and look for the file fields on the library event by that name

### audio

| code | meaning
|--|--
| `PLAY_MUSIC(file)` | start playing a music file
| `STOP_MUSIC()` | stop playing music

### images

| code | meaning
|--|--
| `await SHOW_IMAGE(id, files, layer, x, y)` | show an image on this id, animating with each file as a frame. layer is decimal number equivalent to depth
| `HIDE_IMAGE(id)` | hide image previously shown on this id

### advanced

| code | meaning
|--|--
| `await DO_STANDARD(event)` | run behaviors for an event, ignoring touch override
| `SET_CSS(property, value)` | add inline style to the root element
| `RUN_JS(javascript)` | run javascript code in the event context
| `POST(message)` | send a browser message to the window parent or opener
| `ADD_BEHAVIOURS(javascript)` | add an additional touch behavior for all events

### debug

| code | meaning
|--|--
| `LOG(anything)` | print to the pop-out log in the editor playtest tab

