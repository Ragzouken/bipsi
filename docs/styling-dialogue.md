# styling dialogue in bipsi

## dialogue text

| say | text | join the conversation with a nice \~~refreshing~~ glass of \_\_bipsi__ |
|-----------|------|-------|

### tags

| shortcuts
|---
| \~~waving text~~
| ##shaking text##
| ==rainbow text==
| \_\_pre-revealed text__

| markup
|---
| {+wvy}waving text{-wvy}
| {+shk}shaking text{-shk}
| {+rbw}rainbow text{-rbw}
| {+r}pre-revealed text{-r}
| {+clr=#FF0000}colored text{-clr}
| end line{br}new line
| end page{pg}new page

## dialogue box

| say-style | json | { "lines": 2, ... } |
|-----------|------|-------|

### properties

| name | default | meaning
|---|---|---
| anchorX | 0.5 | horizontal alignment within screen
| anchorY | 0.5 | vertical alignment within screen
| lines   | 2   | number of lines per dialogue page
| lineGap | 4   | pixel spacing between lines of text 
| padding | 8   | pixel spacing between panel edge and text
| glyphRevealDelay | .05 | seconds between revealing each character
| backgroundColor | null | html color filling screen behind dialogue panel
| panelColor      | "#000000" | html color of dialogue panel
| textColor       | "#FFFFFF" | html color of dialogue text  

### example field value (defaults)
```json
{
    "anchorX": 0.5,
    "anchorY": 0.5,

    "lines": 2,
    "lineGap": 4,
    "padding": 8,

    "glyphRevealDelay": 0.05,

    "backgroundColor": null,
    "panelColor": "#000000",
    "textColor": "#FFFFFF"
}
```
