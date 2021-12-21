# Binski Guide

## How to use the editor

The usage of the editor should be transparent if you're already familiar with bipsi. You can check the [bipsi user guide](https://kool.tools/bipsi/user-guide.pdf) if you're lost.

To take better advantage of binksi, you will need to load an Ink Story via the *import > ink story* button on the play page. If you need help, you can follow the documentation at [Writing With Ink](https://github.com/inkle/ink/blob/master/Documentation/WritingWithInk.md).  
*Note* : you'll need to upload a _compiled_ ink story (in JSON format).

The editor comes preloaded with an example story. You can find [the example file in the repository](https://github.com/smwhr/binksi/blob/main/data/story.ink).

## Additional Bipsi functions and variables

* `STORY` : the `Story` object as provided by `inkjs`.
* `SET_INK_VAR(varname, value)` : save the variable `varname` inside of ink with value `value`.
* `GET_INK_VAR(varname)` : extract the value of the variable `varname` from inside of ink.
* `DIVERT_TO(knot_name)` : jump to the knot `knot_name` and continue the story from there. (this is equivalent to `ChoosePathString`)

## Custom ink syntax

### Choices

* `* [tag: mytagname]` or `+[tag: mytagname]` :  
    Tag a choice inside of your story if you want it to be actionned by an event in your bipsi scene.  
    Add an event inside of you bipsi scene and add a tag with the same name.  
    If your avatar touches an event that has the same tagname as a choice, this choice is triggered in ink and the story continues.  
    _Note_: tagged choices do not prevent your avatar from moving in the scene.
* `* [auto: invisible action]` or `+[auto: invisible action]` :  
    When the bipsi players encouters an `auto` choice, it will automatically use it.  
    It is very useful if you want to hide some choices during play while keeping them around in your ink file.  
    When encoutered, the story continue.  
* `Classic choices` :  
    When the bipsi players encounters a non-tagged choice, it will stop everything happening in the bipsi scene.  
    The avatar won't be able to move until an option has bee chosen.  
    Choices will appear below the bipsi game area as clickable/touchable text, one per line.


### Ink tags

* `#TITLE` :  
    If a text is tagged with `#TITLE`, it will be displayed in bipsi's `TITLE` format (text only in the middle of the bipsi game area).

### Custom syntax

* `SPAWN_AT(teleport_name)` :  
    When encoutered in the text of the story, bipsi will try to teleport the avatar on an event tagged with `teleport_name`.  
    The name should _not_ be enclosed in any quotes.  
    If the teleport target does not exist, nothing happens and the story continues.  
    _Tip_: `teleport_name` can be a printed variable, (eg: `SPAWN_AT({lastVisitedRoom})`)
    _Example_: See [the example file in the repository](https://github.com/smwhr/binksi/blob/main/data/story.ink)


* `SPAWN_AT(teleport_name, event_name)` :  
    When encoutered in the text of the story, bipsi will try to move the selected event `event_name` on an event tagged with `teleport_name`.  
    Both names should _not_ be enclosed in any quotes.  
    If the teleport target or the event does not exist, nothing happens and the story continues. 
    _Tip_: You cannot create new event _on-the-fly_, you should create a "store room" where you can take event from and put them back