# interior-design-web

2D and 3D interior design website for customising your room and seeing how it will look. The first tool is a bedroom planner. Static site (Vite + Three.js), no backend, no login.

Live site: https://4vsj.github.io/interior-design-web/ (rebuilt automatically on every push to main).

## Run

Needs Node.js 20.19+ or 22.12+ (check with `node -v`). Run the commands in the repository root, the folder with `package.json`.

```
npm install
npm run dev      # local dev server
npm run build    # static site in dist/, deployable to any static host
```

## What it does

- Rectangular room with width, length and ceiling height in metres or feet.
- Doors and windows snap to walls, drag along or between walls, and can't overlap each other or run past a wall's end. Doors have four swing options and show the swing arc.
- Beds in single, double, queen and king with real mattress sizes for Australia, the UK and the US. Four frames built from primitives: platform, panel headboard, four-poster, storage drawers. Changing size or frame keeps the headboard where it was.
- 2D plan for editing and a 3D orbit view for previewing, with bed dragging in both. Walls between the camera and the room are cut down so the inside stays visible.
- Beds snap flush to walls and to a 10 cm grid, and rotate in 90° steps.
- Errors for beds that hit a wall, another bed or an inward door swing. 60 cm walkway overlays at both sides and the foot, flagged where they're blocked.
- Desk setups: desk (straight or L-shaped, size, finish), office or gaming chair, 24/27/32/34-inch ultrawide monitors (single or dual), full/TKL/60% keyboard with optional RGB, and a PC on the desk or floor. Drag any piece to move the group; click a piece to edit it. 75 cm of chair space is checked behind each desk.
- PC parts are visual only: mid tower, small form factor or showcase case, entry/mid/high GPU (length and fan count), air or AIO cooler, shared RGB colour.
- Lighting: day/night, flush or pendant ceiling lights (cord length, colour temperature, brightness), LED strips on a desk underside, monitor back, bed frame or ceiling edge (on/off, colour, static or slow cycle). Only ceiling lights cast shadows, and shadows are recomputed only when the scene changes.
- Closets: hinged doors, sliding doors or an open rail with shelves, with width, depth, height and finish. They sit against a wall like beds, and the space in front is checked (60 cm, or a door's width for hinged doors).
- Ensuite bathroom: a walled-off room (dragged anywhere in the 2D plan; flush against walls it snaps into a corner) with partition walls and a door that swings into the bathroom, swings into the bedroom or slides. Pick a shower, a bath or neither, plus a toilet and a vanity; fixtures are laid out along the outer walls. Furniture inside it, a door that hits it, or fixtures that don't fit are flagged. In 3D its walls are cut to 1 m when you look from outside the room.
- Walk-in closet and changing room: a walled-off room with its own door, a hanging rail, optional shelves and drawers, a full-length mirror and a bench. A tip shows when there's less than 80 cm of floor to stand in.
- Desk setups can leave out the PC, or the whole computer, so a desk can stand on its own.
- View only mode (V): hides the panel and editing buttons, and nothing can be selected, dragged or changed while you move the camera.
- Undo, redo, delete, duplicate. Autosaves to localStorage; export and import as JSON.

## Shortcuts

Ctrl/Cmd+Z undo, Ctrl/Cmd+Shift+Z or Ctrl+Y redo, Delete removes the selection, Ctrl/Cmd+D duplicates, R rotates the selected bed, desk setup or closet, arrow keys nudge by 10 cm, Esc deselects, V switches between Edit and View only. In 3D: W A S D move, Q and E go down and up, Shift moves faster; drag to look around, right-drag to pan, scroll to zoom. Overview and Eye level buttons reset the camera.

## Code map

- `src/state.js` design model, validation, undo history, persistence, actions
- `src/geometry.js` wall maths, opening fitting, door swings, snapping, collision and walkway checks
- `src/beds.js` mattress sizes and frame dimensions
- `src/desks.js` desk setup catalogue and piece layout
- `src/closets.js` closet styles, sizes and the clear zone in front
- `src/ensuite.js` walled-off corners (ensuite and walk-in closet): partition walls, door and fixture layout
- `src/models3d.js` 3D bed, desk, chair, PC, closet and bathroom fixture builders (loaded with the 3D view)
- `src/textures.js` procedural floor, wall and tile textures
- `src/lighting.js` light colours and LED strip paths
- `src/view2d.js` canvas plan editor
- `src/view3d.js` Three.js scene, camera, bloom and floor dragging (lazy-loaded on first switch to 3D)
- `src/panel.js` side panel
