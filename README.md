# ineractive-map

An interactive world map for kids and curious learners. Pan and zoom around the world, click a country to see its name and capital, drill into India's states, hear names read aloud, and test yourself with quizzes.

## Features

- **Pan & zoom:** drag to move, scroll or pinch to zoom, plus the **+ / − / ⟲** buttons.
- **Country info:** click a country to see its flag, name, official name, capital and region.
- **India drill-down:** click India to explore its 36 states and union territories and their capitals. Use the breadcrumb (**World › India › State**) to go back.
- **Voice:** names and capitals are read aloud using the browser's speech engine. You can pick a voice (kid-friendly and fun groups), change the pitch and speed, and turn saying the capital on or off.
- **Seen tracking:** the current place is orange, places you've already clicked are green, and unseen places are grey. This is saved in your browser.
- **Two modes:**
  - **📖 Learn:** explore freely.
  - **🎯 Test:** 10-question quizzes. Either *Find it on the map* or *Pick the capital*, for world countries or India's states, with stars at the end.

## Project structure

```
index.html            Page layout and all styles (light and dark themes)
app.js                Map, zoom/pan, info card, India drill-down, voice, seen tracking
quiz.js               Test mode (quiz logic and panel)
data/world.js         World country shapes (TopoJSON, world-atlas 50m) → window.WORLD_TOPO
data/countries.js     Country names, capitals, regions, flags keyed by ISO numeric code → window.COUNTRY_INFO
data/india.js         India state shapes (TopoJSON) → window.INDIA_TOPO
data/india-states.js  India state and UT capitals → window.INDIA_STATES
.claude/launch.json   Local dev server config for the Claude desktop app preview
```

It's a plain static site with no build step and no npm. The scripts load in order (data → `app.js` → `quiz.js`) as classic `<script>` tags and share globals. [D3 v7](https://d3js.org/) and [topojson-client](https://github.com/topojson/topojson-client) load from the jsDelivr CDN, so you need an internet connection.

## Setup

**Requirements**

- A modern browser: Chrome, Edge, Safari or Firefox.
- Any static file server. Ruby comes with macOS; Python or Node work too.
- Git, to clone. On macOS, install it with `xcode-select --install`.

**Clone**

```bash
git clone https://github.com/NaveenKumarN05/ineractive-map.git
```

```bash
cd ineractive-map
```

## Run

The page must be served over `http://`. Opening `index.html` directly (`file://`) won't load the scripts correctly in every browser.

Pick **one** of these from the project folder:

```bash
ruby -run -e httpd . -p 8000
```

```bash
python3 -m http.server 8000
```

```bash
npx serve -l 8000
```

Then open **http://localhost:8000**.

In the **Claude desktop app**, the server is already configured in `.claude/launch.json` (named `map`), so the preview pane can start it for you.

## Debug

Open the browser developer tools (**Cmd+Option+I** on macOS, **F12** on Windows/Linux).

**Useful console checks.** Top-level variables are global, so you can inspect them in the console:

```js
mode                                  // 'learn' or 'test'
countries.length                      // number of country shapes (240)
COUNTRY_INFO['356']                   // data for India (ISO numeric code)
INDIA_STATES['Kerala']                // a state's capital and type
drilled                               // current drill-down, or null
quiz                                  // current quiz state, or null
buildPool('world', 'find').length     // how many questions a quiz can draw from
speechSynthesis.getVoices().map(v => v.name)  // voices this device has
```

**Saved settings** are in **Application → Local Storage → http://localhost:8000**:

| Key | What it holds |
| --- | --- |
| `worldmap.seen` | Countries and states you've clicked |
| `worldmap.voice` | Voice, pitch, speed, read-aloud and say-capital settings |

To reset everything, run `localStorage.clear()` in the console and reload.

**Common problems**

| Symptom | Likely cause / fix |
| --- | --- |
| Blank page, `d3 is not defined` | No internet connection, or the CDN is blocked. D3 and TopoJSON load from cdn.jsdelivr.net. |
| `WORLD_TOPO is not defined` | The page was opened as `file://`, or the `data/` folder is missing. Serve it over http (see **Run**). |
| Changes don't show up | Hard-reload with **Cmd+Shift+R** (**Ctrl+Shift+R** on Windows/Linux) to skip the browser cache. |
| No voice | The browser or OS has no speech voices, or the tab is muted. Check `speechSynthesis.getVoices()`. On macOS, add voices in **System Settings → Accessibility → Spoken Content → System Voice → Manage Voices**. |
| Port 8000 already in use | Use another port, e.g. `-p 8080`, and open that port instead. |

**Debugging tips**

- To see what's being spoken, run this in the console and the text is printed instead of spoken: `speechSynthesis.speak = u => console.log('say:', u.text)`
- Set breakpoints in **Sources → app.js / quiz.js**. Good places are `selectCountry`, `selectRegion`, `quizClick` and `nextQuestion`.
- Use the device toolbar (**Cmd+Shift+M**) to check phone layouts. Below 640px wide, the voice options panel is hidden.

## Data sources

- Country shapes: [world-atlas](https://github.com/topojson/world-atlas) 2.0.2 (Natural Earth, 1:50m)
- Country names and capitals: [mledoze/countries](https://github.com/mledoze/countries)
- India state shapes: [udit-001/india-maps-data](https://github.com/udit-001/india-maps-data)
- India state capitals: written by hand in `data/india-states.js`

India's state borders follow India's official map, so in Kashmir and Aksai Chin they overlap the world map's neighbouring countries.
