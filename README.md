# Vivi Apartment — Quest 3 WebXR (complete game)

One coherent build:

- First-person apartment simulation (cook, shop, decor, photos, dialogue)
- Vivi VRM + bone zone interactions (layer / consent / cooldown)
- WebXR client adapter for Meta Quest 3 (KB-aligned: simulation ≠ raw XR)
- Desktop + touch fallback

## Run

```bash
npm install
npm run dev          # local (WebXR needs HTTPS on device)
npm run xr:smoke     # adapter boundary check
npm run typecheck
npm run build
```

## Structure

- `src/game/` — simulation engine
- `src/clients/webxr/` — only place that talks to WebXR session/controllers
- `src/xr/` — XR helpers used by the client (not by gameplay imports)
- `src/data/` — zones, dialogues, interactables, items
- `public/vrm/vivi.vrm` — companion avatar
- `QUEST-READY.md` — deploy / controls / KB mapping

Quest Browser: host the production build over **HTTPS**, open URL, **Enter VR**.


## Adult simulation tone

Content is written for **consenting adults**. Intimacy is gated by:

1. **Level / layer** (affection progression)
2. **Explicit consent** (dialogue + toggle)
3. **Energy** (no spam grinding)

No bypass of consent gates. Stop / slow choices stay available in intimate branches.


## LLM dialogue layer

Extra layer: `src/llm/` — REST chat completions + memory + persona/gate context.

```bash
cp .env.example .env
# set VITE_LLM_API_URL + VITE_LLM_API_KEY + VITE_LLM_MODEL
npm run dev
```

- **Live talk (LLM)** in the HUD opens the panel.
- Gated intimacy can open the LLM with zone/gate context.
- Without API keys the same panel **falls back** to scripted nodes.
- TTS: Web Speech by default; optional `VITE_TTS_API_URL` for REST audio.

Context packed every call: situation, persona disposition, intimacy agreement, player stats, rolling dialogue memory.
