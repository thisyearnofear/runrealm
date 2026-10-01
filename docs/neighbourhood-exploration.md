# Exploring RunRealm before your first outing

RunRealm opens on the neighbourhood map after its loading sequence. You can look around and try the preview tools before starting a real run. Preview activity and sample animations never change your atlas.

## Preview a neighbourhood

- **Show my streets** asks the browser for a lower-accuracy location and draws a 19-cell preview around it.
- **Pick a spot** lets you click the map instead. Press Escape to cancel.
- The map starts at its saved camera position, or a built-in sample-city position if there is no saved position or known location. The panel labels this as a sample city until you choose a preview.
- You can inspect preview cells. Their detail says **Preview — not collected**.
- The preview centre is remembered in this browser. It does not set the atlas anchor. The first qualifying real outing still establishes the neighbourhood.

## Watch a sample outing

Choose **Watch a sample outing** to see a route trace through the preview area, with a moving marker and cells lighting up as it passes. The sample takes about 22 seconds. It is labelled **Sample — not your atlas** and is not saved as a run. Use **Skip sample** or **Replay sample** as needed. Reduced-motion settings show the completed sample without the animation.

## Sketch a route

Choose **Sketch a route**, then click the map to place route points. The readout estimates distance, how much remains to reach 500 m, and how many H3 cells fall inside or outside the current neighbourhood. These are planning estimates, not a guarantee that a real outing will qualify; qualification also depends on GPS quality and a completed run.

For keyboard route placement, pan the map to the desired point and choose **Add map centre**. **Undo point**, **Clear plan**, and **Sketch route** (which exits drawing mode) are available in the panel. The sketch is saved in this browser.

## Continue on a phone

On desktop, open **Continue on your phone** to show a QR code, copy a link, or use the browser's share action. The link can contain the exact drawn route and a preview centre rounded to three decimal places. Sharing the link therefore shares the route and an approximate location. It carries the plan, not atlas progress; RunRealm does not sync the local atlas between devices.

## Take the optional tour

Choose **New here? Take the tour** or open **How it works** and choose **Take the tour**. The eight-step tour is optional, can be skipped, and closes with Escape. It demonstrates the preview and sample, explains the goals and the optional Realm, and points to the phone handoff. It never starts a real run. The tour choice is remembered in this browser; you can reopen the tour from **How it works**.

## What changes your atlas

A preview, route sketch, or sample does not count as an outing or register NFT ownership. Start run requests your location; complete at least 500 m with enough GPS fixes accurate within 50 m to credit blocks in your neighbourhood. A weak signal, short outing, or route outside the ring can leave a run saved without credited blocks. The finish receipt explains what counted and whether the atlas was saved on this device. Your first qualifying run anchors the local atlas. Registered territories use a separate eligible-run and wallet flow; neighbourhood outings do not mint blocks. A passkey or wallet does not sync or restore this atlas on another device.

The Realm tab also links to a free wallet- and GPS-free storyboard at [`/orbis-live`](https://runrealm-psi.vercel.app/orbis-live/). Live Realm generation is optional and uses Reactor credits.
